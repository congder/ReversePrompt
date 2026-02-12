import { NextRequest, NextResponse } from 'next/server';
import { evolinkAxios } from '@/lib/axios-config';
import { log, logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // 测试 Evolink API 连接
    const response = await evolinkAxios.get('/v1/models');

    log('[Evolink Test] API 连接成功:', response.data);

    return NextResponse.json({
      code: 1000,
      message: 'success',
      data: response.data
    });
  } catch (error: any) {
    logError('[Evolink Test] API 连接失败:', error);
    const errorData = error.response?.data?.error || {};
    return NextResponse.json(
      {
        code: error.response?.status || 500,
        message: errorData.message || error.message || '测试失败',
        error: errorData
      },
      { status: error.response?.status || 500 }
    );
  }
}