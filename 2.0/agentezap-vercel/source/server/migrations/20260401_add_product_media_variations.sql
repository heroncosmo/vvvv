ALTER TABLE products_config
  ADD COLUMN IF NOT EXISTS image_variations_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE product_media
  ADD COLUMN IF NOT EXISTS variation_code INTEGER,
  ADD COLUMN IF NOT EXISTS variation_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS variation_stock INTEGER,
  ADD COLUMN IF NOT EXISTS variation_is_active BOOLEAN NOT NULL DEFAULT TRUE;

WITH ordered_media AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY product_id
      ORDER BY display_order ASC, created_at ASC, id ASC
    ) AS next_variation_code
  FROM product_media
)
UPDATE product_media AS pm
SET variation_code = ordered_media.next_variation_code
FROM ordered_media
WHERE pm.id = ordered_media.id
  AND pm.variation_code IS NULL;

UPDATE product_media
SET variation_is_active = TRUE
WHERE variation_is_active IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_media_variation_code
  ON product_media (product_id, variation_code);
