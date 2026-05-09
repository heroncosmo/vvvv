"use strict";
/**
 * 🌐 WEBSITE SCRAPER SERVICE
 * Serviço para extrair dados de websites e alimentar o agente IA
 * Usa Playwright para sites dinâmicos e LLM configurado (Groq/Mistral) para processar o conteúdo
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeBrowser = closeBrowser;
exports.validateUrl = validateUrl;
exports.extractProductsWithMistral = extractProductsWithMistral;
exports.formatContextForAgent = formatContextForAgent;
exports.scrapeWebsite = scrapeWebsite;
var playwright_1 = require("playwright");
var llm_1 = require("./llm");
// ============================================================================
// CONFIGURAÇÕES
// ============================================================================
var SCRAPER_CONFIG = {
    timeout: 30000, // 30 segundos
    maxRetries: 3,
    maxTextLength: 50000, // Limitar texto extraído
    maxHtmlLength: 100000, // Limitar HTML armazenado
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};
// ============================================================================
// FUNÇÕES DE SCRAPING
// ============================================================================
var browser = null;
function getBrowser() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!!browser) return [3 /*break*/, 2];
                    return [4 /*yield*/, playwright_1.chromium.launch({
                            headless: true,
                            args: ["--no-sandbox", "--disable-setuid-sandbox"],
                        })];
                case 1:
                    browser = _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/, browser];
            }
        });
    });
}
function closeBrowser() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!browser) return [3 /*break*/, 2];
                    return [4 /*yield*/, browser.close()];
                case 1:
                    _a.sent();
                    browser = null;
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    });
}
/**
 * Valida se a URL é acessível e segura
 */
function validateUrl(url) {
    try {
        // Normalizar URL
        var normalizedUrl = url.trim();
        if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
            normalizedUrl = "https://" + normalizedUrl;
        }
        var parsed_1 = new URL(normalizedUrl);
        // Validações básicas
        if (!["http:", "https:"].includes(parsed_1.protocol)) {
            return { valid: false, error: "Protocolo inválido. Use http ou https." };
        }
        // Bloquear URLs suspeitas
        var blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "192.168.", "10.", "172."];
        if (blockedHosts.some(function (h) { return parsed_1.hostname.includes(h); })) {
            return { valid: false, error: "URL de rede local não permitida." };
        }
        return { valid: true, normalizedUrl: normalizedUrl };
    }
    catch (error) {
        return { valid: false, error: "URL inválida. Verifique o formato." };
    }
}
/**
 * Extrai texto limpo de uma página
 */
function extractTextFromPage(page) {
    return __awaiter(this, void 0, void 0, function () {
        var text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, page.evaluate(function () {
                        var _a;
                        // Remover elementos que não queremos
                        var removeSelectors = [
                            "script",
                            "style",
                            "noscript",
                            "iframe",
                            "nav",
                            "header",
                            "footer",
                            ".cookie-banner",
                            ".popup",
                            ".modal",
                            "#cookie",
                            ".advertisement",
                            ".ad",
                        ];
                        removeSelectors.forEach(function (selector) {
                            document.querySelectorAll(selector).forEach(function (el) { return el.remove(); });
                        });
                        // Extrair texto
                        return ((_a = document.body) === null || _a === void 0 ? void 0 : _a.innerText) || "";
                    })];
                case 1:
                    text = _a.sent();
                    // Limpar texto
                    return [2 /*return*/, text
                            .replace(/\s+/g, " ")
                            .replace(/\n+/g, "\n")
                            .trim()
                            .slice(0, SCRAPER_CONFIG.maxTextLength)];
            }
        });
    });
}
/**
 * Extrai JSON-LD de produtos (schema.org)
 */
function extractJsonLdProducts(page) {
    return __awaiter(this, void 0, void 0, function () {
        var products, jsonLdScripts, _i, jsonLdScripts_1, script, data, _a, _b, item, _c, _d, item, error_1;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    products = [];
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, page.$$eval('script[type="application/ld+json"]', function (scripts) {
                            return scripts.map(function (s) { return s.textContent; }).filter(Boolean);
                        })];
                case 2:
                    jsonLdScripts = _f.sent();
                    for (_i = 0, jsonLdScripts_1 = jsonLdScripts; _i < jsonLdScripts_1.length; _i++) {
                        script = jsonLdScripts_1[_i];
                        try {
                            data = JSON.parse(script || "{}");
                            // Verificar se é um produto ou lista de produtos
                            if (data["@type"] === "Product") {
                                products.push(parseJsonLdProduct(data));
                            }
                            else if (Array.isArray(data["@graph"])) {
                                for (_a = 0, _b = data["@graph"]; _a < _b.length; _a++) {
                                    item = _b[_a];
                                    if (item["@type"] === "Product") {
                                        products.push(parseJsonLdProduct(item));
                                    }
                                }
                            }
                            else if (data["@type"] === "ItemList" && data.itemListElement) {
                                for (_c = 0, _d = data.itemListElement; _c < _d.length; _c++) {
                                    item = _d[_c];
                                    if (item["@type"] === "Product" || ((_e = item.item) === null || _e === void 0 ? void 0 : _e["@type"]) === "Product") {
                                        products.push(parseJsonLdProduct(item.item || item));
                                    }
                                }
                            }
                        }
                        catch (_g) {
                            // Ignorar JSON inválido
                        }
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _f.sent();
                    console.error("[WebsiteScraper] Error extracting JSON-LD:", error_1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, products];
            }
        });
    });
}
function parseJsonLdProduct(data) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    var price = ((_a = data.offers) === null || _a === void 0 ? void 0 : _a.price) || ((_c = (_b = data.offers) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.price);
    var currency = ((_d = data.offers) === null || _d === void 0 ? void 0 : _d.priceCurrency) || ((_f = (_e = data.offers) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.priceCurrency) || "BRL";
    return {
        name: data.name || "",
        description: data.description || "",
        price: price ? "".concat(currency, " ").concat(price) : undefined,
        priceValue: price ? parseFloat(price) : undefined,
        currency: currency,
        category: data.category || ((_g = data.brand) === null || _g === void 0 ? void 0 : _g.name),
        imageUrl: Array.isArray(data.image) ? data.image[0] : data.image,
        availability: ((_h = data.offers) === null || _h === void 0 ? void 0 : _h.availability) || ((_k = (_j = data.offers) === null || _j === void 0 ? void 0 : _j[0]) === null || _k === void 0 ? void 0 : _k.availability),
    };
}
/**
 * Extrai produtos usando seletores comuns de e-commerce
 */
function extractProductsBySelectors(page) {
    return __awaiter(this, void 0, void 0, function () {
        var products, productSelectors, _i, productSelectors_1, selector, elements, _a, _b, element, product, _c, error_2;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    products = [];
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 12, , 13]);
                    productSelectors = [
                        ".product",
                        ".product-item",
                        ".product-card",
                        "[data-product]",
                        ".item-product",
                        ".produto",
                        ".card-produto",
                    ];
                    _i = 0, productSelectors_1 = productSelectors;
                    _d.label = 2;
                case 2:
                    if (!(_i < productSelectors_1.length)) return [3 /*break*/, 11];
                    selector = productSelectors_1[_i];
                    return [4 /*yield*/, page.$$(selector)];
                case 3:
                    elements = _d.sent();
                    _a = 0, _b = elements.slice(0, 50);
                    _d.label = 4;
                case 4:
                    if (!(_a < _b.length)) return [3 /*break*/, 9];
                    element = _b[_a];
                    _d.label = 5;
                case 5:
                    _d.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, element.evaluate(function (el) {
                            var _a, _b, _c;
                            // Tentar extrair nome
                            var nameEl = el.querySelector("h1, h2, h3, h4, .product-name, .product-title, .nome, .title") ||
                                el.querySelector("a[title]");
                            var name = ((_a = nameEl === null || nameEl === void 0 ? void 0 : nameEl.textContent) === null || _a === void 0 ? void 0 : _a.trim()) ||
                                (nameEl === null || nameEl === void 0 ? void 0 : nameEl.title) ||
                                "";
                            // Tentar extrair preço
                            var priceEl = el.querySelector(".price, .preco, .valor, [data-price], .product-price");
                            var priceText = ((_b = priceEl === null || priceEl === void 0 ? void 0 : priceEl.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || "";
                            // Extrair valor numérico do preço
                            var priceMatch = priceText.match(/[\d.,]+/);
                            var priceValue = priceMatch
                                ? parseFloat(priceMatch[0].replace(/\./g, "").replace(",", "."))
                                : undefined;
                            // Tentar extrair imagem
                            var imgEl = el.querySelector("img");
                            var imageUrl = (imgEl === null || imgEl === void 0 ? void 0 : imgEl.src) || (imgEl === null || imgEl === void 0 ? void 0 : imgEl.getAttribute("data-src")) || "";
                            // Tentar extrair descrição
                            var descEl = el.querySelector(".description, .descricao, .desc, p");
                            var description = ((_c = descEl === null || descEl === void 0 ? void 0 : descEl.textContent) === null || _c === void 0 ? void 0 : _c.trim()) || "";
                            return { name: name, priceText: priceText, priceValue: priceValue, imageUrl: imageUrl, description: description };
                        })];
                case 6:
                    product = _d.sent();
                    if (product.name && product.name.length > 2) {
                        products.push({
                            name: product.name,
                            description: product.description,
                            price: product.priceText,
                            priceValue: product.priceValue,
                            currency: "BRL",
                            imageUrl: product.imageUrl,
                        });
                    }
                    return [3 /*break*/, 8];
                case 7:
                    _c = _d.sent();
                    return [3 /*break*/, 8];
                case 8:
                    _a++;
                    return [3 /*break*/, 4];
                case 9:
                    if (products.length > 0)
                        return [3 /*break*/, 11]; // Se encontrou produtos, parar
                    _d.label = 10;
                case 10:
                    _i++;
                    return [3 /*break*/, 2];
                case 11: return [3 /*break*/, 13];
                case 12:
                    error_2 = _d.sent();
                    console.error("[WebsiteScraper] Error extracting by selectors:", error_2);
                    return [3 /*break*/, 13];
                case 13: return [2 /*return*/, products];
            }
        });
    });
}
/**
 * Extrai informações do negócio
 */
function extractBusinessInfo(page, text) {
    return __awaiter(this, void 0, void 0, function () {
        var info, jsonLdScripts, _i, jsonLdScripts_2, script, data, socialLinks, title, metaDesc, phoneMatch, emailMatch, error_3;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    info = {};
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 8, , 9]);
                    return [4 /*yield*/, page.$$eval('script[type="application/ld+json"]', function (scripts) {
                            return scripts.map(function (s) { return s.textContent; }).filter(Boolean);
                        })];
                case 2:
                    jsonLdScripts = _b.sent();
                    for (_i = 0, jsonLdScripts_2 = jsonLdScripts; _i < jsonLdScripts_2.length; _i++) {
                        script = jsonLdScripts_2[_i];
                        try {
                            data = JSON.parse(script || "{}");
                            if (data["@type"] === "Organization" || data["@type"] === "LocalBusiness") {
                                info.businessName = data.name;
                                info.businessDescription = data.description;
                                info.contactPhone = data.telephone;
                                info.contactEmail = data.email;
                                info.address = typeof data.address === "string"
                                    ? data.address
                                    : (_a = data.address) === null || _a === void 0 ? void 0 : _a.streetAddress;
                            }
                        }
                        catch (_c) {
                            // Ignorar
                        }
                    }
                    return [4 /*yield*/, page.$$eval("a[href]", function (links) {
                            var social = {};
                            var patterns = {
                                instagram: /instagram\.com/,
                                facebook: /facebook\.com/,
                                twitter: /twitter\.com|x\.com/,
                                youtube: /youtube\.com/,
                                linkedin: /linkedin\.com/,
                                whatsapp: /wa\.me|whatsapp/,
                            };
                            for (var _i = 0, links_1 = links; _i < links_1.length; _i++) {
                                var link = links_1[_i];
                                var href = link.href;
                                for (var _a = 0, _b = Object.entries(patterns); _a < _b.length; _a++) {
                                    var _c = _b[_a], name_1 = _c[0], pattern = _c[1];
                                    if (pattern.test(href) && !social[name_1]) {
                                        social[name_1] = href;
                                    }
                                }
                            }
                            return social;
                        })];
                case 3:
                    socialLinks = _b.sent();
                    if (Object.keys(socialLinks).length > 0) {
                        info.socialMedia = socialLinks;
                    }
                    if (!!info.businessName) return [3 /*break*/, 5];
                    return [4 /*yield*/, page.title()];
                case 4:
                    title = _b.sent();
                    info.businessName = title.split("|")[0].split("-")[0].trim();
                    _b.label = 5;
                case 5:
                    if (!!info.businessDescription) return [3 /*break*/, 7];
                    return [4 /*yield*/, page.$eval('meta[name="description"]', function (el) { return el.getAttribute("content"); }).catch(function () { return null; })];
                case 6:
                    metaDesc = _b.sent();
                    if (metaDesc) {
                        info.businessDescription = metaDesc;
                    }
                    _b.label = 7;
                case 7:
                    phoneMatch = text.match(/(?:\+55\s?)?(?:\(?\d{2}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}/);
                    if (phoneMatch && !info.contactPhone) {
                        info.contactPhone = phoneMatch[0];
                    }
                    emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
                    if (emailMatch && !info.contactEmail) {
                        info.contactEmail = emailMatch[0];
                    }
                    return [3 /*break*/, 9];
                case 8:
                    error_3 = _b.sent();
                    console.error("[WebsiteScraper] Error extracting business info:", error_3);
                    return [3 /*break*/, 9];
                case 9: return [2 /*return*/, info];
            }
        });
    });
}
// ============================================================================
// PROCESSAMENTO COM MISTRAL
// ============================================================================
/**
 * Usa Mistral para extrair produtos do texto quando JSON-LD não está disponível
 */
function extractProductsWithMistral(text) {
    return __awaiter(this, void 0, void 0, function () {
        var systemPrompt, response, jsonMatch, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    systemPrompt = "Voc\u00EA \u00E9 um especialista em extrair dados de produtos de textos de websites de e-commerce.\nAnalise o texto fornecido e extraia TODOS os produtos encontrados.\n\nIMPORTANTE:\n- Extraia APENAS produtos reais mencionados no texto\n- Inclua nome, pre\u00E7o (se dispon\u00EDvel), descri\u00E7\u00E3o curta\n- Retorne um JSON v\u00E1lido com array de produtos\n- Se n\u00E3o encontrar produtos, retorne array vazio []\n- M\u00E1ximo de 50 produtos\n\nFormato de resposta (JSON puro, sem markdown):\n[\n  {\n    \"name\": \"Nome do Produto\",\n    \"price\": \"R$ 99,90\",\n    \"priceValue\": 99.90,\n    \"description\": \"Descri\u00E7\u00E3o curta\",\n    \"category\": \"Categoria\"\n  }\n]";
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, llm_1.generateWithLLM)(systemPrompt, "Extraia os produtos deste texto de website:\n\n".concat(text.slice(0, 15000)), { maxTokens: 4000, temperature: 0.1 })];
                case 2:
                    response = _a.sent();
                    jsonMatch = response.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                        return [2 /*return*/, JSON.parse(jsonMatch[0])];
                    }
                    return [2 /*return*/, []];
                case 3:
                    error_4 = _a.sent();
                    console.error("[WebsiteScraper] Error extracting with LLM:", error_4);
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Formata o contexto extraído para usar no prompt do agente
 */
function formatContextForAgent(products, businessInfo, websiteUrl) {
    var context = "\n\n## \uD83D\uDCE6 CAT\u00C1LOGO DE PRODUTOS/SERVI\u00C7OS (Importado de: ".concat(websiteUrl, ")\n");
    // Informações do negócio
    if (businessInfo.businessName) {
        context += "\n### Sobre o Neg\u00F3cio\n";
        if (businessInfo.businessName)
            context += "- **Nome:** ".concat(businessInfo.businessName, "\n");
        if (businessInfo.businessDescription)
            context += "- **Descri\u00E7\u00E3o:** ".concat(businessInfo.businessDescription, "\n");
        if (businessInfo.contactPhone)
            context += "- **Telefone:** ".concat(businessInfo.contactPhone, "\n");
        if (businessInfo.contactEmail)
            context += "- **Email:** ".concat(businessInfo.contactEmail, "\n");
        if (businessInfo.address)
            context += "- **Endere\u00E7o:** ".concat(businessInfo.address, "\n");
        if (businessInfo.workingHours)
            context += "- **Hor\u00E1rio:** ".concat(businessInfo.workingHours, "\n");
        if (businessInfo.socialMedia && Object.keys(businessInfo.socialMedia).length > 0) {
            context += "- **Redes Sociais:**\n";
            for (var _i = 0, _a = Object.entries(businessInfo.socialMedia); _i < _a.length; _i++) {
                var _b = _a[_i], name_2 = _b[0], url = _b[1];
                context += "  - ".concat(name_2, ": ").concat(url, "\n");
            }
        }
    }
    // Lista de produtos
    if (products.length > 0) {
        context += "\n### Produtos/Servi\u00E7os Dispon\u00EDveis (".concat(products.length, " itens)\n");
        for (var _c = 0, products_1 = products; _c < products_1.length; _c++) {
            var product = products_1[_c];
            context += "\n**".concat(product.name, "**\n");
            if (product.price)
                context += "- Pre\u00E7o: ".concat(product.price, "\n");
            if (product.description)
                context += "- ".concat(product.description, "\n");
            if (product.category)
                context += "- Categoria: ".concat(product.category, "\n");
            if (product.availability)
                context += "- Disponibilidade: ".concat(product.availability, "\n");
        }
    }
    context += "\n---\n";
    context += "*Dados atualizados automaticamente via importa\u00E7\u00E3o de website.*\n";
    return context;
}
// ============================================================================
// FUNÇÃO PRINCIPAL DE SCRAPING
// ============================================================================
/**
 * Scrape um website e extrai dados estruturados
 */
function scrapeWebsite(url_1) {
    return __awaiter(this, arguments, void 0, function (url, retryCount) {
        var startTime, validation, normalizedUrl, page, browserInstance, extractedText, extractedHtml, limitedHtml, products, businessInfo, formattedContext, elapsed, error_5;
        if (retryCount === void 0) { retryCount = 0; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    startTime = Date.now();
                    validation = validateUrl(url);
                    if (!validation.valid) {
                        return [2 /*return*/, {
                                success: false,
                                websiteUrl: url,
                                extractedText: "",
                                products: [],
                                businessInfo: {},
                                formattedContext: "",
                                pagesScraped: 0,
                                productsFound: 0,
                                error: validation.error,
                            }];
                    }
                    normalizedUrl = validation.normalizedUrl;
                    console.log("[WebsiteScraper] Iniciando scraping de: ".concat(normalizedUrl));
                    page = null;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 16, 19, 22]);
                    return [4 /*yield*/, getBrowser()];
                case 2:
                    browserInstance = _a.sent();
                    return [4 /*yield*/, browserInstance.newPage()];
                case 3:
                    page = _a.sent();
                    // Configurar página
                    return [4 /*yield*/, page.setViewportSize({ width: 1920, height: 1080 })];
                case 4:
                    // Configurar página
                    _a.sent();
                    return [4 /*yield*/, page.setExtraHTTPHeaders({
                            "User-Agent": SCRAPER_CONFIG.userAgent,
                            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                        })];
                case 5:
                    _a.sent();
                    // Navegar para a página
                    return [4 /*yield*/, page.goto(normalizedUrl, {
                            waitUntil: "domcontentloaded",
                            timeout: SCRAPER_CONFIG.timeout,
                        })];
                case 6:
                    // Navegar para a página
                    _a.sent();
                    // Aguardar conteúdo carregar
                    return [4 /*yield*/, page.waitForTimeout(2000)];
                case 7:
                    // Aguardar conteúdo carregar
                    _a.sent();
                    return [4 /*yield*/, extractTextFromPage(page)];
                case 8:
                    extractedText = _a.sent();
                    console.log("[WebsiteScraper] Texto extra\u00EDdo: ".concat(extractedText.length, " chars"));
                    return [4 /*yield*/, page.content()];
                case 9:
                    extractedHtml = _a.sent();
                    limitedHtml = extractedHtml.slice(0, SCRAPER_CONFIG.maxHtmlLength);
                    return [4 /*yield*/, extractJsonLdProducts(page)];
                case 10:
                    products = _a.sent();
                    console.log("[WebsiteScraper] Produtos JSON-LD encontrados: ".concat(products.length));
                    if (!(products.length === 0)) return [3 /*break*/, 12];
                    return [4 /*yield*/, extractProductsBySelectors(page)];
                case 11:
                    products = _a.sent();
                    console.log("[WebsiteScraper] Produtos por seletores: ".concat(products.length));
                    _a.label = 12;
                case 12:
                    if (!(products.length === 0 && extractedText.length > 100)) return [3 /*break*/, 14];
                    console.log("[WebsiteScraper] Usando Mistral para extrair produtos...");
                    return [4 /*yield*/, extractProductsWithMistral(extractedText)];
                case 13:
                    products = _a.sent();
                    console.log("[WebsiteScraper] Produtos via Mistral: ".concat(products.length));
                    _a.label = 14;
                case 14: return [4 /*yield*/, extractBusinessInfo(page, extractedText)];
                case 15:
                    businessInfo = _a.sent();
                    formattedContext = formatContextForAgent(products, businessInfo, normalizedUrl);
                    elapsed = Date.now() - startTime;
                    console.log("[WebsiteScraper] Scraping completo em ".concat(elapsed, "ms"));
                    return [2 /*return*/, {
                            success: true,
                            websiteUrl: normalizedUrl,
                            websiteName: businessInfo.businessName,
                            websiteDescription: businessInfo.businessDescription,
                            extractedText: extractedText,
                            extractedHtml: limitedHtml,
                            products: products,
                            businessInfo: businessInfo,
                            formattedContext: formattedContext,
                            pagesScraped: 1,
                            productsFound: products.length,
                        }];
                case 16:
                    error_5 = _a.sent();
                    console.error("[WebsiteScraper] Erro:", error_5.message);
                    if (!(retryCount < SCRAPER_CONFIG.maxRetries - 1)) return [3 /*break*/, 18];
                    console.log("[WebsiteScraper] Tentativa ".concat(retryCount + 2, "/").concat(SCRAPER_CONFIG.maxRetries, "..."));
                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 2000 * (retryCount + 1)); })];
                case 17:
                    _a.sent();
                    return [2 /*return*/, scrapeWebsite(url, retryCount + 1)];
                case 18: return [2 /*return*/, {
                        success: false,
                        websiteUrl: url,
                        extractedText: "",
                        products: [],
                        businessInfo: {},
                        formattedContext: "",
                        pagesScraped: 0,
                        productsFound: 0,
                        error: "Falha ao acessar o site: ".concat(error_5.message),
                    }];
                case 19:
                    if (!page) return [3 /*break*/, 21];
                    return [4 /*yield*/, page.close().catch(function () { })];
                case 20:
                    _a.sent();
                    _a.label = 21;
                case 21: return [7 /*endfinally*/];
                case 22: return [2 /*return*/];
            }
        });
    });
}
/**
 * Fecha recursos quando o servidor encerrar
 */
process.on("beforeExit", function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, closeBrowser()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
