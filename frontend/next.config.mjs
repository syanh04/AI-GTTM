import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const isExport = process.env.NEXT_OUTPUT_EXPORT === 'true' || process.env.NETLIFY === 'true'

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
  },
}

if (isExport) {
  nextConfig.output = 'export'
} else {
  nextConfig.rewrites = async () => {
    const backendUrl =
      process.env.BACKEND_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      'http://127.0.0.1:8000'

    if (process.env.VERCEL && /localhost|127\.0\.0\.1/.test(backendUrl)) {
      throw new Error('Production deployment requires a public BACKEND_PUBLIC_URL')
    }

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/video_feed/:path*',
        destination: `${backendUrl}/video_feed/:path*`,
      },
    ]
  }
}

export default nextConfig
