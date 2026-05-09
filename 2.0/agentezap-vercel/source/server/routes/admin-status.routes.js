"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
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
var express_1 = require("express");
var db_1 = require("../db");
var drizzle_orm_1 = require("drizzle-orm");
var middleware_1 = require("../middleware");
var router = (0, express_1.Router)();
// Get all statuses
router.get("/admin/statuses", middleware_1.isAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var result, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n      SELECT * FROM whatsapp_statuses \n      ORDER BY created_at DESC\n    "], ["\n      SELECT * FROM whatsapp_statuses \n      ORDER BY created_at DESC\n    "]))))];
            case 1:
                result = _a.sent();
                res.json(result.rows || []);
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                console.error("Error fetching statuses:", error_1);
                res.status(500).json({ message: "Failed to fetch statuses" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Get status history
router.get("/admin/status-history", middleware_1.isAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var result, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\n      SELECT * FROM status_history \n      ORDER BY sent_at DESC \n      LIMIT 100\n    "], ["\n      SELECT * FROM status_history \n      ORDER BY sent_at DESC \n      LIMIT 100\n    "]))))];
            case 1:
                result = _a.sent();
                res.json(result.rows || []);
                return [3 /*break*/, 3];
            case 2:
                error_2 = _a.sent();
                console.error("Error fetching status history:", error_2);
                res.status(500).json({ message: "Failed to fetch status history" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Create status
router.post("/admin/statuses", middleware_1.isAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, name_1, type, content, contentUrl, duration, schedule, rotation, result, error_3;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 2, , 3]);
                _a = req.body, name_1 = _a.name, type = _a.type, content = _a.content, contentUrl = _a.contentUrl, duration = _a.duration, schedule = _a.schedule, rotation = _a.rotation;
                return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["\n      INSERT INTO whatsapp_statuses (\n        id, name, type, content, content_url, duration, \n        schedule, rotation, is_active, priority, created_at, updated_at\n      ) VALUES (\n        gen_random_uuid(), ", ", ", ", ", ", ", ", ", ",\n        ", ", \n        ", ",\n        true, 0, NOW(), NOW()\n      )\n      RETURNING *\n    "], ["\n      INSERT INTO whatsapp_statuses (\n        id, name, type, content, content_url, duration, \n        schedule, rotation, is_active, priority, created_at, updated_at\n      ) VALUES (\n        gen_random_uuid(), ", ", ", ", ", ", ", ", ", ",\n        ", ", \n        ", ",\n        true, 0, NOW(), NOW()\n      )\n      RETURNING *\n    "])), name_1, type, content, contentUrl || null, duration || null, schedule ? JSON.stringify(schedule) : null, rotation ? JSON.stringify(rotation) : null))];
            case 1:
                result = _c.sent();
                res.status(201).json(((_b = result.rows) === null || _b === void 0 ? void 0 : _b[0]) || { message: "Status created" });
                return [3 /*break*/, 3];
            case 2:
                error_3 = _c.sent();
                console.error("Error creating status:", error_3);
                res.status(500).json({ message: "Failed to create status" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Update status
router.put("/admin/statuses/:id", middleware_1.isAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, _a, name_2, type, content, contentUrl, duration, schedule, rotation, isActive, result, error_4;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 2, , 3]);
                id = req.params.id;
                _a = req.body, name_2 = _a.name, type = _a.type, content = _a.content, contentUrl = _a.contentUrl, duration = _a.duration, schedule = _a.schedule, rotation = _a.rotation, isActive = _a.isActive;
                return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["\n      UPDATE whatsapp_statuses SET\n        name = ", ",\n        type = ", ",\n        content = ", ",\n        content_url = ", ",\n        duration = ", ",\n        schedule = ", ",\n        rotation = ", ",\n        is_active = ", ",\n        updated_at = NOW()\n      WHERE id = ", "\n      RETURNING *\n    "], ["\n      UPDATE whatsapp_statuses SET\n        name = ", ",\n        type = ", ",\n        content = ", ",\n        content_url = ", ",\n        duration = ", ",\n        schedule = ", ",\n        rotation = ", ",\n        is_active = ", ",\n        updated_at = NOW()\n      WHERE id = ", "\n      RETURNING *\n    "])), name_2, type, content, contentUrl || null, duration || null, schedule ? JSON.stringify(schedule) : null, rotation ? JSON.stringify(rotation) : null, isActive !== undefined ? isActive : true, id))];
            case 1:
                result = _c.sent();
                res.json(((_b = result.rows) === null || _b === void 0 ? void 0 : _b[0]) || { message: "Status updated" });
                return [3 /*break*/, 3];
            case 2:
                error_4 = _c.sent();
                console.error("Error updating status:", error_4);
                res.status(500).json({ message: "Failed to update status" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Delete status
router.delete("/admin/statuses/:id", middleware_1.isAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, error_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params.id;
                return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["\n      DELETE FROM whatsapp_statuses WHERE id = ", "\n    "], ["\n      DELETE FROM whatsapp_statuses WHERE id = ", "\n    "])), id))];
            case 1:
                _a.sent();
                res.json({ message: "Status deleted" });
                return [3 /*break*/, 3];
            case 2:
                error_5 = _a.sent();
                console.error("Error deleting status:", error_5);
                res.status(500).json({ message: "Failed to delete status" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Send status to specific user
router.post("/admin/statuses/send", middleware_1.isAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, statusId, userId, phoneNumber, statusResult, status_1, error_6;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 3, , 4]);
                _a = req.body, statusId = _a.statusId, userId = _a.userId, phoneNumber = _a.phoneNumber;
                return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["\n      SELECT * FROM whatsapp_statuses WHERE id = ", "\n    "], ["\n      SELECT * FROM whatsapp_statuses WHERE id = ", "\n    "])), statusId))];
            case 1:
                statusResult = _c.sent();
                if (!((_b = statusResult.rows) === null || _b === void 0 ? void 0 : _b[0])) {
                    return [2 /*return*/, res.status(404).json({ message: "Status not found" })];
                }
                status_1 = statusResult.rows[0];
                // Record in history
                return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["\n      INSERT INTO status_history (\n        id, status_id, user_id, phone_number, sent_at, content, type\n      ) VALUES (\n        gen_random_uuid(), ", ", ", ", ", ", NOW(), \n        ", ", ", "\n      )\n    "], ["\n      INSERT INTO status_history (\n        id, status_id, user_id, phone_number, sent_at, content, type\n      ) VALUES (\n        gen_random_uuid(), ", ", ", ", ", ", NOW(), \n        ", ", ", "\n      )\n    "])), statusId, userId, phoneNumber, status_1.content, status_1.type))];
            case 2:
                // Record in history
                _c.sent();
                res.json({ message: "Status sent" });
                return [3 /*break*/, 4];
            case 3:
                error_6 = _c.sent();
                console.error("Error sending status:", error_6);
                res.status(500).json({ message: "Failed to send status" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// Send status to all users
router.post("/admin/statuses/send-all", middleware_1.isAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var statusId, statusResult, status_2, usersResult, users, _i, users_1, user, error_7;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 7, , 8]);
                statusId = req.body.statusId;
                return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["\n      SELECT * FROM whatsapp_statuses WHERE id = ", "\n    "], ["\n      SELECT * FROM whatsapp_statuses WHERE id = ", "\n    "])), statusId))];
            case 1:
                statusResult = _b.sent();
                if (!((_a = statusResult.rows) === null || _a === void 0 ? void 0 : _a[0])) {
                    return [2 /*return*/, res.status(404).json({ message: "Status not found" })];
                }
                status_2 = statusResult.rows[0];
                return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["\n      SELECT id, whatsapp_number FROM users \n      WHERE whatsapp_connected = true AND whatsapp_number IS NOT NULL\n    "], ["\n      SELECT id, whatsapp_number FROM users \n      WHERE whatsapp_connected = true AND whatsapp_number IS NOT NULL\n    "]))))];
            case 2:
                usersResult = _b.sent();
                users = usersResult.rows || [];
                _i = 0, users_1 = users;
                _b.label = 3;
            case 3:
                if (!(_i < users_1.length)) return [3 /*break*/, 6];
                user = users_1[_i];
                return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["\n        INSERT INTO status_history (\n          id, status_id, user_id, phone_number, sent_at, content, type\n        ) VALUES (\n          gen_random_uuid(), ", ", ", ", ", ", NOW(),\n          ", ", ", "\n        )\n      "], ["\n        INSERT INTO status_history (\n          id, status_id, user_id, phone_number, sent_at, content, type\n        ) VALUES (\n          gen_random_uuid(), ", ", ", ", ", ", NOW(),\n          ", ", ", "\n        )\n      "])), statusId, user.id, user.whatsapp_number, status_2.content, status_2.type))];
            case 4:
                _b.sent();
                _b.label = 5;
            case 5:
                _i++;
                return [3 /*break*/, 3];
            case 6:
                res.json({ message: "Status sent to ".concat(users.length, " users") });
                return [3 /*break*/, 8];
            case 7:
                error_7 = _b.sent();
                console.error("Error sending status to all:", error_7);
                res.status(500).json({ message: "Failed to send status" });
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
exports.default = router;
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10;
