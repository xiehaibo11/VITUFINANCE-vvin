# 管理后台登录问题修复

## 问题描述

管理后台登录时返回 401 错误：
```
POST /api/admin/login 401 (Unauthorized)
[ADMIN] [AUTH] [WARN] Auth Error: login - Invalid credentials
```

使用正确的用户名和密码仍然无法登录。

## 根本原因

`admin_config.json` 中存储的密码哈希与实际密码 `xie080886` 不匹配。

旧哈希：
```
$2a$12$hv/F6iE2wYe/JNv0AVyn3O7Ffr8ZC2DoDXrHsQDhuuQxnEsEBKy3u
```

这个哈希对应的密码不是 `xie080886`，可能是之前测试时使用的其他密码。

## 解决方案

### 1. 生成正确的密码哈希

使用 bcrypt 为密码 `xie080886` 生成新的哈希：

```javascript
import bcrypt from 'bcryptjs';
const hash = await bcrypt.hash('xie080886', 12);
// 结果: $2a$12$6P34p1YCd.duX2ZEL/abP.G9JhnaxkEsdiEA7D7vVX7kwzKlzH43m
```

### 2. 更新配置文件

**修改文件**: `vitufinance/backend/data/admin_config.json`

```json
{
  "1019683427": {
    "username": "1019683427",
    "password": "$2a$12$6P34p1YCd.duX2ZEL/abP.G9JhnaxkEsdiEA7D7vVX7kwzKlzH43m",
    "role": "super_admin",
    "createdAt": "2025-12-19T15:49:11.864Z",
    "updatedAt": "2026-02-28T18:30:00.000Z"
  }
}
```

### 3. 验证修复

```bash
# 测试登录 API
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"1019683427","password":"xie080886"}'

# 预期响应：
# {
#   "success": true,
#   "message": "登录成功",
#   "data": {
#     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#     "username": "1019683427",
#     "role": "super_admin"
#   }
# }
```

## 管理后台登录信息

### 访问地址
- **URL**: https://bocail.com/admin
- **用户名**: `1019683427`
- **密码**: `xie080886`
- **角色**: super_admin

### 登录流程

1. 访问 https://bocail.com/admin
2. 输入用户名：`1019683427`
3. 输入密码：`xie080886`
4. 点击"登录"按钮
5. 成功后会跳转到管理后台首页

## 安全建议

### 1. 修改默认密码

登录后建议立即修改密码：

```bash
# 生成新密码的哈希
node -e "
import('bcryptjs').then(bcrypt => {
  bcrypt.default.hash('YOUR_NEW_PASSWORD', 12).then(hash => {
    console.log('New hash:', hash);
  });
});
"

# 然后更新 admin_config.json
```

### 2. 启用双因素认证（2FA）

在管理后台设置中启用 2FA，增加账户安全性。

### 3. 定期更换密码

建议每 3-6 个月更换一次管理员密码。

### 4. 监控登录日志

定期检查登录日志，发现异常登录：

```bash
# 查看登录日志
pm2 logs vitu-backend | grep "登录"

# 查看失败的登录尝试
pm2 logs vitu-backend | grep "登录失败"
```

## 密码哈希生成工具

如果需要为其他管理员生成密码哈希，可以使用以下脚本：

```javascript
// generate_password_hash.js
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node generate_password_hash.js <password>');
  process.exit(1);
}

bcrypt.hash(password, 12).then(hash => {
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('\nAdd this to admin_config.json:');
  console.log(JSON.stringify({
    username: 'NEW_USERNAME',
    password: hash,
    role: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, null, 2));
});
```

使用方法：
```bash
node generate_password_hash.js "your_password_here"
```

## 故障排查

### 问题：登录后立即退出

**原因**: JWT token 验证失败

**解决**:
1. 检查 `.env` 中的 `JWT_SECRET` 是否正确
2. 清除浏览器 Cookie 和 LocalStorage
3. 重新登录

### 问题：提示"账户安全问题"

**原因**: 检测到明文密码（未加密）

**解决**:
1. 确保 `admin_config.json` 中的密码以 `$2a$` 或 `$2b$` 开头（bcrypt 哈希）
2. 不要使用明文密码

### 问题：登录速度很慢

**原因**: bcrypt 验证需要时间（这是正常的安全措施）

**说明**: bcrypt 故意设计为计算密集型，以防止暴力破解。正常登录需要 1-2 秒。

## 相关文件

- `vitufinance/backend/data/admin_config.json` - 管理员配置文件
- `vitufinance/backend/src/adminRoutes.js` - 管理员 API 路由
- `vitufinance/admin/src/views/Login.vue` - 登录页面

## 测试清单

- [x] 密码哈希已更新
- [x] 登录 API 测试通过
- [x] 可以成功获取 JWT token
- [ ] 浏览器登录测试（需要用户测试）
- [ ] 登录后功能正常（需要用户测试）

---

修复日期：2026-02-28
修复人员：Kiro AI Assistant
状态：✅ 已修复，等待用户验证
