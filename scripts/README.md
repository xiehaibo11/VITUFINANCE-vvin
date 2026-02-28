# VituFinance 脚本工具集

本目录包含用于维护 VituFinance 平台的脚本工具。

## 📁 脚本列表

### 1. backup-database.sh - 数据库备份脚本
**功能：** 自动备份MySQL数据库并推送到Git仓库

**使用方法：**
```bash
./scripts/backup-database.sh
```

**功能特点：**
- ✅ 自动读取 `.env` 数据库配置
- ✅ 使用 `mysqldump` 导出完整数据库
- ✅ 自动压缩备份文件 (gzip)
- ✅ 保留最近7天的备份
- ✅ 自动提交并推送到Git仓库

**定时任务：** 每天凌晨3点自动执行

---

### 2. deploy_optimization.sh - 部署优化脚本
**功能：** 优化部署配置

---

### 3. production_deploy.sh - 生产环境部署脚本
**功能：** 部署到生产环境

---

### 4. test-all-admin-apis.sh - API测试脚本
**功能：** 测试所有管理后台API接口

---

### 5. check-dividend-data.js / .sql - 分红数据检查
**功能：** 检查分红数据完整性

---

## 🚀 日常维护

### 手动备份数据库
```bash
./scripts/backup-database.sh
```

### 查看备份日志
```bash
cat /www/wwwroot/bocail.com/backups/backup.log
```

### 重新构建前端
```bash
cd /www/wwwroot/bocail.com/frontend
npm run build
```

### 重新构建管理系统
```bash
cd /www/wwwroot/bocail.com/admin
npm run build
```

### 重启后端服务
```bash
pm2 restart vitu-backend
```

---

## 📊 日志查看

```bash
# Nginx错误日志
tail -f /www/wwwlogs/bocail.com.error.log

# Nginx访问日志
tail -f /www/wwwlogs/bocail.com.log

# 后端日志
tail -f /root/.pm2/logs/vitu-backend-error.log
pm2 logs vitu-backend
```

---

## 🔧 服务管理

```bash
# 查看Nginx状态
systemctl status nginx

# 重载Nginx配置
nginx -t && systemctl reload nginx

# 查看PM2进程
pm2 list

# 重启后端
pm2 restart vitu-backend
```

---

**最后更新：** 2025-12-21
**维护者：** VituFinance 技术团队
