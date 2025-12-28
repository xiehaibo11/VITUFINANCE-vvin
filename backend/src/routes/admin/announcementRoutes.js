/**
 * Admin Routes - Announcement Management Module
 * Handles: Announcement CRUD operations
 */
import { express, dbQuery, authMiddleware, secureLog } from './shared.js';

const router = express.Router();

// ==================== Announcement Management ====================

router.get('/announcements', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    // 获取总数
    const countResult = await dbQuery('SELECT COUNT(*) as total FROM announcements');
    
    // 获取列表
    const list = await dbQuery(
      'SELECT * FROM announcements ORDER BY sort_order DESC, created_at DESC LIMIT ? OFFSET ?',
      [parseInt(pageSize), offset]
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
    console.error('获取公告列表失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取公告列表失败'
    });
  }
});

/**
 * 创建公告
 * POST /api/admin/announcements
 */
router.post('/announcements', authMiddleware, async (req, res) => {
  try {
    const { title, content, sort_order = 0, status = 'active' } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        message: '标题不能为空'
      });
    }
    
    await dbQuery(
      'INSERT INTO announcements (title, content, sort_order, status, created_at) VALUES (?, ?, ?, ?, NOW())',
      [title, content || '', sort_order, status]
    );
    
    res.json({
      success: true,
      message: '创建成功'
    });
  } catch (error) {
    console.error('创建公告失败:', error.message);
    res.status(500).json({
      success: false,
      message: '创建失败'
    });
  }
});

/**
 * 更新公告
 * PUT /api/admin/announcements/:id
 */
router.put('/announcements/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, sort_order, status } = req.body;
    
    const updateFields = [];
    const updateParams = [];
    
    if (title !== undefined) {
      updateFields.push('title = ?');
      updateParams.push(title);
    }
    
    if (content !== undefined) {
      updateFields.push('content = ?');
      updateParams.push(content);
    }
    
    if (sort_order !== undefined) {
      updateFields.push('sort_order = ?');
      updateParams.push(sort_order);
    }
    
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateParams.push(status);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有要更新的字段'
      });
    }
    
    updateParams.push(id);
    
    await dbQuery(
      `UPDATE announcements SET ${updateFields.join(', ')} WHERE id = ?`,
      updateParams
    );
    
    res.json({
      success: true,
      message: '更新成功'
    });
  } catch (error) {
    console.error('更新公告失败:', error.message);
    res.status(500).json({
      success: false,
      message: '更新失败'
    });
  }
});

/**
 * 删除公告
 * DELETE /api/admin/announcements/:id
 */
router.delete('/announcements/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    await dbQuery('DELETE FROM announcements WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除公告失败:', error.message);
    res.status(500).json({
      success: false,
      message: '删除失败'
    });
  }
});



export default router;
