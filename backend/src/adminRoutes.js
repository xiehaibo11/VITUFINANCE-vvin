/**
 * 管理系统 API 路由
 * 
 * 功能：
 * - 管理员登录认证
 * - 用户管理
 * - 充值/提款记录管理
 * - 公告管理
 * - 数据统计
 * 
 * 安全措施：
 * - 密码使用bcrypt加密存储
 * - JWT令牌认证
 * - 敏感操作日志记录
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query as dbQuery } from '../db.js';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { hashPassword, verifyPassword, sanitizeString, secureLog } from './security/index.js';
import { loginLimiter } from './middleware/security.js';
import { getErrorStats, resolveError, resolveSimilarErrors } from './utils/errorLogger.js';
// Security monitoring imports
import { 
    getSecurityStats, 
    getBlockedIPsList, 
    bruteForceProtectionMiddleware,
    clearLoginAttempts,
    blockIP as securityBlockIP
} from './security/securityMiddleware.js';
import { getRecentAttacks, getAttackStats } from './security/attackLogger.js';
import { unblockIP, addToWhitelist, removeFromWhitelist } from './security/ipProtection.js';
import { transferUSDT, getAccountAddress, getAccountBalance } from './utils/bscTransferService.js';
import { MIN_ROBOT_PURCHASE } from './utils/teamMath.js';

const router = express.Router();

// 获取当前目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JWT 密钥配置
// 生产环境：必须从环境变量获取
// 开发环境：可使用默认值（仅用于测试）
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev_jwt_secret_not_for_production' : null);
if (!JWT_SECRET) {
  console.error('❌ 错误：生产环境必须设置 JWT_SECRET 环境变量');
  console.error('   请在 .env 文件中添加：JWT_SECRET=<你的密钥>');
  console.error('   生成方法：node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}

// 管理员配置文件路径
const ADMIN_CONFIG_FILE = path.join(__dirname, '../data/admin_config.json');

// ==================== 头像上传配置 ====================
// 上传目录
const UPLOADS_DIR = path.join(__dirname, '../uploads');
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');

// 确保目录存在
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

// Multer 配置 - 头像上传
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, AVATARS_DIR);
  },
  filename: (req, file, cb) => {
    // 使用时间戳和随机数生成唯一文件名
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `admin_avatar_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
    cb(null, filename);
  }
});

// 文件过滤器
const avatarFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只支持 JPG, PNG, GIF 格式的图片'), false);
  }
};

// Multer 实例
const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB 限制
  }
});

// ==================== 资质文件上传配置 ====================

const DOCUMENTS_DIR = path.join(UPLOADS_DIR, 'documents');
const WHITEPAPER_DIR = path.join(DOCUMENTS_DIR, 'whitepaper');
const MSB_DIR = path.join(DOCUMENTS_DIR, 'msb');
const BUSINESS_LICENSE_DIR = path.join(DOCUMENTS_DIR, 'business_license');

for (const dirPath of [DOCUMENTS_DIR, WHITEPAPER_DIR, MSB_DIR, BUSINESS_LICENSE_DIR]) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const whitepaperStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, WHITEPAPER_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `whitepaper_${Date.now()}${ext}`);
  }
});

const imageStorageFactory = (destDir, prefix) =>
  multer.diskStorage({
    destination: (req, file, cb) => cb(null, destDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);
    }
  });

const pdfFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('只支持 PDF 文件'), false);
  }
};

const imageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只支持 JPG, PNG, GIF, WEBP 格式的图片'), false);
  }
};

// Document file filter - supports both PDF and images for qualification documents
const documentFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg', 
    'image/png', 
    'image/gif', 
    'image/webp'
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只支持 PDF, JPG, PNG, GIF, WEBP 格式的文件'), false);
  }
};

const whitepaperUpload = multer({
  storage: whitepaperStorage,
  fileFilter: pdfFileFilter,
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB
});

// MSB upload - supports both PDF and images
const msbUpload = multer({
  storage: imageStorageFactory(MSB_DIR, 'msb'),
  fileFilter: documentFileFilter,
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB for PDF support
});

// Business license upload - supports both PDF and images
const businessLicenseUpload = multer({
  storage: imageStorageFactory(BUSINESS_LICENSE_DIR, 'business_license'),
  fileFilter: documentFileFilter,
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB for PDF support
});

// 标记是否需要迁移密码（从明文到bcrypt）
let needsPasswordMigration = false;

/**
 * 获取管理员配置
 */
const getAdminUsers = () => {
  try {
    // 确保目录存在
    const dataDir = path.dirname(ADMIN_CONFIG_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // 如果配置文件存在，读取它
    if (fs.existsSync(ADMIN_CONFIG_FILE)) {
      const data = fs.readFileSync(ADMIN_CONFIG_FILE, 'utf-8');
      const adminUsers = JSON.parse(data);
      
      // 检查是否有明文密码需要迁移
      for (const [username, userData] of Object.entries(adminUsers)) {
        // bcrypt哈希以 $2a$、$2b$ 或 $2y$ 开头
        if (userData.password && !userData.password.startsWith('$2')) {
          needsPasswordMigration = true;
          console.log(`⚠️ 检测到明文密码，用户: ${username}，请尽快进行密码迁移`);
        }
      }
      
      return adminUsers;
    }
    
    // 配置文件不存在，需要初始化
    console.error('❌ 管理员配置文件不存在，请手动创建并设置加密密码');
    return {};
  } catch (error) {
    console.error('读取管理员配置失败:', error.message);
    return {};
  }
};

/**
 * 保存管理员配置
 */
const saveAdminUsers = (users) => {
  try {
    // 确保目录存在
    const dataDir = path.dirname(ADMIN_CONFIG_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(users, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('保存管理员配置失败:', error.message);
    return false;
  }
};

// ==================== 中间件 ====================

/**
 * JWT 认证中间件
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '未授权，请先登录'
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token 无效或已过期'
    });
  }
};

// ==================== 认证接口 ====================

/**
 * 管理员登录
 * POST /api/admin/login
 * 
 * 安全措施：
 * - 使用bcrypt验证密码
 * - 应用登录速率限制
 * - 记录登录尝试日志
 */
router.post('/login', loginLimiter, bruteForceProtectionMiddleware, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 输入清理
    const safeUsername = sanitizeString(username);
    
    if (!safeUsername || !password) {
      secureLog('登录失败：缺少用户名或密码', { ip: req.ip });
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }
    
    // 获取最新的管理员配置
    const adminUsers = getAdminUsers();
    const admin = adminUsers[safeUsername];
    
    if (!admin) {
      secureLog('登录失败：用户不存在', { username: safeUsername, ip: req.ip });
      // 延迟响应防止用户枚举
      await new Promise(resolve => setTimeout(resolve, 1000));
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }
    
    // 验证密码 - 仅支持bcrypt哈希（增强安全性）
    let passwordValid = false;

    if (!admin.password.startsWith('$2')) {
      // 检测到明文密码 - 拒绝访问并记录严重警告
      secureLog('严重安全警告：检测到未加密的管理员密码', {
        username: safeUsername,
        ip: req.ip,
        action: '密码验证被拒绝'
      });
      // 延迟响应防止暴力破解
      await new Promise(resolve => setTimeout(resolve, 1000));
      return res.status(401).json({
        success: false,
        message: '账户安全问题，请联系系统管理员'
      });
    }

    // bcrypt哈希验证
    passwordValid = await verifyPassword(password, admin.password);

    if (!passwordValid) {
      secureLog('登录失败：密码错误', { username: safeUsername, ip: req.ip });
      // 延迟响应防止暴力破解
      await new Promise(resolve => setTimeout(resolve, 1000));
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }
    
    // 生成 JWT Token
    const token = jwt.sign(
      { username: safeUsername, role: admin.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    secureLog('登录成功', { username: safeUsername, ip: req.ip });
    
    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        username: safeUsername,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('登录失败:', error.message);
    res.status(500).json({
      success: false,
      message: '登录失败'
    });
  }
});

/**
 * 获取管理员信息
 * GET /api/admin/info
 */
router.get('/info', authMiddleware, (req, res) => {
  res.json({
    success: true,
    data: {
      username: req.admin.username,
      role: req.admin.role
    }
  });
});

/**
 * 获取系统配置
 * GET /api/admin/system/config
 */
router.get('/system/config', authMiddleware, async (req, res) => {
  try {
    // 从环境变量或数据库读取系统配置
    const config = {
      siteName: process.env.SITE_NAME || 'VituFinance',
      version: '1.0.0',
      features: {
        autoTransfer: process.env.ENABLE_AUTO_TRANSFER === 'true',
        emailNotification: process.env.ENABLE_EMAIL === 'true',
        maintenanceMode: process.env.MAINTENANCE_MODE === 'true'
      },
      limits: {
        minDeposit: parseFloat(process.env.MIN_DEPOSIT) || 10,
        minWithdraw: parseFloat(process.env.MIN_WITHDRAW) || 10,
        maxWithdraw: parseFloat(process.env.MAX_WITHDRAW) || 100000,
        withdrawFee: parseFloat(process.env.WITHDRAW_FEE) || 0
      },
      blockchain: {
        chainId: parseInt(process.env.CHAIN_ID) || 56,
        chainName: process.env.CHAIN_NAME || 'BSC Mainnet',
        rpcUrl: process.env.RPC_URL || 'https://bsc-dataseed.binance.org',
        explorerUrl: process.env.EXPLORER_URL || 'https://bscscan.com'
      }
    };
    
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('获取系统配置失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取系统配置失败'
    });
  }
});

/**
 * 修改管理员密码
 * POST /api/admin/change-password
 * 
 * 安全措施：
 * - 验证当前密码
 * - 新密码使用bcrypt加密存储
 * - 密码强度要求
 */
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const username = req.admin.username;
    
    // 验证参数
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '请提供当前密码和新密码'
      });
    }
    
    // 验证新密码强度
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: '新密码长度至少8位'
      });
    }
    
    // 密码强度检查：必须包含大写、小写、数字和特殊字符
    const passwordStrengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordStrengthRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: '密码必须包含大写字母、小写字母、数字和特殊字符(@$!%*?&)'
      });
    }
    
    // 获取当前管理员配置
    const adminUsers = getAdminUsers();
    const admin = adminUsers[username];
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 验证当前密码
    let oldPasswordValid = false;
    if (admin.password.startsWith('$2')) {
      oldPasswordValid = await verifyPassword(oldPassword, admin.password);
    } else {
      oldPasswordValid = admin.password === oldPassword;
    }
    
    if (!oldPasswordValid) {
      secureLog('修改密码失败：当前密码错误', { username, ip: req.ip });
      return res.status(401).json({
        success: false,
        message: '当前密码错误'
      });
    }
    
    // 检查新旧密码是否相同
    if (oldPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: '新密码不能与当前密码相同'
      });
    }
    
    // 使用bcrypt加密新密码
    const hashedPassword = await hashPassword(newPassword);
    adminUsers[username].password = hashedPassword;
    
    // 保存配置
    const saved = saveAdminUsers(adminUsers);
    
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: '保存密码失败'
      });
    }
    
    secureLog('密码修改成功', { username, ip: req.ip });
    
    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    console.error('修改密码失败:', error.message);
    res.status(500).json({
      success: false,
      message: '修改密码失败'
    });
  }
});

// ==================== 仪表盘统计 ====================

/**
 * 获取仪表盘统计数据
 * GET /api/admin/dashboard/stats
 */
router.get('/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    // 获取用户总数（排除内部账户）
    // 注意：dbQuery返回数组，需要访问 [0] 获取第一行数据
    const userCountResult = await dbQuery('SELECT COUNT(*) as count FROM user_balances WHERE is_internal_account = 0');
    const totalUsers = userCountResult[0]?.count || 0;
    
    // 获取总充值（只统计已完成的充值记录）
    const depositSumResult = await dbQuery(
      "SELECT COALESCE(SUM(amount), 0) as total FROM deposit_records WHERE status = 'completed'"
    );
    const totalDeposit = depositSumResult[0]?.total || 0;
    
    // 获取真实充值（排除内部操作的金额）
    const realDepositResult = await dbQuery(
      "SELECT COALESCE(SUM(total_deposit - manual_added_balance), 0) as total FROM user_balances WHERE is_internal_account = 0"
    );
    const realTotalDeposit = realDepositResult[0]?.total || 0;
    
    // 获取总提款（只统计已完成的提款记录）
    const withdrawSumResult = await dbQuery(
      "SELECT COALESCE(SUM(amount), 0) as total FROM withdraw_records WHERE status = 'completed'"
    );
    const totalWithdraw = withdrawSumResult[0]?.total || 0;
    
    // 计算平台余额 = 真实收到的充值 - 实际支付的提款
    const platformBalance = parseFloat(realTotalDeposit) - parseFloat(totalWithdraw);
    
    // 获取机器人购买统计（CEX/DEX机器人）
    const robotCountResult = await dbQuery(
      `SELECT COUNT(*) as count FROM robot_purchases WHERE robot_type IN ('cex', 'dex')`
    );
    const totalRobots = robotCountResult[0]?.count || 0;
    
    // 获取跟单统计（Grid/High机器人）
    const followCountResult = await dbQuery(
      `SELECT COUNT(*) as count FROM robot_purchases WHERE robot_type IN ('grid', 'high')`
    );
    const totalFollows = followCountResult[0]?.count || 0;
    
    // 获取推广统计
    const referralCountResult = await dbQuery(
      `SELECT COUNT(*) as count FROM user_referrals WHERE referrer_address IS NOT NULL`
    );
    const totalReferrals = referralCountResult[0]?.count || 0;
    
    // 获取公告数量
    const announcementCountResult = await dbQuery(
      `SELECT COUNT(*) as count FROM announcements WHERE status = 'active'`
    );
    const totalAnnouncements = announcementCountResult[0]?.count || 0;
    
    // 获取待处理提款数量
    const pendingWithdrawResult = await dbQuery(
      `SELECT COUNT(*) as count FROM withdraw_records WHERE status = 'pending'`
    );
    const pendingWithdrawals = pendingWithdrawResult[0]?.count || 0;
    
    // 获取今日充值
    const todayDepositResult = await dbQuery(
      `SELECT COALESCE(SUM(amount), 0) as total FROM deposit_records WHERE DATE(created_at) = CURDATE() AND status = 'completed'`
    );
    const todayDeposit = todayDepositResult[0]?.total || 0;
    
    // 获取最近5条充值记录
    const recentDeposits = await dbQuery(
      'SELECT * FROM deposit_records ORDER BY created_at DESC LIMIT 5'
    );
    
    // 获取最近5条提款记录
    const recentWithdrawals = await dbQuery(
      'SELECT * FROM withdraw_records ORDER BY created_at DESC LIMIT 5'
    );
    
    // 获取近7天充值趋势
    const depositTrend = await dbQuery(`
      SELECT 
        DATE(created_at) as date,
        SUM(amount) as total
      FROM deposit_records 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        AND status = 'completed'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    
    // 获取近7天用户增长
    const userTrend = await dbQuery(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM user_balances 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        AND is_internal_account = 0
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    
    // 格式化图表数据
    const formatChartData = (data, valueKey) => {
      const dates = [];
      const values = [];
      data.forEach(item => {
        dates.push(item.date ? new Date(item.date).toISOString().slice(5, 10) : '');
        values.push(parseFloat(item[valueKey]) || 0);
      });
      return { dates, values };
    };
    
    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalDeposit: parseFloat(totalDeposit).toFixed(2),
          realTotalDeposit: parseFloat(realTotalDeposit).toFixed(2), // 真实充值（排除内部操作）
          totalWithdraw: parseFloat(totalWithdraw).toFixed(2),
          platformBalance: platformBalance.toFixed(2),
          totalRobots,
          totalFollows,
          totalReferrals,
          totalAnnouncements,
          pendingWithdrawals,
          todayDeposit: parseFloat(todayDeposit).toFixed(2)
        },
        recentDeposits,
        recentWithdrawals,
        charts: {
          deposits: formatChartData(depositTrend, 'total'),
          users: formatChartData(userTrend, 'count')
        }
      }
    });
  } catch (error) {
    console.error('获取仪表盘数据失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取统计数据失败'
    });
  }
});

// ==================== 用户管理 ====================

/**
 * 获取用户列表
 * GET /api/admin/users
 */
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, wallet_address } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let whereClause = '';
    const params = [];
    
    if (wallet_address) {
      whereClause = 'WHERE wallet_address LIKE ?';
      params.push(`%${wallet_address}%`);
    }
    
    // 获取总数
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM user_balances ${whereClause}`,
      params
    );
    
    // 获取列表
    const list = await dbQuery(
      `SELECT * FROM user_balances ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
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
    console.error('获取用户列表失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取用户列表失败'
    });
  }
});

/**
 * 更新用户余额
 * PUT /api/admin/users/:wallet_address/balance
 */
router.put('/users/:wallet_address/balance', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const { usdt_balance, wld_balance, remark, is_internal_operation } = req.body;
    const admin_username = req.admin?.username || 'unknown';
    const admin_id = req.admin?.id || 0;
    
    if (usdt_balance === undefined && wld_balance === undefined) {
      return res.status(400).json({
        success: false,
        message: '请提供要更新的余额'
      });
    }
    
    const walletAddr = wallet_address.toLowerCase();
    
    // Get current balance for comparison and logging
    const currentBalanceResult = await dbQuery(
      'SELECT usdt_balance, wld_balance, manual_added_balance FROM user_balances WHERE wallet_address = ?',
      [walletAddr]
    );
    
    if (!currentBalanceResult || currentBalanceResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    const currentBalance = currentBalanceResult[0];
    const oldUsdt = parseFloat(currentBalance.usdt_balance) || 0;
    const oldWld = parseFloat(currentBalance.wld_balance) || 0;
    const newUsdt = usdt_balance !== undefined ? parseFloat(usdt_balance) : oldUsdt;
    const newWld = wld_balance !== undefined ? parseFloat(wld_balance) : oldWld;
    
    // Build update query
    const updateFields = [];
    const updateParams = [];
    
    // If internal operation, track manual_added_balance
    if (is_internal_operation === true) {
      if (usdt_balance !== undefined) {
        const diff = newUsdt - oldUsdt;
        
        if (diff > 0) {
          // Increasing balance, record to manual_added_balance
          updateFields.push('usdt_balance = ?');
          updateParams.push(newUsdt);
          updateFields.push('manual_added_balance = manual_added_balance + ?');
          updateParams.push(diff);
        } else {
          // Decreasing balance, don't record to manual_added_balance
          updateFields.push('usdt_balance = ?');
          updateParams.push(newUsdt);
        }
      }
      
      if (wld_balance !== undefined) {
        updateFields.push('wld_balance = ?');
        updateParams.push(newWld);
      }
    } else {
      // Normal update operation
      if (usdt_balance !== undefined) {
        updateFields.push('usdt_balance = ?');
        updateParams.push(newUsdt);
      }
      
      if (wld_balance !== undefined) {
        updateFields.push('wld_balance = ?');
        updateParams.push(newWld);
      }
    }
    
    updateFields.push('updated_at = NOW()');
    updateParams.push(walletAddr);
    
    // Execute update
    await dbQuery(
      `UPDATE user_balances SET ${updateFields.join(', ')} WHERE wallet_address = ?`,
      updateParams
    );
    
    // Build detailed operation log
    const operationDetail = JSON.stringify({
      wallet_address: walletAddr,
      before: { usdt: oldUsdt.toFixed(4), wld: oldWld.toFixed(4) },
      after: { usdt: newUsdt.toFixed(4), wld: newWld.toFixed(4) },
      change: { 
        usdt: (newUsdt - oldUsdt).toFixed(4), 
        wld: (newWld - oldWld).toFixed(4) 
      },
      is_internal_operation: is_internal_operation || false,
      remark: remark || ''
    });
    
    // Record to admin_operation_logs table
    await dbQuery(
      `INSERT INTO admin_operation_logs 
       (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address, created_at) 
       VALUES (?, ?, 'balance_update', ?, ?, ?, NOW())`,
      [
        admin_id,
        admin_username,
        walletAddr,
        operationDetail,
        req.ip || req.connection?.remoteAddress || 'unknown'
      ]
    );
    
    console.log(`[Admin] 余额更新: admin=${admin_username}, wallet=${walletAddr}, USDT: ${oldUsdt} -> ${newUsdt}, WLD: ${oldWld} -> ${newWld}, 备注: ${remark}`);
    
    res.json({
      success: true,
      message: '余额更新成功',
      data: {
        before: { usdt: oldUsdt.toFixed(4), wld: oldWld.toFixed(4) },
        after: { usdt: newUsdt.toFixed(4), wld: newWld.toFixed(4) }
      }
    });
  } catch (error) {
    console.error('更新用户余额失败:', error.message);
    res.status(500).json({
      success: false,
      message: '更新失败'
    });
  }
});

/**
 * 封禁用户
 * POST /api/admin/users/:wallet_address/ban
 */
router.post('/users/:wallet_address/ban', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const { reason } = req.body;
    const admin_username = req.admin.username;
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: '请提供封禁原因'
      });
    }
    
    const walletAddr = wallet_address.toLowerCase();
    
    // 检查用户是否存在
    const user = await dbQuery(
      'SELECT wallet_address, is_banned FROM user_balances WHERE wallet_address = ?',
      [walletAddr]
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    if (user.is_banned === 1) {
      return res.status(400).json({
        success: false,
        message: '该用户已被封禁'
      });
    }
    
    // 执行封禁操作
    await dbQuery(
      `UPDATE user_balances 
       SET is_banned = 1, 
           banned_at = NOW(), 
           ban_reason = ?, 
           banned_by = ?, 
           updated_at = NOW() 
       WHERE wallet_address = ?`,
      [reason, admin_username, walletAddr]
    );
    
    // 记录日志
    console.log(`[Admin Ban] 用户已被封禁: ${walletAddr}, 原因: ${reason}, 操作员: ${admin_username}`);
    
    res.json({
      success: true,
      message: '用户已成功封禁'
    });
  } catch (error) {
    console.error('封禁用户失败:', error.message);
    res.status(500).json({
      success: false,
      message: '封禁操作失败'
    });
  }
});

/**
 * 解封用户
 * POST /api/admin/users/:wallet_address/unban
 */
router.post('/users/:wallet_address/unban', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const admin_username = req.admin.username;
    
    const walletAddr = wallet_address.toLowerCase();
    
    // 检查用户是否存在
    const user = await dbQuery(
      'SELECT wallet_address, is_banned FROM user_balances WHERE wallet_address = ?',
      [walletAddr]
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    if (user.is_banned === 0) {
      return res.status(400).json({
        success: false,
        message: '该用户未被封禁'
      });
    }
    
    // 执行解封操作
    await dbQuery(
      `UPDATE user_balances 
       SET is_banned = 0, 
           banned_at = NULL, 
           ban_reason = NULL, 
           banned_by = NULL, 
           updated_at = NOW() 
       WHERE wallet_address = ?`,
      [walletAddr]
    );
    
    // 记录日志
    console.log(`[Admin Unban] 用户已解封: ${walletAddr}, 操作员: ${admin_username}`);
    
    res.json({
      success: true,
      message: '用户已成功解封'
    });
  } catch (error) {
    console.error('解封用户失败:', error.message);
    res.status(500).json({
      success: false,
      message: '解封操作失败'
    });
  }
});

// ==================== 充值记录 ====================

/**
 * 获取最后充值ID（用于初始化）
 * GET /api/admin/deposits/latest-id
 */
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
    const list = await dbQuery(
      `SELECT id, wallet_address, amount, token, tx_hash, status, created_at, completed_at FROM deposit_records ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
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

// ==================== 提款记录 ====================

/**
 * 获取最后提款ID（用于初始化）
 * GET /api/admin/withdrawals/latest-id
 */
router.get('/withdrawals/latest-id', authMiddleware, async (req, res) => {
  try {
    const result = await dbQuery('SELECT MAX(id) as lastId FROM withdraw_records');
    res.json({
      success: true,
      data: {
        lastId: result?.lastId || 0
      }
    });
  } catch (error) {
    console.error('获取最后提款ID失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取失败'
    });
  }
});

/**
 * 检查新提款（用于实时通知）
 * GET /api/admin/withdrawals/check-new?last_id=xxx
 */
router.get('/withdrawals/check-new', authMiddleware, async (req, res) => {
  try {
    const { last_id = 0 } = req.query;
    const lastId = parseInt(last_id);
    
    // 查询新提款数量和最新记录（只查询pending状态的）
    const newWithdrawals = await dbQuery(
      `SELECT * FROM withdraw_records WHERE id > ? AND status = 'pending' ORDER BY id DESC`,
      [lastId]
    );
    
    const newCount = newWithdrawals.length;
    const latestWithdraw = newCount > 0 ? newWithdrawals[0] : null;
    const maxId = newCount > 0 ? newWithdrawals[0].id : lastId;
    
    res.json({
      success: true,
      data: {
        newCount,
        lastId: maxId,
        latestWithdraw
      }
    });
  } catch (error) {
    console.error('检查新提款失败:', error.message);
    res.status(500).json({
      success: false,
      message: '检查失败'
    });
  }
});

/**
 * 获取提款记录列表
 * GET /api/admin/withdrawals
 */
router.get('/withdrawals', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, wallet_address, status, start_date, end_date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let whereConditions = [];
    const params = [];
    
    if (wallet_address) {
      whereConditions.push('wallet_address LIKE ?');
      params.push(`%${wallet_address}%`);
    }
    
    if (status) {
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
      `SELECT COUNT(*) as total FROM withdraw_records ${whereClause}`,
      params
    );
    
    // 获取列表
    const list = await dbQuery(
      `SELECT * FROM withdraw_records ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
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
    console.error('获取提款记录失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取提款记录失败'
    });
  }
});

/**
 * 获取提款统计
 * GET /api/admin/withdrawals/stats
 */
router.get('/withdrawals/stats', authMiddleware, async (req, res) => {
  try {
    // 获取总体统计
    const totalStats = await dbQuery(`
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_amount,
        SUM(CASE WHEN status = 'pending' OR status = 'processing' THEN amount ELSE 0 END) as pending_amount,
        COUNT(DISTINCT wallet_address) as unique_users
      FROM withdraw_records
    `);
    
    // 今日统计
    const todayStats = await dbQuery(`
      SELECT 
        COUNT(*) as today_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as today_amount,
        SUM(CASE WHEN status = 'pending' OR status = 'processing' THEN 1 ELSE 0 END) as today_pending_count
      FROM withdraw_records
      WHERE DATE(created_at) = CURDATE()
    `);
    
    // 本月统计
    const monthStats = await dbQuery(`
      SELECT 
        COUNT(*) as month_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as month_amount
      FROM withdraw_records
      WHERE DATE(created_at) >= DATE_FORMAT(NOW(), '%Y-%m-01')
    `);
    
    res.json({
      success: true,
      data: {
        total: {
          count: parseInt(totalStats[0]?.total_count) || 0,
          completed: parseInt(totalStats[0]?.completed_count) || 0,
          pending: parseInt(totalStats[0]?.pending_count) || 0,
          processing: parseInt(totalStats[0]?.processing_count) || 0,
          rejected: parseInt(totalStats[0]?.rejected_count) || 0,
          amount: parseFloat(totalStats[0]?.total_amount) || 0,
          pendingAmount: parseFloat(totalStats[0]?.pending_amount) || 0,
          uniqueUsers: parseInt(totalStats[0]?.unique_users) || 0
        },
        today: {
          count: parseInt(todayStats[0]?.today_count) || 0,
          amount: parseFloat(todayStats[0]?.today_amount) || 0,
          pendingCount: parseInt(todayStats[0]?.today_pending_count) || 0
        },
        month: {
          count: parseInt(monthStats[0]?.month_count) || 0,
          amount: parseFloat(monthStats[0]?.month_amount) || 0
        }
      }
    });
  } catch (error) {
    console.error('获取提款统计失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取提款统计失败'
    });
  }
});

/**
 * 处理提款请求
 * PUT /api/admin/withdrawals/:id/process
 */
router.put('/withdrawals/:id/process', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, tx_hash, action } = req.body;

    if (!['pending', 'processing', 'completed', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: '无效的状态'
      });
    }

    // 获取原始提款记录
    const withdrawalResult = await dbQuery('SELECT * FROM withdraw_records WHERE id = ?', [id]);
    const withdrawal = withdrawalResult[0];

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: '提款记录不存在'
      });
    }

    // 如果是拒绝或失败，需要退回余额（只有从非失败状态变为失败时才退回）
    if ((status === 'failed' || action === 'reject') && withdrawal.status !== 'failed' && withdrawal.status !== 'completed') {
      await dbQuery(
        'UPDATE user_balances SET usdt_balance = usdt_balance + ?, total_withdraw = total_withdraw - ? WHERE wallet_address = ?',
        [withdrawal.amount, withdrawal.amount, withdrawal.wallet_address]
      );
      console.log(`[Withdraw] 退回余额: ${withdrawal.amount} USDT -> ${withdrawal.wallet_address}`);
    }

    // 如果从失败状态重新处理（改回pending），需要再次扣除余额
    if (status === 'pending' && withdrawal.status === 'failed') {
      // 检查余额是否足够
      const balanceResult = await dbQuery(
        'SELECT usdt_balance FROM user_balances WHERE wallet_address = ?',
        [withdrawal.wallet_address]
      );
      const balance = balanceResult[0];

      const userBalance = parseFloat(balance?.usdt_balance) || 0;
      if (userBalance < parseFloat(withdrawal.amount)) {
        return res.status(400).json({
          success: false,
          message: `用户余额不足，当前余额: ${userBalance.toFixed(4)} USDT`
        });
      }

      await dbQuery(
        'UPDATE user_balances SET usdt_balance = usdt_balance - ?, total_withdraw = total_withdraw + ? WHERE wallet_address = ?',
        [withdrawal.amount, withdrawal.amount, withdrawal.wallet_address]
      );
      console.log(`[Withdraw] 重新扣除余额: ${withdrawal.amount} USDT <- ${withdrawal.wallet_address}`);
    }

    // 更新提款状态
    const updateParams = [status];
    let updateSql = 'UPDATE withdraw_records SET status = ?';

    if (tx_hash) {
      updateSql += ', tx_hash = ?';
      updateParams.push(tx_hash);
    }

    if (status === 'completed') {
      updateSql += ', completed_at = NOW()';
    }

    updateSql += ' WHERE id = ?';
    updateParams.push(id);

    await dbQuery(updateSql, updateParams);

    res.json({
      success: true,
      message: '处理成功'
    });
  } catch (error) {
    console.error('处理提款失败:', error.message);
    res.status(500).json({
      success: false,
      message: '处理失败'
    });
  }
});

/**
 * 自动转账
 * POST /api/admin/withdrawals/:id/auto-transfer
 *
 * 请求体：
 * {
 *   "to_address": "0x..." // 接收地址（用户的钱包地址）
 * }
 *
 * 返回：
 * {
 *   "success": true/false,
 *   "message": "转账成功/失败原因",
 *   "data": {
 *     "tx_hash": "0x...",
 *     "block_number": 12345,
 *     "amount": 100.5
 *   }
 * }
 */
router.post('/withdrawals/:id/auto-transfer', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { to_address } = req.body;

    // 验证参数
    if (!to_address) {
      return res.status(400).json({
        success: false,
        message: '请提供接收地址'
      });
    }

    // 检查功能是否启用
    if (process.env.ENABLE_AUTO_TRANSFER !== 'true') {
      return res.status(403).json({
        success: false,
        message: '自动转账功能未启用'
      });
    }

    // 获取提款记录
    const withdrawal = await dbQuery('SELECT * FROM withdraw_records WHERE id = ?', [id]);

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: '提款记录不存在'
      });
    }

    // 检查提款状态
    if (withdrawal.status !== 'processing' && withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `提款状态为 "${withdrawal.status}"，无法进行自动转账`
      });
    }

    // 记录转账尝试
    console.log(`[Auto-Transfer] 开始处理提款 ID: ${id}`);
    console.log(`[Auto-Transfer] 金额: ${withdrawal.amount} ${withdrawal.token}`);
    console.log(`[Auto-Transfer] 接收地址: ${to_address}`);

    // 执行转账
    const transferResult = await transferUSDT(
      to_address,
      withdrawal.amount,
      id,
      withdrawal.wallet_address
    );

    if (!transferResult.success) {
      // 记录转账失败
      console.error(`[Auto-Transfer] ❌ 转账失败: ${transferResult.error}`);

      return res.status(400).json({
        success: false,
        message: `自动转账失败: ${transferResult.error}`,
        error_detail: transferResult.error
      });
    }

    // 更新提款记录状态为已完成
    await dbQuery(
      'UPDATE withdraw_records SET status = ?, tx_hash = ?, completed_at = NOW() WHERE id = ?',
      ['completed', transferResult.txHash, id]
    );

    console.log(`[Auto-Transfer] ✓ 提款 ${id} 已完成`);
    console.log(`[Auto-Transfer] 交易哈希: ${transferResult.txHash}`);
    console.log(`[Auto-Transfer] 区块号: ${transferResult.blockNumber}`);

    // 记录管理员操作日志
    secureLog('自动转账成功', {
      admin: req.admin.username,
      withdrawal_id: id,
      tx_hash: transferResult.txHash,
      amount: withdrawal.amount
    });

    res.json({
      success: true,
      message: '转账成功',
      data: {
        tx_hash: transferResult.txHash,
        block_number: transferResult.blockNumber,
        amount: transferResult.amount,
        gas_used: transferResult.gasUsed
      }
    });
  } catch (error) {
    console.error('自动转账失败:', error.message);

    res.status(500).json({
      success: false,
      message: '自动转账失败: ' + error.message
    });
  }
});

/**
 * 获取平台钱包信息
 * GET /api/admin/wallet-info
 *
 * 返回平台用于自动转账的钱包地址和余额
 */
router.get('/wallet-info', authMiddleware, async (req, res) => {
  try {
    const accountAddress = getAccountAddress();

    if (!accountAddress) {
      return res.status(400).json({
        success: false,
        message: '自动转账功能未启用或未配置'
      });
    }

    const balance = await getAccountBalance();

    res.json({
      success: true,
      data: {
        wallet_address: accountAddress,
        usdt_balance: balance,
        enable_auto_transfer: process.env.ENABLE_AUTO_TRANSFER === 'true'
      }
    });
  } catch (error) {
    console.error('获取钱包信息失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取钱包信息失败'
    });
  }
});

/**
 * 获取提款的转账记录
 * GET /api/admin/withdrawals/:id/transfer-record
 * 
 * 返回该提款ID对应的转账哈希记录
 */
router.get('/withdrawals/:id/transfer-record', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[API] 获取提款 ${id} 的转账记录`);

    // 先从 transfer_logs 表查询（自动转账记录）
    const transferLog = await dbQuery(
      'SELECT tx_hash, from_address, to_address, amount, block_number, gas_used, status, created_at FROM transfer_logs WHERE withdrawal_id = ? ORDER BY created_at DESC LIMIT 1',
      [id]
    );

    console.log(`[API] transfer_logs 查询结果:`, transferLog);

    if (transferLog && transferLog.tx_hash) {
      console.log(`[API] ✅ 从 transfer_logs 找到哈希: ${transferLog.tx_hash}`);
      return res.json({
        success: true,
        data: transferLog
      });
    }

    // 如果 transfer_logs 没有记录，从 withdraw_records 表查询（手动输入的哈希）
    const withdrawal = await dbQuery(
      'SELECT tx_hash, to_address, amount, created_at FROM withdraw_records WHERE id = ?',
      [id]
    );

    console.log(`[API] withdraw_records 查询结果:`, withdrawal);

    if (withdrawal && withdrawal.tx_hash) {
      console.log(`[API] ✅ 从 withdraw_records 找到哈希: ${withdrawal.tx_hash}`);
      return res.json({
        success: true,
        data: {
          tx_hash: withdrawal.tx_hash,
          to_address: withdrawal.to_address,
          amount: withdrawal.amount,
          created_at: withdrawal.created_at,
          status: 'completed'
        }
      });
    }

    // 都没有找到
    console.log(`[API] ❌ 未找到提款 ${id} 的转账记录`);
    return res.json({
      success: false,
      message: '未找到该提款的转账记录'
    });
  } catch (error) {
    console.error('获取转账记录失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取转账记录失败'
    });
  }
});

// ==================== 公告管理 ====================

/**
 * 获取公告列表
 * GET /api/admin/announcements
 */
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

// ==================== 机器人购买记录 ====================

/**
 * 获取机器人购买记录
 * GET /api/admin/robots
 * 
 * 参数：
 * - status: active（活跃）/ expired（已过期）/ all（全部）
 * - robot_type: cex/dex/grid/high 可选筛选
 */
router.get('/robots', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, wallet_address, status = 'all', robot_type } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let whereConditions = [];
    const params = [];
    
    if (wallet_address) {
      whereConditions.push('wallet_address LIKE ?');
      params.push(`%${wallet_address}%`);
    }
    
    // 根据状态筛选（使用 end_time 精确判断）
    if (status === 'active') {
      whereConditions.push('(status = "active" AND end_time > NOW())');
    } else if (status === 'expired') {
      whereConditions.push('(status = "expired" OR (status = "active" AND end_time <= NOW()))');
    }
    
    // 根据机器人类型筛选
    if (robot_type) {
      whereConditions.push('robot_type = ?');
      params.push(robot_type);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // 获取总数
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM robot_purchases ${whereClause}`,
      params
    );
    
    // 获取列表（更新为使用 end_time 精确判断到期状态）
    const list = await dbQuery(
      `SELECT rp.*, 
        CASE WHEN rp.status = 'active' AND rp.end_time > NOW() THEN 'active' ELSE 'expired' END as current_status,
        TIMESTAMPDIFF(HOUR, NOW(), rp.end_time) as hours_remaining,
        CASE 
          WHEN rp.robot_type = 'high' THEN rp.is_quantified
          ELSE (SELECT COUNT(*) > 0 FROM robot_quantify_logs WHERE robot_purchase_id = rp.id AND DATE(created_at) = CURDATE())
        END as today_quantified
       FROM robot_purchases rp ${whereClause} ORDER BY rp.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    
    // 将 today_quantified 映射到 is_quantified 供前端显示
    const processedList = list.map(item => ({
      ...item,
      is_quantified: item.robot_type === 'high' ? item.is_quantified : item.today_quantified
    }));
    
    res.json({
      success: true,
      data: {
        list: processedList,
        // 修复：dbQuery返回数组，需要取第一个元素
        total: countResult?.[0]?.total || 0,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取机器人购买记录失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取记录失败'
    });
  }
});

/**
 * 获取机器人统计数据
 * GET /api/admin/robots/stats
 */
router.get('/robots/stats', authMiddleware, async (req, res) => {
  try {
    // 活跃机器人数量（使用 end_time 精确判断）
    const activeResult = await dbQuery(
      `SELECT COUNT(*) as count FROM robot_purchases WHERE status = 'active' AND end_time > NOW()`
    );
    
    // 已过期机器人数量（使用 end_time 精确判断）
    const expiredResult = await dbQuery(
      `SELECT COUNT(*) as count FROM robot_purchases WHERE status != 'active' OR end_time <= NOW()`
    );
    
    // 总投资金额
    const totalResult = await dbQuery(
      `SELECT COALESCE(SUM(price), 0) as total FROM robot_purchases`
    );
    
    // 今日新增
    const todayResult = await dbQuery(
      `SELECT COUNT(*) as count FROM robot_purchases WHERE DATE(created_at) = CURDATE()`
    );
    
    res.json({
      success: true,
      data: {
        // 修复：dbQuery返回数组，需要取第一个元素
        activeCount: activeResult?.[0]?.count || 0,
        expiredCount: expiredResult?.[0]?.count || 0,
        totalInvestment: parseFloat(totalResult?.[0]?.total || 0).toFixed(2),
        todayCount: todayResult?.[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('获取机器人统计失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取统计失败'
    });
  }
});

// ==================== 推荐关系 ====================

/**
 * 获取推荐统计
 * GET /api/admin/referrals/stats
 */
router.get('/referrals/stats', authMiddleware, async (req, res) => {
  try {
    // 推荐人总数（有发起推荐的用户数）
    const referrersResult = await dbQuery(
      `SELECT COUNT(DISTINCT referrer_address) as count FROM user_referrals`
    );
    
    // 被推荐人总数
    const referredResult = await dbQuery(
      `SELECT COUNT(*) as count FROM user_referrals`
    );
    
    // 累计推荐奖励
    const rewardsResult = await dbQuery(
      `SELECT COALESCE(SUM(reward_amount), 0) as total FROM referral_rewards`
    );
    
    // 今日新增推荐
    const todayResult = await dbQuery(
      `SELECT COUNT(*) as count FROM user_referrals WHERE DATE(created_at) = CURDATE()`
    );
    
    res.json({
      success: true,
      data: {
        totalReferrers: referrersResult[0]?.count || 0,
        totalReferred: referredResult[0]?.count || 0,
        totalRewards: parseFloat(rewardsResult[0]?.total || 0).toFixed(4),
        todayNew: todayResult[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('获取推荐统计失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取统计失败'
    });
  }
});

/**
 * 获取推荐关系列表
 * GET /api/admin/referrals
 */
router.get('/referrals', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, wallet_address, referrer_address } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let whereConditions = [];
    const params = [];
    
    if (wallet_address) {
      whereConditions.push('ur.wallet_address LIKE ?');
      params.push(`%${wallet_address}%`);
    }
    
    if (referrer_address) {
      whereConditions.push('ur.referrer_address LIKE ?');
      params.push(`%${referrer_address}%`);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // 获取总数
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM user_referrals ur ${whereClause}`,
      params
    );
    
    // 获取列表，包含计算字段
    // 修正：使用 referral_rewards 表的实际奖励数据，而非硬编码比例
    const list = await dbQuery(
      `SELECT 
        ur.id,
        ur.wallet_address,
        ur.referrer_address,
        ur.referrer_code,
        ur.created_at,
        UPPER(RIGHT(ur.wallet_address, 8)) as referral_code,
        (SELECT COUNT(*) FROM user_referrals WHERE referrer_address = ur.wallet_address) as referral_count,
        COALESCE((SELECT SUM(reward_amount) FROM referral_rewards 
                  WHERE referrer_address = ur.wallet_address), 0) as total_reward,
        COALESCE((SELECT broker_level FROM team_rewards 
                  WHERE wallet_address = ur.wallet_address 
                  ORDER BY created_at DESC LIMIT 1), 0) as level
       FROM user_referrals ur
       ${whereClause} 
       ORDER BY ur.created_at DESC 
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
    console.error('获取推荐关系失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取推荐关系失败'
    });
  }
});

/**
 * 查询用户的上下级关系（详细视图）
 * GET /api/admin/referrals/hierarchy?wallet_address=0x...
 * 
 * 返回：
 * - target: 目标用户信息
 * - referrer: 推荐人信息（上级）
 * - direct_members: 直推成员列表（下级）
 */
router.get('/referrals/hierarchy', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.query;
    
    if (!wallet_address) {
      return res.status(400).json({
        success: false,
        message: '请提供钱包地址'
      });
    }
    
    const walletAddr = wallet_address.toLowerCase();
    
    // 1. 获取目标用户信息
    const targetUser = await dbQuery(
      `SELECT 
        ub.wallet_address,
        ub.usdt_balance,
        ub.wld_balance,
        ub.total_deposit,
        ub.total_withdraw,
        ub.created_at,
        UPPER(RIGHT(ub.wallet_address, 8)) as referral_code
       FROM user_balances ub
       WHERE ub.wallet_address = ?`,
      [walletAddr]
    );
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 2. 获取目标用户的推荐人（上级）
    const referralInfo = await dbQuery(
      `SELECT 
        ur.referrer_address,
        ur.referrer_code,
        ur.created_at as bindTime
       FROM user_referrals ur
       WHERE ur.wallet_address = ?`,
      [walletAddr]
    );
    
    let referrer = null;
    if (referralInfo && referralInfo.referrer_address) {
      // 获取推荐人详细信息
      const referrerDetails = await dbQuery(
        `SELECT 
          ub.wallet_address,
          ub.usdt_balance,
          ub.total_deposit,
          ub.created_at,
          UPPER(RIGHT(ub.wallet_address, 8)) as referral_code,
          (SELECT COUNT(*) FROM user_referrals WHERE referrer_address = ub.wallet_address) as direct_count,
          COALESCE((SELECT SUM(reward_amount) FROM referral_rewards WHERE wallet_address = ub.wallet_address), 0) as total_reward
         FROM user_balances ub
         WHERE ub.wallet_address = ?`,
        [referralInfo.referrer_address]
      );
      
      if (referrerDetails) {
        referrer = {
          ...referrerDetails,
          bindTime: referralInfo.bindTime
        };
      }
    }
    
    // 3. 获取目标用户的直推成员（下级）
    const directMembers = await dbQuery(
      `SELECT 
        ur.wallet_address,
        ur.created_at as bindTime,
        UPPER(RIGHT(ur.wallet_address, 8)) as referral_code,
        ub.usdt_balance,
        ub.total_deposit,
        ub.created_at as registerTime,
        (SELECT COUNT(*) FROM user_referrals WHERE referrer_address = ur.wallet_address) as sub_count,
        (SELECT COUNT(*) FROM robot_purchases WHERE wallet_address = ur.wallet_address AND status = 'active') as robot_count,
        COALESCE((SELECT SUM(price) FROM robot_purchases WHERE wallet_address = ur.wallet_address), 0) as total_investment
       FROM user_referrals ur
       LEFT JOIN user_balances ub ON ur.wallet_address = ub.wallet_address
       WHERE ur.referrer_address = ?
       ORDER BY ur.created_at DESC`,
      [walletAddr]
    );
    
    // 4. 计算统计数据
    const directCount = directMembers.length;
    
    // 获取该用户的总推荐奖励
    const rewardResult = await dbQuery(
      `SELECT COALESCE(SUM(reward_amount), 0) as total FROM referral_rewards WHERE wallet_address = ?`,
      [walletAddr]
    );
    const totalReward = parseFloat(rewardResult?.total) || 0;
    
    // 获取该用户购买的机器人
    const robotResult = await dbQuery(
      `SELECT COUNT(*) as count, COALESCE(SUM(price), 0) as total FROM robot_purchases WHERE wallet_address = ? AND status = 'active'`,
      [walletAddr]
    );
    
    res.json({
      success: true,
      data: {
        target: {
          ...targetUser,
          direct_count: directCount,
          total_reward: totalReward.toFixed(4),
          robot_count: robotResult?.[0]?.count || 0,
          total_investment: parseFloat(robotResult?.[0]?.total || 0).toFixed(4)
        },
        referrer: referrer,
        direct_members: directMembers
      }
    });
  } catch (error) {
    console.error('获取用户上下级关系失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取用户上下级关系失败'
    });
  }
});

/**
 * 手动绑定推荐关系
 * POST /api/admin/referrals/bind
 * body: { wallet_address, referrer_address, retroactive_reward }
 * 
 * 用于管理员手动修复遗漏的推荐关系
 * retroactive_reward: 是否补发历史奖励
 */
router.post('/referrals/bind', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, referrer_address, retroactive_reward = false } = req.body;
    
    if (!wallet_address || !referrer_address) {
      return res.status(400).json({
        success: false,
        message: '请提供用户钱包地址和推荐人地址'
      });
    }
    
    const walletAddr = wallet_address.toLowerCase();
    const referrerAddr = referrer_address.toLowerCase();
    
    // 检查用户是否存在
    const userExists = await dbQuery(
      'SELECT wallet_address FROM user_balances WHERE wallet_address = ?',
      [walletAddr]
    );
    
    // userExists is an array, check length
    if (!userExists || userExists.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 检查推荐人是否存在
    const referrerExists = await dbQuery(
      'SELECT wallet_address FROM user_balances WHERE wallet_address = ?',
      [referrerAddr]
    );
    
    // referrerExists is an array, check length
    if (!referrerExists || referrerExists.length === 0) {
      return res.status(404).json({
        success: false,
        message: '推荐人不存在'
      });
    }
    
    // 不能自己推荐自己
    if (walletAddr === referrerAddr) {
      return res.status(400).json({
        success: false,
        message: '不能自己推荐自己'
      });
    }
    
    // 检查是否已有推荐关系
    const existingRef = await dbQuery(
      'SELECT id, referrer_address FROM user_referrals WHERE wallet_address = ?',
      [walletAddr]
    );
    
    // existingRef is an array, check if it has items and if referrer_address is not null
    if (existingRef && existingRef.length > 0 && existingRef[0].referrer_address) {
      return res.status(400).json({
        success: false,
        message: `该用户已有推荐人: ${existingRef[0].referrer_address.slice(-10)}`
      });
    }
    
    // 生成推荐码（推荐人地址后8位）
    const referrerCode = referrerAddr.slice(-8).toLowerCase();
    
    // 插入或更新推荐关系
    if (existingRef && existingRef.length > 0) {
      // 记录已存在但没有推荐人，更新记录
      await dbQuery(
        'UPDATE user_referrals SET referrer_address = ?, referrer_code = ? WHERE wallet_address = ?',
        [referrerAddr, referrerCode, walletAddr]
      );
    } else {
      // 记录不存在，插入新记录
      await dbQuery(
        'INSERT INTO user_referrals (wallet_address, referrer_address, referrer_code, created_at) VALUES (?, ?, ?, NOW())',
        [walletAddr, referrerAddr, referrerCode]
      );
    }
    
    console.log(`[Admin] 手动绑定推荐关系: ${walletAddr.slice(-10)} -> ${referrerAddr.slice(-10)}`);
    
    // 如果需要补发历史奖励
    let retroactiveAmount = 0;
    if (retroactive_reward) {
      // 查询该用户过去所有的量化收益
      const quantifyLogs = await dbQuery(
        'SELECT id, robot_purchase_id, robot_name, earnings FROM robot_quantify_logs WHERE wallet_address = ?',
        [walletAddr]
      );
      
      if (quantifyLogs.length > 0) {
        // 推荐奖励比例：1级30%
        const rewardRate = 0.30;
        
        for (const log of quantifyLogs) {
          const earnings = parseFloat(log.earnings) || 0;
          if (earnings > 0) {
            const rewardAmount = earnings * rewardRate;
            retroactiveAmount += rewardAmount;
            
            // 记录补发的推荐奖励
            await dbQuery(
              `INSERT INTO referral_rewards 
              (wallet_address, from_wallet, level, reward_rate, reward_amount, source_type, source_id, robot_name, source_amount, created_at) 
              VALUES (?, ?, 1, 30, ?, 'retroactive', ?, ?, ?, NOW())`,
              [referrerAddr, walletAddr, rewardAmount, log.robot_purchase_id, log.robot_name || 'Unknown', earnings]
            );
          }
        }
        
        // 增加推荐人余额
        if (retroactiveAmount > 0) {
          await dbQuery(
            'UPDATE user_balances SET usdt_balance = usdt_balance + ?, updated_at = NOW() WHERE wallet_address = ?',
            [retroactiveAmount, referrerAddr]
          );
          
          console.log(`[Admin] 补发推荐奖励: ${retroactiveAmount.toFixed(4)} USDT -> ${referrerAddr.slice(-10)}`);
        }
      }
    }
    
    res.json({
      success: true,
      message: retroactive_reward 
        ? `推荐关系绑定成功，已补发奖励 ${retroactiveAmount.toFixed(4)} USDT` 
        : '推荐关系绑定成功',
      data: {
        retroactive_amount: retroactiveAmount.toFixed(4)
      }
    });
  } catch (error) {
    console.error('绑定推荐关系失败:', error.message);
    res.status(500).json({
      success: false,
      message: '绑定失败: ' + error.message
    });
  }
});

/**
 * 预览补发奖励金额
 * GET /api/admin/referrals/preview-retroactive?wallet_address=0x...
 * 
 * 查询如果绑定该用户，可以补发多少奖励
 */
router.get('/referrals/preview-retroactive', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.query;
    
    if (!wallet_address) {
      return res.status(400).json({
        success: false,
        message: '请提供用户钱包地址'
      });
    }
    
    const walletAddr = wallet_address.toLowerCase();
    
    // 查询该用户过去所有的量化收益
    const quantifyLogs = await dbQuery(
      'SELECT SUM(earnings) as total_earnings, COUNT(*) as count FROM robot_quantify_logs WHERE wallet_address = ?',
      [walletAddr]
    );
    
    const totalEarnings = parseFloat(quantifyLogs[0]?.total_earnings) || 0;
    const quantifyCount = parseInt(quantifyLogs[0]?.count) || 0;
    
    // 查询该用户购买的机器人
    const robotInfo = await dbQuery(
      'SELECT COUNT(*) as count, COALESCE(SUM(price), 0) as total FROM robot_purchases WHERE wallet_address = ?',
      [walletAddr]
    );
    
    // 计算可补发的奖励（1级30%）
    const retroactiveReward = totalEarnings * 0.30;
    
    res.json({
      success: true,
      data: {
        wallet_address: walletAddr,
        robot_count: robotInfo?.count || 0,
        total_investment: parseFloat(robotInfo?.total || 0).toFixed(4),
        quantify_count: quantifyCount,
        total_earnings: totalEarnings.toFixed(4),
        retroactive_reward: retroactiveReward.toFixed(4),
        reward_rate: '30%'
      }
    });
  } catch (error) {
    console.error('预览补发奖励失败:', error.message);
    res.status(500).json({
      success: false,
      message: '查询失败'
    });
  }
});

// ==================== 质押管理 ====================

/**
 * 获取质押统计
 * GET /api/admin/pledges/stats
 */
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

// ==================== 跟单管理 ====================

/**
 * 获取跟单统计
 * GET /api/admin/follows/stats
 * 
 * 跟单数据来自 robot_purchases 表中 robot_type 为 'grid' 或 'high' 的记录
 */
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

// ==================== 交易记录 ====================

/**
 * 获取交易统计
 * GET /api/admin/transactions/stats
 */
router.get('/transactions/stats', authMiddleware, async (req, res) => {
  try {
    // 尝试从数据库获取真实数据
    const depositCount = await dbQuery('SELECT COUNT(*) as count FROM deposit_records');
    const withdrawCount = await dbQuery('SELECT COUNT(*) as count FROM withdraw_records');
    const depositSum = await dbQuery('SELECT SUM(amount) as total FROM deposit_records WHERE status = "completed"');
    const withdrawSum = await dbQuery('SELECT SUM(amount) as total FROM withdraw_records WHERE status = "completed"');
    
    res.json({
      success: true,
      data: {
        totalCount: (depositCount?.count || 0) + (withdrawCount?.count || 0),
        totalIn: parseFloat(depositSum?.total || 0).toFixed(2),
        totalOut: parseFloat(withdrawSum?.total || 0).toFixed(2),
        todayCount: Math.floor(Math.random() * 50) + 10 // 模拟今日数据
      }
    });
  } catch (error) {
    console.error('获取交易统计失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取交易统计失败'
    });
  }
});

/**
 * 获取交易记录列表
 * GET /api/admin/transactions
 */
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, wallet_address, type, start_date, end_date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    // 合并充值和提款记录作为交易记录
    let allTransactions = [];
    
    // 获取充值记录
    const deposits = await dbQuery(
      `SELECT id, wallet_address, amount, 'USDT' as token, 'deposit' as type, 'in' as direction, 
       created_at, status FROM deposit_records ORDER BY created_at DESC LIMIT 50`
    );
    
    // 获取提款记录
    const withdrawals = await dbQuery(
      `SELECT id, wallet_address, amount, 'USDT' as token, 'withdraw' as type, 'out' as direction,
       created_at, status FROM withdraw_records ORDER BY created_at DESC LIMIT 50`
    );
    
    // 转换为交易记录格式
    deposits.forEach((d, i) => {
      allTransactions.push({
        id: `D${d.id}`,
        tx_id: `TX${Date.now()}${i}D`.slice(0, 14),
        wallet_address: d.wallet_address,
        type: 'deposit',
        direction: 'in',
        amount: d.amount,
        token: 'USDT',
        balance_after: (Math.random() * 10000 + 1000).toFixed(2),
        remark: '用户充值',
        created_at: d.created_at
      });
    });
    
    withdrawals.forEach((w, i) => {
      allTransactions.push({
        id: `W${w.id}`,
        tx_id: `TX${Date.now()}${i}W`.slice(0, 14),
        wallet_address: w.wallet_address,
        type: 'withdraw',
        direction: 'out',
        amount: w.amount,
        token: 'USDT',
        balance_after: (Math.random() * 10000 + 1000).toFixed(2),
        remark: '用户提款',
        created_at: w.created_at
      });
    });
    
    // 按时间排序
    allTransactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // 分页
    const list = allTransactions.slice(offset, offset + parseInt(pageSize));
    
    res.json({
      success: true,
      data: {
        list,
        total: allTransactions.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取交易记录失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取交易记录失败'
    });
  }
});

// ==================== 系统日志 ====================

/**
 * 获取系统日志列表
 * GET /api/admin/logs
 */
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

// ==================== 机器人购买记录管理（详情和用户查询） ====================
// Note: /robots and /robots/stats routes are defined above (lines 1918, 1994)
// Those routes use end_time for accurate expiry detection

/**
 * 获取机器人购买详情
 * GET /api/admin/robots/:id
 */
router.get('/robots/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 获取机器人购买记录
    const robotResult = await dbQuery(
      `SELECT * FROM robot_purchases WHERE id = ?`,
      [id]
    );
    
    if (!robotResult || robotResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: '记录不存在'
      });
    }
    
    const robot = robotResult[0];
    
    // 获取用户信息
    const userInfoResult = await dbQuery(
      `SELECT usdt_balance, wld_balance, total_deposit, total_withdraw, created_at 
       FROM user_balances WHERE wallet_address = ?`,
      [robot.wallet_address]
    );
    const userInfo = userInfoResult && userInfoResult.length > 0 ? userInfoResult[0] : null;
    
    // 获取量化日志
    const quantifyLogs = await dbQuery(
      `SELECT id, earnings, cumulative_earnings, status, remark, created_at 
       FROM robot_quantify_logs 
       WHERE robot_purchase_id = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [id]
    );
    
    // 获取该用户的推荐奖励（本机器人产生的）
    const referralRewards = await dbQuery(
      `SELECT wallet_address, level, reward_rate, reward_amount, created_at 
       FROM referral_rewards 
       WHERE source_id = ? AND source_type = 'robot'
       ORDER BY created_at DESC`,
      [id]
    );
    
    res.json({
      success: true,
      data: {
        robot,  // Single robot object now
        userInfo,  // Single user object or null
        quantifyLogs,  // Array of logs
        referralRewards  // Array of rewards
      }
    });
  } catch (error) {
    console.error('获取机器人详情失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取详情失败'
    });
  }
});

/**
 * 获取用户的所有机器人数据
 * GET /api/admin/robots/user/:wallet_address
 */
router.get('/robots/user/:wallet_address', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const walletAddr = wallet_address.toLowerCase();
    
    // 获取用户基本信息
    const userInfo = await dbQuery(
      `SELECT * FROM user_balances WHERE wallet_address = ?`,
      [walletAddr]
    );
    
    if (!userInfo) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 获取所有机器人购买记录
    const robots = await dbQuery(
      `SELECT * FROM robot_purchases WHERE wallet_address = ? ORDER BY created_at DESC`,
      [walletAddr]
    );
    
    // 获取量化收益统计
    const earningsStats = await dbQuery(
      `SELECT 
        COALESCE(SUM(earning_amount), 0) as total_earnings,
        COUNT(*) as earnings_count
      FROM robot_earnings 
      WHERE wallet_address = ?`,
      [walletAddr]
    );
    
    // 获取量化日志统计
    const quantifyStats = await dbQuery(
      `SELECT 
        COUNT(*) as total_quantify_count,
        COALESCE(SUM(earnings), 0) as total_quantify_earnings
      FROM robot_quantify_logs 
      WHERE wallet_address = ?`,
      [walletAddr]
    );
    
    // 获取推荐奖励统计
    const referralStats = await dbQuery(
      `SELECT 
        COALESCE(SUM(reward_amount), 0) as total_referral_rewards,
        COUNT(*) as referral_count
      FROM referral_rewards 
      WHERE from_wallet = ?`,
      [walletAddr]
    );
    
    res.json({
      success: true,
      data: {
        userInfo,
        robots,
        stats: {
          totalEarnings: parseFloat(earningsStats?.total_earnings || 0).toFixed(4),
          earningsCount: earningsStats?.earnings_count || 0,
          totalQuantifyEarnings: parseFloat(quantifyStats?.total_quantify_earnings || 0).toFixed(4),
          quantifyCount: quantifyStats?.total_quantify_count || 0,
          totalReferralRewards: parseFloat(referralStats?.total_referral_rewards || 0).toFixed(4),
          referralCount: referralStats?.referral_count || 0
        }
      }
    });
  } catch (error) {
    console.error('获取用户机器人数据失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取数据失败'
    });
  }
});

/**
 * 获取量化日志列表
 * GET /api/admin/quantify-logs
 */
router.get('/quantify-logs', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, wallet_address, robot_purchase_id, start_date, end_date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let whereConditions = [];
    const params = [];
    
    if (wallet_address) {
      whereConditions.push('ql.wallet_address LIKE ?');
      params.push(`%${wallet_address}%`);
    }
    
    if (robot_purchase_id) {
      whereConditions.push('ql.robot_purchase_id = ?');
      params.push(robot_purchase_id);
    }
    
    if (start_date) {
      whereConditions.push('DATE(ql.created_at) >= ?');
      params.push(start_date);
    }
    
    if (end_date) {
      whereConditions.push('DATE(ql.created_at) <= ?');
      params.push(end_date);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // 获取总数
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM robot_quantify_logs ql ${whereClause}`,
      params
    );
    
    // 获取列表（关联机器人信息）
    const list = await dbQuery(
      `SELECT 
        ql.*,
        rp.robot_name,
        rp.robot_type,
        rp.price as robot_price,
        rp.daily_profit,
        rp.status as robot_status
      FROM robot_quantify_logs ql
      LEFT JOIN robot_purchases rp ON ql.robot_purchase_id = rp.id
      ${whereClause}
      ORDER BY ql.created_at DESC
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
    console.error('获取量化日志失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取日志失败'
    });
  }
});

/**
 * 获取机器人收益统计（全平台汇总）
 * GET /api/admin/robots/earnings-summary
 */
router.get('/robots/earnings-summary', authMiddleware, async (req, res) => {
  try {
    // 按机器人类型统计
    const robotTypeStats = await dbQuery(
      `SELECT 
        robot_type,
        COUNT(*) as robot_count,
        COALESCE(SUM(price), 0) as total_investment,
        COALESCE(SUM(total_profit), 0) as total_profit,
        COALESCE(AVG(daily_profit), 0) as avg_daily_profit
      FROM robot_purchases
      GROUP BY robot_type
      ORDER BY total_investment DESC`
    );
    
    // 今日量化统计
    const todayStats = await dbQuery(
      `SELECT 
        COUNT(*) as quantify_count,
        COUNT(DISTINCT wallet_address) as user_count,
        COALESCE(SUM(earnings), 0) as total_earnings
      FROM robot_quantify_logs
      WHERE DATE(created_at) = CURDATE()`
    );
    
    // 近7天量化趋势
    const weeklyTrend = await dbQuery(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as quantify_count,
        COALESCE(SUM(earnings), 0) as total_earnings
      FROM robot_quantify_logs
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC`
    );
    
    // Top 10 活跃用户（按量化收益排名）
    const topUsers = await dbQuery(
      `SELECT 
        wallet_address,
        COUNT(*) as robot_count,
        COALESCE(SUM(price), 0) as total_investment,
        COALESCE(SUM(total_profit), 0) as total_profit
      FROM robot_purchases
      GROUP BY wallet_address
      ORDER BY total_profit DESC
      LIMIT 10`
    );
    
    res.json({
      success: true,
      data: {
        robotTypeStats: robotTypeStats.map(item => ({
          ...item,
          total_investment: parseFloat(item.total_investment || 0).toFixed(2),
          total_profit: parseFloat(item.total_profit || 0).toFixed(4),
          avg_daily_profit: parseFloat(item.avg_daily_profit || 0).toFixed(2),
          profit_rate: item.total_investment > 0 
            ? ((parseFloat(item.total_profit) / parseFloat(item.total_investment)) * 100).toFixed(2)
            : '0.00'
        })),
        todayStats: {
          quantify_count: todayStats[0]?.quantify_count || 0,
          user_count: todayStats[0]?.user_count || 0,
          total_earnings: parseFloat(todayStats[0]?.total_earnings || 0).toFixed(4)
        },
        weeklyTrend: weeklyTrend.map(item => ({
          date: item.date,
          quantify_count: item.quantify_count,
          total_earnings: parseFloat(item.total_earnings || 0).toFixed(4)
        })),
        topUsers: topUsers.map(item => ({
          wallet_address: item.wallet_address,
          robot_count: item.robot_count,
          total_investment: parseFloat(item.total_investment || 0).toFixed(2),
          total_profit: parseFloat(item.total_profit || 0).toFixed(4)
        }))
      }
    });
  } catch (error) {
    console.error('获取机器人收益汇总失败:', error.message);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      success: false,
      message: '获取收益汇总失败'
    });
  }
});

// ==================== 辅助函数 ====================

/**
 * 生成日志模拟数据
 * 注意：系统日志目前仍使用模拟数据，后续可接入真实日志系统
 */
function generateLogMockData(count) {
  const levels = ['info', 'info', 'info', 'warning', 'error', 'security'];
  const actions = ['login', 'logout', 'deposit', 'withdraw', 'balance_change', 'settings', 'api'];
  const statuses = ['success', 'success', 'success', 'failed'];
  const messages = [
    '用户登录成功',
    '用户登出',
    '处理充值请求',
    '处理提款请求',
    '更新用户余额',
    '修改系统设置',
    'API请求处理',
    '登录失败：密码错误',
    '检测到异常登录尝试',
    '安全警告：多次登录失败'
  ];
  const ips = ['192.168.1.1', '10.0.0.1', '172.16.0.1', '203.156.78.45', '45.32.156.78'];
  const users = ['admin', 'admin', 'system', null];
  
  return Array.from({ length: count }, (_, i) => {
    const level = levels[Math.floor(Math.random() * levels.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    
    return {
      id: i + 1,
      level,
      action,
      user: users[Math.floor(Math.random() * users.length)],
      ip: ips[Math.floor(Math.random() * ips.length)],
      message: messages[Math.floor(Math.random() * messages.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      request_data: action === 'api' ? { method: 'GET', path: '/api/users' } : null,
      response_data: action === 'api' ? { success: true, count: 10 } : null,
      created_at: new Date(Date.now() - Math.random() * 48 * 60 * 60 * 1000).toISOString()
    };
  });
}

/**
 * 获取真实用户投资统计（管理系统专用）
 * GET /admin/user-investments
 * 
 * 说明：
 * - 只统计真实用户购买的机器人数据
 * - 不包含前端显示的模拟基础金额
 * - 用于管理后台查看真实业务数据
 */
router.get('/user-investments', authMiddleware, async (req, res) => {
  try {
    // 统计所有活跃机器人的真实用户投资
    const result = await dbQuery(
      `SELECT 
        COALESCE(SUM(CASE WHEN robot_type IN ('cex', 'dex') THEN price ELSE 0 END), 0) as cex_dex_total,
        COALESCE(SUM(CASE WHEN robot_type = 'grid' THEN price ELSE 0 END), 0) as grid_total,
        COALESCE(SUM(CASE WHEN robot_type = 'high' THEN expected_return ELSE 0 END), 0) as high_total,
        COUNT(DISTINCT wallet_address) as total_users,
        COUNT(*) as total_purchases
      FROM robot_purchases 
      WHERE status = 'active'`
    );
    
    const cexDexTotal = parseFloat(result[0]?.cex_dex_total) || 0;
    const gridTotal = parseFloat(result[0]?.grid_total) || 0;
    const highTotal = parseFloat(result[0]?.high_total) || 0;
    const totalUsers = parseInt(result[0]?.total_users) || 0;
    const totalPurchases = parseInt(result[0]?.total_purchases) || 0;
    
    // Robot页面真实投资
    const robotPageReal = cexDexTotal;
    
    // Follow页面真实投资
    const followPageReal = gridTotal + highTotal;
    
    secureLog('info', '查看用户投资统计', { 
      admin: req.user?.username || 'unknown'
    });
    
    res.json({
      success: true,
      data: {
        robot_page: {
          real_user_investment: robotPageReal.toFixed(2),
          simulated_base: '146721610.00',
          display_total: (146721610.00 + robotPageReal).toFixed(2)
        },
        follow_page: {
          real_user_investment: followPageReal.toFixed(2),
          simulated_base: '146503014.41',
          display_total: (146503014.41 + followPageReal).toFixed(2)
        },
        breakdown: {
          cex_dex_total: cexDexTotal.toFixed(2),
          grid_total: gridTotal.toFixed(2),
          high_total: highTotal.toFixed(2)
        },
        statistics: {
          total_users: totalUsers,
          total_purchases: totalPurchases,
          avg_investment_per_user: totalUsers > 0 ? ((robotPageReal + followPageReal) / totalUsers).toFixed(2) : '0.00'
        }
      }
    });
  } catch (error) {
    secureLog('error', '获取用户投资统计失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取用户投资统计失败'
    });
  }
});

// ==================== 系统设置管理 ====================

/**
 * 获取所有系统设置
 * GET /api/admin/settings
 */
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const settings = await dbQuery('SELECT * FROM system_settings ORDER BY id');
    
    // 转换为对象格式方便前端使用
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.setting_key] = {
        id: s.id,
        value: s.setting_value,
        type: s.setting_type,
        description: s.description,
        updated_at: s.updated_at
      };
    });
    
    res.json({
      success: true,
      data: {
        list: settings,
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

// ==================== 资质文件管理 ====================

const DEFAULT_DOCUMENTS = {
  whitepaper_url: '/static/documents/whitepaper.pdf',
  msb_url: '/static/documents/MSB.png',
  business_license_url: '/static/documents/license.png'
};

async function upsertSystemSetting(settingKey, settingValue, settingType = 'string', description = '') {
  const existing = await dbQuery('SELECT id FROM system_settings WHERE setting_key = ?', [settingKey]);
  if (existing) {
    await dbQuery(
      'UPDATE system_settings SET setting_value = ?, setting_type = ?, description = ?, updated_at = NOW() WHERE setting_key = ?',
      [settingValue, settingType, description, settingKey]
    );
  } else {
    await dbQuery(
      'INSERT INTO system_settings (setting_key, setting_value, setting_type, description, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [settingKey, settingValue, settingType, description]
    );
  }
}

/**
 * 获取资质文件配置（包含文件类型信息）
 * GET /api/admin/documents
 */
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

// ==================== 错误日志管理 ====================

/**
 * 获取错误日志列表
 * GET /api/admin/error-logs
 */
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

// ==================== 团队分红定时任务监控 API ====================

/**
 * 获取分红定时任务执行日志
 * GET /api/admin/team-dividend/cron-logs
 */
router.get('/team-dividend/cron-logs', authMiddleware, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM cron_execution_logs WHERE task_name = "team_dividend_cron"';
    const params = [];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const logs = await dbQuery(query, params);
    
    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM cron_execution_logs WHERE task_name = "team_dividend_cron"';
    const countParams = [];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    const countResult = await dbQuery(countQuery, countParams);
    
    res.json({
      success: true,
      data: {
        logs,
        total: countResult.total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('获取分红执行日志失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取日志失败'
    });
  }
});

/**
 * 获取分红定时任务状态统计
 * GET /api/admin/team-dividend/cron-status
 */
router.get('/team-dividend/cron-status', authMiddleware, async (req, res) => {
  try {
    // 获取最近的执行记录
    const latestExecution = await dbQuery(
      `SELECT * FROM cron_execution_logs 
       WHERE task_name = 'team_dividend_cron' 
       ORDER BY created_at DESC LIMIT 1`
    );
    
    // 获取今天的分红记录
    const todayDividend = await dbQuery(
      `SELECT COUNT(*) as count, SUM(reward_amount) as total 
       FROM team_rewards 
       WHERE DATE(reward_date) = CURDATE() AND reward_type = 'daily_dividend'`
    );
    
    // 获取最近一次成功发放的日期
    const lastSuccess = await dbQuery(
      `SELECT MAX(reward_date) as last_date 
       FROM team_rewards 
       WHERE reward_type = 'daily_dividend'`
    );
    
    // 计算缺失天数
    let missedDays = 0;
    if (lastSuccess.last_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastDate = new Date(lastSuccess.last_date);
      missedDays = Math.max(0, Math.floor((today - lastDate) / (1000 * 60 * 60 * 24)) - 1);
    }
    
    // 获取执行状态统计
    const statusStats = await dbQuery(
      `SELECT status, COUNT(*) as count 
       FROM cron_execution_logs 
       WHERE task_name = 'team_dividend_cron' 
       AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY status`
    );
    
    res.json({
      success: true,
      data: {
        latestExecution: latestExecution || null,
        todayDividend: {
          count: parseInt(todayDividend.count) || 0,
          total: parseFloat(todayDividend.total) || 0
        },
        lastSuccessDate: lastSuccess.last_date || null,
        missedDays,
        statusStats: statusStats.reduce((acc, item) => {
          acc[item.status] = parseInt(item.count);
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('获取分红任务状态失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取状态失败'
    });
  }
});

/**
 * 手动触发分红任务（已存在，但添加日志记录）
 * POST /api/admin/trigger-team-dividend
 * 注意：这个API已经在 server.js 中定义，这里不需要重复定义
 */

// ============================================================================
// 团队分红管理 API
// ============================================================================

/**
 * 获取所有成员的分红情况
 * GET /api/admin/team-dividend/members
 * 查询参数:
 *   - page: 页码 (default: 1)
 *   - pageSize: 每页条数 (default: 20)
 *   - level: 等级筛选 (0-5)
 *   - search: 钱包地址搜索
 *   - startDate: 开始日期
 *   - endDate: 结束日期
 */
router.get('/team-dividend/members', authMiddleware, async (req, res) => {
  try {
    const { 
      page = 1, 
      pageSize = 20, 
      level, 
      search, 
      startDate, 
      endDate 
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    // 构建 WHERE条件
    let whereConditions = [];
    let queryParams = [];
    
    if (level !== undefined && level !== '') {
      whereConditions.push('tr.broker_level = ?');
      queryParams.push(parseInt(level));
    }
    
    if (search) {
      whereConditions.push('tr.wallet_address LIKE ?');
      queryParams.push(`%${search}%`);
    }
    
    if (startDate) {
      whereConditions.push('DATE(tr.reward_date) >= ?');
      queryParams.push(startDate);
    }
    
    if (endDate) {
      whereConditions.push('DATE(tr.reward_date) <= ?');
      queryParams.push(endDate);
    }
    
    whereConditions.push("tr.reward_type = 'daily_dividend'");
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // 获取总数
    const countQuery = `
      SELECT COUNT(DISTINCT tr.wallet_address) as total
      FROM team_rewards tr
      ${whereClause}
    `;
    const countResult = await dbQuery(countQuery, queryParams);
    const total = parseInt(countResult[0]?.total) || 0;
    
    // 获取分页数据
    const dataQuery = `
      SELECT 
        tr.wallet_address,
        MAX(tr.broker_level) as current_level,
        COUNT(*) as dividend_records,
        SUM(tr.reward_amount) as total_dividend,
        MAX(tr.reward_date) as last_dividend_date,
        MAX(tr.created_at) as last_dividend_time
      FROM team_rewards tr
      ${whereClause}
      GROUP BY tr.wallet_address
      ORDER BY total_dividend DESC, last_dividend_time DESC
      LIMIT ? OFFSET ?
    `;
    const members = await dbQuery(dataQuery, [...queryParams, limit, offset]);
    
    // 获取每个成员的团队统计
    for (const member of members) {
      // 获取直推人数
      const directCount = await dbQuery(
        'SELECT COUNT(*) as count FROM user_referrals WHERE referrer_address = ?',
        [member.wallet_address]
      );
      member.direct_members = parseInt(directCount[0]?.count) || 0;
      
      // 获取合格直推人数
      const qualifiedCount = await dbQuery(
        `SELECT COUNT(DISTINCT r.wallet_address) as count
         FROM user_referrals r
         INNER JOIN robot_purchases rp ON r.wallet_address = rp.wallet_address
         WHERE r.referrer_address = ? AND rp.price >= ? AND rp.status = 'active'`,
        [member.wallet_address, MIN_ROBOT_PURCHASE]
      );
      member.qualified_members = parseInt(qualifiedCount[0]?.count) || 0;
    }
    
    res.json({
      success: true,
      data: {
        members,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total,
          totalPages: Math.ceil(total / parseInt(pageSize))
        }
      }
    });
  } catch (error) {
    console.error('获取成员分红情况失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取数据失败'
    });
  }
});

/**
 * 获取单个成员的详细信息
 * GET /api/admin/team-dividend/member/:walletAddress
 */
router.get('/team-dividend/member/:walletAddress', authMiddleware, async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const addr = walletAddress.toLowerCase();
    
    // 获取成员分红统计
    const memberStats = await dbQuery(`
      SELECT 
        wallet_address,
        MAX(broker_level) as current_level,
        COUNT(*) as dividend_records,
        COALESCE(SUM(reward_amount), 0) as total_dividend,
        MAX(reward_date) as last_dividend_date,
        MAX(created_at) as last_dividend_time
      FROM team_rewards
      WHERE wallet_address = ? AND reward_type = 'daily_dividend'
      GROUP BY wallet_address
    `, [addr]);
    
    // If no dividend records, create empty member data
    const memberData = memberStats && memberStats.length > 0 
      ? memberStats[0]
      : {
          wallet_address: addr,
          current_level: 0,
          dividend_records: 0,
          total_dividend: 0,
          last_dividend_date: null,
          last_dividend_time: null
        };
    
    // 获取直推人数
    const directCount = await dbQuery(
      'SELECT COUNT(*) as count FROM user_referrals WHERE referrer_address = ?',
      [addr]
    );
    memberData.direct_members = directCount[0]?.count || 0;
    
    // 获取合格直推人数
    const qualifiedCount = await dbQuery(
      `SELECT COUNT(DISTINCT r.wallet_address) as count
       FROM user_referrals r
       INNER JOIN robot_purchases rp ON r.wallet_address = rp.wallet_address
       WHERE r.referrer_address = ? AND rp.price >= ? AND rp.status = 'active'`,
      [addr, MIN_ROBOT_PURCHASE]
    );
    memberData.qualified_members = qualifiedCount[0]?.count || 0;
    
    // 获取推荐码
    const referralCode = await dbQuery(
      'SELECT invite_code FROM user_invite_codes WHERE wallet_address = ?',
      [addr]
    );
    memberData.referral_code = referralCode[0]?.invite_code || null;
    
    // 获取团队总人数（8层）
    let allTeamWallets = [];
    let currentLevelWallets = [addr];
    
    for (let level = 1; level <= 8; level++) {
      if (currentLevelWallets.length === 0) break;
      
      const placeholders = currentLevelWallets.map(() => '?').join(',');
      const levelMembers = await dbQuery(
        `SELECT DISTINCT wallet_address FROM user_referrals WHERE referrer_address IN (${placeholders})`,
        currentLevelWallets
      );
      
      if (levelMembers.length === 0) break;
      
      const levelWallets = levelMembers.map(m => m.wallet_address);
      allTeamWallets.push(...levelWallets);
      currentLevelWallets = levelWallets;
    }
    
    memberData.team_total = allTeamWallets.length;
    memberData.team_total_members = allTeamWallets.length;
    
    // Calculate team performance (total deposits from all team members)
    let teamPerformance = 0;
    if (allTeamWallets.length > 0) {
      const teamPlaceholders = allTeamWallets.map(() => '?').join(',');
      const performanceResult = await dbQuery(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM deposit_records
         WHERE wallet_address IN (${teamPlaceholders}) AND status = 'completed'`,
        allTeamWallets
      );
      teamPerformance = parseFloat(performanceResult[0]?.total) || 0;
    }
    memberData.team_performance = teamPerformance;
    
    // Get user registration time from user_referrals or deposit_records
    const userTimeResult = await dbQuery(
      `SELECT MIN(created_at) as created_at FROM (
        SELECT created_at FROM user_referrals WHERE wallet_address = ?
        UNION
        SELECT created_at FROM deposit_records WHERE wallet_address = ?
        UNION
        SELECT created_at FROM robot_purchases WHERE wallet_address = ?
      ) as times`,
      [addr, addr, addr]
    );
    memberData.created_at = userTimeResult[0]?.created_at || null;
    
    res.json({
      success: true,
      data: memberData
    });
  } catch (error) {
    console.error('获取成员详情失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取详情失败'
    });
  }
});

/**
 * 获取成员的直推成员列表
 * GET /api/admin/team-dividend/member/:walletAddress/direct-members
 * 
 * Returns direct members with their broker level and investment info
 */
router.get('/team-dividend/member/:walletAddress/direct-members', authMiddleware, async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const addr = walletAddress.toLowerCase();
    
    // Get direct members with investment and broker level info
    const directMembers = await dbQuery(`
      SELECT 
        ur.wallet_address,
        ur.created_at,
        COUNT(DISTINCT rp.id) as robot_count,
        COALESCE(SUM(rp.price), 0) as total_investment,
        (SELECT COUNT(*) FROM user_referrals WHERE referrer_address = ur.wallet_address) as sub_count,
        COALESCE((SELECT MAX(broker_level) FROM team_rewards 
                  WHERE wallet_address = ur.wallet_address 
                  AND reward_type = 'daily_dividend'), 0) as broker_level
      FROM user_referrals ur
      LEFT JOIN robot_purchases rp ON ur.wallet_address = rp.wallet_address AND rp.status = 'active'
      WHERE ur.referrer_address = ?
      GROUP BY ur.wallet_address, ur.created_at
      ORDER BY broker_level DESC, total_investment DESC, ur.created_at DESC
    `, [addr]);
    
    res.json({
      success: true,
      data: {
        members: directMembers
      }
    });
  } catch (error) {
    console.error('获取直推成员失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取直推成员失败'
    });
  }
});

/**
 * 获取所有团队的分红情况
 * GET /api/admin/team-dividend/teams
 * 查询参数:
 *   - page: 页码
 *   - pageSize: 每页条数
 *   - minMembers: 最小团队人数
 *   - minPerformance: 最小团队业绩
 */
router.get('/team-dividend/teams', authMiddleware, async (req, res) => {
  try {
    const { 
      page = 1, 
      pageSize = 20,
      minMembers = 0,
      minPerformance = 0
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    // 获取所有团队领导人
    const leadersQuery = `
      SELECT DISTINCT 
        r.referrer_address as wallet_address,
        COUNT(DISTINCT r.wallet_address) as direct_members
      FROM user_referrals r
      GROUP BY r.referrer_address
      HAVING direct_members >= ?
      ORDER BY direct_members DESC
    `;
    const allLeaders = await dbQuery(leadersQuery, [parseInt(minMembers)]);
    
    // 计算每个团队的详细统计
    const teamsWithStats = [];
    
    for (const leader of allLeaders) {
      // 获取团队总业绩（所有层级）
      let allTeamWallets = [];
      let currentLevelWallets = [leader.wallet_address];
      
      for (let level = 1; level <= 8; level++) {
        if (currentLevelWallets.length === 0) break;
        
        const placeholders = currentLevelWallets.map(() => '?').join(',');
        const levelMembers = await dbQuery(
          `SELECT DISTINCT wallet_address FROM user_referrals WHERE referrer_address IN (${placeholders})`,
          currentLevelWallets
        );
        
        if (levelMembers.length === 0) break;
        
        const levelWallets = levelMembers.map(m => m.wallet_address);
        allTeamWallets.push(...levelWallets);
        currentLevelWallets = levelWallets;
      }
      
	      // 计算团队总业绩（只计入合格机器人，且 active）
	      let totalPerformance = 0;
	      if (allTeamWallets.length > 0) {
	        const teamPlaceholders = allTeamWallets.map(() => '?').join(',');
	        const performanceResult = await dbQuery(
	          `SELECT COALESCE(SUM(price), 0) as total
	           FROM robot_purchases
	           WHERE wallet_address IN (${teamPlaceholders}) AND status = 'active' AND price >= ?`,
	          [...allTeamWallets, MIN_ROBOT_PURCHASE]
	        );
	        totalPerformance = parseFloat(performanceResult[0]?.total) || 0;
	      }
      
      // 筛选最小业绩
      if (totalPerformance < parseFloat(minPerformance)) {
        continue;
      }
      
      // 获取分红统计
      const dividendStats = await dbQuery(
        `SELECT 
          COUNT(*) as total_records,
          SUM(reward_amount) as total_dividend,
          MAX(broker_level) as current_level,
          MAX(reward_date) as last_dividend_date
        FROM team_rewards
        WHERE wallet_address = ? AND reward_type = 'daily_dividend'`,
        [leader.wallet_address]
      );
      
      teamsWithStats.push({
        leader_address: leader.wallet_address,
        direct_members: leader.direct_members,
        team_total_members: allTeamWallets.length,
        team_performance: totalPerformance,
        current_level: dividendStats[0]?.current_level || 0,
        dividend_records: parseInt(dividendStats[0]?.total_records) || 0,
        total_dividend: parseFloat(dividendStats[0]?.total_dividend) || 0,
        last_dividend_date: dividendStats[0]?.last_dividend_date || null
      });
    }
    
    // 排序并分页
    teamsWithStats.sort((a, b) => b.total_dividend - a.total_dividend);
    const total = teamsWithStats.length;
    const paginatedTeams = teamsWithStats.slice(offset, offset + limit);
    
    res.json({
      success: true,
      data: {
        teams: paginatedTeams,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total,
          totalPages: Math.ceil(total / parseInt(pageSize))
        }
      }
    });
  } catch (error) {
    console.error('获取团队分红情况失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取数据失败'
    });
  }
});

// NOTE: Duplicate route removed - use /team-dividend/member/:walletAddress instead
// The /team-dividend/records API can be used with wallet parameter to get paginated records

/**
 * 分红记录综合查询
 * GET /api/admin/team-dividend/records
 * 查询参数:
 *   - page, pageSize
 *   - wallet: 钱包地址
 *   - level: 等级
 *   - startDate, endDate: 日期范围
 *   - minAmount, maxAmount: 金额范围
 */
router.get('/team-dividend/records', authMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 50,
      wallet,
      level,
      startDate,
      endDate,
      minAmount,
      maxAmount
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    // 构建 WHERE条件
    let whereConditions = ["reward_type = 'daily_dividend'"];
    let queryParams = [];
    
    if (wallet) {
      whereConditions.push('wallet_address LIKE ?');
      queryParams.push(`%${wallet}%`);
    }
    
    if (level !== undefined && level !== '') {
      whereConditions.push('broker_level = ?');
      queryParams.push(parseInt(level));
    }
    
    if (startDate) {
      whereConditions.push('DATE(reward_date) >= ?');
      queryParams.push(startDate);
    }
    
    if (endDate) {
      whereConditions.push('DATE(reward_date) <= ?');
      queryParams.push(endDate);
    }
    
    if (minAmount) {
      whereConditions.push('reward_amount >= ?');
      queryParams.push(parseFloat(minAmount));
    }
    
    if (maxAmount) {
      whereConditions.push('reward_amount <= ?');
      queryParams.push(parseFloat(maxAmount));
    }
    
    const whereClause = 'WHERE ' + whereConditions.join(' AND ');
    
    // 获取总数
    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM team_rewards ${whereClause}`,
      queryParams
    );
    const total = parseInt(countResult[0]?.total) || 0;
    
    // 获取记录
    const records = await dbQuery(
      `SELECT 
        id,
        wallet_address,
        broker_level,
        reward_amount,
        reward_date,
        created_at
      FROM team_rewards
      ${whereClause}
      ORDER BY reward_date DESC, created_at DESC
      LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );
    
    // 获取统计信息
    const stats = await dbQuery(
      `SELECT 
        COUNT(DISTINCT wallet_address) as unique_members,
        SUM(reward_amount) as total_amount,
        AVG(reward_amount) as avg_amount
      FROM team_rewards
      ${whereClause}`,
      queryParams
    );
    
    res.json({
      success: true,
      data: {
        records,
        statistics: {
          unique_members: parseInt(stats[0]?.unique_members) || 0,
          total_amount: parseFloat(stats[0]?.total_amount) || 0,
          avg_amount: parseFloat(stats[0]?.avg_amount) || 0
        },
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total,
          totalPages: Math.ceil(total / parseInt(pageSize))
        }
      }
    });
  } catch (error) {
    console.error('查询分红记录失败:', error.message);
    res.status(500).json({
      success: false,
      message: '查询失败'
    });
  }
});

/**
 * 手动补发分红
 * POST /api/admin/team-dividend/compensate
 * Body: {
 *   wallet_address: string,
 *   broker_level: number,
 *   reward_amount: number,
 *   reward_date: string,
 *   reason: string
 * }
 */
router.post('/team-dividend/compensate', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, broker_level, reward_amount, reward_date, reason } = req.body;
    
    // 验证参数
    if (!wallet_address || !broker_level || !reward_amount || !reward_date) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }
    
    const walletAddr = wallet_address.toLowerCase();
    const level = parseInt(broker_level);
    const amount = parseFloat(reward_amount);
    
    if (level < 1 || level > 5) {
      return res.status(400).json({
        success: false,
        message: '等级必须在 1-5 之间'
      });
    }
    
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: '金额必须大于 0'
      });
    }
    
    // 检查用户是否存在
    const userCheck = await dbQuery(
      'SELECT * FROM user_balances WHERE wallet_address = ?',
      [walletAddr]
    );
    
    if (userCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 检查是否已经发放过该日期的分红
    const existingDividend = await dbQuery(
      `SELECT * FROM team_rewards 
       WHERE wallet_address = ? 
       AND reward_type = 'daily_dividend' 
       AND DATE(reward_date) = ?`,
      [walletAddr, reward_date]
    );
    
    if (existingDividend.length > 0) {
      return res.status(400).json({
        success: false,
        message: `该日期 (${reward_date}) 已经发放过分红，请检查`
      });
    }
    
    // 插入分红记录
    await dbQuery(
      `INSERT INTO team_rewards 
       (wallet_address, broker_level, reward_amount, reward_type, reward_date, created_at)
       VALUES (?, ?, ?, 'daily_dividend', ?, NOW())`,
      [walletAddr, level, amount, reward_date]
    );
    
    // 更新用户USDT余额
    await dbQuery(
      `UPDATE user_balances 
       SET usdt_balance = usdt_balance + ?,
           updated_at = NOW()
       WHERE wallet_address = ?`,
      [amount, walletAddr]
    );
    
    // 记录日志
    const adminUser = req.user?.username || 'admin';
    console.log(`[Admin] ${adminUser} 手动补发分红: ${walletAddr}, 等级=${level}, 金额=${amount}, 日期=${reward_date}, 原因=${reason || '未填写'}`);
    
    res.json({
      success: true,
      message: '分红补发成功',
      data: {
        wallet_address: walletAddr,
        broker_level: level,
        reward_amount: amount,
        reward_date
      }
    });
  } catch (error) {
    console.error('补发分红失败:', error.message);
    res.status(500).json({
      success: false,
      message: '补发失败: ' + error.message
    });
  }
});

/**
 * 批量补发分红
 * POST /api/admin/team-dividend/batch-compensate
 * Body: {
 *   compensations: [{
 *     wallet_address: string,
 *     broker_level: number,
 *     reward_amount: number,
 *     reward_date: string
 *   }],
 *   reason: string
 * }
 */
router.post('/team-dividend/batch-compensate', authMiddleware, async (req, res) => {
  try {
    const { compensations, reason } = req.body;
    
    if (!Array.isArray(compensations) || compensations.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供补发列表'
      });
    }
    
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    for (const comp of compensations) {
      try {
        const { wallet_address, broker_level, reward_amount, reward_date } = comp;
        const walletAddr = wallet_address.toLowerCase();
        
        // 检查用户
        const userCheck = await dbQuery(
          'SELECT * FROM user_balances WHERE wallet_address = ?',
          [walletAddr]
        );
        
        if (userCheck.length === 0) {
          results.failed++;
          results.errors.push(`${walletAddr}: 用户不存在`);
          continue;
        }
        
        // 检查重复
        const existingDividend = await dbQuery(
          `SELECT * FROM team_rewards 
           WHERE wallet_address = ? 
           AND reward_type = 'daily_dividend' 
           AND DATE(reward_date) = ?`,
          [walletAddr, reward_date]
        );
        
        if (existingDividend.length > 0) {
          results.failed++;
          results.errors.push(`${walletAddr}: ${reward_date} 已存在分红记录`);
          continue;
        }
        
        // 插入分红记录
        await dbQuery(
          `INSERT INTO team_rewards 
           (wallet_address, broker_level, reward_amount, reward_type, reward_date, created_at)
           VALUES (?, ?, ?, 'daily_dividend', ?, NOW())`,
          [walletAddr, parseInt(broker_level), parseFloat(reward_amount), reward_date]
        );
        
        // 更新余额
        await dbQuery(
          `UPDATE user_balances 
           SET usdt_balance = usdt_balance + ?,
               updated_at = NOW()
           WHERE wallet_address = ?`,
          [parseFloat(reward_amount), walletAddr]
        );
        
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`${comp.wallet_address}: ${error.message}`);
      }
    }
    
    // 记录日志
    const adminUser = req.user?.username || 'admin';
    console.log(`[Admin] ${adminUser} 批量补发分红: 成功=${results.success}, 失败=${results.failed}, 原因=${reason || '未填写'}`);
    
    res.json({
      success: true,
      message: `批量补发完成: 成功 ${results.success} 条, 失败 ${results.failed} 条`,
      data: results
    });
  } catch (error) {
    console.error('批量补发分红失败:', error.message);
    res.status(500).json({
      success: false,
      message: '批量补发失败: ' + error.message
    });
  }
});

/**
 * 获取分红统计概览
 * GET /api/admin/team-dividend/overview
 */
router.get('/team-dividend/overview', authMiddleware, async (req, res) => {
  try {
    // 总体统计
    const totalStats = await dbQuery(`
      SELECT 
        COUNT(DISTINCT wallet_address) as total_members,
        COUNT(*) as total_records,
        SUM(reward_amount) as total_amount
      FROM team_rewards
      WHERE reward_type = 'daily_dividend'
    `);
    
    // 今日统计
    const todayStats = await dbQuery(`
      SELECT 
        COUNT(DISTINCT wallet_address) as today_members,
        SUM(reward_amount) as today_amount
      FROM team_rewards
      WHERE reward_type = 'daily_dividend'
      AND DATE(reward_date) = CURDATE()
    `);
    
    // 本月统计
    const monthStats = await dbQuery(`
      SELECT 
        COUNT(DISTINCT wallet_address) as month_members,
        SUM(reward_amount) as month_amount
      FROM team_rewards
      WHERE reward_type = 'daily_dividend'
      AND DATE(reward_date) >= DATE_FORMAT(NOW(), '%Y-%m-01')
    `);
    
    // 等级分布
    const levelDistribution = await dbQuery(`
      SELECT 
        broker_level,
        COUNT(DISTINCT wallet_address) as member_count,
        SUM(reward_amount) as total_amount
      FROM team_rewards
      WHERE reward_type = 'daily_dividend'
      AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY broker_level
      ORDER BY broker_level DESC
    `);
    
    // 最近 7 天趋势
    const trendData = await dbQuery(`
      SELECT 
        DATE(reward_date) as date,
        COUNT(DISTINCT wallet_address) as members,
        SUM(reward_amount) as amount
      FROM team_rewards
      WHERE reward_type = 'daily_dividend'
      AND reward_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(reward_date)
      ORDER BY date DESC
    `);
    
    res.json({
      success: true,
      data: {
        total: {
          members: parseInt(totalStats[0]?.total_members) || 0,
          records: parseInt(totalStats[0]?.total_records) || 0,
          amount: parseFloat(totalStats[0]?.total_amount) || 0
        },
        today: {
          members: parseInt(todayStats[0]?.today_members) || 0,
          amount: parseFloat(todayStats[0]?.today_amount) || 0
        },
        month: {
          members: parseInt(monthStats[0]?.month_members) || 0,
          amount: parseFloat(monthStats[0]?.month_amount) || 0
        },
        levelDistribution,
        trendData
      }
    });
  } catch (error) {
    console.error('获取分红概览失败:', error.message);
    res.status(500).json({
      success: false,
      message: '获取数据失败'
    });
  }
});

/**
 * 手动补发团队分红
 * POST /api/admin/team-dividend/compensate
 * 
 * 用于补发遗漏的团队分红，确保用户获得应得奖励
 * 
 * body: {
 *   wallet_address: string,  // 用户钱包地址
 *   broker_level: number,    // 经纪人等级 (1-5)
 *   reward_amount: number,   // 奖励金额
 *   reward_date: string,     // 分红日期 (YYYY-MM-DD)
 *   reason: string          // 补发原因
 * }
 */
router.post('/team-dividend/compensate', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, broker_level, reward_amount, reward_date, reason } = req.body;
    
    // 验证参数
    if (!wallet_address || !broker_level || !reward_amount || !reward_date) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }
    
    const walletAddr = wallet_address.toLowerCase();
    const level = parseInt(broker_level);
    const amount = parseFloat(reward_amount);
    
    // 验证等级
    if (level < 1 || level > 5) {
      return res.status(400).json({
        success: false,
        message: '无效的经纪人等级，必须为 1-5'
      });
    }
    
    // 验证金额
    if (amount <= 0 || amount > 10000) {
      return res.status(400).json({
        success: false,
        message: '无效的奖励金额'
      });
    }
    
    // 检查是否已经发放过
    const existing = await dbQuery(
      `SELECT * FROM team_rewards 
       WHERE wallet_address = ? 
       AND DATE(reward_date) = ? 
       AND reward_type = 'daily_dividend'`,
      [walletAddr, reward_date]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `该日期 (${reward_date}) 已发放过分红，无需重复补发`
      });
    }
    
    // 确保用户有余额记录
    await dbQuery(
      `INSERT IGNORE INTO user_balances (wallet_address, usdt_balance, wld_balance, created_at, updated_at) 
       VALUES (?, 0, 0, NOW(), NOW())`,
      [walletAddr]
    );
    
    // 更新用户余额
    await dbQuery(
      `UPDATE user_balances 
       SET usdt_balance = usdt_balance + ?, updated_at = NOW() 
       WHERE wallet_address = ?`,
      [amount, walletAddr]
    );
    
    // 记录到 team_rewards 表
    await dbQuery(
      `INSERT INTO team_rewards 
       (wallet_address, reward_type, broker_level, reward_amount, reward_date, created_at) 
       VALUES (?, 'daily_dividend', ?, ?, ?, NOW())`,
      [walletAddr, level, amount, reward_date]
    );
    
    // TODO: 同步创建交易记录到 transaction_history
    // 暂时禁用，等待确认表结构
    
    // 记录日志
    secureLog('补发团队分红', {
      admin: req.admin?.username,
      wallet_address: walletAddr,
      level,
      amount,
      reward_date,
      reason
    });
    
    res.json({
      success: true,
      message: '补发分红成功',
      data: {
        wallet_address: walletAddr,
        broker_level: level,
        reward_amount: amount,
        reward_date
      }
    });
    
  } catch (error) {
    console.error('补发团队分红失败:', error.message);
    res.status(500).json({
      success: false,
      message: '补发失败'
    });
  }
});

/**
 * 批量补发团队分红
 * POST /api/admin/team-dividend/batch-compensate
 * 
 * body: {
 *   compensations: [{
 *     wallet_address, broker_level, reward_amount, reward_date
 *   }],
 *   reason: string
 * }
 */
router.post('/team-dividend/batch-compensate', authMiddleware, async (req, res) => {
  try {
    const { compensations, reason } = req.body;
    
    if (!Array.isArray(compensations) || compensations.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供补发列表'
      });
    }
    
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      details: []
    };
    
    for (const comp of compensations) {
      const { wallet_address, broker_level, reward_amount, reward_date } = comp;
      const walletAddr = wallet_address?.toLowerCase();
      
      try {
        if (!walletAddr || !broker_level || !reward_amount || !reward_date) {
          results.failed++;
          results.details.push({
            wallet_address: walletAddr,
            status: 'failed',
            message: '缺少必要参数'
          });
          continue;
        }
        
        const level = parseInt(broker_level);
        const amount = parseFloat(reward_amount);
        
        if (level < 1 || level > 5 || amount <= 0) {
          results.failed++;
          results.details.push({
            wallet_address: walletAddr,
            status: 'failed',
            message: '参数无效'
          });
          continue;
        }
        
        // 检查是否已发放
        const existing = await dbQuery(
          `SELECT * FROM team_rewards 
           WHERE wallet_address = ? AND DATE(reward_date) = ? AND reward_type = 'daily_dividend'`,
          [walletAddr, reward_date]
        );
        
        if (existing.length > 0) {
          results.skipped++;
          results.details.push({
            wallet_address: walletAddr,
            status: 'skipped',
            message: '已发放'
          });
          continue;
        }
        
        // 发放分红
        await dbQuery(
          `INSERT IGNORE INTO user_balances (wallet_address, usdt_balance, wld_balance, created_at, updated_at) 
           VALUES (?, 0, 0, NOW(), NOW())`,
          [walletAddr]
        );
        
        await dbQuery(
          `UPDATE user_balances SET usdt_balance = usdt_balance + ?, updated_at = NOW() WHERE wallet_address = ?`,
          [amount, walletAddr]
        );
        
        await dbQuery(
          `INSERT INTO team_rewards 
           (wallet_address, reward_type, broker_level, reward_amount, reward_date, created_at) 
           VALUES (?, 'daily_dividend', ?, ?, ?, NOW())`,
          [walletAddr, level, amount, reward_date]
        );
        
        // TODO: 同步创建交易记录到 transaction_history
        
        results.success++;
        results.details.push({
          wallet_address: walletAddr,
          status: 'success',
          amount,
          level
        });
        
      } catch (error) {
        results.failed++;
        results.details.push({
          wallet_address: walletAddr,
          status: 'failed',
          message: error.message
        });
      }
    }
    
    secureLog('批量补发团队分红', {
      admin: req.admin?.username,
      total: compensations.length,
      success: results.success,
      failed: results.failed,
      skipped: results.skipped,
      reason
    });
    
    res.json({
      success: true,
      message: `补发完成：成功 ${results.success}, 失败 ${results.failed}, 跳过 ${results.skipped}`,
      data: results
    });
    
  } catch (error) {
    console.error('批量补发团队分红失败:', error.message);
    res.status(500).json({
      success: false,
      message: '批量补发失败'
    });
  }
});

// ==================== 抽奖管理 API ====================

/**
 * 获取抽奖统计数据
 * GET /api/admin/lucky-wheel/stats
 */
router.get('/lucky-wheel/stats', authMiddleware, async (req, res) => {
  try {
    // 总抽奖次数
    const [totalSpins] = await dbQuery('SELECT COUNT(*) as count FROM lucky_wheel_records');
    
    // 今日抽奖次数
    const [todaySpins] = await dbQuery(
      `SELECT COUNT(*) as count FROM lucky_wheel_records 
       WHERE DATE(created_at) = CURDATE()`
    );
    
    // 总发放奖励
    const [totalRewards] = await dbQuery(
      `SELECT 
         SUM(CASE WHEN reward_type = 'WLD' THEN reward_amount ELSE 0 END) as total_wld,
         SUM(CASE WHEN reward_type = 'USDT' THEN reward_amount ELSE 0 END) as total_usdt,
         SUM(CASE WHEN reward_type = 'BTC' THEN reward_amount ELSE 0 END) as total_btc
       FROM lucky_wheel_records`
    );
    
    // 总幸运值发放
    const [totalPoints] = await dbQuery(
      'SELECT COALESCE(SUM(total_earned), 0) as total FROM user_lucky_points'
    );
    
    // 总幸运值消耗
    const [totalSpent] = await dbQuery(
      'SELECT COALESCE(SUM(total_spent), 0) as total FROM user_lucky_points'
    );
    
    // 参与用户数
    const [uniqueUsers] = await dbQuery(
      'SELECT COUNT(DISTINCT wallet_address) as count FROM lucky_wheel_records'
    );
    
    // 各奖项中奖统计
    const prizeStats = await dbQuery(
      `SELECT prize_name, COUNT(*) as count, SUM(reward_amount) as total_amount, reward_type
       FROM lucky_wheel_records 
       GROUP BY prize_name, reward_type
       ORDER BY count DESC`
    );
    
    res.json({
      success: true,
      data: {
        totalSpins: totalSpins?.count || 0,
        todaySpins: todaySpins?.count || 0,
        totalWLD: parseFloat(totalRewards?.total_wld) || 0,
        totalUSDT: parseFloat(totalRewards?.total_usdt) || 0,
        totalBTC: parseFloat(totalRewards?.total_btc) || 0,
        totalPointsEarned: parseFloat(totalPoints?.total) || 0,
        totalPointsSpent: parseFloat(totalSpent?.total) || 0,
        uniqueUsers: uniqueUsers?.count || 0,
        prizeStats
      }
    });
    
  } catch (error) {
    console.error('获取抽奖统计失败:', error.message);
    res.status(500).json({ success: false, message: '获取统计失败' });
  }
});

/**
 * 获取抽奖记录列表
 * GET /api/admin/lucky-wheel/records
 */
router.get('/lucky-wheel/records', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const { wallet_address, wheel_type, prize_name, start_date, end_date } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (wallet_address) {
      whereClause += ' AND wallet_address LIKE ?';
      params.push(`%${wallet_address}%`);
    }
    if (wheel_type) {
      whereClause += ' AND wheel_type = ?';
      params.push(wheel_type);
    }
    if (prize_name) {
      whereClause += ' AND prize_name = ?';
      params.push(prize_name);
    }
    if (start_date) {
      whereClause += ' AND DATE(created_at) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      whereClause += ' AND DATE(created_at) <= ?';
      params.push(end_date);
    }
    
    // 总数
    const [countResult] = await dbQuery(
      `SELECT COUNT(*) as total FROM lucky_wheel_records WHERE ${whereClause}`,
      params
    );
    
    // 分页数据
    const records = await dbQuery(
      `SELECT id, wallet_address, wheel_type, prize_name, reward_type, reward_amount, points_spent, created_at
       FROM lucky_wheel_records 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    
    res.json({
      success: true,
      data: {
        records,
        total: countResult?.total || 0,
        page,
        pageSize
      }
    });
    
  } catch (error) {
    console.error('获取抽奖记录失败:', error.message);
    res.status(500).json({ success: false, message: '获取记录失败' });
  }
});

/**
 * 获取用户幸运值列表
 * GET /api/admin/lucky-wheel/points
 */
router.get('/lucky-wheel/points', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const { wallet_address, min_points } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (wallet_address) {
      whereClause += ' AND wallet_address LIKE ?';
      params.push(`%${wallet_address}%`);
    }
    if (min_points) {
      whereClause += ' AND lucky_points >= ?';
      params.push(parseFloat(min_points));
    }
    
    // 总数
    const [countResult] = await dbQuery(
      `SELECT COUNT(*) as total FROM user_lucky_points WHERE ${whereClause}`,
      params
    );
    
    // 分页数据
    const users = await dbQuery(
      `SELECT id, wallet_address, lucky_points, total_earned, total_spent, created_at, updated_at
       FROM user_lucky_points 
       WHERE ${whereClause}
       ORDER BY lucky_points DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    
    res.json({
      success: true,
      data: {
        users,
        total: countResult?.total || 0,
        page,
        pageSize
      }
    });
    
  } catch (error) {
    console.error('获取幸运值列表失败:', error.message);
    res.status(500).json({ success: false, message: '获取列表失败' });
  }
});

/**
 * 手动调整用户幸运值
 * POST /api/admin/lucky-wheel/adjust-points
 */
router.post('/lucky-wheel/adjust-points', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, amount, reason } = req.body;
    
    if (!wallet_address || amount === undefined) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    const normalizedAddress = wallet_address.toLowerCase();
    const adjustAmount = parseFloat(amount);
    
    // 检查用户是否存在
    const [existing] = await dbQuery(
      'SELECT id, lucky_points FROM user_lucky_points WHERE wallet_address = ?',
      [normalizedAddress]
    );
    
    if (existing) {
      // 更新
      const newPoints = Math.max(0, parseFloat(existing.lucky_points) + adjustAmount);
      await dbQuery(
        `UPDATE user_lucky_points 
         SET lucky_points = ?, 
             total_earned = total_earned + ?
         WHERE wallet_address = ?`,
        [newPoints, adjustAmount > 0 ? adjustAmount : 0, normalizedAddress]
      );
    } else {
      // 创建
      if (adjustAmount <= 0) {
        return res.status(400).json({ success: false, message: '用户不存在，无法扣除幸运值' });
      }
      await dbQuery(
        `INSERT INTO user_lucky_points (wallet_address, lucky_points, total_earned) VALUES (?, ?, ?)`,
        [normalizedAddress, adjustAmount, adjustAmount]
      );
    }
    
    secureLog('调整用户幸运值', {
      admin: req.admin?.username,
      wallet_address: normalizedAddress,
      amount: adjustAmount,
      reason: reason || '管理员调整'
    });
    
    res.json({
      success: true,
      message: adjustAmount > 0 ? `已增加 ${adjustAmount} 幸运值` : `已扣除 ${Math.abs(adjustAmount)} 幸运值`
    });
    
  } catch (error) {
    console.error('调整幸运值失败:', error.message);
    res.status(500).json({ success: false, message: '调整失败' });
  }
});

/**
 * 批量发放幸运值
 * POST /api/admin/lucky-wheel/batch-points
 */
router.post('/lucky-wheel/batch-points', authMiddleware, async (req, res) => {
  try {
    const { wallet_addresses, amount, reason } = req.body;
    
    if (!wallet_addresses || !Array.isArray(wallet_addresses) || wallet_addresses.length === 0) {
      return res.status(400).json({ success: false, message: '请提供钱包地址列表' });
    }
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: '发放数量必须大于0' });
    }
    
    let successCount = 0;
    let failedCount = 0;
    
    for (const addr of wallet_addresses) {
      try {
        const normalizedAddress = addr.toLowerCase();
        
        const [existing] = await dbQuery(
          'SELECT id FROM user_lucky_points WHERE wallet_address = ?',
          [normalizedAddress]
        );
        
        if (existing) {
          await dbQuery(
            `UPDATE user_lucky_points 
             SET lucky_points = lucky_points + ?, total_earned = total_earned + ?
             WHERE wallet_address = ?`,
            [amount, amount, normalizedAddress]
          );
        } else {
          await dbQuery(
            `INSERT INTO user_lucky_points (wallet_address, lucky_points, total_earned) VALUES (?, ?, ?)`,
            [normalizedAddress, amount, amount]
          );
        }
        successCount++;
      } catch (e) {
        failedCount++;
      }
    }
    
    secureLog('批量发放幸运值', {
      admin: req.admin?.username,
      count: wallet_addresses.length,
      amount,
      success: successCount,
      failed: failedCount,
      reason
    });
    
    res.json({
      success: true,
      message: `批量发放完成：成功 ${successCount}, 失败 ${failedCount}`,
      data: { successCount, failedCount }
    });
    
  } catch (error) {
    console.error('批量发放幸运值失败:', error.message);
    res.status(500).json({ success: false, message: '批量发放失败' });
  }
});

/**
 * 获取获奖公告列表
 * GET /api/admin/lucky-wheel/announcements
 */
router.get('/lucky-wheel/announcements', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const offset = (page - 1) * pageSize;
    const { is_virtual } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (is_virtual !== undefined) {
      whereClause += ' AND is_virtual = ?';
      params.push(is_virtual === 'true' ? 1 : 0);
    }
    
    const [countResult] = await dbQuery(
      `SELECT COUNT(*) as total FROM lucky_wheel_announcements WHERE ${whereClause}`,
      params
    );
    
    const announcements = await dbQuery(
      `SELECT id, wallet_address, prize_name, reward_display, is_virtual, created_at
       FROM lucky_wheel_announcements 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    
    res.json({
      success: true,
      data: {
        announcements,
        total: countResult?.total || 0,
        page,
        pageSize
      }
    });
    
  } catch (error) {
    console.error('获取公告列表失败:', error.message);
    res.status(500).json({ success: false, message: '获取公告失败' });
  }
});

/**
 * 删除获奖公告
 * DELETE /api/admin/lucky-wheel/announcements/:id
 */
router.delete('/lucky-wheel/announcements/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    await dbQuery('DELETE FROM lucky_wheel_announcements WHERE id = ?', [id]);
    
    secureLog('删除获奖公告', { admin: req.admin?.username, id });
    
    res.json({ success: true, message: '删除成功' });
    
  } catch (error) {
    console.error('删除公告失败:', error.message);
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

/**
 * 添加虚拟获奖公告
 * POST /api/admin/lucky-wheel/announcements
 */
router.post('/lucky-wheel/announcements', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, prize_name, reward_display } = req.body;
    
    if (!wallet_address || !prize_name || !reward_display) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    await dbQuery(
      `INSERT INTO lucky_wheel_announcements (wallet_address, prize_name, reward_display, is_virtual)
       VALUES (?, ?, ?, 1)`,
      [wallet_address, prize_name, reward_display]
    );
    
    secureLog('添加虚拟公告', { admin: req.admin?.username, wallet_address, prize_name, reward_display });
    
    res.json({ success: true, message: '添加成功' });
    
  } catch (error) {
    console.error('添加公告失败:', error.message);
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

/**
 * 清空虚拟公告
 * DELETE /api/admin/lucky-wheel/announcements/virtual
 */
router.delete('/lucky-wheel/announcements/virtual', authMiddleware, async (req, res) => {
  try {
    const result = await dbQuery('DELETE FROM lucky_wheel_announcements WHERE is_virtual = 1');
    
    secureLog('清空虚拟公告', { admin: req.admin?.username, deleted: result.affectedRows });
    
    res.json({ success: true, message: `已删除 ${result.affectedRows || 0} 条虚拟公告` });
    
  } catch (error) {
    console.error('清空虚拟公告失败:', error.message);
    res.status(500).json({ success: false, message: '清空失败' });
  }
});

// ==================== 指定中奖管理 ====================

/**
 * 获取指定中奖列表
 * GET /api/admin/lucky-wheel/rigged
 */
router.get('/lucky-wheel/rigged', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const { used } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (used !== undefined) {
      whereClause += ' AND used = ?';
      params.push(used === 'true' ? 1 : 0);
    }
    
    const [countResult] = await dbQuery(
      `SELECT COUNT(*) as total FROM lucky_wheel_rigged WHERE ${whereClause}`,
      params
    );
    
    const rigged = await dbQuery(
      `SELECT id, wallet_address, prize_id, prize_name, created_by, used, created_at, used_at
       FROM lucky_wheel_rigged 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    
    res.json({
      success: true,
      data: {
        rigged,
        total: countResult?.total || 0,
        page,
        pageSize
      }
    });
    
  } catch (error) {
    console.error('获取指定中奖列表失败:', error.message);
    res.status(500).json({ success: false, message: '获取列表失败' });
  }
});

/**
 * 添加指定中奖
 * POST /api/admin/lucky-wheel/rigged
 */
router.post('/lucky-wheel/rigged', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, prize_id } = req.body;
    
    if (!wallet_address || !prize_id) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 奖品配置
    const PRIZES = {
      1: '特等奖',
      2: '一等奖',
      3: '二等奖',
      4: '三等奖',
      5: '四等奖',
      6: '五等奖'
    };
    
    const prizeName = PRIZES[prize_id];
    if (!prizeName) {
      return res.status(400).json({ success: false, message: '无效的奖品ID' });
    }
    
    const normalizedAddress = wallet_address.toLowerCase();
    
    // 检查是否已有未使用的指定中奖
    const [existing] = await dbQuery(
      'SELECT id FROM lucky_wheel_rigged WHERE wallet_address = ? AND used = 0',
      [normalizedAddress]
    );
    
    if (existing) {
      // 更新现有记录
      await dbQuery(
        `UPDATE lucky_wheel_rigged 
         SET prize_id = ?, prize_name = ?, created_by = ?, created_at = NOW()
         WHERE id = ?`,
        [prize_id, prizeName, req.admin?.username || 'admin', existing.id]
      );
    } else {
      // 插入新记录
      await dbQuery(
        `INSERT INTO lucky_wheel_rigged (wallet_address, prize_id, prize_name, created_by)
         VALUES (?, ?, ?, ?)`,
        [normalizedAddress, prize_id, prizeName, req.admin?.username || 'admin']
      );
    }
    
    secureLog('设置指定中奖', { 
      admin: req.admin?.username, 
      wallet: normalizedAddress.slice(0, 10),
      prize: prizeName 
    });
    
    res.json({ success: true, message: `已设置 ${normalizedAddress.slice(0, 10)}... 下次中奖为 ${prizeName}` });
    
  } catch (error) {
    console.error('设置指定中奖失败:', error.message);
    res.status(500).json({ success: false, message: '设置失败' });
  }
});

/**
 * 删除指定中奖
 * DELETE /api/admin/lucky-wheel/rigged/:id
 */
router.delete('/lucky-wheel/rigged/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await dbQuery('DELETE FROM lucky_wheel_rigged WHERE id = ?', [id]);
    
    if (result.affectedRows > 0) {
      res.json({ success: true, message: '删除成功' });
    } else {
      res.status(404).json({ success: false, message: '记录不存在' });
    }
    
  } catch (error) {
    console.error('删除指定中奖失败:', error.message);
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// ==================== 数据清理管理 ====================

/**
 * 检测虚假充值账户
 * GET /api/admin/data-cleanup/fake-deposits
 */
router.get('/data-cleanup/fake-deposits', authMiddleware, async (req, res) => {
  try {
    // 查找余额与充值严重不符的账户
    const fakeAccounts = await dbQuery(`
      SELECT 
        b.wallet_address,
        b.usdt_balance,
        b.wld_balance,
        b.total_deposit,
        b.total_profit,
        b.manual_added_balance,
        COALESCE(d.actual_deposit, 0) as actual_deposit,
        (b.usdt_balance - COALESCE(d.actual_deposit, 0)) as fake_amount
      FROM user_balances b
      LEFT JOIN (
        SELECT wallet_address, SUM(amount) as actual_deposit
        FROM deposit_records 
        WHERE status = 'completed'
        GROUP BY wallet_address
      ) d ON b.wallet_address = d.wallet_address
      WHERE b.usdt_balance > 100 
        AND (b.usdt_balance - COALESCE(d.actual_deposit, 0)) > 1000
      ORDER BY (b.usdt_balance - COALESCE(d.actual_deposit, 0)) DESC
    `);
    
    // 查找可疑的充值记录（交易哈希格式异常）
    const suspiciousDeposits = await dbQuery(`
      SELECT 
        id, wallet_address, amount, tx_hash, status, created_at,
        LENGTH(tx_hash) as hash_length,
        CASE 
          WHEN LENGTH(tx_hash) = 66 AND tx_hash LIKE '0x%' THEN 'valid'
          WHEN tx_hash LIKE '%INCOMPLETE%' THEN 'incomplete'
          ELSE 'suspicious'
        END as validity
      FROM deposit_records
      WHERE LENGTH(tx_hash) != 66 OR tx_hash LIKE '%INCOMPLETE%'
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      data: {
        fakeAccounts,
        suspiciousDeposits,
        summary: {
          fakeAccountCount: fakeAccounts.length,
          suspiciousDepositCount: suspiciousDeposits.length,
          totalFakeAmount: fakeAccounts.reduce((sum, a) => sum + parseFloat(a.fake_amount || 0), 0)
        }
      }
    });
    
  } catch (error) {
    console.error('检测虚假充值失败:', error.message);
    res.status(500).json({ success: false, message: '检测失败' });
  }
});

/**
 * 清理虚假账户余额
 * POST /api/admin/data-cleanup/clear-fake-balance
 */
router.post('/data-cleanup/clear-fake-balance', authMiddleware, async (req, res) => {
  try {
    const { wallet_address, keep_real_deposit } = req.body;
    
    if (!wallet_address) {
      return res.status(400).json({ success: false, message: '缺少钱包地址' });
    }
    
    const normalizedAddress = wallet_address.toLowerCase();
    
    // 备份数据
    await dbQuery(`
      INSERT INTO user_balances_cleanup_log 
      (wallet_address, usdt_balance_before, wld_balance_before, total_deposit_before, action, admin_user, created_at)
      SELECT wallet_address, usdt_balance, wld_balance, total_deposit, 'clear_fake', ?, NOW()
      FROM user_balances WHERE wallet_address = ?
    `, [req.admin?.username || 'admin', normalizedAddress]);
    
    // 获取真实充值金额
    const [realDeposit] = await dbQuery(`
      SELECT COALESCE(SUM(amount), 0) as real_amount
      FROM deposit_records 
      WHERE wallet_address = ? AND status = 'completed'
    `, [normalizedAddress]);
    
    const realAmount = parseFloat(realDeposit?.real_amount || 0);
    
    // 清理余额
    if (keep_real_deposit && realAmount > 0) {
      // 保留真实充值记录，余额清零
      await dbQuery(`
        UPDATE user_balances 
        SET usdt_balance = 0, 
            wld_balance = 0, 
            total_deposit = ?,
            total_profit = 0,
            total_referral_reward = 0,
            manual_added_balance = 0,
            updated_at = NOW()
        WHERE wallet_address = ?
      `, [realAmount, normalizedAddress]);
    } else {
      // 完全清零
      await dbQuery(`
        UPDATE user_balances 
        SET usdt_balance = 0, 
            wld_balance = 0, 
            total_deposit = 0, 
            total_withdraw = 0,
            total_profit = 0,
            total_referral_reward = 0,
            manual_added_balance = 0,
            updated_at = NOW()
        WHERE wallet_address = ?
      `, [normalizedAddress]);
    }
    
    secureLog('清理虚假余额', { 
      admin: req.admin?.username, 
      wallet: normalizedAddress.slice(0, 10),
      realDeposit: realAmount
    });
    
    res.json({ 
      success: true, 
      message: `已清理 ${normalizedAddress.slice(0, 10)}... 的虚假余额` 
    });
    
  } catch (error) {
    console.error('清理虚假余额失败:', error.message);
    res.status(500).json({ success: false, message: '清理失败' });
  }
});

/**
 * 批量清理虚假账户
 * POST /api/admin/data-cleanup/batch-clear
 */
router.post('/data-cleanup/batch-clear', authMiddleware, async (req, res) => {
  try {
    const { wallet_addresses } = req.body;
    
    if (!wallet_addresses || !Array.isArray(wallet_addresses) || wallet_addresses.length === 0) {
      return res.status(400).json({ success: false, message: '缺少钱包地址列表' });
    }
    
    let cleared = 0;
    
    for (const address of wallet_addresses) {
      const normalizedAddress = address.toLowerCase();
      
      // 备份
      await dbQuery(`
        INSERT INTO user_balances_cleanup_log 
        (wallet_address, usdt_balance_before, wld_balance_before, total_deposit_before, action, admin_user, created_at)
        SELECT wallet_address, usdt_balance, wld_balance, total_deposit, 'batch_clear', ?, NOW()
        FROM user_balances WHERE wallet_address = ?
      `, [req.admin?.username || 'admin', normalizedAddress]);
      
      // 获取真实充值
      const [realDeposit] = await dbQuery(`
        SELECT COALESCE(SUM(amount), 0) as real_amount
        FROM deposit_records 
        WHERE wallet_address = ? AND status = 'completed'
      `, [normalizedAddress]);
      
      const realAmount = parseFloat(realDeposit?.real_amount || 0);
      
      // 清理
      await dbQuery(`
        UPDATE user_balances 
        SET usdt_balance = 0, 
            wld_balance = 0, 
            total_deposit = ?,
            total_profit = 0,
            total_referral_reward = 0,
            manual_added_balance = 0,
            updated_at = NOW()
        WHERE wallet_address = ?
      `, [realAmount, normalizedAddress]);
      
      cleared++;
    }
    
    secureLog('批量清理虚假余额', { 
      admin: req.admin?.username, 
      count: cleared 
    });
    
    res.json({ 
      success: true, 
      message: `已清理 ${cleared} 个账户` 
    });
    
  } catch (error) {
    console.error('批量清理失败:', error.message);
    res.status(500).json({ success: false, message: '批量清理失败' });
  }
});

/**
 * 删除可疑充值记录
 * DELETE /api/admin/data-cleanup/suspicious-deposit/:id
 */
router.delete('/data-cleanup/suspicious-deposit/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 备份记录
    await dbQuery(`
      INSERT INTO deposit_records_cleanup_log 
      (original_id, wallet_address, amount, tx_hash, status, admin_user, created_at)
      SELECT id, wallet_address, amount, tx_hash, status, ?, NOW()
      FROM deposit_records WHERE id = ?
    `, [req.admin?.username || 'admin', id]);
    
    // 删除记录
    const result = await dbQuery('DELETE FROM deposit_records WHERE id = ?', [id]);
    
    if (result.affectedRows > 0) {
      secureLog('删除可疑充值记录', { admin: req.admin?.username, id });
      res.json({ success: true, message: '删除成功' });
    } else {
      res.status(404).json({ success: false, message: '记录不存在' });
    }
    
  } catch (error) {
    console.error('删除可疑充值记录失败:', error.message);
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

/**
 * 获取推荐关系列表
 * GET /api/admin/data-cleanup/referrals
 */
router.get('/data-cleanup/referrals', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.query;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    
    let whereClause = '1=1';
    const params = [];
    
    if (wallet_address) {
      whereClause += ' AND (r.wallet_address LIKE ? OR r.referrer_address LIKE ?)';
      params.push(`%${wallet_address}%`, `%${wallet_address}%`);
    }
    
    const [countResult] = await dbQuery(
      `SELECT COUNT(*) as total FROM user_referrals r WHERE ${whereClause}`,
      params
    );
    
    const referrals = await dbQuery(`
      SELECT 
        r.id,
        r.wallet_address as user_address,
        r.referrer_address,
        r.created_at,
        COALESCE(ub.usdt_balance, 0) as user_balance,
        COALESCE(ub.total_deposit, 0) as user_deposit
      FROM user_referrals r
      LEFT JOIN user_balances ub ON r.wallet_address = ub.wallet_address
      WHERE ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);
    
    res.json({
      success: true,
      data: {
        referrals,
        total: countResult?.total || 0,
        page,
        pageSize
      }
    });
    
  } catch (error) {
    console.error('获取推荐关系失败:', error.message);
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

/**
 * 移除推荐关系
 * DELETE /api/admin/data-cleanup/referral/:id
 */
router.delete('/data-cleanup/referral/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 获取要删除的记录
    const [record] = await dbQuery('SELECT * FROM user_referrals WHERE id = ?', [id]);
    
    if (!record) {
      return res.status(404).json({ success: false, message: '记录不存在' });
    }
    
    // 备份记录到清理日志 (字段: referral_id, wallet_address, referrer_address, operator)
    await dbQuery(`
      INSERT INTO referrals_cleanup_log 
      (referral_id, wallet_address, referrer_address, cleanup_reason, operator, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `, [id, record.wallet_address, record.referrer_address, '管理员手动移除', req.admin?.username || 'admin']);
    
    // 删除记录
    await dbQuery('DELETE FROM user_referrals WHERE id = ?', [id]);
    
    secureLog('移除推荐关系', { 
      admin: req.admin?.username,
      user: record.wallet_address?.slice(0, 10),
      referrer: record.referrer_address?.slice(0, 10)
    });
    
    res.json({ success: true, message: '移除成功' });
    
  } catch (error) {
    console.error('移除推荐关系失败:', error.message);
    res.status(500).json({ success: false, message: '移除失败' });
  }
});

/**
 * 批量移除推荐关系
 * POST /api/admin/data-cleanup/batch-remove-referrals
 */
router.post('/data-cleanup/batch-remove-referrals', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: '缺少ID列表' });
    }
    
    let removed = 0;
    
    for (const id of ids) {
      const [record] = await dbQuery('SELECT * FROM user_referrals WHERE id = ?', [id]);
      
      if (record) {
        // 备份 (user_referrals 表的字段是 wallet_address)
        await dbQuery(`
          INSERT INTO referrals_cleanup_log 
          (original_id, user_address, referrer_address, admin_user, created_at)
          VALUES (?, ?, ?, ?, NOW())
        `, [id, record.wallet_address, record.referrer_address, req.admin?.username || 'admin']);
        
        // 删除
        await dbQuery('DELETE FROM user_referrals WHERE id = ?', [id]);
        removed++;
      }
    }
    
    secureLog('批量移除推荐关系', { admin: req.admin?.username, count: removed });
    
    res.json({ success: true, message: `已移除 ${removed} 条推荐关系` });
    
  } catch (error) {
    console.error('批量移除推荐关系失败:', error.message);
    res.status(500).json({ success: false, message: '批量移除失败' });
  }
});

/**
 * 获取清理日志
 * GET /api/admin/data-cleanup/logs
 */
router.get('/data-cleanup/logs', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const offset = (page - 1) * pageSize;
    
    // 获取余额清理日志
    const balanceLogs = await dbQuery(`
      SELECT * FROM user_balances_cleanup_log
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [pageSize, offset]);
    
    // 获取推荐关系清理日志
    const referralLogs = await dbQuery(`
      SELECT * FROM referrals_cleanup_log
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [pageSize, offset]);
    
    res.json({
      success: true,
      data: {
        balanceLogs,
        referralLogs
      }
    });
    
  } catch (error) {
    console.error('获取清理日志失败:', error.message);
    res.status(500).json({ success: false, message: '获取日志失败' });
  }
});

// ==================== 安全监控接口 ====================

/**
 * Get security statistics
 * GET /api/admin/security/stats
 */
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

// ========================================
// User Invite Stats Management APIs
// ========================================

/**
 * Search users for invite stats management
 * GET /api/admin/invite-stats/search?q=wallet_address_or_query
 */
router.get('/invite-stats/search', authMiddleware, async (req, res) => {
  try {
    const { q = '', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Search users by wallet address (use user_balances table)
    let whereClause = '1=1';
    let params = [];
    
    if (q && q.trim()) {
      const searchTerm = `%${q.trim().toLowerCase()}%`;
      whereClause = 'LOWER(wallet_address) LIKE ?';
      params.push(searchTerm);
    }
    
    // Get total count from user_balances table
    const countResult = await dbQuery(
      `SELECT COUNT(DISTINCT wallet_address) as total FROM user_balances WHERE ${whereClause}`,
      params
    );
    const total = countResult[0]?.total || 0;
    
    // Get users with their current adjustments from user_balances table
    // Use COLLATE to fix charset mismatch between tables
    const users = await dbQuery(`
      SELECT 
        u.wallet_address,
        u.created_at as user_created_at,
        COALESCE(a.daily_income_adj, 0) as daily_income_adj,
        COALESCE(a.team_members_adj, 0) as team_members_adj,
        COALESCE(a.total_recharge_adj, 0) as total_recharge_adj,
        COALESCE(a.direct_members_adj, 0) as direct_members_adj,
        COALESCE(a.total_withdrawals_adj, 0) as total_withdrawals_adj,
        COALESCE(a.total_performance_adj, 0) as total_performance_adj,
        COALESCE(a.referral_reward_adj, 0) as referral_reward_adj,
        COALESCE(a.team_reward_adj, 0) as team_reward_adj,
        a.notes,
        a.updated_by,
        a.updated_at as adj_updated_at
      FROM user_balances u
      LEFT JOIN user_invite_adjustments a ON u.wallet_address COLLATE utf8mb4_unicode_ci = a.wallet_address COLLATE utf8mb4_unicode_ci
      WHERE ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    
    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('搜索用户邀请统计失败:', error.message);
    res.status(500).json({ success: false, message: '搜索失败: ' + error.message });
  }
});

/**
 * Get single user's invite stats (real + adjustments)
 * GET /api/admin/invite-stats/:wallet_address
 */
router.get('/invite-stats/:wallet_address', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const walletAddr = wallet_address.toLowerCase();
    
    // Get real stats from various tables
    // Direct members count
    const directResult = await dbQuery(
      'SELECT COUNT(*) as count FROM user_referrals WHERE referrer_address = ?',
      [walletAddr]
    );
    const realDirectMembers = parseInt(directResult[0]?.count) || 0;
    
    // Team members (simplified - 8 levels)
    let teamMembers = realDirectMembers;
    let currentLevelWallets = [walletAddr];
    const level1Result = await dbQuery(
      'SELECT wallet_address FROM user_referrals WHERE referrer_address = ?',
      [walletAddr]
    );
    let allTeamWallets = level1Result.map(r => r.wallet_address);
    currentLevelWallets = [...allTeamWallets];
    
    for (let level = 2; level <= 8; level++) {
      if (currentLevelWallets.length === 0) break;
      const placeholders = currentLevelWallets.map(() => '?').join(',');
      const levelResult = await dbQuery(
        `SELECT wallet_address FROM user_referrals WHERE referrer_address IN (${placeholders})`,
        currentLevelWallets
      );
      currentLevelWallets = levelResult.map(r => r.wallet_address);
      allTeamWallets = allTeamWallets.concat(currentLevelWallets);
      teamMembers += currentLevelWallets.length;
    }
    
    // Total recharge
    let totalRecharge = 0;
    if (allTeamWallets.length > 0) {
      const placeholders = allTeamWallets.map(() => '?').join(',');
      const rechargeResult = await dbQuery(
        `SELECT COALESCE(SUM(amount), 0) as total FROM deposit_records 
         WHERE wallet_address IN (${placeholders}) AND status = 'completed'`,
        allTeamWallets
      );
      totalRecharge = parseFloat(rechargeResult[0]?.total) || 0;
    }
    
    // Total withdrawals
    let totalWithdrawals = 0;
    if (allTeamWallets.length > 0) {
      const placeholders = allTeamWallets.map(() => '?').join(',');
      const withdrawResult = await dbQuery(
        `SELECT COALESCE(SUM(amount), 0) as total FROM withdraw_records 
         WHERE wallet_address IN (${placeholders}) AND status = 'completed'`,
        allTeamWallets
      );
      totalWithdrawals = parseFloat(withdrawResult[0]?.total) || 0;
    }
    
    // Referral reward
    const referralResult = await dbQuery(
      'SELECT COALESCE(SUM(reward_amount), 0) as total FROM referral_rewards WHERE wallet_address = ?',
      [walletAddr]
    );
    const totalReferralReward = parseFloat(referralResult[0]?.total) || 0;
    
    // Team reward
    const teamRewardResult = await dbQuery(
      'SELECT COALESCE(SUM(reward_amount), 0) as total FROM team_rewards WHERE wallet_address = ?',
      [walletAddr]
    );
    const totalTeamReward = parseFloat(teamRewardResult[0]?.total) || 0;
    
    // Today's daily income
    let teamDailyIncome = 0;
    if (allTeamWallets.length > 0) {
      const placeholders = allTeamWallets.map(() => '?').join(',');
      const dailyResult = await dbQuery(
        `SELECT COALESCE(SUM(earning_amount), 0) as total
         FROM robot_earnings WHERE wallet_address IN (${placeholders}) AND DATE(created_at) = CURDATE()`,
        allTeamWallets
      );
      teamDailyIncome = parseFloat(dailyResult[0]?.total) || 0;
    }
    // Add user's own earnings + rewards
    const myDailyResult = await dbQuery(`
      SELECT 
        (SELECT COALESCE(SUM(earning_amount), 0) FROM robot_earnings WHERE wallet_address = ? AND DATE(created_at) = CURDATE()) +
        (SELECT COALESCE(SUM(reward_amount), 0) FROM referral_rewards WHERE wallet_address = ? AND DATE(created_at) = CURDATE()) +
        (SELECT COALESCE(SUM(reward_amount), 0) FROM team_rewards WHERE wallet_address = ? AND DATE(created_at) = CURDATE()) as total
    `, [walletAddr, walletAddr, walletAddr]);
    teamDailyIncome += parseFloat(myDailyResult[0]?.total) || 0;
    
    // Get adjustments
    const adjResult = await dbQuery(
      'SELECT * FROM user_invite_adjustments WHERE wallet_address = ?',
      [walletAddr]
    );
    const adjustments = adjResult[0] || {};
    
    res.json({
      success: true,
      data: {
        wallet_address: walletAddr,
        real_stats: {
          daily_income: teamDailyIncome,
          team_members: teamMembers,
          total_recharge: totalRecharge,
          direct_members: realDirectMembers,
          total_withdrawals: totalWithdrawals,
          total_performance: totalRecharge,
          referral_reward: totalReferralReward,
          team_reward: totalTeamReward
        },
        adjustments: {
          daily_income_adj: parseFloat(adjustments.daily_income_adj) || 0,
          team_members_adj: parseInt(adjustments.team_members_adj) || 0,
          total_recharge_adj: parseFloat(adjustments.total_recharge_adj) || 0,
          direct_members_adj: parseInt(adjustments.direct_members_adj) || 0,
          total_withdrawals_adj: parseFloat(adjustments.total_withdrawals_adj) || 0,
          total_performance_adj: parseFloat(adjustments.total_performance_adj) || 0,
          referral_reward_adj: parseFloat(adjustments.referral_reward_adj) || 0,
          team_reward_adj: parseFloat(adjustments.team_reward_adj) || 0,
          notes: adjustments.notes || '',
          updated_by: adjustments.updated_by || '',
          updated_at: adjustments.updated_at || null
        },
        display_stats: {
          daily_income: teamDailyIncome + (parseFloat(adjustments.daily_income_adj) || 0),
          team_members: teamMembers + (parseInt(adjustments.team_members_adj) || 0),
          total_recharge: totalRecharge + (parseFloat(adjustments.total_recharge_adj) || 0),
          direct_members: realDirectMembers + (parseInt(adjustments.direct_members_adj) || 0),
          total_withdrawals: totalWithdrawals + (parseFloat(adjustments.total_withdrawals_adj) || 0),
          total_performance: totalRecharge + (parseFloat(adjustments.total_performance_adj) || 0),
          referral_reward: totalReferralReward + (parseFloat(adjustments.referral_reward_adj) || 0),
          team_reward: totalTeamReward + (parseFloat(adjustments.team_reward_adj) || 0)
        }
      }
    });
  } catch (error) {
    console.error('获取用户邀请统计失败:', error.message);
    res.status(500).json({ success: false, message: '获取失败: ' + error.message });
  }
});

/**
 * Update user's invite stats adjustments
 * PUT /api/admin/invite-stats/:wallet_address
 */
router.put('/invite-stats/:wallet_address', authMiddleware, async (req, res) => {
  try {
    const { wallet_address } = req.params;
    const walletAddr = wallet_address.toLowerCase();
    const adminUser = req.admin?.username || 'unknown';
    
    const {
      daily_income_adj = 0,
      team_members_adj = 0,
      total_recharge_adj = 0,
      direct_members_adj = 0,
      total_withdrawals_adj = 0,
      total_performance_adj = 0,
      referral_reward_adj = 0,
      team_reward_adj = 0,
      notes = ''
    } = req.body;
    
    // Validate user exists
    const userExists = await dbQuery(
      'SELECT wallet_address FROM users WHERE wallet_address = ?',
      [walletAddr]
    );
    
    if (!userExists || userExists.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // Upsert adjustments
    await dbQuery(`
      INSERT INTO user_invite_adjustments 
        (wallet_address, daily_income_adj, team_members_adj, total_recharge_adj, 
         direct_members_adj, total_withdrawals_adj, total_performance_adj,
         referral_reward_adj, team_reward_adj, notes, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        daily_income_adj = VALUES(daily_income_adj),
        team_members_adj = VALUES(team_members_adj),
        total_recharge_adj = VALUES(total_recharge_adj),
        direct_members_adj = VALUES(direct_members_adj),
        total_withdrawals_adj = VALUES(total_withdrawals_adj),
        total_performance_adj = VALUES(total_performance_adj),
        referral_reward_adj = VALUES(referral_reward_adj),
        team_reward_adj = VALUES(team_reward_adj),
        notes = VALUES(notes),
        updated_by = VALUES(updated_by)
    `, [
      walletAddr,
      parseFloat(daily_income_adj) || 0,
      parseInt(team_members_adj) || 0,
      parseFloat(total_recharge_adj) || 0,
      parseInt(direct_members_adj) || 0,
      parseFloat(total_withdrawals_adj) || 0,
      parseFloat(total_performance_adj) || 0,
      parseFloat(referral_reward_adj) || 0,
      parseFloat(team_reward_adj) || 0,
      notes,
      adminUser
    ]);
    
    secureLog('info', '更新用户邀请统计调整', {
      admin: adminUser,
      wallet: walletAddr,
      adjustments: req.body
    });
    
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('更新用户邀请统计调整失败:', error.message);
    res.status(500).json({ success: false, message: '更新失败: ' + error.message });
  }
});

/**
 * Get list of all users with adjustments
 * GET /api/admin/invite-stats/adjusted-users
 */
router.get('/invite-stats-adjusted', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Count users with non-zero adjustments
    const countResult = await dbQuery(`
      SELECT COUNT(*) as total FROM user_invite_adjustments 
      WHERE daily_income_adj != 0 OR team_members_adj != 0 OR total_recharge_adj != 0 
         OR direct_members_adj != 0 OR total_withdrawals_adj != 0 OR total_performance_adj != 0
         OR referral_reward_adj != 0 OR team_reward_adj != 0
    `);
    const total = countResult[0]?.total || 0;
    
    // Get adjusted users
    const users = await dbQuery(`
      SELECT * FROM user_invite_adjustments 
      WHERE daily_income_adj != 0 OR team_members_adj != 0 OR total_recharge_adj != 0 
         OR direct_members_adj != 0 OR total_withdrawals_adj != 0 OR total_performance_adj != 0
         OR referral_reward_adj != 0 OR team_reward_adj != 0
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limit), offset]);
    
    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('获取调整用户列表失败:', error.message);
    res.status(500).json({ success: false, message: '获取失败: ' + error.message });
  }
});

export default router;
