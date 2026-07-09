-- =====================================================
-- MIGRAÇÃO: Sistema Híbrido IA + Fluxo
-- Data: 2024
-- Descrição: Adiciona configurações para sistema híbrido
-- =====================================================

-- Adicionar coluna advanced_settings se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chatbot_configs' 
    AND column_name = 'advanced_settings'
  ) THEN
    ALTER TABLE chatbot_configs 
    ADD COLUMN advanced_settings JSONB DEFAULT '{
      "enable_hybrid_ai": true,
      "ai_confidence_threshold": 0.7,
      "fallback_to_flow": true,
      "interpret_dates": true,
      "interpret_times": true,
      "intent_keywords": {}
    }'::jsonb;
    
    RAISE NOTICE 'Coluna advanced_settings adicionada à tabela chatbot_configs';
  ELSE
    RAISE NOTICE 'Coluna advanced_settings já existe';
  END IF;
END $$;

-- Atualizar registros existentes com valores default
UPDATE chatbot_configs 
SET advanced_settings = '{
  "enable_hybrid_ai": true,
  "ai_confidence_threshold": 0.7,
  "fallback_to_flow": true,
  "interpret_dates": true,
  "interpret_times": true,
  "intent_keywords": {}
}'::jsonb
WHERE advanced_settings IS NULL;

-- Criar índice para busca eficiente
CREATE INDEX IF NOT EXISTS idx_chatbot_configs_hybrid_ai 
ON chatbot_configs ((advanced_settings->>'enable_hybrid_ai'));

-- Adicionar comentários
COMMENT ON COLUMN chatbot_configs.advanced_settings IS 
'Configurações avançadas do chatbot incluindo sistema híbrido IA+Fluxo:
- enable_hybrid_ai: Ativa interpretação inteligente de intenções
- ai_confidence_threshold: Mínimo de confiança (0-1) para IA agir
- fallback_to_flow: Se IA não entender, seguir fluxo normal
- interpret_dates: Interpretar datas naturais (hoje, amanhã, etc)
- interpret_times: Interpretar horários naturais
- intent_keywords: Keywords customizadas por intenção';

-- =====================================================
-- FIM DA MIGRAÇÃO
-- =====================================================
