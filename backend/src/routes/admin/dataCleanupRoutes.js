/**
 * Admin Routes - Data Cleanup Module
 * Handles: Fake deposits, balance clearing, referral cleanup
 */
import { express, dbQuery, authMiddleware, secureLog } from './shared.js';

const router = express.Router();

// ==================== Data Cleanup ====================

router.get('/data-cleanup/fake-deposits', authMiddleware, async (req, res) => {
  try {
    // 查找余额与充值严重不符的账户
    const fakeAccounts = await dbQuery(`
      SELECT 
        b.wallet_address,
        b.usdt_balance,
        b.wld_balance,
        b.total_deposit,
        b.total_profit,
        b.manual_added_balance,
        COALESCE(d.actual_deposit, 0) as actual_deposit,
        (b.usdt_balance - COALESCE(d.actual_deposit, 0)) as fake_amount
      FROM user_balances b
      LEFT JOIN (
        SELECT wallet_address, SUM(amount) as actual_deposit
        FROM deposit_records 
        WHERE status = 'completed'
        GROUP BY wallet_address
      ) d ON b.wallet_address = d.wallet_address
      WHERE b.usdt_balance > 100 
        AND (b.usdt_balance - COALESCE(d.actual_deposit, 0)) > 1000
      ORDER BY (b.usdt_balance - COALESCE(d.actual_deposit, 0)) DESC
    `);
    
    // 查找可疑的充值记录（交易哈希格式异常）
    const suspiciousDeposits = await dbQuery(`
      SELECT 
        id, wallet_address, amount, tx_hash, status, created_at,
        LENGTH(tx_hash) as hash_length,
        CASE 
          WHEN LENGTH(tx_hash) = 66 AND tx_hash LIKE '0x%' THEN 'valid'
          WHEN tx_hash LIKE '%INCOMPLETE%' THEN 'incomplete'
          ELSE 'suspicious'
        END as validity
      FROM deposit_records
      WHERE LENGTH(tx_hash) != 66 OR tx_hash LIKE '%INCOMPLETE%'
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      data: {
        fakeAccounts,
        suspiciousDeposits,
        summary: {
          fakeAccountCount: fakeAccounts.length,
          suspiciousDepositCount: suspiciousDeposits.length,
          totalFakeAmount: fakeAccounts.reduce((sum, a) => sum + parseFloat(a.fake_amount || 0), 0)
        }
      }
    });
    
  } catch (error) {
    console.error('检测虚假充值失败:', error.message);
    res.status(500).json({ success: false, message: '检测失败' });
  }
});

/**
 * 清理虚假账户余额
 * POST /api/admin/data-cleanup/clear-fake-balance
 */
router.post('/data-cleanup/clear-fake-balance', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, keep_real_deposit } = req.body;
    
    if (!wallet_address) {
      return res.status(400).json({ success: false, message: '缺少钱包地址' });
    }
    
    const normalizedAddress = wallet_address.toLowerCase();
    
    // 获取当前余额用于记录
    const currentBalance = await dbQuery(
      'SELECT usdt_balance, wld_balance, total_deposit FROM user_balances WHERE wallet_address = ?',
      [normalizedAddress]
    );
    
    if (!currentBalance || currentBalance.length === 0) {
      return res.status(404).json({ success: false, message: '账户不存在' });
    }
    
    const oldBalance = parseFloat(currentBalance[0].usdt_balance || 0);
    
    // 备份数据 (使用正确的表结构)
    await dbQuery(`
      INSERT INTO user_balances_cleanup_log 
      (wallet_address, cleanup_type, old_balance, new_balance, reason, operator, created_at)
      VALUES (?, 'clear_fake_balance', ?, 0, ?, ?, NOW())
    `, [
      normalizedAddress, 
      oldBalance,
      `USDT: ${currentBalance[0].usdt_balance}, WLD: ${currentBalance[0].wld_balance}, Deposit: ${currentBalance[0].total_deposit}`,
      req.admin?.username || 'admin'
    ]);
    
    // 获取真实充值金额
    const realDepositResult = await dbQuery(`
      SELECT COALESCE(SUM(amount), 0) as real_amount
      FROM deposit_records 
      WHERE wallet_address = ? AND status = 'completed'
    `, [normalizedAddress]);
    
    const realAmount = parseFloat(realDepositResult[0]?.real_amount || 0);
    
    // 清理余额
    if (keep_real_deposit && realAmount > 0) {
      // 保留真实充值记录，余额清零
      await dbQuery(`
        UPDATE user_balances 
        SET usdt_balance = 0, 
            wld_balance = 0, 
            total_deposit = ?,
            total_profit = 0,
            total_referral_reward = 0,
            updated_at = NOW()
        WHERE wallet_address = ?
      `, [realAmount, normalizedAddress]);
    } else {
      // 完全清零
      await dbQuery(`
        UPDATE user_balances 
        SET usdt_balance = 0, 
            wld_balance = 0, 
            total_deposit = 0, 
            total_withdraw = 0,
            total_profit = 0,
            total_referral_reward = 0,
            updated_at = NOW()
        WHERE wallet_address = ?
      `, [normalizedAddress]);
    }
    
    secureLog('清理虚假余额', { 
      admin: req.admin?.username, 
      wallet: normalizedAddress.slice(0, 10),
      realDeposit: realAmount
    });
    
    res.json({ 
      success: true, 
      message: `已清理 ${normalizedAddress.slice(0, 10)}... 的虚假余额` 
    });
    
  } catch (error) {
    console.error('清理虚假余额失败:', error.message);
    res.status(500).json({ success: false, message: '清理失败' });
  }
});

/**
 * 批量清理虚假账户
 * POST /api/admin/data-cleanup/batch-clear
 */
router.post('/data-cleanup/batch-clear', authMiddleware, async (req, res) => {
  try {
    const { wallet_addresses } = req.body;
    
    if (!wallet_addresses || !Array.isArray(wallet_addresses) || wallet_addresses.length === 0) {
      return res.status(400).json({ success: false, message: '缺少钱包地址列表' });
    }
    
    let cleared = 0;
    
    for (const address of wallet_addresses) {
      const normalizedAddress = address.toLowerCase();
      
      // 获取当前余额
      const currentBalance = await dbQuery(
        'SELECT usdt_balance, wld_balance, total_deposit FROM user_balances WHERE wallet_address = ?',
        [normalizedAddress]
      );
      
      if (!currentBalance || currentBalance.length === 0) {
        continue;
      }
      
      const oldBalance = parseFloat(currentBalance[0].usdt_balance || 0);
      
      // 备份 (使用正确的表结构)
      await dbQuery(`
        INSERT INTO user_balances_cleanup_log 
        (wallet_address, cleanup_type, old_balance, new_balance, reason, operator, created_at)
        VALUES (?, 'batch_clear', ?, 0, ?, ?, NOW())
      `, [
        normalizedAddress, 
        oldBalance,
        `USDT: ${currentBalance[0].usdt_balance}, WLD: ${currentBalance[0].wld_balance}`,
        req.admin?.username || 'admin'
      ]);
      
      // 获取真实充值
      const realDepositResult = await dbQuery(`
        SELECT COALESCE(SUM(amount), 0) as real_amount
        FROM deposit_records 
        WHERE wallet_address = ? AND status = 'completed'
      `, [normalizedAddress]);
      
      const realAmount = parseFloat(realDepositResult[0]?.real_amount || 0);
      
      // 清理
      await dbQuery(`
        UPDATE user_balances 
        SET usdt_balance = 0, 
            wld_balance = 0, 
            total_deposit = ?,
            total_profit = 0,
            total_referral_reward = 0,
            updated_at = NOW()
        WHERE wallet_address = ?
      `, [realAmount, normalizedAddress]);
      
      cleared++;
    }
    
    secureLog('批量清理虚假余额', { 
      admin: req.admin?.username, 
      count: cleared 
    });
    
    res.json({ 
      success: true, 
      message: `已清理 ${cleared} 个账户` 
    });
    
  } catch (error) {
    console.error('批量清理失败:', error.message);
    res.status(500).json({ success: false, message: '批量清理失败' });
  }
});

/**
 * 删除可疑充值记录
 * DELETE /api/admin/data-cleanup/suspicious-deposit/:id
 */
router.delete('/data-cleanup/suspicious-deposit/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 备份记录
    await dbQuery(`
      INSERT INTO deposit_records_cleanup_log 
      (original_id, wallet_address, amount, tx_hash, status, admin_user, created_at)
      SELECT id, wallet_address, amount, tx_hash, status, ?, NOW()
      FROM deposit_records WHERE id = ?
    `, [req.admin?.username || 'admin', id]);
    
    // 删除记录
    const result = await dbQuery('DELETE FROM deposit_records WHERE id = ?', [id]);
    
    if (result.affectedRows > 0) {
      secureLog('删除可疑充值记录', { admin: req.admin?.username, id });
      res.json({ success: true, message: '删除成功' });
    } else {
      res.status(404).json({ success: false, message: '记录不存在' });
    }
    
  } catch (error) {
    console.error('删除可疑充值记录失败:', error.message);
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

/**
 * 获取推荐关系列表
 * GET /api/admin/data-cleanup/referrals
 */
router.get('/data-cleanup/referrals', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.query;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    
    let whereClause = '1=1';
    const params = [];
    
    if (wallet_address) {
      whereClause += ' AND (r.wallet_address LIKE ? OR r.referrer_address LIKE ?)';
      params.push(`%${wallet_address}%`, `%${wallet_address}%`);
    }
    
    const [countResult] = await dbQuery(
      `SELECT COUNT(*) as total FROM user_referrals r WHERE ${whereClause}`,
      params
    );
    
    const referrals = await dbQuery(`
      SELECT 
        r.id,
        r.wallet_address as user_address,
        r.referrer_address,
        r.created_at,
        COALESCE(ub.usdt_balance, 0) as user_balance,
        COALESCE(ub.total_deposit, 0) as user_deposit
      FROM user_referrals r
      LEFT JOIN user_balances ub ON r.wallet_address = ub.wallet_address
      WHERE ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);
    
    res.json({
      success: true,
      data: {
        referrals,
        total: countResult?.total || 0,
        page,
        pageSize
      }
    });
    
  } catch (error) {
    console.error('获取推荐关系失败:', error.message);
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

/**
 * 移除推荐关系
 * DELETE /api/admin/data-cleanup/referral/:id
 */
router.delete('/data-cleanup/referral/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 获取要删除的记录
    const [record] = await dbQuery('SELECT * FROM user_referrals WHERE id = ?', [id]);
    
    if (!record) {
      return res.status(404).json({ success: false, message: '记录不存在' });
    }
    
    // 备份记录到清理日志 (字段: referral_id, wallet_address, referrer_address, operator)
    await dbQuery(`
      INSERT INTO referrals_cleanup_log 
      (referral_id, wallet_address, referrer_address, cleanup_reason, operator, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `, [id, record.wallet_address, record.referrer_address, '管理员手动移除', req.admin?.username || 'admin']);
    
    // 删除记录
    await dbQuery('DELETE FROM user_referrals WHERE id = ?', [id]);
    
    secureLog('移除推荐关系', { 
      admin: req.admin?.username,
      user: record.wallet_address?.slice(0, 10),
      referrer: record.referrer_address?.slice(0, 10)
    });
    
    res.json({ success: true, message: '移除成功' });
    
  } catch (error) {
    console.error('移除推荐关系失败:', error.message);
    res.status(500).json({ success: false, message: '移除失败' });
  }
});

/**
 * 批量移除推荐关系
 * POST /api/admin/data-cleanup/batch-remove-referrals
 */
router.post('/data-cleanup/batch-remove-referrals', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: '缺少ID列表' });
    }
    
    let removed = 0;
    
    for (const id of ids) {
      const [record] = await dbQuery('SELECT * FROM user_referrals WHERE id = ?', [id]);
      
      if (record) {
        // 备份 (user_referrals 表的字段是 wallet_address)
        await dbQuery(`
          INSERT INTO referrals_cleanup_log 
          (original_id, user_address, referrer_address, admin_user, created_at)
          VALUES (?, ?, ?, ?, NOW())
        `, [id, record.wallet_address, record.referrer_address, req.admin?.username || 'admin']);
        
        // 删除
        await dbQuery('DELETE FROM user_referrals WHERE id = ?', [id]);
        removed++;
      }
    }
    
    secureLog('批量移除推荐关系', { admin: req.admin?.username, count: removed });
    
    res.json({ success: true, message: `已移除 ${removed} 条推荐关系` });
    
  } catch (error) {
    console.error('批量移除推荐关系失败:', error.message);
    res.status(500).json({ success: false, message: '批量移除失败' });
  }
});

/**
 * 获取清理日志
 * GET /api/admin/data-cleanup/logs
 */
router.get('/data-cleanup/logs', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const offset = (page - 1) * pageSize;
    
    // 获取余额清理日志
    const balanceLogs = await dbQuery(`
      SELECT * FROM user_balances_cleanup_log
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [pageSize, offset]);
    
    // 获取推荐关系清理日志
    const referralLogs = await dbQuery(`
      SELECT * FROM referrals_cleanup_log
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [pageSize, offset]);
    
    res.json({
      success: true,
      data: {
        balanceLogs,
        referralLogs
      }
    });
    
  } catch (error) {
    console.error('获取清理日志失败:', error.message);
    res.status(500).json({ success: false, message: '获取日志失败' });
  }
});



export default router;
