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
exports.db = exports.closeDbPool = exports.pool = void 0;
exports.withRetry = withRetry;
var pg_1 = require("pg");
var node_postgres_1 = require("drizzle-orm/node-postgres");
var schema = require("@shared/schema");
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}
// Detectar se está usando Supabase Pooler
// NOTA: NÃO derivamos automaticamente a URL direta porque:
// 1) O Supabase direct (db.<ref>.supabase.co) resolve para IPv6, que o Railway não alcança (ENETUNREACH)
// 2) O Pooler (pooler.supabase.com:6543) funciona bem e resolve IPv4
// Se você quiser forçar conexão direta, defina DATABASE_URL_DIRECT no Railway.
var rawDbUrl = process.env.DATABASE_URL;
var directDbUrl = process.env.DATABASE_URL_DIRECT;
// Força porta 6543 (Transaction mode) se estiver usando porta 5432 (Session mode)
// Session mode tem limite severo de clientes = pool_size do servidor
var dbUrl = directDbUrl || rawDbUrl;
var isPoolerConnection = dbUrl.includes('pooler.supabase.com');
if (isPoolerConnection && dbUrl.includes(':5432')) {
    dbUrl = dbUrl.replace(':5432', ':6543');
    console.log('[DB] ⚠️ Porta alterada de 5432 (Session) para 6543 (Transaction) para evitar MaxClientsInSessionMode');
}
console.log("[DB] Modo de conex\u00E3o: ".concat(isPoolerConnection ? 'Supabase Pooler (PgBouncer)' : 'Direct Connection'));
// 🔥 CONFIGURAÇÃO OTIMIZADA PARA PGBOUNCER TRANSACTION MODE
var poolConfig = {
    connectionString: dbUrl,
    ssl: {
        rejectUnauthorized: false
    },
    // Pool CONSERVADOR - PgBouncer Transaction mode libera conexão após cada query
    max: isPoolerConnection ? 3 : 7, // 3 para pooler (transaction mode libera rápido)
    min: 0, // Não manter conexões ociosas em transaction mode
    idleTimeoutMillis: isPoolerConnection ? 10000 : 60000, // Libera rápido em pooler
    connectionTimeoutMillis: 30000,
    statement_timeout: 30000,
    allowExitOnIdle: true, // Permite liberar conexões quando ocioso
    // Retry com backoff exponencial
    retryStrategy: function (times) {
        if (times > 5) {
            console.log("[DB] Max retries (5) atingido, desistindo");
            return false;
        }
        var delay = Math.min(times * 2000, 15000);
        console.log("\u23F3 [DB] Retry #".concat(times, " ap\u00F3s ").concat(delay, "ms"));
        return delay;
    },
};
exports.pool = new pg_1.Pool(poolConfig);
// Logs de diagnóstico (reduzidos para produção)
exports.pool.on('connect', function () {
    console.log('✅ [DB Pool] Nova conexão ESTABELECIDA');
});
exports.pool.on('error', function (err) {
    console.error('❌ [DB Pool] ERRO:', err.message, '| Code:', err.code);
});
exports.pool.on('remove', function () {
    console.log('🔌 [DB Pool] Conexão REMOVIDA');
});
// 🔄 Graceful shutdown - libera conexões no PgBouncer
// V23f: NÃO chama process.exit() - o full-app.ts coordena o shutdown
var closeDbPool = function () { return __awaiter(void 0, void 0, void 0, function () {
    var err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('🛑 [DB] Encerrando pool de conexões...');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, exports.pool.end()];
            case 2:
                _a.sent();
                console.log('✅ [DB] Pool encerrado com sucesso');
                return [3 /*break*/, 4];
            case 3:
                err_1 = _a.sent();
                console.error('❌ [DB] Erro ao encerrar pool:', err_1.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.closeDbPool = closeDbPool;
var runtimeAutoMigrationsEnabled = (function () {
    var explicit = String(process.env.ENABLE_RUNTIME_AUTO_MIGRATIONS ||
        process.env.RUN_RUNTIME_AUTO_MIGRATIONS ||
        "").trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(explicit))
        return true;
    if (["0", "false", "no", "off"].includes(explicit))
        return false;
    if (process.env.VERCEL === "1" || process.env.VERCEL === "true") {
        return false;
    }
    return true;
})();
function scheduleRuntimeDbTask(task, delayMs) {
    if (!runtimeAutoMigrationsEnabled) {
        return;
    }
    setTimeout(function () {
        task().catch(function (error) {
            console.error("[DB] Runtime DB task failed:", (error === null || error === void 0 ? void 0 : error.message) || error);
        });
    }, delayMs);
}
// 🧪 Teste de autenticação inicial único
scheduleRuntimeDbTask(function () { return __awaiter(void 0, void 0, void 0, function () {
    var start, result, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                start = Date.now();
                return [4 /*yield*/, exports.pool.query('SELECT current_user, current_database()')];
            case 1:
                result = _a.sent();
                console.log("\u2705 [DB] Autentica\u00E7\u00E3o OK em ".concat(Date.now() - start, "ms | User: ").concat(result.rows[0].current_user, " | DB: ").concat(result.rows[0].current_database));
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                console.error('❌ [DB] Falha na autenticação:', error_1.message, '| Code:', error_1.code);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); }, 2000);
// Função helper para executar query com retry automático
function withRetry(operation_1) {
    return __awaiter(this, arguments, void 0, function (operation, maxRetries, delayMs) {
        var lastError, _loop_1, attempt, state_1;
        var _a, _b, _c, _d, _e;
        if (maxRetries === void 0) { maxRetries = 3; }
        if (delayMs === void 0) { delayMs = 1000; }
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _loop_1 = function (attempt) {
                        var _g, error_2, isRetryable, waitTime_1;
                        return __generator(this, function (_h) {
                            switch (_h.label) {
                                case 0:
                                    _h.trys.push([0, 2, , 5]);
                                    _g = {};
                                    return [4 /*yield*/, operation()];
                                case 1: return [2 /*return*/, (_g.value = _h.sent(), _g)];
                                case 2:
                                    error_2 = _h.sent();
                                    lastError = error_2;
                                    isRetryable = ((_a = error_2.message) === null || _a === void 0 ? void 0 : _a.includes('Connection terminated')) ||
                                        ((_b = error_2.message) === null || _b === void 0 ? void 0 : _b.includes('timeout')) ||
                                        ((_c = error_2.message) === null || _c === void 0 ? void 0 : _c.includes('ECONNRESET')) ||
                                        ((_d = error_2.message) === null || _d === void 0 ? void 0 : _d.includes('DbHandler exited')) ||
                                        ((_e = error_2.message) === null || _e === void 0 ? void 0 : _e.includes('unexpectedly')) ||
                                        error_2.code === 'ECONNRESET' ||
                                        error_2.code === 'ETIMEDOUT' ||
                                        error_2.code === '57P01' ||
                                        error_2.code === 'XX000';
                                    if (!(isRetryable && attempt < maxRetries)) return [3 /*break*/, 4];
                                    waitTime_1 = delayMs * attempt;
                                    console.warn("\u26A0\uFE0F [DB] Query falhou (tentativa ".concat(attempt, "/").concat(maxRetries, "), retry em ").concat(waitTime_1, "ms: ").concat(error_2.message));
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, waitTime_1); })];
                                case 3:
                                    _h.sent();
                                    return [2 /*return*/, "continue"];
                                case 4: throw error_2;
                                case 5: return [2 /*return*/];
                            }
                        });
                    };
                    attempt = 1;
                    _f.label = 1;
                case 1:
                    if (!(attempt <= maxRetries)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(attempt)];
                case 2:
                    state_1 = _f.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _f.label = 3;
                case 3:
                    attempt++;
                    return [3 /*break*/, 1];
                case 4: throw lastError;
            }
        });
    });
}
// Teste de conexão removido - já temos o teste de autenticação acima
// ============================================================================
// AUTO-MIGRATION: Criar tabelas que podem não existir ainda
// ============================================================================
scheduleRuntimeDbTask(function () { return __awaiter(void 0, void 0, void 0, function () {
    var client, checkTable, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('[DB] Verificando tabelas necessárias...');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 9, , 10]);
                return [4 /*yield*/, exports.pool.connect()];
            case 2:
                client = _a.sent();
                return [4 /*yield*/, client.query("\n      SELECT EXISTS (\n        SELECT FROM information_schema.tables\n        WHERE table_schema = 'public'\n        AND table_name = 'contact_lists'\n      );\n    ")];
            case 3:
                checkTable = _a.sent();
                if (!!checkTable.rows[0].exists) return [3 /*break*/, 5];
                console.log('[DB] Tabela contact_lists não existe, criando...');
                return [4 /*yield*/, client.query("\n        CREATE TABLE IF NOT EXISTS contact_lists (\n          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),\n          user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n          name VARCHAR(255) NOT NULL,\n          description TEXT,\n          contacts JSONB DEFAULT '[]'::jsonb,\n          contact_count INTEGER DEFAULT 0 NOT NULL,\n          created_at TIMESTAMP DEFAULT NOW(),\n          updated_at TIMESTAMP DEFAULT NOW()\n        );\n\n        CREATE INDEX IF NOT EXISTS idx_contact_lists_user ON contact_lists(user_id);\n        CREATE INDEX IF NOT EXISTS idx_contact_lists_created ON contact_lists(created_at);\n      ")];
            case 4:
                _a.sent();
                console.log('✅ [DB] Tabela contact_lists criada com sucesso!');
                return [3 /*break*/, 6];
            case 5:
                console.log('✅ [DB] Tabela contact_lists já existe');
                _a.label = 6;
            case 6: 
            // Ensure admin_broadcast_messages table exists
            return [4 /*yield*/, client.query("\n      CREATE TABLE IF NOT EXISTS admin_broadcast_messages (\n        id TEXT PRIMARY KEY,\n        broadcast_id TEXT NOT NULL,\n        admin_id TEXT NOT NULL,\n        user_id TEXT,\n        recipient_phone TEXT NOT NULL,\n        recipient_name TEXT NOT NULL DEFAULT 'Cliente',\n        message_original TEXT,\n        message_sent TEXT NOT NULL,\n        ai_varied BOOLEAN DEFAULT false,\n        status TEXT DEFAULT 'sent',\n        error_message TEXT,\n        sent_at TIMESTAMP DEFAULT now()\n      )\n    ")];
            case 7:
                // Ensure admin_broadcast_messages table exists
                _a.sent();
                return [4 /*yield*/, client.query("\n      CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_id \n      ON admin_broadcast_messages(broadcast_id)\n    ")];
            case 8:
                _a.sent();
                console.log('✅ [DB] Tabela admin_broadcast_messages garantida');
                client.release();
                return [3 /*break*/, 10];
            case 9:
                error_3 = _a.sent();
                console.error('❌ [DB] Erro ao verificar/criar tabelas:', error_3.message);
                return [3 /*break*/, 10];
            case 10: return [2 /*return*/];
        }
    });
}); }, 5000);
// ============================================================================
// AUTO-MIGRATION: Corrigir constraint de status em payment_receipts
// ============================================================================
scheduleRuntimeDbTask(function () { return __awaiter(void 0, void 0, void 0, function () {
    var client, checkConstraint, constraintDef, error_4;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 6, , 7]);
                return [4 /*yield*/, exports.pool.connect()];
            case 1:
                client = _c.sent();
                return [4 /*yield*/, client.query("\n      SELECT pg_get_constraintdef(oid) as definition\n      FROM pg_constraint\n      WHERE conrelid = 'payment_receipts'::regclass\n      AND conname = 'payment_receipts_status_check'\n    ")];
            case 2:
                checkConstraint = _c.sent();
                constraintDef = ((_a = checkConstraint.rows[0]) === null || _a === void 0 ? void 0 : _a.definition) || '';
                if (!(constraintDef && !constraintDef.includes('cancelled'))) return [3 /*break*/, 5];
                console.log('[DB] Atualizando constraint de status em payment_receipts...');
                return [4 /*yield*/, client.query("ALTER TABLE payment_receipts DROP CONSTRAINT payment_receipts_status_check")];
            case 3:
                _c.sent();
                return [4 /*yield*/, client.query("\n        ALTER TABLE payment_receipts \n        ADD CONSTRAINT payment_receipts_status_check \n        CHECK (status::text = ANY (ARRAY['pending'::varchar, 'approved'::varchar, 'rejected'::varchar, 'cancelled'::varchar]::text[]))\n      ")];
            case 4:
                _c.sent();
                console.log('✅ [DB] Constraint de status em payment_receipts atualizada!');
                _c.label = 5;
            case 5:
                client.release();
                return [3 /*break*/, 7];
            case 6:
                error_4 = _c.sent();
                // Pode falhar se a tabela não existir ainda - não é crítico
                if (!((_b = error_4.message) === null || _b === void 0 ? void 0 : _b.includes('does not exist'))) {
                    console.error('❌ [DB] Erro ao atualizar constraint payment_receipts:', error_4.message);
                }
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); }, 6000);
// Configurar drizzle SEM prepared statements para compatibilidade com PgBouncer Transaction mode
// PgBouncer em modo "transaction" não suporta prepared statements
// V13: Disable verbose SQL query logging (was polluting stdout with multi-KB query dumps)
exports.db = (0, node_postgres_1.drizzle)(__assign({ client: exports.pool, schema: schema, logger: false }, (isPoolerConnection ? { casing: undefined } : {})));
// ============================================================================
// AUTO-MIGRATION: Garantir tabela admin_autologin_tokens
// ============================================================================
scheduleRuntimeDbTask(function () { return __awaiter(void 0, void 0, void 0, function () {
    var client, error_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, exports.pool.connect()];
            case 1:
                client = _a.sent();
                return [4 /*yield*/, client.query("\n      CREATE TABLE IF NOT EXISTS admin_autologin_tokens (\n        token TEXT PRIMARY KEY,\n        user_id TEXT NOT NULL,\n        created_at TIMESTAMPTZ DEFAULT NOW(),\n        expires_at TIMESTAMPTZ NOT NULL,\n        used_at TIMESTAMPTZ,\n        redirect_to TEXT NOT NULL DEFAULT '/conexao'\n      );\n      CREATE INDEX IF NOT EXISTS idx_admin_autologin_tokens_user ON admin_autologin_tokens(user_id);\n      CREATE INDEX IF NOT EXISTS idx_admin_autologin_tokens_expires ON admin_autologin_tokens(expires_at);\n      DROP INDEX IF EXISTS idx_autologin_user_id;\n      DROP INDEX IF EXISTS idx_autologin_expires;\n      -- Migration: add redirect_to column if table already exists without it\n      ALTER TABLE admin_autologin_tokens ADD COLUMN IF NOT EXISTS redirect_to TEXT NOT NULL DEFAULT '/conexao';\n    ")];
            case 2:
                _a.sent();
                console.log('✅ [DB] Tabela admin_autologin_tokens garantida');
                client.release();
                return [3 /*break*/, 4];
            case 3:
                error_5 = _a.sent();
                console.error('❌ [DB] Erro ao garantir tabela admin_autologin_tokens:', error_5.message || error_5);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); }, 7000);
