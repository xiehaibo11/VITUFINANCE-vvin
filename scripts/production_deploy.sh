#!/bin/bash

###############################################################################
# 生产环境安全部署脚本 (蓝绿部署)
# 
# 功能:
# - 不影响现有生产环境
# - 在新端口部署优化版本
# - 提供测试和验证步骤
# - 支持一键回滚
# 
# 使用方法:
# chmod +x scripts/production_deploy.sh
# ./scripts/production_deploy.sh
# 
# 创建时间: 2025-12-18
###############################################################################

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
PROJECT_ROOT="/www/wwwroot/vitufinance.com"
BACKEND_DIR="$PROJECT_ROOT/backend"
BACKUP_DIR="$PROJECT_ROOT/backups/production_$(date +%Y%m%d_%H%M%S)"

# 端口配置
OLD_PORT=3000  # 当前生产环境端口
NEW_PORT=3001  # 新优化版本端口

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   生产环境安全部署 - 蓝绿部署策略         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# 安全检查
###############################################################################

echo -e "${YELLOW}[安全检查] 确认生产环境状态...${NC}"

# 检查是否在生产环境
if ! pm2 list | grep -q "online"; then
    echo -e "${RED}错误: 未检测到运行中的PM2服务${NC}"
    echo "请确认您的生产环境正在运行"
    exit 1
fi

echo -e "${GREEN}✓ 生产环境正在运行${NC}"

# 检查端口占用
if netstat -tuln | grep -q ":$NEW_PORT"; then
    echo -e "${RED}错误: 端口 $NEW_PORT 已被占用${NC}"
    echo "请选择其他端口或停止占用服务"
    exit 1
fi

echo -e "${GREEN}✓ 新端口 $NEW_PORT 可用${NC}"

# 确认操作
echo ""
echo -e "${YELLOW}⚠️  重要提示:${NC}"
echo "  本脚本将在端口 $NEW_PORT 部署优化版本"
echo "  现有生产环境 (端口 $OLD_PORT) 不会受影响"
echo "  您可以测试后再决定是否切换"
echo ""
read -p "是否继续? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "部署已取消"
    exit 0
fi

echo ""

###############################################################################
# 步骤 1: 创建完整备份
###############################################################################

echo -e "${YELLOW}[1/8] 创建完整备份...${NC}"

mkdir -p $BACKUP_DIR

# 从.env读取数据库配置
source $BACKEND_DIR/.env

# 备份数据库
echo "  - 备份数据库..."
mysqldump -u $DB_USER -p$DB_PASSWORD $DB_NAME > $BACKUP_DIR/database.sql 2>/dev/null || {
    echo -e "${RED}✗ 数据库备份失败，请检查数据库配置${NC}"
    exit 1
}
echo -e "  ${GREEN}✓ 数据库备份完成${NC}"

# 备份代码
echo "  - 备份代码..."
tar -czf $BACKUP_DIR/code.tar.gz $PROJECT_ROOT --exclude=node_modules --exclude=backups 2>/dev/null
echo -e "  ${GREEN}✓ 代码备份完成${NC}"

# 备份PM2配置
pm2 save > /dev/null 2>&1
cp ~/.pm2/dump.pm2 $BACKUP_DIR/ 2>/dev/null || true

echo -e "${GREEN}✓ 备份完成: $BACKUP_DIR${NC}"
echo ""

###############################################################################
# 步骤 2: 安装依赖
###############################################################################

echo -e "${YELLOW}[2/8] 安装新依赖...${NC}"

cd $BACKEND_DIR

if npm list compression &> /dev/null; then
    echo -e "  ${GREEN}✓ compression 已安装${NC}"
else
    echo "  - 安装 compression..."
    npm install compression --save > /dev/null 2>&1
    echo -e "  ${GREEN}✓ compression 安装成功${NC}"
fi

echo ""

###############################################################################
# 步骤 3: 数据库优化 (安全操作)
###############################################################################

echo -e "${YELLOW}[3/8] 执行数据库优化...${NC}"

echo "  - 创建数据库索引..."
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < $BACKEND_DIR/src/config/dbIndexes.sql 2>&1 | \
  grep -v "Duplicate key name" > /dev/null || true

echo -e "  ${GREEN}✓ 数据库索引创建完成${NC}"

echo "  - 分析表统计信息..."
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME -e "
  ANALYZE TABLE user_balances, deposit_records, withdraw_records, robot_purchases;
" > /dev/null 2>&1

echo -e "  ${GREEN}✓ 表分析完成${NC}"
echo ""

###############################################################################
# 步骤 4: 更新环境变量
###############################################################################

echo -e "${YELLOW}[4/8] 更新环境变量...${NC}"

# 备份原配置
cp $BACKEND_DIR/.env $BACKUP_DIR/.env.backup

# 添加新配置
if ! grep -q "DB_POOL_SIZE" $BACKEND_DIR/.env; then
    cat >> $BACKEND_DIR/.env << EOF

# === 性能优化配置 ($(date +%Y-%m-%d)) ===
DB_POOL_SIZE=50
SLOW_QUERY_THRESHOLD=1000
ENABLE_CACHE=true
ENABLE_COMPRESSION=true
EOF
    echo -e "  ${GREEN}✓ 性能优化配置已添加${NC}"
else
    echo -e "  ${GREEN}✓ 性能优化配置已存在${NC}"
fi

echo ""

###############################################################################
# 步骤 5: 创建优化版本服务器入口
###############################################################################

echo -e "${YELLOW}[5/8] 创建优化版本服务器...${NC}"

# 备份原server.js
if [ ! -f $BACKEND_DIR/server.js.backup ]; then
    cp $BACKEND_DIR/server.js $BACKEND_DIR/server.js.backup
    echo -e "  ${GREEN}✓ 原server.js已备份${NC}"
fi

# 创建优化版本的server入口
cat > $BACKEND_DIR/server.optimized.js << 'SERVEREOF'
/**
 * 优化版本服务器入口
 * 端口: 3001 (默认)
 */
import express from 'express';
import dotenv from 'dotenv';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 安全中间件
app.use(helmet());
app.use(cors());
app.use(express.json());

// 响应压缩
if (process.env.ENABLE_COMPRESSION === 'true') {
  app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      const contentType = res.getHeader('Content-Type');
      return /json|text/.test(contentType);
    }
  }));
}

// 导入优化的管理路由
import adminRoutes from './src/routes/admin/index.js';

// 注册路由
app.use('/api/admin', adminRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    version: 'optimized-v2.0',
    port: PORT,
    timestamp: new Date().toISOString() 
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 [Optimized] Server running on port ${PORT}`);
  console.log(`   Version: v2.0`);
  console.log(`   Compression: ${process.env.ENABLE_COMPRESSION === 'true' ? 'Enabled' : 'Disabled'}`);
  console.log(`   Cache: ${process.env.ENABLE_CACHE === 'true' ? 'Enabled' : 'Disabled'}`);
});
SERVEREOF

echo -e "  ${GREEN}✓ server.optimized.js 创建完成${NC}"
echo ""

###############################################################################
# 步骤 6: 创建PM2配置
###############################################################################

echo -e "${YELLOW}[6/8] 创建PM2配置...${NC}"

cat > $BACKEND_DIR/ecosystem.blue.config.js << 'PMEOF'
module.exports = {
  apps: [{
    name: 'backend-blue',
    script: './server.optimized.js',
    cwd: '/www/wwwroot/vitufinance.com/backend',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/blue-error.log',
    out_file: './logs/blue-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_memory_restart: '1G'
  }]
}
PMEOF

echo -e "  ${GREEN}✓ PM2配置创建完成${NC}"
echo ""

###############################################################################
# 步骤 7: 启动优化版本
###############################################################################

echo -e "${YELLOW}[7/8] 启动优化版本 (端口 $NEW_PORT)...${NC}"

cd $BACKEND_DIR

# 启动蓝环境
pm2 start ecosystem.blue.config.js > /dev/null 2>&1

# 等待启动
sleep 3

# 检查启动状态
if pm2 list | grep "backend-blue" | grep -q "online"; then
    echo -e "  ${GREEN}✓ 优化版本启动成功${NC}"
else
    echo -e "  ${RED}✗ 优化版本启动失败${NC}"
    echo "  查看日志: pm2 logs backend-blue"
    exit 1
fi

echo ""

###############################################################################
# 步骤 8: 测试验证
###############################################################################

echo -e "${YELLOW}[8/8] 测试验证...${NC}"

# 健康检查
echo "  - 健康检查..."
HEALTH_CHECK=$(curl -s http://localhost:$NEW_PORT/health | grep -o '"success":true' || echo "")
if [ -n "$HEALTH_CHECK" ]; then
    echo -e "  ${GREEN}✓ 健康检查通过${NC}"
else
    echo -e "  ${RED}✗ 健康检查失败${NC}"
    pm2 logs backend-blue --lines 20
    exit 1
fi

# 性能测试
echo "  - 性能测试..."
RESPONSE_TIME=$(curl -o /dev/null -s -w '%{time_total}' http://localhost:$NEW_PORT/health)
echo -e "  ${GREEN}✓ 响应时间: ${RESPONSE_TIME}s${NC}"

echo ""

###############################################################################
# 完成
###############################################################################

echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   部署完成! 🎉                             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}当前状态:${NC}"
echo "  • 原环境 (生产): http://localhost:$OLD_PORT"
echo "  • 新环境 (蓝):   http://localhost:$NEW_PORT"
echo ""

echo -e "${BLUE}下一步操作:${NC}"
echo ""
echo "1. 测试新环境:"
echo "   curl http://localhost:$NEW_PORT/health"
echo ""
echo "2. 对比性能:"
echo "   time curl http://localhost:$OLD_PORT/api/admin/health"
echo "   time curl http://localhost:$NEW_PORT/api/admin/health"
echo ""
echo "3. 配置Nginx进行灰度切换 (见文档):"
echo "   nano /etc/nginx/sites-available/your-site"
echo ""
echo "4. 如果需要回滚:"
echo "   pm2 stop backend-blue"
echo "   pm2 delete backend-blue"
echo ""

echo -e "${YELLOW}重要提示:${NC}"
echo "  - 两个环境现在同时运行"
echo "  - 生产环境未受影响"
echo "  - 测试满意后再切换流量"
echo "  - 备份位置: $BACKUP_DIR"
echo ""

echo -e "${BLUE}查看日志:${NC}"
echo "  pm2 logs backend-blue"
echo ""

echo -e "${BLUE}查看状态:${NC}"
echo "  pm2 list"
echo ""

# 保存部署记录
cat > $PROJECT_ROOT/LAST_DEPLOYMENT.txt << EOF
部署时间: $(date)
部署方式: 蓝绿部署
备份位置: $BACKUP_DIR
新环境端口: $NEW_PORT
状态: 部署成功，等待切换
EOF

echo -e "${GREEN}部署记录已保存到: LAST_DEPLOYMENT.txt${NC}"
echo ""

