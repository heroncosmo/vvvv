import fs from "fs/promises";
import path from "path";
import {
  BufferJSON,
  initAuthCreds,
  proto,
  useMultiFileAuthState,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { pool, withRetry } from "./db";

type AuthBackend = "file" | "supabase-postgres";

type UseAuthStateResult = {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
};

type AuthKeyType = keyof SignalDataTypeMap;

const authLocks = new Map<string, Promise<void>>();
let ensureSchemaPromise: Promise<void> | null = null;

const AUTH_KEY_TYPES: AuthKeyType[] = [
  "app-state-sync-key",
  "app-state-sync-version",
  "sender-key-memory",
  "identity-key",
  "sender-key",
  "lid-mapping",
  "device-list",
  "tctoken",
  "pre-key",
  "session",
];

function resolveBackend(): AuthBackend {
  const raw = String(process.env.WA_AUTH_STATE_BACKEND || "").trim().toLowerCase();
  if (["supabase", "supabase-postgres", "postgres", "postgresql", "db"].includes(raw)) {
    return "supabase-postgres";
  }
  return "file";
}

export function isSupabasePostgresAuthStateEnabled(): boolean {
  return resolveBackend() === "supabase-postgres";
}

function isFileMirrorEnabled(): boolean {
  return process.env.WA_AUTH_STATE_FILE_MIRROR !== "false";
}

function shouldAutoEnsureSchema(): boolean {
  return process.env.WA_AUTH_STATE_AUTO_MIGRATE !== "false";
}

function fixFileName(file: string): string {
  return file.replace(/\//g, "__").replace(/:/g, "-");
}

function getScopeKey(folder: string): string {
  return path.basename(path.resolve(folder));
}

function serializeForJsonb(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function deserializeFromJsonb<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
}

async function withAuthLock<T>(lockKey: string, task: () => Promise<T>): Promise<T> {
  const previous = authLocks.get(lockKey) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  authLocks.set(lockKey, previous.catch(() => undefined).then(() => current));
  await previous.catch(() => undefined);

  try {
    return await task();
  } finally {
    release();
  }
}

async function ensureFolder(folder: string): Promise<void> {
  await fs.mkdir(folder, { recursive: true });
}

async function readFileData<T>(folder: string, file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(folder, fixFileName(file)), "utf8");
    return JSON.parse(raw, BufferJSON.reviver) as T;
  } catch {
    return null;
  }
}

async function writeFileData(folder: string, file: string, value: unknown): Promise<void> {
  if (!isFileMirrorEnabled()) return;
  await ensureFolder(folder);
  await fs.writeFile(
    path.join(folder, fixFileName(file)),
    JSON.stringify(value, BufferJSON.replacer),
  );
}

async function removeFileData(folder: string, file: string): Promise<void> {
  if (!isFileMirrorEnabled()) return;
  try {
    await fs.unlink(path.join(folder, fixFileName(file)));
  } catch {
    // Best effort mirror cleanup.
  }
}

async function ensureBaileysAuthStateSchema(): Promise<void> {
  if (!shouldAutoEnsureSchema()) return;

  if (!ensureSchemaPromise) {
    ensureSchemaPromise = withRetry(async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wa_baileys_auth_creds (
          scope_key TEXT PRIMARY KEY,
          creds JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS wa_baileys_auth_keys (
          scope_key TEXT NOT NULL,
          key_type TEXT NOT NULL,
          key_id TEXT NOT NULL,
          key_value JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (scope_key, key_type, key_id)
        );

        ALTER TABLE wa_baileys_auth_creds ENABLE ROW LEVEL SECURITY;
        ALTER TABLE wa_baileys_auth_keys ENABLE ROW LEVEL SECURITY;

        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            REVOKE ALL ON TABLE wa_baileys_auth_creds FROM anon;
            REVOKE ALL ON TABLE wa_baileys_auth_keys FROM anon;
          END IF;

          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            REVOKE ALL ON TABLE wa_baileys_auth_creds FROM authenticated;
            REVOKE ALL ON TABLE wa_baileys_auth_keys FROM authenticated;
          END IF;

          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
             AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            IF NOT EXISTS (
              SELECT 1 FROM pg_policies
              WHERE schemaname = 'public'
                AND tablename = 'wa_baileys_auth_creds'
                AND policyname = 'wa_baileys_auth_creds_no_client_access'
            ) THEN
              CREATE POLICY wa_baileys_auth_creds_no_client_access
                ON wa_baileys_auth_creds
                AS RESTRICTIVE
                FOR ALL
                TO anon, authenticated
                USING (false)
                WITH CHECK (false);
            END IF;

            IF NOT EXISTS (
              SELECT 1 FROM pg_policies
              WHERE schemaname = 'public'
                AND tablename = 'wa_baileys_auth_keys'
                AND policyname = 'wa_baileys_auth_keys_no_client_access'
            ) THEN
              CREATE POLICY wa_baileys_auth_keys_no_client_access
                ON wa_baileys_auth_keys
                AS RESTRICTIVE
                FOR ALL
                TO anon, authenticated
                USING (false)
                WITH CHECK (false);
            END IF;
          END IF;
        END $$;
      `);
    }).catch((error) => {
      ensureSchemaPromise = null;
      throw error;
    });
  }

  await ensureSchemaPromise;
}

async function readDbCreds(scopeKey: string): Promise<AuthenticationCreds | null> {
  await ensureBaileysAuthStateSchema();
  const result = await withRetry(() =>
    pool.query(
      `SELECT creds FROM wa_baileys_auth_creds WHERE scope_key = $1 LIMIT 1`,
      [scopeKey],
    ),
  );
  const rawCreds = result.rows[0]?.creds;
  return rawCreds ? deserializeFromJsonb<AuthenticationCreds>(rawCreds) : null;
}

async function writeDbCreds(scopeKey: string, creds: AuthenticationCreds): Promise<void> {
  await ensureBaileysAuthStateSchema();
  await withRetry(() =>
    pool.query(
      `
        INSERT INTO wa_baileys_auth_creds (scope_key, creds, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (scope_key)
        DO UPDATE SET creds = EXCLUDED.creds, updated_at = now()
      `,
      [scopeKey, JSON.stringify(serializeForJsonb(creds))],
    ),
  );
}

async function readDbKeys<T extends AuthKeyType>(
  scopeKey: string,
  type: T,
  ids: string[],
): Promise<Record<string, SignalDataTypeMap[T]>> {
  await ensureBaileysAuthStateSchema();
  if (ids.length === 0) return {};

  const result = await withRetry(() =>
    pool.query(
      `
        SELECT key_id, key_value
        FROM wa_baileys_auth_keys
        WHERE scope_key = $1
          AND key_type = $2
          AND key_id = ANY($3::text[])
      `,
      [scopeKey, type, ids],
    ),
  );

  const data: Record<string, SignalDataTypeMap[T]> = {};
  for (const row of result.rows) {
    let value = deserializeFromJsonb<SignalDataTypeMap[T]>(row.key_value);
    if (type === "app-state-sync-key" && value) {
      value = proto.Message.AppStateSyncKeyData.fromObject(value as any) as SignalDataTypeMap[T];
    }
    data[String(row.key_id)] = value;
  }

  return data;
}

async function writeDbKey(
  scopeKey: string,
  type: string,
  id: string,
  value: unknown,
): Promise<void> {
  await ensureBaileysAuthStateSchema();
  await withRetry(() =>
    pool.query(
      `
        INSERT INTO wa_baileys_auth_keys (scope_key, key_type, key_id, key_value, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, now())
        ON CONFLICT (scope_key, key_type, key_id)
        DO UPDATE SET key_value = EXCLUDED.key_value, updated_at = now()
      `,
      [scopeKey, type, id, JSON.stringify(serializeForJsonb(value))],
    ),
  );
}

async function removeDbKey(scopeKey: string, type: string, id: string): Promise<void> {
  await ensureBaileysAuthStateSchema();
  await withRetry(() =>
    pool.query(
      `
        DELETE FROM wa_baileys_auth_keys
        WHERE scope_key = $1
          AND key_type = $2
          AND key_id = $3
      `,
      [scopeKey, type, id],
    ),
  );
}

async function clearDbScope(scopeKey: string): Promise<void> {
  await ensureBaileysAuthStateSchema();
  await withRetry(async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM wa_baileys_auth_keys WHERE scope_key = $1`, [scopeKey]);
      await client.query(`DELETE FROM wa_baileys_auth_creds WHERE scope_key = $1`, [scopeKey]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
}

function parseAuthFileName(fileName: string): { type: AuthKeyType; id: string } | null {
  if (!fileName.endsWith(".json") || fileName === "creds.json") return null;
  const stem = fileName.slice(0, -".json".length);
  for (const type of AUTH_KEY_TYPES) {
    const prefix = `${type}-`;
    if (stem.startsWith(prefix)) {
      return { type, id: stem.slice(prefix.length) };
    }
  }
  return null;
}

export async function importBaileysAuthFolderToSupabase(folder: string): Promise<{
  scopeKey: string;
  credsImported: boolean;
  keysImported: number;
}> {
  const scopeKey = getScopeKey(folder);
  await ensureBaileysAuthStateSchema();
  const creds = await readFileData<AuthenticationCreds>(folder, "creds.json");
  let credsImported = false;
  let keysImported = 0;

  if (creds) {
    await writeDbCreds(scopeKey, creds);
    credsImported = true;
  }

  let files: string[] = [];
  try {
    files = await fs.readdir(folder);
  } catch {
    return { scopeKey, credsImported, keysImported };
  }

  for (const file of files) {
    const parsed = parseAuthFileName(file);
    if (!parsed) continue;
    const value = await readFileData(folder, file);
    if (!value) continue;
    await writeDbKey(scopeKey, parsed.type, parsed.id, value);
    keysImported += 1;
  }

  return { scopeKey, credsImported, keysImported };
}

async function useSupabasePostgresAuthState(folder: string): Promise<UseAuthStateResult> {
  await ensureFolder(folder);
  const scopeKey = getScopeKey(folder);
  const lockPrefix = `wa-auth:${scopeKey}`;

  const creds = await withAuthLock(`${lockPrefix}:creds`, async () => {
    const dbCreds = await readDbCreds(scopeKey);
    if (dbCreds) {
      await writeFileData(folder, "creds.json", dbCreds);
      return dbCreds;
    }

    const fileCreds = await readFileData<AuthenticationCreds>(folder, "creds.json");
    const initialCreds = fileCreds || initAuthCreds();
    await writeDbCreds(scopeKey, initialCreds);
    await writeFileData(folder, "creds.json", initialCreds);
    return initialCreds;
  });

  return {
    state: {
      creds,
      keys: {
        get: async <T extends AuthKeyType>(
          type: T,
          ids: string[],
        ): Promise<Record<string, SignalDataTypeMap[T]>> => {
          const dbValues = await readDbKeys(scopeKey, type, ids);
          const missing = ids.filter((id) => !Object.prototype.hasOwnProperty.call(dbValues, id));

          await Promise.all(
            missing.map(async (id) => {
              const file = `${type}-${id}.json`;
              const fileValue = await readFileData<SignalDataTypeMap[T]>(folder, file);
              if (fileValue == null) return;
              await writeDbKey(scopeKey, type, id, fileValue);
              let value = fileValue;
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value as any) as SignalDataTypeMap[T];
              }
              dbValues[id] = value;
            }),
          );

          return dbValues;
        },
        set: async (data: SignalDataSet): Promise<void> => {
          const tasks: Promise<void>[] = [];
          for (const type of Object.keys(data) as AuthKeyType[]) {
            const entries = data[type] || {};
            for (const id of Object.keys(entries)) {
              const value = entries[id];
              const file = `${type}-${id}.json`;
              tasks.push(
                withAuthLock(`${lockPrefix}:${type}:${id}`, async () => {
                  if (value != null) {
                    await writeDbKey(scopeKey, type, id, value);
                    await writeFileData(folder, file, value);
                  } else {
                    await removeDbKey(scopeKey, type, id);
                    await removeFileData(folder, file);
                  }
                }),
              );
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await withAuthLock(`${lockPrefix}:creds`, async () => {
        await writeDbCreds(scopeKey, creds);
        await writeFileData(folder, "creds.json", creds);
      });
    },
  };
}

export async function useBaileysAuthState(folder: string): Promise<UseAuthStateResult> {
  if (!isSupabasePostgresAuthStateEnabled()) {
    return useMultiFileAuthState(folder) as Promise<UseAuthStateResult>;
  }

  return useSupabasePostgresAuthState(folder);
}

export async function clearBaileysAuthState(folder: string): Promise<void> {
  if (!isSupabasePostgresAuthStateEnabled()) return;
  await clearDbScope(getScopeKey(folder));
}
