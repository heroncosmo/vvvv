import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import { createHash, randomUUID } from "crypto";
import http from "http";
import https from "https";

const DEFAULT_GATEWAY_EVENT_URL =
  process.env.NODE_ENV === "production"
    ? "https://agentezap.online/api/internal/wa-gateway/events"
    : "http://127.0.0.1:5000/api/internal/wa-gateway/events";
const DEFAULT_GATEWAY_INTERNAL_TOKEN = "agentezap-internal-wa-gateway";
const DEFAULT_FLUSH_INTERVAL_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MIN_RETRY_DELAY_MS = 15_000;
const MAX_RETRY_DELAY_MS = 10 * 60_000;

type GatewayOutboxRecord = {
  id: string;
  userId: string;
  data: unknown;
  eventName: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string | null;
};

type GatewayDueOutboxRecord = {
  path: string;
  record: GatewayOutboxRecord;
};

let flushTimer: NodeJS.Timeout | null = null;
let flushing = false;

function isIncomingGatewayMessageEvent(data: any): boolean {
  const eventType = String(data?.type || "").trim().toLowerCase();
  if (
    !(
      eventType === "new_message" ||
      eventType === "message.received" ||
      eventType === "message_received"
    )
  ) {
    return false;
  }

  if (
    data?.fromMe === true ||
    data?.message?.fromMe === true ||
    data?.messageData?.fromMe === true ||
    data?.key?.fromMe === true
  ) {
    return false;
  }

  const direction = String(data?.direction || data?.messageData?.direction || data?.message?.direction || "").toLowerCase();
  if (direction === "outbound" || direction === "sent" || direction === "from_me") {
    return false;
  }

  return (
    eventType === "new_message" ||
    eventType === "message.received" ||
    eventType === "message_received"
  );
}

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function getOutboxRoot() {
  const configured =
    process.env.WA_GATEWAY_EVENT_OUTBOX_DIR ||
    process.env.AGENTEZAP_GATEWAY_OUTBOX_DIR ||
    join(process.cwd(), "logs", "gateway-event-outbox");
  return configured.trim();
}

function getGatewayEventUrl() {
  return (process.env.WA_GATEWAY_EVENT_URL || DEFAULT_GATEWAY_EVENT_URL).trim();
}

function getGatewayInternalToken() {
  return (process.env.WA_GATEWAY_INTERNAL_TOKEN || DEFAULT_GATEWAY_INTERNAL_TOKEN).trim();
}

function getRequestTimeoutMs() {
  const parsed = Number.parseInt(String(process.env.WA_GATEWAY_EVENT_OUTBOX_REQUEST_TIMEOUT_MS || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1_000, parsed) : DEFAULT_REQUEST_TIMEOUT_MS;
}

function getFlushIntervalMs() {
  const parsed = Number.parseInt(String(process.env.WA_GATEWAY_EVENT_OUTBOX_FLUSH_INTERVAL_MS || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1_000, parsed) : DEFAULT_FLUSH_INTERVAL_MS;
}

function getFlushConcurrency() {
  const parsed = Number.parseInt(String(process.env.WA_GATEWAY_EVENT_OUTBOX_CONCURRENCY || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.max(1, parsed), 25) : 6;
}

function getPendingDir() {
  return join(getOutboxRoot(), "pending");
}

function ensureDirectory(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function getRecordPath(id: string) {
  return join(getPendingDir(), `${safeFileName(id)}.json`);
}

function resolveEventName(data: any): string {
  const eventName = String(data?.type || "").trim();
  return eventName || "gateway-event";
}

function resolveEventMessageId(data: any): string {
  const messageData = data?.messageData && typeof data.messageData === "object" ? data.messageData : null;
  return String(messageData?.messageId || messageData?.id || data?.messageId || data?.id || "").trim();
}

function resolveEventConversationId(data: any): string {
  return String(data?.conversationId || data?.messageData?.conversationId || data?.conversationUpdate?.id || "").trim();
}

function resolveEventRemoteJid(data: any): string {
  return String(
    data?.remoteJid ||
      data?.remote_jid ||
      data?.jid ||
      data?.messageData?.remoteJid ||
      data?.messageData?.remote_jid ||
      data?.message?.remoteJid ||
      data?.key?.remoteJid ||
      "",
  ).trim();
}

function isGroupOrBroadcastGatewayEvent(data: any): boolean {
  const remoteJid = resolveEventRemoteJid(data).toLowerCase();
  const jidSuffix = String(data?.jidSuffix || data?.messageData?.jidSuffix || data?.conversation?.jidSuffix || "").toLowerCase();
  return (
    remoteJid.includes("@g.us") ||
    remoteJid.includes("@broadcast") ||
    remoteJid.includes("@newsletter") ||
    remoteJid === "status@broadcast" ||
    jidSuffix === "g.us" ||
    jidSuffix === "broadcast" ||
    jidSuffix === "newsletter"
  );
}

function getOutboxPriority(record: GatewayOutboxRecord): number {
  if (!isIncomingGatewayMessageEvent(record.data)) return 30;
  return isGroupOrBroadcastGatewayEvent(record.data) ? 20 : 0;
}

function buildOutboxId(userId: string, data: any) {
  const eventName = resolveEventName(data);
  const messageId = resolveEventMessageId(data);
  const conversationId = resolveEventConversationId(data);
  const stableKey = messageId
    ? `${userId}:${eventName}:${conversationId}:${messageId}`
    : `${userId}:${eventName}:${conversationId}:${JSON.stringify(data).slice(0, 4000)}`;
  return createHash("sha256").update(stableKey).digest("hex").slice(0, 48);
}

function writeRecord(record: GatewayOutboxRecord) {
  ensureDirectory(getPendingDir());
  const path = getRecordPath(record.id);
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(record)}\n`, "utf8");
  renameSync(tmpPath, path);
}

function quarantineUnreadableRecord(path: string, error: unknown) {
  try {
    const corruptDir = join(getOutboxRoot(), "corrupt");
    const corruptPath = join(corruptDir, `${Date.now()}-${basename(path)}`);
    ensureDirectory(dirname(corruptPath));
    renameSync(path, corruptPath);
    console.warn("[GATEWAY OUTBOX] Quarantined unreadable record:", path, "->", corruptPath, error);
  } catch (quarantineError) {
    console.warn("[GATEWAY OUTBOX] Failed to quarantine unreadable record:", path, quarantineError);
  }
}

function readRecord(path: string): GatewayOutboxRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed?.id || !parsed?.userId) {
      quarantineUnreadableRecord(path, "missing id/userId");
      return null;
    }
    return parsed as GatewayOutboxRecord;
  } catch (error) {
    quarantineUnreadableRecord(path, error);
    return null;
  }
}

function computeNextAttemptAt(attempts: number) {
  const delay = Math.min(MAX_RETRY_DELAY_MS, MIN_RETRY_DELAY_MS * Math.max(1, 2 ** Math.min(attempts, 6)));
  return new Date(Date.now() + delay).toISOString();
}

function shouldRetryAcceptedPayload(status: number, payload: any) {
  if (status !== 202) return false;
  if (payload?.processed === true || payload?.queued === true || payload?.durableQueue === true) {
    return false;
  }
  const reason = String(payload?.reason || payload?.message || "").toLowerCase();
  return /timeout|temporar|database|queue|overload|unavailable|connection/i.test(reason);
}

async function postRecord(record: GatewayOutboxRecord) {
  const payloadRaw = JSON.stringify({ userId: record.userId, data: record.data });
  const targetUrl = new URL(getGatewayEventUrl());
  const transport = targetUrl.protocol === "https:" ? https : http;
  const timeoutMs = getRequestTimeoutMs();

  const { statusCode, text } = await new Promise<{ statusCode: number; text: string }>((resolve, reject) => {
    const request = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payloadRaw),
          "x-wa-gateway-token": getGatewayInternalToken(),
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: Number(response.statusCode || 0),
            text,
          });
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Gateway relay request timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
    request.write(payloadRaw);
    request.end();
  });

  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 300) };
    }
  }

  if (statusCode < 200 || statusCode >= 300 || shouldRetryAcceptedPayload(statusCode, payload)) {
    throw new Error(`Vercel event relay not accepted: status=${statusCode} payload=${JSON.stringify(payload).slice(0, 300)}`);
  }
}

function listDueRecords(limit: number): GatewayDueOutboxRecord[] {
  const pendingDir = getPendingDir();
  if (!existsSync(pendingDir)) return [];
  const now = Date.now();
  return readdirSync(pendingDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(pendingDir, name))
    .map((path) => ({ path, record: readRecord(path) }))
    .filter((item): item is { path: string; record: GatewayOutboxRecord } => {
      if (!item.record) return false;
      const nextAttemptAt = new Date(item.record.nextAttemptAt || item.record.createdAt).getTime();
      return !Number.isFinite(nextAttemptAt) || nextAttemptAt <= now;
    })
    .sort((left, right) => {
      const leftPriority = getOutboxPriority(left.record);
      const rightPriority = getOutboxPriority(right.record);
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return String(left.record.createdAt).localeCompare(String(right.record.createdAt));
    })
    .slice(0, limit)
    .map((item) => ({ path: item.path, record: item.record }));
}

function buildConversationSafeBatches(records: GatewayDueOutboxRecord[]) {
  const batches: GatewayDueOutboxRecord[][] = [];
  for (const item of records) {
    const conversationKey = resolveEventConversationId(item.record.data) || item.record.id;
    let placed = false;
    for (const batch of batches) {
      const alreadyHasConversation = batch.some((existing) => {
        const existingKey = resolveEventConversationId(existing.record.data) || existing.record.id;
        return existingKey === conversationKey;
      });
      if (!alreadyHasConversation) {
        batch.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      batches.push([item]);
    }
  }
  return batches;
}

async function runOutboxBatch(
  records: GatewayDueOutboxRecord[],
  concurrency: number,
  worker: (item: GatewayDueOutboxRecord) => Promise<void>,
) {
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, records.length) }, async () => {
      while (nextIndex < records.length) {
        const item = records[nextIndex++];
        await worker(item);
      }
    }),
  );
}

export function enqueueGatewayMainAppEvent(userId: string, data: unknown) {
  if (isTruthyFlag(process.env.WA_GATEWAY_EVENT_OUTBOX_DISABLED)) {
    return;
  }
  if (!userId || !data || typeof data !== "object") {
    return;
  }

  const id = buildOutboxId(userId, data);
  const path = getRecordPath(id);
  if (existsSync(path)) {
    void flushGatewayEventOutbox({ limit: 5 });
    return;
  }

  const now = new Date().toISOString();
  writeRecord({
    id,
    userId,
    data,
    eventName: resolveEventName(data),
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
  });

  void flushGatewayEventOutbox({ limit: 5 });
}

export async function flushGatewayEventOutbox(options: { limit?: number } = {}) {
  if (flushing) {
    return { processed: 0, delivered: 0, failed: 0, skipped: "already_flushing" };
  }

  flushing = true;
  let processed = 0;
  let delivered = 0;
  let failed = 0;
  let dropped = 0;

  try {
    const limit = Math.max(1, options.limit || Number.parseInt(process.env.WA_GATEWAY_EVENT_OUTBOX_FLUSH_LIMIT || "25", 10) || 25);
    const concurrency = getFlushConcurrency();
    const batches = buildConversationSafeBatches(listDueRecords(limit));
    for (const batch of batches) {
      await runOutboxBatch(batch, concurrency, async ({ path, record }) => {
        if (!isIncomingGatewayMessageEvent(record.data)) {
          rmSync(path, { force: true });
          dropped += 1;
          return;
        }

        processed += 1;
        try {
          await postRecord(record);
          rmSync(path, { force: true });
          delivered += 1;
        } catch (error: any) {
          failed += 1;
          const attempts = Number(record.attempts || 0) + 1;
          writeRecord({
            ...record,
            attempts,
            updatedAt: new Date().toISOString(),
            nextAttemptAt: computeNextAttemptAt(attempts),
            lastError: error?.message || String(error),
          });
        }
      });
    }
  } finally {
    flushing = false;
  }

  if (processed > 0 || dropped > 0) {
    console.log(
      `[GATEWAY OUTBOX] flush processed=${processed} delivered=${delivered} failed=${failed} dropped=${dropped}`,
    );
  }
  return { processed, delivered, failed, dropped };
}

export function startGatewayEventOutbox() {
  ensureDirectory(getPendingDir());
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushGatewayEventOutbox();
  }, getFlushIntervalMs());
  flushTimer.unref?.();
  void flushGatewayEventOutbox();
}

export function stopGatewayEventOutbox() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export function getGatewayEventOutboxStats() {
  const pendingDir = getPendingDir();
  if (!existsSync(pendingDir)) {
    return {
      pending: 0,
      directPending: 0,
      deferredPending: 0,
      nonIncomingPending: 0,
      maxAgeSeconds: 0,
      oldestCreatedAt: null,
      outboxDir: pendingDir,
    };
  }
  const files = readdirSync(pendingDir).filter((name) => name.endsWith(".json"));
  const now = Date.now();
  let directPending = 0;
  let deferredPending = 0;
  let nonIncomingPending = 0;
  let maxAgeSeconds = 0;
  let oldestCreatedAt: string | null = null;

  for (const name of files) {
    const record = readRecord(join(pendingDir, name));
    if (!record) continue;
    if (!isIncomingGatewayMessageEvent(record.data)) {
      nonIncomingPending += 1;
    } else if (getOutboxPriority(record) === 0) {
      directPending += 1;
    } else {
      deferredPending += 1;
    }

    const createdAtMs = new Date(record.createdAt).getTime();
    if (Number.isFinite(createdAtMs)) {
      const ageSeconds = Math.max(0, Math.floor((now - createdAtMs) / 1000));
      if (ageSeconds > maxAgeSeconds) {
        maxAgeSeconds = ageSeconds;
        oldestCreatedAt = record.createdAt;
      }
    }
  }

  return {
    pending: files.length,
    directPending,
    deferredPending,
    nonIncomingPending,
    maxAgeSeconds,
    oldestCreatedAt,
    outboxDir: pendingDir,
  };
}
