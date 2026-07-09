-- =============================================================================
-- MIGRATION: Criar tabelas de Lista de Exclusão
-- Esta migration cria as tabelas necessárias para a funcionalidade de
-- lista de exclusão de números que a IA não deve responder automaticamente
-- =============================================================================

-- Tabela principal: Lista de números excluídos
CREATE TABLE IF NOT EXISTS "exclusion_list" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "phone_number" varchar(20) NOT NULL,
  "contact_name" varchar(255),
  "reason" text,
  "exclude_from_followup" boolean NOT NULL DEFAULT true,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS "idx_exclusion_list_user" ON "exclusion_list" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_exclusion_list_phone" ON "exclusion_list" ("phone_number");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_exclusion_list_unique_user_phone" ON "exclusion_list" ("user_id", "phone_number");

-- Tabela de configuração global de exclusão por usuário
CREATE TABLE IF NOT EXISTS "exclusion_config" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "followup_exclusion_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Comentários explicativos
COMMENT ON TABLE "exclusion_list" IS 'Lista de números de telefone que a IA não deve responder automaticamente';
COMMENT ON COLUMN "exclusion_list"."phone_number" IS 'Número de telefone formatado (apenas dígitos, ex: 5511987654321)';
COMMENT ON COLUMN "exclusion_list"."exclude_from_followup" IS 'Se true, também não enviar follow-up automático para este número';
COMMENT ON COLUMN "exclusion_list"."is_active" IS 'Se false, o número está temporariamente removido da exclusão';

COMMENT ON TABLE "exclusion_config" IS 'Configuração global de exclusão por usuário';
COMMENT ON COLUMN "exclusion_config"."is_enabled" IS 'Se a lista de exclusão está ativa globalmente';
COMMENT ON COLUMN "exclusion_config"."followup_exclusion_enabled" IS 'Se a exclusão de follow-up está ativada';
