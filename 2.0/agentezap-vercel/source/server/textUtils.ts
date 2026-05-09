
import { getBrazilTimeParts } from "./greetingTime";

const TIMED_OPENING_LINE_PLACEHOLDER = "{{saudacao_inicial_horario}}";

function buildTimedOpeningLine(contactName?: string): string {
  const safeName = sanitizeContactName(contactName);
  const { hour } = getBrazilTimeParts();

  if (hour >= 0 && hour < 6) {
    return safeName ? `Olá, ${safeName}! Tudo bem?` : "Olá, tudo bem?";
  }

  if (hour >= 6 && hour < 12) {
    return safeName ? `Bom dia, ${safeName} 😊` : "Bom dia 😊";
  }

  if (hour >= 12 && hour < 18) {
    return safeName ? `Boa tarde, ${safeName} 😊` : "Boa tarde 😊";
  }

  return safeName ? `Boa noite, ${safeName} 😊` : "Boa noite 😊";
}

/**
 * 🛡️ Sanitiza e valida nome de contato do WhatsApp (pushName)
 * 
 * Nomes inválidos para uso em conversação:
 * - Só números: "5511999887766"
 * - Só símbolos/pontuação: "-----", "***", "...", "___"
 * - Contém "visitante" (fallback genérico do sistema)
 * - Muito curto para ser nome real (1 char)
 * - Só emojis
 * - Caracteres sem sentido (repetição do mesmo char 3+)
 * 
 * @param contactName Nome bruto do pushName do WhatsApp
 * @returns Nome limpo e válido, ou string vazia se inválido
 */
export function sanitizeContactName(contactName?: string): string {
  if (!contactName) return "";
  
  const trimmed = contactName.trim();
  if (!trimmed) return "";
  
  // Só dígitos (número de telefone como nome)
  if (/^\d+$/.test(trimmed)) return "";
  
  // "visitante" ou variações
  if (/visitante|visitor|guest/i.test(trimmed)) return "";
  
  // Remover emojis para avaliar o texto real
  const withoutEmojis = trimmed
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{200D}\u{200B}-\u{200F}]/gu, '')
    .trim();
  
  // Se só tinha emojis, nome inválido
  if (!withoutEmojis) return "";
  
  // Só símbolos/pontuação (sem letras): "-----", "***", "...", "___", ".·." etc
  if (!/[a-zA-ZÀ-ÿ]/.test(withoutEmojis)) return "";
  
  // Muito curto para ser nome real (1 caractere de letra)
  const lettersOnly = withoutEmojis.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (lettersOnly.length < 2) return "";
  
  // Mesmo caractere repetido 3+ vezes (ex: "aaa", "bbb", "xxx")
  if (/^(.)\1{2,}$/i.test(lettersOnly)) return "";
  
  // Nome válido! Retornar versão limpa (sem emojis excessivos no nome)
  // Mantemos o nome original trimado, pois pode ter acentos, espaços legítimos, etc.
  return trimmed;
}

/**
 * Processa placeholders na resposta da IA e limpa artefatos indesejados.
 * @param text Texto original da resposta
 * @param contactName Nome do contato para substituição de variáveis
 */
export function processResponsePlaceholders(text: string, contactName?: string): string {
  if (!text) return text;
  
  const formattedName = sanitizeContactName(contactName);
  
  let processed = text;
  processed = processed.split(TIMED_OPENING_LINE_PLACEHOLDER).join(buildTimedOpeningLine(contactName));
  
  // 🛡️ LIMPAR INSTRUÇÕES INTERNAS que a IA pode ter copiado
  processed = processed.replace(/\[INSTRUÇÃO CRÍTICA[^\]]*\]/gi, '');
  processed = processed.replace(/Mensagem do cliente:\s*/gi, '');
  processed = processed.replace(/\[INSTRUÇÃO[^\]]*\]/gi, '');
  
  // 🛡️ FIX CRÍTICO: Remover prefixos de mídia que a IA pode ter "aprendido" incorretamente
  // Isso acontece quando a IA vê "🎤 Áudio" no histórico e imita como prefixo
  if (processed.startsWith('🎤 Áudio ') || processed.startsWith('🎤 Audio ')) {
    processed = processed.replace(/^🎤 [ÁáAa]udio\s+/i, '');
    console.log(`🛡️ [AI Agent] Removido prefixo "🎤 Áudio" incorreto da resposta da IA`);
  }
  if (processed.startsWith('🖼️ Imagem ') || processed.startsWith('📷 Imagem ')) {
    processed = processed.replace(/^[🖼️📷]\s*Imagem\s+/i, '');
    console.log(`🛡️ [AI Agent] Removido prefixo de imagem incorreto da resposta da IA`);
  }
  if (processed.startsWith('🎥 Vídeo ') || processed.startsWith('🎬 Vídeo ')) {
    processed = processed.replace(/^[🎥🎬]\s*Vídeo\s+/i, '');
    console.log(`🛡️ [AI Agent] Removido prefixo de vídeo incorreto da resposta da IA`);
  }
  
  // Limpar marcadores internos que não devem aparecer na resposta
  processed = processed.replace(/\[ÁUDIO ENVIADO PELO AGENTE\]:\s*/gi, '');
  processed = processed.replace(/\[IMAGEM ENVIADA:[^\]]*\]/gi, '');
  processed = processed.replace(/\[VÍDEO ENVIADO:[^\]]*\]/gi, '');
  processed = processed.replace(/\[DOCUMENTO ENVIADO:[^\]]*\]/gi, '');
  
  // 🛡️ FIX CRÍTICO: Limpar padrão [Áudio enviado: ...] que a IA está copiando do contexto
  processed = processed.replace(/\[Áudio enviado:[^\]]*\]/gi, '');
  processed = processed.replace(/\[Imagem enviada:[^\]]*\]/gi, '');
  processed = processed.replace(/\[Vídeo enviado:[^\]]*\]/gi, '');
  processed = processed.replace(/\[Documento enviado:[^\]]*\]/gi, '');
  
  // 🛡️ LIMPEZA AGRESSIVA: Remover padrões de mídia em QUALQUER posição
  // Formatos: *Áudio*, [Áudio], (Áudio), Áudio, Audio
  processed = processed.replace(/\*[ÁáAa]udio\*/gi, '');
  processed = processed.replace(/\[[ÁáAa]udio[^\]]*\]/gi, '');
  processed = processed.replace(/\([ÁáAa]udio[^)]*\)/gi, '');
  
  // 🛡️ FIX CRÍTICO: Remover a palavra "Áudio"/"Audio" ISOLADA em qualquer posição
  // Padrões: "? Áudio " no meio, "Áudio " no início, " Áudio" no final
  // Regex: palavra Áudio/Audio cercada por espaços, pontuação ou bordas
  processed = processed.replace(/[\?\!\.]\s*[ÁáAa]udio\s+/gi, '. ');  // "? Áudio " -> ". "
  processed = processed.replace(/\s+[ÁáAa]udio\s*$/gi, '');           // " Áudio" no final
  processed = processed.replace(/^[ÁáAa]udio\s+/gi, '');              // "Áudio " no início
  processed = processed.replace(/\s+[ÁáAa]udio\s+/gi, ' ');           // " Áudio " no meio (CUIDADO: pode remover palavras legítimas como "audiovisual")
  
  // 🛡️ Limpar espaços duplos e pontuação estranha resultante
  // ⚠️ PRESERVAR QUEBRAS DE LINHA - usar [ \t]+ ao invés de \s+ para não remover \n
  processed = processed.replace(/[ \t]+/g, ' ');
  processed = processed.replace(/\.\s*\./g, '.');
  processed = processed.replace(/\?\s*\./g, '?');
  processed = processed.replace(/!\s*\./g, '!');
  
  // 🛡️ Limpar quebras de linha múltiplas (mais de 2) para no máximo 2
  processed = processed.replace(/\n{3,}/g, '\n\n');
  
  processed = processed.trim();
  
  // Regex genérico para capturar QUALQUER variável de nome comum
  const genericNamePattern = /\{\{?(nome|name|cliente|customer|user|usuario|contato)\}?\}|\[(nome|name|cliente|customer|contato)\]/gi;
  
  if (formattedName) {
    processed = processed.replace(genericNamePattern, formattedName);
  } else {
    processed = processed.replace(/,?\s*\{\{?(nome|name|cliente|customer|user|usuario|contato)\}?\}/gi, "");
    processed = processed.replace(/,?\s*\[(nome|name|cliente|customer|contato)\]/gi, "");
  }
  
  // 🛡️ FIX: Detectar e limitar respostas concatenadas
  // Padrão: quando a IA repete o mesmo nome mais de 2x, provavelmente concatenou
  if (formattedName && formattedName.length > 2) {
    const escapedName = formattedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRegex = new RegExp(escapedName, 'gi');
    const nameCount = (processed.match(nameRegex) || []).length;
    
    if (nameCount > 2) {
      console.log(`🛡️ [TextUtils] Nome "${formattedName}" repetido ${nameCount}x - truncando resposta`);
      
      // Encontrar a posição da SEGUNDA ocorrência do nome
      let count = 0;
      let secondNameStart = -1;
      let match;
      const searchRegex = new RegExp(escapedName, 'gi');
      
      while ((match = searchRegex.exec(processed)) !== null) {
        count++;
        if (count === 2) {
          secondNameStart = match.index;
          break;
        }
      }
      
      if (secondNameStart > 10) {
        // Cortar ANTES da segunda ocorrência do nome
        const beforeSecond = processed.substring(0, secondNameStart);
        
        // Procurar último ponto de corte natural
        const lastPunctuation = Math.max(
          beforeSecond.lastIndexOf('. '),
          beforeSecond.lastIndexOf('? '),
          beforeSecond.lastIndexOf('! '),
          beforeSecond.lastIndexOf('.')
        );
        
        if (lastPunctuation > 10) {
          processed = processed.substring(0, lastPunctuation + 1).trim();
        } else {
          // Se não encontrou pontuação, corta direto antes do segundo nome
          processed = beforeSecond.trim();
          // Remove vírgula final se houver
          processed = processed.replace(/,\s*$/, '.');
        }
        console.log(`🛡️ [TextUtils] Resposta truncada para evitar concatenação`);
      }
    }
  }
  
  // 🛡️ FIX: Se resposta ficar muito longa (mais de 500 chars), limitar
  // Respostas muito longas geralmente são concatenações
  // ⚠️ EXCEÇÃO: NÃO truncar se for uma LISTA NUMERADA (cardápio, categorias, produtos)
  const isNumberedList = /\d+\.\s+[🎨☁️🔗💼📚🐾🤖🎬🐀🍔💾🔊💰✔️📊💬📸🌐🎮📲🚀🚗🐒🎨📄⏳🎓🔔🏢🔧🖥️🖌️🇬🇧💎👥🛒📡🛠️🖤🎟️💥💻📱⚡🎰📺🎯🔍📲🎁💵✅🔄🤝🗃️💡]/g;
  const numberedItemsCount = (processed.match(isNumberedList) || []).length;
  const hasMultipleNumberedItems = numberedItemsCount >= 5;
  const numberedLineMatches =
    processed.match(/(^|\n)\s*\d+[\.\)]\s+(?=\S)/g) || [];
  const bulletLineMatches =
    processed.match(/(^|\n)\s*[-•*]\s+(?=\S)/g) || [];
  const hasStructuredList =
    hasMultipleNumberedItems ||
    numberedLineMatches.length >= 2 ||
    bulletLineMatches.length >= 3;
  
  if (processed.length > 600 && !hasStructuredList) {
    // Encontrar um ponto de corte natural (. ou ? ou !)
    const cutPoint = processed.substring(0, 500).lastIndexOf('. ');
    if (cutPoint > 100) {
      processed = processed.substring(0, cutPoint + 1);
      console.log(`🛡️ [TextUtils] Resposta truncada de ${processed.length} para ${cutPoint + 1} chars`);
    }
  } else if (hasStructuredList) {
    console.log(`🛡️ [TextUtils] Lista numerada detectada (${numberedItemsCount} itens) - NÃO truncando`);
  }
  
  return processed.trim();
}
