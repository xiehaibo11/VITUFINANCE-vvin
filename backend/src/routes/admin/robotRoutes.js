/**
 * Admin Routes - Robot Management
 * 
 * Features:
 * - Robot purchase records listing
 * - Robot statistics
 * - Robot details and user queries
 * - Robot cancellation and reactivation
 * - Earnings summary
 */
import express from 'express';
import { dbQuery, secureLog, authMiddleware } from './shared.js';

const router = express.Router();

/**
 * GET /robots
 * Get robot purchase records with pagination and filters
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      wallet_address, 
      robot_type, 
      status,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query conditions
    let conditions = [];
    let params = [];
    
    if (wallet_address) {
      conditions.push('wallet_address LIKE ?');
      params.push(`%${wallet_address.toLowerCase()}%`);
    }
    
    if (robot_type) {
      conditions.push('robot_type = ?');
      params.push(robot_type);
    }
    
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Validate sort fields
    const validSortFields = ['created_at', 'price', 'total_profit', 'end_time'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Get total count
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM robot_purchases ${whereClause}`,
      params
    );
    const total = countResult[0]?.total || 0;
    
    // Get records
    const records = await dbQuery(
      `SELECT * FROM robot_purchases ${whereClause} 
       ORDER BY ${sortField} ${sortOrder} 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    
    res.json({
      success: true,
      data: records,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Failed to get robot records:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get robot records' });
  }
});

/**
 * GET /robots/stats
 * Get robot statistics
 */
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    // Active robots count
    const activeResult = await dbQuery(
      `SELECT COUNT(*) as count, SUM(price) as total_investment 
       FROM robot_purchases 
       WHERE status = 'active' AND (end_time IS NULL OR end_time > NOW())`
    );
    
    // Expired robots count
    const expiredResult = await dbQuery(
      `SELECT COUNT(*) as count, SUM(price) as total_investment, SUM(total_profit) as total_profit
       FROM robot_purchases 
       WHERE status = 'expired' OR (status = 'active' AND end_time <= NOW())`
    );
    
    // By robot type
    const typeStats = await dbQuery(
      `SELECT 
        robot_type,
        COUNT(*) as count,
        SUM(price) as total_investment,
        SUM(total_profit) as total_profit,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count
       FROM robot_purchases
       GROUP BY robot_type`
    );
    
    // Today's purchases
    const todayResult = await dbQuery(
      `SELECT COUNT(*) as count, SUM(price) as amount
       FROM robot_purchases
       WHERE DATE(created_at) = CURDATE()`
    );
    
    res.json({
      success: true,
      data: {
        active: {
          count: parseInt(activeResult[0]?.count) || 0,
          total_investment: parseFloat(activeResult[0]?.total_investment) || 0
        },
        expired: {
          count: parseInt(expiredResult[0]?.count) || 0,
          total_investment: parseFloat(expiredResult[0]?.total_investment) || 0,
          total_profit: parseFloat(expiredResult[0]?.total_profit) || 0
        },
        today: {
          count: parseInt(todayResult[0]?.count) || 0,
          amount: parseFloat(todayResult[0]?.amount) || 0
        },
        by_type: typeStats.map(t => ({
          type: t.robot_type,
          count: parseInt(t.count) || 0,
          active_count: parseInt(t.active_count) || 0,
          total_investment: parseFloat(t.total_investment) || 0,
          total_profit: parseFloat(t.total_profit) || 0
        }))
      }
    });
  } catch (error) {
    console.error('Failed to get robot stats:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get robot stats' });
  }
});

/**
 * GET /robots/:id
 * Get robot details by ID
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const robots = await dbQuery(
      'SELECT * FROM robot_purchases WHERE id = ?',
      [id]
    );
    
    if (!robots || robots.length === 0) {
      return res.status(404).json({ success: false, message: 'Robot not found' });
    }
    
    const robot = robots[0];
    
    // Get user balance info
    const userBalance = await dbQuery(
      'SELECT * FROM user_balances WHERE wallet_address = ?',
      [robot.wallet_address]
    );
    
    // Get referral rewards generated by this robot
    const referralRewards = await dbQuery(
      `SELECT * FROM referral_rewards 
       WHERE source_wallet = ? AND robot_id = ?
       ORDER BY created_at DESC`,
      [robot.wallet_address, robot.id]
    );
    
    res.json({
      success: true,
      data: {
        robot,
        user_balance: userBalance[0] || null,
        referral_rewards: referralRewards
      }
    });
  } catch (error) {
    console.error('Failed to get robot details:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get robot details' });
  }
});

/**
 * GET /robots/user/:wallet_address
 * Get all robots for a specific user
 */
router.get('/user/:wallet_address', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const walletAddr = wallet_address.toLowerCase();
    
    const robots = await dbQuery(
      `SELECT * FROM robot_purchases 
       WHERE wallet_address = ? 
       ORDER BY created_at DESC`,
      [walletAddr]
    );
    
    // Calculate summary
    const summary = {
      total_count: robots.length,
      active_count: robots.filter(r => r.status === 'active').length,
      total_investment: robots.reduce((sum, r) => sum + parseFloat(r.price || 0), 0),
      total_profit: robots.reduce((sum, r) => sum + parseFloat(r.total_profit || 0), 0)
    };
    
    res.json({
      success: true,
      data: robots,
      summary
    });
  } catch (error) {
    console.error('Failed to get user robots:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get user robots' });
  }
});

/**
 * POST /robots/:id/cancel
 * Cancel a robot
 */
router.post('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { refund = false, reason = 'Admin cancellation' } = req.body;
    const adminUsername = req.admin?.username || 'admin';

    // Get robot details
    const robots = await dbQuery('SELECT * FROM robot_purchases WHERE id = ?', [id]);

    if (!robots || robots.length === 0) {
      return res.status(404).json({ success: false, message: 'Robot not found' });
    }

    const robot = robots[0];

    if (robot.status !== 'active') {
      return res.status(400).json({ 
        success: false, 
        message: `Robot is already ${robot.status}` 
      });
    }

    // Calculate refund amount
    let refundAmount = 0;
    if (refund) {
      if (robot.robot_type === 'high' || robot.robot_type === 'dex') {
        refundAmount = parseFloat(robot.expected_return) || parseFloat(robot.price);
      } else {
        refundAmount = parseFloat(robot.price);
      }
    }

    // Update robot status
    await dbQuery(
      `UPDATE robot_purchases 
       SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [id]
    );

    // Process refund
    if (refund && refundAmount > 0) {
      await dbQuery(
        `UPDATE user_balances 
         SET usdt_balance = usdt_balance + ?, updated_at = NOW()
         WHERE wallet_address = ?`,
        [refundAmount, robot.wallet_address]
      );

      await dbQuery(
        `INSERT INTO transaction_history 
         (wallet_address, type, amount, token, description, status, created_at)
         VALUES (?, 'robot_cancel_refund', ?, 'USDT', ?, 'completed', NOW())`,
        [robot.wallet_address, refundAmount, `Admin cancelled robot #${id}, refund`]
      );
    }

    // Log operation
    await dbQuery(
      `INSERT INTO admin_operation_logs 
       (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address, created_at)
       VALUES (?, ?, 'CANCEL_ROBOT', ?, ?, ?, NOW())`,
      [
        req.admin?.id || 0,
        adminUsername,
        robot.wallet_address,
        JSON.stringify({ robot_id: id, robot_type: robot.robot_type, refund, refund_amount: refundAmount, reason }),
        req.ip
      ]
    );

    secureLog('info', `Robot #${id} cancelled by ${adminUsername}`, {
      wallet: robot.wallet_address,
      refund: refund,
      refund_amount: refundAmount
    });

    res.json({
      success: true,
      message: `Robot cancelled${refund ? `, refunded ${refundAmount} USDT` : ''}`,
      data: { robot_id: id, refund, refund_amount: refundAmount }
    });
  } catch (error) {
    console.error('Failed to cancel robot:', error.message);
    res.status(500).json({ success: false, message: 'Failed to cancel robot: ' + error.message });
  }
});

/**
 * POST /robots/batch-cancel
 * Batch cancel multiple robots
 */
router.post('/batch-cancel', authMiddleware, async (req, res) => {
  try {
    const { ids, refund = false, reason = 'Batch admin cancellation' } = req.body;
    const adminUsername = req.admin?.username || 'admin';

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No robot IDs provided' });
    }

    let cancelled = 0, skipped = 0, totalRefund = 0;
    const results = [];

    for (const id of ids) {
      try {
        const robots = await dbQuery('SELECT * FROM robot_purchases WHERE id = ?', [id]);

        if (!robots || robots.length === 0) {
          skipped++;
          results.push({ id, status: 'not_found' });
          continue;
        }

        const robot = robots[0];
        if (robot.status !== 'active') {
          skipped++;
          results.push({ id, status: 'already_' + robot.status });
          continue;
        }

        let refundAmount = 0;
        if (refund) {
          if (robot.robot_type === 'high' || robot.robot_type === 'dex') {
            refundAmount = parseFloat(robot.expected_return) || parseFloat(robot.price);
          } else {
            refundAmount = parseFloat(robot.price);
          }
        }

        await dbQuery(
          `UPDATE robot_purchases SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = ?`,
          [id]
        );

        if (refund && refundAmount > 0) {
          await dbQuery(
            `UPDATE user_balances SET usdt_balance = usdt_balance + ?, updated_at = NOW() WHERE wallet_address = ?`,
            [refundAmount, robot.wallet_address]
          );
          totalRefund += refundAmount;
        }

        cancelled++;
        results.push({ id, wallet: robot.wallet_address, status: 'cancelled', refund: refundAmount });
      } catch (err) {
        skipped++;
        results.push({ id, status: 'error', error: err.message });
      }
    }

    await dbQuery(
      `INSERT INTO admin_operation_logs 
       (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address, created_at)
       VALUES (?, ?, 'BATCH_CANCEL_ROBOTS', 'batch', ?, ?, NOW())`,
      [req.admin?.id || 0, adminUsername, JSON.stringify({ count: cancelled, refund, total_refund: totalRefund, reason }), req.ip]
    );

    res.json({
      success: true,
      message: `Cancelled ${cancelled} robots, skipped ${skipped}`,
      data: { cancelled, skipped, total_refund: totalRefund, results: results.slice(0, 50) }
    });
  } catch (error) {
    console.error('Failed to batch cancel robots:', error.message);
    res.status(500).json({ success: false, message: 'Failed to batch cancel robots' });
  }
});

/**
 * POST /robots/cancel-by-user/:wallet_address
 * Cancel all active robots for a user
 */
router.post('/cancel-by-user/:wallet_address', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const { refund = false, reason = 'Admin cancellation - all user robots' } = req.body;
    const walletAddr = wallet_address.toLowerCase();
    const adminUsername = req.admin?.username || 'admin';

    const activeRobots = await dbQuery(
      'SELECT * FROM robot_purchases WHERE wallet_address = ? AND status = "active"',
      [walletAddr]
    );

    if (!activeRobots || activeRobots.length === 0) {
      return res.status(404).json({ success: false, message: 'No active robots found for this user' });
    }

    let totalRefund = 0;
    const robotIds = [];

    for (const robot of activeRobots) {
      let refundAmount = 0;
      if (refund) {
        if (robot.robot_type === 'high' || robot.robot_type === 'dex') {
          refundAmount = parseFloat(robot.expected_return) || parseFloat(robot.price);
        } else {
          refundAmount = parseFloat(robot.price);
        }
        totalRefund += refundAmount;
      }
      robotIds.push(robot.id);
    }

    await dbQuery(
      `UPDATE robot_purchases SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() 
       WHERE wallet_address = ? AND status = 'active'`,
      [walletAddr]
    );

    if (refund && totalRefund > 0) {
      await dbQuery(
        `UPDATE user_balances SET usdt_balance = usdt_balance + ?, updated_at = NOW() WHERE wallet_address = ?`,
        [totalRefund, walletAddr]
      );

      await dbQuery(
        `INSERT INTO transaction_history 
         (wallet_address, type, amount, token, description, status, created_at)
         VALUES (?, 'robot_batch_cancel_refund', ?, 'USDT', ?, 'completed', NOW())`,
        [walletAddr, totalRefund, `Admin cancelled ${activeRobots.length} robots, total refund`]
      );
    }

    await dbQuery(
      `INSERT INTO admin_operation_logs 
       (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address, created_at)
       VALUES (?, ?, 'CANCEL_USER_ROBOTS', ?, ?, ?, NOW())`,
      [req.admin?.id || 0, adminUsername, walletAddr, JSON.stringify({ robot_count: activeRobots.length, robot_ids: robotIds, refund, total_refund: totalRefund, reason }), req.ip]
    );

    res.json({
      success: true,
      message: `Cancelled ${activeRobots.length} robots${refund ? `, refunded ${totalRefund} USDT` : ''}`,
      data: { wallet_address: walletAddr, robots_cancelled: activeRobots.length, total_refund: totalRefund }
    });
  } catch (error) {
    console.error('Failed to cancel user robots:', error.message);
    res.status(500).json({ success: false, message: 'Failed to cancel user robots: ' + error.message });
  }
});

/**
 * GET /robots/cancelled
 * Get cancelled robots list
 */
router.get('/cancelled', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, wallet_address, robot_type, days = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const daysAgo = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    let conditions = ['rp.status = "cancelled"', 'rp.cancelled_at >= ?'];
    let params = [daysAgo];

    if (wallet_address) {
      conditions.push('rp.wallet_address = ?');
      params.push(wallet_address.toLowerCase());
    }
    if (robot_type) {
      conditions.push('rp.robot_type = ?');
      params.push(robot_type);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM robot_purchases rp WHERE ${whereClause}`,
      params
    );
    const total = countResult[0]?.total || 0;

    const robots = await dbQuery(
      `SELECT rp.* FROM robot_purchases rp WHERE ${whereClause} ORDER BY rp.cancelled_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: robots,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('Failed to get cancelled robots:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get cancelled robots' });
  }
});

/**
 * POST /robots/:id/reactivate
 * Reactivate a cancelled robot
 */
router.post('/:id/reactivate', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { extend_days = 0 } = req.body;
    const adminUsername = req.admin?.username || 'admin';

    const robots = await dbQuery('SELECT * FROM robot_purchases WHERE id = ?', [id]);

    if (!robots || robots.length === 0) {
      return res.status(404).json({ success: false, message: 'Robot not found' });
    }

    const robot = robots[0];
    if (robot.status === 'active') {
      return res.status(400).json({ success: false, message: 'Robot is already active' });
    }

    let newEndTime = new Date();
    if (extend_days > 0) {
      newEndTime = new Date(Date.now() + extend_days * 24 * 60 * 60 * 1000);
    } else if (robot.end_time) {
      const originalEnd = new Date(robot.end_time);
      const now = new Date();
      if (originalEnd > now) {
        newEndTime = originalEnd;
      } else {
        const originalDuration = robot.duration_hours || 24;
        newEndTime = new Date(Date.now() + originalDuration * 60 * 60 * 1000);
      }
    }

    await dbQuery(
      `UPDATE robot_purchases SET status = 'active', cancelled_at = NULL, end_time = ?, updated_at = NOW() WHERE id = ?`,
      [newEndTime, id]
    );

    await dbQuery(
      `INSERT INTO admin_operation_logs 
       (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address, created_at)
       VALUES (?, ?, 'REACTIVATE_ROBOT', ?, ?, ?, NOW())`,
      [req.admin?.id || 0, adminUsername, robot.wallet_address, JSON.stringify({ robot_id: id, previous_status: robot.status, new_end_time: newEndTime.toISOString(), extend_days }), req.ip]
    );

    res.json({
      success: true,
      message: 'Robot reactivated successfully',
      data: { robot_id: id, new_end_time: newEndTime.toISOString() }
    });
  } catch (error) {
    console.error('Failed to reactivate robot:', error.message);
    res.status(500).json({ success: false, message: 'Failed to reactivate robot: ' + error.message });
  }
});

/**
 * GET /robots/earnings-summary
 * Get robot earnings summary by type
 */
router.get('/earnings-summary', authMiddleware, async (req, res) => {
  try {
    const typeStats = await dbQuery(`
      SELECT 
        robot_type,
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
        SUM(price) as total_investment,
        SUM(total_profit) as total_profit,
        SUM(expected_return) as total_expected_return
      FROM robot_purchases
      GROUP BY robot_type
    `);

    const topUsers = await dbQuery(`
      SELECT 
        wallet_address,
        COUNT(*) as robot_count,
        SUM(price) as total_investment,
        SUM(total_profit) as total_profit
      FROM robot_purchases
      GROUP BY wallet_address
      ORDER BY total_investment DESC
      LIMIT 20
    `);

    res.json({
      success: true,
      data: {
        by_type: typeStats,
        top_users: topUsers.map(u => ({
          wallet_address: u.wallet_address,
          robot_count: u.robot_count,
          total_investment: parseFloat(u.total_investment || 0).toFixed(2),
          total_profit: parseFloat(u.total_profit || 0).toFixed(4)
        }))
      }
    });
  } catch (error) {
    console.error('Failed to get earnings summary:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get earnings summary' });
  }
});

export default router;

