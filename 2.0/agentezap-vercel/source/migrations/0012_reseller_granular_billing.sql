-- Migration: Reseller Granular Billing
-- Adds support for per-client SaaS billing instead of aggregate monthly billing

-- 1. Add SaaS payment tracking columns to reseller_clients
ALTER TABLE reseller_clients 
ADD COLUMN IF NOT EXISTS saas_paid_until TIMESTAMP,
ADD COLUMN IF NOT EXISTS saas_status VARCHAR(20) DEFAULT 'active';

-- 2. Create invoice items table for granular billing
CREATE TABLE IF NOT EXISTS reseller_invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES reseller_invoices(id) ON DELETE CASCADE,
  reseller_client_id VARCHAR(255) REFERENCES reseller_clients(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reseller_invoice_items_invoice ON reseller_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_reseller_invoice_items_client ON reseller_invoice_items(reseller_client_id);

-- 4. Add index on saas_status for filtering
CREATE INDEX IF NOT EXISTS idx_reseller_clients_saas_status ON reseller_clients(saas_status);
