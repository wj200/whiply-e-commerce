import type { NextConfig } from 'next'

const r2Host = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE
  ? new URL(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE).hostname
  : null

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: r2Host ? [{ protocol: 'https', hostname: r2Host }] : [],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default nextConfig
