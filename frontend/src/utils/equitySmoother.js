/**
 * Equity Smoother - Stabilize "Equity Value (USDT)" display
 *
 * English Notes:
 * - Equity is computed as: USDT + (WLD × WLDUSDT price).
 * - The WLDUSDT market price changes frequently, which can make the displayed equity "jump" by tiny amounts.
 * - This helper applies a threshold so we only update the price used for equity when the change is meaningful.
 *
 * This file is intentionally small and focused to avoid bloating large view components.
 */

import Decimal from 'decimal.js'

/**
 * Decide whether we should update the price used for equity display.
 *
 * @param {number|string} oldPrice - Previous WLDUSDT price used for equity
 * @param {number|string} newPrice - Newly fetched WLDUSDT price
 * @param {number|string} wldBalance - Current WLD balance
 * @param {number|string} minEquityDeltaUsdt - Minimum equity delta (USDT) to trigger update
 * @returns {boolean} True if update should happen
 */
export function shouldUpdateEquityPrice(oldPrice, newPrice, wldBalance, minEquityDeltaUsdt = '0.01') {
  try {
    const oldP = new Decimal(oldPrice || 0)
    const newP = new Decimal(newPrice || 0)
    const wld = new Decimal(wldBalance || 0)

    if (wld.isZero() || !wld.isPositive()) return false
    if (oldP.isZero()) return true
    if (newP.isZero()) return false

    const deltaPrice = newP.minus(oldP).abs()
    const equityDelta = deltaPrice.times(wld)

    return equityDelta.greaterThanOrEqualTo(new Decimal(minEquityDeltaUsdt || 0))
  } catch {
    // Fail safe: if parsing fails, allow update so UI does not get stuck.
    return true
  }
}


