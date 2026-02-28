# imToken TRON 连接问题修复

## 问题描述

用户在 imToken 钱包内置浏览器中访问网站时，选择 TRON 链充值会显示错误：
```
在该链下找不到此钱包
```

TokenPocket 可以正常连接，但 imToken 无法连接。

## 根本原因

imToken 的 `window.tronWeb` 注入比 TokenPocket 慢，需要更长的等待时间。原代码在检测钱包时没有等待 `tronWeb` 注入完成，导致：

1. 第一次访问时，`tronWeb` 还未注入，检测失败
2. 刷新后可能成功（因为缓存加速了注入）
3. 用户体验不一致

## 解决方案

### 1. 优化钱包检测逻辑

**修改文件**: `vitufinance/frontend/src/utils/wallet.js`

- 优先通过 User Agent 检测钱包类型（不需要等待注入）
- 在 `isDAppBrowser()` 中检查 UA，即使 provider 未注入也返回 true
- 在 `detectWalletType()` 中优先使用 UA 检测

### 2. 增加 tronWeb 等待机制

**修改文件**: `vitufinance/frontend/src/utils/tronWallet.js`

- 将 `waitForTronWeb` 超时时间从 3 秒增加到 5 秒
- 检查间隔从 100ms 缩短到 50ms（更频繁检测）
- 检查条件改为 `window.tronWeb.defaultAddress.base58` 存在

### 3. 在连接和初始化时主动等待

**修改文件**: `vitufinance/frontend/src/utils/wallet.js`

在 `connectWallet()` 和 `initWallet()` 函数中：
- 检测到 TRON 钱包浏览器（通过 UA）时，主动等待 `tronWeb` 注入
- 最多等待 5 秒，每 100ms 检查一次
- 注入成功后再执行连接逻辑

## 修改的文件

1. `vitufinance/frontend/src/utils/wallet.js`
   - `isDAppBrowser()` - 优先检查 UA
   - `detectWalletType()` - 优先使用 UA 检测
   - `connectWallet()` - 添加 tronWeb 等待逻辑
   - `initWallet()` - 添加 tronWeb 等待逻辑

2. `vitufinance/frontend/src/utils/tronWallet.js`
   - `isTronDAppBrowser()` - 优先检查 UA
   - `waitForTronWeb()` - 增加超时时间，优化检测条件

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

1. 在 imToken 钱包中打开 https://bocail.com
2. 点击充值按钮
3. 选择 TRON 链
4. 应该能够正常连接，不再显示"在该链下找不到此钱包"

## 技术细节

### User Agent 检测

```javascript
const ua = navigator.userAgent.toLowerCase()
const isTronWalletBrowser = ua.includes('imtoken') || 
                            ua.includes('tokenpocket') || 
                            ua.includes('tronlink')
```

### tronWeb 等待逻辑

```javascript
const waitForTronWeb = async (timeout = 5000) => {
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    if (window.tronWeb) {
      console.log('[Wallet] tronWeb ready after', Date.now() - startTime, 'ms')
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return false
}
```

## 预期效果

- imToken TRON 用户可以正常连接钱包
- 连接速度提升（不需要多次刷新）
- 用户体验一致（与 TokenPocket 相同）
- 控制台会显示详细的连接日志

## 回滚方案

如果出现问题，可以快速回滚：

```bash
# 恢复备份
rm -rf /data/wwwroot/bocail.com/*
cp -r /data/wwwroot/bocail.com.backup.YYYYMMDD_HHMMSS/* /data/wwwroot/bocail.com/
```

## 相关文档

- [TRON 集成总结](./TRON_INTEGRATION_SUMMARY.md)
- [TRON 测试指南](./TRON_TESTING_GUIDE.md)
- [TRON 部署指南](./TRON_DEPLOYMENT_CHECKLIST.md)

---

修复日期：2026-02-28
修复人员：Kiro AI Assistant
