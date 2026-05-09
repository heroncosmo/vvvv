"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canConfirmSaveMediaPendingAction = canConfirmSaveMediaPendingAction;
exports.shouldAskForMediaResend = shouldAskForMediaResend;
exports.buildAskForMediaResendReply = buildAskForMediaResendReply;
function normalizeText(value) {
    return Array.from(String(value || "").toLowerCase().normalize("NFD"))
        .filter(function (char) {
        var code = char.charCodeAt(0);
        return code < 0x300 || code > 0x36f;
    })
        .join("")
        .trim();
}
function includesAny(text, tokens) {
    return tokens.some(function (token) { return text.includes(token); });
}
function canConfirmSaveMediaPendingAction(input) {
    var normalizedMediaType = normalizeText(String(input.mediaType || ""));
    if (normalizedMediaType === "flow") {
        var items = Array.isArray(input.flowItems) ? input.flowItems : [];
        if (!String(input.whenToUse || "").trim() || items.length < 2)
            return false;
        return items.every(function (item) {
            var itemType = normalizeText(String((item === null || item === void 0 ? void 0 : item.type) || ""));
            if (itemType === "text") {
                return Boolean(String((item === null || item === void 0 ? void 0 : item.text) || "").trim());
            }
            if (itemType === "media") {
                return Boolean(String((item === null || item === void 0 ? void 0 : item.mediaUrl) || (item === null || item === void 0 ? void 0 : item.storageUrl) || "").trim());
            }
            return false;
        });
    }
    return Boolean(String(input.mediaUrl || "").trim() &&
        String(input.whenToUse || "").trim());
}
function shouldAskForMediaResend(input) {
    var text = normalizeText(String(input.messageText || ""));
    if (!text)
        return false;
    var hasAvailableMedia = Boolean(String(input.mediaUrl || "").trim() ||
        String(input.pendingMediaUrl || "").trim() ||
        String(input.lastReceivedMediaUrl || "").trim());
    if (hasAvailableMedia)
        return false;
    var mentionsSaveIntent = includesAny(text, [
        "salva",
        "salvar",
        "guarda",
        "guardar",
        "cadastro",
        "cadastrar",
        "cadastra",
        "adiciona",
        "adicionar",
        "coloca essa",
        "colocar essa",
        "usa essa",
        "usar essa",
        "manda essa",
    ]);
    var mentionsMedia = includesAny(text, [
        "midia",
        "m?dia",
        "imagem",
        "foto",
        "audio",
        "a?udio",
        "video",
        "v?deo",
        "arquivo",
        "documento",
        "pdf",
    ]);
    return mentionsSaveIntent && mentionsMedia;
}
function buildAskForMediaResendReply() {
    return "Para eu salvar essa mídia no seu agente, preciso que você me reenvie o arquivo aqui. Se quiser, já me diga também quando ele deve ser usado.";
}
