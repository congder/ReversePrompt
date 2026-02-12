export interface VideoModel {
  id: string;
  name: string;
  model: string;
  description: string;
  provider: string;
  supportsTextToVideo: boolean;
  supportsVideoToVideo?: boolean;
  maxDuration?: number; // 最大持续时间（秒）
  aspectRatios?: string[];
}

export interface VideoGenerationRequest {
  model: string;
  prompt: string;
  aspect_ratio?: string;
  quality?: string;
  generation_type: 'TEXT' | 'FIRST&LAST' | 'REFERENCE';
  duration?: number;
  generate_audio?: boolean;
  image_urls?: string[];
}

export interface VideoGenerationResponse {
  code: number;
  message: string;
  data: {
    id?: string;
    videos?: string[];
    progress?: number;
    status?: 'pending' | 'processing' | 'completed' | 'failed';
  };
}

export interface VideoTaskStatus {
  code: number;
  message: string;
  data: {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    results?: string[];
    original_results?: string[];
    error?: string;
  };
}