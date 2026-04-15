# GitHub Action Management

一款面向开发者与运维团队的轻量级 GitHub Actions 本地管控桌面应用。

## 功能特性

### 核心功能
- ✅ **多账户管理** - 支持添加和管理多个 GitHub 账号（PAT 认证）
- ✅ **仓库检索** - 自动拉取账户下有权限的仓库，支持筛选
- ✅ **Workflow 触发** - 参数化触发，自动解析 workflow_dispatch 输入参数
- ✅ **执行状态监控** - 实时同步运行状态（queued/in_progress/completed 等）
- ✅ **日志查看** - 实时流式拉取 Job/Step 日志，支持关键词过滤
- ✅ **结果获取** - 提取 Summary、输出和制品下载
- ✅ **流程控制** - 随时终止运行、重新运行、重跑失败作业

### 技术特点
- 🎨 **现代化 UI** - 暗色主题，符合 GitHub 设计风格
- 🔐 **安全存储** - 本地加密存储 Token，最小权限原则
- ⚡ **高性能** - 异步 API 调用，智能缓存
- 🖥️ **跨平台** - macOS / Windows 支持

## 技术栈

### 前端
- React 18 + TypeScript
- Vite 构建工具
- 原生 CSS 样式

### 后端
- Rust (Tauri)
- reqwest (HTTP 客户端)
- tokio (异步运行时)

### API
- GitHub REST API
- 支持 Workflow Dispatch、Run 管理、Artifacts 下载

## 开发指南

### 环境要求
- Node.js 18+
- Rust 1.70+
- Tauri CLI

### 安装依赖

```bash
# 前端依赖
npm install

# Rust 依赖会自动在第一次构建时安装
```

### 开发模式

```bash
# 启动开发服务器 + Tauri 应用
npm run tauri dev
```

### 构建发布

```bash
# 构建生产版本
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`

## 使用说明

### 1. 添加 GitHub 账户

1. 点击"+ 添加账户"按钮
2. 输入账户名称（自定义）
3. 输入 GitHub Personal Access Token (PAT)

**Token 权限要求**：
- `repo` - 访问仓库
- `workflow` - 管理 Workflows
- `actions` - 查看和执行 Actions

### 2. 选择仓库

- 自动列出当前账户下有权限的所有仓库
- 点击仓库名称加载该仓库的 Workflows

### 3. 触发 Workflow

1. 点击 Workflow 卡片展开参数表单
2. 填写必要的输入参数
3. 选择分支/Ref
4. 点击"触发 Workflow"按钮

### 4. 监控运行

- 运行列表实时显示最新记录
- 点击运行项查看详情和日志
- 状态自动轮询更新（每 3 秒）

### 5. 运行控制

- **取消运行** - 对 in_progress 状态的运行
- **重新运行** - 重新运行整个 Workflow
- **重跑失败作业** - 只重新运行失败的 Job

## 项目结构

```
github-action-management/
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   │   ├── Sidebar.tsx
│   │   ├── WorkflowPanel.tsx
│   │   └── RunsPanel.tsx
│   ├── App.tsx             # 主应用组件
│   ├── App.css             # 应用样式
│   ├── types.ts            # TypeScript 类型定义
│   ├── main.tsx            # 入口文件
│   └── index.css           # 全局样式
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── main.rs         # Tauri 入口
│   │   ├── models.rs       # 数据模型定义
│   │   └── github_client.rs # GitHub API 客户端
│   ├── Cargo.toml          # Rust 依赖配置
│   └── build.rs            # 构建脚本
├── tauri.conf.json         # Tauri 配置
├── package.json            # Node.js 依赖
├── vite.config.ts          # Vite 配置
└── README.md               # 项目文档
```

## 测试

根据产品需求文档，所有功能都需要通过测试：

### 单元测试
```bash
npm test
```

### E2E 测试
```bash
npm run test:e2e
```

### 测试 workflow

可以创建测试 workflow 在仓库中进行验证：

```yaml
# .github/workflows/test-prd.yml
name: PRD Test

on:
  workflow_dispatch:
    inputs:
      message:
        description: '测试消息'
        required: true
        type: string
      environment:
        description: '测试环境'
        required: true
        type: choice
        options:
          - dev
          - staging
          - prod

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Display message
        run: echo "${{ github.event.inputs.message }}"
      - name: Test environment
        run: echo "Running on ${{ github.event.inputs.environment }}"
      - name: Success marker
        run: echo "PRD test passed!" >> $GITHUB_STEP_SUMMARY
```

## 安全说明

1. **Token 存储** - Token 存储在应用本地，不会上传到任何服务器
2. **最小权限** - 仅申请必要的 API 权限
3. **本地运行** - 默认纯本地运行，无云端同步
4. **审计日志** - 可记录操作时间戳

## Roadmap

### V1.0 MVP
- [x] 多账户登录
- [x] 仓库列表
- [x] 手动触发
- [x] 基础状态监控
- [x] 暗色 UI
- [x] mac/win 打包

### V1.1 参数&结果
- [ ] YAML 参数自动解析
- [ ] 表单生成
- [ ] 日志实时流
- [ ] Summary/制品下载
- [ ] 取消功能

### V1.2 安全&测例
- [ ] 本地密钥环
- [ ] 操作审计
- [ ] 用户侧验证测例
- [ ] 快捷键/托盘

## 许可证

MIT License

## 联系方式

- 作者：lwj-st
- 仓库：https://github.com/lwj-st/github-action-management
