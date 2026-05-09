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
exports.generateSimulatorDemoCapture = generateSimulatorDemoCapture;
var node_fs_1 = require("node:fs");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var playwright_1 = require("playwright");
var DEFAULT_MESSAGES = [
    "Oi, quero testar como voce atende meus clientes.",
    "Tambem preciso de agendamento e envio de cardapio.",
    "Mostra um exemplo de resposta para cliente indeciso.",
];
var VIEWPORT = { width: 430, height: 920 };
var NAV_TIMEOUT_MS = 45000;
var WAIT_BETWEEN_MESSAGES_MS = 3200;
var WAIT_AFTER_OPEN_MS = 4000;
function safeSuffix(value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "demo";
}
function buildPublicBaseUrl(preferredUrl) {
    var appUrl = (process.env.APP_URL || "").trim();
    if (appUrl) {
        return appUrl.replace(/\/+$/, "");
    }
    if (preferredUrl) {
        try {
            return new URL(preferredUrl).origin;
        }
        catch (_a) {
            // Ignore invalid fallback URLs and use the default public domain below.
        }
    }
    return "https://agentezap.online";
}
function buildPublicUrl(relativePath, preferredUrl) {
    var normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    return "".concat(buildPublicBaseUrl(preferredUrl), "/").concat(normalized);
}
function ensureDir(dirPath) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!!node_fs_1.default.existsSync(dirPath)) return [3 /*break*/, 2];
                    return [4 /*yield*/, promises_1.default.mkdir(dirPath, { recursive: true })];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    });
}
function waitForSimulatorInput(page) {
    return __awaiter(this, void 0, void 0, function () {
        var locator;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    locator = page.locator('input[placeholder*="Digite uma mensagem"]');
                    return [4 /*yield*/, locator.first().waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function sendScenarioMessages(page, messages) {
    return __awaiter(this, void 0, void 0, function () {
        var input, _i, messages_1, message;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    input = page.locator('input[placeholder*="Digite uma mensagem"]').first();
                    _i = 0, messages_1 = messages;
                    _a.label = 1;
                case 1:
                    if (!(_i < messages_1.length)) return [3 /*break*/, 6];
                    message = messages_1[_i];
                    return [4 /*yield*/, input.fill(message)];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, page.keyboard.press("Enter")];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, page.waitForTimeout(WAIT_BETWEEN_MESSAGES_MS)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function generateSimulatorDemoCapture(options) {
    return __awaiter(this, void 0, void 0, function () {
        var includeScreenshot, includeVideo, uploadsRoot, demoDir, videoTempDir, stamp, suffix, screenshotFileName, screenshotAbsPath, videoFileName, videoAbsPath, browser, context, page, videoRef, messages, copiedVideo, rawVideoPath, videoError_1, screenshotRelative, videoRelative, error_1, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    includeScreenshot = options.includeScreenshot !== false;
                    includeVideo = options.includeVideo === true;
                    if (!includeScreenshot && !includeVideo) {
                        return [2 /*return*/, { success: false, error: "Nenhum formato solicitado para demo" }];
                    }
                    uploadsRoot = node_path_1.default.join(process.cwd(), "uploads");
                    demoDir = node_path_1.default.join(uploadsRoot, "admin-demos");
                    videoTempDir = node_path_1.default.join(demoDir, "tmp-videos");
                    return [4 /*yield*/, ensureDir(demoDir)];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, ensureDir(videoTempDir)];
                case 2:
                    _c.sent();
                    stamp = new Date().toISOString().replace(/[:.]/g, "-");
                    suffix = safeSuffix(options.simulatorLink.split("/").pop() || "demo");
                    screenshotFileName = "simulator-demo-".concat(suffix, "-").concat(stamp, ".png");
                    screenshotAbsPath = node_path_1.default.join(demoDir, screenshotFileName);
                    videoFileName = "simulator-demo-".concat(suffix, "-").concat(stamp, ".webm");
                    videoAbsPath = node_path_1.default.join(demoDir, videoFileName);
                    browser = null;
                    context = null;
                    page = null;
                    videoRef = null;
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 20, 21, 30]);
                    return [4 /*yield*/, playwright_1.chromium.launch({
                            headless: true,
                            args: ["--no-sandbox", "--disable-setuid-sandbox"],
                        })];
                case 4:
                    browser = _c.sent();
                    return [4 /*yield*/, browser.newContext(__assign({ viewport: VIEWPORT }, (includeVideo
                            ? {
                                recordVideo: {
                                    dir: videoTempDir,
                                    size: VIEWPORT,
                                },
                            }
                            : {})))];
                case 5:
                    context = _c.sent();
                    return [4 /*yield*/, context.newPage()];
                case 6:
                    page = _c.sent();
                    videoRef = page.video();
                    return [4 /*yield*/, page.goto(options.simulatorLink, {
                            waitUntil: "domcontentloaded",
                            timeout: NAV_TIMEOUT_MS,
                        })];
                case 7:
                    _c.sent();
                    return [4 /*yield*/, waitForSimulatorInput(page)];
                case 8:
                    _c.sent();
                    return [4 /*yield*/, page.waitForTimeout(WAIT_AFTER_OPEN_MS)];
                case 9:
                    _c.sent();
                    messages = options.scenarioMessages && options.scenarioMessages.length > 0
                        ? options.scenarioMessages.slice(0, 4)
                        : DEFAULT_MESSAGES;
                    return [4 /*yield*/, sendScenarioMessages(page, messages)];
                case 10:
                    _c.sent();
                    if (!includeScreenshot) return [3 /*break*/, 12];
                    return [4 /*yield*/, page.screenshot({ path: screenshotAbsPath, fullPage: false })];
                case 11:
                    _c.sent();
                    _c.label = 12;
                case 12: return [4 /*yield*/, context.close()];
                case 13:
                    _c.sent();
                    copiedVideo = false;
                    if (!(includeVideo && videoRef)) return [3 /*break*/, 19];
                    _c.label = 14;
                case 14:
                    _c.trys.push([14, 18, , 19]);
                    return [4 /*yield*/, videoRef.path()];
                case 15:
                    rawVideoPath = _c.sent();
                    if (!(rawVideoPath && node_fs_1.default.existsSync(rawVideoPath))) return [3 /*break*/, 17];
                    return [4 /*yield*/, promises_1.default.copyFile(rawVideoPath, videoAbsPath)];
                case 16:
                    _c.sent();
                    copiedVideo = true;
                    _c.label = 17;
                case 17: return [3 /*break*/, 19];
                case 18:
                    videoError_1 = _c.sent();
                    console.error("[ADMIN DEMO] Falha ao materializar video:", videoError_1);
                    return [3 /*break*/, 19];
                case 19:
                    screenshotRelative = "uploads/admin-demos/".concat(screenshotFileName);
                    videoRelative = "uploads/admin-demos/".concat(videoFileName);
                    return [2 /*return*/, {
                            success: true,
                            screenshotPath: includeScreenshot ? screenshotAbsPath : undefined,
                            screenshotUrl: includeScreenshot && node_fs_1.default.existsSync(screenshotAbsPath)
                                ? buildPublicUrl(screenshotRelative, options.simulatorLink)
                                : undefined,
                            videoPath: copiedVideo ? videoAbsPath : undefined,
                            videoUrl: copiedVideo ? buildPublicUrl(videoRelative, options.simulatorLink) : undefined,
                        }];
                case 20:
                    error_1 = _c.sent();
                    console.error("[ADMIN DEMO] Erro ao gerar captura do simulador:", error_1);
                    return [2 /*return*/, {
                            success: false,
                            error: error_1 instanceof Error ? error_1.message : String(error_1),
                        }];
                case 21:
                    _c.trys.push([21, 24, , 25]);
                    if (!context) return [3 /*break*/, 23];
                    return [4 /*yield*/, context.close()];
                case 22:
                    _c.sent();
                    _c.label = 23;
                case 23: return [3 /*break*/, 25];
                case 24:
                    _a = _c.sent();
                    return [3 /*break*/, 25];
                case 25:
                    _c.trys.push([25, 28, , 29]);
                    if (!browser) return [3 /*break*/, 27];
                    return [4 /*yield*/, browser.close()];
                case 26:
                    _c.sent();
                    _c.label = 27;
                case 27: return [3 /*break*/, 29];
                case 28:
                    _b = _c.sent();
                    return [3 /*break*/, 29];
                case 29: return [7 /*endfinally*/];
                case 30: return [2 /*return*/];
            }
        });
    });
}
