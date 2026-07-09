-- ============================================================
-- MIGRATION: Parte 4 - Sistema de Setores para usuário normal (dono do SaaS)
-- Data: 2026-02-20
-- Descrição: Adiciona campos de roteamento nas conversations e owner_id nos sectors
-- ============================================================

-- 1. Adicionar campos de roteamento na tabela conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sector_id VARCHAR(255) NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_to_member_id VARCHAR(255) NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS routing_intent VARCHAR(500) NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS routing_confidence NUMERIC(5,4) NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS routing_at TIMESTAMPTZ NULL;

-- 2. Adicionar owner_id nos sectors (para que cada usuário SaaS tenha seus próprios setores)
ALTER TABLE sectors ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255) NULL;

-- 3. Adicionar owner_id no sector_members (join por usuário)
ALTER TABLE sector_members ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255) NULL;

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_conversations_sector_id ON conversations(sector_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to_member_id ON conversations(assigned_to_member_id);
CREATE INDEX IF NOT EXISTS idx_conversations_routing_at ON conversations(routing_at);
CREATE INDEX IF NOT EXISTS idx_sectors_owner_id ON sectors(owner_id);
CREATE INDEX IF NOT EXISTS idx_sector_members_owner_id ON sector_members(owner_id);
CREATE INDEX IF NOT EXISTS idx_sector_members_member_id ON sector_members(member_id);

-- 5. Verificar se a unicidade de sector_members deve incluir owner_id
-- O UNIQUE(sector_id, member_id) já existe, mas setores por usuário são distintos pela FK sector_id -> owner_id em sectors

-- Done
