/**
 * Admin Routes - Security Monitoring Module
 * Handles: Security stats, blocked IPs, whitelist, attacks
 */
import { 
  express, 
  authMiddleware,
  secureLog,
  getSecurityStats,
  getBlockedIPsList,
  securityBlockIP,
  unblockIP,
  addToWhitelist,
  removeFromWhitelist,
  getRecentAttacks,
  getAttackStats
} from './shared.js';

const router = express.Router();

// ==================== Security Monitoring ====================

router.get('/security/stats', authMiddleware, async (req, res) => {
  try {
    const stats = getSecurityStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('获取安全统计失败:', error.message);
    res.status(500).json({ success: false, message: '获取安全统计失败' });
  }
});

/**
 * Get blocked IPs list
 * GET /api/admin/security/blocked-ips
 */
router.get('/security/blocked-ips', authMiddleware, async (req, res) => {
  try {
    const blockedIPs = getBlockedIPsList();
    res.json({ success: true, data: blockedIPs });
  } catch (error) {
    console.error('获取封禁IP列表失败:', error.message);
    res.status(500).json({ success: false, message: '获取封禁IP列表失败' });
  }
});

/**
 * Block an IP address
 * POST /api/admin/security/block-ip
 */
router.post('/security/block-ip', authMiddleware, async (req, res) => {
  try {
    const { ip, duration, reason, permanent } = req.body;
    
    if (!ip) {
      return res.status(400).json({ success: false, message: 'IP地址不能为空' });
    }
    
    // Default duration: 24 hours, or permanent if specified
    const blockDuration = permanent ? -1 : (duration || 24 * 60 * 60 * 1000);
    const blockReason = reason || '管理员手动封禁';
    
    securityBlockIP(ip, blockDuration, blockReason, !!permanent);
    
    secureLog('管理员封禁IP', { 
      ip, 
      duration: blockDuration, 
      reason: blockReason, 
      permanent: !!permanent,
      admin: req.admin?.username 
    });
    
    res.json({ success: true, message: `IP ${ip} 已被封禁` });
  } catch (error) {
    console.error('封禁IP失败:', error.message);
    res.status(500).json({ success: false, message: '封禁IP失败' });
  }
});

/**
 * Unblock an IP address
 * POST /api/admin/security/unblock-ip
 */
router.post('/security/unblock-ip', authMiddleware, async (req, res) => {
  try {
    const { ip } = req.body;
    
    if (!ip) {
      return res.status(400).json({ success: false, message: 'IP地址不能为空' });
    }
    
    unblockIP(ip);
    
    secureLog('管理员解封IP', { ip, admin: req.admin?.username });
    
    res.json({ success: true, message: `IP ${ip} 已被解封` });
  } catch (error) {
    console.error('解封IP失败:', error.message);
    res.status(500).json({ success: false, message: '解封IP失败' });
  }
});

/**
 * Get whitelist
 * GET /api/admin/security/whitelist
 */
router.get('/security/whitelist', authMiddleware, async (req, res) => {
  try {
    const rows = await dbQuery('SELECT * FROM ip_whitelist ORDER BY created_at DESC');
    res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('获取白名单失败:', error.message);
    res.json({ success: true, data: [] }); // Return empty if table doesn't exist
  }
});

/**
 * Add IP to whitelist
 * POST /api/admin/security/whitelist
 */
router.post('/security/whitelist', authMiddleware, async (req, res) => {
  try {
    const { ip, description } = req.body;
    
    if (!ip) {
      return res.status(400).json({ success: false, message: 'IP地址不能为空' });
    }
    
    addToWhitelist(ip);
    
    // Also save to database if dbQuery available
    try {
      await dbQuery(`
        INSERT INTO ip_whitelist (ip_address, description, added_by)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE description = VALUES(description), added_by = VALUES(added_by)
      `, [ip, description || '管理员添加', req.admin?.username || 'admin']);
    } catch (e) {
      // Table might not exist yet, that's ok
    }
    
    secureLog('管理员添加IP白名单', { ip, description, admin: req.admin?.username });
    
    res.json({ success: true, message: `IP ${ip} 已加入白名单` });
  } catch (error) {
    console.error('添加白名单失败:', error.message);
    res.status(500).json({ success: false, message: '添加白名单失败' });
  }
});

/**
 * Remove IP from whitelist
 * DELETE /api/admin/security/whitelist/:ip
 */
router.delete('/security/whitelist/:ip', authMiddleware, async (req, res) => {
  try {
    const { ip } = req.params;
    
    if (!ip) {
      return res.status(400).json({ success: false, message: 'IP地址不能为空' });
    }
    
    removeFromWhitelist(ip);
    
    // Also remove from database
    try {
      await dbQuery('DELETE FROM ip_whitelist WHERE ip_address = ?', [ip]);
    } catch (e) {
      // Table might not exist yet
    }
    
    secureLog('管理员移除IP白名单', { ip, admin: req.admin?.username });
    
    res.json({ success: true, message: `IP ${ip} 已从白名单移除` });
  } catch (error) {
    console.error('移除白名单失败:', error.message);
    res.status(500).json({ success: false, message: '移除白名单失败' });
  }
});

/**
 * Get recent attack logs
 * GET /api/admin/security/attacks
 */
router.get('/security/attacks', authMiddleware, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const attacks = await getRecentAttacks(parseInt(limit));
    res.json({ success: true, data: attacks });
  } catch (error) {
    console.error('获取攻击日志失败:', error.message);
    res.status(500).json({ success: false, message: '获取攻击日志失败' });
  }
});

/**
 * Get attack statistics
 * GET /api/admin/security/attack-stats
 */
router.get('/security/attack-stats', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to last 30 days
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const stats = await getAttackStats(start, end);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('获取攻击统计失败:', error.message);
    res.status(500).json({ success: false, message: '获取攻击统计失败' });
  }
});

/**
 * Check for new attacks since last check (for real-time notifications)
 * GET /api/admin/security/check-new-attacks
 * Query params: last_id - the last attack log ID that was already notified
 */
router.get('/security/check-new-attacks', authMiddleware, async (req, res) => {
  try {
    const { last_id = 0 } = req.query;
    const lastId = parseInt(last_id) || 0;
    
    // Query for new attacks since last_id
    const newAttacks = await dbQuery(`
      SELECT 
        id,
        ip_address,
        attack_type,
        severity,
        attack_details as details,
        blocked,
        created_at
      FROM attack_logs 
      WHERE id > ?
      ORDER BY id DESC
      LIMIT 20
    `, [lastId]);
    
    // Get count by severity for the new attacks
    let attackSummary = null;
    if (newAttacks && newAttacks.length > 0) {
      const severityCounts = {};
      const typeCounts = {};
      let blockedCount = 0;
      
      newAttacks.forEach(attack => {
        // Count by severity
        severityCounts[attack.severity] = (severityCounts[attack.severity] || 0) + 1;
        // Count by type
        typeCounts[attack.attack_type] = (typeCounts[attack.attack_type] || 0) + 1;
        // Count blocked
        if (attack.blocked) blockedCount++;
      });
      
      // Find the most common attack type
      let maxTypeCount = 0;
      let mainAttackType = 'other';
      for (const [type, count] of Object.entries(typeCounts)) {
        if (count > maxTypeCount) {
          maxTypeCount = count;
          mainAttackType = type;
        }
      }
      
      // Find highest severity
      const severityOrder = ['critical', 'high', 'medium', 'low'];
      let highestSeverity = 'low';
      for (const sev of severityOrder) {
        if (severityCounts[sev]) {
          highestSeverity = sev;
          break;
        }
      }
      
      attackSummary = {
        count: newAttacks.length,
        mainType: mainAttackType,
        highestSeverity,
        blockedCount,
        severityCounts,
        typeCounts
      };
    }
    
    res.json({
      success: true,
      hasNew: newAttacks && newAttacks.length > 0,
      data: newAttacks || [],
      summary: attackSummary,
      maxId: newAttacks && newAttacks.length > 0 ? Math.max(...newAttacks.map(a => a.id)) : lastId
    });
  } catch (error) {
    console.error('检查新攻击失败:', error.message);
    // Return empty result on error to avoid breaking the polling
    res.json({ 
      success: true, 
      hasNew: false, 
      data: [], 
      summary: null,
      maxId: parseInt(req.query.last_id) || 0 
    });
  }
});

/**
 * Get newly blocked IPs since last check
 * GET /api/admin/security/check-new-blocks
 * Query params: last_id - the last blocked IP ID that was already notified
 */
router.get('/security/check-new-blocks', authMiddleware, async (req, res) => {
  try {
    const { last_id = 0 } = req.query;
    const lastId = parseInt(last_id) || 0;
    
    // Query for newly blocked IPs
    const newBlocks = await dbQuery(`
      SELECT 
        id,
        ip_address,
        reason,
        blocked_at,
        DATE_ADD(blocked_at, INTERVAL duration_ms/1000 SECOND) as expires_at,
        is_permanent
      FROM blocked_ips 
      WHERE id > ?
      ORDER BY id DESC
      LIMIT 10
    `, [lastId]);
    
    res.json({
      success: true,
      hasNew: newBlocks && newBlocks.length > 0,
      data: newBlocks || [],
      maxId: newBlocks && newBlocks.length > 0 ? Math.max(...newBlocks.map(b => b.id)) : lastId
    });
  } catch (error) {
    console.error('检查新封禁失败:', error.message);
    res.json({ 
      success: true, 
      hasNew: false, 
      data: [], 
      maxId: parseInt(req.query.last_id) || 0 
    });
  }
});



export default router;
