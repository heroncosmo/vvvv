begin;

update public.plans
set
  descricao = case id
    when 'f6c55498-7b22-4ac2-9703-bf2bdd0cc431' then 'Conversas, mensagens, clientes e respostas da IA ilimitadas em uma entrada enxuta, com 50% das ferramentas da plataforma, 1 conexão WhatsApp e sem atualizações do sistema.'
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then 'Conversas, mensagens, clientes e respostas da IA ilimitadas com todas as ferramentas incluídas, conexões WhatsApp ilimitadas e atualizações do sistema já inclusas no plano.'
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then 'Você cria a conta, assina, conecta o QR Code do WhatsApp e passa as informações do negócio. Nossa equipe configura toda a IA para você e entrega pronta para operar em até 3 dias úteis.'
    when 'd0cb4b21-f795-4b2f-bb8c-fb5be5118f6e' then 'Conversas, mensagens, clientes e respostas da IA ilimitadas com IA dedicada, sem compartilhar tempo de resposta e com mais capacidade para grande volume diário e simultâneo.'
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then 'Você só conecta o QR Code do WhatsApp e envia as informações. A equipe configura a IA e coloca para rodar no mesmo dia, com gerente VIP acompanhando tudo por 30 dias para você não precisar cuidar da parte técnica.'
    else descricao
  end,
  valor_original = case id
    when 'f6c55498-7b22-4ac2-9703-bf2bdd0cc431' then 99.99
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then 199.99
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then 399.99
    when 'd0cb4b21-f795-4b2f-bb8c-fb5be5118f6e' then 599.99
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then 995.99
    else valor_original
  end,
  caracteristicas = case id
    when 'f6c55498-7b22-4ac2-9703-bf2bdd0cc431' then to_jsonb(array[
      '50% das ferramentas da plataforma inclusas no plano',
      'Sem atualizações do sistema',
      '1 conexão WhatsApp',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'IA ilimitada atendendo 24/7',
      'CRM, fluxos e automações da estrutura inicial'
    ]::text[])
    when 'c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65' then to_jsonb(array[
      'Todas as ferramentas e atualizações do sistema inclusas no plano',
      'Conexões WhatsApp ilimitadas',
      'Suporte prioritário via WhatsApp',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'Atualizações automáticas completas do sistema',
      'Respostas da IA com prioridade maior'
    ]::text[])
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then to_jsonb(array[
      'Você só cria a conta, assina e a gente faz toda a configuração',
      'IA configurada por especialista em até 3 dias úteis',
      'Todas as ferramentas e atualizações do sistema inclusas',
      'Conexões WhatsApp ilimitadas',
      'Suporte prioritário via WhatsApp',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'Você só conecta o QR Code e envia as informações do negócio',
      'Entrega operacional pronta para uso após a configuração'
    ]::text[])
    when 'd0cb4b21-f795-4b2f-bb8c-fb5be5118f6e' then to_jsonb(array[
      'IA dedicada para grande volume diário e simultâneo',
      'Mais capacidade de resposta no mesmo instante',
      'Todas as ferramentas e atualizações do sistema inclusas',
      'Conexões WhatsApp ilimitadas',
      'Suporte prioritário via WhatsApp',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'Implantação assistida com foco em escala contínua'
    ]::text[])
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then to_jsonb(array[
      'Configuração da IA feita e entregue no mesmo dia',
      'Gerente VIP acompanhando sua operação por 30 dias',
      'Atendimento do gerente das 11h às 21h, de segunda a sexta',
      'Ajustes no agente IA sempre que precisar durante 30 dias',
      'IA dedicada para grande volume diário e simultâneo',
      'Todas as ferramentas e atualizações do sistema inclusas',
      'Conexões WhatsApp ilimitadas',
      'Suporte prioritário via WhatsApp',
      'Conversas ilimitadas',
      'Mensagens ilimitadas',
      'Clientes ilimitados',
      'Tokens ilimitados da IA inclusos',
      'Prioridade alta no acompanhamento de implantação'
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
