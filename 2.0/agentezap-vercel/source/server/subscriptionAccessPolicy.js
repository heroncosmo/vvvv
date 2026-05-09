"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateSaaSSubscriptionAccess = evaluateSaaSSubscriptionAccess;
function toValidDate(value) {
    if (!value)
        return null;
    var parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function evaluateSaaSSubscriptionAccess(input) {
    var _a;
    var now = (_a = input.now) !== null && _a !== void 0 ? _a : new Date();
    if (input.status !== "active") {
        return {
            hasActiveSubscription: false,
            isExpired: false,
            reason: "inactive_status",
            daysOverdue: 0,
        };
    }
    var dataFim = toValidDate(input.dataFim);
    if (dataFim) {
        var expired = dataFim < now;
        return {
            hasActiveSubscription: !expired,
            isExpired: expired,
            reason: expired ? "expired_by_data_fim" : "active",
            daysOverdue: expired ? Math.max(0, Math.floor((now.getTime() - dataFim.getTime()) / (1000 * 60 * 60 * 24))) : 0,
        };
    }
    var nextPaymentDate = toValidDate(input.nextPaymentDate);
    if (nextPaymentDate) {
        var daysOverdue = Math.floor((now.getTime() - nextPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
        var expired = daysOverdue > 5;
        return {
            hasActiveSubscription: !expired,
            isExpired: expired,
            reason: expired ? "expired_by_next_payment" : "active",
            daysOverdue: Math.max(0, daysOverdue),
        };
    }
    return {
        hasActiveSubscription: true,
        isExpired: false,
        reason: "active",
        daysOverdue: 0,
    };
}
