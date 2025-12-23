/**
 * Precision Math Module - 精确数学运算模块
 *
 * Uses Decimal.js for precise financial calculations
 * Solves JavaScript floating-point precision issues
 *
 * Example: 0.1 + 0.2 = 0.30000000000000004 (JS)
 *          0.1 + 0.2 = 0.3 (Decimal.js)
 */

import Decimal from 'decimal.js';

// ============================================================================
// Decimal Configuration - 设置精度
// ============================================================================

// Set precision to 20 significant digits (enough for financial calculations)
Decimal.set({
    precision: 20,          // Maximum significant digits
    rounding: Decimal.ROUND_DOWN,  // Round down (conservative for financial)
    toExpNeg: -9,           // Don't use exponential notation above this
    toExpPos: 21            // Don't use exponential notation below this
});

// ============================================================================
// Core Arithmetic Functions - 核心运算函数
// ============================================================================

/**
 * Precise addition - 精确加法
 * @param {number|string} a - First number
 * @param {number|string} b - Second number
 * @returns {string} Result as string with 4 decimal places
 */
export function add(a, b) {
    const result = new Decimal(a || 0).plus(new Decimal(b || 0));
    return result.toFixed(4);
}

/**
 * Precise subtraction - 精确减法
 * @param {number|string} a - First number
 * @param {number|string} b - Second number
 * @returns {string} Result as string with 4 decimal places
 */
export function subtract(a, b) {
    const result = new Decimal(a || 0).minus(new Decimal(b || 0));
    return result.toFixed(4);
}

/**
 * Precise multiplication - 精确乘法
 * @param {number|string} a - First number
 * @param {number|string} b - Second number
 * @returns {string} Result as string with 4 decimal places
 */
export function multiply(a, b) {
    const result = new Decimal(a || 0).times(new Decimal(b || 0));
    return result.toFixed(4);
}

/**
 * Precise division - 精确除法
 * @param {number|string} a - Dividend
 * @param {number|string} b - Divisor
 * @returns {string} Result as string with 4 decimal places
 */
export function divide(a, b) {
    if (new Decimal(b || 0).isZero()) {
        return '0.0000';
    }
    const result = new Decimal(a || 0).dividedBy(new Decimal(b));
    return result.toFixed(4);
}

/**
 * Precise percentage calculation - 精确百分比计算
 * @param {number|string} amount - Base amount
 * @param {number|string} rate - Rate (0-100 for percentage, 0-1 for decimal)
 * @param {boolean} isDecimal - If true, rate is decimal (0.3 = 30%), default false
 * @returns {string} Result as string with 4 decimal places
 */
export function percentage(amount, rate, isDecimal = false) {
    const amountDec = new Decimal(amount || 0);
    const rateDec = new Decimal(rate || 0);
    
    const result = isDecimal 
        ? amountDec.times(rateDec)
        : amountDec.times(rateDec.dividedBy(100));
    
    return result.toFixed(4);
}

/**
 * Compare two numbers - 比较两个数字
 * @param {number|string} a - First number
 * @param {number|string} b - Second number
 * @returns {number} -1 if a < b, 0 if a = b, 1 if a > b
 */
export function compare(a, b) {
    return new Decimal(a || 0).comparedTo(new Decimal(b || 0));
}

/**
 * Check if number is greater than - 大于判断
 */
export function isGreaterThan(a, b) {
    return compare(a, b) === 1;
}

/**
 * Check if number is less than - 小于判断
 */
export function isLessThan(a, b) {
    return compare(a, b) === -1;
}

/**
 * Check if number is greater than or equal - 大于等于判断
 */
export function isGreaterOrEqual(a, b) {
    return compare(a, b) >= 0;
}

/**
 * Check if number is less than or equal - 小于等于判断
 */
export function isLessOrEqual(a, b) {
    return compare(a, b) <= 0;
}

/**
 * Get minimum value - 取最小值
 */
export function min(a, b) {
    return Decimal.min(new Decimal(a || 0), new Decimal(b || 0)).toFixed(4);
}

/**
 * Get maximum value - 取最大值
 */
export function max(a, b) {
    return Decimal.max(new Decimal(a || 0), new Decimal(b || 0)).toFixed(4);
}

// ============================================================================
// Financial Calculation Functions - 金融计算函数
// ============================================================================

/**
 * Calculate equity value - 计算权益价值
 * Formula: Equity = USDT + (WLD × WLD_Price)
 * 
 * @param {number|string} usdtBalance - USDT balance
 * @param {number|string} wldBalance - WLD balance
 * @param {number|string} wldPrice - WLD price in USDT
 * @returns {string} Total equity value
 */
export function calculateEquity(usdtBalance, wldBalance, wldPrice) {
    const usdt = new Decimal(usdtBalance || 0);
    const wld = new Decimal(wldBalance || 0);
    const price = new Decimal(wldPrice || 0);
    
    const wldValue = wld.times(price);
    const equity = usdt.plus(wldValue);
    
    return equity.toFixed(4);
}

/**
 * Calculate robot quantify earnings - 计算机器人量化收益
 * Formula: Earnings = Price × DailyProfit × (IntervalHours / 24)
 * 
 * @param {number|string} price - Robot price (investment)
 * @param {number|string} dailyProfitRate - Daily profit rate (percentage)
 * @param {number} intervalHours - Quantify interval in hours (default 24)
 * @returns {string} Earnings amount
 */
export function calculateQuantifyEarnings(price, dailyProfitRate, intervalHours = 24) {
    const priceDec = new Decimal(price || 0);
    const rate = new Decimal(dailyProfitRate || 0).dividedBy(100);
    const intervalDays = new Decimal(intervalHours).dividedBy(24);
    
    const earnings = priceDec.times(rate).times(intervalDays);
    return earnings.toFixed(4);
}

/**
 * Calculate total return - 计算总回报
 * Formula: TotalReturn = Principal + (Principal × DailyRate × Days)
 * 
 * @param {number|string} principal - Principal amount
 * @param {number|string} dailyRate - Daily profit rate (percentage)
 * @param {number} days - Duration in days
 * @returns {string} Total return amount
 */
export function calculateTotalReturn(principal, dailyRate, days) {
    const p = new Decimal(principal || 0);
    const r = new Decimal(dailyRate || 0).dividedBy(100);
    const d = new Decimal(days || 0);
    
    const interest = p.times(r).times(d);
    const total = p.plus(interest);
    
    return total.toFixed(4);
}

// ============================================================================
// Referral Reward Calculation - 推荐奖励计算
// ============================================================================

// Referral reward rates configuration
export const REWARD_RATES = {
    // CEX/Grid/High robots - Based on quantify PROFIT (8 levels)
    // 1级30%, 2级10%, 3级5%, 4-8级1%×5 = Total 50%
    CEX: [0.30, 0.10, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01],
    
    // DEX robots - Based on LAUNCH AMOUNT (3 levels)
    // 1级5%, 2级3%, 3级2% = Total 10%
    DEX_LAUNCH: [0.05, 0.03, 0.02],
    
    // DEX robots - Based on maturity PROFIT (8 levels, same as CEX)
    // Distributed at maturity
    DEX_PROFIT: [0.30, 0.10, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01]
};

/**
 * Calculate single level referral reward - 计算单级推荐奖励
 * Formula: Reward = Amount × Rate
 * 
 * @param {number|string} amount - Base amount (profit or launch amount)
 * @param {number} level - Referral level (1-8)
 * @param {string} type - Reward type: 'CEX', 'DEX_LAUNCH', 'DEX_PROFIT'
 * @returns {object} { reward: string, rate: number, formula: string }
 */
export function calculateLevelReward(amount, level, type = 'CEX') {
    const rates = REWARD_RATES[type] || REWARD_RATES.CEX;
    
    if (level < 1 || level > rates.length) {
        return { reward: '0.0000', rate: 0, formula: 'Invalid level' };
    }
    
    const rate = rates[level - 1];
    const amountDec = new Decimal(amount || 0);
    const reward = amountDec.times(new Decimal(rate));
    
    return {
        reward: reward.toFixed(4),
        rate: rate,
        ratePercent: new Decimal(rate).times(100).toFixed(1) + '%',
        formula: `${amount} × ${rate} = ${reward.toFixed(4)}`
    };
}

/**
 * Calculate all levels referral rewards - 计算所有级别推荐奖励
 * 
 * @param {number|string} amount - Base amount
 * @param {string} type - Reward type: 'CEX', 'DEX_LAUNCH', 'DEX_PROFIT'
 * @returns {object} Detailed reward breakdown
 */
export function calculateAllLevelRewards(amount, type = 'CEX') {
    const rates = REWARD_RATES[type] || REWARD_RATES.CEX;
    const rewards = [];
    let totalReward = new Decimal(0);
    
    for (let level = 1; level <= rates.length; level++) {
        const result = calculateLevelReward(amount, level, type);
        rewards.push({
            level,
            ...result
        });
        totalReward = totalReward.plus(new Decimal(result.reward));
    }
    
    const amountDec = new Decimal(amount || 0);
    const totalRate = rates.reduce((sum, r) => sum + r, 0);
    
    return {
        type,
        baseAmount: amount,
        totalLevels: rates.length,
        rewards,
        totalReward: totalReward.toFixed(4),
        totalRatePercent: new Decimal(totalRate).times(100).toFixed(1) + '%',
        netAmount: amountDec.minus(totalReward).toFixed(4)
    };
}

// ============================================================================
// Broker Level Rewards - 经纪人等级奖励
// ============================================================================

// Broker level configuration
export const BROKER_LEVELS = {
    0: { // No level
        name: 'Regular User',
        directRequired: 0,
        directMinAmount: 0,
        teamLevelRequired: 0,
        teamLevelCount: 0,
        teamVolume: 0,
        dailyBonus: 0,
        monthlyBonus: 0,
        dailyWldRedemption: 0
    },
    1: {
        name: 'LV1 Broker',
        directRequired: 5,       // 5 direct referrals
        directMinAmount: 20,     // Each referral >= 20 USDT
        teamLevelRequired: 0,    // No subordinate level required
        teamLevelCount: 0,
        teamVolume: 1000,        // 1,000 USDT team volume
        dailyBonus: 5,           // 5 USDT daily
        monthlyBonus: 150,       // 150 USDT monthly
        dailyWldRedemption: 1    // 1 WLD per day extra redemption
    },
    2: {
        name: 'LV2 Broker',
        directRequired: 10,
        directMinAmount: 100,
        teamLevelRequired: 1,    // Need LV1 subordinates
        teamLevelCount: 2,       // 2 LV1 subordinates
        teamVolume: 5000,
        dailyBonus: 15,
        monthlyBonus: 450,
        dailyWldRedemption: 2
    },
    3: {
        name: 'LV3 Broker',
        directRequired: 20,
        directMinAmount: 100,
        teamLevelRequired: 2,
        teamLevelCount: 2,
        teamVolume: 20000,
        dailyBonus: 60,
        monthlyBonus: 1800,
        dailyWldRedemption: 3
    },
    4: {
        name: 'LV4 Broker',
        directRequired: 30,
        directMinAmount: 100,
        teamLevelRequired: 3,
        teamLevelCount: 2,
        teamVolume: 80000,
        dailyBonus: 300,
        monthlyBonus: 9000,
        dailyWldRedemption: 5
    },
    5: {
        name: 'LV5 Broker',
        directRequired: 50,
        directMinAmount: 100,
        teamLevelRequired: 4,
        teamLevelCount: 2,
        teamVolume: 200000,
        dailyBonus: 1000,
        monthlyBonus: 30000,
        dailyWldRedemption: 10
    }
};

/**
 * Calculate broker level qualification - 计算经纪人等级资格
 * 
 * @param {object} userData - User data containing:
 *   - directReferrals: Array of { walletAddress, totalInvestment, level }
 *   - teamVolume: Total team investment volume
 *   - subordinateLevels: Count of subordinates at each level
 * @returns {object} Level qualification result
 */
export function calculateBrokerLevel(userData) {
    const {
        directReferrals = [],
        teamVolume = 0,
        subordinateLevels = {}
    } = userData;
    
    let qualifiedLevel = 0;
    const qualificationDetails = [];
    
    for (let level = 5; level >= 1; level--) {
        const config = BROKER_LEVELS[level];
        
        // Check direct referrals count with minimum amount
        const qualifiedDirects = directReferrals.filter(ref => 
            new Decimal(ref.totalInvestment || 0).gte(new Decimal(config.directMinAmount))
        );
        const directOk = qualifiedDirects.length >= config.directRequired;
        
        // Check team volume
        const volumeOk = new Decimal(teamVolume).gte(new Decimal(config.teamVolume));
        
        // Check subordinate levels
        const subLevelOk = config.teamLevelRequired === 0 || 
            (subordinateLevels[config.teamLevelRequired] || 0) >= config.teamLevelCount;
        
        const qualified = directOk && volumeOk && subLevelOk;
        
        qualificationDetails.push({
            level,
            name: config.name,
            qualified,
            checks: {
                directReferrals: {
                    required: config.directRequired,
                    actual: qualifiedDirects.length,
                    minAmount: config.directMinAmount,
                    passed: directOk
                },
                teamVolume: {
                    required: config.teamVolume,
                    actual: teamVolume,
                    passed: volumeOk
                },
                subordinateLevels: {
                    requiredLevel: config.teamLevelRequired,
                    requiredCount: config.teamLevelCount,
                    actualCount: subordinateLevels[config.teamLevelRequired] || 0,
                    passed: subLevelOk
                }
            },
            rewards: qualified ? {
                dailyBonus: config.dailyBonus,
                monthlyBonus: config.monthlyBonus,
                dailyWldRedemption: config.dailyWldRedemption
            } : null
        });
        
        if (qualified && qualifiedLevel === 0) {
            qualifiedLevel = level;
        }
    }
    
    return {
        currentLevel: qualifiedLevel,
        levelName: BROKER_LEVELS[qualifiedLevel].name,
        rewards: BROKER_LEVELS[qualifiedLevel],
        details: qualificationDetails.reverse() // Sort from LV1 to LV5
    };
}

/**
 * Calculate broker daily bonus - 计算经纪人每日分红
 * 
 * @param {number} level - Broker level (1-5)
 * @returns {string} Daily bonus amount
 */
export function calculateDailyBonus(level) {
    const config = BROKER_LEVELS[level] || BROKER_LEVELS[0];
    return new Decimal(config.dailyBonus || 0).toFixed(4);
}

/**
 * Calculate broker monthly bonus - 计算经纪人每月薪资
 * 
 * @param {number} level - Broker level (1-5)
 * @returns {string} Monthly bonus amount
 */
export function calculateMonthlyBonus(level) {
    const config = BROKER_LEVELS[level] || BROKER_LEVELS[0];
    return new Decimal(config.monthlyBonus || 0).toFixed(4);
}

/**
 * Get daily WLD redemption limit - 获取每日WLD闪兑限额
 * 
 * @param {number} level - Broker level (1-5)
 * @returns {number} Daily WLD redemption limit
 */
export function getDailyWldLimit(level) {
    const config = BROKER_LEVELS[level] || BROKER_LEVELS[0];
    return config.dailyWldRedemption || 0;
}

// ============================================================================
// Utility Functions - 工具函数
// ============================================================================

/**
 * Format amount to fixed decimal places - 格式化金额
 * 
 * @param {number|string} amount - Amount to format
 * @param {number} decimals - Decimal places (default 4)
 * @returns {string} Formatted amount
 */
export function formatAmount(amount, decimals = 4) {
    return new Decimal(amount || 0).toFixed(decimals);
}

/**
 * Parse string to number safely - 安全解析数字
 * 
 * @param {string} str - String to parse
 * @param {number} defaultValue - Default value if parse fails
 * @returns {number} Parsed number
 */
export function parseNumber(str, defaultValue = 0) {
    try {
        const dec = new Decimal(str);
        return dec.toNumber();
    } catch {
        return defaultValue;
    }
}

/**
 * Check if amount is valid (positive number) - 检查金额是否有效
 * 
 * @param {number|string} amount - Amount to check
 * @returns {boolean} True if valid positive number
 */
export function isValidAmount(amount) {
    try {
        const dec = new Decimal(amount);
        return dec.isPositive() && !dec.isZero();
    } catch {
        return false;
    }
}

/**
 * Sum array of amounts - 求和数组金额
 * 
 * @param {Array} amounts - Array of amounts
 * @returns {string} Sum as string
 */
export function sumAmounts(amounts) {
    let total = new Decimal(0);
    for (const amount of amounts) {
        total = total.plus(new Decimal(amount || 0));
    }
    return total.toFixed(4);
}

// ============================================================================
// Export All Functions
// ============================================================================

export default {
    // Core arithmetic
    add,
    subtract,
    multiply,
    divide,
    percentage,
    compare,
    isGreaterThan,
    isLessThan,
    isGreaterOrEqual,
    isLessOrEqual,
    min,
    max,
    
    // Financial calculations
    calculateEquity,
    calculateQuantifyEarnings,
    calculateTotalReturn,
    
    // Referral rewards
    REWARD_RATES,
    calculateLevelReward,
    calculateAllLevelRewards,
    
    // Broker levels
    BROKER_LEVELS,
    calculateBrokerLevel,
    calculateDailyBonus,
    calculateMonthlyBonus,
    getDailyWldLimit,
    
    // Utilities
    formatAmount,
    parseNumber,
    isValidAmount,
    sumAmounts
};

