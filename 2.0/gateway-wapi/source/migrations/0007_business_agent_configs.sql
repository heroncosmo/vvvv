-- Migration: Business Agent Configs
-- Description: Nova tabela para configuração avançada de agentes com framework de 5 camadas
-- Author: Sistema de Modernização de Agentes
-- Date: 2025-11-22

-- Criar tabela business_agent_configs
CREATE TABLE IF NOT EXISTS "business_agent_configs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  
  -- Identity Layer
  "agent_name" varchar(100) NOT NULL,
  "agent_role" varchar(200) NOT NULL,
  "company_name" varchar(200) NOT NULL,
  "company_description" text,
  "personality" varchar(100) DEFAULT 'profissional e prestativo' NOT NULL,
  
  -- Knowledge Layer (JSONB para flexibilidade)
  "products_services" jsonb DEFAULT '[]'::jsonb,
  "business_info" jsonb DEFAULT '{}'::jsonb,
  "faq_items" jsonb DEFAULT '[]'::jsonb,
  "policies" jsonb DEFAULT '{}'::jsonb,
  
  -- Guardrails Layer
  "allowed_topics" text[] DEFAULT ARRAY[]::text[],
  "prohibited_topics" text[] DEFAULT ARRAY[]::text[],
  "allowed_actions" text[] DEFAULT ARRAY[]::text[],
  "prohibited_actions" text[] DEFAULT ARRAY[]::text[],
  
  -- Personality Layer
  "tone_of_voice" varchar(50) DEFAULT 'amigável' NOT NULL,
  "communication_style" varchar(50) DEFAULT 'claro e direto' NOT NULL,
  "emoji_usage" varchar(20) DEFAULT 'moderado' NOT NULL,
  "formality_level" integer DEFAULT 5 NOT NULL,
  
  -- Behavior Configuration
  "max_response_length" integer DEFAULT 400 NOT NULL,
  "use_customer_name" boolean DEFAULT true NOT NULL,
  "offer_next_steps" boolean DEFAULT true NOT NULL,
  "escalate_to_human" boolean DEFAULT true NOT NULL,
  "escalation_keywords" text[] DEFAULT ARRAY[]::text[],
  
  -- System Configuration
  "is_active" boolean DEFAULT false NOT NULL,
  "model" varchar(100) DEFAULT 'mistral-small-latest' NOT NULL,
  "trigger_phrases" text[] DEFAULT ARRAY[]::text[],
  "template_type" varchar(50),
  
  -- Metadata
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS "idx_business_agent_configs_user_id" ON "business_agent_configs"("user_id");
CREATE INDEX IF NOT EXISTS "idx_business_agent_configs_is_active" ON "business_agent_configs"("is_active");
CREATE INDEX IF NOT EXISTS "idx_business_agent_configs_template_type" ON "business_agent_configs"("template_type");

-- Comentários para documentação
COMMENT ON TABLE "business_agent_configs" IS 'Configuração avançada de agentes com framework de 5 camadas: Identity, Knowledge, Guardrails, Personality, Behavior';
COMMENT ON COLUMN "business_agent_configs"."products_services" IS 'Array de produtos/serviços: [{name, description, price, features}]';
COMMENT ON COLUMN "business_agent_configs"."business_info" IS 'Informações do negócio: {horarioFuncionamento, endereco, telefone, email, website, redesSociais, formasContato, metodosEntrega}';
COMMENT ON COLUMN "business_agent_configs"."faq_items" IS 'Perguntas frequentes: [{pergunta, resposta, categoria}]';
COMMENT ON COLUMN "business_agent_configs"."policies" IS 'Políticas: {trocasDevolucoes, garantia, privacidade, termos}';
COMMENT ON COLUMN "business_agent_configs"."emoji_usage" IS 'Frequência de uso de emojis: nunca | raro | moderado | frequente';
COMMENT ON COLUMN "business_agent_configs"."formality_level" IS 'Nível de formalidade de 1 (muito informal) a 10 (muito formal)';
COMMENT ON COLUMN "business_agent_configs"."template_type" IS 'Tipo de template aplicado: ecommerce | professional | health | education | realestate | custom';

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_business_agent_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_business_agent_configs_updated_at
  BEFORE UPDATE ON "business_agent_configs"
  FOR EACH ROW
  EXECUTE FUNCTION update_business_agent_configs_updated_at();
