/**
 * Broker Level Cron Job - 经纪人等级定时计算任务
 *
 * Calculates broker levels and distributes dividends
 * 
 * Schedule:
 * - Level calculation: Every hour
 * - Daily dividends: Every day at 00:05
 * - Monthly salary: 1st of every month at 00:10
 */

import {
    calculateBrokerLevel,
    calculateDailyBonus,
    calculateMonthlyBonus,
    getDailyWldLimit,
    BROKER_LEVELS
} from '../utils/precisionMath.js';

// Database query function (set from server.js)
let dbQuery = null;

/**
 * Set database query function
 * @param {Function} queryFn - Database query function
 */
export function setDbQuery(queryFn) {
    dbQuery = queryFn;
}

/**
 * Calculate and update broker levels for all users
 * Runs every hour
 */
export async function calculateAllBrokerLevels() {
    if (!dbQuery) {
        console.error('[BrokerLevel] Database not connected');
        return;
    }
    
    console.log('[BrokerLevel] Starting broker level calculation...');
    
    try {
        // Get all users with referrals
        const users = await dbQuery(`
            SELECT DISTINCT r.referrer_address as wallet_address
            FROM user_referrals r
            WHERE r.referrer_address IS NOT NULL
        `);
        
        let updated = 0;
        let levelChanges = [];
        
        for (const user of users) {
            const walletAddr = user.wallet_address;
            
            // Get direct referrals with their investments
            const directReferrals = await dbQuery(`
                SELECT 
                    ur.wallet_address,
                    COALESCE(SUM(CASE WHEN rp.status IN ('active','expired') THEN rp.price ELSE 0 END), 0) as totalInvestment
                FROM user_referrals ur
                LEFT JOIN robot_purchases rp ON ur.wallet_address = rp.wallet_address
                WHERE ur.referrer_address = ?
                GROUP BY ur.wallet_address
            `, [walletAddr]);
            
            // Get team volume (all downlines)
            const teamVolume = await getTeamVolume(walletAddr);

            // Get team members count (all downlines, max depth 8)
            const teamMembers = await getTeamMembers(walletAddr);
            
            // Get subordinate levels
            const subordinateLevels = await getSubordinateLevels(walletAddr);
            
            // Calculate broker level
            const userData = {
                directReferrals: directReferrals.map(r => ({
                    totalInvestment: parseFloat(r.totalInvestment) || 0
                })),
                teamVolume: parseFloat(teamVolume),
                subordinateLevels,
                teamMembers
            };
            
            const levelResult = calculateBrokerLevel(userData);
            
            // Get current level from database
            const currentRecords = await dbQuery(`
                SELECT level FROM broker_levels WHERE wallet_address = ?
            `, [walletAddr]);
            
            const oldLevel = (currentRecords && currentRecords.length > 0) ? currentRecords[0].level : 0;
            
            // Update or insert broker level record
            await dbQuery(`
                INSERT INTO broker_levels 
                (wallet_address, level, direct_count, team_volume, 
                 lv1_subordinates, lv2_subordinates, lv3_subordinates, lv4_subordinates,
                 last_calculated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    level = VALUES(level),
                    direct_count = VALUES(direct_count),
                    team_volume = VALUES(team_volume),
                    lv1_subordinates = VALUES(lv1_subordinates),
                    lv2_subordinates = VALUES(lv2_subordinates),
                    lv3_subordinates = VALUES(lv3_subordinates),
                    lv4_subordinates = VALUES(lv4_subordinates),
                    last_calculated_at = NOW()
            `, [
                walletAddr,
                levelResult.currentLevel,
                directReferrals.length,
                teamVolume,
                subordinateLevels[1] || 0,
                subordinateLevels[2] || 0,
                subordinateLevels[3] || 0,
                subordinateLevels[4] || 0
            ]);
            
            updated++;
            
            // Track level changes
            if (oldLevel !== levelResult.currentLevel) {
                levelChanges.push({
                    wallet: walletAddr.substring(0, 10) + '...',
                    from: oldLevel,
                    to: levelResult.currentLevel
                });
            }
        }
        
        console.log(`[BrokerLevel] Updated ${updated} users`);
        if (levelChanges.length > 0) {
            console.log(`[BrokerLevel] Level changes: ${levelChanges.length}`);
            levelChanges.forEach(c => {
                console.log(`  ${c.wallet}: LV${c.from} → LV${c.to}`);
            });
        }
        
    } catch (error) {
        console.error('[BrokerLevel] Error:', error.message);
    }
}

/**
 * Get team volume recursively
 */
async function getTeamVolume(walletAddr, visited = new Set()) {
    return await getTeamVolumeWithDepth(walletAddr, 1, visited);
}

/**
 * Get team member count recursively (max depth 8).
 *
 * Customer requirement:
 * - Team member count is used as a hard gate for broker level qualification.
 * - Count unique downline wallet addresses (exclude self).
 *
 * @param {string} walletAddr - Wallet address
 * @returns {Promise<number>} Unique team member count
 */
async function getTeamMembers(walletAddr) {
    const visited = new Set();
    const collected = new Set();

    async function walk(addr, depth) {
        if (depth > 8) return;
        if (!addr) return;
        const key = String(addr).toLowerCase();
        if (visited.has(key)) return;
        visited.add(key);

        const refs = await dbQuery(
            'SELECT wallet_address FROM user_referrals WHERE referrer_address = ?',
            [key]
        );
        for (const r of refs || []) {
            const child = String(r.wallet_address || '').toLowerCase();
            if (!child) continue;
            collected.add(child);
            await walk(child, depth + 1);
        }
    }

    await walk(walletAddr, 1);
    return collected.size;
}

/**
 * Get team volume recursively (max depth 8)
 *
 * IMPORTANT:
 * - Business rule defines "team investment" as sum of robot purchases (price)
 * - Only count robots with status in ('active','expired')
 * - Limit to 8 levels downline to match platform rule
 *
 * @param {string} walletAddr - Wallet address
 * @param {number} depth - Current depth (1 = direct)
 * @param {Set<string>} visited - Cycle guard
 * @returns {Promise<number>} Team volume
 */
async function getTeamVolumeWithDepth(walletAddr, depth = 1, visited = new Set()) {
    if (depth > 8) return 0;
    if (visited.has(walletAddr)) return 0;
    visited.add(walletAddr);
    
    // Get direct referrals' investments
    const result = await dbQuery(`
        SELECT COALESCE(SUM(rp.price), 0) as volume
        FROM user_referrals ur
        JOIN robot_purchases rp ON ur.wallet_address = rp.wallet_address
        WHERE ur.referrer_address = ?
          AND rp.status IN ('active','expired')
    `, [walletAddr]);
    
    let totalVolume = parseFloat(result?.[0]?.volume) || 0;
    
    // Get direct referrals for recursion
    const directRefs = await dbQuery(`
        SELECT wallet_address FROM user_referrals WHERE referrer_address = ?
    `, [walletAddr]);
    
    // Recursively get subordinate volumes (max depth 8)
        for (const ref of directRefs) {
        totalVolume += await getTeamVolumeWithDepth(ref.wallet_address, depth + 1, visited);
    }
    
    return totalVolume;
}

/**
 * Get count of subordinates at each level
 */
async function getSubordinateLevels(walletAddr) {
    const levels = {};
    
    // Get direct referrals' broker levels
    const subordinates = await dbQuery(`
        SELECT bl.level, COUNT(*) as count
        FROM user_referrals ur
        JOIN broker_levels bl ON ur.wallet_address = bl.wallet_address
        WHERE ur.referrer_address = ? AND bl.level > 0
        GROUP BY bl.level
    `, [walletAddr]);
    
    subordinates.forEach(s => {
        levels[s.level] = s.count;
    });
    
    return levels;
}

/**
 * Distribute daily dividends to all qualified brokers
 * Runs every day at 00:05
 */
export async function distributeDailyDividends() {
    if (!dbQuery) {
        console.error('[BrokerDividend] Database not connected');
        return;
    }
    
    console.log('[BrokerDividend] Starting daily dividend distribution...');
    
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Get all brokers with level >= 1
        const brokers = await dbQuery(`
            SELECT wallet_address, level 
            FROM broker_levels 
            WHERE level >= 1
        `);
        
        let distributed = 0;
        let totalAmount = 0;
        
        for (const broker of brokers) {
            const dailyBonus = parseFloat(calculateDailyBonus(broker.level));
            
            if (dailyBonus <= 0) continue;
            
            // Check if already distributed today
            const existing = await dbQuery(`
                SELECT id FROM team_dividends 
                WHERE wallet_address = ? AND dividend_date = ? AND dividend_type = 'daily'
            `, [broker.wallet_address, today]);
            
            if (existing && existing.length > 0) continue;
            
            // Create dividend record
            await dbQuery(`
                INSERT INTO team_dividends 
                (wallet_address, level, dividend_type, amount, dividend_date, status, paid_at)
                VALUES (?, ?, 'daily', ?, ?, 'paid', NOW())
            `, [broker.wallet_address, broker.level, dailyBonus, today]);
            
            // Add to user balance
            await dbQuery(`
                UPDATE user_balances 
                SET usdt_balance = usdt_balance + ?, updated_at = NOW()
                WHERE wallet_address = ?
            `, [dailyBonus, broker.wallet_address]);
            
            distributed++;
            totalAmount += dailyBonus;
            
            console.log(`[BrokerDividend] Daily: ${broker.wallet_address.substring(0, 10)}... LV${broker.level} +${dailyBonus} USDT`);
        }
        
        console.log(`[BrokerDividend] Daily distribution complete: ${distributed} brokers, total ${totalAmount.toFixed(4)} USDT`);
        
    } catch (error) {
        console.error('[BrokerDividend] Daily error:', error.message);
    }
}

/**
 * Distribute monthly salary to all qualified brokers
 * Runs on 1st of every month at 00:10
 */
export async function distributeMonthlyBonus() {
    if (!dbQuery) {
        console.error('[BrokerDividend] Database not connected');
        return;
    }
    
    console.log('[BrokerDividend] Starting monthly salary distribution...');
    
    try {
        const today = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
            .toISOString().split('T')[0];
        
        // Get all brokers with level >= 1
        const brokers = await dbQuery(`
            SELECT wallet_address, level 
            FROM broker_levels 
            WHERE level >= 1
        `);
        
        let distributed = 0;
        let totalAmount = 0;
        
        for (const broker of brokers) {
            const monthlyBonus = parseFloat(calculateMonthlyBonus(broker.level));
            
            if (monthlyBonus <= 0) continue;
            
            // Check if already distributed this month
            const existing = await dbQuery(`
                SELECT id FROM team_dividends 
                WHERE wallet_address = ? 
                AND dividend_date >= ? 
                AND dividend_type = 'monthly'
            `, [broker.wallet_address, firstOfMonth]);
            
            if (existing && existing.length > 0) continue;
            
            // Create dividend record
            await dbQuery(`
                INSERT INTO team_dividends 
                (wallet_address, level, dividend_type, amount, dividend_date, status, paid_at)
                VALUES (?, ?, 'monthly', ?, ?, 'paid', NOW())
            `, [broker.wallet_address, broker.level, monthlyBonus, firstOfMonth]);
            
            // Add to user balance
            await dbQuery(`
                UPDATE user_balances 
                SET usdt_balance = usdt_balance + ?, updated_at = NOW()
                WHERE wallet_address = ?
            `, [monthlyBonus, broker.wallet_address]);
            
            distributed++;
            totalAmount += monthlyBonus;
            
            console.log(`[BrokerDividend] Monthly: ${broker.wallet_address.substring(0, 10)}... LV${broker.level} +${monthlyBonus} USDT`);
        }
        
        console.log(`[BrokerDividend] Monthly distribution complete: ${distributed} brokers, total ${totalAmount.toFixed(4)} USDT`);
        
    } catch (error) {
        console.error('[BrokerDividend] Monthly error:', error.message);
    }
}

/**
 * Start broker level cron jobs
 */
export function startBrokerLevelCron() {
    console.log('[BrokerLevel] Starting broker level cron service...');
    
    // Calculate levels every hour
    setInterval(calculateAllBrokerLevels, 60 * 60 * 1000);
    
    // Check and distribute daily dividends every hour (actual check in function)
    setInterval(() => {
        const hour = new Date().getHours();
        if (hour === 0) {
            distributeDailyDividends();
        }
    }, 60 * 60 * 1000);
    
    // Check and distribute monthly salary on 1st of month
    setInterval(() => {
        const now = new Date();
        if (now.getDate() === 1 && now.getHours() === 0) {
            distributeMonthlyBonus();
        }
    }, 60 * 60 * 1000);
    
    // Run initial calculation
    setTimeout(calculateAllBrokerLevels, 5000);
    
    console.log('[BrokerLevel] Cron service started');
}

export default {
    setDbQuery,
    calculateAllBrokerLevels,
    distributeDailyDividends,
    distributeMonthlyBonus,
    startBrokerLevelCron
};
