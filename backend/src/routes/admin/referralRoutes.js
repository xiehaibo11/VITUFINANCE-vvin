/**
 * Admin Routes - Referral Management Module
 * Handles: Referral stats, list, hierarchy, bind, preview
 */
import { express, dbQuery, authMiddleware, secureLog, MIN_ROBOT_PURCHASE } from './shared.js';

const router = express.Router();

// ==================== Referral Management ====================

router.get('/referrals/stats', authMiddleware, async (req, res) => {
  try {
    // 推荐人总数（有发起推荐的用户数）
    const referrersResult = await dbQuery(
      `SELECT COUNT(DISTINCT referrer_address) as count FROM user_referrals`
    );
    
    // 被推荐人总数
    const referredResult = await dbQuery(
      `SELECT COUNT(*) as count FROM user_referrals`
    );
    
    // 累计推荐奖励
    const rewardsResult = await dbQuery(
      `SELECT COALESCE(SUM(reward_amount), 0) as total FROM referral_rewards`
    );
    
    // 今日新增推荐
    const todayResult = await dbQuery(
      `SELECT COUNT(*) as count FROM user_referrals WHERE DATE(created_at) = CURDATE()`
    );
    
    res.json({
      success: true,
      data: {
        totalReferrers: referrersResult[0]?.count || 0,
        totalReferred: referredResult[0]?.count || 0,
        totalRewards: parseFloat(rewardsResult[0]?.total || 0).toFixed(4),
        todayNew: todayResult[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('获取推荐统计失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取统计失败'
    });
  }
});

/**
 * 获取推荐关系列表
 * GET /api/admin/referrals
 */
router.get('/referrals', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, wallet_address, referrer_address } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let whereConditions = [];
    const params = [];
    
    if (wallet_address) {
      whereConditions.push('ur.wallet_address LIKE ?');
      params.push(`%${wallet_address}%`);
    }
    
    if (referrer_address) {
      whereConditions.push('ur.referrer_address LIKE ?');
      params.push(`%${referrer_address}%`);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // 获取总数
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM user_referrals ur ${whereClause}`,
      params
    );
    
    // 获取列表，包含计算字段
    // 修正：使用 referral_rewards 表的实际奖励数据，而非硬编码比例
    const list = await dbQuery(
      `SELECT 
        ur.id,
        ur.wallet_address,
        ur.referrer_address,
        ur.referrer_code,
        ur.created_at,
        UPPER(RIGHT(ur.wallet_address, 8)) as referral_code,
        (SELECT COUNT(*) FROM user_referrals WHERE referrer_address = ur.wallet_address) as referral_count,
        COALESCE((SELECT SUM(reward_amount) FROM referral_rewards 
                  WHERE referrer_address = ur.wallet_address), 0) as total_reward,
        COALESCE((SELECT broker_level FROM team_rewards 
                  WHERE wallet_address = ur.wallet_address 
                  ORDER BY created_at DESC LIMIT 1), 0) as level
       FROM user_referrals ur
       ${whereClause} 
       ORDER BY ur.created_at DESC 
       LIMIT ? OFFSET ?`,
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
    console.error('获取推荐关系失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取推荐关系失败'
    });
  }
});

/**
 * 查询用户的上下级关系（详细视图）
 * GET /api/admin/referrals/hierarchy?wallet_address=0x...
 * 
 * 返回：
 * - target: 目标用户信息
 * - referrer: 推荐人信息（上级）
 * - direct_members: 直推成员列表（下级）
 */
router.get('/referrals/hierarchy', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.query;
    
    if (!wallet_address) {
      return res.status(400).json({
        success: false,
        message: '请提供钱包地址'
      });
    }
    
    const walletAddr = wallet_address.toLowerCase();
    
    // 1. 获取目标用户信息
    const targetUser = await dbQuery(
      `SELECT 
        ub.wallet_address,
        ub.usdt_balance,
        ub.wld_balance,
        ub.total_deposit,
        ub.total_withdraw,
        ub.created_at,
        UPPER(RIGHT(ub.wallet_address, 8)) as referral_code
       FROM user_balances ub
       WHERE ub.wallet_address = ?`,
      [walletAddr]
    );
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 2. 获取目标用户的推荐人（上级）
    const referralInfo = await dbQuery(
      `SELECT 
        ur.referrer_address,
        ur.referrer_code,
        ur.created_at as bindTime
       FROM user_referrals ur
       WHERE ur.wallet_address = ?`,
      [walletAddr]
    );
    
    let referrer = null;
    if (referralInfo && referralInfo.referrer_address) {
      // 获取推荐人详细信息
      const referrerDetails = await dbQuery(
        `SELECT 
          ub.wallet_address,
          ub.usdt_balance,
          ub.total_deposit,
          ub.created_at,
          UPPER(RIGHT(ub.wallet_address, 8)) as referral_code,
          (SELECT COUNT(*) FROM user_referrals WHERE referrer_address = ub.wallet_address) as direct_count,
          COALESCE((SELECT SUM(reward_amount) FROM referral_rewards WHERE wallet_address = ub.wallet_address), 0) as total_reward
         FROM user_balances ub
         WHERE ub.wallet_address = ?`,
        [referralInfo.referrer_address]
      );
      
      if (referrerDetails) {
        referrer = {
          ...referrerDetails,
          bindTime: referralInfo.bindTime
        };
      }
    }
    
    // 3. 获取目标用户的直推成员（下级）
    const directMembers = await dbQuery(
      `SELECT 
        ur.wallet_address,
        ur.created_at as bindTime,
        UPPER(RIGHT(ur.wallet_address, 8)) as referral_code,
        ub.usdt_balance,
        ub.total_deposit,
        ub.created_at as registerTime,
        (SELECT COUNT(*) FROM user_referrals WHERE referrer_address = ur.wallet_address) as sub_count,
        (SELECT COUNT(*) FROM robot_purchases WHERE wallet_address = ur.wallet_address AND status = 'active') as robot_count,
        COALESCE((SELECT SUM(price) FROM robot_purchases WHERE wallet_address = ur.wallet_address), 0) as total_investment
       FROM user_referrals ur
       LEFT JOIN user_balances ub ON ur.wallet_address = ub.wallet_address
       WHERE ur.referrer_address = ?
       ORDER BY ur.created_at DESC`,
      [walletAddr]
    );
    
    // 4. 计算统计数据
    const directCount = directMembers.length;
    
    // 获取该用户的总推荐奖励
    const rewardResult = await dbQuery(
      `SELECT COALESCE(SUM(reward_amount), 0) as total FROM referral_rewards WHERE wallet_address = ?`,
      [walletAddr]
    );
    const totalReward = parseFloat(rewardResult?.total) || 0;
    
    // 获取该用户购买的机器人
    const robotResult = await dbQuery(
      `SELECT COUNT(*) as count, COALESCE(SUM(price), 0) as total FROM robot_purchases WHERE wallet_address = ? AND status = 'active'`,
      [walletAddr]
    );
    
    res.json({
      success: true,
      data: {
        target: {
          ...targetUser,
          direct_count: directCount,
          total_reward: totalReward.toFixed(4),
          robot_count: robotResult?.[0]?.count || 0,
          total_investment: parseFloat(robotResult?.[0]?.total || 0).toFixed(4)
        },
        referrer: referrer,
        direct_members: directMembers
      }
    });
  } catch (error) {
    console.error('获取用户上下级关系失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取用户上下级关系失败'
    });
  }
});

/**
 * 手动绑定推荐关系
 * POST /api/admin/referrals/bind
 * body: { wallet_address, referrer_address, retroactive_reward }
 * 
 * 用于管理员手动修复遗漏的推荐关系
 * retroactive_reward: 是否补发历史奖励
 */
router.post('/referrals/bind', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, referrer_address, retroactive_reward = false } = req.body;
    
    console.log('[Admin Bind] Request:', { wallet_address, referrer_address, retroactive_reward });
    
    if (!wallet_address || !referrer_address) {
      console.log('[Admin Bind] Error: Missing required fields');
      return res.status(400).json({
        success: false,
        message: '请提供用户钱包地址和推荐人地址'
      });
    }
    
    const walletAddr = wallet_address.toLowerCase();
    const referrerAddr = referrer_address.toLowerCase();
    
    // 检查用户是否存在 - 如果不存在则自动创建
    let userExists = await dbQuery(
      'SELECT wallet_address FROM user_balances WHERE wallet_address = ?',
      [walletAddr]
    );
    
    if (!userExists || userExists.length === 0) {
      // 自动创建用户记录
      console.log('[Admin Bind] User not found, creating:', walletAddr);
      await dbQuery(
        'INSERT INTO user_balances (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, created_at, updated_at) VALUES (?, 0, 0, 0, 0, NOW(), NOW())',
        [walletAddr]
      );
      userExists = [{ wallet_address: walletAddr }];
    }
    
    // 检查推荐人是否存在 - 如果不存在则自动创建
    let referrerExists = await dbQuery(
      'SELECT wallet_address FROM user_balances WHERE wallet_address = ?',
      [referrerAddr]
    );
    
    if (!referrerExists || referrerExists.length === 0) {
      // 自动创建推荐人记录
      console.log('[Admin Bind] Referrer not found, creating:', referrerAddr);
      await dbQuery(
        'INSERT INTO user_balances (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, created_at, updated_at) VALUES (?, 0, 0, 0, 0, NOW(), NOW())',
        [referrerAddr]
      );
      referrerExists = [{ wallet_address: referrerAddr }];
    }
    
    // 不能自己推荐自己
    if (walletAddr === referrerAddr) {
      return res.status(400).json({
        success: false,
        message: '不能自己推荐自己'
      });
    }
    
    // 检查是否已有推荐关系
    const existingRef = await dbQuery(
      'SELECT id, referrer_address FROM user_referrals WHERE wallet_address = ?',
      [walletAddr]
    );
    
    // existingRef is an array, check if it has items and if referrer_address is not null
    if (existingRef && existingRef.length > 0 && existingRef[0].referrer_address) {
      return res.status(400).json({
        success: false,
        message: `该用户已有推荐人: ${existingRef[0].referrer_address.slice(-10)}`
      });
    }
    
    // 生成推荐码（推荐人地址后8位）
    const referrerCode = referrerAddr.slice(-8).toLowerCase();
    
    // 插入或更新推荐关系
    if (existingRef && existingRef.length > 0) {
      // 记录已存在但没有推荐人，更新记录
      await dbQuery(
        'UPDATE user_referrals SET referrer_address = ?, referrer_code = ? WHERE wallet_address = ?',
        [referrerAddr, referrerCode, walletAddr]
      );
    } else {
      // 记录不存在，插入新记录
      await dbQuery(
        'INSERT INTO user_referrals (wallet_address, referrer_address, referrer_code, created_at) VALUES (?, ?, ?, NOW())',
        [walletAddr, referrerAddr, referrerCode]
      );
    }
    
    console.log(`[Admin] 手动绑定推荐关系: ${walletAddr.slice(-10)} -> ${referrerAddr.slice(-10)}`);
    
    // 如果需要补发历史奖励
    let retroactiveAmount = 0;
    if (retroactive_reward) {
      // 查询该用户过去所有的量化收益
      const quantifyLogs = await dbQuery(
        'SELECT id, robot_purchase_id, robot_name, earnings FROM robot_quantify_logs WHERE wallet_address = ?',
        [walletAddr]
      );
      
      if (quantifyLogs.length > 0) {
        // 推荐奖励比例：1级30%
        const rewardRate = 0.30;
        
        for (const log of quantifyLogs) {
          const earnings = parseFloat(log.earnings) || 0;
          if (earnings > 0) {
            const rewardAmount = earnings * rewardRate;
            retroactiveAmount += rewardAmount;
            
            // 记录补发的推荐奖励
            await dbQuery(
              `INSERT INTO referral_rewards 
              (wallet_address, from_wallet, level, reward_rate, reward_amount, source_type, source_id, robot_name, source_amount, created_at) 
              VALUES (?, ?, 1, 30, ?, 'retroactive', ?, ?, ?, NOW())`,
              [referrerAddr, walletAddr, rewardAmount, log.robot_purchase_id, log.robot_name || 'Unknown', earnings]
            );
          }
        }
        
        // 增加推荐人余额
        if (retroactiveAmount > 0) {
          await dbQuery(
            'UPDATE user_balances SET usdt_balance = usdt_balance + ?, updated_at = NOW() WHERE wallet_address = ?',
            [retroactiveAmount, referrerAddr]
          );
          
          console.log(`[Admin] 补发推荐奖励: ${retroactiveAmount.toFixed(4)} USDT -> ${referrerAddr.slice(-10)}`);
        }
      }
    }
    
    res.json({
      success: true,
      message: retroactive_reward 
        ? `推荐关系绑定成功，已补发奖励 ${retroactiveAmount.toFixed(4)} USDT` 
        : '推荐关系绑定成功',
      data: {
        retroactive_amount: retroactiveAmount.toFixed(4)
      }
    });
  } catch (error) {
    console.error('绑定推荐关系失败:', error.message);
    res.status(500).json({
      success: false,
      message: '绑定失败: ' + error.message
    });
  }
});

/**
 * 预览补发奖励金额
 * GET /api/admin/referrals/preview-retroactive?wallet_address=0x...
 * 
 * 查询如果绑定该用户，可以补发多少奖励
 */
router.get('/referrals/preview-retroactive', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.query;
    
    if (!wallet_address) {
      return res.status(400).json({
        success: false,
        message: '请提供用户钱包地址'
      });
    }
    
    const walletAddr = wallet_address.toLowerCase();
    
    // 查询该用户过去所有的量化收益
    const quantifyLogs = await dbQuery(
      'SELECT SUM(earnings) as total_earnings, COUNT(*) as count FROM robot_quantify_logs WHERE wallet_address = ?',
      [walletAddr]
    );
    
    const totalEarnings = parseFloat(quantifyLogs[0]?.total_earnings) || 0;
    const quantifyCount = parseInt(quantifyLogs[0]?.count) || 0;
    
    // 查询该用户购买的机器人
    const robotInfo = await dbQuery(
      'SELECT COUNT(*) as count, COALESCE(SUM(price), 0) as total FROM robot_purchases WHERE wallet_address = ?',
      [walletAddr]
    );
    
    // 计算可补发的奖励（1级30%）
    const retroactiveReward = totalEarnings * 0.30;
    
    res.json({
      success: true,
      data: {
        wallet_address: walletAddr,
        robot_count: robotInfo?.count || 0,
        total_investment: parseFloat(robotInfo?.total || 0).toFixed(4),
        quantify_count: quantifyCount,
        total_earnings: totalEarnings.toFixed(4),
        retroactive_reward: retroactiveReward.toFixed(4),
        reward_rate: '30%'
      }
    });
  } catch (error) {
    console.error('预览补发奖励失败:', error.message);
    res.status(500).json({
      success: false,
      message: '查询失败'
    });
  }
});



export default router;
