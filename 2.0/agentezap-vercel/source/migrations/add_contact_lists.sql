-- =============================================================================
-- CONTACT LISTS - Sistema de Listas de Contatos para Envio em Massa
-- Migração para criar tabela persistente no Supabase
-- =============================================================================

-- Criar tabela contact_lists
CREATE TABLE IF NOT EXISTS contact_lists (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  -- Array de contatos em JSONB para flexibilidade
  contacts JSONB DEFAULT '[]'::jsonb,
  -- Contagem de contatos (denormalizado para performance)
  contact_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para otimização
CREATE INDEX IF NOT EXISTS idx_contact_lists_user ON contact_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_lists_created ON contact_lists(created_at);

-- Comentários
COMMENT ON TABLE contact_lists IS 'Listas de contatos para envio em massa';
COMMENT ON COLUMN contact_lists.contacts IS 'Array de objetos {id, name, phone}';
COMMENT ON COLUMN contact_lists.contact_count IS 'Contagem denormalizada para performance';

-- =============================================================================
-- EXECUTAR NO SUPABASE SQL EDITOR
-- =============================================================================
