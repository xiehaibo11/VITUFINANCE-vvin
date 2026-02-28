#!/bin/bash

# ============================================================================
# Bocail.com 部署脚本
# ============================================================================
# 功能：将 VituFinance 项目部署到 bocail.com 域名
# 创建时间：2026-02-27
# ============================================================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 项目路径
PROJECT_DIR="/data/projects/vitufinance"
NGINX_CONFIG="/etc/nginx/sites-available/bocail.com"
BACKUP_DIR="/tmp/vitu-deploy-backup-$(date +%Y%m%d_%H%M%S)"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Bocail.com 部署脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 1. 创建备份
echo -e "${YELLOW}[1/8] 创建备份...${NC}"
mkdir -p "$BACKUP_DIR"
if [ -d "$PROJECT_DIR/frontend/dist" ]; then
    cp -r "$PROJECT_DIR/frontend/dist" "$BACKUP_DIR/frontend-dist-backup"
fi
if [ -d "$PROJECT_DIR/admin/dist" ]; then
    cp -r "$PROJECT_DIR/admin/dist" "$BACKUP_DIR/admin-dist-backup"
fi
cp "$PROJECT_DIR/backend/.env" "$BACKUP_DIR/.env.backup" 2>/dev/null || true
echo -e "${GREEN}✓ 备份完成: $BACKUP_DIR${NC}"
echo ""

# 2. 检查环境
echo -e "${YELLOW}[2/8] 检查环境...${NC}"
cd "$PROJECT_DIR"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js 未安装${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js: $(node -v)${NC}"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm 未安装${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm: $(npm -v)${NC}"

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}✗ PM2 未安装${NC}"
    exit 1
fi
echo -e "${GREEN}✓ PM2 已安装${NC}"
echo ""

# 3. 构建前端
echo -e "${YELLOW}[3/8] 构建前端...${NC}"
cd "$PROJECT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install
fi
echo "构建前端..."
npm run build
echo -e "${GREEN}✓ 前端构建完成${NC}"
echo ""

# 4. 构建管理后台
echo -e "${YELLOW}[4/8] 构建管理后台...${NC}"
cd "$PROJECT_DIR/admin"
if [ ! -d "node_modules" ]; then
    echo "安装管理后台依赖..."
    npm install
fi
echo "构建管理后台..."
npm run build
echo -e "${GREEN}✓ 管理后台构建完成${NC}"
echo ""

# 5. 检查后端依赖
echo -e "${YELLOW}[5/8] 检查后端依赖...${NC}"
cd "$PROJECT_DIR/backend"
if [ ! -d "node_modules" ]; then
    echo "安装后端依赖..."
    npm install
fi
echo -e "${GREEN}✓ 后端依赖已就绪${NC}"
echo ""

# 6. 更新 Nginx 配置
echo -e "${YELLOW}[6/8] 更新 Nginx 配置...${NC}"
cat > /tmp/bocail.com.nginx << 'EOF'
server {
    server_name bocail.com www.bocail.com;

    access_log /www/wwwlogs/bocail.com.access.log;
    error_log  /www/wwwlogs/bocail.com.error.log;

    root /data/projects/vitufinance/frontend/dist;
    index index.html;

    # 前端静态文件
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    # WebSocket 支持
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 管理后台静态资源
    location ^~ /admin/assets/ {
        alias /data/projects/vitufinance/admin/dist/assets/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    location ^~ /admin/sounds/ {
        alias /data/projects/vitufinance/admin/dist/sounds/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # 管理后台
    location /admin/ {
        alias /data/projects/vitufinance/admin/dist/;
        index index.html;
        try_files $uri $uri/ @admin_fallback;
    }

    location @admin_fallback {
        root /data/projects/vitufinance/admin/dist;
        rewrite ^ /index.html break;
    }

    # 前端静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/bocail.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bocail.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = www.bocail.com) {
        return 301 https://$host$request_uri;
    }

    if ($host = bocail.com) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    server_name bocail.com www.bocail.com;
    return 404;
}
EOF

# 备份旧配置
if [ -f "$NGINX_CONFIG" ]; then
    cp "$NGINX_CONFIG" "$BACKUP_DIR/nginx-bocail.com.backup"
fi

# 应用新配置
sudo cp /tmp/bocail.com.nginx "$NGINX_CONFIG"
echo -e "${GREEN}✓ Nginx 配置已更新${NC}"
echo ""

# 7. 测试并重载 Nginx
echo -e "${YELLOW}[7/8] 测试并重载 Nginx...${NC}"
if sudo nginx -t; then
    sudo systemctl reload nginx
    echo -e "${GREEN}✓ Nginx 重载成功${NC}"
else
    echo -e "${RED}✗ Nginx 配置测试失败，恢复备份${NC}"
    sudo cp "$BACKUP_DIR/nginx-bocail.com.backup" "$NGINX_CONFIG"
    exit 1
fi
echo ""

# 8. 重启后端服务
echo -e "${YELLOW}[8/8] 重启后端服务...${NC}"
cd "$PROJECT_DIR/backend"

# 检查 PM2 进程
if pm2 list | grep -q "vitu-backend"; then
    echo "重启现有服务..."
    pm2 restart vitu-backend
else
    echo "启动新服务..."
    pm2 start server.js --name vitu-backend
fi

# 保存 PM2 配置
pm2 save

echo -e "${GREEN}✓ 后端服务已重启${NC}"
echo ""

# 9. 验证部署
echo -e "${YELLOW}验证部署...${NC}"
sleep 3

# 检查 PM2 状态
if pm2 list | grep -q "vitu-backend.*online"; then
    echo -e "${GREEN}✓ 后端服务运行正常${NC}"
else
    echo -e "${RED}✗ 后端服务状态异常${NC}"
fi

# 检查 Nginx 状态
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✓ Nginx 运行正常${NC}"
else
    echo -e "${RED}✗ Nginx 状态异常${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "访问地址: ${GREEN}https://bocail.com${NC}"
echo -e "管理后台: ${GREEN}https://bocail.com/admin${NC}"
echo -e "备份位置: ${YELLOW}$BACKUP_DIR${NC}"
echo ""
echo -e "查看日志:"
echo -e "  后端: ${YELLOW}pm2 logs vitu-backend${NC}"
echo -e "  Nginx访问: ${YELLOW}tail -f /www/wwwlogs/bocail.com.access.log${NC}"
echo -e "  Nginx错误: ${YELLOW}tail -f /www/wwwlogs/bocail.com.error.log${NC}"
echo ""
echo -e "${YELLOW}注意: 如果遇到问题，可以从备份恢复:${NC}"
echo -e "  ${YELLOW}$BACKUP_DIR${NC}"
echo ""
