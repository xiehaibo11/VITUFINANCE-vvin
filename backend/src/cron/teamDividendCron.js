/**
 * ============================================================================
 * 团队经纪人每日分红定时任务（ES Module）
 * ============================================================================
 * 
 * 功能：
 * - 每天定时检查所有用户的经纪人等级
 * - 根据等级发放对应的每日分红
 * - 记录到 team_rewards 表
 * - 支持自动降级检测
 * 
 * 等级分红规则：
 * - 1级经纪人：每日 5 USDT
 * - 2级经纪人：每日 15 USDT
 * - 3级经纪人：每日 60 USDT
 * - 4级经纪人：每日 300 USDT
 * - 5级经纪人：每日 1,000 USDT
 * 
 * 使用方法：
 * import { setDbQuery as setTeamCronDbQuery, startTeamDividendCron } from './src/cron/teamDividendCron.js';
 * setTeamCronDbQuery(dbQuery);
 * startTeamDividendCron(); // 每天凌晨1点执行
 */

// ============================================================================
// 从 teamMath.js 导入经纪人等级配置（统一配置源，避免重复维护）
// ============================================================================

import {
    BROKER_LEVELS,             // 经纪人等级配置表
    MIN_ROBOT_PURCHASE,        // 最低购买金额要求 (20 USDT)
    MIN_ROBOT_PURCHASE_LV1,    // LV1门槛 (20 USDT)
    MIN_ROBOT_PURCHASE_LV2_5,  // LV2-5门槛 (100 USDT)
    getBrokerLevelConfig,      // 获取等级配置
    calculateBrokerRewards     // 计算奖励
} from '../utils/teamMath.js';

/**
 * 配置说明（来自 teamMath.js - 2024-12-24 公司文档标准）：
 * 
 * 核心规则：
 * 1. 合格成员门槛：
 *    - LV1: 购买 >= 20 USDT 机器人的用户
 *    - LV2-5: 购买 >= 100 USDT 机器人的用户
 * 2. 直推人数：直接推荐的合格成员数量
 * 3. 团队业绩：8级团队下线的机器人购买总额（price，active/expired）
 * 4. 下级经纪人：直推成员中达到指定等级的人数
 * 
 * 等级配置（公司文档标准）：
 * - 1级: 直推5人(≥20U), 业绩>1,000U, 日分红5U, 月薪150U, 1WLD/天
 * - 2级: 直推10人(≥100U), 2名1级, 业绩>5,000U, 日分红15U, 月薪450U, 2WLD/天
 * - 3级: 直推20人(≥100U), 2名2级, 业绩>20,000U, 日分红60U, 月薪1,800U, 3WLD/天
 * - 4级: 直推30人(≥100U), 2名3级, 业绩>80,000U, 日分红300U, 月薪9,000U, 5WLD/天
 * - 5级: 直推50人(≥100U), 2名4级, 业绩>200,000U, 日分红1,000U, 月薪30,000U, 10WLD/天
 * 
 * 修改配置请到: src/utils/teamMath.js
 */

// ============================================================================
// 数据库连接
// ============================================================================

let dbQuery = null;

/**
 * 设置数据库查询函数
 * @param {Function} queryFn - 数据库查询函数
 */
function setDbQuery(queryFn) {
    dbQuery = queryFn;
}

/**
 * Get YYYY-MM-DD date string in Beijing time (UTC+8).
 *
 * Why we need this:
 * - Team dividends are defined by business day in Beijing time.
 * - Both cron distribution and "instant" distribution must share the SAME day boundary,
 *   otherwise the same user could receive multiple dividends within one Beijing day.
 *
 * @param {Date} [date] - Base time (defaults to now)
 * @returns {string} YYYY-MM-DD (Beijing date)
 */
function getBeijingDateString(date = new Date()) {
    // Convert local time -> UTC milliseconds, then add +8 hours for Beijing.
    const utcMs = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
    const beijingMs = utcMs + (8 * 60 * 60 * 1000);
    return new Date(beijingMs).toISOString().slice(0, 10);
}

// ============================================================================
// 核心算法：计算用户经纪人等级
// ============================================================================

/**
 * 计算单个用户的经纪人等级
 * 
 * 算法流程：
 * 1. 获取用户的合格直推人数（LV1: >=20U, LV2-5: >=100U）
 * 2. 获取用户的团队总业绩
 * 3. 递归计算直推成员中各等级经纪人的数量
 * 4. 从高到低判断用户满足哪个等级的条件
 * 
 * @param {string} walletAddr - 用户钱包地址
 * @param {Set} visitedAddresses - 已访问地址集合（防止循环引用）
 * @returns {Promise<number>} 经纪人等级 (0-5)
 */
async function calculateBrokerLevel(walletAddr, visitedAddresses = new Set()) {
    try {
        // 防止循环引用
        if (visitedAddresses.has(walletAddr)) {
            return 0;
        }
        visitedAddresses.add(walletAddr);

        // Team member minimum requirements (customer rule, people-only minimal structure).
        // Hard gate for broker level qualification:
        // LV1=5, LV2=20, LV3=60, LV4=150, LV5=350 (downline members only).
        const MIN_TEAM_MEMBERS_BY_LEVEL = { 1: 5, 2: 20, 3: 60, 4: 150, 5: 350 };
        
        // 1. 获取合格直推人数 - LV1门槛 (>=20U)
        const directResultLV1 = await dbQuery(
            `SELECT COUNT(DISTINCT r.wallet_address) as count
             FROM user_referrals r
             INNER JOIN robot_purchases rp ON r.wallet_address = rp.wallet_address
             WHERE r.referrer_address = ?
               AND rp.price >= ?
               AND rp.status IN ('active', 'expired')`,
            [walletAddr, MIN_ROBOT_PURCHASE_LV1]
        );
        const directCountLV1 = parseInt(directResultLV1[0]?.count) || 0;
        
        // 2. 获取合格直推人数 - LV2-5门槛 (>=100U)
        const directResultLV2_5 = await dbQuery(
            `SELECT COUNT(DISTINCT r.wallet_address) as count
             FROM user_referrals r
             INNER JOIN robot_purchases rp ON r.wallet_address = rp.wallet_address
             WHERE r.referrer_address = ?
               AND rp.price >= ?
               AND rp.status IN ('active', 'expired')`,
            [walletAddr, MIN_ROBOT_PURCHASE_LV2_5]
        );
        const directCountLV2_5 = parseInt(directResultLV2_5[0]?.count) || 0;
        
        // 2. 获取所有团队成员（最多8级深度）
        let allTeamWallets = [];
        let currentLevelWallets = [walletAddr];
        
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

        const teamMembers = allTeamWallets.length;
        if (teamMembers < MIN_TEAM_MEMBERS_BY_LEVEL[1]) {
            return 0;
        }
        
        // 3. Calculate team total investment (8 levels downline robot purchases).
        // 3. Calculate team performance (8 levels downline only).
        //
        // IMPORTANT (Business Rule):
        // - Per latest requirement, team performance MUST be calculated by DOWNLINE DEPOSITS only,
        //   and MUST NOT include the broker's own deposit.
        // - Historical code used robot_purchases SUM(price), which can explain why some users
        //   receive daily dividends even when downline deposits are < 1000.
        //
        // Compatibility:
        // - You can override the performance source via env:
        //   TEAM_PERFORMANCE_MODE=robot_purchases  (legacy)
        //   TEAM_PERFORMANCE_MODE=deposit_records  (default)
        const TEAM_PERFORMANCE_MODE = (process.env.TEAM_PERFORMANCE_MODE || 'deposit_records').toLowerCase();
        let totalPerformance = 0;
        if (allTeamWallets.length > 0) {
            const teamPlaceholders = allTeamWallets.map(() => '?').join(',');
            if (TEAM_PERFORMANCE_MODE === 'robot_purchases') {
            const performanceResult = await dbQuery(
                `SELECT COALESCE(SUM(price), 0) as total
                 FROM robot_purchases
                 WHERE wallet_address IN (${teamPlaceholders})
                   AND status IN ('active', 'expired')`,
                allTeamWallets
            );
            totalPerformance = parseFloat(performanceResult[0]?.total) || 0;
            } else {
                // Default: deposit_records completed deposits (BSC/ETH all included)
                const performanceResult = await dbQuery(
                    `SELECT COALESCE(SUM(amount), 0) as total
                     FROM deposit_records
                     WHERE wallet_address IN (${teamPlaceholders})
                       AND status = 'completed'`,
                    allTeamWallets
                );
                totalPerformance = parseFloat(performanceResult[0]?.total) || 0;
            }
        }
        
        // 如果连1级的基本条件都不满足，直接返回0
        // LV1需要5个>=20U的直推，业绩>1000
        if (directCountLV1 < 5 || totalPerformance <= 1000) {
            return 0;
        }
        
        // 3. 获取下级经纪人统计（递归计算每个直推成员的等级）
        const subBrokerCounts = await getSubBrokerCounts(walletAddr, visitedAddresses);
        
        // 4. 从高到低判断等级（LV2-5使用>=100U门槛）
        // 5级：直推50人(>=100U)，2名4级经纪人，业绩>200,000
        if (teamMembers >= MIN_TEAM_MEMBERS_BY_LEVEL[5] && directCountLV2_5 >= 50 && totalPerformance > 200000 && subBrokerCounts[4] >= 2) {
            return 5;
        }
        
        // 4级：直推30人(>=100U)，2名3级经纪人，业绩>80,000
        if (teamMembers >= MIN_TEAM_MEMBERS_BY_LEVEL[4] && directCountLV2_5 >= 30 && totalPerformance > 80000 && subBrokerCounts[3] >= 2) {
            return 4;
        }
        
        // 3级：直推20人(>=100U)，2名2级经纪人，业绩>20,000
        if (teamMembers >= MIN_TEAM_MEMBERS_BY_LEVEL[3] && directCountLV2_5 >= 20 && totalPerformance > 20000 && subBrokerCounts[2] >= 2) {
            return 3;
        }
        
        // 2级：直推10人(>=100U)，2名1级经纪人，业绩>5,000
        if (teamMembers >= MIN_TEAM_MEMBERS_BY_LEVEL[2] && directCountLV2_5 >= 10 && totalPerformance > 5000 && subBrokerCounts[1] >= 2) {
            return 2;
        }
        
        // 1级：直推5人(>=20U)，业绩>1,000（无下级经纪人要求）
        if (teamMembers >= MIN_TEAM_MEMBERS_BY_LEVEL[1] && directCountLV1 >= 5 && totalPerformance > 1000) {
            return 1;
        }
        
        return 0;
        
    } catch (error) {
        console.error(`[TeamCron] 计算用户 ${walletAddr.slice(0, 10)}... 等级失败:`, error.message);
        return 0;
    }
}

/**
 * 获取用户的下级经纪人数量统计
 * 
 * 递归算法：统计直推成员中各等级经纪人的数量
 * 
 * @param {string} walletAddr - 用户钱包地址
 * @param {Set} visitedAddresses - 已访问地址集合
 * @returns {Promise<Object>} 各等级经纪人数量 { 1: n, 2: n, 3: n, 4: n, 5: n }
 */
async function getSubBrokerCounts(walletAddr, visitedAddresses = new Set()) {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    
    try {
        // 获取所有直推成员
        const directMembers = await dbQuery(
            'SELECT wallet_address FROM user_referrals WHERE referrer_address = ?',
            [walletAddr]
        );
        
        // 递归计算每个直推成员的等级
        for (const member of directMembers) {
            const memberWallet = member.wallet_address;
            
            // 跳过已访问的地址（防止循环）
            if (visitedAddresses.has(memberWallet)) {
                continue;
            }
            
            // 递归计算成员等级
            const memberLevel = await calculateBrokerLevel(memberWallet, new Set(visitedAddresses));
            
            // 统计各等级数量
            if (memberLevel >= 1 && memberLevel <= 5) {
                counts[memberLevel]++;
            }
        }
        
    } catch (error) {
        console.error(`[TeamCron] 获取下级经纪人统计失败:`, error.message);
    }
    
    return counts;
}

// ============================================================================
// 核心算法：发放每日分红
// ============================================================================

/**
 * 处理所有用户的每日分红
 * 
 * 算法流程：
 * 1. 获取所有有推荐关系的用户（潜在经纪人）
 * 2. 计算每个用户的经纪人等级
 * 3. 根据等级发放对应的每日分红
 * 4. 记录到 team_rewards 表
 * 5. 更新用户余额
 * 
 * @returns {Promise<Object>} 处理结果统计
 */
async function processAllTeamDividends() {
    if (!dbQuery) {
        console.error('[TeamCron] 数据库查询函数未设置');
        return { success: false, error: 'Database not configured' };
    }
    
    const startTime = new Date();
    // Use Beijing day boundary for all daily dividend operations.
    const today = getBeijingDateString(startTime); // YYYY-MM-DD (UTC+8)
    
    console.log(`[TeamCron] ========================================`);
    console.log(`[TeamCron] 开始处理团队每日分红 ${today}`);
    console.log(`[TeamCron] ========================================`);
    
    // 统计变量
    const stats = {
        totalUsers: 0,
        processedUsers: 0,
        levelCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        totalDividend: 0,
        errors: 0
    };
    
    try {
        // 1. 检查今天是否已经发放过（防止重复发放）
        const alreadyProcessed = await dbQuery(
            // IMPORTANT: Use reward_date (Beijing date) instead of created_at to avoid timezone mismatch.
            `SELECT COUNT(*) as count 
             FROM team_rewards 
             WHERE reward_date = ? AND reward_type = 'daily_dividend'`,
            [today]
        );
        
        if (parseInt(alreadyProcessed[0]?.count) > 0) {
            console.log(`[TeamCron] ⚠️ 今天已经发放过分红，跳过`);
            return { success: true, skipped: true, reason: 'Already processed today' };
        }
        
        // 2. 获取所有潜在经纪人（有推荐关系的用户）
        const potentialBrokers = await dbQuery(
            `SELECT DISTINCT referrer_address as wallet_address 
             FROM user_referrals 
             WHERE referrer_address IS NOT NULL`
        );
        
        stats.totalUsers = potentialBrokers.length;
        console.log(`[TeamCron] 找到 ${stats.totalUsers} 个潜在经纪人`);
        
        // 3. 逐个处理用户
        for (const user of potentialBrokers) {
            const walletAddr = user.wallet_address;
            
            try {
                // 计算用户经纪人等级
                const level = await calculateBrokerLevel(walletAddr);
                
                if (level > 0) {
                    // 获取等级配置
                    const config = BROKER_LEVELS[level];
                    const dividendAmount = config.dailyDividend;
                    
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
                        [dividendAmount, walletAddr]
                    );
                    
                    // 记录到 team_rewards 表
                    await dbQuery(
                        `INSERT INTO team_rewards 
                         (wallet_address, reward_type, broker_level, reward_amount, reward_date, created_at) 
                         VALUES (?, 'daily_dividend', ?, ?, ?, NOW())`,
                        [walletAddr, level, dividendAmount, today]
                    );
                    
                    // 更新统计
                    stats.levelCounts[level]++;
                    stats.totalDividend += dividendAmount;
                    stats.processedUsers++;
                    
                    console.log(`[TeamCron] ✅ ${walletAddr.slice(0, 10)}... : ${level}级经纪人, +${dividendAmount} USDT`);
                }
                
            } catch (error) {
                stats.errors++;
                console.error(`[TeamCron] ❌ 处理用户 ${walletAddr.slice(0, 10)}... 失败:`, error.message);
            }
        }
        
        // 4. 输出统计结果
        const endTime = new Date();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`[TeamCron] ========================================`);
        console.log(`[TeamCron] 处理完成，耗时 ${duration.toFixed(2)} 秒`);
        console.log(`[TeamCron] 总用户: ${stats.totalUsers}`);
        console.log(`[TeamCron] 达标经纪人: ${stats.processedUsers}`);
        console.log(`[TeamCron] 各等级分布:`);
        for (let i = 1; i <= 5; i++) {
            if (stats.levelCounts[i] > 0) {
                console.log(`[TeamCron]   ${i}级: ${stats.levelCounts[i]}人, 共 ${stats.levelCounts[i] * BROKER_LEVELS[i].dailyDividend} USDT`);
            }
        }
        console.log(`[TeamCron] 总发放: ${stats.totalDividend} USDT`);
        console.log(`[TeamCron] 错误数: ${stats.errors}`);
        console.log(`[TeamCron] ========================================`);
        
        return {
            success: true,
            date: today,
            stats,
            duration
        };
        
    } catch (error) {
        console.error('[TeamCron] 处理团队分红失败:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// 定时任务管理
// ============================================================================

let cronInterval = null;

/**
 * 启动团队分红定时任务
 * 默认每天凌晨1点执行
 * 
 * @param {number} hour - 执行小时（0-23），默认1点
 * @param {number} minute - 执行分钟（0-59），默认0分
 */
function startTeamDividendCron(hour = 1, minute = 0) {
    console.log(`[TeamCron] 启动团队分红定时任务，执行时间: 每天 ${hour}:${String(minute).padStart(2, '0')}`);
    
    // 清除已有的定时器
    if (cronInterval) {
        clearInterval(cronInterval);
    }
    
    // 计算距离下次执行的时间
    function getNextRunTime() {
        const now = new Date();
        const next = new Date();
        next.setHours(hour, minute, 0, 0);
        
        // 如果今天的时间已过，设置为明天
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }
        
        return next;
    }
    
    // 设置定时执行
    function scheduleNext() {
        const nextRun = getNextRunTime();
        const delay = nextRun.getTime() - Date.now();
        
        console.log(`[TeamCron] 下次执行时间: ${nextRun.toISOString()}`);
        
        setTimeout(async () => {
            // 执行分红处理
            await processAllTeamDividends();
            
            // 调度下一次执行
            scheduleNext();
        }, delay);
    }
    
    // 开始调度
    scheduleNext();
}

/**
 * 停止团队分红定时任务
 */
function stopTeamDividendCron() {
    if (cronInterval) {
        clearInterval(cronInterval);
        cronInterval = null;
        console.log('[TeamCron] 团队分红定时任务已停止');
    }
}

/**
 * 手动执行一次分红（用于测试）
 */
async function manualProcessDividends() {
    console.log('[TeamCron] 手动触发团队分红处理...');
    return await processAllTeamDividends();
}

// ============================================================================
// 即时分红处理（达到条件后立即发放）
// ============================================================================

/**
 * 处理单个用户的每日分红（即时发放）
 * 
 * @param {string} walletAddr - 用户钱包地址
 * @returns {Promise<Object>} 处理结果
 */
async function processWalletDailyDividend(walletAddr) {
    if (!dbQuery) {
        return { success: false, error: 'Database not configured', wallet_address: walletAddr };
    }
    
    try {
        // Use Beijing date to enforce "one dividend per user per Beijing day".
        const today = getBeijingDateString(new Date());

        // 1. 计算用户当前经纪人等级
        const level = await calculateBrokerLevel(walletAddr);
        
        if (level <= 0) {
            return { success: true, rewarded: false, level: 0, wallet_address: walletAddr, reason: 'Not qualified' };
        }
        
        // 2. Check if already rewarded today (Beijing date).
        // If a user reaches a higher level later within the same day, we do NOT stack rewards.
        // Business rule: "Pay only the current level dividend for the day."
        const alreadyRewarded = await dbQuery(
            `SELECT COUNT(*) as count FROM team_rewards 
             WHERE wallet_address = ? 
             AND reward_date = ?
             AND reward_type = 'daily_dividend'`,
            [walletAddr, today]
        );
        
        if (parseInt(alreadyRewarded[0]?.count) > 0) {
            return { success: true, rewarded: false, level, wallet_address: walletAddr, reason: 'Already rewarded today' };
        }
        
        // 3. 获取等级配置并发放分红
        const config = BROKER_LEVELS[level];
        const dividendAmount = config.dailyDividend;
        
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
            [dividendAmount, walletAddr]
        );
        
        // 记录到 team_rewards 表
        await dbQuery(
            `INSERT INTO team_rewards 
             (wallet_address, reward_type, broker_level, reward_amount, reward_date, created_at) 
             VALUES (?, 'daily_dividend', ?, ?, ?, NOW())`,
            [walletAddr, level, dividendAmount, today]
        );
        
        console.log(`[TeamCron] ✅ 即时分红: ${walletAddr.slice(0, 10)}... Level${level} +${dividendAmount} USDT`);
        
        return { 
            success: true, 
            rewarded: true, 
            level, 
            amount: dividendAmount,
            wallet_address: walletAddr 
        };
        
    } catch (error) {
        console.error(`[TeamCron] ❌ 即时分红失败 ${walletAddr.slice(0, 10)}...:`, error.message);
        return { success: false, error: error.message, wallet_address: walletAddr };
    }
}

/**
 * 处理用户上级链路的每日分红
 * 
 * 当用户进行充值或注册时，检查其所有上级是否达到分红条件
 * 
 * @param {string} walletAddr - 触发用户的钱包地址
 * @returns {Promise<Object>} 处理结果
 */
async function processUplineDailyDividends(walletAddr) {
    if (!dbQuery) {
        return { success: false, error: 'Database not configured' };
    }
    
    try {
        let currentAddr = walletAddr;
        let processedCount = 0;
        let rewardedCount = 0;
        const maxLevels = 8; // 最多检查8级上级
        
        for (let level = 0; level < maxLevels; level++) {
            // 获取当前用户的上级
            const referrerResult = await dbQuery(
                'SELECT referrer_address FROM user_referrals WHERE wallet_address = ?',
                [currentAddr]
            );
            
            if (referrerResult.length === 0 || !referrerResult[0].referrer_address) {
                break; // 没有上级了
            }
            
            const referrerAddr = referrerResult[0].referrer_address;
            processedCount++;
            
            // 处理上级的分红
            const result = await processWalletDailyDividend(referrerAddr);
            if (result.rewarded) {
                rewardedCount++;
            }
            
            // 继续向上查找
            currentAddr = referrerAddr;
        }
        
        return {
            success: true,
            processed: processedCount,
            rewarded: rewardedCount
        };
        
    } catch (error) {
        console.error('[TeamCron] ❌ 处理上级分红失败:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// 数据库表初始化
// ============================================================================

/**
 * 初始化 team_rewards 表
 */
async function initTeamRewardsTable() {
    if (!dbQuery) {
        console.error('[TeamCron] 数据库查询函数未设置，无法初始化表');
        return;
    }
    
    try {
        // 创建 team_rewards 表（如果不存在）
        await dbQuery(`
            CREATE TABLE IF NOT EXISTS team_rewards (
                id INT AUTO_INCREMENT PRIMARY KEY,
                wallet_address VARCHAR(42) NOT NULL,
                reward_type VARCHAR(50) NOT NULL DEFAULT 'daily_dividend',
                broker_level INT NOT NULL DEFAULT 0,
                reward_amount DECIMAL(20, 4) NOT NULL DEFAULT 0,
                reward_date DATE NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_wallet (wallet_address),
                INDEX idx_date (reward_date),
                INDEX idx_type (reward_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        
        console.log('[TeamCron] ✅ team_rewards 表初始化完成');
        
    } catch (error) {
        // 表可能已存在，忽略错误
        if (!error.message.includes('already exists')) {
            console.error('[TeamCron] 初始化 team_rewards 表失败:', error.message);
        }
    }
}

/**
 * 初始化 cron_logs 表（用于记录定时任务执行日志）
 */
async function initCronLogsTable() {
    if (!dbQuery) {
        console.error('[TeamCron] 数据库查询函数未设置，无法初始化 cron_logs 表');
        return;
    }
    
    try {
        // 创建 cron_logs 表（如果不存在）
        await dbQuery(`
            CREATE TABLE IF NOT EXISTS cron_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cron_name VARCHAR(100) NOT NULL,
                status ENUM('running', 'success', 'failed') NOT NULL DEFAULT 'running',
                message TEXT,
                stats JSON,
                started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                finished_at DATETIME,
                duration_seconds DECIMAL(10, 3),
                INDEX idx_cron_name (cron_name),
                INDEX idx_status (status),
                INDEX idx_started_at (started_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        
        console.log('[TeamCron] ✅ cron_logs 表初始化完成');
        
    } catch (error) {
        // 表可能已存在，忽略错误
        if (!error.message.includes('already exists')) {
            console.error('[TeamCron] 初始化 cron_logs 表失败:', error.message);
        }
    }
}

// ============================================================================
// 导出模块
// ============================================================================

export {
    // 配置
    BROKER_LEVELS,
    MIN_ROBOT_PURCHASE,
    MIN_ROBOT_PURCHASE_LV1,
    MIN_ROBOT_PURCHASE_LV2_5,
    
    // 数据库
    setDbQuery,
    initTeamRewardsTable,
    initCronLogsTable,
    
    // 核心算法
    calculateBrokerLevel,
    getSubBrokerCounts,
    processAllTeamDividends,
    
    // 即时分红
    processWalletDailyDividend,
    processUplineDailyDividends,
    
    // 定时任务
    startTeamDividendCron,
    stopTeamDividendCron,
    manualProcessDividends
};

// ============================================================================
// 命令行测试
// ============================================================================

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
    console.log('\n' + '='.repeat(60));
    console.log('    团队经纪人每日分红 - 配置验证');
    console.log('='.repeat(60) + '\n');
    
    console.log('📊 等级配置一览:');
    console.log('┌──────┬──────────┬──────────┬────────────┬──────────┬────────┐');
    console.log('│ 等级 │ 直推人数 │ 下级经纪 │ 团队业绩   │ 日分红   │ 日WLD  │');
    console.log('├──────┼──────────┼──────────┼────────────┼──────────┼────────┤');
    for (let i = 1; i <= 5; i++) {
        const c = BROKER_LEVELS[i];
        const subReq = c.minSubBrokers > 0 ? `${c.minSubBrokers}名${c.subBrokerLevel}级` : '-';
        console.log(`│  ${i}级 │ ≥${String(c.minDirectReferrals).padEnd(6)} │ ${subReq.padEnd(8)} │ >${String(c.minTeamPerformance).padStart(9)} │ ${String(c.dailyDividend).padStart(7)}$ │ ${String(c.dailyWLD).padStart(5)}  │`);
    }
    console.log('└──────┴──────────┴──────────┴────────────┴──────────┴────────┘');
    
    console.log('\n📐 算法说明:');
    console.log('1. 合格成员门槛:');
    console.log('   - LV1: 购买 >= 20 USDT 机器人的用户');
    console.log('   - LV2-5: 购买 >= 100 USDT 机器人的用户');
    console.log('2. 等级判断: 从5级到1级依次检查，返回第一个满足的等级');
    console.log('3. 下级经纪人: 递归计算直推成员中各等级经纪人数量');
    console.log('4. 防重复: 每天只发放一次，通过日期检查防止重复');
    
    console.log('\n' + '='.repeat(60) + '\n');
}

