-- Migration: Add fetchHistoryOnFirstResponse field to ai_agent_config
-- Esta opção permite que a IA busque o histórico de conversas anteriores do WhatsApp
-- quando for responder pela primeira vez a um contato, para entender o contexto do cliente

ALTER TABLE ai_agent_config 
ADD COLUMN IF NOT EXISTS fetch_history_on_first_response BOOLEAN DEFAULT false NOT NULL;

-- Comentário explicativo
COMMENT ON COLUMN ai_agent_config.fetch_history_on_first_response IS 'Se ativado, busca histórico de conversas anteriores do cliente ao responder pela primeira vez';
