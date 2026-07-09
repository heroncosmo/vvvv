begin;

update public.plans
set
  valor = case id
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then 99.99
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then 199.99
    else valor
  end,
  nome = case id
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then 'Gerente de Conta VIP'
    else nome
  end,
  descricao = case id
    when 'f6c55498-7b22-4ac2-9703-bf2bdd0cc431' then 'Todas as ferramentas da plataforma em uma estrutura enxuta para entrar com IA ilimitada e manter a operação ativa desde o primeiro dia.'
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then 'Todas as ferramentas com mais estrutura, conexões WhatsApp ilimitadas, atualizações automáticas completas e prioridade maior nas respostas da IA.'
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then 'Sua IA fica configurada por especialista em até 3 dias úteis, com setup guiado e entrega operacional para você começar com menos atrito.'
    when 'd0cb4b21-f795-4b2f-bb8c-fb5be5118f6e' then 'Operação premium com IA dedicada para alto volume de respostas no mesmo instante, implantação assistida e foco em escala contínua.'
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then 'IA configurada por especialista em até 8 horas úteis, com entrega no mesmo dia útil e gerente de conta VIP por 30 dias.'
    else descricao
  end,
  badge = case id
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then 'Até 3 dias úteis'
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then 'Gerente VIP'
    else badge
  end,
  cta_texto = case id
    when 'f6c55498-7b22-4ac2-9703-bf2bdd0cc431' then 'Começar agora'
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then 'Subir para o Pro'
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then 'Quero IA configurada'
    when 'd0cb4b21-f795-4b2f-bb8c-fb5be5118f6e' then 'Quero IA dedicada'
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then 'Quero gerente VIP por 30 dias'
    else cta_texto
  end,
  caracteristicas = case id
    when 'f6c55498-7b22-4ac2-9703-bf2bdd0cc431' then jsonb_build_array(
      'Todas as ferramentas principais da plataforma',
      'IA ilimitada atendendo 24/7',
      '1 conexão WhatsApp',
      'CRM, fluxos e automações inclusos',
      'Pré-pago por 30 dias',
      'Estrutura enxuta para começar sem travar crescimento'
    )
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then jsonb_build_array(
      'Tudo do plano de R$ 49,99',
      'Conexões WhatsApp ilimitadas',
      'Números adicionais ilimitados',
      'Atualizações automáticas completas do sistema',
      'Respostas da IA com prioridade maior',
      'Mais estrutura para operações simultâneas'
    )
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then jsonb_build_array(
      'Tudo do plano de R$ 99,99',
      'Conexões WhatsApp ilimitadas',
      'Configuração completa da IA feita por especialista',
      'Entrega operacional em até 3 dias úteis após confirmação',
      'Ajustes iniciais guiados para o seu cenário',
      'Menos trabalho manual no começo'
    )
    when 'd0cb4b21-f795-4b2f-bb8c-fb5be5118f6e' then jsonb_build_array(
      'Tudo do plano de R$ 199,99',
      'Conexões WhatsApp ilimitadas',
      'IA dedicada para alto volume de respostas',
      'Respostas em alto volume no mesmo instante',
      'Estrutura pensada para operações intensas',
      'Implantação assistida com foco em escala contínua',
      'Operação pronta para crescer com menos fila'
    )
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then jsonb_build_array(
      'Tudo do plano de R$ 299,99',
      'Conexões WhatsApp ilimitadas',
      'Configuração feita por especialista em até 8 horas úteis',
      'Entrega configurada no mesmo dia útil',
      'Gerente de conta VIP por 30 dias',
      'Ajustes no agente IA sempre que precisar durante o período',
      'Prioridade alta no acompanhamento de implantação'
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
