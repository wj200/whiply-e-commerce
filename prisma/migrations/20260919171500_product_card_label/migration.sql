-- The uppercase mono label shown on a product card image is per-product
-- content the operator edits (§4.5), not a constant in a component.
ALTER TABLE "products" ADD COLUMN "card_label" TEXT;
