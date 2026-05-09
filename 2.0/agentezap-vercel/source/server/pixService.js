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
exports.generatePixQRCode = generatePixQRCode;
var qrcode_1 = require("qrcode");
var storage_1 = require("./storage");
function generatePixQRCode(paymentData) {
    return __awaiter(this, void 0, void 0, function () {
        var pixKeyConfig, merchantNameConfig, merchantCityConfig, pixKeyRaw, merchantNameRaw, merchantCityRaw, pixKey, cleanKey, onlyDigits, baseId, randomSuffix, txid, valorNum, valor, sanitize, name_1, city, message, tlv, maids, merchantAccountInfo, amount, base, crcInput, crc, i, j, crcHex, payload, pixQrCode, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, storage_1.storage.getSystemConfig('pix_key')];
                case 1:
                    pixKeyConfig = _a.sent();
                    return [4 /*yield*/, storage_1.storage.getSystemConfig('merchant_name')];
                case 2:
                    merchantNameConfig = _a.sent();
                    return [4 /*yield*/, storage_1.storage.getSystemConfig('merchant_city')];
                case 3:
                    merchantCityConfig = _a.sent();
                    pixKeyRaw = paymentData.pixKeyOverride || (pixKeyConfig === null || pixKeyConfig === void 0 ? void 0 : pixKeyConfig.valor) || 'rodrigoconexao128@gmail.com';
                    merchantNameRaw = (merchantNameConfig === null || merchantNameConfig === void 0 ? void 0 : merchantNameConfig.valor) || 'RODRIGO MACEDO';
                    merchantCityRaw = (merchantCityConfig === null || merchantCityConfig === void 0 ? void 0 : merchantCityConfig.valor) || 'COSMORAMA';
                    pixKey = String(pixKeyRaw).replace(/\s+/g, '').trim();
                    cleanKey = pixKey.replace(/\+55/g, '');
                    onlyDigits = cleanKey.replace(/\D/g, '');
                    // Se for telefone (10-13 dígitos), formata corretamente
                    if (onlyDigits.length >= 10 && onlyDigits.length <= 13) {
                        // Se começa com 55 (DDI Brasil já incluído), remove para não duplicar
                        if (onlyDigits.length >= 12 && onlyDigits.startsWith('55')) {
                            onlyDigits = onlyDigits.substring(2); // Remove o 55 do início
                        }
                        // Agora adiciona +55 (resultado: +55 + DDD + número)
                        pixKey = '+55' + onlyDigits;
                    }
                    baseId = String(paymentData.subscriptionId || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                    randomSuffix = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
                    txid = (baseId + randomSuffix).substring(0, 25) || 'TX' + Date.now().toString().substring(0, 23);
                    valorNum = typeof paymentData.valor === 'string'
                        ? parseFloat(String(paymentData.valor).replace(',', '.'))
                        : Number(paymentData.valor || 0);
                    valor = Number.isFinite(valorNum) && valorNum > 0 ? Number(valorNum.toFixed(2)) : 0.01;
                    sanitize = function (s, max) {
                        return (s || '')
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
                            .replace(/[^A-Za-z0-9 ]/g, '') // Mantém apenas A-Z, a-z, 0-9 e espaço (SEM hífen)
                            .replace(/\s+/g, ' ') // Normaliza espaços múltiplos
                            .trim()
                            .toUpperCase() // Converte para maiúsculas
                            .slice(0, max);
                    };
                    name_1 = sanitize(merchantNameRaw, 25);
                    city = sanitize(merchantCityRaw, 15);
                    message = sanitize("Pagamento ".concat(paymentData.planNome || ''), 50);
                    tlv = function (id, value) { return id + String(value.length).padStart(2, '0') + value; };
                    maids = tlv('00', 'br.gov.bcb.pix') + tlv('01', pixKey);
                    merchantAccountInfo = tlv('26', maids);
                    amount = valor.toFixed(2);
                    base = ''
                        + tlv('00', '01') // Payload Format Indicator
                        + tlv('01', '11') // Point of Initiation Method (11 = dinâmico, 12 = estático)
                        + merchantAccountInfo
                        + tlv('52', '0000') // Merchant Category Code
                        + tlv('53', '986') // Transaction Currency (986 = BRL)
                        + tlv('54', amount) // Transaction Amount
                        + tlv('58', 'BR') // Country Code
                        + tlv('59', name_1) // Merchant Name
                        + tlv('60', city) // Merchant City
                        + tlv('62', tlv('05', txid));
                    crcInput = base + '6304';
                    crc = 0xFFFF;
                    for (i = 0; i < crcInput.length; i++) {
                        crc ^= crcInput.charCodeAt(i) << 8;
                        for (j = 0; j < 8; j++) {
                            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
                            crc &= 0xFFFF;
                        }
                    }
                    crcHex = crc.toString(16).toUpperCase().padStart(4, '0');
                    payload = crcInput + crcHex;
                    // Log para debug do PIX
                    console.log('[PIX Generation]', {
                        pixKeyRaw: pixKeyRaw,
                        pixKeyFormatted: pixKey,
                        amount: valor,
                        txid: txid,
                        payload: payload.substring(0, 100) + '...'
                    });
                    return [4 /*yield*/, qrcode_1.default.toDataURL(payload, { errorCorrectionLevel: 'M', type: 'image/png', margin: 1, width: 300 })];
                case 4:
                    pixQrCode = _a.sent();
                    return [2 /*return*/, { pixCode: payload, pixQrCode: pixQrCode }];
                case 5:
                    error_1 = _a.sent();
                    console.error('Error generating PIX QR Code:', error_1);
                    throw error_1;
                case 6: return [2 /*return*/];
            }
        });
    });
}
