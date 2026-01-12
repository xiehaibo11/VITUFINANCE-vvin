/**
 * ============================================================================
 * 机器人到期处理定时任务（ES Module）
 * ============================================================================
 * 
 * 功能：
 * - 定时检查并处理所有到期的机器人
 * - 自动返还本金和利息
 * - 更新机器人状态
 * - 发放推荐奖励
 * 
 * 执行频率建议：每小时执行一次
 * 
 * 使用方法：
 * 在 server.js 中添加：
 * import { setDbQuery as setCronDbQuery, startCronJob } from './src/cron/robotExpiryCron.js';
 * setCronDbQuery(dbQuery);
 * startCronJob(60);
 */

import {
    getRobotConfig,
    calculateHighRobotReturn
} from '../config/robotConfig.js';

// Balance helpers (prevents “expired but not refunded” edge cases)
import {
    normalizeWalletAddress,
    creditUsdtBalance,
    creditFrozenUsdtBalance,
    ensureUserBalanceRow
} from '../utils/userBalanceUtils.js';

// 导入推荐奖励数学工具（统一管理奖励比例）
import {
    CEX_REFERRAL_RATES,            // CEX 8级奖励比例
    calculateLevelReward           // 单级奖励计算函数
} from '../utils/referralMath.js';

/**
 * 数据库查询函数
 * @type {Function}
 */
let dbQuery = null;

/**
 * 设置数据库查询函数
 * @param {Function} queryFn
 */
function setDbQuery(queryFn) {
    dbQuery = queryFn;
}

/**
 * 格式化日期时间（使用本地时区）
 * @param {Date} date
 * @returns {string} YYYY-MM-DD HH:MM:SS (local time)
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

/**
 * 验证钱包地址格式
 * @param {string} address
 * @returns {boolean}
 */
function isValidWalletAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

/**
 * 处理所有到期机器人（主函数）
 * 
 * 处理流程：
 * 1. 查询所有 status='active' 且 end_time <= NOW() 的机器人
 * 2. 按类型分别处理返还逻辑
 * 3. 更新状态为 expired
 * 4. 发放推荐奖励（High 机器人）
 */
async function processAllExpiredRobots() {
    if (!dbQuery) {
        console.error('[Cron] Database query function not set');
        return { success: false, error: 'Database not configured' };
    }
    
    const startTime = new Date();
    console.log(`[Cron] Starting expired robots processing at ${formatDateTime(startTime)}`);
    
    let processed = 0;
    let failed = 0;
    let totalReturned = 0;
    
    try {
        // 1. 获取所有到期的活跃机器人
        const expiredRobots = await dbQuery(
            `SELECT * FROM robot_purchases 
            WHERE status = 'active' AND end_time <= NOW() AND (expired_at IS NULL)
            ORDER BY end_time ASC`
        );
        
        console.log(`[Cron] Found ${expiredRobots.length} expired robots to process`);
        
        // 2. 逐个处理
        for (const robot of expiredRobots) {
            try {
                const result = await processExpiredRobot(robot);
                if (result.success) {
                    processed++;
                    totalReturned += result.returnAmount || 0;
                } else {
                    failed++;
                    console.error(`[Cron] Failed to process robot ${robot.id}: ${result.error}`);
                }
            } catch (error) {
                failed++;
                console.error(`[Cron] Error processing robot ${robot.id}:`, error.message);
            }
        }
        
        const endTime = new Date();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`[Cron] Completed in ${duration.toFixed(2)}s: processed=${processed}, failed=${failed}, totalReturned=${totalReturned.toFixed(4)} USDT`);
        
        return {
            success: true,
            processed,
            failed,
            totalReturned,
            duration
        };
        
    } catch (error) {
        console.error('[Cron] Fatal error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * 处理单个到期机器人
 * @param {object} robot - 机器人记录
 * @returns {object} 处理结果
 */
async function processExpiredRobot(robot) {
    // Normalize wallet address (avoid casing mismatch that causes silent UPDATE 0 rows)
    const walletAddr = normalizeWalletAddress(robot.wallet_address);
    if (!walletAddr || !isValidWalletAddress(walletAddr)) {
        // Do not mutate state when wallet address is invalid.
        return { success: false, error: 'Invalid wallet address' };
    }

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
        return { success: true, returnAmount: 0, skipped: true, reason: 'already_claimed' };
    }

    // Check if user is banned (frozen accounts do not receive withdrawable refunds).
    const userStatus = await dbQuery(
        'SELECT is_banned FROM user_balances WHERE wallet_address = ?',
        [walletAddr]
    );
    const isBannedUser = userStatus.length > 0 && Number(userStatus[0].is_banned) === 1;
    
    const config = getRobotConfig(robot.robot_name);
    if (!config) {
        // Release the claim so it can be retried after config fixes.
        await dbQuery(
            `UPDATE robot_purchases SET expired_at = NULL, updated_at = NOW() WHERE id = ? AND status = 'active'`,
            [robot.id]
        );
        return { success: false, error: 'Config not found' };
    }
    
    let returnAmount = 0;
    let profitAmount = 0;
    let refundCredited = false; // Critical idempotency flag: if true, NEVER unlock/redo refund.
    
    try {
        // For frozen accounts:
        // - Principal should still be returned to available balance (usdt_balance)
        // - Profit (if any) must be credited to frozen balance (frozen_usdt) and remain non-withdrawable
        let principalReturn = 0;
        let frozenProfitReturn = 0;

        // 根据机器人类型计算返还金额
        switch (robot.robot_type) {
            case 'high':
                // High 机器人：
                // - If quantified: return principal + profit (expected_return)
                // - If NOT quantified (edge case): return principal only (do not trap customer funds)
                if (robot.is_quantified !== 1) {
                    returnAmount = parseFloat(robot.price);
                    profitAmount = 0;
                    break;
                }
                
                // 已量化：返还本金+利息
                returnAmount = parseFloat(robot.expected_return);
                profitAmount = returnAmount - parseFloat(robot.price);
                break;
                
            case 'grid':
            case 'cex':
                // Grid/CEX 机器人：返还本金
                if (config.return_principal) {
                    returnAmount = parseFloat(robot.price);
                }
                break;
    
            case 'dex':
                // DEX 机器人：只量化一次，到期返本返息
                // - If quantified: return expected_return (principal + profit)
                // - If NOT quantified (edge case): return principal only
                if (robot.is_quantified === 1) {
                    returnAmount = parseFloat(robot.expected_return) || parseFloat(robot.price);
                    profitAmount = returnAmount - parseFloat(robot.price);
                } else {
                    returnAmount = parseFloat(robot.price);
                    profitAmount = 0;
                }
                break;
                
            default:
                throw new Error(`Unknown robot type: ${robot.robot_type}`);
        }

        // Split maturity return for banned/frozen users:
        // - principalReturn goes to usdt_balance
        // - frozenProfitReturn goes to frozen_usdt
        if (isBannedUser && returnAmount > 0) {
            const priceAmount = parseFloat(robot.price) || 0;
            // Principal is capped by both price and returnAmount (defensive).
            principalReturn = Math.max(0, Math.min(priceAmount, returnAmount));
            frozenProfitReturn = Math.max(0, returnAmount - principalReturn);
        }
        
        // Execute maturity credit
        if (returnAmount > 0) {
            // Ensure balance row exists then credit safely (prevents UPDATE 0 rows)
            await ensureUserBalanceRow(dbQuery, walletAddr);
            // If the user is frozen, credit to frozen_usdt so it is NOT withdrawable.
            if (isBannedUser) {
                // Return principal to available balance
                if (principalReturn > 0) {
                    await creditUsdtBalance(dbQuery, walletAddr, principalReturn);
                }
                // Keep profit frozen
                if (frozenProfitReturn > 0) {
                    await creditFrozenUsdtBalance(dbQuery, walletAddr, frozenProfitReturn);
                }
            } else {
                await creditUsdtBalance(dbQuery, walletAddr, returnAmount);
            }
            refundCredited = true;
            
            // Record transaction history (principal refund)
            const isReturnWithProfit = (robot.robot_type === 'high' || robot.robot_type === 'dex') && robot.is_quantified === 1;
            const txDescriptionBase = isReturnWithProfit
                ? `${robot.robot_name} 到期返还（本金+收益） #robot_purchase_id=${robot.id}`
                : `${robot.robot_name} 到期返还本金 #robot_purchase_id=${robot.id}`;
            const txDescription = isBannedUser
                ? (frozenProfitReturn > 0
                    ? `${txDescriptionBase}（本金已返还，收益冻结）`
                    : `${txDescriptionBase}（冻结用户：仅返还本金）`)
                : txDescriptionBase;
            
            // IMPORTANT:
            // If this insert fails after balance credit, we MUST NOT unlock/redo refund.
            // So we treat it as best-effort logging.
            try {
                await dbQuery(
                    `INSERT INTO transaction_history 
                    (wallet_address, tx_type, amount, currency, description, status, created_at) 
                    VALUES (?, 'refund', ?, 'USDT', ?, 'completed', NOW())`,
                    [walletAddr, returnAmount, txDescription]
                );
            } catch (logErr) {
                console.error('[Cron] Failed to write transaction_history (refund already credited):', logErr.message);
            }
            
            if (isBannedUser) {
                console.log(
                    `[Cron] Frozen user maturity credit: principal=${principalReturn.toFixed(4)} USDT, profit_frozen=${frozenProfitReturn.toFixed(4)} USDT ` +
                    `wallet=${walletAddr.slice(0, 10)}... robot=${robot.robot_name}`
                );
            } else {
                console.log(`[Cron] Returned ${returnAmount.toFixed(4)} USDT to ${walletAddr.slice(0, 10)}... (robot: ${robot.robot_name})`);
            }
        }
        
        // 更新机器人状态
        try {
            await dbQuery(
                `UPDATE robot_purchases 
                SET status = 'expired', 
                    total_profit = CASE WHEN robot_type IN ('high','dex') THEN ? ELSE total_profit END,
                    updated_at = NOW() 
                WHERE id = ?`,
                [profitAmount, robot.id]
            );
        } catch (statusErr) {
            // If refund already credited, do not unlock. Keep claim to prevent duplicate refunds.
            console.error('[Cron] Failed to update robot status after expiry processing:', statusErr.message);
        }
        
        // High/DEX 机器人：记录收益并发放推荐奖励（基于收益）
        // Business rule:
        // - If the user is frozen, maturity funds are credited to frozen_usdt (not withdrawable),
        //   therefore we do NOT distribute referral rewards on that profit.
        if (!isBannedUser && (robot.robot_type === 'high' || robot.robot_type === 'dex') && profitAmount > 0) {
            // Non-critical: best-effort logs/rewards should not cause unlock/double refund.
            try {
                await dbQuery(
                    `INSERT INTO robot_earnings 
                    (wallet_address, robot_purchase_id, robot_name, earning_amount, created_at) 
                    VALUES (?, ?, ?, ?, NOW())`,
                    [walletAddr, robot.id, robot.robot_name, profitAmount]
                );
            } catch (earnErr) {
                console.error('[Cron] Failed to write robot_earnings (refund state preserved):', earnErr.message);
            }
            
            try {
                await distributeReferralRewards(walletAddr, robot, profitAmount);
            } catch (refErr) {
                console.error('[Cron] Failed to distribute referral rewards (refund state preserved):', refErr.message);
            }
        }
        
        return { success: true, returnAmount, profitAmount };
        
    } catch (error) {
        // Only unlock if refund definitely did NOT happen.
        // If refund was credited, keep the lock to prevent double refunds.
        if (!refundCredited) {
            await dbQuery(
                `UPDATE robot_purchases SET expired_at = NULL, updated_at = NOW() WHERE id = ? AND status = 'active'`,
                [robot.id]
            );
        }
        return { success: false, error: error.message };
    }
}

/**
 * 发放推荐奖励（8级）- 使用数学工具统一管理
 * 
 * 数学公式: R_n = P × r_n
 * 比例: CEX_REFERRAL_RATES = [30%, 10%, 5%, 1%, 1%, 1%, 1%, 1%] = 总计50%
 * 
 * @param {string} walletAddr - 用户钱包地址
 * @param {object} robot - 机器人记录
 * @param {number} profit - 利润金额
 */
async function distributeReferralRewards(walletAddr, robot, profit) {
    // 使用数学工具导入的CEX奖励比例
    const maxLevel = CEX_REFERRAL_RATES.length; // 8级
    let currentWallet = walletAddr;
    let totalRewards = 0;
    
    try {
        for (let level = 1; level <= maxLevel; level++) {
            // 查找上级
            const referrerResult = await dbQuery(
                'SELECT referrer_address FROM user_referrals WHERE wallet_address = ? AND referrer_address IS NOT NULL',
                [currentWallet]
            );
            
            if (referrerResult.length === 0) break;
            
            const referrerAddress = referrerResult[0].referrer_address;
            if (!referrerAddress || !isValidWalletAddress(referrerAddress)) break;
            // 使用数学工具计算奖励
            const rewardRate = CEX_REFERRAL_RATES[level - 1];
            const rewardAmount = calculateLevelReward(profit, rewardRate);
            
            // 确保上级用户有余额记录
            await dbQuery(
                `INSERT IGNORE INTO user_balances (wallet_address, usdt_balance, wld_balance, created_at, updated_at) 
                VALUES (?, 0, 0, NOW(), NOW())`,
                [referrerAddress]
            );

            // Idempotency check:
            // Prevent duplicate maturity rewards when the cron job overlaps or is retried.
            const existingReward = await dbQuery(
                `SELECT id FROM referral_rewards
                 WHERE wallet_address = ? AND from_wallet = ? AND level = ? AND source_type = 'maturity' AND source_id = ?
                 LIMIT 1`,
                [referrerAddress, walletAddr, level, robot.id]
            );

            if (existingReward.length > 0) {
                console.log(`[Cron] Skip duplicate maturity reward (exists id=${existingReward[0].id}) level=${level} robot_purchase_id=${robot.id}`);
                currentWallet = referrerAddress;
                continue;
            }

            // Credit referrer balance then write reward record
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
            
            totalRewards += rewardAmount;
            currentWallet = referrerAddress;
        }
        
        if (totalRewards > 0) {
            console.log(`[Cron] Distributed ${totalRewards.toFixed(4)} USDT referral rewards for robot ${robot.id}`);
        }
        
    } catch (error) {
        console.error('[Cron] Failed to distribute referral rewards:', error.message);
    }
}

/**
 * 获取即将到期的机器人（预警用）
 * @param {number} hoursAhead - 提前多少小时
 * @returns {array} 即将到期的机器人列表
 */
async function getUpcomingExpirations(hoursAhead = 24) {
    if (!dbQuery) return [];
    
    try {
        const robots = await dbQuery(
            `SELECT *, TIMESTAMPDIFF(HOUR, NOW(), end_time) as hours_remaining
            FROM robot_purchases 
            WHERE status = 'active' 
            AND end_time > NOW() 
            AND end_time <= DATE_ADD(NOW(), INTERVAL ? HOUR)
            ORDER BY end_time ASC`,
            [hoursAhead]
        );
        
        return robots;
        
    } catch (error) {
        console.error('[Cron] Failed to get upcoming expirations:', error.message);
        return [];
    }
}

/**
 * 获取到期统计信息
 * @returns {object} 统计信息
 */
async function getExpiryStats() {
    if (!dbQuery) return null;
    
    try {
        // 今天到期数量
        const todayExpiring = await dbQuery(
            `SELECT COUNT(*) as count, SUM(price) as total_value
            FROM robot_purchases 
            WHERE status = 'active' AND DATE(end_time) = CURDATE()`
        );
        
        // 本周到期数量
        const weekExpiring = await dbQuery(
            `SELECT COUNT(*) as count, SUM(price) as total_value
            FROM robot_purchases 
            WHERE status = 'active' 
            AND end_time > NOW() 
            AND end_time <= DATE_ADD(NOW(), INTERVAL 7 DAY)`
        );
        
        // 待处理的已到期数量
        const pendingExpired = await dbQuery(
            `SELECT COUNT(*) as count, SUM(price) as total_value
            FROM robot_purchases 
            WHERE status = 'active' AND end_time <= NOW()`
        );
        
        return {
            today: {
                count: todayExpiring[0]?.count || 0,
                total_value: parseFloat(todayExpiring[0]?.total_value || 0)
            },
            week: {
                count: weekExpiring[0]?.count || 0,
                total_value: parseFloat(weekExpiring[0]?.total_value || 0)
            },
            pending: {
                count: pendingExpired[0]?.count || 0,
                total_value: parseFloat(pendingExpired[0]?.total_value || 0)
            }
        };
        
    } catch (error) {
        console.error('[Cron] Failed to get expiry stats:', error.message);
        return null;
    }
}

/**
 * 启动定时任务
 * @param {number} intervalMinutes - 执行间隔（分钟）
 * @returns {object} 定时器句柄
 */
function startCronJob(intervalMinutes = 60) {
    console.log(`[Cron] Starting robot expiry cron job, interval: ${intervalMinutes} minutes`);
    
    // 立即执行一次
    processAllExpiredRobots();
    
    // 设置定时执行
    const timer = setInterval(() => {
        processAllExpiredRobots();
    }, intervalMinutes * 60 * 1000);
    
    return {
        stop: () => {
            clearInterval(timer);
            console.log('[Cron] Robot expiry cron job stopped');
        }
    };
}

// 导出模块（ES Module 语法）
export {
    setDbQuery,
    processAllExpiredRobots,
    processExpiredRobot,
    getUpcomingExpirations,
    getExpiryStats,
    startCronJob
};
