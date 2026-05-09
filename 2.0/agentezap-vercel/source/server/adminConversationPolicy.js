"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldProcessInboundAdminAutomation = shouldProcessInboundAdminAutomation;
// Follow-up continua permitido em callbacks dedicados. Esta regra vale
// apenas para respostas automáticas geradas a partir de novas mensagens.
function shouldProcessInboundAdminAutomation(input) {
    return input.isAgentEnabled === true;
}
