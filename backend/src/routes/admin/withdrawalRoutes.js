/**
 * Admin Routes - Withdrawal Records Module
 * Handles: Withdrawal list, processing, auto-transfer
 */
import { 
  express, 
  dbQuery, 
  authMiddleware,
  secureLog,
  transferUSDT,
  getAccountAddress,
  getAccountBalance
} from './shared.js';

const router = express.Router();

// ==================== Withdrawal Records ====================

router.get('/withdrawals/latest-id', authMiddleware, async (req, res) => {
  try {
    const result = await dbQuery('SELECT MAX(id) as lastId FROM withdraw_records');
    res.json({
      success: true,
      data: {
        lastId: result?.lastId || 0
      }
    });
  } catch (error) {
    console.error('获取最后提款ID失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取失败'
    });
  }
});

/**
 * 检查新提款（用于实时通知）
 * GET /api/admin/withdrawals/check-new?last_id=xxx
 */
router.get('/withdrawals/check-new', authMiddleware, async (req, res) => {
  try {
    const { last_id = 0 } = req.query;
    const lastId = parseInt(last_id);
    
    // 查询新提款数量和最新记录（只查询pending状态的）
    const newWithdrawals = await dbQuery(
      `SELECT * FROM withdraw_records WHERE id > ? AND status = 'pending' ORDER BY id DESC`,
      [lastId]
    );
    
    const newCount = newWithdrawals.length;
    const latestWithdraw = newCount > 0 ? newWithdrawals[0] : null;
    const maxId = newCount > 0 ? newWithdrawals[0].id : lastId;
    
    res.json({
      success: true,
      data: {
        newCount,
        lastId: maxId,
        latestWithdraw
      }
    });
  } catch (error) {
    console.error('检查新提款失败:', error.message);
    res.status(500).json({
      success: false,
      message: '检查失败'
    });
  }
});

/**
 * 获取提款记录列表
 * GET /api/admin/withdrawals
 */
router.get('/withdrawals', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, wallet_address, status, start_date, end_date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let whereConditions = [];
    const params = [];
    
    if (wallet_address) {
      whereConditions.push('wallet_address LIKE ?');
      params.push(`%${wallet_address}%`);
    }
    
    if (status) {
      whereConditions.push('status = ?');
      params.push(status);
    }
    
    if (start_date) {
      whereConditions.push('DATE(created_at) >= ?');
      params.push(start_date);
    }
    
    if (end_date) {
      whereConditions.push('DATE(created_at) <= ?');
      params.push(end_date);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // 获取总数
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM withdraw_records ${whereClause}`,
      params
    );
    
    // 获取列表
    const list = await dbQuery(
      `SELECT * FROM withdraw_records ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    
    res.json({
      success: true,
      data: {
        list,
        total: countResult?.[0]?.total || 0,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取提款记录失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取提款记录失败'
    });
  }
});

/**
 * 获取提款统计
 * GET /api/admin/withdrawals/stats
 */
router.get('/withdrawals/stats', authMiddleware, async (req, res) => {
  try {
    // 获取总体统计
    const totalStats = await dbQuery(`
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_amount,
        SUM(CASE WHEN status = 'pending' OR status = 'processing' THEN amount ELSE 0 END) as pending_amount,
        COUNT(DISTINCT wallet_address) as unique_users
      FROM withdraw_records
    `);
    
    // 今日统计
    const todayStats = await dbQuery(`
      SELECT 
        COUNT(*) as today_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as today_amount,
        SUM(CASE WHEN status = 'pending' OR status = 'processing' THEN 1 ELSE 0 END) as today_pending_count
      FROM withdraw_records
      WHERE DATE(created_at) = CURDATE()
    `);
    
    // 本月统计
    const monthStats = await dbQuery(`
      SELECT 
        COUNT(*) as month_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as month_amount
      FROM withdraw_records
      WHERE DATE(created_at) >= DATE_FORMAT(NOW(), '%Y-%m-01')
    `);
    
    res.json({
      success: true,
      data: {
        total: {
          count: parseInt(totalStats[0]?.total_count) || 0,
          completed: parseInt(totalStats[0]?.completed_count) || 0,
          pending: parseInt(totalStats[0]?.pending_count) || 0,
          processing: parseInt(totalStats[0]?.processing_count) || 0,
          rejected: parseInt(totalStats[0]?.rejected_count) || 0,
          amount: parseFloat(totalStats[0]?.total_amount) || 0,
          pendingAmount: parseFloat(totalStats[0]?.pending_amount) || 0,
          uniqueUsers: parseInt(totalStats[0]?.unique_users) || 0
        },
        today: {
          count: parseInt(todayStats[0]?.today_count) || 0,
          amount: parseFloat(todayStats[0]?.today_amount) || 0,
          pendingCount: parseInt(todayStats[0]?.today_pending_count) || 0
        },
        month: {
          count: parseInt(monthStats[0]?.month_count) || 0,
          amount: parseFloat(monthStats[0]?.month_amount) || 0
        }
      }
    });
  } catch (error) {
    console.error('获取提款统计失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取提款统计失败'
    });
  }
});

/**
 * 处理提款请求
 * PUT /api/admin/withdrawals/:id/process
 */
router.put('/withdrawals/:id/process', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, tx_hash, action } = req.body;

    if (!['pending', 'processing', 'completed', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: '无效的状态'
      });
    }

    // 获取原始提款记录
    const withdrawalResult = await dbQuery('SELECT * FROM withdraw_records WHERE id = ?', [id]);
    const withdrawal = withdrawalResult[0];

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: '提款记录不存在'
      });
    }

    // 如果是拒绝或失败，需要退回余额（只有从非失败状态变为失败时才退回）
    if ((status === 'failed' || action === 'reject') && withdrawal.status !== 'failed' && withdrawal.status !== 'completed') {
      await dbQuery(
        'UPDATE user_balances SET usdt_balance = usdt_balance + ?, total_withdraw = total_withdraw - ? WHERE wallet_address = ?',
        [withdrawal.amount, withdrawal.amount, withdrawal.wallet_address]
      );
      console.log(`[Withdraw] 退回余额: ${withdrawal.amount} USDT -> ${withdrawal.wallet_address}`);
    }

    // 如果从失败状态重新处理（改回pending），需要再次扣除余额
    if (status === 'pending' && withdrawal.status === 'failed') {
      // 检查余额是否足够
      const balanceResult = await dbQuery(
        'SELECT usdt_balance FROM user_balances WHERE wallet_address = ?',
        [withdrawal.wallet_address]
      );
      const balance = balanceResult[0];

      const userBalance = parseFloat(balance?.usdt_balance) || 0;
      if (userBalance < parseFloat(withdrawal.amount)) {
        return res.status(400).json({
          success: false,
          message: `用户余额不足，当前余额: ${userBalance.toFixed(4)} USDT`
        });
      }

      await dbQuery(
        'UPDATE user_balances SET usdt_balance = usdt_balance - ?, total_withdraw = total_withdraw + ? WHERE wallet_address = ?',
        [withdrawal.amount, withdrawal.amount, withdrawal.wallet_address]
      );
      console.log(`[Withdraw] 重新扣除余额: ${withdrawal.amount} USDT <- ${withdrawal.wallet_address}`);
    }

    // 更新提款状态
    const updateParams = [status];
    let updateSql = 'UPDATE withdraw_records SET status = ?';

    if (tx_hash) {
      updateSql += ', tx_hash = ?';
      updateParams.push(tx_hash);
    }

    if (status === 'completed') {
      updateSql += ', completed_at = NOW()';
    }

    updateSql += ' WHERE id = ?';
    updateParams.push(id);

    await dbQuery(updateSql, updateParams);

    res.json({
      success: true,
      message: '处理成功'
    });
  } catch (error) {
    console.error('处理提款失败:', error.message);
    res.status(500).json({
      success: false,
      message: '处理失败'
    });
  }
});

/**
 * 自动转账
 * POST /api/admin/withdrawals/:id/auto-transfer
 *
 * 请求体：
 * {
 *   "to_address": "0x..." // 接收地址（用户的钱包地址）
 * }
 *
 * 返回：
 * {
 *   "success": true/false,
 *   "message": "转账成功/失败原因",
 *   "data": {
 *     "tx_hash": "0x...",
 *     "block_number": 12345,
 *     "amount": 100.5
 *   }
 * }
 */
router.post('/withdrawals/:id/auto-transfer', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { to_address } = req.body;

    // 验证参数
    if (!to_address) {
      return res.status(400).json({
        success: false,
        message: '请提供接收地址'
      });
    }

    // 检查功能是否启用
    if (process.env.ENABLE_AUTO_TRANSFER !== 'true') {
      return res.status(403).json({
        success: false,
        message: '自动转账功能未启用'
      });
    }

    // 获取提款记录
    const withdrawal = await dbQuery('SELECT * FROM withdraw_records WHERE id = ?', [id]);

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: '提款记录不存在'
      });
    }

    // 检查提款状态
    if (withdrawal.status !== 'processing' && withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `提款状态为 "${withdrawal.status}"，无法进行自动转账`
      });
    }

    // 记录转账尝试
    console.log(`[Auto-Transfer] 开始处理提款 ID: ${id}`);
    console.log(`[Auto-Transfer] 金额: ${withdrawal.amount} ${withdrawal.token}`);
    console.log(`[Auto-Transfer] 接收地址: ${to_address}`);

    // 执行转账
    const transferResult = await transferUSDT(
      to_address,
      withdrawal.amount,
      id,
      withdrawal.wallet_address
    );

    if (!transferResult.success) {
      // 记录转账失败
      console.error(`[Auto-Transfer] ❌ 转账失败: ${transferResult.error}`);

      return res.status(400).json({
        success: false,
        message: `自动转账失败: ${transferResult.error}`,
        error_detail: transferResult.error
      });
    }

    // 更新提款记录状态为已完成
    await dbQuery(
      'UPDATE withdraw_records SET status = ?, tx_hash = ?, completed_at = NOW() WHERE id = ?',
      ['completed', transferResult.txHash, id]
    );

    console.log(`[Auto-Transfer] ✓ 提款 ${id} 已完成`);
    console.log(`[Auto-Transfer] 交易哈希: ${transferResult.txHash}`);
    console.log(`[Auto-Transfer] 区块号: ${transferResult.blockNumber}`);

    // 记录管理员操作日志
    secureLog('自动转账成功', {
      admin: req.admin.username,
      withdrawal_id: id,
      tx_hash: transferResult.txHash,
      amount: withdrawal.amount
    });

    res.json({
      success: true,
      message: '转账成功',
      data: {
        tx_hash: transferResult.txHash,
        block_number: transferResult.blockNumber,
        amount: transferResult.amount,
        gas_used: transferResult.gasUsed
      }
    });
  } catch (error) {
    console.error('自动转账失败:', error.message);

    res.status(500).json({
      success: false,
      message: '自动转账失败: ' + error.message
    });
  }
});

/**
 * 获取平台钱包信息
 * GET /api/admin/wallet-info
 *
 * 返回平台用于自动转账的钱包地址和余额
 */
router.get('/wallet-info', authMiddleware, async (req, res) => {
  try {
    const accountAddress = getAccountAddress();

    if (!accountAddress) {
      return res.status(400).json({
        success: false,
        message: '自动转账功能未启用或未配置'
      });
    }

    const balance = await getAccountBalance();

    res.json({
      success: true,
      data: {
        wallet_address: accountAddress,
        usdt_balance: balance,
        enable_auto_transfer: process.env.ENABLE_AUTO_TRANSFER === 'true'
      }
    });
  } catch (error) {
    console.error('获取钱包信息失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取钱包信息失败'
    });
  }
});

/**
 * 获取提款的转账记录
 * GET /api/admin/withdrawals/:id/transfer-record
 * 
 * 返回该提款ID对应的转账哈希记录
 */
router.get('/withdrawals/:id/transfer-record', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[API] 获取提款 ${id} 的转账记录`);

    // 先从 transfer_logs 表查询（自动转账记录）
    const transferLog = await dbQuery(
      'SELECT tx_hash, from_address, to_address, amount, block_number, gas_used, status, created_at FROM transfer_logs WHERE withdrawal_id = ? ORDER BY created_at DESC LIMIT 1',
      [id]
    );

    console.log(`[API] transfer_logs 查询结果:`, transferLog);

    if (transferLog && transferLog.tx_hash) {
      console.log(`[API] ✅ 从 transfer_logs 找到哈希: ${transferLog.tx_hash}`);
      return res.json({
        success: true,
        data: transferLog
      });
    }

    // 如果 transfer_logs 没有记录，从 withdraw_records 表查询（手动输入的哈希）
    const withdrawal = await dbQuery(
      'SELECT tx_hash, to_address, amount, created_at FROM withdraw_records WHERE id = ?',
      [id]
    );

    console.log(`[API] withdraw_records 查询结果:`, withdrawal);

    if (withdrawal && withdrawal.tx_hash) {
      console.log(`[API] ✅ 从 withdraw_records 找到哈希: ${withdrawal.tx_hash}`);
      return res.json({
        success: true,
        data: {
          tx_hash: withdrawal.tx_hash,
          to_address: withdrawal.to_address,
          amount: withdrawal.amount,
          created_at: withdrawal.created_at,
          status: 'completed'
        }
      });
    }

    // 都没有找到
    console.log(`[API] ❌ 未找到提款 ${id} 的转账记录`);
    return res.json({
      success: false,
      message: '未找到该提款的转账记录'
    });
  } catch (error) {
    console.error('获取转账记录失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取转账记录失败'
    });
  }
});



export default router;
