-- ═══════════════════════════════════════════════════════════════════════
-- 🤖 FLOW DEFINITIONS - Sistema de Fluxos Chatbot Determinísticos
-- ═══════════════════════════════════════════════════════════════════════
--
-- Esta tabela armazena os fluxos determinísticos (chatbot por trás) que:
-- 1. Definem o comportamento exato do agente (estados, transições, respostas)
-- 2. São criados automaticamente a partir dos prompts dos agentes
-- 3. São sincronizados quando o agente é editado
-- 4. Garantem consistência nas respostas (sem variação da IA)
--
-- CONCEITO:
-- - IA interpreta a intenção do usuário
-- - Sistema de fluxo toma a decisão baseado em regras
-- - IA humaniza a resposta final
--
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS flow_definitions (
  -- Identificação
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Tipo de fluxo (define qual módulo está ativo)
  flow_type VARCHAR(50) NOT NULL CHECK (flow_type IN (
    'DELIVERY',      -- Quando delivery está ativo
    'VENDAS',        -- Quando catálogo/produtos está ativo
    'AGENDAMENTO',   -- Quando agendamento está ativo
    'SUPORTE',       -- Quando suporte está ativo
    'CURSO',         -- Quando módulo de curso está ativo
    'GENERICO'       -- Quando nenhum módulo está ativo (fallback)
  )),

  -- Metadados do agente
  agent_name VARCHAR(255) NOT NULL DEFAULT 'Assistente',
  business_name VARCHAR(255) NOT NULL,
  agent_personality TEXT,  -- Ex: "formal, profissional", "informal, descontraído"

  -- Definição do fluxo (JSON)
  -- Estrutura: { states: {...}, transitions: {...}, defaultState: string }
  flow_definition JSONB NOT NULL,

  -- Dados do negócio (preços, cupons, links, etc)
  business_data JSONB DEFAULT '{}'::jsonb,

  -- Regras globais que se aplicam a todo o fluxo
  global_rules JSONB DEFAULT '[]'::jsonb,

  -- Fonte do fluxo (para rastreabilidade)
  source_prompt TEXT,  -- Prompt original que gerou este fluxo
  generated_by VARCHAR(50) DEFAULT 'auto',  -- 'auto', 'manual', 'migration'

  -- Versionamento
  version VARCHAR(20) DEFAULT '1.0.0',
  previous_version_id VARCHAR,  -- Referência para versão anterior (histórico)

  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Índices para performance
  UNIQUE(user_id, flow_type)  -- Cada usuário tem apenas 1 fluxo de cada tipo
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_flow_definitions_user ON flow_definitions(user_id);
CREATE INDEX IF NOT EXISTS idx_flow_definitions_type ON flow_definitions(flow_type);
CREATE INDEX IF NOT EXISTS idx_flow_definitions_active ON flow_definitions(is_active);

-- ═══════════════════════════════════════════════════════════════════════
-- 🔄 FLOW EXECUTIONS - Histórico de Execuções de Fluxo
-- ═══════════════════════════════════════════════════════════════════════
--
-- Armazena o estado atual de cada conversa dentro de um fluxo
-- Permite retomar conversas, fazer analytics e debugging
--
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS flow_executions (
  -- Identificação
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_definition_id VARCHAR NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Identificação da conversa
  conversation_id VARCHAR NOT NULL,  -- WhatsApp contact ID
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),

  -- Estado atual da execução
  current_state VARCHAR(100) NOT NULL,  -- Estado atual no fluxo
  flow_data JSONB DEFAULT '{}'::jsonb,  -- Dados coletados durante o fluxo

  -- Histórico de navegação
  state_history JSONB DEFAULT '[]'::jsonb,  -- Array de estados visitados
  last_user_message TEXT,  -- Última mensagem do usuário
  last_ai_response TEXT,   -- Última resposta da IA

  -- Metadata
  started_at TIMESTAMP DEFAULT NOW(),
  last_interaction_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  -- Status
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'error')),

  -- Índices para performance
  UNIQUE(user_id, conversation_id)  -- Uma execução por conversa
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_flow_executions_user ON flow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_conversation ON flow_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_status ON flow_executions(status);
CREATE INDEX IF NOT EXISTS idx_flow_executions_last_interaction ON flow_executions(last_interaction_at);

-- ═══════════════════════════════════════════════════════════════════════
-- 🎯 MODULE_STATUS - Status dos Módulos Ativos
-- ═══════════════════════════════════════════════════════════════════════
--
-- View materializada para facilitar consulta do módulo ativo
-- Determina qual flow_type deve ser usado para cada usuário
--
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW user_active_modules AS
SELECT
  u.id as user_id,
  CASE
    -- Prioridade 1: Delivery
    WHEN EXISTS (
      SELECT 1 FROM delivery_config dc
      WHERE dc.user_id = u.id
      AND dc.is_active = true
      AND (dc.send_to_ai IS NULL OR dc.send_to_ai = true)
    ) THEN 'DELIVERY'

    -- Prioridade 2: Catálogo/Produtos
    WHEN EXISTS (
      SELECT 1 FROM products_config pc
      WHERE pc.user_id = u.id
      AND pc.is_active = true
      AND (pc.send_to_ai IS NULL OR pc.send_to_ai = true)
    ) THEN 'VENDAS'

    -- Prioridade 3: Agendamento
    WHEN EXISTS (
      SELECT 1 FROM scheduling_config sc
      WHERE sc.user_id = u.id
      AND sc.is_enabled = true
    ) THEN 'AGENDAMENTO'

    -- Prioridade 4: Curso
    WHEN EXISTS (
      SELECT 1 FROM course_config cc
      WHERE cc.user_id = u.id
      AND cc.is_active = true
      AND (cc.send_to_ai IS NULL OR cc.send_to_ai = true)
    ) THEN 'CURSO'

    -- Fallback: Genérico (nenhum módulo ativo)
    ELSE 'GENERICO'
  END as active_module,
  NOW() as computed_at
FROM users u;

-- ═══════════════════════════════════════════════════════════════════════
-- 📊 COMENTÁRIOS E DOCUMENTAÇÃO
-- ═══════════════════════════════════════════════════════════════════════

COMMENT ON TABLE flow_definitions IS 'Armazena os fluxos determinísticos (chatbot por trás) para cada usuário';
COMMENT ON COLUMN flow_definitions.flow_type IS 'Tipo de fluxo baseado no módulo ativo (DELIVERY, VENDAS, AGENDAMENTO, GENERICO)';
COMMENT ON COLUMN flow_definitions.flow_definition IS 'Estrutura JSON do fluxo: {states, transitions, defaultState}';
COMMENT ON COLUMN flow_definitions.business_data IS 'Dados do negócio: preços, cupons, links, horários, etc';
COMMENT ON COLUMN flow_definitions.global_rules IS 'Regras globais que se aplicam a todo o fluxo';

COMMENT ON TABLE flow_executions IS 'Rastreia execuções ativas de fluxos para cada conversa';
COMMENT ON COLUMN flow_executions.current_state IS 'Estado atual do usuário no fluxo';
COMMENT ON COLUMN flow_executions.flow_data IS 'Dados coletados durante a execução (carrinho, preferências, etc)';
COMMENT ON COLUMN flow_executions.state_history IS 'Histórico de estados visitados para analytics';

COMMENT ON VIEW user_active_modules IS 'View que determina qual módulo está ativo para cada usuário (usado para selecionar flow_type)';
