/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║              🤖 HUMANIZADOR DE MENSAGENS COM IA (MISTRAL)                    ║
 * ║                                                                              ║
 * ║  Este serviço usa a IA Mistral para variar mensagens de forma inteligente,  ║
 * ║  mantendo o sentido original mas alterando palavras e estrutura.            ║
 * ║                                                                              ║
 * ║  IMPORTANTE: A variação é feita pela IA, não por substituição automática!   ║
 * ║  Isso garante que o sentido nunca seja perdido.                             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { getLLMClient } from "./llm";

// Cache de mensagens já humanizadas para evitar chamadas repetidas à IA
const humanizedCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

// Limpar cache expirado a cada 10 minutos
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(humanizedCache.entries());
  for (const [key, value] of entries) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      humanizedCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Gera hash simples de uma mensagem para cache
 */
function generateHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Humaniza uma mensagem usando IA Mistral
 * 
 * @param originalMessage - Mensagem original a ser humanizada
 * @param context - Contexto opcional (tipo de mensagem, destinatário, etc)
 * @returns Mensagem humanizada com variações naturais
 */
export async function humanizeMessageWithAI(
  originalMessage: string,
  context?: {
    type?: 'followup' | 'bulk' | 'response' | 'group';
    recipientName?: string;
    previousVariations?: string[]; // Variações já usadas para evitar repetição
  }
): Promise<string> {
  // Mensagens muito curtas não precisam de humanização
  if (originalMessage.length < 20) {
    return originalMessage;
  }

  // Verificar cache (com hash da mensagem + contexto)
  const cacheKey = generateHash(originalMessage + JSON.stringify(context || {}));
  const cached = humanizedCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`🤖 [HUMANIZER] Cache hit - usando variação em cache`);
    return cached.result;
  }

  try {
    const mistral = await getLLMClient();

    const previousVariationsText = context?.previousVariations?.length 
      ? `\n\n⚠️ VARIAÇÕES JÁ USADAS (NÃO REPITA NENHUMA DELAS):\n${context.previousVariations.map((v, i) => `${i+1}. "${v}"`).join('\n')}`
      : '';

    const prompt = `## 🎯 TAREFA: HUMANIZAR MENSAGEM

Você é um especialista em comunicação natural via WhatsApp. Sua tarefa é REESCREVER a mensagem abaixo de forma que:

1. **MANTENHA 100% DO SENTIDO ORIGINAL** - Não mude o significado, apenas a forma de escrever
2. **Use palavras diferentes** - Troque por sinônimos naturais
3. **Varie a estrutura** - Mude a ordem das ideias se possível
4. **Mantenha o tom** - Se é formal, mantenha formal. Se é casual, mantenha casual.
5. **Pareça humano** - Como se uma pessoa real estivesse digitando
6. **NÃO ADICIONE** informações que não existem na original
7. **NÃO REMOVA** informações importantes

${context?.type === 'bulk' ? '📢 CONTEXTO: Esta é uma mensagem de envio em massa. Varie bastante para não parecer spam.' : ''}
${context?.type === 'followup' ? '📋 CONTEXTO: Esta é uma mensagem de follow-up. Mantenha o tom de acompanhamento.' : ''}
${context?.type === 'group' ? '👥 CONTEXTO: Esta é uma mensagem para grupo. Mantenha apropriada para múltiplas pessoas.' : ''}
${context?.recipientName ? `👤 DESTINATÁRIO: ${context.recipientName}` : ''}
${previousVariationsText}

---

## 📝 MENSAGEM ORIGINAL:
"${originalMessage}"

---

## ✍️ RESPONDA APENAS COM A MENSAGEM REESCRITA (sem explicações, sem aspas, sem "Aqui está"):`;

    // Usa modelo configurado no banco de dados (sem hardcode)
    const response = await mistral.chat.complete({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8, // Alta criatividade para variar mais
      maxTokens: 500,
    });

    const rawResult = response.choices?.[0]?.message?.content;
    let result = typeof rawResult === 'string' ? rawResult : originalMessage;

    // Limpar resultado (remover aspas, prefixos comuns)
    result = result
      .replace(/^["']|["']$/g, '') // Remover aspas no início/fim
      .replace(/^(Aqui está|Mensagem reescrita|Versão humanizada)[:\s]*/gi, '') // Remover prefixos
      .replace(/^[-–—]\s*/g, '') // Remover traços no início
      .trim();

    // Verificar se o resultado é válido (não muito diferente em tamanho)
    if (result.length < originalMessage.length * 0.5 || result.length > originalMessage.length * 2) {
      console.warn(`🤖 [HUMANIZER] Resultado com tamanho suspeito, usando original`);
      return originalMessage;
    }

    // Salvar no cache
    humanizedCache.set(cacheKey, { result, timestamp: Date.now() });

    console.log(`🤖 [HUMANIZER] Mensagem humanizada com sucesso`);
    console.log(`   📝 Original: "${originalMessage.substring(0, 50)}..."`);
    console.log(`   ✨ Variação: "${result.substring(0, 50)}..."`);

    return result;

  } catch (error) {
    console.error(`🤖 [HUMANIZER] Erro ao humanizar mensagem:`, error);
    // Em caso de erro, retornar a original
    return originalMessage;
  }
}

/**
 * Humaniza múltiplas mensagens de forma eficiente (batch)
 * Útil para envio em massa onde cada mensagem precisa ser diferente
 */
export async function humanizeMessagesBatch(
  messages: { text: string; recipientName?: string }[],
  context?: { type?: 'followup' | 'bulk' | 'response' | 'group' }
): Promise<string[]> {
  const results: string[] = [];
  const previousVariations: string[] = [];

  for (const msg of messages) {
    const humanized = await humanizeMessageWithAI(msg.text, {
      ...context,
      recipientName: msg.recipientName,
      previousVariations: previousVariations.slice(-5), // Últimas 5 variações
    });
    
    results.push(humanized);
    previousVariations.push(humanized);

    // Pequeno delay entre chamadas para não sobrecarregar a API
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return results;
}

/**
 * Verifica se o serviço de humanização está funcionando
 */
export async function testHumanizer(): Promise<{ success: boolean; original: string; humanized: string; error?: string }> {
  const testMessage = "Olá! Gostaria de saber se você ainda tem interesse em nosso produto. Posso te ajudar com mais informações?";
  
  try {
    const humanized = await humanizeMessageWithAI(testMessage, { type: 'followup' });
    
    return {
      success: humanized !== testMessage,
      original: testMessage,
      humanized,
    };
  } catch (error: any) {
    return {
      success: false,
      original: testMessage,
      humanized: testMessage,
      error: error.message,
    };
  }
}

/**
 * Limpa o cache de humanização
 */
export function clearHumanizerCache(): void {
  humanizedCache.clear();
  console.log(`🤖 [HUMANIZER] Cache limpo`);
}

/**
 * Estatísticas do cache
 */
export function getHumanizerStats(): { cacheSize: number; cacheTTL: number } {
  return {
    cacheSize: humanizedCache.size,
    cacheTTL: CACHE_TTL_MS,
  };
}
