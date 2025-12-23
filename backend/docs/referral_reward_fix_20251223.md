# 推荐奖励制度修复记录

**修复日期**: 2025-12-23
**修复人员**: Claude Code
**问题描述**: 推荐奖励计算错误，金额过高且触发时机不正确

---

## 问题现象

截图显示的错误奖励：
| 机器人价格 | 错误奖励 | 正确奖励 |
|-----------|---------|---------|
| 20 USDT (1级) | +1.6 USDT | +0.12 USDT |
| 100 USDT (1级) | +8.0 USDT | +0.6 USDT |
| 300 USDT (1级) | +24.0 USDT | +1.8 USDT |
| 20 USDT (2级) | +0.8 USDT | +0.04 USDT |

**根本原因**：
1. 奖励基于**购买金额**计算，应该基于**量化收益**计算
2. 奖励在**购买时**发放，应该在**量化收益产生时**发放
3. 比例被错误修改为 8%/4%/2%/0.5%，正确应为 30%/10%/5%/1%

---

## 正确的奖励制度

### 1. CEX/Grid 机器人（每次量化时发放）

| 级别 | 比例 | 说明 |
|------|------|------|
| 1级 | 30% | 直接邀请的好友 |
| 2级 | 10% | 好友邀请的人 |
| 3级 | 5% | 间接下线 |
| 4-8级 | 1%（每级）| 深度裂变收益 |

**计算基础**: 量化收益（profit），不是购买金额
**发放时机**: 每次量化产生收益时

### 2. High 高频机器人（到期后发放）

| 级别 | 比例 | 说明 |
|------|------|------|
| 1-8级 | 同上 | 30%/10%/5%/1%×5 |

**计算基础**: 到期收益
**发放时机**: 机器人到期后
**注意**: 没有启动资金返点

### 3. DEX 机器人（两种奖励）

#### a) 启动资金返点（购买时立即发放）
| 级别 | 比例 |
|------|------|
| 1级 | 5% |
| 2级 | 3% |
| 3级 | 2% |

#### b) 收益推荐奖励（到期后发放）
| 级别 | 比例 |
|------|------|
| 1-8级 | 30%/10%/5%/1%×5 |

---

## 修改的文件

### 1. `backend/src/utils/referralMath.js`

**修改内容**：
```javascript
// 修改前（错误）
const CEX_REFERRAL_RATES = [0.08, 0.04, 0.02, 0.005, 0.005, 0.005, 0.005, 0.005]; // 16.5%
const DEX_REFERRAL_RATES = [0.02, 0.01, 0.005]; // 3.5%

// 修改后（正确）
const CEX_REFERRAL_RATES = [0.30, 0.10, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01]; // 50%
const DEX_REFERRAL_RATES = [0.05, 0.03, 0.02]; // 10%
```

**安全限制调整**：
```javascript
// 修改前
MAX_SINGLE_REWARD: 50,
MAX_DAILY_REWARD_PER_USER: 200,
MAX_TOTAL_RATE: 0.20,

// 修改后
MAX_SINGLE_REWARD: 500,
MAX_DAILY_REWARD_PER_USER: 2000,
MAX_TOTAL_RATE: 0.60,
```

### 2. `backend/src/routes/robotRoutes.js`

**修改1 - 购买时奖励逻辑（约第402-409行）**：
```javascript
// 修改前（错误：所有类型都在购买时发放）
if (config.robot_type === 'cex' || config.robot_type === 'grid' || config.robot_type === 'high') {
    await distributeCexPurchaseRewards(walletAddr, robot_name, robotPrice, robotPurchaseId);
} else if (config.robot_type === 'dex') {
    await distributeDexPurchaseRewards(walletAddr, robot_name, robotPrice, robotPurchaseId);
}

// 修改后（正确：只有 DEX 在购买时发放启动资金返点）
if (config.robot_type === 'dex') {
    await distributeDexPurchaseRewards(walletAddr, robot_name, robotPrice, robotPurchaseId);
}
// CEX/Grid/High 不在购买时发放奖励
```

**修改2 - DEX/High 到期时发放奖励（约第1143-1157行）**：
```javascript
// 修改前（错误：不发放到期奖励）
// 注意：推荐奖励已在购买时立即发放，到期不再重复发放

// 修改后（正确：到期后发放基于收益的推荐奖励）
if ((robot.robot_type === 'high' || robot.robot_type === 'dex') && profitAmount > 0) {
    // ... 记录收益 ...
    // 到期后发放基于收益的推荐奖励（30%/10%/5%/1%×5）
    await distributeReferralRewards(walletAddr, robot, profitAmount);
}
```

**修改3 - CEX/Grid 量化时发放奖励（约第632-637行）**：
```javascript
// 修改前（错误：量化时不发放奖励）
// 10. 推荐奖励已在购买时立即发放，量化时不再发放
console.log(`[Quantify] Referral rewards already distributed at purchase for robot ${robotId}`);

// 修改后（正确：每次量化时发放基于收益的推荐奖励）
// 10. 发放推荐奖励（CEX/Grid 机器人每次量化时发放）
if (robot.robot_type === 'cex' || robot.robot_type === 'grid') {
    await distributeReferralRewards(walletAddr, robot, earnings);
    console.log(`[Quantify] Referral rewards distributed for robot ${robotId}, profit: ${earnings.toFixed(4)} USDT`);
}
```

**修改4 - 函数注释更新**：
- `distributeReferralRewards`: 比例说明更新为 30%/10%/5%/1%×5 = 50%
- `distributeDexPurchaseRewards`: 比例说明更新为 5%/3%/2% = 10%

---

## 奖励计算示例

### CEX 100 USDT 机器人
- 每日收益率: 2%
- 每次量化收益: 2 USDT
- 1级推荐奖励: 2 × 30% = **0.6 USDT**
- 2级推荐奖励: 2 × 10% = **0.2 USDT**

### CEX 20 USDT 机器人
- 每日收益率: 2%
- 每次量化收益: 0.4 USDT
- 1级推荐奖励: 0.4 × 30% = **0.12 USDT**
- 2级推荐奖励: 0.4 × 10% = **0.04 USDT**

### DEX 100 USDT 机器人
**购买时（启动资金返点）**：
- 1级: 100 × 5% = **5 USDT**
- 2级: 100 × 3% = **3 USDT**
- 3级: 100 × 2% = **2 USDT**

**到期后（假设收益 10 USDT）**：
- 1级: 10 × 30% = **3 USDT**
- 2级: 10 × 10% = **1 USDT**

---

## 历史错误数据处理

数据库中已存在的错误记录（`source_type = 'purchase'`，针对 CEX/Grid/High 机器人）需要手动处理：

```sql
-- 查看错误的购买奖励记录
SELECT * FROM referral_rewards
WHERE source_type = 'purchase'
AND robot_name NOT LIKE '%DEX%'
ORDER BY created_at DESC;

-- 需要根据业务决策处理这些记录：
-- 1. 标记为无效
-- 2. 从用户余额中扣回
-- 3. 保留但记录差异
```

---

## 验证方法

重启后端服务后，可以通过以下方式验证：

1. 购买 CEX/Grid 机器人，确认**不会**立即产生推荐奖励
2. 执行量化操作，确认产生的奖励是**收益的 30%**（1级）
3. 购买 DEX 机器人，确认立即产生**启动资金 5%** 的奖励
4. DEX 机器人到期后，确认产生**收益的 30%** 的额外奖励

```bash
# 查看最新奖励记录
mysql -e "SELECT * FROM referral_rewards ORDER BY created_at DESC LIMIT 10;"

# 检查后端日志
pm2 logs vitu-backend --lines 50
```

---

## 相关文件清单

| 文件路径 | 修改类型 |
|---------|---------|
| `backend/src/utils/referralMath.js` | 比例配置、安全限制、验证函数 |
| `backend/src/routes/robotRoutes.js` | 购买奖励逻辑、到期奖励逻辑、注释 |

---

**修复完成时间**: 2025-12-23 01:45 UTC+8
**追加修复时间**: 2025-12-23 10:00 UTC+8（修复量化时推荐奖励不发放的问题）
