import { NextRequest, NextResponse } from "next/server";
import { evolinkVideoAxios } from "@/lib/axios-config";
import { log, logError } from "@/lib/logger";
import { auth } from "@/auth";
import { cosUploadService } from "@/lib/cos-upload";

// 视频生成 API 端点
export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 解析请求体
    const body = await request.json();
    const { prompt, model = 'veo3.1-pro', aspectRatio = 'auto', quality = '720p', generationType = 'TEXT', imageUrls = [] } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 上传参考图片到 COS（如果有）
    let uploadedImageUrls: string[] = [];
    if (imageUrls && imageUrls.length > 0) {
      console.log('[VideoGenerate] 上传参考图片到 COS');

      for (const imageUrl of imageUrls) {
        try {
          const uploadType: "avatar-training/image" = "avatar-training/image";
          const uploadedUrl = await cosUploadService.uploadFileWithRetry(imageUrl, uploadType);
          uploadedImageUrls.push(uploadedUrl);
        } catch (uploadError: any) {
          logError('[VideoGenerate] 图片上传失败:', uploadError);
          // 继续处理其他图片，但记录错误
        }
      }
    }

    // 调用 Evolink 视频生成 API
    log('[VideoGenerate] 调用 Evolink 视频生成 API');

    const requestBody = {
      model,
      prompt,
      aspect_ratio: aspectRatio,
      quality,
      generation_type: generationType,
      image_urls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined
    };

    const response = await evolinkVideoAxios.post('/v1/videos/generations', requestBody);

    log('[VideoGenerate] Evolink 响应:', response.data);

    // 返回任务信息，让前端进行轮询
    return NextResponse.json({
      code: 1000,
      message: "success",
      data: response.data
    });

  } catch (error: any) {
    logError('[VideoGenerate] 错误:', error);
    const errorData = error.response?.data?.error || {};
    return NextResponse.json(
      {
        code: error.response?.status || 500,
        message: errorData.message || error.message || '视频生成失败',
        error: errorData
      },
      { status: error.response?.status || 500 }
    );
  }
}