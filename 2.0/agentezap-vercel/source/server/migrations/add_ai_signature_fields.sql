ALTER TABLE ai_agent_config
ADD COLUMN IF NOT EXISTS ai_signature_enabled boolean DEFAULT false NOT NULL;

ALTER TABLE ai_agent_config
ADD COLUMN IF NOT EXISTS ai_signature varchar(100);

COMMENT ON COLUMN ai_agent_config.ai_signature_enabled IS 'Quando TRUE, respostas de texto da IA recebem assinatura no formato WhatsApp';
COMMENT ON COLUMN ai_agent_config.ai_signature IS 'Nome opcional exibido antes das mensagens da IA';
