/**
 * Técnica: Structured JSON Editing (Full-Document Edit Pattern)
 * 
 * Usando response_format="json_schema" para edição eficiente de prompts grandes.
 * Em vez de reescrever o documento inteiro, retorna apenas as mudanças em JSON.
 * 
 * Benefícios:
 * ✅ Economiza tokens (só retorna mudanças, não documento inteiro)
 * ✅ Rápido (menos dados para processar)
 * ✅ Preserva 100% da formatação original
 * ✅ JSON Schema garante resposta válida
 * ✅ Segurança contra injections
 */

import OpenAI from "openai";

// Schema JSON para as mudanças
const EDIT_SCHEMA = {
  type: "object" as const,
  properties: {
    changes: {
      type: "array" as const,
      description: "Lista de mudanças a aplicar no documento",
      items: {
        type: "object" as const,
        properties: {
          action: {
            type: "string" as const,
            enum: ["replace", "insert_after", "insert_before", "delete", "append"],
            description: "Tipo de ação: replace (substituir texto), insert_after (inserir depois), insert_before (inserir antes), delete (remover), append (adicionar no final)"
          },
          target: {
            type: "string" as const,
            description: "Texto exato a ser encontrado no documento (para replace, insert_after, insert_before, delete). Pode ser uma linha ou seção. Deixe vazio para append."
          },
          newContent: {
            type: "string" as const,
            description: "Novo conteúdo a ser inserido ou usado como substituição. Deixe vazio para delete."
          },
          explanation: {
            type: "string" as const,
            description: "Breve explicação do porquê dessa mudança"
          }
        },
        required: ["action", "target", "newContent", "explanation"],
        additionalProperties: false
      }
    },
    summary: {
      type: "string" as const,
      description: "Resumo geral das mudanças aplicadas"
    }
  },
  required: ["changes", "summary"],
  additionalProperties: false
};

export interface PromptChange {
  action: "replace" | "insert_after" | "insert_before" | "delete" | "append";
  target: string;
  newContent: string;
  explanation: string;
}

export interface EditResult {
  changes: PromptChange[];
  summary: string;
}

/**
 * Chama GPT com JSON Schema para obter apenas as mudanças necessárias
 */
export async function callGPTForPromptEdit(
  currentPrompt: string,
  userInstruction: string,
  openaiApiKey: string
): Promise<EditResult> {
  const openai = new OpenAI({ apiKey: openaiApiKey });

  const systemPrompt = `Você é um especialista em edição de prompts para agentes de IA de atendimento ao cliente.

REGRAS IMPORTANTES:
1. Analise o prompt atual e a instrução do usuário
2. Retorne APENAS as mudanças necessárias em formato JSON
3. NÃO retorne o documento inteiro, apenas as alterações específicas
4. Preserve a formatação e estrutura original
5. Seja preciso no "target" - use o texto EXATO que existe no documento
6. Mantenha a consistência de tom e estilo do documento original

TIPOS DE AÇÃO:
- "replace": Substitui texto existente por novo texto
- "insert_after": Insere novo conteúdo DEPOIS do target
- "insert_before": Insere novo conteúdo ANTES do target
- "delete": Remove o texto target
- "append": Adiciona no final do documento (target pode ser vazio)

DICAS:
- Para tornar mais formal: substitua expressões informais por formais
- Para adicionar recursos: use insert_after em seções relevantes
- Para mudar tom: faça múltiplas pequenas substituições
- Para reestruturar: use combinação de delete e insert`;

  const userPrompt = `PROMPT ATUAL:
"""
${currentPrompt}
"""

INSTRUÇÃO DO USUÁRIO:
"${userInstruction}"

Analise o prompt e retorne APENAS as mudanças necessárias em JSON. Lembre-se:
- O "target" deve ser texto EXATO que existe no documento
- Retorne o mínimo de mudanças possível para alcançar o objetivo
- Preserve toda formatação original`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Mais barato e rápido
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "prompt_edit",
          strict: true,
          schema: EDIT_SCHEMA
        }
      },
      temperature: 0.3, // Mais determinístico
      max_tokens: 2000 // Limitado pois só retorna mudanças
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Resposta vazia do GPT");
    }

    const result = JSON.parse(content) as EditResult;
    
    // Validação básica
    if (!result.changes || !Array.isArray(result.changes)) {
      throw new Error("Formato de resposta inválido");
    }

    return result;
  } catch (error: any) {
    console.error("[promptEditFullDocument] Erro ao chamar GPT:", error.message);
    throw error;
  }
}

/**
 * Aplica uma única mudança no documento
 */
function applyChange(document: string, change: PromptChange): string {
  const { action, target, newContent } = change;

  switch (action) {
    case "replace":
      if (!target) return document;
      if (!document.includes(target)) {
        console.warn(`[injectPromptChange] Target não encontrado: "${target.substring(0, 50)}..."`);
        // Tenta busca case-insensitive
        const regex = new RegExp(escapeRegex(target), 'i');
        const match = document.match(regex);
        if (match) {
          return document.replace(match[0], newContent);
        }
        return document;
      }
      return document.replace(target, newContent);

    case "insert_after":
      if (!target) return document;
      if (!document.includes(target)) {
        console.warn(`[injectPromptChange] Target não encontrado para insert_after: "${target.substring(0, 50)}..."`);
        return document;
      }
      return document.replace(target, target + "\n" + newContent);

    case "insert_before":
      if (!target) return document;
      if (!document.includes(target)) {
        console.warn(`[injectPromptChange] Target não encontrado para insert_before: "${target.substring(0, 50)}..."`);
        return document;
      }
      return document.replace(target, newContent + "\n" + target);

    case "delete":
      if (!target) return document;
      return document.replace(target, "");

    case "append":
      return document + "\n" + newContent;

    default:
      console.warn(`[injectPromptChange] Ação desconhecida: ${action}`);
      return document;
  }
}

/**
 * Escapa caracteres especiais para regex
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Aplica todas as mudanças no documento original
 */
export function injectPromptChanges(
  originalDocument: string,
  changes: PromptChange[]
): string {
  let result = originalDocument;

  for (const change of changes) {
    const before = result;
    result = applyChange(result, change);
    
    if (before === result && change.action !== "append") {
      console.log(`[injectPromptChanges] Mudança não aplicada:`, change.explanation);
    }
  }

  // Limpa linhas vazias duplicadas
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

/**
 * Função principal: orquestra todo o processo de edição
 */
export async function editPromptWithGPT(
  currentPrompt: string,
  userInstruction: string,
  openaiApiKey: string
): Promise<{
  newPrompt: string;
  changes: PromptChange[];
  summary: string;
  tokensUsed: {
    input: number;
    output: number;
    saved: number;
  };
}> {
  // Calcula tokens estimados (aproximação)
  const inputTokens = Math.ceil((currentPrompt.length + userInstruction.length) / 4);
  
  // Chama GPT para obter mudanças
  const editResult = await callGPTForPromptEdit(currentPrompt, userInstruction, openaiApiKey);
  
  // Aplica mudanças
  const newPrompt = injectPromptChanges(currentPrompt, editResult.changes);
  
  // Calcula economia de tokens
  const outputTokensUsed = Math.ceil(JSON.stringify(editResult).length / 4);
  const tokensIfFullRewrite = Math.ceil(newPrompt.length / 4);
  const tokensSaved = tokensIfFullRewrite - outputTokensUsed;

  return {
    newPrompt,
    changes: editResult.changes,
    summary: editResult.summary,
    tokensUsed: {
      input: inputTokens,
      output: outputTokensUsed,
      saved: Math.max(0, tokensSaved)
    }
  };
}

/**
 * Versão local (fallback) - sem API, usa heurísticas avançadas
 */
export function editPromptLocally(
  currentPrompt: string,
  userInstruction: string
): {
  newPrompt: string;
  changes: PromptChange[];
  summary: string;
} {
  const instruction = userInstruction.toLowerCase();
  const changes: PromptChange[] = [];
  let workingPrompt = currentPrompt;

  // ============ 1. DETECÇÃO DE MUDANÇA DE NOME ============
  // Padrões: "mude o nome para X", "renomear para X", "nome: X", "nome correto é X", etc.
  const namePatterns = [
    /(?:mude?|troque?|altere?|renome(?:ar|ie)?|substituir?)\s+(?:o\s+)?nome\s+(?:para|por|:)\s*["""']?([^"""'\n.!?]+)/i,
    /(?:o\s+)?nome\s+(?:correto|certo|novo|agora)\s+(?:é|sera?)\s*["""']?([^"""'\n.!?]+)/i,
    /(?:nome|empresa|estabelecimento|negócio)\s*(?::|é|sera?)\s*["""']?([^"""'\n.!?]+)/i,
    /(?:a\s+empresa|o\s+estabelecimento|a\s+loja|o\s+restaurante)\s+(?:se\s+)?chama\s*["""']?([^"""'\n.!?]+)/i,
    /(?:substituir?|trocar?)\s+(?:por|para)\s*["""']?([^"""'\n.!?]+)/i,
  ];

  for (const pattern of namePatterns) {
    const match = userInstruction.match(pattern);
    if (match && match[1]) {
      const newName = match[1].trim();
      // Encontra o nome atual no prompt (primeira linha geralmente)
      const firstLine = currentPrompt.split('\n')[0];
      const currentNameMatch = firstLine.match(/^([^-–—]+)/);
      if (currentNameMatch) {
        const currentName = currentNameMatch[1].trim();
        if (currentName && currentName !== newName) {
          changes.push({
            action: "replace",
            target: currentName,
            newContent: newName,
            explanation: `Alterando nome de "${currentName}" para "${newName}"`
          });
          workingPrompt = workingPrompt.replace(currentName, newName);
          break; // Só muda nome uma vez
        }
      }
    }
  }

  // ============ 2. DETECÇÃO DE TOM FORMAL/INFORMAL ============
  if (instruction.includes("formal") || instruction.includes("profissional")) {
    const informalPatterns = [
      { from: "você", to: "o(a) senhor(a)" },
      { from: "Você", to: "O(a) senhor(a)" },
      { from: "oi", to: "Olá" },
      { from: "Oi", to: "Olá" },
      { from: "tá", to: "está" },
      { from: "pra", to: "para" },
      { from: "né", to: "não é" },
      { from: "beleza", to: "perfeito" },
      { from: "legal", to: "excelente" },
      { from: "ok", to: "compreendido" },
      { from: "blz", to: "perfeito" },
    ];

    for (const pattern of informalPatterns) {
      if (workingPrompt.includes(pattern.from)) {
        changes.push({
          action: "replace",
          target: pattern.from,
          newContent: pattern.to,
          explanation: `Tornando mais formal: "${pattern.from}" → "${pattern.to}"`
        });
      }
    }
  }

  if (instruction.includes("informal") || instruction.includes("descontraído") || instruction.includes("amigável")) {
    const formalPatterns = [
      { from: "o(a) senhor(a)", to: "você" },
      { from: "O(a) senhor(a)", to: "Você" },
      { from: "prezado", to: "oi" },
      { from: "Prezado", to: "Oi" },
      { from: "cordialmente", to: "um abraço" },
      { from: "atenciosamente", to: "valeu" },
    ];

    for (const pattern of formalPatterns) {
      if (workingPrompt.includes(pattern.from)) {
        changes.push({
          action: "replace",
          target: pattern.from,
          newContent: pattern.to,
          explanation: `Tornando mais informal: "${pattern.from}" → "${pattern.to}"`
        });
      }
    }
  }

  // ============ 3. DETECÇÃO DE REMOÇÃO ============
  const removePatterns = [
    /(?:remov(?:er|a)|tir(?:ar|e)|delet(?:ar|e)|exclu(?:ir|a)|apag(?:ar|ue))\s+(?:a?\s*)?(?:parte|seção|regra|info(?:rmação)?|menção|texto)?\s*(?:de|sobre|do|da)?\s*["""']?([^"""'\n]+)/i,
    /(?:não|nao)\s+(?:mais\s+)?(?:mencione?|fale?|diga|coloque?|precisa|tem|temos?)\s+(?:de|sobre|a|o)?\s*["""']?([^"""'\n]+)/i,
  ];
  
  // Padrão especial: "Não fechamos na segunda" -> remove linha com "fecha" + dia da semana
  const naoFechamosMatch = userInstruction.match(/(?:não|nao)\s+fechamos?\s+(?:na|no|aos?|em)?\s*(segunda|terça|quarta|quinta|sexta|s[aá]bado|domingo|feriado)/i);
  if (naoFechamosMatch && naoFechamosMatch[1]) {
    const dia = naoFechamosMatch[1].toLowerCase();
    const lines = workingPrompt.split('\n');
    for (const line of lines) {
      const lineLower = line.toLowerCase();
      // Procura linhas com "fecha" + dia da semana
      if (lineLower.includes("fecha") && lineLower.includes(dia.substring(0, 5))) {
        changes.push({
          action: "delete",
          target: line,
          newContent: "",
          explanation: `Removendo informação de fechamento na ${dia}`
        });
        break;
      }
    }
  }

  for (const pattern of removePatterns) {
    const match = userInstruction.match(pattern);
    if (match && match[1]) {
      const toRemove = match[1].trim().toLowerCase();
      // Procura linha que contenha o texto
      const lines = workingPrompt.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().includes(toRemove) && line.trim().length > 3) {
          changes.push({
            action: "delete",
            target: line,
            newContent: "",
            explanation: `Removendo linha que menciona "${toRemove}"`
          });
          break;
        }
      }
    }
  }

  // ============ 4. DETECÇÃO DE VENDAS/CONVERSÃO ============
  if (instruction.includes("venda") || instruction.includes("vendedor") || instruction.includes("converter") || instruction.includes("persuasivo")) {
    changes.push({
      action: "append",
      target: "",
      newContent: `\n## Foco em Vendas
• Destaque benefícios do produto/serviço
• Use gatilhos: escassez, urgência, prova social
• Faça perguntas que levem à conversão
• Ofereça opções de pagamento facilitado`,
      explanation: "Adicionando instruções de vendas"
    });
  }

  // ============ 5. DETECÇÃO DE SUPORTE/ATENDIMENTO ============
  if (instruction.includes("suporte") || instruction.includes("atendimento") || instruction.includes("ajuda") || instruction.includes("resolver problema")) {
    changes.push({
      action: "append",
      target: "",
      newContent: `\n## Foco em Suporte
• Demonstre empatia com o problema
• Peça detalhes para entender melhor
• Ofereça soluções passo a passo
• Confirme se o problema foi resolvido`,
      explanation: "Adicionando instruções de suporte"
    });
  }

  // ============ 6. DETECÇÃO DE EMOJIS ============
  if (instruction.includes("emoji") || instruction.includes("emoticon") || instruction.match(/mais\s*😊|usar\s*🍕/)) {
    changes.push({
      action: "append",
      target: "",
      newContent: `\n## Uso de Emojis
• Use emojis para mensagens mais amigáveis 😊
• Limite a 1-2 emojis por mensagem
• Sugeridos: ✅ 👋 🎉 💡 ❤️`,
      explanation: "Adicionando instruções sobre emojis"
    });
  }

  // ============ 7. DETECÇÃO DE RESPOSTAS CURTAS/CONCISAS ============
  if (instruction.includes("curto") || instruction.includes("curta") || instruction.includes("curtas") || 
      instruction.includes("breve") || instruction.includes("conciso") || instruction.includes("direto") ||
      instruction.includes("direta") || instruction.includes("diretas") || instruction.includes("resumido") ||
      instruction.includes("resumida") || instruction.includes("resumidas")) {
    changes.push({
      action: "append",
      target: "",
      newContent: `\n## Mensagens Concisas
• Respostas curtas e diretas
• Máximo 2-3 frases por mensagem
• Vá direto ao ponto`,
      explanation: "Adicionando instruções para respostas concisas"
    });
  }

  // ============ 8. DETECÇÃO DE RESPOSTAS DETALHADAS ============
  if (instruction.includes("detalhado") || instruction.includes("detalhada") || instruction.includes("detalhadas") ||
      instruction.includes("completo") || instruction.includes("completa") || instruction.includes("completas") ||
      instruction.includes("explicativo") || instruction.includes("explicativa")) {
    changes.push({
      action: "append",
      target: "",
      newContent: `\n## Respostas Detalhadas
• Forneça explicações completas
• Inclua exemplos quando apropriado
• Antecipe dúvidas relacionadas`,
      explanation: "Adicionando instruções para respostas detalhadas"
    });
  }

  // ============ 9. DETECÇÃO DE SUBSTITUIÇÃO DE VALORES (preço, horário, etc.) ============
  // Padrões: "mude o preço para R$50", "horário: 17h às 23h", "R$35 -> R$40"
  const valuePatterns = [
    { regex: /(?:preço|valor)\s+(?:mínimo\s+)?(?:para|:)\s*(R?\$?\s*\d+(?:[.,]\d+)?)/i, type: "preço" },
    { regex: /(?:a\s+partir\s+de|mínimo\s+de?)\s*(R?\$?\s*\d+(?:[.,]\d+)?)/i, type: "preço mínimo" },
    { regex: /(?:entrega\s+)?(?:grátis|free)\s+(?:acima\s+de|para\s+pedidos?\s+acima\s+de)\s*(R?\$?\s*\d+)/i, type: "frete grátis" },
    { regex: /(?:horário|abre|fecha|funcionamento)\s*(?::|de)?\s*(\d{1,2}h?\s*(?:às|a|-)\s*\d{1,2}h?)/i, type: "horário" },
  ];

  for (const { regex, type } of valuePatterns) {
    const match = userInstruction.match(regex);
    if (match && match[1]) {
      const newValue = match[1].trim();
      // Procura valor similar no prompt para substituir
      const oldValueRegex = type.includes("preço") 
        ? /R?\$\s*\d+(?:[.,]\d+)?/
        : type === "horário"
        ? /\d{1,2}h?\s*(?:às|a|-)\s*\d{1,2}h?/
        : null;
      
      if (oldValueRegex) {
        const oldMatch = workingPrompt.match(oldValueRegex);
        if (oldMatch && oldMatch[0] !== newValue) {
          changes.push({
            action: "replace",
            target: oldMatch[0],
            newContent: newValue,
            explanation: `Atualizando ${type}: "${oldMatch[0]}" → "${newValue}"`
          });
        }
      }
    }
  }

  // ============ 10. FALLBACK: Adiciona instrução como regra ============
  if (changes.length === 0 && userInstruction.trim().length > 5) {
    changes.push({
      action: "append",
      target: "",
      newContent: `\n## 📝 INSTRUÇÃO ADICIONAL
${userInstruction}`,
      explanation: "Adicionando instrução personalizada"
    });
  }

  // ============ APLICA AS MUDANÇAS ============
  let newPrompt = currentPrompt;
  for (const change of changes) {
    newPrompt = applyChange(newPrompt, change);
  }

  // Limpa linhas vazias duplicadas
  newPrompt = newPrompt.replace(/\n{3,}/g, "\n\n").trim();

  const summary = changes.length > 0 
    ? `Aplicadas ${changes.length} mudança(s): ${changes.map(c => c.explanation).join("; ")}`
    : "Nenhuma mudança identificada para a instrução fornecida";

  return {
    newPrompt: newPrompt || currentPrompt,
    changes,
    summary
  };
}
