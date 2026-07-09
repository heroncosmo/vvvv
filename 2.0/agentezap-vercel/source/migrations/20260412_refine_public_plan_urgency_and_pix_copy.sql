begin;

update public.plans
set
  nome = case id
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then 'Configurado hoje pelo especialista'
    else nome
  end,
  descricao = case id
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then 'Entre hoje com a IA configurada por especialista em até 8 horas úteis e mantenha um gerente VIP ajustando sua operação por 30 dias.'
    else descricao
  end,
  cta_texto = case id
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then 'Quero tudo Ilimitado'
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then 'Quero configurado agora pelo Gerente'
    else cta_texto
  end,
  caracteristicas = case id
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then jsonb_build_array(
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
  'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65',
  '83c7ee7f-97b0-45bd-9b97-4f53af78f814'
);

commit;
