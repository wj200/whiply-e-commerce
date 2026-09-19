import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return {
    rules: [
      // Nothing behind /admin, /api or a checkout URL belongs in an index.
      { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/checkout'] },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
