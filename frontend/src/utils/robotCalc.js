/**
 * 机器人收益数学计算工具 - Robot Profit Mathematical Calculator
 * 
 * 用途：计算机器人的收益、到期时间、总回报等
 * 
 * 数学公式：
 * - 日收益 = 本金 × 日收益率
 * - 总收益 = 日收益 × 运行天数
 * - 总回报 = 本金 + 总收益
 */

// ============================================================================
// CEX机器人配置（与后端保持一致）
// ============================================================================

/**
 * CEX机器人配置表 - 2024-12-21 修复收益率（与后端同步）
 * 收益计算公式: dailyEarning = price × dailyProfit%
 * 总回报公式: totalReturn = price + (price × dailyProfit% × days)
 */
export const CEX_ROBOTS = [
    { id: 'binance_01', name: 'Binance Ai Bot', price: 20, dailyProfit: 2.0, durationHours: 24 },
    { id: 'coinbase_01', name: 'Coinbase Ai Bot', price: 100, dailyProfit: 2.0, durationHours: 72 },
    { id: 'okx_01', name: 'OKX Ai Bot', price: 300, dailyProfit: 2.0, durationHours: 48 },
    { id: 'bybit_01', name: 'Bybit Ai Bot', price: 800, dailyProfit: 1.5, durationHours: 168 },
    { id: 'upbit_01', name: 'Upbit Ai Bot', price: 1600, dailyProfit: 1.8, durationHours: 360 },
    { id: 'bitfinex_01', name: 'Bitfinex Ai Bot', price: 3200, dailyProfit: 2.0, durationHours: 720 },
    { id: 'kucoin_01', name: 'Kucoin Ai Bot', price: 6800, dailyProfit: 2.2, durationHours: 1080 },
    { id: 'bitget_01', name: 'Bitget Ai Bot', price: 10000, dailyProfit: 2.5, durationHours: 2160 },
    { id: 'gate_01', name: 'Gate Ai Bot', price: 20000, dailyProfit: 3.0, durationHours: 2880 },
    // Business rule: Binance AI Robot can be purchased at most 5 times per wallet.
    { id: 'binance_02', name: 'Binance Ai Bot-01', price: 46800, dailyProfit: 4.2, durationHours: 4320 }
];

/**
 * DEX机器人配置表 - 2024-12-21 修复收益率（与后端同步）
 * 收益计算公式: dailyEarning = price × dailyProfit%
 * 总回报公式: totalReturn = price + (price × dailyProfit% × days)
 */
export const DEX_ROBOTS = [
    { id: 'pancake_01', name: 'PancakeSwap Ai Bot', price: 1000, dailyProfit: 1.8, durationHours: 720 },
    { id: 'uniswap_01', name: 'Uniswap Ai Bot', price: 2000, dailyProfit: 2.0, durationHours: 720 },
    { id: 'baseswap_01', name: 'BaseSwap Ai Bot', price: 3000, dailyProfit: 2.2, durationHours: 720 },
    { id: 'sushiswap_01', name: 'SushiSwap Ai Bot', price: 5000, dailyProfit: 2.5, durationHours: 1440 },
    { id: 'jupiter_01', name: 'Jupiter Ai Bot', price: 10000, dailyProfit: 2.8, durationHours: 1440 },
    { id: 'curve_01', name: 'Curve Ai Bot', price: 30000, dailyProfit: 3.5, durationHours: 720 },
    { id: 'dodo_01', name: 'DODO Ai Bot', price: 60000, dailyProfit: 4.0, durationHours: 720 }
];

// ============================================================================
// 核心计算函数
// ============================================================================

/**
 * 计算每日收益金额
 * 
 * 数学公式: dailyEarning = principal × (dailyProfitRate / 100)
 * 
 * @param {number} principal - 本金 (USDT)
 * @param {number} dailyProfitRate - 日收益率 (百分比，如 2.0 表示 2%)
 * @returns {number} 每日收益金额 (USDT)
 */
export function calculateDailyEarning(principal, dailyProfitRate) {
    return principal * (dailyProfitRate / 100);
}

/**
 * 计算总收益
 * 
 * 数学公式: totalProfit = dailyEarning × days = principal × (dailyProfitRate / 100) × days
 * 
 * @param {number} principal - 本金 (USDT)
 * @param {number} dailyProfitRate - 日收益率 (%)
 * @param {number} durationHours - 运行时长 (小时)
 * @returns {number} 总收益 (USDT)
 */
export function calculateTotalProfit(principal, dailyProfitRate, durationHours) {
    const days = durationHours / 24;
    const dailyEarning = calculateDailyEarning(principal, dailyProfitRate);
    return dailyEarning * days;
}

/**
 * 计算总回报（本金 + 收益）
 * 
 * 数学公式: totalReturn = principal + totalProfit
 * 
 * @param {number} principal - 本金 (USDT)
 * @param {number} dailyProfitRate - 日收益率 (%)
 * @param {number} durationHours - 运行时长 (小时)
 * @returns {number} 总回报 (USDT)
 */
export function calculateTotalReturn(principal, dailyProfitRate, durationHours) {
    const totalProfit = calculateTotalProfit(principal, dailyProfitRate, durationHours);
    return principal + totalProfit;
}

/**
 * 计算年化收益率 (APY)
 * 
 * 数学公式: APY = dailyProfitRate × 365
 * 
 * @param {number} dailyProfitRate - 日收益率 (%)
 * @returns {number} 年化收益率 (%)
 */
export function calculateAPY(dailyProfitRate) {
    return dailyProfitRate * 365;
}

/**
 * 计算投资回报率 (ROI)
 * 
 * 数学公式: ROI = (totalProfit / principal) × 100
 * 
 * @param {number} principal - 本金 (USDT)
 * @param {number} totalProfit - 总收益 (USDT)
 * @returns {number} ROI (%)
 */
export function calculateROI(principal, totalProfit) {
    if (principal <= 0) return 0;
    return (totalProfit / principal) * 100;
}

// ============================================================================
// 时间计算函数
// ============================================================================

/**
 * 将小时转换为天数
 * 
 * @param {number} hours - 小时数
 * @returns {number} 天数
 */
export function hoursToDays(hours) {
    return hours / 24;
}

/**
 * 计算到期时间
 * 
 * @param {Date|string} startTime - 开始时间
 * @param {number} durationHours - 运行时长 (小时)
 * @returns {Date} 到期时间
 */
export function calculateEndTime(startTime, durationHours) {
    const start = new Date(startTime);
    return new Date(start.getTime() + durationHours * 60 * 60 * 1000);
}

/**
 * 计算剩余时间
 * 
 * @param {Date|string} endTime - 到期时间
 * @returns {Object} 剩余时间 { days, hours, minutes, totalHours, isExpired }
 */
export function calculateRemainingTime(endTime) {
    const end = new Date(endTime);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    
    if (diff <= 0) {
        return {
            days: 0,
            hours: 0,
            minutes: 0,
            totalHours: 0,
            isExpired: true
        };
    }
    
    const totalHours = diff / (1000 * 60 * 60);
    const days = Math.floor(totalHours / 24);
    const hours = Math.floor(totalHours % 24);
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
        days,
        hours,
        minutes,
        totalHours: Math.floor(totalHours),
        isExpired: false
    };
}

/**
 * 格式化剩余时间显示
 * 
 * @param {Object} remaining - 剩余时间对象
 * @returns {string} 格式化后的字符串
 */
export function formatRemainingTime(remaining) {
    if (remaining.isExpired) {
        return 'Expired';
    }
    
    if (remaining.days > 0) {
        return `${remaining.days}d ${remaining.hours}h`;
    }
    
    if (remaining.hours > 0) {
        return `${remaining.hours}h ${remaining.minutes}m`;
    }
    
    return `${remaining.minutes}m`;
}

// ============================================================================
// 完整机器人收益分析
// ============================================================================

/**
 * 计算机器人完整收益分析
 * 
 * @param {Object} robot - 机器人配置
 * @param {number} robot.price - 本金
 * @param {number} robot.dailyProfit - 日收益率 (%)
 * @param {number} robot.durationHours - 运行时长 (小时)
 * @returns {Object} 完整收益分析
 */
export function analyzeRobotProfit(robot) {
    const { price, dailyProfit, durationHours } = robot;
    
    // 基础计算
    const dailyEarning = calculateDailyEarning(price, dailyProfit);
    const totalProfit = calculateTotalProfit(price, dailyProfit, durationHours);
    const totalReturn = calculateTotalReturn(price, dailyProfit, durationHours);
    const roi = calculateROI(price, totalProfit);
    const apy = calculateAPY(dailyProfit);
    const days = hoursToDays(durationHours);
    
    return {
        principal: price,                           // 本金
        dailyProfitRate: dailyProfit,               // 日收益率 (%)
        durationHours,                              // 运行时长 (小时)
        durationDays: days,                         // 运行时长 (天)
        
        // 收益计算
        dailyEarning: parseFloat(dailyEarning.toFixed(4)),      // 每日收益
        totalProfit: parseFloat(totalProfit.toFixed(4)),        // 总收益
        totalReturn: parseFloat(totalReturn.toFixed(4)),        // 总回报
        roi: parseFloat(roi.toFixed(2)),                        // 投资回报率 (%)
        apy: parseFloat(apy.toFixed(2)),                        // 年化收益率 (%)
        
        // 数学公式
        formulas: {
            dailyEarning: `${price} × ${dailyProfit}% = ${dailyEarning.toFixed(4)} USDT`,
            totalProfit: `${dailyEarning.toFixed(4)} × ${days} = ${totalProfit.toFixed(4)} USDT`,
            totalReturn: `${price} + ${totalProfit.toFixed(4)} = ${totalReturn.toFixed(4)} USDT`,
            roi: `(${totalProfit.toFixed(4)} / ${price}) × 100 = ${roi.toFixed(2)}%`
        }
    };
}

/**
 * 批量计算多个机器人的收益
 * 
 * @param {Array} robots - 机器人数组
 * @returns {Array} 收益分析数组
 */
export function analyzeMultipleRobots(robots) {
    return robots.map(robot => ({
        ...robot,
        analysis: analyzeRobotProfit(robot)
    }));
}

/**
 * 计算投资组合总收益
 * 
 * @param {Array} myRobots - 用户的机器人数组
 * @returns {Object} 组合收益汇总
 */
export function calculatePortfolioProfit(myRobots) {
    let totalPrincipal = 0;
    let totalDailyEarning = 0;
    let totalProfit = 0;
    let totalReturn = 0;
    
    const details = myRobots.map(robot => {
        const analysis = analyzeRobotProfit(robot);
        totalPrincipal += analysis.principal;
        totalDailyEarning += analysis.dailyEarning;
        totalProfit += analysis.totalProfit;
        totalReturn += analysis.totalReturn;
        
        return {
            robotId: robot.id,
            robotName: robot.name,
            ...analysis
        };
    });
    
    const avgROI = totalPrincipal > 0 ? (totalProfit / totalPrincipal) * 100 : 0;
    
    return {
        summary: {
            totalPrincipal: parseFloat(totalPrincipal.toFixed(4)),
            totalDailyEarning: parseFloat(totalDailyEarning.toFixed(4)),
            totalProfit: parseFloat(totalProfit.toFixed(4)),
            totalReturn: parseFloat(totalReturn.toFixed(4)),
            avgROI: parseFloat(avgROI.toFixed(2)),
            robotCount: myRobots.length
        },
        details
    };
}

// ============================================================================
// 量化收益计算
// ============================================================================

/**
 * 计算单次量化收益
 * 
 * 数学公式：quantifyEarning = dailyEarning = principal × (dailyProfitRate / 100)
 * 
 * @param {number} principal - 本金
 * @param {number} dailyProfitRate - 日收益率 (%)
 * @returns {Object} 量化收益
 */
export function calculateQuantifyEarning(principal, dailyProfitRate) {
    const earning = calculateDailyEarning(principal, dailyProfitRate);
    
    return {
        principal,
        dailyProfitRate,
        earning: parseFloat(earning.toFixed(4)),
        formula: `${principal} × ${dailyProfitRate}% = ${earning.toFixed(4)} USDT`
    };
}

/**
 * 检查是否可以量化
 * 
 * @param {Date|string} lastQuantifyTime - 上次量化时间
 * @param {number} cooldownHours - 冷却时间 (小时，默认24小时)
 * @returns {Object} 量化状态
 */
export function checkQuantifyStatus(lastQuantifyTime, cooldownHours = 24) {
    if (!lastQuantifyTime) {
        return {
            canQuantify: true,
            hoursRemaining: 0,
            nextQuantifyTime: null
        };
    }
    
    const last = new Date(lastQuantifyTime);
    const nextTime = new Date(last.getTime() + cooldownHours * 60 * 60 * 1000);
    const now = new Date();
    const diff = nextTime.getTime() - now.getTime();
    
    if (diff <= 0) {
        return {
            canQuantify: true,
            hoursRemaining: 0,
            nextQuantifyTime: nextTime
        };
    }
    
    const hoursRemaining = Math.ceil(diff / (1000 * 60 * 60));
    
    return {
        canQuantify: false,
        hoursRemaining,
        nextQuantifyTime: nextTime
    };
}

// ============================================================================
// 格式化函数
// ============================================================================

/**
 * 格式化金额显示
 * 
 * @param {number} amount - 金额
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的金额
 */
export function formatAmount(amount, decimals = 4) {
    return parseFloat(amount).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * 格式化百分比显示
 * 
 * @param {number} rate - 比率
 * @returns {string} 格式化后的百分比
 */
export function formatPercent(rate) {
    return `${rate.toFixed(2)}%`;
}

// ============================================================================
// 导出所有函数
// ============================================================================

export default {
    // 配置
    CEX_ROBOTS,
    DEX_ROBOTS,
    
    // 核心计算
    calculateDailyEarning,
    calculateTotalProfit,
    calculateTotalReturn,
    calculateAPY,
    calculateROI,
    
    // 时间计算
    hoursToDays,
    calculateEndTime,
    calculateRemainingTime,
    formatRemainingTime,
    
    // 分析函数
    analyzeRobotProfit,
    analyzeMultipleRobots,
    calculatePortfolioProfit,
    
    // 量化计算
    calculateQuantifyEarning,
    checkQuantifyStatus,
    
    // 格式化
    formatAmount,
    formatPercent
};

