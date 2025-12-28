/**
 * Admin Routes - Lucky Wheel Management Module
 * Handles: Stats, records, points, announcements, rigged prizes
 */
import { express, dbQuery, authMiddleware, secureLog } from './shared.js';

const router = express.Router();

// ==================== Lucky Wheel Management ====================

router.get('/lucky-wheel/stats', authMiddleware, async (req, res) => {
  try {
    // 总抽奖次数
    const [totalSpins] = await dbQuery('SELECT COUNT(*) as count FROM lucky_wheel_records');
    
    // 今日抽奖次数
    const [todaySpins] = await dbQuery(
      `SELECT COUNT(*) as count FROM lucky_wheel_records 
       WHERE DATE(created_at) = CURDATE()`
    );
    
    // 总发放奖励
    const [totalRewards] = await dbQuery(
      `SELECT 
         SUM(CASE WHEN reward_type = 'WLD' THEN reward_amount ELSE 0 END) as total_wld,
         SUM(CASE WHEN reward_type = 'USDT' THEN reward_amount ELSE 0 END) as total_usdt,
         SUM(CASE WHEN reward_type = 'BTC' THEN reward_amount ELSE 0 END) as total_btc
       FROM lucky_wheel_records`
    );
    
    // 总幸运值发放
    const [totalPoints] = await dbQuery(
      'SELECT COALESCE(SUM(total_earned), 0) as total FROM user_lucky_points'
    );
    
    // 总幸运值消耗
    const [totalSpent] = await dbQuery(
      'SELECT COALESCE(SUM(total_spent), 0) as total FROM user_lucky_points'
    );
    
    // 参与用户数
    const [uniqueUsers] = await dbQuery(
      'SELECT COUNT(DISTINCT wallet_address) as count FROM lucky_wheel_records'
    );
    
    // 各奖项中奖统计
    const prizeStats = await dbQuery(
      `SELECT prize_name, COUNT(*) as count, SUM(reward_amount) as total_amount, reward_type
       FROM lucky_wheel_records 
       GROUP BY prize_name, reward_type
       ORDER BY count DESC`
    );
    
    res.json({
      success: true,
      data: {
        totalSpins: totalSpins?.count || 0,
        todaySpins: todaySpins?.count || 0,
        totalWLD: parseFloat(totalRewards?.total_wld) || 0,
        totalUSDT: parseFloat(totalRewards?.total_usdt) || 0,
        totalBTC: parseFloat(totalRewards?.total_btc) || 0,
        totalPointsEarned: parseFloat(totalPoints?.total) || 0,
        totalPointsSpent: parseFloat(totalSpent?.total) || 0,
        uniqueUsers: uniqueUsers?.count || 0,
        prizeStats
      }
    });
    
  } catch (error) {
    console.error('获取抽奖统计失败:', error.message);
    res.status(500).json({ success: false, message: '获取统计失败' });
  }
});

/**
 * 获取抽奖记录列表
 * GET /api/admin/lucky-wheel/records
 */
router.get('/lucky-wheel/records', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const { wallet_address, wheel_type, prize_name, start_date, end_date } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (wallet_address) {
      whereClause += ' AND wallet_address LIKE ?';
      params.push(`%${wallet_address}%`);
    }
    if (wheel_type) {
      whereClause += ' AND wheel_type = ?';
      params.push(wheel_type);
    }
    if (prize_name) {
      whereClause += ' AND prize_name = ?';
      params.push(prize_name);
    }
    if (start_date) {
      whereClause += ' AND DATE(created_at) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      whereClause += ' AND DATE(created_at) <= ?';
      params.push(end_date);
    }
    
    // 总数
    const [countResult] = await dbQuery(
      `SELECT COUNT(*) as total FROM lucky_wheel_records WHERE ${whereClause}`,
      params
    );
    
    // 分页数据
    const records = await dbQuery(
      `SELECT id, wallet_address, wheel_type, prize_name, reward_type, reward_amount, points_spent, created_at
       FROM lucky_wheel_records 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    
    res.json({
      success: true,
      data: {
        records,
        total: countResult?.total || 0,
        page,
        pageSize
      }
    });
    
  } catch (error) {
    console.error('获取抽奖记录失败:', error.message);
    res.status(500).json({ success: false, message: '获取记录失败' });
  }
});

/**
 * 获取用户幸运值列表
 * GET /api/admin/lucky-wheel/points
 */
router.get('/lucky-wheel/points', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const { wallet_address, min_points } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (wallet_address) {
      whereClause += ' AND wallet_address LIKE ?';
      params.push(`%${wallet_address}%`);
    }
    if (min_points) {
      whereClause += ' AND lucky_points >= ?';
      params.push(parseFloat(min_points));
    }
    
    // 总数
    const [countResult] = await dbQuery(
      `SELECT COUNT(*) as total FROM user_lucky_points WHERE ${whereClause}`,
      params
    );
    
    // 分页数据
    const users = await dbQuery(
      `SELECT id, wallet_address, lucky_points, total_earned, total_spent, created_at, updated_at
       FROM user_lucky_points 
       WHERE ${whereClause}
       ORDER BY lucky_points DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    
    res.json({
      success: true,
      data: {
        users,
        total: countResult?.total || 0,
        page,
        pageSize
      }
    });
    
  } catch (error) {
    console.error('获取幸运值列表失败:', error.message);
    res.status(500).json({ success: false, message: '获取列表失败' });
  }
});

/**
 * 手动调整用户幸运值
 * POST /api/admin/lucky-wheel/adjust-points
 */
router.post('/lucky-wheel/adjust-points', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, amount, reason } = req.body;
    
    if (!wallet_address || amount === undefined) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    const normalizedAddress = wallet_address.toLowerCase();
    const adjustAmount = parseFloat(amount);
    
    // 检查用户是否存在
    const [existing] = await dbQuery(
      'SELECT id, lucky_points FROM user_lucky_points WHERE wallet_address = ?',
      [normalizedAddress]
    );
    
    if (existing) {
      // 更新
      const newPoints = Math.max(0, parseFloat(existing.lucky_points) + adjustAmount);
      await dbQuery(
        `UPDATE user_lucky_points 
         SET lucky_points = ?, 
             total_earned = total_earned + ?
         WHERE wallet_address = ?`,
        [newPoints, adjustAmount > 0 ? adjustAmount : 0, normalizedAddress]
      );
    } else {
      // 创建
      if (adjustAmount <= 0) {
        return res.status(400).json({ success: false, message: '用户不存在，无法扣除幸运值' });
      }
      await dbQuery(
        `INSERT INTO user_lucky_points (wallet_address, lucky_points, total_earned) VALUES (?, ?, ?)`,
        [normalizedAddress, adjustAmount, adjustAmount]
      );
    }
    
    secureLog('调整用户幸运值', {
      admin: req.admin?.username,
      wallet_address: normalizedAddress,
      amount: adjustAmount,
      reason: reason || '管理员调整'
    });
    
    res.json({
      success: true,
      message: adjustAmount > 0 ? `已增加 ${adjustAmount} 幸运值` : `已扣除 ${Math.abs(adjustAmount)} 幸运值`
    });
    
  } catch (error) {
    console.error('调整幸运值失败:', error.message);
    res.status(500).json({ success: false, message: '调整失败' });
  }
});

/**
 * 批量发放幸运值
 * POST /api/admin/lucky-wheel/batch-points
 */
router.post('/lucky-wheel/batch-points', authMiddleware, async (req, res) => {
  try {
    const { wallet_addresses, amount, reason } = req.body;
    
    if (!wallet_addresses || !Array.isArray(wallet_addresses) || wallet_addresses.length === 0) {
      return res.status(400).json({ success: false, message: '请提供钱包地址列表' });
    }
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: '发放数量必须大于0' });
    }
    
    let successCount = 0;
    let failedCount = 0;
    
    for (const addr of wallet_addresses) {
      try {
        const normalizedAddress = addr.toLowerCase();
        
        const [existing] = await dbQuery(
          'SELECT id FROM user_lucky_points WHERE wallet_address = ?',
          [normalizedAddress]
        );
        
        if (existing) {
          await dbQuery(
            `UPDATE user_lucky_points 
             SET lucky_points = lucky_points + ?, total_earned = total_earned + ?
             WHERE wallet_address = ?`,
            [amount, amount, normalizedAddress]
          );
        } else {
          await dbQuery(
            `INSERT INTO user_lucky_points (wallet_address, lucky_points, total_earned) VALUES (?, ?, ?)`,
            [normalizedAddress, amount, amount]
          );
        }
        successCount++;
      } catch (e) {
        failedCount++;
      }
    }
    
    secureLog('批量发放幸运值', {
      admin: req.admin?.username,
      count: wallet_addresses.length,
      amount,
      success: successCount,
      failed: failedCount,
      reason
    });
    
    res.json({
      success: true,
      message: `批量发放完成：成功 ${successCount}, 失败 ${failedCount}`,
      data: { successCount, failedCount }
    });
    
  } catch (error) {
    console.error('批量发放幸运值失败:', error.message);
    res.status(500).json({ success: false, message: '批量发放失败' });
  }
});

/**
 * 获取获奖公告列表
 * GET /api/admin/lucky-wheel/announcements
 */
router.get('/lucky-wheel/announcements', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const offset = (page - 1) * pageSize;
    const { is_virtual } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (is_virtual !== undefined) {
      whereClause += ' AND is_virtual = ?';
      params.push(is_virtual === 'true' ? 1 : 0);
    }
    
    const [countResult] = await dbQuery(
      `SELECT COUNT(*) as total FROM lucky_wheel_announcements WHERE ${whereClause}`,
      params
    );
    
    const announcements = await dbQuery(
      `SELECT id, wallet_address, prize_name, reward_display, is_virtual, created_at
       FROM lucky_wheel_announcements 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    
    res.json({
      success: true,
      data: {
        announcements,
        total: countResult?.total || 0,
        page,
        pageSize
      }
    });
    
  } catch (error) {
    console.error('获取公告列表失败:', error.message);
    res.status(500).json({ success: false, message: '获取公告失败' });
  }
});

/**
 * 删除获奖公告
 * DELETE /api/admin/lucky-wheel/announcements/:id
 */
router.delete('/lucky-wheel/announcements/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    await dbQuery('DELETE FROM lucky_wheel_announcements WHERE id = ?', [id]);
    
    secureLog('删除获奖公告', { admin: req.admin?.username, id });
    
    res.json({ success: true, message: '删除成功' });
    
  } catch (error) {
    console.error('删除公告失败:', error.message);
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

/**
 * 添加虚拟获奖公告
 * POST /api/admin/lucky-wheel/announcements
 */
router.post('/lucky-wheel/announcements', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, prize_name, reward_display } = req.body;
    
    if (!wallet_address || !prize_name || !reward_display) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    await dbQuery(
      `INSERT INTO lucky_wheel_announcements (wallet_address, prize_name, reward_display, is_virtual)
       VALUES (?, ?, ?, 1)`,
      [wallet_address, prize_name, reward_display]
    );
    
    secureLog('添加虚拟公告', { admin: req.admin?.username, wallet_address, prize_name, reward_display });
    
    res.json({ success: true, message: '添加成功' });
    
  } catch (error) {
    console.error('添加公告失败:', error.message);
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

/**
 * 清空虚拟公告
 * DELETE /api/admin/lucky-wheel/announcements/virtual
 */
router.delete('/lucky-wheel/announcements/virtual', authMiddleware, async (req, res) => {
  try {
    const result = await dbQuery('DELETE FROM lucky_wheel_announcements WHERE is_virtual = 1');
    
    secureLog('清空虚拟公告', { admin: req.admin?.username, deleted: result.affectedRows });
    
    res.json({ success: true, message: `已删除 ${result.affectedRows || 0} 条虚拟公告` });
    
  } catch (error) {
    console.error('清空虚拟公告失败:', error.message);
    res.status(500).json({ success: false, message: '清空失败' });
  }
});

// ==================== 指定中奖管理 ====================

/**
 * 获取指定中奖列表
 * GET /api/admin/lucky-wheel/rigged
 */
router.get('/lucky-wheel/rigged', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const { used } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (used !== undefined) {
      whereClause += ' AND used = ?';
      params.push(used === 'true' ? 1 : 0);
    }
    
    const [countResult] = await dbQuery(
      `SELECT COUNT(*) as total FROM lucky_wheel_rigged WHERE ${whereClause}`,
      params
    );
    
    const rigged = await dbQuery(
      `SELECT id, wallet_address, prize_id, prize_name, created_by, used, created_at, used_at
       FROM lucky_wheel_rigged 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    
    res.json({
      success: true,
      data: {
        rigged,
        total: countResult?.total || 0,
        page,
        pageSize
      }
    });
    
  } catch (error) {
    console.error('获取指定中奖列表失败:', error.message);
    res.status(500).json({ success: false, message: '获取列表失败' });
  }
});

/**
 * 添加指定中奖
 * POST /api/admin/lucky-wheel/rigged
 */
router.post('/lucky-wheel/rigged', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, prize_id } = req.body;
    
    if (!wallet_address || !prize_id) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 奖品配置
    const PRIZES = {
      1: '特等奖',
      2: '一等奖',
      3: '二等奖',
      4: '三等奖',
      5: '四等奖',
      6: '五等奖'
    };
    
    const prizeName = PRIZES[prize_id];
    if (!prizeName) {
      return res.status(400).json({ success: false, message: '无效的奖品ID' });
    }
    
    const normalizedAddress = wallet_address.toLowerCase();
    
    // 检查是否已有未使用的指定中奖
    const [existing] = await dbQuery(
      'SELECT id FROM lucky_wheel_rigged WHERE wallet_address = ? AND used = 0',
      [normalizedAddress]
    );
    
    if (existing) {
      // 更新现有记录
      await dbQuery(
        `UPDATE lucky_wheel_rigged 
         SET prize_id = ?, prize_name = ?, created_by = ?, created_at = NOW()
         WHERE id = ?`,
        [prize_id, prizeName, req.admin?.username || 'admin', existing.id]
      );
    } else {
      // 插入新记录
      await dbQuery(
        `INSERT INTO lucky_wheel_rigged (wallet_address, prize_id, prize_name, created_by)
         VALUES (?, ?, ?, ?)`,
        [normalizedAddress, prize_id, prizeName, req.admin?.username || 'admin']
      );
    }
    
    secureLog('设置指定中奖', { 
      admin: req.admin?.username, 
      wallet: normalizedAddress.slice(0, 10),
      prize: prizeName 
    });
    
    res.json({ success: true, message: `已设置 ${normalizedAddress.slice(0, 10)}... 下次中奖为 ${prizeName}` });
    
  } catch (error) {
    console.error('设置指定中奖失败:', error.message);
    res.status(500).json({ success: false, message: '设置失败' });
  }
});

/**
 * 删除指定中奖
 * DELETE /api/admin/lucky-wheel/rigged/:id
 */
router.delete('/lucky-wheel/rigged/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await dbQuery('DELETE FROM lucky_wheel_rigged WHERE id = ?', [id]);
    
    if (result.affectedRows > 0) {
      res.json({ success: true, message: '删除成功' });
    } else {
      res.status(404).json({ success: false, message: '记录不存在' });
    }
    
  } catch (error) {
    console.error('删除指定中奖失败:', error.message);
    res.status(500).json({ success: false, message: '删除失败' });
  }
});



export default router;
