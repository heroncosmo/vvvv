"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🏗️ FLOW BUILDER - Construtor de Fluxos a partir de Prompts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Analisa prompts existentes (texto livre) e converte em FlowDefinitions
 * estruturadas para o sistema híbrido (IA Interpreta + Sistema Executa)
 *
 * TIPOS DE FLUXO:
 * - DELIVERY: Pizzarias, restaurantes, lanchonetes
 * - VENDAS: Agências, SaaS, serviços B2B
 * - AGENDAMENTO: Clínicas, salões, consultórios
 * - SUPORTE: SAC, help desk, suporte técnico
 * - GENERICO: Fallback para casos não identificados
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowBuilder = exports.PromptAnalyzer = void 0;
var sdk_1 = require("@anthropic-ai/sdk");
var llm_1 = require("./llm");
// ═══════════════════════════════════════════════════════════════════════
// 🔍 PROMPT ANALYZER - Analisa e classifica prompts
// ═══════════════════════════════════════════════════════════════════════
var PromptAnalyzer = /** @class */ (function () {
    function PromptAnalyzer() {
    }
    /**
     * Detecta o tipo de negócio baseado no prompt
     */
    PromptAnalyzer.prototype.detectFlowType = function (prompt) {
        var promptLower = prompt.toLowerCase();
        // DELIVERY: Palavras-chave de delivery/restaurante
        var deliveryKeywords = [
            'cardápio', 'menu', 'pizza', 'hamburguer', 'lanche', 'delivery',
            'entrega', 'pedido', 'carrinho', 'ifood', 'motoboy', 'comida',
            'restaurante', 'lanchonete', 'pizzaria', 'hamburgueria', 'açaí',
            'sobremesa', 'bebida', 'refrigerante', 'taxa de entrega', 'esfiha'
        ];
        // AGENDAMENTO: Palavras-chave de serviços agendados
        var agendamentoKeywords = [
            'agendar', 'agendamento', 'consulta', 'horário', 'disponível',
            'clínica', 'consultório', 'salão', 'barbearia', 'dentista',
            'médico', 'advogado', 'psicólogo', 'personal', 'academia',
            'aula', 'sessão', 'atendimento presencial'
        ];
        // VENDAS: Palavras-chave de vendas B2B/SaaS/Serviços
        var vendasKeywords = [
            'plano', 'assinatura', 'mensalidade', 'cupom', 'desconto',
            'demonstração', 'teste grátis', 'trial', 'implementação',
            'cadastro', 'conta', 'funcionalidade', 'feature', 'saas',
            'software', 'plataforma', 'sistema', 'ferramenta',
            // Serviços e Comércio
            'orçamento', 'honorário', 'contrat', 'serviço', 'venda', 'compra',
            'preço', 'valor', 'pagamento', 'pix', 'cartão',
            // Gráficas e lojas específicas
            'gráfica', 'banner', 'adesivo', 'impressão', 'copos', 'personalizado',
            'peças', 'conserto', 'moto', 'carro', 'loja', 'estoque',
            // Consultoria
            'assessoria', 'consultoria', 'cpf', 'cnpj', 'crédito', 'limpa nome'
        ];
        // SUPORTE: Palavras-chave de suporte técnico
        var suporteKeywords = [
            'suporte', 'ajuda', 'problema', 'erro', 'bug', 'ticket',
            'reclamação', 'dúvida técnica', 'não funciona', 'tutorial',
            'como usar', 'passo a passo', 'instalação', 'internet lenta',
            'modem', 'roteador', 'conexão', 'sinal', 'mbps'
        ];
        // CURSO: Palavras-chave de infoprodutos/cursos/mentorias
        var cursoKeywords = [
            'curso', 'aula', 'módulo', 'mentoria', 'treinamento', 'formação',
            'certificado', 'certificação', 'aprender', 'ensino', 'educação',
            'infoproduto', 'ebook', 'e-book', 'material didático', 'apostila',
            'aluno', 'estudante', 'professor', 'instrutor', 'mentor',
            'conteúdo exclusivo', 'acesso vitalício', 'área de membros',
            'hotmart', 'eduzz', 'monetizze', 'kiwify', 'udemy', 'coursera',
            'garantia', 'reembolso', 'satisfação', 'transformação', 'resultado',
            'método', 'metodologia', 'passo a passo', 'do zero', 'iniciante',
            'avançado', 'completo', 'masterclass', 'workshop', 'webinar',
            'comunidade', 'grupo vip', 'suporte ao aluno', 'bônus', 'brindes',
            'inscrição', 'matrícula', 'vaga', 'turma', 'liberação', 'acesso'
        ];
        // Contar matches
        var countMatches = function (keywords) {
            return keywords.filter(function (kw) { return promptLower.includes(kw); }).length;
        };
        var scores = {
            DELIVERY: countMatches(deliveryKeywords),
            AGENDAMENTO: countMatches(agendamentoKeywords),
            VENDAS: countMatches(vendasKeywords),
            SUPORTE: countMatches(suporteKeywords),
            CURSO: countMatches(cursoKeywords),
        };
        // Encontrar o tipo com maior score
        var maxScore = Math.max.apply(Math, Object.values(scores));
        if (maxScore === 0)
            return 'GENERICO';
        var topType = Object.entries(scores).find(function (_a) {
            var _ = _a[0], score = _a[1];
            return score === maxScore;
        });
        return (topType === null || topType === void 0 ? void 0 : topType[0]) || 'GENERICO';
    };
    /**
     * Extrai nome do agente do prompt
     */
    PromptAnalyzer.prototype.extractAgentName = function (prompt) {
        // Padrões comuns (em ordem de especificidade)
        var patterns = [
            /NOME DA IA:\s*(\w+)/i, // NOME DA IA: Thais
            /seu nome é\s+\*?\*?(\w+)\*?\*?/i, // Seu nome é Ana
            /você é \*?\*?(\w+)\*?\*?[,.\s]/i, // Você é **Rodrigo**,
            /sou (?:o |a )?(\w+)[,.\s]/i, // Sou o Rodrigo, Sou a Ana
            /me chamo (\w+)/i, // Me chamo X
            /meu nome é (\w+)/i, // Meu nome é X
            /\[(\w+)\]\s*-/i, // [Nome] - descrição
            /assistente.*?(?:é|chamada?)\s+\*?\*?(\w+)\*?\*?/i, // assistente...é Ana
        ];
        for (var _i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
            var pattern = patterns_1[_i];
            var match = prompt.match(pattern);
            if (match && match[1].length > 1 && match[1].toLowerCase() !== 'a' && match[1].toLowerCase() !== 'o') {
                return match[1];
            }
        }
        return 'Atendente';
    };
    /**
     * Extrai nome do negócio do prompt
     */
    PromptAnalyzer.prototype.extractBusinessName = function (prompt) {
        // Padrões comuns (em ordem de especificidade)
        var patterns = [
            /\*\*([A-Z][A-Za-z0-9\s&]+?)\*\*\s*[-–]/, // **Novo Sabor** -
            /(?:da|do|de)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+?)(?:\*?\*?[,.\n])/,
            /atendente (?:da|do|de)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
            /bem[- ]vindo (?:à|ao|a)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
            /especialista (?:da|do)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
            /(?:empresa|negócio|loja):\s*\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
        ];
        for (var _i = 0, patterns_2 = patterns; _i < patterns_2.length; _i++) {
            var pattern = patterns_2[_i];
            var match = prompt.match(pattern);
            if (match && match[1].trim().length > 2) {
                return match[1].trim();
            }
        }
        return 'Meu Negócio';
    };
    /**
     * Extrai preços mencionados no prompt
     */
    PromptAnalyzer.prototype.extractPrices = function (prompt) {
        var prices = {};
        // Padrão: R$ XX ou XX reais
        var pricePatterns = [
            /R\$\s?(\d+(?:[.,]\d{2})?)/gi,
            /(\d+(?:[.,]\d{2})?)\s*reais/gi,
        ];
        // Contextos de preço
        var contextPatterns = [
            { pattern: /plano.*?R\$\s?(\d+)/i, key: 'plano_mensal' },
            { pattern: /implementa[çc][aã]o.*?R\$\s?(\d+)/i, key: 'implementacao' },
            { pattern: /promo[çc][aã]o.*?R\$\s?(\d+)/i, key: 'promo' },
            { pattern: /cupom.*?R\$\s?(\d+)/i, key: 'desconto' },
            { pattern: /taxa.*?R\$\s?(\d+)/i, key: 'taxa_entrega' },
        ];
        for (var _i = 0, contextPatterns_1 = contextPatterns; _i < contextPatterns_1.length; _i++) {
            var _a = contextPatterns_1[_i], pattern = _a.pattern, key = _a.key;
            var match = prompt.match(pattern);
            if (match) {
                prices[key] = parseFloat(match[1].replace(',', '.'));
            }
        }
        return prices;
    };
    /**
     * Extrai links do prompt
     */
    PromptAnalyzer.prototype.extractLinks = function (prompt) {
        var links = {};
        // Encontrar todas URLs
        var urlPattern = /https?:\/\/[^\s\)]+/gi;
        var urls = prompt.match(urlPattern) || [];
        for (var _i = 0, urls_1 = urls; _i < urls_1.length; _i++) {
            var url = urls_1[_i];
            if (url.includes('cadastro') || url.includes('signup')) {
                links['cadastro'] = url;
            }
            else if (url.includes('promo') || url.includes('plano')) {
                links['promocao'] = url;
            }
            else if (url.includes('tutorial') || url.includes('video')) {
                links['tutorial'] = url;
            }
            else {
                links['site'] = url;
            }
        }
        return links;
    };
    /**
     * Extrai cupons do prompt
     */
    PromptAnalyzer.prototype.extractCoupons = function (prompt) {
        var coupons = {};
        // Padrão: código em MAIÚSCULAS
        var couponPattern = /cupom[:\s]+\*?\*?([A-Z0-9]+)\*?\*?/gi;
        var match;
        while ((match = couponPattern.exec(prompt)) !== null) {
            coupons[match[1]] = {
                code: match[1],
                discount: 0 // Será preenchido se encontrar contexto
            };
        }
        return coupons;
    };
    /**
     * Extrai personalidade/tom de voz
     */
    PromptAnalyzer.prototype.extractPersonality = function (prompt) {
        var traits = [];
        if (/informal|natural|humano/i.test(prompt))
            traits.push('informal');
        if (/formal|profissional/i.test(prompt))
            traits.push('formal');
        if (/amig[aá]vel|simpático/i.test(prompt))
            traits.push('amigável');
        if (/direto|objetivo/i.test(prompt))
            traits.push('direto');
        if (/empático|acolhedor/i.test(prompt))
            traits.push('empático');
        if (/divertido|descontraído/i.test(prompt))
            traits.push('descontraído');
        return traits.length > 0 ? traits.join(', ') : 'profissional e amigável';
    };
    /**
     * Extrai regras globais do prompt
     */
    PromptAnalyzer.prototype.extractGlobalRules = function (prompt) {
        var rules = [];
        // Padrões de regras: "NUNCA", "SEMPRE", "NÃO"
        var rulePatterns = [
            /NUNCA\s+(.+?)(?:\.|$)/gi,
            /SEMPRE\s+(.+?)(?:\.|$)/gi,
            /NÃO\s+(.+?)(?:\.|$)/gi,
            /IMPORTANTE:\s*(.+?)(?:\.|$)/gi,
            /REGRA[S]?:\s*(.+?)(?:\.|$)/gi,
        ];
        for (var _i = 0, rulePatterns_1 = rulePatterns; _i < rulePatterns_1.length; _i++) {
            var pattern = rulePatterns_1[_i];
            var match = void 0;
            while ((match = pattern.exec(prompt)) !== null) {
                rules.push(match[1].trim());
            }
        }
        return rules;
    };
    /**
     * 🎯 EXTRAI MENSAGEM CUSTOMIZADA OBRIGATÓRIA DO PROMPT
     * Detecta quando prompt exige mensagem inicial exata/específica
     */
    PromptAnalyzer.prototype.extractCustomGreeting = function (prompt) {
        // Padrões que indicam mensagem customizada obrigatória
        var patterns = [
            // "responder **exatamente** com..." (mais flexível)
            /responder\s+\*\*exatamente\*\*.*?:\s*\n+([\s\S]+)/i,
            // "primeira mensagem: (mensagem)"
            /primeira mensagem(?:\s+(?:de todas|sempre|inicial))?:\s*\n+([\s\S]+?)(?:\n\n\n|$)/i,
            // "sempre enviar: (mensagem)"
            /sempre enviar(?:\s+(?:a seguinte|esta))?(?:\s+mensagem)?:\s*\n+([\s\S]+?)(?:\n\n\n|$)/i,
            // "enviar sempre: (mensagem)"
            /enviar sempre(?:\s+(?:a seguinte|esta))?(?:\s+mensagem)?:\s*\n+([\s\S]+?)(?:\n\n\n|$)/i,
            // "mensagem inicial: (mensagem)"
            /mensagem inicial:\s*\n+([\s\S]+?)(?:\n\n\n|$)/i,
            // "Ignorar... responder com: (mensagem)"
            /Ignorar.*?responder.*?com.*?:\s*\n+([\s\S]+?)(?:\n\n\n|$)/i,
        ];
        for (var _i = 0, patterns_3 = patterns; _i < patterns_3.length; _i++) {
            var pattern = patterns_3[_i];
            var match = prompt.match(pattern);
            if (match && match[1]) {
                var message = match[1].trim();
                // Remover múltiplas quebras de linha no final
                message = message.replace(/\n{3,}$/g, '');
                // Validar que é realmente uma mensagem (> 20 chars, tem texto)
                if (message.length > 20 && /[a-záàâãéèêíïóôõöúçñ]/i.test(message)) {
                    console.log("[PromptAnalyzer] \uD83C\uDFAF Mensagem customizada detectada (".concat(message.length, " chars)"));
                    console.log("[PromptAnalyzer] Preview: ".concat(message.substring(0, 80), "..."));
                    return message;
                }
            }
        }
        return null;
    };
    return PromptAnalyzer;
}());
exports.PromptAnalyzer = PromptAnalyzer;
// ═══════════════════════════════════════════════════════════════════════
// 🏗️ FLOW BUILDER - Constrói FlowDefinitions
// ═══════════════════════════════════════════════════════════════════════
var FlowBuilder = /** @class */ (function () {
    function FlowBuilder(anthropicApiKey, mistralApiKey) {
        this.analyzer = new PromptAnalyzer();
        if (anthropicApiKey) {
            this.anthropic = new sdk_1.default({ apiKey: anthropicApiKey });
        }
        if (mistralApiKey) {
            this.mistralApiKey = mistralApiKey;
        }
    }
    /**
     * Constrói FlowDefinition a partir de um prompt existente
     */
    /**
     * 🤖 USA IA PARA EXTRAIR MENSAGEM CUSTOMIZADA DO PROMPT
     * Muito mais robusto que regex!
     * Usa o sistema centralizado de LLM (Groq/Mistral conforme config)
     */
    FlowBuilder.prototype.extractCustomGreetingWithAI = function (prompt) {
        return __awaiter(this, void 0, void 0, function () {
            var analysisPrompt, response, content, jsonMatch, result, error_1;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _e.trys.push([0, 2, , 3]);
                        console.log('[FlowBuilder] 🤖 Usando IA (sistema centralizado) para extrair mensagem customizada...');
                        analysisPrompt = "Analise o seguinte prompt de agente de IA e determine se ele cont\u00E9m uma MENSAGEM INICIAL CUSTOMIZADA OBRIGAT\u00D3RIA.\n\nPROMPT:\n\"\"\"\n".concat(prompt, "\n\"\"\"\n\nTAREFA:\n1. Identifique se o prompt especifica uma mensagem exata/espec\u00EDfica que DEVE ser enviada como primeira intera\u00E7\u00E3o\n2. Procure por frases como:\n   - \"responder exatamente com...\"\n   - \"primeira mensagem...\"\n   - \"sempre enviar...\"\n   - \"mensagem inicial...\"\n   - \"ignorar sauda\u00E7\u00E3o e responder com...\"\n\n3. Se encontrar, extraia TODA a mensagem customizada (incluindo emojis, formata\u00E7\u00E3o, quebras de linha)\n4. Se N\u00C3O encontrar mensagem customizada espec\u00EDfica, retorne null\n\nRESPONDA APENAS COM JSON V\u00C1LIDO:\n{\n  \"has_custom_greeting\": true/false,\n  \"greeting_message\": \"texto completo da mensagem\" ou null,\n  \"confidence\": 0-100\n}");
                        return [4 /*yield*/, (0, llm_1.chatComplete)({
                                messages: [{ role: 'user', content: analysisPrompt }],
                                temperature: 0.1,
                                maxTokens: 1000
                            })];
                    case 1:
                        response = _e.sent();
                        content = ((_d = (_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.trim()) || '{}';
                        jsonMatch = typeof content === 'string' ? content.match(/\{[\s\S]*\}/) : null;
                        result = JSON.parse(jsonMatch ? jsonMatch[0] : (typeof content === 'string' ? content : '{}'));
                        console.log("[FlowBuilder] \uD83E\uDD16 IA Analysis: has_custom=".concat(result.has_custom_greeting, ", confidence=").concat(result.confidence, "%"));
                        if (result.has_custom_greeting && result.confidence >= 70 && result.greeting_message) {
                            console.log("[FlowBuilder] \u2705 Mensagem customizada extra\u00EDda pela IA (".concat(result.greeting_message.length, " chars)"));
                            return [2 /*return*/, result.greeting_message];
                        }
                        return [2 /*return*/, null];
                    case 2:
                        error_1 = _e.sent();
                        console.error("[FlowBuilder] \u274C Erro ao usar IA para extrair mensagem:", error_1.message);
                        // Fallback para regex
                        console.log('[FlowBuilder] 🔄 Usando regex fallback...');
                        return [2 /*return*/, this.analyzer.extractCustomGreeting(prompt)];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    FlowBuilder.prototype.buildFromPrompt = function (prompt, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var flowType, agentName, businessName, personality, prices, links, coupons, globalRules, customGreeting, flow, _i, _a, state, _b, _c, transition, _d, _e, _f, actionKey, actionDef, isGreetingAction;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        console.log('[FlowBuilder] Analisando prompt...');
                        flowType = this.analyzer.detectFlowType(prompt);
                        console.log("[FlowBuilder] Tipo detectado: ".concat(flowType));
                        agentName = this.analyzer.extractAgentName(prompt);
                        businessName = this.analyzer.extractBusinessName(prompt);
                        personality = this.analyzer.extractPersonality(prompt);
                        prices = this.analyzer.extractPrices(prompt);
                        links = this.analyzer.extractLinks(prompt);
                        coupons = this.analyzer.extractCoupons(prompt);
                        globalRules = this.analyzer.extractGlobalRules(prompt);
                        return [4 /*yield*/, this.extractCustomGreetingWithAI(prompt)];
                    case 1:
                        customGreeting = _g.sent();
                        if (customGreeting) {
                            console.log("[FlowBuilder] \uD83C\uDFAF Mensagem customizada encontrada (".concat(customGreeting.length, " chars)"));
                        }
                        console.log("[FlowBuilder] Agente: ".concat(agentName, ", Neg\u00F3cio: ").concat(businessName));
                        switch (flowType) {
                            case 'DELIVERY':
                                flow = this.buildDeliveryFlow(agentName, businessName, personality);
                                break;
                            case 'VENDAS':
                                flow = this.buildVendasFlow(agentName, businessName, personality);
                                break;
                            case 'AGENDAMENTO':
                                flow = this.buildAgendamentoFlow(agentName, businessName, personality);
                                break;
                            case 'SUPORTE':
                                flow = this.buildSuporteFlow(agentName, businessName, personality);
                                break;
                            case 'CURSO':
                                flow = this.buildCursoFlow(agentName, businessName, personality);
                                break;
                            default:
                                flow = this.buildGenericoFlow(agentName, businessName, personality);
                        }
                        // 4. Enriquecer com dados extraídos
                        flow.data.prices = prices;
                        flow.data.links = links;
                        flow.data.coupons = coupons;
                        flow.globalRules = globalRules;
                        flow.sourcePrompt = prompt;
                        // 🎯 CRÍTICO: Sobrescrever TODAS as ações de saudação quando há mensagem customizada
                        if (customGreeting) {
                            console.log("[FlowBuilder] \u2705 Aplicando sauda\u00E7\u00E3o customizada no flow inteiro");
                            // 1) Atualiza descrição do estado inicial (independente do nome do estado)
                            if (flow.states[flow.initialState]) {
                                flow.states[flow.initialState].description = customGreeting;
                            }
                            // 2) Cria ação dedicada de saudação customizada
                            flow.actions.GREET_CUSTOM = {
                                name: 'Saudação Customizada',
                                type: 'RESPONSE',
                                template: customGreeting
                            };
                            // 3) Reaponta transições de GREETING para GREET_CUSTOM
                            for (_i = 0, _a = Object.values(flow.states); _i < _a.length; _i++) {
                                state = _a[_i];
                                if (!Array.isArray(state.transitions))
                                    continue;
                                for (_b = 0, _c = state.transitions; _b < _c.length; _b++) {
                                    transition = _c[_b];
                                    if (transition.intent === 'GREETING') {
                                        transition.action = 'GREET_CUSTOM';
                                    }
                                }
                            }
                            // 4) Hardening: qualquer ação de saudação já existente passa a usar o mesmo template
                            for (_d = 0, _e = Object.entries(flow.actions); _d < _e.length; _d++) {
                                _f = _e[_d], actionKey = _f[0], actionDef = _f[1];
                                isGreetingAction = /greet|sauda|welcome/i.test(actionKey) || /greet|sauda|welcome/i.test(actionDef.name || '');
                                if (isGreetingAction && actionDef.type === 'RESPONSE') {
                                    actionDef.template = customGreeting;
                                }
                            }
                        }
                        if (!this.anthropic) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.enrichWithAI(flow, prompt)];
                    case 2:
                        flow = _g.sent();
                        _g.label = 3;
                    case 3: return [2 /*return*/, flow];
                }
            });
        });
    };
    /**
     * Constrói flow de DELIVERY (pizzarias, restaurantes)
     */
    FlowBuilder.prototype.buildDeliveryFlow = function (agentName, businessName, personality) {
        return {
            id: "delivery_".concat(Date.now()),
            version: '1.0.0',
            type: 'DELIVERY',
            businessName: businessName,
            agentName: agentName,
            agentPersonality: personality,
            initialState: 'INICIO',
            finalStates: ['PEDIDO_FINALIZADO', 'CANCELADO'],
            states: {
                INICIO: {
                    name: 'Início',
                    description: 'Aguardando primeira mensagem',
                    transitions: [
                        { intent: 'GREETING', nextState: 'SAUDACAO', action: 'GREET' },
                        { intent: 'WANT_MENU', nextState: 'MENU', action: 'SHOW_MENU' },
                        { intent: 'ADD_ITEM', nextState: 'PEDINDO', action: 'ADD_TO_CART' },
                    ]
                },
                SAUDACAO: {
                    name: 'Saudação',
                    description: 'Cliente acabou de chegar',
                    transitions: [
                        { intent: 'WANT_MENU', nextState: 'MENU', action: 'SHOW_MENU' },
                        { intent: 'ADD_ITEM', nextState: 'PEDINDO', action: 'ADD_TO_CART' },
                        { intent: 'ASK_HOURS', nextState: 'SAUDACAO', action: 'INFO_HOURS' },
                        { intent: 'ASK_DELIVERY_FEE', nextState: 'SAUDACAO', action: 'INFO_FEE' },
                    ]
                },
                MENU: {
                    name: 'Menu',
                    description: 'Mostrando cardápio',
                    transitions: [
                        { intent: 'ADD_ITEM', nextState: 'PEDINDO', action: 'ADD_TO_CART' },
                        { intent: 'ASK_PRODUCT_INFO', nextState: 'MENU', action: 'PRODUCT_INFO' },
                    ]
                },
                PEDINDO: {
                    name: 'Fazendo Pedido',
                    description: 'Cliente adicionando itens',
                    transitions: [
                        { intent: 'ADD_ITEM', nextState: 'PEDINDO', action: 'ADD_TO_CART' },
                        { intent: 'REMOVE_ITEM', nextState: 'PEDINDO', action: 'REMOVE_FROM_CART' },
                        { intent: 'SEE_CART', nextState: 'PEDINDO', action: 'SHOW_CART' },
                        { intent: 'CONFIRM_ORDER', nextState: 'TIPO_ENTREGA', action: 'ASK_DELIVERY_TYPE' },
                        { intent: 'CANCEL_ORDER', nextState: 'CANCELADO', action: 'CANCEL' },
                        { intent: 'CHOOSE_DELIVERY', nextState: 'ENDERECO', action: 'ASK_ADDRESS' },
                        { intent: 'CHOOSE_PICKUP', nextState: 'PAGAMENTO', action: 'ASK_PAYMENT' },
                    ]
                },
                TIPO_ENTREGA: {
                    name: 'Tipo de Entrega',
                    description: 'Escolhendo delivery ou retirada',
                    transitions: [
                        { intent: 'CHOOSE_DELIVERY', nextState: 'ENDERECO', action: 'ASK_ADDRESS' },
                        { intent: 'CHOOSE_PICKUP', nextState: 'PAGAMENTO', action: 'ASK_PAYMENT' },
                    ]
                },
                ENDERECO: {
                    name: 'Endereço',
                    description: 'Coletando endereço',
                    transitions: [
                        { intent: 'PROVIDE_ADDRESS', nextState: 'PAGAMENTO', action: 'SAVE_ADDRESS' },
                        { intent: 'CHOOSE_PAYMENT', nextState: 'CONFIRMACAO', action: 'SHOW_SUMMARY' },
                    ]
                },
                PAGAMENTO: {
                    name: 'Pagamento',
                    description: 'Escolhendo forma de pagamento',
                    transitions: [
                        { intent: 'CHOOSE_PAYMENT', nextState: 'CONFIRMACAO', action: 'SHOW_SUMMARY' },
                        { intent: 'PROVIDE_ADDRESS', nextState: 'PAGAMENTO', action: 'SAVE_ADDRESS' },
                    ]
                },
                CONFIRMACAO: {
                    name: 'Confirmação',
                    description: 'Confirmando pedido',
                    transitions: [
                        { intent: 'CONFIRM_ORDER', nextState: 'PEDIDO_FINALIZADO', action: 'CREATE_ORDER' },
                        { intent: 'CANCEL_ORDER', nextState: 'CANCELADO', action: 'CANCEL' },
                    ]
                },
                PEDIDO_FINALIZADO: {
                    name: 'Pedido Finalizado',
                    description: 'Pedido criado com sucesso',
                    transitions: []
                },
                CANCELADO: {
                    name: 'Cancelado',
                    description: 'Pedido cancelado',
                    transitions: [
                        { intent: 'GREETING', nextState: 'INICIO', action: 'GREET' },
                    ]
                }
            },
            intents: {
                GREETING: {
                    name: 'Saudação',
                    examples: ['oi', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'e aí', 'eai', 'opa'],
                    patterns: ['^(oi|ola|bom\\s+dia|boa\\s+(tarde|noite)|e\\s*a[ií]|opa)[!?.,]?$'],
                    priority: 10
                },
                WANT_MENU: {
                    name: 'Ver Cardápio',
                    examples: ['cardápio', 'menu', 'o que tem', 'quais opções', 'me manda o cardápio'],
                    patterns: ['card[áa]pio', 'menu', 'o\\s+que\\s+tem', 'op[çc][õo]es'],
                    priority: 8
                },
                ADD_ITEM: {
                    name: 'Adicionar Item',
                    examples: ['quero', 'me vê', 'manda', 'adiciona', 'pode ser', 'quero uma', 'quero mais'],
                    patterns: ['quero\\s+(uma?|\\d+)', 'me\\s+v[êe]', 'adiciona', 'manda\\s+(uma?|\\d+)'],
                    entities: ['product', 'quantity'],
                    priority: 9
                },
                REMOVE_ITEM: {
                    name: 'Remover Item',
                    examples: ['tira', 'remove', 'sem', 'não quero mais'],
                    patterns: ['tira', 'remove', 'n[ãa]o\\s+quero\\s+mais'],
                    entities: ['product'],
                    priority: 7
                },
                SEE_CART: {
                    name: 'Ver Carrinho',
                    examples: ['meu pedido', 'o que pedi', 'meu carrinho', 'total', 'ver pedido'],
                    patterns: ['meu\\s+pedido', 'o\\s+que\\s+pedi', 'carrinho', 'ver\\s+pedido'],
                    priority: 6
                },
                CONFIRM_ORDER: {
                    name: 'Confirmar',
                    examples: ['isso', 'fechado', 'pode fechar', 'confirma', 'ok', 'fechar pedido', 'finalizar'],
                    patterns: ['fechado?', 'confirma', 'finaliza', '^ok$', '^isso$'],
                    priority: 8
                },
                CANCEL_ORDER: {
                    name: 'Cancelar',
                    examples: ['cancela', 'desisto', 'não quero', 'deixa pra lá'],
                    patterns: ['cancela', 'desisto', 'deixa\\s+pra\\s+l[áa]'],
                    priority: 8
                },
                CHOOSE_DELIVERY: {
                    name: 'Delivery',
                    examples: ['delivery', 'entrega', 'manda pra mim', 'quero entrega', 'entregar'],
                    patterns: ['^delivery$', 'entrega', 'manda\\s+pra\\s+mim', 'entregar'],
                    priority: 7
                },
                CHOOSE_PICKUP: {
                    name: 'Retirada',
                    examples: ['buscar', 'retirar', 'retirada', 'vou ai', 'vou buscar', 'retiro'],
                    patterns: ['buscar', 'retirar', 'retirada', 'vou\\s+a[íi]', 'retiro'],
                    priority: 7
                },
                PROVIDE_ADDRESS: {
                    name: 'Endereço',
                    examples: ['rua', 'avenida', 'número'],
                    patterns: ['rua\\s+', 'avenida\\s+', 'av\\.?\\s+', 'n[úu]mero\\s+\\d+', 'n[ºo]\\s*\\d+'],
                    entities: ['address'],
                    priority: 6
                },
                CHOOSE_PAYMENT: {
                    name: 'Pagamento',
                    examples: ['pix', 'dinheiro', 'cartão', 'pago em', 'vou pagar'],
                    patterns: ['^pix$', '^dinheiro$', 'cart[ãa]o', 'pago\\s+em', 'vou\\s+pagar'],
                    entities: ['payment_method'],
                    priority: 7
                },
                ASK_HOURS: {
                    name: 'Horário',
                    examples: ['horário', 'abre', 'fecha', 'funciona'],
                    patterns: ['hor[áa]rio', 'abre', 'fecha', 'funciona'],
                    priority: 5
                },
                ASK_DELIVERY_FEE: {
                    name: 'Taxa',
                    examples: ['taxa', 'frete', 'quanto a entrega'],
                    patterns: ['taxa', 'frete', 'quanto\\s+(a|custa)\\s+entrega'],
                    priority: 5
                },
                ASK_PRODUCT_INFO: {
                    name: 'Info Produto',
                    examples: ['quanto custa', 'tem', 'qual o preço'],
                    patterns: ['quanto\\s+custa', 'qual\\s+o?\\s*pre[çc]o'],
                    entities: ['product'],
                    priority: 6
                },
            },
            actions: {
                GREET: {
                    name: 'Saudar',
                    type: 'RESPONSE',
                    template: 'Olá! 😊 Bem-vindo ao {business_name}! Posso te enviar nosso cardápio ou você já sabe o que quer pedir?',
                    variables: ['business_name']
                },
                SHOW_MENU: {
                    name: 'Mostrar Menu',
                    type: 'DATA',
                    dataSource: 'menu',
                    template: 'Olá! Essas são nossas opções:\n\n{menu_formatted}\n\nQual você gostaria de pedir?'
                },
                ADD_TO_CART: {
                    name: 'Adicionar ao Carrinho',
                    type: 'DATA',
                    template: '✅ Adicionei {quantity}x {product}!\n\n🛒 Seu pedido:\n{cart_summary}\n\n💰 Total: R$ {total}\n\nMais algo ou posso fechar?'
                },
                SHOW_CART: {
                    name: 'Mostrar Carrinho',
                    type: 'DATA',
                    template: '🛒 *Seu Pedido:*\n\n{cart_summary}\n\n💰 Total: R$ {total}'
                },
                ASK_DELIVERY_TYPE: {
                    name: 'Perguntar Tipo Entrega',
                    type: 'RESPONSE',
                    template: '🛵 Vai ser *delivery* ou *retirada* no local?'
                },
                ASK_ADDRESS: {
                    name: 'Perguntar Endereço',
                    type: 'RESPONSE',
                    template: '📍 Qual seu endereço de entrega?'
                },
                SAVE_ADDRESS: {
                    name: 'Salvar Endereço',
                    type: 'DATA',
                    template: '📍 Entrega em: {address}\n\n💳 Como vai pagar? (Pix, Cartão ou Dinheiro)'
                },
                ASK_PAYMENT: {
                    name: 'Perguntar Pagamento',
                    type: 'RESPONSE',
                    template: '💳 Como vai pagar? (Pix, Cartão ou Dinheiro)'
                },
                SHOW_SUMMARY: {
                    name: 'Mostrar Resumo',
                    type: 'DATA',
                    template: '📋 *RESUMO DO PEDIDO*\n\n{cart_summary}\n\n🛵 {delivery_type}\n📍 {address}\n💳 {payment_method}\n\n💰 *TOTAL: R$ {total}*\n\n✅ Confirma?'
                },
                CREATE_ORDER: {
                    name: 'Criar Pedido',
                    type: 'EXTERNAL',
                    template: '🎉 Pedido #{order_id} confirmado!\n\n⏱️ {delivery_time}\n\nObrigado pela preferência! 😊'
                },
                CANCEL: {
                    name: 'Cancelar',
                    type: 'RESPONSE',
                    template: 'Pedido cancelado! Se mudar de ideia é só chamar 😊'
                },
                INFO_HOURS: {
                    name: 'Informar Horário',
                    type: 'DATA',
                    dataSource: 'business_hours',
                    template: '🕐 Nosso horário: {hours}'
                },
                INFO_FEE: {
                    name: 'Informar Taxa',
                    type: 'DATA',
                    dataSource: 'delivery_fee',
                    template: '🛵 Taxa de entrega: R$ {delivery_fee}'
                },
            },
            data: {
                menu: [],
                payment_methods: ['Pix', 'Cartão', 'Dinheiro'],
                delivery_fee: 5,
                min_order: 20,
                delivery_time: '40-60 min',
            },
            globalRules: [
                'Nunca inventar produtos que não estão no cardápio',
                'Sempre confirmar o pedido antes de finalizar',
                'Ser simpático e usar emojis moderadamente'
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    };
    /**
     * Constrói flow de VENDAS (SaaS, agências, B2B)
     */
    FlowBuilder.prototype.buildVendasFlow = function (agentName, businessName, personality) {
        return {
            id: "vendas_".concat(Date.now()),
            version: '1.0.0',
            type: 'VENDAS',
            businessName: businessName,
            agentName: agentName,
            agentPersonality: personality,
            initialState: 'INICIO',
            finalStates: ['CADASTRADO', 'NAO_INTERESSADO'],
            states: {
                INICIO: {
                    name: 'Início',
                    description: 'Primeira interação',
                    transitions: [
                        { intent: 'GREETING', nextState: 'QUALIFICANDO', action: 'GREET_SALES' },
                        { intent: 'ASK_HOW_WORKS', nextState: 'EXPLICANDO', action: 'EXPLAIN_SOLUTION' },
                        { intent: 'ASK_PRICE', nextState: 'PRECOS', action: 'SHOW_PRICES' },
                    ]
                },
                QUALIFICANDO: {
                    name: 'Qualificando',
                    description: 'Entendendo necessidade',
                    transitions: [
                        { intent: 'TELL_BUSINESS', nextState: 'EXPLICANDO', action: 'PERSONALIZE_PITCH' },
                        { intent: 'ASK_HOW_WORKS', nextState: 'EXPLICANDO', action: 'EXPLAIN_SOLUTION' },
                        { intent: 'ASK_PRICE', nextState: 'PRECOS', action: 'SHOW_PRICES' },
                        { intent: 'WANT_DEMO', nextState: 'DEMO', action: 'OFFER_TRIAL' },
                    ]
                },
                EXPLICANDO: {
                    name: 'Explicando',
                    description: 'Explicando a solução',
                    transitions: [
                        { intent: 'ASK_PRICE', nextState: 'PRECOS', action: 'SHOW_PRICES' },
                        { intent: 'ASK_FEATURES', nextState: 'EXPLICANDO', action: 'EXPLAIN_FEATURES' },
                        { intent: 'WANT_DEMO', nextState: 'DEMO', action: 'OFFER_TRIAL' },
                        { intent: 'ASK_TECHNICAL', nextState: 'EXPLICANDO', action: 'ANSWER_TECHNICAL' },
                    ]
                },
                PRECOS: {
                    name: 'Preços',
                    description: 'Falando sobre valores',
                    transitions: [
                        { intent: 'ASK_COUPON', nextState: 'PRECOS', action: 'EXPLAIN_COUPON' },
                        { intent: 'ASK_PROMO', nextState: 'PRECOS', action: 'SHOW_PROMO' },
                        { intent: 'ASK_IMPLEMENTATION', nextState: 'PRECOS', action: 'EXPLAIN_IMPL' },
                        { intent: 'WANT_DEMO', nextState: 'DEMO', action: 'OFFER_TRIAL' },
                        { intent: 'CONFIRM', nextState: 'FECHANDO', action: 'CLOSE_SALE' },
                    ]
                },
                DEMO: {
                    name: 'Demo',
                    description: 'Oferecendo teste',
                    transitions: [
                        { intent: 'CONFIRM', nextState: 'CADASTRADO', action: 'SEND_SIGNUP_LINK' },
                        { intent: 'ASK_PRICE', nextState: 'PRECOS', action: 'SHOW_PRICES' },
                    ]
                },
                FECHANDO: {
                    name: 'Fechando',
                    description: 'Fechando venda',
                    transitions: [
                        { intent: 'CONFIRM', nextState: 'CADASTRADO', action: 'SEND_SIGNUP_LINK' },
                        { intent: 'OBJECTION', nextState: 'EXPLICANDO', action: 'HANDLE_OBJECTION' },
                    ]
                },
                CADASTRADO: {
                    name: 'Cadastrado',
                    description: 'Cliente se cadastrou',
                    transitions: [
                        { intent: 'ASK_HELP', nextState: 'CADASTRADO', action: 'OFFER_SUPPORT' },
                    ]
                },
                NAO_INTERESSADO: {
                    name: 'Não Interessado',
                    description: 'Cliente não quis',
                    transitions: [
                        { intent: 'GREETING', nextState: 'INICIO', action: 'GREET_SALES' },
                    ]
                }
            },
            intents: {
                GREETING: {
                    name: 'Saudação',
                    examples: ['oi', 'olá', 'bom dia', 'vi seu anúncio'],
                    priority: 10
                },
                ASK_HOW_WORKS: {
                    name: 'Como Funciona',
                    examples: ['como funciona', 'o que faz', 'me explica', 'quero entender'],
                    priority: 9
                },
                ASK_PRICE: {
                    name: 'Preço',
                    examples: ['quanto custa', 'qual o valor', 'preço', 'quanto é'],
                    priority: 9
                },
                ASK_PROMO: {
                    name: 'Promoção',
                    examples: ['promoção', 'desconto', 'vi o anúncio de', 'R$49'],
                    priority: 8
                },
                ASK_COUPON: {
                    name: 'Cupom',
                    examples: ['cupom', 'onde coloco', 'código', 'não funciona'],
                    priority: 7
                },
                ASK_IMPLEMENTATION: {
                    name: 'Implementação',
                    examples: ['implementação', 'vocês configuram', 'setup', 'R$199'],
                    priority: 7
                },
                ASK_FEATURES: {
                    name: 'Funcionalidades',
                    examples: ['funcionalidades', 'o que tem', 'recursos', 'features'],
                    priority: 6
                },
                ASK_TECHNICAL: {
                    name: 'Técnico',
                    examples: ['precisa', 'PC ligado', 'integra', 'como configura'],
                    priority: 6
                },
                WANT_DEMO: {
                    name: 'Quer Demo',
                    examples: ['quero testar', 'como testo', 'tem trial', 'teste grátis'],
                    priority: 8
                },
                TELL_BUSINESS: {
                    name: 'Conta Negócio',
                    examples: ['sou', 'tenho', 'minha empresa', 'trabalho com'],
                    entities: ['business_type'],
                    priority: 5
                },
                CONFIRM: {
                    name: 'Confirmar',
                    examples: ['quero', 'vou cadastrar', 'ok', 'fechado', 'pode ser'],
                    priority: 8
                },
                OBJECTION: {
                    name: 'Objeção',
                    examples: ['caro', 'não sei', 'vou pensar', 'depois'],
                    priority: 5
                },
                ASK_HELP: {
                    name: 'Pedir Ajuda',
                    examples: ['ajuda', 'não consigo', 'como faço', 'dúvida'],
                    priority: 7
                },
            },
            actions: {
                GREET_SALES: {
                    name: 'Saudar Vendas',
                    type: 'RESPONSE',
                    template: 'Opa, tudo bom? {agent_name} aqui da {business_name}! Me conta, você tá buscando automatizar o atendimento?'
                },
                EXPLAIN_SOLUTION: {
                    name: 'Explicar Solução',
                    type: 'RESPONSE',
                    template: 'A gente configura uma IA que atende seus clientes no Zap, tira dúvidas e até agenda horários. É como ter um funcionário 24h, mas sem custo trabalhista, sabe? Quer ver funcionando ou prefere criar uma conta grátis pra testar?'
                },
                SHOW_PRICES: {
                    name: 'Mostrar Preços',
                    type: 'DATA',
                    dataSource: 'prices',
                    template: 'O plano ilimitado é R${price_standard}/mês. Mas com o cupom {coupon_code} você garante por R${price_promo}/mês! Quer testar grátis primeiro? {signup_link}'
                },
                SHOW_PROMO: {
                    name: 'Mostrar Promo',
                    type: 'DATA',
                    template: 'Isso mesmo! O plano ilimitado sai por R${price_promo}/mês usando o cupom {coupon_code}. Você cria a conta, testa de graça e, se curtir, ativa com esse desconto. Bora testar? {signup_link}'
                },
                EXPLAIN_COUPON: {
                    name: 'Explicar Cupom',
                    type: 'RESPONSE',
                    template: 'O cupom {coupon_code} é usado na hora de ativar o plano. Primeiro cria sua conta grátis, depois acessa Planos e clica em "Plano Exclusivo". Ali você insere o cupom pra garantir R${price_promo}/mês!'
                },
                EXPLAIN_IMPL: {
                    name: 'Explicar Implementação',
                    type: 'DATA',
                    template: 'A implementação é R${impl_price} (pagamento único). Nossa equipe deixa tudo pronto: treina a IA, cadastra produtos e te entrega rodando. Ideal se você tá sem tempo. Mas se quiser configurar sozinho, é bem fácil também!'
                },
                OFFER_TRIAL: {
                    name: 'Oferecer Trial',
                    type: 'RESPONSE',
                    template: 'Cria sua conta grátis pra testar: {signup_link}\n\nSem cartão, só testar! Qualquer dúvida me chama aqui.'
                },
                SEND_SIGNUP_LINK: {
                    name: 'Enviar Link Cadastro',
                    type: 'RESPONSE',
                    template: '✅ Perfeito! Acessa aqui: {signup_link}\n\nSe usar o cupom {coupon_code}, garante o preço de R${price_promo}/mês! Me avisa quando criar a conta que te ajudo com o próximo passo.'
                },
                CLOSE_SALE: {
                    name: 'Fechar Venda',
                    type: 'RESPONSE',
                    template: 'Show! Então só acessar {signup_link} e criar sua conta. Lá em Planos, usa o cupom {coupon_code} e o mensal cai de R${price_standard} pra R${price_promo}. Me avisa quando finalizar!'
                },
                HANDLE_OBJECTION: {
                    name: 'Tratar Objeção',
                    type: 'RESPONSE',
                    template: 'Entendo! O bom é que você pode testar grátis sem compromisso. Se não fizer sentido pro seu negócio, zero custo. Mas geralmente quem testa não quer largar mais, sabe? 😄'
                },
                OFFER_SUPPORT: {
                    name: 'Oferecer Suporte',
                    type: 'RESPONSE',
                    template: 'Qualquer dúvida de configuração me chama aqui! Posso te mandar vídeos tutoriais também se preferir.'
                },
                ANSWER_TECHNICAL: {
                    name: 'Responder Técnico',
                    type: 'RESPONSE',
                    template: 'Não precisa deixar PC ligado! Funciona 100% na nuvem. Você configura uma vez e pronto - o agente atende 24h automaticamente.'
                },
                PERSONALIZE_PITCH: {
                    name: 'Personalizar Pitch',
                    type: 'RESPONSE',
                    template: 'Legal! Pra {business_type} a IA ajuda muito com {benefit}. Quer que eu te mostre um exemplo de como funcionaria pro seu negócio?'
                },
            },
            data: {
                prices: { standard: 99, promo: 49 },
                links: { signup: 'https://agentezap.online/' },
                coupons: { PARC2026PROMO: { code: 'PARC2026PROMO', discount: 50 } },
                faq: [],
            },
            globalRules: [
                'Nunca usar termos técnicos como "tokens", "LLM", "GPT"',
                'Sempre mencionar o cupom quando falar de preço promocional',
                'Implementação é pagamento ÚNICO, não mensal',
                'Sempre incentivar o teste grátis primeiro'
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    };
    /**
     * Constrói flow de AGENDAMENTO (clínicas, salões)
     */
    FlowBuilder.prototype.buildAgendamentoFlow = function (agentName, businessName, personality) {
        return {
            id: "agendamento_".concat(Date.now()),
            version: '1.0.0',
            type: 'AGENDAMENTO',
            businessName: businessName,
            agentName: agentName,
            agentPersonality: personality,
            initialState: 'INICIO',
            finalStates: ['AGENDADO', 'CANCELADO'],
            states: {
                INICIO: {
                    name: 'Início',
                    description: 'Primeira mensagem',
                    transitions: [
                        { intent: 'GREETING', nextState: 'SAUDACAO', action: 'GREET_SCHEDULE' },
                        { intent: 'WANT_SCHEDULE', nextState: 'SERVICO', action: 'ASK_SERVICE' },
                    ]
                },
                SAUDACAO: {
                    name: 'Saudação',
                    description: 'Cliente chegou',
                    transitions: [
                        { intent: 'WANT_SCHEDULE', nextState: 'SERVICO', action: 'ASK_SERVICE' },
                        { intent: 'ASK_SERVICES', nextState: 'SAUDACAO', action: 'SHOW_SERVICES' },
                        { intent: 'ASK_PRICES', nextState: 'SAUDACAO', action: 'SHOW_PRICES' },
                    ]
                },
                SERVICO: {
                    name: 'Serviço',
                    description: 'Escolhendo serviço',
                    transitions: [
                        { intent: 'CHOOSE_SERVICE', nextState: 'DATA', action: 'ASK_DATE' },
                    ]
                },
                DATA: {
                    name: 'Data',
                    description: 'Escolhendo data',
                    transitions: [
                        { intent: 'PROVIDE_DATE', nextState: 'HORARIO', action: 'SHOW_TIMES' },
                    ]
                },
                HORARIO: {
                    name: 'Horário',
                    description: 'Escolhendo horário',
                    transitions: [
                        { intent: 'CHOOSE_TIME', nextState: 'CONFIRMACAO', action: 'CONFIRM_BOOKING' },
                    ]
                },
                CONFIRMACAO: {
                    name: 'Confirmação',
                    description: 'Confirmando agendamento',
                    transitions: [
                        { intent: 'CONFIRM', nextState: 'AGENDADO', action: 'CREATE_APPOINTMENT' },
                        { intent: 'CANCEL', nextState: 'CANCELADO', action: 'CANCEL_BOOKING' },
                    ]
                },
                AGENDADO: {
                    name: 'Agendado',
                    description: 'Consulta marcada',
                    transitions: []
                },
                CANCELADO: {
                    name: 'Cancelado',
                    description: 'Agendamento cancelado',
                    transitions: [
                        { intent: 'GREETING', nextState: 'INICIO', action: 'GREET_SCHEDULE' },
                    ]
                }
            },
            intents: {
                GREETING: { name: 'Saudação', examples: ['oi', 'olá'], priority: 10 },
                WANT_SCHEDULE: { name: 'Quer Agendar', examples: ['quero agendar', 'marcar horário', 'consulta'], priority: 9 },
                ASK_SERVICES: { name: 'Ver Serviços', examples: ['quais serviços', 'o que vocês fazem'], priority: 7 },
                ASK_PRICES: { name: 'Ver Preços', examples: ['quanto custa', 'valores', 'tabela'], priority: 7 },
                CHOOSE_SERVICE: { name: 'Escolher Serviço', examples: ['quero', 'vou fazer'], entities: ['service'], priority: 8 },
                PROVIDE_DATE: { name: 'Fornecer Data', examples: ['dia', 'amanhã', 'segunda'], entities: ['date'], priority: 8 },
                CHOOSE_TIME: { name: 'Escolher Horário', examples: ['às', 'horário', '14h'], entities: ['time'], priority: 8 },
                CONFIRM: { name: 'Confirmar', examples: ['confirma', 'ok', 'isso'], priority: 8 },
                CANCEL: { name: 'Cancelar', examples: ['cancela', 'desisto'], priority: 8 },
            },
            actions: {
                GREET_SCHEDULE: { name: 'Saudar', type: 'RESPONSE', template: 'Olá! 😊 Bem-vindo ao {business_name}! Quer agendar um horário?' },
                ASK_SERVICE: { name: 'Perguntar Serviço', type: 'DATA', dataSource: 'services', template: 'Qual serviço você gostaria?\n\n{services_list}' },
                SHOW_SERVICES: { name: 'Mostrar Serviços', type: 'DATA', dataSource: 'services', template: '📋 Nossos serviços:\n\n{services_list}' },
                SHOW_PRICES: { name: 'Mostrar Preços', type: 'DATA', dataSource: 'services', template: '💰 Tabela de preços:\n\n{prices_list}' },
                ASK_DATE: { name: 'Perguntar Data', type: 'RESPONSE', template: 'Ótimo! Para qual dia você gostaria?' },
                SHOW_TIMES: { name: 'Mostrar Horários', type: 'DATA', template: '📅 Horários disponíveis para {date}:\n\n{times_list}\n\nQual prefere?' },
                CONFIRM_BOOKING: { name: 'Confirmar', type: 'DATA', template: '📋 *Confirmação*\n\n🗓️ {date} às {time}\n💆 {service}\n💰 R$ {price}\n\nConfirma?' },
                CREATE_APPOINTMENT: { name: 'Criar Agendamento', type: 'EXTERNAL', template: '✅ Agendamento confirmado!\n\n🗓️ {date} às {time}\n\nTe esperamos!' },
                CANCEL_BOOKING: { name: 'Cancelar', type: 'RESPONSE', template: 'Agendamento cancelado. Quando quiser remarcar é só chamar!' },
            },
            data: {
                services: [],
                business_hours: {},
            },
            globalRules: [
                'Nunca agendar fora do horário de funcionamento',
                'Sempre confirmar data e horário antes de finalizar',
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    };
    /**
     * Constrói flow de SUPORTE
     */
    FlowBuilder.prototype.buildSuporteFlow = function (agentName, businessName, personality) {
        return {
            id: "suporte_".concat(Date.now()),
            version: '1.0.0',
            type: 'SUPORTE',
            businessName: businessName,
            agentName: agentName,
            agentPersonality: personality,
            initialState: 'INICIO',
            finalStates: ['RESOLVIDO', 'ESCALADO'],
            states: {
                INICIO: {
                    name: 'Início',
                    description: 'Cliente chegou',
                    transitions: [
                        { intent: 'GREETING', nextState: 'IDENTIFICANDO', action: 'GREET_SUPPORT' },
                        { intent: 'REPORT_PROBLEM', nextState: 'DIAGNOSTICANDO', action: 'START_DIAGNOSIS' },
                    ]
                },
                IDENTIFICANDO: {
                    name: 'Identificando',
                    description: 'Entendendo o problema',
                    transitions: [
                        { intent: 'REPORT_PROBLEM', nextState: 'DIAGNOSTICANDO', action: 'START_DIAGNOSIS' },
                        { intent: 'ASK_FAQ', nextState: 'IDENTIFICANDO', action: 'ANSWER_FAQ' },
                    ]
                },
                DIAGNOSTICANDO: {
                    name: 'Diagnosticando',
                    description: 'Analisando problema',
                    transitions: [
                        { intent: 'PROVIDE_INFO', nextState: 'SOLUCIONANDO', action: 'PROPOSE_SOLUTION' },
                        { intent: 'ASK_ESCALATE', nextState: 'ESCALADO', action: 'ESCALATE_TICKET' },
                    ]
                },
                SOLUCIONANDO: {
                    name: 'Solucionando',
                    description: 'Aplicando solução',
                    transitions: [
                        { intent: 'CONFIRM_SOLVED', nextState: 'RESOLVIDO', action: 'CLOSE_TICKET' },
                        { intent: 'STILL_PROBLEM', nextState: 'DIAGNOSTICANDO', action: 'TRY_ALTERNATIVE' },
                    ]
                },
                RESOLVIDO: {
                    name: 'Resolvido',
                    description: 'Problema resolvido',
                    transitions: []
                },
                ESCALADO: {
                    name: 'Escalado',
                    description: 'Passou para humano',
                    transitions: []
                }
            },
            intents: {
                GREETING: { name: 'Saudação', examples: ['oi', 'preciso de ajuda'], priority: 10 },
                REPORT_PROBLEM: { name: 'Reportar Problema', examples: ['não funciona', 'erro', 'problema', 'bug'], priority: 9 },
                ASK_FAQ: { name: 'Pergunta FAQ', examples: ['como', 'onde', 'qual'], priority: 6 },
                PROVIDE_INFO: { name: 'Dar Info', examples: ['é isso', 'aconteceu', 'print'], priority: 7 },
                ASK_ESCALATE: { name: 'Escalar', examples: ['falar com humano', 'atendente', 'pessoa real'], priority: 8 },
                CONFIRM_SOLVED: { name: 'Resolvido', examples: ['funcionou', 'resolvido', 'obrigado'], priority: 8 },
                STILL_PROBLEM: { name: 'Ainda com Problema', examples: ['ainda não', 'continua', 'não resolveu'], priority: 7 },
            },
            actions: {
                GREET_SUPPORT: { name: 'Saudar', type: 'RESPONSE', template: 'Olá! Sou do suporte {business_name}. Como posso ajudar?' },
                START_DIAGNOSIS: { name: 'Iniciar Diagnóstico', type: 'RESPONSE', template: 'Entendi! Me conta mais detalhes sobre o problema. O que exatamente está acontecendo?' },
                ANSWER_FAQ: { name: 'Responder FAQ', type: 'DATA', dataSource: 'kb_articles', template: '{answer}' },
                PROPOSE_SOLUTION: { name: 'Propor Solução', type: 'RESPONSE', template: 'Entendi! Tenta fazer o seguinte:\n\n{solution_steps}\n\nMe avisa se funcionou!' },
                TRY_ALTERNATIVE: { name: 'Tentar Alternativa', type: 'RESPONSE', template: 'Ok, vamos tentar outra coisa:\n\n{alternative_steps}' },
                CLOSE_TICKET: { name: 'Fechar Ticket', type: 'RESPONSE', template: '✅ Ótimo! Fico feliz que resolveu. Qualquer coisa é só chamar!' },
                ESCALATE_TICKET: { name: 'Escalar', type: 'RESPONSE', template: '📞 Vou passar seu caso para um especialista. Em breve entrarão em contato!' },
            },
            data: {
                kb_articles: [],
            },
            globalRules: [
                'Sempre tentar resolver antes de escalar',
                'Ser empático com o cliente frustrado',
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    };
    /**
     * Constrói flow de CURSO (infoprodutos, mentorias, treinamentos)
     *
     * ARQUITETURA:
     * - Fluxo A: FAQ do curso (responder rápido e correto)
     * - Fluxo B: Vendas/Lead (transformar conversa em compra)
     * - Fluxo C: Qualificação (identificar perfil do aluno)
     */
    FlowBuilder.prototype.buildCursoFlow = function (agentName, businessName, personality) {
        return {
            id: "curso_".concat(Date.now()),
            version: '1.0.0',
            type: 'CURSO',
            businessName: businessName,
            agentName: agentName,
            agentPersonality: personality,
            initialState: 'INICIO',
            finalStates: ['INSCRITO', 'NAO_INTERESSADO', 'LEAD_CAPTURADO'],
            states: {
                // ═══════════════════════════════════════════════════════════════
                // INÍCIO - Primeira Interação
                // ═══════════════════════════════════════════════════════════════
                INICIO: {
                    name: 'Início',
                    description: 'Primeira mensagem do cliente',
                    transitions: [
                        { intent: 'GREETING', nextState: 'QUALIFICANDO', action: 'GREET_COURSE' },
                        { intent: 'ASK_COURSE_INFO', nextState: 'FAQ', action: 'EXPLAIN_COURSE' },
                        { intent: 'ASK_PRICE', nextState: 'PRECOS', action: 'SHOW_PRICE' },
                        { intent: 'WANT_ENROLL', nextState: 'FECHANDO', action: 'START_ENROLLMENT' },
                        { intent: 'ASK_FOR_WHO', nextState: 'FAQ', action: 'EXPLAIN_FOR_WHO' },
                    ]
                },
                // ═══════════════════════════════════════════════════════════════
                // QUALIFICANDO - Entendendo o interesse
                // ═══════════════════════════════════════════════════════════════
                QUALIFICANDO: {
                    name: 'Qualificando',
                    description: 'Entendendo necessidade do aluno',
                    transitions: [
                        { intent: 'TELL_GOAL', nextState: 'EXPLICANDO', action: 'PERSONALIZE_PITCH' },
                        { intent: 'ASK_COURSE_INFO', nextState: 'FAQ', action: 'EXPLAIN_COURSE' },
                        { intent: 'ASK_PRICE', nextState: 'PRECOS', action: 'SHOW_PRICE' },
                        { intent: 'ASK_FOR_WHO', nextState: 'FAQ', action: 'EXPLAIN_FOR_WHO' },
                        { intent: 'ASK_CONTENT', nextState: 'FAQ', action: 'EXPLAIN_CONTENT' },
                        { intent: 'WANT_ENROLL', nextState: 'FECHANDO', action: 'START_ENROLLMENT' },
                    ]
                },
                // ═══════════════════════════════════════════════════════════════
                // FAQ - Respondendo dúvidas (base curada)
                // ═══════════════════════════════════════════════════════════════
                FAQ: {
                    name: 'FAQ',
                    description: 'Respondendo dúvidas sobre o curso',
                    transitions: [
                        { intent: 'ASK_COURSE_INFO', nextState: 'FAQ', action: 'EXPLAIN_COURSE' },
                        { intent: 'ASK_PRICE', nextState: 'PRECOS', action: 'SHOW_PRICE' },
                        { intent: 'ASK_FOR_WHO', nextState: 'FAQ', action: 'EXPLAIN_FOR_WHO' },
                        { intent: 'ASK_CONTENT', nextState: 'FAQ', action: 'EXPLAIN_CONTENT' },
                        { intent: 'ASK_DURATION', nextState: 'FAQ', action: 'EXPLAIN_DURATION' },
                        { intent: 'ASK_CERTIFICATE', nextState: 'FAQ', action: 'EXPLAIN_CERTIFICATE' },
                        { intent: 'ASK_GUARANTEE', nextState: 'FAQ', action: 'EXPLAIN_GUARANTEE' },
                        { intent: 'ASK_SUPPORT', nextState: 'FAQ', action: 'EXPLAIN_SUPPORT' },
                        { intent: 'ASK_BONUS', nextState: 'FAQ', action: 'EXPLAIN_BONUS' },
                        { intent: 'ASK_PAYMENT_OPTIONS', nextState: 'PRECOS', action: 'SHOW_PAYMENT_OPTIONS' },
                        { intent: 'ASK_REQUIREMENTS', nextState: 'FAQ', action: 'EXPLAIN_REQUIREMENTS' },
                        { intent: 'WANT_ENROLL', nextState: 'FECHANDO', action: 'START_ENROLLMENT' },
                        { intent: 'ASK_HUMAN', nextState: 'ENCAMINHANDO', action: 'TRANSFER_TO_HUMAN' },
                    ]
                },
                // ═══════════════════════════════════════════════════════════════
                // EXPLICANDO - Pitch personalizado
                // ═══════════════════════════════════════════════════════════════
                EXPLICANDO: {
                    name: 'Explicando',
                    description: 'Explicando solução personalizada',
                    transitions: [
                        { intent: 'ASK_PRICE', nextState: 'PRECOS', action: 'SHOW_PRICE' },
                        { intent: 'ASK_CONTENT', nextState: 'FAQ', action: 'EXPLAIN_CONTENT' },
                        { intent: 'ASK_RESULTS', nextState: 'EXPLICANDO', action: 'SHOW_RESULTS' },
                        { intent: 'ASK_TESTIMONIALS', nextState: 'EXPLICANDO', action: 'SHOW_TESTIMONIALS' },
                        { intent: 'WANT_ENROLL', nextState: 'FECHANDO', action: 'START_ENROLLMENT' },
                        { intent: 'OBJECTION', nextState: 'TRATANDO_OBJECAO', action: 'HANDLE_OBJECTION' },
                    ]
                },
                // ═══════════════════════════════════════════════════════════════
                // PREÇOS - Falando sobre valores
                // ═══════════════════════════════════════════════════════════════
                PRECOS: {
                    name: 'Preços',
                    description: 'Apresentando valores e condições',
                    transitions: [
                        { intent: 'ASK_COUPON', nextState: 'PRECOS', action: 'EXPLAIN_COUPON' },
                        { intent: 'ASK_INSTALLMENTS', nextState: 'PRECOS', action: 'SHOW_INSTALLMENTS' },
                        { intent: 'ASK_GUARANTEE', nextState: 'FAQ', action: 'EXPLAIN_GUARANTEE' },
                        { intent: 'WANT_ENROLL', nextState: 'FECHANDO', action: 'START_ENROLLMENT' },
                        { intent: 'OBJECTION', nextState: 'TRATANDO_OBJECAO', action: 'HANDLE_OBJECTION' },
                        { intent: 'TOO_EXPENSIVE', nextState: 'TRATANDO_OBJECAO', action: 'HANDLE_PRICE_OBJECTION' },
                    ]
                },
                // ═══════════════════════════════════════════════════════════════
                // TRATANDO OBJEÇÃO - Contornando dúvidas
                // ═══════════════════════════════════════════════════════════════
                TRATANDO_OBJECAO: {
                    name: 'Tratando Objeção',
                    description: 'Respondendo objeções e dúvidas',
                    transitions: [
                        { intent: 'WANT_ENROLL', nextState: 'FECHANDO', action: 'START_ENROLLMENT' },
                        { intent: 'ASK_GUARANTEE', nextState: 'FAQ', action: 'EXPLAIN_GUARANTEE' },
                        { intent: 'NEED_TIME', nextState: 'LEAD_CAPTURADO', action: 'CAPTURE_LEAD' },
                        { intent: 'NOT_NOW', nextState: 'LEAD_CAPTURADO', action: 'CAPTURE_LEAD' },
                        { intent: 'NOT_INTERESTED', nextState: 'NAO_INTERESSADO', action: 'RESPECT_DECISION' },
                        { intent: 'ASK_HUMAN', nextState: 'ENCAMINHANDO', action: 'TRANSFER_TO_HUMAN' },
                    ]
                },
                // ═══════════════════════════════════════════════════════════════
                // FECHANDO - Processo de matrícula
                // ═══════════════════════════════════════════════════════════════
                FECHANDO: {
                    name: 'Fechando',
                    description: 'Fechando matrícula',
                    transitions: [
                        { intent: 'CONFIRM', nextState: 'INSCRITO', action: 'SEND_ENROLLMENT_LINK' },
                        { intent: 'ASK_GUARANTEE', nextState: 'FECHANDO', action: 'REASSURE_GUARANTEE' },
                        { intent: 'OBJECTION', nextState: 'TRATANDO_OBJECAO', action: 'HANDLE_OBJECTION' },
                        { intent: 'NEED_TIME', nextState: 'LEAD_CAPTURADO', action: 'CAPTURE_LEAD' },
                    ]
                },
                // ═══════════════════════════════════════════════════════════════
                // ESTADOS FINAIS
                // ═══════════════════════════════════════════════════════════════
                INSCRITO: {
                    name: 'Inscrito',
                    description: 'Aluno se inscreveu',
                    transitions: [
                        { intent: 'ASK_ACCESS', nextState: 'INSCRITO', action: 'EXPLAIN_ACCESS' },
                        { intent: 'ASK_HELP', nextState: 'INSCRITO', action: 'OFFER_SUPPORT' },
                    ]
                },
                LEAD_CAPTURADO: {
                    name: 'Lead Capturado',
                    description: 'Lead para follow-up futuro',
                    transitions: [
                        { intent: 'GREETING', nextState: 'QUALIFICANDO', action: 'WELCOME_BACK' },
                        { intent: 'WANT_ENROLL', nextState: 'FECHANDO', action: 'START_ENROLLMENT' },
                    ]
                },
                NAO_INTERESSADO: {
                    name: 'Não Interessado',
                    description: 'Cliente não quis',
                    transitions: [
                        { intent: 'GREETING', nextState: 'INICIO', action: 'GREET_COURSE' },
                    ]
                },
                ENCAMINHANDO: {
                    name: 'Encaminhando',
                    description: 'Passando para humano',
                    transitions: []
                }
            },
            // ═══════════════════════════════════════════════════════════════════
            // INTENTS - Intenções reconhecidas
            // ═══════════════════════════════════════════════════════════════════
            intents: {
                // Saudação
                GREETING: {
                    name: 'Saudação',
                    examples: ['oi', 'olá', 'bom dia', 'boa tarde', 'e aí', 'eai', 'opa'],
                    patterns: ['^(oi|ola|bom\\s+dia|boa\\s+(tarde|noite)|e\\s*a[ií]|opa)[!?.,]?$'],
                    priority: 10
                },
                // FAQ - Informações do curso
                ASK_COURSE_INFO: {
                    name: 'O que é o curso',
                    examples: ['o que é', 'sobre o que é', 'me fala do curso', 'como funciona', 'o que vou aprender', 'do que se trata'],
                    patterns: ['o\\s+que\\s+[eé]', 'como\\s+funciona', 'sobre\\s+o\\s+que', 'do\\s+que\\s+se\\s+trata'],
                    priority: 8
                },
                ASK_FOR_WHO: {
                    name: 'Para quem é',
                    examples: ['para quem é', 'pra quem é', 'é pra iniciante', 'serve pra mim', 'é pra quem', 'preciso ter experiência'],
                    patterns: ['(para|pra)\\s+quem', '[eé]\\s+pra\\s+(iniciante|quem)', 'serve\\s+pra\\s+mim', 'experi[êe]ncia'],
                    priority: 8
                },
                ASK_CONTENT: {
                    name: 'Conteúdo do curso',
                    examples: ['o que tem no curso', 'quais módulos', 'quais aulas', 'conteúdo', 'grade', 'ementa', 'tem aula de'],
                    patterns: ['o\\s+que\\s+tem', 'quais\\s+(m[óo]dulos|aulas)', 'conte[úu]do', 'grade', 'ementa'],
                    priority: 7
                },
                ASK_DURATION: {
                    name: 'Duração',
                    examples: ['quanto tempo dura', 'duração', 'quantas horas', 'quantas aulas', 'tempo do curso'],
                    patterns: ['quanto\\s+tempo', 'dura[çc][aã]o', 'quantas\\s+(horas|aulas)'],
                    priority: 6
                },
                ASK_CERTIFICATE: {
                    name: 'Certificado',
                    examples: ['tem certificado', 'certificado', 'certificação', 'dá certificado', 'diploma'],
                    patterns: ['certificad[oa]', 'certifica[çc][aã]o', 'diploma'],
                    priority: 6
                },
                ASK_GUARANTEE: {
                    name: 'Garantia',
                    examples: ['tem garantia', 'posso devolver', 'reembolso', 'garantia de satisfação', 'e se eu não gostar'],
                    patterns: ['garantia', 'reembolso', 'devolver', 'n[aã]o\\s+gostar'],
                    priority: 7
                },
                ASK_SUPPORT: {
                    name: 'Suporte',
                    examples: ['tem suporte', 'como tiro dúvida', 'consigo falar', 'comunidade', 'grupo', 'ajuda'],
                    patterns: ['suporte', 'tirar\\s+d[úu]vida', 'comunidade', 'grupo'],
                    priority: 6
                },
                ASK_BONUS: {
                    name: 'Bônus',
                    examples: ['quais bônus', 'o que vem junto', 'tem brinde', 'materiais extras', 'além do curso'],
                    patterns: ['b[ôo]nus', 'brinde', 'materiais\\s+extras', 'al[eé]m\\s+do\\s+curso'],
                    priority: 5
                },
                ASK_REQUIREMENTS: {
                    name: 'Pré-requisitos',
                    examples: ['preciso saber algo', 'pré-requisito', 'preciso ter', 'conhecimento prévio'],
                    patterns: ['pr[eé][-]?requisito', 'preciso\\s+(saber|ter)', 'conhecimento\\s+pr[eé]vio'],
                    priority: 5
                },
                ASK_ACCESS: {
                    name: 'Acesso',
                    examples: ['como acesso', 'onde acesso', 'liberou', 'área de membros', 'login'],
                    patterns: ['como\\s+acesso', 'onde\\s+acesso', '[aá]rea\\s+de\\s+membros', 'login'],
                    priority: 6
                },
                // Preços e pagamento
                ASK_PRICE: {
                    name: 'Preço',
                    examples: ['quanto custa', 'qual o valor', 'preço', 'quanto é', 'investimento'],
                    patterns: ['quanto\\s+(custa|[eé])', 'qual\\s+o?\\s*valor', 'pre[çc]o', 'investimento'],
                    priority: 9
                },
                ASK_PAYMENT_OPTIONS: {
                    name: 'Formas de Pagamento',
                    examples: ['formas de pagamento', 'aceita pix', 'parcelamento', 'como pago', 'parcela em quantas vezes'],
                    patterns: ['formas?\\s+de\\s+pagamento', 'aceita\\s+(pix|cart[aã]o)', 'parcel', 'como\\s+pago'],
                    priority: 7
                },
                ASK_INSTALLMENTS: {
                    name: 'Parcelamento',
                    examples: ['parcela em quantas vezes', 'posso parcelar', 'divide', 'parcelas', 'cartão'],
                    patterns: ['parcela', 'divide', 'quantas\\s+vezes', 'cart[aã]o'],
                    priority: 7
                },
                ASK_COUPON: {
                    name: 'Cupom',
                    examples: ['tem cupom', 'código de desconto', 'promoção', 'desconto'],
                    patterns: ['cupom', 'c[óo]digo', 'promo[çc][aã]o', 'desconto'],
                    priority: 6
                },
                TOO_EXPENSIVE: {
                    name: 'Caro demais',
                    examples: ['muito caro', 'não tenho dinheiro', 'tá caro', 'fora do orçamento', 'pesado'],
                    patterns: ['(muito|t[aá])\\s+caro', 'n[aã]o\\s+tenho\\s+dinheiro', 'or[çc]amento', 'pesado'],
                    priority: 7
                },
                // Qualificação
                TELL_GOAL: {
                    name: 'Contar objetivo',
                    examples: ['quero aprender', 'meu objetivo é', 'preciso de', 'quero ser', 'quero trabalhar com'],
                    patterns: ['quero\\s+(aprender|ser|trabalhar)', 'meu\\s+objetivo', 'preciso\\s+de'],
                    entities: ['goal', 'experience_level'],
                    priority: 7
                },
                // Vendas
                WANT_ENROLL: {
                    name: 'Quero me inscrever',
                    examples: ['quero comprar', 'quero me inscrever', 'como faço pra comprar', 'link de compra', 'quero adquirir', 'vou comprar', 'me inscreve'],
                    patterns: ['quero\\s+(comprar|me\\s+inscrever|adquirir)', 'link\\s+de\\s+compra', 'como\\s+(fa[çc]o|compro)', 'vou\\s+comprar'],
                    priority: 9
                },
                CONFIRM: {
                    name: 'Confirmar',
                    examples: ['ok', 'isso', 'vou comprar', 'fecha', 'quero'],
                    patterns: ['^(ok|isso|fecha|quero|vou|sim)$'],
                    priority: 8
                },
                // Objeções
                OBJECTION: {
                    name: 'Objeção',
                    examples: ['será que funciona', 'tenho medo', 'e se não der certo', 'não sei se', 'estou em dúvida'],
                    patterns: ['ser[aá]\\s+que', 'tenho\\s+medo', 'n[aã]o\\s+sei\\s+se', 'd[úu]vida', 'e\\s+se'],
                    priority: 6
                },
                NEED_TIME: {
                    name: 'Preciso pensar',
                    examples: ['vou pensar', 'preciso pensar', 'deixa eu ver', 'vou analisar', 'depois volto'],
                    patterns: ['vou\\s+(pensar|analisar)', 'preciso\\s+pensar', 'deixa\\s+eu\\s+ver', 'depois'],
                    priority: 7
                },
                NOT_NOW: {
                    name: 'Agora não',
                    examples: ['agora não dá', 'depois', 'mês que vem', 'outro momento'],
                    patterns: ['agora\\s+n[aã]o', 'depois', 'm[eê]s\\s+que\\s+vem', 'outro\\s+momento'],
                    priority: 6
                },
                NOT_INTERESTED: {
                    name: 'Não interessado',
                    examples: ['não tenho interesse', 'não quero', 'não é pra mim', 'obrigado mas não'],
                    patterns: ['n[aã]o\\s+(tenho\\s+interesse|quero|[eé]\\s+pra\\s+mim)'],
                    priority: 8
                },
                // Resultados e prova social
                ASK_RESULTS: {
                    name: 'Resultados',
                    examples: ['funciona mesmo', 'tem resultado', 'quem já fez', 'dá resultado'],
                    patterns: ['funciona\\s+mesmo', 'resultado', 'quem\\s+j[aá]\\s+fez'],
                    priority: 6
                },
                ASK_TESTIMONIALS: {
                    name: 'Depoimentos',
                    examples: ['depoimentos', 'casos de sucesso', 'quem já comprou', 'feedback de alunos'],
                    patterns: ['depoimento', 'casos?\\s+de\\s+sucesso', 'feedback', 'alunos\\s+que'],
                    priority: 5
                },
                // Escalar
                ASK_HUMAN: {
                    name: 'Falar com humano',
                    examples: ['falar com alguém', 'atendente', 'pessoa real', 'humano'],
                    patterns: ['falar\\s+com\\s+(algu[eé]m|pessoa|atendente|humano)'],
                    priority: 8
                },
                ASK_HELP: {
                    name: 'Ajuda',
                    examples: ['preciso de ajuda', 'me ajuda', 'estou com dúvida'],
                    patterns: ['ajuda', 'd[úu]vida'],
                    priority: 5
                },
            },
            // ═══════════════════════════════════════════════════════════════════
            // ACTIONS - Ações e templates
            // ═══════════════════════════════════════════════════════════════════
            actions: {
                // Saudação
                GREET_COURSE: {
                    name: 'Saudar',
                    type: 'RESPONSE',
                    template: "Ol\u00E1! \uD83D\uDE0A Seja bem-vindo(a)!\n\nSou {agent_name} e estou aqui para te ajudar a conhecer o {business_name}.\n\nVoc\u00EA tem interesse em transformar sua carreira/vida atrav\u00E9s do nosso m\u00E9todo?",
                    variables: ['agent_name', 'business_name']
                },
                WELCOME_BACK: {
                    name: 'Bem-vindo de volta',
                    type: 'RESPONSE',
                    template: "Ol\u00E1! Que bom te ver de volta! \uD83D\uDE0A\n\nFicou com alguma d\u00FAvida sobre o {business_name}? Estou aqui pra ajudar!",
                    variables: ['business_name']
                },
                // FAQ - Respostas da base curada
                EXPLAIN_COURSE: {
                    name: 'Explicar o curso',
                    type: 'DATA',
                    dataSource: 'course_info',
                    template: "\uD83D\uDCDA *Sobre o {business_name}*\n\n{course_description}\n\n\u2705 O que voc\u00EA vai aprender:\n{learning_outcomes}\n\nQuer saber mais sobre o conte\u00FAdo ou sobre como funciona a garantia?",
                    variables: ['business_name', 'course_description', 'learning_outcomes']
                },
                EXPLAIN_FOR_WHO: {
                    name: 'Para quem é',
                    type: 'DATA',
                    dataSource: 'target_audience',
                    template: "\uD83C\uDFAF *Para quem \u00E9 o {business_name}?*\n\n{target_audience}\n\n{not_for_audience}\n\nSe identificou? Posso te explicar melhor o conte\u00FAdo!",
                    variables: ['business_name', 'target_audience', 'not_for_audience']
                },
                EXPLAIN_CONTENT: {
                    name: 'Conteúdo',
                    type: 'DATA',
                    dataSource: 'modules',
                    template: "\uD83D\uDCD6 *Conte\u00FAdo do Curso*\n\n{modules_list}\n\nS\u00E3o {total_hours} horas de conte\u00FAdo pr\u00E1tico e direto ao ponto!\n\nQuer saber sobre os b\u00F4nus que v\u00EAm junto?",
                    variables: ['modules_list', 'total_hours']
                },
                EXPLAIN_DURATION: {
                    name: 'Duração',
                    type: 'DATA',
                    dataSource: 'course_info',
                    template: "\u23F1\uFE0F *Dura\u00E7\u00E3o*\n\nO curso tem {total_hours} horas de conte\u00FAdo.\n\nVoc\u00EA pode fazer no seu ritmo, com acesso {access_period}.\n\nAs aulas s\u00E3o gravadas e ficam dispon\u00EDveis 24h!",
                    variables: ['total_hours', 'access_period']
                },
                EXPLAIN_CERTIFICATE: {
                    name: 'Certificado',
                    type: 'DATA',
                    dataSource: 'certificate_info',
                    template: "\uD83C\uDF93 *Certificado*\n\n{certificate_description}\n\n{certificate_validity}",
                    variables: ['certificate_description', 'certificate_validity']
                },
                EXPLAIN_GUARANTEE: {
                    name: 'Garantia',
                    type: 'DATA',
                    dataSource: 'guarantee_info',
                    template: "\u2705 *Garantia de {guarantee_days} dias*\n\n{guarantee_description}\n\nSe por qualquer motivo voc\u00EA n\u00E3o gostar, basta pedir o reembolso em at\u00E9 {guarantee_days} dias e devolvemos 100% do valor. Sem burocracia!\n\nIsso te deixa mais tranquilo(a)?",
                    variables: ['guarantee_days', 'guarantee_description']
                },
                EXPLAIN_SUPPORT: {
                    name: 'Suporte',
                    type: 'DATA',
                    dataSource: 'support_info',
                    template: "\uD83D\uDCAC *Suporte ao Aluno*\n\n{support_description}\n\n{community_info}\n\nVoc\u00EA nunca estar\u00E1 sozinho(a) nessa jornada!",
                    variables: ['support_description', 'community_info']
                },
                EXPLAIN_BONUS: {
                    name: 'Bônus',
                    type: 'DATA',
                    dataSource: 'bonus_info',
                    template: "\uD83C\uDF81 *B\u00F4nus Exclusivos*\n\nAl\u00E9m do curso completo, voc\u00EA recebe:\n\n{bonus_list}\n\nTudo isso est\u00E1 incluso no valor da inscri\u00E7\u00E3o!",
                    variables: ['bonus_list']
                },
                EXPLAIN_REQUIREMENTS: {
                    name: 'Pré-requisitos',
                    type: 'DATA',
                    dataSource: 'requirements',
                    template: "\uD83D\uDCCB *Pr\u00E9-requisitos*\n\n{requirements_description}\n\n{equipment_needed}\n\nO curso foi feito pra voc\u00EA conseguir acompanhar mesmo partindo do zero!",
                    variables: ['requirements_description', 'equipment_needed']
                },
                EXPLAIN_ACCESS: {
                    name: 'Como acessar',
                    type: 'DATA',
                    dataSource: 'access_info',
                    template: "\uD83D\uDD11 *Acesso \u00E0s Aulas*\n\n{access_instructions}\n\nQualquer d\u00FAvida t\u00E9cnica, nossa equipe de suporte est\u00E1 dispon\u00EDvel!",
                    variables: ['access_instructions']
                },
                // Preços
                SHOW_PRICE: {
                    name: 'Mostrar preço',
                    type: 'DATA',
                    dataSource: 'pricing',
                    template: "\uD83D\uDCB0 *Investimento*\n\n{pricing_details}\n\n{payment_options}\n\nE lembre-se: voc\u00EA tem {guarantee_days} dias de garantia!\n\nQuer ver as formas de pagamento?",
                    variables: ['pricing_details', 'payment_options', 'guarantee_days']
                },
                SHOW_PAYMENT_OPTIONS: {
                    name: 'Formas de pagamento',
                    type: 'DATA',
                    dataSource: 'payment_methods',
                    template: "\uD83D\uDCB3 *Formas de Pagamento*\n\n{payment_methods_list}\n\n{installments_info}\n\nQual forma prefere?",
                    variables: ['payment_methods_list', 'installments_info']
                },
                SHOW_INSTALLMENTS: {
                    name: 'Parcelamento',
                    type: 'DATA',
                    dataSource: 'installments',
                    template: "\uD83D\uDCB3 *Parcelamento*\n\n{installments_details}\n\nQuer que eu te mande o link para garantir sua vaga?",
                    variables: ['installments_details']
                },
                EXPLAIN_COUPON: {
                    name: 'Cupom',
                    type: 'DATA',
                    dataSource: 'coupons',
                    template: "\uD83C\uDF9F\uFE0F *Cupom de Desconto*\n\n{coupon_info}\n\nEsse desconto \u00E9 por tempo limitado!",
                    variables: ['coupon_info']
                },
                // Qualificação e Pitch
                PERSONALIZE_PITCH: {
                    name: 'Pitch personalizado',
                    type: 'RESPONSE',
                    template: "Que legal! \uD83D\uDD25\n\nCom o {business_name} voc\u00EA vai conseguir exatamente isso!\n\n{personalized_benefits}\n\nQuer conhecer o conte\u00FAdo completo ou j\u00E1 quer saber como se inscrever?",
                    variables: ['business_name', 'personalized_benefits']
                },
                // Resultados e prova social
                SHOW_RESULTS: {
                    name: 'Mostrar resultados',
                    type: 'DATA',
                    dataSource: 'results',
                    template: "\uD83D\uDCC8 *Resultados dos Alunos*\n\n{results_description}\n\n{success_metrics}\n\nQuer ver depoimentos de quem j\u00E1 fez?",
                    variables: ['results_description', 'success_metrics']
                },
                SHOW_TESTIMONIALS: {
                    name: 'Depoimentos',
                    type: 'DATA',
                    dataSource: 'testimonials',
                    template: "\u2B50 *O que nossos alunos dizem*\n\n{testimonials_list}\n\nQuer garantir sua vaga tamb\u00E9m?",
                    variables: ['testimonials_list']
                },
                // Objeções
                HANDLE_OBJECTION: {
                    name: 'Tratar objeção',
                    type: 'RESPONSE',
                    template: "Entendo perfeitamente sua preocupa\u00E7\u00E3o! \uD83D\uDE0A\n\n{objection_response}\n\nE lembre-se: voc\u00EA tem {guarantee_days} dias pra testar. Se n\u00E3o gostar, devolvemos seu dinheiro!\n\nPosso tirar mais alguma d\u00FAvida?",
                    variables: ['objection_response', 'guarantee_days']
                },
                HANDLE_PRICE_OBJECTION: {
                    name: 'Tratar preço',
                    type: 'RESPONSE',
                    template: "Entendo! \uD83D\uDCAD\n\nOlha, quando voc\u00EA divide o investimento pelo que vai aprender, fica menos de {daily_value} por dia!\n\n{value_comparison}\n\nE voc\u00EA ainda tem {guarantee_days} dias pra testar. Se n\u00E3o valer a pena, devolvemos tudo!\n\n{payment_facilitation}",
                    variables: ['daily_value', 'value_comparison', 'guarantee_days', 'payment_facilitation']
                },
                // Fechamento
                START_ENROLLMENT: {
                    name: 'Iniciar matrícula',
                    type: 'RESPONSE',
                    template: "\u00D3tima decis\u00E3o! \uD83C\uDF89\n\nVoc\u00EA est\u00E1 a um passo de transformar sua vida!\n\n\uD83D\uDCCB *Resumo:*\n\u2022 {business_name}\n\u2022 {total_hours} de conte\u00FAdo\n\u2022 Acesso {access_period}\n\u2022 Garantia de {guarantee_days} dias\n\u2022 Todos os b\u00F4nus inclusos\n\n{enrollment_cta}\n\nPosso te mandar o link de inscri\u00E7\u00E3o?",
                    variables: ['business_name', 'total_hours', 'access_period', 'guarantee_days', 'enrollment_cta']
                },
                REASSURE_GUARANTEE: {
                    name: 'Reforçar garantia',
                    type: 'RESPONSE',
                    template: "N\u00E3o se preocupe! \uD83D\uDE0A\n\nA garantia funciona assim: voc\u00EA tem {guarantee_days} dias pra testar o curso. Se n\u00E3o gostar por QUALQUER motivo, \u00E9 s\u00F3 mandar um email pedindo reembolso e devolvemos 100% do valor.\n\nSem perguntas, sem burocracia!\n\nQuer que eu mande o link?",
                    variables: ['guarantee_days']
                },
                SEND_ENROLLMENT_LINK: {
                    name: 'Enviar link',
                    type: 'RESPONSE',
                    template: "Perfeito! \uD83D\uDE80\n\nAqui est\u00E1 seu link exclusivo de inscri\u00E7\u00E3o:\n\n\uD83D\uDC49 {enrollment_link}\n\nQualquer d\u00FAvida durante o processo, me chama aqui!\n\nTe vejo do outro lado! \uD83C\uDF93",
                    variables: ['enrollment_link']
                },
                // Lead
                CAPTURE_LEAD: {
                    name: 'Capturar lead',
                    type: 'RESPONSE',
                    template: "Sem problema! Fico feliz em poder te ajudar! \uD83D\uDE0A\n\nQuando estiver pronto(a), \u00E9 s\u00F3 me chamar aqui que te ajudo com a inscri\u00E7\u00E3o!\n\n{lead_nurture_message}\n\nAt\u00E9 breve! \uD83D\uDC4B",
                    variables: ['lead_nurture_message']
                },
                RESPECT_DECISION: {
                    name: 'Respeitar decisão',
                    type: 'RESPONSE',
                    template: "Tudo bem, respeito sua decis\u00E3o! \uD83D\uDE0A\n\nSe mudar de ideia ou tiver qualquer d\u00FAvida no futuro, estou por aqui!\n\nDesejo sucesso na sua jornada! \uD83D\uDE4F",
                    variables: []
                },
                // Suporte
                OFFER_SUPPORT: {
                    name: 'Oferecer suporte',
                    type: 'RESPONSE',
                    template: "Claro! Estou aqui pra te ajudar! \uD83D\uDE0A\n\n{support_response}\n\nMais alguma d\u00FAvida?",
                    variables: ['support_response']
                },
                TRANSFER_TO_HUMAN: {
                    name: 'Transferir pra humano',
                    type: 'RESPONSE',
                    template: "Entendi! Vou passar seu contato para nossa equipe! \uD83D\uDCDE\n\nEm breve algu\u00E9m vai entrar em contato com voc\u00EA para tirar todas as suas d\u00FAvidas.\n\nEnquanto isso, posso te ajudar com mais alguma informa\u00E7\u00E3o?",
                    variables: []
                },
            },
            // ═══════════════════════════════════════════════════════════════════
            // DATA - Dados padrão do curso (serão sobrescritos pela config)
            // ═══════════════════════════════════════════════════════════════════
            data: {
                // Informações do curso
                faq: [
                    { question: 'O que é o curso?', answer: 'Um treinamento completo para você dominar...' },
                    { question: 'Para quem é?', answer: 'Para quem quer aprender...' },
                    { question: 'Quanto tempo dura?', answer: 'São X horas de conteúdo...' },
                    { question: 'Tem certificado?', answer: 'Sim! Você recebe certificado ao concluir.' },
                    { question: 'Tem garantia?', answer: 'Sim! Garantia de 7 dias.' },
                ],
                prices: {
                    full: 997,
                    promotional: 497,
                    installments: 12,
                },
                links: {
                    checkout: '',
                    area_membros: '',
                },
                // Configurações específicas de curso
                course_info: {
                    total_hours: 40,
                    access_period: 'vitalício',
                    guarantee_days: 7,
                    modules_count: 8,
                },
            },
            globalRules: [
                'NUNCA inventar informações sobre preços - usar apenas dados cadastrados',
                'NUNCA inventar depoimentos ou resultados',
                'SEMPRE mencionar a garantia quando falar de preço',
                'SEMPRE ser empático com objeções',
                'NUNCA pressionar demais - respeitar o tempo do cliente',
                'Se não souber responder algo específico, oferecer falar com humano',
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    };
    /**
     * Constrói flow GENÉRICO (fallback)
     */
    FlowBuilder.prototype.buildGenericoFlow = function (agentName, businessName, personality) {
        return {
            id: "generico_".concat(Date.now()),
            version: '1.0.0',
            type: 'GENERICO',
            businessName: businessName,
            agentName: agentName,
            agentPersonality: personality,
            initialState: 'INICIO',
            finalStates: ['FINALIZADO'],
            states: {
                INICIO: {
                    name: 'Início',
                    description: 'Estado inicial',
                    transitions: [
                        { intent: 'GREETING', nextState: 'CONVERSANDO', action: 'GREET' },
                        { intent: 'ASK_INFO', nextState: 'CONVERSANDO', action: 'PROVIDE_INFO' },
                    ]
                },
                CONVERSANDO: {
                    name: 'Conversando',
                    description: 'Em conversa',
                    transitions: [
                        { intent: 'ASK_INFO', nextState: 'CONVERSANDO', action: 'PROVIDE_INFO' },
                        { intent: 'THANKS', nextState: 'FINALIZADO', action: 'FAREWELL' },
                        { intent: 'FAREWELL', nextState: 'FINALIZADO', action: 'FAREWELL' },
                    ]
                },
                FINALIZADO: {
                    name: 'Finalizado',
                    description: 'Conversa encerrada',
                    transitions: [
                        { intent: 'GREETING', nextState: 'INICIO', action: 'GREET' },
                    ]
                }
            },
            intents: {
                GREETING: { name: 'Saudação', examples: ['oi', 'olá'], priority: 10 },
                ASK_INFO: { name: 'Pedir Info', examples: ['como', 'onde', 'quando', 'qual'], priority: 5 },
                THANKS: { name: 'Agradecer', examples: ['obrigado', 'valeu'], priority: 7 },
                FAREWELL: { name: 'Despedida', examples: ['tchau', 'até mais'], priority: 7 },
            },
            actions: {
                GREET: { name: 'Saudar', type: 'RESPONSE', template: 'Olá! 😊 Sou {agent_name} do {business_name}. Como posso ajudar?' },
                PROVIDE_INFO: { name: 'Dar Info', type: 'RESPONSE', template: '{response}' },
                FAREWELL: { name: 'Despedir', type: 'RESPONSE', template: 'Até mais! 👋 Qualquer coisa é só chamar!' },
            },
            data: {},
            globalRules: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    };
    /**
     * Enriquece FlowDefinition usando IA para análise profunda
     */
    FlowBuilder.prototype.enrichWithAI = function (flow, originalPrompt) {
        return __awaiter(this, void 0, void 0, function () {
            var response, content, enrichment, _i, _a, intent, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.anthropic)
                            return [2 /*return*/, flow];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.anthropic.messages.create({
                                model: 'claude-3-haiku-20240307',
                                max_tokens: 2000,
                                temperature: 0,
                                system: "Voc\u00EA \u00E9 um analisador de prompts de agentes de IA.\nAnalise o prompt fornecido e extraia:\n1. FAQ adicional (perguntas frequentes e respostas)\n2. Regras espec\u00EDficas do neg\u00F3cio\n3. Inten\u00E7\u00F5es adicionais que devem ser reconhecidas\n4. Vari\u00E1veis importantes (pre\u00E7os, links, nomes)\n\nRetorne JSON v\u00E1lido:\n{\n  \"faq\": [{\"question\": \"...\", \"answer\": \"...\"}],\n  \"rules\": [\"regra1\", \"regra2\"],\n  \"intents\": [{\"name\": \"INTENT_NAME\", \"examples\": [\"ex1\", \"ex2\"]}],\n  \"variables\": {\"key\": \"value\"}\n}",
                                messages: [{
                                        role: 'user',
                                        content: "PROMPT DO AGENTE:\n\n".concat(originalPrompt)
                                    }]
                            })];
                    case 2:
                        response = _b.sent();
                        content = response.content[0];
                        if (content.type !== 'text')
                            return [2 /*return*/, flow];
                        enrichment = JSON.parse(content.text);
                        // Adicionar FAQ
                        if (enrichment.faq) {
                            flow.data.faq = __spreadArray(__spreadArray([], (flow.data.faq || []), true), enrichment.faq, true);
                        }
                        // Adicionar regras
                        if (enrichment.rules) {
                            flow.globalRules = __spreadArray(__spreadArray([], flow.globalRules, true), enrichment.rules, true);
                        }
                        // Adicionar intenções
                        if (enrichment.intents) {
                            for (_i = 0, _a = enrichment.intents; _i < _a.length; _i++) {
                                intent = _a[_i];
                                flow.intents[intent.name] = {
                                    name: intent.name,
                                    examples: intent.examples,
                                    priority: 5
                                };
                            }
                        }
                        console.log('[FlowBuilder] Enriquecimento com IA aplicado');
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _b.sent();
                        console.error('[FlowBuilder] Erro no enriquecimento:', error_2);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/, flow];
                }
            });
        });
    };
    return FlowBuilder;
}());
exports.FlowBuilder = FlowBuilder;
// ═══════════════════════════════════════════════════════════════════════
// 📦 EXPORTAÇÕES
// ═══════════════════════════════════════════════════════════════════════
exports.default = FlowBuilder;
