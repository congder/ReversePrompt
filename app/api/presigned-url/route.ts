import { NextRequest, NextResponse } from "next/server";
import { getPresignedR2Url } from "@/lib/r2";

export async function GET(request: NextRequest) {
  const fileKey = request.nextUrl.searchParams.get("fileKey");
  if (!fileKey) {
    return NextResponse.json({ error: "缺少fileKey参数" }, { status: 400 });
  }

  try {
    const signedUrl = await getPresignedR2Url("your-bucket-name", fileKey);
    return NextResponse.json({ signedUrl });
  } catch (error) {
    return NextResponse.json(
      { error: "生成预签名URL失败" },
      { status: 500 }
    );
  }
}