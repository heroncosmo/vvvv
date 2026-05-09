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
exports.isAuthenticated = isAuthenticated;
exports.isAdmin = isAdmin;
exports.verifyAdminPassword = verifyAdminPassword;
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var bcryptjs_1 = require("bcryptjs");
var supabaseAuth_1 = require("./supabaseAuth");
function isAuthenticated(req, res, next) {
    return __awaiter(this, void 0, void 0, function () {
        var authHeader, token, session, member, owner, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    // Verificar se já tem req.user (autenticação Supabase padrão)
                    if (req.user) {
                        return [2 /*return*/, next()];
                    }
                    authHeader = req.headers.authorization;
                    if (!(authHeader && authHeader.startsWith('Bearer '))) return [3 /*break*/, 4];
                    token = authHeader.substring(7);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.teamMemberSessions)
                            .where((0, drizzle_orm_1.eq)(schema_1.teamMemberSessions.token, token))
                            .limit(1)];
                case 1:
                    session = (_a.sent())[0];
                    if (!(session && new Date(session.expiresAt) > new Date())) return [3 /*break*/, 4];
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.teamMembers)
                            .where((0, drizzle_orm_1.eq)(schema_1.teamMembers.id, session.memberId))
                            .limit(1)];
                case 2:
                    member = (_a.sent())[0];
                    if (!(member && member.isActive)) return [3 /*break*/, 4];
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, member.ownerId))
                            .limit(1)];
                case 3:
                    owner = (_a.sent())[0];
                    if (owner) {
                        // Simular req.user com dados do owner + marcação de membro
                        req.user = __assign(__assign({ id: owner.id }, owner), { isMember: true, memberData: member });
                        return [2 /*return*/, next()];
                    }
                    _a.label = 4;
                case 4: 
                // Nenhuma autenticação válida encontrada
                return [2 /*return*/, res.status(401).json({ message: "Unauthorized" })];
                case 5:
                    error_1 = _a.sent();
                    console.error("Error in isAuthenticated middleware:", error_1);
                    return [2 /*return*/, res.status(500).json({ message: "Internal server error" })];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function isAdmin(req, res, next) {
    return __awaiter(this, void 0, void 0, function () {
        var adminId_1, admin_1, userEmail_1, authHeader, token, _a, user, error, e_1, admin, error_2;
        var _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _f.trys.push([0, 8, , 9]);
                    adminId_1 = (_b = req.session) === null || _b === void 0 ? void 0 : _b.adminId;
                    // debug minimal
                    if (process.env.DEBUG_AUTH === '1') {
                        console.log('[isAdmin] path', req.path, 'adminId', adminId_1);
                    }
                    if (!adminId_1) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () {
                            return db_1.db
                                .select()
                                .from(schema_1.admins)
                                .where((0, drizzle_orm_1.eq)(schema_1.admins.id, adminId_1))
                                .limit(1);
                        })];
                case 1:
                    admin_1 = (_f.sent())[0];
                    if (admin_1) {
                        req.admin = admin_1;
                        return [2 /*return*/, next()];
                    }
                    _f.label = 2;
                case 2:
                    userEmail_1 = ((_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c.claims) === null || _d === void 0 ? void 0 : _d.email) || ((_e = req.user) === null || _e === void 0 ? void 0 : _e.email);
                    if (!!userEmail_1) return [3 /*break*/, 6];
                    authHeader = req.headers.authorization;
                    if (!(authHeader && authHeader.startsWith('Bearer '))) return [3 /*break*/, 6];
                    token = authHeader.substring(7);
                    _f.label = 3;
                case 3:
                    _f.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, supabaseAuth_1.supabase.auth.getUser(token)];
                case 4:
                    _a = _f.sent(), user = _a.data.user, error = _a.error;
                    if (!error && (user === null || user === void 0 ? void 0 : user.email)) {
                        userEmail_1 = user.email;
                    }
                    return [3 /*break*/, 6];
                case 5:
                    e_1 = _f.sent();
                    return [3 /*break*/, 6];
                case 6:
                    if (!userEmail_1) {
                        return [2 /*return*/, res.status(401).json({ message: "Unauthorized" })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () {
                            return db_1.db
                                .select()
                                .from(schema_1.admins)
                                .where((0, drizzle_orm_1.eq)(schema_1.admins.email, userEmail_1))
                                .limit(1);
                        })];
                case 7:
                    admin = (_f.sent())[0];
                    if (!admin) {
                        return [2 /*return*/, res.status(403).json({ message: "Forbidden - Admin access required" })];
                    }
                    req.admin = admin;
                    // Sync adminId into session for endpoints that read from req.session.adminId
                    // This ensures compatibility when auth was via Bearer token instead of session cookie
                    if (req.session && !req.session.adminId) {
                        req.session.adminId = admin.id;
                    }
                    next();
                    return [3 /*break*/, 9];
                case 8:
                    error_2 = _f.sent();
                    console.error("Error checking admin status:", error_2);
                    return [2 /*return*/, res.status(500).json({ message: "Internal server error" })];
                case 9: return [2 /*return*/];
            }
        });
    });
}
function verifyAdminPassword(email, password) {
    return __awaiter(this, void 0, void 0, function () {
        var admin, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.admins)
                            .where((0, drizzle_orm_1.eq)(schema_1.admins.email, email))
                            .limit(1)];
                case 1:
                    admin = _a.sent();
                    if (admin.length === 0) {
                        return [2 /*return*/, false];
                    }
                    return [4 /*yield*/, bcryptjs_1.default.compare(password, admin[0].passwordHash)];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    error_3 = _a.sent();
                    console.error("Error verifying admin password:", error_3);
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
