# 快速开始: R2 存储配置

本项目现在支持将 AI 生成的图片和视频自动保存到 Cloudflare R2 存储。

## 第一步: 创建 R2 存储桶

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 点击左侧菜单 **R2 Object Storage**
3. 点击 **Create bucket** 按钮
4. 输入存储桶名称,例如: `ai-image-storage`
5. 点击 **Create bucket**

## 第二步: 生成 API Token

1. 在 R2 页面,点击右上角 **Manage R2 API Tokens**
2. 点击 **Create API Token**
3. 填写信息:
   - Token name: `ai-image-saas`
   - Permissions: 选择 **Object Read & Write**
   - Bucket scope: 选择你刚创建的存储桶
4. 点击 **Create API Token**
5. **立即复制**以下信息 (只会显示一次!):
   - Access Key ID
   - Secret Access Key
   - Account ID (在页面顶部)

## 第三步: 配置环境变量

在项目根目录创建 `.env.local` 文件 (如果不存在),添加:

```env
# 格式: https://{你的Account ID}.r2.cloudflarestorage.com
STORAGE_ENDPOINT = "https://abc123def456.r2.cloudflarestorage.com"

# 固定为 auto
STORAGE_REGION = "auto"

# 你的 Access Key ID
STORAGE_ACCESS_KEY = "your-access-key-id-here"

# 你的 Secret Access Key
STORAGE_SECRET_KEY = "your-secret-access-key-here"

# 你的存储桶名称
STORAGE_BUCKET = "ai-image-storage"

# 可选: 自定义域名 (如果没有配置,可以留空)
STORAGE_DOMAIN = ""
```

**重要提示**:
- 将 `abc123def456` 替换为你的 Account ID
- 将 `your-access-key-id-here` 替换为你的 Access Key ID
- 将 `your-secret-access-key-here` 替换为你的 Secret Access Key
- 将 `ai-image-storage` 替换为你的存储桶名称

## 第四步: 测试配置

1. 启动开发服务器:
```bash
pnpm dev
```

2. 在浏览器登录应用:
```
http://localhost:3006/auth/signin
```

3. 访问测试 API:
```
http://localhost:3006/api/storage/test
```

如果配置正确,你会看到:
```json
{
  "code": 1000,
  "message": "R2 配置测试成功",
  "data": {
    "config": {...},
    "testFile": {
      "url": "https://your-account.r2.cloudflarestorage.com/test/..."
    }
  }
}
```

## 第五步: 测试图片生成

1. 访问图片生成页面:
```
http://localhost:3006/txt-to-image/nano-banana
```

2. 输入提示词并生成图片

3. 查看生成的图片 URL:
   - 应该指向你的 R2 域名
   - 格式类似: `https://your-account.r2.cloudflarestorage.com/ai-generated/images/2024/...`

## 可选: 配置自定义域名

使用自定义域名让 URL 更友好:

1. 在 R2 存储桶页面,点击 **Settings**
2. 找到 **Custom Domains** 部分
3. 点击 **Connect Domain**
4. 输入你的域名,例如: `r2.yourdomain.com`
5. 按照提示添加 DNS 记录
6. 等待生效后,更新 `.env.local`:
```env
STORAGE_DOMAIN = "https://r2.yourdomain.com"
```

## 完成!

现在所有 AI 生成的图片都会自动保存到你的 R2 存储桶。

## 需要帮助?

- 详细配置指南: [docs/R2_SETUP.md](./R2_SETUP.md)
- 实现说明: [docs/R2_IMPLEMENTATION.md](./R2_IMPLEMENTATION.md)
- 项目文档: [CLAUDE.md](../CLAUDE.md)

## 故障排查

### 测试 API 返回 "R2 配置不完整"
- 检查 `.env.local` 是否正确配置
- 重启开发服务器

### 上传失败,返回 "Endpoint 配置错误"
- 检查 `STORAGE_ENDPOINT` 格式是否正确
- 确认 Account ID 是否正确

### 上传失败,返回 "API 凭据错误"
- 检查 Access Key ID 和 Secret Access Key
- 确认 Token 权限包含 Object Write

### 上传失败,返回 "存储桶配置错误"
- 检查存储桶名称是否正确
- 确认存储桶已创建
- 确认 Token 权限包含该存储桶
