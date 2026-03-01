# imToken TRON 网络支持修复

## 问题描述

用户使用 imToken 在 TRON 网络下访问网站时，出现错误提示：
```
该DAPP不支持当前的钱包网络，请切换钱包后继续访问
```

## 问题原因

当用户在 imToken 的 TRON 网络下访问网站时：
1. `window.ethereum` 对象不存在（因为不是 EVM 链）
2. `window.tronWeb` 对象可能还未注入（需要等待）
3. 原有代码检测到是 TRON 钱包浏览器，但如果 `tronWeb` 未就绪，会继续执行 EVM 连接逻辑
4. EVM 连接逻辑尝试访问 `window.ethereum`，导致错误

## 解决方案

### 1. 优化 `isDAppBrowser()` 函数

在 `wallet.js` 中，增强了 DApp 浏览器检测：
- 优先通过 User Agent 检测（imToken、TokenPocket、TronLink 等）
- 即使 `window.tronWeb` 未注入，也能正确识别为 DApp 浏览器
- 添加日志输出，便于调试

```javascript
export const isDAppBrowser = () => {
  if (typeof window === 'undefined') {
    return false
  }
  
  // 优先检查 User Agent（更快，不需要等待注入）
  // TRON 钱包浏览器即使没有注入 tronWeb 也应该被识别
  const ua = navigator.userAgent.toLowerCase()
  const isMobileWallet = ua.includes('tokenpocket') || 
                        ua.includes('imtoken') || 
                        ua.includes('trust') ||
                        ua.includes('metamask') ||
                        ua.includes('tronlink')
  
  if (isMobileWallet) {
    console.log('[Wallet] Detected mobile wallet via UA')
    return true
  }
  
  // 检测是否存在 ethereum 对象（EIP-1193 标准）或 tronWeb 对象
  if (window.ethereum || window.tronWeb) {
    console.log('[Wallet] Detected wallet provider object')
    return true
  }
  
  return false
}
```

### 2. 修复 `connectWallet()` 函数

在连接钱包时，增加了 `window.ethereum` 存在性检查：

```javascript
// 如果是 TRON 钱包浏览器或已有 tronWeb，优先使用 TRON 连接
if (isTronWalletBrowser || window.tronWeb) {
  console.log('[Wallet] Detected TRON wallet browser, initializing...')
  
  const { connectTronWallet } = await import('@/utils/tronWallet')
  const result = await connectTronWallet()
  
  // ... 处理连接结果
}

// ETH/BSC 钱包连接逻辑
if (!window.ethereum) {
  const errorMsg = 'Ethereum provider not found. Please use a wallet browser or switch to ETH/BSC network.'
  walletStore.setError(errorMsg)
  return {
    success: false,
    error: errorMsg
  }
}
```

关键改进：
1. 在尝试使用 EVM 连接前，先检查 `window.ethereum` 是否存在
2. 如果不存在，返回友好的错误提示，而不是继续执行导致崩溃
3. TRON 钱包浏览器优先使用 TRON 连接逻辑

### 3. TRON 钱包连接流程

`tronWallet.js` 中已有完善的 TRON 连接逻辑：
- `waitForTronWeb()` 函数等待 `tronWeb` 注入（最多 5 秒）
- 支持 TronLink、TokenPocket、imToken 等钱包
- 自动检测钱包类型并设置正确的链标识

## 测试场景

### ✅ 场景 1：imToken TRON 网络
- 用户在 imToken 切换到 TRON 网络
- 访问网站，自动识别为 TRON 钱包
- 等待 `tronWeb` 注入后连接
- 自动授权 USDT 给平台地址

### ✅ 场景 2：imToken ETH/BSC 网络
- 用户在 imToken 切换到 ETH 或 BSC 网络
- 访问网站，识别为 EVM 钱包
- 使用 `window.ethereum` 连接
- 自动授权 USDT 给平台地址

### ✅ 场景 3：TokenPocket TRON 网络
- 用户在 TokenPocket 切换到 TRON 网络
- 访问网站，自动识别为 TRON 钱包
- 连接并自动授权

### ✅ 场景 4：TronLink
- 用户使用 TronLink 浏览器
- 访问网站，自动识别为 TronLink
- 连接并自动授权

## 部署信息

- **部署时间**: 2026-03-01 07:31:43
- **部署脚本**: `DEPLOY_BOCAIL.sh`
- **访问地址**: https://bocail.com
- **管理后台**: https://bocail.com/admin

## 修改文件

- `vitufinance/frontend/src/utils/wallet.js`
  - 优化 `isDAppBrowser()` 函数
  - 修复 `connectWallet()` 函数，增加 `window.ethereum` 检查

## 相关文档

- [TRON 钱包连接逻辑](./frontend/src/utils/tronWallet.js)
- [自动授权功能](./frontend/src/utils/autoApprove.js)
- [钱包扣费功能说明](./钱包扣费功能说明.md)
- [imToken 使用教程](./imToken使用教程.md)

## 注意事项

1. imToken 在 TRON 网络下不会注入 `window.ethereum` 对象
2. 需要等待 `window.tronWeb` 对象注入（通常 1-3 秒）
3. 如果 5 秒后仍未注入，会提示用户刷新页面
4. 自动授权功能在连接成功后 1 秒执行，不阻塞连接流程

## 后续优化建议

1. 添加网络切换提示，引导用户在正确的网络下操作
2. 优化 `tronWeb` 注入等待时间，提升用户体验
3. 添加更详细的错误提示，帮助用户排查问题
4. 考虑支持多链切换功能，让用户可以在网站内切换网络
