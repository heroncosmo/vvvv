"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeContactName = sanitizeContactName;
exports.processResponsePlaceholders = processResponsePlaceholders;
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
function sanitizeContactName(contactName) {
    if (!contactName)
        return "";
    var trimmed = contactName.trim();
    if (!trimmed)
        return "";
    // Só dígitos (número de telefone como nome)
    if (/^\d+$/.test(trimmed))
        return "";
    // "visitante" ou variações
    if (/visitante|visitor|guest/i.test(trimmed))
        return "";
    // Remover emojis para avaliar o texto real
    var withoutEmojis = trimmed
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{200D}\u{200B}-\u{200F}]/gu, '')
        .trim();
    // Se só tinha emojis, nome inválido
    if (!withoutEmojis)
        return "";
    // Só símbolos/pontuação (sem letras): "-----", "***", "...", "___", ".·." etc
    if (!/[a-zA-ZÀ-ÿ]/.test(withoutEmojis))
        return "";
    // Muito curto para ser nome real (1 caractere de letra)
    var lettersOnly = withoutEmojis.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    if (lettersOnly.length < 2)
        return "";
    // Mesmo caractere repetido 3+ vezes (ex: "aaa", "bbb", "xxx")
    if (/^(.)\1{2,}$/i.test(lettersOnly))
        return "";
    // Nome válido! Retornar versão limpa (sem emojis excessivos no nome)
    // Mantemos o nome original trimado, pois pode ter acentos, espaços legítimos, etc.
    return trimmed;
}
/**
 * Processa placeholders na resposta da IA e limpa artefatos indesejados.
 * @param text Texto original da resposta
 * @param contactName Nome do contato para substituição de variáveis
 */
function processResponsePlaceholders(text, contactName) {
    if (!text)
        return text;
    var formattedName = sanitizeContactName(contactName);
    var processed = text;
    // 🛡️ LIMPAR INSTRUÇÕES INTERNAS que a IA pode ter copiado
    processed = processed.replace(/\[INSTRUÇÃO CRÍTICA[^\]]*\]/gi, '');
    processed = processed.replace(/Mensagem do cliente:\s*/gi, '');
    processed = processed.replace(/\[INSTRUÇÃO[^\]]*\]/gi, '');
    // 🛡️ FIX CRÍTICO: Remover prefixos de mídia que a IA pode ter "aprendido" incorretamente
    // Isso acontece quando a IA vê "🎤 Áudio" no histórico e imita como prefixo
    if (processed.startsWith('🎤 Áudio ') || processed.startsWith('🎤 Audio ')) {
        processed = processed.replace(/^🎤 [ÁáAa]udio\s+/i, '');
        console.log("\uD83D\uDEE1\uFE0F [AI Agent] Removido prefixo \"\uD83C\uDFA4 \u00C1udio\" incorreto da resposta da IA");
    }
    if (processed.startsWith('🖼️ Imagem ') || processed.startsWith('📷 Imagem ')) {
        processed = processed.replace(/^[🖼️📷]\s*Imagem\s+/i, '');
        console.log("\uD83D\uDEE1\uFE0F [AI Agent] Removido prefixo de imagem incorreto da resposta da IA");
    }
    if (processed.startsWith('🎥 Vídeo ') || processed.startsWith('🎬 Vídeo ')) {
        processed = processed.replace(/^[🎥🎬]\s*Vídeo\s+/i, '');
        console.log("\uD83D\uDEE1\uFE0F [AI Agent] Removido prefixo de v\u00EDdeo incorreto da resposta da IA");
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
    processed = processed.replace(/[\?\!\.]\s*[ÁáAa]udio\s+/gi, '. '); // "? Áudio " -> ". "
    processed = processed.replace(/\s+[ÁáAa]udio\s*$/gi, ''); // " Áudio" no final
    processed = processed.replace(/^[ÁáAa]udio\s+/gi, ''); // "Áudio " no início
    processed = processed.replace(/\s+[ÁáAa]udio\s+/gi, ' '); // " Áudio " no meio (CUIDADO: pode remover palavras legítimas como "audiovisual")
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
    var genericNamePattern = /\{\{?(nome|name|cliente|customer|user|usuario|contato)\}?\}|\[(nome|name|cliente|customer|contato)\]/gi;
    if (formattedName) {
        processed = processed.replace(genericNamePattern, formattedName);
    }
    else {
        processed = processed.replace(/,?\s*\{\{?(nome|name|cliente|customer|user|usuario|contato)\}?\}/gi, "");
        processed = processed.replace(/,?\s*\[(nome|name|cliente|customer|contato)\]/gi, "");
    }
    // 🛡️ FIX: Detectar e limitar respostas concatenadas
    // Padrão: quando a IA repete o mesmo nome mais de 2x, provavelmente concatenou
    if (formattedName && formattedName.length > 2) {
        var escapedName = formattedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var nameRegex = new RegExp(escapedName, 'gi');
        var nameCount = (processed.match(nameRegex) || []).length;
        if (nameCount > 2) {
            console.log("\uD83D\uDEE1\uFE0F [TextUtils] Nome \"".concat(formattedName, "\" repetido ").concat(nameCount, "x - truncando resposta"));
            // Encontrar a posição da SEGUNDA ocorrência do nome
            var count = 0;
            var secondNameStart = -1;
            var match = void 0;
            var searchRegex = new RegExp(escapedName, 'gi');
            while ((match = searchRegex.exec(processed)) !== null) {
                count++;
                if (count === 2) {
                    secondNameStart = match.index;
                    break;
                }
            }
            if (secondNameStart > 10) {
                // Cortar ANTES da segunda ocorrência do nome
                var beforeSecond = processed.substring(0, secondNameStart);
                // Procurar último ponto de corte natural
                var lastPunctuation = Math.max(beforeSecond.lastIndexOf('. '), beforeSecond.lastIndexOf('? '), beforeSecond.lastIndexOf('! '), beforeSecond.lastIndexOf('.'));
                if (lastPunctuation > 10) {
                    processed = processed.substring(0, lastPunctuation + 1).trim();
                }
                else {
                    // Se não encontrou pontuação, corta direto antes do segundo nome
                    processed = beforeSecond.trim();
                    // Remove vírgula final se houver
                    processed = processed.replace(/,\s*$/, '.');
                }
                console.log("\uD83D\uDEE1\uFE0F [TextUtils] Resposta truncada para evitar concatena\u00E7\u00E3o");
            }
        }
    }
    // 🛡️ FIX: Se resposta ficar muito longa (mais de 500 chars), limitar
    // Respostas muito longas geralmente são concatenações
    // ⚠️ EXCEÇÃO: NÃO truncar se for uma LISTA NUMERADA (cardápio, categorias, produtos)
    var isNumberedList = /\d+\.\s+[🎨☁️🔗💼📚🐾🤖🎬🐀🍔💾🔊💰✔️📊💬📸🌐🎮📲🚀🚗🐒🎨📄⏳🎓🔔🏢🔧🖥️🖌️🇬🇧💎👥🛒📡🛠️🖤🎟️💥💻📱⚡🎰📺🎯🔍📲🎁💵✅🔄🤝🗃️💡]/g;
    var numberedItemsCount = (processed.match(isNumberedList) || []).length;
    var hasMultipleNumberedItems = numberedItemsCount >= 5;
    if (processed.length > 600 && !hasMultipleNumberedItems) {
        // Encontrar um ponto de corte natural (. ou ? ou !)
        var cutPoint = processed.substring(0, 500).lastIndexOf('. ');
        if (cutPoint > 100) {
            processed = processed.substring(0, cutPoint + 1);
            console.log("\uD83D\uDEE1\uFE0F [TextUtils] Resposta truncada de ".concat(processed.length, " para ").concat(cutPoint + 1, " chars"));
        }
    }
    else if (hasMultipleNumberedItems) {
        console.log("\uD83D\uDEE1\uFE0F [TextUtils] Lista numerada detectada (".concat(numberedItemsCount, " itens) - N\u00C3O truncando"));
    }
    return processed.trim();
}
