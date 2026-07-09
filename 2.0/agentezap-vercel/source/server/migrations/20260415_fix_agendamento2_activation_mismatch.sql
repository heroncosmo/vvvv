UPDATE agendamento2_config
SET
  is_active = true,
  updated_at = NOW()
WHERE scheduling_tracker_enabled = true
  AND COALESCE(is_active, false) = false;
