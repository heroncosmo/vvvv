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
exports.parseContactFile = parseContactFile;
exports.extractContacts = extractContacts;
var XLSX = require("xlsx");
var crypto_1 = require("crypto");
function autoMapContactColumns(headers) {
    var nameRegex = /nome|name|contato|cliente/i;
    var phoneRegex = /tel|fone|phone|celular|whatsapp|numero|número/i;
    var nameColumn = null;
    var phoneColumn = null;
    for (var i = 0; i < headers.length; i++) {
        var header = headers[i].toString().trim();
        if (nameColumn === null && nameRegex.test(header)) {
            nameColumn = i;
        }
        if (phoneColumn === null && phoneRegex.test(header)) {
            phoneColumn = i;
        }
    }
    // Fallback: primeira coluna é nome, segunda é telefone
    if (nameColumn === null)
        nameColumn = 0;
    if (phoneColumn === null)
        phoneColumn = 1;
    return { nameColumn: nameColumn, phoneColumn: phoneColumn };
}
function parseContactFile(buffer, mimetype) {
    return __awaiter(this, void 0, void 0, function () {
        var workbook, sheetName, sheet, data, headers, preview, suggestedMapping;
        return __generator(this, function (_a) {
            try {
                workbook = XLSX.read(buffer, { type: 'buffer' });
                sheetName = workbook.SheetNames[0];
                sheet = workbook.Sheets[sheetName];
                data = XLSX.utils.sheet_to_json(sheet, {
                    header: 1,
                    defval: '',
                    blankrows: false,
                });
                if (data.length === 0) {
                    throw new Error('Arquivo vazio ou inválido');
                }
                headers = data[0];
                preview = data.slice(1, Math.min(11, data.length));
                suggestedMapping = autoMapContactColumns(headers);
                return [2 /*return*/, {
                        headers: headers,
                        preview: preview,
                        suggestedMapping: suggestedMapping,
                        totalRows: data.length - 1, // Excluding header
                    }];
            }
            catch (error) {
                throw new Error("Erro ao processar arquivo: ".concat(error instanceof Error ? error.message : String(error)));
            }
            return [2 /*return*/];
        });
    });
}
function extractContacts(buffer, mimetype, mapping) {
    return __awaiter(this, void 0, void 0, function () {
        var workbook, sheetName, sheet, data, contacts, skipped, total, i, row, name_1, phone, cleanedPhone, finalPhone;
        return __generator(this, function (_a) {
            try {
                workbook = XLSX.read(buffer, { type: 'buffer' });
                sheetName = workbook.SheetNames[0];
                sheet = workbook.Sheets[sheetName];
                data = XLSX.utils.sheet_to_json(sheet, {
                    header: 1,
                    defval: '',
                    blankrows: false,
                });
                if (data.length === 0) {
                    throw new Error('Arquivo vazio ou inválido');
                }
                contacts = [];
                skipped = 0;
                total = Math.max(0, data.length - 1);
                for (i = 1; i < data.length; i++) {
                    row = data[i];
                    name_1 = '';
                    phone = '';
                    if (mapping.nameColumn !== null && mapping.nameColumn < row.length) {
                        name_1 = row[mapping.nameColumn].toString().trim();
                    }
                    if (mapping.phoneColumn !== null && mapping.phoneColumn < row.length) {
                        phone = row[mapping.phoneColumn].toString().trim();
                    }
                    cleanedPhone = phone.replace(/\D/g, '');
                    finalPhone = '';
                    if (cleanedPhone.length === 10 || cleanedPhone.length === 11) {
                        finalPhone = '55' + cleanedPhone;
                    }
                    else if (cleanedPhone.length === 12 || cleanedPhone.length === 13) {
                        finalPhone = cleanedPhone;
                    }
                    else {
                        // Número inválido - descartar
                        skipped++;
                        continue;
                    }
                    // Validação final: deve ter exatamente 12 ou 13 dígitos
                    if (!/^\d{12,13}$/.test(finalPhone)) {
                        skipped++;
                        continue;
                    }
                    contacts.push({
                        id: (0, crypto_1.randomUUID)(),
                        name: name_1,
                        phone: finalPhone,
                    });
                }
                return [2 /*return*/, {
                        contacts: contacts,
                        skipped: skipped,
                        total: total,
                    }];
            }
            catch (error) {
                throw new Error("Erro ao processar arquivo: ".concat(error instanceof Error ? error.message : String(error)));
            }
            return [2 /*return*/];
        });
    });
}
