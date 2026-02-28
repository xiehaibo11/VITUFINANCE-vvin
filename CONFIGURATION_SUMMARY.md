# 配置更新总结

## ✅ 已完成的配置

### 1. 管理系统账户
- **用户名**: `1019683427`
- **密码**: `xie080886`
- **状态**: ✅ 已在数据库中更新
- **验证**: ✅ 密码哈希验证通过

**数据库记录**:
```sql
SELECT id, username, role, is_active FROM admins WHERE id = 1;
-- 结果: id=1, username=1019683427, role=admin, is_active=1
```

### 2. 收款地址配置

#### BNB收款地址（BSC链）
- **地址**: `0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB`
- **更新位置**:
  - ✅ 数据库 `system_settings.platform_wallet_address`
  - ✅ 数据库 `system_settings.platform_wallet_bsc`
  - ✅ 环境变量 `backend/.env` → `PLATFORM_WALLET_ADDRESS`

#### USDT收款地址（BSC链）
- **地址**: `0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB`
- **更新位置**:
  - ✅ 数据库 `system_settings.platform_wallet_usdt`
  - ✅ 环境变量 `backend/.env` → `PLATFORM_WALLET_USDT`

#### ETH收款地址（ETH链）
- **地址**: `0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB`
- **更新位置**:
  - ✅ 数据库 `system_settings.platform_wallet_eth`
  - ✅ 环境变量 `backend/.env` → `PLATFORM_WALLET_ETH`

### 3. 服务状态
- ✅ PM2 后端服务已重启
- ✅ 钱包地址校验通过
- ✅ 所有定时任务正常运行

## 📊 数据库验证

```sql
-- 验证管理员账户
SELECT id, username, role, is_active 
FROM admins 
WHERE id = 1;

-- 验证收款地址
SELECT setting_key, setting_value, description 
FROM system_settings 
WHERE setting_key IN (
  'platform_wallet_address',
  'platform_wallet_bsc',
  'platform_wallet_eth',
  'platform_wallet_usdt'
)
ORDER BY setting_key;
```

**当前配置**:
```
platform_wallet_address  → 0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB (BNB)
platform_wallet_bsc      → 0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB (BNB)
platform_wallet_eth      → 0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB (ETH)
platform_wallet_usdt     → 0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB (USDT)
```

## 🔐 登录信息

### 管理后台
- **URL**: https://bocail.com/admin
- **用户名**: `1019683427`
- **密码**: `xie080886`

### 注意事项
⚠️ 首次登录可能需要：
1. 清除浏览器缓存
2. 使用无痕模式
3. 检查CSRF token配置

## 💰 收款地址总结

| 币种 | 链 | 收款地址 | 用途 |
|------|-----|----------|------|
| BNB | BSC | `0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB` | BSC链原生代币收款 |
| USDT | BSC | `0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB` | BSC链USDT代币收款 |
| ETH | ETH | `0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB` | ETH链收款 |

## 🧪 测试建议

### 1. 管理后台登录测试
```bash
# 方法1: 直接在浏览器访问
https://bocail.com/admin

# 方法2: 使用curl测试（需要处理CSRF）
curl -c cookies.txt https://bocail.com/admin
curl -b cookies.txt -X POST https://bocail.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"1019683427","password":"xie080886"}'
```

### 2. 充值地址测试
- 向新的USDT地址发送小额测试（建议1-10 USDT）
- 检查充值监控日志是否检测到
- 验证用户余额是否正确更新

### 3. 提现地址测试
- 提交小额提现申请
- 在管理后台审核通过
- 验证是否从正确的地址发送

## 📝 环境变量文件

**backend/.env**:
```env
# BNB收款地址
PLATFORM_WALLET_ADDRESS=0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB

# USDT收款地址（BSC链）
PLATFORM_WALLET_USDT=0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB

# ETH收款地址（ETH链）
PLATFORM_WALLET_ETH=0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB
```

## 🔍 监控命令

```bash
# 查看PM2状态
pm2 status

# 查看后端日志
pm2 logs vitu-backend --lines 50

# 查看钱包地址验证日志
pm2 logs vitu-backend | grep -i "wallet\|安全"

# 查看充值监控日志
pm2 logs vitu-backend | grep -i "deposit\|充值"

# 查看Nginx日志
tail -f /www/wwwlogs/bocail.com.access.log
tail -f /www/wwwlogs/bocail.com.error.log
```

## ⚠️ 重要提醒

1. **密码安全**: 
   - 管理员密码已更新，请妥善保管
   - 建议首次登录后立即修改密码

2. **收款地址**:
   - 所有收款地址已更新到数据库和环境变量
   - 服务已重启，新配置已生效
   - 建议进行小额测试验证

3. **备份**:
   - 配置更新前已创建备份
   - 备份位置: `/tmp/vitu-backup/`

4. **监控**:
   - 建议持续监控充值和提现日志
   - 确保所有交易使用正确的地址

## 📞 故障排查

### 登录失败
1. 检查用户名和密码是否正确
2. 清除浏览器缓存和Cookie
3. 查看后端日志: `pm2 logs vitu-backend | grep login`
4. 检查数据库记录: `SELECT * FROM admins WHERE username='1019683427'`

### 充值未到账
1. 检查充值监控日志: `pm2 logs vitu-backend | grep DepositMonitor`
2. 验证收款地址是否正确
3. 检查区块链浏览器确认交易状态
4. 查看数据库充值记录: `SELECT * FROM deposit_records ORDER BY created_at DESC LIMIT 10`

### 提现失败
1. 检查钱包余额和Gas费
2. 验证提现地址配置
3. 查看后端错误日志
4. 检查数据库提现记录状态

---

**更新时间**: 2026-02-27 18:30
**更新人**: Kiro AI Assistant
**状态**: ✅ 配置已完成并验证
