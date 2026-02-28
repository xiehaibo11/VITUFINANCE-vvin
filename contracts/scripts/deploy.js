const hre = require("hardhat");

async function main() {
  console.log("========================================");
  console.log("开始部署 DepositRelay 合约");
  console.log("========================================\n");

  // 获取部署者账户
  const [deployer] = await hre.ethers.getSigners();
  console.log("部署者地址:", deployer.address);
  
  // 检查余额
  const balance = await deployer.getBalance();
  console.log("部署者余额:", hre.ethers.utils.formatEther(balance), "BNB\n");
  
  if (balance.lt(hre.ethers.utils.parseEther("0.01"))) {
    console.error("❌ 错误: 余额不足，至少需要 0.01 BNB");
    process.exit(1);
  }

  // 平台收款地址
  const platformWallet = process.env.PLATFORM_WALLET_ADDRESS || "0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB";
  console.log("平台收款地址:", platformWallet);
  
  // 验证地址格式
  if (!hre.ethers.utils.isAddress(platformWallet)) {
    console.error("❌ 错误: 平台地址格式无效");
    process.exit(1);
  }

  console.log("\n正在部署合约...");
  
  // 获取合约工厂
  const DepositRelay = await hre.ethers.getContractFactory("DepositRelay");
  
  // 部署合约
  const depositRelay = await DepositRelay.deploy(platformWallet);
  
  console.log("交易已发送，等待确认...");
  console.log("交易哈希:", depositRelay.deployTransaction.hash);
  
  // 等待部署完成
  await depositRelay.deployed();
  
  console.log("\n========================================");
  console.log("✅ 合约部署成功！");
  console.log("========================================");
  console.log("合约地址:", depositRelay.address);
  console.log("部署区块:", depositRelay.deployTransaction.blockNumber);
  console.log("Gas使用:", depositRelay.deployTransaction.gasLimit.toString());
  
  // 等待5个区块确认
  console.log("\n等待区块确认...");
  await depositRelay.deployTransaction.wait(5);
  console.log("✅ 已确认 5 个区块\n");
  
  // 验证合约配置
  console.log("========================================");
  console.log("验证合约配置");
  console.log("========================================");
  
  const owner = await depositRelay.owner();
  const platform = await depositRelay.platformWallet();
  const minAmount = await depositRelay.minDepositAmount();
  const maxAmount = await depositRelay.maxDepositAmount();
  const paused = await depositRelay.paused();
  
  console.log("合约所有者:", owner);
  console.log("平台地址:", platform);
  console.log("最低充值:", hre.ethers.utils.formatUnits(minAmount, 18), "USDT");
  console.log("最高充值:", hre.ethers.utils.formatUnits(maxAmount, 18), "USDT");
  console.log("是否暂停:", paused);
  
  // 保存部署信息
  const fs = require('fs');
  const deploymentInfo = {
    network: hre.network.name,
    contractAddress: depositRelay.address,
    deployer: deployer.address,
    platformWallet: platform,
    txHash: depositRelay.deployTransaction.hash,
    blockNumber: depositRelay.deployTransaction.blockNumber,
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync(
    'deployment.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log("\n✅ 部署信息已保存到 deployment.json");
  
  console.log("\n========================================");
  console.log("下一步操作");
  console.log("========================================");
  console.log("1. 在 BscScan 验证合约:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${depositRelay.address} ${platformWallet}`);
  console.log("\n2. 更新后端 .env 文件:");
  console.log(`   DEPOSIT_RELAY_CONTRACT=${depositRelay.address}`);
  console.log("\n3. 测试合约功能:");
  console.log("   npx hardhat run scripts/test-contract.js --network", hre.network.name);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 部署失败:");
    console.error(error);
    process.exit(1);
  });
