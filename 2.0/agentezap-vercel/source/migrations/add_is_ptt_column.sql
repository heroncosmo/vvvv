-- Adicionar campo isPtt para áudios (push-to-talk / gravado)
-- Quando true, o áudio aparece como mensagem de voz gravada
-- Quando false, aparece como arquivo de áudio normal

ALTER TABLE agent_media_library 
ADD COLUMN IF NOT EXISTS is_ptt BOOLEAN DEFAULT true;

-- Atualizar áudios existentes para usar PTT por padrão
UPDATE agent_media_library 
SET is_ptt = true 
WHERE media_type = 'audio' AND is_ptt IS NULL;

COMMENT ON COLUMN agent_media_library.is_ptt IS 'Push-to-talk: se true, áudio aparece como mensagem de voz gravada; se false, como arquivo de áudio';
