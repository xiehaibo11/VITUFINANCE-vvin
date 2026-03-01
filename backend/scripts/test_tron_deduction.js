/**
 * TRON 扣费功能测试脚本
 * 
 * 使用方法：
 * node scripts/test_tron_deduction.js <user_address> <amount>
 * 
 * 示例：
 * node scripts/test_tron_deduction.js TXxx...xxx 10
 */

import TronWeb from 'tronweb';
import dotenv from 'dotenv';

dotenv.config();

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TRON_RPC = process.env.TRON_RPC_URL || 'https://api.trongrid.io';

async function testTronDeduction() {
  const userAddress = process.argv[2];
  const amount = parseFloat(process.argv[3]);

  if (!userAddress || !amount) {
    console.log('Usage: node test_tron_deduction.js <user_address> <amount>');
    console.log('Example: node test_tron_deduction.js TXxx...xxx 10');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('TRON 扣费功能测试');
  console.log('='.repeat(60));
  console.log(`用户地址: ${userAddress}`);
  console.log(`扣费金额: ${amount} USDT`);
  console.log('');

  try {
    // 获取私钥
    const privateKey = process.env.TRON_PRIVATE_KEY || process.env.TRANSFER_PRIVATE_KEY;
    if (!privateKey) {
      console.error('❌ 未配置 TRON 私钥');
      process.exit(1);
    }

    // 初始化 TronWeb
    const tronWeb = new TronWeb({
      fullHost: TRON_RPC,
      privateKey: privateKey
    });

    const platformAddress = tronWeb.address.fromPrivateKey(privateKey);
    console.log(`平台地址: ${platformAddress}`);
    console.log('');

    // 获取 USDT 合约
    const usdtContract = await tronWeb.contract().at(USDT_CONTRACT);

    // 1. 检查用户余额
    console.log('1️⃣  检查用户余额...');
    const userBalance = await usdtContract.balanceOf(userAddress).call();
    const userBalanceUsdt = userBalance.toNumber() / 1e6;
    console.log(`   用户 USDT 余额: ${userBalanceUsdt.toFixed(2)} USDT`);

    if (userBalanceUsdt < amount) {
      console.error(`   ❌ 用户余额不足！需要 ${amount} USDT`);
      process.exit(1);
    }
    console.log(`   ✅ 余额充足`);
    console.log('');

    // 2. 检查授权额度
    console.log('2️⃣  检查授权额度...');
    const allowance = await usdtContract.allowance(userAddress, platformAddress).call();
    const allowanceUsdt = allowance.toNumber() / 1e6;
    console.log(`   授权额度: ${allowanceUsdt.toFixed(2)} USDT`);

    if (allowanceUsdt < amount) {
      console.error(`   ❌ 授权额度不足！需要 ${amount} USDT`);
      console.log('');
      console.log('用户需要先授权平台地址：');
      console.log(`   平台地址: ${platformAddress}`);
      console.log(`   授权金额: ${amount} USDT 或更多`);
      console.log('');
      console.log('授权方法：');
      console.log('   1. 在 TronScan 上授权: https://tronscan.org');
      console.log('   2. 在 imToken 的授权管理中添加');
      console.log('   3. 在 DApp 充值时自动授权');
      process.exit(1);
    }
    console.log(`   ✅ 授权额度充足`);
    console.log('');

    // 3. 检查平台 TRX 余额
    console.log('3️⃣  检查平台 TRX 余额...');
    const platformTrxBalance = await tronWeb.trx.getBalance(platformAddress);
    const platformTrxBalanceTrx = platformTrxBalance / 1e6;
    console.log(`   平台 TRX 余额: ${platformTrxBalanceTrx.toFixed(2)} TRX`);

    if (platformTrxBalanceTrx < 30) {
      console.warn(`   ⚠️  TRX 余额较低，建议至少 30 TRX`);
    } else {
      console.log(`   ✅ TRX 余额充足`);
    }
    console.log('');

    // 4. 执行扣费（模拟）
    console.log('4️⃣  准备执行扣费...');
    console.log(`   从: ${userAddress}`);
    console.log(`   到: ${platformAddress}`);
    console.log(`   金额: ${amount} USDT`);
    console.log('');

    // 询问确认
    console.log('⚠️  这是真实的链上交易！');
    console.log('如果要继续，请修改脚本移除此检查。');
    console.log('');
    console.log('✅ 所有检查通过！可以执行扣费。');

    // 如果要真正执行，取消下面的注释：
    /*
    const amountSun = Math.floor(amount * 1e6);
    const tx = await usdtContract.transferFrom(
      userAddress,
      platformAddress,
      amountSun
    ).send({
      feeLimit: 100000000,
      callValue: 0,
      shouldPollResponse: true
    });

    console.log('');
    console.log('✅ 扣费成功！');
    console.log(`   交易哈希: ${tx}`);
    console.log(`   查看交易: https://tronscan.org/#/transaction/${tx}`);
    */

  } catch (error) {
    console.error('');
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

testTronDeduction();
