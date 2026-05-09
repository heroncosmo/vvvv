"use strict";
/**
 * ========================================================================
 * ADMIN AGENT OUTPUT SANITIZER — Sanitizador de Output
 * ========================================================================
 * Camada final antes de enviar a resposta ao cliente.
 * Funciona como "Layer 6" do orquestrador.
 *
 * Responsabilidades:
 *  - Remover mojibake (caracteres quebrados UTF-8)
 *  - Converter markdown admin → formato WhatsApp
 *  - Remover artefatos de LLM (tags, metadados, etc.)
 *  - Detectar e bloquear falso "conta existente"
 *  - Limitar tamanho da resposta
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectFalseExisting = detectFalseExisting;
exports.sanitizeOutput = sanitizeOutput;
// ============================================================================
// MOJIBAKE REPAIR MAP
// ============================================================================
/** Mapa expandido de mojibake → texto correto */
var MOJIBAKE_REPAIRS = [
    // V16: Acentuações comuns — agora preservam acentos corretos em UTF-8
    [/vocÃª/gi, "você"],
    [/nÃ£o/gi, "não"],
    [/jÃ¡/gi, "já"],
    [/negÃ³cio/gi, "negócio"],
    [/dÃºvida/gi, "dúvida"],
    [/preÃ§o/gi, "preço"],
    [/informaÃ§Ã£o/gi, "informação"],
    [/configuraÃ§Ã£o/gi, "configuração"],
    [/grÃ¡tis/gi, "grátis"],
    [/serviÃ§o/gi, "serviço"],
    [/horÃ¡rio/gi, "horário"],
    [/criaÃ§Ã£o/gi, "criação"],
    [/funÃ§Ã£o/gi, "função"],
    [/soluÃ§Ã£o/gi, "solução"],
    [/RecepÃ§Ã£o/gi, "Recepção"],
    [/situaÃ§Ã£o/gi, "situação"],
    [/condiÃ§Ã£o/gi, "condição"],
    [/operaÃ§Ã£o/gi, "operação"],
    [/relaÃ§Ã£o/gi, "relação"],
    [/proteÃ§Ã£o/gi, "proteção"],
    [/educaÃ§Ã£o/gi, "educação"],
    [/comunicaÃ§Ã£o/gi, "comunicação"],
    [/organizaÃ§Ã£o/gi, "organização"],
    [/produÃ§Ã£o/gi, "produção"],
    [/construÃ§Ã£o/gi, "construção"],
    [/instruÃ§Ã£o/gi, "instrução"],
    [/descriÃ§Ã£o/gi, "descrição"],
    [/sugestÃ£o/gi, "sugestão"],
    [/questÃ£o/gi, "questão"],
    [/exceÃ§Ã£o/gi, "exceção"],
    [/aÃ§Ã£o/gi, "ação"],
    [/correÃ§Ã£o/gi, "correção"],
    [/direÃ§Ã£o/gi, "direção"],
    [/geraÃ§Ã£o/gi, "geração"],
    [/aplicaÃ§Ã£o/gi, "aplicação"],
    [/integraÃ§Ã£o/gi, "integração"],
    [/automaÃ§Ã£o/gi, "automação"],
    [/simulaÃ§Ã£o/gi, "simulação"],
    [/verificaÃ§Ã£o/gi, "verificação"],
    [/validaÃ§Ã£o/gi, "validação"],
    [/notificaÃ§Ã£o/gi, "notificação"],
    // Generic diacritical fragments — preservam acentos
    [/Ã£o\b/g, "ão"],
    [/Ã©/g, "é"],
    [/Ã¡/g, "á"],
    [/Ãª/g, "ê"],
    [/Ã³/g, "ó"],
    [/Ãº/g, "ú"],
    [/Ã§/g, "ç"],
    [/Ã­/g, "í"],
    [/Ã´/g, "ô"],
    [/Ãµ/g, "õ"],
    [/Ã /g, "à"],
    [/Ã¢/g, "â"],
];
// ============================================================================
// MARKDOWN → WHATSAPP
// ============================================================================
/** Converte markdown de admin para formato WhatsApp */
function convertMarkdownToWhatsApp(text) {
    return text
        // Headers → bold
        .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
        // Bold ** ou __ → *
        .replace(/\[(https?:\/\/[^\]]+)\]\(\1\)/gi, "$1")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, "$1: $2")
        .replace(/\*\*\*(.+?)\*\*\*/g, "*$1*")
        .replace(/\*\*(.+?)\*\*/g, "*$1*")
        .replace(/__(.+?)__/g, "*$1*")
        // Itálico _ → _
        .replace(/(?<!\w)_(.+?)_(?!\w)/g, "_$1_")
        // Strikethrough ~~ → ~
        .replace(/~~(.+?)~~/g, "~$1~")
        // Code blocks ``` → remover
        .replace(/```[\s\S]*?```/g, "")
        // Inline code ` → remover backticks
        .replace(/`([^`]+)`/g, "$1")
        // Links [text](url) → text: url
        // Horizontal rules
        .replace(/^[-_*]{3,}$/gm, "")
        // Excess newlines
        .replace(/\n{3,}/g, "\n\n")
        // Remove markdown quebrado em linhas com URL
        .replace(/^([^\n]*https?:\/\/[^\n]+)$/gm, function (line) { return line.replace(/\*/g, ""); })
        // Remove duplicação de "url: url"
        .replace(/(https?:\/\/[^\s:]+):\s*\1/gi, "$1")
        // Remove asteriscos residuais duplicados
        .replace(/\*{2,}/g, "*");
}
// ============================================================================
// FALSE EXISTING ACCOUNT DETECTOR
// ============================================================================
/** Padrões que indicam "manteve conta existente" falso */
var FALSE_EXISTING_PATTERNS = [
    /mantive sua conta/i,
    /conta j[aá] existente/i,
    /mantive a conta/i,
    /conta que voc[eê] j[aá] (tinha|tem|possui)/i,
    /usei sua conta anterior/i,
    /aproveitei seu cadastro/i,
    /conta existente.*mante/i,
    /mante.*conta existente/i,
];
/**
 * Detecta se o texto contém menção falsa a "conta existente"
 * quando o contexto indica que NÃO é uma conta existente.
 */
function detectFalseExisting(text, isExistingAccount) {
    if (isExistingAccount)
        return false; // É realmente existente, não é falso
    return FALSE_EXISTING_PATTERNS.some(function (p) { return p.test(text); });
}
/**
 * Remove menções falsas a "conta existente" do texto.
 */
function removeFalseExistingMentions(text) {
    var cleaned = text;
    for (var _i = 0, FALSE_EXISTING_PATTERNS_1 = FALSE_EXISTING_PATTERNS; _i < FALSE_EXISTING_PATTERNS_1.length; _i++) {
        var pattern = FALSE_EXISTING_PATTERNS_1[_i];
        cleaned = cleaned.replace(pattern, "");
    }
    return cleaned.replace(/\s{2,}/g, " ").trim();
}
// ============================================================================
// LLM ARTIFACT REMOVER
// ============================================================================
/** Remove artefatos comuns de LLM */
function removeLLMArtefacts(text) {
    return text
        // Remove tags XML/HTML residuais de raciocínio
        .replace(/<\/?(?:thinking|reasoning|internal|thought|scratchpad)[^>]*>/gi, "")
        // Remove prefixos de role comuns
        .replace(/^(?:assistant|rodrigo|agente|bot):\s*/gim, "")
        // Remove metadata JSON perdido
        .replace(/\{[^{}]*"(?:action|intent|type)"[^{}]*\}/g, "")
        // Remove escape sequences
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, " ")
        .replace(/\\"/g, '"')
        .trim();
}
function stripToolCallPayloads(text) {
    var cleaned = text;
    while (true) {
        var toolCallsIndex = cleaned.indexOf('"tool_calls"');
        if (toolCallsIndex === -1)
            break;
        var objectStart = cleaned.lastIndexOf('{', toolCallsIndex);
        if (objectStart === -1)
            break;
        var removalStart = objectStart;
        var prefixSlice = cleaned.slice(Math.max(0, objectStart - 16), objectStart);
        var jsonPrefixMatch = prefixSlice.match(/json\s*$/i);
        if (jsonPrefixMatch) {
            removalStart = objectStart - jsonPrefixMatch[0].length;
        }
        var depth = 0;
        var inString = false;
        var escaped = false;
        var objectEnd = -1;
        for (var i = objectStart; i < cleaned.length; i++) {
            var char = cleaned[i];
            if (inString) {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (char === "\\") {
                    escaped = true;
                    continue;
                }
                if (char === '"') {
                    inString = false;
                }
                continue;
            }
            if (char === '"') {
                inString = true;
                continue;
            }
            if (char === "{") {
                depth++;
                continue;
            }
            if (char === "}") {
                depth--;
                if (depth === 0) {
                    objectEnd = i;
                    break;
                }
            }
        }
        if (objectEnd === -1)
            break;
        cleaned = "".concat(cleaned.slice(0, removalStart)).concat(cleaned.slice(objectEnd + 1));
    }
    return cleaned.replace(/^\s*json\s*$/gim, "").trim();
}
/**
 * Sanitiza a resposta do admin agent antes de enviar ao cliente.
 * Aplica todas as camadas de limpeza em sequência.
 */
function sanitizeOutput(text, options) {
    if (options === void 0) { options = {}; }
    var _a = options.isExistingAccount, isExistingAccount = _a === void 0 ? false : _a, _b = options.maxLength, maxLength = _b === void 0 ? 4000 : _b, _c = options.convertMarkdown, convertMarkdown = _c === void 0 ? true : _c, _d = options.removeLLMArtefacts, shouldRemoveLLM = _d === void 0 ? true : _d;
    var originalLength = text.length;
    var cleaned = text;
    // (1) Remove artefatos de LLM
    if (shouldRemoveLLM) {
        cleaned = removeLLMArtefacts(cleaned);
        cleaned = stripToolCallPayloads(cleaned);
    }
    // (2) Converte markdown → WhatsApp
    if (convertMarkdown) {
        cleaned = convertMarkdownToWhatsApp(cleaned);
    }
    // (3) Remove control chars
    cleaned = cleaned
        .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
        .replace(/\uFFFD/g, "")
        .replace(/ï¿½/g, "");
    // (4) Repara mojibake
    var hadMojibake = false;
    var beforeMojibake = cleaned;
    for (var _i = 0, MOJIBAKE_REPAIRS_1 = MOJIBAKE_REPAIRS; _i < MOJIBAKE_REPAIRS_1.length; _i++) {
        var _e = MOJIBAKE_REPAIRS_1[_i], pattern = _e[0], replacement = _e[1];
        cleaned = cleaned.replace(pattern, replacement);
    }
    if (cleaned !== beforeMojibake)
        hadMojibake = true;
    // (5) Remove Ã clusters residuais
    cleaned = cleaned.replace(/[ÃÂ]{2,}/g, " ");
    // (6) Check mojibake residual
    // V16: Removido nuclear mojibake cleanup que destruía palavras portuguesas válidas
    // (7) Detecta e remove "conta existente" falso
    var hadFalseExisting = false;
    if (!isExistingAccount && detectFalseExisting(cleaned, isExistingAccount)) {
        cleaned = removeFalseExistingMentions(cleaned);
        hadFalseExisting = true;
        console.log("[SANITIZER-V12] Removida menção falsa a conta existente");
    }
    // (8) Normaliza whitespace
    cleaned = cleaned
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .trim();
    // (9) Limita tamanho
    if (cleaned.length > maxLength) {
        cleaned = cleaned.slice(0, maxLength - 3) + "...";
    }
    return {
        text: cleaned,
        hadMojibake: hadMojibake,
        hadFalseExisting: hadFalseExisting,
        mojibakeResidualScore: 0,
        charsRemoved: originalLength - cleaned.length,
    };
}
