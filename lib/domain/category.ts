import type { ProductCategory } from '@/lib/generated/prisma'

/** Category labels, shared by storefront and admin. No server-only imports. */
export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  CREAM_CHARGERS: 'Cream Chargers',
  BAKING_EQUIPMENT: 'Baking Equipment',
}
