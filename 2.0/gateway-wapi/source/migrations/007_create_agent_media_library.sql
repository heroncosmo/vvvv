-- Migration: 007_create_agent_media_library
-- Descrição: Cria tabela para biblioteca de mídias dos agentes
-- O Mistral usa name+description para decidir quando enviar cada mídia

CREATE TABLE IF NOT EXISTS agent_media_library (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Identificação da mídia (usado no prompt para o Mistral)
    name VARCHAR(100) NOT NULL, -- Ex: "AUDIO_PRECO", "IMG_BOAS_VINDAS"
    
    -- Tipo da mídia
    media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('audio', 'image', 'video', 'document')),
    
    -- Armazenamento
    storage_url TEXT NOT NULL, -- URL pública ou base64
    file_name VARCHAR(255), -- Nome original do arquivo
    file_size INTEGER, -- Tamanho em bytes
    mime_type VARCHAR(100), -- Ex: audio/ogg, image/jpeg, video/mp4
    duration_seconds INTEGER, -- Duração para áudio/vídeo
    
    -- Contexto para o Mistral (CRÍTICO)
    description TEXT NOT NULL, -- "Explica o preço do produto X de forma rápida"
    when_to_use TEXT, -- "Quando o cliente perguntar sobre valores ou preço"
    transcription TEXT, -- Transcrição automática de áudios
    
    -- Ordenação e status
    is_active BOOLEAN DEFAULT true NOT NULL,
    display_order INTEGER DEFAULT 0,
    
    -- W-API integration (se usar upload prévio)
    wapi_media_id VARCHAR(255), -- ID da mídia no w-api após upload
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_agent_media_user_id ON agent_media_library(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_media_name ON agent_media_library(user_id, name);
CREATE INDEX IF NOT EXISTS idx_agent_media_active ON agent_media_library(user_id, is_active) WHERE is_active = true;

-- Unique constraint: nome da mídia deve ser único por usuário
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_media_unique_name ON agent_media_library(user_id, name);

-- Comentários
COMMENT ON TABLE agent_media_library IS 'Biblioteca de mídias dos agentes. O Mistral usa name+description para decidir quando enviar cada mídia.';
COMMENT ON COLUMN agent_media_library.name IS 'ID interno da mídia usado no prompt (ex: AUDIO_PRECO). Deve ser único por usuário.';
COMMENT ON COLUMN agent_media_library.description IS 'Descrição da mídia que vai para o Mistral entender o conteúdo.';
COMMENT ON COLUMN agent_media_library.when_to_use IS 'Instrução de quando usar esta mídia (ex: "quando perguntar sobre preço").';
COMMENT ON COLUMN agent_media_library.transcription IS 'Transcrição automática de áudios para contexto do Mistral.';
