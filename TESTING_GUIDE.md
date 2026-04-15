# 🧪 GitHub Action Management - 测试验证指南

## 📋 测试前的准备工作

### 1. 需要完整的 GitHub PAT Token

当前提供的 Token 长度不足（49 字符），需要完整的 Token。

**完整 Token 格式应该是**:
```
github_pat_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### 2. Token 权限要求

确保 Token 包含以下权限：
- ✅ `repo` - 访问仓库
- ✅ `workflow` - 管理 Workflows
- ✅ `actions` - 查看和执行 Actions

## 🎯 测试步骤

### 步骤 1: 安装依赖

```bash
cd /opt/data/workspace/github-action-management

# 安装 Node.js 依赖
npm install

# 安装 Rust 依赖（首次需要）
cd src-tauri
cargo check
cd ..
```

### 步骤 2: 启动应用

```bash
npm run tauri dev
```

### 步骤 3: 配置 Token

在应用中：
1. 点击 "+ 添加账户"
2. 输入账户名称（如：`我的 GitHub`）
3. 粘贴完整的 PAT Token
4. 点击 "添加"

### 步骤 4: 测试功能

#### 测试 1: 获取仓库列表
1. 选择已添加的账户
2. 查看仓库列表
3. 应该看到你有权限的所有仓库

#### 测试 2: 查看 Workflows
1. 点击任意仓库
2. 查看该仓库的 Workflows 列表
3. 应该显示所有可用的 Workflow

#### 测试 3: 触发 Workflow
1. 点击某个 Workflow（如 `prd-test.yml`）
2. 填写输入参数：
   - message: 测试消息
   - environment: dev/staging/prod
   - should_fail: false
   - retry_count: 1
3. 点击 "触发 Workflow"
4. 应该显示运行 ID

#### 测试 4: 监控运行
1. 查看运行记录
2. 等待状态变化（queued → in_progress → completed）
3. 状态应该自动更新

#### 测试 5: 查看日志
1. 点击某个运行
2. 展开"查看日志"
3. 应该显示完整的运行日志

#### 测试 6: 运行控制
1. 取消正在运行的 Workflow（如果正在运行）
2. 重新运行失败的 Workflow
3. 重跑失败的作业

## 🔍 代码验证

### Rust 后端代码检查

```bash
cd /opt/data/workspace/github-action-management/src-tauri

# 检查语法
cargo check

# 格式化代码
cargo fmt

# 构建（不打包）
cargo build
```

### 前端代码检查

```bash
cd /opt/data/workspace/github-action-management

# 检查 TypeScript
npx tsc --noEmit
```

## 📊 测试检查清单

- [ ] GitHub API 连接正常
- [ ] 能够获取用户信息
- [ ] 能够获取仓库列表
- [ ] 能够获取 Workflows
- [ ] 能够触发 Workflow
- [ ] 能够查看运行状态
- [ ] 能够获取日志
- [ ] 能够取消/重跑运行

## ⚠️ 已知问题

1. **Token 长度问题**: 当前提供的 Token 被截断，需要完整 Token
2. **YAML 解析简化**: 当前使用简化解析，不是完整的 YAML 解析器
3. **密钥环未集成**: Token 未加密存储到系统密钥环

## 🆘 故障排查

### 问题 1: 401 Unauthorized
**原因**: Token 无效或权限不足
**解决**: 
1. 检查 Token 是否正确
2. 确认 Token 包含 repo, workflow, actions 权限
3. 检查 Token 是否过期

### 问题 2: 403 Forbidden
**原因**: Token 权限不足
**解决**: 创建新的 Token 并包含所需权限

### 问题 3: npm install 失败
**原因**: Node.js 版本过低
**解决**: 升级到 Node.js 18+

### 问题 4: cargo check 失败
**原因**: Rust 版本或依赖问题
**解决**: 
```bash
rustup update
cargo update
```

---

**等待完整 Token 后进行实际测试！**
