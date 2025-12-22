/**
 * Referral Rewards Mathematical Model
 *
 * Provides referral reward system calculation, analysis, and verification tools
 *
 * 2024-12-23 UPDATE: Restored correct rates per business requirements
 *
 * CEX/Grid/High Robots: Based on quantify PROFIT
 *   - R_n = Profit × r_n
 *   - r = [30%, 10%, 5%, 1%, 1%, 1%, 1%, 1%] = Total 50%
 *
 * DEX Robots: Based on LAUNCH AMOUNT (purchase amount)
 *   - R_n = Amount × r_n
 *   - r = [5%, 3%, 2%] = Total 10%
 *   - Paid immediately on purchase
 */

// ============================================================================
// Safety Limits Configuration
// ============================================================================
const REFERRAL_SAFETY_LIMITS = {
    MAX_SINGLE_REWARD: 500,             // Max single reward 500 USDT
    MAX_DAILY_REWARD_PER_USER: 2000,    // Max daily reward per user 2000 USDT
    MIN_PROFIT_FOR_REWARD: 0.01,        // Min profit to trigger reward 0.01 USDT
    MAX_TOTAL_RATE: 0.60,               // Max total referral rate 60%
};

// ============================================================================
// Constants - Reward Rate Configuration (FIXED - Much Lower!)
// ============================================================================

/**
 * CEX/Grid/High Robot Referral Reward Rates (8 levels)
 * Based on quantify PROFIT (not purchase amount)
 * 1级 30%, 2级 10%, 3级 5%, 4-8级 1% each
 * Total: 30% + 10% + 5% + 1%×5 = 50%
 */
const CEX_REFERRAL_RATES = [0.30, 0.10, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01];

/**
 * DEX Robot Launch Amount Reward Rates (3 levels)
 * Based on LAUNCH AMOUNT (purchase amount), paid immediately on purchase
 * 1级 5%, 2级 3%, 3级 2%
 * Total: 5% + 3% + 2% = 10%
 */
const DEX_REFERRAL_RATES = [0.05, 0.03, 0.02];

// ============================================================================
// Core Math Calculation Functions (with safety limits)
// ============================================================================

/**
 * Calculate reward amount for a single level (with safety limits)
 * Formula: R = min(Amount × Rate, MAX_SINGLE_REWARD)
 * 
 * @param {number} amount - Base amount (profit or launch amount)
 * @param {number} rate - Reward rate (0-1 decimal)
 * @returns {number} Reward amount (with safety limits applied)
 */
function calculateLevelReward(amount, rate) {
    // Safety check: Skip if amount too small
    if (amount < REFERRAL_SAFETY_LIMITS.MIN_PROFIT_FOR_REWARD) {
        return 0;
    }
    
    let reward = amount * rate;
    
    // Safety check: Cap single reward
    if (reward > REFERRAL_SAFETY_LIMITS.MAX_SINGLE_REWARD) {
        console.warn(`[SAFETY] Referral reward capped: original=${reward.toFixed(4)}, capped=${REFERRAL_SAFETY_LIMITS.MAX_SINGLE_REWARD}`);
        reward = REFERRAL_SAFETY_LIMITS.MAX_SINGLE_REWARD;
    }
    
    return parseFloat(reward.toFixed(4));
}

/**
 * Calculate CEX robot referral rewards for all levels
 * 
 * Math Model:
 * Total Reward = Σ(P × r_i), i = 1 to 8
 * where P = quantify profit, r_i = level i reward rate
 * 
 * @param {number} profit - Quantify profit amount
 * @returns {Object} Reward distribution details
 */
function calculateCexRewards(profit) {
    const rewards = [];
    let totalDistributed = 0;

    for (let level = 1; level <= 8; level++) {
        const rate = CEX_REFERRAL_RATES[level - 1];
        const rewardAmount = calculateLevelReward(profit, rate);
        totalDistributed += rewardAmount;

        rewards.push({
            level,
            rate: rate,
            ratePercent: rate * 100,
            rewardAmount: rewardAmount,
            formula: `${profit} × ${rate} = ${rewardAmount.toFixed(4)}`
        });
    }

    return {
        type: 'CEX',
        baseAmount: profit,
        totalLevels: 8,
        rewards,
        totalDistributed,
        totalDistributedPercent: (totalDistributed / profit * 100).toFixed(2),
        netProfit: profit - totalDistributed,
        summary: `Quantify profit ${profit} USDT, distributed to 8-level referrers ${totalDistributed.toFixed(4)} USDT (${(totalDistributed / profit * 100).toFixed(2)}%)`
    };
}

/**
 * Calculate DEX robot referral rewards for all levels
 * 
 * Math Model:
 * Total Reward = Σ(A × r_i), i = 1 to 3
 * where A = launch amount, r_i = level i reward rate
 * 
 * @param {number} purchaseAmount - Launch amount
 * @returns {Object} Reward distribution details
 */
function calculateDexRewards(purchaseAmount) {
    const rewards = [];
    let totalDistributed = 0;

    for (let level = 1; level <= 3; level++) {
        const rate = DEX_REFERRAL_RATES[level - 1];
        const rewardAmount = calculateLevelReward(purchaseAmount, rate);
        totalDistributed += rewardAmount;

        rewards.push({
            level,
            rate: rate,
            ratePercent: rate * 100,
            rewardAmount: rewardAmount,
            formula: `${purchaseAmount} × ${rate} = ${rewardAmount.toFixed(4)}`
        });
    }

    return {
        type: 'DEX',
        baseAmount: purchaseAmount,
        totalLevels: 3,
        rewards,
        totalDistributed,
        totalDistributedPercent: (totalDistributed / purchaseAmount * 100).toFixed(2),
        summary: `Launch amount ${purchaseAmount} USDT, distributed to 3-level referrers ${totalDistributed.toFixed(4)} USDT (${(totalDistributed / purchaseAmount * 100).toFixed(2)}%)`
    };
}

// ============================================================================
// Advanced Analysis Functions
// ============================================================================

/**
 * Analyze referral chain earning potential
 * 
 * @param {number} avgProfit - Average profit per person
 * @param {number} avgReferrals - Average referrals per person
 * @param {string} type - 'CEX' or 'DEX'
 * @returns {Object} Cumulative earnings analysis
 */
function analyzeReferralChainPotential(avgProfit, avgReferrals, type = 'CEX') {
    const rates = type === 'CEX' ? CEX_REFERRAL_RATES : DEX_REFERRAL_RATES;
    const maxLevel = rates.length;
    const analysis = [];
    let totalPotentialReward = 0;

    for (let level = 1; level <= maxLevel; level++) {
        const peopleAtLevel = Math.pow(avgReferrals, level - 1);
        const rate = rates[level - 1];
        
        const levelTotalProfit = peopleAtLevel * avgProfit;
        const rewardFromLevel = levelTotalProfit * rate;
        totalPotentialReward += rewardFromLevel;

        analysis.push({
            level,
            peopleAtLevel: Math.round(peopleAtLevel),
            rate: rate,
            ratePercent: rate * 100,
            levelTotalProfit: levelTotalProfit,
            rewardFromLevel: rewardFromLevel,
            formula: `${Math.round(peopleAtLevel)} people × ${avgProfit} × ${rate * 100}% = ${rewardFromLevel.toFixed(4)}`
        });
    }

    return {
        type,
        avgProfit,
        avgReferrals,
        maxLevel,
        analysis,
        totalPotentialReward,
        summary: `Assuming ${avgReferrals} referrals per person, ${avgProfit} USDT profit each, total potential reward: ${totalPotentialReward.toFixed(4)} USDT`
    };
}

/**
 * Validate reward configuration correctness
 *
 * Validation Rules (2024-12-23 UPDATE):
 * 1. CEX total rate must be 50% (30% + 10% + 5% + 1%×5)
 * 2. DEX total rate must be 10% (5% + 3% + 2%)
 * 3. Total rate cannot exceed safety limit
 *
 * @returns {Object} Validation result
 */
function validateRewardConfiguration() {
    // Calculate CEX total rate
    const cexTotalRate = CEX_REFERRAL_RATES.reduce((sum, rate) => sum + rate, 0);
    const cexExpectedRate = 0.50; // 50%: 30% + 10% + 5% + 1%×5

    // Calculate DEX total rate
    const dexTotalRate = DEX_REFERRAL_RATES.reduce((sum, rate) => sum + rate, 0);
    const dexExpectedRate = 0.10; // 10%: 5% + 3% + 2%

    // Precision validation (consider floating point error)
    const tolerance = 0.001;
    const cexValid = Math.abs(cexTotalRate - cexExpectedRate) < tolerance;
    const dexValid = Math.abs(dexTotalRate - dexExpectedRate) < tolerance;
    
    // Safety check: Total rate cannot exceed limit
    const cexSafe = cexTotalRate <= REFERRAL_SAFETY_LIMITS.MAX_TOTAL_RATE;
    const dexSafe = dexTotalRate <= REFERRAL_SAFETY_LIMITS.MAX_TOTAL_RATE;

    return {
        cex: {
            rates: CEX_REFERRAL_RATES,
            totalRate: cexTotalRate,
            totalPercent: (cexTotalRate * 100).toFixed(2) + '%',
            expected: (cexExpectedRate * 100).toFixed(1) + '%',
            valid: cexValid,
            safe: cexSafe,
            message: cexValid && cexSafe ? '✓ CEX reward config correct and safe' : '✗ CEX reward config has issues'
        },
        dex: {
            rates: DEX_REFERRAL_RATES,
            totalRate: dexTotalRate,
            totalPercent: (dexTotalRate * 100).toFixed(2) + '%',
            expected: (dexExpectedRate * 100).toFixed(1) + '%',
            valid: dexValid,
            safe: dexSafe,
            message: dexValid && dexSafe ? '✓ DEX reward config correct and safe' : '✗ DEX reward config has issues'
        },
        safetyLimits: REFERRAL_SAFETY_LIMITS,
        allValid: cexValid && dexValid,
        allSafe: cexSafe && dexSafe,
        summary: cexValid && dexValid && cexSafe && dexSafe
            ? '✓ All reward configs validated and safe' 
            : '✗ Some reward configs have issues'
    };
}

/**
 * Calculate expected rewards for a referrer
 * 
 * @param {Array} downlineData - Downline data array [{level: 1, count: 10, avgProfit: 100}, ...]
 * @param {string} type - 'CEX' or 'DEX'
 * @returns {Object} Expected earnings analysis
 */
function calculateExpectedRewards(downlineData, type = 'CEX') {
    const rates = type === 'CEX' ? CEX_REFERRAL_RATES : DEX_REFERRAL_RATES;
    const calculations = [];
    let totalExpectedReward = 0;

    for (const item of downlineData) {
        const { level, count, avgProfit } = item;
        
        if (level < 1 || level > rates.length) {
            continue;
        }

        const rate = rates[level - 1];
        const totalLevelProfit = count * avgProfit;
        const expectedReward = totalLevelProfit * rate;
        totalExpectedReward += expectedReward;

        calculations.push({
            level,
            count,
            avgProfit,
            rate: rate,
            ratePercent: rate * 100,
            totalLevelProfit,
            expectedReward,
            formula: `${count} people × ${avgProfit} × ${rate * 100}% = ${expectedReward.toFixed(4)}`
        });
    }

    return {
        type,
        calculations,
        totalExpectedReward,
        summary: `Expected total reward: ${totalExpectedReward.toFixed(4)} USDT`
    };
}

/**
 * Generate complete math model report
 * 
 * @param {number} testAmount - Test amount
 * @returns {Object} Complete report
 */
function generateMathReport(testAmount = 1000) {
    return {
        title: 'Referral Reward System Math Model Analysis Report',
        timestamp: new Date().toISOString(),
        
        // Config validation
        configValidation: validateRewardConfiguration(),
        
        // CEX example calculation
        cexExample: calculateCexRewards(testAmount),
        
        // DEX example calculation
        dexExample: calculateDexRewards(testAmount),
        
        // Chain analysis (assuming 3 referrals per person)
        chainAnalysis: {
            cex: analyzeReferralChainPotential(testAmount, 3, 'CEX'),
            dex: analyzeReferralChainPotential(testAmount, 3, 'DEX')
        },
        
        // Math formula description
        formulas: {
            cex: {
                description: 'CEX/Grid/High robot quantify profit reward',
                formula: 'R_n = P × r_n',
                variables: {
                    'R_n': 'Reward for level n referrer',
                    'P': 'User quantify profit',
                    'r_n': 'Level n reward rate'
                },
                rates: 'r = [30%, 10%, 5%, 1%, 1%, 1%, 1%, 1%]',
                totalRate: 'Total rate = Σr_n = 50%'
            },
            dex: {
                description: 'DEX robot launch amount reward (immediate)',
                formula: 'R_n = A × r_n',
                variables: {
                    'R_n': 'Reward for level n referrer',
                    'A': 'User launch amount',
                    'r_n': 'Level n reward rate'
                },
                rates: 'r = [5%, 3%, 2%]',
                totalRate: 'Total rate = Σr_n = 10%'
            }
        }
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format amount display
 * @param {number} amount - Amount
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted amount
 */
function formatAmount(amount, decimals = 4) {
    return amount.toFixed(decimals);
}

/**
 * Format percentage display
 * @param {number} rate - Rate (0-1)
 * @returns {string} Formatted percentage
 */
function formatPercent(rate) {
    return (rate * 100).toFixed(2) + '%';
}

// ============================================================================
// Export Module (ES Module)
// ============================================================================

export {
    // Safety limits
    REFERRAL_SAFETY_LIMITS,
    
    // Constants
    CEX_REFERRAL_RATES,
    DEX_REFERRAL_RATES,
    
    // Core calculation functions
    calculateLevelReward,
    calculateCexRewards,
    calculateDexRewards,
    
    // Advanced analysis functions
    analyzeReferralChainPotential,
    validateRewardConfiguration,
    calculateExpectedRewards,
    generateMathReport,
    
    // Utility functions
    formatAmount,
    formatPercent
};

