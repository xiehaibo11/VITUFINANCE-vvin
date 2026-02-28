/**
 * TRON 充值路由
 * 
 * 功能：
 * - 生成充值 nonce
 * - 验证签名并执行充值
 * - 使用 DepositRelay 合约实现免密支付
 */

import express from 'express';
import { createHash } from 'crypto';
import { query as dbQuery } from '../../db.js';
import { getTronWeb, getDepositRelayContract } from '../utils/tronTransferService.js';

const router = express.Router();

// 内存存储 nonce（替代 Redis，适用于单进程部署）
const nonceStore = new Map();

// 定期清理过期 nonce（每5分钟）
setInterval(() => {
  const now = Date.now();
  for (const [key, { expireAt }] of nonceStore.entries()) {
    if (now > expireAt) {
      nonceStore.delete(key);
    }
  }
}, 300000);

// ==================== 工具函数 ====================

/**
 * 生成随机 nonce
 */
function generateNonce() {
  return '0x' + createHash('sha256')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex');
}

/**
 * 验证钱包地址格式（TRON Base58）
 */
function isValidTronAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }
  // TRON 地址以 T 开头，长度34
  return /^T[A-Za-z1-9]{33}$/.test(address);
}

// ==================== API 路由 ====================

/**
 * POST /api/deposit/tron/nonce
 * 获取充值 nonce
 */
router.post('/nonce', async (req, res) => {
  try {
    const { wallet_address } = req.body;
    
    if (!wallet_address) {
      return res.status(400).json({
        success: false,
        message: 'Wallet address is required'
      });
    }
    
    if (!isValidTronAddress(wallet_address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid TRON address format'
      });
    }
    
    const nonce = generateNonce();
    
    // 存储 nonce（5分钟过期）
    const storeKey = `tron:deposit:nonce:${wallet_address}`;
    nonceStore.set(storeKey, { value: nonce, expireAt: Date.now() + 300000 });
    
    console.log(`[TronDeposit] Nonce generated for ${wallet_address}: ${nonce}`);
    
    res.json({
      success: true,
      nonce: nonce
    });
  } catch (error) {
    console.error('[TronDeposit] Error generating nonce:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate nonce'
    });
  }
});

/**
 * POST /api/deposit/tron/execute
 * 执行充值（验证签名并调用合约）
 */
router.post('/execute', async (req, res) => {
  try {
    const { wallet_address, amount, nonce, signature } = req.body;
    
    // 1. 验证参数
    if (!wallet_address || !amount || !nonce || !signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters'
      });
    }
    
    if (!isValidTronAddress(wallet_address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid TRON address format'
      });
    }
    
    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount < 20) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount (minimum 20 USDT)'
      });
    }
    
    if (depositAmount > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Amount exceeds maximum (10000 USDT)'
      });
    }
    
    // 2. 验证 nonce
    const nonceKey = `tron:deposit:nonce:${wallet_address}`;
    const nonceEntry = nonceStore.get(nonceKey);
    const storedNonce = nonceEntry && Date.now() <= nonceEntry.expireAt ? nonceEntry.value : null;
    
    if (!storedNonce) {
      return res.status(400).json({
        success: false,
        message: 'Nonce not found or expired. Please request a new nonce.'
      });
    }
    
    if (storedNonce !== nonce) {
      return res.status(400).json({
        success: false,
        message: 'Invalid nonce'
      });
    }
    
    // 3. 删除已使用的 nonce（防重放攻击）
    nonceStore.delete(nonceKey);
    
    console.log(`[TronDeposit] Processing deposit: ${depositAmount} USDT from ${wallet_address}`);
    
    // 4. 获取 TronWeb 和合约实例
    const tronWeb = getTronWeb();
    const depositRelayContract = getDepositRelayContract();
    
    if (!depositRelayContract) {
      return res.status(500).json({
        success: false,
        message: 'DepositRelay contract not available'
      });
    }
    
    // 5. 转换金额为 Sun 单位（USDT TRC-20 是 6 位小数）
    const amountSun = Math.floor(depositAmount * 1e6);
    
    // 6. 调用合约的 depositWithSignature 函数
    console.log(`[TronDeposit] Calling contract depositWithSignature...`);
    
    const tx = await depositRelayContract.depositWithSignature(
      wallet_address,
      amountSun,
      nonce,
      signature
    ).send({
      feeLimit: 100000000, // 100 TRX
      callValue: 0,
      shouldPollResponse: true
    });
    
    console.log(`[TronDeposit] Transaction sent: ${tx}`);
    
    // 7. 等待交易确认（TRON 约3秒出块）
    let confirmed = false;
    let attempts = 0;
    const maxAttempts = 20; // 最多等待60秒
    
    while (!confirmed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      try {
        const txInfo = await tronWeb.trx.getTransactionInfo(tx);
        if (txInfo && txInfo.id) {
          if (txInfo.receipt && txInfo.receipt.result === 'SUCCESS') {
            confirmed = true;
            console.log(`[TronDeposit] Transaction confirmed: ${tx}`);
          } else if (txInfo.receipt && txInfo.receipt.result === 'REVERT') {
            throw new Error('Transaction reverted: ' + (txInfo.resMessage || 'Unknown error'));
          }
        }
      } catch (error) {
        console.log(`[TronDeposit] Waiting for confirmation... (${attempts + 1}/${maxAttempts})`);
      }
      
      attempts++;
    }
    
    if (!confirmed) {
      // 交易可能仍在处理中，记录到数据库但标记为 pending
      await dbQuery(
        `INSERT INTO deposits (wallet_address, amount, tx_hash, status, chain, created_at) 
         VALUES (?, ?, ?, 'pending', 'TRON', NOW())`,
        [wallet_address, depositAmount, tx]
      );
      
      return res.json({
        success: true,
        message: 'Deposit transaction submitted, waiting for confirmation',
        txHash: tx,
        status: 'pending'
      });
    }
    
    // 8. 记录充值到数据库
    await dbQuery(
      `INSERT INTO deposits (wallet_address, amount, tx_hash, status, chain, created_at) 
       VALUES (?, ?, ?, 'confirmed', 'TRON', NOW())`,
      [wallet_address, depositAmount, tx]
    );
    
    // 9. 更新用户余额
    const userResult = await dbQuery(
      `SELECT id FROM user_balances WHERE wallet_address = ?`,
      [wallet_address]
    );
    
    if (userResult.length === 0) {
      // 创建新用户
      await dbQuery(
        `INSERT INTO user_balances (wallet_address, usdt_balance, wld_balance, total_deposit, created_at) 
         VALUES (?, ?, 0, ?, NOW())`,
        [wallet_address, depositAmount, depositAmount]
      );
      console.log(`[TronDeposit] Created new user: ${wallet_address}`);
    } else {
      // 更新现有用户余额
      await dbQuery(
        `UPDATE user_balances 
         SET usdt_balance = usdt_balance + ?, 
             total_deposit = total_deposit + ? 
         WHERE wallet_address = ?`,
        [depositAmount, depositAmount, wallet_address]
      );
    }
    
    // 10. 获取新余额
    const balanceResult = await dbQuery(
      `SELECT usdt_balance FROM user_balances WHERE wallet_address = ?`,
      [wallet_address]
    );
    
    const newBalance = balanceResult[0]?.usdt_balance || 0;
    
    console.log(`[TronDeposit] ✅ Deposit successful: ${depositAmount} USDT ← ${wallet_address}`);
    
    res.json({
      success: true,
      message: 'Deposit successful',
      txHash: tx,
      amount: depositAmount,
      newBalance: newBalance,
      status: 'confirmed'
    });
    
  } catch (error) {
    console.error('[TronDeposit] Execute error:', error);
    
    // 记录错误到数据库
    try {
      await dbQuery(
        `INSERT INTO error_logs (source, level, message, details, created_at)
         VALUES ('TronDepositAPI', 'ERROR', ?, ?, NOW())`,
        ['Deposit execution failed', JSON.stringify({
          wallet_address: req.body.wallet_address,
          amount: req.body.amount,
          error: error.message
        })]
      );
    } catch (logError) {
      console.error('[TronDeposit] Failed to log error:', logError);
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Deposit execution failed'
    });
  }
});

/**
 * GET /api/deposit/tron/status/:txHash
 * 查询充值交易状态
 */
router.get('/status/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params;
    
    if (!txHash) {
      return res.status(400).json({
        success: false,
        message: 'Transaction hash is required'
      });
    }
    
    // 从数据库查询
    const result = await dbQuery(
      `SELECT * FROM deposits WHERE tx_hash = ? AND chain = 'TRON'`,
      [txHash]
    );
    
    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Deposit not found'
      });
    }
    
    const deposit = result[0];
    
    res.json({
      success: true,
      deposit: {
        wallet_address: deposit.wallet_address,
        amount: deposit.amount,
        tx_hash: deposit.tx_hash,
        status: deposit.status,
        created_at: deposit.created_at
      }
    });
    
  } catch (error) {
    console.error('[TronDeposit] Status query error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to query deposit status'
    });
  }
});

export default router;
