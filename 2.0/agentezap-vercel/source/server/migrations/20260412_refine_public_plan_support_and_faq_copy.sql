begin;

update public.plans
set
  descricao = case id
    when 'f6c55498-7b22-4ac2-9703-bf2bdd0cc431' then 'Todas as ferramentas da plataforma em uma estrutura enxuta para entrar com IA ilimitada e manter a operação ativa desde o primeiro dia.'
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then 'Todas as ferramentas com mais estrutura, conexões WhatsApp ilimitadas, suporte prioritário via WhatsApp, atualizações automáticas completas e prioridade maior nas respostas da IA.'
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then 'Você só conecta o QR Code do WhatsApp e passa as informações do seu negócio. Nossa equipe configura toda a IA para você e entrega pronta para operar em até 3 dias úteis.'
    when 'd0cb4b21-f795-4b2f-bb8c-fb5be5118f6e' then 'Operação premium com IA dedicada para alto volume de respostas no mesmo instante, implantação assistida, suporte prioritário via WhatsApp e foco em escala contínua.'
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then 'Você só conecta o QR Code do WhatsApp e envia as informações. Um especialista configura tudo para você em até 8 horas úteis e o gerente VIP acompanha sua operação por 30 dias, sem você precisar cuidar da parte técnica.'
    else descricao
  end,
  caracteristicas = case id
    when 'f6c55498-7b22-4ac2-9703-bf2bdd0cc431' then to_jsonb(array[
      'Todas as ferramentas principais da plataforma',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'IA ilimitada atendendo 24/7',
      '1 conexão WhatsApp',
      'CRM, fluxos e automações inclusos'
    ]::text[])
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then to_jsonb(array[
      'Tudo do plano de R$ 49,99',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'Conexões WhatsApp ilimitadas',
      'Suporte prioritário via WhatsApp',
      'Atualizações automáticas completas do sistema',
      'Respostas da IA com prioridade maior'
    ]::text[])
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then to_jsonb(array[
      'Tudo do plano de R$ 99,99',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'Conexões WhatsApp ilimitadas',
      'Suporte prioritário via WhatsApp',
      'Você só conecta o QR Code e envia as informações do negócio',
      'Configuração completa da IA feita por especialista',
      'Entrega operacional em até 3 dias úteis após confirmação'
    ]::text[])
    when 'd0cb4b21-f795-4b2f-bb8c-fb5be5118f6e' then to_jsonb(array[
      'Tudo do plano de R$ 199,99',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'Conexões WhatsApp ilimitadas',
      'Suporte prioritário via WhatsApp',
      'IA dedicada para alto volume de respostas',
      'Respostas em alto volume no mesmo instante'
    ]::text[])
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then to_jsonb(array[
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'Configuração feita por especialista em até 8 horas úteis',
      'Entrega configurada no mesmo dia útil',
      'Atendimento do gerente das 11h às 21h, de segunda a sexta',
      'Ajustes no agente IA sempre que precisar durante 30 dias',
      'Prioridade alta no acompanhamento de implantação',
      'Suporte prioritário via WhatsApp',
      'Conexões WhatsApp ilimitadas',
      'Tudo do plano de R$ 299,99'
    ]::text[])
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
