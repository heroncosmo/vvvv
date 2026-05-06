-- Migration: Add pauseOnManualReply field to ai_agent_config
-- Permite controlar se a IA deve pausar automaticamente quando o dono responde manualmente

ALTER TABLE ai_agent_config 
ADD COLUMN IF NOT EXISTS pause_on_manual_reply BOOLEAN DEFAULT TRUE NOT NULL;

COMMENT ON COLUMN ai_agent_config.pause_on_manual_reply IS 'Se ativado (padrão), pausa a IA automaticamente quando o dono responde manualmente. Se desativado, a IA continua respondendo mesmo após resposta manual.';
