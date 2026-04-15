#!/bin/bash

# GitHub Action Management 项目设置脚本

set -e

echo "🚀 GitHub Action Management - 项目设置"
echo "======================================"
echo ""

# 检查 Node.js 版本
echo "📦 检查 Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo "✓ Node.js 已安装：$NODE_VERSION"
else
    echo "✗ Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi

# 检查 Rust 版本
echo "🦀 检查 Rust..."
if command -v cargo &> /dev/null; then
    RUST_VERSION=$(cargo --version)
    echo "✓ Rust 已安装：$RUST_VERSION"
else
    echo "✗ Rust 未安装，请先安装 Rust"
    echo "  安装命令：curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

# 检查 Tauri CLI
echo "🔨 检查 Tauri CLI..."
if command -v tauri &> /dev/null; then
    TAURI_VERSION=$(tauri --version)
    echo "✓ Tauri CLI 已安装：$TAURI_VERSION"
else
    echo "⚠️ Tauri CLI 未安装，正在安装..."
    cargo install tauri-cli
fi

# 安装前端依赖
echo ""
echo "📦 安装前端依赖..."
npm install

# 显示构建说明
echo ""
echo "✅ 项目设置完成！"
echo ""
echo "📝 下一步:"
echo "  1. 启动开发模式：npm run tauri dev"
echo "  2. 构建生产版本：npm run tauri build"
echo ""
echo "📖 更多说明请查看 README.md"
echo ""
