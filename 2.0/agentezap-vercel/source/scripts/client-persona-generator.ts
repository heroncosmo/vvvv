/**
 * CLIENT PERSONA GENERATOR
 * 
 * Gera personas de clientes para testes IA vs IA no fluxo de delivery.
 * Cada persona tem características únicas que testam diferentes aspectos do atendimento.
 */

export interface ClientPersona {
  id: string;
  name: string;
  description: string;
  traits: string[];
  objective: string;
  targetItems: string[];
  prompt: string;
  expectedBehavior: 'confirm' | 'cancel' | 'indecisive';
}

// Base de dados de nomes para geração aleatória
const FIRST_NAMES = [
  'Claudio', 'Maria', 'João', 'Ana', 'Pedro', 'Lucas', 'Juliana', 'Roberto',
  'Fernanda', 'Marcos', 'Carla', 'Ricardo', 'Patrícia', 'Bruno', 'Amanda',
  'Gabriel', 'Larissa', 'Felipe', 'Camila', 'Thiago', 'Isabela', 'Matheus',
  'Natália', 'Leonardo', 'Bianca', 'Guilherme', 'Mariana', 'Diego'
];

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Carvalho',
  'Almeida', 'Ferreira', 'Rodrigues', 'Martins', 'Lima', 'Gomes', 'Ribeiro',
  'Rezende', 'Monteiro', 'Teixeira', 'Moreira', 'Mendes', 'Barbosa'
];

const STREETS = [
  'Rua das Flores', 'Av. Brasil', 'Rua 15 de Novembro', 'Alameda das Palmeiras',
  'Rua dos Desenvolvedores', 'Rua das Economias', 'Av. das Américas',
  'Rua Principal', 'Rua Boa Esperança', 'Av. Fernando Corrêa',
  'Rua Marechal Deodoro', 'Av. Historiador Rubens de Mendonça'
];

const NEIGHBORHOODS = [
  'Centro', 'Boa Esperança', 'Jardim Imperial', 'Tech Park', 'Bairro Novo',
  'Duque de Caxias', 'Alvorada', 'Bosque da Saúde', 'Coxipó', 'Ponte Nova'
];

const CITIES = ['Cuiabá', 'Várzea Grande'];

// Templates de prompts para cada tipo de persona
const PERSONA_TEMPLATES: Omit<ClientPersona, 'id' | 'name' | 'prompt'>[] = [
  {
    description: 'Cliente INDECISO que hesita entre opções',
    traits: ['indeciso', 'perguntador', 'cauteloso'],
    objective: 'Pizza Calabresa + borda catupiry',
    targetItems: ['Pizza Calabresa', 'Borda Catupiry'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente APRESSADO com fome',
    traits: ['apressado', 'direto', 'impaciente'],
    objective: 'Combo 6 Esfihas + Refri 1L',
    targetItems: ['Combo 6 Esfihas', 'Refrigerante 1 Litro'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente que quer PIZZA MEIO A MEIO',
    traits: ['detalhista', 'exigente', 'cuidadoso'],
    objective: 'Pizza meio Calabresa meio Frango Catupiry',
    targetItems: ['Pizza Meio a Meio', 'Calabresa', 'Frango Catupiry'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente vegetariano',
    traits: ['educado', 'atencioso', 'saudável'],
    objective: 'Pizza Marguerita + Refri 2L',
    targetItems: ['Pizza Marguerita', 'Refrigerante 2 Litros'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente jovem que usa gírias',
    traits: ['despojado', 'rápido', 'tech'],
    objective: 'Pizza 4 Queijos + 2 Refrigerante Lata',
    targetItems: ['Pizza 4 Queijos', 'Refrigerante Lata'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente que vai CANCELAR o pedido',
    traits: ['instável', 'imprevisível', 'testador'],
    objective: 'Testar cancelamento após pedir',
    targetItems: ['Pizza Atum'],
    expectedBehavior: 'cancel'
  },
  {
    description: 'Cliente com MUITA fome (pedido grande)',
    traits: ['faminto', 'simpático', 'animado'],
    objective: 'Combo Pizza + Esfihas extras',
    targetItems: ['Combo Pizza', 'Esfihas de Carne', 'Esfihas de Queijo'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente ECONÔMICO que busca o menor preço',
    traits: ['econômico', 'negociador', 'prático'],
    objective: 'Menor preço possível (combo esfihas)',
    targetItems: ['Combo 6 Esfihas'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente CONFUSA que muda de ideia',
    traits: ['confusa', 'indecisa', 'distraída'],
    objective: 'Mudar pedido e endereço no meio',
    targetItems: ['Pizza Calabresa'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente NOTURNO pedindo tarde',
    traits: ['noturno', 'preocupado', 'cuidadoso'],
    objective: 'Pizza Mussarela simples',
    targetItems: ['Pizza Mussarela'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente PROLIXO que fala muito',
    traits: ['prolixo', 'tagarela', 'extrovertido'],
    objective: 'Pizza Costela + conversa extra',
    targetItems: ['Pizza Costela'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente SILENCIOSO de poucas palavras',
    traits: ['silencioso', 'direto', 'objetivo'],
    objective: '2 Esfihas de Carne',
    targetItems: ['Esfihas de Carne'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente DUVIDOSO que questiona tudo',
    traits: ['duvidoso', 'desconfiado', 'analítico'],
    objective: 'Pizza Portuguesa com confirmações extras',
    targetItems: ['Pizza Portuguesa'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente ESQUECIDO que esquece dados',
    traits: ['esquecido', 'distraído', 'apressado'],
    objective: 'Esquecer de informar endereço e pagamento',
    targetItems: ['Pizza Frango Catupiry'],
    expectedBehavior: 'confirm'
  },
  {
    description: 'Cliente VIP que espera tratamento especial',
    traits: ['exigente', 'entusiasta', 'frequente'],
    objective: 'Pedido premium com borda especial',
    targetItems: ['Pizza 4 Queijos', 'Borda 4 Queijos'],
    expectedBehavior: 'confirm'
  }
];

/**
 * Gera um endereço aleatório
 */
function generateAddress(): { street: string; number: string; complement?: string; neighborhood: string; city: string } {
  const street = STREETS[Math.floor(Math.random() * STREETS.length)];
  const number = Math.floor(Math.random() * 2000 + 1).toString();
  const neighborhood = NEIGHBORHOODS[Math.floor(Math.random() * NEIGHBORHOODS.length)];
  const city = CITIES[Math.floor(Math.random() * CITIES.length)];
  
  // 30% chance de ter complemento
  const hasComplement = Math.random() < 0.3;
  const complement = hasComplement 
    ? `apt ${Math.floor(Math.random() * 500 + 1)}` 
    : undefined;
  
  return { street, number, complement, neighborhood, city };
}

/**
 * Gera um nome completo aleatório
 */
function generateName(): string {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${firstName} ${lastName}`;
}

/**
 * Gera uma forma de pagamento aleatória
 */
function generatePaymentMethod(): { method: string; details?: string } {
  const methods = [
    { method: 'PIX', weight: 0.4 },
    { method: 'Dinheiro', details: `troco para R$${Math.floor(Math.random() * 3 + 1) * 50}`, weight: 0.3 },
    { method: 'Cartão de crédito', weight: 0.2 },
    { method: 'Cartão de débito', weight: 0.1 }
  ];
  
  const random = Math.random();
  let cumulative = 0;
  
  for (const m of methods) {
    cumulative += m.weight;
    if (random <= cumulative) {
      return { method: m.method, details: m.details };
    }
  }
  
  return { method: 'PIX' };
}

/**
 * Gera o prompt específico para uma persona
 */
function generatePrompt(template: typeof PERSONA_TEMPLATES[0], name: string): string {
  const address = generateAddress();
  const payment = generatePaymentMethod();
  
  const addressStr = address.complement 
    ? `${address.street} ${address.number}, ${address.complement}, ${address.neighborhood}, ${address.city}`
    : `${address.street} ${address.number}, ${address.neighborhood}, ${address.city}`;
  
  let prompt = `Você é ${name}, ${template.description.toLowerCase()}.\n\n`;
  
  // Adicionar características
  prompt += `**Suas características:**\n`;
  template.traits.forEach(trait => {
    switch (trait) {
      case 'indeciso':
        prompt += `- Você fica em dúvida entre opções e pergunta muito antes de decidir\n`;
        break;
      case 'apressado':
        prompt += `- Você está com pressa e responde de forma curta e direta\n`;
        break;
      case 'detalhista':
        prompt += `- Você confirma preços e detalhes várias vezes\n`;
        break;
      case 'educado':
        prompt += `- Você é muito educado e agradece sempre\n`;
        break;
      case 'despojado':
        prompt += `- Você usa gírias como "top", "valeu", "show", "blz", "demais"\n`;
        break;
      case 'instável':
        prompt += `- Você muda de ideia e pode querer cancelar\n`;
        break;
      case 'faminto':
        prompt += `- Você está com muita fome e quer pedir bastante comida\n`;
        break;
      case 'econômico':
        prompt += `- Você busca o menor preço e tenta negociar\n`;
        break;
      case 'confusa':
        prompt += `- Você muda de ideia e se confunde com os dados\n`;
        break;
      case 'prolixo':
        prompt += `- Você fala bastante e dá detalhes desnecessários\n`;
        break;
      case 'silencioso':
        prompt += `- Você responde com poucas palavras\n`;
        break;
      case 'duvidoso':
        prompt += `- Você questiona preços e pede confirmações\n`;
        break;
      case 'esquecido':
        prompt += `- Você esquece de informar dados importantes\n`;
        break;
      case 'exigente':
        prompt += `- Você espera atendimento especial e de alta qualidade\n`;
        break;
      default:
        prompt += `- Você é ${trait}\n`;
    }
  });
  
  prompt += `\n**Seu objetivo:** ${template.objective}\n\n`;
  prompt += `**Dados para fornecer quando solicitado:**\n`;
  prompt += `- Nome: ${name}\n`;
  prompt += `- Endereço: ${addressStr}\n`;
  prompt += `- Pagamento: ${payment.method}${payment.details ? ` (${payment.details})` : ''}\n\n`;
  
  // Instruções específicas por comportamento esperado
  if (template.expectedBehavior === 'cancel') {
    prompt += `**IMPORTANTE:** Você DEVE cancelar o pedido antes de confirmar. `;
    prompt += `Comece pedindo mas depois desista usando palavras como "cancelar", "desistir" ou "não quero mais".\n`;
  } else if (template.expectedBehavior === 'confirm') {
    prompt += `**IMPORTANTE:** Você DEVE confirmar o pedido quando o atendente mostrar o resumo final. `;
    prompt += `Responda com "confirmo", "pode fazer", "tá certo" ou similar.\n`;
  }
  
  prompt += `\nSimule uma conversa real e natural. Não seja robótico.`;
  
  return prompt;
}

/**
 * Gera uma única persona aleatória
 */
export function generatePersona(id?: string): ClientPersona {
  const template = PERSONA_TEMPLATES[Math.floor(Math.random() * PERSONA_TEMPLATES.length)];
  const name = generateName();
  
  return {
    id: id || `persona_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    ...template,
    prompt: generatePrompt(template, name)
  };
}

/**
 * Gera múltiplas personas únicas
 */
export function generatePersonas(count: number): ClientPersona[] {
  const personas: ClientPersona[] = [];
  const usedNames = new Set<string>();
  
  for (let i = 0; i < count; i++) {
    let persona = generatePersona(`persona_${i + 1}`);
    
    // Evitar nomes duplicados
    while (usedNames.has(persona.name)) {
      persona = generatePersona(`persona_${i + 1}`);
    }
    
    usedNames.add(persona.name);
    personas.push(persona);
  }
  
  return personas;
}

/**
 * Retorna todas as personas predefinidas (para reprodutibilidade)
 */
export function getPredefinedPersonas(): ClientPersona[] {
  return PERSONA_TEMPLATES.map((template, index) => {
    const name = generateName();
    return {
      id: `persona_${index + 1}`,
      name,
      ...template,
      prompt: generatePrompt(template, name)
    };
  });
}

/**
 * Busca uma persona por ID
 */
export function getPersonaById(id: string): ClientPersona | undefined {
  // Se for um dos IDs predefinidos (persona_1 a persona_15)
  const predefined = getPredefinedPersonas();
  const found = predefined.find(p => p.id === id);
  if (found) return found;
  
  // Senão, gera uma nova
  return generatePersona(id);
}

/**
 * Seleciona uma persona aleatória
 */
export function getRandomPersona(): ClientPersona {
  return generatePersona();
}

// Exportar templates para uso externo
export { PERSONA_TEMPLATES };

// Export default
export default {
  generatePersona,
  generatePersonas,
  getPredefinedPersonas,
  getPersonaById,
  getRandomPersona,
  PERSONA_TEMPLATES
};
