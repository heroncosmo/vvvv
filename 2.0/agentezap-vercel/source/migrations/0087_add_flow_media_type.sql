-- Migration: 0087_add_flow_media_type
-- Descrição: Adiciona suporte ao tipo 'flow' em mídias do agente
-- Um fluxo é uma sequência ordenada de múltiplos itens (mídia + texto) enviados em ordem exata

-- 1. Adicionar coluna flow_items para armazenar a sequência de itens do fluxo
ALTER TABLE agent_media_library 
ADD COLUMN IF NOT EXISTS flow_items JSONB;

-- 2. Alterar storage_url para aceitar valor vazio (fluxos não precisam de URL própria)
ALTER TABLE agent_media_library 
ALTER COLUMN storage_url SET DEFAULT '';

-- 3. Atualizar constraint de media_type para incluir 'flow'
-- Como usamos CHECK constraint implícita via aplicação, apenas documentamos aqui
COMMENT ON COLUMN agent_media_library.media_type IS 
  'Tipo da mídia: audio, image, video, document, flow. Para flow, usar flow_items para definir a sequência.';

COMMENT ON COLUMN agent_media_library.flow_items IS 
  'Sequência ordenada de itens do fluxo. Cada item: {id, order, type(media|text), storageUrl?, mediaType?, caption?, fileName?, mimeType?, text?}';

-- 4. Índice para consultas de fluxos
CREATE INDEX IF NOT EXISTS idx_agent_media_flow_type ON agent_media_library(user_id, media_type) 
WHERE media_type = 'flow';
