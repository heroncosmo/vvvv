BEGIN;

CREATE TABLE IF NOT EXISTS public.tmp_backup_rodrigo4_plan_49_prompt_20260709_v331 (
  backup_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  row_data jsonb NOT NULL
);

ALTER TABLE public.tmp_backup_rodrigo4_plan_49_prompt_20260709_v331 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_client_access ON public.tmp_backup_rodrigo4_plan_49_prompt_20260709_v331;
CREATE POLICY deny_all_client_access
  ON public.tmp_backup_rodrigo4_plan_49_prompt_20260709_v331
  FOR ALL
  USING (false)
  WITH CHECK (false);

WITH target AS (
  SELECT
    u.id AS target_user_id,
    ac.id AS config_id,
    ac.*
  FROM public.users u
  JOIN public.ai_agent_config ac ON ac.user_id = u.id
  WHERE lower(u.email) = lower('rodrigo4@gmail.com')
    AND ac.is_active = true
  ORDER BY ac.updated_at DESC NULLS LAST, ac.created_at DESC NULLS LAST
  LIMIT 1
),
current_prompt_version AS (
  SELECT pv.*
  FROM public.prompt_versions pv
  JOIN target t ON t.target_user_id = pv.user_id
  WHERE pv.config_type = 'ai_agent'
    AND pv.is_current = true
  ORDER BY pv.version_number DESC, pv.created_at DESC
  LIMIT 1
),
backup_rows AS (
  SELECT
    'rodrigo_plan_100k_prompt_v331'::text AS reason,
    'ai_agent_config'::text AS source_table,
    t.config_id::text AS source_id,
    to_jsonb(t) AS row_data
  FROM target t
  UNION ALL
  SELECT
    'rodrigo_plan_100k_prompt_v331'::text AS reason,
    'prompt_versions'::text AS source_table,
    cpv.id::text AS source_id,
    to_jsonb(cpv) AS row_data
  FROM current_prompt_version cpv
)
INSERT INTO public.tmp_backup_rodrigo4_plan_49_prompt_20260709_v331 (
  reason,
  source_table,
  source_id,
  row_data
)
SELECT reason, source_table, source_id, row_data
FROM backup_rows b
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tmp_backup_rodrigo4_plan_49_prompt_20260709_v331 existing
  WHERE existing.source_table = b.source_table
    AND existing.source_id = b.source_id
    AND existing.reason = b.reason
);

WITH constants AS (
  SELECT
    '21617303e024b507b33c73bb4536005d'::text AS expected_prompt_md5,
    '<CALIBRACAO_2026_07_09_RODRIGO_PLANOS_100K_V331>'::text AS marker,
    $calibration$
<CALIBRACAO_2026_07_09_RODRIGO_PLANOS_100K_V331>
Contexto vigente de planos e conducao comercial do Rodrigo:
- Este bloco e contexto do tenant Rodrigo para o Codex decidir com historico completo; nao e detector por palavra-chave, regra global do produto, regex ou fluxo local.
- No inicio do funil, mesmo se o lead citar "49", "plano 49", "quero AgenteZap por 49" ou parecido, nao abrir negociacao de preco nem abandonar a criacao/configuracao/teste do agente. Continue conduzindo como o funil atual: entender o negocio, criar/configurar o agente de teste por aqui, pedir os dados que faltarem e mostrar o valor pelo teste.
- Na hora de assinatura, apresente primeiro o Plus de R$99,99.
- Plus R$99,99: mensagens/tokens de IA ilimitados para atendimento, mais rapido e com mais inteligencia, e permite edicoes/ajustes recorrentes pela equipe sempre que o cliente precisar.
- Se, depois de ouvir o R$99,99, o cliente reclamar do valor, pedir algo mais barato ou insistir no plano de R$49,99, explique que existe a opcao Plano 100k IA por R$49,99: 100.000 tokens de mensagens IA por mes, configuracao inicial feita no comeco, depois sem edicoes recorrentes feitas pela equipe. Tente manter o cliente no Plus quando fizer sentido, porque o Plus e ilimitado, mais inteligente/rapido e tem ajustes recorrentes.
- Quando o Plano 100k IA for realmente oferecido por objecao de valor, o link de planos liberado para essa oferta e https://www.agentezap.online/plans?plano49=1.
- Se o cliente perguntar qual plano esta ativo, assinado ou pendente, use o contexto/evidencia de assinatura/plano/metadata que vier no pacote do Codex. Se essa evidencia nao existir ou estiver incerta, peca o e-mail/conta ou diga que vai conferir; nao invente plano, pagamento ou status.
- Links publicos da plataforma devem usar dominio completo com www por clareza para cliente leigo: https://www.agentezap.online/. Nao mande o lead criar o agente sozinho no site quando o atendimento por conversa puder criar, configurar e testar por aqui.
- Nunca confirme criacao, liberacao, plano, pagamento, edicao ou envio de link como concluido sem evidencia do side effect/executor.
</CALIBRACAO_2026_07_09_RODRIGO_PLANOS_100K_V331>
$calibration$::text AS calibration_block
),
target AS (
  SELECT
    u.id AS target_user_id,
    ac.id AS config_id,
    ac.prompt,
    ac.model
  FROM public.users u
  JOIN public.ai_agent_config ac ON ac.user_id = u.id
  WHERE lower(u.email) = lower('rodrigo4@gmail.com')
    AND ac.is_active = true
  ORDER BY ac.updated_at DESC NULLS LAST, ac.created_at DESC NULLS LAST
  LIMIT 1
),
prepared AS (
  SELECT
    t.target_user_id AS user_id,
    t.config_id,
    coalesce(t.model, 'gpt-5.5') AS model,
    c.expected_prompt_md5,
    c.marker,
    CASE
      WHEN strpos(coalesce(t.prompt, ''), c.marker) > 0 THEN coalesce(t.prompt, '')
      ELSE c.calibration_block || E'\n\n' || coalesce(t.prompt, '')
    END AS next_prompt
  FROM target t
  CROSS JOIN constants c
  WHERE md5(coalesce(t.prompt, '')) = c.expected_prompt_md5
     OR strpos(coalesce(t.prompt, ''), c.marker) > 0
),
updated_config AS (
  UPDATE public.ai_agent_config ac
  SET prompt = p.next_prompt,
      model = p.model,
      updated_at = now()
  FROM prepared p
  WHERE ac.id = p.config_id
    AND (
      md5(coalesce(ac.prompt, '')) = p.expected_prompt_md5
      OR strpos(coalesce(ac.prompt, ''), p.marker) > 0
    )
  RETURNING ac.user_id, ac.prompt, ac.model
),
version_input AS (
  SELECT
    uc.user_id,
    uc.prompt,
    uc.model,
    coalesce((
      SELECT max(pv.version_number)
      FROM public.prompt_versions pv
      WHERE pv.user_id = uc.user_id
        AND pv.config_type = 'ai_agent'
    ), 0) + 1 AS next_version
  FROM updated_config uc
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.prompt_versions pv
    WHERE pv.user_id = uc.user_id
      AND pv.config_type = 'ai_agent'
      AND pv.metadata->>'calibrationMarker' = 'CALIBRACAO_2026_07_09_RODRIGO_PLANOS_100K_V331'
  )
),
clear_current AS (
  UPDATE public.prompt_versions pv
  SET is_current = false
  FROM version_input vi
  WHERE pv.user_id = vi.user_id
    AND pv.config_type = 'ai_agent'
    AND pv.is_current = true
  RETURNING pv.id
),
inserted_version AS (
  INSERT INTO public.prompt_versions (
    user_id,
    version_number,
    prompt_type,
    prompt_content,
    model,
    is_active,
    metadata,
    config_type,
    edit_summary,
    edit_type,
    edit_details,
    is_current,
    created_at
  )
  SELECT
    vi.user_id,
    vi.next_version,
    'ai_agent',
    vi.prompt,
    vi.model,
    true,
    jsonb_build_object(
      'source', 'codex_task_plano_49_100k_rodrigo_20260709',
      'calibrationMarker', 'CALIBRACAO_2026_07_09_RODRIGO_PLANOS_100K_V331',
      'contextOnly', true,
      'antiOverfit', 'tenant_prompt_context_no_global_detector'
    ),
    'ai_agent',
    'Calibracao Rodrigo v331: contexto de planos Plus 99,99 e Plano 100k IA 49,99 sem regra global',
    'tenant_prompt_calibration',
    jsonb_build_array(
      jsonb_build_object('type', 'context_only', 'detail', 'Plano 100k IA por 49,99 so como oferta limitada apos objecao ao Plus'),
      jsonb_build_object('type', 'context_only', 'detail', 'Plus 99,99 ilimitado, mais rapido/inteligente e com edicoes recorrentes')
    ),
    true,
    now()
  FROM version_input vi
  RETURNING id, version_number
)
SELECT
  (SELECT count(*) FROM prepared) AS prepared_count,
  (SELECT count(*) FROM updated_config) AS updated_config_count,
  (SELECT count(*) FROM inserted_version) AS inserted_version_count,
  (SELECT version_number FROM inserted_version LIMIT 1) AS inserted_version_number;

COMMIT;
