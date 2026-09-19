-- Blueprint §10.3 — invariants the DATABASE enforces, not the application.
-- Each one is the last line of defence for a rule that must never be broken.

-- Stock can never go negative. The oversell guard (GUARD-5).
ALTER TABLE "products"
  ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock_qty" >= 0),
  ADD CONSTRAINT "products_price_non_negative" CHECK ("price_cents" >= 0),
  ADD CONSTRAINT "products_low_stock_non_negative" CHECK ("low_stock_at" >= 0);

-- The arithmetic of §5.2, asserted on every insert and update.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_arithmetic"
    CHECK ("total_cents" = "subtotal_cents" - "discount_cents" + "delivery_fee_cents"),
  ADD CONSTRAINT "orders_amounts_non_negative"
    CHECK ("subtotal_cents" >= 0 AND "discount_cents" >= 0
           AND "delivery_fee_cents" >= 0 AND "total_cents" >= 0),
  ADD CONSTRAINT "orders_discount_not_exceeding_subtotal"
    CHECK ("discount_cents" <= "subtotal_cents"),
  ADD CONSTRAINT "orders_postal_code_format"
    CHECK ("postal_code" ~ '^[0-9]{6}$');

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" >= 1),
  ADD CONSTRAINT "order_items_line_total_arithmetic"
    CHECK ("line_total_cents" = "unit_price_cents" * "quantity"),
  ADD CONSTRAINT "order_items_unit_price_non_negative" CHECK ("unit_price_cents" >= 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_non_negative" CHECK ("amount_cents" >= 0),
  ADD CONSTRAINT "payments_refund_within_amount"
    CHECK ("refunded_cents" >= 0 AND "refunded_cents" <= "amount_cents");

ALTER TABLE "deliveries"
  ADD CONSTRAINT "deliveries_costs_non_negative"
    CHECK (("estimated_cost_cents" IS NULL OR "estimated_cost_cents" >= 0)
       AND ("actual_cost_cents" IS NULL OR "actual_cost_cents" >= 0));

-- A discount code that cannot be interpreted cannot be stored (§5.4).
ALTER TABLE "discount_codes"
  ADD CONSTRAINT "discount_codes_value_shape" CHECK (
    ("value_type" = 'PERCENT' AND "percent_off" BETWEEN 1 AND 100 AND "value_cents" IS NULL)
    OR
    ("value_type" = 'FIXED' AND "value_cents" > 0 AND "percent_off" IS NULL)
  ),
  ADD CONSTRAINT "discount_codes_limit_shape" CHECK (
    ("limit_type" = 'TIME_LIMITED' AND "expires_at" IS NOT NULL AND "max_uses" IS NULL)
    OR
    ("limit_type" = 'USE_LIMITED' AND "max_uses" > 0 AND "expires_at" IS NULL)
  ),
  ADD CONSTRAINT "discount_codes_uses_non_negative" CHECK ("uses_count" >= 0),
  ADD CONSTRAINT "discount_codes_code_uppercase" CHECK ("code" = UPPER("code"));

ALTER TABLE "discount_redemptions"
  ADD CONSTRAINT "discount_redemptions_amounts_non_negative"
    CHECK ("discount_cents" >= 0 AND "order_total_cents" >= 0);
