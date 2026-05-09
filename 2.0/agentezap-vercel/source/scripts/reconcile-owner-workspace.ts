import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import { ensureOwnerWorkspaceReady } from "../server/ownerNotificationWorkspaceService";
import {
  getLegacyAdminMatchForOwnerEmail,
  getOwnerWorkspaceUsers,
} from "../server/ownerWorkspaceRegistry";

function parseArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  const value = process.argv[index + 1];
  return value ? String(value).trim() : null;
}

function normalizeEmail(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function parseCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function main() {
  const targetEmail = normalizeEmail(parseArg("--email") || "rodrigo4@gmail.com");
  const ownerUsers = await getOwnerWorkspaceUsers();
  const ownerUser = ownerUsers.find((user) => normalizeEmail(user.email) === targetEmail);

  if (!ownerUser?.id) {
    throw new Error(`Workspace do dono não encontrado para ${targetEmail}`);
  }

  const legacyMatch = await getLegacyAdminMatchForOwnerEmail(ownerUser.email);
  console.log(
    JSON.stringify(
      {
        phase: "before",
        ownerUserId: ownerUser.id,
        ownerEmail: ownerUser.email,
        selectedLegacyAdmin: legacyMatch,
      },
      null,
      2,
    ),
  );

  await ensureOwnerWorkspaceReady(ownerUser.id);

  const configResult = await db.execute(sql`
    SELECT
      owner_user_id,
      legacy_admin_id,
      legacy_admin_migrated_at,
      payment_reminder_ai_enabled,
      overdue_reminder_ai_enabled,
      checkin_ai_enabled,
      disconnected_ai_enabled,
      ai_variation_enabled,
      welcome_message_ai_enabled,
      CARDINALITY(welcome_message_variations) AS welcome_variations
    FROM owner_notification_config
    WHERE owner_user_id = ${ownerUser.id}
    LIMIT 1
  `);

  const totalsResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM owner_notification_logs WHERE owner_user_id = ${ownerUser.id}) AS logs_count,
      (SELECT COUNT(*)::int FROM owner_scheduled_notifications WHERE owner_user_id = ${ownerUser.id}) AS scheduled_count,
      (SELECT COUNT(*)::int FROM owner_broadcast_archives WHERE owner_user_id = ${ownerUser.id}) AS broadcasts_count,
      (SELECT COUNT(*)::int FROM owner_broadcast_archive_messages WHERE owner_user_id = ${ownerUser.id}) AS broadcast_messages_count
  `);

  const scheduledByTypeResult = await db.execute(sql`
    SELECT notification_type, COUNT(*)::int AS total
    FROM owner_scheduled_notifications
    WHERE owner_user_id = ${ownerUser.id}
    GROUP BY notification_type
    ORDER BY notification_type ASC
  `);

  const configRow = (configResult.rows?.[0] as any) || null;
  const totalsRow = (totalsResult.rows?.[0] as any) || {};
  const scheduledByType = Object.fromEntries(
    (scheduledByTypeResult.rows || []).map((row: any) => [String(row.notification_type), parseCount(row.total)]),
  );

  console.log(
    JSON.stringify(
      {
        phase: "after",
        ownerUserId: ownerUser.id,
        ownerEmail: ownerUser.email,
        config: configRow
          ? {
              legacyAdminId: configRow.legacy_admin_id,
              legacyAdminMigratedAt: configRow.legacy_admin_migrated_at,
              paymentReminderAiEnabled: Boolean(configRow.payment_reminder_ai_enabled),
              overdueReminderAiEnabled: Boolean(configRow.overdue_reminder_ai_enabled),
              checkinAiEnabled: Boolean(configRow.checkin_ai_enabled),
              disconnectedAiEnabled: Boolean(configRow.disconnected_ai_enabled),
              aiVariationEnabled: Boolean(configRow.ai_variation_enabled),
              welcomeMessageAiEnabled: Boolean(configRow.welcome_message_ai_enabled),
              welcomeVariations: parseCount(configRow.welcome_variations),
            }
          : null,
        totals: {
          logs: parseCount(totalsRow.logs_count),
          scheduled: parseCount(totalsRow.scheduled_count),
          broadcasts: parseCount(totalsRow.broadcasts_count),
          broadcastMessages: parseCount(totalsRow.broadcast_messages_count),
        },
        scheduledByType,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[reconcile-owner-workspace] falhou:", error);
    process.exit(1);
  });
