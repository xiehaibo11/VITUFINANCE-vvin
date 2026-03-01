/**
 * 检查用户授权额度脚本
 * 用法: node scripts/check_user_allowance.js <user_address> <chain>
 * 示例: node scripts/check_user_allowance.js 0x1234...5678 BSC
 */

import { ethers } from 'ethers';
import TronWebModule from 'tronweb';
const TronWeb = TronWebModule.TronWeb;
import dotenv from 'dotenv';

dotenv.config();

// USDT 合约地址
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

// USDT ABI
const USDT_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

async function checkBscEthAllowance(userAddress, chain) {
  try {
    console.log(`\n[${chain}] 检查授权状态...`);
    console.log(`用户地址: ${userAddress}`);

    // 获取平台私钥和地址
    const privateKey = process.env.TRANSFER_PRIVATE_KEY;
    if (!privateKey) {
      console.error('❌ 未配置 TRANSFER_PRIVATE_KEY');
      return;
    }

    const provider = new ethers.JsonRpcProvider(RPC_URLS[chain]);
    const wallet = new ethers.Wallet(privateKey, provider);
    const platformAddress = wallet.address;

    console.log(`平台地址: ${platformAddress}`);

    // 创建 USDT 合约实例
    const usdtContract = new ethers.Contract(
      USDT_CONTRACTS[chain],
      USDT_ABI,
      provider
    );

    // 查询用户余额
    const balance = await usdtContract.balanceOf(userAddress);
    const decimals = USDT_DECIMALS[chain];
    const balanceUsdt = ethers.formatUnits(balance, decimals);

    console.log(`\n💰 用户 USDT 余额: ${balanceUsdt} USDT`);

    // 查询授权额度
    const allowance = await usdtContract.allowance(userAddress, platformAddress);
    const allowanceUsdt = ethers.formatUnits(allowance, decimals);

    console.log(`✅ 授权额度: ${allowanceUsdt} USDT`);

    // 判断授权状态
    if (parseFloat(allowanceUsdt) === 0) {
      console.log('\n⚠️  用户尚未授权平台地址');
      console.log('\n📝 授权方法：');
      console.log(`1. 访问区块链浏览器`);
      if (chain === 'BSC') {
        console.log(`   https://bscscan.com/token/${USDT_CONTRACTS[chain]}#writeContract`);
      } else {
        console.log(`   https://etherscan.io/token/${USDT_CONTRACTS[chain]}#writeContract`);
      }
      console.log(`2. 连接钱包`);
      console.log(`3. 找到 approve 方法`);
      console.log(`4. 填写参数：`);
      console.log(`   - spender: ${platformAddress}`);
      console.log(`   - amount: 1000000000000000000000 (1000 USDT)`);
      console.log(`5. 确认交易`);
    } else if (parseFloat(allowanceUsdt) < 10) {
      console.log('\n⚠️  授权额度较低，建议增加授权');
    } else {
      console.log('\n✅ 授权额度充足，可以进行扣费操作');
    }

    // 检查平台 Gas 费
    const platformBalance = await provider.getBalance(platformAddress);
    const platformBalanceEth = ethers.formatEther(platformBalance);
    console.log(`\n⛽ 平台 ${chain === 'BSC' ? 'BNB' : 'ETH'} 余额: ${platformBalanceEth}`);

    if (parseFloat(platformBalanceEth) < (chain === 'BSC' ? 0.01 : 0.001)) {
      console.log(`⚠️  平台 Gas 费不足，建议充值`);
    }

  } catch (error) {
    console.error(`❌ 检查失败:`, error.message);
  }
}

async function checkTronAllowance(userAddress) {
  try {
    console.log(`\n[TRON] 检查授权状态...`);
    console.log(`用户地址: ${userAddress}`);

    // 获取平台私钥和地址
    const tronPrivateKey = process.env.TRON_PRIVATE_KEY || process.env.TRANSFER_PRIVATE_KEY;
    if (!tronPrivateKey) {
      console.error('❌ 未配置 TRON_PRIVATE_KEY');
      return;
    }

    const tronWeb = new TronWeb({
      fullHost: RPC_URLS.TRON,
      privateKey: tronPrivateKey
    });

    const platformAddress = tronWeb.address.fromPrivateKey(tronPrivateKey);
    console.log(`平台地址: ${platformAddress}`);

    // 获取 USDT 合约
    const usdtContract = await tronWeb.contract().at(USDT_CONTRACTS.TRON);

    // 查询用户余额
    const balance = await usdtContract.balanceOf(userAddress).call();
    const balanceUsdt = Number(balance) / 1e6;

    console.log(`\n💰 用户 USDT 余额: ${balanceUsdt.toFixed(2)} USDT`);

    // 查询授权额度
    const allowance = await usdtContract.allowance(userAddress, platformAddress).call();
    const allowanceUsdt = Number(allowance) / 1e6;

    console.log(`✅ 授权额度: ${allowanceUsdt.toFixed(2)} USDT`);

    // 判断授权状态
    if (allowanceUsdt === 0) {
      console.log('\n⚠️  用户尚未授权平台地址');
      console.log('\n📝 授权方法：');
      console.log(`1. 访问 TronScan`);
      console.log(`   https://tronscan.org/#/contract/${USDT_CONTRACTS.TRON}/code`);
      console.log(`2. 点击 "Write Contract"`);
      console.log(`3. 连接 TronLink 钱包`);
      console.log(`4. 找到 approve 方法`);
      console.log(`5. 填写参数：`);
      console.log(`   - spender: ${platformAddress}`);
      console.log(`   - amount: 1000000000 (1000 USDT)`);
      console.log(`6. 确认交易`);
    } else if (allowanceUsdt < 10) {
      console.log('\n⚠️  授权额度较低，建议增加授权');
    } else {
      console.log('\n✅ 授权额度充足，可以进行扣费操作');
    }

    // 检查平台 TRX 余额
    const platformTrxBalance = await tronWeb.trx.getBalance(platformAddress);
    const platformTrxBalanceTrx = platformTrxBalance / 1e6;
    console.log(`\n⛽ 平台 TRX 余额: ${platformTrxBalanceTrx.toFixed(2)} TRX`);

    if (platformTrxBalanceTrx < 30) {
      console.log(`⚠️  平台 TRX 不足，建议充值至少 50 TRX`);
    }

  } catch (error) {
    console.error(`❌ 检查失败:`, error.message);
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('用法: node scripts/check_user_allowance.js <user_address> <chain>');
    console.log('示例: node scripts/check_user_allowance.js 0x1234...5678 BSC');
    console.log('支持的链: BSC, ETH, TRON');
    process.exit(1);
  }

  const userAddress = args[0];
  const chain = args[1].toUpperCase();

  if (!['BSC', 'ETH', 'TRON'].includes(chain)) {
    console.error('❌ 不支持的链，请使用: BSC, ETH, TRON');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('检查用户授权额度');
  console.log('='.repeat(60));

  if (chain === 'TRON') {
    await checkTronAllowance(userAddress);
  } else {
    await checkBscEthAllowance(userAddress, chain);
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
