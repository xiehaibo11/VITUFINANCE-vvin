#!/bin/bash

###############################################################################
# TRON 免密支付前端部署脚本
# 
# 功能：
# - 构建前端
# - 备份当前版本
# - 部署新版本
# - 验证部署
#
# 使用方法：
# chmod +x deploy-tron-frontend.sh
# ./deploy-tron-frontend.sh
###############################################################################

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目路径
PROJECT_ROOT="/data/projects/vitufinance"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKUP_DIR="$PROJECT_ROOT/frontend/dist.backup.$(date +%Y%m%d_%H%M%S)"

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 打印标题
print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
    echo ""
}

###############################################################################
# 步骤1：检查环境
###############################################################################
print_header "步骤1：检查环境"

# 检查是否在正确的目录
if [ ! -d "$FRONTEND_DIR" ]; then
    print_error "前端目录不存在: $FRONTEND_DIR"
    exit 1
fi

print_success "前端目录存在"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js 未安装"
    exit 1
fi

NODE_VERSION=$(node -v)
print_success "Node.js 版本: $NODE_VERSION"

# 检查 npm
if ! command -v npm &> /dev/null; then
    print_error "npm 未安装"
    exit 1
fi

NPM_VERSION=$(npm -v)
print_success "npm 版本: $NPM_VERSION"

# 检查后端服务
if command -v pm2 &> /dev/null; then
    print_info "检查后端服务状态..."
    pm2 status vitu-backend || print_warning "后端服务可能未运行"
else
    print_warning "PM2 未安装，跳过后端检查"
fi

# 检查 Redis
if command -v redis-cli &> /dev/null; then
    print_info "检查 Redis 连接..."
    if redis-cli ping &> /dev/null; then
        print_success "Redis 连接正常"
    else
        print_warning "Redis 连接失败"
    fi
else
    print_warning "redis-cli 未安装，跳过 Redis 检查"
fi

###############################################################################
# 步骤2：备份当前版本
###############################################################################
print_header "步骤2：备份当前版本"

if [ -d "$FRONTEND_DIR/dist" ]; then
    print_info "备份当前版本到: $BACKUP_DIR"
    cp -r "$FRONTEND_DIR/dist" "$BACKUP_DIR"
    print_success "备份完成"
else
    print_warning "dist 目录不存在，跳过备份"
fi

###############################################################################
# 步骤3：构建前端
###############################################################################
print_header "步骤3：构建前端"

cd "$FRONTEND_DIR"

# 检查 package.json
if [ ! -f "package.json" ]; then
    print_error "package.json 不存在"
    exit 1
fi

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
    print_info "安装依赖..."
    npm install
    print_success "依赖安装完成"
else
    print_info "node_modules 已存在，跳过安装"
fi

# 构建
print_info "开始构建..."
npm run build

if [ $? -eq 0 ]; then
    print_success "构建成功"
else
    print_error "构建失败"
    exit 1
fi

# 验证构建结果
if [ ! -d "dist" ]; then
    print_error "dist 目录未生成"
    exit 1
fi

print_success "dist 目录已生成"

# 检查关键文件
if [ ! -f "dist/index.html" ]; then
    print_error "index.html 未生成"
    exit 1
fi

print_success "index.html 已生成"

# 检查 TRON logo
if [ -f "dist/static/tron.svg" ]; then
    print_success "TRON logo 已包含 (tron.svg)"
elif [ -f "public/static/tron.svg" ]; then
    print_success "TRON logo 存在于 public 目录"
else
    print_warning "TRON logo 未找到"
fi

# 显示构建文件大小
print_info "构建文件大小:"
du -sh dist/

###############################################################################
# 步骤4：部署（可选）
###############################################################################
print_header "步骤4：部署"

print_info "构建完成，dist 目录已准备好部署"
print_info "dist 目录位置: $FRONTEND_DIR/dist"

# 如果使用 PM2 管理前端
if command -v pm2 &> /dev/null; then
    read -p "是否重启前端服务？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "重启前端服务..."
        pm2 restart vitu-frontend || print_warning "前端服务重启失败或未配置"
    fi
fi

###############################################################################
# 步骤5：验证部署
###############################################################################
print_header "步骤5：验证部署"

# 测试 API
print_info "测试 TRON 充值 API..."
API_RESPONSE=$(curl -s -X POST https://bocail.com/api/deposit/tron/nonce \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi"}' || echo "")

if echo "$API_RESPONSE" | grep -q "success"; then
    print_success "API 测试通过"
    echo "$API_RESPONSE" | head -c 100
    echo "..."
else
    print_warning "API 测试失败或无响应"
fi

###############################################################################
# 完成
###############################################################################
print_header "部署完成"

print_success "✅ 前端构建成功"
print_success "✅ 文件已准备好部署"

if [ -d "$BACKUP_DIR" ]; then
    print_info "📦 备份位置: $BACKUP_DIR"
fi

print_info "📁 构建文件: $FRONTEND_DIR/dist"

echo ""
echo "=========================================="
echo "下一步操作："
echo "=========================================="
echo ""
echo "1. 测试充值功能："
echo "   - 访问 https://bocail.com"
echo "   - 在 imToken 中测试 TRON 链连接（已修复）"
echo "   - 连接 TronLink 钱包"
echo "   - 选择 TRON 链充值"
echo ""
echo "2. 质押 TRX 获取能量（重要！）："
echo "   - 当前 TRX 余额：159.36754 TRX"
echo "   - 建议质押：10,000 TRX"
echo "   - 质押后每次充值成本：0 TRX"
echo ""
echo "3. 监控充值数据："
echo "   - 查看日志：pm2 logs vitu-backend | grep TronDeposit"
echo "   - 查看数据库：SELECT * FROM deposits WHERE chain = 'TRON'"
echo ""
echo "4. 查看详细文档："
echo "   - TRON_QUICK_DEPLOY.md"
echo "   - TRON_TESTING_GUIDE.md"
echo "   - TRON_ENERGY_STAKING_GUIDE.md"
echo "   - TRON_IMTOKEN_FIX.md（imToken TRON 连接修复）"
echo ""
echo "=========================================="
echo "🎉 部署完成！祝使用愉快！"
echo "=========================================="
echo ""

