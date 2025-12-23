/**
 * Precision Math Module - 前端精确数学运算模块
 *
 * Uses Decimal.js for precise financial calculations
 * Solves JavaScript floating-point precision issues
 *
 * Example: 0.1 + 0.2 = 0.30000000000000004 (JS)
 *          0.1 + 0.2 = 0.3 (Decimal.js)
 */

import Decimal from 'decimal.js'

// ============================================================================
// Decimal Configuration - 设置精度
// ============================================================================

// Set precision to 20 significant digits (enough for financial calculations)
Decimal.set({
    precision: 20,                    // Maximum significant digits
    rounding: Decimal.ROUND_DOWN,     // Round down (conservative for financial)
    toExpNeg: -9,                     // Don't use exponential notation above this
    toExpPos: 21                      // Don't use exponential notation below this
})

// ============================================================================
// Core Arithmetic Functions - 核心运算函数
// ============================================================================

/**
 * Precise addition - 精确加法
 * @param {number|string} a - First number
 * @param {number|string} b - Second number
 * @param {number} decimals - Decimal places (default 4)
 * @returns {string} Result as string
 */
export function add(a, b, decimals = 4) {
    const result = new Decimal(a || 0).plus(new Decimal(b || 0))
    return result.toFixed(decimals)
}

/**
 * Precise subtraction - 精确减法
 * @param {number|string} a - First number
 * @param {number|string} b - Second number
 * @param {number} decimals - Decimal places (default 4)
 * @returns {string} Result as string
 */
export function subtract(a, b, decimals = 4) {
    const result = new Decimal(a || 0).minus(new Decimal(b || 0))
    return result.toFixed(decimals)
}

/**
 * Precise multiplication - 精确乘法
 * @param {number|string} a - First number
 * @param {number|string} b - Second number
 * @param {number} decimals - Decimal places (default 4)
 * @returns {string} Result as string
 */
export function multiply(a, b, decimals = 4) {
    const result = new Decimal(a || 0).times(new Decimal(b || 0))
    return result.toFixed(decimals)
}

/**
 * Precise division - 精确除法
 * @param {number|string} a - Dividend
 * @param {number|string} b - Divisor
 * @param {number} decimals - Decimal places (default 4)
 * @returns {string} Result as string
 */
export function divide(a, b, decimals = 4) {
    if (new Decimal(b || 0).isZero()) {
        return '0.0000'
    }
    const result = new Decimal(a || 0).dividedBy(new Decimal(b))
    return result.toFixed(decimals)
}

/**
 * Precise percentage calculation - 精确百分比计算
 * @param {number|string} amount - Base amount
 * @param {number|string} rate - Rate (0-100 for percentage, 0-1 for decimal)
 * @param {boolean} isDecimal - If true, rate is decimal (0.3 = 30%), default false
 * @param {number} decimals - Decimal places (default 4)
 * @returns {string} Result as string
 */
export function percentage(amount, rate, isDecimal = false, decimals = 4) {
    const amountDec = new Decimal(amount || 0)
    const rateDec = new Decimal(rate || 0)

    const result = isDecimal
        ? amountDec.times(rateDec)
        : amountDec.times(rateDec.dividedBy(100))

    return result.toFixed(decimals)
}

// ============================================================================
// Comparison Functions - 比较函数
// ============================================================================

/**
 * Compare two numbers - 比较两个数字
 * @param {number|string} a - First number
 * @param {number|string} b - Second number
 * @returns {number} -1 if a < b, 0 if a = b, 1 if a > b
 */
export function compare(a, b) {
    return new Decimal(a || 0).comparedTo(new Decimal(b || 0))
}

/**
 * Check if number is greater than - 大于判断
 */
export function isGreaterThan(a, b) {
    return compare(a, b) === 1
}

/**
 * Check if number is less than - 小于判断
 */
export function isLessThan(a, b) {
    return compare(a, b) === -1
}

/**
 * Check if number is greater than or equal - 大于等于判断
 */
export function isGreaterOrEqual(a, b) {
    return compare(a, b) >= 0
}

/**
 * Check if number is less than or equal - 小于等于判断
 */
export function isLessOrEqual(a, b) {
    return compare(a, b) <= 0
}

/**
 * Check if number equals zero - 等于零判断
 */
export function isZero(a) {
    return new Decimal(a || 0).isZero()
}

/**
 * Check if number is positive - 正数判断
 */
export function isPositive(a) {
    return new Decimal(a || 0).isPositive() && !new Decimal(a || 0).isZero()
}

/**
 * Get minimum value - 取最小值
 */
export function min(a, b, decimals = 4) {
    return Decimal.min(new Decimal(a || 0), new Decimal(b || 0)).toFixed(decimals)
}

/**
 * Get maximum value - 取最大值
 */
export function max(a, b, decimals = 4) {
    return Decimal.max(new Decimal(a || 0), new Decimal(b || 0)).toFixed(decimals)
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
    const usdt = new Decimal(usdtBalance || 0)
    const wld = new Decimal(wldBalance || 0)
    const price = new Decimal(wldPrice || 0)

    const wldValue = wld.times(price)
    const equity = usdt.plus(wldValue)

    return equity.toFixed(4)
}

/**
 * Calculate exchange amount - 计算闪兑金额
 * WLD to USDT: amount × price
 * USDT to WLD: amount ÷ price
 *
 * @param {number|string} amount - Input amount
 * @param {number|string} wldPrice - WLD price in USDT
 * @param {boolean} wldToUsdt - Direction: true = WLD→USDT, false = USDT→WLD
 * @returns {string} Exchange result
 */
export function calculateExchange(amount, wldPrice, wldToUsdt = true) {
    const amountDec = new Decimal(amount || 0)
    const priceDec = new Decimal(wldPrice || 0)

    if (priceDec.isZero()) {
        return '0.0000'
    }

    const result = wldToUsdt
        ? amountDec.times(priceDec)
        : amountDec.dividedBy(priceDec)

    return result.toFixed(4)
}

/**
 * Calculate fee - 计算手续费
 *
 * @param {number|string} amount - Base amount
 * @param {number|string} feeRate - Fee rate (percentage)
 * @returns {object} { fee, netAmount }
 */
export function calculateFee(amount, feeRate) {
    const amountDec = new Decimal(amount || 0)
    const rate = new Decimal(feeRate || 0).dividedBy(100)

    const fee = amountDec.times(rate)
    const netAmount = amountDec.minus(fee)

    return {
        fee: fee.toFixed(4),
        netAmount: netAmount.toFixed(4)
    }
}

/**
 * Calculate balance after operation - 计算操作后余额
 *
 * @param {number|string} currentBalance - Current balance
 * @param {number|string} amount - Operation amount
 * @param {boolean} isDeduction - true for deduction, false for addition
 * @returns {string} New balance
 */
export function calculateNewBalance(currentBalance, amount, isDeduction = true) {
    const current = new Decimal(currentBalance || 0)
    const amt = new Decimal(amount || 0)

    const result = isDeduction ? current.minus(amt) : current.plus(amt)
    return result.toFixed(4)
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
    try {
        return new Decimal(amount || 0).toFixed(decimals)
    } catch {
        return '0.0000'
    }
}

/**
 * Format amount with thousand separators - 格式化金额（带千分位）
 *
 * @param {number|string} amount - Amount to format
 * @param {number} decimals - Decimal places (default 2)
 * @returns {string} Formatted amount with separators
 */
export function formatAmountWithSeparator(amount, decimals = 2) {
    try {
        const dec = new Decimal(amount || 0)
        const fixed = dec.toFixed(decimals)
        const parts = fixed.split('.')
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        return parts.join('.')
    } catch {
        return '0.00'
    }
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
        const dec = new Decimal(str)
        return dec.toNumber()
    } catch {
        return defaultValue
    }
}

/**
 * Check if amount is valid (non-negative number) - 检查金额是否有效
 *
 * @param {number|string} amount - Amount to check
 * @returns {boolean} True if valid non-negative number
 */
export function isValidAmount(amount) {
    try {
        const dec = new Decimal(amount)
        return !dec.isNegative()
    } catch {
        return false
    }
}

/**
 * Check if amount is sufficient for operation - 检查余额是否足够
 *
 * @param {number|string} balance - Current balance
 * @param {number|string} amount - Required amount
 * @returns {boolean} True if balance >= amount
 */
export function hasEnoughBalance(balance, amount) {
    return isGreaterOrEqual(balance, amount)
}

/**
 * Sum array of amounts - 求和数组金额
 *
 * @param {Array} amounts - Array of amounts
 * @returns {string} Sum as string
 */
export function sumAmounts(amounts) {
    let total = new Decimal(0)
    for (const amount of amounts) {
        total = total.plus(new Decimal(amount || 0))
    }
    return total.toFixed(4)
}

/**
 * Calculate percentage of total - 计算占比
 *
 * @param {number|string} part - Part amount
 * @param {number|string} total - Total amount
 * @returns {string} Percentage string (e.g. "25.50%")
 */
export function calculatePercentageOfTotal(part, total) {
    const totalDec = new Decimal(total || 0)
    if (totalDec.isZero()) {
        return '0.00%'
    }
    const partDec = new Decimal(part || 0)
    const percent = partDec.dividedBy(totalDec).times(100)
    return percent.toFixed(2) + '%'
}

// ============================================================================
// Export Default
// ============================================================================

export default {
    // Core arithmetic
    add,
    subtract,
    multiply,
    divide,
    percentage,

    // Comparison
    compare,
    isGreaterThan,
    isLessThan,
    isGreaterOrEqual,
    isLessOrEqual,
    isZero,
    isPositive,
    min,
    max,

    // Financial calculations
    calculateEquity,
    calculateExchange,
    calculateFee,
    calculateNewBalance,

    // Utilities
    formatAmount,
    formatAmountWithSeparator,
    parseNumber,
    isValidAmount,
    hasEnoughBalance,
    sumAmounts,
    calculatePercentageOfTotal
}

