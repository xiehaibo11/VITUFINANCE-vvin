/**
 * Admin Routes - Error Log Management Module
 * Handles: Error logs list, details, resolve, delete
 */
import { 
  express, 
  dbQuery, 
  authMiddleware,
  getErrorStats,
  resolveError,
  resolveSimilarErrors
} from './shared.js';

const router = express.Router();

// ==================== Error Log Management ====================

router.get('/error-logs', authMiddleware, async (req, res) => {
  try {
    const { 
      page = 1, 
      pageSize = 20, 
      level, 
      source, 
      resolved, 
      start_date, 
      end_date,
      search 
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let whereConditions = [];
    const params = [];
    
    if (level) {
      whereConditions.push('error_level = ?');
      params.push(level);
    }
    
    if (source) {
      whereConditions.push('error_source = ?');
      params.push(source);
    }
    
    if (resolved !== undefined) {
      whereConditions.push('resolved = ?');
      params.push(resolved === 'true' ? 1 : 0);
    }
    
    if (start_date) {
      whereConditions.push('DATE(created_at) >= ?');
      params.push(start_date);
    }
    
    if (end_date) {
      whereConditions.push('DATE(created_at) <= ?');
      params.push(end_date);
    }
    
    if (search) {
      whereConditions.push('(error_message LIKE ? OR error_type LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';
    
    // 获取总数
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM error_logs ${whereClause}`,
      params
    );
    
    // 获取列表
    const list = await dbQuery(
      `SELECT * FROM error_logs ${whereClause} 
       ORDER BY created_at DESC 
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
    console.error('获取错误日志列表失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取错误日志列表失败'
    });
  }
});

/**
 * 获取错误日志详情
 * GET /api/admin/error-logs/:id
 */
router.get('/error-logs/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const log = await dbQuery(
      'SELECT * FROM error_logs WHERE id = ?',
      [id]
    );
    
    if (!log) {
      return res.status(404).json({
        success: false,
        message: '错误日志不存在'
      });
    }
    
    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('获取错误日志详情失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取错误日志详情失败'
    });
  }
});

/**
 * 获取错误日志统计
 * GET /api/admin/error-logs/stats
 */
router.get('/error-logs-stats', authMiddleware, async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    
    const stats = await getErrorStats(timeRange);
    
    if (!stats) {
      throw new Error('获取统计数据失败');
    }
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取错误统计失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取错误统计失败'
    });
  }
});

/**
 * 标记错误为已解决
 * PUT /api/admin/error-logs/:id/resolve
 */
router.put('/error-logs/:id/resolve', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_note } = req.body;
    const resolvedBy = req.admin.username;
    
    const success = await resolveError(id, resolvedBy, resolution_note);
    
    if (!success) {
      throw new Error('标记失败');
    }
    
    res.json({
      success: true,
      message: '已标记为已解决'
    });
  } catch (error) {
    console.error('标记错误已解决失败:', error.message);
    res.status(500).json({
      success: false,
      message: '标记失败'
    });
  }
});

/**
 * 批量标记相似错误为已解决
 * PUT /api/admin/error-logs/resolve-similar
 */
router.put('/error-logs-resolve-similar', authMiddleware, async (req, res) => {
  try {
    const { error_type, error_message, resolution_note } = req.body;
    const resolvedBy = req.admin.username;
    
    if (!error_type || !error_message) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }
    
    const success = await resolveSimilarErrors(
      error_type, 
      error_message, 
      resolvedBy, 
      resolution_note
    );
    
    if (!success) {
      throw new Error('批量标记失败');
    }
    
    res.json({
      success: true,
      message: '批量标记成功'
    });
  } catch (error) {
    console.error('批量标记错误已解决失败:', error.message);
    res.status(500).json({
      success: false,
      message: '批量标记失败'
    });
  }
});

/**
 * 删除错误日志
 * DELETE /api/admin/error-logs/:id
 */
router.delete('/error-logs/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    await dbQuery('DELETE FROM error_logs WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除错误日志失败:', error.message);
    res.status(500).json({
      success: false,
      message: '删除失败'
    });
  }
});



export default router;
