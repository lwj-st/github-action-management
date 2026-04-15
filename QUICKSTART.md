# 快速启动指南

## 🚀 第一次使用

### 1. 环境准备

确保已安装以下工具：

```bash
# 检查 Node.js (需要 18+)
node --version

# 检查 Rust (需要 1.70+)
cargo --version

# 安装 Tauri CLI (仅第一次需要)
cargo install tauri-cli
```

### 2. 安装项目依赖

```bash
cd /opt/data/workspace/github-action-management

# 安装前端依赖
npm install

# 运行设置脚本（可选）
chmod +x setup.sh && ./setup.sh
```

### 3. 启动开发模式

```bash
# 启动开发服务器 + Tauri 应用
npm run tauri dev
```

### 4. 配置 GitHub Token

1. 按照 [TOKEN_SETUP.md](./TOKEN_SETUP.md) 创建 PAT Token
2. 在应用中点击"+ 添加账户"
3. 输入账户名称和 Token
4. 点击"添加"

### 5. 开始使用

1. 选择已添加的账户
2. 选择要管理的仓库
3. 点击 Workflow 触发运行
4. 查看运行记录和日志

## 📦 构建生产版本

```bash
# 构建 macOS
npm run tauri build

# 构建 Windows
npm run tauri build

# 构建 Linux
npm run tauri build
```

构建产物位于：`src-tauri/target/release/bundle/`

## 🐛 常见问题

### 问题 1: npm install 失败

**解决方案**: 检查 Node.js 版本是否 >= 18

```bash
node --version
# 如果版本过低，请升级 Node.js
```

### 问题 2: Tauri CLI 未找到

**解决方案**: 安装 Tauri CLI

```bash
cargo install tauri-cli
```

### 问题 3: 无法连接 GitHub API

**解决方案**: 
1. 检查 Token 是否正确
2. 检查网络连通性
3. 确认 Token 权限包含 `repo`, `workflow`, `actions`

### 问题 4: 无法看到某些仓库

**解决方案**:
1. 确认您对该仓库有访问权限
2. 确认 Token 有 `repo` 权限
3. 刷新仓库列表

## 📚 详细文档

- [README.md](./README.md) - 完整项目文档
- [TOKEN_SETUP.md](./TOKEN_SETUP.md) - Token 配置指南
- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) - 功能实现状态

## 🎯 测试示例

项目包含测试 Workflow，可用于验证功能：

1. 进入 `https://github.com/lwj-st/github-action-management/tree/main/.github/workflows`
2. 查看 `prd-test.yml`, `secret-test.yml`, `batch-test.yml`
3. 在应用中触发测试

## 💡 下一步

1. 探索所有功能
2. 创建自己的测试 Workflow
3. 阅读 API 文档了解限制
4. 报告问题或提交 PR

## 🆘 获取帮助

- 查看文档
- 查看测试 Workflow
- 检查 GitHub Issues
- 联系作者

---

**祝您使用愉快！** 🎉
