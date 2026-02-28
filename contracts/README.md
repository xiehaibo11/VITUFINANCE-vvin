# DepositRelay 合约部署指南

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
复制 `.env.example` 到 `.env` 并填写：
```bash
cp .env.example .env
```

编辑 `.env`：
```
DEPLOYER_PRIVATE_KEY=0x你的私钥
PLATFORM_WALLET_ADDRESS=0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB
BSCSCAN_API_KEY=你的API密钥
```

### 3. 编译合约
```bash
npx hardhat compile
```

### 4. 部署到测试网（推荐先测试）
```bash
npx hardhat run scripts/deploy.js --network bscTestnet
```

### 5. 测试合约
```bash
npx hardhat run scripts/test-contract.js --network bscTestnet
```

### 6. 部署到主网
```bash
npx hardhat run scripts/deploy.js --network bsc
```

### 7. 验证合约
```bash
npx hardhat verify --network bsc <合约地址> <平台地址>
```

## 注意事项

1. **私钥安全**: 永远不要提交 `.env` 文件到Git
2. **测试优先**: 先在测试网充分测试再部署主网
3. **Gas费用**: 确保部署账户有足够的BNB
4. **备份信息**: 保存好 `deployment.json` 文件

## 获取测试网BNB

访问: https://testnet.binance.org/faucet-smart
