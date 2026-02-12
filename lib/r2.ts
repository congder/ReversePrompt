import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// 初始化R2客户端，配置Cloudflare R2的认证和端点信息
const r2Client = new S3Client({
  region: "auto", // Cloudflare R2无需指定具体区域，使用auto即可
  endpoint: `https://<YOUR_CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`, // 替换为你的Cloudflare账号ID
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/**
 * 上传文件到Cloudflare R2
 * @param bucketName - 目标存储桶名称
 * @param key - 文件在R2中的存储路径/文件名
 * @param body - 文件内容（Buffer、Stream等）
 * @param contentType - 文件MIME类型
 * @returns 上传结果
 */
export async function uploadToR2(
  bucketName: string,
  key: string,
  body: Buffer | Uint8Array | Blob | string,
  contentType: string
) {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  try {
    const response = await r2Client.send(command);
    return { success: true, data: response };
  } catch (error) {
    console.error("R2上传失败:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * 生成R2文件预签名URL（临时访问）
 * @param bucketName - 存储桶名称
 * @param fileKey - 文件在R2中的存储路径
 * @param expiresIn - URL有效期（秒，默认3600秒/1小时）
 * @returns 预签名访问URL
 */
export async function getPresignedR2Url(
  bucketName: string,
  fileKey: string,
  expiresIn: number = 3600
) {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: fileKey,
  });

  const signedUrl = await getSignedUrl(r2Client, command, { expiresIn });
  return signedUrl;
}