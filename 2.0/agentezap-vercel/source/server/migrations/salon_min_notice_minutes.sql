-- Migration: Adicionar campo min_notice_minutes em salon_config
-- Data: 2025-02-08
-- Descrição: Adiciona antecedência mínima em minutos (permite 0) mantendo compatibilidade com min_notice_hours

-- Adicionar coluna min_notice_minutes
ALTER TABLE salon_config
ADD COLUMN IF NOT EXISTS min_notice_minutes integer;

-- Popular registros existentes (converter horas para minutos)
UPDATE salon_config
SET min_notice_minutes = COALESCE(min_notice_hours, 2) * 60
WHERE min_notice_minutes IS NULL;

-- Definir valor padrão como 0 (permite agendar imediatamente)
ALTER TABLE salon_config
ALTER COLUMN min_notice_minutes SET DEFAULT 0;

-- Opcional: Adicionar constraint para garantir valores não-negativos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'salon_min_notice_minutes_nonnegative'
      AND conrelid = 'public.salon_config'::regclass
  ) THEN
    ALTER TABLE salon_config
    ADD CONSTRAINT salon_min_notice_minutes_nonnegative
    CHECK (min_notice_minutes >= 0);
  END IF;
END $$;

-- Comentário sobre a coluna
COMMENT ON COLUMN salon_config.min_notice_minutes IS 'Antecedência mínima em minutos para agendamentos (0 permite agendar imediatamente)';

-- NOTA: A coluna min_notice_hours é mantida para compatibilidade legada
-- O código backend deve priorizar min_notice_minutes se existir
