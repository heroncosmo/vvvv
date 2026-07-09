WITH ordered_media AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY created_at ASC, product_id ASC, display_order ASC, id ASC
    ) AS next_variation_code
  FROM product_media
)
UPDATE product_media AS pm
SET variation_code = ordered_media.next_variation_code
FROM ordered_media
WHERE pm.id = ordered_media.id;
