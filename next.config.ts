import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    cpus: 1,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
}

export default nextConfig
