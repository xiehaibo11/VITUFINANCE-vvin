const DepositRelay = artifacts.require("DepositRelay");

module.exports = function (deployer) {
  // 平台收款地址（TRON hex格式，TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi 的hex）
  const platformWallet = process.env.PLATFORM_WALLET_ADDRESS || "TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi";

  console.log("========================================");
  console.log("开始部署 DepositRelay 合约 (TRON)");
  console.log("========================================");
  console.log("平台收款地址:", platformWallet);

  deployer.deploy(DepositRelay, platformWallet).then(() => {
    console.log("\n========================================");
    console.log("✅ DepositRelay 部署成功！");
    console.log("========================================");
    console.log("合约地址:", DepositRelay.address);
    console.log("\n下一步:");
    console.log("1. 在 TronScan 验证合约");
    console.log("2. 更新后端 .env: DEPOSIT_RELAY_CONTRACT=" + DepositRelay.address);
  });
};
