ALTER TABLE grupo_olx_integrations
  ADD COLUMN IF NOT EXISTS xml_feed_url text,
  ADD COLUMN IF NOT EXISTS catalog_sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lead_email_sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS maton_api_key text,
  ADD COLUMN IF NOT EXISTS maton_connection_id varchar(255),
  ADD COLUMN IF NOT EXISTS maton_inbox_email varchar(255),
  ADD COLUMN IF NOT EXISTS maton_sender_filter varchar(255) DEFAULT 'comunica.zapimoveis.com.br',
  ADD COLUMN IF NOT EXISTS sync_to_ai boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_catalog_sync_at timestamp,
  ADD COLUMN IF NOT EXISTS last_catalog_sync_status varchar(50) NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS last_catalog_sync_message text,
  ADD COLUMN IF NOT EXISTS last_lead_sync_at timestamp,
  ADD COLUMN IF NOT EXISTS last_lead_sync_status varchar(50) NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS last_lead_sync_message text;

CREATE TABLE IF NOT EXISTS grupo_olx_listings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id varchar NOT NULL REFERENCES grupo_olx_integrations(id) ON DELETE CASCADE,
  external_listing_id varchar(255) NOT NULL,
  listing_code varchar(255),
  title text NOT NULL,
  transaction_type varchar(100),
  property_type varchar(100),
  publication_type varchar(100),
  description text,
  detail_url text,
  image_url text,
  price numeric(12, 2),
  condo_fee numeric(12, 2),
  yearly_tax numeric(12, 2),
  bedrooms integer,
  bathrooms integer,
  suites integer,
  garage integer,
  living_area numeric(12, 2),
  lot_area numeric(12, 2),
  city varchar(255),
  state varchar(100),
  neighborhood varchar(255),
  address text,
  searchable_text text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamp DEFAULT now(),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grupo_olx_listings_integration
  ON grupo_olx_listings(integration_id);

CREATE INDEX IF NOT EXISTS idx_grupo_olx_listings_city
  ON grupo_olx_listings(city);

CREATE INDEX IF NOT EXISTS idx_grupo_olx_listings_neighborhood
  ON grupo_olx_listings(neighborhood);

CREATE INDEX IF NOT EXISTS idx_grupo_olx_listings_active
  ON grupo_olx_listings(is_active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grupo_olx_listings_unique_external
  ON grupo_olx_listings(integration_id, external_listing_id);
