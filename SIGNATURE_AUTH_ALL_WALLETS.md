# 所有钱包启用签名认证

## 修改说明

将签名认证功能从"仅 TokenPocket"扩展到"所有钱包类型"。

## 修改内容

### 1. 移除 TokenPocket 限制

**修改文件**: `vitufinance/frontend/src/utils/signatureAuth.js`

移除了钱包类型检查，现在所有钱包都会触发签名认证：

```javascript
// 修改前
const walletType = detectWalletType()
if (walletType !== 'TokenPocket') {
  return { success: false, skipped: true, reason: 'not_tokenpocket' }
}

// 修改后
const walletType = detectWalletType()
console.log('[SignatureAuth] Detected wallet type:', walletType)

// 移除 TokenPocket 限制，支持所有钱包类型
```

### 2. 添加详细日志

为了方便调试，添加了详细的控制台日志：

- 钱包类型检测
- 签名认证状态检查
- 链验证过程
- 签名请求和响应
- 错误详情

### 3. 在 App.vue 中自动触发

**修改文件**: `vitufinance/frontend/src/App.vue`

在应用启动时，如果钱包已连接，自动触发签名认证：

```javascript
onMounted(async () => {
  // 初始化钱包连接
  const { initWallet } = await import('@/utils/wallet')
  await initWallet()
  
  // 如果钱包已连接，尝试进行签名认证
  if (walletStore.isConnected && walletStore.walletAddress) {
    const { ensureTokenPocketSignatureAuth } = await import('@/utils/signatureAuth')
    const result = await ensureTokenPocketSignatureAuth()
    if (result.success) {
      console.log('[App] ✅ Signature auth completed')
    }
  }
})
```

## 支持的钱包

现在以下所有钱包都会触发签名认证：

- ✅ TokenPocket
- ✅ MetaMask
- ✅ imToken
- ✅ Trust Wallet
- ✅ Coinbase Wallet
- ✅ OKX Wallet
- ✅ Bitget Wallet
- ✅ 其他支持 EIP-1193 的钱包

## 签名认证流程

1. **用户连接钱包** - 通过钱包内置浏览器或扩展访问网站
2. **检查缓存** - 如果已有有效的签名 token，跳过签名
3. **验证网络** - 确保在 BSC 主网（Chain ID: 0x38）
4. **获取挑战** - 从后端获取一次性 nonce
5. **请求签名** - 调用 `personal_sign` 方法
6. **验证签名** - 后端验证签名有效性
7. **保存 token** - 缓存 token（有效期 100 年）

## 用户体验

### 首次访问
1. 用户在钱包浏览器中打开网站
2. 自动连接钱包（如果之前已授权）
3. 弹出签名请求
4. 用户确认签名
5. 签名成功，可以正常使用网站

### 后续访问
1. 用户打开网站
2. 检测到有效的签名 token
3. 直接进入，无需再次签名

## 调试工具

在浏览器控制台中可以使用以下调试命令：

```javascript
// 查看当前签名认证状态
window.__debugSignatureAuth.checkCache()

// 清除签名认证缓存（需要刷新页面）
window.__debugSignatureAuth.clearCache()

// 显示帮助信息
window.__debugSignatureAuth.help()
```

## 部署步骤

### 1. 构建前端

```bash
cd /data/projects/vitufinance/frontend
npm run build
```

✅ 已完成（2026-02-28）

### 2. 部署到生产环境

```bash
# 备份当前版本
cp -r /data/wwwroot/bocail.com /data/wwwroot/bocail.com.backup.$(date +%Y%m%d_%H%M%S)

# 复制新构建的文件
cp -r /data/projects/vitufinance/frontend/dist/* /data/wwwroot/bocail.com/

# 验证文件
ls -la /data/wwwroot/bocail.com/
```

### 3. 测试

1. 使用不同钱包访问 https://bocail.com
2. 观察浏览器控制台日志
3. 确认签名请求弹出
4. 完成签名后检查功能是否正常

## 测试用例

### 测试钱包地址
- `0x9736faa8c806adca8523656922baac016af42ae9` - 之前未触发签名的地址

### 预期行为

**MetaMask**:
1. 打开网站
2. 自动连接钱包
3. 弹出签名请求
4. 用户确认后完成认证

**imToken**:
1. 在 imToken 浏览器中打开网站
2. 自动连接钱包
3. 弹出签名请求
4. 用户确认后完成认证

**TokenPocket**:
1. 在 TP 浏览器中打开网站
2. 自动连接钱包
3. 弹出签名请求（可能需要输入钱包密码）
4. 用户确认后完成认证

## 控制台日志示例

成功的签名认证日志：

```
[App] Wallet initialized
[App] Wallet connected, checking signature auth...
[SignatureAuth] Detected wallet type: MetaMask
[SignatureAuth] Checking signature auth for wallet: 0x9736...2ae9
[SignatureAuth] No valid token, requesting signature...
[SignatureAuth] Chain verified: 0x38
[SignatureAuth] Challenge received, requesting personal_sign...
[SignatureAuth] Signature received
[SignatureAuth] Verifying signature...
[SignatureAuth] ✅ Signature auth successful!
[App] ✅ Signature auth completed
```

## 常见问题

### Q: 用户拒绝签名怎么办？
A: 系统会记录错误，用户可以刷新页面重试。不会影响其他功能。

### Q: 签名 token 什么时候过期？
A: 默认有效期为 100 年，基本上是"永久"有效，避免用户频繁签名。

### Q: 如何强制用户重新签名？
A: 使用调试工具清除缓存：`window.__debugSignatureAuth.clearCache()`

### Q: TRON 钱包支持吗？
A: 目前签名认证只支持 EVM 兼容钱包（ETH/BSC）。TRON 钱包使用不同的签名机制。

## 安全说明

1. **签名不会转移资产** - 签名仅用于验证钱包所有权
2. **一次性 nonce** - 每次签名使用唯一的 challenge，防止重放攻击
3. **服务端验证** - 后端验证签名的有效性
4. **token 缓存** - 避免频繁弹出签名请求，提升用户体验

## 相关文件

- `vitufinance/frontend/src/utils/signatureAuth.js` - 签名认证核心逻辑
- `vitufinance/frontend/src/App.vue` - 应用入口，触发签名认证
- `vitufinance/backend/src/routes/authRoutes.js` - 后端签名验证 API

---

修改日期：2026-02-28
修改人员：Kiro AI Assistant
状态：✅ 已构建，等待部署
