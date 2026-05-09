CREATE TABLE IF NOT EXISTS referral_support_materials (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  caption TEXT,
  file_url TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  file_name VARCHAR(255) NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  media_type VARCHAR(30) NOT NULL DEFAULT 'document',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ai_model VARCHAR(120),
  created_by VARCHAR(255) NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_support_materials_created
  ON referral_support_materials(created_at);

CREATE INDEX IF NOT EXISTS idx_referral_support_materials_media_type
  ON referral_support_materials(media_type);
