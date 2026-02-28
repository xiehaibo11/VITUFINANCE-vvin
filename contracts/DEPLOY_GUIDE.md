# 🚀 DepositRelay 合约部署完整指南

## ✅ 编译成功！

合约已成功编译，没有错误。现在可以开始部署。

---

## 📋 部署前准备清单

### 1. 准备部署钱包
- [ ] 准备一个BSC钱包地址（用于部署合约）
- [ ] 确保钱包有至少 0.01 BNB（用于支付gas费）
- [ ] 导出钱包私钥（⚠️ 注意安全，不要泄露）

### 2. 配置环境变量
```bash
cd /data/projects/vitufinance/contracts
cp .env.example .env
nano .env
```

填写以下信息：
```
DEPLOYER_PRIVATE_KEY=0x你的私钥（不要有空格）
PLATFORM_WALLET_ADDRESS=0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB
BSCSCAN_API_KEY=（可选，用于验证合约）
```

---

## 🧪 方案A：先部署到测试网（强烈推荐）

### 步骤1：获取测试网BNB
访问：https://testnet.binance.org/faucet-smart
输入你的钱包地址，获取免费测试BNB

### 步骤2：部署到测试网
```bash
cd /data/projects/vitufinance/contracts
npx hardhat run scripts/deploy.js --network bscTestnet
```

### 步骤3：测试合约
```bash
npx hardhat run scripts/test-contract.js --network bscTestnet
```

### 步骤4：验证功能正常后，再部署主网

---

## 🎯 方案B：直接部署到主网

### ⚠️ 警告
- 主网部署不可逆
- 确保代码已充分测试
- 确保配置正确无误

### 部署命令
```bash
cd /data/projects/vitufinance/contracts
npx hardhat run scripts/deploy.js --network bsc
```

### 预期输出
```
========================================
开始部署 DepositRelay 合约
========================================

部署者地址: 0x...
部署者余额: 0.05 BNB

平台收款地址: 0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB

正在部署合约...
交易已发送，等待确认...
交易哈希: 0x...

========================================
✅ 合约部署成功！
========================================
合约地址: 0x... （保存这个地址！）
部署区块: 12345678
Gas使用: 1500000

等待区块确认...
✅ 已确认 5 个区块

========================================
验证合约配置
========================================
合约所有者: 0x...
平台地址: 0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB
最低充值: 20.0 USDT
最高充值: 10000.0 USDT
是否暂停: false

✅ 部署信息已保存到 deployment.json
```

---

## 📝 部署后操作

### 1. 保存合约地址
合约地址会保存在 `deployment.json` 文件中，请妥善保管。

### 2. 验证合约（推荐）
```bash
npx hardhat verify --network bsc <合约地址> 0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB
```

### 3. 更新后端配置
编辑 `vitufinance/backend/.env`：
```bash
# 添加合约地址
DEPOSIT_RELAY_CONTRACT=0x你的合约地址
```

### 4. 测试合约功能
```bash
npx hardhat run scripts/test-contract.js --network bsc
```

---

## 🔍 验证部署成功

### 在BscScan查看
1. 访问：https://bscscan.com/address/你的合约地址
2. 检查合约代码
3. 查看合约余额（应该为0）
4. 查看合约创建交易

### 测试合约调用
```bash
# 读取合约配置
npx hardhat console --network bsc

# 在控制台中执行
const DepositRelay = await ethers.getContractFactory("DepositRelay");
const contract = DepositRelay.attach("你的合约地址");
await contract.platformWallet();  // 应该返回平台地址
await contract.minDepositAmount();  // 应该返回 20000000000000000000
```

---

## ⚠️ 常见问题

### Q1: 部署失败，提示 "insufficient funds"
A: 钱包BNB不足，请充值至少0.01 BNB

### Q2: 部署失败，提示 "nonce too low"
A: 等待几秒后重试，或清除Hardhat缓存：
```bash
rm -rf cache artifacts
npx hardhat compile
```

### Q3: 如何查看部署gas费用？
A: 查看 `deployment.json` 文件中的交易哈希，在BscScan查看详情

### Q4: 部署后发现配置错误怎么办？
A: 合约部署后不可修改，但可以：
- 调用 `updatePlatformWallet()` 更新平台地址（仅owner）
- 调用 `updateDepositLimits()` 更新限额（仅owner）
- 或重新部署新合约

---

## 📊 Gas费用估算

- 部署合约：约 1,500,000 gas ≈ 0.0045 BNB ≈ $2.7
- 每次充值：约 100,000 gas ≈ 0.0003 BNB ≈ $0.18

---

## 🎉 部署成功后的下一步

1. ✅ 合约已部署
2. ✅ 合约已验证
3. ✅ 后端配置已更新
4. ⏭️ 集成前端代码
5. ⏭️ 测试完整充值流程
6. ⏭️ 上线生产环境

---

**准备好了吗？执行部署命令吧！** 🚀

建议：先在测试网测试，确认无误后再部署主网。
