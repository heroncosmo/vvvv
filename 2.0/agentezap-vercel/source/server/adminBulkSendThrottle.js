"use strict";
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
exports.waitForAdminBulkSendWindow = waitForAdminBulkSendWindow;
var ADMIN_MIN_GAP_MS = 60000;
var ADMIN_BATCH_SIZE = 10;
var ADMIN_BATCH_PAUSE_MS = 10 * 60000;
var adminThrottleLocks = new Map();
var adminThrottleStates = new Map();
function sleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
function randomBetween(min, max) {
    if (max <= min)
        return min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function waitForAdminBulkSendWindow(adminId, options) {
    return __awaiter(this, void 0, void 0, function () {
        var scope, lockKey, previousLock, releaseLock, currentLock, state, minIntervalMs, rawMaxIntervalMs, waitIntervalMs, totalWaitMs, batchPauseApplied, sinceLast, gapWaitMs, nextState;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    scope = (options === null || options === void 0 ? void 0 : options.scope) || "default";
                    lockKey = "".concat(adminId, ":").concat(scope);
                    previousLock = adminThrottleLocks.get(lockKey) || Promise.resolve();
                    currentLock = new Promise(function (resolve) {
                        releaseLock = resolve;
                    });
                    adminThrottleLocks.set(lockKey, previousLock.then(function () { return currentLock; }));
                    return [4 /*yield*/, previousLock];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 7, 8]);
                    state = adminThrottleStates.get(lockKey) || {
                        lastReservedAt: 0,
                        reservedCount: 0,
                    };
                    minIntervalMs = Math.max(((options === null || options === void 0 ? void 0 : options.minIntervalSeconds) || 0) * 1000, ADMIN_MIN_GAP_MS);
                    rawMaxIntervalMs = Math.max(((options === null || options === void 0 ? void 0 : options.maxIntervalSeconds) || 0) * 1000, minIntervalMs);
                    waitIntervalMs = state.lastReservedAt > 0 ? randomBetween(minIntervalMs, rawMaxIntervalMs) : 0;
                    totalWaitMs = 0;
                    batchPauseApplied = false;
                    if (!(state.lastReservedAt > 0)) return [3 /*break*/, 4];
                    sinceLast = Date.now() - state.lastReservedAt;
                    gapWaitMs = Math.max(0, waitIntervalMs - sinceLast);
                    if (!(gapWaitMs > 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, sleep(gapWaitMs)];
                case 3:
                    _a.sent();
                    totalWaitMs += gapWaitMs;
                    _a.label = 4;
                case 4:
                    if (!(state.reservedCount > 0 && state.reservedCount % ADMIN_BATCH_SIZE === 0)) return [3 /*break*/, 6];
                    return [4 /*yield*/, sleep(ADMIN_BATCH_PAUSE_MS)];
                case 5:
                    _a.sent();
                    totalWaitMs += ADMIN_BATCH_PAUSE_MS;
                    batchPauseApplied = true;
                    _a.label = 6;
                case 6:
                    nextState = {
                        lastReservedAt: Date.now(),
                        reservedCount: state.reservedCount + 1,
                    };
                    adminThrottleStates.set(lockKey, nextState);
                    return [2 /*return*/, {
                            reservedIndex: nextState.reservedCount,
                            waitMs: totalWaitMs,
                            batchPauseApplied: batchPauseApplied,
                        }];
                case 7:
                    releaseLock();
                    if (adminThrottleLocks.get(lockKey) === currentLock) {
                        adminThrottleLocks.delete(lockKey);
                    }
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    });
}
