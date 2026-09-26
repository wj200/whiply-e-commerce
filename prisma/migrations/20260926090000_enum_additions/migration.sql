-- Postgres refuses to let a transaction use an enum value it added itself,
-- so the new labels land in a migration of their own and the migration that
-- follows is free to reference them.

ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'CREAM_PRODUCTS';
ALTER TYPE "DiscountLimitType" ADD VALUE IF NOT EXISTS 'SEASONAL';
