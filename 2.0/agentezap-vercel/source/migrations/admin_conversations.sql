-- Migration: Adicionar tabelas de conversas do admin
-- Data: 2025-01-12
-- Descrição: Permite que o admin visualize e gerencie todas as conversas do WhatsApp dele

-- Tabela de conversas do admin
CREATE TABLE IF NOT EXISTS admin_conversations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  admin_id VARCHAR NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  contact_number VARCHAR NOT NULL,
  remote_jid TEXT,
  contact_name VARCHAR,
  contact_avatar TEXT,
  last_message_text TEXT,
  last_message_time TIMESTAMP,
  unread_count INTEGER NOT NULL DEFAULT 0,
  is_agent_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_admin_conversations_admin ON admin_conversations(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_conversations_contact ON admin_conversations(contact_number);
CREATE INDEX IF NOT EXISTS idx_admin_conversations_updated ON admin_conversations(updated_at DESC);

-- Tabela de mensagens do admin
CREATE TABLE IF NOT EXISTS admin_messages (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id VARCHAR NOT NULL REFERENCES admin_conversations(id) ON DELETE CASCADE,
  message_id VARCHAR NOT NULL,
  from_me BOOLEAN NOT NULL,
  text TEXT,
  timestamp TIMESTAMP NOT NULL,
  status VARCHAR(50),
  is_from_agent BOOLEAN NOT NULL DEFAULT false,
  media_type VARCHAR(50),
  media_url TEXT,
  media_mime_type VARCHAR(100),
  media_caption TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_admin_messages_conversation ON admin_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_timestamp ON admin_messages(timestamp);

-- Enable RLS
ALTER TABLE admin_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_messages ENABLE ROW LEVEL SECURITY;

-- Policies (admins podem ver todas as conversas)
CREATE POLICY admin_conversations_policy ON admin_conversations
  FOR ALL USING (true);

CREATE POLICY admin_messages_policy ON admin_messages
  FOR ALL USING (true);
