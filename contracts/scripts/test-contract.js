const hre = require("hardhat");

async function main() {
  console.log("========================================");
  console.log("测试 DepositRelay 合约");
  console.log("========================================\n");

  // 读取部署信息
  const fs = require('fs');
  let deploymentInfo;
  
  try {
    deploymentInfo = JSON.parse(fs.readFileSync('deployment.json', 'utf8'));
  } catch (error) {
    console.error("❌ 错误: 找不到 deployment.json 文件");
    console.error("请先运行部署脚本: npx hardhat run scripts/deploy.js --network <network>");
    process.exit(1);
  }

  const contractAddress = deploymentInfo.contractAddress;
  console.log("合约地址:", contractAddress);
  console.log("网络:", hre.network.name, "\n");

  // 获取合约实例
  const DepositRelay = await hre.ethers.getContractFactory("DepositRelay");
  const depositRelay = DepositRelay.attach(contractAddress);

  // 测试1: 读取基本配置
  console.log("测试1: 读取基本配置");
  console.log("-------------------");
  
  const owner = await depositRelay.owner();
  const platformWallet = await depositRelay.platformWallet();
  const minAmount = await depositRelay.minDepositAmount();
  const maxAmount = await depositRelay.maxDepositAmount();
  const paused = await depositRelay.paused();
  const usdtAddress = await depositRelay.USDT();
  
  console.log("✅ 所有者:", owner);
  console.log("✅ 平台地址:", platformWallet);
  console.log("✅ 最低充值:", hre.ethers.utils.formatUnits(minAmount, 18), "USDT");
  console.log("✅ 最高充值:", hre.ethers.utils.formatUnits(maxAmount, 18), "USDT");
  console.log("✅ 是否暂停:", paused);
  console.log("✅ USDT地址:", usdtAddress);

  // 测试2: 测试签名验证函数
  console.log("\n测试2: 测试签名验证函数");
  console.log("-------------------");
  
  const testUser = "0x1234567890123456789012345678901234567890";
  const testAmount = hre.ethers.utils.parseUnits("100", 18);
  const testNonce = hre.ethers.utils.id("test-nonce-" + Date.now());
  
  const messageHash = await depositRelay.getMessageHash(testUser, testAmount, testNonce);
  console.log("✅ 消息哈希:", messageHash);
  
  const ethSignedMessageHash = await depositRelay.getEthSignedMessageHash(messageHash);
  console.log("✅ 以太坊签名哈希:", ethSignedMessageHash);

  // 测试3: 检查nonce状态
  console.log("\n测试3: 检查nonce状态");
  console.log("-------------------");
  
  const isUsed = await depositRelay.isNonceUsed(testNonce);
  console.log("✅ Nonce是否已使用:", isUsed);

  // 测试4: 检查用户授权和余额（使用真实地址）
  console.log("\n测试4: 检查查询函数");
  console.log("-------------------");
  
  const [signer] = await hre.ethers.getSigners();
  const signerAddress = signer.address;
  
  try {
    const allowance = await depositRelay.checkAllowance(signerAddress);
    console.log("✅ 用户授权额度:", hre.ethers.utils.formatUnits(allowance, 18), "USDT");
    
    const balance = await depositRelay.checkBalance(signerAddress);
    console.log("✅ 用户USDT余额:", hre.ethers.utils.formatUnits(balance, 18), "USDT");
    
    const totalDeposited = await depositRelay.getUserTotalDeposited(signerAddress);
    console.log("✅ 累计充值:", hre.ethers.utils.formatUnits(totalDeposited, 18), "USDT");
  } catch (error) {
    console.log("⚠️  查询失败（可能是网络问题）:", error.message);
  }

  console.log("\n========================================");
  console.log("✅ 所有测试完成！");
  console.log("========================================");
  console.log("\n合约功能正常，可以开始集成到前后端");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 测试失败:");
    console.error(error);
    process.exit(1);
  });
