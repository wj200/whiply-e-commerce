import type { MetadataRoute } from 'next'
import { listAllSlugs } from '@/lib/domain/products'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const slugs = await listAllSlugs()

  const staticRoutes = [
    '',
    '/shop',
    '/cream-chargers',
    '/baking-equipment',
    '/bulk-orders',
    '/about',
    '/contact',
    '/policies/delivery',
    '/policies/returns',
    '/policies/terms',
    '/policies/privacy',
  ]

  return [
    ...staticRoutes.map((path) => ({
      url: `${base}${path}`,
      lastModified: new Date(),
      priority: path === '' ? 1 : 0.7,
    })),
    ...slugs.map((slug) => ({
      url: `${base}/product/${slug}`,
      lastModified: new Date(),
      priority: 0.9,
    })),
  ]
}
