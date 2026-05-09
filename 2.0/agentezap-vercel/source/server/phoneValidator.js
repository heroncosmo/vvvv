"use strict";
/**
 * Validação e formatação de números de telefone brasileiros
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAndFormatPhone = validateAndFormatPhone;
exports.isValidPhone = isValidPhone;
exports.formatPhoneForDisplay = formatPhoneForDisplay;
/**
 * Valida e formata número de telefone brasileiro
 * Aceita formatos: 11999999999, +5511999999999
 * Retorna em formato internacional: +5511999999999
 */
function validateAndFormatPhone(phone) {
    if (!phone)
        return null;
    // Remove espaços, hífens, parênteses
    var cleaned = phone.replace(/[\s\-()]/g, '');
    // Se começa com +55, remove o +
    if (cleaned.startsWith('+55')) {
        cleaned = cleaned.substring(3);
    }
    // Se começa com 55, remove
    if (cleaned.startsWith('55')) {
        cleaned = cleaned.substring(2);
    }
    // Deve ter 11 dígitos (DDD + 9 dígitos do celular)
    if (cleaned.length !== 11) {
        return null;
    }
    // Validar se todos são dígitos
    if (!/^\d+$/.test(cleaned)) {
        return null;
    }
    // Validar DDD (11-99)
    var ddd = parseInt(cleaned.substring(0, 2));
    if (ddd < 11 || ddd > 99) {
        return null;
    }
    // Validar se é celular (9º dígito deve ser 9)
    var ninthDigit = parseInt(cleaned.charAt(2));
    if (ninthDigit !== 9) {
        return null;
    }
    // Retornar em formato internacional
    return "+55".concat(cleaned);
}
/**
 * Valida se o telefone está em formato correto
 */
function isValidPhone(phone) {
    return validateAndFormatPhone(phone) !== null;
}
/**
 * Formata telefone para exibição
 * +5511999999999 -> (11) 99999-9999
 */
function formatPhoneForDisplay(phone) {
    var formatted = validateAndFormatPhone(phone);
    if (!formatted)
        return phone;
    // Remove +55
    var cleaned = formatted.substring(3);
    // Formata como (XX) 9XXXX-XXXX
    return "(".concat(cleaned.substring(0, 2), ") ").concat(cleaned.substring(2, 7), "-").concat(cleaned.substring(7));
}
