/**
 * ============================================================================
 * 机器人路由模块 - 修复版本（ES Module）
 * ============================================================================
 * 
 * 核心修复：
 * 1. 所有时间计算改为小时精度，使用 DATETIME 类型
 * 2. 使用 NOW() 替代 CURDATE() 进行时间比较
 * 3. 统一使用 robotConfig.js 中的配置
 * 4. 修复到期判断逻辑
 * 
 * 使用方法：
 * 在 server.js 中添加：
 * import { router as robotRoutes, setDbQuery as setRobotDbQuery } from './src/routes/robotRoutes.js';
 * setRobotDbQuery(dbQuery);
 * app.use(robotRoutes);
 */

import express from 'express';
const router = express.Router();

// ✅ 导入安全中间件（速率限制）
import { sensitiveLimiter, quantifyLimiter } from '../middleware/security.js';

// 导入推荐奖励数学工具（统一管理奖励比例）
// 2024-12-23: 使用业务文档中的正确比例
import {
    CEX_REFERRAL_RATES,            // CEX 8级奖励比例 [0.30, 0.10, 0.05, 0.01×5] = 50%
    DEX_REFERRAL_RATES,            // DEX 3级奖励比例 [0.05, 0.03, 0.02] = 10%
    calculateLevelReward,          // 单级奖励计算: amount * rate (含安全上限500U)
    calculateCexRewards,           // CEX完整奖励计算
    calculateDexRewards,           // DEX完整奖励计算
    formatAmount                   // 格式化金额显示
} from '../utils/referralMath.js';

// 导入精确数学计算模块（解决浮点精度问题）
import {
    add,
    subtract,
    multiply,
    divide,
    percentage,
    calculateEquity,
    calculateAllLevelRewards,
    REWARD_RATES,
    BROKER_LEVELS,
    calculateBrokerLevel
} from '../utils/precisionMath.js';

// 导入高级数学算法（用于复杂场景分析）
import {
    CEX_RATES,                     // CEX奖励比例常量
    DEX_RATES,                     // DEX奖励比例常量
    ReferralGraph,                 // 推荐网络图分析类
    calculateTreeRewards,          // 递归树计算奖励
    batchCalculateRewards,         // 批量矩阵计算
    deriveFormulas                 // 数学公式推导
} from '../utils/referralAdvancedMath.js';

// 导入机器人配置
import {
    getRobotConfig,
    calculateEndTime,
    calculateQuantifyEarnings,
    calculateHighRobotReturn,
    checkQuantifyStatus,
    isRobotExpired,
    getRobotList,
    hoursToDays,
    SAFETY_LIMITS
} from '../config/robotConfig.js';

// Balance helpers (prevents “expired but not refunded” edge cases)
import {
    normalizeWalletAddress as normalizeWalletLower,
    creditUsdtBalance,
    ensureUserBalanceRow
} from '../utils/userBalanceUtils.js';

// 团队分红：达标后随时自动发放（当日一次）
import { MIN_ROBOT_PURCHASE, processUplineDailyDividends } from '../cron/teamDividendCron.js';

/**
 * 数据库查询函数（需要在 server.js 中设置）
 * @type {Function}
 */
let dbQuery = null;

/**
 * 设置数据库查询函数
 * @param {Function} queryFn - 数据库查询函数
 */
function setDbQuery(queryFn) {
    dbQuery = queryFn;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 验证钱包地址格式
 * @param {string} address - 钱包地址
 * @returns {boolean} 是否有效
 */
function isValidWalletAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

/**
 * 标准化钱包地址（转小写）
 * @param {string} address - 钱包地址
 * @returns {string} 标准化后的地址
 */
function normalizeWalletAddress(address) {
    return address.toLowerCase();
}

/**
 * 格式化日期时间为 MySQL DATETIME 格式（使用本地时区）
 * @param {Date} date - 日期对象
 * @returns {string} YYYY-MM-DD HH:MM:SS（本地时间）
 */
function formatDateTime(date) {
    // Use local timezone instead of UTC to match server database timezone
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// ============================================================================
// 机器人配置 API
// ============================================================================

/**
 * 获取所有机器人配置列表
 * GET /api/robot/configs
 * 
 * 返回所有可用的机器人配置信息，包括CEX、DEX、Grid、High四种类型
 */
router.get('/api/robot/configs', async (req, res) => {
    try {
        // 获取所有机器人配置（getRobotList返回的是包含name属性的数组）
        const allRobots = getRobotList();
        
        // 转换为API响应格式
        const configs = allRobots.map(robot => ({
            robot_name: robot.name,
            robot_id: robot.robot_id,
            robot_type: robot.robot_type,
            price: robot.price,
            min_price: robot.min_price,
            max_price: robot.max_price,
            duration_hours: robot.duration_hours,
            duration_days: hoursToDays(robot.duration_hours),
            quantify_interval_hours: robot.quantify_interval_hours,
            daily_profit: robot.daily_profit,
            total_return: robot.total_return || robot.total_return_rate,
            arbitrage_orders: robot.arbitrage_orders,
            limit: robot.limit,
            daily_limit: robot.daily_limit,
            return_principal: robot.return_principal,
            show_note: robot.show_note,
            locked: robot.locked,
            single_quantify: robot.single_quantify
        }));
        
        res.json({
            success: true,
            data: configs,
            total: configs.length
        });
        
    } catch (error) {
        console.error('获取机器人配置失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch robot configs',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================================================
// 机器人购买 API
// ============================================================================

/**
 * 购买机器人
 * POST /api/robot/purchase
 * 
 * 请求体：
 * {
 *   wallet_address: string,  // 钱包地址
 *   robot_name: string,      // 机器人名称
 *   price: number            // 购买价格（High机器人自定义金额）
 * }
 * 
 * 时间处理：
 * - start_time: 当前时间（精确到秒）
 * - end_time: start_time + duration_hours（精确到秒）
 */
router.post('/api/robot/purchase', sensitiveLimiter, async (req, res) => {
    try {
        const { wallet_address, robot_name, price } = req.body;
        
        // 1. 参数验证
        if (!wallet_address || !robot_name || !price) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address, robot_name, and price are required'
            });
        }
        
        // 2. 验证钱包地址格式
        if (!isValidWalletAddress(wallet_address)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address format'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        const robotPrice = parseFloat(price);
        
        if (isNaN(robotPrice) || robotPrice <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid price'
            });
        }
        
        // 3. 获取机器人配置
        const config = getRobotConfig(robot_name);
        if (!config) {
            return res.status(400).json({
                success: false,
                message: `Unknown robot: ${robot_name}`
            });
        }
        
        // 4. 验证 High 机器人价格范围
        if (config.robot_type === 'high') {
            if (robotPrice < config.min_price || robotPrice > config.max_price) {
                return res.status(400).json({
                    success: false,
                    message: `Price must be between ${config.min_price} and ${config.max_price} USDT`,
                    data: { min_price: config.min_price, max_price: config.max_price }
                });
            }
        }
        
        // 5. 查询用户余额（同时检查是否被冻结）
        const userBalance = await dbQuery(
            'SELECT usdt_balance, is_banned FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        // 检查账户是否被冻结
        if (userBalance.length > 0 && userBalance[0].is_banned === 1) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been suspended. Please contact support.'
            });
        }
        
        if (userBalance.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Wallet address not found. Please deposit first.'
            });
        }
        
        const currentBalance = parseFloat(userBalance[0].usdt_balance);
        
        // 6. 检查余额
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
        
        // 7. 检查每日限购（Grid 和 High 机器人）
        if (config.daily_limit) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = formatDateTime(today);
            
            const todayPurchases = await dbQuery(
                `SELECT id FROM robot_purchases 
                WHERE LOWER(wallet_address) = LOWER(?) AND robot_id = ? AND created_at >= ?`,
                // Use robot_id instead of robot_name to prevent bypass when names change/alias.
                [walletAddr, config.robot_id, todayStr]
            );
            
            if (todayPurchases.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'You can only purchase one of this robot per day',
                    data: { daily_limit_reached: true }
                });
            }
        }

        // 8. 检查限购数量（CEX 和 DEX 机器人 - 同时运行的数量）
        if (!config.daily_limit && config.limit) {
            const purchaseCount = await dbQuery(
                `SELECT COUNT(*) as count FROM robot_purchases
                WHERE LOWER(wallet_address) = LOWER(?) AND robot_id = ? AND status = 'active' AND end_time > NOW()`,
                [walletAddr, config.robot_id]
            );

            if (purchaseCount[0].count >= config.limit) {
                return res.status(400).json({
                    success: false,
                    message: `Purchase limit reached (${config.limit})`,
                    data: { limit_reached: true, limit: config.limit }
                });
            }
        }

        // 8.5 检查套利订单数量（每个用户可开启的总次数）
        // arbitrage_orders: 用户购买该机器人的历史总次数限制
        if (config.arbitrage_orders) {
            const totalPurchaseCount = await dbQuery(
                `SELECT COUNT(*) as count FROM robot_purchases
                WHERE LOWER(wallet_address) = LOWER(?) AND robot_id = ?`,
                // Use robot_id (not robot_name) so the lifetime limit can't be bypassed by naming variants.
                [walletAddr, config.robot_id]
            );

            if (totalPurchaseCount[0].count >= config.arbitrage_orders) {
                return res.status(400).json({
                    success: false,
                    message: `Arbitrage order limit reached. You can only open this robot ${config.arbitrage_orders} times.`,
                    data: {
                        arbitrage_limit_reached: true,
                        arbitrage_orders: config.arbitrage_orders,
                        current_count: totalPurchaseCount[0].count,
                        robot_id: config.robot_id
                    }
                });
            }
        }

        // 9. 计算时间（核心修复：使用精确到秒的时间）
        const startTime = new Date();
        const endTime = calculateEndTime(robot_name, startTime);
        
        // 10. 计算 DEX/High 机器人到期返还金额（本金+利息）
        // DEX/High 机器人只量化一次，到期返本返息
        let expectedReturn = 0;
        if (config.robot_type === 'high') {
            // High 机器人使用 total_return_rate 计算
            expectedReturn = calculateHighRobotReturn(robot_name, robotPrice);
        } else if (config.robot_type === 'dex') {
            // DEX 机器人：本金 + (本金 × 日利率 × 天数)
            const days = config.duration_hours / 24;
            const totalProfit = robotPrice * (config.daily_profit / 100) * days;
            expectedReturn = robotPrice + totalProfit;
            console.log(`[Purchase] DEX robot ${robot_name}: price=${robotPrice}, days=${days}, daily_profit=${config.daily_profit}%, expected_return=${expectedReturn.toFixed(4)}`);
        }
        
        // 11. 扣除用户余额（使用原子操作，防止余额变负）
        // CRITICAL FIX: Use conditional UPDATE to prevent negative balance
        // Only deduct if balance >= robotPrice (atomic check-and-deduct)
        const deductResult = await dbQuery(
            `UPDATE user_balances 
             SET usdt_balance = usdt_balance - ?, updated_at = NOW() 
             WHERE wallet_address = ? AND usdt_balance >= ?`,
            [robotPrice, walletAddr, robotPrice]
        );
        
        // Check if deduction was successful (affectedRows > 0)
        if (!deductResult || deductResult.affectedRows === 0) {
            // Re-fetch current balance to show accurate error message
            const recheckBalance = await dbQuery(
                'SELECT usdt_balance FROM user_balances WHERE wallet_address = ?',
                [walletAddr]
            );
            const actualBalance = recheckBalance.length > 0 ? parseFloat(recheckBalance[0].usdt_balance) : 0;
            
            console.warn(`[Purchase] REJECTED - Insufficient balance: wallet=${walletAddr.slice(0, 10)}..., balance=${actualBalance.toFixed(4)}, required=${robotPrice.toFixed(4)}`);
            
            return res.status(400).json({
                success: false,
                message: 'Insufficient USDT balance. Please deposit more funds.',
                data: {
                    current_balance: actualBalance.toFixed(4),
                    required: robotPrice.toFixed(4),
                    shortfall: (robotPrice - actualBalance).toFixed(4)
                }
            });
        }
        
        console.log(`[Purchase] Balance deducted: wallet=${walletAddr.slice(0, 10)}..., amount=${robotPrice.toFixed(4)}`)
        
        // 12. 插入购买记录（使用新的时间字段）
        const purchaseResult = await dbQuery(
            `INSERT INTO robot_purchases 
            (wallet_address, robot_id, robot_name, robot_type, price, token, status, 
             start_date, end_date, start_time, end_time, duration_hours, 
             quantify_interval_hours, daily_profit, total_profit, is_quantified, 
             expected_return, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, 'USDT', 'active', 
                    DATE(?), DATE(?), ?, ?, ?, 
                    ?, ?, 0, 0, 
                    ?, NOW(), NOW())`,
            [
                walletAddr,
                config.robot_id,
                robot_name,
                config.robot_type,
                robotPrice,
                formatDateTime(startTime),
                formatDateTime(endTime),
                formatDateTime(startTime),
                formatDateTime(endTime),
                config.duration_hours,
                config.quantify_interval_hours,
                config.daily_profit,
                expectedReturn
            ]
        );
        const robotPurchaseId = purchaseResult?.insertId || null;

        // 12.1 触发上级团队分红（只有合格金额才影响团队）
        // - 只发放“当日一次”的 daily_dividend
        // - 失败不影响购买主流程（兜底：每日定时任务仍会执行）
        if (robotPrice >= MIN_ROBOT_PURCHASE) {
            setImmediate(() => {
                processUplineDailyDividends(walletAddr, 8)
                    .then((result) => {
                        if (result?.rewarded > 0) {
                            console.log(`[TeamCron] Purchase-triggered dividends: trigger=${walletAddr.slice(0, 10)}..., rewarded=${result.rewarded}`);
                        }
                    })
                    .catch((error) => {
                        console.error(`[TeamCron] Purchase-triggered dividend failed for ${walletAddr.slice(0, 10)}...:`, error.message);
                    });
            });
        }
        
        // 13. 获取更新后的余额
        const updatedBalance = await dbQuery(
            'SELECT usdt_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        // 14. Referral reward distribution rules
        // CEX/Grid机器人: 不在购买时发放，在量化收益时按收益的 30%/10%/5%/1% 发放
        // High机器人: 不在购买时发放，到期后按收益比例发放
        // DEX机器人: 购买时立即发放启动资金返点 5%/3%/2%
        if (config.robot_type === 'dex') {
            await distributeDexPurchaseRewards(walletAddr, robot_name, robotPrice, robotPurchaseId);
        }
        // CEX/Grid/High 不在购买时发放奖励
        
        // 15. 返回成功响应
        res.json({
            success: true,
            message: `Successfully purchased ${robot_name}`,
            data: {
                robot_name: robot_name,
                robot_type: config.robot_type,
                price: robotPrice.toFixed(4),
                duration_hours: config.duration_hours,
                duration_days: hoursToDays(config.duration_hours),
                daily_profit: config.daily_profit,
                quantify_interval_hours: config.quantify_interval_hours,
                start_time: formatDateTime(startTime),
                end_time: formatDateTime(endTime),
                expected_return: expectedReturn.toFixed(4),
                new_balance: parseFloat(updatedBalance[0].usdt_balance).toFixed(4)
            }
        });
        
        console.log(`[Purchase] ${robot_name} purchased by ${walletAddr.slice(0, 10)}... for ${robotPrice} USDT, ends at ${formatDateTime(endTime)}`);
        
    } catch (error) {
        console.error('购买机器人失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Purchase failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================================================
// 机器人量化 API
// ============================================================================

/**
 * 执行量化操作
 * POST /api/robot/quantify
 * 
 * 请求体：
 * {
 *   wallet_address: string,
 *   robot_purchase_id: number
 * }
 * 
 * 量化规则：
 * - CEX/DEX/Grid：每 N 小时可量化一次（quantify_interval_hours）
 * - High：只能量化一次（is_quantified = 0 时可量化）
 */
router.post('/api/robot/quantify', quantifyLimiter, async (req, res) => {
    try {
        const { wallet_address, robot_purchase_id } = req.body;
        
        // 1. 参数验证
        if (!wallet_address || !robot_purchase_id) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address and robot_purchase_id are required'
            });
        }
        
        if (!isValidWalletAddress(wallet_address)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address format'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        const robotId = parseInt(robot_purchase_id, 10);
        
        if (isNaN(robotId) || robotId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid robot_purchase_id'
            });
        }
        
        // 1.5 检查账户是否被冻结
        const userStatus = await dbQuery(
            'SELECT is_banned FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        if (userStatus.length > 0 && userStatus[0].is_banned === 1) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been suspended. Please contact support.'
            });
        }
        
        // 2. 获取机器人购买记录（使用 end_time 判断是否到期）
        const robots = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE id = ? AND wallet_address = ? AND status = 'active' AND end_time > NOW()`,
            [robotId, walletAddr]
        );
        
        if (robots.length === 0) {
            // 检查是否存在但已到期
            const expiredRobot = await dbQuery(
                `SELECT end_time FROM robot_purchases 
                WHERE id = ? AND wallet_address = ? AND status = 'active' AND end_time <= NOW()`,
                [robotId, walletAddr]
            );
            
            if (expiredRobot.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: '机器人已到期，无法继续量化',
                    data: { expired: true, end_time: expiredRobot[0].end_time }
                });
            }
            
            return res.status(400).json({
                success: false,
                message: 'Robot not found or already expired'
            });
        }
        
        const robot = robots[0];
        const config = getRobotConfig(robot.robot_name);
        
        if (!config) {
            return res.status(400).json({
                success: false,
                message: 'Robot configuration not found'
            });
        }
        
        const currentTime = new Date();
        
        // 3. 检查量化状态
        const quantifyStatus = checkQuantifyStatus(robot, currentTime);
        
        if (!quantifyStatus.canQuantify) {
            return res.json({
                success: false,
                message: quantifyStatus.reason,
                data: {
                    already_quantified: true,
                    next_quantify_time: quantifyStatus.nextQuantifyTime ? formatDateTime(quantifyStatus.nextQuantifyTime) : null,
                    hours_remaining: quantifyStatus.hoursRemaining ? quantifyStatus.hoursRemaining.toFixed(2) : null
                }
            });
        }
        
        // 4. 处理 DEX/High 机器人（只量化一次，到期返本返息）
        if (config.single_quantify) {
            // 更新 is_quantified 标记
            await dbQuery(
                `UPDATE robot_purchases 
                SET is_quantified = 1, last_quantify_time = NOW(), updated_at = NOW() 
                WHERE id = ?`,
                [robotId]
            );
            
            console.log(`[Quantify] ${robot.robot_type.toUpperCase()} robot ${robot.robot_name} quantified by ${walletAddr.slice(0, 10)}..., expected_return=${robot.expected_return}`);
            
            return res.json({
                success: true,
                message: 'Quantification completed! Principal and profit will be returned at maturity.',
                data: {
                    earnings: '0.0000',
                    robot_type: robot.robot_type,
                    is_quantified: true,
                    expected_return: parseFloat(robot.expected_return).toFixed(4),
                    end_time: robot.end_time
                }
            });
        }
        
        // 5. 处理 CEX/DEX/Grid 机器人（每次量化获得收益）
        // calculateQuantifyEarnings 已经内置了安全限制（来自 SAFETY_LIMITS）
        let earnings = calculateQuantifyEarnings(robot.robot_name, parseFloat(robot.price));
        
        // 安全检查：使用配置中的安全限制（MAX_SINGLE_EARNING = 2500 USDT）
        // 注意：calculateQuantifyEarnings 已经应用了 SAFETY_LIMITS.MAX_SINGLE_EARNING
        // 这里的检查是最后一道防线，使用配置中的限制
        const absoluteMaxEarnings = SAFETY_LIMITS.MAX_SINGLE_EARNING || 2500;
        if (earnings > absoluteMaxEarnings) {
            console.warn(`[Quantify Security] Earnings ${earnings} exceeds config max ${absoluteMaxEarnings}, capping`);
            earnings = absoluteMaxEarnings;
        }
        
        // 记录高额收益警告（但不截断）
        if (earnings > SAFETY_LIMITS.EARNING_WARNING_THRESHOLD) {
            console.log(`[Quantify] High earnings: ${robot.robot_name}, amount=${earnings.toFixed(2)} USDT`);
        }
        
        // 6. Insert quantify log
        // IMPORTANT:
        // - We need the inserted log id to make referral rewards idempotent.
        // - Otherwise, using robot_purchase_id as source_id will cause duplicates across days
        //   and will also be displayed as "maturity" rewards by the frontend.
        const quantifyInsertResult = await dbQuery(
            `INSERT INTO robot_quantify_logs 
            (robot_purchase_id, wallet_address, robot_name, earnings, created_at) 
            VALUES (?, ?, ?, ?, NOW())`,
            [robotId, walletAddr, robot.robot_name, earnings]
        );
        const quantifyLogId = quantifyInsertResult?.insertId;
        
        // 7. 更新机器人累计收益、量化状态、次数和最后量化时间
        await dbQuery(
            `UPDATE robot_purchases 
            SET total_profit = total_profit + ?, 
                is_quantified = TRUE,
                quantify_count = quantify_count + 1,
                last_quantify_time = NOW(), 
                updated_at = NOW() 
            WHERE id = ?`,
            [earnings, robotId]
        );
        
        // 8. 更新用户余额
        await dbQuery(
            `UPDATE user_balances 
            SET usdt_balance = usdt_balance + ?, updated_at = NOW() 
            WHERE wallet_address = ?`,
            [earnings, walletAddr]
        );
        
        // 9. 记录收益到 robot_earnings 表（用于统计团队每日收益）
        await dbQuery(
            `INSERT INTO robot_earnings 
            (wallet_address, robot_purchase_id, robot_name, earning_amount, created_at) 
            VALUES (?, ?, ?, ?, NOW())`,
            [walletAddr, robotId, robot.robot_name, earnings]
        );
        
        // 10. Distribute referral rewards for each quantify (CEX/Grid only)
        // Referral reward is based on this quantify earning:
        // - Level rates are configured in CEX_REFERRAL_RATES (30%/10%/5%/1%×5)
        // - We use `source_type='quantify'` and `source_id=robot_quantify_logs.id` for idempotency.
        if (robot.robot_type === 'cex' || robot.robot_type === 'grid') {
            await distributeReferralRewards(walletAddr, robot, earnings, {
                sourceType: 'quantify',
                sourceId: quantifyLogId || 0
            });
            console.log(`[Quantify] Referral rewards distributed for robot ${robotId}, profit: ${earnings.toFixed(4)} USDT`);
        }
        
        // 11. 获取更新后的数据
        const updatedRobot = await dbQuery(
            'SELECT total_profit FROM robot_purchases WHERE id = ?',
            [robotId]
        );
        
        const updatedBalance = await dbQuery(
            'SELECT usdt_balance FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        
        console.log(`[Quantify] ${robot.robot_name} quantified by ${walletAddr.slice(0, 10)}..., earnings: ${earnings.toFixed(4)} USDT`);
        
        res.json({
            success: true,
            message: 'Quantification completed!',
            data: {
                earnings: earnings.toFixed(4),
                total_profit: parseFloat(updatedRobot[0].total_profit).toFixed(4),
                new_balance: parseFloat(updatedBalance[0].usdt_balance).toFixed(4),
                robot_type: robot.robot_type
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

// ============================================================================
// 量化状态查询 API
// ============================================================================

/**
 * 查询量化状态
 * GET /api/robot/quantify-status
 */
router.get('/api/robot/quantify-status', async (req, res) => {
    try {
        const { wallet_address, robot_purchase_id } = req.query;
        
        if (!wallet_address || !robot_purchase_id) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address and robot_purchase_id are required'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // If the account is frozen by admin, the user must not be able to quantify.
        // Return a normal success payload so frontend logic can still render the disabled state.
        const userStatus = await dbQuery(
            'SELECT is_banned FROM user_balances WHERE wallet_address = ?',
            [walletAddr]
        );
        if (userStatus.length > 0 && Number(userStatus[0].is_banned) === 1) {
            return res.json({
                success: true,
                data: {
                    can_quantify: false,
                    reason: 'Your account has been suspended. Quantification is disabled. Please contact support.',
                    quantified_today: true,
                    is_quantified: false,
                    next_quantify_time: null,
                    hours_remaining: 0,
                    last_quantify_time: null,
                    end_time: null,
                    is_expired: false
                }
            });
        }
        
        const robots = await dbQuery(
            `SELECT * FROM robot_purchases WHERE id = ? AND wallet_address = ?`,
            [robot_purchase_id, walletAddr]
        );
        
        if (robots.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Robot not found'
            });
        }
        
        const robot = robots[0];
        const currentTime = new Date();
        const quantifyStatus = checkQuantifyStatus(robot, currentTime);
        
        res.json({
            success: true,
            data: {
                can_quantify: quantifyStatus.canQuantify,
                reason: quantifyStatus.reason,
                quantified_today: !quantifyStatus.canQuantify,
                is_quantified: robot.is_quantified === 1,
                next_quantify_time: quantifyStatus.nextQuantifyTime ? formatDateTime(quantifyStatus.nextQuantifyTime) : null,
                hours_remaining: quantifyStatus.hoursRemaining ? parseFloat(quantifyStatus.hoursRemaining.toFixed(2)) : 0,
                last_quantify_time: robot.last_quantify_time,
                end_time: robot.end_time,
                is_expired: isRobotExpired(robot, currentTime)
            }
        });
        
    } catch (error) {
        console.error('查询量化状态失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to check quantify status'
        });
    }
});

// ============================================================================
// 我的机器人列表 API
// ============================================================================

/**
 * 获取用户在 Robot 页面的机器人列表（CEX/DEX）
 * GET /api/robot/my
 */
router.get('/api/robot/my', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // 先处理到期的机器人
        await processExpiredRobots(walletAddr, ['cex', 'dex']);
        
        // 获取活跃的机器人列表（使用 end_time 判断）
        const rows = await dbQuery(
            `SELECT *, 
                TIMESTAMPDIFF(HOUR, NOW(), end_time) as hours_remaining,
                CASE WHEN end_time <= NOW() THEN 1 ELSE 0 END as is_expired
            FROM robot_purchases 
            WHERE wallet_address = ? AND status = 'active' AND end_time > NOW()
            AND robot_type IN ('cex', 'dex')
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
            message: 'Failed to fetch robots'
        });
    }
});

/**
 * 获取用户在 Follow 页面的机器人列表（Grid/High）
 * GET /api/follow/my
 */
router.get('/api/follow/my', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // 先处理到期的机器人
        await processExpiredRobots(walletAddr, ['grid', 'high']);
        
        // 获取活跃的机器人列表
        const rows = await dbQuery(
            `SELECT *, 
                TIMESTAMPDIFF(HOUR, NOW(), end_time) as hours_remaining,
                CASE WHEN end_time <= NOW() THEN 1 ELSE 0 END as is_expired
            FROM robot_purchases 
            WHERE wallet_address = ? AND status = 'active' AND end_time > NOW()
            AND robot_type IN ('grid', 'high')
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
            message: 'Failed to fetch follow robots'
        });
    }
});

// ============================================================================
// 过期机器人列表 API
// ============================================================================

/**
 * 获取用户过期的机器人列表（Robot 页面）
 * GET /api/robot/expired
 */
router.get('/api/robot/expired', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // 先处理到期的机器人
        await processExpiredRobots(walletAddr, ['cex', 'dex']);
        
        // 获取已过期的机器人
        const rows = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE wallet_address = ? 
            AND (status = 'expired' OR end_time <= NOW())
            AND robot_type IN ('cex', 'dex')
            ORDER BY end_time DESC`,
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
            message: 'Failed to fetch expired robots'
        });
    }
});

/**
 * 获取用户过期的机器人列表（Follow 页面）
 * GET /api/follow/expired
 */
router.get('/api/follow/expired', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // 先处理到期的机器人
        await processExpiredRobots(walletAddr, ['grid', 'high']);
        
        // 获取已过期的机器人
        const rows = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE wallet_address = ? 
            AND (status = 'expired' OR end_time <= NOW())
            AND robot_type IN ('grid', 'high')
            ORDER BY end_time DESC`,
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
            message: 'Failed to fetch follow expired robots'
        });
    }
});

// ============================================================================
// 今日购买记录 API
// ============================================================================

/**
 * 获取今日已购买的机器人列表（用于限购检查）
 * GET /api/follow/today-purchases
 */
router.get('/api/follow/today-purchases', async (req, res) => {
    try {
        const { wallet_address } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // 获取今天开始时间
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = formatDateTime(today);
        
        const rows = await dbQuery(
            `SELECT robot_name, robot_type FROM robot_purchases 
            WHERE wallet_address = ? AND created_at >= ?
            AND robot_type IN ('grid', 'high')`,
            [walletAddr, todayStr]
        );
        
        const purchasedRobots = rows.map(r => r.robot_name);
        
        res.json({
            success: true,
            data: {
                purchased_today: purchasedRobots,
                date: todayStr.split(' ')[0]
            }
        });
        
    } catch (error) {
        console.error('获取今日购买记录失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch today purchases'
        });
    }
});

// ============================================================================
// 购买数量查询 API
// ============================================================================

/**
 * 获取用户购买某类机器人的数量
 * GET /api/robot/count
 */
router.get('/api/robot/count', async (req, res) => {
    try {
        const { wallet_address, robot_id } = req.query;
        
        if (!wallet_address) {
            return res.status(400).json({
                success: false,
                message: 'wallet_address is required'
            });
        }
        
        const walletAddr = normalizeWalletAddress(wallet_address);
        
        // Get robot purchase counts for this wallet.
        //
        // IMPORTANT:
        // - active_count: used for concurrent running limit (config.limit)
        // - total_count: used for lifetime purchase/open limit (config.arbitrage_orders / frontend `orders`)
        const rows = await dbQuery(
            `SELECT 
                robot_id, 
                robot_name, 
                SUM(CASE WHEN status = 'active' AND end_time > NOW() THEN 1 ELSE 0 END) as active_count,
                COUNT(*) as total_count
            FROM robot_purchases 
            WHERE wallet_address = ?
            GROUP BY robot_id, robot_name`,
            [walletAddr]
        );
        
        if (robot_id) {
            const robot = rows.find(r => r.robot_id === robot_id);
            return res.json({
                success: true,
                data: {
                    robot_id: robot_id,
                    // Backward compatibility: keep `count` as active_count.
                    count: robot ? robot.active_count : 0,
                    active_count: robot ? robot.active_count : 0,
                    total_count: robot ? robot.total_count : 0
                }
            });
        }
        
        res.json({
            success: true,
            // Backward compatibility: also provide `count` alias for existing frontend.
            data: rows.map(r => ({
                ...r,
                count: r.active_count
            }))
        });
        
    } catch (error) {
        console.error('获取机器人购买数量失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch robot count'
        });
    }
});

// ============================================================================
// 到期处理函数
// ============================================================================

/**
 * 处理到期的机器人（核心修复）
 * @param {string} walletAddr - 钱包地址
 * @param {array} robotTypes - 机器人类型数组 ['cex', 'dex', 'grid', 'high']
 */
async function processExpiredRobots(walletAddr, robotTypes = ['cex', 'dex', 'grid', 'high']) {
    try {
        // Normalize wallet address to avoid missing refunds due to casing mismatches.
        // This function may be called with DB-provided wallet_address (legacy data).
        const normalizedWallet = normalizeWalletLower(walletAddr) || walletAddr;
        walletAddr = normalizedWallet;

        const typePlaceholders = robotTypes.map(() => '?').join(',');
        
        // 查找已到期但状态仍为 active 的机器人
        // 使用 end_time <= NOW() 精确判断（核心修复）
        const expiredRobots = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE LOWER(wallet_address) = LOWER(?) 
            AND robot_type IN (${typePlaceholders})
            AND status = 'active' 
            AND end_time <= NOW()
            AND (expired_at IS NULL)`,
            [walletAddr, ...robotTypes]
        );
        
        for (const robot of expiredRobots) {
            await processOneExpiredRobot(robot, walletAddr);
        }
        
        if (expiredRobots.length > 0) {
            console.log(`[Expire] Processed ${expiredRobots.length} expired robots for ${walletAddr.slice(0, 10)}...`);
        }
        
    } catch (error) {
        console.error('处理到期机器人失败:', error.message);
    }
}

/**
 * 处理单个到期机器人
 * @param {object} robot - 机器人记录
 * @param {string} walletAddr - 钱包地址
 * 
 * 到期规则：
 * - CEX/Grid：每天量化，到期只返还本金（利息已在量化时发放）
 * - DEX/High：只量化一次，到期返还本金+利息
 */
async function processOneExpiredRobot(robot, walletAddr) {
    try {
        // Idempotency / concurrency guard:
        // Claim this robot expiry once using `expired_at` as a lock.
        // - Only the first worker sets expired_at (affectedRows=1).
        // - Others skip (affectedRows=0), preventing double refunds.
        const claimResult = await dbQuery(
            `UPDATE robot_purchases
             SET expired_at = NOW(), updated_at = NOW()
             WHERE id = ? AND status = 'active' AND expired_at IS NULL`,
            [robot.id]
        );
        if (!claimResult || claimResult.affectedRows === 0) {
            return;
        }

        const config = getRobotConfig(robot.robot_name);
        if (!config) {
            console.error(`Robot config not found: ${robot.robot_name}`);
            // Release the claim so it can be retried after config fixes.
            await dbQuery(
                `UPDATE robot_purchases SET expired_at = NULL, updated_at = NOW() WHERE id = ? AND status = 'active'`,
                [robot.id]
            );
            return;
        }
        
        let returnAmount = 0;
        let profitAmount = 0;
        let refundCredited = false; // If true, NEVER unlock/redo refund.
        
        // 根据机器人类型处理返还
        // DEX 和 High 机器人：只量化一次，到期返本返息
        if (robot.robot_type === 'high' || robot.robot_type === 'dex') {
            // DEX/High robots:
            // - quantified: return principal + profit (expected_return)
            // - NOT quantified (edge case): return principal only (do not trap customer funds)
            if (robot.is_quantified === 1) {
                returnAmount = parseFloat(robot.expected_return) || parseFloat(robot.price);
                profitAmount = returnAmount - parseFloat(robot.price);
            } else {
                returnAmount = parseFloat(robot.price);
                profitAmount = 0;
            }
            
            console.log(`[Expire] ${robot.robot_type.toUpperCase()} robot ${robot.id}: principal=${robot.price}, profit=${profitAmount.toFixed(4)}, total=${returnAmount.toFixed(4)}`);
            
        } else {
            // CEX/Grid 机器人：每天量化获得收益，到期只返还本金
            if (config.return_principal) {
                returnAmount = parseFloat(robot.price);
            }
        }
        
        if (returnAmount > 0) {
            // Ensure balance row exists then credit safely (prevents UPDATE 0 rows)
            await ensureUserBalanceRow(dbQuery, walletAddr);
            await creditUsdtBalance(dbQuery, walletAddr, returnAmount);
            refundCredited = true;
            
            // 记录交易历史
            const isReturnWithProfit = (robot.robot_type === 'high' || robot.robot_type === 'dex') && robot.is_quantified === 1;
            const txDescription = isReturnWithProfit
                ? `${robot.robot_name} 到期返还（本金+收益） #robot_purchase_id=${robot.id}`
                : `${robot.robot_name} 到期返还本金 #robot_purchase_id=${robot.id}`;
            
            // Best-effort: do not throw after balance credit to avoid unlocking/double refunds.
            try {
                await dbQuery(
                    `INSERT INTO transaction_history 
                    (wallet_address, tx_type, amount, currency, description, status, created_at) 
                    VALUES (?, 'refund', ?, 'USDT', ?, 'completed', NOW())`,
                    [walletAddr, returnAmount, txDescription]
                );
            } catch (logErr) {
                console.error('[Expire] Failed to write transaction_history (refund already credited):', logErr.message);
            }
            
            console.log(`[Expire] Returned ${returnAmount.toFixed(4)} USDT to ${walletAddr.slice(0, 10)}... for robot ${robot.id} (${robot.robot_name})`);
        }
        
        // 更新机器人状态
        try {
            await dbQuery(
                `UPDATE robot_purchases 
                SET status = 'expired', total_profit = ?, updated_at = NOW() 
                WHERE id = ?`,
                [(robot.robot_type === 'high' || robot.robot_type === 'dex') ? profitAmount : robot.total_profit, robot.id]
            );
        } catch (statusErr) {
            console.error('[Expire] Failed to update robot status after expiry processing:', statusErr.message);
        }
        
        // DEX/High 机器人：到期后发放基于收益的推荐奖励
        // DEX: 除了购买时的启动资金返点(5%/3%/2%)，到期还要发放收益的推荐奖励(30%/10%/5%/1%)
        // High: 没有启动资金返点，只有到期后的收益推荐奖励(30%/10%/5%/1%)
        if ((robot.robot_type === 'high' || robot.robot_type === 'dex') && profitAmount > 0) {
            try {
                await dbQuery(
                    `INSERT INTO robot_earnings
                    (wallet_address, robot_purchase_id, robot_name, earning_amount, created_at)
                    VALUES (?, ?, ?, ?, NOW())`,
                    [walletAddr, robot.id, robot.robot_name, profitAmount]
                );
            } catch (earnErr) {
                console.error('[Expire] Failed to write robot_earnings (refund state preserved):', earnErr.message);
            }

            // 到期后发放基于收益的推荐奖励（30%/10%/5%/1%×5）
            // Maturity referral rewards are paid only once on expiry for DEX/High robots.
            // Use `source_type='maturity'` + `source_id=robot_purchases.id` for idempotency.
            try {
                await distributeReferralRewards(walletAddr, robot, profitAmount, {
                    sourceType: 'maturity',
                    sourceId: robot.id
                });
            } catch (refErr) {
                console.error('[Expire] Failed to distribute referral rewards (refund state preserved):', refErr.message);
            }
            console.log(`[Expire] ${robot.robot_type.toUpperCase()} robot ${robot.id} earnings recorded, referral rewards distributed based on profit ${profitAmount.toFixed(4)} USDT`);
        }
        
    } catch (error) {
        console.error(`处理到期机器人 ${robot.id} 失败:`, error.message);
        // Release claim so it can be retried (prevents permanent “stuck” robots).
        try {
            // Only unlock if refund definitely did NOT happen.
            // If refund was credited, keep the lock to prevent double refunds.
            if (!refundCredited) {
                await dbQuery(
                    `UPDATE robot_purchases SET expired_at = NULL, updated_at = NOW() WHERE id = ? AND status = 'active'`,
                    [robot.id]
                );
            }
        } catch (e) {
            // Best-effort unlock; avoid masking the original error.
        }
    }
}

/**
 * 发放推荐奖励（CEX/Grid 量化收益奖励 - 8级）
 *
 * 数学公式: R_n = P × r_n
 * 其中: R_n = 第n级奖励, P = 量化收益, r_n = 第n级比例
 * 比例: [30%, 10%, 5%, 1%×5] = 总计50%
 *
 * 在每次量化产生收益时调用
 *
 * @param {string} walletAddr - 用户钱包地址
 * @param {object} robot - 机器人记录
 * @param {number} profit - 利润金额（量化收益）
 */
/**
 * Distribute referral rewards (8 levels).
 *
 * IMPORTANT:
 * - For quantify rewards: source_type='quantify', source_id=robot_quantify_logs.id
 * - For maturity rewards: source_type='maturity', source_id=robot_purchases.id
 *
 * This prevents duplicate payouts when requests are retried or cron jobs overlap.
 *
 * @param {string} walletAddr - Source user wallet address
 * @param {object} robot - Robot purchase record
 * @param {number} profit - Source earning/profit amount
 * @param {object} options
 * @param {'quantify'|'maturity'|'dex_purchase'|'retroactive'} options.sourceType - Reward type
 * @param {number} options.sourceId - Idempotency key (log id / purchase id)
 */
async function distributeReferralRewards(walletAddr, robot, profit, options = {}) {
    try {
        const { sourceType = 'quantify', sourceId = 0 } = options;

        // 使用数学工具导入的CEX奖励比例（统一管理，避免硬编码）
        // CEX_REFERRAL_RATES = [0.30, 0.10, 0.05, 0.01×5] = 50%
        const maxLevel = CEX_REFERRAL_RATES.length; // 8级
        let currentWallet = walletAddr;
        
        // 先用数学工具计算预期奖励分配（用于日志和验证）
        const expectedRewards = calculateCexRewards(profit);
        console.log(`[Referral Math] ${expectedRewards.summary}`);
        
        for (let level = 1; level <= maxLevel; level++) {
            const referrerResult = await dbQuery(
                'SELECT referrer_address FROM user_referrals WHERE wallet_address = ? AND referrer_address IS NOT NULL',
                [currentWallet]
            );
            
            if (referrerResult.length === 0) break;
            
            const referrerAddress = referrerResult[0].referrer_address;
            if (!referrerAddress || !isValidWalletAddress(referrerAddress)) break;
            // 使用数学工具计算单级奖励
            const rewardRate = CEX_REFERRAL_RATES[level - 1];
            const rewardAmount = calculateLevelReward(profit, rewardRate);
            
            // 确保上级有余额记录
            await dbQuery(
                `INSERT IGNORE INTO user_balances (wallet_address, usdt_balance, wld_balance, created_at, updated_at) 
                VALUES (?, 0, 0, NOW(), NOW())`,
                [referrerAddress]
            );
            
            // Idempotency check:
            // Do not pay twice for the same (receiver, from, level, source_type, source_id).
            const existingReward = await dbQuery(
                `SELECT id FROM referral_rewards
                 WHERE wallet_address = ? AND from_wallet = ? AND level = ? AND source_type = ? AND source_id = ?
                 LIMIT 1`,
                [referrerAddress, walletAddr, level, sourceType, sourceId]
            );

            if (existingReward.length > 0) {
                console.log(`[Referral] Skip duplicate reward (exists id=${existingReward[0].id}) level=${level} source_type=${sourceType} source_id=${sourceId}`);
                currentWallet = referrerAddress;
                continue;
            }

            // Credit referrer balance first, then write the reward record.
            await dbQuery(
                `UPDATE user_balances 
                 SET usdt_balance = usdt_balance + ?, updated_at = NOW() 
                 WHERE wallet_address = ?`,
                [rewardAmount, referrerAddress]
            );

            await dbQuery(
                `INSERT INTO referral_rewards 
                 (wallet_address, from_wallet, level, reward_rate, reward_amount, source_type, source_id, robot_name, source_amount, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [referrerAddress, walletAddr, level, rewardRate * 100, rewardAmount, sourceType, sourceId, robot.robot_name, profit]
            );
            
            console.log(`[Referral] Level ${level} reward: ${rewardAmount.toFixed(4)} USDT to ${referrerAddress.slice(0, 10)}...`);
            
            currentWallet = referrerAddress;
        }
    } catch (error) {
        console.error('发放推荐奖励失败:', error.message);
    }
}

/**
 * 发放DEX机器人购买奖励（启动金额返点 - 3级）
 *
 * 数学公式: R_n = A × r_n
 * 其中: R_n = 第n级奖励, A = 启动金额, r_n = 第n级比例
 * 比例: [5%, 3%, 2%] = 总计10%
 *
 * DEX机器人推荐奖励规则（购买时立即发放）：
 * - 1级：启动金额的5%
 * - 2级：启动金额的3%
 * - 3级：启动金额的2%
 *
 * @param {string} walletAddr - 购买者钱包地址
 * @param {string} robotName - 机器人名称
 * @param {number} purchaseAmount - 购买金额
 */
async function distributeDexPurchaseRewards(walletAddr, robotName, purchaseAmount, sourceId = null) {
    try {
        // 使用数学工具导入的DEX奖励比例（统一管理，避免硬编码）
        // DEX_REFERRAL_RATES = [0.05, 0.03, 0.02] = 10%
        const maxLevel = DEX_REFERRAL_RATES.length; // 3级
        let currentWallet = walletAddr;
        
        // 先用数学工具计算预期奖励分配（用于日志和验证）
        const expectedRewards = calculateDexRewards(purchaseAmount);
        console.log(`[DEX Reward Math] ${expectedRewards.summary}`);
        console.log(`[DEX Reward] Processing purchase rewards for ${robotName}, amount: ${purchaseAmount} USDT`);
        
        for (let level = 1; level <= maxLevel; level++) {
            // 查找当前用户的上级
            const referrerResult = await dbQuery(
                'SELECT referrer_address FROM user_referrals WHERE wallet_address = ? AND referrer_address IS NOT NULL',
                [currentWallet]
            );
            
            if (referrerResult.length === 0) {
                console.log(`[DEX Reward] No referrer found at level ${level}`);
                break;
            }
            
            const referrerAddress = referrerResult[0].referrer_address;
            if (!referrerAddress || !isValidWalletAddress(referrerAddress)) {
                console.log(`[DEX Reward] Invalid referrer at level ${level}`);
                break;
            }
            // 使用数学工具计算单级奖励
            const rewardRate = DEX_REFERRAL_RATES[level - 1];
            const rewardAmount = calculateLevelReward(purchaseAmount, rewardRate);
            
            // 确保上级有余额记录
            await dbQuery(
                `INSERT IGNORE INTO user_balances (wallet_address, usdt_balance, wld_balance, created_at, updated_at) 
                VALUES (?, 0, 0, NOW(), NOW())`,
                [referrerAddress]
            );
            
            // 增加上级余额
            await dbQuery(
                `UPDATE user_balances 
                SET usdt_balance = usdt_balance + ?, updated_at = NOW() 
                WHERE wallet_address = ?`,
                [rewardAmount, referrerAddress]
            );
            
            // 记录推荐奖励（source_type = 'dex_purchase' 区分于量化奖励）
            await dbQuery(
                `INSERT INTO referral_rewards 
                (wallet_address, from_wallet, level, reward_rate, reward_amount, source_type, source_id, robot_name, source_amount, created_at) 
                VALUES (?, ?, ?, ?, ?, 'dex_purchase', ?, ?, ?, NOW())`,
                [referrerAddress, walletAddr, level, rewardRate * 100, rewardAmount, sourceId || null, robotName, purchaseAmount]
            );
            
            console.log(`[DEX Reward] Level ${level}: ${rewardAmount.toFixed(4)} USDT (${rewardRate * 100}%) to ${referrerAddress.slice(0, 10)}...`);
            
            // 移动到下一级
            currentWallet = referrerAddress;
        }
        
        console.log(`[DEX Reward] Purchase rewards distributed successfully`);
        
    } catch (error) {
        console.error('[DEX Reward] 发放DEX购买奖励失败:', error.message);
        // 不抛出异常，避免影响购买流程
    }
}

// ============================================================================
// 全局到期处理（定时任务用）
// ============================================================================

/**
 * 处理所有用户的到期机器人
 * 建议每小时执行一次
 */
async function processAllExpiredRobots() {
    try {
        // 获取所有有到期机器人的钱包地址
        const wallets = await dbQuery(
            `SELECT DISTINCT wallet_address FROM robot_purchases 
            WHERE status = 'active' AND end_time <= NOW()`
        );
        
        console.log(`[Cron] Processing expired robots for ${wallets.length} wallets...`);
        
        for (const { wallet_address } of wallets) {
            await processExpiredRobots(wallet_address);
        }
        
        console.log(`[Cron] Expired robots processing completed`);
        
    } catch (error) {
        console.error('[Cron] Failed to process expired robots:', error.message);
    }
}

// ============================================================================
// 机器人配置 API
// ============================================================================

/**
 * 获取机器人配置列表（供前端使用）
 * GET /api/robot/config
 */
router.get('/api/robot/config', (req, res) => {
    const { type } = req.query;
    
    try {
        const robots = getRobotList(type || null);
        
        res.json({
            success: true,
            data: robots.map(robot => ({
                name: robot.name,
                robot_id: robot.robot_id,
                robot_type: robot.robot_type,
                duration_hours: robot.duration_hours,
                duration_days: hoursToDays(robot.duration_hours),
                quantify_interval_hours: robot.quantify_interval_hours,
                daily_profit: robot.daily_profit,
                arbitrage_orders: robot.arbitrage_orders,
                total_return: robot.total_return || robot.total_return_rate,
                limit: robot.limit,
                price: robot.price,
                min_price: robot.min_price,
                max_price: robot.max_price,
                return_principal: robot.return_principal,
                daily_limit: robot.daily_limit,
                single_quantify: robot.single_quantify,
                locked: robot.locked,
                show_note: robot.show_note
            }))
        });
        
    } catch (error) {
        console.error('获取机器人配置失败:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch robot config'
        });
    }
});

// ============================================================================
// 导出模块（ES Module 语法）
// ============================================================================

export {
    router,
    setDbQuery,
    processExpiredRobots,
    processAllExpiredRobots
};