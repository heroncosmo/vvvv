/**
 * =============================================================================
 * PROMPT EDIT ENGINE - Técnica Avançada de Edição de Documentos
 * =============================================================================
 * 
 * Baseado nas melhores práticas do Aider e pesquisas sobre edição com LLMs:
 * 
 * Técnicas implementadas:
 * 1. SEARCH/REPLACE - Encontra texto existente e substitui (como git diff)
 * 2. Busca Fuzzy - Tolera pequenas diferenças no texto
 * 3. Edição Semântica - Entende a intenção e encontra o conteúdo certo
 * 4. Análise de Seções - Divide documento em partes lógicas
 * 5. High-Level Diffs - Edita blocos completos, não linhas isoladas
 * 
 * Fonte: https://aider.chat/docs/unified-diffs.html
 */

import OpenAI from "openai";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface EditOperation {
  type: "replace" | "insert" | "delete" | "modify_section";
  search?: string;           // Texto a encontrar (para replace/delete)
  replace?: string;          // Novo texto (para replace/insert)
  section?: string;          // Nome da seção (para modify_section)
  position?: "before" | "after" | "start" | "end"; // Posição para insert
  anchor?: string;           // Texto âncora para insert
  explanation: string;       // Explicação da mudança
}

export interface EditResult {
  success: boolean;
  newPrompt: string;
  operations: EditOperation[];
  summary: string;
  feedbackMessage: string;   // Mensagem para mostrar no chat
}

export interface DocumentSection {
  name: string;
  content: string;
  startIndex: number;
  endIndex: number;
}

// ============================================================================
// ANÁLISE DE DOCUMENTO
// ============================================================================

/**
 * Divide o documento em seções lógicas baseado em headers markdown
 */
function parseDocumentSections(doc: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const lines = doc.split('\n');
  
  let currentSection: DocumentSection | null = null;
  let lineStart = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeader = /^#{1,4}\s+/.test(line) || /^[•\-\*]\s+\*\*/.test(line);
    
    if (isHeader) {
      // Salva seção anterior
      if (currentSection) {
        currentSection.endIndex = lineStart - 1;
        sections.push(currentSection);
      }
      
      // Inicia nova seção
      currentSection = {
        name: line.replace(/^[#•\-\*\s]+\*?\*?/, '').replace(/\*?\*?$/, '').trim(),
        content: line,
        startIndex: lineStart,
        endIndex: doc.length
      };
    } else if (currentSection) {
      currentSection.content += '\n' + line;
    }
    
    lineStart += line.length + 1;
  }
  
  // Adiciona última seção
  if (currentSection) {
    currentSection.endIndex = doc.length;
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * Encontra a seção mais relevante para uma edição
 */
function findRelevantSection(doc: string, keywords: string[]): DocumentSection | null {
  const sections = parseDocumentSections(doc);
  
  for (const section of sections) {
    const sectionLower = section.name.toLowerCase() + ' ' + section.content.toLowerCase();
    const matchCount = keywords.filter(kw => sectionLower.includes(kw.toLowerCase())).length;
    if (matchCount >= 2 || (keywords.length === 1 && matchCount === 1)) {
      return section;
    }
  }
  
  return null;
}

// ============================================================================
// BUSCA FUZZY
// ============================================================================

/**
 * Calcula similaridade entre duas strings (0-1)
 */
function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Levenshtein simplificado para performance
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1;
  
  // Busca por substring
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  // Contagem de palavras em comum (Tokenização melhorada para código)
  // Divide por qualquer caractere que não seja letra/número para pegar tokens reais
  const tokens1 = s1.split(/[^a-z0-9]+/g).filter(t => t.length > 0);
  const tokens2 = s2.split(/[^a-z0-9]+/g).filter(t => t.length > 0);
  
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  
  let common = 0;
  set1.forEach(w => { if (set2.has(w)) common++; });
  
  // Se não tem tokens (só símbolos), volta para split por espaço
  if (set1.size === 0 && set2.size === 0) {
     const w1 = new Set(s1.split(/\s+/));
     const w2 = new Set(s2.split(/\s+/));
     let c = 0;
     w1.forEach(w => { if (w2.has(w)) c++; });
     return c / Math.max(w1.size, w2.size);
  }
  
  return common / Math.max(set1.size, set2.size);
}

/**
 * Encontra texto similar no documento (busca fuzzy)
 */
function fuzzyFind(doc: string, search: string, threshold = 0.6): { found: string; index: number; similarity: number } | null {
  // Primeiro tenta match exato
  const exactIndex = doc.indexOf(search);
  if (exactIndex !== -1) {
    return { found: search, index: exactIndex, similarity: 1 };
  }
  
  // Busca case-insensitive
  const lowerDoc = doc.toLowerCase();
  const lowerSearch = search.toLowerCase();
  const caseInsensitiveIndex = lowerDoc.indexOf(lowerSearch);
  if (caseInsensitiveIndex !== -1) {
    return { 
      found: doc.substring(caseInsensitiveIndex, caseInsensitiveIndex + search.length), 
      index: caseInsensitiveIndex, 
      similarity: 0.95 
    };
  }
  
  // Busca por linhas similares
  const docLines = doc.split('\n');
  const searchLines = search.split('\n');
  
  if (searchLines.length === 1) {
    // Busca linha única
    let bestMatch = { found: '', index: -1, similarity: 0 };
    let currentIndex = 0;
    
    for (const line of docLines) {
      const sim = stringSimilarity(line, search);
      if (sim > bestMatch.similarity && sim >= threshold) {
        bestMatch = { found: line, index: currentIndex, similarity: sim };
      }
      currentIndex += line.length + 1;
    }
    
    return bestMatch.index !== -1 ? bestMatch : null;
  }
  
  // Busca bloco de múltiplas linhas
  for (let i = 0; i <= docLines.length - searchLines.length; i++) {
    const block = docLines.slice(i, i + searchLines.length).join('\n');
    const sim = stringSimilarity(block, search);
    
    if (sim >= threshold) {
      const index = doc.indexOf(docLines[i]);
      return { found: block, index, similarity: sim };
    }
  }
  
  return null;
}

// ============================================================================
// MOTOR DE EDIÇÃO PRINCIPAL
// ============================================================================

/**
 * Aplica uma operação de SEARCH/REPLACE
 * @param replaceAll - Se true, substitui TODAS as ocorrências
 */
function applySearchReplace(doc: string, search: string, replace: string, replaceAll = false): { success: boolean; result: string; message: string } {
  // Match exato
  if (doc.includes(search)) {
    return {
      success: true,
      result: replaceAll ? doc.split(search).join(replace) : doc.replace(search, replace),
      message: replaceAll ? `Substituídas todas as ocorrências` : `Substituído com sucesso`
    };
  }
  
  // Busca fuzzy
  const fuzzyResult = fuzzyFind(doc, search, 0.7);
  if (fuzzyResult) {
    let result = doc.substring(0, fuzzyResult.index) + 
                 replace + 
                 doc.substring(fuzzyResult.index + fuzzyResult.found.length);
    
    // Se replaceAll, continua substituindo
    if (replaceAll) {
      while (result.includes(fuzzyResult.found)) {
        result = result.replace(fuzzyResult.found, replace);
      }
    }
    
    return {
      success: true,
      result,
      message: `Encontrado texto similar (${Math.round(fuzzyResult.similarity * 100)}% match) e substituído`
    };
  }
  
  return {
    success: false,
    result: doc,
    message: `Não encontrei "${search.substring(0, 50)}..." no documento`
  };
}

/**
 * Aplica uma operação de inserção
 */
function applyInsert(doc: string, content: string, position: string, anchor?: string): { success: boolean; result: string; message: string } {
  if (position === "start") {
    return { success: true, result: content + '\n' + doc, message: "Inserido no início" };
  }
  
  if (position === "end") {
    return { success: true, result: doc + '\n' + content, message: "Inserido no final" };
  }
  
  if (!anchor) {
    return { success: false, result: doc, message: "Âncora necessária para inserção before/after" };
  }
  
  const fuzzyResult = fuzzyFind(doc, anchor, 0.7);
  if (!fuzzyResult) {
    // Fallback: adiciona no final
    return { 
      success: true, 
      result: doc + '\n' + content, 
      message: `Não encontrei "${anchor.substring(0, 30)}...", adicionado no final` 
    };
  }
  
  if (position === "before") {
    const result = doc.substring(0, fuzzyResult.index) + 
                   content + '\n' + 
                   doc.substring(fuzzyResult.index);
    return { success: true, result, message: "Inserido antes do ponto encontrado" };
  }
  
  if (position === "after") {
    const endPos = fuzzyResult.index + fuzzyResult.found.length;
    const result = doc.substring(0, endPos) + 
                   '\n' + content + 
                   doc.substring(endPos);
    return { success: true, result, message: "Inserido depois do ponto encontrado" };
  }
  
  return { success: false, result: doc, message: "Posição inválida" };
}

/**
 * Aplica uma operação de deleção
 */
function applyDelete(doc: string, search: string): { success: boolean; result: string; message: string } {
  const fuzzyResult = fuzzyFind(doc, search, 0.7);
  
  if (fuzzyResult) {
    let result = doc.substring(0, fuzzyResult.index) + doc.substring(fuzzyResult.index + fuzzyResult.found.length);
    // Limpa linhas vazias duplicadas
    result = result.replace(/\n{3,}/g, '\n\n');
    return { success: true, result, message: "Removido com sucesso" };
  }
  
  return { success: false, result: doc, message: `Não encontrei para remover: "${search.substring(0, 50)}..."` };
}

// ============================================================================
// DETECÇÃO DE INTENÇÃO AVANÇADA
// ============================================================================

interface ParsedIntent {
  action: "change" | "add" | "remove" | "describe";
  target: string;       // O que mudar/adicionar/remover
  newValue?: string;    // Novo valor (para change)
  keywords: string[];   // Palavras-chave para busca
  confidence: number;   // 0-1 confiança na detecção
}

/**
 * Analisa a instrução do usuário para entender a intenção
 */
function parseUserIntent(instruction: string): ParsedIntent {
  const instr = instruction.toLowerCase().trim();
  
  // ============ PADRÕES DE MUDANÇA (CHANGE) ============
  
  // "mude X para Y", "altere X para Y", "troque X por Y"
  const changePatterns = [
    // Padrão específico para nome com "da/do" opcional: "mude o nome da pizzaria para X"
    /(?:mude?|altere?|troque?|substitua?|modifique?)\s+(?:o\s+)?nome\s+(?:d[aoe]s?\s+\w+\s+)?(?:para|por|:)\s*(.+)/i,
    // Padrão genérico
    /(?:mude?|altere?|troque?|substitua?|modifique?)\s+(?:o|a|os|as)?\s*(.+?)\s+(?:para|por|:)\s*(.+)/i,
    /(?:o|a)\s+(.+?)\s+(?:agora\s+)?(?:é|será?|deve\s+ser)\s+(.+)/i,
    /(.+?)\s*(?:->|→|=>)\s*(.+)/i,
    /(?:nome|preço|valor|horário|telefone|endereço)\s*(?:novo|:)\s*(.+)/i,
    // Padrão para "a empresa/loja chama X"
    /(?:a?\s*empresa|o?\s*estabelecimento|a?\s*loja|o?\s*restaurante)\s+(?:se\s+)?chama\s+(.+)/i,
    // Padrão para "X aumentou/diminuiu/mudou para Y"
    /(.+?)\s+(?:aumentou|diminuiu|mudou|passou)\s+para\s+(.+)/i,
  ];
  
  for (const pattern of changePatterns) {
    const match = instruction.match(pattern);
    if (match) {
      const target = match[1]?.trim() || '';
      const newValue = match[2]?.trim() || match[1]?.trim();
      return {
        action: "change",
        target,
        newValue,
        keywords: extractKeywords(target + ' ' + newValue),
        confidence: 0.9
      };
    }
  }
  
  // ============ PADRÕES DE REMOÇÃO (REMOVE) ============
  
  const removePatterns = [
    // Padrão para "remova isso/aquilo" (contexto anterior) - tenta pegar o que vem antes
    /(.+?)[,.]\s*(?:remova?|tire?|delete?|exclua?|apague?)\s+(?:isso|aquilo|ele|ela)/i,
    // Padrões normais
    /(?:remova?|tire?|delete?|exclua?|apague?)\s+(?:a\s+)?(?:parte|seção|menção|info(?:rmação)?|texto)?\s*(?:de|sobre|do|da)?\s*(.+)/i,
    /(?:não|nao)\s+(?:mais\s+)?(?:mencione?|fale?|diga|tenha|precisa|quero)\s+(?:sobre|de|a|o)?\s*(.+)/i,
    /(?:sem|tire?)\s+(.+)/i,
  ];
  
  for (const pattern of removePatterns) {
    const match = instruction.match(pattern);
    if (match) {
      return {
        action: "remove",
        target: match[1]?.trim() || '',
        keywords: extractKeywords(match[1] || ''),
        confidence: 0.85
      };
    }
  }
  
  // ============ FALLBACK: DESCRIÇÃO/INSTRUÇÃO GERAL ============
  return {
    action: "describe",
    target: instruction,
    keywords: extractKeywords(instruction),
    confidence: 0.5
  };
}

/**
 * Extrai palavras-chave relevantes de um texto
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'para', 'por', 'com', 'em', 'no', 'na', 'que', 'e', 'é', 'ser', 'ter', 'mais', 'muito', 'seu', 'sua']);
  return text.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 10);
}

// ============================================================================
// EDIÇÃO LOCAL AVANÇADA (SEM API)
// ============================================================================

/**
 * Edita o prompt localmente usando heurísticas avançadas
 * Esta função substitui a versão anterior que só adicionava no final
 */
export function editPromptAdvanced(
  currentPrompt: string,
  userInstruction: string
): EditResult {
  const operations: EditOperation[] = [];
  let workingDoc = currentPrompt;
  const feedbackParts: string[] = [];
  
  // Analisa intenção do usuário
  const intent = parseUserIntent(userInstruction);
  
  console.log(`[EditEngine] Intenção detectada: ${intent.action}, target: "${intent.target}", confidence: ${intent.confidence}`);
  
  // ============ PROCESSAMENTO POR TIPO DE AÇÃO ============
  
  switch (intent.action) {
    case "change": {
      // Tenta encontrar e substituir
      const changeResult = processChange(workingDoc, intent, userInstruction);
      if (changeResult.success) {
        workingDoc = changeResult.newDoc;
        operations.push(...changeResult.operations);
        feedbackParts.push(changeResult.feedback);
      } else {
        feedbackParts.push(`⚠️ ${changeResult.feedback}`);
      }
      break;
    }
    
    case "add": {
      // Adiciona novo conteúdo
      const addResult = processAdd(workingDoc, intent, userInstruction);
      workingDoc = addResult.newDoc;
      operations.push(...addResult.operations);
      feedbackParts.push(addResult.feedback);
      break;
    }
    
    case "remove": {
      // Remove conteúdo
      const removeResult = processRemove(workingDoc, intent);
      if (removeResult.success) {
        workingDoc = removeResult.newDoc;
        operations.push(...removeResult.operations);
        feedbackParts.push(removeResult.feedback);
      } else {
        feedbackParts.push(`⚠️ ${removeResult.feedback}`);
      }
      break;
    }
    
    case "describe":
    default: {
      // Instrução geral - adiciona como nova seção
      const descResult = processDescribe(workingDoc, intent, userInstruction);
      workingDoc = descResult.newDoc;
      operations.push(...descResult.operations);
      feedbackParts.push(descResult.feedback);
      break;
    }
  }
  
  // Limpa formatação
  workingDoc = workingDoc.replace(/\n{3,}/g, '\n\n').trim();
  
  const success = operations.length > 0 && workingDoc !== currentPrompt;
  const summary = operations.map(op => op.explanation).join('; ');
  
  return {
    success,
    newPrompt: success ? workingDoc : currentPrompt,
    operations,
    summary: summary || "Nenhuma alteração necessária",
    feedbackMessage: feedbackParts.join('\n') || "Pronto!"
  };
}

// ============================================================================
// PROCESSADORES ESPECÍFICOS
// ============================================================================

function processChange(doc: string, intent: ParsedIntent, rawInstruction: string): { success: boolean; newDoc: string; operations: EditOperation[]; feedback: string } {
  const operations: EditOperation[] = [];
  let newDoc = doc;
  
  // ============ 1. MUDANÇA DE NOME ============
  const namePatterns = [
    // Padrão mais flexível para "nome da X para Y" - permite apóstrofos
    /(?:mude?|troque?|altere?)\s+(?:o\s+)?nome\s+(?:d[aoe]s?\s+\w+\s+)?(?:para|por|:)\s*["""']?([^"""\n.!?]+)/i,
    /(?:nome|empresa|estabelecimento|loja|restaurante)\s*(?:para|:|\s+é)\s*["""']?([^"""\n.!?]+)/i,
    /(?:chama(?:r)?|renomea?r?)\s+(?:para|:)\s*["""']?([^"""\n.!?]+)/i,
    /(?:a?\s*empresa|o?\s*estabelecimento)\s+(?:se\s+)?chama\s*["""']?([^"""\n.!?]+)/i,
    /(?:o?\s*nome\s+)?agora\s+(?:é|sera?)\s*["""']?([^"""\n.!?]+)/i,
  ];
  
  for (const pattern of namePatterns) {
    const match = rawInstruction.match(pattern);
    if (match && match[1]) {
      const newName = match[1].trim();
      
      // Encontra nome atual (primeira linha, antes de traço)
      const firstLine = doc.split('\n')[0];
      const currentNameMatch = firstLine.match(/^([^-–—\n]+)/);
      
      if (currentNameMatch && currentNameMatch[1].trim()) {
        const currentName = currentNameMatch[1].trim();
        
        if (currentName !== newName && currentName.length > 2) {
          // Usa replaceAll=true para substituir TODAS as ocorrências do nome
          const result = applySearchReplace(newDoc, currentName, newName, true);
          if (result.success) {
            newDoc = result.result;
            operations.push({
              type: "replace",
              search: currentName,
              replace: newName,
              explanation: `Nome alterado de "${currentName}" para "${newName}" (todas as ocorrências)`
            });
            return { 
              success: true, 
              newDoc, 
              operations, 
              feedback: `✅ Nome alterado: **${currentName}** → **${newName}**` 
            };
          }
        }
      }
    }
  }
  
  // ============ 1.5. SUBSTITUIÇÃO DIRETA (X -> Y ou X para Y) ============
  const directReplacePatterns = [
    /(?:mude?|troque?|substituir?)\s+["""']?([^"""'\n]+?)["""']?\s+(?:para|por|->|→)\s*["""']?([^"""'\n]+)/i,
    /["""']?([^"""'\n]+?)["""']?\s*(?:->|→|=>)\s*["""']?([^"""'\n]+)/i,
  ];
  
  for (const pattern of directReplacePatterns) {
    const match = rawInstruction.match(pattern);
    if (match && match[1] && match[2]) {
      const oldText = match[1].trim();
      const newText = match[2].trim();
      
      if (doc.includes(oldText) || fuzzyFind(doc, oldText, 0.7)) {
        const result = applySearchReplace(newDoc, oldText, newText, true);
        if (result.success) {
          newDoc = result.result;
          operations.push({
            type: "replace",
            search: oldText,
            replace: newText,
            explanation: `Substituído: "${oldText}" → "${newText}"`
          });
          return { 
            success: true, 
            newDoc, 
            operations, 
            feedback: `✅ Substituído: **${oldText}** → **${newText}**` 
          };
        }
      }
    }
  }
  
  // ============ 1.6. SUBSTITUIÇÃO DE EMOJI ============
  const emojiPattern = /(?:mude?|troque?|substituir?)\s+(?:o\s+)?emoji\s*(?:de\s+\w+\s*)?(?:para|por|:|-|→)\s*(.+)/i;
  const emojiMatch = rawInstruction.match(emojiPattern);
  if (emojiMatch && emojiMatch[1]) {
    const newEmoji = emojiMatch[1].trim();
    // Encontra emojis no documento (regex para emojis unicode)
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]+/gu;
    const existingEmojis = doc.match(emojiRegex);
    
    if (existingEmojis && existingEmojis.length > 0) {
      // Substitui o primeiro emoji encontrado
      const oldEmoji = existingEmojis[0];
      newDoc = newDoc.replace(oldEmoji, newEmoji);
      operations.push({
        type: "replace",
        search: oldEmoji,
        replace: newEmoji,
        explanation: `Emoji alterado: "${oldEmoji}" → "${newEmoji}"`
      });
      return { 
        success: true, 
        newDoc, 
        operations, 
        feedback: `✅ Emoji alterado: **${oldEmoji}** → **${newEmoji}**` 
      };
    }
  }
  
  // ============ 2. MUDANÇA DE VALORES (preço, horário, etc) ============
  
  // 2.1 Mudança Contextual (Item + Valor)
  // Ex: "Pizza Margherita aumentou para R$ 55"
  const contextualValuePattern = /(.+?)\s+(?:aumentou|diminuiu|mudou|passou|agora\s+é)\s+(?:para|por)?\s*(R?\$?\s*[\d.,]+|\d{1,2}h?|final\s+\d+)/i;
  const contextMatch = rawInstruction.match(contextualValuePattern);
  
  if (contextMatch && contextMatch[1] && contextMatch[2]) {
    let item = contextMatch[1].trim();
    const newValue = contextMatch[2].trim();
    
    // Remove artigos e preposições comuns do início do item para melhorar busca
    item = item.replace(/^(?:a|o|as|os|um|uma|uns|umas)\s+/i, "");
    
    // Tenta encontrar o item no documento
    let itemFuzzy = fuzzyFind(doc, item, 0.6);
    
    // Fallback para sinônimos comuns
    if (!itemFuzzy) {
      if (item.toLowerCase().includes("telefone") || item.toLowerCase().includes("celular")) {
        itemFuzzy = fuzzyFind(doc, "whatsapp", 0.6) || fuzzyFind(doc, "contato", 0.6);
      }
    }
    
    if (itemFuzzy) {
      // Encontrou o item. Agora procura um valor numérico/preço NA MESMA LINHA ou próximo
      const lineStart = doc.lastIndexOf('\n', itemFuzzy.index);
      const lineEnd = doc.indexOf('\n', itemFuzzy.index);
      const line = doc.substring(lineStart + 1, lineEnd !== -1 ? lineEnd : undefined);
      
      // Regex para encontrar preços, horários ou telefones na linha
      const valueRegex = /R?\$\s*[\d.,]+|\d{1,2}h|\(?\d{2}\)?[\s\-]?\d{4,5}[\s\-]?\d{4}/g;
      const valuesInLine = line.match(valueRegex);
      
      if (valuesInLine && valuesInLine.length > 0) {
        // Assume o último valor da linha como o alvo (comum em menus: "Item ... R$ XX")
        const oldValue = valuesInLine[valuesInLine.length - 1];
        
        // Substitui apenas nesta linha para evitar colisão
        const newLine = line.replace(oldValue, newValue);
        const result = applySearchReplace(newDoc, line, newLine);
        
        if (result.success) {
          newDoc = result.result;
          operations.push({
            type: "replace",
            search: oldValue,
            replace: newValue,
            explanation: `Valor de "${item}" atualizado: "${oldValue}" → "${newValue}"`
          });
          return { 
            success: true, 
            newDoc, 
            operations, 
            feedback: `✅ Valor de **${item}** atualizado: **${oldValue}** → **${newValue}**` 
          };
        }
      }
    }
  }

  const valuePatterns = [
    { regex: /preço\s*(?:mínimo\s*)?(?:para|de|:)\s*(R?\$?\s*[\d.,]+)/i, type: "preço", searchRegex: /R?\$\s*[\d.,]+/g },
    { regex: /(?:horário|funciona(?:mento)?)\s*(?:de|:)?\s*(\d{1,2}h?\s*(?:às|a|-)\s*\d{1,2}h?)/i, type: "horário", searchRegex: /\d{1,2}h?\s*(?:às|a|-)\s*\d{1,2}h?/g },
    // Telefone: exige pelo menos um dígito para não pegar string vazia
    { regex: /(?:telefone|whatsapp|contato)\s*(?::|para)?\s*([\d\s\(\)\-\+]*\d[\d\s\(\)\-\+]*)/i, type: "telefone", searchRegex: /\(?\d{2}\)?[\s\-]?\d{4,5}[\s\-]?\d{4}/g },
  ];
  
  for (const { regex, type, searchRegex } of valuePatterns) {
    const match = rawInstruction.match(regex);
    if (match && match[1]) {
      const newValue = match[1].trim();
      
      // Encontra valor antigo no documento
      const oldMatches = doc.match(searchRegex);
      if (oldMatches && oldMatches[0] !== newValue) {
        const oldValue = oldMatches[0];
        const result = applySearchReplace(newDoc, oldValue, newValue);
        if (result.success) {
          newDoc = result.result;
          operations.push({
            type: "replace",
            search: oldValue,
            replace: newValue,
            explanation: `${type} atualizado: "${oldValue}" → "${newValue}"`
          });
          return { 
            success: true, 
            newDoc, 
            operations, 
            feedback: `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} atualizado: **${oldValue}** → **${newValue}**` 
          };
        }
      }
    }
  }
  
  // ============ 3. MUDANÇA GENÉRICA COM BUSCA FUZZY ============
  if (intent.target && intent.newValue) {
    // Tenta encontrar target no documento
    const fuzzyResult = fuzzyFind(doc, intent.target, 0.6);
    
    if (fuzzyResult) {
      const result = applySearchReplace(newDoc, fuzzyResult.found, intent.newValue);
      if (result.success) {
        newDoc = result.result;
        operations.push({
          type: "replace",
          search: fuzzyResult.found,
          replace: intent.newValue,
          explanation: `Substituído: "${fuzzyResult.found.substring(0, 30)}..." → "${intent.newValue.substring(0, 30)}..."`
        });
        return { 
          success: true, 
          newDoc, 
          operations, 
          feedback: `✅ Encontrei e substituí o texto` 
        };
      }
    }
  }
  
  // ============ 4. MODIFICAÇÕES DE TOM ============
  // IMPORTANTE: Verifica "informal" primeiro para não matchear errado
  if (rawInstruction.match(/\binformal\b|descontraído|amigável/i)) {
    const replacements = [
      ["o(a) senhor(a)", "você"],
      ["O(a) senhor(a)", "Você"],
      ["O senhor", "Você"],
      ["o senhor", "você"],
      ["A senhora", "Você"],
      ["a senhora", "você"],
      ["prezado", "oi"],
      ["Prezado", "Oi"],
    ];
    
    let changed = false;
    for (const [from, to] of replacements) {
      if (newDoc.includes(from)) {
        newDoc = newDoc.split(from).join(to);
        changed = true;
        operations.push({
          type: "replace",
          search: from,
          replace: to,
          explanation: `Tom informal: "${from}" → "${to}"`
        });
      }
    }
    
    if (changed) {
      return { success: true, newDoc, operations, feedback: "✅ Tom alterado para mais informal" };
    }
  }
  
  if (rawInstruction.match(/(?<![in])\bformal\b|profissional/i)) {
    const replacements = [
      ["você", "o(a) senhor(a)"],
      ["Você", "O(a) senhor(a)"],
      ["oi", "Olá"],
      ["Oi", "Olá"],
      ["tá", "está"],
      ["pra", "para"],
      ["beleza", "perfeito"],
      ["blz", "perfeito"],
    ];
    
    let changed = false;
    for (const [from, to] of replacements) {
      if (newDoc.includes(from)) {
        newDoc = newDoc.split(from).join(to);
        changed = true;
        operations.push({
          type: "replace",
          search: from,
          replace: to,
          explanation: `Tom formal: "${from}" → "${to}"`
        });
      }
    }
    
    if (changed) {
      return { success: true, newDoc, operations, feedback: "✅ Tom alterado para mais formal" };
    }
  }
  
  return { 
    success: false, 
    newDoc: doc, 
    operations: [], 
    feedback: `Não consegui encontrar o que você quer mudar. Tente ser mais específico, ex: "mude o nome para X" ou "preço: R$50"` 
  };
}

function processAdd(doc: string, intent: ParsedIntent, rawInstruction: string): { newDoc: string; operations: EditOperation[]; feedback: string } {
  const operations: EditOperation[] = [];
  let newDoc = doc;
  const content = intent.target;
  
  // Determina onde inserir baseado nas keywords
  const section = findRelevantSection(doc, intent.keywords);
  
  if (section) {
    // Insere na seção relevante
    const result = applyInsert(newDoc, content, "after", section.name);
    newDoc = result.result;
    operations.push({
      type: "insert",
      replace: content,
      position: "after",
      anchor: section.name,
      explanation: `Adicionado na seção "${section.name}"`
    });
    return { newDoc, operations, feedback: `✅ Adicionado na seção **${section.name}**` };
  }
  
  // Sem seção específica, adiciona no final formatado
  const formattedContent = content.startsWith('#') || content.startsWith('•') 
    ? content 
    : `• ${content}`;
  
  newDoc = doc.trim() + '\n\n' + formattedContent;
  operations.push({
    type: "insert",
    replace: formattedContent,
    position: "end",
    explanation: `Adicionado ao final do prompt`
  });
  
  return { newDoc, operations, feedback: `✅ Informação adicionada ao prompt` };
}

function processRemove(doc: string, intent: ParsedIntent): { success: boolean; newDoc: string; operations: EditOperation[]; feedback: string } {
  const operations: EditOperation[] = [];
  let newDoc = doc;
  
  // Procura linha ou seção que contenha o target
  const lines = doc.split('\n');
  const targetLower = intent.target.toLowerCase();
  
  // 1. Busca exata ou parcial na linha
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes(targetLower) && line.trim().length > 3) {
      const result = applyDelete(newDoc, line);
      if (result.success) {
        newDoc = result.result;
        operations.push({
          type: "delete",
          search: line,
          explanation: `Removida linha: "${line.substring(0, 40)}..."`
        });
        return { 
          success: true, 
          newDoc, 
          operations, 
          feedback: `✅ Removido: "${line.substring(0, 50)}${line.length > 50 ? '...' : ''}"` 
        };
      }
    }
  }
  
  // 2. Busca por keywords (para casos como "remova isso" onde target é a frase anterior)
  if (intent.keywords && intent.keywords.length > 0) {
    // Tenta encontrar uma linha que contenha a maioria das keywords
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const matchCount = intent.keywords.filter(k => line.includes(k)).length;
      
      // Se tem pelo menos 2 keywords ou 1 keyword forte (se só tiver 1)
      // Relaxado para 50% de match se tiver mais de 2 keywords
      if ((intent.keywords.length > 2 && matchCount >= intent.keywords.length * 0.5) || 
          (intent.keywords.length === 2 && matchCount === 2) ||
          (intent.keywords.length === 1 && matchCount === 1 && line.includes(intent.keywords[0]))) {
        
        const originalLine = lines[i];
        const result = applyDelete(newDoc, originalLine);
        if (result.success) {
          newDoc = result.result;
          operations.push({
            type: "delete",
            search: originalLine,
            explanation: `Removida linha (por keywords): "${originalLine.substring(0, 40)}..."`
          });
          return { 
            success: true, 
            newDoc, 
            operations, 
            feedback: `✅ Removido: "${originalLine.substring(0, 50)}..."` 
          };
        }
      }
    }
  }
  
  // 3. Tenta busca fuzzy
  const fuzzyResult = fuzzyFind(doc, intent.target, 0.5);
  if (fuzzyResult) {
    const result = applyDelete(newDoc, fuzzyResult.found);
    if (result.success) {
      newDoc = result.result;
      operations.push({
        type: "delete",
        search: fuzzyResult.found,
        explanation: `Removido (match fuzzy): "${fuzzyResult.found.substring(0, 40)}..."`
      });
      return { 
        success: true, 
        newDoc, 
        operations, 
        feedback: `✅ Encontrei e removi o texto relacionado` 
      };
    }
  }
  
  return { 
    success: false, 
    newDoc: doc, 
    operations: [], 
    feedback: `Não encontrei "${intent.target}" para remover` 
  };
}

function processDescribe(doc: string, intent: ParsedIntent, rawInstruction: string): { newDoc: string; operations: EditOperation[]; feedback: string } {
  const operations: EditOperation[] = [];
  let newDoc = doc;
  
  // ============ PRIMEIRO: Tenta detectar modificações de tom ============
  // IMPORTANTE: Verificar "informal" PRIMEIRO para não conflitar com "formal"
  if (rawInstruction.match(/\binformal\b|descontraído|amigável|casual/i)) {
    const replacements = [
      // Primeiro as expressões mais longas (ordem importa!)
      ["O(a) senhor(a)", "Você"],
      ["o(a) senhor(a)", "você"],
      ["Prezado cliente", "Oi"],
      ["prezado cliente", "oi"],
      // Senhor/Senhora - várias formas
      ["O senhor", "Você"],
      ["o senhor", "você"],
      ["A senhora", "Você"],
      ["a senhora", "você"],
      // Expressões formais
      ["Prezado", "Oi"],
      ["prezado", "oi"],
      ["Estimado", "Oi"],
      ["estimado", "oi"],
      ["Atenciosamente", "Abraços"],
      ["atenciosamente", "abraços"],
      ["Cordialmente", "Até logo"],
      ["cordialmente", "até logo"],
    ];
    
    let changed = false;
    for (const [from, to] of replacements) {
      if (newDoc.includes(from)) {
        newDoc = newDoc.split(from).join(to);
        changed = true;
        operations.push({
          type: "replace",
          search: from,
          replace: to,
          explanation: `Tom informal: "${from}" → "${to}"`
        });
      }
    }
    
    if (changed) {
      return { newDoc, operations, feedback: "✅ Tom alterado para mais informal" };
    }
  }
  
  // Tom formal - usa negative lookbehind para não matchear "informal"
  if (rawInstruction.match(/(?<![in])\bformal\b|profissional/i)) {
    const replacements = [
      ["você", "o(a) senhor(a)"],
      ["Você", "O(a) senhor(a)"],
      ["oi", "Olá"],
      ["Oi", "Olá"],
      ["Oi!", "Olá!"],
      ["oi!", "Olá!"],
      // Usa word boundary para não substituir dentro de palavras
      [" tá ", " está "],
      [" pra ", " para "],
      ["beleza", "perfeito"],
      ["Beleza", "Perfeito"],
      ["blz", "perfeito"],
      ["legal", "excelente"],
      ["Legal", "Excelente"],
      ["valeu", "obrigado"],
      ["Valeu", "Obrigado"],
      ["e aí", "como posso ajudar"],
      ["E aí", "Como posso ajudar"],
    ];
    
    let changed = false;
    for (const [from, to] of replacements) {
      if (newDoc.includes(from)) {
        newDoc = newDoc.split(from).join(to);
        changed = true;
        operations.push({
          type: "replace",
          search: from,
          replace: to,
          explanation: `Tom formal: "${from}" → "${to}"`
        });
      }
    }
    
    if (changed) {
      return { newDoc, operations, feedback: "✅ Tom alterado para mais formal" };
    }
  }
  
  // ============ FALLBACK: Adiciona como nova regra/instrução ============
  const formattedContent = `\n## 📝 Instrução Adicional\n${rawInstruction}`;
  
  newDoc = doc.trim() + formattedContent;
  operations.push({
    type: "insert",
    replace: formattedContent,
    position: "end",
    explanation: `Adicionada instrução: "${rawInstruction.substring(0, 50)}..."`
  });
  
  return { 
    newDoc, 
    operations, 
    feedback: `✅ Instrução adicionada como nova regra` 
  };
}

// ============================================================================
// EDIÇÃO COM LLM (SEARCH/REPLACE BLOCK) - TÉCNICA AIDER
// ============================================================================

/**
 * Edita o prompt usando a técnica de Search/Replace Block (padrão Aider)
 * Esta é a técnica mais robusta para edição de texto via LLM.
 * 🚀 ATUALIZADO: Agora usa OpenRouter/Hyperbolic (mesmo LLM do chat produção)
 */
export async function editPromptWithLLM(
  currentPrompt: string,
  userInstruction: string,
  _apiKey?: string  // Ignorado - usa config do sistema
): Promise<EditResult> {
  try {
    const { chatComplete } = await import("./llm");

    const systemPrompt = `Você é um especialista em edição de texto e prompts.
Sua tarefa é editar o texto fornecido seguindo EXATAMENTE a instrução do usuário.

IMPORTANTE:
Você deve retornar as edições no formato de BLOCOS DE BUSCA E SUBSTITUIÇÃO.
Não use JSON. Use exatamente este formato para cada alteração:

<<<<<<< SEARCH
(texto exato original que será substituído)
=======
(novo texto que entrará no lugar)
>>>>>>> REPLACE

REGRAS CRÍTICAS:
1. O bloco SEARCH deve conter texto EXATO do original, incluindo espaços e quebras de linha.
2. Inclua linhas de contexto suficientes no SEARCH para garantir que seja único.
3. Se for adicionar algo novo no final, use o final do texto atual como âncora no SEARCH.
4. Se for remover, o bloco REPLACE deve estar vazio (ou conter apenas o contexto mantido).
5. Retorne APENAS os blocos de edição. Sem explicações extras.`;

    const userMessage = `TEXTO ORIGINAL:
"""
${currentPrompt}
"""

INSTRUÇÃO DO USUÁRIO:
"${userInstruction}"

Gere os blocos de edição SEARCH/REPLACE para aplicar esta instrução.`;

    // 🚀 Chamada via chatComplete (usa OpenRouter/Hyperbolic automaticamente)
    const response = await chatComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0, // Determinístico para melhor precisão
    });

    const llmOutput = response.choices?.[0]?.message?.content || "";
    
    // Processa os blocos retornados
    return applyLLMBlocks(currentPrompt, llmOutput);

  } catch (error) {
    console.error("[EditEngine] Erro na edição via LLM:", error);
    // Fallback para edição local se falhar
    return editPromptAdvanced(currentPrompt, userInstruction);
  }
}

/**
 * Aplica os blocos SEARCH/REPLACE retornados pelo LLM
 */
export function applyLLMBlocks(doc: string, blocks: string): EditResult {
  const operations: EditOperation[] = [];
  let newDoc = doc;
  
  // Regex para capturar os blocos (ajustado para permitir replace vazio)
  const blockRegex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)>>>>>>> REPLACE/g;
  
  let match;
  while ((match = blockRegex.exec(blocks)) !== null) {
    const searchBlock = match[1]; // Texto original
    const replaceBlock = match[2].replace(/^\n/, '').replace(/\n$/, ''); // Remove newlines extras das bordas do replace
    
    // Tenta encontrar o bloco exato
    if (newDoc.includes(searchBlock)) {
      newDoc = newDoc.replace(searchBlock, replaceBlock);
      operations.push({
        type: "replace",
        search: searchBlock,
        replace: replaceBlock,
        explanation: "Edição aplicada via LLM (Match Exato)"
      });
    } else {
      // Tenta fuzzy match se o exato falhar
      // Reduzido threshold para 0.65 para tolerar erros de espaçamento comuns em LLMs
      const fuzzy = fuzzyFind(newDoc, searchBlock, 0.65); 
      if (fuzzy) {
        const result = applySearchReplace(newDoc, fuzzy.found, replaceBlock);
        if (result.success) {
          newDoc = result.result;
          operations.push({
            type: "replace",
            search: fuzzy.found,
            replace: replaceBlock,
            explanation: "Edição aplicada via LLM (Fuzzy Match)"
          });
        }
      } else {
        console.warn("[EditEngine] Bloco não encontrado:", searchBlock.substring(0, 50) + "...");
      }
    }
  }
  
  const success = operations.length > 0;
  
  return {
    success,
    newPrompt: newDoc,
    operations,
    summary: success ? "Edições aplicadas via IA" : "Nenhuma edição aplicada",
    feedbackMessage: success ? "✅ Alterações aplicadas com inteligência artificial" : "⚠️ Não consegui aplicar as alterações sugeridas pela IA"
  };
}

// ============================================================================
// EDIÇÃO COM GPT (JSON SCHEMA) - LEGADO/FALLBACK
// ============================================================================

const EDIT_SCHEMA_V2 = {
  type: "object" as const,
  properties: {
    operations: {
      type: "array" as const,
      description: "Lista de operações de edição a aplicar",
      items: {
        type: "object" as const,
        properties: {
          type: {
            type: "string" as const,
            enum: ["search_replace", "insert", "delete"],
            description: "Tipo de operação"
          },
          search: {
            type: "string" as const,
            description: "Texto EXATO a encontrar no documento (para search_replace e delete)"
          },
          replace: {
            type: "string" as const,
            description: "Novo texto (para search_replace e insert)"
          },
          position: {
            type: "string" as const,
            enum: ["before", "after", "start", "end"],
            description: "Posição para insert"
          },
          anchor: {
            type: "string" as const,
            description: "Texto âncora para insert before/after"
          },
          explanation: {
            type: "string" as const,
            description: "Explicação da mudança em português"
          }
        },
        required: ["type", "explanation"],
        additionalProperties: false
      }
    },
    feedback: {
      type: "string" as const,
      description: "Mensagem amigável para mostrar ao usuário sobre as mudanças feitas"
    }
  },
  required: ["operations", "feedback"],
  additionalProperties: false
};

export async function editPromptWithGPTv2(
  currentPrompt: string,
  userInstruction: string,
  openaiApiKey: string
): Promise<EditResult> {
  const openai = new OpenAI({ apiKey: openaiApiKey });

  const systemPrompt = `Você é um especialista em edição de prompts para agentes de IA.

REGRAS IMPORTANTES:
1. Analise o prompt atual e a instrução do usuário
2. Retorne operações de edição precisas usando SEARCH/REPLACE
3. O campo "search" deve conter texto EXATO que existe no documento
4. Prefira editar texto existente ao invés de adicionar novo
5. Para múltiplas mudanças, use múltiplas operações

TIPOS DE OPERAÇÃO:
- "search_replace": Encontra "search" e substitui por "replace"
- "insert": Adiciona "replace" na "position" (before/after do "anchor", ou start/end)
- "delete": Remove o texto em "search"

ESTRATÉGIA:
1. Se usuário quer MUDAR algo → use search_replace
2. Se usuário quer ADICIONAR algo → use insert
3. Se usuário quer REMOVER algo → use delete
4. Prefira edições cirúrgicas que preservam o resto

IMPORTANTE: O "search" deve ser texto que EXISTE no documento, exatamente como está!`;

  const userPrompt = `PROMPT ATUAL DO AGENTE:
"""
${currentPrompt}
"""

INSTRUÇÃO DO USUÁRIO:
"${userInstruction}"

Analise e retorne as operações de edição em JSON. Lembre-se: o "search" deve ser texto EXATO do documento!`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "prompt_edit_v2",
          strict: true,
          schema: EDIT_SCHEMA_V2
        }
      },
      temperature: 0.2,
      max_tokens: 2000
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Resposta vazia");

    const result = JSON.parse(content);
    
    // Aplica operações
    let newDoc = currentPrompt;
    const appliedOps: EditOperation[] = [];
    
    for (const op of result.operations || []) {
      switch (op.type) {
        case "search_replace":
          if (op.search && op.replace !== undefined) {
            const res = applySearchReplace(newDoc, op.search, op.replace);
            if (res.success) {
              newDoc = res.result;
              appliedOps.push({ 
                type: "replace", 
                search: op.search, 
                replace: op.replace, 
                explanation: op.explanation 
              });
            }
          }
          break;
          
        case "insert":
          if (op.replace && op.position) {
            const res = applyInsert(newDoc, op.replace, op.position, op.anchor);
            if (res.success) {
              newDoc = res.result;
              appliedOps.push({ 
                type: "insert", 
                replace: op.replace, 
                position: op.position, 
                anchor: op.anchor, 
                explanation: op.explanation 
              });
            }
          }
          break;
          
        case "delete":
          if (op.search) {
            const res = applyDelete(newDoc, op.search);
            if (res.success) {
              newDoc = res.result;
              appliedOps.push({ 
                type: "delete", 
                search: op.search, 
                explanation: op.explanation 
              });
            }
          }
          break;
      }
    }
    
    // Limpa formatação
    newDoc = newDoc.replace(/\n{3,}/g, '\n\n').trim();
    
    const success = appliedOps.length > 0 && newDoc !== currentPrompt;
    
    return {
      success,
      newPrompt: success ? newDoc : currentPrompt,
      operations: appliedOps,
      summary: appliedOps.map(op => op.explanation).join('; '),
      feedbackMessage: result.feedback || "Mudanças aplicadas!"
    };
    
  } catch (error: any) {
    console.error("[EditEngine] Erro GPT:", error.message);
    // Fallback para edição local
    return editPromptAdvanced(currentPrompt, userInstruction);
  }
}

// ============================================================================
// EXPORT PRINCIPAL
// ============================================================================

export async function editPrompt(
  currentPrompt: string,
  userInstruction: string,
  openaiApiKey?: string
): Promise<EditResult> {
  // Tenta LLM se disponível (Prioridade Máxima conforme pedido do usuário)
  if (openaiApiKey && openaiApiKey !== 'your-openai-key') {
    try {
      // Usa a nova técnica de Search/Replace Block
      return await editPromptWithLLM(currentPrompt, userInstruction, openaiApiKey);
    } catch (error) {
      console.error("[EditEngine] Fallback para edição local após erro no LLM");
    }
  }
  
  // Edição local (Fallback)
  return editPromptAdvanced(currentPrompt, userInstruction);
}
