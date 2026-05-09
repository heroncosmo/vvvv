"use strict";
/**
 * 🎤 Serviço de Áudio para Respostas da IA
 *
 * Gera áudio TTS automaticamente quando o agente responde,
 * respeitando o limite diário de 30 mensagens por cliente.
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
exports.getAudioResponseSettings = getAudioResponseSettings;
exports.shouldGenerateAudioResponse = shouldGenerateAudioResponse;
exports.generateAudioForResponse = generateAudioForResponse;
exports.sendAudioAsVoiceMessage = sendAudioAsVoiceMessage;
exports.processAudioResponseForAgent = processAudioResponseForAgent;
exports.cleanupOldTTSFiles = cleanupOldTTSFiles;
var storage_1 = require("./storage");
var ttsService_1 = require("./ttsService");
var promises_1 = require("fs/promises");
var path_1 = require("path");
// Mapeamento de vozes
var VOICE_MAP = {
    female: "pt-BR-FranciscaNeural",
    male: "pt-BR-AntonioNeural",
};
// Diretório temporário para arquivos de áudio
var TMP_DIR = path_1.default.join(process.cwd(), "tmp", "tts-responses");
// Garantir que o diretório existe
function ensureTmpDir() {
    return __awaiter(this, void 0, void 0, function () {
        var e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, promises_1.default.mkdir(TMP_DIR, { recursive: true })];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    e_1 = _a.sent();
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * 🧹 Sanitiza texto para TTS - Remove TUDO que não faz sentido em áudio falado
 *
 * O Edge TTS (e qualquer TTS) tropeça em:
 * - Emojis (lê o nome Unicode: "rosto sorridente com olhos sorridentes")
 * - Formatação WhatsApp/Markdown (*negrito*, _itálico_, ~tachado~, `código`)
 * - Aspas de todos os tipos (" " ' ' « »)
 * - URLs, e-mails
 * - Símbolos especiais (@, #, $, %, &, =, +, <, >, ^, |)
 * - Separadores visuais (═══, ━━━, ---, ___)
 * - Caracteres de seta (→, ←, ⇒, ➜)
 * - Caracteres box-drawing e decorativos
 *
 * O resultado deve ser APENAS texto natural, como se alguém fosse ler em voz alta.
 *
 * @param text - Texto original com formatação
 * @returns Texto limpo, natural para ser falado
 */
function sanitizeTextForTTS(text) {
    if (!text)
        return text;
    var cleanedText = text;
    // ═══════════════════════════════════════════
    // 1. REMOVER URLS E E-MAILS
    // ═══════════════════════════════════════════
    cleanedText = cleanedText.replace(/(?:https?:\/\/|www\.)[^\s]+/gi, '');
    cleanedText = cleanedText.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
    // ═══════════════════════════════════════════
    // 2. REMOVER TODOS OS EMOJIS
    // TTS lê o nome Unicode do emoji, ex: "😊" vira "rosto sorridente"
    // Isso quebra completamente a fala natural
    // ═══════════════════════════════════════════
    // Regex abrangente para emojis Unicode (inclui todos os blocos de emoji)
    cleanedText = cleanedText.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // Emoticons
    cleanedText = cleanedText.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // Misc Symbols & Pictographs
    cleanedText = cleanedText.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // Transport & Map
    cleanedText = cleanedText.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, ''); // Flags
    cleanedText = cleanedText.replace(/[\u{2600}-\u{26FF}]/gu, ''); // Misc symbols (☀️, ⚡, etc)
    cleanedText = cleanedText.replace(/[\u{2700}-\u{27BF}]/gu, ''); // Dingbats (✅, ❌, ✨, etc)
    cleanedText = cleanedText.replace(/[\u{FE00}-\u{FE0F}]/gu, ''); // Variation Selectors
    cleanedText = cleanedText.replace(/[\u{1F900}-\u{1F9FF}]/gu, ''); // Supplemental Symbols
    cleanedText = cleanedText.replace(/[\u{1FA00}-\u{1FA6F}]/gu, ''); // Chess, extended-A
    cleanedText = cleanedText.replace(/[\u{1FA70}-\u{1FAFF}]/gu, ''); // Symbols extended-A
    cleanedText = cleanedText.replace(/[\u{200D}]/gu, ''); // Zero-width joiner (combina emojis)
    cleanedText = cleanedText.replace(/[\u{20E3}]/gu, ''); // Combining enclosing keycap
    cleanedText = cleanedText.replace(/[\u{E0020}-\u{E007F}]/gu, ''); // Tags (flag sequences)
    cleanedText = cleanedText.replace(/[\u{2300}-\u{23FF}]/gu, ''); // Misc Technical (⏰, ⏳, etc)
    cleanedText = cleanedText.replace(/[\u{2B05}-\u{2B55}]/gu, ''); // Arrows & shapes (⬅️, ⭐, etc)
    cleanedText = cleanedText.replace(/[\u{FE00}-\u{FE0F}]/gu, ''); // Variation selectors
    cleanedText = cleanedText.replace(/[\u{200B}-\u{200F}]/gu, ''); // Zero-width spaces
    cleanedText = cleanedText.replace(/[\u{2028}-\u{2029}]/gu, ''); // Line/paragraph separators
    // ═══════════════════════════════════════════
    // 3. REMOVER FORMATAÇÃO MARKDOWN/WHATSAPP
    // ═══════════════════════════════════════════
    // Blocos de código primeiro (podem conter outros marcadores)
    cleanedText = cleanedText.replace(/```[\s\S]*?```/g, '');
    // Asteriscos (negrito): *texto* → texto  /  **texto** → texto
    cleanedText = cleanedText.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
    cleanedText = cleanedText.replace(/\*/g, '');
    // Underlines (itálico): _texto_ → texto
    cleanedText = cleanedText.replace(/_+([^_]+)_+/g, '$1');
    cleanedText = cleanedText.replace(/_/g, ' ');
    // Til (tachado): ~texto~ → texto
    cleanedText = cleanedText.replace(/~+([^~]+)~+/g, '$1');
    cleanedText = cleanedText.replace(/~/g, '');
    // Código inline: `código` → código
    cleanedText = cleanedText.replace(/`+([^`]+)`+/g, '$1');
    cleanedText = cleanedText.replace(/`/g, '');
    // ═══════════════════════════════════════════
    // 4. REMOVER ASPAS DE TODOS OS TIPOS
    // TTS pode ler "abre aspas" / "fecha aspas" que soa horrível
    // ═══════════════════════════════════════════
    cleanedText = cleanedText.replace(/[""\u201C\u201D\u201E\u201F\u2033\u2036]/g, ''); // Aspas duplas
    cleanedText = cleanedText.replace(/[''\u2018\u2019\u201A\u201B\u2032\u2035]/g, ''); // Aspas simples
    cleanedText = cleanedText.replace(/[«»\u2039\u203A]/g, ''); // Aspas angulares/francesas
    cleanedText = cleanedText.replace(/'/g, ''); // Apóstrofo simples
    cleanedText = cleanedText.replace(/"/g, ''); // Aspas simples ASCII
    // ═══════════════════════════════════════════
    // 5. REMOVER SEPARADORES VISUAIS E LINHAS DECORATIVAS
    // ═══════════════════════════════════════════
    cleanedText = cleanedText.replace(/[═━─—–╔╗╚╝╠╣╦╩╬║├┤┬┴┼┌┐└┘│▔▁▂▃▄▅▆▇█▉▊▋▌▍▎▏░▒▓]/g, '');
    cleanedText = cleanedText.replace(/-{3,}/g, ''); // --- ou mais
    cleanedText = cleanedText.replace(/_{3,}/g, ''); // ___ ou mais
    // ═══════════════════════════════════════════
    // 6. REMOVER/SUBSTITUIR SETAS E SÍMBOLOS ESPECIAIS
    // ═══════════════════════════════════════════
    // Setas Unicode → remover
    cleanedText = cleanedText.replace(/[→←↑↓↔↕⇒⇐⇑⇓⇔➜➤➡➔➝➞➠►▶◀◁▷◆◇▸▹▻●○•]/g, '');
    // Símbolos que TTS pode tentar ler
    cleanedText = cleanedText.replace(/@/g, ''); // arroba
    cleanedText = cleanedText.replace(/#(?!\d)/g, ''); // hashtag (preserva #123 = número)
    cleanedText = cleanedText.replace(/\^/g, '');
    cleanedText = cleanedText.replace(/\|/g, '');
    cleanedText = cleanedText.replace(/[<>]/g, '');
    cleanedText = cleanedText.replace(/[=+]/g, '');
    cleanedText = cleanedText.replace(/&(?!(\w+;))/g, 'e'); // & → "e" (mas preserva &nbsp; etc)
    // Colchetes: [texto] → texto
    cleanedText = cleanedText.replace(/\[([^\]]*)\]/g, '$1');
    // Chaves: {texto} → texto
    cleanedText = cleanedText.replace(/\{([^}]*)\}/g, '$1');
    // Parênteses: manter se contêm texto curto, remover se vazios ou decorativos
    cleanedText = cleanedText.replace(/\(\s*\)/g, ''); // () vazio
    cleanedText = cleanedText.replace(/\(\(([^)]*)\)\)/g, '$1'); // ((texto)) → texto
    // ═══════════════════════════════════════════
    // 7. SUBSTITUIÇÕES INTELIGENTES (R$, %, etc)
    // ═══════════════════════════════════════════
    // R$ 100 → 100 reais (TTS já lê "R$" como "reais" geralmente, mas melhor garantir)
    cleanedText = cleanedText.replace(/R\$\s*(\d)/g, '$1');
    // Citação Markdown: > texto → texto  
    cleanedText = cleanedText.replace(/^>\s*/gm, '');
    // Bullets e marcadores no início de linhas
    cleanedText = cleanedText.replace(/^[-•]\s*/gm, '');
    // Hashtags como cabeçalho: ## Título → Título
    cleanedText = cleanedText.replace(/^#+\s+/gm, '');
    // ═══════════════════════════════════════════
    // 8. LIMPAR PONTUAÇÃO EXCESSIVA
    // ═══════════════════════════════════════════
    cleanedText = cleanedText.replace(/\.{4,}/g, '...'); // ...... → ...
    cleanedText = cleanedText.replace(/!{2,}/g, '!'); // !!!!! → !
    cleanedText = cleanedText.replace(/\?{2,}/g, '?'); // ????? → ?
    cleanedText = cleanedText.replace(/,{2,}/g, ','); // ,,,, → ,
    cleanedText = cleanedText.replace(/;{2,}/g, ';'); // ;;;; → ;
    cleanedText = cleanedText.replace(/:{2,}/g, ':'); // :::: → :
    // ═══════════════════════════════════════════
    // 9. LIMPAR ESCAPE CHARACTERS E HTML ENTITIES
    // ═══════════════════════════════════════════
    cleanedText = cleanedText.replace(/\\[nrtfvb]/g, ' ');
    cleanedText = cleanedText.replace(/\\/g, '');
    cleanedText = cleanedText.replace(/&nbsp;/gi, ' ');
    cleanedText = cleanedText.replace(/&amp;/gi, 'e');
    cleanedText = cleanedText.replace(/&lt;/gi, '');
    cleanedText = cleanedText.replace(/&gt;/gi, '');
    cleanedText = cleanedText.replace(/&quot;/gi, '');
    cleanedText = cleanedText.replace(/&#\d+;/g, ''); // &#123; entities numéricas
    cleanedText = cleanedText.replace(/&\w+;/g, ''); // Qualquer entity restante
    // ═══════════════════════════════════════════
    // 10. NORMALIZAR ESPAÇOS E QUEBRAS DE LINHA
    // ═══════════════════════════════════════════
    cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n'); // Max 2 quebras de linha
    cleanedText = cleanedText.replace(/[ \t]{2,}/g, ' '); // Espaços múltiplos → um
    cleanedText = cleanedText.replace(/\s+([.,!?;:])/g, '$1'); // Espaço antes de pontuação
    cleanedText = cleanedText.replace(/^\s+$/gm, ''); // Linhas só com espaço
    cleanedText = cleanedText.trim();
    // ═══════════════════════════════════════════
    // 11. LOG PARA DEBUG
    // ═══════════════════════════════════════════
    if (text.length !== cleanedText.length) {
        var removed = text.length - cleanedText.length;
        console.log("[TTS-SANITIZE] Texto sanitizado para audio:");
        console.log("   Original (".concat(text.length, " chars): \"").concat(text.substring(0, 80), "...\""));
        console.log("   Limpo (".concat(cleanedText.length, " chars): \"").concat(cleanedText.substring(0, 80), "...\""));
        console.log("   Removidos: ".concat(removed, " caracteres de formatacao"));
    }
    return cleanedText;
}
/**
 * @deprecated Use sanitizeTextForTTS() - mantido para compatibilidade
 */
function removeUrlsFromText(text) {
    return sanitizeTextForTTS(text);
}
/**
 * Verifica se deve gerar áudio TTS para a resposta da IA
 * @param userId - ID do usuário
 * @returns Configuração de áudio ou null se desabilitado/sem cota
 */
function getAudioResponseSettings(userId, context) {
    return __awaiter(this, void 0, void 0, function () {
        var config, responseMode, customerMessageWasAudio, shouldSendText, fallbackToTextIfAudioFails, usage, voice, speedNum, ratePercent, rate, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, storage_1.storage.getAudioConfig(userId)];
                case 1:
                    config = _b.sent();
                    if (!config || !config.isEnabled) {
                        console.log("\uD83D\uDD07 [TTS-RESPONSE] \u00C1udio desabilitado para usu\u00E1rio ".concat(userId.substring(0, 8), "..."));
                        return [2 /*return*/, {
                                responseMode: "disabled",
                                shouldSendText: true,
                                shouldGenerateAudio: false,
                                fallbackToTextIfAudioFails: false,
                            }];
                    }
                    responseMode = ((_a = config.responseMode) !== null && _a !== void 0 ? _a : "audio_text");
                    customerMessageWasAudio = Boolean(context === null || context === void 0 ? void 0 : context.customerMessageWasAudio);
                    if (responseMode === "audio_on_customer_audio" && !customerMessageWasAudio) {
                        return [2 /*return*/, {
                                responseMode: responseMode,
                                shouldSendText: true,
                                shouldGenerateAudio: false,
                                fallbackToTextIfAudioFails: false,
                            }];
                    }
                    shouldSendText = responseMode === "audio_text";
                    fallbackToTextIfAudioFails = !shouldSendText;
                    return [4 /*yield*/, storage_1.storage.canSendAudio(userId)];
                case 2:
                    usage = _b.sent();
                    if (!usage.canSend) {
                        console.log("\u26A0\uFE0F [TTS-RESPONSE] Limite di\u00E1rio atingido para usu\u00E1rio ".concat(userId.substring(0, 8), "... (").concat(usage.limit, "/").concat(usage.limit, ")"));
                        return [2 /*return*/, {
                                responseMode: responseMode,
                                shouldSendText: true,
                                shouldGenerateAudio: false,
                                fallbackToTextIfAudioFails: false,
                            }];
                    }
                    voice = VOICE_MAP[config.voiceType] || VOICE_MAP.female;
                    speedNum = parseFloat(config.speed);
                    ratePercent = Math.round((speedNum - 1) * 100);
                    rate = ratePercent >= 0 ? "+".concat(ratePercent, "%") : "".concat(ratePercent, "%");
                    console.log("\uD83C\uDFA4 [TTS-RESPONSE] \u00C1udio habilitado - Mode: ".concat(responseMode, ", Voice: ").concat(voice, ", Speed: ").concat(speedNum, "x, Restante: ").concat(usage.remaining, "/").concat(usage.limit));
                    return [2 /*return*/, {
                            responseMode: responseMode,
                            shouldSendText: shouldSendText,
                            shouldGenerateAudio: true,
                            fallbackToTextIfAudioFails: fallbackToTextIfAudioFails,
                            voice: voice,
                            speed: config.speed,
                            rate: rate,
                        }];
                case 3:
                    error_1 = _b.sent();
                    console.error("[TTS-RESPONSE] Erro ao verificar config:", error_1);
                    return [2 /*return*/, {
                            responseMode: "disabled",
                            shouldSendText: true,
                            shouldGenerateAudio: false,
                            fallbackToTextIfAudioFails: false,
                        }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function shouldGenerateAudioResponse(userId, context) {
    return __awaiter(this, void 0, void 0, function () {
        var settings;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getAudioResponseSettings(userId, context)];
                case 1:
                    settings = _a.sent();
                    if (!settings.shouldGenerateAudio || !settings.voice || !settings.speed || !settings.rate) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, {
                            shouldGenerate: true,
                            voice: settings.voice,
                            speed: settings.speed,
                            rate: settings.rate,
                        }];
            }
        });
    });
}
/**
 * Gera áudio TTS da resposta da IA
 * IMPORTANTE: Sanitiza texto (remove URLs, formatação, etc) antes de converter
 * @param text - Texto para converter em áudio
 * @param voice - Voz do Edge TTS
 * @param rate - Taxa de velocidade (ex: "+0%", "-20%")
 * @returns Buffer do áudio MP3 ou null se falhar
 */
function generateAudioForResponse(text, voice, rate) {
    return __awaiter(this, void 0, void 0, function () {
        var sanitizedText, maxLength, trimmedText, audioBuffer, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    sanitizedText = sanitizeTextForTTS(text);
                    if (!sanitizedText || sanitizedText.trim().length === 0) {
                        console.log("\u26A0\uFE0F [TTS-RESPONSE] Texto vazio ap\u00F3s sanitiza\u00E7\u00E3o, pulando gera\u00E7\u00E3o de \u00E1udio");
                        return [2 /*return*/, null];
                    }
                    maxLength = 500;
                    trimmedText = sanitizedText.length > maxLength
                        ? sanitizedText.substring(0, maxLength) + "..."
                        : sanitizedText;
                    console.log("\uD83C\uDF99\uFE0F [TTS-RESPONSE] Gerando \u00E1udio para: \"".concat(trimmedText.substring(0, 50), "...\""));
                    return [4 /*yield*/, (0, ttsService_1.generateWithEdgeTTS)(trimmedText, voice, rate)];
                case 1:
                    audioBuffer = _a.sent();
                    if (!audioBuffer || audioBuffer.length < 1000) {
                        console.error("[TTS-RESPONSE] Áudio gerado muito pequeno ou vazio");
                        return [2 /*return*/, null];
                    }
                    console.log("\u2705 [TTS-RESPONSE] \u00C1udio gerado: ".concat(audioBuffer.length, " bytes"));
                    return [2 /*return*/, audioBuffer];
                case 2:
                    error_2 = _a.sent();
                    console.error("[TTS-RESPONSE] Erro ao gerar áudio:", error_2);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Envia áudio como mensagem de voz (PTT) via WhatsApp
 * FLUXO OTIMIZADO: Gerar → Salvar temp → Enviar → APAGAR IMEDIATAMENTE
 * Arquivos são sempre apagados, mesmo em caso de erro
 *
 * @param userId - ID do usuário
 * @param jid - JID do destinatário
 * @param audioBuffer - Buffer do áudio MP3
 * @param socket - Socket do WhatsApp
 */
function sendAudioAsVoiceMessage(userId, jid, audioBuffer, socket) {
    return __awaiter(this, void 0, void 0, function () {
        var tmpFile, counterResult, error_3, unlinkError_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    tmpFile = null;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 6, 7, 12]);
                    return [4 /*yield*/, ensureTmpDir()];
                case 2:
                    _a.sent();
                    // Salvar temporariamente - APENAS no sistema de arquivos local (Railway)
                    // NÃO usa Supabase Storage para evitar acúmulo de arquivos
                    tmpFile = path_1.default.join(TMP_DIR, "tts-".concat(Date.now(), "-").concat(Math.random().toString(36).substring(7), ".mp3"));
                    return [4 /*yield*/, promises_1.default.writeFile(tmpFile, audioBuffer)];
                case 3:
                    _a.sent();
                    console.log("\uD83D\uDCE4 [TTS-RESPONSE] Enviando \u00E1udio como mensagem de voz para ".concat(jid, " (arquivo: ").concat(tmpFile, ")"));
                    // Enviar como PTT (Push to Talk / Mensagem de voz)
                    return [4 /*yield*/, socket.sendMessage(jid, {
                            audio: { url: tmpFile },
                            mimetype: "audio/mpeg",
                            ptt: true, // Push-to-talk = aparece como mensagem de voz gravada
                        })];
                case 4:
                    // Enviar como PTT (Push to Talk / Mensagem de voz)
                    _a.sent();
                    return [4 /*yield*/, storage_1.storage.incrementAudioMessageCounter(userId)];
                case 5:
                    counterResult = _a.sent();
                    console.log("\uD83D\uDCCA [TTS-RESPONSE] Contador atualizado: ".concat(counterResult.count, "/").concat(counterResult.limit));
                    console.log("\u2705 [TTS-RESPONSE] \u00C1udio enviado com sucesso!");
                    return [2 /*return*/, true];
                case 6:
                    error_3 = _a.sent();
                    console.error("[TTS-RESPONSE] Erro ao enviar áudio:", error_3);
                    return [2 /*return*/, false];
                case 7:
                    if (!tmpFile) return [3 /*break*/, 11];
                    _a.label = 8;
                case 8:
                    _a.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, promises_1.default.unlink(tmpFile)];
                case 9:
                    _a.sent();
                    console.log("\uD83D\uDDD1\uFE0F [TTS-RESPONSE] Arquivo tempor\u00E1rio apagado: ".concat(tmpFile));
                    return [3 /*break*/, 11];
                case 10:
                    unlinkError_1 = _a.sent();
                    // Ignorar erro ao apagar (arquivo pode já não existir)
                    console.warn("\u26A0\uFE0F [TTS-RESPONSE] Erro ao apagar arquivo tempor\u00E1rio:", unlinkError_1);
                    return [3 /*break*/, 11];
                case 11: return [7 /*endfinally*/];
                case 12: return [2 /*return*/];
            }
        });
    });
}
/**
 * Processa e envia áudio TTS para uma resposta da IA
 * Esta é a função principal a ser chamada após o agente gerar uma resposta
 *
 * @param userId - ID do usuário
 * @param jid - JID do destinatário
 * @param responseText - Texto da resposta da IA
 * @param socket - Socket do WhatsApp
 * @returns true se áudio foi enviado, false caso contrário
 */
function processAudioResponseForAgent(userId, jid, responseText, socket, context) {
    return __awaiter(this, void 0, void 0, function () {
        var audioConfig, audioBuffer, sent, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, shouldGenerateAudioResponse(userId, context)];
                case 1:
                    audioConfig = _a.sent();
                    if (!audioConfig || !audioConfig.shouldGenerate) {
                        return [2 /*return*/, false];
                    }
                    return [4 /*yield*/, generateAudioForResponse(responseText, audioConfig.voice, audioConfig.rate)];
                case 2:
                    audioBuffer = _a.sent();
                    if (!audioBuffer) {
                        console.warn("[TTS-RESPONSE] Falha ao gerar áudio, continuando sem ele");
                        return [2 /*return*/, false];
                    }
                    // 3. Pequeno delay antes de enviar o áudio (mais natural)
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000 + Math.random() * 500); })];
                case 3:
                    // 3. Pequeno delay antes de enviar o áudio (mais natural)
                    _a.sent();
                    return [4 /*yield*/, sendAudioAsVoiceMessage(userId, jid, audioBuffer, socket)];
                case 4:
                    sent = _a.sent();
                    return [2 /*return*/, sent];
                case 5:
                    error_4 = _a.sent();
                    console.error("[TTS-RESPONSE] Erro no processamento:", error_4);
                    return [2 /*return*/, false];
                case 6: return [2 /*return*/];
            }
        });
    });
}
// Limpar arquivos temporários antigos (executar periodicamente)
// OTIMIZAÇÃO: Limpa a cada 5 minutos, remove arquivos > 5 minutos
// Isso garante que não fique acumulando arquivos no Railway
function cleanupOldTTSFiles() {
    return __awaiter(this, void 0, void 0, function () {
        var files, now, cleaned, _i, files_1, file, filePath, stats, ageMinutes, e_2, e_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 11, , 12]);
                    return [4 /*yield*/, ensureTmpDir()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, promises_1.default.readdir(TMP_DIR)];
                case 2:
                    files = _a.sent();
                    now = Date.now();
                    cleaned = 0;
                    _i = 0, files_1 = files;
                    _a.label = 3;
                case 3:
                    if (!(_i < files_1.length)) return [3 /*break*/, 10];
                    file = files_1[_i];
                    filePath = path_1.default.join(TMP_DIR, file);
                    _a.label = 4;
                case 4:
                    _a.trys.push([4, 8, , 9]);
                    return [4 /*yield*/, promises_1.default.stat(filePath)];
                case 5:
                    stats = _a.sent();
                    ageMinutes = (now - stats.mtime.getTime()) / 1000 / 60;
                    if (!(ageMinutes > 5)) return [3 /*break*/, 7];
                    return [4 /*yield*/, promises_1.default.unlink(filePath)];
                case 6:
                    _a.sent();
                    cleaned++;
                    _a.label = 7;
                case 7: return [3 /*break*/, 9];
                case 8:
                    e_2 = _a.sent();
                    return [3 /*break*/, 9];
                case 9:
                    _i++;
                    return [3 /*break*/, 3];
                case 10:
                    if (cleaned > 0) {
                        console.log("\uD83E\uDDF9 [TTS-RESPONSE] Limpeza: ".concat(cleaned, " arquivos tempor\u00E1rios removidos"));
                    }
                    return [2 /*return*/, cleaned];
                case 11:
                    e_3 = _a.sent();
                    return [2 /*return*/, 0];
                case 12: return [2 /*return*/];
            }
        });
    });
}
// Agendar limpeza a cada 5 minutos (mais frequente para não acumular)
setInterval(cleanupOldTTSFiles, 5 * 60 * 1000);
// Executar limpeza imediatamente ao iniciar
cleanupOldTTSFiles();
