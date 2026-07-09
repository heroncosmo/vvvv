ALTER TABLE agent_media_library
ADD COLUMN IF NOT EXISTS suppress_text_response BOOLEAN DEFAULT false;

COMMENT ON COLUMN agent_media_library.suppress_text_response IS 'Quando true, ao acionar esta mídia a IA não deve enviar texto principal fora da própria mídia/fluxo.';
