CREATE TABLE IF NOT EXISTS product_media (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id VARCHAR NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_url TEXT NOT NULL,
  storage_path TEXT,
  file_name VARCHAR(500),
  file_size INTEGER,
  mime_type VARCHAR(100),
  caption TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_media_product
  ON product_media(product_id);

CREATE INDEX IF NOT EXISTS idx_product_media_user
  ON product_media(user_id);

CREATE INDEX IF NOT EXISTS idx_product_media_order
  ON product_media(product_id, display_order);

INSERT INTO product_media (product_id, user_id, storage_url, display_order)
SELECT p.id, p.user_id, p.image_url, 0
FROM products p
WHERE p.image_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM product_media pm
    WHERE pm.product_id = p.id
      AND pm.storage_url = p.image_url
  );
