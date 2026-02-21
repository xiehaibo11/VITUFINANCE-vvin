# 收款地址更新记录

**日期**: 2026-02-22
**操作**: 更新平台收款地址
**状态**: ✅ 已完成并生效

---

## 📍 新收款地址

| 网络 | 新收款地址 | 用途 |
|------|-----------|------|
| **BSC** (BNB Chain) | `0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB` | 实际收款 |
| **ETH** (Ethereum) | `0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB` | 实际收款 |

---

## 📝 修改文件清单

### 1. 环境变量配置
**文件**: `backend/.env`
```bash
# 修改前
PLATFORM_WALLET_ADDRESS=0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4

# 修改后
PLATFORM_WALLET_ADDRESS=0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB
PLATFORM_WALLET_ETH=0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB
```

### 2. BSC 充值监控
**文件**: `backend/src/cron/depositMonitorCron.js`
**行号**: 32

```javascript
// 修改前
const PLATFORM_WALLET = (process.env.PLATFORM_WALLET_ADDRESS || '0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4').toLowerCase();

// 修改后
const PLATFORM_WALLET = (process.env.PLATFORM_WALLET_ADDRESS || '0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB').toLowerCase();
```

### 3. BSC 充值监控（备份版）
**文件**: `backend/src/cron/depositMonitorCron_FIXED.js`
**行号**: 29

```javascript
// 修改前
const PLATFORM_WALLET = (process.env.PLATFORM_WALLET_ADDRESS || '0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4').toLowerCase();

// 修改后
const PLATFORM_WALLET = (process.env.PLATFORM_WALLET_ADDRESS || '0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB').toLowerCase();
```

### 4. ETH 充值监控
**文件**: `backend/src/cron/ethDepositMonitorCron.js`
**行号**: 136-145

```javascript
// 修改前
async function loadPlatformWallet() {
  try {
    // Try ETH-specific wallet first
    let result = await dbQuery(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'platform_wallet_eth'`
    );

    if (result && result.length > 0 && result[0].setting_value) {
      return result[0].setting_value.toLowerCase();
    }

    // Fallback to legacy wallet address
    result = await dbQuery(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'platform_wallet_address'`
    );

    if (result && result.length > 0 && result[0].setting_value) {
      return result[0].setting_value.toLowerCase();
    }
  } catch (error) {
    console.error('[ETH-DepositMonitor] Failed to load platform wallet:', error.message);
  }

  // Final fallback to env var or default
  return (process.env.PLATFORM_WALLET_ETH || '0x8a92c73FdE5d0313303989eB269d6d17ffb1ba9d').toLowerCase();
}

// 修改后
async function loadPlatformWallet() {
  // 直接返回实际收款地址（不从数据库读取）
  return (process.env.PLATFORM_WALLET_ETH || '0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB').toLowerCase();
}
```

**修改说明**: ETH 充值监控现在直接使用新地址，不再从数据库读取。

---

## ⚙️ 部署步骤

1. ✅ 修改环境变量 `.env`
2. ✅ 修改充值监控代码
3. ✅ 重启后端服务: `pm2 restart vitu-backend --update-env`
4. ✅ 验证新地址生效

---

## ✅ 验证结果

### 服务状态
```bash
pm2 status
# vitu-backend: online ✅
```

### 收款地址确认
```bash
pm2 logs vitu-backend --lines 100 | grep "平台钱包\|Platform wallet"
```

**输出**:
```
[DepositMonitor] 💰 平台钱包: 0x537bd2d898a64b0214ffefd8910e77fa89c6b2bb ✅
[ETH-DepositMonitor] 💰 Platform wallet: 0x8ddb1c49d4bda95c9597960b120c2d6d5dca23fb ✅
```

---

## 📌 重要说明

### 为什么数据库配置没有修改？

**数据库** (`system_settings` 表) 中的地址**未修改**，仍然是旧地址：
- BSC: `0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4`
- ETH: `0x8a92c73FdE5d0313303989eB269d6d17ffb1ba9d`

**原因**:
- 管理后台显示使用数据库配置
- 用户要求"管理系统显示以前的地址"
- 实际收款使用代码层面的新地址

**结果**:
- ✅ 充值监控使用**新地址**接收资金
- ℹ️ 管理后台显示**旧地址**（不影响功能）
- ✅ 两者独立，互不冲突

### 如果需要更新管理后台显示地址

如果以后需要管理后台也显示新地址，执行：

```sql
-- 更新 BSC 收款地址
UPDATE system_settings
SET setting_value = '0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB'
WHERE setting_key = 'platform_wallet_address';

-- 更新或插入 ETH 收款地址
INSERT INTO system_settings (setting_key, setting_value, type, description)
VALUES ('platform_wallet_eth', '0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB', 'text', 'ETH收款地址')
ON DUPLICATE KEY UPDATE setting_value = '0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB';
```

---

## 🎯 测试建议

### 测试 BSC 充值
1. 向 `0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB` 转账 USDT (BSC)
2. 等待 1-2 分钟（充值监控每 60 秒扫描一次）
3. 检查用户余额是否自动到账

### 测试 ETH 充值
1. 向 `0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB` 转账 USDT (ETH)
2. 等待 2-3 分钟（充值监控每 120 秒扫描一次）
3. 检查用户余额是否自动到账

### 注意事项
- 最低充值金额: **20 USDT**
- 低于 20 USDT 的充值会被标记为 `failed` 状态
- 充值会自动到账，无需管理员确认

---

## 🔄 回滚方案

如果需要回滚到旧地址，执行：

```bash
# 1. 修改 .env
sed -i 's/PLATFORM_WALLET_ADDRESS=.*/PLATFORM_WALLET_ADDRESS=0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4/' /www/wwwroot/vitufinance.com/backend/.env
sed -i '/PLATFORM_WALLET_ETH=/d' /www/wwwroot/vitufinance.com/backend/.env

# 2. 恢复代码修改（使用 git）
cd /www/wwwroot/vitufinance.com/backend
git checkout src/cron/depositMonitorCron.js
git checkout src/cron/depositMonitorCron_FIXED.js
git checkout src/cron/ethDepositMonitorCron.js

# 3. 重启服务
pm2 restart vitu-backend --update-env
```

---

## 📊 影响范围

### 影响的功能
- ✅ BSC 充值监控
- ✅ ETH 充值监控
- ✅ 用户充值到账

### 不影响的功能
- ✅ 机器人购买
- ✅ 机器人运行
- ✅ 推荐奖励
- ✅ 团队分红
- ✅ 提现功能
- ✅ 管理后台其他功能

---

**更新完成** ✅
