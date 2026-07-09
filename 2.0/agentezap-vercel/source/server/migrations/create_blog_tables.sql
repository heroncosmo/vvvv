CREATE TABLE IF NOT EXISTS blog_asset_images (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL DEFAULT 'template',
  model VARCHAR(120),
  prompt TEXT,
  alt_text TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'image/svg+xml',
  file_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  width INTEGER NOT NULL DEFAULT 1200,
  height INTEGER NOT NULL DEFAULT 630,
  source_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_asset_images_provider ON blog_asset_images(provider);
CREATE INDEX IF NOT EXISTS idx_blog_asset_images_created ON blog_asset_images(created_at);

CREATE TABLE IF NOT EXISTS blog_author_profiles (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(255) NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  profile_url TEXT,
  expertise JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_author_profiles_default ON blog_author_profiles(is_default, created_at);

CREATE TABLE IF NOT EXISTS blog_source_snapshots (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL,
  source_key VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  source_url TEXT,
  domain VARCHAR(255),
  excerpt TEXT,
  summary TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMP,
  fetched_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_source_snapshots_type ON blog_source_snapshots(source_type, created_at);
CREATE INDEX IF NOT EXISTS idx_blog_source_snapshots_key ON blog_source_snapshots(source_key);

CREATE TABLE IF NOT EXISTS blog_topics (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  title_hint VARCHAR(255) NOT NULL,
  keyword_primary VARCHAR(255) NOT NULL UNIQUE,
  keywords_secondary JSONB NOT NULL DEFAULT '[]'::jsonb,
  cluster VARCHAR(120) NOT NULL,
  category_slug VARCHAR(120) NOT NULL,
  intent VARCHAR(50) NOT NULL DEFAULT 'commercial',
  funnel_stage VARCHAR(50) NOT NULL DEFAULT 'mofu',
  source_type VARCHAR(50) NOT NULL DEFAULT 'seed',
  source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  brief_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  score INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMP,
  published_post_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_topics_status ON blog_topics(status, created_at);
CREATE INDEX IF NOT EXISTS idx_blog_topics_cluster ON blog_topics(cluster, created_at);

CREATE TABLE IF NOT EXISTS blog_context_packs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id VARCHAR REFERENCES blog_topics(id) ON DELETE CASCADE,
  pack_type VARCHAR(50) NOT NULL DEFAULT 'editorial',
  keyword_primary VARCHAR(255) NOT NULL,
  cluster VARCHAR(120) NOT NULL,
  summary TEXT NOT NULL,
  outline JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_snapshot_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  internal_notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_context_packs_topic ON blog_context_packs(topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_blog_context_packs_keyword ON blog_context_packs(keyword_primary);

CREATE TABLE IF NOT EXISTS blog_posts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id VARCHAR REFERENCES blog_topics(id) ON DELETE SET NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  title VARCHAR(255) NOT NULL,
  excerpt TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  faq_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  keyword_primary VARCHAR(255) NOT NULL,
  keywords_secondary JSONB NOT NULL DEFAULT '[]'::jsonb,
  cluster VARCHAR(120) NOT NULL,
  category_slug VARCHAR(120) NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  intent VARCHAR(50) NOT NULL DEFAULT 'commercial',
  funnel_stage VARCHAR(50) NOT NULL DEFAULT 'mofu',
  meta_title VARCHAR(255) NOT NULL,
  meta_description TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  json_ld JSONB NOT NULL DEFAULT '{}'::jsonb,
  author_slug VARCHAR(120),
  context_pack_id VARCHAR REFERENCES blog_context_packs(id) ON DELETE SET NULL,
  hero_image_id VARCHAR REFERENCES blog_asset_images(id) ON DELETE SET NULL,
  hero_image_url TEXT,
  hero_image_alt TEXT,
  image_prompt TEXT,
  references_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  semantic_review JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_score INTEGER NOT NULL DEFAULT 0,
  duplicate_similarity NUMERIC(5, 4) NOT NULL DEFAULT 0,
  internal_proof_count INTEGER NOT NULL DEFAULT 0,
  required_internal_links INTEGER NOT NULL DEFAULT 0,
  unsupported_claims INTEGER NOT NULL DEFAULT 0,
  source_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_notes TEXT,
  distribution_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reading_time_minutes INTEGER NOT NULL DEFAULT 1,
  model_provider VARCHAR(50) NOT NULL DEFAULT 'mistral',
  model_name VARCHAR(120) NOT NULL DEFAULT 'mistral-medium-latest',
  publish_eligible_at TIMESTAMP,
  refresh_reason TEXT,
  published_at TIMESTAMP,
  last_refresh_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status, published_at);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category_slug, published_at);
CREATE INDEX IF NOT EXISTS idx_blog_posts_cluster ON blog_posts(cluster, published_at);
CREATE INDEX IF NOT EXISTS idx_blog_posts_keyword ON blog_posts(keyword_primary);

CREATE TABLE IF NOT EXISTS blog_post_revisions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  revision_type VARCHAR(50) NOT NULL DEFAULT 'draft',
  body_html TEXT NOT NULL,
  body_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_score INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_post_revisions_post ON blog_post_revisions(post_id, created_at);

CREATE TABLE IF NOT EXISTS blog_post_sources (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR REFERENCES blog_posts(id) ON DELETE CASCADE,
  topic_id VARCHAR REFERENCES blog_topics(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL,
  source_key VARCHAR(255) NOT NULL,
  source_url TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_post_sources_post ON blog_post_sources(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_blog_post_sources_topic ON blog_post_sources(topic_id, created_at);

CREATE TABLE IF NOT EXISTS blog_generation_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id VARCHAR REFERENCES blog_topics(id) ON DELETE SET NULL,
  post_id VARCHAR REFERENCES blog_posts(id) ON DELETE SET NULL,
  job_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  provider VARCHAR(50) NOT NULL DEFAULT 'mistral',
  model VARCHAR(120),
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_generation_jobs_status ON blog_generation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_blog_generation_jobs_topic ON blog_generation_jobs(topic_id, created_at);

CREATE TABLE IF NOT EXISTS blog_publish_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR REFERENCES blog_posts(id) ON DELETE CASCADE,
  job_type VARCHAR(50) NOT NULL DEFAULT 'publish',
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  executed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_publish_jobs_post ON blog_publish_jobs(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_blog_publish_jobs_status ON blog_publish_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS blog_indexing_checks (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR REFERENCES blog_posts(id) ON DELETE CASCADE,
  inspected_url TEXT NOT NULL,
  inspection_type VARCHAR(50) NOT NULL DEFAULT 'url_inspection',
  indexing_state VARCHAR(120),
  coverage_state VARCHAR(255),
  google_canonical TEXT,
  user_canonical TEXT,
  sitemaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  verdict VARCHAR(120),
  raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_indexing_checks_post ON blog_indexing_checks(post_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_blog_indexing_checks_url ON blog_indexing_checks(inspected_url);

CREATE TABLE IF NOT EXISTS blog_post_metrics (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR REFERENCES blog_posts(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(8, 4) NOT NULL DEFAULT 0,
  position NUMERIC(8, 2) NOT NULL DEFAULT 0,
  source VARCHAR(50) NOT NULL DEFAULT 'search_console',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_post_metrics_post_date_source
  ON blog_post_metrics(post_id, metric_date, source);

CREATE INDEX IF NOT EXISTS idx_blog_post_metrics_date ON blog_post_metrics(metric_date, source);

ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS author_slug VARCHAR(120);
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS context_pack_id VARCHAR;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS references_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS semantic_review JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS publish_eligible_at TIMESTAMP;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS refresh_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_blog_posts_publish_eligible ON blog_posts(publish_eligible_at, status);
