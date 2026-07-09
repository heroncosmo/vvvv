-- Migration: Create Tags System Tables
-- Date: 2026-01-06
-- Description: Adds tables for conversation tags/labels (etiquetas) feature

-- =============================================================================
-- TAGS TABLE - Etiquetas definidas pelo usuário
-- =============================================================================
CREATE TABLE IF NOT EXISTS tags (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#6b7280',
  icon VARCHAR(50),
  is_default BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para tags
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_position ON tags(position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_unique_name ON tags(user_id, name);

-- =============================================================================
-- CONVERSATION_TAGS TABLE - Relação many-to-many entre conversas e tags
-- =============================================================================
CREATE TABLE IF NOT EXISTS conversation_tags (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tag_id VARCHAR NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW()
);

-- Índices para conversation_tags
CREATE INDEX IF NOT EXISTS idx_conversation_tags_conversation ON conversation_tags(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_tag ON conversation_tags(tag_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_tags_unique ON conversation_tags(conversation_id, tag_id);

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE tags IS 'Etiquetas/labels definidas por cada usuário para organizar conversas';
COMMENT ON COLUMN tags.user_id IS 'ID do usuário dono da etiqueta';
COMMENT ON COLUMN tags.name IS 'Nome da etiqueta (ex: Novo cliente, Pagamento pendente)';
COMMENT ON COLUMN tags.color IS 'Cor da etiqueta em formato hex (ex: #22c55e)';
COMMENT ON COLUMN tags.icon IS 'Nome do ícone Lucide (opcional)';
COMMENT ON COLUMN tags.is_default IS 'Se é uma etiqueta padrão do sistema (WhatsApp Business defaults)';
COMMENT ON COLUMN tags.position IS 'Posição para ordenação na lista';

COMMENT ON TABLE conversation_tags IS 'Associação entre conversas e etiquetas (many-to-many)';
COMMENT ON COLUMN conversation_tags.assigned_at IS 'Quando a etiqueta foi atribuída à conversa';
