import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "未上传文件" }, { status: 400 });
    }

    // 将文件转换为Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 调用R2上传函数，替换为你的实际存储桶名称
    const result = await uploadToR2(
      "your-bucket-name",
      `${Date.now()}-${file.name}`, // 生成唯一文件名避免重复
      buffer,
      file.type
    );

    if (result.success) {
      return NextResponse.json({
        message: "文件上传成功",
        fileKey: `${Date.now()}-${file.name}`,
      });
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (error) {
    console.error("API处理错误:", error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 }
    );
  }
}