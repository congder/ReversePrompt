"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "@/i18n/routing";

export default function VideoTestPage() {
  const t = useTranslations('ai_video');
  const [testCount, setTestCount] = useState(0);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Video Generation Test Page
        </h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Test Links</h2>
          <div className="space-y-4">
            <Link href="/text-to-video/nano-banana" className="block p-4 bg-blue-100 rounded hover:bg-blue-200">
              <h3 className="font-medium">Text to Video - Nano Banana</h3>
              <p className="text-sm text-gray-600">Test video generation with Nano Banana model</p>
            </Link>

            <Link href="/text-to-video/all" className="block p-4 bg-green-100 rounded hover:bg-green-200">
              <h3 className="font-medium">Text to Video - All Models</h3>
              <p className="text-sm text-gray-600">Test with available video models</p>
            </Link>

            <Link href="/txt-to-image/nano-banana" className="block p-4 bg-purple-100 rounded hover:bg-purple-200">
              <h3 className="font-medium">Compare: Text to Image - Nano Banana</h3>
              <p className="text-sm text-gray-600">Compare with existing image generation</p>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">API Endpoints Test</h2>
          <div className="space-y-4">
            <button
              onClick={() => setTestCount(c => c + 1)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Trigger Test ({testCount})
            </button>
            <p className="text-sm text-gray-600">
              This will increment a counter to test client-side functionality.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Current Implementation Status</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Video generation API routes created
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Video generation UI components created
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              File upload for videos implemented
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Cloudflare R2 integration for video storage
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Progress tracking with polling
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Internationalization support added
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Navigation menu updated
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}