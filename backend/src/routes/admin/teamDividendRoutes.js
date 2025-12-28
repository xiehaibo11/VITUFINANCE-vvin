/**
 * Admin Routes - Team Dividend Management
 * 
 * Features:
 * - View dividend records
 * - Manual dividend compensation
 * - Batch dividend compensation
 * - Dividend statistics overview
 */
import express from 'express';
import { dbQuery, secureLog, authMiddleware } from './shared.js';

const router = express.Router();

/**
 * GET /team-dividend
 * Get team dividend records with pagination
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, wallet_address, broker_level, start_date, end_date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = ['reward_type = "daily_dividend"'];
    let params = [];

    if (wallet_address) {
      conditions.push('wallet_address LIKE ?');
      params.push(`%${wallet_address.toLowerCase()}%`);
    }
    if (broker_level) {
      conditions.push('broker_level = ?');
      params.push(parseInt(broker_level));
    }
    if (start_date) {
      conditions.push('DATE(reward_date) >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('DATE(reward_date) <= ?');
      params.push(end_date);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM team_rewards WHERE ${whereClause}`,
      params
    );
    const total = countResult[0]?.total || 0;

    // Get records
    const records = await dbQuery(
      `SELECT * FROM team_rewards WHERE ${whereClause} ORDER BY reward_date DESC, created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: records,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('Failed to get team dividend records:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get records' });
  }
});

/**
 * GET /team-dividend/overview
 * Get dividend statistics overview
 */
router.get('/overview', authMiddleware, async (req, res) => {
  try {
    // Total stats
    const totalStats = await dbQuery(`
      SELECT 
        COUNT(DISTINCT wallet_address) as total_members,
        COUNT(*) as total_records,
        SUM(reward_amount) as total_amount
      FROM team_rewards WHERE reward_type = 'daily_dividend'
    `);

    // Today stats
    const todayStats = await dbQuery(`
      SELECT 
        COUNT(DISTINCT wallet_address) as today_members,
        SUM(reward_amount) as today_amount
      FROM team_rewards
      WHERE reward_type = 'daily_dividend' AND DATE(reward_date) = CURDATE()
    `);

    // This month stats
    const monthStats = await dbQuery(`
      SELECT 
        COUNT(DISTINCT wallet_address) as month_members,
        SUM(reward_amount) as month_amount
      FROM team_rewards
      WHERE reward_type = 'daily_dividend' AND DATE(reward_date) >= DATE_FORMAT(NOW(), '%Y-%m-01')
    `);

    // Level distribution (last 7 days)
    const levelDistribution = await dbQuery(`
      SELECT 
        broker_level,
        COUNT(DISTINCT wallet_address) as member_count,
        SUM(reward_amount) as total_amount
      FROM team_rewards
      WHERE reward_type = 'daily_dividend' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY broker_level ORDER BY broker_level DESC
    `);

    // Trend data (last 7 days)
    const trendData = await dbQuery(`
      SELECT 
        DATE(reward_date) as date,
        COUNT(DISTINCT wallet_address) as members,
        SUM(reward_amount) as amount
      FROM team_rewards
      WHERE reward_type = 'daily_dividend' AND reward_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(reward_date) ORDER BY date DESC
    `);

    res.json({
      success: true,
      data: {
        total: {
          members: parseInt(totalStats[0]?.total_members) || 0,
          records: parseInt(totalStats[0]?.total_records) || 0,
          amount: parseFloat(totalStats[0]?.total_amount) || 0
        },
        today: {
          members: parseInt(todayStats[0]?.today_members) || 0,
          amount: parseFloat(todayStats[0]?.today_amount) || 0
        },
        month: {
          members: parseInt(monthStats[0]?.month_members) || 0,
          amount: parseFloat(monthStats[0]?.month_amount) || 0
        },
        levelDistribution,
        trendData
      }
    });
  } catch (error) {
    console.error('Failed to get dividend overview:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get data' });
  }
});

/**
 * POST /team-dividend/compensate
 * Manual dividend compensation for a single user
 */
router.post('/compensate', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, broker_level, reward_amount, reward_date, reason } = req.body;

    // Validate parameters
    if (!wallet_address || !broker_level || !reward_amount || !reward_date) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    const walletAddr = wallet_address.toLowerCase();
    const level = parseInt(broker_level);
    const amount = parseFloat(reward_amount);

    if (level < 1 || level > 5) {
      return res.status(400).json({ success: false, message: 'Invalid broker level (1-5)' });
    }
    if (amount <= 0 || amount > 10000) {
      return res.status(400).json({ success: false, message: 'Invalid reward amount' });
    }

    // Check if already distributed for this date
    const existing = await dbQuery(
      `SELECT * FROM team_rewards WHERE wallet_address = ? AND DATE(reward_date) = ? AND reward_type = 'daily_dividend'`,
      [walletAddr, reward_date]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: `Dividend already distributed for ${reward_date}` });
    }

    // Ensure user balance record exists
    await dbQuery(
      `INSERT IGNORE INTO user_balances (wallet_address, usdt_balance, wld_balance, created_at, updated_at) VALUES (?, 0, 0, NOW(), NOW())`,
      [walletAddr]
    );

    // Update user balance
    await dbQuery(
      `UPDATE user_balances SET usdt_balance = usdt_balance + ?, updated_at = NOW() WHERE wallet_address = ?`,
      [amount, walletAddr]
    );

    // Insert dividend record
    await dbQuery(
      `INSERT INTO team_rewards (wallet_address, reward_type, broker_level, reward_amount, reward_date, created_at) VALUES (?, 'daily_dividend', ?, ?, ?, NOW())`,
      [walletAddr, level, amount, reward_date]
    );

    secureLog('Team dividend compensation', {
      admin: req.admin?.username,
      wallet_address: walletAddr,
      level, amount, reward_date, reason
    });

    res.json({
      success: true,
      message: 'Dividend compensation successful',
      data: { wallet_address: walletAddr, broker_level: level, reward_amount: amount, reward_date }
    });
  } catch (error) {
    console.error('Failed to compensate dividend:', error.message);
    res.status(500).json({ success: false, message: 'Compensation failed' });
  }
});

/**
 * POST /team-dividend/batch-compensate
 * Batch dividend compensation
 */
router.post('/batch-compensate', authMiddleware, async (req, res) => {
  try {
    const { compensations, reason } = req.body;

    if (!Array.isArray(compensations) || compensations.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide compensation list' });
    }

    const results = { success: 0, failed: 0, skipped: 0, details: [] };

    for (const comp of compensations) {
      const { wallet_address, broker_level, reward_amount, reward_date } = comp;
      const walletAddr = wallet_address?.toLowerCase();

      try {
        if (!walletAddr || !broker_level || !reward_amount || !reward_date) {
          results.failed++;
          results.details.push({ wallet_address: walletAddr, status: 'failed', message: 'Missing parameters' });
          continue;
        }

        const level = parseInt(broker_level);
        const amount = parseFloat(reward_amount);

        if (level < 1 || level > 5 || amount <= 0) {
          results.failed++;
          results.details.push({ wallet_address: walletAddr, status: 'failed', message: 'Invalid parameters' });
          continue;
        }

        // Check if already distributed
        const existing = await dbQuery(
          `SELECT * FROM team_rewards WHERE wallet_address = ? AND DATE(reward_date) = ? AND reward_type = 'daily_dividend'`,
          [walletAddr, reward_date]
        );
        if (existing.length > 0) {
          results.skipped++;
          results.details.push({ wallet_address: walletAddr, status: 'skipped', message: 'Already distributed' });
          continue;
        }

        // Process compensation
        await dbQuery(
          `INSERT IGNORE INTO user_balances (wallet_address, usdt_balance, wld_balance, created_at, updated_at) VALUES (?, 0, 0, NOW(), NOW())`,
          [walletAddr]
        );
        await dbQuery(
          `UPDATE user_balances SET usdt_balance = usdt_balance + ?, updated_at = NOW() WHERE wallet_address = ?`,
          [amount, walletAddr]
        );
        await dbQuery(
          `INSERT INTO team_rewards (wallet_address, reward_type, broker_level, reward_amount, reward_date, created_at) VALUES (?, 'daily_dividend', ?, ?, ?, NOW())`,
          [walletAddr, level, amount, reward_date]
        );

        results.success++;
        results.details.push({ wallet_address: walletAddr, status: 'success', amount });
      } catch (err) {
        results.failed++;
        results.details.push({ wallet_address: walletAddr, status: 'error', message: err.message });
      }
    }

    secureLog('Batch team dividend compensation', {
      admin: req.admin?.username,
      success: results.success,
      failed: results.failed,
      skipped: results.skipped,
      reason
    });

    res.json({
      success: true,
      message: `Completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`,
      data: results
    });
  } catch (error) {
    console.error('Failed to batch compensate:', error.message);
    res.status(500).json({ success: false, message: 'Batch compensation failed' });
  }
});

/**
 * GET /team-dividend/user/:wallet_address
 * Get dividend records for a specific user
 */
router.get('/user/:wallet_address', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const walletAddr = wallet_address.toLowerCase();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM team_rewards WHERE wallet_address = ? AND reward_type = 'daily_dividend'`,
      [walletAddr]
    );
    const total = countResult[0]?.total || 0;

    const records = await dbQuery(
      `SELECT * FROM team_rewards WHERE wallet_address = ? AND reward_type = 'daily_dividend' ORDER BY reward_date DESC LIMIT ? OFFSET ?`,
      [walletAddr, parseInt(limit), offset]
    );

    // Summary
    const summaryResult = await dbQuery(
      `SELECT SUM(reward_amount) as total_amount, COUNT(*) as total_count FROM team_rewards WHERE wallet_address = ? AND reward_type = 'daily_dividend'`,
      [walletAddr]
    );

    res.json({
      success: true,
      data: records,
      summary: {
        total_amount: parseFloat(summaryResult[0]?.total_amount) || 0,
        total_count: parseInt(summaryResult[0]?.total_count) || 0
      },
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('Failed to get user dividends:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get user dividend records' });
  }
});

export default router;

