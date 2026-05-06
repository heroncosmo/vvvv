-- Migration: Add new fields to plans table for enhanced plan management
-- Date: 2024-12-23

-- Add new columns to plans table
ALTER TABLE plans ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS valor_original DECIMAL(10, 2);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS tipo VARCHAR(50) DEFAULT 'padrao';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS desconto_percent INTEGER DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS badge VARCHAR(50);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS destaque BOOLEAN DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS caracteristicas JSONB;

-- Update existing plans with proper tipo
UPDATE plans SET tipo = 'padrao' WHERE tipo IS NULL;

-- Insert new plans: Plano Mensal, Plano Anual (5% OFF), Implementação Completa

-- 1. Plano Mensal (R$99/mês)
INSERT INTO plans (nome, descricao, valor, periodicidade, tipo, limite_conversas, limite_agentes, ordem, caracteristicas, ativo)
VALUES (
  'Plano Mensal',
  'Flexibilidade total - cancele quando quiser',
  99.00,
  'mensal',
  'padrao',
  -1, -- ilimitado
  1,
  1,
  '["IA atendendo 24/7 no WhatsApp", "Conversas ilimitadas", "1 agente IA personalizado", "Respostas automáticas inteligentes", "Suporte técnico via WhatsApp", "Atualizações gratuitas", "Cancele quando quiser"]'::jsonb,
  true
)
ON CONFLICT DO NOTHING;

-- 2. Plano Anual (5% desconto - R$94,05/mês)
INSERT INTO plans (nome, descricao, valor, valor_original, periodicidade, tipo, desconto_percent, badge, destaque, limite_conversas, limite_agentes, ordem, caracteristicas, ativo)
VALUES (
  'Plano Anual',
  'Valor congelado por 12 meses - proteção contra reajustes',
  94.05,
  99.00,
  'anual',
  'anual',
  5,
  '5% OFF',
  true,
  -1, -- ilimitado
  1,
  2,
  '["Tudo do Plano Mensal", "Preço GARANTIDO por 12 meses", "Mesmo que o preço suba, você paga o mesmo", "Economia de R$ 59,40 no ano", "Prioridade no suporte", "Acesso antecipado a novidades"]'::jsonb,
  true
)
ON CONFLICT DO NOTHING;

-- 3. Plano Implementação Completa (R$700 primeiro mês, depois R$99/mês)
INSERT INTO plans (nome, descricao, valor, periodicidade, tipo, badge, limite_conversas, limite_agentes, ordem, caracteristicas, ativo)
VALUES (
  'Implementação Completa',
  'Nós fazemos toda configuração e acompanhamos por 30 dias',
  700.00,
  'mensal',
  'implementacao',
  'RECOMENDADO',
  -1, -- ilimitado
  1,
  3,
  '["Configuração completa da IA", "Personalização do agente para seu negócio", "Treinamento da IA com suas informações", "Integração com seu WhatsApp", "30 dias de acompanhamento dedicado", "Ajustes ilimitados no primeiro mês", "Reuniões de alinhamento semanais", "Após 1º mês: R$99/mês"]'::jsonb,
  true
)
ON CONFLICT DO NOTHING;
