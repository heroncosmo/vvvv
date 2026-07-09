begin;

update public.plans
set
  caracteristicas = case id
    when 'f6c55498-7b22-4ac2-9703-bf2bdd0cc431' then jsonb_build_array(
      'Todas as ferramentas principais da plataforma',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'IA ilimitada atendendo 24/7',
      '1 conexão WhatsApp',
      'CRM, fluxos e automações inclusos'
    )
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then jsonb_build_array(
      'Tudo do plano de R$ 49,99',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'Conexões WhatsApp ilimitadas',
      'Atualizações automáticas completas do sistema',
      'Respostas da IA com prioridade maior'
    )
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then jsonb_build_array(
      'Tudo do plano de R$ 99,99',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'Conexões WhatsApp ilimitadas',
      'Configuração completa da IA feita por especialista',
      'Entrega operacional em até 3 dias úteis após confirmação'
    )
    when 'd0cb4b21-f795-4b2f-bb8c-fb5be5118f6e' then jsonb_build_array(
      'Tudo do plano de R$ 199,99',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'Conexões WhatsApp ilimitadas',
      'IA dedicada para alto volume de respostas',
      'Respostas em alto volume no mesmo instante'
    )
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then jsonb_build_array(
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'Configuração feita por especialista em até 8 horas úteis',
      'Entrega configurada no mesmo dia útil',
      'Atendimento do gerente das 11h às 21h, de segunda a sexta',
      'Ajustes no agente IA sempre que precisar durante 30 dias',
      'Prioridade alta no acompanhamento de implantação',
      'Conexões WhatsApp ilimitadas',
      'Tudo do plano de R$ 299,99'
    )
    else caracteristicas
  end,
  updated_at = now()
where id in (
  'f6c55498-7b22-4ac2-9703-bf2bdd0cc431',
  'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65',
  '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f',
  'd0cb4b21-f795-4b2f-bb8c-fb5be5118f6e',
  '83c7ee7f-97b0-45bd-9b97-4f53af78f814'
);

commit;
