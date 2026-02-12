import { NextRequest, NextResponse } from 'next/server';

// 调试端点
export async function GET() {
  try {
    const { EVOLINK_API_KEY, EVOLINK_VIDEO_API_KEY, EVOLINK_VIDEO_3_1FAST_API_KEY } = process.env;

    return NextResponse.json({
      status: 'ok',
      env: {
        EVOLINK_API_URL: process.env.EVOLINK_API_URL,
        EVOLINK_API_KEY: !!EVOLINK_API_KEY,
        EVOLINK_VIDEO_API_KEY: !!EVOLINK_VIDEO_API_KEY,
        EVOLINK_VIDEO_3_1FAST_API_KEY: !!EVOLINK_VIDEO_3_1FAST_API_KEY
      },
      keys: {
        imageKey: EVOLINK_API_KEY?.substring(0, 10) + '...',
        videoKey: EVOLINK_VIDEO_API_KEY?.substring(0, 10) + '...',
        video3_1FastKey: EVOLINK_VIDEO_3_1FAST_API_KEY?.substring(0, 10) + '...'
      },
      message: '调试信息 - 请检查API Key配置'
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: '获取调试信息失败',
      error: error.message
    }, { status: 500 });
  }
}
import { evolinkAxios } from '@/lib/axios-config';
import { log, logError } from '@/lib/logger';
import { auth } from '@/auth';

export async function POST(request: NextRequest) {
  try {
    // 使用 NextAuth 获取 session
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { code: 401, message: '未登录' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      prompt,
      duration = 4,
      aspect_ratio = '16:9',
      quality = '720p',
      image_urls,
      generate_audio = true
    } = body;

    log('[Video Generate] 收到请求:', {
      user: session.user.email,
      prompt,
      duration,
      aspect_ratio,
      quality,
      generate_audio,
      hasImageUrls: !!image_urls
    });

    const requestBody: Record<string, any> = {
      model: 'veo-3.1-fast-generate-preview',
      prompt,
      generation_type: image_urls && image_urls.length > 0 ? 'FIRST&LAST' : 'TEXT',
      aspect_ratio,
      duration,
      quality,
      generate_audio
    };

    console.log('[Video Generate] 请求参数:', {
      model: requestBody.model,
      generation_type: requestBody.generation_type,
      has_images: !!image_urls,
      aspect_ratio: requestBody.aspect_ratio,
      duration: requestBody.duration,
      quality: requestBody.quality
    });

    // 添加可选参数
    if (image_urls && image_urls.length > 0) {
      requestBody.image_urls = image_urls;
    }

    console.log('[Video Generate] 开始处理视频生成请求');

    log('[Video Generate] 调用 Evolink API:', requestBody);

    // 使用evolinkAxios，它已经有正确的认证配置

    const response = await evolinkAxios.post('/v1/videos/generations', requestBody);

    log('[Video Generate] 响应:', response.data);

    return NextResponse.json({
      code: 1000,
      message: 'success',
      data: response.data
    });
  } catch (error: any) {
    logError('[Video Generate] 错误:', error);
    const errorData = error.response?.data?.error || {};

    // 检查是否是401错误，提供更详细的错误信息
    if (error.response?.status === 401) {
      const { EVOLINK_API_KEY, EVOLINK_VIDEO_API_KEY, EVOLINK_VIDEO_3_1FAST_API_KEY } = process.env;
      const activeAPIKey = EVOLINK_VIDEO_3_1FAST_API_KEY || EVOLINK_VIDEO_API_KEY || EVOLINK_API_KEY;

      console.log('[Video Generate] 401错误详情:', {
        url: error.config?.url,
        activeKey: activeAPIKey ? activeAPIKey.substring(0, 10) + '...' : null,
        apiKeys: {
          image: !!EVOLINK_API_KEY,
          video: !!EVOLINK_VIDEO_API_KEY,
          video3_1fast: !!EVOLINK_VIDEO_3_1FAST_API_KEY
        },
        errorData
      });

      return NextResponse.json(
        {
          code: 401,
          message: 'API认证失败',
          error: {
            ...errorData,
            hint: 'API Key认证失败。请检查：',
            checkList: [
              'API Key是否正确配置',
              'API Key是否已启用视频生成权限',
              'API Key是否有足够余额',
              'API Key是否过期'
            ],
            apiKeys: {
              image: !!EVOLINK_API_KEY,
              video: !!EVOLINK_VIDEO_API_KEY,
              video3_1fast: !!EVOLINK_VIDEO_3_1FAST_API_KEY
            }
          }
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        code: error.response?.status || 500,
        message: errorData.message || error.message || '生成失败',
        error: errorData
      },
      { status: error.response?.status || 500 }
    );
  }
}