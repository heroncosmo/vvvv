import assert from "node:assert/strict";
import {
  ADMIN_WHATSAPP_REPLY_MAX_CHARS,
  buildAdminPanelPitch,
  buildPostTestSalesReply,
  clampAdminReplyLength,
  isPostTestSalesMessage,
} from "../adminReplyPolicy";

const longReply = `Teste: https://agentezap.online/test/abc123\n\n${"texto ".repeat(200)}`;
const clamped = clampAdminReplyLength(longReply);

assert.equal(clamped.length <= ADMIN_WHATSAPP_REPLY_MAX_CHARS, true);
assert.match(clamped, /https:\/\/agentezap\.online\/test\/abc123/);

assert.equal(isPostTestSalesMessage("testei e gostei"), true);
assert.equal(isPostTestSalesMessage("vi aqui e funcionou"), true);
assert.equal(isPostTestSalesMessage("testei e quero editar o prompt"), false);

const postTestReply = buildPostTestSalesReply("https://agentezap.online/meu-agente-ia?token=abc");
assert.match(postTestReply, /assinar|conectar/i);
assert.match(postTestReply, /CRM\/Kanban|CRM/i);
assert.equal(postTestReply.length <= ADMIN_WHATSAPP_REPLY_MAX_CHARS, true);

const panelPitch = buildAdminPanelPitch("https://agentezap.online/meu-agente-ia?token=abc");
assert.match(panelPitch, /notificador/i);

console.log("adminReplyPolicy.test.ts ok");
process.exit(0);
