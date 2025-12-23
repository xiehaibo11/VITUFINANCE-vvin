import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import axios from 'axios';
import { createHash } from 'node:crypto';
import { healthCheck as dbHealthCheck, query as dbQuery } from './db.js';
import adminRoutes from './src/adminRoutes.js';

// ==================== 新的机器人路由模块（小时精度修复） ====================
import { 
    router as robotRoutes, 
    setDbQuery as setRobotDbQuery,
    processExpiredRobots,
    processAllExpiredRobots 
} from './src/routes/robotRoutes.js';
import { 
    setDbQuery as setCronDbQuery, 
    startCronJob 
} from './src/cron/robotExpiryCron.js';

// 钱包签名认证路由（TokenPocket 等）
import authRoutes from './src/routes/authRoutes.js';

// 导入团队经纪人每日分红定时任务
import {
    setDbQuery as setTeamCronDbQuery,
    initTeamRewardsTable,
    initCronLogsTable,
    startTeamDividendCron,
    manualProcessDividends,
    processWalletDailyDividend,      // 立即发放单用户分红（达到要求即发放）
    processUplineDailyDividends      // 触发上级链路的分红检查
} from './src/cron/teamDividendCron.js';

// 导入充值监控定时任务
import { startDepositMonitor, triggerScan as triggerDepositScan } from './src/cron/depositMonitorCron.js';

// 导入抽奖转盘路由
import luckyWheelRoutes, { 
    setDbQuery as setLuckyWheelDbQuery, 
    initLuckyWheelTables,
    addLuckyPoints 
} from './src/routes/luckyWheelRoutes.js';

// 导入模拟金额自动增长定时任务
import { startSimulatedGrowthCron, getPageTotalAmount } from './src/cron/simulatedGrowthCron.js';

// 导入经纪人等级定时任务
import { 
    startBrokerLevelCron, 
    setDbQuery as setBrokerDbQuery,
    calculateAllBrokerLevels 
} from './src/cron/brokerLevelCron.js';

// 导入推荐奖励数学工具（统一管理奖励比例，避免硬编码）
import {
    CEX_REFERRAL_RATES,            // CEX 8级奖励比例 [0.30, 0.10, 0.05, 0.01, ...]
    calculateLevelReward           // 单级奖励计算函数
} from './src/utils/referralMath.js';

// 团队经纪人规则常量（统一口径，避免 20/100 混用）
import { MIN_ROBOT_PURCHASE } from './src/utils/teamMath.js';

// 导入错误日志模块
import {
    initErrorLogsTable,
    logError,
    errorLoggerMiddleware,
    setupGlobalErrorHandlers,
    ErrorLevel,
    ErrorSource
} from './src/utils/errorLogger.js';

// 安全模块导入
import {
    isValidWalletAddress,
    normalizeWalletAddress,
    isValidTxHash,
    isValidAmount,
    sanitizeString,
    sanitizePagination,
    secureLog,
    globalInputSanitizer
} from './src/security/index.js';
import {
    helmetMiddleware,
    generalLimiter,
    sensitiveLimiter,
    quantifyLimiter,
    requestLogger,
    ipBlacklistMiddleware,
    recordSuspiciousActivity
} from './src/middleware/security.js';

// CSRF防护模块导入
import {
    sessionMiddleware,
    csrfProtection,
    csrfTokenMiddleware,
    csrfErrorHandler,
    apiCsrfProtection,
    setupCsrfRoutes
} from './src/middleware/csrf.js';

// 高级安全中间件导入 - 综合防护系统
import {
    initSecurityModules,
    comprehensiveSecurityMiddleware,
    additionalSecurityHeadersMiddleware,
    bruteForceProtectionMiddleware,
    clearLoginAttempts,
    pathTraversalProtectionMiddleware,
    uploadProtectionMiddleware,
    getSecurityStats,
    getBlockedIPsList,
    blockIP as securityBlockIP,
    getClientIP
} from './src/security/securityMiddleware.js';

// SQL注入防护模块导入
import {
    sqlInjectionMiddleware,
    walletValidationMiddleware,
    isValidWalletAddress as sqlIsValidWallet,
    detectSqlInjection
} from './src/security/sqlInjectionProtection.js';

// Enhanced security protection module - 2024-12-21
import {
    initEnhancedProtection,
    isIPBlocked,
    blockIP as enhancedBlockIP,
    recordAttack,
    validateRequest,
    enhancedProtectionMiddleware
} from './src/security/enhancedProtection.js';

// 审计日志模块导入
import {
    auditBalanceChange,
    auditUserAuth,
    auditAdminAction,
    auditSecurityEvent,
    auditRobotOperation,
    AuditLogType,
    AuditLogLevel
} from './src/utils/auditLogger.js';

// 导入 BSC 转账服务
import {
    initializeBSCProvider
} from './src/utils/bscTransferService.js';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 信任代理配置 (因为在Nginx反向代理后面)
// 设为1表示只信任最近的一个代理（Nginx）
// 这样Express限流器可以正确识别真实用户IP
app.set('trust proxy', 1);

// 初始化全局错误处理器
setupGlobalErrorHandlers();

// ==================== 安全中间件配置 ====================

// Helmet 安全头
app.use(helmetMiddleware);

// 额外安全头（补充Helmet）
app.use(additionalSecurityHeadersMiddleware);

// 目录遍历防护
app.use(pathTraversalProtectionMiddleware);

// 综合安全中间件（IP防护、SQL注入检测、XSS防护、Bot检测）
app.use(comprehensiveSecurityMiddleware);

// IP黑名单检查
app.use(ipBlacklistMiddleware);

// 请求日志
app.use(requestLogger);

// 解析请求体
app.use(bodyParser.json({ limit: '10kb' })); // 限制请求体大小，防止DOS攻击
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' }));

// Session中间件（用于CSRF防护）
app.use(sessionMiddleware);

// 全局输入清理中间件（必须在bodyParser之后）
app.use(globalInputSanitizer);

// SQL注入防护中间件（检测所有请求参数中的SQL注入模式）
app.use(sqlInjectionMiddleware);

// CSRF令牌中间件
app.use(csrfTokenMiddleware);

// API CSRF防护（对POST/PUT/DELETE请求验证CSRF令牌）
app.use('/api/user', apiCsrfProtection);
// 注意：/api/robot 路径的 CSRF 保护由 robotRoutes 内部处理（支持移动端钱包白名单）
// app.use('/api/robot', apiCsrfProtection); // 已注释，避免与内部白名单冲突
// 管理系统使用 JWT Token 认证，不需要 CSRF 保护
// app.use('/api/admin', apiCsrfProtection); // 已禁用 - 使用纯 JWT 认证

// CSRF错误处理中间件（必须在路由之前）
app.use(csrfErrorHandler);

// 静态文件服务 - 用于头像等上传文件的访问
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// CORS配置 - 生产环境与开发环境分离
const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? [
        'https://vitufinance.com',
        'https://www.vitufinance.com'
      ]
    : [
        'https://vitufinance.com',
        'https://www.vitufinance.com',
        'http://localhost:5173',
        'http://127.0.0.1:5173'
      ];

app.use(cors({
    origin: function (origin, callback) {
        // 允许无origin的请求（如移动端应用）
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log(`[CORS] 拒绝来源: ${origin}`);
            callback(new Error('CORS policy violation'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
    maxAge: 86400 // 预检请求缓存24小时
}));

// 应用通用速率限制
app.use('/api/', generalLimiter);

// 基础路由
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'VituFinance API Server',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// API 路由
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ==================== CSRF防护路由设置 ====================
setupCsrfRoutes(app);

// 数据库健康检查
app.get('/api/db/health', async (req, res) => {
    try {
        const info = await dbHealthCheck();
        res.json({
            success: true,
            db: info?.db || null,
            alive: info?.alive === 1
        });
    } catch (error) {
        console.error('DB health check failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Database connection failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 示例查询：列出当前数据库的表
app.get('/api/db/tables', async (req, res) => {
    try {
        const rows = await dbQuery('SHOW TABLES');
        res.json({ success: true, tables: rows });
    } catch (error) {
        console.error('DB tables query failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tables',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 市场数据代理 - 24h Ticker (支持多个symbol)
// NOTE: This endpoint gets the raw query string to bypass the globalInputSanitizer
// which converts quotes to &quot; and breaks JSON parsing
app.get('/api/market/ticker', async (req, res) => {
    try {
        // Get raw query string from request URL
        // This bypasses the sanitizer that converts " to &quot;
        const queryIndex = req.url.indexOf('?');
        const queryString = queryIndex >= 0 ? req.url.slice(queryIndex + 1) : '';
        
        // Extract symbols from raw query string
        const symbolsMatch = queryString.match(/symbols=([^&]*)/);
        if (!symbolsMatch) {
            return res.status(400).json({ success: false, message: 'symbols parameter is required' });
        }
        
        // Decode the URL-encoded symbols parameter
        const rawSymbols = decodeURIComponent(symbolsMatch[1]);
        
        // Parse symbols - handle both string array format and actual array
        let symbolsArray;
        try {
            // Try parsing as JSON array string like '["BTCUSDT","ETHUSDT"]'
            symbolsArray = JSON.parse(rawSymbols);
        } catch {
            // If not JSON, treat as single symbol
            symbolsArray = [rawSymbols];
        }
        
        // Validate symbols array
        if (!Array.isArray(symbolsArray) || symbolsArray.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid symbols format' });
        }
        
        // Validate each symbol (only uppercase letters and numbers allowed)
        const validSymbolRegex = /^[A-Z0-9]+$/;
        for (const symbol of symbolsArray) {
            if (!validSymbolRegex.test(symbol)) {
                return res.status(400).json({ success: false, message: 'Invalid symbol format' });
            }
        }
        
        // Format symbols for Binance API - use URL encoded JSON array
        const formattedSymbols = JSON.stringify(symbolsArray);
        const encodedSymbols = encodeURIComponent(formattedSymbols);
        
        // Call Binance API directly with the properly formatted URL
        const binanceUrl = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodedSymbols}`;
        const response = await axios.get(binanceUrl);
        
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching ticker data:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch ticker data', 
            error: error.message 
        });
    }
});

// 市场数据代理 - Klines
app.get('/api/market/klines', async (req, res) => {
    try {
        const { symbol, interval, limit } = req.query;
        const response = await axios.get('https://api.binance.com/api/v3/klines', {
            params: { symbol, interval, limit }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching kline data:', error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch kline data' });
    }
});

// 性能监控数据收集端点
app.post('/api/analytics/performance', (req, res) => {
    try {
        const performanceData = req.body;
        
        // 输出到日志（可以后续保存到数据库）
        console.log('📊 Performance Metric:', {
            name: performanceData.name,
            value: `${performanceData.value.toFixed(2)}ms`,
            rating: performanceData.rating,
            url: performanceData.url
        });
        
        // 如果需要保存到数据库，可以添加：
        // await dbQuery('INSERT INTO performance_metrics SET ?', performanceData);
        
        res.json({ success: true, message: 'Performance data recorded' });
    } catch (error) {
        console.error('保存性能数据失败:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to save performance data' 
        });
    }
});

// ==================== 公告管理 API ====================

// 初始化默认公告（服务启动时执行）
(async () => {
    try {
        // 创建公告表（如果不存在）
        await dbQuery(`
            CREATE TABLE IF NOT EXISTS announcements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                content TEXT,
                status ENUM('active', 'inactive') DEFAULT 'active',
                sort_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公告表'
        `);
        
        // 检查是否有公告数据
        const existingAnnouncements = await dbQuery('SELECT COUNT(*) as count FROM announcements');
        
        if (existingAnnouncements[0].count === 0) {
            // 插入默认公告
            await dbQuery(`
                INSERT INTO announcements (title, content, status, sort_order) VALUES
                ('Welcome to Vitu Finance! Start your AI-powered crypto journey.', 
                 'Welcome to Vitu Finance! We are a leading AI-powered cryptocurrency trading platform designed to help you maximize your investment potential. Our advanced AI robots analyze market trends 24/7 to identify the best trading opportunities for you.', 
                 'active', 100),
                ('Worldcoin WLD Staking Benefits', 
                 'Worldcoin aims to provide universal access to the global economy, no matter what country you are from or what background you come from. Create a place for all of us to benefit in the era of artificial intelligence, where you can stake your WLD to get more benefits.', 
                 'active', 90),
                ('AI Robot Trading Guide', 
                 'Our AI Robots work by analyzing market data, identifying trends, and executing trades automatically. CEX Robots operate on centralized exchanges like Binance and OKX, while DEX Robots trade on decentralized platforms for maximum security and privacy.', 
                 'active', 80),
                ('Grid Trading & High-Frequency Trading', 
                 'Grid Trading creates a grid of buy and sell orders at predetermined price intervals, profiting from market volatility. High-Frequency Trading uses advanced algorithms to execute thousands of trades per second, capturing small price differences.', 
                 'active', 70),
                ('Referral Program - Earn While You Share', 
                 'Join our referral program and earn up to 10 levels of rewards! Share your unique referral code with friends and earn a percentage of their trading profits. The more you refer, the higher your rewards.', 
                 'active', 60)
            `);
            console.log('[DB] 默认公告初始化完成');
        }
        console.log('[DB] 公告表初始化完成');
    } catch (error) {
        console.error('[DB] 初始化公告表失败:', error.message);
    }
})();

// 初始化用户行为记录表（服务启动时执行）
(async () => {
    try {
        // 创建用户行为记录表
        await dbQuery(`
            CREATE TABLE IF NOT EXISTS user_behaviors (
                id INT AUTO_INCREMENT PRIMARY KEY,
                wallet_address VARCHAR(100) DEFAULT NULL COMMENT '钱包地址（已连接则有）',
                ip_address VARCHAR(50) DEFAULT NULL COMMENT 'IP地址',
                user_agent TEXT COMMENT '浏览器信息',
                referral_code VARCHAR(20) DEFAULT NULL COMMENT '来源推荐码',
                action_type VARCHAR(50) NOT NULL COMMENT '行为类型',
                action_detail TEXT COMMENT '行为详情JSON',
                page_url VARCHAR(500) COMMENT '页面URL',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_wallet (wallet_address),
                INDEX idx_referral (referral_code),
                INDEX idx_action (action_type),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户行为记录表'
        `);
        console.log('[DB] 用户行为记录表初始化完成');
    } catch (error) {
        console.error('[DB] 初始化用户行为记录表失败:', error.message);
    }
})();

// 记录用户行为 API
// 支持 application/json 和 text/plain（navigator.sendBeacon 发送的）
app.post('/api/track-behavior', express.text({ type: 'text/plain' }), async (req, res) => {
    try {
        // 如果是 text/plain，需要手动解析 JSON
        let body = req.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {
                body = {};
            }
        }
        
        const { wallet_address, action_type, action_detail, page_url, referral_code } = body;
        const ip_address = req.ip || req.connection.remoteAddress;
        const user_agent = req.headers['user-agent'];
        
        if (!action_type) {
            return res.status(400).json({
                success: false,
                message: 'action_type is required'
            });
        }
        
        await dbQuery(
            `INSERT INTO user_behaviors (wallet_address, ip_address, user_agent, referral_code, action_type, action_detail, page_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [wallet_address || null, ip_address, user_agent, referral_code || null, action_type, JSON.stringify(action_detail || {}), page_url]
        );
        
        res.json({
            success: true,
            message: 'Behavior tracked'
        });
    } catch (error) {
        console.error('记录用户行为失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to track behavior'
        });
    }
});

// 获取公告列表（前台）- 只返回激活状态的公告
app.get('/api/announcements', async (req, res) => {
    try {
        const rows = await dbQuery(
            'SELECT id, title, content, created_at, status FROM announcements WHERE status = ? ORDER BY sort_order DESC, created_at DESC',
            ['active']
        );
        
        // 转换为前端期望的格式
        const notice = rows.map(row => ({
            id: row.id,
            title: row.title,
            content: row.content,
            show: false // 默认不展开
        }));
        
        res.json({
            code: 200,
            msg: 'success',
            info: {
                notice: notice
            }
        });
    } catch (error) {
        console.error('获取公告列表失败:', error.message);
        res.status(500).json({
            code: 500,
            msg: 'Failed to fetch announcements',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 获取公告详情
app.get('/api/announcements/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await dbQuery(
            'SELECT * FROM announcements WHERE id = ?',
            [id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Announcement not found'
            });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('获取公告详情失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch announcement',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 创建公告（管理后台用）
app.post('/api/announcements', async (req, res) => {
    try {
        const { title, content, status = 'active', sort_order = 0 } = req.body;
        
        if (!title) {
            return res.status(400).json({
                success: false,
                message: 'Title is required'
            });
        }
        
        const result = await dbQuery(
            'INSERT INTO announcements (title, content, status, sort_order) VALUES (?, ?, ?, ?)',
            [title, content, status, sort_order]
        );
        
        res.json({
            success: true,
            message: 'Announcement created successfully',
            data: {
                id: result.insertId,
                title,
                content,
                status,
                sort_order
            }
        });
    } catch (error) {
        console.error('创建公告失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to create announcement',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 更新公告（管理后台用）
app.put('/api/announcements/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, status, sort_order } = req.body;
        
        // 构建更新字段
        const updates = [];
        const values = [];
        
        if (title !== undefined) {
            updates.push('title = ?');
            values.push(title);
        }
        if (content !== undefined) {
            updates.push('content = ?');
            values.push(content);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }
        if (sort_order !== undefined) {
            updates.push('sort_order = ?');
            values.push(sort_order);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }
        
        values.push(id);
        
        const result = await dbQuery(
            `UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`,
            values
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Announcement not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Announcement updated successfully'
        });
    } catch (error) {
        console.error('更新公告失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to update announcement',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 删除公告（管理后台用）
app.delete('/api/announcements/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await dbQuery(
            'DELETE FROM announcements WHERE id = ?',
            [id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Announcement not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Announcement deleted successfully'
        });
    } catch (error) {
        console.error('删除公告失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to delete announcement',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== 用户钱包余额管理 API ====================

/**
 * 平台收款地址配置
 * 优先从数据库读取，支持后台动态修改
 */
let PLATFORM_WALLET_ADDRESS = process.env.PLATFORM_WALLET_ADDRESS || '0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4';

/**
 * 从数据库获取平台收款地址
 * 如果数据库没有配置，则使用环境变量默认值
 */
async function getPlatformWalletAddress() {
  try {
    const result = await dbQuery(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'platform_wallet_address'"
    );
    if (result.length > 0 && result[0].setting_value) {
      return result[0].setting_value;
    }
  } catch (error) {
    console.error('获取平台收款地址失败，使用默认值:', error.message);
  }
  return PLATFORM_WALLET_ADDRESS;
}

/**
 * 获取用户余额
 * GET /api/user/balance?wallet_address=0x...
 * 
 * 安全措施：
 * - 钱包地址格式验证
 * - 输入标准化
 */
app.get('/api/user/balance', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        // 验证钱包地址格式
        if (!isValidWalletAddress(wallet_address)) {
            recordSuspiciousActivity(req.ip, '无效的钱包地址格式');
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address format'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // 查询用户余额
        let rows = await dbQuery(
            'SELECT usdt_balance, wld_balance, total_deposit, total_withdraw FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (rows.length === 0) {
            // 用户不存在，自动创建记录
            secureLog('创建新用户', { wallet_address: walletAddr });
            await dbQuery(
                'INSERT INTO user_balances (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, created_at, updated_at) VALUES (?, 0, 0, 0, 0, NOW(), NOW())',
                [walletAddr]
            );
            
            // 返回默认值（包含奖励明细）
            return res.json({
                success: true,
                data: {
                    wallet_address: walletAddr,
                    usdt_balance: '0.0000',
                    wld_balance: '0.0000',
                    total_deposit: '0.0000',
                    total_withdraw: '0.0000',
                    total_referral_reward: '0.0000',
                    total_team_reward: '0.0000'
                }
            });
        }
        
        // 获取推荐奖励总额
        const referralRewardResult = await dbQuery(
            'SELECT COALESCE(SUM(reward_amount), 0) as total FROM referral_rewards WHERE wallet_address = ?',
            [walletAddr]
        );
        const totalReferralReward = parseFloat(referralRewardResult[0]?.total) || 0;
        
        // 获取团队奖励总额
        const teamRewardResult = await dbQuery(
            'SELECT COALESCE(SUM(reward_amount), 0) as total FROM team_rewards WHERE wallet_address = ?',
            [walletAddr]
        );
        const totalTeamReward = parseFloat(teamRewardResult[0]?.total) || 0;
        
        // Add cache control headers to prevent browser caching
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        res.json({
            success: true,
            data: {
                wallet_address: walletAddr,
                usdt_balance: parseFloat(rows[0].usdt_balance).toFixed(4),
                wld_balance: parseFloat(rows[0].wld_balance).toFixed(4),
                total_deposit: parseFloat(rows[0].total_deposit).toFixed(4),
                total_withdraw: parseFloat(rows[0].total_withdraw).toFixed(4),
                total_referral_reward: totalReferralReward.toFixed(4),
                total_team_reward: totalTeamReward.toFixed(4),
                // Add timestamp for cache busting
                _timestamp: Date.now(),
                _data_version: rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : Date.now()
            }
        });
    } catch (error) {
        console.error('获取用户余额失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user balance',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取平台收款地址（支持多链）
 * GET /api/platform/wallet
 * 从数据库动态读取，支持后台修改
 * 返回多个链的收款地址供用户选择
 */
app.get('/api/platform/wallet', async (req, res) => {
    try {
        // 从数据库获取配置
        const settings = await dbQuery(
            "SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'platform_wallet_%' OR setting_key IN ('platform_network', 'platform_token')"
        );
        
        // 转为对象
        const config = {};
        settings.forEach(s => {
            config[s.setting_key] = s.setting_value;
        });
        
        // 默认收款地址配置（多链支持）
        const defaultWallets = {
            BSC: {
                address: '0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4',
                chainId: '0x38',
                chainName: 'BNB Smart Chain',
                token: 'USDT',
                tokenContract: '0x55d398326f99059fF775485246999027B3197955',
                decimals: 18,
                rpcUrl: 'https://bsc-dataseed.binance.org/',
                explorer: 'https://bscscan.com/'
            },
            ETH: {
                address: '0x8a92c73FdE5d0313303989eB269d6d17ffb1ba9d',
                chainId: '0x1',
                chainName: 'Ethereum Mainnet',
                token: 'USDT',
                tokenContract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                decimals: 6,
                rpcUrl: 'https://mainnet.infura.io/v3/',
                explorer: 'https://etherscan.io/'
            }
        };
        
        // 从数据库覆盖默认配置
        if (config.platform_wallet_bsc) {
            defaultWallets.BSC.address = config.platform_wallet_bsc;
        }
        if (config.platform_wallet_eth) {
            defaultWallets.ETH.address = config.platform_wallet_eth;
        }
        
        res.json({
            success: true,
            data: {
                // 兼容旧版（默认返回BSC地址）
                address: config.platform_wallet_address || defaultWallets.BSC.address,
                network: config.platform_network || 'BSC',
                token: config.platform_token || 'USDT',
                // 新版多链配置
                wallets: defaultWallets,
                supportedChains: ['BSC', 'ETH']
            }
        });
    } catch (error) {
        console.error('获取平台收款地址失败:', error.message);
        // 出错时返回默认值
        res.json({
            success: true,
            data: {
                address: PLATFORM_WALLET_ADDRESS,
                network: 'BSC',
                token: 'USDT',
                wallets: {
                    BSC: {
                        address: '0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4',
                        chainId: '0x38',
                        chainName: 'BNB Smart Chain',
                        token: 'USDT',
                        tokenContract: '0x55d398326f99059fF775485246999027B3197955',
                        decimals: 18
                    },
                    ETH: {
                        address: '0x8a92c73FdE5d0313303989eB269d6d17ffb1ba9d',
                        chainId: '0x1',
                        chainName: 'Ethereum Mainnet',
                        token: 'USDT',
                        tokenContract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                        decimals: 6
                    }
                },
                supportedChains: ['BSC', 'ETH']
            }
        });
    }
});

/**
 * 获取前端资质文件配置（白皮书/MSB/营业执照）
 * GET /api/platform/documents
 *
 * 读取 system_settings，可由管理后台上传替换
 * 返回文件 URL、类型（pdf/image/gallery）和页数，前端根据类型决定显示方式
 */
app.get('/api/platform/documents', async (req, res) => {
    const defaults = {
        whitepaper_url: '/static/documents/whitepaper',
        whitepaper_type: 'gallery',
        whitepaper_pages: 26,
        msb_url: '/static/documents/MSB.png',
        msb_type: 'image',
        business_license_url: '/static/documents/license.png',
        business_license_type: 'image'
    };

    // Helper to detect file type from URL extension if type is not stored
    const detectTypeFromUrl = (url) => {
        if (!url) return 'image';
        const ext = url.toLowerCase().split('.').pop();
        return ext === 'pdf' ? 'pdf' : 'image';
    };

    try {
        const settings = await dbQuery(
            `SELECT setting_key, setting_value FROM system_settings 
             WHERE setting_key IN (
               'doc_whitepaper_url', 'doc_whitepaper_type', 'doc_whitepaper_pages',
               'doc_msb_url', 'doc_msb_type',
               'doc_business_license_url', 'doc_business_license_type'
             )`
        );

        const config = {};
        settings.forEach(s => {
            config[s.setting_key] = s.setting_value;
        });

        res.json({
            success: true,
            data: {
                whitepaper_url: config.doc_whitepaper_url || defaults.whitepaper_url,
                whitepaper_type: config.doc_whitepaper_type || detectTypeFromUrl(config.doc_whitepaper_url || defaults.whitepaper_url),
                whitepaper_pages: parseInt(config.doc_whitepaper_pages) || defaults.whitepaper_pages,
                msb_url: config.doc_msb_url || defaults.msb_url,
                msb_type: config.doc_msb_type || detectTypeFromUrl(config.doc_msb_url || defaults.msb_url),
                business_license_url: config.doc_business_license_url || defaults.business_license_url,
                business_license_type: config.doc_business_license_type || detectTypeFromUrl(config.doc_business_license_url || defaults.business_license_url)
            }
        });
    } catch (error) {
        console.error('获取资质文件配置失败:', error.message);
        res.json({
            success: true,
            data: defaults
        });
    }
});

/**
 * 管理员接口：手动添加用户余额
 * POST /api/admin/add-balance
 * body: { wallet_address, amount, admin_key }
 * 
 * 安全措施：
 * - 管理员密钥必须从环境变量获取
 * - 钱包地址格式验证
 * - 金额范围验证
 * - 敏感操作速率限制
 */
app.post('/api/admin/add-balance', sensitiveLimiter, async (req, res) => {
    try {
        const { wallet_address, amount, admin_key } = req.body;
        
        // 管理员密钥验证
        // 生产环境：必须从环境变量获取
        // 开发环境：可使用默认值（仅用于测试）
        const ADMIN_KEY = process.env.ADMIN_KEY || (process.env.NODE_ENV !== 'production' ? 'dev_admin_key_not_for_production' : null);
        
        if (!ADMIN_KEY) {
            console.error('❌ 生产环境必须设置 ADMIN_KEY 环境变量');
            return res.status(500).json({
                success: false,
                message: 'Server configuration error'
            });
        }
        
        if (!admin_key || admin_key !== ADMIN_KEY) {
            recordSuspiciousActivity(req.ip, '管理员接口认证失败');
            secureLog('管理员接口认证失败', { ip: req.ip });
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }
        
        if (!wallet_address || !amount) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address and amount are required'
            });
        }
        
        // 验证钱包地址格式
        if (!isValidWalletAddress(wallet_address)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address format'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // 验证金额（范围限制：0.0001 - 1000000）
        if (!isValidAmount(amount, 0.0001, 1000000)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount (must be between 0.0001 and 1000000)'
            });
        }
        
        const addAmount = parseFloat(amount);
        
        // 检查用户是否存在
        const userExists = await dbQuery(
            'SELECT id FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (userExists.length === 0) {
            // 创建新用户
            await dbQuery(
                'INSERT INTO user_balances (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, created_at, updated_at) VALUES (?, ?, 0, ?, 0, NOW(), NOW())',
                [walletAddr, addAmount, addAmount]
            );
        } else {
            // 更新现有用户余额
            await dbQuery(
                'UPDATE user_balances SET usdt_balance = usdt_balance + ?, total_deposit = total_deposit + ?, updated_at = NOW() WHERE wallet_address = ?',
                [addAmount, addAmount, walletAddr]
            );
        }
        
        // 获取更新后的余额
        const updatedBalance = await dbQuery(
            'SELECT usdt_balance, total_deposit FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        secureLog('管理员添加余额', { wallet_address: walletAddr, amount: addAmount, ip: req.ip });
        
        res.json({
            success: true,
            message: 'Balance added successfully',
            data: {
                wallet_address: walletAddr,
                added_amount: addAmount.toFixed(4),
                new_balance: parseFloat(updatedBalance[0].usdt_balance).toFixed(4),
                total_deposit: parseFloat(updatedBalance[0].total_deposit).toFixed(4)
            }
        });
    } catch (error) {
        console.error('添加余额失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to add balance',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 管理员接口：手动触发团队经纪人每日分红
 * POST /api/admin/trigger-team-dividend
 * body: { admin_key }
 * 
 * 用于测试团队分红功能
 */
app.post('/api/admin/trigger-team-dividend', sensitiveLimiter, async (req, res) => {
    try {
        const { admin_key } = req.body;

        // ✅ 安全修复：从环境变量获取管理员密钥，生产环境强制要求
        const ADMIN_KEY = process.env.ADMIN_KEY || (process.env.NODE_ENV !== 'production' ? 'dev_admin_key_not_for_production' : null);

        // ❌ 验证密钥存在（生产环境强制）
        if (!ADMIN_KEY) {
            console.error('❌ [Security] ADMIN_KEY 未配置，生产环境拒绝访问');
            return res.status(500).json({
                success: false,
                message: 'Server configuration error: ADMIN_KEY not set'
            });
        }

        // 验证管理员密钥
        if (admin_key !== ADMIN_KEY) {
            return res.status(403).json({
                success: false,
                message: 'Invalid admin key'
            });
        }

        console.log('[Admin] 手动触发团队分红...');

        // 调用手动处理分红函数
        const result = await manualProcessDividends();

        res.json({
            success: result.success,
            message: result.success ? 'Team dividend processed successfully' : 'Failed to process team dividend',
            data: result
        });

    } catch (error) {
        console.error('触发团队分红失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to trigger team dividend',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 多链配置（用于交易验证）
 * 支持 BSC 和 ETH 链
 */
const CHAIN_CONFIGS = {
    BSC: {
        name: 'BNB Smart Chain',
        rpcUrl: 'https://bsc-dataseed.binance.org/',
        usdtContract: '0x55d398326f99059fF775485246999027B3197955',
        decimals: 18,  // BSC USDT 是 18 位小数
        platformWallet: '0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4'
    },
    ETH: {
        name: 'Ethereum Mainnet',
        rpcUrl: 'https://eth.llamarpc.com',  // 以太坊公共RPC
        usdtContract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,   // ETH USDT 是 6 位小数
        platformWallet: '0x8a92c73FdE5d0313303989eB269d6d17ffb1ba9d'
    }
};

/**
 * 验证链上交易状态（支持多链：BSC/ETH）
 * @param {string} txHash - 交易哈希
 * @param {string} expectedFrom - 期望的发送方地址
 * @param {string} expectedTo - 期望的接收方地址（平台钱包）
 * @param {number} expectedAmount - 期望的金额
 * @param {string} chain - 链类型：'BSC' 或 'ETH'
 * @returns {Promise<{valid: boolean, message: string, actualAmount?: number}>}
 */
async function verifyChainTransaction(txHash, expectedFrom, expectedTo, expectedAmount, chain = 'BSC') {
    try {
        // 获取链配置
        const chainConfig = CHAIN_CONFIGS[chain];
        if (!chainConfig) {
            return { valid: false, message: `Unsupported chain: ${chain}` };
        }
        
        console.log(`[Deposit] Verifying ${chain} transaction:`, txHash);
        
        // 使用链对应的 RPC 查询交易收据
        const response = await fetch(chainConfig.rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getTransactionReceipt',
                params: [txHash]
            })
        });
        
        const data = await response.json();
        
        if (!data.result) {
            // 交易可能还在 pending，等待几秒后重试
            console.log(`[Deposit] ${chain} Transaction pending, waiting...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // 重试一次
            const retryResponse = await fetch(chainConfig.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_getTransactionReceipt',
                    params: [txHash]
                })
            });
            
            const retryData = await retryResponse.json();
            
            if (!retryData.result) {
                return { valid: false, message: 'Transaction not found or still pending' };
            }
            
            data.result = retryData.result;
        }
        
        const receipt = data.result;
        
        // 检查交易状态（0x1 = 成功）
        if (receipt.status !== '0x1') {
            return { valid: false, message: 'Transaction failed on blockchain' };
        }
        
        // 验证发送方地址
        if (receipt.from.toLowerCase() !== expectedFrom.toLowerCase()) {
            return { valid: false, message: 'Transaction sender does not match' };
        }
        
        // USDT 合约地址（根据链获取）
        const USDT_CONTRACT = chainConfig.usdtContract.toLowerCase();
        
        // 验证是 USDT 合约调用
        if (receipt.to.toLowerCase() !== USDT_CONTRACT) {
            return { valid: false, message: `Transaction is not a ${chain} USDT transfer` };
        }
        
        // 解析 Transfer 事件日志
        // Transfer(address indexed from, address indexed to, uint256 value)
        // Topic0: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
        const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        const transferLog = receipt.logs.find(log => 
            log.topics[0] === transferTopic &&
            log.address.toLowerCase() === USDT_CONTRACT
        );
        
        if (!transferLog) {
            return { valid: false, message: `No USDT transfer found in ${chain} transaction` };
        }
        
        // 解析接收方地址（topic2）
        const toAddress = '0x' + transferLog.topics[2].slice(26);
        if (toAddress.toLowerCase() !== expectedTo.toLowerCase()) {
            return { valid: false, message: 'Transfer recipient does not match platform wallet' };
        }
        
        // 解析转账金额（根据链的精度）
        const decimals = chainConfig.decimals;
        const rawAmount = BigInt(transferLog.data);
        const actualAmount = Number(rawAmount) / Math.pow(10, decimals);
        
        // 验证金额（允许小数精度误差）
        if (Math.abs(actualAmount - expectedAmount) > 0.01) {
            return { 
                valid: false, 
                message: `Amount mismatch: expected ${expectedAmount}, got ${actualAmount}`,
                actualAmount 
            };
        }
        
        console.log(`[Deposit] ${chain} Transaction verified successfully:`, {
            txHash,
            from: receipt.from,
            to: toAddress,
            amount: actualAmount,
            chain
        });
        
        return { valid: true, message: 'Transaction verified', actualAmount };
        
    } catch (error) {
        console.error(`[Deposit] ${chain} Transaction verification error:`, error);
        return { valid: false, message: 'Failed to verify transaction: ' + error.message };
    }
}

/**
 * 验证 BSC 链上交易状态（保留兼容性）
 * @param {string} txHash - 交易哈希
 * @param {string} expectedFrom - 期望的发送方地址
 * @param {string} expectedTo - 期望的接收方地址（平台钱包）
 * @param {number} expectedAmount - 期望的金额
 * @returns {Promise<{valid: boolean, message: string, actualAmount?: number}>}
 */
async function verifyBscTransaction(txHash, expectedFrom, expectedTo, expectedAmount) {
    return verifyChainTransaction(txHash, expectedFrom, expectedTo, expectedAmount, 'BSC');
}

/**
 * 创建充值记录
 * POST /api/user/deposit
 * body: { wallet_address, amount, tx_hash, chain, token }
 * 
 * 安全措施：
 * - 钱包地址格式验证
 * - 交易哈希格式验证
 * - 金额范围验证
 * - 防重复提交（tx_hash唯一）
 * - ✅ 验证区块链交易状态（支持多链：BSC/ETH）
 * - 敏感操作速率限制
 */
app.post('/api/user/deposit', sensitiveLimiter, async (req, res) => {
    try {
        const { wallet_address, amount, tx_hash, token = 'USDT', chain = 'BSC' } = req.body;
        
        if (!wallet_address || !amount || !tx_hash) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address, amount, and tx_hash are required'
            });
        }
        
        // 验证钱包地址格式
        if (!isValidWalletAddress(wallet_address)) {
            recordSuspiciousActivity(req.ip, '充值：无效的钱包地址');
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address format'
            });
        }
        
        // 验证交易哈希格式
        if (!isValidTxHash(tx_hash)) {
            recordSuspiciousActivity(req.ip, '充值：无效的交易哈希');
            return res.status(400).json({
                success: false,
                message: 'Invalid transaction hash format'
            });
        }
        
        // 验证金额（范围：0.0001 - 1000000）
        if (!isValidAmount(amount, 0.0001, 1000000)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount (must be between 0.0001 and 1000000)'
            });
        }
        
        // 验证链类型（只允许 BSC 或 ETH）
        const allowedChains = ['BSC', 'ETH'];
        const safeChain = allowedChains.includes(chain?.toUpperCase()) ? chain.toUpperCase() : 'BSC';
        
        // 验证token类型（只允许特定值）
        const allowedTokens = ['USDT', 'WLD'];
        const safeToken = allowedTokens.includes(token.toUpperCase()) ? token.toUpperCase() : 'USDT';
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        const depositAmount = parseFloat(amount);
        
        // 检查 tx_hash 是否已存在（防止重复充值）
        const existingDeposit = await dbQuery(
            'SELECT id FROM deposit_records WHERE tx_hash = ?',
            [tx_hash]
        );
        
        if (existingDeposit.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'This transaction has already been processed'
            });
        }
        
        // 获取平台收款钱包地址（根据链选择）
        const chainConfig = CHAIN_CONFIGS[safeChain];
        const platformWallet = chainConfig?.platformWallet || process.env.PLATFORM_WALLET_ADDRESS || '0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4';
        
        // ✅ 验证区块链交易状态（支持多链）
        console.log(`[Deposit] Verifying ${safeChain} transaction:`, tx_hash);
        const verification = await verifyChainTransaction(
            tx_hash,
            walletAddr,
            platformWallet,
            depositAmount,
            safeChain  // 传入链类型
        );
        
        if (!verification.valid) {
            recordSuspiciousActivity(req.ip, `充值验证失败: ${verification.message}`);
            return res.status(400).json({
                success: false,
                message: verification.message
            });
        }
        
        // 使用实际转账金额（如果与预期有微小差异）
        const actualDepositAmount = verification.actualAmount || depositAmount;

        // 创建充值记录 - 确保钱包地址为小写，避免大小写问题
        const normalizedWalletAddr = walletAddr.toLowerCase();
        await dbQuery(
            'INSERT INTO deposit_records (wallet_address, amount, token, network, tx_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [normalizedWalletAddr, actualDepositAmount, safeToken, safeChain, tx_hash, 'completed']
        );
        
        // 更新用户余额（或创建新用户记录）
        const userExists = await dbQuery(
            'SELECT id FROM user_balances WHERE wallet_address = ?',
            [normalizedWalletAddr]
        );

        if (userExists.length === 0) {
            // 创建新用户
            await dbQuery(
                'INSERT INTO user_balances (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, created_at, updated_at) VALUES (?, ?, 0, ?, 0, NOW(), NOW())',
                [normalizedWalletAddr, actualDepositAmount, actualDepositAmount]
            );
        } else {
            // 更新现有用户余额
            await dbQuery(
                'UPDATE user_balances SET usdt_balance = usdt_balance + ?, total_deposit = total_deposit + ?, updated_at = NOW() WHERE wallet_address = ?',
                [actualDepositAmount, actualDepositAmount, normalizedWalletAddr]
            );
        }

        // 更新充值记录状态为已完成，同时设置完成时间
        await dbQuery(
            'UPDATE deposit_records SET status = ?, completed_at = NOW() WHERE tx_hash = ?',
            ['completed', tx_hash]
        );

        // 获取更新后的余额
        const updatedBalance = await dbQuery(
            'SELECT usdt_balance, wld_balance FROM user_balances WHERE wallet_address = ?',
            [normalizedWalletAddr]
        );

        secureLog('充值成功', { wallet_address: normalizedWalletAddr, amount: actualDepositAmount, tx_hash, chain: safeChain });

        res.json({
            success: true,
            message: 'Deposit successful',
            data: {
                wallet_address: normalizedWalletAddr,
                amount: actualDepositAmount.toFixed(4),
                token: safeToken,
                chain: safeChain,  // 返回链信息
                tx_hash: tx_hash,
                new_balance: {
                    usdt: parseFloat(updatedBalance[0].usdt_balance).toFixed(4),
                    wld: parseFloat(updatedBalance[0].wld_balance).toFixed(4)
                }
            }
        });
        
        // ====================================
        // 充值成功后触发上级链路分红检查
        // 因为团队业绩可能因此变化，上级可能达到新的经纪人等级
        // 异步执行，不阻塞 API 响应
        // ====================================
        processUplineDailyDividends(normalizedWalletAddr)
            .then(result => {
                if (result.rewarded > 0) {
                    console.log(`[Deposit] ✅ 充值触发上级分红: ${result.rewarded} 人获得分红`);
                }
            })
            .catch(err => {
                console.error(`[Deposit] ❌ 触发上级分红失败:`, err.message);
            });
            
    } catch (error) {
        console.error('充值失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Deposit failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取充值记录
 * GET /api/user/deposits?wallet_address=0x...
 */
app.get('/api/user/deposits', async (req, res) => {
    try {
        const { wallet_address, limit = 20 } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const rows = await dbQuery(
            'SELECT * FROM deposit_records WHERE wallet_address = ? ORDER BY created_at DESC LIMIT ?',
            [wallet_address.toLowerCase(), parseInt(limit)]
        );
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('获取充值记录失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch deposit records',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 提款申请
 * POST /api/user/withdraw
 * body: { wallet_address, amount, fee, actual_amount, to_address }
 * 
 * 安全措施：
 * - 钱包地址格式验证
 * - 金额范围验证
 * - 每日提款次数限制
 * - 敏感操作速率限制
 */
app.post('/api/user/withdraw', sensitiveLimiter, async (req, res) => {
    try {
        const { wallet_address, amount, fee, actual_amount, to_address } = req.body;
        
        if (!wallet_address || !amount || !to_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address, amount, and to_address are required'
            });
        }
        
        // 验证钱包地址格式
        if (!isValidWalletAddress(wallet_address)) {
            recordSuspiciousActivity(req.ip, '提款：无效的钱包地址');
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address format'
            });
        }
        
        // 验证目标地址格式
        if (!isValidWalletAddress(to_address)) {
            recordSuspiciousActivity(req.ip, '提款：无效的目标地址');
            return res.status(400).json({
                success: false,
                message: 'Invalid destination address format'
            });
        }
        
        // 验证金额（最小5，最大100000）
        if (!isValidAmount(amount, 5, 100000)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount (minimum 5 USDT, maximum 100000 USDT)'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        const toAddr = normalizeWalletAddress(to_address);
        const withdrawAmount = parseFloat(amount);
        const withdrawFee = parseFloat(fee) || withdrawAmount * 0.005; // 0.5% 手续费（千分之五）
        const actualAmount = parseFloat(actual_amount) || withdrawAmount - withdrawFee;
        
        // 检查用户余额
        const userBalance = await dbQuery(
            'SELECT usdt_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (userBalance.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const currentBalance = parseFloat(userBalance[0].usdt_balance);
        
        // #region agent log
        fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1350',message:'Withdrawal - balance check',data:{wallet:walletAddr.slice(0,10),balanceBefore:currentBalance,withdrawAmount,fee:withdrawFee,actualAmount},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        if (currentBalance < withdrawAmount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance',
                data: {
                    current_balance: currentBalance.toFixed(4),
                    requested: withdrawAmount.toFixed(4)
                }
            });
        }
        
        // 扣除用户余额（已移除每日一次限制）
        // #region agent log
        fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1364',message:'Withdrawal - BEFORE deduction',data:{wallet:walletAddr.slice(0,10),balanceBefore:currentBalance,deductAmount:withdrawAmount},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        await dbQuery(
            'UPDATE user_balances SET usdt_balance = usdt_balance - ?, total_withdraw = total_withdraw + ?, updated_at = NOW() WHERE wallet_address = ?',
            [withdrawAmount, withdrawAmount, walletAddr]
        );
        
        // #region agent log
        fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1373',message:'Withdrawal - AFTER deduction',data:{wallet:walletAddr.slice(0,10),deductAmount:withdrawAmount,deductionExecuted:true},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        
        // 创建提款记录（包含手续费详情）
        await dbQuery(
            'INSERT INTO withdraw_records (wallet_address, amount, fee, actual_amount, token, to_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
            [walletAddr, withdrawAmount, withdrawFee, actualAmount, 'USDT', toAddr, 'pending']
        );
        
        // 获取更新后的余额
        const updatedBalance = await dbQuery(
            'SELECT usdt_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        secureLog('提款申请', { wallet_address: walletAddr, amount: withdrawAmount, to_address: toAddr });
        
        res.json({
            success: true,
            message: 'Withdrawal request submitted',
            data: {
                amount: withdrawAmount.toFixed(4),
                fee: withdrawFee.toFixed(4),
                actual_amount: actualAmount.toFixed(4),
                new_balance: parseFloat(updatedBalance[0].usdt_balance).toFixed(4)
            }
        });
    } catch (error) {
        console.error('提款失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Withdrawal failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取提款记录
 * GET /api/user/withdrawals?wallet_address=0x...
 */
app.get('/api/user/withdrawals', async (req, res) => {
    try {
        const { wallet_address, limit = 20 } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const rows = await dbQuery(
            'SELECT * FROM withdraw_records WHERE wallet_address = ? ORDER BY created_at DESC LIMIT ?',
            [wallet_address.toLowerCase(), parseInt(limit)]
        );
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('获取提款记录失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch withdrawal records',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== 安全模块初始化 ====================
// 初始化综合安全防护系统（IP防护、SQL注入防护、攻击日志、文件保护）
(async () => {
    try {
        const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
        await initSecurityModules(dbQuery, projectRoot);
        console.log('[Security] 综合安全防护系统已初始化');
        
        // Initialize enhanced protection module - 2024-12-21
        await initEnhancedProtection(dbQuery);
        console.log('[Security] 增强安全防护已初始化');
    } catch (error) {
        console.error('[Security] 安全模块初始化失败:', error.message);
    }
})();

// ==================== 新的机器人路由（小时精度修复版） ====================
// 设置数据库查询函数
setRobotDbQuery(dbQuery);
setCronDbQuery(dbQuery);

// 设置团队分红模块数据库查询函数
setTeamCronDbQuery(dbQuery);
// 初始化团队奖励表和执行日志表
initTeamRewardsTable();
initCronLogsTable();

// 设置抽奖模块数据库查询函数
setLuckyWheelDbQuery(dbQuery);
// 初始化抽奖相关表
initLuckyWheelTables();

// 注册新的机器人路由（优先于下面的旧路由）
app.use(robotRoutes);
console.log('[Routes] 新的机器人路由已注册（小时精度版本）');

// 注册钱包签名认证路由
app.use(authRoutes);
console.log('[Routes] 钱包签名认证路由已注册');

// ==================== 旧的机器人购买 API（已被新路由覆盖） ====================
// 注意：以下旧路由已被上面的新路由覆盖，但保留代码作为参考

/**
 * [已弃用] 购买机器人 - 旧版本
 * POST /api/robot/purchase
 * body: { wallet_address, robot_name, price }
 * 
 * 此路由已被新的 robotRoutes.js 中的路由覆盖
 */
app.post('/api/robot/purchase-old-deprecated', async (req, res) => {
    try {
        const { wallet_address, robot_name, price } = req.body;
        
        // 参数验证
        if (!wallet_address || !robot_name || !price) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address, robot_name, and price are required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        const robotPrice = parseFloat(price);
        
        if (isNaN(robotPrice) || robotPrice <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid price'
            });
        }
        
        // 查询用户余额
        const userBalance = await dbQuery(
            'SELECT usdt_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (userBalance.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Wallet address not found. Please deposit first.'
            });
        }
        
        const currentBalance = parseFloat(userBalance[0].usdt_balance);
        
        // 检查余额是否足够
        if (currentBalance < robotPrice) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient USDT balance',
                data: {
                    current_balance: currentBalance.toFixed(4),
                    required: robotPrice.toFixed(4)
                }
            });
        }
        
        // 计算机器人参数（根据机器人名称和价格）
        const robotConfig = getRobotConfig(robot_name, robotPrice);
        
        // Follow页面的机器人（grid和high类型）每天只能购买一个
        // 使用 CURDATE() 确保时区一致（UTC+8）
        if (robotConfig.robot_type === 'grid' || robotConfig.robot_type === 'high') {
            const todayPurchases = await dbQuery(
                `SELECT id FROM robot_purchases 
                WHERE wallet_address = ? AND robot_name = ? AND DATE(created_at) = CURDATE()`,
                [walletAddr, robot_name]
            );
            
            if (todayPurchases.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'You can only purchase one of this robot per day',
                    data: { daily_limit_reached: true }
                });
            }
        }
        
        // 计算High机器人的到期应返还金额（本金 + 总利息）
        // High机器人: 总收益 = 本金 * 日收益率 * 天数
        let expectedReturn = 0;
        if (robotConfig.robot_type === 'high') {
            const totalProfitRate = (robotConfig.daily_profit / 100) * robotConfig.duration_days;
            expectedReturn = robotPrice * (1 + totalProfitRate);
        }
        
        // 扣除用户余额
        await dbQuery(
            'UPDATE user_balances SET usdt_balance = usdt_balance - ?, updated_at = NOW() WHERE wallet_address = ?',
            [robotPrice, walletAddr]
        );
        
        // 记录购买
        await dbQuery(
            `INSERT INTO robot_purchases 
            (wallet_address, robot_id, robot_name, robot_type, price, token, status, start_date, end_date, daily_profit, total_profit, is_quantified, expected_return, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, 'USDT', 'active', CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? DAY), ?, 0, 0, ?, NOW(), NOW())`,
            [walletAddr, robotConfig.robot_id, robot_name, robotConfig.robot_type, robotPrice, robotConfig.duration_days, robotConfig.daily_profit, expectedReturn]
        );
        
        // 获取更新后的余额
        const updatedBalance = await dbQuery(
            'SELECT usdt_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        res.json({
            success: true,
            message: `Successfully purchased ${robot_name}`,
            data: {
                robot_name: robot_name,
                robot_type: robotConfig.robot_type,
                price: robotPrice.toFixed(4),
                duration_days: robotConfig.duration_days,
                daily_profit: robotConfig.daily_profit,
                expected_return: expectedReturn.toFixed(4),
                new_balance: parseFloat(updatedBalance[0].usdt_balance).toFixed(4)
            }
        });
    } catch (error) {
        console.error('购买机器人失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Purchase failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取机器人配置
 * @param {string} robotName - 机器人名称
 * @param {number} price - 价格
 * @returns {object} 机器人配置
 * 
 * robot_type 说明：
 * - 'cex': CEX机器人（Robot页面），每天量化返利
 * - 'dex': DEX机器人（Robot页面），每天量化返利
 * - 'grid': 网格机器人（Follow页面），每天量化返利，到期退回本金
 * - 'high': 高收益机器人（Follow页面），只量化一次，到期返还本金+利息
 */
function getRobotConfig(robotName, price) {
    // 根据机器人名称返回配置
    const configs = {
        // Robot 页面 - CEX-Robots（每天量化返利）
        'Binance Ai Bot': { robot_id: 'binance_01', duration_days: 1, daily_profit: 2.0, robot_type: 'cex' },
        'Coinbase Ai Bot': { robot_id: 'coinbase_01', duration_days: 3, daily_profit: 2.0, robot_type: 'cex' },
        'OKX Ai Bot': { robot_id: 'okx_01', duration_days: 2, daily_profit: 2.0, robot_type: 'cex' },
        'Bybit Ai Bot': { robot_id: 'bybit_01', duration_days: 7, daily_profit: 1.5, robot_type: 'cex' },
        'Upbit Ai Bot': { robot_id: 'upbit_01', duration_days: 15, daily_profit: 1.8, robot_type: 'cex' },
        'Bitfinex Ai Bot': { robot_id: 'bitfinex_01', duration_days: 30, daily_profit: 2.0, robot_type: 'cex' },
        'Kucoin Ai Bot': { robot_id: 'kucoin_01', duration_days: 45, daily_profit: 2.2, robot_type: 'cex' },
        'Bitget Ai Bot': { robot_id: 'bitget_01', duration_days: 90, daily_profit: 2.5, robot_type: 'cex' },
        'Gate Ai Bot': { robot_id: 'gate_01', duration_days: 120, daily_profit: 3.0, robot_type: 'cex' },
        'Binance Ai Bot-01': { robot_id: 'binance_02', duration_days: 180, daily_profit: 4.2, robot_type: 'cex' },
        
        // Robot 页面 - DEX-Robots（每天量化返利）
        'PancakeSwap Ai Bot': { robot_id: 'pancake_01', duration_days: 30, daily_profit: 1.8, robot_type: 'dex' },
        'Uniswap Ai Bot': { robot_id: 'uniswap_01', duration_days: 30, daily_profit: 2.0, robot_type: 'dex' },
        'BaseSwap Ai Bot': { robot_id: 'baseswap_01', duration_days: 30, daily_profit: 2.2, robot_type: 'dex' },
        'SushiSwap Ai Bot': { robot_id: 'sushiswap_01', duration_days: 60, daily_profit: 2.5, robot_type: 'dex' },
        'Jupiter Ai Bot': { robot_id: 'jupiter_01', duration_days: 60, daily_profit: 2.8, robot_type: 'dex' },
        'Curve Ai Bot': { robot_id: 'curve_01', duration_days: 30, daily_profit: 3.5, robot_type: 'dex' },
        'DODO Ai Bot': { robot_id: 'dodo_01', duration_days: 30, daily_profit: 4.0, robot_type: 'dex' },
        
        // Follow 页面 - Grid-Robots（每天量化返利，到期退回本金）
        'Binance Grid Bot-M1': { robot_id: 'grid_m1', duration_days: 120, daily_profit: 1.5, robot_type: 'grid' },
        'Binance Grid Bot-M2': { robot_id: 'grid_m2', duration_days: 150, daily_profit: 1.6, robot_type: 'grid' },
        'Binance Grid Bot-M3': { robot_id: 'grid_m3', duration_days: 180, daily_profit: 1.7, robot_type: 'grid' },
        'Binance Grid Bot-M4': { robot_id: 'grid_m4', duration_days: 210, daily_profit: 1.8, robot_type: 'grid' },
        'Binance Grid Bot-M5': { robot_id: 'grid_m5', duration_days: 240, daily_profit: 2.0, robot_type: 'grid' },
        
        // Follow 页面 - High-Robots（只量化一次，到期返还本金+利息）
        'Binance High Robot-H1': { robot_id: 'high_h1', duration_days: 1, daily_profit: 1.2, robot_type: 'high' },
        'Binance High Robot-H2': { robot_id: 'high_h2', duration_days: 3, daily_profit: 1.3, robot_type: 'high' },
        'Binance High Robot-H3': { robot_id: 'high_h3', duration_days: 5, daily_profit: 1.4, robot_type: 'high' }
    };
    
    return configs[robotName] || { robot_id: 'unknown', duration_days: 30, daily_profit: 1.0, robot_type: 'cex' };
}

/**
 * 获取用户购买的机器人列表
 * GET /api/robot/my?wallet_address=0x...
 * 
 * 在返回列表前，会自动处理到期的机器人返还本金
 */
app.get('/api/robot/my-old-deprecated', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 先处理到期的机器人返还（CEX/DEX类型）
        await processExpiredCexDexRobots(walletAddr);
        
        const rows = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE wallet_address = ? AND status = 'active' AND end_date >= CURDATE()
            ORDER BY created_at DESC`,
            [walletAddr]
        );
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('获取用户机器人失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch robots',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取用户在Follow页面购买的机器人列表（grid和high类型）
 * GET /api/follow/my?wallet_address=0x...
 * 
 * 在返回列表前，会自动处理到期的机器人返还
 */
app.get('/api/follow/my-old-deprecated', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 先处理到期的机器人返还（确保用户访问时及时处理）
        await processExpiredHighRobots(walletAddr);
        await processExpiredGridRobots(walletAddr);
        
        const rows = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE wallet_address = ? AND status = 'active' AND end_date >= CURDATE()
            AND (robot_type = 'grid' OR robot_type = 'high')
            ORDER BY created_at DESC`,
            [walletAddr]
        );
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('获取Follow页面机器人失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch follow robots',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取用户今天已购买的Follow页面机器人列表
 * GET /api/follow/today-purchases?wallet_address=0x...
 * 用于前端判断每天限购状态
 */
app.get('/api/follow/today-purchases-old-deprecated', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 使用 CURDATE() 确保时区一致（UTC+8）
        const rows = await dbQuery(
            `SELECT robot_name, robot_type, CURDATE() as today_date FROM robot_purchases 
            WHERE wallet_address = ? AND DATE(created_at) = CURDATE()
            AND (robot_type = 'grid' OR robot_type = 'high')`,
            [walletAddr]
        );
        
        // 转换为机器人名称列表
        const purchasedRobots = rows.map(r => r.robot_name);
        const today = rows[0]?.today_date || new Date().toISOString().split('T')[0];
        
        res.json({
            success: true,
            data: {
                purchased_today: purchasedRobots,
                date: today
            }
        });
    } catch (error) {
        console.error('获取今日购买记录失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch today purchases',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 处理到期的High机器人 - 返还本金+利息
 * 这个函数会在获取机器人列表时自动调用
 * @param {string} walletAddr - 钱包地址
 */
async function processExpiredHighRobots(walletAddr) {
    try {
        // 查找已到期、已量化但尚未处理返还的High机器人
        // end_date < CURDATE() 表示只有到期日之后的机器人才视为已到期
        const expiredHighRobots = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE wallet_address = ? 
            AND robot_type = 'high' 
            AND is_quantified = 1 
            AND status = 'active' 
            AND end_date < CURDATE()`,
            [walletAddr]
        );
        
        for (const robot of expiredHighRobots) {
            const expectedReturn = parseFloat(robot.expected_return);
            
            if (expectedReturn > 0) {
                // 返还本金+利息到用户余额
                await dbQuery(
                    `UPDATE user_balances 
                    SET usdt_balance = usdt_balance + ?, updated_at = NOW() 
                    WHERE wallet_address = ?`,
                    [expectedReturn, walletAddr]
                );
                
                // 计算利润（收益部分）
                const profit = expectedReturn - parseFloat(robot.price);
                
                // 更新机器人状态为已过期，并记录累计收益
                await dbQuery(
                    `UPDATE robot_purchases 
                    SET status = 'expired', total_profit = ?, updated_at = NOW() 
                    WHERE id = ?`,
                    [profit, robot.id]
                );
                
                // 记录收益到 robot_earnings 表
                if (profit > 0) {
                    await dbQuery(
                        `INSERT INTO robot_earnings 
                        (wallet_address, robot_purchase_id, robot_name, earning_amount, created_at) 
                        VALUES (?, ?, ?, ?, NOW())`,
                        [walletAddr, robot.id, robot.robot_name, profit]
                    );
                    
                    // 发放推荐奖励给上级（8级）- 使用数学工具统一管理
                    // CEX_REFERRAL_RATES = [0.30, 0.10, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01]
                    const maxLevel = CEX_REFERRAL_RATES.length; // 8级
                    let currentWallet = walletAddr;
                    
                    for (let level = 1; level <= maxLevel; level++) {
                        // 查找当前用户的上级
                        const referrerResult = await dbQuery(
                            'SELECT referrer_address FROM user_referrals WHERE wallet_address = ?',
                            [currentWallet]
                        );
                        
                        if (referrerResult.length === 0) {
                            break; // 没有上级了
                        }
                        
                        const referrerAddress = referrerResult[0].referrer_address;
                        // 使用数学工具计算奖励
                        const rewardRate = CEX_REFERRAL_RATES[level - 1];
                        const rewardAmount = calculateLevelReward(profit, rewardRate);
                        
                        // 增加上级的余额
                        await dbQuery(
                            `UPDATE user_balances 
                            SET usdt_balance = usdt_balance + ?, updated_at = NOW() 
                            WHERE wallet_address = ?`,
                            [rewardAmount, referrerAddress]
                        );
                        
                        // 记录推荐奖励
                        await dbQuery(
                            `INSERT INTO referral_rewards 
                            (wallet_address, from_wallet, level, reward_rate, reward_amount, source_type, source_id, robot_name, source_amount, created_at) 
                            VALUES (?, ?, ?, ?, ?, 'maturity', ?, ?, ?, NOW())`,
                            [referrerAddress, walletAddr, level, rewardRate * 100, rewardAmount, robot.id, robot.robot_name, profit]
                        );
                        
                        console.log(`[Maturity] 推荐奖励分发成功: level=${level}, to=${referrerAddress.slice(0,10)}..., amount=${rewardAmount.toFixed(4)}`);
                        
                        // 移动到下一级
                        currentWallet = referrerAddress;
                    }
                }
                
                console.log(`[High Robot] Returned ${expectedReturn} USDT (profit: ${profit}) to ${walletAddr} for robot ${robot.id}`);
            }
        }
    } catch (error) {
        console.error('处理到期High机器人失败:', error.message);
    }
}

/**
 * 处理到期的Grid机器人 - 返还本金
 * @param {string} walletAddr - 钱包地址
 */
async function processExpiredGridRobots(walletAddr) {
    try {
        // 查找已到期但尚未处理返还的Grid机器人
        // end_date < CURDATE() 表示只有到期日之后的机器人才视为已到期
        const expiredGridRobots = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE wallet_address = ? 
            AND robot_type = 'grid' 
            AND status = 'active' 
            AND end_date < CURDATE()`,
            [walletAddr]
        );
        
        for (const robot of expiredGridRobots) {
            const principal = parseFloat(robot.price);
            
            if (principal > 0) {
                // 返还本金到用户余额
                await dbQuery(
                    `UPDATE user_balances 
                    SET usdt_balance = usdt_balance + ?, updated_at = NOW() 
                    WHERE wallet_address = ?`,
                    [principal, walletAddr]
                );
                
                // 更新机器人状态为已过期
                await dbQuery(
                    `UPDATE robot_purchases 
                    SET status = 'expired', updated_at = NOW() 
                    WHERE id = ?`,
                    [robot.id]
                );
                
                console.log(`[Grid Robot] Returned ${principal} USDT principal to ${walletAddr} for robot ${robot.id}`);
            }
        }
    } catch (error) {
        console.error('处理到期Grid机器人失败:', error.message);
    }
}

/**
 * 处理到期的CEX/DEX机器人 - 返还本金
 * CEX和DEX机器人到期后，本金也需要返还给用户
 * @param {string} walletAddr - 钱包地址
 */
async function processExpiredCexDexRobots(walletAddr) {
    try {
        // 查找已到期但尚未处理返还的CEX/DEX机器人
        // end_date < CURDATE() 表示只有到期日之后的机器人才视为已到期
        // 例如：end_date = 12/14，今天是 12/15 才会被处理
        const expiredRobots = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE wallet_address = ? 
            AND (robot_type = 'cex' OR robot_type = 'dex') 
            AND status = 'active' 
            AND end_date < CURDATE()`,
            [walletAddr]
        );
        
        for (const robot of expiredRobots) {
            const principal = parseFloat(robot.price);
            
            if (principal > 0) {
                // 返还本金到用户余额
                await dbQuery(
                    `UPDATE user_balances 
                    SET usdt_balance = usdt_balance + ?, updated_at = NOW() 
                    WHERE wallet_address = ?`,
                    [principal, walletAddr]
                );
                
                // 更新机器人状态为已过期
                await dbQuery(
                    `UPDATE robot_purchases 
                    SET status = 'expired', updated_at = NOW() 
                    WHERE id = ?`,
                    [robot.id]
                );
                
                console.log(`[CEX/DEX Robot] Returned ${principal} USDT principal to ${walletAddr} for robot ${robot.id} (${robot.robot_name})`);
            }
        }
    } catch (error) {
        console.error('处理到期CEX/DEX机器人失败:', error.message);
    }
}

/**
 * 获取用户在Follow页面过期的机器人列表（grid和high类型）
 * GET /api/follow/expired?wallet_address=0x...
 */
app.get('/api/follow/expired-old-deprecated', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 先处理到期的机器人返还
        await processExpiredHighRobots(walletAddr);
        await processExpiredGridRobots(walletAddr);
        
        const rows = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE wallet_address = ? AND (status = 'expired' OR end_date < CURDATE())
            AND (robot_type = 'grid' OR robot_type = 'high')
            ORDER BY created_at DESC`,
            [walletAddr]
        );
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('获取Follow页面过期机器人失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch follow expired robots',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取用户过期的机器人列表
 * GET /api/robot/expired?wallet_address=0x...
 * 
 * 在返回列表前，会自动处理到期的机器人返还本金
 */
app.get('/api/robot/expired-old-deprecated', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 先处理到期的机器人返还
        await processExpiredCexDexRobots(walletAddr);
        
        const rows = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE wallet_address = ? AND status = 'expired'
            ORDER BY created_at DESC`,
            [walletAddr]
        );
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('获取过期机器人失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch expired robots',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取用户购买某类机器人的数量
 * GET /api/robot/count?wallet_address=0x...&robot_id=binance_01
 */
app.get('/api/robot/count-old-deprecated', async (req, res) => {
    try {
        const { wallet_address, robot_id } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 获取用户所有活跃机器人的购买数量（按机器人ID分组）
        const rows = await dbQuery(
            `SELECT robot_id, robot_name, COUNT(*) as count 
            FROM robot_purchases 
            WHERE wallet_address = ? AND status = 'active' AND end_date >= CURDATE()
            GROUP BY robot_id, robot_name`,
            [walletAddr]
        );
        
        // 如果指定了 robot_id，只返回该机器人的数量
        if (robot_id) {
            const robot = rows.find(r => r.robot_id === robot_id);
            return res.json({
                success: true,
                data: {
                    robot_id: robot_id,
                    count: robot ? robot.count : 0
                }
            });
        }
        
        // 返回所有机器人的购买数量
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('获取机器人购买数量失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch robot count',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 执行量化操作
 * POST /api/robot/quantify
 * body: { wallet_address, robot_purchase_id }
 * 
 * 量化规则：
 * - cex/dex/grid 机器人：每天可以量化一次，获取当日收益
 * - high 机器人：只能量化一次，不立即返还收益，等到期后一起返还本金+利息
 * 
 * 安全措施：
 * - 钱包地址格式验证
 * - 量化操作速率限制
 */
app.post('/api/robot/quantify-old-deprecated', quantifyLimiter, async (req, res) => {
    try {
        const { wallet_address, robot_purchase_id } = req.body;
        
        if (!wallet_address || !robot_purchase_id) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address and robot_purchase_id are required'
            });
        }
        
        // 验证钱包地址格式
        if (!isValidWalletAddress(wallet_address)) {
            recordSuspiciousActivity(req.ip, '量化：无效的钱包地址');
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address format'
            });
        }
        
        // 验证robot_purchase_id是整数
        const robotId = parseInt(robot_purchase_id, 10);
        if (isNaN(robotId) || robotId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid robot_purchase_id'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // 获取机器人购买记录
        // 注意：end_date > CURDATE() 表示机器人还未到期（到期日当天不能量化）
        // 因为1天周期的机器人只能在购买当天量化1次，到期日当天已经是过期状态
        const robots = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE id = ? AND wallet_address = ? AND status = 'active' AND end_date > CURDATE()`,
            [robot_purchase_id, walletAddr]
        );
        
        if (robots.length === 0) {
            // 检查是否是到期日当天
            const expiredCheck = await dbQuery(
                `SELECT end_date FROM robot_purchases 
                WHERE id = ? AND wallet_address = ? AND status = 'active' AND end_date = CURDATE()`,
                [robot_purchase_id, walletAddr]
            );
            
            if (expiredCheck.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: '机器人今天到期，无法继续量化。本金将在明天自动返还。'
                });
            }
            
            return res.status(400).json({
                success: false,
                message: 'Robot not found or expired'
            });
        }
        
        const robot = robots[0];
        const robotType = robot.robot_type || 'cex';
        
        // High 机器人特殊处理：只能量化一次
        if (robotType === 'high') {
            // 检查是否已经量化过
            if (robot.is_quantified) {
                return res.json({
                    success: false,
                    message: 'High robot already quantified. Profit will be returned at maturity.',
                    data: { 
                        already_quantified: true,
                        robot_type: 'high',
                        expected_return: parseFloat(robot.expected_return).toFixed(4),
                        end_date: robot.end_date
                    }
                });
            }
            
            // 标记为已量化（不立即返还收益，等到期）
            await dbQuery(
                `UPDATE robot_purchases 
                SET is_quantified = 1, updated_at = NOW() 
                WHERE id = ?`,
                [robot_purchase_id]
            );
            
            // 记录量化操作（记录但不发放收益）
            await dbQuery(
                `INSERT INTO robot_quantify_logs 
                (robot_purchase_id, wallet_address, robot_name, earnings, created_at) 
                VALUES (?, ?, ?, 0, NOW())`,
                [robot_purchase_id, walletAddr, robot.robot_name]
            );
            
            return res.json({
                success: true,
                message: 'High robot quantification started. Principal and profit will be returned at maturity.',
                data: {
                    robot_type: 'high',
                    earnings: '0.0000',
                    expected_return: parseFloat(robot.expected_return).toFixed(4),
                    end_date: robot.end_date,
                    total_profit_rate: (parseFloat(robot.daily_profit) * (new Date(robot.end_date) - new Date(robot.start_date)) / (1000 * 60 * 60 * 24)).toFixed(2) + '%'
                }
            });
        }
        
        // 非High机器人：每24小时量化一次
        // 检查上次量化时间是否超过24小时
        const lastQuantify = await dbQuery(
            `SELECT created_at FROM robot_quantify_logs 
            WHERE robot_purchase_id = ? 
            ORDER BY created_at DESC LIMIT 1`,
            [robot_purchase_id]
        );
        
        if (lastQuantify.length > 0) {
            const lastTime = new Date(lastQuantify[0].created_at);
            const now = new Date();
            const hoursDiff = (now - lastTime) / (1000 * 60 * 60); // 时间差（小时）
            
            if (hoursDiff < 24) {
                // 计算下次可量化时间
                const nextQuantifyTime = new Date(lastTime.getTime() + 24 * 60 * 60 * 1000);
                const hoursRemaining = 24 - hoursDiff;
                const minutesRemaining = Math.floor((hoursRemaining % 1) * 60);
                
                return res.json({
                    success: false,
                    message: `距离下次量化还需等待 ${Math.floor(hoursRemaining)} 小时 ${minutesRemaining} 分钟`,
                    data: { 
                        already_quantified: true,
                        next_quantify_time: nextQuantifyTime.toISOString(),
                        hours_remaining: hoursRemaining.toFixed(2),
                        last_quantify_time: lastTime.toISOString()
                    }
                });
            }
        }
        
        // 计算今日收益
        const dailyProfitRate = parseFloat(robot.daily_profit) / 100;
        const earnings = parseFloat(robot.price) * dailyProfitRate;
        
        // 记录量化操作
        await dbQuery(
            `INSERT INTO robot_quantify_logs 
            (robot_purchase_id, wallet_address, robot_name, earnings, created_at) 
            VALUES (?, ?, ?, ?, NOW())`,
            [robot_purchase_id, walletAddr, robot.robot_name, earnings]
        );
        
        // 更新机器人累计收益
        await dbQuery(
            `UPDATE robot_purchases 
            SET total_profit = total_profit + ?, updated_at = NOW() 
            WHERE id = ?`,
            [earnings, robot_purchase_id]
        );
        
        // 增加用户余额
        await dbQuery(
            `UPDATE user_balances 
            SET usdt_balance = usdt_balance + ?, updated_at = NOW() 
            WHERE wallet_address = ?`,
            [earnings, walletAddr]
        );
        
        // 记录收益到 robot_earnings 表（用于统计团队每日收益）
        await dbQuery(
            `INSERT INTO robot_earnings 
            (wallet_address, robot_purchase_id, robot_name, earning_amount, created_at) 
            VALUES (?, ?, ?, ?, NOW())`,
            [walletAddr, robot_purchase_id, robot.robot_name, earnings]
        );
        
        // 发放推荐奖励给上级（8级）- 使用数学工具统一管理
        // CEX_REFERRAL_RATES = [0.30, 0.10, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01] 总计50%
        try {
        const maxLevel = CEX_REFERRAL_RATES.length; // 8级
        let currentWallet = walletAddr;
        
        for (let level = 1; level <= maxLevel; level++) {
            // 查找当前用户的上级
            const referrerResult = await dbQuery(
                'SELECT referrer_address FROM user_referrals WHERE wallet_address = ?',
                [currentWallet]
            );
            
            if (referrerResult.length === 0) {
                // 没有上级了，停止
                break;
            }
            
            const referrerAddress = referrerResult[0].referrer_address;
            // 使用数学工具计算奖励
            const rewardRate = CEX_REFERRAL_RATES[level - 1];
            const rewardAmount = calculateLevelReward(earnings, rewardRate);
                
                // 确保上级用户有余额记录
                await dbQuery(
                    `INSERT IGNORE INTO user_balances (wallet_address, usdt_balance, wld_balance, created_at, updated_at) 
                    VALUES (?, 0, 0, NOW(), NOW())`,
                    [referrerAddress]
                );
            
            // 增加上级的余额
            await dbQuery(
                `UPDATE user_balances 
                SET usdt_balance = usdt_balance + ?, updated_at = NOW() 
                WHERE wallet_address = ?`,
                [rewardAmount, referrerAddress]
            );
            
            // 记录推荐奖励
            await dbQuery(
                `INSERT INTO referral_rewards 
                (wallet_address, from_wallet, level, reward_rate, reward_amount, source_type, source_id, robot_name, source_amount, created_at) 
                VALUES (?, ?, ?, ?, ?, 'quantify', ?, ?, ?, NOW())`,
                [referrerAddress, walletAddr, level, rewardRate * 100, rewardAmount, robot_purchase_id, robot.robot_name, earnings]
            );
            
            console.log(`[Quantify] 推荐奖励分发成功: level=${level}, to=${referrerAddress.slice(0,10)}..., amount=${rewardAmount.toFixed(4)}`);
            
            // 移动到下一级
            currentWallet = referrerAddress;
            }
        } catch (referralError) {
            // 推荐奖励分发失败不影响用户量化成功
            console.error('[Quantify] 推荐奖励分发失败（不影响用户量化）:', referralError.message);
        }
        
        // 获取更新后的机器人信息和用户余额
        const updatedRobot = await dbQuery(
            'SELECT * FROM robot_purchases WHERE id = ?',
            [robot_purchase_id]
        );
        
        const updatedBalance = await dbQuery(
            'SELECT usdt_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        res.json({
            success: true,
            message: 'Quantification successful',
            data: {
                robot_type: robotType,
                earnings: earnings.toFixed(4),
                total_profit: parseFloat(updatedRobot[0].total_profit).toFixed(4),
                new_balance: parseFloat(updatedBalance[0].usdt_balance).toFixed(4)
            }
        });
    } catch (error) {
        console.error('量化操作失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Quantification failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 检查今天是否已经量化过
 * GET /api/robot/quantify-status?wallet_address=0x...&robot_purchase_id=1
 * 
 * 返回说明：
 * - 普通机器人：检查今天是否量化过
 * - High机器人：检查是否已量化过（不限制日期）
 */
app.get('/api/robot/quantify-status-old-deprecated', async (req, res) => {
    try {
        const { wallet_address, robot_purchase_id } = req.query;
        
        if (!wallet_address || !robot_purchase_id) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address and robot_purchase_id are required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 获取机器人信息
        const robots = await dbQuery(
            'SELECT robot_type, is_quantified, expected_return, end_date FROM robot_purchases WHERE id = ? AND wallet_address = ?',
            [robot_purchase_id, walletAddr]
        );
        
        if (robots.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Robot not found'
            });
        }
        
        const robot = robots[0];
        const robotType = robot.robot_type || 'cex';
        
        // High 机器人：检查是否已量化过（不限制日期）
        if (robotType === 'high') {
            return res.json({
                success: true,
                data: {
                    robot_type: 'high',
                    quantified_today: robot.is_quantified === 1,
                    is_quantified: robot.is_quantified === 1,
                    expected_return: parseFloat(robot.expected_return).toFixed(4),
                    end_date: robot.end_date
                }
            });
        }
        
        // 检查机器人是否已到期（到期日当天视为已到期，不能量化）
        const endDate = new Date(robot.end_date);
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);
        
        const isExpiredToday = endDate.getTime() <= todayDate.getTime();
        
        if (isExpiredToday) {
            return res.json({
                success: true,
                data: {
                    robot_type: robotType,
                    quantified_today: true, // 标记为已量化，禁止再次量化
                    is_expired: true,
                    message: '机器人今天到期，无法继续量化'
                }
            });
        }
        
        // 普通机器人：检查上次量化是否超过24小时
        const lastQuantify = await dbQuery(
            `SELECT id, earnings, created_at FROM robot_quantify_logs 
            WHERE robot_purchase_id = ? AND wallet_address = ? 
            ORDER BY created_at DESC LIMIT 1`,
            [robot_purchase_id, walletAddr]
        );
        
        let canQuantify = true;
        let nextQuantifyTime = null;
        let hoursRemaining = 0;
        let lastQuantifyTime = null;
        
        if (lastQuantify.length > 0) {
            const lastTime = new Date(lastQuantify[0].created_at);
            const now = new Date();
            const hoursDiff = (now - lastTime) / (1000 * 60 * 60);
            
            lastQuantifyTime = lastTime.toISOString();
            
            if (hoursDiff < 24) {
                canQuantify = false;
                nextQuantifyTime = new Date(lastTime.getTime() + 24 * 60 * 60 * 1000).toISOString();
                hoursRemaining = 24 - hoursDiff;
            }
        }
        
        res.json({
            success: true,
            data: {
                robot_type: robotType,
                quantified_today: !canQuantify, // 为了兼容前端，如果不能量化则标记为已量化
                can_quantify: canQuantify,
                is_expired: false,
                next_quantify_time: nextQuantifyTime,
                hours_remaining: hoursRemaining > 0 ? hoursRemaining.toFixed(2) : 0,
                last_quantify_time: lastQuantifyTime,
                record: lastQuantify.length > 0 ? lastQuantify[0] : null
            }
        });
    } catch (error) {
        console.error('检查量化状态失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to check quantify status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取用户今日总收益（量化收益 + 推荐奖励）
 * GET /api/robot/today-earnings?wallet_address=0x...
 *
 * 注意：使用数据库 CURDATE() 获取当前日期，确保时区一致（UTC+8）
 * 改进：同时统计 robot_earnings（量化收益）和 referral_rewards（推荐奖励）
 */
app.get('/api/robot/today-earnings', async (req, res) => {
    try {
        const { wallet_address } = req.query;

        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }

        const walletAddr = wallet_address.toLowerCase();

        // 1. 查询今日量化收益（从 robot_earnings 表）
        const earningsResult = await dbQuery(
            `SELECT COALESCE(SUM(earning_amount), 0) as total_earnings
            FROM robot_earnings
            WHERE wallet_address = ? AND DATE(created_at) = CURDATE()`,
            [walletAddr]
        );
        const quantifyEarnings = parseFloat(earningsResult[0]?.total_earnings) || 0;

        // 2. 查询今日推荐奖励（从 referral_rewards 表）
        const referralResult = await dbQuery(
            `SELECT COALESCE(SUM(reward_amount), 0) as total_rewards
            FROM referral_rewards
            WHERE wallet_address = ? AND DATE(created_at) = CURDATE()`,
            [walletAddr]
        );
        const referralRewards = parseFloat(referralResult[0]?.total_rewards) || 0;

        // 3. 计算今日总收益（量化收益 + 推荐奖励）
        const todayTotalEarnings = quantifyEarnings + referralRewards;

        // 获取当前日期
        const dateResult = await dbQuery('SELECT CURDATE() as today_date');
        const todayDate = dateResult[0]?.today_date;

        console.log(`[Today Earnings] ${walletAddr.slice(0, 10)}... 今日总收益: ${todayTotalEarnings.toFixed(4)} USDT (量化: ${quantifyEarnings.toFixed(4)}, 推荐: ${referralRewards.toFixed(4)})`);

        res.json({
            success: true,
            data: {
                today_earnings: todayTotalEarnings.toFixed(4),
                quantify_earnings: quantifyEarnings.toFixed(4),
                referral_rewards: referralRewards.toFixed(4),
                date: todayDate
            }
        });
    } catch (error) {
        console.error('获取今日总收益失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch today earnings',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取量化收益明细
 * GET /api/robot/quantify-history?wallet_address=0x...&limit=50&offset=0&period=today|week|month|all
 * 
 * 返回用户的量化收益历史记录
 * period 参数：today（今日）, week（本周）, month（本月）, all（全部，默认）
 */
app.get('/api/robot/quantify-history', async (req, res) => {
    try {
        const { wallet_address, limit = 50, offset = 0, period = 'all' } = req.query;
        
        // Security: Validate wallet_address is required
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        // Security: Validate wallet address format (must be valid Ethereum address)
        const walletRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!walletRegex.test(wallet_address)) {
            console.warn(`[Security] Invalid wallet format from ${req.ip}: ${wallet_address.substring(0, 50)}`);
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address format'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // Security: Sanitize limit and offset (prevent negative values)
        const queryLimit = Math.max(1, Math.min(parseInt(limit) || 50, 100)); // 1-100
        const queryOffset = Math.max(0, parseInt(offset) || 0); // >= 0
        
        // 根据时间范围构建日期条件
        let dateCondition = '';
        const queryParams = [walletAddr];
        
        switch (period) {
            case 'today':
                dateCondition = 'AND DATE(q.created_at) = CURDATE()';
                break;
            case 'week':
                dateCondition = 'AND q.created_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)';
                break;
            case 'month':
                dateCondition = 'AND q.created_at >= DATE_FORMAT(CURDATE(), "%Y-%m-01")';
                break;
            default:
                // 'all' - 无日期限制
                dateCondition = '';
        }
        
        // 获取量化收益记录
        const records = await dbQuery(
            `SELECT 
                q.id,
                q.robot_purchase_id,
                q.robot_name,
                q.earnings,
                q.created_at,
                p.robot_type,
                p.price as principal,
                p.daily_profit
            FROM robot_quantify_logs q
            LEFT JOIN robot_purchases p ON q.robot_purchase_id = p.id
            WHERE q.wallet_address = ? ${dateCondition}
            ORDER BY q.created_at DESC
            LIMIT ? OFFSET ?`,
            [...queryParams, queryLimit, queryOffset]
        );
        
        // 获取总记录数（带日期条件）
        const countResult = await dbQuery(
            `SELECT COUNT(*) as total FROM robot_quantify_logs q WHERE q.wallet_address = ? ${dateCondition}`,
            queryParams
        );
        const total = countResult[0]?.total || 0;
        
        // 获取筛选范围内的总收益
        const totalEarningsResult = await dbQuery(
            `SELECT COALESCE(SUM(earnings), 0) as total_earnings FROM robot_quantify_logs q WHERE q.wallet_address = ? ${dateCondition}`,
            queryParams
        );
        const totalEarnings = parseFloat(totalEarningsResult[0]?.total_earnings) || 0;
        
        res.json({
            success: true,
            data: {
                records: records,
                total: total,
                total_earnings: totalEarnings.toFixed(4),
                limit: queryLimit,
                offset: queryOffset,
                period: period
            }
        });
    } catch (error) {
        console.error('获取量化收益明细失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch quantify history',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取量化收益统计
 * GET /api/robot/quantify-stats?wallet_address=0x...
 * 
 * 返回用户的量化收益统计数据
 * 
 * 注意：所有日期计算都使用 MySQL 函数，确保时区一致（UTC+8）
 * 不再使用 JavaScript 的 UTC 时间，避免时区不一致问题
 */
app.get('/api/robot/quantify-stats', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 使用单个查询获取所有统计数据，使用 MySQL 日期函数确保时区一致
        const statsResult = await dbQuery(
            `SELECT 
                COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN earnings ELSE 0 END), 0) as today_earnings,
                COALESCE(SUM(CASE WHEN DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) THEN earnings ELSE 0 END), 0) as week_earnings,
                COALESCE(SUM(CASE WHEN DATE(created_at) >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN earnings ELSE 0 END), 0) as month_earnings,
                COALESCE(SUM(earnings), 0) as total_earnings,
                COUNT(*) as total_count,
                CURDATE() as server_date
            FROM robot_quantify_logs 
            WHERE wallet_address = ?`,
            [walletAddr]
        );
        
        const stats = statsResult[0] || {};
        
        res.json({
            success: true,
            data: {
                today_earnings: parseFloat(stats.today_earnings || 0).toFixed(4),
                week_earnings: parseFloat(stats.week_earnings || 0).toFixed(4),
                month_earnings: parseFloat(stats.month_earnings || 0).toFixed(4),
                total_earnings: parseFloat(stats.total_earnings || 0).toFixed(4),
                total_count: stats.total_count || 0,
                server_date: stats.server_date
            }
        });
    } catch (error) {
        console.error('获取量化收益统计失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch quantify stats',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== 保险箱 API ====================

/**
 * 初始化保险箱表
 */
async function initSafeTable() {
    try {
        await dbQuery(`
            CREATE TABLE IF NOT EXISTS user_safes (
                id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
                wallet_address VARCHAR(100) NOT NULL COMMENT '钱包地址',
                password_hash VARCHAR(255) NOT NULL COMMENT '密码哈希',
                locked_usdt DECIMAL(20, 4) DEFAULT 0 COMMENT '锁定的USDT',
                locked_wld DECIMAL(20, 4) DEFAULT 0 COMMENT '锁定的WLD',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uk_wallet (wallet_address)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户保险箱'
        `);
        console.log('[DB] 保险箱表初始化完成');
    } catch (error) {
        console.error('[DB] 保险箱表初始化失败:', error.message);
    }
}

// 初始化保险箱表
initSafeTable();

// 初始化错误日志表
(async () => {
    try {
        await initErrorLogsTable();
    } catch (error) {
        console.error('[DB] 初始化错误日志表失败:', error.message);
    }
})();

/**
 * 简单密码哈希（生产环境应使用 bcrypt）
 */
const SAFE_PASSWORD_SALT = 'vitu_safe_salt';
function hashPassword(password) {
    return createHash('sha256').update(password + SAFE_PASSWORD_SALT).digest('hex');
}

/**
 * 获取保险箱状态
 * GET /api/safe/status?wallet_address=0x...
 */
app.get('/api/safe/status', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        const safe = await dbQuery(
            'SELECT locked_usdt, locked_wld FROM user_safes WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (safe.length === 0) {
            // 用户还没有设置保险箱
            return res.json({
                success: true,
                data: {
                    has_safe: false,
                    locked_usdt: '0.0000',
                    locked_wld: '0.0000'
                }
            });
        }
        
        res.json({
            success: true,
            data: {
                has_safe: true,
                locked_usdt: parseFloat(safe[0].locked_usdt).toFixed(4),
                locked_wld: parseFloat(safe[0].locked_wld).toFixed(4)
            }
        });
    } catch (error) {
        console.error('获取保险箱状态失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get safe status'
        });
    }
});

/**
 * 设置保险箱密码（首次创建）
 * POST /api/safe/setup
 * body: { wallet_address, password }
 */
app.post('/api/safe/setup', async (req, res) => {
    try {
        const { wallet_address, password } = req.body;
        
        if (!wallet_address || !password) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address and password are required'
            });
        }
        
        if (password.length !== 6 || !/^\d+$/.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be 6 digits'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 检查是否已有保险箱
        const existing = await dbQuery(
            'SELECT id FROM user_safes WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Safe already exists'
            });
        }
        
        // 创建保险箱
        const passwordHash = hashPassword(password);
        await dbQuery(
            'INSERT INTO user_safes (wallet_address, password_hash) VALUES (?, ?)',
            [walletAddr, passwordHash]
        );
        
        res.json({
            success: true,
            message: 'Safe created successfully'
        });
    } catch (error) {
        console.error('创建保险箱失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to create safe'
        });
    }
});

/**
 * 验证保险箱密码
 * POST /api/safe/verify
 * body: { wallet_address, password }
 */
app.post('/api/safe/verify', async (req, res) => {
    try {
        const { wallet_address, password } = req.body;
        
        if (!wallet_address || !password) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address and password are required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        const safe = await dbQuery(
            'SELECT password_hash, locked_usdt, locked_wld FROM user_safes WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (safe.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Safe not found'
            });
        }
        
        const passwordHash = hashPassword(password);
        if (passwordHash !== safe[0].password_hash) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password'
            });
        }
        
        res.json({
            success: true,
            message: 'Password verified',
            data: {
                locked_usdt: parseFloat(safe[0].locked_usdt).toFixed(4),
                locked_wld: parseFloat(safe[0].locked_wld).toFixed(4)
            }
        });
    } catch (error) {
        console.error('验证保险箱密码失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to verify password'
        });
    }
});

/**
 * 存入资金到保险箱
 * POST /api/safe/deposit
 * body: { wallet_address, password, amount, token }
 */
app.post('/api/safe/deposit', async (req, res) => {
    try {
        const { wallet_address, password, amount, token = 'USDT' } = req.body;
        
        if (!wallet_address || !password || !amount) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address, password and amount are required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        const depositAmount = parseFloat(amount);
        
        if (isNaN(depositAmount) || depositAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount'
            });
        }
        
        // 验证密码
        const safe = await dbQuery(
            'SELECT password_hash FROM user_safes WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (safe.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Safe not found'
            });
        }
        
        const passwordHash = hashPassword(password);
        if (passwordHash !== safe[0].password_hash) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password'
            });
        }
        
        // 检查用户余额（字段名来自固定映射，避免 SQL 注入）
        const tokenUpper = String(token || 'USDT').toUpperCase();
        const tokenConfig = tokenUpper === 'WLD'
            ? { balanceField: 'wld_balance', lockedField: 'locked_wld' }
            : tokenUpper === 'USDT'
                ? { balanceField: 'usdt_balance', lockedField: 'locked_usdt' }
                : null;

        if (!tokenConfig) {
            return res.status(400).json({
                success: false,
                message: 'Invalid token type'
            });
        }

        const { balanceField, lockedField } = tokenConfig;

        // 使用参数化查询查询必要字段
        const balance = await dbQuery(
            'SELECT usdt_balance, wld_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );

        if (balance.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Balance record not found'
            });
        }

        const currentBalance = parseFloat(balance[0][balanceField] ?? 0);
        if (currentBalance < depositAmount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance'
            });
        }

        // 扣除余额并存入保险箱 - 使用更安全的UPDATE方式
        const updateBalanceQuery = `UPDATE user_balances SET ${balanceField} = ${balanceField} - ? WHERE wallet_address = ?`;
        const updateSafeQuery = `UPDATE user_safes SET ${lockedField} = ${lockedField} + ? WHERE wallet_address = ?`;

        await dbQuery(updateBalanceQuery, [depositAmount, walletAddr]);
        await dbQuery(updateSafeQuery, [depositAmount, walletAddr]);
        
        // 获取更新后的数据
        const updatedBalance = await dbQuery(
            'SELECT usdt_balance, wld_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        const updatedSafe = await dbQuery(
            'SELECT locked_usdt, locked_wld FROM user_safes WHERE wallet_address = ?',
            [walletAddr]
        );
        
        res.json({
            success: true,
            message: 'Deposit successful',
            data: {
                balance: {
                    usdt: parseFloat(updatedBalance[0].usdt_balance).toFixed(4),
                    wld: parseFloat(updatedBalance[0].wld_balance).toFixed(4)
                },
                safe: {
                    locked_usdt: parseFloat(updatedSafe[0].locked_usdt).toFixed(4),
                    locked_wld: parseFloat(updatedSafe[0].locked_wld).toFixed(4)
                }
            }
        });
    } catch (error) {
        console.error('保险箱存款失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to deposit'
        });
    }
});

/**
 * 从保险箱取出资金
 * POST /api/safe/withdraw
 * body: { wallet_address, password, amount, token }
 */
app.post('/api/safe/withdraw', async (req, res) => {
    try {
        const { wallet_address, password, amount, token = 'USDT' } = req.body;
        
        if (!wallet_address || !password || !amount) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address, password and amount are required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        const withdrawAmount = parseFloat(amount);
        
        if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount'
            });
        }
        
        // 验证密码
        const safe = await dbQuery(
            'SELECT password_hash, locked_usdt, locked_wld FROM user_safes WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (safe.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Safe not found'
            });
        }
        
        const passwordHash = hashPassword(password);
        if (passwordHash !== safe[0].password_hash) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password'
            });
        }
        
        // 检查保险箱余额（字段名来自固定映射，避免 SQL 注入）
        const tokenUpper = String(token || 'USDT').toUpperCase();
        const tokenConfig = tokenUpper === 'WLD'
            ? { balanceField: 'wld_balance', lockedField: 'locked_wld' }
            : tokenUpper === 'USDT'
                ? { balanceField: 'usdt_balance', lockedField: 'locked_usdt' }
                : null;

        if (!tokenConfig) {
            return res.status(400).json({
                success: false,
                message: 'Invalid token type'
            });
        }

        const { balanceField, lockedField } = tokenConfig;
        const lockedBalance = tokenUpper === 'WLD'
            ? parseFloat(safe[0].locked_wld)
            : parseFloat(safe[0].locked_usdt);
        
        if (lockedBalance < withdrawAmount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient locked balance'
            });
        }
        
        // 从保险箱取出并增加余额
        await dbQuery(
            `UPDATE user_safes SET ${lockedField} = ${lockedField} - ? WHERE wallet_address = ?`,
            [withdrawAmount, walletAddr]
        );

        // 确保余额记录存在（避免空记录导致后续查询报错）
        await dbQuery(
            'INSERT IGNORE INTO user_balances (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, created_at, updated_at) VALUES (?, 0, 0, 0, 0, NOW(), NOW())',
            [walletAddr]
        );
        
        await dbQuery(
            `UPDATE user_balances SET ${balanceField} = ${balanceField} + ? WHERE wallet_address = ?`,
            [withdrawAmount, walletAddr]
        );
        
        // 获取更新后的数据
        const updatedBalance = await dbQuery(
            'SELECT usdt_balance, wld_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        const updatedSafe = await dbQuery(
            'SELECT locked_usdt, locked_wld FROM user_safes WHERE wallet_address = ?',
            [walletAddr]
        );
        
        res.json({
            success: true,
            message: 'Withdraw successful',
            data: {
                balance: {
                    usdt: parseFloat(updatedBalance[0].usdt_balance).toFixed(4),
                    wld: parseFloat(updatedBalance[0].wld_balance).toFixed(4)
                },
                safe: {
                    locked_usdt: parseFloat(updatedSafe[0].locked_usdt).toFixed(4),
                    locked_wld: parseFloat(updatedSafe[0].locked_wld).toFixed(4)
                }
            }
        });
    } catch (error) {
        console.error('保险箱取款失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to withdraw'
        });
    }
});

// ==================== 邀请系统 API ====================

/**
 * 注册邀请关系
 * POST /api/invite/register
 * body: { wallet_address, referrer_code }
 */
app.post('/api/invite/register', async (req, res) => {
    try {
        const { wallet_address, referrer_code } = req.body;
        
        if (!wallet_address || !referrer_code) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address and referrer_code are required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        const refCode = referrer_code.toLowerCase();
        
        // 检查用户是否已有邀请人
        const existing = await dbQuery(
            'SELECT id FROM user_referrals WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (existing.length > 0) {
            return res.json({
                success: true,
                message: 'Referral already registered'
            });
        }
        
        // 查找邀请人（通过邀请码找到钱包地址）
        // 邀请码是钱包地址的后8位
        // 优先从 user_balances 表查找，如果找不到再从 user_referrals 表查找
        let referrerAddress = null;
        
        // 1. 首先在 user_balances 表中查找（已充值或购买过机器人的用户）
        const balanceResult = await dbQuery(
            'SELECT wallet_address FROM user_balances WHERE LOWER(RIGHT(wallet_address, 8)) = ?',
            [refCode]
        );
        
        if (balanceResult.length > 0) {
            referrerAddress = balanceResult[0].wallet_address;
            console.log(`[Invite Register] Found referrer in user_balances: ${referrerAddress.slice(0, 10)}...`);
        }
        
        // 2. 如果在 user_balances 中找不到，在 user_referrals 表中查找（被别人邀请过的用户）
        if (!referrerAddress) {
            const referralResult = await dbQuery(
                'SELECT wallet_address FROM user_referrals WHERE LOWER(RIGHT(wallet_address, 8)) = ?',
                [refCode]
            );
            if (referralResult.length > 0) {
                referrerAddress = referralResult[0].wallet_address;
                console.log(`[Invite Register] Found referrer in user_referrals: ${referrerAddress.slice(0, 10)}...`);
            }
        }
        
        // 3. 如果还找不到，在 deposit_records 表中查找（有充值记录的用户）
        if (!referrerAddress) {
            const depositResult = await dbQuery(
                'SELECT DISTINCT wallet_address FROM deposit_records WHERE LOWER(RIGHT(wallet_address, 8)) = ? LIMIT 1',
                [refCode]
            );
            if (depositResult.length > 0) {
                referrerAddress = depositResult[0].wallet_address;
                console.log(`[Invite Register] Found referrer in deposit_records: ${referrerAddress.slice(0, 10)}...`);
            }
        }
        
        // 4. 如果还找不到，在 robot_purchases 表中查找（购买过机器人的用户）
        if (!referrerAddress) {
            const robotResult = await dbQuery(
                'SELECT DISTINCT wallet_address FROM robot_purchases WHERE LOWER(RIGHT(wallet_address, 8)) = ? LIMIT 1',
                [refCode]
            );
            if (robotResult.length > 0) {
                referrerAddress = robotResult[0].wallet_address;
                console.log(`[Invite Register] Found referrer in robot_purchases: ${referrerAddress.slice(0, 10)}...`);
            }
        }
        
        // 如果所有表都找不到，返回错误
        if (!referrerAddress) {
            console.log(`[Invite Register] Referrer not found for code: ${refCode}`);
            return res.status(400).json({
                success: false,
                message: 'Invalid referral code - referrer not found'
            });
        }
        
        // 不能邀请自己
        if (referrerAddress.toLowerCase() === walletAddr) {
            return res.status(400).json({
                success: false,
                message: 'Cannot refer yourself'
            });
        }
        
        // 保存邀请关系
        await dbQuery(
            'INSERT INTO user_referrals (wallet_address, referrer_address, referrer_code, created_at) VALUES (?, ?, ?, NOW())',
            [walletAddr, referrerAddress, refCode]
        );
        
        // 确保双方都有 user_balances 记录（用于后续接收奖励）
        await dbQuery(
            `INSERT IGNORE INTO user_balances (wallet_address, usdt_balance, wld_balance, created_at, updated_at) 
             VALUES (?, 0, 0, NOW(), NOW())`,
            [walletAddr]
        );
        await dbQuery(
            `INSERT IGNORE INTO user_balances (wallet_address, usdt_balance, wld_balance, created_at, updated_at) 
             VALUES (?, 0, 0, NOW(), NOW())`,
            [referrerAddress]
        );
        
        console.log(`[Invite Register] Successfully registered: ${walletAddr.slice(0, 10)}... -> referrer: ${referrerAddress.slice(0, 10)}...`);
        
        // 给推荐人增加500幸运值（抽奖用）
        try {
            await addLuckyPoints(referrerAddress, 500, 'invite_reward');
            console.log(`[Invite Register] 推荐人 ${referrerAddress.slice(0, 10)}... 获得 500 幸运值`);
        } catch (luckyErr) {
            console.error('[Invite Register] 添加幸运值失败:', luckyErr);
        }
        
        res.json({
            success: true,
            message: 'Referral registered successfully'
        });
        
        // ====================================
        // 新推荐关系建立后触发上级链路分红检查
        // 因为直推人数增加，上级可能达到新的经纪人等级
        // 异步执行，不阻塞 API 响应
        // ====================================
        processUplineDailyDividends(walletAddr)
            .then(result => {
                if (result.rewarded > 0) {
                    console.log(`[Invite Register] ✅ 新推荐触发上级分红: ${result.rewarded} 人获得分红`);
                }
            })
            .catch(err => {
                console.error(`[Invite Register] ❌ 触发上级分红失败:`, err.message);
            });
            
    } catch (error) {
        console.error('注册邀请关系失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to register referral',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取邀请统计数据
 * GET /api/invite/stats?wallet_address=0x...
 * 
 * 返回数据：
 * - direct_members: 直推成员数量
 * - team_members: 团队成员数量（8级）
 * - total_recharge: 社区总充值
 * - total_withdrawals: 社区总提款
 * - total_performance: 社区整体绩效
 * - broker_level: 用户经纪人等级（0-5）
 * - team_daily_income: 团队每日总收入（根据经纪人等级）
 * - total_referral_reward: 总推荐奖励
 * - total_team_reward: 总团队奖励
 */
app.get('/api/invite/stats', async (req, res) => {
    // 禁止缓存 API 响应，确保数据实时更新
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 获取直推成员数量（购买了 >= MIN_ROBOT_PURCHASE 的合格机器人）
        const qualifiedDirectResult = await dbQuery(
            `SELECT COUNT(DISTINCT r.wallet_address) as count
             FROM user_referrals r
             INNER JOIN robot_purchases rp ON r.wallet_address = rp.wallet_address
             WHERE r.referrer_address = ? AND rp.price >= ? AND rp.status = 'active'`,
            [walletAddr, MIN_ROBOT_PURCHASE]
        );
        const qualifiedDirectMembers = parseInt(qualifiedDirectResult[0]?.count) || 0;
        
        // 获取有效推荐成员（购买了 >= 20 USDT 的机器人，可获得推荐收益）
        const activeReferralsResult = await dbQuery(
            `SELECT COUNT(DISTINCT r.wallet_address) as count
             FROM user_referrals r
             INNER JOIN robot_purchases rp ON r.wallet_address = rp.wallet_address
             WHERE r.referrer_address = ? AND rp.price >= 20 AND rp.status = 'active'`,
            [walletAddr]
        );
        const activeReferrals = parseInt(activeReferralsResult[0]?.count) || 0;
        
        // 获取所有直推成员（用于统计团队）
        const allDirectResult = await dbQuery(
            'SELECT COUNT(*) as count FROM user_referrals WHERE referrer_address = ?',
            [walletAddr]
        );
        const allDirectMembers = parseInt(allDirectResult[0]?.count) || 0;
        
        // 获取团队成员数量（8级深度）并收集所有团队成员钱包地址
        let teamMembers = allDirectMembers;
        let allTeamWallets = [];
        let currentLevelWallets = [walletAddr];
        
        // 获取第一级成员
        const level1Result = await dbQuery(
            'SELECT wallet_address FROM user_referrals WHERE referrer_address = ?',
            [walletAddr]
        );
        allTeamWallets = level1Result.map(r => r.wallet_address);
        currentLevelWallets = [...allTeamWallets];
        
        // 获取2-8级成员
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
        
        // 获取团队总充值（所有团队成员） - 从实际充值记录表中统计已完成的记录
        // 团队业绩 = 团队总充值金额
        let totalRecharge = 0;
        if (allTeamWallets.length > 0) {
            const placeholders = allTeamWallets.map(() => '?').join(',');
            const rechargeResult = await dbQuery(
                `SELECT COALESCE(SUM(amount), 0) as total FROM deposit_records 
                WHERE wallet_address IN (${placeholders}) AND status = 'completed'`,
                allTeamWallets
            );
            totalRecharge = parseFloat(rechargeResult[0]?.total) || 0;
            console.log(`[Invite Stats] ${walletAddr.slice(0, 10)}... 团队充值统计:`);
            console.log(`  团队成员数: ${allTeamWallets.length}`);
            console.log(`  团队总充值: ${totalRecharge} USDT`);
        }
        
        // 团队业绩 = 团队总充值金额（用于等级升级判断和显示）
        let totalPerformance = totalRecharge;
        
        // 获取团队总提款（所有团队成员） - 从实际提现记录表中统计已完成的记录
        let totalWithdrawals = 0;
        if (allTeamWallets.length > 0) {
            const placeholders = allTeamWallets.map(() => '?').join(',');
            const withdrawResult = await dbQuery(
                `SELECT COALESCE(SUM(amount), 0) as total FROM withdraw_records 
                WHERE wallet_address IN (${placeholders}) AND status = 'completed'`,
                allTeamWallets
            );
            totalWithdrawals = withdrawResult[0]?.total || 0;
            console.log(`[Invite Stats] ${walletAddr.slice(0, 10)}... 团队提款统计:`);
            console.log(`  团队成员数: ${allTeamWallets.length}`);
            console.log(`  团队总提款: ${totalWithdrawals} USDT`);
        }
        
        // 计算团队每日总收入（包含团队量化收益 + 用户自己的收益 + 推荐奖励 + 团队奖励）
        // 使用 CURDATE() 确保时区一致（UTC+8）
        let teamDailyIncome = 0;
        
        // 1. 团队成员的量化收益（不包含自己）
        let teamEarnings = 0;
        if (allTeamWallets.length > 0) {
            const placeholders = allTeamWallets.map(() => '?').join(',');
            const dailyIncomeResult = await dbQuery(
                `SELECT COALESCE(SUM(earning_amount), 0) as total
                 FROM robot_earnings
                 WHERE wallet_address IN (${placeholders})
                 AND DATE(created_at) = CURDATE()`,
                allTeamWallets
            );
            teamEarnings = parseFloat(dailyIncomeResult[0]?.total) || 0;
        }
        
        // 2. 用户自己今天的量化收益
        const myEarningsResult = await dbQuery(
            `SELECT COALESCE(SUM(earning_amount), 0) as total
             FROM robot_earnings
             WHERE wallet_address = ?
             AND DATE(created_at) = CURDATE()`,
            [walletAddr]
        );
        const myEarnings = parseFloat(myEarningsResult[0]?.total) || 0;
        
        // 3. 用户今天的推荐奖励
        const myReferralRewardResult = await dbQuery(
            `SELECT COALESCE(SUM(reward_amount), 0) as total
             FROM referral_rewards
             WHERE wallet_address = ?
             AND DATE(created_at) = CURDATE()`,
            [walletAddr]
        );
        const myReferralReward = parseFloat(myReferralRewardResult[0]?.total) || 0;
        
        // 4. 用户今天的团队奖励（经纪人分红）
        const myTeamRewardResult = await dbQuery(
            `SELECT COALESCE(SUM(reward_amount), 0) as total
             FROM team_rewards
             WHERE wallet_address = ?
             AND DATE(created_at) = CURDATE()`,
            [walletAddr]
        );
        const myTeamReward = parseFloat(myTeamRewardResult[0]?.total) || 0;
        
        // 每日总收入 = 团队量化收益 + 自己量化收益 + 推荐奖励 + 团队奖励
        teamDailyIncome = teamEarnings + myEarnings + myReferralReward + myTeamReward;
        
        // 记录详细日志供调试
        console.log(`[Invite Stats] ${walletAddr.slice(0, 10)}... 今日收益明细:`);
        console.log(`  团队量化收益: ${teamEarnings.toFixed(4)} USDT`);
        console.log(`  自己量化收益: ${myEarnings.toFixed(4)} USDT`);
        console.log(`  推荐奖励: ${myReferralReward.toFixed(4)} USDT`);
        console.log(`  团队奖励: ${myTeamReward.toFixed(4)} USDT`);
        console.log(`  今日总收入: ${teamDailyIncome.toFixed(4)} USDT`);
        
        // 计算用户经纪人等级（使用完整版，包含下级经纪人要求）
        const brokerLevel = await calculateUserLevel(walletAddr);
        
        // #region agent log
        fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:3455',message:'Broker level calculated',data:{wallet:walletAddr.slice(0,10),brokerLevel,allDirectMembers,qualifiedDirectMembers,totalPerformance:parseFloat(totalPerformance).toFixed(4)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        
        // 获取总推荐奖励（从 referral_rewards 表累计）
        const referralRewardResult = await dbQuery(
            'SELECT COALESCE(SUM(reward_amount), 0) as total FROM referral_rewards WHERE wallet_address = ?',
            [walletAddr]
        );
        const totalReferralReward = parseFloat(referralRewardResult[0]?.total) || 0;
        
        // 获取总团队奖励（从 team_rewards 表累计）
        const teamRewardResult = await dbQuery(
            'SELECT COALESCE(SUM(reward_amount), 0) as total FROM team_rewards WHERE wallet_address = ?',
            [walletAddr]
        );
        const totalTeamReward = parseFloat(teamRewardResult[0]?.total) || 0;
        
        // 获取下级经纪人统计（用于显示升级进度）
        const subBrokerStats = await getSubBrokerStats(walletAddr);
        
        // 根据当前等级设置下一级的升级要求
        const levelRequirements = {
            0: { directMembers: 5, subBrokers: 0, subBrokerLevel: 0, performance: 1000, nextLevel: 1 },
            1: { directMembers: 10, subBrokers: 2, subBrokerLevel: 1, performance: 5000, nextLevel: 2 },
            2: { directMembers: 20, subBrokers: 2, subBrokerLevel: 2, performance: 20000, nextLevel: 3 },
            3: { directMembers: 30, subBrokers: 2, subBrokerLevel: 3, performance: 80000, nextLevel: 4 },
            4: { directMembers: 50, subBrokers: 2, subBrokerLevel: 4, performance: 200000, nextLevel: 5 },
            5: { directMembers: 50, subBrokers: 2, subBrokerLevel: 4, performance: 200000, nextLevel: 5 } // 已达最高级
        };
        
        const currentRequirement = levelRequirements[brokerLevel] || levelRequirements[0];
        
        // 计算当前拥有的目标等级下级经纪人数量
        let currentSubBrokers = 0;
        if (brokerLevel >= 1 && brokerLevel < 5) {
            // 例如：Level 1 需要看有多少个 Level 1 的下级
            const targetSubLevel = `level${currentRequirement.subBrokerLevel}`;
            currentSubBrokers = subBrokerStats[targetSubLevel] || 0;
        }
        
        // #region agent log
        fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:3481',message:'API response data',data:{wallet:walletAddr.slice(0,10),brokerLevel,inviteTarget:currentRequirement.directMembers,allDirectMembers,qualifiedDirectMembers,totalPerformance:parseFloat(totalPerformance).toFixed(4)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        
        // Get admin-configured display adjustments for this user
        // These values are set in admin panel to customize what user sees
        let adjustments = {};
        try {
            const adjResult = await dbQuery(
                'SELECT * FROM user_invite_adjustments WHERE wallet_address = ?',
                [walletAddr]
            );
            if (adjResult && adjResult.length > 0) {
                adjustments = adjResult[0];
            }
        } catch (adjError) {
            console.warn('[Invite Stats] Failed to get adjustments:', adjError.message);
        }
        
        // Apply adjustments to display values (real stats + adjustments)
        const dailyIncomeAdj = parseFloat(adjustments.daily_income_adj) || 0;
        const teamMembersAdj = parseInt(adjustments.team_members_adj) || 0;
        const totalRechargeAdj = parseFloat(adjustments.total_recharge_adj) || 0;
        const directMembersAdj = parseInt(adjustments.direct_members_adj) || 0;
        const totalWithdrawalsAdj = parseFloat(adjustments.total_withdrawals_adj) || 0;
        const totalPerformanceAdj = parseFloat(adjustments.total_performance_adj) || 0;
        const referralRewardAdj = parseFloat(adjustments.referral_reward_adj) || 0;
        const teamRewardAdj = parseFloat(adjustments.team_reward_adj) || 0;
        
        res.json({
            success: true,
            data: {
                direct_members: allDirectMembers + directMembersAdj,
                active_referrals: activeReferrals,  // 有效推荐（≥20 USDT，有收益）
                qualified_direct_members: qualifiedDirectMembers,  // 合格成员（≥100 USDT，用于等级判定）
                team_members: teamMembers + teamMembersAdj,
                total_recharge: (parseFloat(totalRecharge) + totalRechargeAdj).toFixed(4),
                total_withdrawals: (parseFloat(totalWithdrawals) + totalWithdrawalsAdj).toFixed(4),
                total_performance: (totalPerformance + totalPerformanceAdj).toFixed(4),
                broker_level: brokerLevel,
                team_daily_income: (teamDailyIncome + dailyIncomeAdj).toFixed(4),
                total_referral_reward: (totalReferralReward + referralRewardAdj).toFixed(4),
                total_team_reward: (totalTeamReward + teamRewardAdj).toFixed(4),
                // 升级进度信息
                invite_target: currentRequirement.directMembers,
                next_level: currentRequirement.nextLevel,
                requirements: {
                    direct_members: currentRequirement.directMembers,
                    sub_brokers: currentRequirement.subBrokers,
                    sub_broker_level: currentRequirement.subBrokerLevel,
                    performance: currentRequirement.performance
                },
                progress: {
                    direct_members: qualifiedDirectMembers,
                    sub_brokers: currentSubBrokers,
                    performance: parseFloat(totalPerformance).toFixed(4)
                }
            }
        });
        
        // ====================================
        // 立即发放分红：达到经纪人等级要求后即时发放
        // 异步执行，不阻塞 API 响应
        // ====================================
        if (brokerLevel > 0) {
            // 用户已达到经纪人等级，尝试发放今日分红
            processWalletDailyDividend(walletAddr)
                .then(result => {
                    if (result.rewarded) {
                        console.log(`[Invite Stats] ✅ 即时发放分红成功: ${walletAddr.slice(0, 10)}... Level${result.level} +${result.amount} USDT`);
                    } else if (result.skipped) {
                        // 今日已发放，静默跳过
                    }
                })
                .catch(err => {
                    console.error(`[Invite Stats] ❌ 即时发放分红失败: ${walletAddr.slice(0, 10)}...`, err.message);
                });
        }
        
    } catch (error) {
        console.error('获取邀请统计失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch invite stats',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取各级成员数量统计（1-10级）
 * GET /api/invite/level-counts?wallet_address=0x...
 * 
 * 返回数据：
 * {
 *   "success": true,
 *   "data": {
 *     "1": 5,  // Level 1 有5个成员
 *     "2": 10, // Level 2 有10个成员
 *     ...
 *   }
 * }
 */
app.get('/api/invite/level-counts', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        const levelCounts = {};
        
        // Level 1: 直推成员
        const level1Result = await dbQuery(
            'SELECT COUNT(*) as count FROM user_referrals WHERE referrer_address = ?',
            [walletAddr]
        );
        levelCounts['1'] = parseInt(level1Result[0]?.count) || 0;
        
        // 获取Level 1的所有成员地址
        let currentLevelAddresses = await dbQuery(
            'SELECT wallet_address FROM user_referrals WHERE referrer_address = ?',
            [walletAddr]
        );
        
        // 逐级向下查询 (Level 2-10)
        for (let level = 2; level <= 10; level++) {
            if (currentLevelAddresses.length === 0) {
                levelCounts[level.toString()] = 0;
                continue;
            }
            
            const addresses = currentLevelAddresses.map(r => r.wallet_address);
            const placeholders = addresses.map(() => '?').join(',');
            
            // 查询下一级成员
            const nextLevelResult = await dbQuery(
                `SELECT wallet_address FROM user_referrals WHERE referrer_address IN (${placeholders})`,
                addresses
            );
            
            levelCounts[level.toString()] = nextLevelResult.length;
            currentLevelAddresses = nextLevelResult;
        }
        
        res.json({
            success: true,
            data: levelCounts
        });
    } catch (error) {
        console.error('获取层级成员数量失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch level counts',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取团队统计详情（包含各层级人数和业绩）
 * GET /api/invite/team-stats?wallet_address=0x...
 * 
 * 返回数据：
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "level": 1,
 *       "count": 5,
 *       "totalInvestment": "500.0000",
 *       "rewardPercentage": "30%"
 *     },
 *     ...
 *   ]
 * }
 */
app.get('/api/invite/team-stats', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        const stats = [];
        
        // 推荐奖励比例（8级）
        const rewardPercentages = ['30%', '10%', '5%', '1%', '1%', '1%', '1%', '1%'];
        
        // Level 1: 直推成员
        const level1Result = await dbQuery(
            'SELECT COUNT(*) as count FROM user_referrals WHERE referrer_address = ?',
            [walletAddr]
        );
        const level1Count = parseInt(level1Result[0]?.count) || 0;
        
        // 获取Level 1的成员地址
        let currentLevelAddresses = await dbQuery(
            'SELECT wallet_address FROM user_referrals WHERE referrer_address = ?',
            [walletAddr]
        );
        
        // 获取Level 1的总投资
        let level1Investment = 0;
        if (level1Count > 0) {
            const addresses = currentLevelAddresses.map(r => r.wallet_address);
            const placeholders = addresses.map(() => '?').join(',');
            const investmentResult = await dbQuery(
                `SELECT COALESCE(SUM(price), 0) as total 
                 FROM robot_purchases 
                 WHERE wallet_address IN (${placeholders}) AND status = 'active'`,
                addresses
            );
            level1Investment = parseFloat(investmentResult[0]?.total) || 0;
        }
        
        stats.push({
            level: 1,
            count: level1Count,
            totalInvestment: level1Investment.toFixed(4),
            rewardPercentage: rewardPercentages[0]
        });
        
        // 逐级向下查询 (Level 2-8)
        for (let level = 2; level <= 8; level++) {
            if (currentLevelAddresses.length === 0) {
                stats.push({
                    level,
                    count: 0,
                    totalInvestment: '0.0000',
                    rewardPercentage: rewardPercentages[level - 1]
                });
                continue;
            }
            
            const addresses = currentLevelAddresses.map(r => r.wallet_address);
            const placeholders = addresses.map(() => '?').join(',');
            
            // 查询下一级成员
            const nextLevelResult = await dbQuery(
                `SELECT wallet_address FROM user_referrals WHERE referrer_address IN (${placeholders})`,
                addresses
            );
            
            const levelCount = nextLevelResult.length;
            
            // 获取该层级的总投资
            let levelInvestment = 0;
            if (levelCount > 0) {
                const levelAddresses = nextLevelResult.map(r => r.wallet_address);
                const levelPlaceholders = levelAddresses.map(() => '?').join(',');
                const investmentResult = await dbQuery(
                    `SELECT COALESCE(SUM(price), 0) as total 
                     FROM robot_purchases 
                     WHERE wallet_address IN (${levelPlaceholders}) AND status = 'active'`,
                    levelAddresses
                );
                levelInvestment = parseFloat(investmentResult[0]?.total) || 0;
            }
            
            stats.push({
                level,
                count: levelCount,
                totalInvestment: levelInvestment.toFixed(4),
                rewardPercentage: rewardPercentages[level - 1]
            });
            
            currentLevelAddresses = nextLevelResult;
        }
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('[API] Get team stats error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch team stats',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取推荐奖励历史记录
 * GET /api/referral-rewards/history?wallet_address=0x...&limit=20
 * 
 * 返回用户获得的推荐奖励记录列表
 */
app.get('/api/referral-rewards/history', async (req, res) => {
    try {
        const { wallet_address, limit = 20 } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        const queryLimit = Math.min(parseInt(limit) || 20, 100);
        
        // 获取推荐奖励记录
        const records = await dbQuery(
            `SELECT 
                id,
                from_wallet,
                level,
                reward_amount,
                source_type,
                robot_name,
                created_at
            FROM referral_rewards
            WHERE wallet_address = ?
            ORDER BY created_at DESC
            LIMIT ?`,
            [walletAddr, queryLimit]
        );
        
        // 格式化记录
        const formattedRecords = records.map(record => ({
            id: record.id,
            from_wallet: record.from_wallet,
            level: record.level,
            reward_amount: parseFloat(record.reward_amount).toFixed(4),
            source_type: record.source_type, // 'quantify' 或 'maturity'
            robot_name: record.robot_name,
            created_at: record.created_at
        }));
        
        res.json({
            success: true,
            data: formattedRecords
        });
    } catch (error) {
        console.error('[API] Get referral rewards history error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch referral rewards history',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取团队奖励历史记录
 * GET /api/team-rewards/history?wallet_address=0x...&limit=20
 * 
 * 返回用户获得的团队奖励记录列表（经纪人分红）
 */
app.get('/api/team-rewards/history', async (req, res) => {
    try {
        const { wallet_address, limit = 20 } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        const queryLimit = Math.min(parseInt(limit) || 20, 100);
        
        // 获取团队奖励记录
        const records = await dbQuery(
            `SELECT 
                id,
                broker_level,
                reward_type,
                reward_amount,
                reward_date,
                created_at
            FROM team_rewards
            WHERE wallet_address = ?
            ORDER BY created_at DESC
            LIMIT ?`,
            [walletAddr, queryLimit]
        );
        
        // 格式化记录
        const formattedRecords = records.map(record => ({
            id: record.id,
            broker_level: record.broker_level,
            reward_type: record.reward_type, // 'daily_dividend' 等
            reward_amount: parseFloat(record.reward_amount).toFixed(4),
            reward_date: record.reward_date,
            created_at: record.created_at
        }));
        
        res.json({
            success: true,
            data: formattedRecords
        });
    } catch (error) {
        console.error('[API] Get team rewards history error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch team rewards history',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取推荐信息（推荐码、推荐人、基础统计）
 * GET /api/referral/info?wallet_address=0x...
 * 
 * 返回用户的推荐码、推荐人以及基础统计信息
 */
app.get('/api/referral/info', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        // 验证钱包地址格式
        if (!isValidWalletAddress(wallet_address)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address format'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // 1. 查询或创建推荐信息
        let referralInfo = await dbQuery(
            'SELECT referrer_address, created_at FROM user_referrals WHERE wallet_address = ?',
            [walletAddr]
        );
        
        let referralCode = null;
        let referrerAddress = null;
        
        if (referralInfo.length === 0) {
            // 生成新的推荐码（使用钱包地址后8位）
            referralCode = walletAddr.slice(-8).toUpperCase();
            referrerAddress = null;
            
            // 插入记录（referrer_code是必填字段，使用空字符串）
            await dbQuery(
                'INSERT INTO user_referrals (wallet_address, referrer_address, referrer_code, created_at) VALUES (?, NULL, \'\', NOW())',
                [walletAddr]
            );
        } else {
            // 使用钱包地址后8位作为推荐码
            referralCode = walletAddr.slice(-8).toUpperCase();
            referrerAddress = referralInfo[0].referrer_address;
        }
        
        // 2. 统计团队信息
        const teamStats = await dbQuery(
            `SELECT COUNT(*) as total_referrals
             FROM user_referrals
             WHERE referrer_address = ?`,
            [walletAddr]
        );
        
        // 3. 统计总奖励
        const rewardStats = await dbQuery(
            `SELECT COALESCE(SUM(reward_amount), 0) as total_rewards
             FROM referral_rewards
             WHERE wallet_address = ?`,
            [walletAddr]
        );
        
        // 4. 统计今日奖励
        const todayRewards = await dbQuery(
            `SELECT COALESCE(SUM(reward_amount), 0) as today_rewards
             FROM referral_rewards
             WHERE wallet_address = ? AND DATE(created_at) = CURDATE()`,
            [walletAddr]
        );
        
        res.json({
            success: true,
            data: {
                wallet_address: walletAddr,
                referral_code: referralCode,
                referrer_address: referrerAddress,
                total_referrals: teamStats[0].total_referrals || 0,
                total_rewards: parseFloat(rewardStats[0].total_rewards || 0).toFixed(4),
                today_rewards: parseFloat(todayRewards[0].today_rewards || 0).toFixed(4)
            }
        });
        
    } catch (error) {
        console.error('[API] Get referral info error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch referral info',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取团队信息（团队成员列表和统计）
 * GET /api/referral/team?wallet_address=0x...&page=1&limit=20
 * 
 * 返回用户的团队成员列表和详细统计
 */
app.get('/api/referral/team', async (req, res) => {
    try {
        const { wallet_address, page = 1, limit = 20 } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const queryLimit = Math.min(parseInt(limit) || 20, 100);
        
        // 1. 获取直推成员列表
        const teamMembers = await dbQuery(
            `SELECT 
                r.wallet_address,
                r.created_at as join_date,
                COALESCE(b.total_deposit, 0) as total_deposit,
                COALESCE(b.usdt_balance, 0) as current_balance,
                (SELECT COUNT(*) FROM robot_purchases WHERE wallet_address = r.wallet_address AND status = 'active') as active_robots
             FROM user_referrals r
             LEFT JOIN user_balances b ON r.wallet_address = b.wallet_address
             WHERE r.referrer_address = ?
             ORDER BY r.created_at DESC
             LIMIT ? OFFSET ?`,
            [walletAddr, queryLimit, offset]
        );
        
        // 2. 统计总人数
        const totalCount = await dbQuery(
            'SELECT COUNT(*) as total FROM user_referrals WHERE referrer_address = ?',
            [walletAddr]
        );
        
        // 3. 统计各级别人数
        const levelStats = [];
        for (let level = 1; level <= 8; level++) {
            let query = 'SELECT COUNT(*) as count FROM user_referrals WHERE ';
            const params = [walletAddr];
            
            if (level === 1) {
                query += 'referrer_address = ?';
            } else {
                // 递归查询各级下线
                let subquery = 'referrer_address = ?';
                for (let i = 1; i < level; i++) {
                    subquery = `referrer_address IN (SELECT wallet_address FROM user_referrals WHERE ${subquery})`;
                }
                query += subquery;
            }
            
            const result = await dbQuery(query, params);
            levelStats.push({
                level,
                count: result[0].count
            });
        }
        
        // 4. 隐藏钱包地址中间部分
        const sanitizedMembers = teamMembers.map(member => ({
            wallet_address: member.wallet_address.slice(0, 6) + '...' + member.wallet_address.slice(-4),
            join_date: member.join_date,
            total_deposit: parseFloat(member.total_deposit).toFixed(4),
            current_balance: parseFloat(member.current_balance).toFixed(4),
            active_robots: member.active_robots
        }));
        
        res.json({
            success: true,
            data: {
                team_members: sanitizedMembers,
                total_members: totalCount[0].total,
                level_stats: levelStats,
                page: parseInt(page),
                limit: queryLimit,
                total_pages: Math.ceil(totalCount[0].total / queryLimit)
            }
        });
        
    } catch (error) {
        console.error('[API] Get team info error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch team info',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取推荐收益统计和详情
 * GET /api/referral/earnings?wallet_address=0x...&days=30
 * 
 * 返回用户的推荐收益统计和最近的收益记录
 */
app.get('/api/referral/earnings', async (req, res) => {
    try {
        const { wallet_address, days = 30 } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        const queryDays = Math.min(parseInt(days) || 30, 365);
        
        // 1. 总收益统计
        const totalEarnings = await dbQuery(
            `SELECT 
                COALESCE(SUM(reward_amount), 0) as total_earnings,
                COUNT(*) as total_count
             FROM referral_rewards
             WHERE wallet_address = ?`,
            [walletAddr]
        );
        
        // 2. 最近N天收益
        const recentEarnings = await dbQuery(
            `SELECT 
                COALESCE(SUM(reward_amount), 0) as recent_earnings,
                COUNT(*) as recent_count
             FROM referral_rewards
             WHERE wallet_address = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [walletAddr, queryDays]
        );
        
        // 3. 今日收益
        const todayEarnings = await dbQuery(
            `SELECT COALESCE(SUM(reward_amount), 0) as today_earnings
             FROM referral_rewards
             WHERE wallet_address = ? AND DATE(created_at) = CURDATE()`,
            [walletAddr]
        );
        
        // 4. 按级别统计收益
        const earningsByLevel = await dbQuery(
            `SELECT 
                level,
                COALESCE(SUM(reward_amount), 0) as level_earnings,
                COUNT(*) as level_count
             FROM referral_rewards
             WHERE wallet_address = ?
             GROUP BY level
             ORDER BY level`,
            [walletAddr]
        );
        
        // 5. 最近的收益记录（20条）
        const recentRecords = await dbQuery(
            `SELECT 
                from_wallet,
                level,
                reward_amount,
                source_type,
                robot_name,
                created_at
             FROM referral_rewards
             WHERE wallet_address = ?
             ORDER BY created_at DESC
             LIMIT 20`,
            [walletAddr]
        );
        
        // 格式化数据
        const formattedRecords = recentRecords.map(record => ({
            from_wallet: record.from_wallet.slice(0, 6) + '...' + record.from_wallet.slice(-4),
            level: record.level,
            reward_amount: parseFloat(record.reward_amount).toFixed(4),
            source_type: record.source_type,
            robot_name: record.robot_name,
            created_at: record.created_at
        }));
        
        const formattedLevelEarnings = earningsByLevel.map(item => ({
            level: item.level,
            earnings: parseFloat(item.level_earnings).toFixed(4),
            count: item.level_count
        }));
        
        res.json({
            success: true,
            data: {
                total_earnings: parseFloat(totalEarnings[0].total_earnings).toFixed(4),
                total_count: totalEarnings[0].total_count,
                recent_earnings: parseFloat(recentEarnings[0].recent_earnings).toFixed(4),
                recent_count: recentEarnings[0].recent_count,
                today_earnings: parseFloat(todayEarnings[0].today_earnings).toFixed(4),
                earnings_by_level: formattedLevelEarnings,
                recent_records: formattedRecords,
                days_range: queryDays
            }
        });
        
    } catch (error) {
        console.error('[API] Get referral earnings error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch referral earnings',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取下级客户列表
 * GET /api/invite/referrals?wallet_address=0x...&level=1
 */
app.get('/api/invite/referrals', async (req, res) => {
    try {
        const { wallet_address, level = 1 } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        let rows = [];
        
        if (level == 1) {
            // 一级下线（直推）
            rows = await dbQuery(
                `SELECT r.wallet_address, r.created_at, 
                        COALESCE(b.total_deposit, 0) as total_deposit,
                        COALESCE(b.usdt_balance, 0) as balance
                FROM user_referrals r
                LEFT JOIN user_balances b ON r.wallet_address = b.wallet_address
                WHERE r.referrer_address = ?
                ORDER BY r.created_at DESC`,
                [walletAddr]
            );
        } else if (level == 2) {
            // 二级下线
            rows = await dbQuery(
                `SELECT r.wallet_address, r.created_at, 
                        COALESCE(b.total_deposit, 0) as total_deposit,
                        COALESCE(b.usdt_balance, 0) as balance
                FROM user_referrals r
                LEFT JOIN user_balances b ON r.wallet_address = b.wallet_address
                WHERE r.referrer_address IN (
                    SELECT wallet_address FROM user_referrals WHERE referrer_address = ?
                )
                ORDER BY r.created_at DESC`,
                [walletAddr]
            );
        } else if (level == 3) {
            // 三级下线
            rows = await dbQuery(
                `SELECT r.wallet_address, r.created_at, 
                        COALESCE(b.total_deposit, 0) as total_deposit,
                        COALESCE(b.usdt_balance, 0) as balance
                FROM user_referrals r
                LEFT JOIN user_balances b ON r.wallet_address = b.wallet_address
                WHERE r.referrer_address IN (
                    SELECT wallet_address FROM user_referrals 
                    WHERE referrer_address IN (
                        SELECT wallet_address FROM user_referrals WHERE referrer_address = ?
                    )
                )
                ORDER BY r.created_at DESC`,
                [walletAddr]
            );
        }
        
        // 隐藏钱包地址中间部分
        const sanitizedRows = rows.map(row => ({
            ...row,
            wallet_address: row.wallet_address.slice(0, 6) + '...' + row.wallet_address.slice(-4),
            total_deposit: parseFloat(row.total_deposit).toFixed(4),
            balance: parseFloat(row.balance).toFixed(4)
        }));
        
        res.json({
            success: true,
            data: sanitizedRows
        });
    } catch (error) {
        console.error('获取下级列表失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch referrals',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== 每日签到功能 ====================

// 初始化签到表（启动时自动创建）
const initCheckinTable = async () => {
    try {
        await dbQuery(`
            CREATE TABLE IF NOT EXISTS daily_checkin (
                id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
                wallet_address VARCHAR(42) NOT NULL COMMENT '钱包地址（小写）',
                checkin_date DATE NOT NULL COMMENT '签到日期',
                day_number INT(11) NOT NULL DEFAULT 1 COMMENT '连续签到天数（1-10）',
                reward_amount DECIMAL(10,4) NOT NULL DEFAULT 2.0000 COMMENT '奖励WLD数量',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                PRIMARY KEY (id),
                UNIQUE KEY uk_wallet_date (wallet_address, checkin_date),
                KEY idx_wallet_address (wallet_address),
                KEY idx_checkin_date (checkin_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日签到记录表'
        `);
        console.log('✅ 签到表初始化成功');
    } catch (error) {
        console.error('❌ 签到表初始化失败:', error.message);
    }
};

// 启动时初始化签到表
initCheckinTable();

// 修复 referral_rewards 表缺失的字段
const fixReferralRewardsTable = async () => {
    try {
        // 检查并添加 source_type 字段
        try {
            await dbQuery(`ALTER TABLE referral_rewards ADD COLUMN source_type VARCHAR(50) DEFAULT 'quantify' AFTER reward_amount`);
            console.log('✅ 添加 source_type 字段成功');
        } catch (e) {
            if (!e.message.includes('Duplicate column')) {
                console.log('source_type 字段已存在或添加失败:', e.message);
            }
        }
        
        // 检查并添加 source_id 字段
        try {
            await dbQuery(`ALTER TABLE referral_rewards ADD COLUMN source_id INT DEFAULT NULL AFTER source_type`);
            console.log('✅ 添加 source_id 字段成功');
        } catch (e) {
            if (!e.message.includes('Duplicate column')) {
                console.log('source_id 字段已存在或添加失败:', e.message);
            }
        }
        
        // 检查并添加 robot_name 字段
        try {
            await dbQuery(`ALTER TABLE referral_rewards ADD COLUMN robot_name VARCHAR(100) DEFAULT NULL AFTER source_id`);
            console.log('✅ 添加 robot_name 字段成功');
        } catch (e) {
            if (!e.message.includes('Duplicate column')) {
                console.log('robot_name 字段已存在或添加失败:', e.message);
            }
        }
        
        console.log('✅ referral_rewards 表修复完成');
    } catch (error) {
        console.error('❌ referral_rewards 表修复失败:', error.message);
    }
};

// 启动时修复表
fixReferralRewardsTable();

// 获取签到状态 API
// 注意：使用 CURDATE() 确保使用数据库时区（UTC+8）判断今天日期
app.get('/api/checkin/status', async (req, res) => {
    try {
        const { wallet } = req.query;
        
        if (!wallet) {
            return res.status(400).json({
                success: false,
                message: 'wallet parameter is required'
            });
        }
        
        const walletAddr = wallet.toLowerCase();
        
        // 使用 CURDATE() 获取数据库当前日期（UTC+8），避免时区问题
        const todayCheckin = await dbQuery(
            'SELECT *, CURDATE() as today_date FROM daily_checkin WHERE wallet_address = ? AND checkin_date = CURDATE()',
            [walletAddr]
        );
        
        // 查询用户总签到次数
        const totalCheckins = await dbQuery(
            `SELECT COUNT(*) as total FROM daily_checkin WHERE wallet_address = ?`,
            [walletAddr]
        );
        
        // 查询最近10天的签到记录
        const recentCheckins = await dbQuery(
            `SELECT checkin_date, day_number, reward_amount 
             FROM daily_checkin 
             WHERE wallet_address = ? 
             ORDER BY checkin_date DESC 
             LIMIT 10`,
            [walletAddr]
        );
        
        // 计算当前签到天数（基于总签到次数，1-10 循环）
        const totalCount = totalCheckins[0]?.total || 0;
        // 如果今天已签到，currentDay 就是最后一次签到的 day_number
        // 如果今天未签到，currentDay 就是下一次要签到的天数
        let currentDay = 1;
        if (todayCheckin.length > 0) {
            // 今天已签到，显示今天签到的天数
            currentDay = todayCheckin[0].day_number;
        } else {
            // 今天未签到，下一次签到是第几天
            currentDay = (totalCount % 10) + 1;
        }
        
        // 获取数据库当前日期（用于返回）
        const dateResult = await dbQuery('SELECT CURDATE() as today_date');
        const todayDate = dateResult[0]?.today_date;
        
        res.json({
            success: true,
            data: {
                claimedToday: todayCheckin.length > 0,
                totalCheckins: totalCount,
                currentDay: currentDay, // 当前是第几天（1-10循环）
                serverDate: todayDate, // 服务器当前日期（UTC+8）
                recentCheckins: recentCheckins.map(r => ({
                    date: new Date(r.checkin_date).toISOString().slice(0, 10),
                    dayNumber: r.day_number,
                    reward: parseFloat(r.reward_amount)
                }))
            }
        });
    } catch (error) {
        console.error('获取签到状态失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get checkin status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 执行签到 API
// 注意：使用 CURDATE() 确保使用数据库时区（UTC+8）判断今天日期
app.post('/api/checkin/claim', async (req, res) => {
    try {
        const { wallet } = req.body;
        
        if (!wallet) {
            return res.status(400).json({
                success: false,
                message: 'wallet parameter is required'
            });
        }
        
        const walletAddr = wallet.toLowerCase();
        const rewardAmount = 2.0000; // 每日签到奖励 2 WLD
        
        // 检查今天是否已签到（使用 CURDATE() 确保时区正确）
        const existingCheckin = await dbQuery(
            'SELECT * FROM daily_checkin WHERE wallet_address = ? AND checkin_date = CURDATE()',
            [walletAddr]
        );
        
        if (existingCheckin.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Already claimed today',
                data: {
                    claimedToday: true,
                    dayNumber: existingCheckin[0].day_number
                }
            });
        }
        
        // 查询用户总签到次数，计算今天的天数（1-10 循环）
        const totalCheckins = await dbQuery(
            `SELECT COUNT(*) as total FROM daily_checkin WHERE wallet_address = ?`,
            [walletAddr]
        );
        
        // 计算今天签到是第几天（基于总签到次数，1-10 循环）
        const totalCount = totalCheckins[0]?.total || 0;
        const dayNumber = (totalCount % 10) + 1;
        
        // 插入签到记录（使用 CURDATE() 确保日期正确）
        await dbQuery(
            `INSERT INTO daily_checkin (wallet_address, checkin_date, day_number, reward_amount) 
             VALUES (?, CURDATE(), ?, ?)`,
            [walletAddr, dayNumber, rewardAmount]
        );
        
        // 更新用户 WLD 余额
        // 先检查用户余额记录是否存在
        const userBalance = await dbQuery(
            'SELECT * FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (userBalance.length === 0) {
            // 创建新的余额记录
            await dbQuery(
                `INSERT INTO user_balances (wallet_address, wld_balance) VALUES (?, ?)`,
                [walletAddr, rewardAmount]
            );
        } else {
            // 更新现有余额
            await dbQuery(
                `UPDATE user_balances SET wld_balance = wld_balance + ? WHERE wallet_address = ?`,
                [rewardAmount, walletAddr]
            );
        }
        
        // 获取更新后的余额
        const updatedBalance = await dbQuery(
            'SELECT wld_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        res.json({
            success: true,
            message: 'Checkin successful',
            data: {
                dayNumber: dayNumber,
                reward: rewardAmount,
                newWldBalance: updatedBalance.length > 0 ? parseFloat(updatedBalance[0].wld_balance) : rewardAmount
            }
        });
    } catch (error) {
        console.error('签到失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Checkin failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取用户经纪人等级和每日可兑换 WLD 数量
 * GET /api/user/level?wallet=0x...
 * 
 * 等级规则：
 * 0级：普通用户，不能兑换 WLD
 * 1级：直推5人(>=100U机器人)，团队业绩>1000U，每日可兑换 1 WLD
 * 2级：直推10人，含2名1级，团队业绩>5000U，每日可兑换 2 WLD
 * 3级：直推20人，含2名2级，团队业绩>20000U，每日可兑换 3 WLD
 * 4级：直推30人，含2名3级，团队业绩>80000U，每日可兑换 5 WLD
 * 5级：直推50人，含2名4级，团队业绩>200000U，每日可兑换 10 WLD
 */
app.get('/api/user/level', async (req, res) => {
    try {
        const { wallet } = req.query;
        
        if (!wallet) {
            return res.status(400).json({
                success: false,
                message: 'wallet parameter is required'
            });
        }
        
        const walletAddr = wallet.toLowerCase();
        
        // 使用完整的等级计算函数（包含下级经纪人检查）
        const level = await calculateUserLevel(walletAddr);
        
        // 根据等级设置每日WLD兑换限额
        const dailyWldLimitMap = {
            0: 0,
            1: 1,
            2: 2,
            3: 3,
            4: 5,
            5: 10
        };
        const dailyWldLimit = dailyWldLimitMap[level] || 0;
        
        // 获取今日已兑换的 WLD 数量
        const todayExchanged = await dbQuery(
            `SELECT COALESCE(SUM(wld_amount), 0) as total
             FROM wld_exchange_records
             WHERE wallet_address = ? AND DATE(created_at) = CURDATE() AND direction = 'wld_to_usdt'`,
            [walletAddr]
        );
        
        const exchangedToday = parseFloat(todayExchanged[0]?.total) || 0;
        
        // 获取直推人数和团队业绩（用于前端显示）
        // 合格成员门槛：购买 >= MIN_ROBOT_PURCHASE 机器人（Coinbase 100U）
        const directReferrals = await dbQuery(
            `SELECT COUNT(DISTINCT r.wallet_address) as count
             FROM user_referrals r
             INNER JOIN robot_purchases rp ON r.wallet_address = rp.wallet_address
             WHERE r.referrer_address = ? AND rp.price >= ? AND rp.status = 'active'`,
            [walletAddr, MIN_ROBOT_PURCHASE]
        );

        const directCount = parseInt(directReferrals[0]?.count) || 0;

        // 团队业绩：8级深度，且只计入合格机器人（>= MIN_ROBOT_PURCHASE，且 active）
        let allTeamWallets = [];
        let currentLevelWallets = [walletAddr];
        for (let depth = 1; depth <= 8; depth++) {
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

        let totalPerformance = 0;
        if (allTeamWallets.length > 0) {
            const placeholders = allTeamWallets.map(() => '?').join(',');
            const performanceResult = await dbQuery(
                `SELECT COALESCE(SUM(price), 0) as total
                 FROM robot_purchases
                 WHERE wallet_address IN (${placeholders})
                 AND status = 'active'
                 AND price >= ?`,
                [...allTeamWallets, MIN_ROBOT_PURCHASE]
            );
            totalPerformance = parseFloat(performanceResult[0]?.total) || 0;
        }
        
        // 获取下级经纪人统计（可选，用于前端显示升级进度）
        const subBrokers = await getSubBrokerStats(walletAddr);
        
        res.json({
            success: true,
            data: {
                level: level,
                levelName: getLevelName(level),
                dailyWldLimit: dailyWldLimit,
                exchangedToday: exchangedToday,
                remainingToday: Math.max(0, dailyWldLimit - exchangedToday),
                directReferrals: directCount,
                teamPerformance: totalPerformance.toFixed(4),
                subBrokers: subBrokers // 下级经纪人统计
            }
        });
    } catch (error) {
        console.error('获取用户等级失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get user level',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 获取等级名称
function getLevelName(level) {
    const names = {
        0: 'Regular User',
        1: 'Level 1 Broker',
        2: 'Level 2 Broker',
        3: 'Level 3 Broker',
        4: 'Level 4 Broker',
        5: 'Level 5 Broker'
    };
    return names[level] || 'Regular User';
}

/**
 * 计算用户的经纪人等级（完整版，包含下级经纪人检查）
 * 严格按照文档要求执行
 * 
 * @param {string} walletAddr - 用户钱包地址（小写）
 * @param {Set} visitedAddresses - 已访问的地址集合（防止循环引用）
 * @returns {Promise<number>} 用户等级 (0-5)
 */
async function calculateUserLevel(walletAddr, visitedAddresses = new Set()) {
    try {
        // 防止循环引用
        if (visitedAddresses.has(walletAddr)) {
            return 0;
        }
        visitedAddresses.add(walletAddr);
        
        // 1. 获取直推人数（购买了 >= MIN_ROBOT_PURCHASE 的合格机器人）
        const directReferrals = await dbQuery(
            `SELECT COUNT(DISTINCT r.wallet_address) as count
             FROM user_referrals r
             INNER JOIN robot_purchases rp ON r.wallet_address = rp.wallet_address
             WHERE r.referrer_address = ? AND rp.price >= ? AND rp.status = 'active'`,
            [walletAddr, MIN_ROBOT_PURCHASE]
        );
        
        const directCount = parseInt(directReferrals[0]?.count) || 0;
        
        // 如果直推人数不足5人，直接返回0级
        if (directCount < 5) {
            return 0;
        }
        
        // 2. 获取团队总业绩（所有层级下线的机器人购买总额，最多8级）
        // 使用递归查询获取所有团队成员
        let allTeamWallets = [];
        let currentLevelWallets = [walletAddr];
        
        // 逐级获取团队成员（最多8级）
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
        
        // 统计所有团队成员的充值总额（团队业绩 = 团队总充值）
        let totalPerformance = 0;
        if (allTeamWallets.length > 0) {
            const teamPlaceholders = allTeamWallets.map(() => '?').join(',');
            const performanceResult = await dbQuery(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM deposit_records
                 WHERE wallet_address IN (${teamPlaceholders}) AND status = 'completed'`,
                allTeamWallets
            );
            totalPerformance = parseFloat(performanceResult[0]?.total) || 0;
        }
        
        // 如果团队业绩不满足 1级基本要求，直接返回0级（>1000）
        if (totalPerformance <= 1000) {
            return 0;
        }
        
        // 3. 获取下级经纪人统计（递归计算每个直推成员的等级）
        const subBrokerStats = await getSubBrokerStats(walletAddr, visitedAddresses);
        
        // #region agent log
        const logCalcLevel = {location:'server.js:4619',message:'calculateUserLevel - checking conditions',data:{wallet:walletAddr.slice(0,10),directCount,totalPerformance:totalPerformance.toFixed(4),subBrokers:subBrokerStats},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'};await fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logCalcLevel)}).catch(()=>{});
        // #endregion
        
        // 4. 从高到低判断等级
        // 5级：直推50人，含2名4级，团队业绩>200000U
        if (directCount >= 50 && totalPerformance > 200000 && subBrokerStats.level4 >= 2) {
            return 5;
        }
        
        // 4级：直推30人，含2名3级，团队业绩>80000U
        if (directCount >= 30 && totalPerformance > 80000 && subBrokerStats.level3 >= 2) {
            return 4;
        }
        
        // 3级：直推20人，含2名2级，团队业绩>20000U
        if (directCount >= 20 && totalPerformance > 20000 && subBrokerStats.level2 >= 2) {
            return 3;
        }
        
        // 2级：直推10人，含2名1级，团队业绩>5000U
        if (directCount >= 10 && totalPerformance > 5000 && subBrokerStats.level1 >= 2) {
            // #region agent log
            const logL2 = {location:'server.js:4638',message:'Level 2 MATCHED',data:{wallet:walletAddr.slice(0,10),directCount,totalPerformance:totalPerformance.toFixed(4),level1SubBrokers:subBrokerStats.level1,returnLevel:2},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'};await fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logL2)}).catch(()=>{});
            // #endregion
            return 2;
        }
        
        // 1级：直推5人，团队业绩>1000U（无下级经纪人要求）
        if (directCount >= 5 && totalPerformance > 1000) {
            // #region agent log
            const logL1 = {location:'server.js:4643',message:'Level 1 MATCHED',data:{wallet:walletAddr.slice(0,10),directCount,totalPerformance:totalPerformance.toFixed(4),returnLevel:1},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'};await fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logL1)}).catch(()=>{});
            // #endregion
            return 1;
        }
        
        // #region agent log
        const logL0 = {location:'server.js:4651',message:'Level 0 (default)',data:{wallet:walletAddr.slice(0,10),directCount,totalPerformance:totalPerformance.toFixed(4),returnLevel:0},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'};await fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logL0)}).catch(()=>{});
        // #endregion
        return 0;
    } catch (error) {
        console.error(`[calculateUserLevel] Error for ${walletAddr}:`, error.message);
        return 0;
    }
}

/**
 * 获取用户的下级经纪人统计
 * 统计直推成员中各等级经纪人的数量
 * 
 * @param {string} walletAddr - 用户钱包地址（小写）
 * @param {Set} visitedAddresses - 已访问的地址集合（防止循环引用）
 * @returns {Promise<Object>} 下级经纪人统计 { level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 }
 */
async function getSubBrokerStats(walletAddr, visitedAddresses = new Set()) {
    try {
        const stats = {
            level1: 0,
            level2: 0,
            level3: 0,
            level4: 0,
            level5: 0
        };
        
        // 获取所有直推成员（购买了 >= MIN_ROBOT_PURCHASE 的合格机器人）
        const directMembers = await dbQuery(
            `SELECT DISTINCT r.wallet_address
             FROM user_referrals r
             INNER JOIN robot_purchases rp ON r.wallet_address = rp.wallet_address
             WHERE r.referrer_address = ? AND rp.price >= ? AND rp.status = 'active'`,
            [walletAddr, MIN_ROBOT_PURCHASE]
        );
        
        // 逐个计算每个直推成员的等级
        for (const member of directMembers) {
            const memberAddr = member.wallet_address;
            
            // 防止循环引用
            if (visitedAddresses.has(memberAddr)) {
                continue;
            }
            
            // 递归计算成员等级
            const memberLevel = await calculateUserLevel(memberAddr, new Set(visitedAddresses));
            
            // 统计各等级数量
            if (memberLevel === 1) {
                stats.level1++;
            } else if (memberLevel === 2) {
                stats.level2++;
            } else if (memberLevel === 3) {
                stats.level3++;
            } else if (memberLevel === 4) {
                stats.level4++;
            } else if (memberLevel === 5) {
                stats.level5++;
            }
        }
        
        return stats;
    } catch (error) {
        console.error(`[getSubBrokerStats] Error for ${walletAddr}:`, error.message);
        return {
            level1: 0,
            level2: 0,
            level3: 0,
            level4: 0,
            level5: 0
        };
    }
}

/**
 * WLD 与 USDT 兑换 API
 * POST /api/exchange
 * body: { wallet, direction, amount }
 * direction: 'wld_to_usdt' 或 'usdt_to_wld'
 */
app.post('/api/exchange', sensitiveLimiter, async (req, res) => {
    try {
        const { wallet, direction, amount } = req.body;
        
        if (!wallet || !direction || !amount) {
            return res.status(400).json({
                success: false,
                message: 'wallet, direction and amount are required'
            });
        }
        
        const walletAddr = wallet.toLowerCase();
        const exchangeAmount = parseFloat(amount);
        
        if (isNaN(exchangeAmount) || exchangeAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount'
            });
        }
        
        // 获取 WLD 当前价格（使用内置 https 模块，更可靠）
        let wldPrice = 0.58; // 默认价格（基于当前市场价）
        try {
            const https = require('https');
            const priceData = await new Promise((resolve, reject) => {
                const req = https.get('https://api.binance.com/api/v3/ticker/price?symbol=WLDUSDT', {
                    timeout: 5000
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(e);
                        }
                    });
                });
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });
            });
            
            if (priceData && priceData.price) {
                wldPrice = parseFloat(priceData.price);
                console.log('[Exchange] WLD price from Binance:', wldPrice);
            }
        } catch (e) {
            console.log('[Exchange] 币安API获取价格失败，使用默认价格:', wldPrice, '错误:', e.message);
        }
        
        // 获取用户余额
        const userBalance = await dbQuery(
            'SELECT usdt_balance, wld_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (userBalance.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const usdtBalance = parseFloat(userBalance[0].usdt_balance);
        const wldBalance = parseFloat(userBalance[0].wld_balance);
        
        if (direction === 'wld_to_usdt') {
            // WLD 换 USDT - 需要检查等级限制
            
            // 使用完整的等级计算函数（包含下级经纪人检查）
            const userLevel = await calculateUserLevel(walletAddr);
            
            // 根据等级设置每日WLD兑换限额
            const dailyWldLimitMap = {
                0: 0,
                1: 1,
                2: 2,
                3: 3,
                4: 5,
                5: 10
            };
            const dailyWldLimit = dailyWldLimitMap[userLevel] || 0;
            
            if (dailyWldLimit === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'You need to reach Level 1 Broker to exchange WLD to USDT. Requirements: Invite 5 members with >=100U robots, team performance >=1000U'
                });
            }
            
            // 检查今日已兑换数量
            const todayExchanged = await dbQuery(
                `SELECT COALESCE(SUM(wld_amount), 0) as total
                 FROM wld_exchange_records
                 WHERE wallet_address = ? AND DATE(created_at) = CURDATE() AND direction = 'wld_to_usdt'`,
                [walletAddr]
            );
            
            const exchangedToday = parseFloat(todayExchanged[0]?.total) || 0;
            const remaining = dailyWldLimit - exchangedToday;
            
            if (exchangeAmount > remaining) {
                return res.status(400).json({
                    success: false,
                    message: `Daily limit exceeded. You can only exchange ${remaining.toFixed(4)} WLD today.`
                });
            }
            
            // 检查 WLD 余额
            if (exchangeAmount > wldBalance) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient WLD balance'
                });
            }
            
            // 计算获得的 USDT
            const usdtReceived = exchangeAmount * wldPrice;
            
            // 更新余额
            await dbQuery(
                `UPDATE user_balances 
                 SET wld_balance = wld_balance - ?, usdt_balance = usdt_balance + ?
                 WHERE wallet_address = ?`,
                [exchangeAmount, usdtReceived, walletAddr]
            );
            
            // 记录兑换
            await dbQuery(
                `INSERT INTO wld_exchange_records (wallet_address, direction, wld_amount, usdt_amount, price, created_at)
                 VALUES (?, 'wld_to_usdt', ?, ?, ?, NOW())`,
                [walletAddr, exchangeAmount, usdtReceived, wldPrice]
            );
            
            // 获取更新后的余额
            const newBalance = await dbQuery(
                'SELECT usdt_balance, wld_balance FROM user_balances WHERE wallet_address = ?',
                [walletAddr]
            );
            
            res.json({
                success: true,
                message: 'Exchange successful',
                data: {
                    direction: 'wld_to_usdt',
                    wldAmount: exchangeAmount.toFixed(4),
                    usdtAmount: usdtReceived.toFixed(4),
                    price: wldPrice.toFixed(4),
                    newUsdtBalance: parseFloat(newBalance[0].usdt_balance).toFixed(4),
                    newWldBalance: parseFloat(newBalance[0].wld_balance).toFixed(4)
                }
            });
            
        } else if (direction === 'usdt_to_wld') {
            // USDT 换 WLD - 无限制
            
            // 检查 USDT 余额
            if (exchangeAmount > usdtBalance) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient USDT balance'
                });
            }
            
            // 计算获得的 WLD
            const wldReceived = exchangeAmount / wldPrice;
            
            console.log('[Exchange] USDT to WLD:', {
                exchangeAmount,
                wldPrice,
                wldReceived,
                formula: `${exchangeAmount} / ${wldPrice} = ${wldReceived}`
            });
            
            // 更新余额
            await dbQuery(
                `UPDATE user_balances 
                 SET usdt_balance = usdt_balance - ?, wld_balance = wld_balance + ?
                 WHERE wallet_address = ?`,
                [exchangeAmount, wldReceived, walletAddr]
            );
            
            // 记录兑换
            await dbQuery(
                `INSERT INTO wld_exchange_records (wallet_address, direction, wld_amount, usdt_amount, price, created_at)
                 VALUES (?, 'usdt_to_wld', ?, ?, ?, NOW())`,
                [walletAddr, wldReceived, exchangeAmount, wldPrice]
            );
            
            // 获取更新后的余额
            const newBalance = await dbQuery(
                'SELECT usdt_balance, wld_balance FROM user_balances WHERE wallet_address = ?',
                [walletAddr]
            );
            
            res.json({
                success: true,
                message: 'Exchange successful',
                data: {
                    direction: 'usdt_to_wld',
                    usdtAmount: exchangeAmount.toFixed(4),
                    wldAmount: wldReceived.toFixed(4),
                    price: wldPrice.toFixed(4),
                    newUsdtBalance: parseFloat(newBalance[0].usdt_balance).toFixed(4),
                    newWldBalance: parseFloat(newBalance[0].wld_balance).toFixed(4)
                }
            });
            
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid direction. Use wld_to_usdt or usdt_to_wld'
            });
        }
        
    } catch (error) {
        console.error('兑换失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Exchange failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取充值历史记录
 * GET /api/deposit/history?wallet_address=0x...&limit=20
 */
app.get('/api/deposit/history', async (req, res) => {
    try {
        const { wallet_address, limit = 20 } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address parameter is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 查询充值记录
        const records = await dbQuery(
            `SELECT id, wallet_address, amount, token, tx_hash, status, created_at, completed_at
             FROM deposit_records 
             WHERE wallet_address = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [walletAddr, parseInt(limit)]
        );
        
        res.json({
            success: true,
            data: records
        });
    } catch (error) {
        console.error('获取充值记录失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get deposit history',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取提现历史记录
 * GET /api/withdraw/history?wallet_address=0x...&limit=20
 */
app.get('/api/withdraw/history', async (req, res) => {
    try {
        const { wallet_address, limit = 20 } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address parameter is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 查询提现记录（包含手续费详情）
        const records = await dbQuery(
            `SELECT id, wallet_address, to_address, amount, fee, actual_amount, token, tx_hash, status, created_at, completed_at
             FROM withdraw_records 
             WHERE wallet_address = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [walletAddr, parseInt(limit)]
        );
        
        res.json({
            success: true,
            data: records
        });
    } catch (error) {
        console.error('获取提现记录失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get withdraw history',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取兑换历史记录
 * GET /api/exchange/history?wallet_address=0x...&limit=20
 */
app.get('/api/exchange/history', async (req, res) => {
    try {
        const { wallet_address, limit = 20 } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address parameter is required'
            });
        }
        
        const walletAddr = wallet_address.toLowerCase();
        
        // 查询兑换记录
        const records = await dbQuery(
            `SELECT id, wallet_address, direction, wld_amount, usdt_amount, price, created_at
             FROM wld_exchange_records 
             WHERE wallet_address = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [walletAddr, parseInt(limit)]
        );
        
        res.json({
            success: true,
            data: records
        });
    } catch (error) {
        console.error('获取兑换记录失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get exchange history',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 获取签到记录 API
app.get('/api/checkin/records', async (req, res) => {
    try {
        const { wallet } = req.query;
        
        if (!wallet) {
            return res.status(400).json({
                success: false,
                message: 'wallet parameter is required'
            });
        }
        
        const walletAddr = wallet.toLowerCase();
        
        // 查询签到记录（最近20条）
        const records = await dbQuery(
            `SELECT id, wallet_address, checkin_date, day_number, reward_amount, created_at 
             FROM daily_checkin 
             WHERE wallet_address = ? 
             ORDER BY created_at DESC 
             LIMIT 20`,
            [walletAddr]
        );
        
        res.json({
            success: true,
            data: records
        });
    } catch (error) {
        console.error('获取签到记录失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get checkin records',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取所有机器人购买总额（包含模拟金额）
 * GET /api/platform/total-investments
 * 
 * 返回：模拟金额 + 真实用户投资
 */
app.get('/api/platform/total-investments', async (req, res) => {
    try {
        // 获取Follow页面总金额（模拟+真实）
        const followResult = await getPageTotalAmount('follow');
        
        // 获取Robot页面总金额（模拟+真实）
        const robotResult = await getPageTotalAmount('robot');
        
        if (!followResult.success || !robotResult.success) {
            throw new Error('获取页面总金额失败');
        }
        
        res.json({
            success: true,
            data: {
                // Follow页面
                follow_page_total: followResult.data.total_amount,
                follow_simulated: followResult.data.total_simulated,
                follow_real: followResult.data.real_user_investment,
                
                // Robot页面
                robot_page_total: robotResult.data.total_amount,
                robot_simulated: robotResult.data.total_simulated,
                robot_real: robotResult.data.real_user_investment,
                
                // 详细信息
                breakdown: {
                    follow: {
                        total: followResult.data.total_amount,
                        simulated_base: followResult.data.simulated_base,
                        simulated_growth: followResult.data.simulated_growth,
                        real_user: followResult.data.real_user_investment
                    },
                    robot: {
                        total: robotResult.data.total_amount,
                        simulated_base: robotResult.data.simulated_base,
                        simulated_growth: robotResult.data.simulated_growth,
                        real_user: robotResult.data.real_user_investment
                    }
                }
            }
        });
    } catch (error) {
        console.error('[API] Get total investments error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch total investments',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== 质押系统 API ====================

// 初始化质押表（服务启动时执行）
(async () => {
    try {
        // 创建质押产品表
        await dbQuery(`
            CREATE TABLE IF NOT EXISTS pledge_products (
                id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
                name VARCHAR(50) NOT NULL COMMENT '产品名称',
                amount DECIMAL(18,2) NOT NULL COMMENT '质押金额(WLD)',
                income DECIMAL(18,2) NOT NULL COMMENT '总收益(WLD)',
                cycle INT(11) NOT NULL COMMENT '运行周期(天)',
                daily_rate DECIMAL(10,6) NOT NULL COMMENT '日收益率',
                max_pieces INT(11) NOT NULL DEFAULT 100 COMMENT '最大持有数量',
                status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态: 1启用 0禁用',
                sort_order INT(11) NOT NULL DEFAULT 0 COMMENT '排序',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='质押产品表'
        `);

        // 创建用户质押记录表
        await dbQuery(`
            CREATE TABLE IF NOT EXISTS user_pledges (
                id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
                wallet_address VARCHAR(42) NOT NULL COMMENT '钱包地址',
                product_id INT(11) UNSIGNED NOT NULL COMMENT '产品ID',
                product_name VARCHAR(50) NOT NULL COMMENT '产品名称',
                amount DECIMAL(18,2) NOT NULL COMMENT '质押金额(WLD)',
                total_income DECIMAL(18,2) NOT NULL COMMENT '预期总收益(WLD)',
                daily_income DECIMAL(18,6) NOT NULL COMMENT '每日收益(WLD)',
                earned_income DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT '已获收益(WLD)',
                cycle INT(11) NOT NULL COMMENT '周期(天)',
                status ENUM('active', 'completed', 'cancelled') NOT NULL DEFAULT 'active' COMMENT '状态',
                start_date DATE NOT NULL COMMENT '开始日期',
                end_date DATE NOT NULL COMMENT '结束日期',
                last_earn_date DATE DEFAULT NULL COMMENT '上次收益发放日期',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_wallet (wallet_address),
                KEY idx_status (status),
                KEY idx_end_date (end_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户质押记录表'
        `);

        // 检查是否需要插入默认产品
        const products = await dbQuery('SELECT COUNT(*) as count FROM pledge_products');
        if (products[0].count === 0) {
            await dbQuery(`
                INSERT INTO pledge_products (name, amount, income, cycle, daily_rate, max_pieces, sort_order) VALUES
                ('WLD-01', 100, 730, 365, 2.0000, 100, 1),
                ('WLD-02', 1000, 3650, 365, 1.0000, 50, 2),
                ('WLD-03', 10000, 54750, 365, 1.5000, 50, 3)
            `);
            console.log('[DB] 质押产品初始化完成');
        }
        console.log('[DB] 质押表初始化完成');
    } catch (error) {
        console.error('[DB] 初始化质押表失败:', error.message);
    }
})();

// 获取质押产品列表
app.get('/api/pledge/products', async (req, res) => {
    try {
        const products = await dbQuery(`
            SELECT id, name, amount, income, cycle, daily_rate, max_pieces
            FROM pledge_products 
            WHERE status = 1 
            ORDER BY sort_order ASC
        `);
        
        res.json({
            success: true,
            data: products
        });
    } catch (error) {
        console.error('[API] Get pledge products error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pledge products'
        });
    }
});

// 创建质押
app.post('/api/pledge/create', sensitiveLimiter, async (req, res) => {
    try {
        const { wallet_address, product_id } = req.body;
        
        // 验证钱包地址
        if (!wallet_address || !isValidWalletAddress(wallet_address)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // 验证产品ID
        if (!product_id || isNaN(product_id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }
        
        // 获取产品信息
        const products = await dbQuery(
            'SELECT * FROM pledge_products WHERE id = ? AND status = 1',
            [product_id]
        );
        
        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        const product = products[0];
        
        // 检查用户该产品的持有数量
        const userPledges = await dbQuery(
            'SELECT COUNT(*) as count FROM user_pledges WHERE wallet_address = ? AND product_id = ? AND status = "active"',
            [walletAddr, product_id]
        );
        
        if (userPledges[0].count >= product.max_pieces) {
            return res.status(400).json({
                success: false,
                message: `已达到该产品最大持有数量 ${product.max_pieces} 个`
            });
        }
        
        // 获取用户WLD余额
        const balances = await dbQuery(
            'SELECT wld_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        if (balances.length === 0 || parseFloat(balances[0].wld_balance) < parseFloat(product.amount)) {
            return res.status(400).json({
                success: false,
                message: 'WLD余额不足'
            });
        }
        
        // 计算每日收益
        const dailyIncome = parseFloat(product.income) / parseFloat(product.cycle);
        
        // 计算开始和结束日期
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + parseInt(product.cycle));
        
        // 扣除WLD余额
        await dbQuery(
            'UPDATE user_balances SET wld_balance = wld_balance - ? WHERE wallet_address = ?',
            [product.amount, walletAddr]
        );
        
        // 创建质押记录
        const result = await dbQuery(
            `INSERT INTO user_pledges 
            (wallet_address, product_id, product_name, amount, total_income, daily_income, cycle, start_date, end_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                walletAddr,
                product.id,
                product.name,
                product.amount,
                product.income,
                dailyIncome,
                product.cycle,
                startDate.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0]
            ]
        );
        
        secureLog('质押创建成功', { wallet_address: walletAddr, product: product.name, amount: product.amount });
        
        res.json({
            success: true,
            message: '质押成功',
            data: {
                pledge_id: result.insertId,
                product_name: product.name,
                amount: product.amount,
                total_income: product.income,
                daily_income: dailyIncome.toFixed(6),
                start_date: startDate.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0]
            }
        });
    } catch (error) {
        console.error('[API] Create pledge error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to create pledge'
        });
    }
});

// 获取我的活跃质押
app.get('/api/pledge/my', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address || !isValidWalletAddress(wallet_address)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        const pledges = await dbQuery(`
            SELECT 
                id, product_id, product_name, amount, total_income, daily_income,
                earned_income, cycle, status, start_date, end_date,
                DATEDIFF(end_date, CURDATE()) as remaining_days,
                created_at
            FROM user_pledges 
            WHERE wallet_address = ? AND status = 'active'
            ORDER BY created_at DESC
        `, [walletAddr]);
        
        res.json({
            success: true,
            data: pledges
        });
    } catch (error) {
        console.error('[API] Get my pledges error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pledges'
        });
    }
});

// 获取已过期/已完成的质押
app.get('/api/pledge/expired', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address || !isValidWalletAddress(wallet_address)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // 首先更新已到期但状态仍为active的质押
        await dbQuery(`
            UPDATE user_pledges 
            SET status = 'completed' 
            WHERE wallet_address = ? AND status = 'active' AND end_date < CURDATE()
        `, [walletAddr]);
        
        const pledges = await dbQuery(`
            SELECT 
                id, product_id, product_name, amount, total_income, daily_income,
                earned_income, cycle, status, start_date, end_date, created_at
            FROM user_pledges 
            WHERE wallet_address = ? AND status IN ('completed', 'cancelled')
            ORDER BY end_date DESC
        `, [walletAddr]);
        
        res.json({
            success: true,
            data: pledges
        });
    } catch (error) {
        console.error('[API] Get expired pledges error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch expired pledges'
        });
    }
});

// 质押统计
app.get('/api/pledge/stats', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address || !isValidWalletAddress(wallet_address)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        const stats = await dbQuery(`
            SELECT 
                COUNT(*) as total_pledges,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_pledges,
                SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END) as total_staked,
                SUM(earned_income) as total_earned
            FROM user_pledges 
            WHERE wallet_address = ?
        `, [walletAddr]);
        
        res.json({
            success: true,
            data: {
                total_pledges: stats[0].total_pledges || 0,
                active_pledges: stats[0].active_pledges || 0,
                total_staked: parseFloat(stats[0].total_staked || 0).toFixed(2),
                total_earned: parseFloat(stats[0].total_earned || 0).toFixed(6)
            }
        });
    } catch (error) {
        console.error('[API] Get pledge stats error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pledge stats'
        });
    }
});

// ==================== 错误日志 API ====================

/**
 * 前端错误上报
 * POST /api/error-log
 */
app.post('/api/error-log', async (req, res) => {
    try {
        const {
            level,
            type,
            message,
            stack,
            filePath,
            lineNumber,
            columnNumber,
            userAgent,
            url,
            walletAddress,
            additionalData
        } = req.body;

        const errorId = await logError({
            level: level || ErrorLevel.ERROR,
            source: ErrorSource.FRONTEND,
            type: type || 'FrontendError',
            message: message || 'Unknown frontend error',
            stack,
            requestUrl: url,
            userAgent: userAgent || req.headers['user-agent'],
            ipAddress: req.ip || req.connection?.remoteAddress,
            walletAddress,
            filePath,
            lineNumber,
            columnNumber,
            additionalData
        });

        res.json({
            success: true,
            message: 'Error logged',
            errorId
        });
    } catch (error) {
        console.error('记录前端错误失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to log error'
        });
    }
});

// ==================== 抽奖转盘路由 ====================
app.use('/api/lucky-wheel', luckyWheelRoutes);

// ==================== 管理系统路由 ====================
app.use('/api/admin', adminRoutes);

// 404 处理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// 错误日志中间件
app.use(errorLoggerMiddleware);

// 错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 VituFinance API Server running on port ${PORT}`);
    console.log(`🌐 Frontend URL: https://vitufinance.com/`);

    // 初始化 BSC Provider（用于自动转账功能）
    const bscInitialized = initializeBSCProvider();
    if (bscInitialized) {
        console.log('✓ BSC 自动转账功能已启用');
    } else {
        console.warn('⚠️ BSC 自动转账功能未启用或配置不完整');
    }

    // 启动机器人到期处理定时任务（每60分钟执行一次）
    const cronJob = startCronJob(60);
    console.log('[Cron] 机器人到期处理定时任务已启动（每60分钟）');

    // 启动团队经纪人每日分红定时任务（每天凌晨1点执行）
    startTeamDividendCron(1, 0);
    console.log('[TeamCron] 团队经纪人每日分红定时任务已启动（每天01:00）');

    // 启动充值监控服务（每60秒检查一次区块链上的新充值）
    startDepositMonitor();
    console.log('[DepositMonitor] 充值自动监控服务已启动（每60秒扫描一次）');
    
    // 启动模拟金额自动增长服务（每10秒增长一次）
    startSimulatedGrowthCron();
    console.log('[SimulatedGrowth] 模拟金额自动增长服务已启动（每10秒增长一次）');

    // 启动经纪人等级计算和分红服务
    setBrokerDbQuery(dbQuery);
    startBrokerLevelCron();
    console.log('[BrokerLevel] 经纪人等级服务已启动（每小时计算等级，每日/月发放分红）');

    // 优雅关闭处理
    process.on('SIGTERM', () => {
        console.log('[Server] 收到 SIGTERM 信号，正在关闭...');
        cronJob.stop();
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log('[Server] 收到 SIGINT 信号，正在关闭...');
        cronJob.stop();
        process.exit(0);
    });
});
