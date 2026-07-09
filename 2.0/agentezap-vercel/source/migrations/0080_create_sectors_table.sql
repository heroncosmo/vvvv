-- Migration: Create sectors table for T4.4 Setores e Roteamento
-- Created: 2025-02-18

CREATE TABLE IF NOT EXISTS sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  keywords TEXT[] DEFAULT '{}',
  auto_assign_agent_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sectors_name ON sectors(name);
CREATE INDEX IF NOT EXISTS idx_sectors_auto_assign ON sectors(auto_assign_agent_id) WHERE auto_assign_agent_id IS NOT NULL;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_sectors_updated_at ON sectors;
CREATE TRIGGER update_sectors_updated_at
  BEFORE UPDATE ON sectors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default sectors (Financeiro, Suporte, Comercial)
INSERT INTO sectors (name, description, keywords) VALUES
  ('Financeiro', 'Setor responsável por questões de pagamento, faturas e reembolsos', ARRAY['pagamento', 'fatura', 'boleto', 'pix', 'reembolso', 'cobrança', 'dinheiro', 'custo', 'preço', 'valor', 'cartão']),
  ('Suporte Técnico', 'Atendimento para problemas técnicos e dúvidas sobre o sistema', ARRAY['erro', 'bug', 'problema', 'não funciona', 'falha', 'técnico', 'ajuda', 'suporte', 'erro', 'issue']),
  ('Comercial', 'Vendas, planos, upgrades e negociações', ARRAY['venda', 'plano', 'upgrade', 'comprar', 'assinatura', 'preço', 'desconto', 'oferta', 'negócio', 'comercial', 'vender'])
ON CONFLICT DO NOTHING;
