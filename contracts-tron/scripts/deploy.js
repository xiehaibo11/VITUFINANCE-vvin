require('dotenv').config();
const { TronWeb } = require('tronweb');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("========================================");
  console.log("开始部署 DepositRelay 合约 (TRON主网)");
  console.log("========================================\n");

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error("❌ 错误: 未设置 DEPLOYER_PRIVATE_KEY");
    process.exit(1);
  }

  const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    privateKey: privateKey
  });

  const deployerAddress = tronWeb.address.fromPrivateKey(privateKey);
  console.log("部署者地址:", deployerAddress);

  // 检查余额
  const balance = await tronWeb.trx.getBalance(deployerAddress);
  console.log("TRX余额:", balance / 1e6, "TRX\n");

  if (balance < 50 * 1e6) {
    console.error("❌ 错误: TRX余额不足，至少需要 50 TRX");
    console.error("   当前余额:", balance / 1e6, "TRX");
    console.error("   请先充值TRX到:", deployerAddress);
    process.exit(1);
  }

  // 平台收款地址
  const platformWallet = process.env.PLATFORM_WALLET_ADDRESS || "TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi";
  console.log("平台收款地址:", platformWallet);

  // 读取编译产物
  const artifactPath = path.join(__dirname, '../build/contracts/DepositRelay.json');
  if (!fs.existsSync(artifactPath)) {
    console.error("❌ 错误: 找不到编译产物，请先运行 npx tronbox compile");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const abi = artifact.abi;
  const bytecode = artifact.bytecode;

  console.log("\n正在部署合约...");

  // 将 base58 地址转为 hex（合约构造函数参数）
  const platformWalletHex = tronWeb.address.toHex(platformWallet);
  console.log("平台地址 (hex):", platformWalletHex);

  try {
    // 部署合约
    const tx = await tronWeb.transactionBuilder.createSmartContract({
      abi: abi,
      bytecode: bytecode,
      feeLimit: 1000 * 1e6, // 1000 TRX fee limit
      callValue: 0,
      parameters: [platformWalletHex],
      name: 'DepositRelay',
      userFeePercentage: 100,
      originEnergyLimit: 10000000
    }, deployerAddress);

    // 签名交易
    const signedTx = await tronWeb.trx.sign(tx, privateKey);
    console.log("交易已签名");

    // 广播交易
    const result = await tronWeb.trx.sendRawTransaction(signedTx);
    console.log("交易已广播");

    if (result.result) {
      const txHash = result.txid;
      console.log("交易哈希:", txHash);

      // 等待确认
      console.log("\n等待交易确认（约30秒）...");
      await new Promise(resolve => setTimeout(resolve, 30000));

      // 获取合约地址
      const txInfo = await tronWeb.trx.getTransactionInfo(txHash);
      let contractAddress = '';

      if (txInfo && txInfo.contract_address) {
        contractAddress = tronWeb.address.fromHex(txInfo.contract_address);
      }

      console.log("\n========================================");
      console.log("✅ 合约部署成功！");
      console.log("========================================");
      console.log("合约地址 (Base58):", contractAddress);
      console.log("合约地址 (Hex):", txInfo.contract_address || 'pending...');
      console.log("交易哈希:", txHash);

      // 保存部署信息
      const deploymentInfo = {
        network: 'tron-mainnet',
        contractAddress: contractAddress,
        contractAddressHex: txInfo.contract_address || '',
        deployer: deployerAddress,
        platformWallet: platformWallet,
        txHash: txHash,
        timestamp: new Date().toISOString()
      };

      fs.writeFileSync(
        path.join(__dirname, '../deployment.json'),
        JSON.stringify(deploymentInfo, null, 2)
      );

      console.log("\n✅ 部署信息已保存到 deployment.json");
      console.log("\n========================================");
      console.log("下一步操作");
      console.log("========================================");
      console.log("1. 在 TronScan 查看合约: https://tronscan.org/#/contract/" + contractAddress);
      console.log("2. 更新后端 .env:");
      console.log("   DEPOSIT_RELAY_CONTRACT=" + contractAddress);
      console.log("3. 测试合约:");
      console.log("   node scripts/test-contract.js");
    } else {
      console.error("❌ 交易广播失败:", JSON.stringify(result));
    }
  } catch (error) {
    console.error("\n❌ 部署失败:", error.message || error);
  }
}

main().catch(console.error);
