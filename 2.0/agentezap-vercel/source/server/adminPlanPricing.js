"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_PLAN_STANDARD_URL = exports.ADMIN_PLAN_PROMO_URL = exports.ADMIN_PLAN_ANNUAL_PRICE = exports.ADMIN_PLAN_STANDARD_MONTHLY_PRICE = exports.ADMIN_PLAN_PROMO_MONTHLY_PRICE = void 0;
exports.isDescribingOwnSalesFlow = isDescribingOwnSalesFlow;
exports.detectAdminPlanFocusFromText = detectAdminPlanFocusFromText;
exports.isAdminPlanRequest = isAdminPlanRequest;
exports.getAdminMonthlyPlanPrice = getAdminMonthlyPlanPrice;
exports.getAdminPlanDefaultUrl = getAdminPlanDefaultUrl;
exports.getAdminPlanSummary = getAdminPlanSummary;
exports.buildAdminPlanReplyText = buildAdminPlanReplyText;
exports.containsLegacyAdminPlanPricing = containsLegacyAdminPlanPricing;
exports.getAdminPlanPromptRules = getAdminPlanPromptRules;
exports.ADMIN_PLAN_PROMO_MONTHLY_PRICE = "R$49 por mes";
exports.ADMIN_PLAN_STANDARD_MONTHLY_PRICE = "R$99 por mes";
exports.ADMIN_PLAN_ANNUAL_PRICE = "R$599";
exports.ADMIN_PLAN_PROMO_URL = "https://agentezap.online/p/plano-promo-ilimitado-mensal-e805ee4e";
exports.ADMIN_PLAN_STANDARD_URL = "https://agentezap.online";
function normalizePlanText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[?!.,:;()"]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function buildPlanTokens(value) {
    return new Set(value.split(" ").map(function (token) { return token.trim(); }).filter(Boolean));
}
function countNormalizedIncludes(source, candidates) {
    var hits = 0;
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var candidate = candidates_1[_i];
        if (source.includes(candidate)) {
            hits += 1;
        }
    }
    return hits;
}
function isDescribingOwnSalesFlow(value) {
    var normalized = normalizePlanText(value);
    if (!normalized)
        return false;
    var words = normalized.split(" ").filter(Boolean);
    if (words.length < 25)
        return false;
    var explicitCommercialQuestionSignals = [
        "quanto custa",
        "qual o valor",
        "qual valor",
        "qual o preco",
        "qual preco",
        "me passa o valor",
        "me manda o valor",
        "me fala o valor",
        "me fala o preco",
        "valor mensal",
        "valor anual",
        "quero assinar",
        "quero contratar",
        "quero ativar",
        "plano mensal",
        "plano anual",
        "link de planos",
        "link do plano",
    ];
    if (explicitCommercialQuestionSignals.some(function (signal) { return normalized.includes(signal); })) {
        return false;
    }
    var flowSignals = [
        "funil",
        "fluxo",
        "sequencia",
        "roteiro",
        "automatizar",
        "automacao",
        "video",
        "videos",
        "audio",
        "audios",
        "depoimento",
        "depoimentos",
        "foto",
        "fotos",
        "saudacao",
        "facebook",
        "instagram",
        "whatsapp",
        "cliente chegou",
        "manda o audio",
        "manda o video",
        "depois",
        "no final",
    ];
    var ownershipSignals = [
        "eu quero",
        "eu queria",
        "eu mando",
        "quero fazer",
        "quero colocar",
        "meu audio",
        "meu video",
        "meu funil",
        "hoje esse e o meu funil",
        "a pessoa vai",
        "eu ja mando",
        "eu vou falar",
    ];
    return countNormalizedIncludes(normalized, flowSignals) >= 3
        && countNormalizedIncludes(normalized, ownershipSignals) >= 1;
}
function detectAdminPlanFocusFromText(value) {
    var normalized = normalizePlanText(value);
    if (!normalized)
        return "monthly";
    var tokens = buildPlanTokens(normalized);
    var asksAnnual = normalized.includes("12 meses") ||
        tokens.has("anual") ||
        tokens.has("ano") ||
        tokens.has("12x");
    var asksMonthly = normalized.includes("por mes") ||
        tokens.has("mensal") ||
        tokens.has("mensalidade") ||
        tokens.has("mes");
    if (asksAnnual && asksMonthly)
        return "both";
    if (asksAnnual)
        return "annual";
    return "monthly";
}
function isAdminPlanRequest(value) {
    var normalized = normalizePlanText(value);
    if (!normalized)
        return false;
    if (isDescribingOwnSalesFlow(normalized)) {
        return false;
    }
    return [
        "plano",
        "preco",
        "precos",
        "valor",
        "valores",
        "mensal",
        "mensalidade",
        "anual",
        "assinatura",
        "assinar",
        "contratar",
        "ativar",
        "fechar",
        "quanto custa",
        "quanto e",
        "quanto por mes",
        "quanto por ano",
    ].some(function (token) { return normalized.includes(token); });
}
function getAdminMonthlyPlanPrice(promo49) {
    if (promo49 === void 0) { promo49 = false; }
    return promo49 ? exports.ADMIN_PLAN_PROMO_MONTHLY_PRICE : exports.ADMIN_PLAN_STANDARD_MONTHLY_PRICE;
}
function getAdminPlanDefaultUrl(promo49) {
    if (promo49 === void 0) { promo49 = false; }
    return promo49 ? exports.ADMIN_PLAN_PROMO_URL : exports.ADMIN_PLAN_STANDARD_URL;
}
function getAdminPlanSummary(focus, promo49) {
    if (focus === void 0) { focus = "monthly"; }
    if (promo49 === void 0) { promo49 = false; }
    var monthlyPrice = getAdminMonthlyPlanPrice(promo49);
    switch (focus) {
        case "monthly":
            return "No mensal, fica *".concat(monthlyPrice, "*.");
        case "annual":
            return "No anual promocional, fica *".concat(exports.ADMIN_PLAN_ANNUAL_PRICE, "*.");
        default:
            return "No mensal, fica *".concat(monthlyPrice, "*. No anual promocional, fica *").concat(exports.ADMIN_PLAN_ANNUAL_PRICE, "*.");
    }
}
function buildAdminPlanReplyText(options) {
    var focus = (options === null || options === void 0 ? void 0 : options.focus) || "monthly";
    var promo49 = (options === null || options === void 0 ? void 0 : options.promo49) === true;
    var planLink = String((options === null || options === void 0 ? void 0 : options.link) || getAdminPlanDefaultUrl(promo49)).trim() || getAdminPlanDefaultUrl(promo49);
    var includeSupportLine = (options === null || options === void 0 ? void 0 : options.includeSupportLine) === true;
    var includeQuestionLine = (options === null || options === void 0 ? void 0 : options.includeQuestionLine) !== false;
    var text = "".concat(getAdminPlanSummary(focus, promo49), "\n\nVoce pode ver por aqui:\n").concat(planLink);
    if (includeSupportLine) {
        text += "\n\nSe quiser, eu tambem posso te orientar no proximo passo.";
    }
    if (includeQuestionLine) {
        text += "\n\nSe fizer sentido, eu tambem posso te mostrar como testar e conectar o WhatsApp.";
    }
    return text;
}
function containsLegacyAdminPlanPricing(text) {
    var normalized = normalizePlanText(text);
    if (!normalized)
        return false;
    return [
        "parc2026promo",
        "r$197",
        "r$97",
        "97/mes",
        "99/ano",
        "990",
        "só mensal mesmo",
        "so mensal mesmo",
        "https://agentezap.online/plans",
    ].some(function (token) { return normalized.includes(token); });
}
function getAdminPlanPromptRules() {
    return [
        "PLANOS E PRECOS:",
        "- Mensal padrao: ".concat(exports.ADMIN_PLAN_STANDARD_MONTHLY_PRICE),
        "- Mensal promocional para lead que citar a oferta de 49: ".concat(exports.ADMIN_PLAN_PROMO_MONTHLY_PRICE),
        "- Anual promocional: ".concat(exports.ADMIN_PLAN_ANNUAL_PRICE),
        "- Link promocional do mensal 49: ".concat(exports.ADMIN_PLAN_PROMO_URL),
        "- Link padrao do sistema: ".concat(exports.ADMIN_PLAN_STANDARD_URL),
        "- Se o cliente perguntar so de preco ou plano sem citar anual, responda apenas o mensal.",
        "- Use R$49 por mes somente quando o cliente vier do anuncio/oferta de 49 ou retomar claramente essa oferta na conversa.",
        "- Para os demais leads, o mensal padrao e R$99 por mes.",
        "- So mencione o anual promocional quando o cliente perguntar do anual.",
    ].join("\n");
}
