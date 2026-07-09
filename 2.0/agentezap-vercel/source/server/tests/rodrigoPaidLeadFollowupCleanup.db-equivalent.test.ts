import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { Pool } from "pg";

function loadEnvFiles() {
  const candidates = [
    join(process.cwd(), ".env"),
    join(process.cwd(), ".env.local"),
    join(process.cwd(), ".env.production"),
    join(process.cwd(), ".vercel", ".env.preview.local"),
    resolve(process.cwd(), "..", "..", ".env.runtime.local"),
    resolve(process.cwd(), "..", "..", ".env.production.local"),
    resolve(process.cwd(), "..", "..", ".env.local"),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "").trim();
    }
  }
}

loadEnvFiles();

const connectionString = (process.env.DATABASE_URL || process.env.DATABASE_URL_DIRECT || "").trim();

test("Rodrigo paid lead follow-up cleanup SQL updates only synthetic temp rows", async (t) => {
  if (!connectionString) {
    t.skip("DATABASE_URL not configured for db-equivalent cleanup validation");
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 15000,
    allowExitOnIdle: true,
  });

  try {
    await pool.query("BEGIN");
    await pool.query("SET LOCAL search_path TO pg_temp, public");
    await pool.query(`
      CREATE TEMP TABLE conversations (
        id text PRIMARY KEY,
        followup_active boolean,
        followup_stage integer,
        next_followup_at timestamp,
        followup_disabled_reason text,
        updated_at timestamp
      ) ON COMMIT DROP;

      CREATE TEMP TABLE admins (
        id text PRIMARY KEY,
        email text
      ) ON COMMIT DROP;

      CREATE TEMP TABLE admin_conversations (
        admin_id text,
        linked_user_id text,
        contact_number text,
        payment_status text,
        followup_for_non_payers boolean,
        followup_active boolean,
        followup_stage integer,
        next_followup_at timestamp,
        updated_at timestamp
      ) ON COMMIT DROP;

      CREATE TEMP TABLE users (
        id text PRIMARY KEY,
        email text
      ) ON COMMIT DROP;

      CREATE TEMP TABLE owner_scheduled_notifications (
        owner_user_id text,
        notification_type text,
        status text,
        user_id text,
        metadata jsonb,
        recipient_phone text,
        error_message text,
        sent_at timestamp,
        updated_at timestamp
      ) ON COMMIT DROP;

      CREATE TEMP TABLE admin_pix_recovery_messages (
        subscription_id text,
        status text,
        error text,
        updated_at timestamp
      ) ON COMMIT DROP;
    `);

    const reason = "Pagamento aprovado - follow-up pausado automaticamente.";
    const ownerEmail = "rodrigo4@gmail.com";
    const userId = "synthetic-user";
    const subscriptionId = "synthetic-subscription";
    const phoneDigits = ["5511999990000"];

    await pool.query(
      `
        INSERT INTO conversations VALUES
          ('synthetic-conversation', true, 3, NOW(), NULL, NOW());

        INSERT INTO admins VALUES
          ('admin-rodrigo', $1),
          ('admin-other', 'other@example.com');

        INSERT INTO admin_conversations VALUES
          ('admin-rodrigo', $2, 'ignored', 'pending', true, true, 2, NOW(), NOW()),
          ('admin-rodrigo', 'other-user', '+55 (11) 99999-0000', 'pending', true, true, 2, NOW(), NOW()),
          ('admin-other', $2, '+55 (11) 99999-0000', 'pending', true, true, 2, NOW(), NOW());

        INSERT INTO users VALUES
          ('owner-rodrigo', $1),
          ('owner-other', 'other@example.com');

        INSERT INTO owner_scheduled_notifications VALUES
          ('owner-rodrigo', 'payment_reminder', 'pending', $2, '{}'::jsonb, NULL, NULL, NOW(), NOW()),
          ('owner-rodrigo', 'overdue_reminder', 'processing', 'other-user', jsonb_build_object('subscriptionId', $3), NULL, NULL, NOW(), NOW()),
          ('owner-rodrigo', 'payment_reminder', 'failed', 'other-user', '{}'::jsonb, '+55 (11) 99999-0000', NULL, NOW(), NOW()),
          ('owner-rodrigo', 'payment_reminder', 'sent', $2, '{}'::jsonb, NULL, NULL, NOW(), NOW()),
          ('owner-other', 'payment_reminder', 'pending', $2, '{}'::jsonb, NULL, NULL, NOW(), NOW());

        INSERT INTO admin_pix_recovery_messages VALUES
          ($3, 'pending', NULL, NOW()),
          ($3, 'processing', NULL, NOW()),
          ($3, 'failed', NULL, NOW()),
          ($3, 'sent', NULL, NOW()),
          ('other-subscription', 'pending', NULL, NOW());
      `,
      [ownerEmail, userId, subscriptionId],
    );

    const crmResult = await pool.query(
      `
        UPDATE conversations
        SET followup_active = false,
            followup_stage = 0,
            next_followup_at = NULL,
            followup_disabled_reason = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      ["synthetic-conversation", reason],
    );

    const adminResult = await pool.query(
      `
        UPDATE admin_conversations ac
        SET payment_status = 'paid',
            followup_for_non_payers = false,
            followup_active = false,
            followup_stage = 0,
            next_followup_at = NULL,
            updated_at = NOW()
        FROM admins a
        WHERE ac.admin_id = a.id
          AND LOWER(a.email) = LOWER($1)
          AND (
            ac.linked_user_id = $2
            OR (
              $3::text[] IS NOT NULL
              AND regexp_replace(COALESCE(ac.contact_number, ''), '\\D', '', 'g') = ANY($3::text[])
            )
          )
      `,
      [ownerEmail, userId, phoneDigits],
    );

    const notificationResult = await pool.query(
      `
        UPDATE owner_scheduled_notifications osn
        SET status = 'skipped_active_plan',
            error_message = $5,
            sent_at = NULL,
            updated_at = NOW()
        FROM users owner_user
        WHERE osn.owner_user_id = owner_user.id
          AND LOWER(owner_user.email) = LOWER($1)
          AND osn.notification_type IN ('payment_reminder', 'overdue_reminder')
          AND osn.status IN ('pending', 'processing', 'failed')
          AND (
            osn.user_id = $2
            OR COALESCE(osn.metadata->>'subscriptionId', osn.metadata->>'subscription_id') = $3
            OR (
              $4::text[] IS NOT NULL
              AND regexp_replace(COALESCE(osn.recipient_phone, ''), '\\D', '', 'g') = ANY($4::text[])
            )
          )
      `,
      [ownerEmail, userId, subscriptionId, phoneDigits, reason],
    );

    const pixResult = await pool.query(
      `
        UPDATE admin_pix_recovery_messages
        SET status = 'skipped',
            error = 'skipped_payment_already_recorded',
            updated_at = NOW()
        WHERE subscription_id = $1
          AND status IN ('pending', 'processing', 'failed')
      `,
      [subscriptionId],
    );

    assert.equal(crmResult.rowCount, 1);
    assert.equal(adminResult.rowCount, 2);
    assert.equal(notificationResult.rowCount, 3);
    assert.equal(pixResult.rowCount, 3);

    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM conversations WHERE followup_active = false AND followup_stage = 0 AND next_followup_at IS NULL AND followup_disabled_reason IS NOT NULL) AS crm_paused,
        (SELECT COUNT(*) FROM admin_conversations WHERE admin_id = 'admin-rodrigo' AND payment_status = 'paid' AND followup_for_non_payers = false AND followup_active = false) AS admin_paused,
        (SELECT COUNT(*) FROM admin_conversations WHERE admin_id = 'admin-other' AND payment_status = 'pending' AND followup_active = true) AS other_admin_untouched,
        (SELECT COUNT(*) FROM owner_scheduled_notifications WHERE owner_user_id = 'owner-rodrigo' AND status = 'skipped_active_plan') AS notifications_skipped,
        (SELECT COUNT(*) FROM owner_scheduled_notifications WHERE owner_user_id = 'owner-other' AND status = 'pending') AS other_owner_untouched,
        (SELECT COUNT(*) FROM admin_pix_recovery_messages WHERE subscription_id = $1 AND status = 'skipped' AND error = 'skipped_payment_already_recorded') AS pix_skipped,
        (SELECT COUNT(*) FROM admin_pix_recovery_messages WHERE subscription_id = 'other-subscription' AND status = 'pending') AS other_pix_untouched
    `, [subscriptionId]);

    assert.deepEqual(rows[0], {
      crm_paused: "1",
      admin_paused: "2",
      other_admin_untouched: "1",
      notifications_skipped: "3",
      other_owner_untouched: "1",
      pix_skipped: "3",
      other_pix_untouched: "1",
    });
  } finally {
    await pool.query("ROLLBACK").catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
});
