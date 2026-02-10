# Cloudflare R2 存储配置指南

本项目使用 Cloudflare R2 作为 AI 生成图片和视频的存储服务。R2 兼容 AWS S3 API,提供零出站费用的对象存储。

## 为什么使用 R2?

- **零出站费用**: 不像 S3,R2 不收取出站流量费用
- **S3 兼容**: 无缝集成现有的 S3 工具和 SDK
- **全球 CDN**: 自动分发到 Cloudflare 全球网络
- **低成本**: 存储费用比 S3 便宜约 90%

## 配置步骤

### 1. 创建 Cloudflare R2 存储桶

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 导航至 **R2 Object Storage**
3. 点击 **Create bucket**
4. 输入存储桶名称 (例如: `ai-image-saas-storage`)
5. 选择区域 (推荐: Automatic)
6. 点击 **Create bucket**

### 2. 创建 R2 API Token

1. 在 R2 页面,点击 **Manage R2 API Tokens**
2. 点击 **Create API Token**
3. 配置权限:
   - **Token name**: `ai-image-saas-token`
   - **Permissions**:
     - ✅ Object Read & Write
     - ✅ (可选) Object List
   - **TTL**: 根据需要设置 (推荐: Forever)
   - **Bucket scope**:
     - 选择 **Apply to specific buckets only**
     - 选择刚创建的存储桶
4. 点击 **Create API Token**
5. **重要**: 立即复制并保存以下信息:
   - `Access Key ID`
   - `Secret Access Key`
   - `Account ID`

> ⚠️ **警告**: Secret Access Key 只会显示一次,请妥善保存!

### 3. 配置自定义域名 (可选但推荐)

使用自定义域名可以让 R2 的公开 URL 更友好,并且支持 HTTPS。

1. 在存储桶详情页,点击 **Settings** → **Custom Domains**
2. 点击 **Connect Domain**
3. 输入你的域名 (例如: `r2.yourdomain.com`)
4. 按照提示添加 DNS 记录:
   - **Type**: CNAME
   - **Name**: `r2` (或你的子域名)
   - **Target**: Cloudflare 提供的域名
5. 等待 DNS 传播 (通常几分钟)
6. 完成后,你的存储桶将通过 `https://r2.yourdomain.com` 访问

### 4. 配置环境变量

在项目根目录的 `.env.local` 文件中添加以下配置:

```env
# -----------------------------------------------------------------------------
# Storage with Cloudflare R2 (兼容 S3 API)
# -----------------------------------------------------------------------------

# R2 Endpoint (格式: https://{account_id}.r2.cloudflarestorage.com)
STORAGE_ENDPOINT = "https://your-account-id.r2.cloudflarestorage.com"

# R2 Region (固定为 auto)
STORAGE_REGION = "auto"

# R2 API Token 凭据
STORAGE_ACCESS_KEY = "your-access-key-id"
STORAGE_SECRET_KEY = "your-secret-access-key"

# R2 存储桶名称
STORAGE_BUCKET = "ai-image-saas-storage"

# R2 公开访问域名 (如果配置了自定义域名,使用自定义域名;否则使用 R2 默认域名)
STORAGE_DOMAIN = "https://r2.yourdomain.com"
```

### 5. 验证配置

1. 重启开发服务器:
   ```bash
   pnpm dev
   ```

2. 检查控制台输出,应该能看到 Storage 初始化日志

3. 测试图片生成功能:
   - 访问 `/txt-to-image/nano-banana`
   - 输入提示词并生成图片
   - 检查返回的图片 URL 是否指向你的 R2 域名

## 存储路径结构

生成的文件按以下结构组织:

```
ai-generated/
  ├── images/
  │   ├── 2024/
  │   │   ├── 01/
  │   │   │   ├── 15/
  │   │   │   │   ├── 1737000000000-abc123def.png
  │   │   │   │   └── 1737000001000-xyz789ghi.jpg
  │   │   │   └── 16/
  │   │   └── 02/
  │   └── 2025/
  └── videos/
      └── 2024/
          └── 01/
              └── 15/
                  └── 1737000000000-abc123def.mp4
```

- **按年月日组织**: 便于管理和清理旧文件
- **唯一文件名**: 时间戳 + 随机字符串,避免冲突
- **类型分离**: 图片和视频分开存储

## 成本估算

基于 Cloudflare R2 的定价 (截至 2024 年):

- **存储**: $0.015/GB/月
- **Class A 操作** (写入): $4.50/百万次
- **Class B 操作** (读取): $0.36/百万次
- **出站流量**: **$0** (完全免费!)

**示例**: 假设每月生成 10,000 张图片,每张 2MB:

- 存储: 20GB × $0.015 = **$0.30/月**
- 写入: 10,000 次 × $4.50/1,000,000 = **$0.045/月**
- 读取: 100,000 次 × $0.36/1,000,000 = **$0.036/月**
- 出站流量: **$0**

**总计**: 约 **$0.38/月**

对比 AWS S3,相同场景可能需要 $5-10/月 (主要是出站流量费用)。

## 常见问题

### Q: R2 支持哪些文件类型?

A: R2 支持所有文件类型。本项目主要存储:
- 图片: PNG, JPG, WebP, GIF
- 视频: MP4, WebM, MOV

### Q: 如何设置文件过期自动删除?

A: 在 R2 存储桶设置中配置 **Lifecycle Rules**:

1. 进入存储桶 → **Settings** → **Lifecycle Rules**
2. 创建规则:
   - **Rule name**: `delete-old-images`
   - **Prefix**: `ai-generated/images/`
   - **Action**: Delete
   - **Days after creation**: 90 (根据需要调整)

### Q: R2 有存储容量限制吗?

A: 没有硬性限制。免费套餐包含:
- 10 GB 存储/月
- 1 百万 Class A 操作/月
- 10 百万 Class B 操作/月

超出部分按使用量计费。

### Q: 如何备份 R2 数据?

A: 使用 `rclone` 工具:

```bash
# 安装 rclone
brew install rclone  # macOS
# 或 apt install rclone  # Linux

# 配置 R2
rclone config

# 同步到本地
rclone sync r2:your-bucket ./backup
```

### Q: R2 支持 CDN 加速吗?

A: 是的! R2 自动集成 Cloudflare CDN。如果使用自定义域名,文件会自动通过 Cloudflare 全球网络分发。

### Q: 如何监控 R2 使用情况?

A: 在 Cloudflare Dashboard 的 R2 页面可以查看:
- 存储使用量
- API 调用次数
- 流量统计

## 技术实现

### 使用现有的 Storage 类

项目已经实现了通用的 `Storage` 类 (`lib/storage.ts`),兼容 S3/R2:

```typescript
import { newStorage } from '@/lib/storage';

// 初始化 (自动从环境变量读取配置)
const storage = newStorage();

// 上传 Buffer
await storage.uploadFile({
  body: buffer,
  key: 'ai-generated/images/2024/01/15/image.png',
  contentType: 'image/png',
  disposition: 'inline'
});

// 从 URL 下载并上传
await storage.downloadAndUpload({
  url: 'https://example.com/image.png',
  key: 'ai-generated/images/2024/01/15/image.png',
  contentType: 'image/png'
});
```

### 自动上传逻辑

当 AI 生成任务完成时,系统会自动:

1. 从 AI 提供商 URL 下载生成结果
2. 上传到 R2 存储桶
3. 返回 R2 公开 URL 给前端
4. 保留原始 URL 作为备份

相关代码: `app/api/ai/evolink/task/[taskId]/route.ts`

## 安全建议

1. **不要提交 `.env.local`**: 确保它在 `.gitignore` 中
2. **使用最小权限**: API Token 只授予必要的权限
3. **启用 CORS**: 如果需要前端直传,在 R2 设置中配置 CORS
4. **定期轮换密钥**: 每 3-6 个月更新一次 API Token

## 参考资料

- [Cloudflare R2 官方文档](https://developers.cloudflare.com/r2/)
- [R2 S3 API 兼容性](https://developers.cloudflare.com/r2/api/s3/api/)
- [R2 定价](https://developers.cloudflare.com/r2/pricing/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)

---

**最后更新**: 2024-02-06
