/**
 * Admin Routes - Invite Statistics Module
 * Handles: Invite stats search, details, adjustments
 */
import { express, dbQuery, authMiddleware, secureLog, MIN_ROBOT_PURCHASE } from './shared.js';

const router = express.Router();

// ==================== Invite Statistics ====================

router.get('/invite-stats/search', authMiddleware, async (req, res) => {
  try {
    const { q = '', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Search users by wallet address (use user_balances table)
    let whereClause = '1=1';
    let params = [];
    
    if (q && q.trim()) {
      const searchTerm = `%${q.trim().toLowerCase()}%`;
      whereClause = 'LOWER(u.wallet_address) LIKE ?';
      params.push(searchTerm);
    }
    
    // Get total count from user_balances table
    const countResult = await dbQuery(
      `SELECT COUNT(DISTINCT wallet_address) as total FROM user_balances WHERE ${q && q.trim() ? 'LOWER(wallet_address) LIKE ?' : '1=1'}`,
      q && q.trim() ? [`%${q.trim().toLowerCase()}%`] : []
    );
    const total = countResult[0]?.total || 0;
    
    // Get users with their current adjustments from user_balances table
    // Use COLLATE to fix charset mismatch between tables
    // Use table alias 'u' for wallet_address to avoid ambiguity
    const users = await dbQuery(`
      SELECT 
        u.wallet_address,
        u.created_at as user_created_at,
        COALESCE(a.daily_income_adj, 0) as daily_income_adj,
        COALESCE(a.team_members_adj, 0) as team_members_adj,
        COALESCE(a.total_recharge_adj, 0) as total_recharge_adj,
        COALESCE(a.direct_members_adj, 0) as direct_members_adj,
        COALESCE(a.total_withdrawals_adj, 0) as total_withdrawals_adj,
        COALESCE(a.total_performance_adj, 0) as total_performance_adj,
        COALESCE(a.referral_reward_adj, 0) as referral_reward_adj,
        COALESCE(a.team_reward_adj, 0) as team_reward_adj,
        a.notes,
        a.updated_by,
        a.updated_at as adj_updated_at
      FROM user_balances u
      LEFT JOIN user_invite_adjustments a ON u.wallet_address COLLATE utf8mb4_unicode_ci = a.wallet_address COLLATE utf8mb4_unicode_ci
      WHERE ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    
    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('搜索用户邀请统计失败:', error.message);
    res.status(500).json({ success: false, message: '搜索失败: ' + error.message });
  }
});

/**
 * Get single user's invite stats (real + adjustments)
 * GET /api/admin/invite-stats/:wallet_address
 */
router.get('/invite-stats/:wallet_address', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const walletAddr = wallet_address.toLowerCase();
    
    // Get real stats from various tables
    // Direct members count
    const directResult = await dbQuery(
      'SELECT COUNT(*) as count FROM user_referrals WHERE referrer_address = ?',
      [walletAddr]
    );
    const realDirectMembers = parseInt(directResult[0]?.count) || 0;
    
    // Team members (simplified - 8 levels)
    let teamMembers = realDirectMembers;
    let currentLevelWallets = [walletAddr];
    const level1Result = await dbQuery(
      'SELECT wallet_address FROM user_referrals WHERE referrer_address = ?',
      [walletAddr]
    );
    let allTeamWallets = level1Result.map(r => r.wallet_address);
    currentLevelWallets = [...allTeamWallets];
    
    for (let level = 2; level <= 8; level++) {
      if (currentLevelWallets.length === 0) break;
      const placeholders = currentLevelWallets.map(() => '?').join(',');
      const levelResult = await dbQuery(
        `SELECT wallet_address FROM user_referrals WHERE referrer_address IN (${placeholders})`,
        currentLevelWallets
      );
      currentLevelWallets = levelResult.map(r => r.wallet_address);
      allTeamWallets = allTeamWallets.concat(currentLevelWallets);
      teamMembers += currentLevelWallets.length;
    }
    
    // Total recharge
    let totalRecharge = 0;
    if (allTeamWallets.length > 0) {
      const placeholders = allTeamWallets.map(() => '?').join(',');
      const rechargeResult = await dbQuery(
        `SELECT COALESCE(SUM(amount), 0) as total FROM deposit_records 
         WHERE wallet_address IN (${placeholders}) AND status = 'completed'`,
        allTeamWallets
      );
      totalRecharge = parseFloat(rechargeResult[0]?.total) || 0;
    }
    
    // Total withdrawals
    let totalWithdrawals = 0;
    if (allTeamWallets.length > 0) {
      const placeholders = allTeamWallets.map(() => '?').join(',');
      const withdrawResult = await dbQuery(
        `SELECT COALESCE(SUM(amount), 0) as total FROM withdraw_records 
         WHERE wallet_address IN (${placeholders}) AND status = 'completed'`,
        allTeamWallets
      );
      totalWithdrawals = parseFloat(withdrawResult[0]?.total) || 0;
    }
    
    // Referral reward
    const referralResult = await dbQuery(
      'SELECT COALESCE(SUM(reward_amount), 0) as total FROM referral_rewards WHERE wallet_address = ?',
      [walletAddr]
    );
    const totalReferralReward = parseFloat(referralResult[0]?.total) || 0;
    
    // Team reward
    const teamRewardResult = await dbQuery(
      'SELECT COALESCE(SUM(reward_amount), 0) as total FROM team_rewards WHERE wallet_address = ?',
      [walletAddr]
    );
    const totalTeamReward = parseFloat(teamRewardResult[0]?.total) || 0;
    
    // Today's daily income
    let teamDailyIncome = 0;
    if (allTeamWallets.length > 0) {
      const placeholders = allTeamWallets.map(() => '?').join(',');
      const dailyResult = await dbQuery(
        `SELECT COALESCE(SUM(earning_amount), 0) as total
         FROM robot_earnings WHERE wallet_address IN (${placeholders}) AND DATE(created_at) = CURDATE()`,
        allTeamWallets
      );
      teamDailyIncome = parseFloat(dailyResult[0]?.total) || 0;
    }
    // Add user's own earnings + rewards
    const myDailyResult = await dbQuery(`
      SELECT 
        (SELECT COALESCE(SUM(earning_amount), 0) FROM robot_earnings WHERE wallet_address = ? AND DATE(created_at) = CURDATE()) +
        (SELECT COALESCE(SUM(reward_amount), 0) FROM referral_rewards WHERE wallet_address = ? AND DATE(created_at) = CURDATE()) +
        (SELECT COALESCE(SUM(reward_amount), 0) FROM team_rewards WHERE wallet_address = ? AND DATE(created_at) = CURDATE()) as total
    `, [walletAddr, walletAddr, walletAddr]);
    teamDailyIncome += parseFloat(myDailyResult[0]?.total) || 0;
    
    // Get adjustments
    const adjResult = await dbQuery(
      'SELECT * FROM user_invite_adjustments WHERE wallet_address = ?',
      [walletAddr]
    );
    const adjustments = adjResult[0] || {};
    
    res.json({
      success: true,
      data: {
        wallet_address: walletAddr,
        real_stats: {
          daily_income: teamDailyIncome,
          team_members: teamMembers,
          total_recharge: totalRecharge,
          direct_members: realDirectMembers,
          total_withdrawals: totalWithdrawals,
          total_performance: totalRecharge,
          referral_reward: totalReferralReward,
          team_reward: totalTeamReward
        },
        adjustments: {
          daily_income_adj: parseFloat(adjustments.daily_income_adj) || 0,
          team_members_adj: parseInt(adjustments.team_members_adj) || 0,
          total_recharge_adj: parseFloat(adjustments.total_recharge_adj) || 0,
          direct_members_adj: parseInt(adjustments.direct_members_adj) || 0,
          total_withdrawals_adj: parseFloat(adjustments.total_withdrawals_adj) || 0,
          total_performance_adj: parseFloat(adjustments.total_performance_adj) || 0,
          referral_reward_adj: parseFloat(adjustments.referral_reward_adj) || 0,
          team_reward_adj: parseFloat(adjustments.team_reward_adj) || 0,
          notes: adjustments.notes || '',
          updated_by: adjustments.updated_by || '',
          updated_at: adjustments.updated_at || null
        },
        display_stats: {
          daily_income: teamDailyIncome + (parseFloat(adjustments.daily_income_adj) || 0),
          team_members: teamMembers + (parseInt(adjustments.team_members_adj) || 0),
          total_recharge: totalRecharge + (parseFloat(adjustments.total_recharge_adj) || 0),
          direct_members: realDirectMembers + (parseInt(adjustments.direct_members_adj) || 0),
          total_withdrawals: totalWithdrawals + (parseFloat(adjustments.total_withdrawals_adj) || 0),
          total_performance: totalRecharge + (parseFloat(adjustments.total_performance_adj) || 0),
          referral_reward: totalReferralReward + (parseFloat(adjustments.referral_reward_adj) || 0),
          team_reward: totalTeamReward + (parseFloat(adjustments.team_reward_adj) || 0)
        }
      }
    });
  } catch (error) {
    console.error('获取用户邀请统计失败:', error.message);
    res.status(500).json({ success: false, message: '获取失败: ' + error.message });
  }
});

/**
 * Update user's invite stats adjustments
 * PUT /api/admin/invite-stats/:wallet_address
 */
router.put('/invite-stats/:wallet_address', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const walletAddr = wallet_address.toLowerCase();
    const adminUser = req.admin?.username || 'unknown';
    
    const {
      daily_income_adj = 0,
      team_members_adj = 0,
      total_recharge_adj = 0,
      direct_members_adj = 0,
      total_withdrawals_adj = 0,
      total_performance_adj = 0,
      referral_reward_adj = 0,
      team_reward_adj = 0,
      notes = ''
    } = req.body;
    
    // Validate user exists
    const userExists = await dbQuery(
      'SELECT wallet_address FROM users WHERE wallet_address = ?',
      [walletAddr]
    );
    
    if (!userExists || userExists.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // Upsert adjustments
    await dbQuery(`
      INSERT INTO user_invite_adjustments 
        (wallet_address, daily_income_adj, team_members_adj, total_recharge_adj, 
         direct_members_adj, total_withdrawals_adj, total_performance_adj,
         referral_reward_adj, team_reward_adj, notes, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        daily_income_adj = VALUES(daily_income_adj),
        team_members_adj = VALUES(team_members_adj),
        total_recharge_adj = VALUES(total_recharge_adj),
        direct_members_adj = VALUES(direct_members_adj),
        total_withdrawals_adj = VALUES(total_withdrawals_adj),
        total_performance_adj = VALUES(total_performance_adj),
        referral_reward_adj = VALUES(referral_reward_adj),
        team_reward_adj = VALUES(team_reward_adj),
        notes = VALUES(notes),
        updated_by = VALUES(updated_by)
    `, [
      walletAddr,
      parseFloat(daily_income_adj) || 0,
      parseInt(team_members_adj) || 0,
      parseFloat(total_recharge_adj) || 0,
      parseInt(direct_members_adj) || 0,
      parseFloat(total_withdrawals_adj) || 0,
      parseFloat(total_performance_adj) || 0,
      parseFloat(referral_reward_adj) || 0,
      parseFloat(team_reward_adj) || 0,
      notes,
      adminUser
    ]);
    
    secureLog('info', '更新用户邀请统计调整', {
      admin: adminUser,
      wallet: walletAddr,
      adjustments: req.body
    });
    
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('更新用户邀请统计调整失败:', error.message);
    res.status(500).json({ success: false, message: '更新失败: ' + error.message });
  }
});

/**
 * Get list of all users with adjustments
 * GET /api/admin/invite-stats/adjusted-users
 */
router.get('/invite-stats-adjusted', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Count users with non-zero adjustments
    const countResult = await dbQuery(`
      SELECT COUNT(*) as total FROM user_invite_adjustments 
      WHERE daily_income_adj != 0 OR team_members_adj != 0 OR total_recharge_adj != 0 
         OR direct_members_adj != 0 OR total_withdrawals_adj != 0 OR total_performance_adj != 0
         OR referral_reward_adj != 0 OR team_reward_adj != 0
    `);
    const total = countResult[0]?.total || 0;
    
    // Get adjusted users
    const users = await dbQuery(`
      SELECT * FROM user_invite_adjustments 
      WHERE daily_income_adj != 0 OR team_members_adj != 0 OR total_recharge_adj != 0 
         OR direct_members_adj != 0 OR total_withdrawals_adj != 0 OR total_performance_adj != 0
         OR referral_reward_adj != 0 OR team_reward_adj != 0
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limit), offset]);
    
    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('获取调整用户列表失败:', error.message);
    res.status(500).json({ success: false, message: '获取失败: ' + error.message });
  }
});



export default router;
