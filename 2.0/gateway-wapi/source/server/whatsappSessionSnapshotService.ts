import { createHash } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { gzipSync, gunzipSync } from "zlib";

import { createSupabaseServiceClient, getSupabaseServiceKey, getSupabaseUrl } from "./supabaseService";

const SESSIONS_BASE = process.env.SESSIONS_DIR || "./";
const ADMIN_SESSIONS_BASE = process.env.ADMIN_SESSIONS_DIR || SESSIONS_BASE;
const SNAPSHOT_BUCKET = String(process.env.WA_SESSION_SNAPSHOT_BUCKET || "wa-session-snapshots").trim();
const SNAPSHOT_CRON_INTERVAL_MS = Math.max(
  Number(process.env.WA_SESSION_SNAPSHOT_INTERVAL_MS || 10 * 60 * 1000),
  60_000,
);
const SNAPSHOT_DEBOUNCE_MS = Math.max(
  Number(process.env.WA_SESSION_SNAPSHOT_DEBOUNCE_MS || 15_000),
  1_000,
);
const SNAPSHOT_ENABLED = String(process.env.ENABLE_WA_SESSION_SNAPSHOTS || "true").trim().toLowerCase() !== "false";

type SnapshotCategory = "customer" | "admin";

type SnapshotFileRecord = {
  relativePath: string;
  contentBase64: string;
  size: number;
};

type SessionSnapshotPayload = {
  version: 1;
  category: SnapshotCategory;
  dirName: string;
  createdAt: string;
  createdBy: string;
  host: string;
  fileCount: number;
  sha256: string;
  files: SnapshotFileRecord[];
};

type ScheduledSnapshotEntry = {
  authPath: string;
  reason: string;
  timer: NodeJS.Timeout;
};

type SyncAllOptions = {
  includeAdmins?: boolean;
  reason?: string;
};

type RestoreOptions = {
  includeAdmins?: boolean;
  missingOnly?: boolean;
  reason?: string;
};

let snapshotCronTimer: NodeJS.Timeout | null = null;
const scheduledSnapshots = new Map<string, ScheduledSnapshotEntry>();
let bucketEnsured = false;

function isSnapshotsConfigured(): boolean {
  return SNAPSHOT_ENABLED && Boolean(getSupabaseUrl()) && Boolean(getSupabaseServiceKey()) && Boolean(SNAPSHOT_BUCKET);
}

function normalizeDirName(authPath: string): string {
  return path.basename(path.resolve(authPath));
}

function resolveSnapshotCategoryFromDirName(dirName: string): SnapshotCategory | null {
  if (dirName.startsWith("auth_admin_")) {
    return "admin";
  }

  if (dirName.startsWith("auth_")) {
    return "customer";
  }

  return null;
}

function isSnapshotEligibleDirName(dirName: string): boolean {
  if (!dirName.startsWith("auth_")) {
    return false;
  }

  if (dirName.startsWith("auth_pairing_")) {
    return false;
  }

  return true;
}

function getBasePathForCategory(category: SnapshotCategory): string {
  return category === "admin" ? ADMIN_SESSIONS_BASE : SESSIONS_BASE;
}

function buildSnapshotObjectPath(category: SnapshotCategory, dirName: string): string {
  return `${category}/${dirName}/latest.snapshot.json.gz`;
}

function buildArchivedSnapshotObjectPath(category: SnapshotCategory, dirName: string, reason: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeReason = String(reason || "archived").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "archived";
  return `archive/${category}/${dirName}/${timestamp}-${safeReason}.snapshot.json.gz`;
}

async function ensureDirExists(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function hasValidCredsFile(dirPath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(path.join(dirPath, "creds.json"), "utf8");
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed));
  } catch {
    return false;
  }
}

async function listFilesRecursively(rootPath: string, currentPath = rootPath): Promise<SnapshotFileRecord[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const files: SnapshotFileRecord[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursively(rootPath, entryPath));
      continue;
    }

    const buffer = await fs.readFile(entryPath);
    files.push({
      relativePath: path.relative(rootPath, entryPath).replace(/\\/g, "/"),
      contentBase64: buffer.toString("base64"),
      size: buffer.length,
    });
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return files;
}

function buildPayloadHash(files: SnapshotFileRecord[]): string {
  const hash = createHash("sha256");

  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(file.contentBase64);
    hash.update("\0");
  }

  return hash.digest("hex");
}

function serializeSnapshotPayload(payload: SessionSnapshotPayload): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
}

function deserializeSnapshotPayload(buffer: Buffer): SessionSnapshotPayload {
  return JSON.parse(gunzipSync(buffer).toString("utf8"));
}

async function ensureSnapshotBucket(): Promise<boolean> {
  if (!isSnapshotsConfigured()) {
    return false;
  }

  if (bucketEnsured) {
    return true;
  }

  const supabase = createSupabaseServiceClient();
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.warn("[WA SNAPSHOT] Failed to list buckets:", listError.message);
      return false;
    }

    if (!buckets?.some((bucket) => bucket.name === SNAPSHOT_BUCKET)) {
      const { error: createError } = await supabase.storage.createBucket(SNAPSHOT_BUCKET, {
        public: false,
      });
      if (createError) {
        console.warn(`[WA SNAPSHOT] Failed to create bucket ${SNAPSHOT_BUCKET}:`, createError.message);
        return false;
      }
      console.log(`[WA SNAPSHOT] Created private bucket ${SNAPSHOT_BUCKET}`);
    }

    bucketEnsured = true;
    return true;
  } catch (error) {
    console.warn("[WA SNAPSHOT] Failed to ensure bucket:", error);
    return false;
  }
}

async function uploadSnapshotPayloadToObjectPath(
  objectPath: string,
  payload: SessionSnapshotPayload,
): Promise<void> {
  if (!await ensureSnapshotBucket()) {
    return;
  }

  const supabase = createSupabaseServiceClient();
  const archive = serializeSnapshotPayload(payload);
  const { error } = await supabase.storage.from(SNAPSHOT_BUCKET).upload(objectPath, archive, {
    upsert: true,
    contentType: "application/gzip",
    cacheControl: "0",
  });

  if (error) {
    throw new Error(`Upload snapshot failed for ${objectPath}: ${error.message}`);
  }
}

async function uploadSnapshotPayload(
  category: SnapshotCategory,
  dirName: string,
  payload: SessionSnapshotPayload,
): Promise<void> {
  await uploadSnapshotPayloadToObjectPath(buildSnapshotObjectPath(category, dirName), payload);
}

async function uploadArchivedSnapshotPayload(
  category: SnapshotCategory,
  dirName: string,
  payload: SessionSnapshotPayload,
  reason: string,
): Promise<void> {
  await uploadSnapshotPayloadToObjectPath(buildArchivedSnapshotObjectPath(category, dirName, reason), {
    ...payload,
    createdAt: new Date().toISOString(),
    createdBy: `archive:${reason}`,
  });
}

async function downloadSnapshotPayload(
  category: SnapshotCategory,
  dirName: string,
): Promise<SessionSnapshotPayload | null> {
  if (!await ensureSnapshotBucket()) {
    return null;
  }

  const supabase = createSupabaseServiceClient();
  const objectPath = buildSnapshotObjectPath(category, dirName);
  const { data, error } = await supabase.storage.from(SNAPSHOT_BUCKET).download(objectPath);
  if (error || !data) {
    return null;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return deserializeSnapshotPayload(buffer);
}

async function deleteSnapshotPayload(category: SnapshotCategory, dirName: string): Promise<void> {
  if (!await ensureSnapshotBucket()) {
    return;
  }

  const supabase = createSupabaseServiceClient();
  const objectPath = buildSnapshotObjectPath(category, dirName);
  const { error } = await supabase.storage.from(SNAPSHOT_BUCKET).remove([objectPath]);
  if (error) {
    console.warn(`[WA SNAPSHOT] Failed to delete snapshot ${objectPath}:`, error.message);
  }
}

async function listSnapshotDirNames(category: SnapshotCategory): Promise<string[]> {
  if (!await ensureSnapshotBucket()) {
    return [];
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.storage.from(SNAPSHOT_BUCKET).list(category, {
    limit: 1000,
  });

  if (error || !data) {
    if (error) {
      console.warn(`[WA SNAPSHOT] Failed to list snapshot dirs for ${category}:`, error.message);
    }
    return [];
  }

  return data
    .map((entry) => String(entry.name || "").trim())
    .filter(Boolean)
    .filter(isSnapshotEligibleDirName);
}

export async function syncWhatsAppSessionSnapshot(
  authPath: string,
  reason = "manual",
): Promise<boolean> {
  const dirName = normalizeDirName(authPath);
  const category = resolveSnapshotCategoryFromDirName(dirName);
  if (!category || !isSnapshotEligibleDirName(dirName)) {
    return false;
  }

  if (!isSnapshotsConfigured()) {
    return false;
  }

  if (!await hasValidCredsFile(authPath)) {
    console.warn(`[WA SNAPSHOT] Skipping ${dirName}: missing or invalid creds.json`);
    return false;
  }

  try {
    const files = await listFilesRecursively(authPath);
    if (files.length === 0) {
      return false;
    }

    const payload: SessionSnapshotPayload = {
      version: 1,
      category,
      dirName,
      createdAt: new Date().toISOString(),
      createdBy: reason,
      host: os.hostname(),
      fileCount: files.length,
      sha256: buildPayloadHash(files),
      files,
    };

    await uploadSnapshotPayload(category, dirName, payload);
    console.log(`[WA SNAPSHOT] Synced ${dirName} (${files.length} files) reason=${reason}`);
    return true;
  } catch (error) {
    console.warn(`[WA SNAPSHOT] Failed to sync ${dirName}:`, error);
    return false;
  }
}

export async function archiveWhatsAppSessionSnapshotBeforeClear(
  authPath: string,
  reason = "clear-auth",
): Promise<boolean> {
  const dirName = normalizeDirName(authPath);
  const category = resolveSnapshotCategoryFromDirName(dirName);
  if (!category || !isSnapshotEligibleDirName(dirName) || !isSnapshotsConfigured()) {
    return false;
  }

  try {
    if (await hasValidCredsFile(authPath)) {
      const files = await listFilesRecursively(authPath);
      if (files.length > 0) {
        const payload: SessionSnapshotPayload = {
          version: 1,
          category,
          dirName,
          createdAt: new Date().toISOString(),
          createdBy: `pre-clear:${reason}`,
          host: os.hostname(),
          fileCount: files.length,
          sha256: buildPayloadHash(files),
          files,
        };
        await uploadArchivedSnapshotPayload(category, dirName, payload, reason);
        console.log(`[WA SNAPSHOT] Archived local ${dirName} before clear reason=${reason}`);
        return true;
      }
    }

    const latestPayload = await downloadSnapshotPayload(category, dirName);
    if (latestPayload) {
      await uploadArchivedSnapshotPayload(category, dirName, latestPayload, reason);
      console.log(`[WA SNAPSHOT] Archived remote ${dirName} before clear reason=${reason}`);
      return true;
    }
  } catch (error) {
    console.warn(`[WA SNAPSHOT] Failed to archive ${dirName} before clear:`, error);
  }

  return false;
}

export function scheduleWhatsAppSessionSnapshot(
  authPath: string,
  reason = "scheduled",
): boolean {
  const dirName = normalizeDirName(authPath);
  if (!isSnapshotEligibleDirName(dirName) || !isSnapshotsConfigured()) {
    return false;
  }

  const existing = scheduledSnapshots.get(authPath);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => {
    scheduledSnapshots.delete(authPath);
    void syncWhatsAppSessionSnapshot(authPath, reason);
  }, SNAPSHOT_DEBOUNCE_MS);
  timer.unref?.();

  scheduledSnapshots.set(authPath, { authPath, reason, timer });
  return true;
}

export function cancelScheduledWhatsAppSessionSnapshot(authPath: string): void {
  const existing = scheduledSnapshots.get(authPath);
  if (!existing) {
    return;
  }

  clearTimeout(existing.timer);
  scheduledSnapshots.delete(authPath);
}

export async function flushPendingWhatsAppSessionSnapshots(): Promise<void> {
  const pending = Array.from(scheduledSnapshots.values());
  scheduledSnapshots.clear();

  for (const entry of pending) {
    clearTimeout(entry.timer);
  }

  for (const entry of pending) {
    await syncWhatsAppSessionSnapshot(entry.authPath, `${entry.reason}:flush`);
  }
}

async function scanLocalSnapshotEligibleDirs(basePath: string, category: SnapshotCategory): Promise<string[]> {
  try {
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((entry) => resolveSnapshotCategoryFromDirName(entry) === category)
      .filter(isSnapshotEligibleDirName);

    const eligible: string[] = [];
    for (const dirName of dirs) {
      const authPath = path.join(basePath, dirName);
      if (await hasValidCredsFile(authPath)) {
        eligible.push(authPath);
      }
    }

    return eligible;
  } catch {
    return [];
  }
}

export async function syncAllWhatsAppSessionSnapshots(
  options: SyncAllOptions = {},
): Promise<{ synced: number; skipped: number }> {
  if (!isSnapshotsConfigured()) {
    return { synced: 0, skipped: 0 };
  }

  const reason = options.reason || "periodic";
  const includeAdmins = options.includeAdmins !== false;
  let synced = 0;
  let skipped = 0;

  const customerDirs = await scanLocalSnapshotEligibleDirs(SESSIONS_BASE, "customer");
  for (const authPath of customerDirs) {
    if (await syncWhatsAppSessionSnapshot(authPath, reason)) {
      synced += 1;
    } else {
      skipped += 1;
    }
  }

  if (includeAdmins) {
    const adminDirs = await scanLocalSnapshotEligibleDirs(ADMIN_SESSIONS_BASE, "admin");
    for (const authPath of adminDirs) {
      if (await syncWhatsAppSessionSnapshot(authPath, reason)) {
        synced += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return { synced, skipped };
}

async function materializeSnapshotPayload(
  category: SnapshotCategory,
  payload: SessionSnapshotPayload,
  missingOnly: boolean,
): Promise<boolean> {
  const basePath = getBasePathForCategory(category);
  const targetPath = path.join(basePath, payload.dirName);
  const tempPath = path.join(basePath, `.restore-${payload.dirName}-${Date.now()}`);
  const backupPath = path.join(basePath, `.backup-${payload.dirName}-${Date.now()}`);

  if (missingOnly && await hasValidCredsFile(targetPath)) {
    return false;
  }

  await ensureDirExists(basePath);
  await fs.rm(tempPath, { recursive: true, force: true });
  await ensureDirExists(tempPath);

  for (const file of payload.files) {
    const filePath = path.join(tempPath, file.relativePath);
    await ensureDirExists(path.dirname(filePath));
    await fs.writeFile(filePath, Buffer.from(file.contentBase64, "base64"));
  }

  if (!await hasValidCredsFile(tempPath)) {
    await fs.rm(tempPath, { recursive: true, force: true });
    throw new Error(`Snapshot ${payload.dirName} restored without valid creds.json`);
  }

  if (await pathExists(targetPath)) {
    await fs.rm(backupPath, { recursive: true, force: true });
    await fs.rename(targetPath, backupPath);
  }

  await fs.rename(tempPath, targetPath);
  await fs.rm(backupPath, { recursive: true, force: true }).catch(() => undefined);
  return true;
}

export async function restoreWhatsAppSessionSnapshotsFromStorage(
  options: RestoreOptions = {},
): Promise<{ restored: number; skipped: number }> {
  if (!isSnapshotsConfigured()) {
    return { restored: 0, skipped: 0 };
  }

  const includeAdmins = options.includeAdmins !== false;
  const missingOnly = options.missingOnly !== false;
  let restored = 0;
  let skipped = 0;

  const customerDirNames = await listSnapshotDirNames("customer");
  for (const dirName of customerDirNames) {
    const payload = await downloadSnapshotPayload("customer", dirName);
    if (!payload) {
      skipped += 1;
      continue;
    }

    try {
      const didRestore = await materializeSnapshotPayload("customer", payload, missingOnly);
      if (didRestore) {
        restored += 1;
        console.log(`[WA SNAPSHOT] Restored ${dirName} from Supabase Storage`);
      } else {
        skipped += 1;
      }
    } catch (error) {
      skipped += 1;
      console.warn(`[WA SNAPSHOT] Failed to restore ${dirName}:`, error);
    }
  }

  if (includeAdmins) {
    const adminDirNames = await listSnapshotDirNames("admin");
    for (const dirName of adminDirNames) {
      const payload = await downloadSnapshotPayload("admin", dirName);
      if (!payload) {
        skipped += 1;
        continue;
      }

      try {
        const didRestore = await materializeSnapshotPayload("admin", payload, missingOnly);
        if (didRestore) {
          restored += 1;
          console.log(`[WA SNAPSHOT] Restored ${dirName} from Supabase Storage`);
        } else {
          skipped += 1;
        }
      } catch (error) {
        skipped += 1;
        console.warn(`[WA SNAPSHOT] Failed to restore ${dirName}:`, error);
      }
    }
  }

  return { restored, skipped };
}

export async function deleteWhatsAppSessionSnapshot(authPath: string, reason = "deleted"): Promise<void> {
  const dirName = normalizeDirName(authPath);
  const category = resolveSnapshotCategoryFromDirName(dirName);
  if (!category || !isSnapshotEligibleDirName(dirName) || !isSnapshotsConfigured()) {
    return;
  }

  cancelScheduledWhatsAppSessionSnapshot(authPath);
  await deleteSnapshotPayload(category, dirName);
  console.log(`[WA SNAPSHOT] Deleted remote snapshot for ${dirName} reason=${reason}`);
}

export function startWhatsAppSessionSnapshotCron(includeAdmins = false): void {
  if (!isSnapshotsConfigured()) {
    console.log("[WA SNAPSHOT] Snapshot cron disabled: missing Supabase config or feature flag");
    return;
  }

  if (snapshotCronTimer) {
    return;
  }

  snapshotCronTimer = setInterval(() => {
    void syncAllWhatsAppSessionSnapshots({
      includeAdmins,
      reason: "cron",
    });
  }, SNAPSHOT_CRON_INTERVAL_MS);
  snapshotCronTimer.unref?.();
  console.log(`[WA SNAPSHOT] Snapshot cron started interval=${SNAPSHOT_CRON_INTERVAL_MS}ms includeAdmins=${includeAdmins}`);
}

export function stopWhatsAppSessionSnapshotCron(): void {
  if (!snapshotCronTimer) {
    return;
  }

  clearInterval(snapshotCronTimer);
  snapshotCronTimer = null;
}
