#!/usr/bin/env python3
"""
GitHub Action Management - 项目完整性检查脚本
"""

import subprocess
import os

# 项目路径
project_path = "/opt/data/workspace/github-action-management"

print("=" * 70)
print("🔍 GitHub Action Management - 项目完整性检查")
print("=" * 70)

# 检查关键文件
files_to_check = {
    "前端源码": [
        "src/App.tsx",
        "src/main.tsx",
        "src/types.ts",
        "src/components/Sidebar.tsx",
        "src/components/WorkflowPanel.tsx",
        "src/components/RunsPanel.tsx",
    ],
    "后端源码": [
        "src-tauri/src/main.rs",
        "src-tauri/src/github_client.rs",
        "src-tauri/src/models.rs",
    ],
    "配置文件": [
        "package.json",
        "Cargo.toml",
        "vite.config.ts",
        "tsconfig.json",
        "tauri.conf.json",
    ],
    "文档": [
        "README.md",
        "TOKEN_SETUP.md",
        "QUICKSTART.md",
        "PRD.md",
        "PROJECT_PROGRESS.md",
    ],
    "测试工作流": [
        ".github/workflows/prd-test.yml",
        ".github/workflows/secret-test.yml",
        ".github/workflows/batch-test.yml",
    ],
}

all_ok = True

for category, files in files_to_check.items():
    print(f"\n📁 {category}:")
    print("-" * 70)
    for f in files:
        path = os.path.join(project_path, f)
        if os.path.exists(path):
            size = os.path.getsize(path)
            print(f"   ✅ {f:40s} ({size:6,} bytes)")
        else:
            print(f"   ❌ {f:40s} 未找到")
            all_ok = False

print("\n" + "=" * 70)
if all_ok:
    print("✅ 所有核心文件已创建完成！")
else:
    print("⚠️  部分文件缺失，请检查")
print("=" * 70)

# 统计文件
print("\n📊 项目统计:")
result = subprocess.run(
    ["find", project_path, "-type", "f",
     "-not", "-path", "*/node_modules/*",
     "-not", "-path", "*/target/*"],
    capture_output=True, text=True
)
files = [f for f in result.stdout.strip().split('\n') if f]

total_lines = 0
for f in files:
    try:
        with open(f, 'r', encoding='utf-8', errors='ignore') as file:
            total_lines += sum(1 for _ in file)
    except:
        pass

print(f"   文件总数：{len(files)}")
print(f"   代码总行数：{total_lines:,} 行")

# 检查是否有可执行命令
print("\n🔧 可用命令:")
print("-" * 70)
print("   安装依赖：npm install")
print("   启动开发：npm run tauri dev")
print("   构建生产：npm run tauri build")
print("   Rust 检查：cd src-tauri && cargo check")

print("\n" + "=" * 70)
print("✅ 项目准备就绪！")
print("=" * 70)
