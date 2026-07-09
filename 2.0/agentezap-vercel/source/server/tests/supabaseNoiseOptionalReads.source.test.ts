import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8").split("\r\n").join("\n");
}

function assertContains(source: string, expected: string, message: string): void {
  assert.ok(source.includes(expected.split("\r\n").join("\n")), message);
}

function assertNotContains(source: string, unexpected: string, message: string): void {
  assert.ok(!source.includes(unexpected.split("\r\n").join("\n")), message);
}

const messageDeduplicationSource = readSource("server/messageDeduplicationService.ts");
const flowIntegrationSource = readSource("server/flowIntegration.ts");
const whatsappSource = readSource("server/whatsapp.ts");
const storageSource = readSource("server/storage.ts");
const pendingRecoverySource = readSource("server/pendingMessageRecoveryService.ts");
const aiAgentSource = readSource("server/aiAgent.ts");
const schedulingServiceSource = readSource("server/schedulingService.ts");
const clinicAIServiceSource = readSource("server/clinicAIService.ts");
const providerAIServiceSource = readSource("server/providerAIService.ts");
const salonAIServiceSource = readSource("server/salonAIService.ts");

assertContains(
  messageDeduplicationSource,
  [
    ".from('incoming_message_log')",
    "        .select('id')",
    "        .eq('whatsapp_message_id', whatsappMessageId)",
    "        .maybeSingle();",
  ].join("\n"),
  "incoming message dedup check must allow a missing optional row without a PostgREST 406",
);

assertContains(
  messageDeduplicationSource,
  [
    ".from('message_deduplication')",
    "        .select('id')",
    "        .eq('dedup_key', dedupKey)",
    "        .maybeSingle();",
  ].join("\n"),
  "outgoing dedup lookup must allow a missing optional row without a PostgREST 406",
);

assertContains(
  flowIntegrationSource,
  [
    ".from('chatbot_configs')",
    "      .select('is_active, name')",
    "      .eq('user_id', userId)",
    "      .maybeSingle();",
  ].join("\n"),
  "flow activation check must treat missing chatbot_configs as an inactive optional flow",
);

assertContains(
  flowIntegrationSource,
  [
    ".from('products_config')",
    "      .select('is_active, send_to_ai')",
    "      .eq('user_id', userId)",
    "      .maybeSingle();",
  ].join("\n"),
  "flow module detection must treat missing products_config as a normal disabled catalog",
);

assertContains(
  flowIntegrationSource,
  [
    ".from('scheduling_config')",
    "      .select('is_enabled')",
    "      .eq('user_id', userId)",
    "      .maybeSingle();",
  ].join("\n"),
  "flow module detection must treat missing scheduling_config as a normal disabled scheduling module",
);

assertContains(
  flowIntegrationSource,
  [
    ".from('course_config')",
    "      .select('is_active, send_to_ai')",
    "      .eq('user_id', userId)",
    "      .maybeSingle();",
  ].join("\n"),
  "flow module detection must treat missing course_config as a normal disabled course module",
);

assertContains(
  whatsappSource,
  [
    '.from("products_config")',
    '      .select("is_active, send_to_ai")',
    '      .eq("user_id", userId)',
    "      .maybeSingle();",
  ].join("\n"),
  "WhatsApp catalog context check must treat missing products_config as a normal disabled catalog",
);

assertContains(
  aiAgentSource,
  [
    ".from('delivery_config')",
    "      .select('*')",
    "      .eq('user_id', userId)",
    "      .maybeSingle();",
  ].join("\n"),
  "AI delivery context must treat missing delivery_config as optional module config",
);

assertContains(
  aiAgentSource,
  [
    ".from('course_config')",
    "      .select('*')",
    "      .eq('user_id', userId)",
    "      .maybeSingle();",
  ].join("\n"),
  "AI course context must treat missing course_config as optional module config",
);

assertContains(
  schedulingServiceSource,
  [
    ".from('scheduling_config')",
    "      .select('*')",
    "      .eq('user_id', userId)",
    "      .maybeSingle();",
  ].join("\n"),
  "scheduling config cache must treat missing scheduling_config as optional module config",
);

assertContains(
  clinicAIServiceSource,
  ".from('clinic_config').select('*').eq('user_id', userId).maybeSingle();",
  "clinic config must treat missing clinic_config as optional module config",
);

assertContains(
  providerAIServiceSource,
  ".from('provider_config').select('*').eq('user_id', userId).maybeSingle();",
  "provider config must treat missing provider_config as optional module config",
);

assertContains(
  salonAIServiceSource,
  ".from('salon_config').select('*').eq('user_id', userId).maybeSingle();",
  "salon config must treat missing salon_config as optional module config",
);

assertContains(
  pendingRecoverySource,
  [
    ".from('pending_incoming_messages')",
    "        .upsert({",
  ].join("\n"),
  "pending recovery must still use idempotent upsert for incoming messages",
);

assertContains(
  pendingRecoverySource,
  [
    "      const insertedRow = Array.isArray(data) ? data[0] : null;",
    "      if (!insertedRow) {",
    "        this.stats.totalSkipped++;",
    "        return { id: '', isDuplicate: true };",
    "      }",
  ].join("\n"),
  "pending recovery must treat ignored duplicate upserts as duplicates without a singular 406",
);

assertNotContains(
  pendingRecoverySource,
  ".select('id')\n        .maybeSingle();",
  "pending recovery upsert must not request a singular row after ignoreDuplicates because duplicates can return an empty array",
);

assertContains(
  storageSource,
  "private async ensurePendingAiSkippedSupportChecked(): Promise<void>",
  "storage must check pending_ai_responses skipped support before writing skipped",
);

assertContains(
  storageSource,
  "if (definition && !definition.includes(\"'skipped'\"))",
  "storage must avoid the invalid skipped status when the deployed database constraint does not allow it",
);

console.log("supabaseNoiseOptionalReads.source.test.ts ok");
