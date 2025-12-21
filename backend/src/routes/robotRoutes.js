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
import {
    CEX_REFERRAL_RATES,            // CEX 8级奖励比例 [0.30, 0.10, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01]
    DEX_REFERRAL_RATES,            // DEX 3级奖励比例 [0.05, 0.03, 0.02]
    calculateLevelReward,          // 单级奖励计算: amount * rate
    calculateCexRewards,           // CEX完整奖励计算
    calculateDexRewards,           // DEX完整奖励计算
    formatAmount                   // 格式化金额显示
} from '../utils/referralMath.js';

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
    hoursToDays
} from '../config/robotConfig.js';

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
        
        // #region agent log
        fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robotRoutes.js:226',message:'Robot purchase - balance check',data:{wallet:walletAddr.slice(0,10),balance:userBalance.length>0?parseFloat(userBalance[0].usdt_balance):null,robotPrice,robotName:robot_name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
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
                WHERE wallet_address = ? AND robot_name = ? AND created_at >= ?`,
                [walletAddr, robot_name, todayStr]
            );
            
            if (todayPurchases.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'You can only purchase one of this robot per day',
                    data: { daily_limit_reached: true }
                });
            }
        }
        
        // 8. 检查限购数量（CEX 和 DEX 机器人）
        if (!config.daily_limit && config.limit) {
            const purchaseCount = await dbQuery(
                `SELECT COUNT(*) as count FROM robot_purchases 
                WHERE wallet_address = ? AND robot_id = ? AND status = 'active' AND end_time > NOW()`,
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
        
        // 9. 计算时间（核心修复：使用精确到秒的时间）
        const startTime = new Date();
        const endTime = calculateEndTime(robot_name, startTime);
        
        // 10. 计算 High 机器人到期返还金额
        let expectedReturn = 0;
        if (config.robot_type === 'high') {
            expectedReturn = calculateHighRobotReturn(robot_name, robotPrice);
        }
        
        // 11. 扣除用户余额
        // #region agent log
        fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robotRoutes.js:301',message:'Robot purchase - BEFORE deduction',data:{wallet:walletAddr.slice(0,10),balanceBefore:currentBalance,deductAmount:robotPrice},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        await dbQuery(
            'UPDATE user_balances SET usdt_balance = usdt_balance - ?, updated_at = NOW() WHERE wallet_address = ?',
            [robotPrice, walletAddr]
        );
        
        // #region agent log
        fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robotRoutes.js:308',message:'Robot purchase - AFTER deduction',data:{wallet:walletAddr.slice(0,10),deductAmount:robotPrice,deductionExecuted:true},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
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
        
        // #region agent log
        fetch('http://localhost:7242/ingest/10a0bbc0-f589-4d17-9d7f-29d4e679320a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robotRoutes.js:360',message:'Robot purchase - final balance',data:{wallet:walletAddr.slice(0,10),balanceAfter:updatedBalance.length>0?parseFloat(updatedBalance[0].usdt_balance):null,expectedBalance:currentBalance-robotPrice},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // 14. DEX机器人购买奖励（启动金额的3级奖励：5%-3%-2%）
        if (config.robot_type === 'dex') {
            await distributeDexPurchaseRewards(walletAddr, robot_name, robotPrice, robotPurchaseId);
        }
        
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
        
        // 4. 处理 High 机器人（只量化一次）
        if (config.single_quantify) {
            // 更新 is_quantified 标记
            await dbQuery(
                `UPDATE robot_purchases 
                SET is_quantified = 1, last_quantify_time = NOW(), updated_at = NOW() 
                WHERE id = ?`,
                [robotId]
            );
            
            console.log(`[Quantify] High robot ${robot.robot_name} quantified by ${walletAddr.slice(0, 10)}...`);
            
            return res.json({
                success: true,
                message: 'Quantification completed! Profit will be returned at maturity.',
                data: {
                    earnings: '0.0000',
                    robot_type: 'high',
                    is_quantified: true,
                    expected_return: parseFloat(robot.expected_return).toFixed(4),
                    end_time: robot.end_time
                }
            });
        }
        
        // 5. 处理 CEX/DEX/Grid 机器人（每次量化获得收益）
        let earnings = calculateQuantifyEarnings(robot.robot_name, parseFloat(robot.price));
        
        // 安全检查：单次量化收益不能超过本金的5%（防止配置错误导致异常收益）
        const maxEarnings = parseFloat(robot.price) * 0.05;
        if (earnings > maxEarnings) {
            console.warn(`[Quantify Security] Earnings ${earnings} exceeds max ${maxEarnings}, capping to max`);
            earnings = maxEarnings;
        }
        
        // 安全检查：单次量化收益不能超过500 USDT
        const absoluteMaxEarnings = 500;
        if (earnings > absoluteMaxEarnings) {
            console.warn(`[Quantify Security] Earnings ${earnings} exceeds absolute max ${absoluteMaxEarnings}, capping`);
            earnings = absoluteMaxEarnings;
        }
        
        // 6. 插入量化记录
        await dbQuery(
            `INSERT INTO robot_quantify_logs 
            (robot_purchase_id, wallet_address, robot_name, earnings, created_at) 
            VALUES (?, ?, ?, ?, NOW())`,
            [robotId, walletAddr, robot.robot_name, earnings]
        );
        
        // 7. 更新机器人累计收益和最后量化时间
        await dbQuery(
            `UPDATE robot_purchases 
            SET total_profit = total_profit + ?, last_quantify_time = NOW(), updated_at = NOW() 
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
        
        // 10. 发放CEX推荐奖励（8级50%）- 关键修复！
        // 根据文档: CEX机器人量化收益的50%分给8级推荐人
        // 比例: [30%, 10%, 5%, 1%, 1%, 1%, 1%, 1%]
        try {
            // 使用数学工具导入的CEX奖励比例
            const maxLevel = CEX_REFERRAL_RATES.length; // 8级
            let currentWallet = walletAddr;
            let totalDistributed = 0;
            
            // 使用数学工具计算预期奖励分配（用于日志）
            const expectedRewards = calculateCexRewards(earnings);
            console.log(`[Quantify Reward Math] ${expectedRewards.summary}`);
            
            for (let level = 1; level <= maxLevel; level++) {
                // 查找当前用户的上级
                const referrerResult = await dbQuery(
                    'SELECT referrer_address FROM user_referrals WHERE wallet_address = ? AND referrer_address IS NOT NULL',
                    [currentWallet]
                );
                
                if (referrerResult.length === 0 || !referrerResult[0].referrer_address) {
                    // 没有上级了，停止
                    break;
                }
                
                const referrerAddress = referrerResult[0].referrer_address;
                // 使用数学工具计算单级奖励
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
                
                // 记录推荐奖励（source_type = 'quantify' 表示量化收益奖励）
                await dbQuery(
                    `INSERT INTO referral_rewards 
                    (wallet_address, from_wallet, level, reward_rate, reward_amount, source_type, source_id, robot_name, source_amount, created_at) 
                    VALUES (?, ?, ?, ?, ?, 'quantify', ?, ?, ?, NOW())`,
                    [referrerAddress, walletAddr, level, rewardRate * 100, rewardAmount, robotId, robot.robot_name, earnings]
                );
                
                totalDistributed += rewardAmount;
                console.log(`[Quantify Reward] Level ${level}: ${rewardAmount.toFixed(4)} USDT (${rewardRate * 100}%) to ${referrerAddress.slice(0, 10)}...`);
                
                // 移动到下一级
                currentWallet = referrerAddress;
            }
            
            if (totalDistributed > 0) {
                console.log(`[Quantify Reward] Total distributed: ${totalDistributed.toFixed(4)} USDT for robot ${robotId}`);
            }
        } catch (referralError) {
            // 推荐奖励分发失败不影响用户量化成功
            console.error('[Quantify Reward] 推荐奖励分发失败（不影响用户量化）:', referralError.message);
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
        
        // 获取用户所有活跃机器人的购买数量（使用 end_time 判断）
        const rows = await dbQuery(
            `SELECT robot_id, robot_name, COUNT(*) as count 
            FROM robot_purchases 
            WHERE wallet_address = ? AND status = 'active' AND end_time > NOW()
            GROUP BY robot_id, robot_name`,
            [walletAddr]
        );
        
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
        
        res.json({
            success: true,
            data: rows
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
        const typePlaceholders = robotTypes.map(() => '?').join(',');
        
        // 查找已到期但状态仍为 active 的机器人
        // 使用 end_time <= NOW() 精确判断（核心修复）
        const expiredRobots = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE wallet_address = ? 
            AND robot_type IN (${typePlaceholders})
            AND status = 'active' 
            AND end_time <= NOW()`,
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
 */
async function processOneExpiredRobot(robot, walletAddr) {
    try {
        const config = getRobotConfig(robot.robot_name);
        if (!config) {
            console.error(`Robot config not found: ${robot.robot_name}`);
            return;
        }
        
        let returnAmount = 0;
        let profitAmount = 0;
        
        // 根据机器人类型处理返还
        if (robot.robot_type === 'high') {
            // High 机器人：必须已量化才返还
            if (robot.is_quantified !== 1) {
                console.log(`[Expire] High robot ${robot.id} not quantified, skipping`);
                // 只更新状态，不返还
                await dbQuery(
                    `UPDATE robot_purchases SET status = 'expired', updated_at = NOW() WHERE id = ?`,
                    [robot.id]
                );
                return;
            }
            
            // 返还本金+利息
            returnAmount = parseFloat(robot.expected_return);
            profitAmount = returnAmount - parseFloat(robot.price);
            
        } else {
            // CEX/DEX/Grid 机器人：返还本金
            if (config.return_principal) {
                returnAmount = parseFloat(robot.price);
            }
        }
        
        if (returnAmount > 0) {
            // 返还到用户余额
            await dbQuery(
                `UPDATE user_balances 
                SET usdt_balance = usdt_balance + ?, updated_at = NOW() 
                WHERE wallet_address = ?`,
                [returnAmount, walletAddr]
            );
            
            // 记录交易历史（本金返还）
            const txDescription = robot.robot_type === 'high' 
                ? `${robot.robot_name} 到期返还（本金+收益）`
                : `${robot.robot_name} 到期返还本金`;
            
            await dbQuery(
                `INSERT INTO transaction_history 
                (wallet_address, tx_type, amount, currency, description, status, created_at) 
                VALUES (?, 'refund', ?, 'USDT', ?, 'completed', NOW())`,
                [walletAddr, returnAmount, txDescription]
            );
            
            console.log(`[Expire] Returned ${returnAmount.toFixed(4)} USDT to ${walletAddr.slice(0, 10)}... for robot ${robot.id} (${robot.robot_name})`);
        }
        
        // 更新机器人状态
        await dbQuery(
            `UPDATE robot_purchases 
            SET status = 'expired', total_profit = ?, updated_at = NOW() 
            WHERE id = ?`,
            [robot.robot_type === 'high' ? profitAmount : robot.total_profit, robot.id]
        );
        
        // High 机器人：记录到期收益并发放推荐奖励
        if (robot.robot_type === 'high' && profitAmount > 0) {
            await dbQuery(
                `INSERT INTO robot_earnings 
                (wallet_address, robot_purchase_id, robot_name, earning_amount, created_at) 
                VALUES (?, ?, ?, ?, NOW())`,
                [walletAddr, robot.id, robot.robot_name, profitAmount]
            );
            
            // 发放推荐奖励（8级）
            await distributeReferralRewards(walletAddr, robot, profitAmount);
        }
        
    } catch (error) {
        console.error(`处理到期机器人 ${robot.id} 失败:`, error.message);
    }
}

/**
 * 发放推荐奖励（CEX/Grid/High 量化收益奖励 - 8级）
 * 
 * 数学公式: R_n = P × r_n
 * 其中: R_n = 第n级奖励, P = 利润, r_n = 第n级比例
 * 比例: [30%, 10%, 5%, 1%, 1%, 1%, 1%, 1%] = 总计50%
 * 
 * @param {string} walletAddr - 用户钱包地址
 * @param {object} robot - 机器人记录
 * @param {number} profit - 利润金额
 */
async function distributeReferralRewards(walletAddr, robot, profit) {
    try {
        // 使用数学工具导入的CEX奖励比例（统一管理，避免硬编码）
        // CEX_REFERRAL_RATES = [0.30, 0.10, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01]
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
            
            await dbQuery(
                `UPDATE user_balances 
                SET usdt_balance = usdt_balance + ?, updated_at = NOW() 
                WHERE wallet_address = ?`,
                [rewardAmount, referrerAddress]
            );
            
            await dbQuery(
                `INSERT INTO referral_rewards 
                (wallet_address, from_wallet, level, reward_rate, reward_amount, source_type, source_id, robot_name, source_amount, created_at) 
                VALUES (?, ?, ?, ?, ?, 'maturity', ?, ?, ?, NOW())`,
                [referrerAddress, walletAddr, level, rewardRate * 100, rewardAmount, robot.id, robot.robot_name, profit]
            );
            
            console.log(`[Referral] Level ${level} reward: ${rewardAmount.toFixed(4)} USDT to ${referrerAddress.slice(0, 10)}...`);
            
            currentWallet = referrerAddress;
        }
    } catch (error) {
        console.error('发放推荐奖励失败:', error.message);
    }
}

/**
 * 发放DEX机器人购买奖励（启动金额奖励 - 3级）
 * 
 * 数学公式: R_n = A × r_n
 * 其中: R_n = 第n级奖励, A = 启动金额, r_n = 第n级比例
 * 比例: [5%, 3%, 2%] = 总计10%
 * 
 * DEX机器人推荐奖励规则：
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
        // DEX_REFERRAL_RATES = [0.05, 0.03, 0.02]
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
