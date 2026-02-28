#!/bin/bash

# Git 提交脚本
# 用途：提交所有修改到新的远程仓库
# 使用方法：bash GIT_COMMIT.sh "提交信息"

set -e  # 遇到错误立即退出

echo "=========================================="
echo "Git 提交脚本"
echo "=========================================="
echo ""

# 检查是否提供了提交信息
if [ -z "$1" ]; then
    echo "❌ 错误：请提供提交信息"
    echo "使用方法：bash GIT_COMMIT.sh \"提交信息\""
    exit 1
fi

COMMIT_MESSAGE="$1"

# 显示当前远程仓库
echo "📍 当前远程仓库："
git remote -v
echo ""

# 显示当前分支
echo "🌿 当前分支："
git branch
echo ""

# 添加所有修改
echo "📦 添加所有修改..."
git add -A
echo "✅ 完成"
echo ""

# 显示将要提交的文件
echo "📝 将要提交的文件："
git status --short | head -20
echo "..."
echo ""

# 提交
echo "💾 提交修改..."
git commit -m "$COMMIT_MESSAGE"
echo "✅ 完成"
echo ""

# 推送到远程仓库
echo "🚀 推送到远程仓库..."
git push origin main
echo "✅ 完成"
echo ""

echo "=========================================="
echo "✅ 提交成功！"
echo "=========================================="
echo ""
echo "远程仓库：https://github.com/xiehaibo11/VITUFINANCE-vvin.git"
echo ""
