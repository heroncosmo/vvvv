begin;

update public.plans
set
  descricao = case id
    when 'f6c55498-7b22-4ac2-9703-bf2bdd0cc431' then 'Todas as ferramentas da plataforma em uma estrutura enxuta para entrar com IA ilimitada e manter a operação ativa desde o primeiro dia.'
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then 'Todas as ferramentas com mais estrutura, números adicionais ilimitados, atualizações automáticas completas e prioridade maior nas respostas da IA.'
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then 'Sua IA fica configurada por especialista, com setup guiado e entrada operacional em até 3 dias úteis para você operar mais rápido.'
    when 'd0cb4b21-f795-4b2f-bb8c-fb5be5118f6e' then 'Operação premium com IA dedicada para alto volume de respostas, implantação assistida e foco em escala contínua.'
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then 'Plano premium com IA e consultor dedicado na conta ao longo do dia, configuração rápida e acompanhamento contínuo da operação.'
    else descricao
  end,
  badge = case id
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then 'Até 3 dias úteis'
    else badge
  end,
  cta_texto = case id
    when 'f6c55498-7b22-4ac2-9703-bf2bdd0cc431' then 'Começar agora'
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then 'Quero configuração rápida'
    else cta_texto
  end,
  caracteristicas = case id
    when 'f6c55498-7b22-4ac2-9703-bf2bdd0cc431' then '[
      "Todas as ferramentas principais da plataforma",
      "IA ilimitada atendendo 24/7",
      "1 operação principal conectada",
      "CRM, fluxos e automações inclusos",
      "Suporte via WhatsApp",
      "Estrutura enxuta para começar sem travar crescimento"
    ]'::jsonb
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then '[
      "Tudo do plano de R$ 49,99",
      "Números adicionais ilimitados",
      "Atualizações automáticas completas do sistema",
      "Respostas da IA com prioridade maior",
      "Mais estrutura para operações simultâneas",
      "Suporte prioritário via WhatsApp"
    ]'::jsonb
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then '[
      "Tudo do plano de R$ 99",
      "Configuração completa da IA feita por especialista",
      "Entrega operacional em até 3 dias úteis após confirmação",
      "Ajustes iniciais guiados para o seu cenário",
      "Menos trabalho manual no começo",
      "Prioridade alta no acompanhamento de implantação"
    ]'::jsonb
    when 'd0cb4b21-f795-4b2f-bb8c-fb5be5118f6e' then '[
      "Tudo do plano de R$ 199",
      "IA dedicada para alto volume de respostas",
      "Estrutura pensada para operações intensas",
      "Implantação assistida com foco em escala contínua",
      "Prioridade máxima na fila operacional",
      "Operação pronta para crescer com menos fila"
    ]'::jsonb
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then '[
      "Tudo do plano de R$ 299,99",
      "Consultor dedicado na conta ao longo do dia",
      "Configuração rápida com ajustes contínuos",
      "Atendimento para urgências e refinamentos da operação",
      "Acompanhamento próximo de segunda a sexta",
      "Camada premium para quem quer a conta sempre assistida"
    ]'::jsonb
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
