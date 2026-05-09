ALTER TABLE grupo_olx_integrations
  ADD COLUMN IF NOT EXISTS create_deal_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE grupo_olx_integrations
  ADD COLUMN IF NOT EXISTS ai_variation varchar(50) NOT NULL DEFAULT 'consultivo';

UPDATE grupo_olx_integrations
SET create_deal_enabled = true
WHERE (funnel_id IS NOT NULL OR stage_id IS NOT NULL)
  AND create_deal_enabled = false;
