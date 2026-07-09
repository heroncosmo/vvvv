import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const storageSource = readFileSync(new URL("../storage.ts", import.meta.url), "utf8");
const audioServiceSource = readFileSync(new URL("../audioResponseService.ts", import.meta.url), "utf8");
const followUpSource = readFileSync(new URL("../userFollowUpService.ts", import.meta.url), "utf8");
const httpSource = readFileSync(new URL("../../api/http.ts", import.meta.url), "utf8");

assert.match(
  storageSource,
  /const DEFAULT_AUDIO_DAILY_LIMIT = 30;/,
  "storage must keep a single default audio daily limit constant",
);

assert.match(
  storageSource,
  /const limit = normalizeAudioDailyLimit\(counter\.dailyLimit\);/,
  "storage must respect the saved audio_message_counter.daily_limit value",
);

assert.match(
  storageSource,
  /async getConversationAgentAudioCountToday\(userId: string, conversationId: string\): Promise<number>/,
  "storage must expose a per-conversation automatic audio counter",
);

assert.match(
  storageSource,
  /AND \${whatsappConnections\.userId} = \${userId}/,
  "per-conversation audio usage must be scoped to the owning WhatsApp connection user",
);

assert.match(
  storageSource,
  /AND \${messages\.isFromAgent} IS TRUE/,
  "per-conversation audio usage must count automatic agent audio, not owner manual audio",
);

assert.match(
  audioServiceSource,
  /export function resolveAgentAudioPerConversationDailyLimit\(totalDailyLimit: number\): number/,
  "audio service must expose the shared per-conversation limit calculation",
);

assert.match(
  audioServiceSource,
  /const conversationUsed = await storage\.getConversationAgentAudioCountToday\(userId, conversationId\);/,
  "audio service must check per-conversation usage before generating TTS",
);

assert.match(
  audioServiceSource,
  /conversationUsed >= conversationLimit[\s\S]*?shouldSendText: true,[\s\S]*?shouldGenerateAudio: false,/,
  "when a conversation hits its audio cap, the agent must fall back to text instead of going silent",
);

assert.match(
  followUpSource,
  /resolveAgentAudioPerConversationDailyLimit/,
  "follow-up audio must reuse the same per-conversation limit calculation",
);

assert.match(
  followUpSource,
  /sendFollowUpAsAudio\(userId, conversation\.id, conversation\.remoteJid, message, socket\)/,
  "follow-up audio must pass the conversation id into the quota guard",
);

assert.match(
  httpSource,
  /function normalizeSavedAudioDailyLimit\(value: unknown\)/,
  "serverless audio code must normalize saved daily limits instead of hard-resetting them",
);

assert.match(
  httpSource,
  /const limit = normalizeSavedAudioDailyLimit\(counter\?\.daily_limit\);/,
  "serverless audio usage must respect a saved higher daily_limit",
);

assert.match(
  httpSource,
  /SELECT id, count, daily_limit/,
  "serverless audio increment must read the saved daily_limit before updating the counter",
);

assert.match(
  httpSource,
  /\[counter\.id, limit\]/,
  "serverless audio increment must preserve the saved daily_limit value",
);

console.log("audioQuotaGuards.source.test.ts ok");
