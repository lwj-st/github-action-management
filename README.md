# GitHub Action Management

跨平台 GitHub Actions 桌面工作台，基于 `Tauri + React + TypeScript + Rust`。当前版本重点完成这些真实可用能力：

- 多账户接入，Token 使用本地 SQLite 数据库文件保存
- 仓库检索与 Workflow 列表拉取
- 读取仓库内 workflow YAML，解析 `workflow_dispatch.inputs`
- 触发 workflow、刷新运行记录、取消运行、重跑全部、重跑失败 Job
- 聚合 Run / Job / Artifact / 日志 / 审计记录
- 下载 Artifact 到本机 `Downloads/github-actions-artifacts/`
- 导出运行报告为 `Markdown` 或 `JSON`
- 本地 UI 亮暗主题、参数预设保存、三栏工作台布局

## 技术栈

- 前端：`React 18`、`TypeScript`、`Vite`
- 桌面容器：`Tauri 1`
- 后端：`Rust`、`reqwest`、`serde_yaml`、`rusqlite`
- 测试：`Vitest`、`cargo test`

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 前端验证

```bash
npm run typecheck
npm test
npm run build
```

### 3. 后端验证

```bash
cd src-tauri
cargo test
cargo check
```

### 4. 启动桌面应用

```bash
npm run tauri:dev
```

## 如何使用

### 1. 添加账户

- 打开应用后，在左侧点击 `添加账户`
- 输入自定义账户名称
- 输入 GitHub PAT
- 建议最小权限：
  - `repo`
  - `workflow`
  - `actions`

### 2. 选择仓库

- 选择账户后，应用会拉取当前账户可访问仓库
- 可按 `仓库名` 搜索

### 3. 触发 Workflow

- 选择一个仓库
- 选择一个支持 `workflow_dispatch` 的 workflow
- 填写 `Ref / Branch / SHA`
- 填写动态解析出的参数表单
- 在参数区底部点击 `立即触发`

### 4. 查看运行详情

- 在中间列选择一条运行记录
- 右侧查看：
  - Summary
  - Jobs
  - Artifacts
  - 日志
  - 审计轨迹

### 5. 下载与导出

- 点击 Artifact 的 `下载`
- 点击 `导出 Markdown` 或 `导出 JSON`

默认输出位置：

- Artifact 下载目录：
  `/Users/<你的用户名>/Downloads/github-actions-artifacts/`
- 运行报告目录：
  `/Users/<你的用户名>/Downloads/github-actions-artifacts/reports/`

## 构建可直接执行的应用程序

### macOS

```bash
npm run tauri:build:mac
```

构建成功后，发版分发产物位于：

- `src-tauri/target/release/bundle/dmg/*.dmg`

如果你只想本地直接运行 `.app` 做调试，也可以执行：

```bash
npm run tauri:build
```

对应应用位于：

- [GitHub Action Management.app](/Users/liwenjian1.vendor/Documents/New%20project/github-action-management/src-tauri/target/release/bundle/macos/GitHub%20Action%20Management.app)

说明：

- 这是 macOS `.app`，可以直接双击运行
- Release 分发现在改为 `.dmg`
- 如果后续需要签名和公证，再补证书与 notarization 流程

### Windows

在 Windows 机器上执行：

```bash
npm install
npm run tauri:build
```

也可以只构建 Windows 安装器：

```bash
npm run tauri:build:windows
```

前提：

- 安装 Node.js 20+
- 安装 Rust stable MSVC toolchain
- 安装 Visual Studio Build Tools 2022
- 安装 WebView2 Runtime

## 测试与 CI

本仓库已添加 GitHub Actions CI：

- 文件：`.github/workflows/ci.yml`
- 流程包含：
  - `npm ci`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `cargo test`
  - `cargo check`
  - `npm run tauri:build`

## GitHub Release 发版

已经支持通过 GitHub Release 分发应用。

### 自动发版方式

推送版本标签即可自动发布：

```bash
git tag v1.0.1
git push origin v1.0.1
```

触发后会执行：

- macOS 构建并上传 `.dmg`
- Windows 构建并上传 `NSIS .exe` 安装器

工作流文件：

- `.github/workflows/release.yml`

### 用户下载方式

以后你可以直接让用户去仓库的 `Releases` 页面下载：

- macOS：下载 `.dmg`，打开后拖入 `Applications`
- Windows：下载 `.exe` 安装器，直接安装

### 发版前建议

- 先在本地跑：
  - `npm run typecheck`
  - `npm test`
  - `npm run tauri:build`
- 确认版本号和 Release Notes
- 再打 tag

## 当前限制

- Workflow Summary 目前基于 Run / Job / Artifact 信息聚合，不是直接读取 `GITHUB_STEP_SUMMARY` 原文
- Token 默认保存到本地 SQLite 数据库文件，不再依赖系统钥匙串
- macOS 与 Windows 统一使用同一套本地数据库存储逻辑，避免因钥匙串/凭据管理器权限导致无法添加账户
- Token 数据库位置：
  - macOS: `~/Library/Application Support/github-action-management/tokens.db`
  - Windows: `%APPDATA%/github-action-management/tokens.db`
- 当前实现侧重可用性，Token 会写入本地 SQLite 文件；如果后续需要更强保护，可以再加主密码或文件级加密
- PDF 导出尚未接入，当前导出格式为 `Markdown` 和 `JSON`

## 目录说明

```text
github-action-management/
├── src/                    # React 前端
├── src-tauri/              # Tauri / Rust 后端
├── .github/workflows/      # CI 与测试 workflow
└── .cargo/config.toml      # Cargo 国内镜像配置
```
