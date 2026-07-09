import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_WHATSAPP_REPLY_MAX_CHARS,
  clampAdminReplyLength,
} from "../adminReplyPolicy";

const __dirname = dirname(fileURLToPath(import.meta.url));
const policySource = readFileSync(resolve(__dirname, "../adminReplyPolicy.ts"), "utf8");

const longReply = `Teste: https://agentezap.online/test/abc123\n\n${"texto ".repeat(200)}`;
const clamped = clampAdminReplyLength(longReply);

assert.equal(clamped.length <= ADMIN_WHATSAPP_REPLY_MAX_CHARS, true);
assert.match(clamped, /https:\/\/agentezap\.online\/test\/abc123/);

assert.doesNotMatch(
  policySource,
  /buildAdminPanelPitch|buildPostTestSalesReply|isPostTestSalesMessage|Se gostou|CRM\/Kanban|assinar ou conectar o WhatsApp agora/i,
  "adminReplyPolicy deve manter apenas clamp tecnico, sem pitch/fala publica local",
);

console.log("adminReplyPolicy.test.ts ok");
process.exit(0);
