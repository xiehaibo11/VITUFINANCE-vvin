/**
 * TRON 充值监控定时任务
 *
 * 监控 TRON 主网上的 USDT (TRC-20) 充值到平台钱包
 * 通过 TronGrid API 扫描 Transfer 事件
 *
 * 创建时间: 2026-02-28
 */

import { query as dbQuery } from '../../db.js';

// ==================== 配置常量 ====================

const TRONGRID_API = 'https://api.trongrid.io';

// 平台钱包地址 (TRON Base58)
const PLATFORM_WALLET = process.env.TRON_PLATFORM_WALLET || 'TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi';

// USDT (TRC-20) 合约地址
const USDT_CONTRACT = process.env.TRON_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// 最低充值金额 (USDT)
const MIN_DEPOSIT_AMOUNT = 20;

// 扫描间隔 (毫秒) - TRON 出块约3秒，60秒扫描一次
const SCAN_INTERVAL_MS = parseInt(process.env.TRON_SCAN_INTERVAL_MS) || 60000;

// 上次扫描的时间戳 (毫秒)
let lastCheckedTimestamp = 0;

// 错误计数
let consecutiveErrors = 0;

// ==================== 工具函数 ====================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 持久化函数 ====================

async function loadLastCheckedTimestamp() {
  try {
    const result = await dbQuery(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'tron_deposit_last_checked_ts'`
    );
    if (result && result.length > 0) {
      const ts = parseInt(result[0].setting_value);
      console.log(`[TronDepositMonitor] 从数据库加载时间戳: ${new Date(ts).toISOString()}`);
      return ts;
    }
  } catch (error) {
    console.error('[TronDepositMonitor] 读取时间戳失败:', error.message);
  }
  return 0;
}

async function saveLastCheckedTimestamp(timestamp) {
  try {
    await dbQuery(
      `INSERT INTO system_settings (setting_key, setting_value, description, updated_at)
       VALUES ('tron_deposit_last_checked_ts', ?, 'TRON充值监控最后检查时间戳', NOW())
       ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
      [timestamp.toString(), timestamp.toString()]
    );
  } catch (error) {
    console.error('[TronDepositMonitor] 保存时间戳失败:', error.message);
  }
}

// ==================== API 调用 ====================

/**
 * 获取 TRC-20 转账记录 (通过 TronGrid API)
 * 查询发送到平台钱包的 USDT 转账
 */
async function getTrc20Transfers(minTimestamp) {
  const url = `${TRONGRID_API}/v1/accounts/${PLATFORM_WALLET}/transactions/trc20?only_to=true&limit=50&min_timestamp=${minTimestamp}&contract_address=${USDT_CONTRACT}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`TronGrid API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

// ==================== 充值处理 ====================

async function processDeposit(transfer) {
  const txHash = transfer.transaction_id;
  const from = transfer.from;
  const to = transfer.to;
  const amount = Number(transfer.value) / 1e6; // TRC-20 USDT is 6 decimals
  const timestamp = transfer.block_timestamp;

  try {
    // 1. 检查是否已处理
    const existing = await dbQuery(
      'SELECT id FROM deposit_records WHERE tx_hash = ?',
      [txHash]
    );

    if (existing.length > 0) {
      return;
    }

    // 2. 检查金额
    if (amount < MIN_DEPOSIT_AMOUNT) {
      console.log(`[TronDepositMonitor] 金额过小 (${amount} USDT < ${MIN_DEPOSIT_AMOUNT} USDT), 来自: ${from}`);
      await dbQuery(
        `INSERT INTO deposit_records
         (wallet_address, amount, token, network, tx_hash, status, created_at, remark)
         VALUES (?, ?, 'USDT', 'TRON', ?, 'failed', NOW(), '金额低于最低充值要求')`,
        [from, amount, txHash]
      );
      return;
    }

    console.log(`[TronDepositMonitor] 检测到新充值:`, {
      from, amount: `${amount} USDT`, txHash
    });

    // 3. 创建充值记录
    await dbQuery(
      `INSERT INTO deposit_records
       (wallet_address, amount, token, network, tx_hash, status, created_at, completed_at)
       VALUES (?, ?, 'USDT', 'TRON', ?, 'completed', NOW(), NOW())`,
      [from, amount, txHash]
    );

    // 4. 更新用户余额
    const userExists = await dbQuery(
      'SELECT id FROM user_balances WHERE wallet_address = ?',
      [from]
    );

    if (userExists.length === 0) {
      await dbQuery(
        `INSERT INTO user_balances
         (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, created_at, updated_at)
         VALUES (?, ?, 0, ?, 0, NOW(), NOW())`,
        [from, amount, amount]
      );
      console.log(`[TronDepositMonitor] 创建新用户: ${from}`);
    } else {
      await dbQuery(
        `UPDATE user_balances
         SET usdt_balance = usdt_balance + ?,
             total_deposit = total_deposit + ?,
             updated_at = NOW()
         WHERE wallet_address = ?`,
        [amount, amount, from]
      );
    }

    console.log(`[TronDepositMonitor] ✅ 充值处理成功: ${amount} USDT ← ${from}`);
  } catch (error) {
    console.error(`[TronDepositMonitor] 处理充值失败 (${txHash}):`, error.message);
    try {
      await dbQuery(
        `INSERT INTO error_logs (source, level, message, details, created_at)
         VALUES ('TronDepositMonitor', 'ERROR', ?, ?, NOW())`,
        [`处理充值失败: ${txHash}`, JSON.stringify({ from, amount, error: error.message })]
      );
    } catch (_) { /* ignore */ }
  }
}

// ==================== 主扫描函数 ====================

export async function scanTronDeposits() {
  try {
    // 初始化时间戳
    if (lastCheckedTimestamp === 0) {
      lastCheckedTimestamp = await loadLastCheckedTimestamp();
      if (lastCheckedTimestamp === 0) {
        // 首次运行，从10分钟前开始
        lastCheckedTimestamp = Date.now() - 10 * 60 * 1000;
        console.log(`[TronDepositMonitor] 首次运行，从 ${new Date(lastCheckedTimestamp).toISOString()} 开始`);
        await saveLastCheckedTimestamp(lastCheckedTimestamp);
      }
    }

    // 查询新的 TRC-20 转账
    const transfers = await getTrc20Transfers(lastCheckedTimestamp);

    if (transfers.length > 0) {
      console.log(`[TronDepositMonitor] 发现 ${transfers.length} 笔 USDT 转入`);

      for (const transfer of transfers) {
        await processDeposit(transfer);
        await sleep(500); // 避免数据库压力
      }

      // 更新时间戳为最新一笔交易的时间
      const latestTs = Math.max(...transfers.map(t => t.block_timestamp));
      lastCheckedTimestamp = latestTs + 1;
    } else {
      // 没有新交易，推进时间戳
      lastCheckedTimestamp = Date.now() - 30000; // 30秒前
    }

    await saveLastCheckedTimestamp(lastCheckedTimestamp);
    consecutiveErrors = 0;
  } catch (error) {
    consecutiveErrors++;
    console.error(`[TronDepositMonitor] 扫描错误 (${consecutiveErrors}):`, error.message);
  }
}

/**
 * 手动触发扫描
 */
export async function triggerTronScan() {
  console.log('[TronDepositMonitor] 手动触发扫描');
  await scanTronDeposits();
}

/**
 * 启动 TRON 充值监控
 */
export function startTronDepositMonitor() {
  if (!PLATFORM_WALLET) {
    console.log('[TronDepositMonitor] 未配置 TRON 平台钱包地址，跳过启动');
    return;
  }

  console.log('[TronDepositMonitor] 启动 TRON 充值监控服务');
  console.log(`[TronDepositMonitor] 平台钱包: ${PLATFORM_WALLET}`);
  console.log(`[TronDepositMonitor] USDT合约: ${USDT_CONTRACT}`);
  console.log(`[TronDepositMonitor] 扫描间隔: ${SCAN_INTERVAL_MS / 1000}秒`);
  console.log(`[TronDepositMonitor] 最低充值: ${MIN_DEPOSIT_AMOUNT} USDT`);

  if (DEPOSIT_RELAY_CONTRACT) {
    console.log(`[TronDepositMonitor] DepositRelay: ${DEPOSIT_RELAY_CONTRACT}`);
  }

  // 立即执行一次
  scanTronDeposits().catch(err => {
    console.error('[TronDepositMonitor] 首次扫描失败:', err.message);
  });

  // 定时执行
  setInterval(() => {
    scanTronDeposits().catch(err => {
      console.error('[TronDepositMonitor] 定时扫描失败:', err.message);
    });
  }, SCAN_INTERVAL_MS);
}

const DEPOSIT_RELAY_CONTRACT = process.env.TRON_DEPOSIT_RELAY_CONTRACT || '';

/**
 * 获取监控状态
 */
export function getTronMonitorStatus() {
  return {
    isRunning: true,
    lastCheckedTimestamp,
    lastCheckedTime: lastCheckedTimestamp ? new Date(lastCheckedTimestamp).toISOString() : null,
    consecutiveErrors,
    config: {
      scanIntervalMs: SCAN_INTERVAL_MS,
      minDepositAmount: MIN_DEPOSIT_AMOUNT,
      platformWallet: PLATFORM_WALLET,
      depositRelayContract: DEPOSIT_RELAY_CONTRACT
    }
  };
}
