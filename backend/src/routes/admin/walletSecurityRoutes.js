/**
 * Admin Routes - Wallet Security Module
 * Handles: Wallet password protection, verification
 */
import { 
  express, 
  dbQuery, 
  authMiddleware,
  secureLog,
  hashPassword,
  verifyPassword,
  upsertSystemSetting
} from './shared.js';

const router = express.Router();

// ==================== Wallet Security ====================

router.get('/wallet-security/status', authMiddleware, async (req, res) => {
  try {
    const rows = await dbQuery(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      ['wallet_security_password']
    );
    
    // dbQuery returns array, get first row
    const result = rows && rows.length > 0 ? rows[0] : null;
    const isSet = !!(result && result.setting_value);
    
    res.json({
      success: true,
      data: {
        isPasswordSet: isSet
      }
    });
  } catch (error) {
    console.error('检查钱包安全密码状态失败:', error.message);
    res.status(500).json({
      success: false,
      message: '检查失败'
    });
  }
});

/**
 * 初始化/设置钱包安全密码
 * POST /api/admin/wallet-security/init
 * body: { password }
 */
router.post('/wallet-security/init', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '安全密码至少需要6位'
      });
    }
    
    // Check if password already exists (dbQuery returns array)
    const existingRows = await dbQuery(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      ['wallet_security_password']
    );
    const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;
    
    if (existing && existing.setting_value) {
      return res.status(400).json({
        success: false,
        message: '安全密码已设置，请使用修改功能'
      });
    }
    
    // Hash the password using bcrypt
    const hashedPassword = await hashPassword(password);
    
    // Insert or update the password
    if (existing) {
      // Row exists but setting_value is empty, update it
      await dbQuery(
        'UPDATE system_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?',
        [hashedPassword, 'wallet_security_password']
      );
    } else {
      // No row exists, insert new
      await dbQuery(
        'INSERT INTO system_settings (setting_key, setting_value, setting_type, description, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        ['wallet_security_password', hashedPassword, 'password', '钱包收款地址安全密码']
      );
    }
    
    secureLog('[Admin] 钱包安全密码已设置', { admin: req.admin?.username });
    
    res.json({
      success: true,
      message: '安全密码设置成功'
    });
  } catch (error) {
    console.error('设置钱包安全密码失败:', error.message);
    res.status(500).json({
      success: false,
      message: '设置失败'
    });
  }
});

/**
 * 验证钱包安全密码
 * POST /api/admin/wallet-security/verify
 * body: { password }
 */
router.post('/wallet-security/verify', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        message: '请输入安全密码'
      });
    }
    
    // dbQuery returns array
    const rows = await dbQuery(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      ['wallet_security_password']
    );
    const result = rows && rows.length > 0 ? rows[0] : null;
    
    if (!result || !result.setting_value) {
      return res.status(400).json({
        success: false,
        message: '安全密码未设置'
      });
    }
    
    // Verify password using bcrypt
    const isValid = await verifyPassword(password, result.setting_value);
    
    if (!isValid) {
      secureLog('[Admin] 钱包安全密码验证失败', { admin: req.admin?.username });
      return res.status(401).json({
        success: false,
        message: '安全密码错误'
      });
    }
    
    res.json({
      success: true,
      message: '验证成功'
    });
  } catch (error) {
    console.error('验证钱包安全密码失败:', error.message);
    res.status(500).json({
      success: false,
      message: '验证失败'
    });
  }
});

/**
 * 修改钱包安全密码
 * POST /api/admin/wallet-security/change
 * body: { oldPassword, newPassword }
 */
router.post('/wallet-security/change', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '请输入旧密码和新密码'
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: '新密码至少需要6位'
      });
    }
    
    // Get current password (dbQuery returns array)
    const rows = await dbQuery(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      ['wallet_security_password']
    );
    const result = rows && rows.length > 0 ? rows[0] : null;
    
    if (!result || !result.setting_value) {
      return res.status(400).json({
        success: false,
        message: '安全密码未设置'
      });
    }
    
    // Verify old password
    const isValid = await verifyPassword(oldPassword, result.setting_value);
    
    if (!isValid) {
      secureLog('[Admin] 修改钱包安全密码失败 - 旧密码错误', { admin: req.admin?.username });
      return res.status(401).json({
        success: false,
        message: '旧密码错误'
      });
    }
    
    // Hash new password and update
    const hashedPassword = await hashPassword(newPassword);
    
    await dbQuery(
      'UPDATE system_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?',
      [hashedPassword, 'wallet_security_password']
    );
    
    secureLog('[Admin] 钱包安全密码已修改', { admin: req.admin?.username });
    
    res.json({
      success: true,
      message: '安全密码修改成功'
    });
  } catch (error) {
    console.error('修改钱包安全密码失败:', error.message);
    res.status(500).json({
      success: false,
      message: '修改失败'
    });
  }
});

/**
 * 保存钱包地址配置（需要安全密码验证）
 * POST /api/admin/wallet-config
 * body: { securityPassword, settings }
 */
router.post('/wallet-config', authMiddleware, async (req, res) => {
  try {
    const { securityPassword, settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: '请提供设置对象'
      });
    }
    
    // Check if security password is set (dbQuery returns array)
    const pwdRows = await dbQuery(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      ['wallet_security_password']
    );
    const pwdResult = pwdRows && pwdRows.length > 0 ? pwdRows[0] : null;
    
    // If password is set, verify it
    if (pwdResult && pwdResult.setting_value) {
      if (!securityPassword) {
        return res.status(400).json({
          success: false,
          message: '请输入安全密码',
          requirePassword: true
        });
      }
      
      const isValid = await verifyPassword(securityPassword, pwdResult.setting_value);
      
      if (!isValid) {
        secureLog('[Admin] 保存钱包配置失败 - 安全密码错误', { admin: req.admin?.username });
        return res.status(401).json({
          success: false,
          message: '安全密码错误'
        });
      }
    }
    
    // Save wallet settings
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
    
    secureLog(`[Admin] 钱包配置已更新: ${updated}/${keys.length} 项`, { 
      admin: req.admin?.username,
      settings: Object.keys(settings)
    });
    
    res.json({
      success: true,
      message: `成功更新 ${updated} 项设置`
    });
  } catch (error) {
    console.error('保存钱包配置失败:', error.message);
    res.status(500).json({
      success: false,
      message: '保存失败'
    });
  }
});

/**
 * 添加新的系统设置
 * POST /api/admin/settings
 * body: { key, value, type, description }
 */
router.post('/settings', authMiddleware, async (req, res) => {
  try {
    const { key, value, type = 'text', description = '' } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({
        success: false,
        message: '请提供设置键名和值'
      });
    }
    
    // 检查是否已存在
    const existing = await dbQuery(
      'SELECT id FROM system_settings WHERE setting_key = ?',
      [key]
    );
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: '设置项已存在'
      });
    }
    
    await dbQuery(
      'INSERT INTO system_settings (setting_key, setting_value, setting_type, description, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [key, value, type, description]
    );
    
    console.log(`[Admin] 添加系统设置: ${key} = ${value}`);
    
    res.json({
      success: true,
      message: '设置已添加'
    });
  } catch (error) {
    console.error('添加设置失败:', error.message);
    res.status(500).json({
      success: false,
      message: '添加设置失败'
    });
  }
});



export default router;
