-- Migration: Criar tabela para persistir mídias do admin
-- Created: 2025-12-13

-- Tabela para armazenar mídias do admin agent
CREATE TABLE IF NOT EXISTS admin_agent_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  media_type VARCHAR(50) NOT NULL CHECK (media_type IN ('audio', 'image', 'video', 'document')),
  storage_url TEXT NOT NULL,
  file_name VARCHAR(500),
  file_size INTEGER,
  mime_type VARCHAR(100),
  duration_seconds INTEGER,
  description TEXT NOT NULL,
  when_to_use TEXT,
  caption TEXT,
  transcription TEXT,
  is_active BOOLEAN DEFAULT true,
  send_alone BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_admin_agent_media_admin_id ON admin_agent_media(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_agent_media_name ON admin_agent_media(name);
CREATE INDEX IF NOT EXISTS idx_admin_agent_media_active ON admin_agent_media(is_active);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_admin_agent_media_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_admin_agent_media_timestamp
  BEFORE UPDATE ON admin_agent_media
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_agent_media_updated_at();

-- Comentários
COMMENT ON TABLE admin_agent_media IS 'Armazena mídias disponíveis para o admin agent usar nas respostas';
COMMENT ON COLUMN admin_agent_media.name IS 'Nome único identificador da mídia (ex: COMO_FUNCIONA)';
COMMENT ON COLUMN admin_agent_media.storage_url IS 'URL do Supabase Storage onde o arquivo está armazenado';
COMMENT ON COLUMN admin_agent_media.when_to_use IS 'Orientação para a IA sobre quando usar esta mídia';
COMMENT ON COLUMN admin_agent_media.send_alone IS 'Se true, envia a mídia sozinha. Se false, pode enviar com texto';
