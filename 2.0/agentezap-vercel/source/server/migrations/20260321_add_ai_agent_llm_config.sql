ALTER TABLE ai_agent_config
ADD COLUMN IF NOT EXISTS llm_config JSONB NOT NULL DEFAULT '{"mode":"global"}'::jsonb;

UPDATE ai_agent_config
SET llm_config = '{"mode":"global"}'::jsonb
WHERE llm_config IS NULL;
