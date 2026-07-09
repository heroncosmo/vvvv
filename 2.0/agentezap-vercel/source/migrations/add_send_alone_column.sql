-- Migration: Adicionar coluna send_alone para controlar envio combinado de mídias
-- Data: 2025-12-09

-- Adiciona coluna send_alone
-- false = pode ser combinada com outras mídias (padrão)
-- true = deve ser enviada sozinha, não combinar com outras

ALTER TABLE agent_media_library 
ADD COLUMN IF NOT EXISTS send_alone BOOLEAN DEFAULT false;

-- Comentário explicativo
COMMENT ON COLUMN agent_media_library.send_alone IS 'Se true, esta mídia deve ser enviada sozinha, não combinada com outras. Se false (padrão), pode ser enviada junto com outras mídias relevantes.';
