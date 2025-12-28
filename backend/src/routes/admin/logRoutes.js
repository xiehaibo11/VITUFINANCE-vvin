/**
 * Admin Routes - Logs Module
 * Handles: System logs, user behaviors, referral conversions
 */
import { express, dbQuery, authMiddleware } from './shared.js';

const router = express.Router();

// ==================== System Logs & User Behaviors ====================

router.get('/logs', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, level, action, ip, start_time, end_time } = req.query;
    
    // 使用模拟数据（实际应该从日志表或日志文件读取）
    const mockList = generateLogMockData(parseInt(pageSize));
    
    res.json({
      success: true,
      data: {
        list: mockList,
        total: 500,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取系统日志失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取系统日志失败'
    });
  }
});

// ==================== 用户行为记录 ====================

/**
 * 获取用户行为记录统计
 * GET /api/admin/user-behaviors/stats
 */
router.get('/user-behaviors/stats', authMiddleware, async (req, res) => {
  try {
    // 总访问量
    const totalResult = await dbQuery(
      `SELECT COUNT(*) as count FROM user_behaviors`
    );
    
    // 今日访问量
    const todayResult = await dbQuery(
      `SELECT COUNT(*) as count FROM user_behaviors WHERE DATE(created_at) = CURDATE()`
    );
    
    // 独立访客数
    const uniqueResult = await dbQuery(
      `SELECT COUNT(DISTINCT COALESCE(wallet_address, ip_address)) as count FROM user_behaviors`
    );
    
    // 通过推荐链接访问的数量
    const referralResult = await dbQuery(
      `SELECT COUNT(*) as count FROM user_behaviors WHERE referral_code IS NOT NULL`
    );
    
    res.json({
      success: true,
      data: {
        totalVisits: totalResult?.[0]?.count || 0,
        todayVisits: todayResult?.[0]?.count || 0,
        uniqueVisitors: uniqueResult?.[0]?.count || 0,
        referralVisits: referralResult?.[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('获取用户行为统计失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取统计失败'
    });
  }
});

/**
 * 获取用户行为记录列表
 * GET /api/admin/user-behaviors
 */
router.get('/user-behaviors', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, wallet_address, referral_code, action_type, start_date, end_date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let whereConditions = [];
    const params = [];
    
    if (wallet_address) {
      whereConditions.push('wallet_address LIKE ?');
      params.push(`%${wallet_address}%`);
    }
    
    if (referral_code) {
      whereConditions.push('referral_code = ?');
      params.push(referral_code);
    }
    
    if (action_type) {
      whereConditions.push('action_type = ?');
      params.push(action_type);
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
      `SELECT COUNT(*) as total FROM user_behaviors ${whereClause}`,
      params
    );
    
    // 获取列表
    const list = await dbQuery(
      `SELECT * FROM user_behaviors ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
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
    console.error('获取用户行为记录失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取记录失败'
    });
  }
});

/**
 * 获取推荐转化统计
 * GET /api/admin/referral-conversions
 * 
 * 统计每个推荐人的转化漏斗：
 * - 推荐注册数（连接钱包）
 * - 充值人数
 * - 购买机器人人数
 * - 总充值金额
 * - 总投资金额
 */
router.get('/referral-conversions', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    // 从 user_referrals 表获取每个推荐人的转化统计
    const list = await dbQuery(`
      SELECT 
        ur.referrer_address,
        UPPER(RIGHT(ur.referrer_address, 8)) as referral_code,
        COUNT(DISTINCT ur.wallet_address) as registered_users,
        COUNT(DISTINCT CASE WHEN d.wallet_address IS NOT NULL THEN ur.wallet_address END) as deposited_users,
        COUNT(DISTINCT CASE WHEN r.wallet_address IS NOT NULL THEN ur.wallet_address END) as purchased_users,
        COALESCE(SUM(d.total_deposit), 0) as total_deposits,
        COALESCE(SUM(r.total_investment), 0) as total_investment,
        COALESCE(SUM(rr.total_rewards), 0) as total_rewards_earned
      FROM user_referrals ur
      LEFT JOIN (
        SELECT wallet_address, SUM(amount) as total_deposit 
        FROM deposit_records 
        WHERE status = 'completed' 
        GROUP BY wallet_address
      ) d ON d.wallet_address = ur.wallet_address
      LEFT JOIN (
        SELECT wallet_address, SUM(price) as total_investment
        FROM robot_purchases 
        GROUP BY wallet_address
      ) r ON r.wallet_address = ur.wallet_address
      LEFT JOIN (
        SELECT wallet_address, SUM(reward_amount) as total_rewards
        FROM referral_rewards
        GROUP BY wallet_address
      ) rr ON rr.wallet_address = ur.referrer_address
      GROUP BY ur.referrer_address
      ORDER BY registered_users DESC, total_deposits DESC
      LIMIT ? OFFSET ?
    `, [parseInt(pageSize), offset]);
    
    // 计算转化率
    const formattedList = list.map(item => ({
      ...item,
      referral_code: item.referral_code || '',
      deposit_rate: item.registered_users > 0 
        ? ((item.deposited_users / item.registered_users) * 100).toFixed(1) + '%' 
        : '0%',
      purchase_rate: item.registered_users > 0 
        ? ((item.purchased_users / item.registered_users) * 100).toFixed(1) + '%' 
        : '0%',
      total_deposits: parseFloat(item.total_deposits || 0).toFixed(2),
      total_investment: parseFloat(item.total_investment || 0).toFixed(2),
      total_rewards_earned: parseFloat(item.total_rewards_earned || 0).toFixed(4)
    }));
    
    // 获取总数
    const countResult = await dbQuery(`
      SELECT COUNT(DISTINCT referrer_address) as total FROM user_referrals
    `);
    
    res.json({
      success: true,
      data: {
        list: formattedList,
        total: countResult?.[0]?.total || 0,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取推荐转化统计失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取统计失败'
    });
  }
});



export default router;
