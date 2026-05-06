-- Migration: Add coupons table for discount coupon system
-- Created: 2025-12-31

-- Create coupons table
CREATE TABLE IF NOT EXISTS coupons (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_price DECIMAL(10, 2) NOT NULL,
  description TEXT,
  max_uses INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0 NOT NULL,
  valid_until TIMESTAMP,
  ativo BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for code lookup
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- Insert default coupons
INSERT INTO coupons (code, discount_price, description, ativo)
VALUES 
  ('PROMO29', 29.00, 'Cupom promocional - R$ 29/mês', true),
  ('PROMO49', 49.00, 'Cupom promocional - R$ 49/mês', true)
ON CONFLICT (code) DO NOTHING;
