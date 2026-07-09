import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const routesSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "routes.ts"),
  "utf8",
);
const guardSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "outboundPriorityGuard.ts"),
  "utf8",
);
const queueSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "messageQueueService.ts"),
  "utf8",
);
const callbackStart = routesSource.indexOf("userFollowUpService.registerCallback");
const callbackEnd = routesSource.indexOf("// ==================== ADMIN AUTH ROUTES", callbackStart);
const callbackSource = routesSource.slice(callbackStart, callbackEnd);

assert(
  routesSource.includes("isConversationPendingPriority(conversationId)"),
  "follow-up callback deve checar prioridade da propria conversa antes de enfileirar envio low",
);

assert(
  routesSource.includes("deferred: true"),
  "follow-up callback deve devolver deferred para o userFollowUpService reagendar sem travar o ciclo",
);

assert(
  !callbackSource.includes("countPendingPriorityConversations(userId, conversationId)"),
  "follow-up callback nao deve adiar por pendencia global de outras conversas do usuario",
);

assert(
  guardSource.includes("PENDING_REPLY_PRIORITY_WINDOW_MINUTES"),
  "guard de prioridade deve permitir janela configuravel de pendencias recentes",
);

assert(
  guardSource.includes("gte(conversations.lastMessageTime"),
  "guard de prioridade deve ignorar pendencias antigas que nao representam conversa ativa",
);

assert(
  guardSource.includes("eq(conversations.lastMessageFromMe, false)"),
  "guard de prioridade deve considerar pendente apenas conversa em que a ultima mensagem veio do cliente",
);

assert(
  queueSource.includes("isConversationPendingPriority(targetConversationId)"),
  "fila low com conversationId deve ceder somente quando a conversa alvo estiver pendente",
);

assert(
  !callbackSource.includes("est" + "\u00c3"),
  "callback de follow-up nao deve manter mojibake em textos tocados",
);

console.log("userFollowUpPriorityDeferral test passed");
