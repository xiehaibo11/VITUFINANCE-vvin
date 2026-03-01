/**
 * 钱包扣费路由
 * 从用户授权的钱包中扣除 USDT
 */

import express from 'express';
import { ethers } from 'ethers';
import TronWebModule from 'tronweb';
const TronWeb = TronWebModule.TronWeb;
import db from '../../db.js';

const router = express.Router();

// USDT 合约地址（多链）
const USDT_CONTRACTS = {
  BSC: '0x55d398326f99059fF775485246999027B3197955',
  ETH: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  TRON: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
};

// USDT 小数位数
const USDT_DECIMALS = {
  BSC: 18,
  ETH: 6,
  TRON: 6
};

// RPC URLs
const RPC_URLS = {
  BSC: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
  ETH: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
  TRON: process.env.TRON_RPC_URL || 'https://api.trongrid.io'
};

// USDT ABI (transferFrom 方法)
const USDT_ABI = [
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

/**
 * 处理 TRON 链扣费
 */
async function handleTronDeduction(wallet_address, amount, admin_remark, res) {
  try {
    // 获取 TRON 私钥
    const tronPrivateKey = process.env.TRON_PRIVATE_KEY || process.env.TRANSFER_PRIVATE_KEY;
    if (!tronPrivateKey) {
      return res.json({
        success: false,
        message: '未配置 TRON 私钥'
      });
    }

    // 初始化 TronWeb
    const tronWeb = new TronWeb({
      fullHost: RPC_URLS.TRON,
      privateKey: tronPrivateKey
    });

    const platformAddress = tronWeb.address.fromPrivateKey(tronPrivateKey);
    console.log(`[WalletDeduct][TRON] Platform address: ${platformAddress}`);
    console.log(`[WalletDeduct][TRON] Deducting ${amount} USDT from ${wallet_address}`);

    // 获取 USDT 合约实例
    const usdtContract = await tronWeb.contract().at(USDT_CONTRACTS.TRON);

    // 检查用户授权额度
    const allowance = await usdtContract.allowance(wallet_address, platformAddress).call();
    const allowanceUsdt = Number(allowance) / 1e6; // TRON USDT 是 6 位小数

    console.log(`[WalletDeduct][TRON] Allowance: ${allowanceUsdt} USDT`);
    console.log(`[WalletDeduct][TRON] Required: ${amount} USDT`);

    if (allowanceUsdt < amount) {
      return res.json({
        success: false,
        message: `用户授权额度不足。当前授权：${allowanceUsdt.toFixed(2)} USDT，需要：${amount} USDT`
      });
    }

    // 检查用户余额
    const userBalance = await usdtContract.balanceOf(wallet_address).call();
    const userBalanceUsdt = Number(userBalance) / 1e6;

    console.log(`[WalletDeduct][TRON] User balance: ${userBalanceUsdt} USDT`);

    if (userBalanceUsdt < amount) {
      return res.json({
        success: false,
        message: `用户钱包余额不足。当前余额：${userBalanceUsdt.toFixed(2)} USDT`
      });
    }

    // 检查平台钱包 TRX 余额（用于支付能量费）
    const platformTrxBalance = await tronWeb.trx.getBalance(platformAddress);
    const platformTrxBalanceTrx = platformTrxBalance / 1e6;
    console.log(`[WalletDeduct][TRON] Platform TRX balance: ${platformTrxBalanceTrx} TRX`);

    if (platformTrxBalanceTrx < 30) {
      return res.json({
        success: false,
        message: `平台钱包 TRX 不足。当前余额：${platformTrxBalanceTrx.toFixed(2)} TRX，建议至少 30 TRX`
      });
    }

    // 执行 transferFrom
    console.log(`[WalletDeduct][TRON] Executing transferFrom...`);
    
    const amountSun = Math.floor(amount * 1e6); // 转换为 Sun 单位
    
    const tx = await usdtContract.transferFrom(
      wallet_address,
      platformAddress,
      amountSun
    ).send({
      feeLimit: 100000000, // 100 TRX
      callValue: 0,
      shouldPollResponse: true
    });

    console.log(`[WalletDeduct][TRON] Transaction sent: ${tx}`);

    // 等待交易确认（TRON 交易通常很快）
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 获取交易信息
    let txInfo;
    try {
      txInfo = await tronWeb.trx.getTransactionInfo(tx);
      console.log(`[WalletDeduct][TRON] Transaction confirmed in block ${txInfo.blockNumber}`);
    } catch (error) {
      console.log(`[WalletDeduct][TRON] Transaction info not available yet, but tx sent: ${tx}`);
      txInfo = { blockNumber: 'pending' };
    }

    // 记录扣费日志到数据库
    try {
      await db.query(
        `INSERT INTO wallet_deduction_logs 
        (wallet_address, amount, chain, tx_hash, admin_remark, created_at) 
        VALUES (?, ?, ?, ?, ?, NOW())`,
        [wallet_address, amount, 'TRON', tx, admin_remark || '']
      );
    } catch (dbError) {
      console.error('[WalletDeduct][TRON] Failed to log to database:', dbError.message);
      // 不影响主流程，继续返回成功
    }

    // 返回成功
    return res.json({
      success: true,
      message: '扣费成功',
      data: {
        txHash: tx,
        blockNumber: txInfo.blockNumber,
        amount: amount,
        chain: 'TRON',
        from: wallet_address,
        to: platformAddress,
        explorer: `https://tronscan.org/#/transaction/${tx}`
      }
    });

  } catch (error) {
    console.error('[WalletDeduct][TRON] Error:', error);
    
    let errorMessage = '扣费失败';
    if (error.message) {
      if (error.message.includes('REVERT')) {
        errorMessage = '交易被拒绝，可能是授权额度不足或用户余额不足';
      } else if (error.message.includes('balance is not sufficient')) {
        errorMessage = '平台钱包 TRX 不足，无法支付能量费';
      } else {
        errorMessage = error.message;
      }
    }

    return res.json({
      success: false,
      message: errorMessage
    });
  }
}

/**
 * 从用户钱包扣费
 * POST /api/admin/users/deduct-from-wallet
 */
router.post('/deduct-from-wallet', async (req, res) => {
  const { wallet_address, amount, chain, admin_remark } = req.body;

  // 调试日志
  console.log('[WalletDeduct] Request body:', JSON.stringify(req.body));

  // 参数验证
  if (!wallet_address || !amount || !chain) {
    console.log('[WalletDeduct] Missing params:', { wallet_address, amount, chain });
    return res.json({
      success: false,
      message: '缺少必要参数'
    });
  }

  if (amount <= 0) {
    return res.json({
      success: false,
      message: '扣费金额必须大于0'
    });
  }

  if (!['BSC', 'ETH', 'TRON'].includes(chain)) {
    return res.json({
      success: false,
      message: '不支持的链'
    });
  }

  // TRON 链处理
  if (chain === 'TRON') {
    return await handleTronDeduction(wallet_address, amount, admin_remark, res);
  }

  try {
    // 获取私钥
    const privateKey = process.env.TRANSFER_PRIVATE_KEY;
    if (!privateKey) {
      return res.json({
        success: false,
        message: '未配置转账私钥'
      });
    }

    // 创建 provider 和 wallet
    const provider = new ethers.JsonRpcProvider(RPC_URLS[chain]);
    const wallet = new ethers.Wallet(privateKey, provider);
    const platformAddress = wallet.address;

    console.log(`[WalletDeduct] Platform address: ${platformAddress}`);
    console.log(`[WalletDeduct] Deducting ${amount} USDT from ${wallet_address} on ${chain}`);

    // 创建 USDT 合约实例
    const usdtContract = new ethers.Contract(
      USDT_CONTRACTS[chain],
      USDT_ABI,
      wallet
    );

    // 检查用户授权额度
    const allowance = await usdtContract.allowance(wallet_address, platformAddress);
    const decimals = USDT_DECIMALS[chain];
    const amountWei = ethers.parseUnits(amount.toString(), decimals);

    console.log(`[WalletDeduct] Allowance: ${ethers.formatUnits(allowance, decimals)} USDT`);
    console.log(`[WalletDeduct] Required: ${amount} USDT`);

    if (allowance < amountWei) {
      return res.json({
        success: false,
        message: `用户授权额度不足。当前授权：${ethers.formatUnits(allowance, decimals)} USDT，需要：${amount} USDT`
      });
    }

    // 检查用户余额
    const userBalance = await usdtContract.balanceOf(wallet_address);
    console.log(`[WalletDeduct] User balance: ${ethers.formatUnits(userBalance, decimals)} USDT`);

    if (userBalance < amountWei) {
      return res.json({
        success: false,
        message: `用户钱包余额不足。当前余额：${ethers.formatUnits(userBalance, decimals)} USDT`
      });
    }

    // 执行 transferFrom
    console.log(`[WalletDeduct] Executing transferFrom...`);
    
    const gasPrice = chain === 'ETH' 
      ? ethers.parseUnits('20', 'gwei')  // ETH 使用较高 gas
      : ethers.parseUnits('5', 'gwei');   // BSC 使用较低 gas

    const tx = await usdtContract.transferFrom(
      wallet_address,
      platformAddress,
      amountWei,
      {
        gasPrice,
        gasLimit: chain === 'ETH' ? 100000 : 80000
      }
    );

    console.log(`[WalletDeduct] Transaction sent: ${tx.hash}`);

    // 等待交易确认
    const receipt = await tx.wait();
    console.log(`[WalletDeduct] Transaction confirmed in block ${receipt.blockNumber}`);

    // 记录扣费日志到数据库
    try {
      await db.query(
        `INSERT INTO wallet_deduction_logs 
        (wallet_address, amount, chain, tx_hash, admin_remark, created_at) 
        VALUES (?, ?, ?, ?, ?, NOW())`,
        [wallet_address, amount, chain, tx.hash, admin_remark || '']
      );
    } catch (dbError) {
      console.error('[WalletDeduct] Failed to log to database:', dbError.message);
      // 不影响主流程，继续返回成功
    }

    // 返回成功
    res.json({
      success: true,
      message: '扣费成功',
      data: {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        amount: amount,
        chain: chain,
        from: wallet_address,
        to: platformAddress
      }
    });

  } catch (error) {
    console.error('[WalletDeduct] Error:', error);
    
    let errorMessage = '扣费失败';
    if (error.message.includes('insufficient funds')) {
      errorMessage = '平台钱包 Gas 费不足';
    } else if (error.message.includes('execution reverted')) {
      errorMessage = '交易被拒绝，可能是授权额度不足或用户余额不足';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.json({
      success: false,
      message: errorMessage
    });
  }
});

/**
 * 查询用户授权额度
 * GET /api/admin/users/check-allowance
 */
router.get('/check-allowance', async (req, res) => {
  const { wallet_address, chain } = req.query;

  if (!wallet_address || !chain) {
    return res.json({
      success: false,
      message: '缺少必要参数'
    });
  }

  if (!['BSC', 'ETH', 'TRON'].includes(chain)) {
    return res.json({
      success: false,
      message: '不支持的链'
    });
  }

  // TRON 链处理
  if (chain === 'TRON') {
    try {
      const tronPrivateKey = process.env.TRON_PRIVATE_KEY || process.env.TRANSFER_PRIVATE_KEY;
      if (!tronPrivateKey) {
        return res.json({
          success: false,
          message: '未配置 TRON 私钥'
        });
      }

      const tronWeb = new TronWeb({
        fullHost: RPC_URLS.TRON,
        privateKey: tronPrivateKey
      });

      const platformAddress = tronWeb.address.fromPrivateKey(tronPrivateKey);
      const usdtContract = await tronWeb.contract().at(USDT_CONTRACTS.TRON);

      const allowance = await usdtContract.allowance(wallet_address, platformAddress).call();
      const balance = await usdtContract.balanceOf(wallet_address).call();

      return res.json({
        success: true,
        data: {
          allowance: (Number(allowance) / 1e6).toFixed(2),
          balance: (Number(balance) / 1e6).toFixed(2),
          platform_address: platformAddress,
          chain: 'TRON'
        }
      });

    } catch (error) {
      console.error('[WalletDeduct][TRON] Check allowance error:', error);
      return res.json({
        success: false,
        message: error.message
      });
    }
  }

  // EVM 链处理（BSC/ETH）
  try {
    const privateKey = process.env.TRANSFER_PRIVATE_KEY;
    if (!privateKey) {
      return res.json({
        success: false,
        message: '未配置转账私钥'
      });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URLS[chain]);
    const wallet = new ethers.Wallet(privateKey, provider);
    const platformAddress = wallet.address;

    const usdtContract = new ethers.Contract(
      USDT_CONTRACTS[chain],
      USDT_ABI,
      provider
    );

    const allowance = await usdtContract.allowance(wallet_address, platformAddress);
    const balance = await usdtContract.balanceOf(wallet_address);
    const decimals = USDT_DECIMALS[chain];

    res.json({
      success: true,
      data: {
        allowance: ethers.formatUnits(allowance, decimals),
        balance: ethers.formatUnits(balance, decimals),
        platform_address: platformAddress,
        chain: chain
      }
    });

  } catch (error) {
    console.error('[WalletDeduct] Check allowance error:', error);
    res.json({
      success: false,
      message: error.message
    });
  }
});

export default router;
