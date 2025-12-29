/**
 * Admin Routes - Team Management Module
 * Handles: User team data, hierarchy, award referral/dividend, broker level
 */
import { express, dbQuery, authMiddleware, secureLog } from './shared.js';

const router = express.Router();

// ==================== Team Management ====================

router.get('/team-management/user/:wallet_address', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const walletAddr = wallet_address.toLowerCase();

    // Get user basic info
    const userRows = await dbQuery(
      `SELECT ub.*, 
        (SELECT COUNT(*) FROM user_referrals WHERE referrer_address = ub.wallet_address) as direct_referrals,
        (SELECT referrer_address FROM user_referrals WHERE wallet_address = ub.wallet_address) as my_referrer
       FROM user_balances ub
       WHERE ub.wallet_address = ?`,
      [walletAddr]
    );

    if (!userRows || userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userRows[0];

    // Get team statistics
    const teamStats = await dbQuery(`
      WITH RECURSIVE team_tree AS (
        SELECT wallet_address, referrer_address, 1 as level
        FROM user_referrals WHERE referrer_address = ?
        UNION ALL
        SELECT r.wallet_address, r.referrer_address, t.level + 1
        FROM user_referrals r
        INNER JOIN team_tree t ON r.referrer_address = t.wallet_address
        WHERE t.level < 8
      )
      SELECT 
        COUNT(DISTINCT tt.wallet_address) as total_team_members,
        COALESCE(SUM(CASE WHEN tt.level = 1 THEN 1 ELSE 0 END), 0) as level1_count,
        COALESCE(SUM(CASE WHEN tt.level = 2 THEN 1 ELSE 0 END), 0) as level2_count,
        COALESCE(SUM(CASE WHEN tt.level = 3 THEN 1 ELSE 0 END), 0) as level3_count,
        COALESCE(SUM(CASE WHEN tt.level <= 8 THEN 1 ELSE 0 END), 0) as total_count
      FROM team_tree tt
    `, [walletAddr]);

    // Get team performance (total deposits)
    const performanceRows = await dbQuery(`
      WITH RECURSIVE team_tree AS (
        SELECT wallet_address FROM user_referrals WHERE referrer_address = ?
        UNION ALL
        SELECT r.wallet_address FROM user_referrals r
        INNER JOIN team_tree t ON r.referrer_address = t.wallet_address
      )
      SELECT COALESCE(SUM(d.amount), 0) as total_team_deposits
      FROM deposits d
      WHERE d.wallet_address IN (SELECT wallet_address FROM team_tree)
        AND d.status = 'completed'
    `, [walletAddr]);

    // Get referral rewards history
    const referralRewards = await dbQuery(`
      SELECT COALESCE(SUM(reward_amount), 0) as total_referral_reward
      FROM referral_rewards
      WHERE to_wallet = ?
    `, [walletAddr]);

    // Get team dividend history
    const teamDividends = await dbQuery(`
      SELECT COALESCE(SUM(reward_amount), 0) as total_team_dividend
      FROM team_dividend_records
      WHERE wallet_address = ?
    `, [walletAddr]);

    // Get broker level info
    const brokerInfo = await dbQuery(`
      SELECT broker_level, qualified_direct_members, team_performance
      FROM broker_levels
      WHERE wallet_address = ?
    `, [walletAddr]);

    res.json({
      success: true,
      data: {
        wallet_address: walletAddr,
        usdt_balance: parseFloat(user.usdt_balance || 0),
        total_deposit: parseFloat(user.total_deposit || 0),
        my_referrer: user.my_referrer || null,
        direct_referrals: user.direct_referrals || 0,
        broker_level: brokerInfo[0]?.broker_level || 0,
        qualified_direct_members: brokerInfo[0]?.qualified_direct_members || 0,
        team_performance: parseFloat(brokerInfo[0]?.team_performance || performanceRows[0]?.total_team_deposits || 0),
        total_team_members: teamStats[0]?.total_team_members || 0,
        level_breakdown: {
          level1: teamStats[0]?.level1_count || 0,
          level2: teamStats[0]?.level2_count || 0,
          level3: teamStats[0]?.level3_count || 0
        },
        total_referral_reward: parseFloat(referralRewards[0]?.total_referral_reward || 0),
        total_team_dividend: parseFloat(teamDividends[0]?.total_team_dividend || 0),
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('[TeamManagement] Error getting user data:', error);
    res.status(500).json({ success: false, message: 'Failed to get user data' });
  }
});

/**
 * GET /api/admin/team-management/hierarchy/:wallet_address
 * Get multi-level referral hierarchy tree
 */
router.get('/team-management/hierarchy/:wallet_address', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const { max_level = 3 } = req.query;
    const walletAddr = wallet_address.toLowerCase();
    const maxLvl = Math.min(parseInt(max_level) || 3, 8);

    // Build hierarchy tree recursively
    const buildTree = async (address, level) => {
      if (level > maxLvl) return [];
      
      const children = await dbQuery(`
        SELECT 
          r.wallet_address,
          r.created_at as bind_time,
          COALESCE(ub.usdt_balance, 0) as balance,
          COALESCE(ub.total_deposit, 0) as total_deposit,
          (SELECT COUNT(*) FROM user_referrals WHERE referrer_address = r.wallet_address) as sub_count,
          (SELECT COUNT(*) FROM robot_purchases WHERE wallet_address = r.wallet_address AND status = 'active') as active_robots,
          COALESCE(bl.broker_level, 0) as broker_level
        FROM user_referrals r
        LEFT JOIN user_balances ub ON ub.wallet_address = r.wallet_address
        LEFT JOIN broker_levels bl ON bl.wallet_address = r.wallet_address
        WHERE r.referrer_address = ?
        ORDER BY r.created_at DESC
        LIMIT 100
      `, [address]);

      const result = [];
      for (const child of children) {
        const node = {
          wallet_address: child.wallet_address,
          bind_time: child.bind_time,
          balance: parseFloat(child.balance || 0),
          total_deposit: parseFloat(child.total_deposit || 0),
          sub_count: child.sub_count || 0,
          active_robots: child.active_robots || 0,
          broker_level: child.broker_level || 0,
          level: level,
          children: level < maxLvl ? await buildTree(child.wallet_address, level + 1) : []
        };
        result.push(node);
      }
      return result;
    };

    const hierarchy = await buildTree(walletAddr, 1);

    // Count totals
    const countNodes = (nodes) => {
      let count = nodes.length;
      for (const node of nodes) {
        if (node.children) count += countNodes(node.children);
      }
      return count;
    };

    res.json({
      success: true,
      data: {
        root: walletAddr,
        max_level: maxLvl,
        total_members: countNodes(hierarchy),
        direct_members: hierarchy.length,
        hierarchy: hierarchy
      }
    });
  } catch (error) {
    console.error('[TeamManagement] Error getting hierarchy:', error);
    res.status(500).json({ success: false, message: 'Failed to get hierarchy' });
  }
});

/**
 * POST /api/admin/team-management/award-referral
 * Manually award referral bonus (real USDT to balance)
 */
router.post('/team-management/award-referral', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, amount, reason, from_wallet = 'system' } = req.body;
    const adminUsername = req.admin?.username || 'admin';

    if (!wallet_address || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid wallet address or amount' });
    }

    const walletAddr = wallet_address.toLowerCase();
    const awardAmount = parseFloat(amount);

    // Check user exists
    const userCheck = await dbQuery('SELECT wallet_address FROM user_balances WHERE wallet_address = ?', [walletAddr]);
    if (!userCheck || userCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Add to user balance
    await dbQuery(
      `UPDATE user_balances 
       SET usdt_balance = usdt_balance + ?, updated_at = NOW()
       WHERE wallet_address = ?`,
      [awardAmount, walletAddr]
    );

    // Record referral reward
    await dbQuery(
      `INSERT INTO referral_rewards 
       (to_wallet, from_wallet, reward_amount, level, source_type, robot_id, created_at)
       VALUES (?, ?, ?, 0, 'admin_award', 0, NOW())`,
      [walletAddr, from_wallet, awardAmount]
    );

    // Record transaction
    await dbQuery(
      `INSERT INTO transaction_history 
       (wallet_address, type, amount, token, description, status, created_at)
       VALUES (?, 'admin_referral_award', ?, 'USDT', ?, 'completed', NOW())`,
      [walletAddr, awardAmount, reason || `Admin awarded referral bonus by ${adminUsername}`]
    );

    // Log admin operation
    await dbQuery(
      `INSERT INTO admin_operation_logs 
       (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address, created_at)
       VALUES (?, ?, 'AWARD_REFERRAL', ?, ?, ?, NOW())`,
      [req.admin?.id || 0, adminUsername, walletAddr, JSON.stringify({ amount: awardAmount, reason }), req.ip]
    );

    secureLog('info', `Referral bonus awarded: ${awardAmount} USDT to ${walletAddr} by ${adminUsername}`);

    res.json({
      success: true,
      message: `Successfully awarded ${awardAmount} USDT referral bonus`,
      data: { wallet_address: walletAddr, amount: awardAmount }
    });
  } catch (error) {
    console.error('[TeamManagement] Error awarding referral:', error);
    res.status(500).json({ success: false, message: 'Failed to award referral bonus' });
  }
});

/**
 * POST /api/admin/team-management/award-dividend
 * Manually award team dividend (real USDT to balance)
 */
router.post('/team-management/award-dividend', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, amount, broker_level, reason } = req.body;
    const adminUsername = req.admin?.username || 'admin';

    if (!wallet_address || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid wallet address or amount' });
    }

    const walletAddr = wallet_address.toLowerCase();
    const awardAmount = parseFloat(amount);
    const level = parseInt(broker_level) || 1;

    // Check user exists
    const userCheck = await dbQuery('SELECT wallet_address FROM user_balances WHERE wallet_address = ?', [walletAddr]);
    if (!userCheck || userCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Add to user balance
    await dbQuery(
      `UPDATE user_balances 
       SET usdt_balance = usdt_balance + ?, updated_at = NOW()
       WHERE wallet_address = ?`,
      [awardAmount, walletAddr]
    );

    // Record team dividend
    const today = new Date().toISOString().slice(0, 10);
    await dbQuery(
      `INSERT INTO team_dividend_records 
       (wallet_address, broker_level, reward_amount, reward_date, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [walletAddr, level, awardAmount, today]
    );

    // Record transaction
    await dbQuery(
      `INSERT INTO transaction_history 
       (wallet_address, type, amount, token, description, status, created_at)
       VALUES (?, 'admin_team_dividend', ?, 'USDT', ?, 'completed', NOW())`,
      [walletAddr, awardAmount, reason || `Admin awarded team dividend by ${adminUsername}`]
    );

    // Log admin operation
    await dbQuery(
      `INSERT INTO admin_operation_logs 
       (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address, created_at)
       VALUES (?, ?, 'AWARD_DIVIDEND', ?, ?, ?, NOW())`,
      [req.admin?.id || 0, adminUsername, walletAddr, JSON.stringify({ amount: awardAmount, broker_level: level, reason }), req.ip]
    );

    secureLog('info', `Team dividend awarded: ${awardAmount} USDT to ${walletAddr} (Level ${level}) by ${adminUsername}`);

    res.json({
      success: true,
      message: `Successfully awarded ${awardAmount} USDT team dividend`,
      data: { wallet_address: walletAddr, amount: awardAmount, broker_level: level }
    });
  } catch (error) {
    console.error('[TeamManagement] Error awarding dividend:', error);
    res.status(500).json({ success: false, message: 'Failed to award team dividend' });
  }
});

/**
 * PUT /api/admin/team-management/broker-level
 * Adjust user broker level
 */
router.put('/team-management/broker-level', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, new_level, reason } = req.body;
    const adminUsername = req.admin?.username || 'admin';

    if (!wallet_address || new_level === undefined || new_level < 0 || new_level > 5) {
      return res.status(400).json({ success: false, message: 'Invalid wallet address or level (0-5)' });
    }

    const walletAddr = wallet_address.toLowerCase();
    const brokerLevel = parseInt(new_level);

    // Get current level
    const currentRows = await dbQuery(
      'SELECT broker_level FROM broker_levels WHERE wallet_address = ?',
      [walletAddr]
    );
    const oldLevel = currentRows[0]?.broker_level || 0;

    // Update or insert broker level
    await dbQuery(
      `INSERT INTO broker_levels (wallet_address, broker_level, updated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE broker_level = ?, updated_at = NOW()`,
      [walletAddr, brokerLevel, brokerLevel]
    );

    // Log admin operation
    await dbQuery(
      `INSERT INTO admin_operation_logs 
       (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address, created_at)
       VALUES (?, ?, 'CHANGE_BROKER_LEVEL', ?, ?, ?, NOW())`,
      [
        req.admin?.id || 0, 
        adminUsername, 
        walletAddr, 
        JSON.stringify({ old_level: oldLevel, new_level: brokerLevel, reason }),
        req.ip
      ]
    );

    secureLog('info', `Broker level changed: ${walletAddr} from ${oldLevel} to ${brokerLevel} by ${adminUsername}`);

    res.json({
      success: true,
      message: `Broker level updated from ${oldLevel} to ${brokerLevel}`,
      data: { wallet_address: walletAddr, old_level: oldLevel, new_level: brokerLevel }
    });
  } catch (error) {
    console.error('[TeamManagement] Error changing broker level:', error);
    res.status(500).json({ success: false, message: 'Failed to change broker level' });
  }
});

/**
 * POST /api/admin/team-management/batch-award
 * Batch award rewards to multiple users
 */
router.post('/team-management/batch-award', authMiddleware, async (req, res) => {
  try {
    const { awards, award_type, reason } = req.body;
    const adminUsername = req.admin?.username || 'admin';

    if (!awards || !Array.isArray(awards) || awards.length === 0) {
      return res.status(400).json({ success: false, message: 'No awards provided' });
    }

    if (!['referral', 'dividend'].includes(award_type)) {
      return res.status(400).json({ success: false, message: 'Invalid award type (referral or dividend)' });
    }

    let success = 0, failed = 0, totalAmount = 0;
    const results = [];

    for (const award of awards) {
      try {
        const { wallet_address, amount, broker_level = 1 } = award;
        if (!wallet_address || !amount || amount <= 0) {
          failed++;
          results.push({ wallet_address, status: 'invalid_params' });
          continue;
        }

        const walletAddr = wallet_address.toLowerCase();
        const awardAmount = parseFloat(amount);

        // Check user exists
        const userCheck = await dbQuery('SELECT wallet_address FROM user_balances WHERE wallet_address = ?', [walletAddr]);
        if (!userCheck || userCheck.length === 0) {
          failed++;
          results.push({ wallet_address: walletAddr, status: 'user_not_found' });
          continue;
        }

        // Add to balance
        await dbQuery(
          `UPDATE user_balances SET usdt_balance = usdt_balance + ?, updated_at = NOW() WHERE wallet_address = ?`,
          [awardAmount, walletAddr]
        );

        // Record based on type
        if (award_type === 'referral') {
          await dbQuery(
            `INSERT INTO referral_rewards (to_wallet, from_wallet, reward_amount, level, source_type, robot_id, created_at)
             VALUES (?, 'system', ?, 0, 'batch_admin_award', 0, NOW())`,
            [walletAddr, awardAmount]
          );
        } else {
          const today = new Date().toISOString().slice(0, 10);
          await dbQuery(
            `INSERT INTO team_dividend_records (wallet_address, broker_level, reward_amount, reward_date, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [walletAddr, broker_level, awardAmount, today]
          );
        }

        // Record transaction
        await dbQuery(
          `INSERT INTO transaction_history (wallet_address, type, amount, token, description, status, created_at)
           VALUES (?, ?, ?, 'USDT', ?, 'completed', NOW())`,
          [walletAddr, `batch_${award_type}_award`, awardAmount, reason || `Batch ${award_type} award by ${adminUsername}`]
        );

        success++;
        totalAmount += awardAmount;
        results.push({ wallet_address: walletAddr, amount: awardAmount, status: 'success' });
      } catch (err) {
        failed++;
        results.push({ wallet_address: award.wallet_address, status: 'error', error: err.message });
      }
    }

    // Log batch operation
    await dbQuery(
      `INSERT INTO admin_operation_logs 
       (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address, created_at)
       VALUES (?, ?, 'BATCH_AWARD', 'batch', ?, ?, NOW())`,
      [
        req.admin?.id || 0,
        adminUsername,
        JSON.stringify({ award_type, count: success, total_amount: totalAmount, reason }),
        req.ip
      ]
    );

    secureLog('info', `Batch ${award_type} award: ${success} users, ${totalAmount} USDT total by ${adminUsername}`);

    res.json({
      success: true,
      message: `Batch awarded ${success} users, failed ${failed}`,
      data: { success, failed, total_amount: totalAmount, results: results.slice(0, 50) }
    });
  } catch (error) {
    console.error('[TeamManagement] Error batch awarding:', error);
    res.status(500).json({ success: false, message: 'Failed to batch award' });
  }
});

/**
 * GET /api/admin/team-management/search
 * Search users for team management
 */
router.get('/team-management/search', authMiddleware, async (req, res) => {
  try {
    const { q, page = 1, limit = 20, min_level = 0 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = '1=1';
    let params = [];

    if (q) {
      whereClause += ' AND ub.wallet_address LIKE ?';
      params.push(`%${q}%`);
    }

    if (min_level > 0) {
      whereClause += ' AND COALESCE(bl.broker_level, 0) >= ?';
      params.push(parseInt(min_level));
    }

    // Get total count
    const countResult = await dbQuery(`
      SELECT COUNT(*) as total
      FROM user_balances ub
      LEFT JOIN broker_levels bl ON bl.wallet_address = ub.wallet_address
      WHERE ${whereClause}
    `, params);

    // Get users
    const users = await dbQuery(`
      SELECT
        ub.wallet_address,
        ub.usdt_balance,
        ub.total_deposit,
        ub.created_at,
        COALESCE(bl.broker_level, 0) as broker_level,
        COALESCE(bl.qualified_direct_members, 0) as qualified_direct_members,
        (SELECT COUNT(*) FROM user_referrals WHERE referrer_address = ub.wallet_address) as direct_referrals,
        (SELECT COALESCE(SUM(reward_amount), 0) FROM referral_rewards WHERE to_wallet = ub.wallet_address) as total_referral_reward,
        (SELECT COALESCE(SUM(reward_amount), 0) FROM team_dividend_records WHERE wallet_address = ub.wallet_address) as total_team_dividend
      FROM user_balances ub
      LEFT JOIN broker_levels bl ON bl.wallet_address = ub.wallet_address
      WHERE ${whereClause}
      ORDER BY COALESCE(bl.broker_level, 0) DESC, ub.total_deposit DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    res.json({
      success: true,
      data: users.map(u => ({
        ...u,
        usdt_balance: parseFloat(u.usdt_balance || 0),
        total_deposit: parseFloat(u.total_deposit || 0),
        total_referral_reward: parseFloat(u.total_referral_reward || 0),
        total_team_dividend: parseFloat(u.total_team_dividend || 0)
      })),
      pagination: {
        total: countResult[0]?.total || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[TeamManagement] Error searching users:', error);
    res.status(500).json({ success: false, message: 'Failed to search users' });
  }
});

/**
 * POST /api/admin/team-management/adjust-balance
 * Adjust user USDT balance (increase, decrease, or set directly)
 */
router.post('/team-management/adjust-balance', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, amount, operation_type, reason } = req.body;
    const adminUsername = req.admin?.username || 'admin';

    if (!wallet_address) {
      return res.status(400).json({ success: false, message: 'Invalid wallet address' });
    }

    if (!operation_type || !['increase', 'decrease', 'set'].includes(operation_type)) {
      return res.status(400).json({ success: false, message: 'Invalid operation type (increase, decrease, or set)' });
    }

    const walletAddr = wallet_address.toLowerCase();
    const inputAmount = parseFloat(amount);

    if (isNaN(inputAmount) || inputAmount < 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    // Check user exists
    const userCheck = await dbQuery('SELECT wallet_address, usdt_balance FROM user_balances WHERE wallet_address = ?', [walletAddr]);
    if (!userCheck || userCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const currentBalance = parseFloat(userCheck[0].usdt_balance || 0);
    let newBalance;
    let finalAmount; // The actual change amount

    if (operation_type === 'set') {
      // Direct set: calculate the difference
      newBalance = inputAmount;
      finalAmount = newBalance - currentBalance;
    } else if (operation_type === 'increase') {
      if (inputAmount === 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
      }
      finalAmount = inputAmount;
      newBalance = currentBalance + finalAmount;
    } else { // decrease
      if (inputAmount === 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
      }
      finalAmount = -inputAmount;
      newBalance = currentBalance + finalAmount;
    }

    // Prevent negative balance
    if (newBalance < 0) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Current: ${currentBalance} USDT, new balance would be: ${newBalance} USDT`
      });
    }

    // Update user balance - use direct set for 'set' operation, otherwise add the difference
    if (operation_type === 'set') {
      await dbQuery(
        `UPDATE user_balances
         SET usdt_balance = ?, updated_at = NOW()
         WHERE wallet_address = ?`,
        [newBalance, walletAddr]
      );
    } else {
      await dbQuery(
        `UPDATE user_balances
         SET usdt_balance = usdt_balance + ?, updated_at = NOW()
         WHERE wallet_address = ?`,
        [finalAmount, walletAddr]
      );
    }

    // Record transaction
    const operationText = operation_type === 'set' ? 'set to' : operation_type;
    await dbQuery(
      `INSERT INTO transaction_history
       (wallet_address, type, amount, token, description, status, created_at)
       VALUES (?, 'admin_balance_adjustment', ?, 'USDT', ?, 'completed', NOW())`,
      [
        walletAddr,
        finalAmount,
        reason || `Admin balance adjustment (${operationText} ${operation_type === 'set' ? inputAmount : ''}) by ${adminUsername}`
      ]
    );

    // Log admin operation
    await dbQuery(
      `INSERT INTO admin_operation_logs
       (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address, created_at)
       VALUES (?, ?, 'ADJUST_BALANCE', ?, ?, ?, NOW())`,
      [
        req.admin?.id || 0,
        adminUsername,
        walletAddr,
        JSON.stringify({
          operation: operation_type,
          input_amount: inputAmount,
          change_amount: finalAmount,
          old_balance: currentBalance,
          new_balance: newBalance,
          reason
        }),
        req.ip
      ]
    );

    secureLog('info', `Balance adjusted: ${walletAddr} ${operation_type} ${inputAmount} USDT (${currentBalance} -> ${newBalance}, change: ${finalAmount}) by ${adminUsername}`);

    res.json({
      success: true,
      message: `Successfully adjusted balance: ${operation_type} ${operation_type === 'set' ? 'to' : ''} ${inputAmount} USDT`,
      data: {
        wallet_address: walletAddr,
        operation_type,
        input_amount: inputAmount,
        change_amount: finalAmount,
        old_balance: currentBalance,
        new_balance: newBalance
      }
    });
  } catch (error) {
    console.error('[TeamManagement] Error adjusting balance:', error);
    res.status(500).json({ success: false, message: 'Failed to adjust balance' });
  }
});

export default router;
