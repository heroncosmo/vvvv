"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.registerBlogRoutes = registerBlogRoutes;
var middleware_1 = require("./middleware");
var blogService_1 = require("./blogService");
function registerBlogRoutes(app) {
    var _this = this;
    app.get("/api/public/blog/posts", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var limit, category, tag, posts, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    limit = Number(req.query.limit || 12);
                    category = typeof req.query.category === "string" ? req.query.category : undefined;
                    tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
                    return [4 /*yield*/, (0, blogService_1.listPublicBlogPosts)({ limit: limit, category: category, tag: tag })];
                case 1:
                    posts = _a.sent();
                    res.json({ success: true, data: posts, total: posts.length });
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    console.error("[BLOG] Erro na listagem publica:", error_1);
                    res.status(500).json({ success: false, message: "Falha ao listar posts do blog" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.get("/api/public/blog/posts/:slug", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var post, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, blogService_1.getPublicBlogPostBySlug)(req.params.slug)];
                case 1:
                    post = _a.sent();
                    if (!post) {
                        return [2 /*return*/, res.status(404).json({ success: false, message: "Post nao encontrado" })];
                    }
                    res.json({ success: true, data: post });
                    return [3 /*break*/, 3];
                case 2:
                    error_2 = _a.sent();
                    console.error("[BLOG] Erro ao carregar post publico:", error_2);
                    res.status(500).json({ success: false, message: "Falha ao carregar post do blog" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.get("/api/public/blog/categories", function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, _b, error_3;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    _b = (_a = res).json;
                    _c = { success: true };
                    return [4 /*yield*/, (0, blogService_1.listPublicBlogCategories)()];
                case 1:
                    _b.apply(_a, [(_c.data = _d.sent(), _c)]);
                    return [3 /*break*/, 3];
                case 2:
                    error_3 = _d.sent();
                    console.error("[BLOG] Erro ao listar categorias:", error_3);
                    res.status(500).json({ success: false, message: "Falha ao listar categorias do blog" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.get("/api/public/blog/tags", function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, _b, error_4;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    _b = (_a = res).json;
                    _c = { success: true };
                    return [4 /*yield*/, (0, blogService_1.listPublicBlogTags)()];
                case 1:
                    _b.apply(_a, [(_c.data = _d.sent(), _c)]);
                    return [3 /*break*/, 3];
                case 2:
                    error_4 = _d.sent();
                    console.error("[BLOG] Erro ao listar tags:", error_4);
                    res.status(500).json({ success: false, message: "Falha ao listar tags do blog" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.get("/blog", function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
        var html, error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, blogService_1.buildBlogHomepageHtml)()];
                case 1:
                    html = _a.sent();
                    res.setHeader("Content-Type", "text/html; charset=utf-8");
                    res.send(html);
                    return [3 /*break*/, 3];
                case 2:
                    error_5 = _a.sent();
                    console.error("[BLOG] Erro na home do blog:", error_5);
                    res.status(500).send("Falha ao carregar o blog");
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.get("/blog/categoria/:slug", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var html, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, blogService_1.buildBlogListingHtml)("category", req.params.slug)];
                case 1:
                    html = _a.sent();
                    res.setHeader("Content-Type", "text/html; charset=utf-8");
                    res.send(html);
                    return [3 /*break*/, 3];
                case 2:
                    error_6 = _a.sent();
                    console.error("[BLOG] Erro na categoria do blog:", error_6);
                    res.status(500).send("Falha ao carregar categoria do blog");
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.get("/blog/tag/:slug", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var html, error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, blogService_1.buildBlogListingHtml)("tag", req.params.slug)];
                case 1:
                    html = _a.sent();
                    res.setHeader("Content-Type", "text/html; charset=utf-8");
                    res.send(html);
                    return [3 /*break*/, 3];
                case 2:
                    error_7 = _a.sent();
                    console.error("[BLOG] Erro na tag do blog:", error_7);
                    res.status(500).send("Falha ao carregar tag do blog");
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.get("/blog/:slug", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var html, error_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, blogService_1.buildBlogPostHtml)(req.params.slug)];
                case 1:
                    html = _a.sent();
                    if (!html) {
                        return [2 /*return*/, res.status(404).send("Post nao encontrado")];
                    }
                    res.setHeader("Content-Type", "text/html; charset=utf-8");
                    res.send(html);
                    return [3 /*break*/, 3];
                case 2:
                    error_8 = _a.sent();
                    console.error("[BLOG] Erro no post do blog:", error_8);
                    res.status(500).send("Falha ao carregar post do blog");
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.get("/sitemap-blog.xml", function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, _b, error_9;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    res.setHeader("Content-Type", "application/xml");
                    res.setHeader("Cache-Control", "public, max-age=3600");
                    _b = (_a = res).send;
                    return [4 /*yield*/, (0, blogService_1.generateBlogSitemapXml)()];
                case 1:
                    _b.apply(_a, [_c.sent()]);
                    return [3 /*break*/, 3];
                case 2:
                    error_9 = _c.sent();
                    console.error("[BLOG] Erro ao gerar sitemap do blog:", error_9);
                    res.status(500).send("Falha ao gerar sitemap do blog");
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.get("/rss.xml", function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, _b, error_10;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    res.setHeader("Content-Type", "application/rss+xml");
                    res.setHeader("Cache-Control", "public, max-age=3600");
                    _b = (_a = res).send;
                    return [4 /*yield*/, (0, blogService_1.generateBlogRssXml)()];
                case 1:
                    _b.apply(_a, [_c.sent()]);
                    return [3 /*break*/, 3];
                case 2:
                    error_10 = _c.sent();
                    console.error("[BLOG] Erro ao gerar RSS:", error_10);
                    res.status(500).send("Falha ao gerar RSS do blog");
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.post("/api/admin/blog/discovery/run", middleware_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var limit, result, error_11;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    limit = Number(((_a = req.body) === null || _a === void 0 ? void 0 : _a.limit) || 8);
                    return [4 /*yield*/, (0, blogService_1.discoverBlogTopics)(limit)];
                case 1:
                    result = _b.sent();
                    res.json(__assign({ success: true }, result));
                    return [3 /*break*/, 3];
                case 2:
                    error_11 = _b.sent();
                    console.error("[BLOG] Erro na discovery manual:", error_11);
                    res.status(500).json({ success: false, message: "Falha ao descobrir pautas" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.post("/api/admin/blog/generate/run", middleware_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var topicId, autoPublish, post, error_12;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    topicId = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.topicId) === "string" ? req.body.topicId : undefined;
                    autoPublish = Boolean((_b = req.body) === null || _b === void 0 ? void 0 : _b.autoPublish);
                    return [4 /*yield*/, (0, blogService_1.generateBlogPostFromTopic)(topicId, { autoPublish: autoPublish })];
                case 1:
                    post = _c.sent();
                    res.json({ success: true, data: post });
                    return [3 /*break*/, 3];
                case 2:
                    error_12 = _c.sent();
                    console.error("[BLOG] Erro na geracao manual:", error_12);
                    res.status(500).json({ success: false, message: error_12 instanceof Error ? error_12.message : "Falha ao gerar post" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.post("/api/admin/blog/publish/run", middleware_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var post, error_13;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    if (!((_a = req.body) === null || _a === void 0 ? void 0 : _a.postId) || typeof req.body.postId !== "string") {
                        return [2 /*return*/, res.status(400).json({ success: false, message: "postId obrigatorio" })];
                    }
                    return [4 /*yield*/, (0, blogService_1.publishBlogPost)(req.body.postId)];
                case 1:
                    post = _b.sent();
                    res.json({ success: true, data: post });
                    return [3 /*break*/, 3];
                case 2:
                    error_13 = _b.sent();
                    console.error("[BLOG] Erro na publicacao manual:", error_13);
                    res.status(500).json({ success: false, message: error_13 instanceof Error ? error_13.message : "Falha ao publicar post" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.post("/api/admin/blog/refresh/run", middleware_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var postId, post, error_14;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    postId = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.postId) === "string" ? req.body.postId : undefined;
                    return [4 /*yield*/, (0, blogService_1.refreshBlogPost)(postId)];
                case 1:
                    post = _b.sent();
                    res.json({ success: true, data: post });
                    return [3 /*break*/, 3];
                case 2:
                    error_14 = _b.sent();
                    console.error("[BLOG] Erro no refresh manual:", error_14);
                    res.status(500).json({ success: false, message: error_14 instanceof Error ? error_14.message : "Falha ao atualizar post" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.get("/api/admin/blog/metrics", middleware_1.isAdmin, function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, _b, error_15;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    _b = (_a = res).json;
                    _c = { success: true };
                    return [4 /*yield*/, (0, blogService_1.getBlogAdminMetrics)()];
                case 1:
                    _b.apply(_a, [(_c.data = _d.sent(), _c)]);
                    return [3 /*break*/, 3];
                case 2:
                    error_15 = _d.sent();
                    console.error("[BLOG] Erro ao buscar metricas:", error_15);
                    res.status(500).json({ success: false, message: "Falha ao buscar metricas do blog" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.get("/api/admin/blog/indexing", middleware_1.isAdmin, function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, _b, error_16;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    _b = (_a = res).json;
                    _c = { success: true };
                    return [4 /*yield*/, (0, blogService_1.getBlogIndexingStatus)()];
                case 1:
                    _b.apply(_a, [(_c.data = _d.sent(), _c)]);
                    return [3 /*break*/, 3];
                case 2:
                    error_16 = _d.sent();
                    console.error("[BLOG] Erro ao buscar status de indexacao:", error_16);
                    res.status(500).json({ success: false, message: "Falha ao buscar status de indexacao" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.post("/api/admin/blog/search-console/submit-sitemap", middleware_1.isAdmin, function (_req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, _b, error_17;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    _b = (_a = res).json;
                    _c = { success: true };
                    return [4 /*yield*/, (0, blogService_1.submitBlogSitemap)()];
                case 1:
                    _b.apply(_a, [(_c.data = _d.sent(), _c)]);
                    return [3 /*break*/, 3];
                case 2:
                    error_17 = _d.sent();
                    console.error("[BLOG] Erro ao submeter sitemap:", error_17);
                    res.status(500).json({ success: false, message: "Falha ao submeter sitemap do blog" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.post("/api/admin/blog/indexing/inspect", middleware_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var _a, _b, error_18;
        var _c;
        var _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 2, , 3]);
                    if (!((_d = req.body) === null || _d === void 0 ? void 0 : _d.postId) || typeof req.body.postId !== "string") {
                        return [2 /*return*/, res.status(400).json({ success: false, message: "postId obrigatorio" })];
                    }
                    _b = (_a = res).json;
                    _c = { success: true };
                    return [4 /*yield*/, (0, blogService_1.inspectBlogPostUrl)(req.body.postId)];
                case 1:
                    _b.apply(_a, [(_c.data = _e.sent(), _c)]);
                    return [3 /*break*/, 3];
                case 2:
                    error_18 = _e.sent();
                    console.error("[BLOG] Erro na inspecao manual:", error_18);
                    res.status(500).json({ success: false, message: error_18 instanceof Error ? error_18.message : "Falha na inspecao de URL" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
}
