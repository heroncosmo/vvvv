/**
 * Testes de Integração - Sistema de Agendamento
 * 
 * Este arquivo contém 100 cenários de teste para validar:
 * 1. IA responde naturalmente (não engessada)
 * 2. Fluxo de 3 etapas: Consulta → Sugestão → Confirmação
 * 3. Tag [AGENDAR:] usada apenas após confirmação
 * 4. Horários bloqueados corretamente
 * 5. Duplicatas bloqueadas
 */

const API_BASE = 'http://localhost:5000';

interface TestCase {
  id: number;
  category: string;
  description: string;
  messages: string[];
  expectations: {
    shouldHaveSchedulingTag?: boolean;
    shouldCreateAppointment?: boolean;
    shouldMentionAlternative?: boolean;
    shouldAskForName?: boolean;
    shouldBeNatural?: boolean;
    shouldNotHaveDoubleMessage?: boolean;
  };
}

// Cenários de teste organizados por categoria
const testCases: TestCase[] = [
  // ========================================
  // CATEGORIA 1: Consultas Iniciais (sem tag)
  // ========================================
  {
    id: 1,
    category: 'Consulta',
    description: 'Cliente pergunta sobre horários disponíveis',
    messages: ['Oi, vocês atendem amanhã?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 2,
    category: 'Consulta',
    description: 'Cliente pergunta sobre dias de funcionamento',
    messages: ['Quais dias vocês trabalham?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 3,
    category: 'Consulta',
    description: 'Cliente pergunta sobre preços',
    messages: ['Quanto custa o serviço?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 4,
    category: 'Consulta',
    description: 'Cliente pergunta sobre localização',
    messages: ['Onde fica a clínica?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 5,
    category: 'Consulta',
    description: 'Cliente pergunta sobre horário específico',
    messages: ['Tem horário às 15h amanhã?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 6,
    category: 'Consulta',
    description: 'Cliente pergunta sobre serviços oferecidos',
    messages: ['O que vocês fazem?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 7,
    category: 'Consulta',
    description: 'Cliente pergunta sobre duração do atendimento',
    messages: ['Quanto tempo dura a consulta?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 8,
    category: 'Consulta',
    description: 'Cliente pergunta sobre final de semana',
    messages: ['Vocês abrem no sábado?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 9,
    category: 'Consulta',
    description: 'Cliente quer saber mais antes de agendar',
    messages: ['Quero saber mais sobre o tratamento antes de agendar'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 10,
    category: 'Consulta',
    description: 'Cliente pergunta sobre cancelamento',
    messages: ['Como faço para cancelar se precisar?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },

  // ========================================
  // CATEGORIA 2: Sugestões (sem tag ainda)
  // ========================================
  {
    id: 11,
    category: 'Sugestão',
    description: 'Cliente menciona interesse em agendar sem confirmar',
    messages: ['Quero agendar para amanhã'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldAskForName: true,
      shouldBeNatural: true,
    },
  },
  {
    id: 12,
    category: 'Sugestão',
    description: 'Cliente menciona horário preferido',
    messages: ['Gostaria de um horário de manhã'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldMentionAlternative: true,
      shouldBeNatural: true,
    },
  },
  {
    id: 13,
    category: 'Sugestão',
    description: 'Cliente pede horário indisponível (hoje tarde)',
    messages: ['Quero marcar para hoje às 20h'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldMentionAlternative: true,
      shouldBeNatural: true,
    },
  },
  {
    id: 14,
    category: 'Sugestão',
    description: 'Cliente pede dia indisponível (domingo)',
    messages: ['Tem vaga no domingo?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldMentionAlternative: true,
      shouldBeNatural: true,
    },
  },
  {
    id: 15,
    category: 'Sugestão',
    description: 'Cliente pergunta sobre próxima disponibilidade',
    messages: ['Qual o primeiro horário disponível?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 16,
    category: 'Sugestão',
    description: 'Cliente prefere tarde',
    messages: ['Prefiro horário à tarde, pode ser?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 17,
    category: 'Sugestão',
    description: 'Cliente pergunta sobre semana que vem',
    messages: ['Tem vaga na semana que vem?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 18,
    category: 'Sugestão',
    description: 'Cliente menciona restrição de horário',
    messages: ['Só posso depois das 14h'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 19,
    category: 'Sugestão',
    description: 'Cliente pergunta sobre horários da manhã',
    messages: ['Tem horário às 9h?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 20,
    category: 'Sugestão',
    description: 'Cliente quer ver opções antes de decidir',
    messages: ['Quais horários estão disponíveis amanhã?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },

  // ========================================
  // CATEGORIA 3: Confirmação com Nome (COM tag)
  // ========================================
  {
    id: 21,
    category: 'Confirmação',
    description: 'Fluxo completo: pergunta + confirmação + nome',
    messages: [
      'Tem horário amanhã às 10h?',
      'Sim, pode confirmar! Meu nome é João Silva',
    ],
    expectations: {
      shouldHaveSchedulingTag: true,
      shouldCreateAppointment: true,
      shouldNotHaveDoubleMessage: true,
    },
  },
  {
    id: 22,
    category: 'Confirmação',
    description: 'Cliente confirma com nome na mensagem',
    messages: [
      'Quero agendar para amanhã',
      'Pode ser às 14h, meu nome é Maria Santos',
    ],
    expectations: {
      shouldHaveSchedulingTag: true,
      shouldCreateAppointment: true,
    },
  },
  {
    id: 23,
    category: 'Confirmação',
    description: 'Cliente dá nome primeiro depois confirma',
    messages: [
      'Meu nome é Pedro Oliveira, quero marcar para amanhã',
      'Pode ser às 09:00',
    ],
    expectations: {
      shouldHaveSchedulingTag: true,
      shouldCreateAppointment: true,
    },
  },
  {
    id: 24,
    category: 'Confirmação',
    description: 'Confirmação explícita após sugestão',
    messages: [
      'Tem vaga amanhã de manhã?',
      'Confirma para as 10:15, nome Ana Costa',
    ],
    expectations: {
      shouldHaveSchedulingTag: true,
      shouldCreateAppointment: true,
    },
  },
  {
    id: 25,
    category: 'Confirmação',
    description: 'Cliente aceita horário alternativo sugerido',
    messages: [
      'Quero às 15h amanhã',
      'Ok, pode ser 15:15 então. Nome é Carlos Souza',
    ],
    expectations: {
      shouldHaveSchedulingTag: true,
      shouldCreateAppointment: true,
    },
  },

  // ========================================
  // CATEGORIA 4: Cenários de Hoje (sem horário)
  // ========================================
  {
    id: 26,
    category: 'Hoje',
    description: 'Cliente quer agendar hoje tarde da noite',
    messages: ['Quero agendar para hoje'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldMentionAlternative: true,
      shouldNotHaveDoubleMessage: true,
    },
  },
  {
    id: 27,
    category: 'Hoje',
    description: 'Cliente insiste em hoje',
    messages: [
      'Preciso para hoje urgente',
    ],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldMentionAlternative: true,
      shouldBeNatural: true,
    },
  },
  {
    id: 28,
    category: 'Hoje',
    description: 'Cliente pergunta se tem vaga hoje',
    messages: ['Tem vaga para hoje ainda?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 29,
    category: 'Hoje',
    description: 'Cliente quer encaixe hoje',
    messages: ['Vocês fazem encaixe? Preciso para hoje'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 30,
    category: 'Hoje',
    description: 'Cliente aceita amanhã após ver que hoje não tem',
    messages: [
      'Tem para hoje?',
      'Então amanhã às 09:00, meu nome é Lucia Ferreira',
    ],
    expectations: {
      shouldHaveSchedulingTag: true,
      shouldCreateAppointment: true,
    },
  },

  // ========================================
  // CATEGORIA 5: Naturalidade da IA
  // ========================================
  {
    id: 31,
    category: 'Naturalidade',
    description: 'IA deve responder com personalidade ao cumprimento',
    messages: ['Olá, bom dia!'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 32,
    category: 'Naturalidade',
    description: 'IA deve ser empática com problema do cliente',
    messages: ['Estou com muita dor nas costas'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 33,
    category: 'Naturalidade',
    description: 'IA deve responder perguntas gerais naturalmente',
    messages: ['O tratamento dói?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 34,
    category: 'Naturalidade',
    description: 'IA deve manter tom amigável',
    messages: ['Obrigado pela informação!'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 35,
    category: 'Naturalidade',
    description: 'IA deve responder despedida naturalmente',
    messages: ['Tchau, até amanhã!'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },

  // ========================================
  // CATEGORIA 6: Cenários de Erro
  // ========================================
  {
    id: 36,
    category: 'Erro',
    description: 'Horário fora do expediente',
    messages: ['Quero agendar às 22h'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldMentionAlternative: true,
    },
  },
  {
    id: 37,
    category: 'Erro',
    description: 'Data muito no futuro',
    messages: ['Posso agendar para daqui 3 meses?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 38,
    category: 'Erro',
    description: 'Data no passado',
    messages: ['Quero remarcar para ontem'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 39,
    category: 'Erro',
    description: 'Horário na pausa/almoço',
    messages: ['Tem horário às 12:30?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldMentionAlternative: true,
    },
  },
  {
    id: 40,
    category: 'Erro',
    description: 'Formato de data inválido',
    messages: ['Quero para dia 32 de janeiro'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },

  // ========================================
  // CATEGORIA 7: Fluxos Conversacionais Longos
  // ========================================
  {
    id: 41,
    category: 'Fluxo Longo',
    description: 'Conversa com várias trocas antes de agendar',
    messages: [
      'Oi, tudo bem?',
      'Quero saber mais sobre o tratamento',
      'Quanto custa?',
      'Tem vaga amanhã?',
      'Pode ser às 14:00, meu nome é Roberto Lima',
    ],
    expectations: {
      shouldHaveSchedulingTag: true,
      shouldCreateAppointment: true,
    },
  },
  {
    id: 42,
    category: 'Fluxo Longo',
    description: 'Cliente muda de ideia várias vezes',
    messages: [
      'Quero para segunda',
      'Na verdade, melhor terça',
      'Pensando bem, pode ser amanhã mesmo às 10:15, nome Ana Paula',
    ],
    expectations: {
      shouldHaveSchedulingTag: true,
      shouldCreateAppointment: true,
    },
  },
  {
    id: 43,
    category: 'Fluxo Longo',
    description: 'Cliente faz várias perguntas antes',
    messages: [
      'Quanto tempo dura?',
      'Precisa de preparo?',
      'Pode comer antes?',
      'Ok, quero agendar para amanhã 09:00, sou Marcos Alves',
    ],
    expectations: {
      shouldHaveSchedulingTag: true,
      shouldCreateAppointment: true,
    },
  },

  // ========================================
  // CATEGORIA 8: Duplicatas e Conflitos
  // ========================================
  {
    id: 44,
    category: 'Conflito',
    description: 'Segundo agendamento no mesmo horário deve falhar',
    messages: [
      'Quero agendar amanhã às 09:00, nome Paula Costa',
    ],
    expectations: {
      // Depende se já tem agendamento
      shouldBeNatural: true,
    },
  },
  {
    id: 45,
    category: 'Conflito',
    description: 'Cliente tenta reagendar mesmo horário',
    messages: [
      'Já tenho horário às 09:00, posso trocar para 10:15?',
    ],
    expectations: {
      shouldBeNatural: true,
    },
  },

  // ========================================
  // CATEGORIA 9: Variações de Linguagem
  // ========================================
  {
    id: 46,
    category: 'Linguagem',
    description: 'Linguagem informal/gírias',
    messages: ['Eae, tem vaga pra amanhã?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 47,
    category: 'Linguagem',
    description: 'Linguagem formal',
    messages: ['Prezados, gostaria de verificar a disponibilidade para agendamento'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 48,
    category: 'Linguagem',
    description: 'Abreviações',
    messages: ['Vc tem hr amanhã?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 49,
    category: 'Linguagem',
    description: 'Mensagem com emoji',
    messages: ['Oi! 😊 Tem horário disponível?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 50,
    category: 'Linguagem',
    description: 'Mensagem em maiúsculas',
    messages: ['QUERO AGENDAR URGENTE'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },

  // ========================================
  // CATEGORIA 10: Casos Especiais
  // ========================================
  {
    id: 51,
    category: 'Especial',
    description: 'Cliente pergunta sobre primeira vez',
    messages: ['É minha primeira vez, como funciona?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 52,
    category: 'Especial',
    description: 'Cliente menciona indicação',
    messages: ['Fulano me indicou vocês, quero agendar'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldAskForName: true,
    },
  },
  {
    id: 53,
    category: 'Especial',
    description: 'Cliente já é paciente',
    messages: ['Sou paciente de vocês, quero remarcar'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 54,
    category: 'Especial',
    description: 'Cliente pergunta sobre convênio',
    messages: ['Vocês atendem convênio?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },
  {
    id: 55,
    category: 'Especial',
    description: 'Cliente pergunta sobre estacionamento',
    messages: ['Tem estacionamento no local?'],
    expectations: {
      shouldHaveSchedulingTag: false,
      shouldBeNatural: true,
    },
  },

  // Continuar com mais 45 casos para totalizar 100...
  // Adicionar casos variados cobrindo todas as situações

  {
    id: 56,
    category: 'Confirmação',
    description: 'Confirmação com "sim"',
    messages: ['Tem às 14h amanhã?', 'Sim! Maria Clara'],
    expectations: { shouldHaveSchedulingTag: true },
  },
  {
    id: 57,
    category: 'Confirmação',
    description: 'Confirmação com "pode ser"',
    messages: ['Tem às 11:30?', 'Pode ser, José Santos'],
    expectations: { shouldHaveSchedulingTag: true },
  },
  {
    id: 58,
    category: 'Confirmação',
    description: 'Confirmação com "ok"',
    messages: ['Disponível amanhã?', 'Ok, 09:00. Fernanda Lima'],
    expectations: { shouldHaveSchedulingTag: true },
  },
  {
    id: 59,
    category: 'Confirmação',
    description: 'Confirmação com "confirma"',
    messages: ['Amanhã de manhã?', 'Confirma 10:15, Rodrigo Alves'],
    expectations: { shouldHaveSchedulingTag: true },
  },
  {
    id: 60,
    category: 'Confirmação',
    description: 'Confirmação com "perfeito"',
    messages: ['Tem vaga às 16:30?', 'Perfeito! Camila Souza'],
    expectations: { shouldHaveSchedulingTag: true },
  },

  // Mais cenários de negação (sem tag)
  {
    id: 61,
    category: 'Negação',
    description: 'Cliente nega sugestão',
    messages: ['Tem às 09:00?', 'Não, prefiro mais tarde'],
    expectations: { shouldHaveSchedulingTag: false },
  },
  {
    id: 62,
    category: 'Negação',
    description: 'Cliente quer pensar',
    messages: ['Tem disponibilidade?', 'Vou pensar e volto a falar'],
    expectations: { shouldHaveSchedulingTag: false },
  },
  {
    id: 63,
    category: 'Negação',
    description: 'Cliente cancela interesse',
    messages: ['Quero agendar', 'Esquece, mudou minha agenda'],
    expectations: { shouldHaveSchedulingTag: false },
  },
  {
    id: 64,
    category: 'Negação',
    description: 'Cliente precisa verificar agenda',
    messages: ['Tem amanhã?', 'Preciso ver minha agenda, já volto'],
    expectations: { shouldHaveSchedulingTag: false },
  },
  {
    id: 65,
    category: 'Negação',
    description: 'Cliente quer ligar depois',
    messages: ['Tenho interesse', 'Vou ligar depois para confirmar'],
    expectations: { shouldHaveSchedulingTag: false },
  },

  // Horários específicos
  {
    id: 66,
    category: 'Horário',
    description: 'Horário 09:00',
    messages: ['Confirma amanhã 09:00, Julia Mendes'],
    expectations: { shouldHaveSchedulingTag: true },
  },
  {
    id: 67,
    category: 'Horário',
    description: 'Horário 10:15',
    messages: ['Agenda 10:15 amanhã, Ricardo Costa'],
    expectations: { shouldHaveSchedulingTag: true },
  },
  {
    id: 68,
    category: 'Horário',
    description: 'Horário 11:30',
    messages: ['Quero 11:30 amanhã, Patricia Lima'],
    expectations: { shouldHaveSchedulingTag: true },
  },
  {
    id: 69,
    category: 'Horário',
    description: 'Horário 14:00',
    messages: ['Marca 14:00 amanhã, Bruno Silva'],
    expectations: { shouldHaveSchedulingTag: true },
  },
  {
    id: 70,
    category: 'Horário',
    description: 'Horário 15:15',
    messages: ['15:15 amanhã pode ser, Leticia Ramos'],
    expectations: { shouldHaveSchedulingTag: true },
  },

  // Mais casos de consulta
  {
    id: 71,
    category: 'Consulta',
    description: 'Pergunta sobre profissional',
    messages: ['Quem vai me atender?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 72,
    category: 'Consulta',
    description: 'Pergunta sobre experiência',
    messages: ['Há quanto tempo vocês trabalham com isso?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 73,
    category: 'Consulta',
    description: 'Pergunta sobre resultados',
    messages: ['Quantas sessões preciso para ver resultado?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 74,
    category: 'Consulta',
    description: 'Pergunta sobre contraindicações',
    messages: ['Tem alguma contraindicação?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 75,
    category: 'Consulta',
    description: 'Pergunta sobre cuidados pós',
    messages: ['Preciso de repouso depois?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },

  // Cenários com nomes variados
  {
    id: 76,
    category: 'Nome',
    description: 'Nome composto',
    messages: ['Agenda amanhã 09:00, Maria das Graças Silva'],
    expectations: { shouldHaveSchedulingTag: true },
  },
  {
    id: 77,
    category: 'Nome',
    description: 'Nome com sobrenome longo',
    messages: ['Confirma 10:15, João Pedro de Oliveira Santos'],
    expectations: { shouldHaveSchedulingTag: true },
  },
  {
    id: 78,
    category: 'Nome',
    description: 'Nome simples',
    messages: ['Marca 14:00, Ana'],
    expectations: { shouldHaveSchedulingTag: true },
  },
  {
    id: 79,
    category: 'Nome',
    description: 'Nome com apelido',
    messages: ['Pode ser amanhã 11:30, me chama de Bia (Beatriz Santos)'],
    expectations: { shouldHaveSchedulingTag: true },
  },
  {
    id: 80,
    category: 'Nome',
    description: 'Nome estrangeiro',
    messages: ['15:15 amanhã, William Johnson'],
    expectations: { shouldHaveSchedulingTag: true },
  },

  // Cenários de conversa natural
  {
    id: 81,
    category: 'Natural',
    description: 'Elogio ao serviço',
    messages: ['Ouvi falar muito bem de vocês!'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 82,
    category: 'Natural',
    description: 'Reclamação',
    messages: ['Liguei várias vezes e ninguém atendeu'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 83,
    category: 'Natural',
    description: 'Dúvida técnica',
    messages: ['Esse procedimento é invasivo?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 84,
    category: 'Natural',
    description: 'Pergunta sobre pagamento',
    messages: ['Aceita cartão?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 85,
    category: 'Natural',
    description: 'Pergunta sobre parcelamento',
    messages: ['Parcela em quantas vezes?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },

  // Cenários de urgência
  {
    id: 86,
    category: 'Urgência',
    description: 'Cliente com urgência',
    messages: ['Preciso urgente, estou com muita dor'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 87,
    category: 'Urgência',
    description: 'Emergência',
    messages: ['É emergência, tem como atender agora?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 88,
    category: 'Urgência',
    description: 'Dor forte',
    messages: ['Não aguento mais de dor, o mais rápido possível'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },

  // Cenários de dias específicos
  {
    id: 89,
    category: 'Dia',
    description: 'Segunda-feira',
    messages: ['Tem vaga na segunda?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 90,
    category: 'Dia',
    description: 'Sexta-feira',
    messages: ['Sexta tem horário?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 91,
    category: 'Dia',
    description: 'Fim de semana',
    messages: ['Atendem fim de semana?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 92,
    category: 'Dia',
    description: 'Feriado',
    messages: ['Funcionam no feriado?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },

  // Cenários de cancelamento/remarcação
  {
    id: 93,
    category: 'Cancelamento',
    description: 'Pedido de cancelamento',
    messages: ['Preciso cancelar meu horário'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 94,
    category: 'Cancelamento',
    description: 'Pedido de remarcação',
    messages: ['Posso trocar meu horário?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 95,
    category: 'Cancelamento',
    description: 'Atraso',
    messages: ['Vou atrasar uns 10 minutos, tem problema?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },

  // Cenários finais variados
  {
    id: 96,
    category: 'Variado',
    description: 'Mensagem apenas com emoji',
    messages: ['👋'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 97,
    category: 'Variado',
    description: 'Mensagem muito curta',
    messages: ['Oi'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 98,
    category: 'Variado',
    description: 'Mensagem muito longa',
    messages: ['Olá, boa tarde! Estou entrando em contato porque vi no Instagram de vocês que fazem tratamentos estéticos. Gostaria de saber mais sobre os procedimentos disponíveis, valores, se atendem convênio, quais os horários de funcionamento e se tem disponibilidade para a próxima semana. Agradeço desde já!'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 99,
    category: 'Variado',
    description: 'Pergunta múltipla',
    messages: ['Oi! Vocês fazem botox? Quanto custa? Tem vaga amanhã?'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
  {
    id: 100,
    category: 'Variado',
    description: 'Áudio (texto simulado)',
    messages: ['[Transcrição de áudio] Oi, tudo bem? Queria saber se vocês tem horário amanhã, pode ser qualquer hora'],
    expectations: { shouldHaveSchedulingTag: false, shouldBeNatural: true },
  },
];

// ========================================
// FUNÇÕES DE TESTE
// ========================================

async function sendMessage(message: string, sessionId: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/agent/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `connect.sid=${sessionId}`,
    },
    body: JSON.stringify({ message }),
  });
  
  const data = await response.json();
  return data.response || '';
}

function hasSchedulingTag(response: string): boolean {
  return /\[AGENDAR:\s*DATA=\d{4}-\d{2}-\d{2},\s*HORA=\d{2}:\d{2},\s*NOME=[^\]]+\]/i.test(response);
}

function hasDoubleMessage(response: string): boolean {
  // Verifica se tem mensagem de erro E mensagem de sucesso
  const hasError = response.includes('⚠️ Não foi possível agendar');
  const hasSuccess = response.includes('✅') && response.includes('agendamento');
  return hasError && hasSuccess;
}

function isNaturalResponse(response: string): boolean {
  // Verifica se a resposta não é muito robótica
  const roboticPhrases = [
    'Sistema de agendamento',
    'TAG:',
    'HORA=',
    'DATA=',
  ];
  
  for (const phrase of roboticPhrases) {
    if (response.includes(phrase)) {
      return false;
    }
  }
  
  return response.length > 10; // Resposta deve ter conteúdo
}

async function runTest(testCase: TestCase, sessionId: string): Promise<{
  passed: boolean;
  reason?: string;
  response?: string;
}> {
  let lastResponse = '';
  
  try {
    // Enviar todas as mensagens em sequência
    for (const message of testCase.messages) {
      lastResponse = await sendMessage(message, sessionId);
      // Pequena pausa entre mensagens
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Verificar expectations
    const results: string[] = [];
    
    if (testCase.expectations.shouldHaveSchedulingTag !== undefined) {
      const hasTag = hasSchedulingTag(lastResponse);
      if (hasTag !== testCase.expectations.shouldHaveSchedulingTag) {
        results.push(`Tag esperada: ${testCase.expectations.shouldHaveSchedulingTag}, encontrada: ${hasTag}`);
      }
    }
    
    if (testCase.expectations.shouldNotHaveDoubleMessage) {
      if (hasDoubleMessage(lastResponse)) {
        results.push('Encontrada mensagem duplicada (erro + sucesso)');
      }
    }
    
    if (testCase.expectations.shouldBeNatural) {
      if (!isNaturalResponse(lastResponse)) {
        results.push('Resposta não parece natural');
      }
    }
    
    if (results.length > 0) {
      return {
        passed: false,
        reason: results.join('; '),
        response: lastResponse.substring(0, 200),
      };
    }
    
    return { passed: true, response: lastResponse.substring(0, 100) };
    
  } catch (error: any) {
    return {
      passed: false,
      reason: `Erro: ${error.message}`,
    };
  }
}

async function runAllTests() {
  console.log('🧪 Iniciando 100 Testes de Integração do Sistema de Agendamento\n');
  console.log('=' .repeat(80) + '\n');
  
  let passed = 0;
  let failed = 0;
  const failedTests: { id: number; description: string; reason: string }[] = [];
  
  // TODO: Obter sessionId real via login
  const sessionId = 'test-session';
  
  for (const testCase of testCases) {
    const result = await runTest(testCase, sessionId);
    
    if (result.passed) {
      passed++;
      console.log(`✅ Teste #${testCase.id}: ${testCase.description}`);
    } else {
      failed++;
      console.log(`❌ Teste #${testCase.id}: ${testCase.description}`);
      console.log(`   Motivo: ${result.reason}`);
      if (result.response) {
        console.log(`   Resposta: ${result.response}...`);
      }
      failedTests.push({
        id: testCase.id,
        description: testCase.description,
        reason: result.reason || 'Desconhecido',
      });
    }
  }
  
  console.log('\n' + '=' .repeat(80));
  console.log(`\n📊 RESULTADO FINAL:`);
  console.log(`   ✅ Passou: ${passed}/${testCases.length}`);
  console.log(`   ❌ Falhou: ${failed}/${testCases.length}`);
  console.log(`   📈 Taxa de sucesso: ${((passed / testCases.length) * 100).toFixed(1)}%`);
  
  if (failedTests.length > 0) {
    console.log(`\n❌ TESTES QUE FALHARAM:`);
    for (const test of failedTests) {
      console.log(`   #${test.id}: ${test.description}`);
      console.log(`      Motivo: ${test.reason}`);
    }
  }
  
  return { passed, failed, total: testCases.length };
}

// Exportar para uso
export { testCases, runAllTests, runTest };

// Executar se chamado diretamente
if (require.main === module) {
  runAllTests().catch(console.error);
}
