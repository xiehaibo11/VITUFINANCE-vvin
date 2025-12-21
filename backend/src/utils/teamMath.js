/**
 * Team Rewards Mathematical Model
 * 
 * Provides team broker level system calculation, analysis, and verification tools
 * 
 * 2024-12-21 FIX: Reduced dividend amounts to prevent company losses
 * 
 * Level System (after fix):
 * - Level 1: 5 direct referrals, >1,000 USDT performance, 2 USDT/day
 * - Level 2: 10 direct referrals, 2 L1 brokers, >5,000 USDT, 5 USDT/day
 * - Level 3: 20 direct referrals, 2 L2 brokers, >20,000 USDT, 15 USDT/day
 * - Level 4: 30 direct referrals, 2 L3 brokers, >80,000 USDT, 50 USDT/day
 * - Level 5: 50 direct referrals, 2 L4 brokers, >200,000 USDT, 150 USDT/day
 */

// ============================================================================
// Safety Limits Configuration
// ============================================================================
const TEAM_SAFETY_LIMITS = {
    MAX_DAILY_DIVIDEND: 200,         // Max daily dividend 200 USDT
    MAX_DAILY_WLD: 20,               // Max daily WLD 20 WLD
    MAX_TOTAL_DAILY_PAYOUT: 5000,    // Platform max daily payout 5000 USDT
};

// ============================================================================
// Constants - Broker Level Configuration (2024-12-21 FIXED - Much Lower!)
// ============================================================================

/**
 * Broker Level Configuration Table
 * 
 * Math Model:
 * - minDirectReferrals: Min direct referrals (purchased >=20U robot)
 * - minSubBrokers: Min sub-brokers (need N lower level brokers)
 * - minTeamPerformance: Min team performance (USDT)
 * - dailyDividend: Daily dividend (USDT) - MUCH REDUCED!
 * - monthlyIncome: Monthly income (USDT)
 * - dailyWLD: Daily WLD amount
 */
const BROKER_LEVELS = [
    {
        level: 0,
        name: 'Regular User',
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
        name: 'Level 1 Broker',
        minDirectReferrals: 5,
        minSubBrokers: 0,
        subBrokerLevel: 0,
        minTeamPerformance: 1000,
        dailyDividend: 2,           // Fixed: was 5, now 2 USDT/day
        monthlyIncome: 60,
        dailyWLD: 0.5
    },
    {
        level: 2,
        name: 'Level 2 Broker',
        minDirectReferrals: 10,
        minSubBrokers: 2,
        subBrokerLevel: 1,
        minTeamPerformance: 5000,
        dailyDividend: 5,           // Fixed: was 15, now 5 USDT/day
        monthlyIncome: 150,
        dailyWLD: 1
    },
    {
        level: 3,
        name: 'Level 3 Broker',
        minDirectReferrals: 20,
        minSubBrokers: 2,
        subBrokerLevel: 2,
        minTeamPerformance: 20000,
        dailyDividend: 15,          // Fixed: was 60, now 15 USDT/day
        monthlyIncome: 450,
        dailyWLD: 2
    },
    {
        level: 4,
        name: 'Level 4 Broker',
        minDirectReferrals: 30,
        minSubBrokers: 2,
        subBrokerLevel: 3,
        minTeamPerformance: 80000,
        dailyDividend: 50,          // Fixed: was 300, now 50 USDT/day
        monthlyIncome: 1500,
        dailyWLD: 3
    },
    {
        level: 5,
        name: 'Level 5 Broker',
        minDirectReferrals: 50,
        minSubBrokers: 2,
        subBrokerLevel: 4,
        minTeamPerformance: 200000,
        dailyDividend: 150,         // Fixed: was 1000, now 150 USDT/day
        monthlyIncome: 4500,
        dailyWLD: 5
    }
];

/**
 * Minimum purchase amount requirement (only >=20U robots count for team)
 */
const MIN_ROBOT_PURCHASE = 20;

// ============================================================================
// Core Calculation Functions
// ============================================================================

/**
 * Get broker level configuration
 * 
 * @param {number} level - Level (0-5)
 * @returns {Object} Level configuration
 */
function getBrokerLevelConfig(level) {
    if (level < 0 || level > 5) {
        return BROKER_LEVELS[0];
    }
    return BROKER_LEVELS[level];
}

/**
 * Calculate user's current broker level
 * 
 * Algorithm: Check from highest to lowest, return first qualified level
 * 
 * @param {Object} userData - User data
 * @param {number} userData.directReferrals - Qualified direct referrals
 * @param {number} userData.teamPerformance - Team total performance
 * @param {Array<number>} userData.subBrokerCounts - Sub-broker counts by level
 * @returns {Object} Level evaluation result
 */
function calculateBrokerLevel(userData) {
    const { directReferrals = 0, teamPerformance = 0, subBrokerCounts = [] } = userData;
    
    let qualifiedLevel = 0;
    const evaluations = [];
    
    // Check from high to low
    for (let level = 5; level >= 1; level--) {
        const config = BROKER_LEVELS[level];
        const evaluation = evaluateLevelRequirements(
            level, 
            directReferrals, 
            teamPerformance, 
            subBrokerCounts
        );
        
        evaluations.push(evaluation);
        
        if (evaluation.qualified && qualifiedLevel === 0) {
            qualifiedLevel = level;
        }
    }
    
    return {
        currentLevel: qualifiedLevel,
        levelName: BROKER_LEVELS[qualifiedLevel].name,
        config: BROKER_LEVELS[qualifiedLevel],
        evaluations: evaluations.reverse(),
        userData
    };
}

/**
 * Evaluate if single level requirements are met
 * 
 * @param {number} level - Target level
 * @param {number} directReferrals - Qualified direct referrals
 * @param {number} teamPerformance - Team total performance
 * @param {Array<number>} subBrokerCounts - Sub-broker counts by level
 * @returns {Object} Evaluation result
 */
function evaluateLevelRequirements(level, directReferrals, teamPerformance, subBrokerCounts) {
    const config = BROKER_LEVELS[level];
    
    // Check direct referrals
    const directCheck = directReferrals >= config.minDirectReferrals;
    const directGap = Math.max(0, config.minDirectReferrals - directReferrals);
    
    // Check team performance
    const performanceCheck = teamPerformance > config.minTeamPerformance;
    const performanceGap = Math.max(0, config.minTeamPerformance - teamPerformance + 1);
    
    // Check sub-brokers
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
 * Calculate broker rewards
 * 
 * @param {number} level - Broker level
 * @param {number} days - Number of days
 * @returns {Object} Reward calculation result
 */
function calculateBrokerRewards(level, days = 1) {
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
            days: 30,
            verification: config.dailyDividend * 30 === config.monthlyIncome 
                ? '✓ Verified' 
                : `⚠ Mismatch: ${config.dailyDividend * 30} vs ${config.monthlyIncome}`
        }
    };
}

// ============================================================================
// Upgrade/Downgrade Analysis Functions
// ============================================================================

/**
 * Calculate upgrade gap to next level
 * 
 * @param {Object} userData - User data
 * @returns {Object} Upgrade gap analysis
 */
function calculateUpgradeGap(userData) {
    const currentResult = calculateBrokerLevel(userData);
    const currentLevel = currentResult.currentLevel;
    
    if (currentLevel >= 5) {
        return {
            currentLevel: 5,
            currentLevelName: 'Level 5 Broker',
            isMaxLevel: true,
            message: 'You have reached the highest level!'
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
 * Check demotion risk
 * 
 * @param {number} currentLevel - Current level
 * @param {Object} userData - User data
 * @returns {Object} Demotion risk analysis
 */
function checkDemotionRisk(currentLevel, userData) {
    if (currentLevel <= 0) {
        return {
            currentLevel: 0,
            atRisk: false,
            message: 'Regular user, no demotion risk'
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
            reason: 'Requirements not met',
            requirements: newResult.evaluations[currentLevel - 1].checks
        };
    }
    
    return {
        currentLevel,
        newLevel,
        atRisk: false,
        willDemote: false,
        message: 'Level is safe, no demotion risk'
    };
}

// ============================================================================
// Team Performance Analysis Functions
// ============================================================================

/**
 * Analyze team structure
 * 
 * @param {Array} teamMembers - Team member data
 * @returns {Object} Team structure analysis
 */
function analyzeTeamStructure(teamMembers) {
    const brokerCounts = [0, 0, 0, 0, 0, 0];
    
    let qualifiedMembers = 0;
    let totalPerformance = 0;
    
    for (const member of teamMembers) {
        const purchaseAmount = member.purchaseAmount || 0;
        
        if (purchaseAmount >= MIN_ROBOT_PURCHASE) {
            qualifiedMembers++;
        }
        
        totalPerformance += purchaseAmount;
        
        const brokerLevel = member.brokerLevel || 0;
        if (brokerLevel >= 0 && brokerLevel <= 5) {
            brokerCounts[brokerLevel]++;
        }
    }
    
    return {
        totalMembers: teamMembers.length,
        qualifiedMembers,
        unqualifiedMembers: teamMembers.length - qualifiedMembers,
        totalPerformance,
        brokerCounts,
        brokerBreakdown: {
            level0: brokerCounts[0],
            level1: brokerCounts[1],
            level2: brokerCounts[2],
            level3: brokerCounts[3],
            level4: brokerCounts[4],
            level5: brokerCounts[5]
        }
    };
}

/**
 * Project earnings
 * 
 * @param {number} currentLevel - Current level
 * @param {number} projectedDays - Projected days
 * @returns {Object} Earnings projection
 */
function projectEarnings(currentLevel, projectedDays = 30) {
    const config = getBrokerLevelConfig(currentLevel);
    
    const dailyTotal = config.dailyDividend;
    const projectedDividend = dailyTotal * projectedDays;
    const projectedWLD = config.dailyWLD * projectedDays;
    
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

// ============================================================================
// Math Formula Derivation
// ============================================================================

/**
 * Derive level requirement formulas
 */
function deriveTeamFormulas() {
    return {
        title: 'Team Broker Level Math Model',
        
        levelDetermination: {
            formula: 'L = max{n : C_direct(n) ∧ C_perf(n) ∧ C_broker(n)}',
            description: 'User level = highest level meeting all conditions',
            conditions: {
                'C_direct(n)': 'directReferrals >= minDirectReferrals[n]',
                'C_perf(n)': 'teamPerformance > minTeamPerformance[n]',
                'C_broker(n)': 'subBrokerCount[n-1] >= 2 (for n >= 2)'
            }
        },
        
        rewardCalculation: {
            daily: 'R_daily = dailyDividend[L]',
            monthly: 'R_monthly = dailyDividend[L] × 30',
            wld: 'WLD_daily = dailyWLD[L]',
            total: 'R_total(days) = R_daily × days'
        },
        
        levelTable: BROKER_LEVELS.slice(1).map(config => ({
            level: config.level,
            name: config.name,
            directRequired: `≥ ${config.minDirectReferrals}`,
            performanceRequired: `> ${config.minTeamPerformance.toLocaleString()} USDT`,
            subBrokerRequired: config.minSubBrokers > 0 
                ? `≥ ${config.minSubBrokers} L${config.subBrokerLevel} brokers`
                : 'None',
            rewards: `${config.dailyDividend}/day, ${config.monthlyIncome}/month, ${config.dailyWLD} WLD/day`
        }))
    };
}

/**
 * Validate level configuration consistency
 */
function validateLevelConfiguration() {
    const issues = [];
    
    for (let i = 1; i <= 5; i++) {
        const config = BROKER_LEVELS[i];
        
        // Verify monthly income = daily × 30
        const expectedMonthly = config.dailyDividend * 30;
        if (expectedMonthly !== config.monthlyIncome) {
            issues.push({
                level: i,
                issue: `Monthly income mismatch: ${expectedMonthly} vs ${config.monthlyIncome}`,
                severity: 'warning'
            });
        }
        
        // Verify level progression
        if (i > 1) {
            const prevConfig = BROKER_LEVELS[i - 1];
            if (config.minDirectReferrals <= prevConfig.minDirectReferrals) {
                issues.push({
                    level: i,
                    issue: 'Direct referrals not increasing',
                    severity: 'error'
                });
            }
            if (config.minTeamPerformance <= prevConfig.minTeamPerformance) {
                issues.push({
                    level: i,
                    issue: 'Team performance not increasing',
                    severity: 'error'
                });
            }
        }
    }
    
    return {
        valid: issues.filter(i => i.severity === 'error').length === 0,
        issues,
        summary: issues.length === 0 
            ? '✓ All level configs validated' 
            : `⚠ Found ${issues.length} issues`
    };
}

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Generate complete team math analysis report
 */
function generateTeamReport(userData = null) {
    const report = {
        title: 'Team Broker Level System Analysis Report',
        timestamp: new Date().toISOString(),
        
        configValidation: validateLevelConfiguration(),
        formulas: deriveTeamFormulas(),
        
        levelConfigs: BROKER_LEVELS.slice(1).map(config => ({
            level: config.level,
            name: config.name,
            requirements: {
                directReferrals: config.minDirectReferrals,
                teamPerformance: config.minTeamPerformance,
                subBrokers: config.minSubBrokers,
                subBrokerLevel: config.subBrokerLevel
            },
            rewards: {
                dailyDividend: config.dailyDividend,
                monthlyIncome: config.monthlyIncome,
                dailyWLD: config.dailyWLD
            }
        }))
    };
    
    if (userData) {
        report.userAnalysis = {
            levelEvaluation: calculateBrokerLevel(userData),
            upgradeGap: calculateUpgradeGap(userData),
            earningsProjection: projectEarnings(
                calculateBrokerLevel(userData).currentLevel, 
                30
            )
        };
    }
    
    return report;
}

// ============================================================================
// Export Module
// ============================================================================

export {
    // Safety limits
    TEAM_SAFETY_LIMITS,
    
    // Constants
    BROKER_LEVELS,
    MIN_ROBOT_PURCHASE,
    
    // Core functions
    getBrokerLevelConfig,
    calculateBrokerLevel,
    evaluateLevelRequirements,
    calculateBrokerRewards,
    
    // Upgrade/downgrade analysis
    calculateUpgradeGap,
    checkDemotionRisk,
    
    // Team analysis
    analyzeTeamStructure,
    projectEarnings,
    
    // Math formulas
    deriveTeamFormulas,
    validateLevelConfiguration,
    
    // Report generation
    generateTeamReport
};

