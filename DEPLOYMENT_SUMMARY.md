# Bocail.com 部署总结

## ✅ 已完成的准备工作

### 1. 项目重新拉取
- ✅ 删除旧项目
- ✅ 从 GitHub 拉取最新代码
- ✅ 包含完整的 node_modules 和 dist 目录
- ✅ 项目大小：562.94 MiB

### 2. 域名替换
- ✅ 批量替换所有 `vitufinance.com` 为 `bocail.com`
- ✅ 替换文件类型：.vue, .js, .ts, .html, .xml, .txt, .md
- ✅ 排除目录：node_modules, .git, dist
- ✅ 验证结果：0 处残留的旧域名

### 3. 环境配置
- ✅ backend/.env - 数据库和服务器配置
- ✅ frontend/.env.production - 前端生产环境配置
- ✅ admin/.env.production - 管理后台生产环境配置

### 4. SSL证书
- ✅ 证书已存在且有效
- ✅ 域名：bocail.com, www.bocail.com
- ✅ 有效期至：2026-05-25（还有86天）
- ✅ 证书路径：/etc/letsencrypt/live/bocail.com/

### 5. 数据库
- ✅ 数据库名：bocail
- ✅ 用户名：bocail
- ✅ 无硬编码域名需要更新

### 6. 构建文件
- ✅ frontend/dist: 97MB（已存在）
- ✅ admin/dist: 3.6MB（已存在）
- ✅ backend/node_modules: 57MB（已存在）

## 🚀 部署方式

### 方式一：自动部署（推荐）

```bash
cd /data/projects/vitufinance
sudo ./DEPLOY_BOCAIL.sh
```

这个脚本会自动完成：
1. 创建备份
2. 检查环境
3. 构建前端
4. 构建管理后台
5. 检查后端依赖
6. 更新 Nginx 配置
7. 测试并重载 Nginx
8. 重启后端服务
9. 验证部署

### 方式二：手动部署

```bash
# 1. 构建前端
cd /data/projects/vitufinance/frontend
npm run build

# 2. 构建管理后台
cd /data/projects/vitufinance/admin
npm run build

# 3. 更新 Nginx 配置
sudo cp /tmp/bocail.com.nginx /etc/nginx/sites-available/bocail.com
sudo nginx -t
sudo systemctl reload nginx

# 4. 重启后端
cd /data/projects/vitufinance/backend
pm2 restart vitu-backend || pm2 start server.js --name vitu-backend
pm2 save
```

## 📋 部署后验证清单

- [ ] 访问 https://bocail.com - 前端首页正常
- [ ] 访问 https://bocail.com/admin - 管理后台正常
- [ ] 测试 API 接口 - https://bocail.com/api/
- [ ] 测试钱包连接功能
- [ ] 测试充值功能
- [ ] 测试提现功能
- [ ] 测试机器人购买
- [ ] 测试推荐系统
- [ ] 测试管理后台登录
- [ ] 检查 SSL 证书（无浏览器警告）
- [ ] 检查所有静态资源加载
- [ ] 检查 WebSocket 连接

## 📊 监控命令

```bash
# 查看后端日志
pm2 logs vitu-backend

# 查看 Nginx 访问日志
tail -f /www/wwwlogs/bocail.com.access.log

# 查看 Nginx 错误日志
tail -f /www/wwwlogs/bocail.com.error.log

# 查看 PM2 状态
pm2 status

# 查看系统资源
pm2 monit
```

## 🔧 常见问题处理

### 1. 前端页面 404
```bash
# 检查 dist 目录
ls -la /data/projects/vitufinance/frontend/dist/

# 重新构建
cd /data/projects/vitufinance/frontend
npm run build
```

### 2. API 接口 502
```bash
# 检查后端服务
pm2 status
pm2 logs vitu-backend

# 重启后端
pm2 restart vitu-backend
```

### 3. Nginx 配置错误
```bash
# 测试配置
sudo nginx -t

# 查看错误日志
sudo tail -f /var/log/nginx/error.log
```

### 4. SSL 证书问题
```bash
# 检查证书
sudo certbot certificates

# 续期证书
sudo certbot renew
```

## 🔄 回滚方案

如果部署出现问题，可以从自动备份恢复：

```bash
# 备份位置
BACKUP_DIR="/tmp/vitu-deploy-backup-YYYYMMDD_HHMMSS"

# 恢复前端
cp -r $BACKUP_DIR/frontend-dist-backup /data/projects/vitufinance/frontend/dist

# 恢复管理后台
cp -r $BACKUP_DIR/admin-dist-backup /data/projects/vitufinance/admin/dist

# 恢复 Nginx 配置
sudo cp $BACKUP_DIR/nginx-bocail.com.backup /etc/nginx/sites-available/bocail.com
sudo systemctl reload nginx

# 恢复环境变量
cp $BACKUP_DIR/.env.backup /data/projects/vitufinance/backend/.env

# 重启服务
pm2 restart vitu-backend
```

## 📝 项目信息

- **项目路径**: /data/projects/vitufinance
- **Git 仓库**: https://github.com/gsyi5839-alt/https-vitufinance.com-.git
- **最新提交**: 85665190 - Full codebase push
- **域名**: bocail.com
- **数据库**: bocail
- **后端端口**: 3000
- **PM2 进程名**: vitu-backend

## 🔐 安全配置

- ✅ HTTPS 强制跳转
- ✅ 安全头配置（X-Frame-Options, X-Content-Type-Options, X-XSS-Protection）
- ✅ JWT 认证
- ✅ 速率限制
- ✅ CSRF 保护

## 📞 支持

如有问题，请检查：
1. 后端日志：`pm2 logs vitu-backend`
2. Nginx 日志：`/www/wwwlogs/bocail.com.error.log`
3. 系统日志：`journalctl -u nginx -f`

---

**创建时间**: 2026-02-27
**状态**: 准备就绪，可以部署
**部署脚本**: ./DEPLOY_BOCAIL.sh
