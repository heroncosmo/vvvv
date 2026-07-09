-- Migration: Criar tabela de mensagens agendadas
-- Data: 2026-02-18
-- Descrição: Cria tabela para gerenciamento de mensagens agendadas

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text', -- text, audio, ai
  ai_prompt TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
  status VARCHAR(50) DEFAULT 'pending', -- pending, sent, cancelled
  created_by UUID REFERENCES admins(id),
  created_by_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_scheduled_messages_conversation_id (conversation_id),
  INDEX idx_scheduled_messages_status (status),
  INDEX idx_scheduled_messages_scheduled_at (scheduled_at)
);

-- Comentários
COMMENT ON TABLE scheduled_messages IS 'Tabela de mensagens agendadas para envio automático em conversas';
COMMENT ON COLUMN scheduled_messages.message_type IS 'Tipo de mensagem (text, audio, ai)';
COMMENT ON COLUMN scheduled_messages.status IS 'Status da mensagem (pending, sent, cancelled)';
