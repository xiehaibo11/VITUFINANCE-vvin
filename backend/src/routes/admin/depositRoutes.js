/**
 * Admin Routes - Deposit Records Module
 * Handles: Deposit list, stats, status update, scan trigger
 */
import { 
  express, 
  dbQuery, 
  authMiddleware,
  secureLog
} from './shared.js';

const router = express.Router();

// ==================== Deposit Records ====================

router.get('/deposits/latest-id', authMiddleware, async (req, res) => {
  try {
    const result = await dbQuery('SELECT MAX(id) as lastId FROM deposit_records');
    res.json({
      success: true,
      data: {
        lastId: result?.lastId || 0
      }
    });
  } catch (error) {
    console.error('获取最后充值ID失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取失败'
    });
  }
});

/**
 * 检查新充值（用于实时通知）
 * GET /api/admin/deposits/check-new?last_id=xxx
 */
router.get('/deposits/check-new', authMiddleware, async (req, res) => {
  try {
    const { last_id = 0 } = req.query;
    const lastId = parseInt(last_id);
    
    // 查询新充值数量和最新记录
    const newDeposits = await dbQuery(
      `SELECT * FROM deposit_records WHERE id > ? ORDER BY id DESC`,
      [lastId]
    );
    
    const newCount = newDeposits.length;
    const latestDeposit = newCount > 0 ? newDeposits[0] : null;
    const maxId = newCount > 0 ? newDeposits[0].id : lastId;
    
    res.json({
      success: true,
      data: {
        newCount,
        lastId: maxId,
        latestDeposit
      }
    });
  } catch (error) {
    console.error('检查新充值失败:', error.message);
    res.status(500).json({
      success: false,
      message: '检查失败'
    });
  }
});

/**
 * 获取充值记录列表
 * GET /api/admin/deposits
 */
router.get('/deposits', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, wallet_address, status, start_date, end_date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    let whereConditions = [];
    const params = [];

    if (wallet_address) {
      // 处理钱包地址大小写问题 - 转换为小写进行比较
      whereConditions.push('LOWER(wallet_address) LIKE LOWER(?)');
      params.push(`%${wallet_address}%`);
    }

    // 如果未指定status，则默认显示所有状态（不再只显示pending）
    if (status && status !== 'all') {
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
      `SELECT COUNT(*) as total FROM deposit_records ${whereClause}`,
      params
    );

    // 获取列表 - 按创建时间倒序，最新的充值排在最前
    // Include network field to distinguish BSC vs ETH deposits
    const list = await dbQuery(
      `SELECT id, wallet_address, amount, token, network, tx_hash, status, created_at, completed_at FROM deposit_records ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    // 增强返回数据，包含额外信息便于管理
    const enhancedList = list.map(record => ({
      ...record,
      wallet_display: record.wallet_address.slice(0, 6) + '...' + record.wallet_address.slice(-4),
      status_display: {
        'pending': '待确认',
        'completed': '已完成',
        'failed': '已失败'
      }[record.status] || record.status,
      time_display: new Date(record.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    }));

    res.json({
      success: true,
      data: {
        list: enhancedList,
        total: countResult?.[0]?.total || 0,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total_amount: list.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0).toFixed(4)
      }
    });
  } catch (error) {
    console.error('获取充值记录失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取充值记录失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 获取充值统计
 * GET /api/admin/deposits/stats
 */
router.get('/deposits/stats', authMiddleware, async (req, res) => {
  try {
    // 获取总体统计
    const totalStats = await dbQuery(`
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_amount,
        COUNT(DISTINCT wallet_address) as unique_users
      FROM deposit_records
    `);
    
    // 今日统计
    const todayStats = await dbQuery(`
      SELECT 
        COUNT(*) as today_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as today_amount
      FROM deposit_records
      WHERE DATE(created_at) = CURDATE()
    `);
    
    // 本月统计
    const monthStats = await dbQuery(`
      SELECT 
        COUNT(*) as month_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as month_amount
      FROM deposit_records
      WHERE DATE(created_at) >= DATE_FORMAT(NOW(), '%Y-%m-01')
    `);
    
    res.json({
      success: true,
      data: {
        total: {
          count: parseInt(totalStats[0]?.total_count) || 0,
          completed: parseInt(totalStats[0]?.completed_count) || 0,
          pending: parseInt(totalStats[0]?.pending_count) || 0,
          failed: parseInt(totalStats[0]?.failed_count) || 0,
          amount: parseFloat(totalStats[0]?.total_amount) || 0,
          uniqueUsers: parseInt(totalStats[0]?.unique_users) || 0
        },
        today: {
          count: parseInt(todayStats[0]?.today_count) || 0,
          amount: parseFloat(todayStats[0]?.today_amount) || 0
        },
        month: {
          count: parseInt(monthStats[0]?.month_count) || 0,
          amount: parseFloat(monthStats[0]?.month_amount) || 0
        }
      }
    });
  } catch (error) {
    console.error('获取充值统计失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取充值统计失败'
    });
  }
});

/**
 * 更新充值状态
 * PUT /api/admin/deposits/:id/status
 */
router.put('/deposits/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'completed', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: '无效的状态'
      });
    }
    
    // 获取原始充值记录
    const deposit = await dbQuery('SELECT * FROM deposit_records WHERE id = ?', [id]);
    
    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: '充值记录不存在'
      });
    }
    
    // 如果从pending/failed改为completed，需要增加用户余额
    if (status === 'completed' && deposit.status !== 'completed') {
      await dbQuery(
        'UPDATE user_balances SET usdt_balance = usdt_balance + ?, total_deposit = total_deposit + ?, updated_at = NOW() WHERE wallet_address = ?',
        [deposit.amount, deposit.amount, deposit.wallet_address]
      );
      console.log(`[Deposit] 充值确认: ${deposit.amount} USDT -> ${deposit.wallet_address}`);
    }
    
    // 如果从completed改为failed，需要扣除用户余额
    if (status === 'failed' && deposit.status === 'completed') {
      await dbQuery(
        'UPDATE user_balances SET usdt_balance = usdt_balance - ?, total_deposit = total_deposit - ?, updated_at = NOW() WHERE wallet_address = ?',
        [deposit.amount, deposit.amount, deposit.wallet_address]
      );
      console.log(`[Deposit] 充值撤销: ${deposit.amount} USDT <- ${deposit.wallet_address}`);
    }
    
    // 更新充值记录状态
    await dbQuery(
      'UPDATE deposit_records SET status = ?, completed_at = ? WHERE id = ?',
      [status, status === 'completed' ? new Date() : null, id]
    );
    
    res.json({
      success: true,
      message: '状态更新成功'
    });
  } catch (error) {
    console.error('更新充值状态失败:', error.message);
    res.status(500).json({
      success: false,
      message: '更新失败'
    });
  }
});

/**
 * 手动触发充值扫描（用于补充漏掉的充值）
 * POST /api/admin/deposits/trigger-scan
 */
router.post('/deposits/trigger-scan', authMiddleware, async (req, res) => {
  try {
    console.log('[Admin] Manual deposit scan triggered by admin');
    
    // 动态导入 depositMonitorCron
    const { triggerScan } = await import('./cron/depositMonitorCron.js');
    
    // 触发扫描（异步执行，不阻塞响应）
    triggerScan().catch(err => {
      console.error('[Admin] Manual scan error:', err);
    });
    
    res.json({
      success: true,
      message: '充值扫描已触发，正在后台执行'
    });
  } catch (error) {
    console.error('[Admin] Failed to trigger deposit scan:', error.message);
    res.status(500).json({
      success: false,
      message: '触发扫描失败'
    });
  }
});



export default router;
