/**
 * Admin Routes - Copy Trading Management Module
 * Handles: Follow stats, list
 */
import { express, dbQuery, authMiddleware } from './shared.js';

const router = express.Router();

// ==================== Copy Trading Management ====================

router.get('/follows/stats', authMiddleware, async (req, res) => {
  try {
    // 获取跟单总投资
    const totalResult = await dbQuery(
      `SELECT COALESCE(SUM(price), 0) as total FROM robot_purchases WHERE robot_type IN ('grid', 'high')`
    );
    
    // 获取活跃跟单者数量
    const activeResult = await dbQuery(
      `SELECT COUNT(DISTINCT wallet_address) as count FROM robot_purchases WHERE robot_type IN ('grid', 'high') AND status = 'active'`
    );
    
    // 获取总预期收益
    const profitResult = await dbQuery(
      `SELECT COALESCE(SUM(expected_return), 0) as total FROM robot_purchases WHERE robot_type IN ('grid', 'high')`
    );
    
    // 计算平均收益率
    const totalInvestment = parseFloat(totalResult?.[0]?.total || 0);
    const totalProfit = parseFloat(profitResult?.[0]?.total || 0);
    const profitRate = totalInvestment > 0 ? ((totalProfit / totalInvestment) * 100).toFixed(2) : 0;
    
    res.json({
      success: true,
      data: {
        totalInvestment: totalInvestment.toFixed(2),
        activeFollowers: activeResult?.[0]?.count || 0,
        totalProfit: totalProfit.toFixed(2),
        profitRate: parseFloat(profitRate)
      }
    });
  } catch (error) {
    console.error('获取跟单统计失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取跟单统计失败'
    });
  }
});

/**
 * 获取跟单列表
 * GET /api/admin/follows
 * 
 * 跟单数据来自 robot_purchases 表中 robot_type 为 'grid' 或 'high' 的记录
 */
router.get('/follows', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, wallet_address, follow_type, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let whereConditions = ["robot_type IN ('grid', 'high')"];
    const params = [];
    
    if (wallet_address) {
      whereConditions.push('wallet_address LIKE ?');
      params.push(`%${wallet_address}%`);
    }
    
    if (follow_type) {
      whereConditions.push('robot_type = ?');
      params.push(follow_type);
    }
    
    if (status) {
      whereConditions.push('status = ?');
      params.push(status);
    }
    
    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
    
    // 获取总数
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM robot_purchases ${whereClause}`,
      params
    );
    
    // 获取列表，按创建时间（购买时间）降序排列
    const rawList = await dbQuery(
      `SELECT id, wallet_address, robot_type, robot_name, 
              price, expected_return, total_profit,
              status, daily_profit, start_date, end_date, updated_at,
              is_quantified, created_at
       FROM robot_purchases 
       ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    
    // 在JavaScript中计算当前价值和收益，确保数据正确
    const list = rawList.map(row => {
      const price = parseFloat(row.price) || 0;
      const expectedReturn = parseFloat(row.expected_return) || 0;
      const totalProfit = parseFloat(row.total_profit) || 0;
      
      let currentValue, profit, profitRate;
      
      if (row.robot_type === 'high') {
        // High机器人：使用expected_return
        currentValue = expectedReturn > 0 ? expectedReturn : price;
        profit = currentValue - price;
      } else {
        // Grid机器人：使用 price + total_profit
        currentValue = price + totalProfit;
        profit = totalProfit;
      }
      
      // 计算收益率
      profitRate = price > 0 ? ((profit / price) * 100).toFixed(2) : '0.00';
      
      return {
        id: row.id,
        wallet_address: row.wallet_address,
        follow_type: row.robot_type,
        trader_name: row.robot_name,
        investment: price.toFixed(2),
        current_value: currentValue.toFixed(2),
        profit: profit.toFixed(2),
        profit_rate: parseFloat(profitRate),
        status: row.status,
        daily_profit: row.daily_profit,
        created_at: row.start_date,
        updated_at: row.updated_at,
        is_quantified: row.is_quantified
      };
    });
    
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
    console.error('获取跟单列表失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取跟单列表失败'
    });
  }
});



export default router;
