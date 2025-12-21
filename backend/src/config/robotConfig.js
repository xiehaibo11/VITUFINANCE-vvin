/**
 * ============================================================================
 * Robot Unified Configuration File
 * ============================================================================
 * 
 * IMPORTANT NOTES:
 * - All time-related fields use hours as the unit
 * - duration_hours: Robot operation cycle (hours)
 * - quantify_interval_hours: Quantification interval (hours), null means only once
 * - daily_profit: Daily profit rate (%), used to calculate earnings per quantification
 * 
 * Earnings Calculation Formula:
 * - Per quantification earnings = price × (daily_profit / 100) × (quantify_interval_hours / 24)
 * - Total return at maturity (High) = price × (daily_profit / 100) × (duration_hours / 24)
 */

// ============================================================================
// Safety Limits - Prevents configuration errors from causing huge losses
// ============================================================================
const SAFETY_LIMITS = {
    MAX_DAILY_PROFIT_RATE: 2.0,       // Max daily profit rate 2.0%
    MAX_SINGLE_EARNING: 100,          // Max single quantification earning 100 USDT
    MAX_DAILY_EARNING_PER_USER: 500,  // Max daily earning per user 500 USDT
    MAX_REFERRAL_RATE_TOTAL: 0.20,    // Max total referral rate 20%
    MAX_TEAM_DIVIDEND_RATE: 0.05,     // Max team dividend rate 5%
    EARNING_WARNING_THRESHOLD: 50,    // Warning threshold 50 USDT
};

// ============================================================================
// CEX Robot Configuration (Robot Page) - Fixed profit rates
// ============================================================================
const CEX_ROBOTS = {
    'Binance Ai Bot': {
        robot_id: 'binance_01',
        robot_type: 'cex',
        duration_hours: 24,           // 1 day
        quantify_interval_hours: 24,
        daily_profit: 2.0,            // 20 × 2% = 0.4 USDT/day
        arbitrage_orders: 5,
        total_return: 20.4,
        limit: 1,
        price: 20,
        return_principal: true
    },
    'Coinbase Ai Bot': {
        robot_id: 'coinbase_01',
        robot_type: 'cex',
        duration_hours: 72,           // 3 days
        quantify_interval_hours: 24,
        daily_profit: 2.0,            // 100 × 2% = 2 USDT/day
        arbitrage_orders: 8,
        total_return: 106,
        limit: 1,
        price: 100,
        return_principal: true
    },
    'OKX Ai Bot': {
        robot_id: 'okx_01',
        robot_type: 'cex',
        duration_hours: 48,           // 2 days
        quantify_interval_hours: 24,
        daily_profit: 2.0,            // 300 × 2% = 6 USDT/day
        arbitrage_orders: 12,
        total_return: 312,
        limit: 1,
        price: 300,
        return_principal: true
    },
    'Bybit Ai Bot': {
        robot_id: 'bybit_01',
        robot_type: 'cex',
        duration_hours: 168,          // 7 days
        quantify_interval_hours: 24,
        daily_profit: 1.5,            // 800 × 1.5% = 12 USDT/day
        arbitrage_orders: 15,
        total_return: 884,
        limit: 2,
        price: 800,
        return_principal: true
    },
    'Upbit Ai Bot': {
        robot_id: 'upbit_01',
        robot_type: 'cex',
        duration_hours: 360,          // 15 days
        quantify_interval_hours: 24,
        daily_profit: 1.2,            // 1600 × 1.2% = 19.2 USDT/day
        arbitrage_orders: 18,
        total_return: 1888,
        limit: 2,
        price: 1600,
        return_principal: true
    },
    'Bitfinex Ai Bot': {
        robot_id: 'bitfinex_01',
        robot_type: 'cex',
        duration_hours: 720,          // 30 days
        quantify_interval_hours: 24,
        daily_profit: 0.8,            // 3200 × 0.8% = 25.6 USDT/day
        arbitrage_orders: 25,
        total_return: 3968,
        limit: 2,
        price: 3200,
        return_principal: true
    },
    'Kucoin Ai Bot': {
        robot_id: 'kucoin_01',
        robot_type: 'cex',
        duration_hours: 1080,         // 45 days
        quantify_interval_hours: 24,
        daily_profit: 0.5,            // 6800 × 0.5% = 34 USDT/day
        arbitrage_orders: 30,
        total_return: 8330,
        limit: 2,
        price: 6800,
        return_principal: true
    },
    'Bitget Ai Bot': {
        robot_id: 'bitget_01',
        robot_type: 'cex',
        duration_hours: 2160,         // 90 days
        quantify_interval_hours: 24,
        daily_profit: 0.5,            // 10000 × 0.5% = 50 USDT/day
        arbitrage_orders: 45,
        total_return: 14500,
        limit: 2,
        price: 10000,
        return_principal: true
    },
    'Gate Ai Bot': {
        robot_id: 'gate_01',
        robot_type: 'cex',
        duration_hours: 2880,         // 120 days
        quantify_interval_hours: 24,
        daily_profit: 0.5,            // 20000 × 0.5% = 100 USDT/day (hits cap)
        arbitrage_orders: 50,
        total_return: 32000,
        limit: 2,
        price: 20000,
        return_principal: true
    },
    'Binance Ai Bot-01': {
        robot_id: 'binance_02',
        robot_type: 'cex',
        duration_hours: 4320,         // 180 days
        quantify_interval_hours: 24,
        daily_profit: 0.5,            // 46800 × 0.5% = 234 USDT/day (capped to 100)
        arbitrage_orders: 60,
        total_return: 88920,
        limit: 2,
        price: 46800,
        return_principal: true
    }
};

// ============================================================================
// DEX Robot Configuration (Robot Page) - Fixed profit rates
// ============================================================================
const DEX_ROBOTS = {
    'PancakeSwap Ai Bot': {
        robot_id: 'pancake_01',
        robot_type: 'dex',
        duration_hours: 720,          // 30 days
        quantify_interval_hours: 24,
        daily_profit: 0.6,            // 1000 × 0.6% = 6 USDT/day
        arbitrage_orders: 6,
        total_return: 1180,
        limit: 1,
        price: 1000,
        return_principal: true,
        show_note: true
    },
    'Uniswap Ai Bot': {
        robot_id: 'uniswap_01',
        robot_type: 'dex',
        duration_hours: 720,
        quantify_interval_hours: 24,
        daily_profit: 0.6,            // 2000 × 0.6% = 12 USDT/day
        arbitrage_orders: 10,
        total_return: 2360,
        limit: 1,
        price: 2000,
        return_principal: true,
        show_note: true
    },
    'BaseSwap Ai Bot': {
        robot_id: 'baseswap_01',
        robot_type: 'dex',
        duration_hours: 720,
        quantify_interval_hours: 24,
        daily_profit: 0.6,            // 3000 × 0.6% = 18 USDT/day
        arbitrage_orders: 15,
        total_return: 3540,
        limit: 1,
        price: 3000,
        return_principal: true,
        show_note: true
    },
    'SushiSwap Ai Bot': {
        robot_id: 'sushiswap_01',
        robot_type: 'dex',
        duration_hours: 1440,         // 60 days
        quantify_interval_hours: 24,
        daily_profit: 0.5,            // 5000 × 0.5% = 25 USDT/day
        arbitrage_orders: 20,
        total_return: 6500,
        limit: 1,
        price: 5000,
        return_principal: true,
        show_note: true
    },
    'Jupiter Ai Bot': {
        robot_id: 'jupiter_01',
        robot_type: 'dex',
        duration_hours: 1440,
        quantify_interval_hours: 24,
        daily_profit: 0.5,            // 10000 × 0.5% = 50 USDT/day
        arbitrage_orders: 30,
        total_return: 13000,
        limit: 1,
        price: 10000,
        return_principal: true,
        show_note: true
    },
    'Curve Ai Bot': {
        robot_id: 'curve_01',
        robot_type: 'dex',
        duration_hours: 720,
        quantify_interval_hours: 24,
        daily_profit: 0.3,            // 30000 × 0.3% = 90 USDT/day
        arbitrage_orders: 50,
        total_return: 32700,
        limit: 1,
        price: 30000,
        return_principal: true,
        show_note: true,
        locked: true
    },
    'DODO Ai Bot': {
        robot_id: 'dodo_01',
        robot_type: 'dex',
        duration_hours: 720,
        quantify_interval_hours: 24,
        daily_profit: 0.15,           // 60000 × 0.15% = 90 USDT/day
        arbitrage_orders: 60,
        total_return: 62700,
        limit: 1,
        price: 60000,
        return_principal: true,
        show_note: true,
        locked: true
    }
};

// ============================================================================
// Grid Robot Configuration (Follow Page)
// ============================================================================
const GRID_ROBOTS = {
    'Binance Grid Bot-M1': {
        robot_id: 'grid_m1',
        robot_type: 'grid',
        duration_hours: 2880,         // 120 days
        quantify_interval_hours: 24,
        daily_profit: 1.5,            // 680 × 1.5% = 10.2 USDT/day
        arbitrage_orders: 6,
        total_return: 1904,
        limit: 1,
        price: 680,
        return_principal: true,
        daily_limit: true
    },
    'Binance Grid Bot-M2': {
        robot_id: 'grid_m2',
        robot_type: 'grid',
        duration_hours: 3600,         // 150 days
        quantify_interval_hours: 24,
        daily_profit: 1.0,            // 1580 × 1.0% = 15.8 USDT/day
        arbitrage_orders: 15,
        total_return: 3950,
        limit: 1,
        price: 1580,
        return_principal: true,
        daily_limit: true
    },
    'Binance Grid Bot-M3': {
        robot_id: 'grid_m3',
        robot_type: 'grid',
        duration_hours: 4320,         // 180 days
        quantify_interval_hours: 24,
        daily_profit: 0.8,            // 2880 × 0.8% = 23 USDT/day
        arbitrage_orders: 28,
        total_return: 7027,
        limit: 1,
        price: 2880,
        return_principal: true,
        daily_limit: true
    },
    'Binance Grid Bot-M4': {
        robot_id: 'grid_m4',
        robot_type: 'grid',
        duration_hours: 5040,         // 210 days
        quantify_interval_hours: 24,
        daily_profit: 0.6,            // 5880 × 0.6% = 35 USDT/day
        arbitrage_orders: 50,
        total_return: 13288,
        limit: 1,
        price: 5880,
        return_principal: true,
        daily_limit: true
    },
    'Binance Grid Bot-M5': {
        robot_id: 'grid_m5',
        robot_type: 'grid',
        duration_hours: 5760,         // 240 days
        quantify_interval_hours: 24,
        daily_profit: 0.5,            // 12800 × 0.5% = 64 USDT/day
        arbitrage_orders: 60,
        total_return: 28160,
        limit: 1,
        price: 12800,
        return_principal: true,
        daily_limit: true
    }
};

// ============================================================================
// High Robot Configuration (Follow Page) - Single quantify, return principal + interest
// ============================================================================
const HIGH_ROBOTS = {
    'Binance High Robot-H1': {
        robot_id: 'high_h1',
        robot_type: 'high',
        duration_hours: 24,           // 1 day
        quantify_interval_hours: null,
        daily_profit: 1.2,
        arbitrage_orders: 5,
        total_return_rate: 1.2,
        limit: 1,
        min_price: 20,
        max_price: 80000,
        return_principal: true,
        daily_limit: true,
        single_quantify: true
    },
    'Binance High Robot-H2': {
        robot_id: 'high_h2',
        robot_type: 'high',
        duration_hours: 72,           // 3 days
        quantify_interval_hours: null,
        daily_profit: 0.8,            // 3 × 0.8% = 2.4%
        arbitrage_orders: 8,
        total_return_rate: 2.4,
        limit: 1,
        min_price: 100,
        max_price: 100000,
        return_principal: true,
        daily_limit: true,
        single_quantify: true
    },
    'Binance High Robot-H3': {
        robot_id: 'high_h3',
        robot_type: 'high',
        duration_hours: 120,          // 5 days
        quantify_interval_hours: null,
        daily_profit: 0.6,            // 5 × 0.6% = 3.0%
        arbitrage_orders: 12,
        total_return_rate: 3.0,
        limit: 1,
        min_price: 200,
        max_price: 150000,
        return_principal: true,
        daily_limit: true,
        single_quantify: true
    }
};

// ============================================================================
// Merge all robot configurations
// ============================================================================
const ALL_ROBOTS = {
    ...CEX_ROBOTS,
    ...DEX_ROBOTS,
    ...GRID_ROBOTS,
    ...HIGH_ROBOTS
};

/**
 * Get robot configuration by name
 * @param {string} robotName - Robot name
 * @returns {object|null} Robot config or null if not found
 */
function getRobotConfig(robotName) {
    return ALL_ROBOTS[robotName] || null;
}

/**
 * Calculate robot end time
 * @param {string} robotName - Robot name
 * @param {Date} startTime - Start time (default: now)
 * @returns {Date} End time
 */
function calculateEndTime(robotName, startTime = new Date()) {
    const config = getRobotConfig(robotName);
    if (!config) {
        throw new Error(`Robot config not found: ${robotName}`);
    }
    
    const endTime = new Date(startTime.getTime());
    endTime.setTime(endTime.getTime() + config.duration_hours * 60 * 60 * 1000);
    return endTime;
}

/**
 * Calculate per quantification earnings (with safety limits)
 * @param {string} robotName - Robot name
 * @param {number} price - Investment amount
 * @returns {number} Quantification earnings (with safety limits applied)
 */
function calculateQuantifyEarnings(robotName, price) {
    const config = getRobotConfig(robotName);
    if (!config) {
        throw new Error(`Robot config not found: ${robotName}`);
    }
    
    // High robot doesn't calculate per-quantify earnings
    if (config.single_quantify) {
        return 0;
    }
    
    // Safety check 1: Verify daily profit rate doesn't exceed limit
    const effectiveDailyProfit = Math.min(
        config.daily_profit, 
        SAFETY_LIMITS.MAX_DAILY_PROFIT_RATE
    );
    
    // Per quantify earnings = price × daily_profit × (interval/24)
    const intervalDays = config.quantify_interval_hours / 24;
    let earnings = price * (effectiveDailyProfit / 100) * intervalDays;
    
    // Safety check 2: Single earnings cannot exceed max limit
    if (earnings > SAFETY_LIMITS.MAX_SINGLE_EARNING) {
        console.warn(`[SAFETY] Earnings capped: ${robotName}, original=${earnings.toFixed(2)}, capped=${SAFETY_LIMITS.MAX_SINGLE_EARNING}`);
        earnings = SAFETY_LIMITS.MAX_SINGLE_EARNING;
    }
    
    // Safety check 3: Warning log for high earnings
    if (earnings > SAFETY_LIMITS.EARNING_WARNING_THRESHOLD) {
        console.warn(`[WARNING] High earnings detected: ${robotName}, price=${price}, earnings=${earnings.toFixed(2)}`);
    }
    
    return parseFloat(earnings.toFixed(4));
}

/**
 * Calculate High robot return at maturity (with safety limits)
 * @param {string} robotName - Robot name
 * @param {number} price - Investment amount
 * @returns {number} Return amount (principal + interest, with safety limits)
 */
function calculateHighRobotReturn(robotName, price) {
    const config = getRobotConfig(robotName);
    if (!config || config.robot_type !== 'high') {
        return price; // Non-High robots only return principal
    }
    
    // Safety check: Verify daily profit rate
    const effectiveDailyProfit = Math.min(
        config.daily_profit, 
        SAFETY_LIMITS.MAX_DAILY_PROFIT_RATE
    );
    
    // Total profit = principal × daily_profit × days
    const days = config.duration_hours / 24;
    const totalProfitRate = (effectiveDailyProfit / 100) * days;
    let totalReturn = price * (1 + totalProfitRate);
    
    // Safety check: Total interest cannot exceed 50% of principal
    const maxProfit = price * 0.5;
    const actualProfit = totalReturn - price;
    if (actualProfit > maxProfit) {
        console.warn(`[SAFETY] High robot profit capped: ${robotName}, original profit=${actualProfit.toFixed(2)}, capped=${maxProfit.toFixed(2)}`);
        totalReturn = price + maxProfit;
    }
    
    return parseFloat(totalReturn.toFixed(4));
}

/**
 * Check if robot can be quantified
 * @param {object} robot - Robot purchase record (from database)
 * @param {Date} currentTime - Current time (default: now)
 * @returns {object} { canQuantify: boolean, reason: string, nextQuantifyTime: Date|null }
 */
function checkQuantifyStatus(robot, currentTime = new Date()) {
    const config = getRobotConfig(robot.robot_name);
    if (!config) {
        return { canQuantify: false, reason: 'Robot config not found', nextQuantifyTime: null };
    }
    
    const endTime = new Date(robot.end_time);
    
    // Check if expired
    if (currentTime >= endTime) {
        return { canQuantify: false, reason: 'Robot has expired', nextQuantifyTime: null };
    }
    
    // High robot: Can only quantify once
    if (config.single_quantify) {
        if (robot.is_quantified === 1) {
            return { canQuantify: false, reason: 'This robot can only be quantified once, already completed', nextQuantifyTime: null };
        }
        return { canQuantify: true, reason: 'Can quantify', nextQuantifyTime: null };
    }
    
    // Other robots: Check quantify interval
    if (robot.last_quantify_time) {
        const lastQuantifyTime = new Date(robot.last_quantify_time);
        const intervalMs = config.quantify_interval_hours * 60 * 60 * 1000;
        const nextQuantifyTime = new Date(lastQuantifyTime.getTime() + intervalMs);
        
        if (currentTime < nextQuantifyTime) {
            const hoursRemaining = (nextQuantifyTime - currentTime) / (1000 * 60 * 60);
            return {
                canQuantify: false,
                reason: `Need to wait ${Math.floor(hoursRemaining)} hours ${Math.floor((hoursRemaining % 1) * 60)} minutes for next quantification`,
                nextQuantifyTime: nextQuantifyTime,
                hoursRemaining: hoursRemaining
            };
        }
    }
    
    return { canQuantify: true, reason: 'Can quantify', nextQuantifyTime: null };
}

/**
 * Check if robot has expired
 * @param {object} robot - Robot purchase record
 * @param {Date} currentTime - Current time
 * @returns {boolean} Whether expired
 */
function isRobotExpired(robot, currentTime = new Date()) {
    const endTime = new Date(robot.end_time);
    return currentTime >= endTime;
}

/**
 * Get all robot configurations list
 * @param {string} type - Robot type (optional: cex, dex, grid, high)
 * @returns {array} Robot config list
 */
function getRobotList(type = null) {
    const robots = Object.entries(ALL_ROBOTS).map(([name, config]) => ({
        name,
        ...config
    }));
    
    if (type) {
        return robots.filter(r => r.robot_type === type);
    }
    
    return robots;
}

/**
 * Convert hours to days
 * @param {number} hours - Hours
 * @returns {number} Days
 */
function hoursToDays(hours) {
    return Math.floor(hours / 24);
}

/**
 * Format remaining time
 * @param {Date} endTime - End time
 * @param {Date} currentTime - Current time
 * @returns {string} Formatted remaining time
 */
function formatRemainingTime(endTime, currentTime = new Date()) {
    const remaining = endTime - currentTime;
    if (remaining <= 0) return 'Expired';
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        return `${days}d ${remainingHours}h`;
    }
    
    return `${hours}h ${minutes}m`;
}

// Export module (ES Module syntax)
export {
    // Safety limits
    SAFETY_LIMITS,
    
    // Config data
    CEX_ROBOTS,
    DEX_ROBOTS,
    GRID_ROBOTS,
    HIGH_ROBOTS,
    ALL_ROBOTS,
    
    // Functions
    getRobotConfig,
    calculateEndTime,
    calculateQuantifyEarnings,
    calculateHighRobotReturn,
    checkQuantifyStatus,
    isRobotExpired,
    getRobotList,
    hoursToDays,
    formatRemainingTime
};

