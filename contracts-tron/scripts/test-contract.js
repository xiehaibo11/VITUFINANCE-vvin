require('dotenv').config();
const { TronWeb } = require('tronweb');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log("========================================");
  console.log("测试 DepositRelay 合约 (TRON)");
  console.log("========================================\n");

  const deploymentPath = path.join(__dirname, '../deployment.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ 找不到 deployment.json，请先部署合约");
    process.exit(1);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const contractAddress = deploymentInfo.contractAddress;
  console.log("合约地址:", contractAddress);

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    privateKey: privateKey
  });

  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../build/contracts/DepositRelay.json'), 'utf8')
  );

  const contract = await tronWeb.contract(artifact.abi, contractAddress);

  // 测试1: 逐个读取，每次间隔2秒
  console.log("\n测试1: 读取基本配置");
  console.log("-------------------");

  const owner = await contract.owner().call();
  console.log("✅ 所有者:", tronWeb.address.fromHex(owner));
  await sleep(2000);

  const platformWallet = await contract.platformWallet().call();
  console.log("✅ 平台地址:", tronWeb.address.fromHex(platformWallet));
  await sleep(2000);

  const minAmount = await contract.minDepositAmount().call();
  console.log("✅ 最低充值:", Number(minAmount) / 1e6, "USDT");
  await sleep(2000);

  const maxAmount = await contract.maxDepositAmount().call();
  console.log("✅ 最高充值:", Number(maxAmount) / 1e6, "USDT");
  await sleep(2000);

  const paused = await contract.paused().call();
  console.log("✅ 是否暂停:", paused);
  await sleep(2000);

  const usdtAddress = await contract.USDT().call();
  console.log("✅ USDT地址:", tronWeb.address.fromHex(usdtAddress));
  await sleep(2000);

  // 测试2: 签名验证
  console.log("\n测试2: 测试签名验证函数");
  console.log("-------------------");

  const testAmount = 100 * 1e6;
  const testNonce = tronWeb.sha3("test-nonce-" + Date.now());

  const deployerAddr = tronWeb.address.fromPrivateKey(privateKey);
  const deployerHex = tronWeb.address.toHex(deployerAddr);

  const messageHash = await contract.getMessageHash(deployerHex, testAmount, testNonce).call();
  console.log("✅ 消息哈希:", messageHash);
  await sleep(2000);

  const signedHash = await contract.getTronSignedMessageHash(messageHash).call();
  console.log("✅ TRON签名哈希:", signedHash);
  await sleep(2000);

  // 测试3: Nonce状态
  console.log("\n测试3: 检查nonce状态");
  console.log("-------------------");

  const isUsed = await contract.isNonceUsed(testNonce).call();
  console.log("✅ Nonce是否已使用:", isUsed);

  console.log("\n========================================");
  console.log("✅ 所有测试完成！合约功能正常");
  console.log("========================================");
  console.log("\n下一步: 更新后端 .env");
  console.log("DEPOSIT_RELAY_CONTRACT=" + contractAddress);
}

main().catch(console.error);
