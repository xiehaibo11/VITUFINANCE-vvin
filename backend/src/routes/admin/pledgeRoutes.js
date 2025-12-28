/**
 * Admin Routes - Pledge Management Module
 * Handles: Pledge stats, list, cancel
 */
import { express, dbQuery, authMiddleware, secureLog } from './shared.js';

const router = express.Router();

// ==================== Pledge Management ====================

router.get('/pledges/stats', authMiddleware, async (req, res) => {
  try {
    // 从数据库获取真实质押统计
    const totalResult = await dbQuery(
      'SELECT COALESCE(SUM(amount), 0) as total FROM user_pledges'
    );
    
    const activeResult = await dbQuery(
      'SELECT COUNT(*) as count FROM user_pledges WHERE status = "active"'
    );
    
    const expiringResult = await dbQuery(
      'SELECT COUNT(*) as count FROM user_pledges WHERE status = "active" AND end_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)'
    );
    
    const completedResult = await dbQuery(
      'SELECT COUNT(*) as count FROM user_pledges WHERE status IN ("completed", "expired")'
    );
    
    res.json({
      success: true,
      data: {
        totalPledge: parseFloat(totalResult?.[0]?.total || 0).toFixed(2),
        activePledges: activeResult?.[0]?.count || 0,
        expiringSoon: expiringResult?.[0]?.count || 0,
        completedPledges: completedResult?.[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('获取质押统计失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取质押统计失败'
    });
  }
});

/**
 * 获取质押列表
 * GET /api/admin/pledges
 */
router.get('/pledges', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, wallet_address, status, product } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let whereConditions = [];
    const params = [];
    
    if (wallet_address) {
      whereConditions.push('up.wallet_address LIKE ?');
      params.push(`%${wallet_address}%`);
    }
    
    if (status) {
      whereConditions.push('up.status = ?');
      params.push(status);
    }
    
    if (product) {
      whereConditions.push('pp.name LIKE ?');
      params.push(`%${product}%`);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // 获取总数
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM user_pledges up 
       LEFT JOIN pledge_products pp ON up.product_id = pp.id 
       ${whereClause}`,
      params
    );
    
    // 获取列表
    const list = await dbQuery(
      `SELECT up.*, pp.name as product_name, pp.income as apr, 
              (up.amount * pp.daily_rate / 100 * DATEDIFF(up.end_date, up.start_date)) as expected_reward
       FROM user_pledges up 
       LEFT JOIN pledge_products pp ON up.product_id = pp.id 
       ${whereClause} 
       ORDER BY up.created_at DESC 
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
    console.error('获取质押列表失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取质押列表失败'
    });
  }
});

/**
 * 取消质押
 * POST /api/admin/pledges/:id/cancel
 */
router.post('/pledges/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 获取质押记录
    const pledge = await dbQuery('SELECT * FROM user_pledges WHERE id = ?', [id]);
    
    if (!pledge) {
      return res.status(404).json({
        success: false,
        message: '质押记录不存在'
      });
    }
    
    // 更新质押状态为已取消
    await dbQuery(
      'UPDATE user_pledges SET status = "cancelled", updated_at = NOW() WHERE id = ?',
      [id]
    );
    
    // 退回WLD余额
    await dbQuery(
      'UPDATE user_balances SET wld_balance = wld_balance + ? WHERE wallet_address = ?',
      [pledge.amount, pledge.wallet_address]
    );
    
    console.log(`[Admin] 取消质押: ${id}, 退回 ${pledge.amount} WLD 到 ${pledge.wallet_address}`);
    
    res.json({
      success: true,
      message: '质押已取消，资金已退回'
    });
  } catch (error) {
    console.error('取消质押失败:', error.message);
    res.status(500).json({
      success: false,
      message: '取消质押失败'
    });
  }
});



export default router;
