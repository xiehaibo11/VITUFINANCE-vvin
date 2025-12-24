/**
 * 前端团队经纪人等级计算工具
 * 
 * 用途：帮助用户计算经纪人等级、升级差距、收益预测
 * 注意：实际等级判定由后端执行，这里仅供前端展示参考
 */

// ============================================================================
// 经纪人等级配置（与后端保持一致）
// ============================================================================

/**
 * 经纪人等级配置表
 */
export const BROKER_LEVELS = [
    {
        level: 0,
        name: '普通用户',
        nameEn: 'Regular User',
        minDirectReferrals: 0,
        minSubBrokers: 0,
        subBrokerLevel: 0,
        minTeamPerformance: 0,
        dailyDividend: 0,
        monthlyIncome: 0,
        dailyWLD: 0
    },
    {
        level: 1,
        name: '一级经纪人',
        nameEn: 'Level 1 Broker',
        minDirectReferrals: 5,      // 直推5人
        minSubBrokers: 0,           // 无下级经纪人要求
        subBrokerLevel: 0,
        minTeamPerformance: 1000,   // 业绩>1,000 USDT
        dailyDividend: 5,           // 每日分红5 USDT
        monthlyIncome: 150,         // 每月150 USDT
        dailyWLD: 1                 // 每日1 WLD
    },
    {
        level: 2,
        name: '二级经纪人',
        nameEn: 'Level 2 Broker',
        minDirectReferrals: 10,     // 直推10人
        minSubBrokers: 2,           // 需要2名1级经纪人
        subBrokerLevel: 1,
        minTeamPerformance: 5000,   // 业绩>5,000 USDT
        dailyDividend: 15,          // 每日分红15 USDT
        monthlyIncome: 450,         // 每月450 USDT
        dailyWLD: 2                 // 每日2 WLD
    },
    {
        level: 3,
        name: '三级经纪人',
        nameEn: 'Level 3 Broker',
        minDirectReferrals: 20,     // 直推20人
        minSubBrokers: 2,           // 需要2名2级经纪人
        subBrokerLevel: 2,
        minTeamPerformance: 20000,  // 业绩>20,000 USDT
        dailyDividend: 60,          // 每日分红60 USDT
        monthlyIncome: 1800,        // 每月1,800 USDT
        dailyWLD: 3                 // 每日3 WLD
    },
    {
        level: 4,
        name: '四级经纪人',
        nameEn: 'Level 4 Broker',
        minDirectReferrals: 30,     // 直推30人
        minSubBrokers: 2,           // 需要2名3级经纪人
        subBrokerLevel: 3,
        minTeamPerformance: 80000,  // 业绩>80,000 USDT
        dailyDividend: 300,         // 每日分红300 USDT
        monthlyIncome: 9000,        // 每月9,000 USDT
        dailyWLD: 5                 // 每日5 WLD
    },
    {
        level: 5,
        name: '五级经纪人',
        nameEn: 'Level 5 Broker',
        minDirectReferrals: 50,     // 直推50人
        minSubBrokers: 2,           // 需要2名4级经纪人
        subBrokerLevel: 4,
        minTeamPerformance: 200000, // 业绩>200,000 USDT
        dailyDividend: 1000,        // 每日分红1,000 USDT
        monthlyIncome: 30000,       // 每月30,000 USDT
        dailyWLD: 10                // 每日10 WLD
    }
];

/**
 * 最低购买金额要求（只有>=100U的机器人才计入团队）
 */
export const MIN_ROBOT_PURCHASE = 100;

// ============================================================================
// 核心计算函数
// ============================================================================

/**
 * Calculate minimal total members required for a broker level (people-only structure).
 *
 * Business background (customer requirement):
 * - L1 needs 5 direct members.
 * - L2 needs 10 direct members + 2 members who each reach L1.
 * - L3 needs 20 direct members + 2 members who each reach L2.
 * - L4 needs 30 direct members + 2 members who each reach L3.
 * - L5 needs 50 direct members + 2 members who each reach L4.
 *
 * Minimal structure recursion:
 * - T1 = D1
 * - Tn = Dn + (Sn × T(n-1)), where Sn is the required subordinate broker count (typically 2).
 *
 * IMPORTANT:
 * - This is a "people-count only" minimal model assuming teams do NOT overlap.
 * - Real upgrades still depend on investment/performance requirements handled by backend.
 *
 * @param {number} level - Broker level (1-5)
 * @returns {number} Minimal total members needed to reach the level
 */
export function getMinimalTotalMembersForLevel(level) {
    const lv = Number(level);
    if (!Number.isFinite(lv) || lv <= 0) return 0;
    if (lv > 5) return getMinimalTotalMembersForLevel(5);

    // Base case: level 1.
    if (lv === 1) {
        return Number(BROKER_LEVELS[1]?.minDirectReferrals || 0);
    }

    const config = BROKER_LEVELS[lv];
    const direct = Number(config?.minDirectReferrals || 0);
    const subs = Number(config?.minSubBrokers || 0);

    // Recursive minimal size (people-only).
    return direct + (subs * getMinimalTotalMembersForLevel(lv - 1));
}

/**
 * 获取经纪人等级配置
 * 
 * @param {number} level - 等级 (0-5)
 * @returns {Object} 等级配置
 */
export function getBrokerLevelConfig(level) {
    if (level < 0 || level > 5) {
        return BROKER_LEVELS[0];
    }
    return BROKER_LEVELS[level];
}

/**
 * 计算用户当前应该达到的经纪人等级
 * 
 * @param {Object} userData - 用户数据
 * @param {number} userData.directReferrals - 合格直推人数
 * @param {number} userData.teamPerformance - 团队总业绩
 * @param {Array<number>} userData.subBrokerCounts - 各级别经纪人数量
 * @returns {Object} 等级评估结果
 */
export function calculateBrokerLevel(userData) {
    const { directReferrals = 0, teamPerformance = 0, subBrokerCounts = [] } = userData;
    
    let qualifiedLevel = 0;
    const evaluations = [];
    
    // 从高到低检查各等级
    for (let level = 5; level >= 1; level--) {
        const evaluation = evaluateLevelRequirements(
            level, 
            directReferrals, 
            teamPerformance, 
            subBrokerCounts
        );
        
        evaluations.unshift(evaluation); // 从1级到5级排列
        
        if (evaluation.qualified && qualifiedLevel === 0) {
            qualifiedLevel = level;
        }
    }
    
    return {
        currentLevel: qualifiedLevel,
        levelName: BROKER_LEVELS[qualifiedLevel].name,
        levelNameEn: BROKER_LEVELS[qualifiedLevel].nameEn,
        config: BROKER_LEVELS[qualifiedLevel],
        evaluations,
        userData
    };
}

/**
 * 评估单个等级的要求是否满足
 * 
 * @param {number} level - 目标等级
 * @param {number} directReferrals - 合格直推人数
 * @param {number} teamPerformance - 团队总业绩
 * @param {Array<number>} subBrokerCounts - 各级别经纪人数量
 * @returns {Object} 评估结果
 */
export function evaluateLevelRequirements(level, directReferrals, teamPerformance, subBrokerCounts) {
    const config = BROKER_LEVELS[level];
    
    // 检查直推人数
    const directCheck = directReferrals >= config.minDirectReferrals;
    const directGap = Math.max(0, config.minDirectReferrals - directReferrals);
    
    // 检查团队业绩
    const performanceCheck = teamPerformance > config.minTeamPerformance;
    const performanceGap = Math.max(0, config.minTeamPerformance - teamPerformance + 1);
    
    // 检查下级经纪人
    let subBrokerCheck = true;
    let subBrokerGap = 0;
    
    if (config.minSubBrokers > 0) {
        const requiredLevel = config.subBrokerLevel;
        const currentSubBrokers = subBrokerCounts[requiredLevel] || 0;
        subBrokerCheck = currentSubBrokers >= config.minSubBrokers;
        subBrokerGap = Math.max(0, config.minSubBrokers - currentSubBrokers);
    }
    
    const qualified = directCheck && performanceCheck && subBrokerCheck;
    
    return {
        level,
        levelName: config.name,
        levelNameEn: config.nameEn,
        qualified,
        checks: {
            directReferrals: {
                required: config.minDirectReferrals,
                current: directReferrals,
                passed: directCheck,
                gap: directGap
            },
            teamPerformance: {
                required: config.minTeamPerformance,
                current: teamPerformance,
                passed: performanceCheck,
                gap: performanceGap
            },
            subBrokers: {
                required: config.minSubBrokers,
                requiredLevel: config.subBrokerLevel,
                current: subBrokerCounts[config.subBrokerLevel] || 0,
                passed: subBrokerCheck,
                gap: subBrokerGap
            }
        },
        rewards: {
            dailyDividend: config.dailyDividend,
            monthlyIncome: config.monthlyIncome,
            dailyWLD: config.dailyWLD
        }
    };
}

/**
 * 计算经纪人奖励
 * 
 * @param {number} level - 经纪人等级
 * @param {number} days - 计算天数
 * @returns {Object} 奖励计算结果
 */
export function calculateBrokerRewards(level, days = 1) {
    const config = getBrokerLevelConfig(level);
    
    return {
        level,
        levelName: config.name,
        days,
        rewards: {
            dailyDividend: config.dailyDividend,
            totalDividend: config.dailyDividend * days,
            dailyWLD: config.dailyWLD,
            totalWLD: config.dailyWLD * days
        },
        monthly: {
            income: config.monthlyIncome,
            days: 30
        }
    };
}

/**
 * 计算升级到下一等级需要的差距
 * 
 * @param {Object} userData - 用户数据
 * @returns {Object} 升级差距分析
 */
export function calculateUpgradeGap(userData) {
    const currentResult = calculateBrokerLevel(userData);
    const currentLevel = currentResult.currentLevel;
    
    if (currentLevel >= 5) {
        return {
            currentLevel: 5,
            currentLevelName: '五级经纪人',
            isMaxLevel: true,
            message: '您已达到最高等级！'
        };
    }
    
    const nextLevel = currentLevel + 1;
    const nextConfig = BROKER_LEVELS[nextLevel];
    const evaluation = currentResult.evaluations[nextLevel - 1];
    
    return {
        currentLevel,
        currentLevelName: BROKER_LEVELS[currentLevel].name,
        nextLevel,
        nextLevelName: nextConfig.name,
        isMaxLevel: false,
        requirements: evaluation.checks,
        upgradeNeeded: {
            directReferrals: evaluation.checks.directReferrals.gap,
            teamPerformance: evaluation.checks.teamPerformance.gap,
            subBrokers: evaluation.checks.subBrokers.gap
        },
        nextLevelRewards: {
            dailyDividend: nextConfig.dailyDividend,
            monthlyIncome: nextConfig.monthlyIncome,
            dailyWLD: nextConfig.dailyWLD
        },
        rewardIncrease: {
            dailyDividend: nextConfig.dailyDividend - BROKER_LEVELS[currentLevel].dailyDividend,
            monthlyIncome: nextConfig.monthlyIncome - BROKER_LEVELS[currentLevel].monthlyIncome,
            dailyWLD: nextConfig.dailyWLD - BROKER_LEVELS[currentLevel].dailyWLD
        }
    };
}

/**
 * 检查是否会降级
 * 
 * @param {number} currentLevel - 当前等级
 * @param {Object} userData - 用户数据
 * @returns {Object} 降级风险分析
 */
export function checkDemotionRisk(currentLevel, userData) {
    if (currentLevel <= 0) {
        return {
            currentLevel: 0,
            atRisk: false,
            message: '您是普通用户，无降级风险'
        };
    }
    
    const newResult = calculateBrokerLevel(userData);
    const newLevel = newResult.currentLevel;
    
    if (newLevel < currentLevel) {
        return {
            currentLevel,
            newLevel,
            atRisk: true,
            willDemote: true,
            demotionLevels: currentLevel - newLevel,
            reason: '未达到当前等级的维持条件'
        };
    }
    
    return {
        currentLevel,
        newLevel,
        atRisk: false,
        willDemote: false,
        message: '您的等级安全，无降级风险'
    };
}

/**
 * 预测收益潜力
 * 
 * @param {number} currentLevel - 当前等级
 * @param {number} projectedDays - 预测天数
 * @returns {Object} 收益预测
 */
export function projectEarnings(currentLevel, projectedDays = 30) {
    const config = getBrokerLevelConfig(currentLevel);
    
    const projectedDividend = config.dailyDividend * projectedDays;
    const projectedWLD = config.dailyWLD * projectedDays;
    
    // 与各等级对比
    const comparison = [];
    for (let level = 1; level <= 5; level++) {
        const levelConfig = BROKER_LEVELS[level];
        comparison.push({
            level,
            levelName: levelConfig.name,
            projectedDividend: levelConfig.dailyDividend * projectedDays,
            projectedWLD: levelConfig.dailyWLD * projectedDays,
            differenceFromCurrent: (levelConfig.dailyDividend - config.dailyDividend) * projectedDays
        });
    }
    
    return {
        currentLevel,
        levelName: config.name,
        projectedDays,
        projected: {
            dividendTotal: projectedDividend,
            wldTotal: projectedWLD
        },
        daily: {
            dividend: config.dailyDividend,
            wld: config.dailyWLD
        },
        comparison
    };
}

/**
 * 格式化金额显示
 * 
 * @param {number} amount - 金额
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的金额
 */
export function formatAmount(amount, decimals = 2) {
    return parseFloat(amount).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * 获取等级徽章颜色
 * 
 * @param {number} level - 等级
 * @returns {string} 颜色代码
 */
export function getLevelColor(level) {
    const colors = {
        0: '#666666',  // 普通用户 - 灰色
        1: '#4CAF50',  // 1级 - 绿色
        2: '#2196F3',  // 2级 - 蓝色
        3: '#9C27B0',  // 3级 - 紫色
        4: '#FF9800',  // 4级 - 橙色
        5: '#FFD700'   // 5级 - 金色
    };
    return colors[level] || colors[0];
}

/**
 * 获取等级进度百分比
 * 
 * @param {Object} userData - 用户数据
 * @param {number} targetLevel - 目标等级
 * @returns {Object} 进度信息
 */
export function getLevelProgress(userData, targetLevel) {
    const config = BROKER_LEVELS[targetLevel];
    const { directReferrals = 0, teamPerformance = 0, subBrokerCounts = [] } = userData;
    
    // 计算各项进度
    const directProgress = Math.min(100, (directReferrals / config.minDirectReferrals) * 100);
    const performanceProgress = Math.min(100, (teamPerformance / config.minTeamPerformance) * 100);
    
    let subBrokerProgress = 100;
    if (config.minSubBrokers > 0) {
        const currentSubBrokers = subBrokerCounts[config.subBrokerLevel] || 0;
        subBrokerProgress = Math.min(100, (currentSubBrokers / config.minSubBrokers) * 100);
    }
    
    // 总体进度（三项平均）
    const overallProgress = (directProgress + performanceProgress + subBrokerProgress) / 3;
    
    return {
        targetLevel,
        directProgress: Math.round(directProgress),
        performanceProgress: Math.round(performanceProgress),
        subBrokerProgress: Math.round(subBrokerProgress),
        overallProgress: Math.round(overallProgress)
    };
}

