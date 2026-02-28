#!/bin/bash

# 前端部署脚本
# 用途：将构建好的前端文件部署到生产环境
# 使用方法：bash DEPLOY_FRONTEND.sh

set -e  # 遇到错误立即退出

echo "=========================================="
echo "前端部署脚本"
echo "=========================================="
echo ""

# 配置
PROJECT_DIR="/data/projects/vitufinance/frontend"
DEPLOY_DIR="/data/wwwroot/bocail.com"
BACKUP_DIR="/data/wwwroot/bocail.com.backup.$(date +%Y%m%d_%H%M%S)"

# 检查构建文件是否存在
if [ ! -d "$PROJECT_DIR/dist" ]; then
    echo "❌ 错误：构建文件不存在"
    echo "请先运行：cd $PROJECT_DIR && npm run build"
    exit 1
fi

echo "✅ 构建文件存在"
echo ""

# 备份当前版本
echo "📦 备份当前版本..."
if [ -d "$DEPLOY_DIR" ]; then
    cp -r "$DEPLOY_DIR" "$BACKUP_DIR"
    echo "✅ 备份完成：$BACKUP_DIR"
else
    echo "⚠️  部署目录不存在，跳过备份"
fi
echo ""

# 部署新版本
echo "🚀 部署新版本..."
mkdir -p "$DEPLOY_DIR"
cp -r "$PROJECT_DIR/dist/"* "$DEPLOY_DIR/"
echo "✅ 部署完成"
echo ""

# 验证部署
echo "🔍 验证部署..."
if [ -f "$DEPLOY_DIR/index.html" ]; then
    echo "✅ index.html 存在"
else
    echo "❌ 错误：index.html 不存在"
    exit 1
fi

if [ -d "$DEPLOY_DIR/assets" ]; then
    echo "✅ assets 目录存在"
else
    echo "❌ 错误：assets 目录不存在"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ 部署成功！"
echo "=========================================="
echo ""
echo "部署信息："
echo "  - 项目目录：$PROJECT_DIR"
echo "  - 部署目录：$DEPLOY_DIR"
echo "  - 备份目录：$BACKUP_DIR"
echo ""
echo "访问地址：https://bocail.com"
echo ""
echo "如需回滚，运行："
echo "  rm -rf $DEPLOY_DIR/*"
echo "  cp -r $BACKUP_DIR/* $DEPLOY_DIR/"
echo ""
