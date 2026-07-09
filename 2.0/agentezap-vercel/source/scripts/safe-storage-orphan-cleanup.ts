import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Candidate = {
  name: string;
  created_at: string;
  size_bytes: string;
  mimetype: string;
};

const EXPECTED_REF = "bnfpcuzjvycudccycqqt";
const BUCKET = "whatsapp-media";
const DEFAULT_LIMIT = 200;

function loadEnvFile(path: string) {
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function getArg(name: string, fallback: string): string {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} ausente`);
  return value;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function main() {
  const sourceDir = process.cwd();
  loadEnvFile(resolve(sourceDir, ".env.runtime.local"));

  const deleteMode = process.argv.includes("--delete");
  const limit = Math.max(1, Number(getArg("--limit", String(DEFAULT_LIMIT))) || DEFAULT_LIMIT);
  const minAgeDays = Math.max(120, Number(getArg("--min-age-days", "120")) || 120);
  const output = resolve(
    sourceDir,
    getArg(
      "--output",
      `support-artifacts/storage-cleanup/safe-orphan-system-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.csv`,
    ),
  );

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const databaseUrl = requireEnv("DATABASE_URL");

  if (!supabaseUrl.includes(EXPECTED_REF)) {
    throw new Error(`SUPABASE_URL nao aponta para ${EXPECTED_REF}`);
  }
  if (!databaseUrl.includes(EXPECTED_REF)) {
    throw new Error(`DATABASE_URL nao aponta para ${EXPECTED_REF}`);
  }

  const db = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const candidatesSql = `
with protected_users as (
  select distinct user_id
  from public.subscriptions
  where user_id is not null
    and (
      status = 'active'
      or mp_status = 'authorized'
      or coalesce(expires_at, data_fim, next_payment_date) >= now() - interval '1 day'
    )
  union
  select distinct wc.user_id
  from public.whatsapp_connections wc
  where wc.user_id is not null and wc.is_connected = true
  union
  select distinct wc.user_id
  from public.whatsapp_connections wc
  join public.conversations c on c.connection_id = wc.id
  where wc.user_id is not null
    and coalesce(c.last_message_time, c.updated_at, c.created_at) >= now() - interval '30 days'
  union
  select distinct wc.user_id
  from public.whatsapp_connections wc
  join public.conversations c on c.connection_id = wc.id
  join public.messages m on m.conversation_id = c.id
  where wc.user_id is not null
    and coalesce(m.timestamp, m.created_at) >= now() - interval '30 days'
),
refs as (
  select distinct split_part(split_part(media_url, '/storage/v1/object/public/whatsapp-media/', 2), '?', 1) as object_name from public.messages where media_url like '%/storage/v1/object/public/whatsapp-media/%'
  union select distinct split_part(split_part(media_url, '/storage/v1/object/public/whatsapp-media/', 2), '?', 1) from public.admin_messages where media_url like '%/storage/v1/object/public/whatsapp-media/%'
  union select distinct split_part(split_part(storage_url, '/storage/v1/object/public/whatsapp-media/', 2), '?', 1) from public.agent_media_library where storage_url like '%/storage/v1/object/public/whatsapp-media/%'
  union select distinct split_part(split_part(storage_url, '/storage/v1/object/public/whatsapp-media/', 2), '?', 1) from public.admin_agent_media where storage_url like '%/storage/v1/object/public/whatsapp-media/%'
  union select distinct split_part(split_part(media_url, '/storage/v1/object/public/whatsapp-media/', 2), '?', 1) from public.broadcast_campaigns where media_url like '%/storage/v1/object/public/whatsapp-media/%'
  union select distinct split_part(split_part(storage_url, '/storage/v1/object/public/whatsapp-media/', 2), '?', 1) from public.status_post_items where storage_url like '%/storage/v1/object/public/whatsapp-media/%'
  union select distinct split_part(split_part(storage_url, '/storage/v1/object/public/whatsapp-media/', 2), '?', 1) from public.status_publish_run_items where storage_url like '%/storage/v1/object/public/whatsapp-media/%'
)
select
  o.name,
  o.created_at::text,
  coalesce(o.metadata->>'size', '0') as size_bytes,
  coalesce(nullif(o.metadata->>'mimetype',''), '<unknown>') as mimetype
from storage.objects o
left join refs r on r.object_name = o.name
left join protected_users pu on pu.user_id = coalesce(o.path_tokens[1], '')
where o.bucket_id = $1
  and coalesce(o.path_tokens[1], '') = 'system'
  and r.object_name is null
  and pu.user_id is null
  and o.created_at < now() - ($2::text || ' days')::interval
order by o.created_at asc, o.name asc
limit $3;
`;

  const result = await db.query<Candidate>(candidatesSql, [BUCKET, minAgeDays, limit]);
  const candidates = result.rows;
  const totalBytes = candidates.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0);

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(
    output,
    [
      "bucket,path,created_at,size_bytes,mimetype",
      ...candidates.map((row) =>
        [BUCKET, row.name, row.created_at, row.size_bytes, row.mimetype].map(csvEscape).join(","),
      ),
    ].join("\n") + "\n",
  );

  console.log(
    JSON.stringify({
      mode: deleteMode ? "delete" : "dry-run",
      bucket: BUCKET,
      minAgeDays,
      limit,
      candidateCount: candidates.length,
      candidateBytes: totalBytes,
      candidateMb: Number((totalBytes / 1024 / 1024).toFixed(3)),
      manifest: output,
    }),
  );

  if (!deleteMode || candidates.length === 0) {
    await db.end();
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const paths = candidates.map((row) => row.name);
  const { data, error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    await db.end();
    throw new Error(`Storage remove failed: ${error.message}`);
  }

  const verify = await db.query(
    `select count(*)::int as remaining
     from storage.objects
     where bucket_id = $1 and name = any($2::text[])`,
    [BUCKET, paths],
  );

  await db.end();

  console.log(
    JSON.stringify({
      deletedRequested: paths.length,
      deletedReported: Array.isArray(data) ? data.length : null,
      remainingAfterDelete: verify.rows[0]?.remaining ?? null,
    }),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error?.message || String(error) }));
  process.exit(1);
});
