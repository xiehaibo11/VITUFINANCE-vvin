# 🚀 Bocail.com 快速部署指南

## 一键部署

```bash
cd /data/projects/vitufinance
sudo ./DEPLOY_BOCAIL.sh
```

## 验证部署

```bash
# 1. 访问网站
curl -I https://bocail.com

# 2. 检查服务状态
pm2 status

# 3. 查看日志
pm2 logs vitu-backend --lines 20
```

## 访问地址

- 🌐 前端：https://bocail.com
- 🔧 管理后台：https://bocail.com/admin
- 📡 API：https://bocail.com/api/

## 常用命令

```bash
# 重启后端
pm2 restart vitu-backend

# 重载 Nginx
sudo systemctl reload nginx

# 查看日志
pm2 logs vitu-backend
tail -f /www/wwwlogs/bocail.com.error.log
```

## 需要帮助？

查看详细文档：`DEPLOYMENT_SUMMARY.md`
