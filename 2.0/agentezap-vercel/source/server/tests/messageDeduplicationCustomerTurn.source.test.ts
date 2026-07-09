import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readSource = (...parts: string[]) => fs.readFileSync(path.resolve(root, ...parts), "utf8");

const dedupeSource = readSource("server", "messageDeduplicationService.ts");
const queueSource = readSource("server", "messageQueueService.ts");
const whatsappSource = readSource("server", "whatsapp.ts");

assert.match(
  dedupeSource,
  /latestCustomerMessageAt\?: Date \| string \| number \| null/,
  "dedupe API must accept the latest customer turn timestamp.",
);

assert.match(
  dedupeSource,
  /function parseTurnTimestampMs/,
  "dedupe must normalize DB and Date timestamps before comparing turns.",
);

assert.match(
  dedupeSource,
  /const cachedAutomatedRepeat = this\.outgoingCache\.get\(automatedRepeatCacheKey\);[\s\S]*latestCustomerMessageAtMs <= cachedAutomatedRepeat\.createdAt/,
  "automated repeat cache must block only when no newer customer turn exists.",
);

assert.match(
  dedupeSource,
  /\.select\('id, created_at'\)[\s\S]*\.order\('created_at', \{ ascending: false \}\)[\s\S]*\.limit\(1\)[\s\S]*repeatedCreatedAtMs[\s\S]*latestCustomerMessageAtMs > repeatedCreatedAtMs[\s\S]*Automacao repetida no banco liberada por novo turno do cliente/s,
  "automated repeat DB guard must compare the latest repeated automation against the latest customer turn.",
);

assert.match(
  queueSource,
  /latestCustomerMessageAt\?: Date \| string \| number \| null/,
  "message queue options must carry the latest customer turn timestamp.",
);

assert.match(
  queueSource,
  /latestCustomerMessageAt: message\.options\?\.latestCustomerMessageAt/,
  "message queue must forward latestCustomerMessageAt to the dedupe service.",
);

assert.match(
  whatsappSource,
  /messageQueueService\.enqueue\(userId, jid, finalOutboundText,[\s\S]*latestCustomerMessageAt: lastCustomerAt/,
  "real WhatsApp AI replies must pass lastCustomerAt into queue dedupe.",
);

console.log("messageDeduplicationCustomerTurn.source.test.ts ok");
