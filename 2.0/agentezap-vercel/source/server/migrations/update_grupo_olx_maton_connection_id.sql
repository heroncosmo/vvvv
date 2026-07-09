ALTER TABLE grupo_olx_integrations
  ADD COLUMN IF NOT EXISTS maton_connection_id varchar(255);
