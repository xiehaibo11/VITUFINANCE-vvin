/**
 * 充值监控定时任务 - 优化版
 * 
 * 修复问题:
 * 1. RPC限流问题 - 减少扫描区块数量
 * 2. 添加重试机制和指数退避
 * 3. 多RPC节点轮询
 * 4. 错误日志优化
 * 
 * 创建时间: 2025-12-16
 */

import { query as dbQuery } from '../../db.js';

// ==================== 配置常量 ====================

// BSC RPC节点列表 (轮询使用，避免单点限流)
const BSC_RPC_URLS = [
  'https://bsc-dataseed.binance.org/',
  'https://bsc-dataseed1.defibit.io/',
  'https://bsc-dataseed1.ninicoin.io/',
  'https://bsc.publicnode.com'
];

// 当前使用的RPC节点索引
let currentRpcIndex = 0;

// 平台钱包地址 - 实际收款地址
const PLATFORM_WALLET = (process.env.PLATFORM_WALLET_ADDRESS || '0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB').toLowerCase();

// USDT合约地址 (BSC主网)
const USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955'.toLowerCase();

// Transfer事件签名
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// 最低充值金额 (USDT)
const MIN_DEPOSIT_AMOUNT = 20;

// 扫描配置 - 优化后的参数
const BLOCKS_PER_SCAN = 20;  // 从80降低到20，减少RPC压力
const SCAN_INTERVAL_MS = 60000;  // 60秒扫描一次
const INITIAL_SCAN_BLOCKS = 100;  // 首次运行扫描最近100个区块

// 重试配置
const MAX_RETRIES = 3;  // 最大重试次数
const BASE_RETRY_DELAY = 5000;  // 基础重试延迟 (5秒)

// 最后检查的区块号
let lastCheckedBlock = 0;

// 错误计数器
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 10;  // 连续错误10次后切换RPC节点

// ==================== 工具函数 ====================

/**
 * 获取当前RPC URL
 */
function getCurrentRpcUrl() {
  return BSC_RPC_URLS[currentRpcIndex];
}

/**
 * 切换到下一个RPC节点
 */
function switchToNextRpc() {
  currentRpcIndex = (currentRpcIndex + 1) % BSC_RPC_URLS.length;
  console.log(`[DepositMonitor] 🔄 切换RPC节点: ${getCurrentRpcUrl()}`);
  consecutiveErrors = 0;  // 重置错误计数
}

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 发送JSON-RPC请求 (带重试机制)
 */
async function jsonRpcRequest(method, params, retryCount = 0) {
  const rpcUrl = getCurrentRpcUrl();
  
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      }),
      timeout: 10000  // 10秒超时
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw data.error;
    }

    consecutiveErrors = 0;  // 成功后重置错误计数
    return data.result;
    
  } catch (error) {
    consecutiveErrors++;
    
    // 限流错误特殊处理
    if (error.code === -32005 || error.message?.includes('limit exceeded')) {
      console.error(`[DepositMonitor] ⚠️ RPC限流 (节点: ${rpcUrl})`);
      
      // 如果重试次数未达上限，使用指数退避重试
      if (retryCount < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
        console.log(`[DepositMonitor] ⏳ ${delay/1000}秒后重试... (${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        return jsonRpcRequest(method, params, retryCount + 1);
      }
      
      // 达到重试上限，切换RPC节点
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        switchToNextRpc();
      }
    } else {
      console.error(`[DepositMonitor] ❌ RPC请求失败:`, error.message || error);
    }
    
    throw error;
  }
}

/**
 * 获取最新区块号
 */
async function getLatestBlockNumber() {
  const result = await jsonRpcRequest('eth_blockNumber', []);
  return parseInt(result, 16);
}

/**
 * 获取 USDT Transfer 事件日志
 * @param {number} fromBlock - 起始区块
 * @param {number} toBlock - 结束区块
 * @returns {Promise<Array>} Transfer 事件列表
 */
async function getUsdtTransferLogs(fromBlock, toBlock) {
  const params = [{
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
    address: USDT_CONTRACT,
    topics: [
      TRANSFER_TOPIC,  // Transfer 事件
      null,  // 任意发送方
      `0x000000000000000000000000${PLATFORM_WALLET.slice(2)}`  // 平台地址作为接收方
    ]
  }];
  
  return await jsonRpcRequest('eth_getLogs', params);
}

/**
 * 解析 Transfer 事件
 * @param {Object} log - 事件日志
 * @returns {Object} 解析后的数据
 */
function parseTransferLog(log) {
  // 发送方地址 (topic1)
  const from = '0x' + log.topics[1].slice(26);
  
  // 接收方地址 (topic2)
  const to = '0x' + log.topics[2].slice(26);
  
  // 转账金额 (USDT精度18位)
  const amount = Number(BigInt(log.data) / BigInt(1e18));
  
  // 交易哈希
  const txHash = log.transactionHash;
  
  // 区块号
  const blockNumber = parseInt(log.blockNumber, 16);
  
  return {
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    amount,
    txHash,
    blockNumber
  };
}

/**
 * 处理新充值
 * @param {Object} transfer - 转账数据
 */
async function processDeposit(transfer) {
  const { from, amount, txHash, blockNumber } = transfer;
  
  try {
    // 1. 检查交易是否已处理
    const existing = await dbQuery(
      'SELECT id FROM deposit_records WHERE tx_hash = ?',
      [txHash]
    );
    
    if (existing.length > 0) {
      console.log(`[DepositMonitor] ⏭️  交易已处理: ${txHash}`);
      return;
    }
    
    // 2. 检查金额是否达到最低充值要求
    if (amount < MIN_DEPOSIT_AMOUNT) {
      console.log(`[DepositMonitor] ⚠️  金额过小 (${amount} USDT < ${MIN_DEPOSIT_AMOUNT} USDT), 来自: ${from}`);
      
      // 记录但不处理
      await dbQuery(
        `INSERT INTO deposit_records 
         (wallet_address, amount, token, network, tx_hash, status, created_at, remark) 
         VALUES (?, ?, 'USDT', 'BSC', ?, 'failed', NOW(), '金额低于最低充值要求')`,
        [from, amount, txHash]
      );
      return;
    }
    
    console.log(`[DepositMonitor] 🔔 检测到新充值:`, {
      from,
      amount: `${amount} USDT`,
      txHash,
      block: blockNumber
    });
    
    // 3. 创建充值记录
    await dbQuery(
      `INSERT INTO deposit_records 
       (wallet_address, amount, token, network, tx_hash, status, created_at, completed_at) 
       VALUES (?, ?, 'USDT', 'BSC', ?, 'completed', NOW(), NOW())`,
      [from, amount, txHash]
    );
    
    // 4. 检查用户是否存在
    const userExists = await dbQuery(
      'SELECT id FROM user_balances WHERE wallet_address = ?',
      [from]
    );
    
    if (userExists.length === 0) {
      // 创建新用户
      await dbQuery(
        `INSERT INTO user_balances 
         (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, created_at, updated_at) 
         VALUES (?, ?, 0, ?, 0, NOW(), NOW())`,
        [from, amount, amount]
      );
      console.log(`[DepositMonitor] 👤 创建新用户: ${from}`);
    } else {
      // 更新用户余额
      await dbQuery(
        `UPDATE user_balances 
         SET usdt_balance = usdt_balance + ?, 
             total_deposit = total_deposit + ?, 
             updated_at = NOW() 
         WHERE wallet_address = ?`,
        [amount, amount, from]
      );
    }
    
    console.log(`[DepositMonitor] ✅ 充值处理成功: ${amount} USDT → ${from}`);
    
  } catch (error) {
    console.error(`[DepositMonitor] ❌ 处理充值失败 (${txHash}):`, error.message);
    
    // 记录错误到数据库 (如果有错误日志表)
    try {
      await dbQuery(
        `INSERT INTO error_logs (source, level, message, details, created_at) 
         VALUES ('DepositMonitor', 'ERROR', ?, ?, NOW())`,
        [`处理充值失败: ${txHash}`, JSON.stringify({ transfer, error: error.message })]
      );
    } catch (logError) {
      // 忽略日志记录错误
    }
  }
}

/**
 * 扫描新充值 (主函数)
 */
export async function scanNewDeposits() {
  try {
    // 1. 获取最新区块号
    const latestBlock = await getLatestBlockNumber();
    
    // 2. 如果是第一次运行，从最近N个区块开始
    if (lastCheckedBlock === 0) {
      lastCheckedBlock = latestBlock - INITIAL_SCAN_BLOCKS;
      console.log(`[DepositMonitor] 🚀 首次运行，从区块 ${lastCheckedBlock} 开始扫描`);
    }
    
    // 3. 如果没有新区块，跳过
    if (latestBlock <= lastCheckedBlock) {
      return;
    }
    
    // 4. 计算本次扫描的区块范围 (限制最大扫描数量)
    const fromBlock = lastCheckedBlock + 1;
    const toBlock = Math.min(latestBlock, fromBlock + BLOCKS_PER_SCAN - 1);
    const blockCount = toBlock - fromBlock + 1;
    
    console.log(`[DepositMonitor] 🔍 扫描区块 ${fromBlock} 到 ${toBlock} (${blockCount} 个区块)`);
    
    // 5. 获取 Transfer 事件日志
    const logs = await getUsdtTransferLogs(fromBlock, toBlock);
    
    if (logs.length > 0) {
      console.log(`[DepositMonitor] 📝 发现 ${logs.length} 笔转账到平台钱包`);
      
      // 6. 处理每个转账
      for (const log of logs) {
        const transfer = parseTransferLog(log);
        await processDeposit(transfer);
      }
    }
    
    // 7. 更新最后检查的区块号
    lastCheckedBlock = toBlock;
    
  } catch (error) {
    console.error('[DepositMonitor] ❌ 扫描错误:', error.message || error);
    
    // 不更新 lastCheckedBlock，下次重试相同区块范围
  }
}

/**
 * 手动触发扫描 (供API调用)
 */
export async function triggerScan() {
  console.log('[DepositMonitor] 🔄 手动触发扫描');
  await scanNewDeposits();
}

/**
 * 启动充值监控定时任务
 */
export function startDepositMonitor() {
  console.log('[DepositMonitor] 🚀 启动充值监控服务');
  console.log(`[DepositMonitor] ⚙️  配置: 每${SCAN_INTERVAL_MS/1000}秒扫描${BLOCKS_PER_SCAN}个区块`);
  console.log(`[DepositMonitor] 🌐 RPC节点: ${BSC_RPC_URLS.length}个备用节点`);
  console.log(`[DepositMonitor] 💰 平台钱包: ${PLATFORM_WALLET}`);
  console.log(`[DepositMonitor] 💵 最低充值: ${MIN_DEPOSIT_AMOUNT} USDT`);
  
  // 立即执行一次
  scanNewDeposits().catch(err => {
    console.error('[DepositMonitor] ❌ 首次扫描失败:', err.message);
  });
  
  // 定时执行
  setInterval(() => {
    scanNewDeposits().catch(err => {
      console.error('[DepositMonitor] ❌ 定时扫描失败:', err.message);
    });
  }, SCAN_INTERVAL_MS);
}

/**
 * 获取监控状态 (供管理后台查询)
 */
export function getMonitorStatus() {
  return {
    isRunning: true,
    lastCheckedBlock,
    currentRpcUrl: getCurrentRpcUrl(),
    consecutiveErrors,
    config: {
      blocksPerScan: BLOCKS_PER_SCAN,
      scanIntervalMs: SCAN_INTERVAL_MS,
      minDepositAmount: MIN_DEPOSIT_AMOUNT,
      rpcNodes: BSC_RPC_URLS.length
    }
  };
}

