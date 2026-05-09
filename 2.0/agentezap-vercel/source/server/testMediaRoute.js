"use strict";
/**
 * Rota de teste para configurar fluxo completo de mídia
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
var express_1 = require("express");
var storage_1 = require("./storage");
var uuid_1 = require("uuid");
var router = (0, express_1.Router)();
router.post("/api/test/setup-media-flow", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var user, userId, agentPrompt, agent, mediaUrl, token, medias, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 18, , 19]);
                console.log("🚀 Configurando fluxo de teste de mídia...");
                return [4 /*yield*/, storage_1.storage.getUserByEmail("teste@agentezap.com")];
            case 1:
                user = _a.sent();
                if (!!user) return [3 /*break*/, 4];
                userId = (0, uuid_1.v4)();
                return [4 /*yield*/, storage_1.storage.createUser({
                        id: userId,
                        email: "teste@agentezap.com",
                        name: "Usuário Teste",
                        phone: "+5511999999999",
                        role: "user",
                    })];
            case 2:
                _a.sent();
                return [4 /*yield*/, storage_1.storage.getUserByEmail("teste@agentezap.com")];
            case 3:
                user = _a.sent();
                console.log("\u2705 Usu\u00E1rio criado: ".concat(user === null || user === void 0 ? void 0 : user.id));
                return [3 /*break*/, 5];
            case 4:
                console.log("\u2705 Usu\u00E1rio encontrado: ".concat(user.id));
                _a.label = 5;
            case 5:
                if (!user) {
                    return [2 /*return*/, res.status(500).json({ error: "Falha ao criar/buscar usuário" })];
                }
                agentPrompt = "# IDENTIDADE\nSou o Vendedor Virtual da Loja Teste. Atendo clientes com cordialidade.\n\n# CONTEXTO\nLoja de produtos diversos com cat\u00E1logo de imagens.\n\n# INSTRU\u00C7\u00D5ES IMPORTANTES PARA M\u00CDDIA\nQuando o cliente perguntar sobre \"catalogo\" ou \"produtos\", voc\u00EA DEVE incluir EXATAMENTE a tag [MEDIA:CATALOGO_TESTE] no final da sua resposta.\n\nExemplo correto:\nCliente: \"quero ver o catalogo\"\nVoc\u00EA: \"Claro! Aqui est\u00E1 nosso cat\u00E1logo completo: [MEDIA:CATALOGO_TESTE]\"";
                return [4 /*yield*/, storage_1.storage.getAgentConfig(user.id)];
            case 6:
                agent = _a.sent();
                if (!!agent) return [3 /*break*/, 8];
                return [4 /*yield*/, storage_1.storage.createAgentConfig({
                        userId: user.id,
                        prompt: agentPrompt,
                        isActive: true,
                        model: "mistral-small-latest",
                    })];
            case 7:
                _a.sent();
                console.log("\u2705 Agente criado");
                return [3 /*break*/, 10];
            case 8: return [4 /*yield*/, storage_1.storage.updateAgentPrompt(user.id, agentPrompt)];
            case 9:
                _a.sent();
                console.log("\u2705 Agente atualizado");
                _a.label = 10;
            case 10:
                // 3. Limpar e adicionar mídia
                console.log("📸 Configurando mídia...");
                // Deletar mídias antigas
                return [4 /*yield*/, storage_1.storage.db("agent_media_library")
                        .where({ user_id: user.id })
                        .del()];
            case 11:
                // Deletar mídias antigas
                _a.sent();
                mediaUrl = "https://via.placeholder.com/300x200.png?text=CATALOGO";
                return [4 /*yield*/, storage_1.storage.db("agent_media_library").insert({
                        user_id: user.id,
                        name: "CATALOGO_TESTE",
                        media_type: "image",
                        storage_url: mediaUrl,
                        description: "Catálogo de produtos da loja",
                        when_to_use: "catalogo",
                        is_active: true,
                        send_alone: false,
                        display_order: 0,
                    })];
            case 12:
                _a.sent();
                console.log("\u2705 M\u00EDdia adicionada: ".concat(mediaUrl));
                return [4 /*yield*/, storage_1.storage.db("test_agent_tokens")
                        .where({ user_id: user.id })
                        .first()];
            case 13:
                token = _a.sent();
                if (!!token) return [3 /*break*/, 15];
                return [4 /*yield*/, storage_1.storage.db("test_agent_tokens")
                        .insert({
                        user_id: user.id,
                        token: "TEST_MEDIA_" + Date.now(),
                        agent_name: "Vendedor Virtual",
                        company_name: "Loja Teste",
                    })
                        .returning("*")];
            case 14:
                token = (_a.sent())[0];
                console.log("\u2705 Token criado: ".concat(token.token));
                return [3 /*break*/, 16];
            case 15:
                console.log("\u2705 Token existente: ".concat(token.token));
                _a.label = 16;
            case 16: return [4 /*yield*/, storage_1.storage.db("agent_media_library")
                    .where({ user_id: user.id, is_active: true })
                    .select("*")];
            case 17:
                medias = _a.sent();
                res.json({
                    success: true,
                    userId: user.id,
                    token: token.token,
                    testUrl: "http://localhost:5000/test/".concat(token.token),
                    mediasCount: medias.length,
                    medias: medias.map(function (m) { return ({
                        name: m.name,
                        whenToUse: m.when_to_use,
                        type: m.media_type
                    }); }),
                    instructions: [
                        "1. Abra o link testUrl",
                        "2. Digite: 'quero ver o catalogo'",
                        "3. O agente deve incluir [MEDIA:CATALOGO_TESTE] na resposta",
                        "4. O frontend deve exibir a imagem"
                    ]
                });
                return [3 /*break*/, 19];
            case 18:
                error_1 = _a.sent();
                console.error("❌ Erro ao configurar teste:", error_1);
                res.status(500).json({ error: String(error_1) });
                return [3 /*break*/, 19];
            case 19: return [2 /*return*/];
        }
    });
}); });
exports.default = router;
