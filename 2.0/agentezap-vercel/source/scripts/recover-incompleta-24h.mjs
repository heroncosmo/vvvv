#!/usr/bin/env node
/**
 * recover-incompleta-24h.mjs
 *
 * Usage:
 *   node scripts/recover-incompleta-24h.mjs --dry-run
 *   node scripts/recover-incompleta-24h.mjs --apply
 *   node scripts/recover-incompleta-24h.mjs --apply --user-id <uuid>
 *   node scripts/recover-incompleta-24h.mjs --apply --conversation-id <uuid>
 */

import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const apply = args.includes("--apply");

function readArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

const userId = readArg("--user-id");
const conversationId = readArg("--conversation-id");

if ((dryRun && apply) || (!dryRun && !apply)) {
  console.error("Choose exactly one mode: --dry-run or --apply");
  process.exit(1);
}

const MODE = dryRun ? "DRY_RUN" : "APPLY";
const LOOKBACK_HOURS = 24;
const TARGET_CONVERSATION = "7314e3b7-97c0-473c-b0a0-dfd91ebb0e2c";
const FALLBACK_TEXT = "Oi";
const EXECUTE_DELAY_SECONDS = 5;

const { Client } = pg;
const client = new Client({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const ELIGIBLE_QUERY = `
WITH last_messages AS (
  SELECT DISTINCT ON (m.conversation_id)
    m.id AS last_message_row_id,
    m.conversation_id,
    m.message_id AS last_message_id,
    m.text AS last_text,
    m.from_me AS last_from_me,
    m.timestamp AS last_timestamp
  FROM messages m
  WHERE m.timestamp >= NOW() - make_interval(hours => $1::int)
  ORDER BY m.conversation_id, m.timestamp DESC, m.created_at DESC NULLS LAST, m.id DESC
),
eligible AS (
  SELECT
    c.id AS conversation_id,
    wc.user_id,
    c.connection_id,
    c.contact_number,
    COALESCE(NULLIF(c.jid_suffix, ''), 's.whatsapp.net') AS jid_suffix,
    lm.last_message_row_id,
    lm.last_message_id,
    lm.last_text,
    lm.last_timestamp
  FROM conversations c
  INNER JOIN last_messages lm ON lm.conversation_id = c.id
  INNER JOIN whatsapp_connections wc ON wc.id = c.connection_id
  WHERE lm.last_from_me = false
    AND (
      lm.last_text IS NULL
      OR btrim(lm.last_text) = ''
      OR lm.last_text ILIKE '[WhatsApp] Mensagem incompleta%'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pending_ai_responses p
      WHERE p.conversation_id = c.id
        AND p.status = 'pending'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM messages ma
      WHERE ma.conversation_id = c.id
        AND ma.from_me = true
        AND ma.timestamp > lm.last_timestamp
    )
)
SELECT *
FROM eligible
WHERE ($2::text IS NULL OR user_id = $2::text)
  AND ($3::text IS NULL OR conversation_id = $3::text)
ORDER BY last_timestamp ASC
LIMIT 5000;
`;

async function loadEligibleRows() {
  const result = await client.query(ELIGIBLE_QUERY, [LOOKBACK_HOURS, userId || null, conversationId || null]);
  return result.rows || [];
}

async function applyRecovery(rows) {
  let recovered = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      await client.query("BEGIN");

      await client.query(
        `
        UPDATE messages
        SET text = $1
        WHERE id = $2
          AND (
            text IS NULL
            OR btrim(text) = ''
            OR text ILIKE '[WhatsApp] Mensagem incompleta%'
          )
      `,
        [FALLBACK_TEXT, row.last_message_row_id],
      );

      await client.query(
        `
        UPDATE conversations
        SET
          last_message_text = $1,
          last_message_from_me = false,
          updated_at = NOW()
        WHERE id = $2
          AND (
            last_message_text IS NULL
            OR btrim(last_message_text) = ''
            OR last_message_text ILIKE '[WhatsApp] Mensagem incompleta%'
          )
      `,
        [FALLBACK_TEXT, row.conversation_id],
      );

      await client.query(
        `
        INSERT INTO pending_ai_responses (
          conversation_id,
          user_id,
          contact_number,
          jid_suffix,
          messages,
          scheduled_at,
          execute_at,
          status
        ) VALUES (
          $1, $2, $3, $4, $5::jsonb, NOW(),
          NOW() + make_interval(secs => $6::int),
          'pending'
        )
        ON CONFLICT (conversation_id) DO UPDATE
        SET
          messages = EXCLUDED.messages,
          status = 'pending',
          scheduled_at = NOW(),
          execute_at = NOW() + make_interval(secs => $6::int),
          updated_at = NOW()
      `,
        [
          row.conversation_id,
          row.user_id,
          row.contact_number,
          row.jid_suffix,
          JSON.stringify([FALLBACK_TEXT]),
          EXECUTE_DELAY_SECONDS,
        ],
      );

      await client.query("COMMIT");
      recovered++;
    } catch (error) {
      errors++;
      await client.query("ROLLBACK");
      console.error(
        `Recovery failed for conversation=${row.conversation_id} user=${row.user_id}:`,
        error?.message || error,
      );
    }
  }

  return { recovered, errors };
}

async function main() {
  await client.connect();

  console.log("=== Recover Conversas Incompletas (24h) ===");
  console.log(`Mode: ${MODE}`);
  console.log(`Window: last ${LOOKBACK_HOURS}h`);
  console.log(`Fallback text: "${FALLBACK_TEXT}"`);
  if (userId) console.log(`User filter: ${userId}`);
  if (conversationId) console.log(`Conversation filter: ${conversationId}`);

  const rows = await loadEligibleRows();
  console.log(`Eligible conversations: ${rows.length}`);

  const targetFound = rows.some((row) => row.conversation_id === TARGET_CONVERSATION);
  console.log(`Target ${TARGET_CONVERSATION}: ${targetFound ? "FOUND" : "NOT_FOUND"}`);

  if (rows.length > 0) {
    console.log("Sample:");
    for (const row of rows.slice(0, 15)) {
      console.log(
        `- conv=${row.conversation_id} user=${row.user_id} contact=${row.contact_number} ts=${row.last_timestamp} text=${String(row.last_text || "").slice(0, 80)}`,
      );
    }
  }

  if (dryRun) {
    console.log("Dry-run complete. No data changed.");
    return;
  }

  if (rows.length === 0) {
    console.log("Nothing to recover.");
    return;
  }

  const { recovered, errors } = await applyRecovery(rows);
  console.log(`Recovered: ${recovered}`);
  console.log(`Errors: ${errors}`);
  console.log("Apply complete.");
}

main()
  .catch((error) => {
    console.error("recover-incompleta-24h failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await client.end();
    } catch (_e) {
      // no-op
    }
  });
