import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { newStorage } from '@/lib/storage';
import { log, logError } from '@/lib/logger';

/**
 * 测试 R2 存储配置
 * GET /api/storage/test
 */
export async function GET(request: NextRequest) {
  try {
    // 验证登录状态
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { code: 401, message: '未登录' },
        { status: 401 }
      );
    }

    log('[Storage Test] 开始测试 R2 配置');

    // 检查环境变量
    const config = {
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION,
      bucket: process.env.STORAGE_BUCKET,
      domain: process.env.STORAGE_DOMAIN,
      hasAccessKey: !!process.env.STORAGE_ACCESS_KEY,
      hasSecretKey: !!process.env.STORAGE_SECRET_KEY,
    };

    log('[Storage Test] 配置信息:', config);

    if (!config.endpoint || !config.bucket || !config.hasAccessKey || !config.hasSecretKey) {
      return NextResponse.json({
        code: 400,
        message: 'R2 配置不完整',
        data: {
          config: {
            ...config,
            accessKey: config.hasAccessKey ? '已配置' : '未配置',
            secretKey: config.hasSecretKey ? '已配置' : '未配置',
          },
          required: [
            'STORAGE_ENDPOINT',
            'STORAGE_REGION',
            'STORAGE_BUCKET',
            'STORAGE_ACCESS_KEY',
            'STORAGE_SECRET_KEY',
          ],
          docs: '/docs/R2_SETUP.md'
        }
      });
    }

    // 创建测试文件
    const storage = newStorage();
    const testContent = JSON.stringify({
      test: true,
      timestamp: new Date().toISOString(),
      user: session.user.email,
      message: 'R2 存储测试成功!'
    }, null, 2);

    const testBuffer = Buffer.from(testContent, 'utf-8');
    const testKey = `test/storage-test-${Date.now()}.json`;

    log('[Storage Test] 开始上传测试文件:', { key: testKey, size: testBuffer.length });

    const result = await storage.uploadFile({
      body: testBuffer,
      key: testKey,
      contentType: 'application/json',
      disposition: 'inline'
    });

    log('[Storage Test] 测试文件上传成功:', result);

    return NextResponse.json({
      code: 1000,
      message: 'R2 配置测试成功',
      data: {
        config: {
          endpoint: config.endpoint,
          region: config.region,
          bucket: config.bucket,
          domain: config.domain,
          accessKey: '已配置',
          secretKey: '已配置',
        },
        testFile: {
          key: result.key,
          url: result.url,
          bucket: result.bucket,
          location: result.location,
        },
        tips: [
          '测试文件已成功上传到 R2',
          `访问 URL: ${result.url}`,
          '可以删除 test/ 目录下的测试文件'
        ]
      }
    });

  } catch (error: any) {
    logError('[Storage Test] 测试失败:', error);

    let errorMessage = error.message || '未知错误';
    let errorDetails: any = {};

    // 提供更友好的错误提示
    if (error.message?.includes('getaddrinfo')) {
      errorMessage = 'R2 Endpoint 配置错误或网络连接失败';
      errorDetails.tip = '请检查 STORAGE_ENDPOINT 是否正确';
    } else if (error.message?.includes('credentials')) {
      errorMessage = 'R2 API 凭据错误';
      errorDetails.tip = '请检查 STORAGE_ACCESS_KEY 和 STORAGE_SECRET_KEY';
    } else if (error.message?.includes('Bucket')) {
      errorMessage = 'R2 存储桶配置错误';
      errorDetails.tip = '请检查 STORAGE_BUCKET 是否正确,并确保存储桶已创建';
    }

    return NextResponse.json(
      {
        code: 500,
        message: errorMessage,
        error: {
          details: errorDetails,
          original: error.message,
          docs: '/docs/R2_SETUP.md'
        }
      },
      { status: 500 }
    );
  }
}
