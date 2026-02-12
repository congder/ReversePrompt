"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Wand2, Upload, Video, Download } from "lucide-react";
import { toast } from "sonner";
import { authEventBus } from "@/lib/auth-event";
import { FileUpload } from "@/components/ui/file-upload";
import type { VideoModel, VideoGenerationRequest, VideoGenerationResponse, VideoTaskStatus } from "@/types/video";
import cosUploadService from "@/lib/cos-upload";

// 视频模型配置
const mockVideoModels: VideoModel[] = [
  {
    id: 'veo3.1-pro',
    name: 'Veo 3.1 Pro',
    model: 'veo3.1-pro',
    description: '高质量视频生成模型，支持文本到视频和图像到视频',
    provider: 'evolink',
    supportsTextToVideo: true,
    supportsVideoToVideo: true,
    maxDuration: 16,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3']
  }
];

// 复用 digital-human 的 Google 登录处理组件
function GoogleAuthHandler() {
  const t = useTranslations('ai_video');
  const [searchParams, setSearchParams] = useState<URLSearchParams>(new URLSearchParams());

  useEffect(() => {
    // 初始化searchParams（只在客户端执行）
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setSearchParams(params);
    }

    // 清除所有 Google OAuth 和登录相关的标志
    sessionStorage.removeItem('google_oauth_in_progress');
    sessionStorage.removeItem('user_opened_sign_modal');

    // 检查URL参数中是否有token（从Google OAuth回调返回）
    const authToken = searchParams.get('auth_token');
    if (authToken) {
      sessionStorage.setItem('auth_token', authToken);
    }

    // 处理登录成功后的重定向
    const redirectTo = sessionStorage.getItem('redirect_after_login');
    if (redirectTo && authToken) {
      sessionStorage.removeItem('redirect_after_login');
      window.location.href = redirectTo;
    }
  }, [searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('auth.redirecting')}</h1>
        <p className="text-gray-600 mb-8">{t('auth.pleaseWait')}</p>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
      </div>
    </div>
  );
}

// 视频生成页面组件
export default function TextToVideoPage() {
  const t = useTranslations('ai_video');
  const locale = useLocale();
  const routeParams = useParams();
  const routeModel = routeParams.model as string;
  const [selectedModel, setSelectedModel] = useState<VideoModel | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState(0);
  const [generatedVideos, setGeneratedVideos] = useState<string[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [uploadedVideos, setUploadedVideos] = useState<string[]>([]);

  // 表单状态
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [quality, setQuality] = useState('720p');
  const [duration, setDuration] = useState('10s');


  // 初始化时过滤模型
  useEffect(() => {
    if (routeModel === 'all') {
      setSelectedModel(mockVideoModels[0]); // 默认选择第一个模型
    } else {
      const model = mockVideoModels.find(m =>
        m.provider === 'evolink' ||
        m.id.includes(routeModel) ||
        m.model.includes(routeModel)
      );
      setSelectedModel(model || mockVideoModels[0]);
    }
  }, [routeModel]);

  // 检查登录状态
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
    </div>;
  }

  if (!session) {
    return <GoogleAuthHandler />;
  }

  // 处理图片上传
  const handleImageUpload = async (files: File[]) => {
    try {
      const uploadResults = await Promise.all(
        files.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Upload failed');
          }

          const data = await response.json();
          return data.url;
        })
      );

      setUploadedVideos(uploadResults);
      toast.success(`成功上传 ${files.length} 张图片`);
    } catch (error) {
      console.error('Image upload error:', error);
      toast.error('图片上传失败');
    }
  };

  // 生成视频
  const handleGenerate = async () => {
    if (!selectedModel || !prompt.trim()) {
      toast.error(t('validation.emptyPrompt'));
      return;
    }

    setIsGenerating(true);
    setTaskId(null);
    setTaskProgress(0);
    setGeneratedVideos([]);
    setIsPolling(true);

    try {

      const requestBody: VideoGenerationRequest = {
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt.trim(),
        aspect_ratio: aspectRatio,
        quality: quality as '720p' | '1080p' | '4k',
        generation_type: uploadedVideos.length > 0 ? 'FIRST&LAST' : 'TEXT',
        duration: parseInt(duration),
        generate_audio: true
      };

      // 如果有上传的视频，添加到请求中
      if (uploadedVideos.length > 0) {
        requestBody.image_urls = uploadedVideos;
      }

      // 调用 API 创建生成任务
      const response = await fetch('/api/ai/video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '生成失败');
      }

      const result: VideoGenerationResponse = await response.json();

      if (result.code !== 1000) {
        throw new Error(result.message || '生成失败');
      }

      if (result.data.id) {
        setTaskId(result.data.id);
        startPolling(result.data.id);
      } else {
        throw new Error('未获取到任务ID');
      }

    } catch (error: any) {
      console.error('[Video Generate] 生成失败:', error);
      toast.error(error.message || t('generation.error'));
      setIsPolling(false);
    } finally {
      setIsGenerating(false);
    }
  };

  // 轮询任务状态
  const startPolling = async (taskId: string) => {
    const maxAttempts = 300; // 10分钟超时
    const pollInterval = 2000; // 2秒轮询一次

    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        toast.error(t('generation.timeout'));
        setIsPolling(false);
        return;
      }

      try {
        const response = await fetch(`/api/ai/video/task/${taskId}`);
        const result: VideoTaskStatus = await response.json();

        if (result.code === 1000 && result.data) {
          const task = result.data;

          if (task.status === 'completed' && task.results) {
            setGeneratedVideos(task.results);
            setIsPolling(false);
            toast.success(t('generation.success'));

            return;
          }

          if (task.status === 'failed') {
            throw new Error(task.error || '生成失败');
          }

          if (task.progress !== undefined) {
            setTaskProgress(task.progress);
          }
        }

        attempts++;
        setTimeout(poll, pollInterval);
      } catch (error: any) {
        console.error('[Video Polling] 轮询失败:', error);
        toast.error(error.message || t('generation.error'));
        setIsPolling(false);
      }
    };

    poll();
  };

  // 下载视频
  const handleDownload = (videoUrl: string) => {
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `generated-video-${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 重置表单
  const handleReset = () => {
    setPrompt('');
    setAspectRatio('auto');
    setQuality('720p');
    setDuration('10s');
    setUploadedVideos([]);
    setTaskId(null);
    setTaskProgress(0);
    setGeneratedVideos([]);
    setIsPolling(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">{t('model', { name: selectedModel?.name || '' })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左侧：生成控制面板 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <Tabs defaultValue="text-to-video" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text-to-video" className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4" />
                    {t('tabs.textToVideo')}
                  </TabsTrigger>
                  <TabsTrigger value="video-to-video" className="flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    {t('tabs.imageToVideo')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="text-to-video" className="space-y-6">
                  {/* 文本输入 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('form.prompt')}
                    </label>
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={t('form.promptPlaceholder')}
                      className="min-h-[120px]"
                    />
                  </div>

                  {/* 参数设置 */}
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="parameters">
                      <AccordionTrigger className="text-left">
                        {t('form.advancedParameters')}
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              {t('form.duration')}
                            </label>
                            <Select value={duration} onValueChange={setDuration}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="5s">5秒</SelectItem>
                                <SelectItem value="10s">10秒</SelectItem>
                                <SelectItem value="15s">15秒</SelectItem>
                                <SelectItem value="20s">20秒</SelectItem>
                                <SelectItem value="30s">30秒</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              宽高比
                            </label>
                            <Select value={aspectRatio} onValueChange={setAspectRatio}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">自动</SelectItem>
                                <SelectItem value="16:9">16:9</SelectItem>
                                <SelectItem value="9:16">9:16</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              质量
                            </label>
                            <Select value={quality} onValueChange={setQuality}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="720p">720p</SelectItem>
                                <SelectItem value="1080p">1080p</SelectItem>
                                <SelectItem value="4k">4K</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('form.style')}
                          </label>
                          <Select value={style} onValueChange={setStyle}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="realistic">写实风格</SelectItem>
                              <SelectItem value="anime">动漫风格</SelectItem>
                              <SelectItem value="watercolor">水彩风格</SelectItem>
                              <SelectItem value="oil">油画风格</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  {/* 生成按钮 */}
                  <div className="flex gap-4">
                    <Button
                      onClick={handleGenerate}
                      disabled={isGenerating || isPolling}
                      className="flex-1"
                    >
                      {isGenerating ? t('generating') : t('generate')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      disabled={isGenerating || isPolling}
                    >
                      {t('reset')}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="image-to-video" className="space-y-6">
                  {/* 图片上传 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('form.imageUpload')}
                    </label>
                    <FileUpload
                      onFilesChange={(files) => handleImageUpload(files)}
                      type="image"
                      maxSize={10 * 1024 * 1024} // 10MB
                      multiple={true}
                      maxFiles={2}
                    />
                    {uploadedVideos.length > 0 && (
                      <div className="mt-2 text-sm text-green-600">
                        已上传 {uploadedVideos.length} 张图片
                      </div>
                    )}
                  </div>

                  {/* 文本描述（可选） */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      视频描述（可选）
                    </label>
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="描述您希望视频如何动起来..."
                      className="min-h-[100px]"
                    />
                  </div>

                  {/* 参数设置 */}
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="parameters">
                      <AccordionTrigger className="text-left">
                        {t('form.advancedParameters')}
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              {t('form.duration')}
                            </label>
                            <Select value={duration} onValueChange={setDuration}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="5s">5秒</SelectItem>
                                <SelectItem value="10s">10秒</SelectItem>
                                <SelectItem value="15s">15秒</SelectItem>
                                <SelectItem value="20s">20秒</SelectItem>
                                <SelectItem value="30s">30秒</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              {t('form.style')}
                            </label>
                            <Select value={style} onValueChange={setStyle}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="realistic">写实风格</SelectItem>
                                <SelectItem value="anime">动漫风格</SelectItem>
                                <SelectItem value="watercolor">水彩风格</SelectItem>
                                <SelectItem value="oil">油画风格</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  {/* 生成按钮 */}
                  <div className="flex gap-4">
                    <Button
                      onClick={handleGenerate}
                      disabled={isGenerating || isPolling || uploadedVideos.length === 0}
                      className="flex-1"
                    >
                      {isGenerating ? t('generating') : t('generate')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      disabled={isGenerating || isPolling}
                    >
                      {t('reset')}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* 任务状态和进度 */}
            {(taskId || isPolling) && (
              <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {t('task.status')}
                </h3>

                {isPolling && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">
                        {t('task.progress')}: {taskProgress}%
                      </span>
                      <span className="text-xs text-gray-500">
                        {t('task.taskId')}: {taskId}
                      </span>
                    </div>

                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${taskProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 右侧：结果展示 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {t('results.title')}
              </h3>

              {generatedVideos.length > 0 ? (
                <div className="space-y-4">
                  {generatedVideos.map((videoUrl, index) => (
                    <div key={index} className="border rounded-lg overflow-hidden">
                      <video
                        src={videoUrl}
                        controls
                        className="w-full h-auto"
                        style={{ maxHeight: '300px' }}
                      />
                      <div className="p-3 bg-gray-50 flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          {t('results.video')} {index + 1}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(videoUrl)}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          {t('results.download')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Video className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">{t('results.empty')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}