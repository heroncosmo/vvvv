ALTER TABLE plans
ADD COLUMN IF NOT EXISTS exibir_na_pagina_planos BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE plans
SET exibir_na_pagina_planos = TRUE
WHERE nome IN (
  'Plano Mensal',
  'Plano Anual + Setup',
  'Implementação Completa',
  'Implementação Personalizada',
  'Plano Promo Ilimitado Anual'
);
