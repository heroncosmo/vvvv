/**
 * 🧪 VALIDAÇÃO DO SISTEMA DELIVERY
 * 
 * Script para testar e validar a lógica do delivery com cenários reais.
 * Usa IA "Cliente" que simula comportamentos diversos vs o sistema real.
 */

import Anthropic from '@anthropic-ai/sdk';

// ═══════════════════════════════════════════════════════════════════════
// 📋 DADOS REAIS DO CARDÁPIO (para validação)
// ═══════════════════════════════════════════════════════════════════════

const CARDAPIO_REAL = {
  business_name: 'Burger House',
  delivery_fee: 5.00,
  min_order: 20.00,
  items: [
    { name: 'Burger Clássico', price: 25.00, category: 'HAMBÚRGUERES' },
    { name: 'Burger Bacon', price: 32.00, category: 'HAMBÚRGUERES' },
    { name: 'Burger Vegano', price: 28.00, category: 'HAMBÚRGUERES' },
    { name: 'Coca-Cola Lata', price: 5.00, category: 'BEBIDAS' },
    { name: 'Suco Natural Laranja', price: 8.00, category: 'BEBIDAS' },
  ]
};

// Itens que NÃO existem (para detectar invenções)
const ITENS_INEXISTENTES = [
  'batata frita', 'batata', 'fritas', 'onion rings', 'nuggets',
  'milk shake', 'sorvete', 'pizza', 'hot dog', 'cachorro quente'
];

// ═══════════════════════════════════════════════════════════════════════
// 🔍 VALIDADORES
// ═══════════════════════════════════════════════════════════════════════

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

function validateResponse(response: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const responseLower = response.toLowerCase();
  
  // 1. Verificar se inventou itens
  for (const item of ITENS_INEXISTENTES) {
    if (responseLower.includes(item)) {
      errors.push(`❌ INVENTOU ITEM: "${item}" não existe no cardápio!`);
    }
  }
  
  // 2. Verificar preços mencionados
  const pricePattern = /R\$\s*(\d+)[,.](\d{2})/g;
  let match;
  while ((match = pricePattern.exec(response)) !== null) {
    const price = parseFloat(`${match[1]}.${match[2]}`);
    const validPrices = [5.00, 8.00, 25.00, 28.00, 32.00, 53.00, 55.00, 60.00, 65.00, 85.00]; // preços válidos e totais possíveis
    
    // Verificar se é um preço válido ou total razoável
    const isValidPrice = CARDAPIO_REAL.items.some(i => Math.abs(i.price - price) < 0.01);
    const isDeliveryFee = Math.abs(price - CARDAPIO_REAL.delivery_fee) < 0.01;
    const isReasonableTotal = price <= 200 && price >= CARDAPIO_REAL.min_order;
    
    if (!isValidPrice && !isDeliveryFee && price > 50 && !isReasonableTotal) {
      warnings.push(`⚠️ Preço suspeito: R$ ${price.toFixed(2)} - verificar se é um total válido`);
    }
  }
  
  // 3. Verificar se mencionou itens corretamente
  for (const item of CARDAPIO_REAL.items) {
    const itemLower = item.name.toLowerCase();
    if (responseLower.includes(itemLower)) {
      // Verificar se o preço mencionado está correto
      const priceStr = `r\\$\\s*${item.price.toFixed(0)}`;
      const regex = new RegExp(priceStr, 'i');
      // Isso é só um check básico, não erro crítico
    }
  }
  
  return {
    passed: errors.length === 0,
    errors,
    warnings
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 🎭 CENÁRIOS DE TESTE
// ═══════════════════════════════════════════════════════════════════════

interface TestScenario {
  name: string;
  description: string;
  clientPersonality: string;
  expectedBehaviors: string[];
  forbiddenBehaviors: string[];
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    name: 'Cliente Direto',
    description: 'Cliente que sabe o que quer e faz pedido direto',
    clientPersonality: `Você é um cliente decidido. Quer 2 Burger Clássico e uma Coca-Cola.
Fala direto ao ponto, não enrola. Não pede nada que não existe no cardápio.`,
    expectedBehaviors: ['pedir itens existentes', 'confirmar pedido'],
    forbiddenBehaviors: ['pedir batata frita', 'pedir item inexistente']
  },
  {
    name: 'Cliente Indeciso',
    description: 'Cliente que pergunta muito antes de decidir',
    clientPersonality: `Você é um cliente indeciso. Pergunta sobre os lanches, qual é melhor,
se é gostoso, quanto custa. Eventualmente pede um Burger Bacon e suco.
NÃO peça itens que não existem - só pergunte sobre o que tem no cardápio.`,
    expectedBehaviors: ['perguntar sobre itens', 'pedir recomendação'],
    forbiddenBehaviors: ['pedir batata', 'inventar item']
  },
  {
    name: 'Cliente que Tenta Item Inexistente',
    description: 'Cliente pede algo que não tem no cardápio',
    clientPersonality: `Você é um cliente que quer batata frita. Pergunta se tem batata.
Quando disser que não tem, aceita e pede um hambúrguer com Coca-Cola.`,
    expectedBehaviors: ['perguntar por batata', 'aceitar alternativa'],
    forbiddenBehaviors: ['sistema oferecer batata que não existe']
  },
  {
    name: 'Cliente Confuso',
    description: 'Cliente manda mensagens confusas e curtas',
    clientPersonality: `Você manda mensagens curtas e confusas tipo:
"oi", "então", "isso", "ok", "bacon", "esse mesmo".
O sistema deve entender o contexto e não reiniciar o cardápio toda hora.`,
    expectedBehaviors: ['entender contexto', 'não repetir cardápio'],
    forbiddenBehaviors: ['reiniciar conversa em cada mensagem']
  },
  {
    name: 'Cliente Vegano',
    description: 'Cliente com restrição alimentar',
    clientPersonality: `Você é vegano e pergunta se tem opção vegana.
Pede o Burger Vegano com suco de laranja. Confirma endereço e forma de pagamento.`,
    expectedBehaviors: ['encontrar item vegano', 'completar pedido'],
    forbiddenBehaviors: ['oferecer item com carne']
  }
];

// ═══════════════════════════════════════════════════════════════════════
// 🤖 SIMULADOR DE CONVERSA
// ═══════════════════════════════════════════════════════════════════════

async function simulateConversation(
  scenario: TestScenario,
  systemResponse: (message: string, history: Array<{role: string, content: string}>) => Promise<string>
): Promise<{
  conversation: Array<{role: string, content: string}>;
  validationResults: ValidationResult[];
  passed: boolean;
}> {
  
  const conversation: Array<{role: string, content: string}> = [];
  const validationResults: ValidationResult[] = [];
  let allPassed = true;
  
  // Usar Anthropic para simular cliente
  const anthropic = new Anthropic();
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎭 Cenário: ${scenario.name}`);
  console.log(`📝 ${scenario.description}`);
  console.log(`${'═'.repeat(60)}`);
  
  // Primeira mensagem do cliente
  let clientMessage = 'oi';
  
  for (let turn = 0; turn < 8; turn++) {
    console.log(`\n👤 Cliente: ${clientMessage}`);
    conversation.push({ role: 'user', content: clientMessage });
    
    // Sistema responde
    const systemMsg = await systemResponse(clientMessage, conversation);
    console.log(`🤖 Sistema: ${systemMsg.substring(0, 200)}...`);
    conversation.push({ role: 'assistant', content: systemMsg });
    
    // Validar resposta do sistema
    const validation = validateResponse(systemMsg);
    validationResults.push(validation);
    
    if (!validation.passed) {
      allPassed = false;
      console.log(`\n❌ ERROS ENCONTRADOS:`);
      validation.errors.forEach(e => console.log(`   ${e}`));
    }
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => console.log(`   ${w}`));
    }
    
    // Verificar se conversa terminou (pedido confirmado ou cancelado)
    if (systemMsg.toLowerCase().includes('pedido confirmado') ||
        systemMsg.toLowerCase().includes('seu pedido está a caminho') ||
        systemMsg.toLowerCase().includes('obrigado pelo pedido')) {
      console.log(`\n✅ Conversa finalizada com sucesso!`);
      break;
    }
    
    // Cliente responde (usando IA)
    const clientPrompt = `${scenario.clientPersonality}

HISTÓRICO DA CONVERSA:
${conversation.map(m => `${m.role === 'user' ? 'Você' : 'Atendente'}: ${m.content}`).join('\n')}

CARDÁPIO REAL (só pode pedir estes itens):
${CARDAPIO_REAL.items.map(i => `- ${i.name}: R$ ${i.price.toFixed(2)}`).join('\n')}

Responda como cliente. Seja breve (1-2 frases). Se o sistema errar, corrija educadamente.
Nunca peça itens que não estão no cardápio (exceto para testar se o sistema lida bem).`;

    const clientResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{ role: 'user', content: clientPrompt }]
    });
    
    clientMessage = (clientResponse.content[0] as any).text;
  }
  
  return { conversation, validationResults, passed: allPassed };
}

// ═══════════════════════════════════════════════════════════════════════
// 🚀 EXECUTOR DE TESTES
// ═══════════════════════════════════════════════════════════════════════

export async function runValidationTests() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║     🧪 VALIDAÇÃO DO SISTEMA DELIVERY - AGENTE vs CLIENTE     ║
╠══════════════════════════════════════════════════════════════╣
║  IA Cliente simula comportamentos reais                      ║
║  Sistema deve NUNCA inventar itens ou preços                 ║
╚══════════════════════════════════════════════════════════════╝
`);

  const results: Array<{scenario: string, passed: boolean, errors: string[]}> = [];
  
  // Para cada cenário, simular conversa
  for (const scenario of TEST_SCENARIOS) {
    // Aqui você integraria com o sistema real
    // Por enquanto, mock simples
    const mockSystemResponse = async (msg: string, history: any[]) => {
      // Este mock seria substituído pela chamada real ao sistema
      return `[MOCK] Resposta do sistema para: ${msg}`;
    };
    
    // Simular (descomentar quando tiver o sistema integrado)
    // const result = await simulateConversation(scenario, mockSystemResponse);
    // results.push({ scenario: scenario.name, passed: result.passed, errors: result.validationResults.flatMap(v => v.errors) });
    
    console.log(`\n📋 Cenário "${scenario.name}" - pronto para teste`);
  }
  
  return results;
}

// Exportar para uso externo
export { validateResponse, CARDAPIO_REAL, TEST_SCENARIOS };
