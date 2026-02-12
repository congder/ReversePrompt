"use client";

import { useState, useEffect } from "react";
import type { Metadata } from "next";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Wand2, Globe } from "lucide-react";
import { toast } from "sonner";
import { authEventBus } from "@/lib/auth-event";
import { ImageComparison } from "@/components/ui/image-comparison";
import { useConsumptionItems } from "@/hooks/useConsumptionItems";
import { mapImageModelToConsumptionType } from "@/lib/model-consumption-mapping";
import { cosUploadService } from "@/lib/cos-upload";

// 复用 digital-human 的 Google 登录处理组件
function GoogleAuthHandler() {
  const t = useTranslations('ai_image');
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
    const refreshToken = searchParams.get('refresh_token');

    if (authToken) {
      console.log('[GoogleAuthHandler] Found auth token in URL params');

      // 保存token到localStorage
      localStorage.setItem("aiHubToken", authToken);

      // 保存完整的token信息
      localStorage.setItem("aiHubToken_full", JSON.stringify({
        token: authToken,
        refreshToken: refreshToken || '',
        expire: 7200,
        refreshExpire: 604800,
        loginTime: Date.now()
      }));

      // 显示成功提示
      toast.success(t('login_success'));

      // 清理URL参数
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('auth_token');
      newUrl.searchParams.delete('refresh_token');
      window.history.replaceState({}, '', newUrl.pathname);

      // 刷新页面以获取新token
      window.location.reload();
    }

    // 检查cookie中是否有token（备用方案）
    const cookieToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('aiHubToken='))
      ?.split('=')[1];

    if (cookieToken && !authToken) {
      console.log('[GoogleAuthHandler] Found auth token in cookie');
      localStorage.setItem("aiHubToken", cookieToken);

      // 保存完整的token信息
      localStorage.setItem("aiHubToken_full", JSON.stringify({
        token: cookieToken,
        refreshToken: '',
        expire: 7200,
        refreshExpire: 604800,
        loginTime: Date.now()
      }));
    }
  }, [searchParams]);

  return null;
}

interface ImageModel {
  id: string;
  name: string;
  model: string;
  description: string;
  provider?: string;
  supportsTextToImage?: boolean;
  supportsImageToImage?: boolean;
}

export default function TextToImagePage() {
  const params = useParams();
  const routeModel = params?.model as string || 'all'; // 获取路由中的模型参数
  const t = useTranslations('ai_image');
  const locale = useLocale(); // 获取当前语言
  const { getCredits } = useConsumptionItems();
  const { data: session, status } = useSession();

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("standard");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [models, setModels] = useState<ImageModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Image to Image 相关状态
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const [i2iPrompt, setI2iPrompt] = useState("");
  const [i2iModel, setI2iModel] = useState("standard");
  const [i2iAspectRatio, setI2iAspectRatio] = useState("1:1");
  const [isGeneratingI2I, setIsGeneratingI2I] = useState(false);
  const [generatedI2IImage, setGeneratedI2IImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("text-to-image");

  const fileInput = document.getElementById("file-upload");
  const uploadStatus = document.getElementById("upload-status");

  
  // 根据路由参数过滤模型（文生图）
  const filteredModels = models.filter(m => {
    // 首先检查是否支持文生图（如果字段存在）
    if (m.supportsTextToImage !== undefined && m.supportsTextToImage === false) {
      return false;
    }

    if (routeModel === 'all') return true; // 'all' 显示所有模型

    // google-imagen 页面：只显示 Imagen-4 Standard, Ultra, Fast
    if (routeModel === 'google-imagen') {
      return m.id.includes('imagen-4');
    }

    // nano-banana 页面：只显示 Evolink 的 nano-banana 模型
    if (routeModel === 'nano-banana') {
      return m.provider === 'evolink' || m.id.includes('nano-banana');
    }

    // doubao-seedream 页面：只显示 Seedream 和 SeedEdit 模型
    if (routeModel === 'doubao-seedream') {
      return m.id.includes('seedream') || m.id.includes('seededit');
    }

    // 其他路由：匹配模型 id 或 model 字段
    return m.id.includes(routeModel) || m.model.toLowerCase().includes(routeModel.toLowerCase());
  });

  // 图生图专用模型列表：根据 supportsImageToImage 字段过滤
  // 优先使用 supportsImageToImage 字段判断，兼容旧逻辑（-i2i 后缀）
  const i2iFilteredModels = models.filter(m => {
    // 首先检查是否支持图生图
    let supportsI2I = false;

    if (m.supportsImageToImage !== undefined) {
      supportsI2I = m.supportsImageToImage === true;
    } else if (routeModel === 'nano-banana' && (m.provider === 'evolink' || m.id.includes('nano-banana'))) {
      supportsI2I = true;
    } else if (m.id.includes('-i2i')) {
      supportsI2I = true;
    }

    // 如果不支持图生图，直接过滤掉
    if (!supportsI2I) {
      return false;
    }

    // 根据路由参数进一步过滤模型
    if (routeModel === 'all') {
      return true;
    }

    // google-imagen 页面：只显示 Google 的图生图模型
    if (routeModel === 'google-imagen') {
      return m.id.includes('imagen') && m.provider === 'google';
    }

    // nano-banana 页面：只显示 Evolink 模型
    if (routeModel === 'nano-banana') {
      return m.provider === 'evolink' || m.id.includes('nano-banana');
    }

    // doubao-seedream 页面：只显示 Seedream 和 SeedEdit 模型
    if (routeModel === 'doubao-seedream') {
      return m.id.includes('seedream') || m.id.includes('seededit');
    }

    // 其他路由：匹配模型 id 或 model 字段
    return m.id.includes(routeModel) || m.model.toLowerCase().includes(routeModel.toLowerCase());
  });

  // 从 localStorage 获取 token，类似 digital-human
  // 注意：现在直接在需要时从 localStorage 获取 token，不再使用状态变量

  // 获取模型列表（不需要登录）
  useEffect(() => {
    const fetchModels = async () => {
      setIsLoadingModels(true);
      try {
        console.log('[TextToImage] ===== 开始获取模型列表 =====');
        console.log('[TextToImage] 当前路由模型参数:', routeModel);

        // 使用硬编码的模型列表
        const mockModels: ImageModel[] = [
          {
            id: 'nano-banana-2-lite',
            name: 'Nano Banana Pro',
            model: 'nano-banana-2-lite',
            description: 'Cost-effective image generation model from Evolink',
            provider: 'evolink',
            supportsTextToImage: true,
            supportsImageToImage: true
          },
          {
            id: 'gemini-2.5-flash-imagen-3',
            name: 'Gemini 2.5 Flash (Imagen 3)',
            model: 'gemini-2.5-flash',
            description: 'Google Gemini 2.5 Flash with Imagen 3 support',
            provider: 'google-gemini',
            supportsTextToImage: true,
            supportsImageToImage: true
          },
          {
            id: 'imagen-4-standard',
            name: 'Imagen 4 Standard',
            model: 'imagen-4-standard',
            description: 'Google Imagen 4 标准版',
            provider: 'google',
            supportsTextToImage: true,
            supportsImageToImage: true
          },
          {
            id: 'imagen-4-ultra',
            name: 'Imagen 4 Ultra',
            model: 'imagen-4-ultra',
            description: 'Google Imagen 4 超高质量版',
            provider: 'google',
            supportsTextToImage: true,
            supportsImageToImage: true
          },
          {
            id: 'imagen-4-fast',
            name: 'Imagen 4 Fast',
            model: 'imagen-4-fast',
            description: 'Google Imagen 4 快速版',
            provider: 'google',
            supportsTextToImage: true,
            supportsImageToImage: true
          }
        ];

        const result = { code: 1000, data: mockModels, message: 'success' };
        console.log('[TextToImage] 模型列表响应数据:', JSON.stringify(result, null, 2));

        if (result.code === 1000 && result.data) {
          setModels(result.data);

          // 根据路由参数过滤模型（文生图）
          const filtered = result.data.filter((m: ImageModel) => {
            // 首先检查是否支持文生图（如果字段存在）
            if (m.supportsTextToImage !== undefined && m.supportsTextToImage === false) {
              return false;
            }

            if (routeModel === 'all') return true;

            // google-imagen 页面：只显示 Imagen-4 Standard, Ultra, Fast
            if (routeModel === 'google-imagen') {
              return m.id.includes('imagen-4');
            }

            // nano-banana 页面：只显示 Evolink 的 nano-banana 模型
            if (routeModel === 'nano-banana') {
              return m.provider === 'evolink' || m.id.includes('nano-banana');
            }

            // doubao-seedream 页面：只显示 Seedream 和 SeedEdit 模型
            if (routeModel === 'doubao-seedream') {
              return m.id.includes('seedream') || m.id.includes('seededit');
            }

            return m.id.includes(routeModel) || m.model.toLowerCase().includes(routeModel.toLowerCase());
          });

          // 图生图专用模型过滤：根据 supportsImageToImage 字段过滤
          const i2iFiltered = result.data.filter((m: ImageModel) => {
            // 首先检查是否支持图生图
            let supportsI2I = false;

            if (m.supportsImageToImage !== undefined) {
              supportsI2I = m.supportsImageToImage === true;
            } else if (routeModel === 'nano-banana' && (m.provider === 'evolink' || m.id.includes('nano-banana'))) {
              supportsI2I = true;
            } else if (m.id.includes('-i2i')) {
              supportsI2I = true;
            }

            // 如果不支持图生图，直接过滤掉
            if (!supportsI2I) {
              return false;
            }

            // 根据路由参数进一步过滤模型
            if (routeModel === 'all') {
              return true;
            }

            // google-imagen 页面：只显示 Google 的图生图模型
            if (routeModel === 'google-imagen') {
              return m.id.includes('imagen') && m.provider === 'google';
            }

            // nano-banana 页面：只显示 Evolink 模型
            if (routeModel === 'nano-banana') {
              return m.provider === 'evolink' || m.id.includes('nano-banana');
            }

            // doubao-seedream 页面：只显示 Seedream 和 SeedEdit 模型
            if (routeModel === 'doubao-seedream') {
              return m.id.includes('seedream') || m.id.includes('seededit');
            }

            // 其他路由：匹配模型 id 或 model 字段
            return m.id.includes(routeModel) || m.model.toLowerCase().includes(routeModel.toLowerCase());
          });

          // 设置默认模型
          if (filtered.length > 0) {
            setModel(filtered[0].id);
            console.log('[TextToImage] ✅ 文生图：成功加载', filtered.length, '个模型');
            console.log('[TextToImage] 默认模型设置为:', filtered[0].id, '-', filtered[0].name);
            console.log('[TextToImage] 所有过滤后的模型:', filtered.map((m: ImageModel) => `${m.id} (${m.name})`).join(', '));
          } else {
            console.warn('[TextToImage] ⚠️ 没有匹配的模型，路由参数:', routeModel);
            console.warn('[TextToImage] 所有可用模型:', result.data.map((m: ImageModel) => `${m.id} (provider: ${m.provider})`).join(', '));
          }

          // 设置图生图默认模型
          if (i2iFiltered.length > 0) {
            setI2iModel(i2iFiltered[0].id);
            console.log('[TextToImage] ✅ 图生图：成功加载', i2iFiltered.length, '个模型');
            console.log('[TextToImage] 图生图默认模型设置为:', i2iFiltered[0].id, '-', i2iFiltered[0].name);
            console.log('[TextToImage] 所有图生图模型:', i2iFiltered.map((m: ImageModel) => `${m.id} (${m.name}, supportsI2I: ${m.supportsImageToImage})`).join(', '));
          } else {
            console.warn('[TextToImage] ⚠️ 没有找到支持图生图的模型');
          }
        } else {
          console.error('[TextToImage] ❌ 获取模型列表失败 - Code:', result.code, 'Message:', result.message);
          toast.error(`获取模型列表失败: ${result.message || '未知错误'}`);
        }
      } catch (error) {
        console.error('[TextToImage] ❌ 获取模型列表异常:', error);
        toast.error('获取模型列表失败，请检查网络连接');
      } finally {
        setIsLoadingModels(false);
        console.log('[TextToImage] ===== 模型列表获取完成 =====');
      }
    };

    fetchModels();
  }, [routeModel]); // 依赖路由参数，路由改变时重新获取

  // 保存当前页面URL，用于登录后跳转回来
  const saveRedirectUrl = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('loginRedirectUrl', window.location.pathname);
      console.log('[TextToImage] 已保存重定向URL:', window.location.pathname);
    }
  };

  // 处理图片上传
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceImage(file);
      
      // 创建预览
      const reader = new FileReader();
      reader.onload = (e) => {
        setReferenceImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 移除参考图片
  const handleRemoveImage = () => {
    setReferenceImage(null);
    setReferenceImagePreview(null);
  };

  const handleGenerate = async () => {
    console.log('[TextToImage] 点击生成按钮，session 状态:', session ? '已登录' : '未登录');
    console.log('[TextToImage] 当前模型:', model);

    if (!session) {
      saveRedirectUrl();
      toast.error(t('login_to_get_credits'));
      authEventBus.emit({
        type: 'login-expired',
        message: t('login_to_get_credits')
      });
      return;
    }

    if (!prompt.trim()) {
      toast.error(t('enter_prompt'));
      return;
    }

    setIsGenerating(true);
    setGeneratedImage(null);
    setGenerationProgress(0);

    try {
      // 如果是 nano-banana 模型，使用 Evolink API
      if (model === 'nano-banana-2-lite') {
        console.log('[Evolink] 使用 Evolink API 生成图片');

        const sizeMap: Record<string, string> = {
          '1:1': '1:1',
          '16:9': '16:9',
          '9:16': '9:16',
          '4:3': '4:3',
          '3:4': '3:4'
        };

        console.log('[Evolink] 使用 session 认证');

        // 创建任务
        const response = await fetch('/api/ai/evolink/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            size: sizeMap[aspectRatio] || 'auto',
            quality: '2K'
          })
        });

        const result = await response.json();
        console.log('[Evolink] 创建任务响应:', result);

        if (result.code !== 1000) {
          throw new Error(result.message || 'Generation failed');
        }

        const taskId = result.data.id;
        console.log('[Evolink] 任务ID:', taskId);

        // 轮询任务状态
        const maxAttempts = 120;
        const pollInterval = 2000;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));

          const statusResponse = await fetch(`/api/ai/evolink/task/${taskId}`);

          const statusResult = await statusResponse.json();
          console.log(`[Evolink] 轮询 ${attempt + 1}/${maxAttempts}, 状态:`, statusResult.data?.status, '进度:', statusResult.data?.progress);

          if (statusResult.code !== 1000) {
            throw new Error(statusResult.message || 'Task query failed');
          }

          const taskData = statusResult.data;

          if (taskData.progress !== null && taskData.progress !== undefined) {
            setGenerationProgress(taskData.progress);
          }

          if (taskData.status === 'completed' && taskData.results && taskData.results.length > 0) {
            console.log('[Evolink] 生成完成，图片URL:', taskData.results[0]);
            setGenerationProgress(100);
            setGeneratedImage(taskData.results[0]);
               
            toast.success(t('generation_success'));
            return;
          }

          if (taskData.status === 'failed') {
            throw new Error('Image generation failed');
          }
        }

        throw new Error('Task timeout');
      }

      // 其他模型使用通用 API
      console.log('开始生成图片...', {
        prompt,
        modelId: model,
        aspectRatio
      });

      const response = await fetch('/api/ai/text-to-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'language': locale,
        },
        body: JSON.stringify({
          prompt,
          model: model,
          aspectRatio,
        }),
      });

      const result = await response.json();

      console.log('[TextToImage] API 响应:', JSON.stringify(result, null, 2));

      if (result.code === 401 || response.status === 401) {
        console.error('[TextToImage] 登录失效:', result.message);
        authEventBus.emit({
          type: 'login-expired',
          message: result.message || t('login_expired')
        });
        toast.error(result.message || t('login_expired'));
        return;
      }

      if (result.code === 1000 && result.data?.images && result.data.images.length > 0) {
        const imageUrl = result.data.images[0];
        console.log('[TextToImage] 图片生成成功:', imageUrl);
        setGeneratedImage(imageUrl);
        toast.success(t('generation_success'));
      } else {
        console.error('[TextToImage] 生成失败 - Code:', result.code, 'Message:', result.message);
        toast.error(result.message || t('generation_failed'));
      }
    } catch (error: any) {
      console.error('[TextToImage] 生成图片异常:', error);
      toast.error(error.message || t('generation_error'));
    } finally {
      setIsGenerating(false);
    }
  };

  // Image to Image 生成函数
  const handleImageToImageGenerate = async () => {
    console.log('[ImageToImage] 点击生成按钮');

    if (!session) {
      saveRedirectUrl();
      toast.error(t('please_login'));
      authEventBus.emit({
        type: 'login-expired',
        message: t('please_login')
      });
      return;
    }

    if (!referenceImage) {
      toast.error(t('upload_reference_image'));
      return;
    }

    if (!i2iPrompt.trim()) {
      toast.error(t('enter_prompt'));
      return;
    }

    setIsGeneratingI2I(true);
    setGeneratedI2IImage(null);

    try {
      const formData = new FormData();
      formData.append('image', referenceImage);
      formData.append('prompt', i2iPrompt);
      formData.append('model', i2iModel);  // 直接使用模型 id
      formData.append('aspectRatio', i2iAspectRatio);

      console.log('[ImageToImage] 开始生成，参数:', {
        hasImage: !!referenceImage,
        prompt: i2iPrompt,
        modelId: i2iModel,
        aspectRatio: i2iAspectRatio
      });

      const response = await fetch('/api/ai/image-to-image', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      console.log('[ImageToImage] API 响应:', result);

      // 检查登录失效
      if (result.code === 401 || response.status === 401) {
        console.error('[ImageToImage] 登录失效:', result.message);

        // 触发登录失效事件，打开登录弹窗
        authEventBus.emit({
          type: 'login-expired',
          message: result.message || t('login_expired')
        });

        toast.error(result.message || t('login_expired'));
        return;
      }

      if (result.code !== 1000) {
        throw new Error(result.message || 'Generation failed');
      }

      const taskId = result.data.id;
      console.log('[ImageToImage] 任务ID:', taskId);

      // 轮询任务状态
      const maxAttempts = 120;
      const pollInterval = 2000;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const statusResponse = await fetch(`/api/ai/evolink/task/${taskId}`);

        const statusResult = await statusResponse.json();
        console.log(`[ImageToImage] 轮询 ${attempt + 1}/${maxAttempts}, 状态:`, statusResult.data?.status, '进度:', statusResult.data?.progress);

        if (statusResult.code !== 1000) {
          throw new Error(statusResult.message || 'Task query failed');
        }

        const taskData = statusResult.data;

        if (taskData.status === 'completed' && taskData.results && taskData.results.length > 0) {
          const imageUrl = taskData.results[0];
          setGeneratedI2IImage(imageUrl);
          toast.success(t('generation_success'));
          break;
        }

        if (taskData.status === 'failed') {
          throw new Error('Generation failed');
        }

        // 更新进度
        const progress = taskData.progress || 0;
        console.log('[ImageToImage] 进度:', progress + '%');
      }
    } catch (error: any) {
      console.error('[ImageToImage] 生成异常:', error);
      toast.error(error.message || t('generation_error'));
    } finally {
      setIsGeneratingI2I(false);
    }
  };

  return (
    <>
      {/* Google Auth Handler - 复用 digital-human 的登录逻辑 */}
      <GoogleAuthHandler />

      <div className="min-h-screen bg-background">

        {/* Hero Section */}
        <section className="container mx-auto px-4 pt-20 pb-8">
        <div className="text-center max-w-5xl mx-auto">
          {routeModel === 'google-imagen' ? (
            <>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-4 text-foreground break-words">
                <span className="text-foreground">{t('title_google')}</span>
              </h1>
              <p className="text-base md:text-lg text-muted-foreground mb-4 px-4">
                {t('subtitle_google')}
              </p>
            </>
          ) : routeModel === 'nano-banana' ? (
            <>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-4 text-foreground break-words">
                <span className="text-foreground">{t('title_nano_banana')}</span>
              </h1>
              <p className="text-base md:text-lg text-muted-foreground mb-4 px-4">
                {t('subtitle_nano_banana')}
              </p>
            </>
          ) : routeModel === 'doubao-seedream' ? (
            <>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-4 text-foreground break-words">
                <span className="text-foreground">{t('title_doubao')}</span>
              </h1>
              <p className="text-base md:text-lg text-muted-foreground mb-4 px-4">
                {t('subtitle_doubao')}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-4 text-foreground break-words">
                <span className="text-foreground">{t('title_default')}</span>
              </h1>
              <p className="text-base md:text-lg text-muted-foreground mb-4 px-4">
                {t('subtitle_default')}
              </p>
            </>
          )}
        </div>
      </section>

      {/* Main Content */}
      <section className="container mx-auto px-4 pb-16">
        <div className="max-w-7xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-8 bg-card p-1 border border-border">
              <TabsTrigger
                value="text-to-image"
                className="data-[state=active]:bg-purple-600 data-[state=active]:text-white px-6 py-2.5 rounded-md transition-all"
              >
                {t('txt_to_image.title')}
              </TabsTrigger>
              {/* google-imagen 不支持图生图，只显示文生图 */}
              {routeModel !== 'google-imagen' && (
                <TabsTrigger
                  value="image-to-image"
                  className="data-[state=active]:bg-purple-600 data-[state=active]:text-white px-6 py-2.5 rounded-md transition-all"
                >
                  {t('image_to_image.title')}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="text-to-image">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Panel - Input */}
                <div className="space-y-6 bg-card p-6 rounded-xl border border-border">
                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-foreground">{t('prompt_label')}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('prompt_description')}{" "}
                      <a href="#" className="text-purple-600 hover:underline">
                        {t('prompt_link')}
                      </a>
                    </p>
                    <div className="relative">
                      <Textarea
                        placeholder={t('prompt_placeholder')}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        maxLength={2048}
                        className="min-h-[120px] resize-none border-border focus:border-purple-500 focus:ring-purple-500"
                      />
                      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                        {prompt.length}/2048
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="border-border">
                      <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                      {t('ai_magic_enhance')}
                    </Button>
                    <Button variant="outline" size="sm" className="border-border">
                      <Globe className="h-3.5 w-3.5 mr-1.5" />
                      {t('translate')}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Select value={model} onValueChange={setModel} disabled={isLoadingModels || filteredModels.length === 0}>
                      <SelectTrigger className="border-border flex-1 min-w-[200px]">
                        <SelectValue>
                          {model ? filteredModels.find(m => m.id === model)?.name :
                            (isLoadingModels ? t('loading') :
                            filteredModels.length === 0 ? t('no_models_available') :
                            t('select_model'))}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {filteredModels.length > 0 ? (
                          filteredModels.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">{m.name}</span>
                                <span className="text-xs text-muted-foreground">{m.description}</span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="loading" disabled>
                            {isLoadingModels ? t('loading') : t('no_models_available')}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>

                    <Select value={aspectRatio} onValueChange={setAspectRatio}>
                      <SelectTrigger className="border-border w-[180px]">
                        <SelectValue placeholder="Select ratio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:1">1:1 (Square)</SelectItem>
                        <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                        <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                        <SelectItem value="4:3">4:3</SelectItem>
                        <SelectItem value="3:4">3:4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleGenerate}
                    disabled={!prompt || isGenerating}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                    size="lg"
                  >
                    {isGenerating ? t('generating') : t('generate_image')}
                  </Button>

                  {/* 积分显示 */}
                  {model && (() => {
                    const consumptionType = mapImageModelToConsumptionType(model);
                    if (consumptionType) {
                      const credits = getCredits(consumptionType);
                      if (credits > 0) {
                        return (
                          <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
                            <div className="text-muted-foreground font-medium">
                              Credits: {credits} ⚡
                            </div>
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}

                  {!session && (
                    <p className="text-sm text-center text-muted-foreground">
                      {t('login_to_get_credits')}
                    </p>
                  )}


                  {/* <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
                    <div className="text-muted-foreground font-medium">
                      Credits: 2 ⚡
                    </div>
                    <Button variant="link" className="text-purple-600 hover:text-purple-700 p-0 h-auto">
                      Get More Credits &gt;
                    </Button>
                  </div>

                  <div className="text-center pt-2 border-t border-border">
                    <Button variant="link" className="text-purple-600 hover:text-purple-700 p-0 h-auto">
                      📜 View History
                    </Button>
                  </div> */}
                </div>

                {/* Right Panel - Output */}
                <div className="bg-muted/30 rounded-xl p-8 flex items-center justify-center min-h-[500px] border-2 border-dashed border-border">
                  {isGenerating ? (
                    <div className="text-center">
                      <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-muted-foreground mb-3">Generating your image...</p>
                      <div className="w-full max-w-xs mx-auto">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-600 rounded-full transition-all duration-500"
                            style={{ width: `${generationProgress}%` }}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{generationProgress}%</p>
                      </div>
                    </div>
                  ) : generatedImage ? (
                    <div className="w-full">
                      <img
                        src={generatedImage}
                        alt="Generated"
                        className="w-full h-auto rounded-lg shadow-lg"
                        onLoad={() => {
                          console.log('[TextToImage] 渲染图片组件，URL:', generatedImage);
                          console.log('[TextToImage] ✅ 图片加载成功');
                        }}
                        onError={(e) => {
                          console.error('[TextToImage] ❌ 图片加载失败:', e);
                          console.error('[TextToImage] 失败的URL:', generatedImage);
                        }}
                      />
                      <div className="mt-4 flex gap-2 justify-center">
                        <Button
                          onClick={() => window.open(generatedImage, '_blank')}
                          variant="outline"
                          size="sm"
                        >
                          Open Full Size
                        </Button>
                        <Button
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = generatedImage;
                            link.download = `generated-${Date.now()}.png`;
                            link.click();
                          }}
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          Download
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <svg
                        className="w-24 h-24 mx-auto mb-4 opacity-50"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <p className="text-lg">{t('generated_image_placeholder')}</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="image-to-image">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Panel - Input */}
                <div className="space-y-6 bg-card p-6 rounded-xl border border-border">
                  {/* Reference Image Upload */}
                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-foreground">{t('image_to_image.reference_image')}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('image_to_image.reference_image_desc')}
                    </p>
                    
                    {!referenceImagePreview ? (
                      <label className="block border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-purple-500 transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <svg
                          className="w-12 h-12 mx-auto mb-4 text-muted-foreground"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        <p className="text-sm text-muted-foreground">
                          {t('image_to_image.upload_or_drag')}
                        </p>
                      </label>
                    ) : (
                      <div className="relative inline-block">
                        <img
                          src={referenceImagePreview}
                          alt="Reference"
                          className="max-w-[200px] h-auto rounded-lg"
                        />
                        <button
                          onClick={handleRemoveImage}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Prompt */}
                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-foreground">{t('image_to_image.prompt_title')}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('image_to_image.prompt_desc')}
                    </p>
                    <div className="relative">
                      <Textarea
                        placeholder={t('image_to_image.prompt_placeholder')}
                        value={i2iPrompt}
                        onChange={(e) => setI2iPrompt(e.target.value)}
                        maxLength={2048}
                        className="min-h-[120px] resize-none border-border focus:border-purple-500 focus:ring-purple-500"
                      />
                      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                        {i2iPrompt.length}/2048
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="border-border">
                      <Globe className="h-3.5 w-3.5 mr-1.5" />
                      {t('image_to_image.translate')}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Select value={i2iModel} onValueChange={setI2iModel} disabled={isLoadingModels || i2iFilteredModels.length === 0}>
                      <SelectTrigger className="border-border flex-1 min-w-[200px]">
                        <SelectValue>
                          {i2iModel ? i2iFilteredModels.find(m => m.id === i2iModel)?.name :
                            (isLoadingModels ? t('loading') :
                            i2iFilteredModels.length === 0 ? t('no_models_available') :
                            t('select_model'))}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {i2iFilteredModels.length > 0 ? (
                          i2iFilteredModels.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">{m.name}</span>
                                <span className="text-xs text-muted-foreground">{m.description}</span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="loading" disabled>
                            {isLoadingModels ? t('loading') : t('no_models_available')}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>

                    <Select value={i2iAspectRatio} onValueChange={setI2iAspectRatio}>
                      <SelectTrigger className="border-border w-[180px]">
                        <SelectValue placeholder={t('image_to_image.select_ratio')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:1">1:1 (Square)</SelectItem>
                        <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                        <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                        <SelectItem value="4:3">4:3</SelectItem>
                        <SelectItem value="3:4">3:4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleImageToImageGenerate}
                    disabled={!referenceImage || !i2iPrompt || isGeneratingI2I}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                    size="lg"
                  >
                    {isGeneratingI2I ? t('generating') : t('generate_image')}
                  </Button>

                  {/* 积分显示 */}
                  {i2iModel && (() => {
                    const consumptionType = mapImageModelToConsumptionType(i2iModel);
                    if (consumptionType) {
                      const credits = getCredits(consumptionType);
                      if (credits > 0) {
                        return (
                          <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
                            <div className="text-muted-foreground font-medium">
                              Credits: {credits} ⚡
                            </div>
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}

                  {!session && (
                    <p className="text-sm text-center text-muted-foreground">
                      {t('login_to_get_credits')}
                    </p>
                  )}

                  {/* <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
                    <div className="text-muted-foreground font-medium">
                      Credits: 3 ⚡
                    </div>
                    <Button variant="link" className="text-purple-600 hover:text-purple-700 p-0 h-auto">
                      Get More Credits &gt;
                    </Button>
                  </div>

                  <div className="text-center pt-2 border-t border-border">
                    <Button variant="link" className="text-purple-600 hover:text-purple-700 p-0 h-auto">
                      📜 View History
                    </Button>
                  </div> */}
                </div>

                {/* Right Panel - Output */}
                <div className="bg-muted/30 rounded-xl p-8 flex items-center justify-center min-h-[500px] border-2 border-dashed border-border">
                  {isGeneratingI2I ? (
                    <div className="text-center">
                      <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-muted-foreground">Generating your image...</p>
                    </div>
                  ) : generatedI2IImage ? (
                    <div className="w-full">
                      <img
                        src={generatedI2IImage}
                        alt="Generated"
                        className="w-full h-auto rounded-lg shadow-lg"
                      />
                      <div className="mt-4 flex gap-2 justify-center">
                        <Button
                          onClick={() => window.open(generatedI2IImage, '_blank')}
                          variant="outline"
                          size="sm"
                        >
                          Open Full Size
                        </Button>
                        <Button
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = generatedI2IImage;
                            link.download = `generated-i2i-${Date.now()}.png`;
                            link.click();
                          }}
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          Download
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <svg
                        className="w-24 h-24 mx-auto mb-4 opacity-50"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <p className="text-lg">{t('generated_image_placeholder')}</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Google Image Showcase and Tips Section */}
      {activeTab === 'text-to-image' && routeModel === 'google-imagen' && (
        <>
          {/* Prompt Guide Section */}
          <section className="container mx-auto px-4 py-16 bg-background">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-4 text-foreground">{t('prompt_guide.title')}</h2>
              <p className="text-center text-muted-foreground mb-12">
                {t('prompt_guide.subtitle')}
              </p>

              {/* Core Structure */}
              <div className="bg-card rounded-xl p-8 mb-8 border border-border">
                <h3 className="text-2xl font-bold mb-6 text-center text-foreground text-foreground">{t('prompt_guide.core_structure_title')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-background rounded-lg p-6 shadow-md border border-border">
                    <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mb-4 text-xl font-bold">
                      1
                    </div>
                    <h4 className="font-semibold text-lg mb-2 text-foreground text-foreground">{t('prompt_guide.subject_title')}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('prompt_guide.subject_desc')}
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                      {t('prompt_guide.subject_example')}
                    </p>
                  </div>
                  <div className="bg-background rounded-lg p-6 shadow-md border border-border">
                    <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mb-4 text-xl font-bold">
                      2
                    </div>
                    <h4 className="font-semibold text-lg mb-2 text-foreground text-foreground">{t('prompt_guide.background_title')}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('prompt_guide.background_desc')}
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                      {t('prompt_guide.background_example')}
                    </p>
                  </div>
                  <div className="bg-background rounded-lg p-6 shadow-md border border-border">
                    <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mb-4 text-xl font-bold">
                      3
                    </div>
                    <h4 className="font-semibold text-lg mb-2 text-foreground text-foreground">{t('prompt_guide.style_title')}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('prompt_guide.style_desc')}
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                      {t('prompt_guide.style_example')}
                    </p>
                  </div>
                </div>

                {/* Prompt Progression Example */}
                <div className="mt-8 bg-background rounded-lg p-6">
                  <h4 className="font-semibold text-lg mb-4 text-foreground">{t('prompt_guide.progression_title')}</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="text-purple-600 font-semibold min-w-[80px]">{t('prompt_guide.basic_label')}</span>
                      <span className="text-sm text-foreground">"{t('prompt_guide.basic_example')}"</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-purple-600 font-semibold min-w-[80px]">{t('prompt_guide.enhanced_label')}</span>
                      <span className="text-sm text-foreground">"{t('prompt_guide.enhanced_example')}"</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-purple-600 font-semibold min-w-[80px]">{t('prompt_guide.detailed_label')}</span>
                      <span className="text-sm text-foreground">"{t('prompt_guide.detailed_example')}"</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Best Practices Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                {/* Photography Modifiers */}
                <div className="bg-card rounded-xl p-6 border border-border">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-foreground">
                    <span className="text-2xl">📷</span> {t('prompt_guide.photography_title')}
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="font-semibold text-purple-600">Camera proximity:</span>
                      <span className="text-muted-foreground"> "close-up", "zoomed out", "macro"</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-600">Camera position:</span>
                      <span className="text-muted-foreground"> "aerial photo", "from below", "eye-level"</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-600">Lighting:</span>
                      <span className="text-muted-foreground"> "natural lighting", "dramatic lighting", "soft diffused light"</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-600">Camera settings:</span>
                      <span className="text-muted-foreground"> "bokeh", "soft focus", "motion blur", "shallow depth of field"</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-600">Lens types:</span>
                      <span className="text-muted-foreground"> "35mm", "macro lens", "fisheye lens", "100mm"</span>
                    </div>
                  </div>
                </div>

                {/* Art Styles */}
                <div className="bg-card rounded-xl p-6 border border-border">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-foreground">
                    <span className="text-2xl">🎨</span> {t('prompt_guide.art_styles_title')}
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="font-semibold text-purple-600">Historical styles:</span>
                      <span className="text-muted-foreground"> "impressionist painting", "renaissance painting", "pop art"</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-600">Modern styles:</span>
                      <span className="text-muted-foreground"> "digital art", "3D render", "watercolor", "oil painting"</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-600">Film types:</span>
                      <span className="text-muted-foreground"> "polaroid portrait", "black and white film", "vintage film"</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-600">Quality enhancers:</span>
                      <span className="text-muted-foreground"> "4K", "HDR", "high quality", "professional photography"</span>
                    </div>
                  </div>
                </div>

                {/* Creative Techniques */}
                <div className="bg-card rounded-xl p-6 border border-border">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-foreground">
                    <span className="text-2xl">✨</span> {t('prompt_guide.creative_techniques_title')}
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="font-semibold text-purple-600">Material combinations:</span>
                      <span className="text-muted-foreground"> "duffle bag made of cheese", "glass sculpture of a bird"</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-600">Shape transformations:</span>
                      <span className="text-muted-foreground"> "neon tubes in the shape of a bird", "clouds forming a dragon"</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-600">Descriptive language:</span>
                      <span className="text-muted-foreground"> Use detailed adjectives and adverbs to paint clear pictures</span>
                    </div>
                  </div>
                </div>

                {/* Aspect Ratio Guide */}
                <div className="bg-card rounded-xl p-6 border border-border">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-foreground">
                    <span className="text-2xl">📐</span> {t('prompt_guide.aspect_ratio_title')}
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="font-semibold text-purple-600">1:1 (Square):</span>
                      <span className="text-muted-foreground"> Social media posts, profile pictures</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-600">16:9 (Widescreen):</span>
                      <span className="text-muted-foreground"> Landscapes, backgrounds, wallpapers</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-600">9:16 (Portrait):</span>
                      <span className="text-muted-foreground"> Tall objects, buildings, waterfalls</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-600">4:3 / 3:4:</span>
                      <span className="text-muted-foreground"> Traditional media and film formats</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pro Tips */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h3 className="text-xl font-semibold text-foreground">{t('prompt_guide.pro_tips_title')}</h3>
                </div>
                <div className="divide-y divide-border">
                  <div className="px-6 py-5">
                    <h4 className="font-medium text-foreground mb-2">For Portraits</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Use "portrait" in your prompt and specify "the face as the photo's focus". Use Imagen 4 Ultra for enhanced facial details.
                    </p>
                  </div>
                  <div className="px-6 py-5">
                    <h4 className="font-medium text-foreground mb-2">Text in Images</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Keep text under 25 characters. Limit to 2-3 short phrases for best clarity and readability.
                    </p>
                  </div>
                  <div className="px-6 py-5">
                    <h4 className="font-medium text-foreground mb-2">Iterate & Refine</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Start basic, then add details incrementally. Each refinement brings you closer to your vision.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Example Showcase Gallery */}
          <section className="container mx-auto px-4 py-16 bg-muted/20">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-4 text-foreground">{t('prompt_guide.gallery_title')}</h2>
              <p className="text-center text-muted-foreground mb-12">
                {t('prompt_guide.gallery_subtitle')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {/* Example 1: Coffee Beans Photography */}
                <div className="bg-card rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow">
                  <div className="aspect-square overflow-hidden bg-muted/30">
                    <img
                      src="https://cloud.google.com/static/vertex-ai/generative-ai/docs/image/images/1_style-photography_coffee-beans.png"
                      alt="Coffee beans on wooden board"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4">
                    <h4 className="font-semibold mb-2 text-foreground">Photography Style</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      "A photo of coffee beans on a wooden board in a kitchen"
                    </p>
                    <span className="inline-block bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-xs px-2 py-1 rounded">
                      Photography
                    </span>
                  </div>
                </div>

                {/* Example 2: Chocolate Bar */}
                <div className="bg-card rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow">
                  <div className="aspect-square overflow-hidden bg-muted/30">
                    <img
                      src="https://cloud.google.com/static/vertex-ai/generative-ai/docs/image/images/1_style-photography_chocolate-bar.png"
                      alt="Chocolate bar on kitchen counter"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4">
                    <h4 className="font-semibold mb-2 text-foreground">Product Photography</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      "A photo of a chocolate bar on a kitchen counter"
                    </p>
                    <span className="inline-block bg-brown-100 dark:bg-brown-900 text-brown-700 dark:text-brown-300 text-xs px-2 py-1 rounded">
                      Product
                    </span>
                  </div>
                </div>

                {/* Example 3: Modern Building */}
                <div className="bg-card rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow">
                  <div className="aspect-square overflow-hidden bg-muted/30">
                    <img
                      src="https://cloud.google.com/static/vertex-ai/generative-ai/docs/image/images/1_style-photography_modern-building.png"
                      alt="Modern building with water"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4">
                    <h4 className="font-semibold mb-2 text-foreground">Architecture Photography</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      "A photo of a modern building with water in background"
                    </p>
                    <span className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs px-2 py-1 rounded">
                      Architecture
                    </span>
                  </div>
                </div>

                {/* Example 4: Technical Pencil Drawing */}
                <div className="bg-card rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow">
                  <div className="aspect-square overflow-hidden bg-muted/30">
                    <img
                      src="https://cloud.google.com/static/vertex-ai/generative-ai/docs/image/images/2_style-illustration1A.png"
                      alt="Technical pencil drawing of sports car"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4">
                    <h4 className="font-semibold mb-2 text-foreground">Technical Illustration</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      "A technical pencil drawing of an angular sports car"
                    </p>
                    <span className="inline-block bg-gray-100 dark:bg-gray-700 text-foreground text-xs px-2 py-1 rounded">
                      Pencil Drawing
                    </span>
                  </div>
                </div>

                {/* Example 5: Charcoal Drawing */}
                <div className="bg-card rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow">
                  <div className="aspect-square overflow-hidden bg-muted/30">
                    <img
                      src="https://cloud.google.com/static/vertex-ai/generative-ai/docs/image/images/2_style-illustration1B.png"
                      alt="Charcoal drawing of sports car"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4">
                    <h4 className="font-semibold mb-2 text-foreground">Charcoal Art</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      "A charcoal drawing of an angular sports car"
                    </p>
                    <span className="inline-block bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs px-2 py-1 rounded">
                      Charcoal
                    </span>
                  </div>
                </div>

                {/* Example 6: Pastel Painting */}
                <div className="bg-card rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow">
                  <div className="aspect-square overflow-hidden bg-muted/30">
                    <img
                      src="https://cloud.google.com/static/vertex-ai/generative-ai/docs/image/images/2_style-illustration2E.png"
                      alt="Pastel painting of sports car"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4">
                    <h4 className="font-semibold mb-2 text-foreground">Pastel Painting</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      "A pastel painting of an angular sports car"
                    </p>
                    <span className="inline-block bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300 text-xs px-2 py-1 rounded">
                      Pastel Art
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Photorealism Tips */}
          <section className="container mx-auto px-4 py-16 bg-background">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-4 text-foreground">{t('prompt_guide.photorealism_title')}</h2>
              <p className="text-center text-muted-foreground mb-12">
                {t('prompt_guide.photorealism_subtitle')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Portrait Photography */}
                <div className="bg-card rounded-xl p-6 border border-border">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-foreground text-foreground">
                    <span className="text-2xl">👤</span> Portrait Photography
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-3">
                      <p className="text-foreground">
                        "35mm portrait, film noir, black and white film"
                      </p>
                    </div>
                    <p className="text-muted-foreground">
                      <span className="font-semibold">Best for:</span> Professional headshots, character studies, emotional portraits
                    </p>
                  </div>
                </div>

                {/* Macro/Object Photography */}
                <div className="bg-card rounded-xl p-6 border border-border">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-foreground text-foreground">
                    <span className="text-2xl">🔍</span> Macro & Object Photography
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3">
                      <p className="text-foreground">
                        "100mm macro lens, controlled lighting"
                      </p>
                    </div>
                    <p className="text-muted-foreground">
                      <span className="font-semibold">Best for:</span> Product photography, jewelry, nature close-ups, texture details
                    </p>
                  </div>
                </div>

                {/* Motion Photography */}
                <div className="bg-card rounded-xl p-6 border border-border">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-foreground text-foreground">
                    <span className="text-2xl">⚡</span> Action & Motion
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-3">
                      <p className="text-foreground">
                        "fast shutter speed, movement tracking, 100-400mm telephoto"
                      </p>
                    </div>
                    <p className="text-muted-foreground">
                      <span className="font-semibold">Best for:</span> Sports photography, wildlife in motion, action sequences
                    </p>
                  </div>
                </div>

                {/* Landscape Photography */}
                <div className="bg-card rounded-xl p-6 border border-border">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-foreground text-foreground">
                    <span className="text-2xl">🏔️</span> Landscape Photography
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-3">
                      <p className="text-foreground">
                        "wide angle 10mm, long exposure, clear focus"
                      </p>
                    </div>
                    <p className="text-muted-foreground">
                      <span className="font-semibold">Best for:</span> Scenery, architecture, travel photography, cityscapes
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Showcase Section - Nano Banana (outside tabs, visible in both tabs) */}
      {routeModel === 'nano-banana' && (
        <section className="container mx-auto px-4 py-16 bg-gradient-to-b from-background to-muted/20">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 text-foreground">{t('showcase.title')}</h2>
            <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">{t('showcase.description')}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Example 1: Color Change */}
              <div className="space-y-4">
                <ImageComparison
                  beforeImage="/examples/living-room-before.jpg"
                  afterImage="/examples/living-room-after.png"
                  beforeAlt={t('showcase.example1.before')}
                  afterAlt={t('showcase.example1.after')}
                />
                <p className="text-center text-sm font-medium text-foreground line-clamp-2 hover:line-clamp-none transition-all cursor-help">
                  {t('showcase.example1.description')}
                </p>
              </div>

              {/* Example 2: Style Transfer */}
              <div className="space-y-4">
                <ImageComparison
                  beforeImage="/examples/motorcycle-before.jpg"
                  afterImage="/examples/motorcycle-after.png"
                  beforeAlt={t('showcase.example2.before')}
                  afterAlt={t('showcase.example2.after')}
                />
                <p className="text-center text-sm font-medium text-foreground line-clamp-2 hover:line-clamp-none transition-all cursor-help">
                  {t('showcase.example2.description')}
                </p>
              </div>

              {/* Example 3: Product Visualization */}
              <div className="space-y-4">
                <ImageComparison
                  beforeImage="/examples/jumpsuit-before.png"
                  afterImage="/examples/jumpsuit-after.png"
                  beforeAlt={t('showcase.example3.before')}
                  afterAlt={t('showcase.example3.after')}
                />
                <p className="text-center text-sm font-medium text-foreground line-clamp-1 hover:line-clamp-none transition-all cursor-help" title={t('showcase.example3.description')}>
                  {t('showcase.example3.description')}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* How to Use Section - Text to Image (for doubao-seedream) */}
      {activeTab === 'text-to-image' && routeModel === 'doubao-seedream' && (
        <section className="container mx-auto px-4 py-16 bg-card">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12 text-foreground">{t('how_to_use_t2i.title')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  1
                </div>
                <p className="text-sm">{t('how_to_use_t2i.step1')}</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  2
                </div>
                <p className="text-sm">{t('how_to_use_t2i.step2')}</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  3
                </div>
                <p className="text-sm">{t('how_to_use_t2i.step3')}</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  4
                </div>
                <p className="text-sm">{t('how_to_use_t2i.step4')}</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  5
                </div>
                <p className="text-sm">{t('how_to_use_t2i.step5')}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Image to Image Showcase Section */}
      {activeTab === 'image-to-image' && routeModel === 'doubao-seedream' && (
        <section className="container mx-auto px-4 py-16 bg-card">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4 text-foreground">{t('i2i_showcase.title')}</h2>
            <p className="text-center text-muted-foreground mb-12">
              {t('i2i_showcase.subtitle')}
            </p>

            {/* Examples Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
              {/* Example 1 */}
              <div>
                <div className="relative bg-card rounded-xl overflow-hidden shadow-lg p-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <img
                        src="https://chatmix.top/image-to-prompt/s4-03.jpg"
                        alt="Before"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                      <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center shadow-lg font-bold border-4 border-white">
                        VS
                      </div>
                    </div>
                    <div className="relative flex-1">
                      <img
                        src="https://chatmix.top/image-to-prompt/s4-04.jpg"
                        alt="After"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  The character in the image, a 1/7 scale commercial figurine, realistic style, real environment, the figurine placed on a computer desk, the content on the computer screen showing the modeling process of the figurine.
                </p>
              </div>

              {/* Example 2 */}
              <div>
                <div className="relative bg-card rounded-xl overflow-hidden shadow-lg p-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <img
                        src="https://chatmix.top/image-to-prompt/s4-05.jpg"
                        alt="Before"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                      <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center shadow-lg font-bold border-4 border-white">
                        VS
                      </div>
                    </div>
                    <div className="relative flex-1">
                      <img
                        src="https://chatmix.top/image-to-prompt/s4-06.jpg"
                        alt="After"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Change the style to Ghibli Studio style, keeping the characters and environment unchanged
                </p>
              </div>

              {/* Example 3 */}
              <div>
                <div className="relative bg-card rounded-xl overflow-hidden shadow-lg p-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <img
                        src="https://chatmix.top/image-to-prompt/s4-07.jpg"
                        alt="Before"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                      <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center shadow-lg font-bold border-4 border-white">
                        VS
                      </div>
                    </div>
                    <div className="relative flex-1">
                      <img
                        src="https://chatmix.top/image-to-prompt/s4-08.jpg"
                        alt="After"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Use this style, generate a image of a girl dancing in the garden
                </p>
              </div>

              {/* Example 4 */}
              <div>
                <div className="relative bg-card rounded-xl overflow-hidden shadow-lg p-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <img
                        src="https://chatmix.top/image-to-prompt/s4-09.jpg"
                        alt="Before"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                      <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center shadow-lg font-bold border-4 border-white">
                        VS
                      </div>
                    </div>
                    <div className="relative flex-1">
                      <img
                        src="https://chatmix.top/image-to-prompt/s4-10.jpg"
                        alt="After"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Make this room clean and tidy
                </p>
              </div>
            </div>

            {/* How to Use Section */}
            <div className="mt-16">
              <h2 className="text-3xl font-bold text-center mb-12 text-foreground">{t('how_to_use_i2i.title')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-start">
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                    1
                  </div>
                  <p className="text-sm">{t('how_to_use_i2i.step1')}</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                    2
                  </div>
                  <p className="text-sm">{t('how_to_use_i2i.step2')}</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                    3
                  </div>
                  <p className="text-sm">{t('how_to_use_i2i.step3')}</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                    4
                  </div>
                  <p className="text-sm">{t('how_to_use_i2i.step4')}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Model Info Section - Only show for text-to-image tab */}
      {activeTab === 'text-to-image' && filteredModels.length > 0 && routeModel === 'doubao-seedream' ? (
        <section className="container mx-auto px-4 py-16">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-2 text-foreground">{t('model_comparison.title')}</h2>
            <p className="text-center text-muted-foreground mb-12">
              {t('model_comparison.subtitle')}
            </p>

            {/* Model Comparison Table */}
            <div className="bg-card rounded-xl overflow-hidden border border-border">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-4 text-left text-sm font-semibold bg-muted/10">
                        {t('model_comparison.features')}
                      </th>
                      <th className="px-6 py-4 text-center text-sm font-semibold bg-muted/10">
                        Seedream 4.0
                      </th>
                      <th className="px-6 py-4 text-center text-sm font-semibold bg-muted/10">
                        Seedream 3.0
                      </th>
                      <th className="px-6 py-4 text-center text-sm font-semibold bg-muted/10">
                        SeedEdit 3.0
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Image Quality Row */}
                    <tr className="border-b border-border">
                      <td className="px-6 py-4 text-sm font-medium align-top">
                        {t('model_comparison.image_quality')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seedream_4.image_quality')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seedream_3.image_quality')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seededit_3.image_quality')}
                      </td>
                    </tr>

                    {/* Photo-realistic Example Row */}
                    <tr className="border-b border-border">
                      <td className="px-6 py-4 text-sm font-medium align-top">
                        <div className="flex items-start gap-2">
                          <span>{t('model_comparison.photo_realistic_example')}</span>
                          <div className="relative group">
                            <svg
                              className="w-4 h-4 text-purple-600 cursor-help"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <div className="absolute left-0 top-6 w-80 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-lg">
                              <div className="font-semibold mb-1">示例提示词 (Prompt):</div>
                              <div className="text-gray-200">
                                a boy, center-framed and slightly low-angled, is playfully reaching out to a curious cat seated on a worn, wooden floor, with warm, golden light illuminating the scene and a shallow depth of field, blurring the subtle, textured background.
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div
                          className="relative w-48 h-48 mx-auto rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setPreviewImage("https://chatmix.top/image-to-prompt/s4-01.jpeg")}
                        >
                          <img
                            src="https://chatmix.top/image-to-prompt/s4-01.jpeg"
                            alt="Seedream 4.0 Sample"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div
                          className="relative w-48 h-48 mx-auto rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setPreviewImage("https://chatmix.top/image-to-prompt/s3-01.jpeg")}
                        >
                          <img
                            src="https://chatmix.top/image-to-prompt/s3-01.jpeg"
                            alt="Seedream 3.0 Sample"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 justify-center items-center">
                          <div
                            className="relative w-[90px] h-48 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setPreviewImage("https://chatmix.top/image-to-prompt/s-edit-before.jpg")}
                          >
                            <img
                              src="https://chatmix.top/image-to-prompt/s-edit-before.jpg"
                              alt="SeedEdit 3.0 Before"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="text-muted-foreground text-lg">→</div>
                          <div
                            className="relative w-[90px] h-48 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setPreviewImage("https://chatmix.top/image-to-prompt/s-edit-after.jpeg")}
                          >
                            <img
                              src="https://chatmix.top/image-to-prompt/s-edit-after.jpeg"
                              alt="SeedEdit 3.0 After"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Text Rendering Example Row */}
                    <tr>
                      <td className="px-6 py-4 text-sm font-medium align-top">
                        {t('model_comparison.text_rendering_example')}
                      </td>
                      <td className="px-6 py-4">
                        <div
                          className="relative w-48 h-48 mx-auto rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setPreviewImage("https://chatmix.top/image-to-prompt/s4-02.jpg")}
                        >
                          <img
                            src="https://chatmix.top/image-to-prompt/s4-02.jpg"
                            alt="Seedream 4.0 Text Rendering"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div
                          className="relative w-48 h-48 mx-auto rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setPreviewImage("https://chatmix.top/image-to-prompt/s3-02.jpg")}
                        >
                          <img
                            src="https://chatmix.top/image-to-prompt/s3-02.jpg"
                            alt="Seedream 3.0 Text Rendering"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 justify-center items-center">
                          <div
                            className="relative w-[90px] h-48 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setPreviewImage("https://chatmix.top/image-to-prompt/s3-02.jpg")}
                          >
                            <img
                              src="https://chatmix.top/image-to-prompt/s3-02.jpg"
                              alt="SeedEdit 3.0 Before"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="text-muted-foreground text-lg">→</div>
                          <div
                            className="relative w-[90px] h-48 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setPreviewImage("https://chatmix.top/image-to-prompt/s-edit-after-2.jpg")}
                          >
                            <img
                              src="https://chatmix.top/image-to-prompt/s-edit-after-2.jpg"
                              alt="SeedEdit 3.0 After"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Processing Speed Row */}
                    <tr className="border-b border-border">
                      <td className="px-6 py-4 text-sm font-medium align-top">
                        {t('model_comparison.processing_speed')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seedream_4.processing_speed')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seedream_3.processing_speed')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seededit_3.processing_speed')}
                      </td>
                    </tr>

                    {/* Realistic Humans Row */}
                    <tr className="border-b border-border">
                      <td className="px-6 py-4 text-sm font-medium align-top">
                        {t('model_comparison.realistic_humans')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seedream_4.realistic_humans')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seedream_3.realistic_humans')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seededit_3.realistic_humans')}
                      </td>
                    </tr>

                    {/* Text Rendering Row */}
                    <tr className="border-b border-border">
                      <td className="px-6 py-4 text-sm font-medium align-top">
                        {t('model_comparison.text_rendering')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seedream_4.text_rendering')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seedream_3.text_rendering')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seededit_3.text_rendering')}
                      </td>
                    </tr>

                    {/* Applicable Scenarios Row */}
                    <tr>
                      <td className="px-6 py-4 text-sm font-medium align-top">
                        {t('model_comparison.applicable_scenarios')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seedream_4.scenarios')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seedream_3.scenarios')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {t('model_comparison.seededit_3.scenarios')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh]">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 text-2xl"
            >
              ✕
            </button>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* FAQ Section */}
      <section className="container mx-auto px-4 py-16 bg-muted/10">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4 text-foreground">{t('faq.title')}</h2>
          <p className="text-center text-muted-foreground mb-12">
            {t('faq.subtitle')}
          </p>

          <Accordion type="single" collapsible defaultValue="item-1" className="space-y-4">
            <AccordionItem value="item-1" className="bg-card rounded-xl border border-border px-6">
              <AccordionTrigger className="text-lg font-semibold text-foreground hover:no-underline">
                {t('faq.q1')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t('faq.a1')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="bg-card rounded-xl border border-border px-6">
              <AccordionTrigger className="text-lg font-semibold text-foreground hover:no-underline">
                {t('faq.q2')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t('faq.a2')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="bg-card rounded-xl border border-border px-6">
              <AccordionTrigger className="text-lg font-semibold text-foreground hover:no-underline">
                {t('faq.q3')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t('faq.a3')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="bg-card rounded-xl border border-border px-6">
              <AccordionTrigger className="text-lg font-semibold text-foreground hover:no-underline">
                {t('faq.q4')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t('faq.a4')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="bg-card rounded-xl border border-border px-6">
              <AccordionTrigger className="text-lg font-semibold text-foreground hover:no-underline">
                {t('faq.q5')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t('faq.a5')}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>
      </div>
    </>
  );
}
