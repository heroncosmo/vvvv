-- Migration: Sistema de Revenda White-Label
-- Data: 2026-01-07

-- 1. Adicionar campo reseller_id na tabela users
ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_id VARCHAR(255);

-- 2. Criar tabela de revendedores
CREATE TABLE IF NOT EXISTS resellers (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(255) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  -- Branding
  logo_url TEXT,
  primary_color VARCHAR(20) DEFAULT '#000000',
  secondary_color VARCHAR(20) DEFAULT '#ffffff',
  accent_color VARCHAR(20) DEFAULT '#22c55e',
  company_name VARCHAR(255),
  company_description TEXT,
  
  -- Domínio customizado
  custom_domain VARCHAR(255) UNIQUE,
  subdomain VARCHAR(100) UNIQUE,
  domain_verified BOOLEAN DEFAULT false NOT NULL,
  
  -- Preços para clientes finais
  client_monthly_price DECIMAL(10,2) DEFAULT 99.99,
  client_setup_fee DECIMAL(10,2) DEFAULT 0,
  
  -- Custo por cliente para o revendedor
  cost_per_client DECIMAL(10,2) DEFAULT 49.99,
  
  -- Configurações
  is_active BOOLEAN DEFAULT true NOT NULL,
  max_clients INTEGER DEFAULT 100,
  
  -- Textos customizados
  welcome_message TEXT,
  support_email VARCHAR(255),
  support_phone VARCHAR(50),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Criar tabela de clientes do revendedor
CREATE TABLE IF NOT EXISTS reseller_clients (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reseller_id VARCHAR(255) NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active' NOT NULL,
  
  -- Financeiro
  monthly_cost DECIMAL(10,2) DEFAULT 49.99,
  
  -- MercadoPago
  mp_subscription_id VARCHAR(255),
  mp_status VARCHAR(50),
  next_payment_date TIMESTAMP,
  
  -- Datas
  activated_at TIMESTAMP DEFAULT NOW(),
  suspended_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Criar tabela de pagamentos do revendedor
CREATE TABLE IF NOT EXISTS reseller_payments (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reseller_id VARCHAR(255) NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  reseller_client_id VARCHAR(255) REFERENCES reseller_clients(id) ON DELETE SET NULL,
  
  -- Valores
  amount DECIMAL(10,2) NOT NULL,
  payment_type VARCHAR(50) NOT NULL,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  status_detail VARCHAR(100),
  
  -- MercadoPago
  mp_payment_id VARCHAR(255),
  mp_subscription_id VARCHAR(255),
  payment_method VARCHAR(50),
  
  -- Pagador
  payer_email VARCHAR(255),
  card_last_four_digits VARCHAR(4),
  card_brand VARCHAR(50),
  
  -- Descrição
  description TEXT,
  
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Criar índices
CREATE INDEX IF NOT EXISTS idx_resellers_user ON resellers(user_id);
CREATE INDEX IF NOT EXISTS idx_resellers_domain ON resellers(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resellers_subdomain ON resellers(subdomain) WHERE subdomain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reseller_clients_reseller ON reseller_clients(reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_clients_user ON reseller_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_reseller_clients_status ON reseller_clients(status);
CREATE INDEX IF NOT EXISTS idx_reseller_payments_reseller ON reseller_payments(reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_payments_client ON reseller_payments(reseller_client_id);
CREATE INDEX IF NOT EXISTS idx_reseller_payments_status ON reseller_payments(status);
CREATE INDEX IF NOT EXISTS idx_reseller_payments_date ON reseller_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_users_reseller ON users(reseller_id) WHERE reseller_id IS NOT NULL;

-- 6. Inserir plano de Revenda
INSERT INTO plans (nome, descricao, valor, tipo, periodicidade, caracteristicas, ativo, ordem)
VALUES (
  'Plano Revenda',
  'Revenda o AgentZap com sua marca. Crie contas para seus clientes por R$ 49,99/mês cada.',
  700.00,
  'revenda',
  'mensal',
  '["Logo e cores personalizadas", "Domínio próprio", "Clientes ilimitados", "R$ 49,99/cliente/mês", "Suporte prioritário", "Dashboard de revenda", "White-label completo"]'::jsonb,
  true,
  10
)
ON CONFLICT (nome) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  valor = EXCLUDED.valor,
  tipo = EXCLUDED.tipo,
  caracteristicas = EXCLUDED.caracteristicas;

-- 7. Criar função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_reseller_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Criar triggers para updated_at
DROP TRIGGER IF EXISTS resellers_updated_at ON resellers;
CREATE TRIGGER resellers_updated_at
  BEFORE UPDATE ON resellers
  FOR EACH ROW EXECUTE FUNCTION update_reseller_updated_at();

DROP TRIGGER IF EXISTS reseller_clients_updated_at ON reseller_clients;
CREATE TRIGGER reseller_clients_updated_at
  BEFORE UPDATE ON reseller_clients
  FOR EACH ROW EXECUTE FUNCTION update_reseller_updated_at();
