BEGIN;

UPDATE public.plans
SET
  valor = 99.99,
  valor_primeira_cobranca = 99.99,
  descricao = CASE
    WHEN id = '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f'
      THEN 'Plano Plus ilimitado com IA mais rapida, mais inteligente e edicoes recorrentes do agente quando precisar.'
    ELSE descricao
  END,
  caracteristicas = CASE
    WHEN id = '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f'
      THEN '[
        "IA ilimitada no atendimento",
        "Conversas ilimitadas",
        "Clientes ilimitados",
        "Mensagens ilimitadas",
        "Respostas da IA ilimitadas",
        "Mensagens rapidas e prioritarias",
        "Edicoes e ajustes recorrentes do agente quando precisar",
        "Mais inteligencia e mais velocidade nas respostas",
        "Todas as ferramentas avancadas inclusas",
        "WhatsApp, simulador e Personalize no mesmo painel"
      ]'::jsonb
    ELSE caracteristicas
  END,
  updated_at = NOW()
WHERE id IN (
  'f6c55498-7b22-4ac2-9703-bf2bdd0cc431',
  '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f'
);

INSERT INTO public.plans (
  id,
  nome,
  descricao,
  valor,
  valor_original,
  periodicidade,
  tipo,
  desconto_percent,
  badge,
  cta_texto,
  destaque,
  ordem,
  limite_conversas,
  limite_agentes,
  caracteristicas,
  ativo,
  valor_primeira_cobranca,
  codigo_personalizado,
  is_personalizado,
  frequencia_dias,
  trial_dias,
  link_slug,
  exibir_na_pagina_planos,
  created_at,
  updated_at
)
VALUES (
  'b93843cd-5261-43ff-b522-7366b3e95509',
  'Plano 100k IA',
  'Plano mensal de entrada com 100.000 tokens de mensagens IA e configuracao inicial do agente.',
  49.99,
  49.99,
  'mensal',
  'padrao',
  0,
  '100k tokens',
  'Comecar com 100k tokens',
  false,
  4,
  100000,
  1,
  '[
    "100.000 tokens de mensagens IA por mes",
    "Configuracao inicial do agente no comeco",
    "Depois da entrega inicial, edicoes recorrentes da equipe nao entram neste plano",
    "1 conexao WhatsApp para comecar",
    "Painel, conversas e teste do agente inclusos",
    "Pode migrar para o Plus ilimitado quando precisar"
  ]'::jsonb,
  true,
  49.99,
  'AGENTEZAP100K49',
  false,
  30,
  0,
  'plano-100k-ia-49',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE
SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  valor = EXCLUDED.valor,
  valor_original = EXCLUDED.valor_original,
  periodicidade = EXCLUDED.periodicidade,
  tipo = EXCLUDED.tipo,
  desconto_percent = EXCLUDED.desconto_percent,
  badge = EXCLUDED.badge,
  cta_texto = EXCLUDED.cta_texto,
  destaque = EXCLUDED.destaque,
  ordem = EXCLUDED.ordem,
  limite_conversas = EXCLUDED.limite_conversas,
  limite_agentes = EXCLUDED.limite_agentes,
  caracteristicas = EXCLUDED.caracteristicas,
  ativo = EXCLUDED.ativo,
  valor_primeira_cobranca = EXCLUDED.valor_primeira_cobranca,
  codigo_personalizado = EXCLUDED.codigo_personalizado,
  is_personalizado = EXCLUDED.is_personalizado,
  frequencia_dias = EXCLUDED.frequencia_dias,
  trial_dias = EXCLUDED.trial_dias,
  link_slug = EXCLUDED.link_slug,
  exibir_na_pagina_planos = EXCLUDED.exibir_na_pagina_planos,
  updated_at = NOW();

COMMIT;
