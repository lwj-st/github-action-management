# GitHub PAT Token 配置指南

为了使用 GitHub Action Management 应用，您需要创建一个 Personal Access Token (PAT)。

## 创建 Token 步骤

### 1. 访问 Token 设置页面

1. 登录 GitHub
2. 点击右上角头像 → Settings
3. 左侧菜单 → Developer settings
4. 点击 Personal access tokens → Tokens (classic)
5. 点击 Generate new token → Generate new token (classic)

### 2. 配置 Token 权限

为您的 Token 选择以下权限（**必须**）：

- ✅ **repo** - Full control of private repositories
  - 用于访问和管理工作流
  
- ✅ **workflow** - Manage GitHub Actions workflows
  - 用于触发和管理工作流运行
  
- ✅ **actions** - Manage GitHub Actions
  - 用于查看和取消运行

可以根据需要选择其他权限：

- ✅ **read:org** - Read organization membership
  - 用于查看组织下的仓库
  
- ✅ **delete_repo** - Delete repositories
  - 用于删除仓库（可选）

### 3. 生成并保存 Token

1. 输入 Token 名称（例如：`GitHub Action Management`）
2. 选择过期时间（建议 30-90 天）
3. 点击 **Generate token**
4. **立即复制 Token**（只显示一次！）
5. 保存 Token 到安全位置（密码管理器、加密文件等）

### 4. 在应用中配置

1. 打开 GitHub Action Management 应用
2. 点击 "+ 添加账户"
3. 输入：
   - 账户名称：自定义（例如：`我的 GitHub`）
   - Token：粘贴刚才复制的 PAT Token
4. 点击 "添加"

## Token 安全建议

### ✅ 推荐做法

1. **使用最小权限原则** - 只授予必要的权限
2. **定期轮换** - 每 30-90 天更换一次 Token
3. **安全存储** - 使用密码管理器或加密文件存储
4. **限制使用范围** - 可以为不同应用使用不同的 Token
5. **监控使用** - 定期检查 Token 使用情况

### ❌ 避免做法

1. 不要在代码仓库中硬编码 Token
2. 不要将 Token 分享给他人
3. 不要使用过长的过期时间（如永久有效）
4. 不要在公共场合（如论坛、截图）显示 Token

## Token 管理

### 查看现有 Token

1. Settings → Developer settings → Personal access tokens
2. 可以看到所有已创建的 Token 列表
3. 显示最后使用时间和状态

### 吊销 Token

1. 在 Token 列表中找到要吊销的 Token
2. 点击 Token 名称查看详情
3. 点击 **Delete** 按钮
4. 确认删除

### 轮换 Token

1. 创建新的 Token（按上述步骤）
2. 在新应用中配置新 Token
3. 验证新 Token 工作正常
4. 吊销旧 Token

## 常见问题

### Q: Token 失效怎么办？

A: 检查 Token 是否过期或被吊销。重新创建一个新的 Token 并更新配置。

### Q: 提示 "Bad credentials" 怎么办？

A: 检查 Token 是否正确复制（不要有多余空格），确认 Token 未过期。

### Q: 无法看到某些仓库？

A: 确认 Token 有 `repo` 权限，并且您对该仓库有访问权限。

### Q: 提示 "Resource not accessible by integration"？

A: 确认 Token 有 `workflow` 和 `actions` 权限。

## 高级配置

### 使用 OAuth Apps（推荐用于企业）

对于企业用户，建议使用 OAuth App 替代 PAT：

1. Settings → Developer settings → OAuth Apps
2. 点击 New OAuth App
3. 配置回调 URL 和基本信息
4. 使用客户端 ID 和密钥进行认证

### 使用 GitHub App（推荐用于生产）

对于生产环境，推荐使用 GitHub App：

1. 在 GitHub Marketplace 创建 GitHub App
2. 配置 webhook 和权限
3. 安装到仓库/组织
4. 使用安装令牌进行认证

## 安全警告

⚠️ **重要提醒**：

1. Token 拥有与您账户相同的权限
2. **泄露的 Token 等同于您的账户密码**
3. 一旦发现 Token 泄露，立即吊销并重新创建
4. 不要在任何公共场合分享 Token

## 技术支持

如有问题，请查看：

- [GitHub 官方文档](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [PAT 安全最佳实践](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-personal-access-tokens)
