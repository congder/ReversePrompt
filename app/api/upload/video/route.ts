import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { newStorage } from '@/lib/storage';
import { log, logError } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "未上传文件" }, { status: 400 });
    }

    // 验证文件类型
    if (!file.type.startsWith('video/')) {
      return NextResponse.json({ error: "只支持视频文件" }, { status: 400 });
    }

    // 验证文件大小（200MB）
    const maxSize = 200 * 1024 * 1024; // 200MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "文件大小不能超过200MB" }, { status: 400 });
    }

    log('[Video Upload] 开始上传视频:', {
      user: session.user.email,
      filename: file.name,
      size: file.size,
      type: file.type
    });

    // 使用存储服务上传到R2
    const storage = newStorage();

    // 生成存储路径
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const timestamp = now.getTime();
    const random = Math.random().toString(36).substring(2, 15);
    const extension = file.name.split('.').pop() || 'mp4';
    const filename = `${timestamp}-${random}.${extension}`;
    const key = `uploads/videos/${year}/${month}/${day}/${filename}`;

    // 将文件转换为Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 上传到R2
    const result = await storage.uploadFile({
      body: buffer,
      key,
      contentType: file.type,
      disposition: 'inline'
    });

    log('[Video Upload] 视频上传成功:', {
      url: result.url,
      key,
      size: file.size
    });

    return NextResponse.json({
      message: "视频上传成功",
      url: result.url,
      key,
      filename: file.name
    });

  } catch (error: any) {
    logError('[Video Upload] 上传失败:', error);
    return NextResponse.json(
      { error: error.message || "服务器内部错误" },
      { status: 500 }
    );
  }
}