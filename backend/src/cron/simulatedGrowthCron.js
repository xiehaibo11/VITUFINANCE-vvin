/**
 * 模拟金额自动增长定时任务
 * 
 * 功能：
 * - 每10秒自动增长Follow和Robot页面的模拟金额
 * - Growth is time-based (deterministic) to avoid large random jumps
 * - Each page (follow/robot) increases by a fixed daily amount
 * - 持久化存储到数据库
 * - 记录增长日志
 * 
 * 创建时间: 2025-12-16
 */

import { query as dbQuery } from '../../db.js';

// ==================== Deterministic Growth Config ====================
// IMPORTANT:
// - User requirement: Robot + Follow simulated amount should increase ~2,000,000 per day (each page).
// - 24 hours per day -> 2,000,000 / 24 = 83,333.33 per hour
// - This module runs every 10 seconds by default. We calculate increment by elapsed seconds to be robust to restarts.
const DAILY_INCREASE_AMOUNT = 2_000_000; // USD per day (per page)
const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * 获取页面配置
 * @param {string} pageType - 'follow' 或 'robot'
 */
async function getPageConfig(pageType) {
  try {
    const result = await dbQuery(
      `SELECT * FROM simulated_growth_config WHERE page_type = ?`,
      [pageType]
    );
    return result[0] || null;
  } catch (error) {
    console.error(`[SimulatedGrowth] 获取${pageType}配置失败:`, error.message);
    return null;
  }
}

/**
 * Calculate deterministic increment by elapsed seconds.
 *
 * @param {number} elapsedSeconds - Seconds since last update
 * @returns {number} Increment amount
 */
function getDeterministicIncrement(elapsedSeconds) {
  // Clamp to avoid negative/zero values due to clock skew or same-second updates.
  const safeElapsed = Math.max(1, Math.floor(elapsedSeconds || 0));
  const perSecond = DAILY_INCREASE_AMOUNT / SECONDS_PER_DAY;
  return perSecond * safeElapsed;
}

/**
 * 更新模拟金额并记录日志
 * @param {string} pageType - 'follow' 或 'robot'
 */
async function growSimulatedAmount(pageType) {
  try {
    // 1. 获取配置
    const config = await getPageConfig(pageType);
    
    if (!config) {
      console.warn(`[SimulatedGrowth] ${pageType}页面配置不存在，跳过增长`);
      return;
    }
    
    if (!config.growth_enabled) {
      console.log(`[SimulatedGrowth] ${pageType}页面增长已禁用`);
      return;
    }
    
    // 2. Deterministic growth by elapsed time (avoid random jump)
    const oldTotal = parseFloat(config.current_simulated_amount) || 0;

    // Prefer DB `updated_at` as the last growth timestamp.
    // Note: MySQL DATETIME has second precision here; we clamp elapsedSeconds to >= 1.
    const lastUpdatedAtMs = config.updated_at ? new Date(config.updated_at).getTime() : 0;
    const nowMs = Date.now();
    const elapsedSeconds = lastUpdatedAtMs > 0 ? (nowMs - lastUpdatedAtMs) / 1000 : 10;

    const increment = getDeterministicIncrement(elapsedSeconds);
    const newTotal = oldTotal + increment;
    
    // 3. 更新配置表
    await dbQuery(
      `UPDATE simulated_growth_config 
       SET current_simulated_amount = ?, updated_at = NOW() 
       WHERE page_type = ?`,
      [newTotal, pageType]
    );
    
    // 4. 记录增长日志
    await dbQuery(
      `INSERT INTO simulated_growth_logs 
       (page_type, increment_amount, total_simulated_before, total_simulated_after) 
       VALUES (?, ?, ?, ?)`,
      // Keep 4-decimal precision in logs to avoid rounding drift.
      [pageType, Number(increment.toFixed(4)), Number(oldTotal.toFixed(4)), Number(newTotal.toFixed(4))]
    );
    
    // Log with 2 decimals for readability (same as UI)
    console.log(`[SimulatedGrowth] ${pageType.toUpperCase()} +${increment.toFixed(2)} → ${newTotal.toFixed(2)}`);
    
  } catch (error) {
    console.error(`[SimulatedGrowth] ${pageType}增长失败:`, error.message);
  }
}

/**
 * 执行所有页面的增长
 */
export async function runSimulatedGrowth() {
  try {
    // 同时增长Follow和Robot页面
    await Promise.all([
      growSimulatedAmount('follow'),
      growSimulatedAmount('robot')
    ]);
  } catch (error) {
    console.error('[SimulatedGrowth] 增长任务执行失败:', error.message);
  }
}

/**
 * 启动定时任务
 */
export function startSimulatedGrowthCron() {
  console.log('[SimulatedGrowth] 🚀 启动模拟金额自动增长服务');
  console.log('[SimulatedGrowth] ⚙️  配置: 每10秒增长一次');
  
  // 立即执行一次
  runSimulatedGrowth();
  
  // 每10秒执行一次
  setInterval(runSimulatedGrowth, 10000);
}

/**
 * 获取页面总金额（模拟+真实）
 * @param {string} pageType - 'follow' 或 'robot'
 * @returns {object} 总金额信息
 */
export async function getPageTotalAmount(pageType) {
  try {
    // 1. 获取配置（模拟基础+累计增长）
    const config = await getPageConfig(pageType);
    if (!config) {
      return {
        success: false,
        error: '配置不存在'
      };
    }
    
    const simulatedBase = parseFloat(config.base_amount);
    const simulatedGrowth = parseFloat(config.current_simulated_amount);
    const totalSimulated = simulatedBase + simulatedGrowth;
    
    // 2. 获取真实用户投资
    let realUserInvestment = 0;
    
    if (pageType === 'follow') {
      // Follow页面 = Grid + High机器人
      const result = await dbQuery(
        `SELECT 
          COALESCE(SUM(CASE WHEN robot_type = 'grid' THEN price ELSE 0 END), 0) as grid_total,
          COALESCE(SUM(CASE WHEN robot_type = 'high' THEN price ELSE 0 END), 0) as high_total
         FROM robot_purchases 
         WHERE status = 'active'`
      );
      realUserInvestment = parseFloat(result[0]?.grid_total || 0) + parseFloat(result[0]?.high_total || 0);
    } else if (pageType === 'robot') {
      // Robot页面 = CEX + DEX机器人
      const result = await dbQuery(
        `SELECT 
          COALESCE(SUM(price), 0) as robot_total
         FROM robot_purchases 
         WHERE status = 'active' AND robot_type IN ('cex', 'dex')`
      );
      realUserInvestment = parseFloat(result[0]?.robot_total || 0);
    }
    
    // 3. 计算总金额
    const totalAmount = totalSimulated + realUserInvestment;
    
    return {
      success: true,
      data: {
        total_amount: totalAmount.toFixed(2),
        simulated_base: simulatedBase.toFixed(2),
        simulated_growth: simulatedGrowth.toFixed(2),
        total_simulated: totalSimulated.toFixed(2),
        real_user_investment: realUserInvestment.toFixed(2)
      }
    };
    
  } catch (error) {
    console.error(`[SimulatedGrowth] 获取${pageType}总金额失败:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  startSimulatedGrowthCron,
  runSimulatedGrowth,
  getPageTotalAmount
};

