ALTER TABLE product_media
  ADD COLUMN IF NOT EXISTS variation_name VARCHAR(255);
