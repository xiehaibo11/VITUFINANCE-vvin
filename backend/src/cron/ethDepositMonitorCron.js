/**
 * ETH 链充值监控定时任务
 * 
 * Scans Ethereum mainnet for USDT (ERC-20) transfers to platform wallet address.
 * Works in parallel with BSC deposit monitor.
 * 
 * Key differences from BSC monitor:
 * - Uses Ethereum mainnet RPC nodes
 * - ETH USDT has 6 decimals (BSC USDT has 18)
 * - Different contract address
 * 
 * Created: 2025-12-26
 */

import { query as dbQuery } from '../../db.js';

// ==================== Configuration Constants ====================

// Ethereum mainnet RPC nodes (rotated to avoid rate limiting)
const ETH_RPC_URLS = [
  'https://eth.llamarpc.com',
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth-mainnet.public.blastapi.io'
];

// Current RPC node index
let currentRpcIndex = 0;

// Platform wallet address (loaded from DB on startup)
let PLATFORM_WALLET = '';

// ETH USDT contract address (Tether USD on Ethereum)
const USDT_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'.toLowerCase();

// Transfer event signature (ERC-20 standard)
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Minimum deposit amount (USDT)
const MIN_DEPOSIT_AMOUNT = 20;

// ETH USDT uses 6 decimals (different from BSC's 18)
const USDT_DECIMALS = 6;

// Scan configuration (conservative to avoid rate limiting on free RPCs)
const BLOCKS_PER_SCAN = parseInt(process.env.ETH_BLOCKS_PER_SCAN) || 5;
const SCAN_INTERVAL_MS = parseInt(process.env.ETH_SCAN_INTERVAL_MS) || 120000; // 2 minutes
const INITIAL_SCAN_BLOCKS = 30;

// Retry configuration
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 5000;

// Auto-reset configuration
const MAX_BLOCK_LAG = 3000;
const RESET_BUFFER_BLOCKS = 30;

// Last checked block number
let lastCheckedBlock = 0;

// Consecutive history pruned errors
let historyPrunedErrors = 0;
const MAX_HISTORY_PRUNED_ERRORS = 3;

// Error counter
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 10;

// ==================== Utility Functions ====================

/**
 * Get current RPC URL
 */
function getCurrentRpcUrl() {
  return ETH_RPC_URLS[currentRpcIndex];
}

/**
 * Switch to next RPC node
 */
function switchToNextRpc() {
  currentRpcIndex = (currentRpcIndex + 1) % ETH_RPC_URLS.length;
  console.log(`[ETH-DepositMonitor] 🔄 Switched RPC node: ${getCurrentRpcUrl()}`);
  consecutiveErrors = 0;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== Block Number Persistence ====================

/**
 * Load last checked block from database
 */
async function loadLastCheckedBlock() {
  try {
    const result = await dbQuery(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'eth_deposit_last_checked_block'`
    );
    
    if (result && result.length > 0) {
      const blockNumber = parseInt(result[0].setting_value);
      console.log(`[ETH-DepositMonitor] 📖 Loaded block number from DB: ${blockNumber}`);
      return blockNumber;
    }
  } catch (error) {
    console.error('[ETH-DepositMonitor] Failed to load block number:', error.message);
  }
  
  return 0;
}

/**
 * Save last checked block to database
 */
async function saveLastCheckedBlock(blockNumber) {
  try {
    await dbQuery(
      `INSERT INTO system_settings (setting_key, setting_value, description, updated_at) 
       VALUES ('eth_deposit_last_checked_block', ?, 'ETH deposit monitor last checked block', NOW())
       ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
      [blockNumber.toString(), blockNumber.toString()]
    );
  } catch (error) {
    console.error('[ETH-DepositMonitor] Failed to save block number:', error.message);
  }
}

/**
 * Load platform wallet address from database
 */
async function loadPlatformWallet() {
  try {
    // Try ETH-specific wallet first
    let result = await dbQuery(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'platform_wallet_eth'`
    );
    
    if (result && result.length > 0 && result[0].setting_value) {
      return result[0].setting_value.toLowerCase();
    }
    
    // Fallback to legacy wallet address
    result = await dbQuery(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'platform_wallet_address'`
    );
    
    if (result && result.length > 0 && result[0].setting_value) {
      return result[0].setting_value.toLowerCase();
    }
  } catch (error) {
    console.error('[ETH-DepositMonitor] Failed to load platform wallet:', error.message);
  }
  
  // Final fallback to env var or default
  return (process.env.PLATFORM_WALLET_ETH || '0x8a92c73FdE5d0313303989eB269d6d17ffb1ba9d').toLowerCase();
}

/**
 * Auto-reset block number when too far behind
 */
async function autoResetBlockNumber(latestBlock, reason) {
  const newBlock = latestBlock - RESET_BUFFER_BLOCKS;
  
  console.log(`[ETH-DepositMonitor] ⚠️  ${reason}`);
  console.log(`[ETH-DepositMonitor] 🔄 Auto-reset block: ${lastCheckedBlock} → ${newBlock}`);
  
  lastCheckedBlock = newBlock;
  await saveLastCheckedBlock(newBlock);
  
  historyPrunedErrors = 0;
  consecutiveErrors = 0;
  
  console.log(`[ETH-DepositMonitor] ✅ Block number reset, will continue from ${newBlock}`);
}

/**
 * Check if auto-reset is needed
 */
async function checkAndAutoReset(latestBlock) {
  const blockLag = latestBlock - lastCheckedBlock;
  if (blockLag > MAX_BLOCK_LAG) {
    await autoResetBlockNumber(latestBlock, `Block lag too large (${blockLag} > ${MAX_BLOCK_LAG})`);
    return true;
  }
  return false;
}

// ==================== RPC Functions ====================

/**
 * Send JSON-RPC request with retry logic
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
      timeout: 15000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw data.error;
    }

    consecutiveErrors = 0;
    return data.result;
    
  } catch (error) {
    consecutiveErrors++;
    
    // Rate limit handling
    if (error.code === -32005 || error.message?.includes('limit exceeded')) {
      console.error(`[ETH-DepositMonitor] ⚠️ RPC rate limited (node: ${rpcUrl})`);
      
      if (retryCount < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
        console.log(`[ETH-DepositMonitor] ⏳ Retrying in ${delay/1000}s... (${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        return jsonRpcRequest(method, params, retryCount + 1);
      }
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        switchToNextRpc();
      }
    } else {
      console.error(`[ETH-DepositMonitor] ❌ RPC request failed:`, error.message || error);
    }
    
    throw error;
  }
}

/**
 * Get latest block number
 */
async function getLatestBlockNumber() {
  const result = await jsonRpcRequest('eth_blockNumber', []);
  return parseInt(result, 16);
}

/**
 * Get USDT Transfer event logs
 */
async function getUsdtTransferLogs(fromBlock, toBlock) {
  const params = [{
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
    address: USDT_CONTRACT,
    topics: [
      TRANSFER_TOPIC,
      null,  // Any sender
      `0x000000000000000000000000${PLATFORM_WALLET.slice(2)}`  // Platform wallet as receiver
    ]
  }];
  
  return await jsonRpcRequest('eth_getLogs', params);
}

/**
 * Parse Transfer event log
 */
function parseTransferLog(log) {
  // Sender address (topic1)
  const from = '0x' + log.topics[1].slice(26);
  
  // Receiver address (topic2)
  const to = '0x' + log.topics[2].slice(26);
  
  // Transfer amount (ETH USDT uses 6 decimals)
  const rawAmount = BigInt(log.data);
  const amount = Number(rawAmount) / Math.pow(10, USDT_DECIMALS);
  
  // Transaction hash
  const txHash = log.transactionHash;
  
  // Block number
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
 * Process new deposit
 */
async function processDeposit(transfer) {
  const { from, amount, txHash, blockNumber } = transfer;
  
  try {
    // 1. Check if transaction already processed
    const existing = await dbQuery(
      'SELECT id FROM deposit_records WHERE tx_hash = ?',
      [txHash]
    );
    
    if (existing.length > 0) {
      console.log(`[ETH-DepositMonitor] ⏭️  Transaction already processed: ${txHash}`);
      return;
    }
    
    // 2. Check minimum deposit amount
    if (amount < MIN_DEPOSIT_AMOUNT) {
      console.log(`[ETH-DepositMonitor] ⚠️  Amount too small (${amount} USDT < ${MIN_DEPOSIT_AMOUNT} USDT), from: ${from}`);
      
      await dbQuery(
        `INSERT INTO deposit_records 
         (wallet_address, amount, token, network, tx_hash, status, created_at, remark) 
         VALUES (?, ?, 'USDT', 'ETH', ?, 'failed', NOW(), 'Amount below minimum requirement')`,
        [from, amount, txHash]
      );
      return;
    }
    
    console.log(`[ETH-DepositMonitor] 🔔 New ETH deposit detected:`, {
      from,
      amount: `${amount} USDT`,
      txHash,
      block: blockNumber
    });
    
    // 3. Create deposit record
    await dbQuery(
      `INSERT INTO deposit_records 
       (wallet_address, amount, token, network, tx_hash, status, created_at, completed_at) 
       VALUES (?, ?, 'USDT', 'ETH', ?, 'completed', NOW(), NOW())`,
      [from, amount, txHash]
    );
    
    // 4. Check if user exists
    const userExists = await dbQuery(
      'SELECT id FROM user_balances WHERE wallet_address = ?',
      [from]
    );
    
    if (userExists.length === 0) {
      // Create new user
      await dbQuery(
        `INSERT INTO user_balances 
         (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, created_at, updated_at) 
         VALUES (?, ?, 0, ?, 0, NOW(), NOW())`,
        [from, amount, amount]
      );
      console.log(`[ETH-DepositMonitor] 👤 Created new user: ${from}`);
    } else {
      // Update user balance
      await dbQuery(
        `UPDATE user_balances 
         SET usdt_balance = usdt_balance + ?, 
             total_deposit = total_deposit + ?, 
             updated_at = NOW() 
         WHERE wallet_address = ?`,
        [amount, amount, from]
      );
    }
    
    console.log(`[ETH-DepositMonitor] ✅ Deposit processed: ${amount} USDT → ${from}`);
    
  } catch (error) {
    console.error(`[ETH-DepositMonitor] ❌ Failed to process deposit (${txHash}):`, error.message);
    
    try {
      await dbQuery(
        `INSERT INTO error_logs (source, level, message, created_at) 
         VALUES ('ETH-DepositMonitor', 'ERROR', ?, NOW())`,
        [`Failed to process deposit: ${txHash} - ${error.message}`]
      );
    } catch (logError) {
      // Ignore logging errors
    }
  }
}

/**
 * Scan for new deposits (main function)
 */
export async function scanNewDeposits() {
  try {
    // 1. Get latest block number
    const latestBlock = await getLatestBlockNumber();
    
    // 2. Initialize on first run
    if (lastCheckedBlock === 0) {
      lastCheckedBlock = await loadLastCheckedBlock();
      
      if (lastCheckedBlock === 0) {
        lastCheckedBlock = latestBlock - INITIAL_SCAN_BLOCKS;
        console.log(`[ETH-DepositMonitor] 🚀 First run, starting from block ${lastCheckedBlock}`);
        await saveLastCheckedBlock(lastCheckedBlock);
      }
    }
    
    // 3. Check if auto-reset needed
    const wasReset = await checkAndAutoReset(latestBlock);
    if (wasReset) {
      return;
    }
    
    // 4. Skip if no new blocks
    if (latestBlock <= lastCheckedBlock) {
      console.log(`[ETH-DepositMonitor] ⏭️  No new blocks (current: ${latestBlock}, checked: ${lastCheckedBlock})`);
      return;
    }
    
    // 5. Calculate scan range
    const fromBlock = lastCheckedBlock + 1;
    const toBlock = Math.min(latestBlock, fromBlock + BLOCKS_PER_SCAN - 1);
    const blockCount = toBlock - fromBlock + 1;
    
    console.log(`[ETH-DepositMonitor] 🔍 Scanning blocks ${fromBlock} to ${toBlock} (${blockCount} blocks)`);
    
    // 6. Get Transfer event logs
    const logs = await getUsdtTransferLogs(fromBlock, toBlock);
    
    historyPrunedErrors = 0;
    
    if (logs.length > 0) {
      console.log(`[ETH-DepositMonitor] 📝 Found ${logs.length} transfers to platform wallet`);
      
      // 7. Process each transfer
      for (const log of logs) {
        const transfer = parseTransferLog(log);
        await processDeposit(transfer);
      }
    }
    
    // 8. Update last checked block
    lastCheckedBlock = toBlock;
    await saveLastCheckedBlock(toBlock);
    console.log(`[ETH-DepositMonitor] ✅ Block number updated: ${toBlock}`);
    
  } catch (error) {
    const errorMsg = error.message || String(error);
    console.error('[ETH-DepositMonitor] ❌ Scan error:', errorMsg);
    
    // Handle history pruned errors
    if (errorMsg.includes('pruned') || errorMsg.includes('History has been')) {
      historyPrunedErrors++;
      console.log(`[ETH-DepositMonitor] ⚠️  History error count: ${historyPrunedErrors}/${MAX_HISTORY_PRUNED_ERRORS}`);
      
      if (historyPrunedErrors >= MAX_HISTORY_PRUNED_ERRORS) {
        try {
          const latestBlock = await getLatestBlockNumber();
          await autoResetBlockNumber(latestBlock, `${historyPrunedErrors} consecutive history errors, RPC has pruned historical data`);
        } catch (resetError) {
          console.error('[ETH-DepositMonitor] Auto-reset failed:', resetError.message);
        }
      }
    }
  }
}

/**
 * Manual scan trigger (for API calls)
 */
export async function triggerScan() {
  console.log('[ETH-DepositMonitor] 🔄 Manual scan triggered');
  await scanNewDeposits();
}

/**
 * Start ETH deposit monitor cron job
 */
export async function startEthDepositMonitor() {
  // Load platform wallet from DB
  PLATFORM_WALLET = await loadPlatformWallet();
  
  console.log('[ETH-DepositMonitor] 🚀 Starting ETH deposit monitor');
  console.log(`[ETH-DepositMonitor] ⚙️  Config: scan ${BLOCKS_PER_SCAN} blocks every ${SCAN_INTERVAL_MS/1000}s`);
  console.log(`[ETH-DepositMonitor] 🌐 RPC nodes: ${ETH_RPC_URLS.length} backup nodes`);
  console.log(`[ETH-DepositMonitor] 🔄 Auto-reset: when lag > ${MAX_BLOCK_LAG} blocks or ${MAX_HISTORY_PRUNED_ERRORS} consecutive history errors`);
  console.log(`[ETH-DepositMonitor] 💰 Platform wallet: ${PLATFORM_WALLET}`);
  console.log(`[ETH-DepositMonitor] 💵 Minimum deposit: ${MIN_DEPOSIT_AMOUNT} USDT`);
  console.log(`[ETH-DepositMonitor] 🔢 USDT decimals: ${USDT_DECIMALS} (ETH ERC-20)`);
  
  // Run immediately
  scanNewDeposits().catch(err => {
    console.error('[ETH-DepositMonitor] ❌ Initial scan failed:', err.message);
  });
  
  // Schedule periodic scans
  setInterval(() => {
    scanNewDeposits().catch(err => {
      console.error('[ETH-DepositMonitor] ❌ Scheduled scan failed:', err.message);
    });
  }, SCAN_INTERVAL_MS);
}

/**
 * Get monitor status (for admin dashboard)
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
      rpcNodes: ETH_RPC_URLS.length,
      usdtDecimals: USDT_DECIMALS
    }
  };
}

