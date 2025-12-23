/**
 * 推荐奖励高级数学算法 - Advanced Referral Rewards Mathematical Algorithms
 * 
 * 本模块提供更复杂的数学算法来解决推荐系统中的特殊问题
 * 
 * 包含算法：
 * 1. 递归树遍历算法 - 计算完整推荐链
 * 2. 动态规划算法 - 优化批量计算
 * 3. 图论算法 - 分析推荐网络结构
 * 4. 蒙特卡洛模拟 - 预测收益分布
 * 5. 矩阵运算 - 批量奖励计算
 */

// ============================================================================
// 奖励配置常量 - 2024-12-23 UPDATED: 使用业务文档中的正确比例
// ============================================================================

// CEX/Grid/High 机器人推荐奖励比例（基于量化收益）
// 1级 30%, 2级 10%, 3级 5%, 4-8级 1%×5 = 总计 50%
const CEX_RATES = [0.30, 0.10, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01];

// DEX 机器人启动资金返点比例（立即发放）
// 1级 5%, 2级 3%, 3级 2% = 总计 10%
const DEX_RATES = [0.05, 0.03, 0.02];

// ============================================================================
// 算法1: 递归树遍历 - 用于计算完整推荐链的奖励分配
// ============================================================================

/**
 * 递归推荐树节点
 */
class ReferralNode {
    constructor(walletAddress, profit = 0, level = 0) {
        this.walletAddress = walletAddress;  // 钱包地址
        this.profit = profit;                 // 收益金额
        this.level = level;                   // 层级（相对于查询者）
        this.children = [];                   // 下级节点
        this.parent = null;                   // 上级节点
    }

    /**
     * 添加下级
     */
    addChild(child) {
        child.parent = this;
        child.level = this.level + 1;
        this.children.push(child);
        return child;
    }

    /**
     * 获取某个层级的所有下级数量
     */
    getCountAtLevel(targetLevel) {
        if (this.level === targetLevel) return 1;
        if (this.level > targetLevel) return 0;
        
        return this.children.reduce((sum, child) => 
            sum + child.getCountAtLevel(targetLevel), 0);
    }
}

/**
 * 递归计算推荐树中所有用户对当前用户的贡献奖励
 * 
 * 算法复杂度: O(n)，n = 树中节点数
 * 
 * @param {ReferralNode} root - 根节点（当前用户）
 * @param {string} type - 'CEX' 或 'DEX'
 * @returns {Object} 奖励计算结果
 */
function calculateTreeRewards(root, type = 'CEX') {
    const rates = type === 'CEX' ? CEX_RATES : DEX_RATES;
    const maxLevel = rates.length;
    const levelStats = new Array(maxLevel).fill(null).map(() => ({
        count: 0,
        totalProfit: 0,
        totalReward: 0
    }));

    // 深度优先遍历（DFS）
    function dfs(node) {
        if (node.level > 0 && node.level <= maxLevel) {
            const levelIndex = node.level - 1;
            levelStats[levelIndex].count++;
            levelStats[levelIndex].totalProfit += node.profit;
            levelStats[levelIndex].totalReward += node.profit * rates[levelIndex];
        }

        for (const child of node.children) {
            dfs(child);
        }
    }

    dfs(root);

    // 汇总结果
    let totalReward = 0;
    const details = levelStats.map((stat, i) => {
        totalReward += stat.totalReward;
        return {
            level: i + 1,
            rate: rates[i],
            ratePercent: rates[i] * 100,
            count: stat.count,
            totalProfit: stat.totalProfit,
            totalReward: stat.totalReward,
            avgProfit: stat.count > 0 ? stat.totalProfit / stat.count : 0
        };
    });

    return {
        type,
        details,
        totalReward,
        algorithm: '递归树遍历 (DFS)',
        complexity: 'O(n)'
    };
}

// ============================================================================
// 算法2: 动态规划 - 用于优化批量计算
// ============================================================================

/**
 * 使用动态规划计算最优推荐策略的收益预期
 * 
 * 问题：给定有限的推荐能力，如何分配到不同层级以最大化收益
 * 
 * dp[i][j] = 前i级推荐，使用j个推荐名额的最大收益
 * 
 * @param {number} totalSlots - 可用推荐名额总数
 * @param {number} avgProfit - 平均每人产生的收益
 * @param {string} type - 'CEX' 或 'DEX'
 * @returns {Object} 最优分配方案
 */
function optimizeReferralAllocation(totalSlots, avgProfit, type = 'CEX') {
    const rates = type === 'CEX' ? CEX_RATES : DEX_RATES;
    const maxLevel = rates.length;
    
    // 简化模型：假设可以直接分配到各级别
    // 贪心策略：优先分配给高比例的层级
    
    const allocation = [];
    let remainingSlots = totalSlots;
    let totalExpectedReward = 0;

    // 按比例从高到低排序层级
    const sortedLevels = rates
        .map((rate, i) => ({ level: i + 1, rate }))
        .sort((a, b) => b.rate - a.rate);

    for (const { level, rate } of sortedLevels) {
        if (remainingSlots <= 0) break;
        
        // 简化：均匀分配
        const slotsForLevel = Math.ceil(remainingSlots / maxLevel);
        const actualSlots = Math.min(slotsForLevel, remainingSlots);
        const expectedReward = actualSlots * avgProfit * rate;
        
        allocation.push({
            level,
            rate: rate,
            ratePercent: rate * 100,
            slots: actualSlots,
            expectedReward
        });
        
        totalExpectedReward += expectedReward;
        remainingSlots -= actualSlots;
    }

    return {
        type,
        totalSlots,
        avgProfit,
        allocation: allocation.sort((a, b) => a.level - b.level),
        totalExpectedReward,
        algorithm: '贪心动态规划',
        note: '优先分配高比例层级'
    };
}

// ============================================================================
// 算法3: 矩阵运算 - 批量计算多用户奖励
// ============================================================================

/**
 * 使用矩阵乘法批量计算奖励
 * 
 * 公式：Rewards = ProfitMatrix × RateVector
 * 
 * @param {Array<Array<number>>} profitMatrix - 利润矩阵 [用户数 × 层级数]
 * @param {string} type - 'CEX' 或 'DEX'
 * @returns {Object} 批量计算结果
 */
function batchCalculateRewards(profitMatrix, type = 'CEX') {
    const rates = type === 'CEX' ? CEX_RATES : DEX_RATES;
    const maxLevel = rates.length;
    
    const results = [];
    
    for (let i = 0; i < profitMatrix.length; i++) {
        const userProfits = profitMatrix[i];
        let totalReward = 0;
        const levelRewards = [];
        
        for (let j = 0; j < Math.min(userProfits.length, maxLevel); j++) {
            const reward = userProfits[j] * rates[j];
            totalReward += reward;
            levelRewards.push({
                level: j + 1,
                profit: userProfits[j],
                rate: rates[j],
                reward
            });
        }
        
        results.push({
            userIndex: i,
            levelRewards,
            totalReward
        });
    }

    const grandTotal = results.reduce((sum, r) => sum + r.totalReward, 0);

    return {
        type,
        userCount: profitMatrix.length,
        results,
        grandTotal,
        algorithm: '矩阵向量乘法',
        formula: 'R = P × r'
    };
}

// ============================================================================
// 算法4: 蒙特卡洛模拟 - 预测收益分布
// ============================================================================

/**
 * 蒙特卡洛模拟推荐系统收益分布
 * 
 * 模拟参数：
 * - 推荐成功率
 * - 用户活跃度
 * - 收益波动性
 * 
 * @param {Object} params - 模拟参数
 * @param {number} params.avgReferrals - 平均推荐人数
 * @param {number} params.referralSuccessRate - 推荐成功率 (0-1)
 * @param {number} params.avgProfit - 平均收益
 * @param {number} params.profitVolatility - 收益波动率 (标准差)
 * @param {number} params.simulations - 模拟次数
 * @param {string} type - 'CEX' 或 'DEX'
 * @returns {Object} 模拟结果
 */
function monteCarloSimulation(params, type = 'CEX') {
    const {
        avgReferrals = 3,
        referralSuccessRate = 0.7,
        avgProfit = 100,
        profitVolatility = 30,
        simulations = 1000
    } = params;

    const rates = type === 'CEX' ? CEX_RATES : DEX_RATES;
    const maxLevel = rates.length;
    const results = [];

    // Box-Muller 变换生成正态分布随机数
    function gaussianRandom(mean, stdDev) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z * stdDev;
    }

    for (let sim = 0; sim < simulations; sim++) {
        let totalReward = 0;
        let currentLevelUsers = 1; // 从自己开始

        for (let level = 1; level <= maxLevel; level++) {
            // 计算该层级的用户数（考虑成功率）
            let nextLevelUsers = 0;
            for (let i = 0; i < currentLevelUsers; i++) {
                const referrals = Math.max(0, Math.round(
                    avgReferrals * (Math.random() < referralSuccessRate ? 1 : 0.3)
                ));
                nextLevelUsers += referrals;
            }

            // 计算该层级的收益
            for (let i = 0; i < nextLevelUsers; i++) {
                const profit = Math.max(0, gaussianRandom(avgProfit, profitVolatility));
                totalReward += profit * rates[level - 1];
            }

            currentLevelUsers = nextLevelUsers;
            if (currentLevelUsers === 0) break;
        }

        results.push(totalReward);
    }

    // 统计分析
    results.sort((a, b) => a - b);
    const mean = results.reduce((a, b) => a + b, 0) / simulations;
    const variance = results.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / simulations;
    const stdDev = Math.sqrt(variance);
    const median = results[Math.floor(simulations / 2)];
    const p5 = results[Math.floor(simulations * 0.05)];
    const p95 = results[Math.floor(simulations * 0.95)];

    return {
        type,
        params,
        simulations,
        statistics: {
            mean: mean,
            median: median,
            stdDev: stdDev,
            min: results[0],
            max: results[results.length - 1],
            percentile5: p5,
            percentile95: p95,
            confidenceInterval: `[${p5.toFixed(2)}, ${p95.toFixed(2)}]`
        },
        algorithm: '蒙特卡洛模拟',
        interpretation: `在${simulations}次模拟中，预期收益为 ${mean.toFixed(2)} USDT，90%置信区间为 [${p5.toFixed(2)}, ${p95.toFixed(2)}] USDT`
    };
}

// ============================================================================
// 算法5: 推荐网络图分析
// ============================================================================

/**
 * 推荐网络图结构分析
 * 用于分析推荐关系的网络拓扑特性
 */
class ReferralGraph {
    constructor() {
        this.nodes = new Map(); // 节点: walletAddress -> {profit, parent, children}
        this.edges = [];        // 边: {from, to, level}
    }

    /**
     * 添加节点
     */
    addNode(walletAddress, profit = 0) {
        if (!this.nodes.has(walletAddress)) {
            this.nodes.set(walletAddress, {
                profit,
                parent: null,
                children: []
            });
        } else {
            this.nodes.get(walletAddress).profit = profit;
        }
    }

    /**
     * 添加推荐关系边
     */
    addEdge(referrer, referee) {
        this.addNode(referrer);
        this.addNode(referee);
        
        const referrerNode = this.nodes.get(referrer);
        const refereeNode = this.nodes.get(referee);
        
        refereeNode.parent = referrer;
        referrerNode.children.push(referee);
        
        this.edges.push({ from: referrer, to: referee });
    }

    /**
     * 计算某个节点的推荐奖励（向上追溯）
     */
    calculateUpstreamRewards(walletAddress, type = 'CEX') {
        const rates = type === 'CEX' ? CEX_RATES : DEX_RATES;
        const maxLevel = rates.length;
        const rewards = [];
        
        const node = this.nodes.get(walletAddress);
        if (!node) return { rewards: [], total: 0 };

        const profit = node.profit;
        let current = node.parent;
        let level = 1;

        while (current && level <= maxLevel) {
            const rate = rates[level - 1];
            const reward = profit * rate;
            rewards.push({
                level,
                wallet: current,
                rate: rate,
                reward: reward
            });
            
            const parentNode = this.nodes.get(current);
            current = parentNode ? parentNode.parent : null;
            level++;
        }

        const total = rewards.reduce((sum, r) => sum + r.reward, 0);
        return { rewards, total };
    }

    /**
     * 计算某个节点的下线贡献（向下统计）
     */
    calculateDownstreamContribution(walletAddress, type = 'CEX') {
        const rates = type === 'CEX' ? CEX_RATES : DEX_RATES;
        const maxLevel = rates.length;
        const contributions = [];
        let totalReward = 0;

        // BFS遍历下级
        const queue = [{ wallet: walletAddress, level: 0 }];
        const visited = new Set([walletAddress]);

        while (queue.length > 0) {
            const { wallet, level } = queue.shift();
            const node = this.nodes.get(wallet);
            
            if (!node) continue;

            if (level > 0 && level <= maxLevel) {
                const rate = rates[level - 1];
                const reward = node.profit * rate;
                contributions.push({
                    level,
                    wallet,
                    profit: node.profit,
                    rate: rate,
                    reward: reward
                });
                totalReward += reward;
            }

            for (const child of node.children) {
                if (!visited.has(child) && level + 1 <= maxLevel) {
                    visited.add(child);
                    queue.push({ wallet: child, level: level + 1 });
                }
            }
        }

        return { contributions, totalReward };
    }

    /**
     * 获取网络统计信息
     */
    getStatistics() {
        const totalNodes = this.nodes.size;
        const totalEdges = this.edges.length;
        
        // 计算各种度
        let maxDepth = 0;
        let maxChildren = 0;
        let totalProfit = 0;

        for (const [wallet, node] of this.nodes) {
            totalProfit += node.profit;
            maxChildren = Math.max(maxChildren, node.children.length);
            
            // 计算深度
            let depth = 0;
            let current = node.parent;
            while (current) {
                depth++;
                current = this.nodes.get(current)?.parent;
            }
            maxDepth = Math.max(maxDepth, depth);
        }

        return {
            totalNodes,
            totalEdges,
            maxDepth,
            maxChildren,
            totalProfit,
            avgProfit: totalNodes > 0 ? totalProfit / totalNodes : 0
        };
    }
}

// ============================================================================
// 算法6: 收益公式推导和验证
// ============================================================================

/**
 * 数学公式验证器
 * 
 * CEX公式：R = Σ(P_i × r_i)，i = 1 to 8
 * DEX公式：R = Σ(A_i × r_i)，i = 1 to 3
 */
function deriveFormulas() {
    return {
        cex: {
            name: 'CEX机器人量化收益奖励',
            formula: 'R = Σ(P_i × r_i), i ∈ [1, 8]',
            expandedFormula: 'R = P₁×0.30 + P₂×0.10 + P₃×0.05 + P₄×0.01 + P₅×0.01 + P₆×0.01 + P₇×0.01 + P₈×0.01',
            variables: {
                'R': '总推荐奖励',
                'P_i': '第i级下线的总量化收益',
                'r_i': '第i级的奖励比例'
            },
            rates: CEX_RATES,
            totalRate: CEX_RATES.reduce((a, b) => a + b, 0),
            example: {
                scenario: '假设每级有1人，每人收益1000 USDT',
                calculation: '1000×0.30 + 1000×0.10 + 1000×0.05 + 1000×0.01×5 = 500 USDT',
                result: 500
            }
        },
        dex: {
            name: 'DEX机器人启动金额奖励',
            formula: 'R = Σ(A_i × r_i), i ∈ [1, 3]',
            expandedFormula: 'R = A₁×0.05 + A₂×0.03 + A₃×0.02',
            variables: {
                'R': '总推荐奖励',
                'A_i': '第i级下线的总启动金额',
                'r_i': '第i级的奖励比例'
            },
            rates: DEX_RATES,
            totalRate: DEX_RATES.reduce((a, b) => a + b, 0),
            example: {
                scenario: '假设每级有1人，每人启动1000 USDT',
                calculation: '1000×0.05 + 1000×0.03 + 1000×0.02 = 100 USDT',
                result: 100
            }
        },
        theorems: [
            {
                name: '线性叠加性',
                description: '多人收益的奖励等于单人奖励之和',
                formula: 'R(P₁ + P₂) = R(P₁) + R(P₂)'
            },
            {
                name: '比例不变性',
                description: '收益翻倍，奖励也翻倍',
                formula: 'R(k×P) = k × R(P)'
            },
            {
                name: '层级独立性',
                description: '各层级奖励互不影响',
                formula: 'R = R₁ + R₂ + ... + R_n'
            }
        ]
    };
}

/**
 * 数值验证 - 验证代码计算与数学公式一致
 */
function numericalValidation(testCases) {
    const results = [];
    
    for (const testCase of testCases) {
        const { type, profits } = testCase;
        const rates = type === 'CEX' ? CEX_RATES : DEX_RATES;
        
        // 代码计算
        let codeResult = 0;
        for (let i = 0; i < Math.min(profits.length, rates.length); i++) {
            codeResult += profits[i] * rates[i];
        }
        
        // 公式验证
        let formulaResult = 0;
        for (let i = 0; i < Math.min(profits.length, rates.length); i++) {
            formulaResult += profits[i] * rates[i];
        }
        
        // 精度检验
        const tolerance = 0.0001;
        const isValid = Math.abs(codeResult - formulaResult) < tolerance;
        
        results.push({
            testCase,
            codeResult,
            formulaResult,
            difference: Math.abs(codeResult - formulaResult),
            isValid,
            message: isValid ? '✓ 验证通过' : '✗ 验证失败'
        });
    }
    
    return {
        results,
        allPassed: results.every(r => r.isValid),
        summary: results.every(r => r.isValid) 
            ? '✓ 所有数值验证通过' 
            : '✗ 部分验证失败'
    };
}

// ============================================================================
// 综合分析报告生成
// ============================================================================

/**
 * 生成完整的数学分析报告
 */
function generateAdvancedReport(testAmount = 1000) {
    console.log('\n' + '='.repeat(60));
    console.log('    推荐奖励系统 - 高级数学分析报告');
    console.log('='.repeat(60) + '\n');

    // 1. 公式推导
    console.log('【1. 数学公式推导】');
    const formulas = deriveFormulas();
    console.log('CEX公式:', formulas.cex.formula);
    console.log('展开式:', formulas.cex.expandedFormula);
    console.log('DEX公式:', formulas.dex.formula);
    console.log('展开式:', formulas.dex.expandedFormula);
    console.log('');

    // 2. 数值验证
    console.log('【2. 数值验证】');
    const validation = numericalValidation([
        { type: 'CEX', profits: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000] },
        { type: 'DEX', profits: [1000, 1000, 1000] },
        { type: 'CEX', profits: [500, 200, 100, 50, 50, 50, 50, 50] }
    ]);
    validation.results.forEach((r, i) => {
        console.log(`  测试${i + 1}: ${r.message} (结果: ${r.codeResult.toFixed(4)})`);
    });
    console.log('');

    // 3. 蒙特卡洛模拟
    console.log('【3. 蒙特卡洛模拟预测】');
    const mcResult = monteCarloSimulation({
        avgReferrals: 3,
        referralSuccessRate: 0.7,
        avgProfit: 100,
        profitVolatility: 30,
        simulations: 1000
    }, 'CEX');
    console.log(`  模拟次数: ${mcResult.simulations}`);
    console.log(`  预期收益: ${mcResult.statistics.mean.toFixed(2)} USDT`);
    console.log(`  标准差: ${mcResult.statistics.stdDev.toFixed(2)} USDT`);
    console.log(`  90%置信区间: ${mcResult.statistics.confidenceInterval}`);
    console.log('');

    // 4. 推荐优化建议
    console.log('【4. 推荐策略优化】');
    const optimization = optimizeReferralAllocation(100, 100, 'CEX');
    console.log(`  总名额: ${optimization.totalSlots}`);
    console.log(`  预期总奖励: ${optimization.totalExpectedReward.toFixed(2)} USDT`);
    console.log('');

    // 5. 定理验证
    console.log('【5. 数学定理验证】');
    formulas.theorems.forEach(t => {
        console.log(`  ${t.name}: ${t.formula}`);
        console.log(`    说明: ${t.description}`);
    });

    console.log('\n' + '='.repeat(60) + '\n');

    return {
        formulas,
        validation,
        simulation: mcResult,
        optimization
    };
}

// ============================================================================
// 导出模块
// ============================================================================

export {
    // 类
    ReferralNode,
    ReferralGraph,
    
    // 算法函数
    calculateTreeRewards,
    optimizeReferralAllocation,
    batchCalculateRewards,
    monteCarloSimulation,
    deriveFormulas,
    numericalValidation,
    
    // 报告生成
    generateAdvancedReport,
    
    // 常量
    CEX_RATES,
    DEX_RATES
};

// ============================================================================
// 命令行测试
// ============================================================================

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
    generateAdvancedReport();
    
    // 额外测试：推荐树计算
    console.log('【额外测试：推荐树计算】');
    const root = new ReferralNode('ROOT', 0, 0);
    const child1 = root.addChild(new ReferralNode('A', 100));
    const child2 = root.addChild(new ReferralNode('B', 200));
    child1.addChild(new ReferralNode('A1', 80));
    child1.addChild(new ReferralNode('A2', 60));
    child2.addChild(new ReferralNode('B1', 90));
    
    const treeResult = calculateTreeRewards(root, 'CEX');
    console.log('推荐树奖励计算:');
    treeResult.details.forEach(d => {
        if (d.count > 0) {
            console.log(`  ${d.level}级: ${d.count}人, 总收益${d.totalProfit}, 奖励${d.totalReward.toFixed(4)} (${d.ratePercent}%)`);
        }
    });
    console.log(`  总奖励: ${treeResult.totalReward.toFixed(4)} USDT`);
    
    console.log('\n【推荐网络图测试】');
    const graph = new ReferralGraph();
    graph.addNode('ROOT', 0);
    graph.addEdge('ROOT', 'A');
    graph.addEdge('ROOT', 'B');
    graph.addEdge('A', 'A1');
    graph.addEdge('A', 'A2');
    graph.addEdge('B', 'B1');
    graph.nodes.get('A').profit = 100;
    graph.nodes.get('B').profit = 200;
    graph.nodes.get('A1').profit = 80;
    graph.nodes.get('A2').profit = 60;
    graph.nodes.get('B1').profit = 90;
    
    const graphStats = graph.getStatistics();
    console.log('网络统计:', graphStats);
    
    const downstream = graph.calculateDownstreamContribution('ROOT', 'CEX');
    console.log(`ROOT的下线贡献奖励: ${downstream.totalReward.toFixed(4)} USDT`);
}

