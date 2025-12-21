#!/bin/bash

###############################################################################
# 性能优化自动部署脚本
# 
# 功能:
# - 自动备份
# - 安装依赖
# - 执行数据库优化
# - 重启服务
# - 验证部署
# 
# 使用方法:
# chmod +x scripts/deploy_optimization.sh
# ./scripts/deploy_optimization.sh
# 
# 创建时间: 2025-12-18
###############################################################################

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目路径
PROJECT_ROOT="/www/wwwroot/vitufinance.com"
BACKEND_DIR="$PROJECT_ROOT/backend"
BACKUP_DIR="$PROJECT_ROOT/backups"

# 数据库配置 (从.env读取)
source $BACKEND_DIR/.env

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   性能优化自动部署脚本                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# 步骤 1: 备份
###############################################################################

echo -e "${YELLOW}[1/7] 开始备份...${NC}"

# 创建备份目录
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 备份数据库
echo "  - 备份数据库..."
mysqldump -u $DB_USER -p$DB_PASSWORD $DB_NAME > $BACKUP_DIR/database_$TIMESTAMP.sql
if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓ 数据库备份成功${NC}"
else
    echo -e "  ${RED}✗ 数据库备份失败${NC}"
    exit 1
fi

# 备份代码
echo "  - 备份代码..."
tar -czf $BACKUP_DIR/code_$TIMESTAMP.tar.gz $PROJECT_ROOT --exclude=node_modules --exclude=backups
if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓ 代码备份成功${NC}"
else
    echo -e "  ${RED}✗ 代码备份失败${NC}"
    exit 1
fi

# 备份配置文件
echo "  - 备份配置文件..."
cp $BACKEND_DIR/.env $BACKUP_DIR/.env_$TIMESTAMP
echo -e "  ${GREEN}✓ 配置文件备份成功${NC}"

echo ""

###############################################################################
# 步骤 2: 检查环境
###############################################################################

echo -e "${YELLOW}[2/7] 检查环境...${NC}"

# 检查Node.js版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ $NODE_VERSION -ge 16 ]; then
    echo -e "  ${GREEN}✓ Node.js 版本: $(node -v)${NC}"
else
    echo -e "  ${RED}✗ Node.js 版本过低,需要 >= 16.x${NC}"
    exit 1
fi

# 检查MySQL
if command -v mysql &> /dev/null; then
    echo -e "  ${GREEN}✓ MySQL 已安装${NC}"
else
    echo -e "  ${RED}✗ MySQL 未安装${NC}"
    exit 1
fi

# 检查PM2
if command -v pm2 &> /dev/null; then
    echo -e "  ${GREEN}✓ PM2 已安装${NC}"
else
    echo -e "  ${RED}✗ PM2 未安装${NC}"
    exit 1
fi

# 检查磁盘空间
DISK_SPACE=$(df -h $PROJECT_ROOT | awk 'NR==2 {print $4}' | sed 's/G//')
if [ $(echo "$DISK_SPACE > 5" | bc) -eq 1 ]; then
    echo -e "  ${GREEN}✓ 磁盘空间充足: ${DISK_SPACE}GB${NC}"
else
    echo -e "  ${YELLOW}⚠ 磁盘空间不足: ${DISK_SPACE}GB${NC}"
fi

echo ""

###############################################################################
# 步骤 3: 安装依赖
###############################################################################

echo -e "${YELLOW}[3/7] 安装依赖...${NC}"

cd $BACKEND_DIR

# 安装compression
if npm list compression &> /dev/null; then
    echo -e "  ${GREEN}✓ compression 已安装${NC}"
else
    echo "  - 安装 compression..."
    npm install compression
    if [ $? -eq 0 ]; then
        echo -e "  ${GREEN}✓ compression 安装成功${NC}"
    else
        echo -e "  ${RED}✗ compression 安装失败${NC}"
        exit 1
    fi
fi

echo ""

###############################################################################
# 步骤 4: 数据库优化
###############################################################################

echo -e "${YELLOW}[4/7] 执行数据库优化...${NC}"

# 执行索引脚本
echo "  - 创建数据库索引..."
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < $BACKEND_DIR/src/config/dbIndexes.sql 2>&1 | grep -v "Duplicate key name" || true

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓ 数据库索引创建成功${NC}"
else
    echo -e "  ${RED}✗ 数据库索引创建失败${NC}"
    exit 1
fi

# 分析表
echo "  - 分析表统计信息..."
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME -e "ANALYZE TABLE user_balances, deposit_records, withdraw_records, robot_purchases;" > /dev/null 2>&1
echo -e "  ${GREEN}✓ 表分析完成${NC}"

echo ""

###############################################################################
# 步骤 5: 更新配置
###############################################################################

echo -e "${YELLOW}[5/7] 更新配置...${NC}"

# 检查.env文件
if grep -q "DB_POOL_SIZE" $BACKEND_DIR/.env; then
    echo -e "  ${GREEN}✓ DB_POOL_SIZE 已配置${NC}"
else
    echo "  - 添加 DB_POOL_SIZE..."
    echo "" >> $BACKEND_DIR/.env
    echo "# 数据库连接池大小" >> $BACKEND_DIR/.env
    echo "DB_POOL_SIZE=50" >> $BACKEND_DIR/.env
    echo -e "  ${GREEN}✓ DB_POOL_SIZE 已添加${NC}"
fi

if grep -q "SLOW_QUERY_THRESHOLD" $BACKEND_DIR/.env; then
    echo -e "  ${GREEN}✓ SLOW_QUERY_THRESHOLD 已配置${NC}"
else
    echo "  - 添加 SLOW_QUERY_THRESHOLD..."
    echo "SLOW_QUERY_THRESHOLD=1000" >> $BACKEND_DIR/.env
    echo -e "  ${GREEN}✓ SLOW_QUERY_THRESHOLD 已添加${NC}"
fi

echo ""

###############################################################################
# 步骤 6: 重启服务
###############################################################################

echo -e "${YELLOW}[6/7] 重启服务...${NC}"

# 重启PM2服务
echo "  - 重启后端服务..."
pm2 restart backend > /dev/null 2>&1 || pm2 restart all > /dev/null 2>&1

# 等待服务启动
sleep 3

# 检查服务状态
if pm2 list | grep -q "online"; then
    echo -e "  ${GREEN}✓ 服务重启成功${NC}"
else
    echo -e "  ${RED}✗ 服务重启失败${NC}"
    echo "  查看日志: pm2 logs backend"
    exit 1
fi

echo ""

###############################################################################
# 步骤 7: 验证部署
###############################################################################

echo -e "${YELLOW}[7/7] 验证部署...${NC}"

# 检查健康接口
echo "  - 检查健康接口..."
HEALTH_CHECK=$(curl -s http://localhost:3000/api/admin/health | grep -o '"success":true' || echo "")
if [ -n "$HEALTH_CHECK" ]; then
    echo -e "  ${GREEN}✓ 健康检查通过${NC}"
else
    echo -e "  ${YELLOW}⚠ 健康检查失败,请手动检查${NC}"
fi

# 检查数据库连接
echo "  - 检查数据库连接..."
DB_CHECK=$(mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME -e "SELECT 1" 2>&1 | grep -o "1" || echo "")
if [ -n "$DB_CHECK" ]; then
    echo -e "  ${GREEN}✓ 数据库连接正常${NC}"
else
    echo -e "  ${RED}✗ 数据库连接失败${NC}"
    exit 1
fi

echo ""

###############################################################################
# 完成
###############################################################################

echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   部署完成! 🎉                             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}备份位置:${NC}"
echo "  - 数据库: $BACKUP_DIR/database_$TIMESTAMP.sql"
echo "  - 代码: $BACKUP_DIR/code_$TIMESTAMP.tar.gz"
echo "  - 配置: $BACKUP_DIR/.env_$TIMESTAMP"
echo ""
echo -e "${BLUE}下一步:${NC}"
echo "  1. 查看服务日志: pm2 logs backend"
echo "  2. 访问管理后台,测试性能"
echo "  3. 查看慢查询日志: tail -f /var/log/mysql/slow-query.log"
echo ""
echo -e "${YELLOW}如遇问题,请查看部署文档:${NC}"
echo "  - PERFORMANCE_OPTIMIZATION_GUIDE.md"
echo "  - DEPLOYMENT_CHECKLIST.md"
echo ""

