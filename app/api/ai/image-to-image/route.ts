import { NextRequest, NextResponse } from "next/server";
import { evolinkAxios } from "@/lib/axios-config";
import { log, logError } from "@/lib/logger";
import { auth } from "@/auth";
import { cosUploadService } from "@/lib/cos-upload";

// 图生图 API 端点
export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 解析表单数据
    const formData = await request.formData();
    const image = formData.get("image") as File;
    const prompt = formData.get("prompt") as string;
    const model = formData.get("model") as string;
    const aspectRatio = formData.get("aspectRatio") as string;

    if (!image || !prompt || !model) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 上传图片到 COS
    const uploadType: "avatar-training/image" = "avatar-training/image";
    const imageUrl = await cosUploadService.uploadFileWithRetry(image, uploadType);

    // 调用 Evolink 图生图 API
    log('[ImageToImage] 调用 Evolink 图生图 API');

    const requestBody = {
      model: 'nano-banana-2-lite',
      prompt,
      size: aspectRatio,
      image_urls: [imageUrl]
    };

    const response = await evolinkAxios.post('/v1/images/generations', requestBody);

    log('[ImageToImage] Evolink 响应:', response.data);

    // 返回任务信息，让前端进行轮询
    return NextResponse.json({
      code: 1000,
      message: "success",
      data: response.data
    });

  } catch (error: any) {
    logError('[ImageToImage] 错误:', error);
    const errorData = error.response?.data?.error || {};
    return NextResponse.json(
      {
        code: error.response?.status || 500,
        message: errorData.message || error.message || '图生图生成失败',
        error: errorData
      },
      { status: error.response?.status || 500 }
    );
  }
}