/**
 * Admin Routes - Document Management Module
 * Handles: Whitepaper, MSB, Business License uploads
 */
import { 
  express, 
  dbQuery, 
  authMiddleware,
  secureLog,
  fs,
  path,
  __dirname,
  whitepaperUpload,
  msbUpload,
  businessLicenseUpload,
  avatarUpload,
  AVATARS_DIR,
  detectTypeFromUrl
} from './shared.js';

const router = express.Router();

// ==================== Document Management ====================

router.get('/documents', authMiddleware, async (req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT setting_key, setting_value FROM system_settings 
       WHERE setting_key IN (
         'doc_whitepaper_url', 'doc_whitepaper_type',
         'doc_msb_url', 'doc_msb_type',
         'doc_business_license_url', 'doc_business_license_type'
       )`
    );

    const map = {};
    rows.forEach(r => (map[r.setting_key] = r.setting_value));

    // Helper to detect file type from URL extension if type is not stored
    const detectTypeFromUrl = (url) => {
      if (!url) return 'image';
      const ext = url.toLowerCase().split('.').pop();
      return ext === 'pdf' ? 'pdf' : 'image';
    };

    res.json({
      success: true,
      data: {
        whitepaper_url: map.doc_whitepaper_url || DEFAULT_DOCUMENTS.whitepaper_url,
        whitepaper_type: map.doc_whitepaper_type || detectTypeFromUrl(map.doc_whitepaper_url || DEFAULT_DOCUMENTS.whitepaper_url),
        msb_url: map.doc_msb_url || DEFAULT_DOCUMENTS.msb_url,
        msb_type: map.doc_msb_type || detectTypeFromUrl(map.doc_msb_url || DEFAULT_DOCUMENTS.msb_url),
        business_license_url: map.doc_business_license_url || DEFAULT_DOCUMENTS.business_license_url,
        business_license_type: map.doc_business_license_type || detectTypeFromUrl(map.doc_business_license_url || DEFAULT_DOCUMENTS.business_license_url)
      }
    });
  } catch (error) {
    console.error('获取资质文件配置失败:', error.message);
    res.status(500).json({ success: false, message: '获取资质文件配置失败' });
  }
});

/**
 * 上传并替换白皮书（PDF）
 * POST /api/admin/documents/whitepaper
 */
router.post('/documents/whitepaper', authMiddleware, whitepaperUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请选择要上传的 PDF 文件' });
    }

    const url = `/uploads/documents/whitepaper/${req.file.filename}`;
    await upsertSystemSetting('doc_whitepaper_url', url, 'string', '白皮书文件URL');

    secureLog('info', '上传白皮书', { admin: req.admin?.username || 'unknown', url });

    res.json({ success: true, message: '白皮书上传成功', data: { whitepaper_url: url } });
  } catch (error) {
    console.error('白皮书上传失败:', error.message);
    res.status(500).json({ success: false, message: '白皮书上传失败: ' + error.message });
  }
});

/**
 * 上传并替换 MSB 许可证（支持 PDF 和图片）
 * POST /api/admin/documents/msb
 */
router.post('/documents/msb', authMiddleware, msbUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请选择要上传的文件（支持 PDF 和图片）' });
    }

    const url = `/uploads/documents/msb/${req.file.filename}`;
    // Determine file type based on mimetype
    const fileType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'image';
    
    // Store both URL and type in database
    await upsertSystemSetting('doc_msb_url', url, 'string', 'MSB许可证文件URL');
    await upsertSystemSetting('doc_msb_type', fileType, 'string', 'MSB许可证文件类型');

    secureLog('info', '上传MSB许可证', { admin: req.admin?.username || 'unknown', url, type: fileType });

    res.json({ success: true, message: 'MSB许可证上传成功', data: { msb_url: url, msb_type: fileType } });
  } catch (error) {
    console.error('MSB许可证上传失败:', error.message);
    res.status(500).json({ success: false, message: 'MSB许可证上传失败: ' + error.message });
  }
});

/**
 * 上传并替换营业执照（支持 PDF 和图片）
 * POST /api/admin/documents/business-license
 */
router.post('/documents/business-license', authMiddleware, businessLicenseUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请选择要上传的文件（支持 PDF 和图片）' });
    }

    const url = `/uploads/documents/business_license/${req.file.filename}`;
    // Determine file type based on mimetype
    const fileType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'image';
    
    // Store both URL and type in database
    await upsertSystemSetting('doc_business_license_url', url, 'string', '营业执照文件URL');
    await upsertSystemSetting('doc_business_license_type', fileType, 'string', '营业执照文件类型');

    secureLog('info', '上传营业执照', { admin: req.admin?.username || 'unknown', url, type: fileType });

    res.json({ success: true, message: '营业执照上传成功', data: { business_license_url: url, business_license_type: fileType } });
  } catch (error) {
    console.error('营业执照上传失败:', error.message);
    res.status(500).json({ success: false, message: '营业执照上传失败: ' + error.message });
  }
});

// ==================== 头像管理 API ====================

/**
 * 上传管理员头像
 * POST /api/admin/upload-avatar
 */
router.post('/upload-avatar', authMiddleware, avatarUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请选择要上传的头像文件'
      });
    }

    // 生成访问 URL
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // 删除旧头像（如果存在）
    try {
      const oldSetting = await dbQuery(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'admin_avatar'"
      );
      if (oldSetting?.setting_value) {
        const oldPath = path.join(__dirname, '..', oldSetting.setting_value);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
    } catch (e) {
      console.log('删除旧头像失败（可忽略）:', e.message);
    }

    // 保存到数据库
    const existing = await dbQuery(
      "SELECT id FROM system_settings WHERE setting_key = 'admin_avatar'"
    );

    if (existing) {
      await dbQuery(
        "UPDATE system_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = 'admin_avatar'",
        [avatarUrl]
      );
    } else {
      await dbQuery(
        "INSERT INTO system_settings (setting_key, setting_value, setting_type, description, created_at, updated_at) VALUES ('admin_avatar', ?, 'string', '管理员头像', NOW(), NOW())",
        [avatarUrl]
      );
    }

    console.log(`[Admin] 头像上传成功: ${avatarUrl}`);

    res.json({
      success: true,
      message: '头像上传成功',
      data: {
        avatar_url: avatarUrl
      }
    });
  } catch (error) {
    console.error('头像上传失败:', error.message);
    res.status(500).json({
      success: false,
      message: '头像上传失败: ' + error.message
    });
  }
});



export default router;
