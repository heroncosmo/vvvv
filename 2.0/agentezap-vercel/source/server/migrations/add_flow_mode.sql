-- Migration: Adicionar campos de Fluxo no ai_agent_config
-- Parte 5 - Modo Fluxo para Meu Agente IA

-- Adicionar campo flow_script (texto livre do roteiro)
ALTER TABLE ai_agent_config 
ADD COLUMN IF NOT EXISTS flow_script TEXT;

-- Adicionar campo flow_mode_active (se o modo fluxo está ativo)
ALTER TABLE ai_agent_config 
ADD COLUMN IF NOT EXISTS flow_mode_active BOOLEAN NOT NULL DEFAULT FALSE;

-- Comentários de documentação
COMMENT ON COLUMN ai_agent_config.flow_script IS 'Roteiro/prompt de fluxo escrito em texto livre pelo cliente';
COMMENT ON COLUMN ai_agent_config.flow_mode_active IS 'Se TRUE, a IA segue estritamente o roteiro de fluxo (sem improviso)';
