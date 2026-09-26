-- Stripe/PayNow, self-managed delivery, seasonal codes, new catalogue shape.
--
-- Drops the Lalamove and HitPay-specific columns entirely: there is no
-- production data yet, and leaving dead provider columns behind invites
-- someone to write to them later.

-- ── Products: pack sizes ─────────────────────────────────────────────
ALTER TABLE "products"
  ADD COLUMN "units_per_pack" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "products"
  ADD CONSTRAINT "products_units_per_pack_positive" CHECK ("units_per_pack" >= 1);

-- ── Delivery: two speeds, booked slots, no courier API ───────────────
CREATE TYPE "DeliveryMethod" AS ENUM ('STANDARD', 'EXPRESS');

ALTER TABLE "orders"
  ADD COLUMN "delivery_method" "DeliveryMethod" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "delivery_slot_start" TIMESTAMPTZ(6),
  ADD COLUMN "delivery_slot_end" TIMESTAMPTZ(6);

-- A slot is either fully absent or fully present, and never ends before it
-- starts. Half a slot is not a schedule.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_slot_paired" CHECK (
    ("delivery_slot_start" IS NULL AND "delivery_slot_end" IS NULL)
    OR ("delivery_slot_start" IS NOT NULL AND "delivery_slot_end" IS NOT NULL
        AND "delivery_slot_end" > "delivery_slot_start")
  );

-- The old courier-integration columns.
ALTER TABLE "deliveries"
  DROP COLUMN IF EXISTS "provider",
  DROP COLUMN IF EXISTS "provider_ref",
  DROP COLUMN IF EXISTS "quotation_id",
  DROP COLUMN IF EXISTS "estimated_cost_cents",
  DROP COLUMN IF EXISTS "driver",
  DROP COLUMN IF EXISTS "tracking_url",
  DROP COLUMN IF EXISTS "attempts",
  DROP COLUMN IF EXISTS "next_attempt_at",
  DROP COLUMN IF EXISTS "booked_at";

ALTER TABLE "deliveries"
  ADD COLUMN "courier_ref" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "dispatched_at" TIMESTAMPTZ(6);

DROP TYPE IF EXISTS "DeliveryProvider";

-- Rebuild the delivery status enum around self-managed fulfilment.
ALTER TABLE "deliveries" ALTER COLUMN "delivery_status" DROP DEFAULT;

CREATE TYPE "DeliveryStatus_new" AS ENUM (
  'NOT_SCHEDULED', 'SCHEDULED', 'PREPARING', 'OUT_FOR_DELIVERY',
  'DELIVERED', 'CANCELLED', 'FAILED'
);

ALTER TABLE "deliveries"
  ALTER COLUMN "delivery_status" TYPE "DeliveryStatus_new"
  USING (
    CASE "delivery_status"::text
      WHEN 'NOT_BOOKED'      THEN 'NOT_SCHEDULED'
      WHEN 'BOOKING'         THEN 'SCHEDULED'
      WHEN 'DRIVER_ASSIGNED' THEN 'SCHEDULED'
      WHEN 'PICKED_UP'       THEN 'OUT_FOR_DELIVERY'
      WHEN 'IN_TRANSIT'      THEN 'OUT_FOR_DELIVERY'
      WHEN 'DELIVERED'       THEN 'DELIVERED'
      WHEN 'CANCELLED'       THEN 'CANCELLED'
      ELSE 'FAILED'
    END
  )::"DeliveryStatus_new";

DROP TYPE "DeliveryStatus";
ALTER TYPE "DeliveryStatus_new" RENAME TO "DeliveryStatus";
ALTER TABLE "deliveries" ALTER COLUMN "delivery_status" SET DEFAULT 'NOT_SCHEDULED';

-- ── Payments: Stripe, plus one-shot notification stamps ──────────────
ALTER TABLE "payments" ALTER COLUMN "provider" SET DEFAULT 'stripe';

ALTER TABLE "payments"
  ADD COLUMN "receipt_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "notified_at" TIMESTAMPTZ(6);

-- ── Discount codes: seasonal campaigns ───────────────────────────────
ALTER TABLE "discount_codes" ADD COLUMN "season_label" TEXT;

-- A SEASONAL code needs BOTH ends of its window, and the window must be a
-- window. The old two-way constraint could not express that.
ALTER TABLE "discount_codes" DROP CONSTRAINT IF EXISTS "discount_codes_limit_shape";

ALTER TABLE "discount_codes"
  ADD CONSTRAINT "discount_codes_limit_shape" CHECK (
    ("limit_type" = 'TIME_LIMITED'
       AND "expires_at" IS NOT NULL AND "max_uses" IS NULL)
    OR
    ("limit_type" = 'USE_LIMITED'
       AND "max_uses" > 0 AND "expires_at" IS NULL)
    OR
    ("limit_type" = 'SEASONAL'
       AND "starts_at" IS NOT NULL AND "expires_at" IS NOT NULL
       AND "expires_at" > "starts_at" AND "max_uses" IS NULL)
  );
