"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_WHATSAPP_REPLY_MAX_CHARS = void 0;
exports.clampAdminReplyLength = clampAdminReplyLength;
exports.buildAdminPanelPitch = buildAdminPanelPitch;
exports.isPostTestSalesMessage = isPostTestSalesMessage;
exports.buildPostTestSalesReply = buildPostTestSalesReply;
exports.ADMIN_WHATSAPP_REPLY_MAX_CHARS = 700;
function normalizeReplyWhitespace(text) {
    return String(text || "")
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}
function normalizeComparisonText(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function clampAdminReplyLength(text, maxChars) {
    var _a;
    if (maxChars === void 0) { maxChars = exports.ADMIN_WHATSAPP_REPLY_MAX_CHARS; }
    var normalized = normalizeReplyWhitespace(text);
    if (normalized.length <= maxChars) {
        return normalized;
    }
    var urls = normalized.match(/https?:\/\/[^\s"'()>]+/gi) || [];
    var paragraphs = normalized
        .split(/\n{2,}/)
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
    var result = "";
    for (var _i = 0, paragraphs_1 = paragraphs; _i < paragraphs_1.length; _i++) {
        var paragraph = paragraphs_1[_i];
        var candidate = result ? "".concat(result, "\n\n").concat(paragraph) : paragraph;
        if (candidate.length <= maxChars) {
            result = candidate;
            continue;
        }
        break;
    }
    if (!result) {
        var sentences = normalized.match(/[^.!?]+[.!?]?/g) || [normalized];
        for (var _b = 0, sentences_1 = sentences; _b < sentences_1.length; _b++) {
            var sentence = sentences_1[_b];
            var candidate = result ? "".concat(result, " ").concat(sentence.trim()) : sentence.trim();
            if (candidate.length <= maxChars) {
                result = candidate;
                continue;
            }
            break;
        }
    }
    if (!result) {
        result = normalized.slice(0, maxChars);
    }
    var partialUrl = (_a = result.match(/https?:\/\/[^\s"'()>]*$/i)) === null || _a === void 0 ? void 0 : _a[0];
    if (partialUrl) {
        var fullUrl = urls.find(function (url) { return url.startsWith(partialUrl); });
        if (fullUrl && fullUrl !== partialUrl) {
            result = result.slice(0, result.length - partialUrl.length).trimEnd();
        }
    }
    if (result.length < normalized.length) {
        result = result.replace(/[,:;\-\s]+$/g, "").trimEnd();
        if (!/[.!?…]$/.test(result)) {
            result = "".concat(result, "...");
        }
    }
    return result.trim();
}
function buildAdminPanelPitch(panelUrl) {
    return "Voc\u00EA tamb\u00E9m pode ajustar direto no sistema e conhecer CRM/Kanban, conversas, notificador inteligente, fluxos e a conex\u00E3o do WhatsApp: ".concat(panelUrl);
}
function isPostTestSalesMessage(message) {
    var normalized = normalizeComparisonText(message);
    if (!normalized)
        return false;
    var hasPositiveFeedback = /\b(testei|testei aqui|vi|vi sim|gostei|curti|funcionou|ficou bom|ficou legal|show|top|massa|aprovado|rodou|deu certo)\b/.test(normalized);
    var asksImmediateEdit = /\b(editar|edita|alterar|ajustar|mudar|corrigir|mexer|arrumar|configurar)\b/.test(normalized);
    return hasPositiveFeedback && !asksImmediateEdit && normalized.length <= 140;
}
function buildPostTestSalesReply(panelUrl) {
    return clampAdminReplyLength("Boa. Se gostou, o pr\u00F3ximo passo \u00E9 colocar no ar no seu n\u00FAmero. ".concat(buildAdminPanelPitch(panelUrl), " Se fizer sentido, eu j\u00E1 te ajudo a assinar ou conectar o WhatsApp agora."));
}
