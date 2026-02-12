# Video Generation Feature

## Overview
This document describes the video generation feature implementation for the AI Image SaaS Template.

## Features Implemented

### 1. API Routes
- `/api/ai/video` - Create video generation tasks
- `/api/ai/video/task/[taskId]` - Query task status and get results
- `/api/upload/video` - Upload reference videos for video-to-video generation

### 2. Pages
- `/text-to-video/[model]` - Main video generation page
  - Supports text-to-video generation
  - Supports video-to-video generation
  - Real-time progress tracking
  - Video preview and download

### 3. Models
- Nano Banana Video Pro (`nano-banana-2-video`)
- Evolink Video V1 (`evolink-video-v1`)

### 4. Features
- Text-to-video generation
- Video-to-video transformation
- Multiple resolution options (1024x1024, 1280x720, 720x1280, 1920x1080)
- Duration selection (5s, 10s, 15s, 20s, 30s)
- Quality settings (low, medium, high)
- Style selection (realistic, anime, watercolor, oil)
- Automatic upload to Cloudflare R2 storage
- Progress tracking with polling

## Usage

### Text-to-Video
1. Navigate to `/text-to-video/[model]`
2. Enter a text description of the video
3. Select duration, resolution, quality, and style
4. Click "Generate Video"
5. Wait for generation to complete
6. Download the generated video

### Video-to-Video
1. Navigate to `/text-to-video/[model]`
2. Upload a reference video
3. Enter an optional text description
4. Select generation parameters
5. Click "Generate Video"
6. Wait for generation to complete
7. Download the generated video

## File Structure
```
app/
├── api/
│   └── ai/
│       └── video/
│           └── task/
│               └── [taskId]/
│                   └── route.ts
│           └── route.ts
│   └── upload/
│       └── video/
│           └── route.ts
└── [locale]/
    └── (default)/
        └── text-to-video/
            └── [model]/
                └── page.tsx

lib/
├── model-consumption-mapping.ts (updated)
└── types/video.ts (new)

i18n/
├── messages/
│   ├── en.json (updated)
│   └── zh.json (updated)
└── pages/
    └── video/
        ├── en.json (new)
        └── zh.json (new)
```

## Integration
The video generation feature integrates with:
- Next.js App Router for routing
- Next.js Internationalization (i18n) for multilingual support
- NextAuth.js for authentication
- Cloudflare R2 for video storage
- Evolink API for video generation
- Consumption tracking for user credits

## Testing
1. Start the development server: `pnpm dev`
2. Navigate to `/text-to-video/nano-banana`
3. Test both text-to-video and video-to-video workflows
4. Verify progress tracking and video download functionality

## Notes
- The API endpoints are currently mock implementations and will need to be connected to actual video generation services
- File uploads are limited to 200MB
- Videos are automatically uploaded to Cloudflare R2 after generation
- The implementation follows the same patterns as the existing image generation feature