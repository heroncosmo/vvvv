import { admins, users } from "@shared/schema";
import { db } from "./db";
import { eq, inArray, sql } from "drizzle-orm";

const OWNER_WORKSPACE_EMAILS = ["rodrigo4@gmail.com"];

function normalizeEmail(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function parseCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type OwnerLegacyAdminMatch = {
  id: string;
  email: string;
  role: string;
  sameEmail: boolean;
  hasConfig: boolean;
  logsCount: number;
  scheduledCount: number;
  broadcastsCount: number;
  totalRecords: number;
  dataSignals: number;
};

export function getOwnerWorkspaceEmails(): string[] {
  return [...OWNER_WORKSPACE_EMAILS];
}

export function canAccessOwnerWorkspaceEmail(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && OWNER_WORKSPACE_EMAILS.includes(normalized);
}

export async function getOwnerWorkspaceUserById(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user || null;
}

export async function getPrimaryOwnerWorkspaceUser() {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(inArray(users.email, OWNER_WORKSPACE_EMAILS))
    .limit(1);

  return user || null;
}

export async function getOwnerWorkspaceUsers() {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(inArray(users.email, OWNER_WORKSPACE_EMAILS));
}

export async function canUserAccessOwnerWorkspace(userId: string): Promise<boolean> {
  const user = await getOwnerWorkspaceUserById(userId);
  return canAccessOwnerWorkspaceEmail(user?.email);
}

export async function getLegacyAdminMatchForOwnerEmail(
  email?: string | null,
): Promise<OwnerLegacyAdminMatch | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }

  const result = await db.execute(sql`
    SELECT
      a.id,
      a.email,
      a.role,
      CASE WHEN LOWER(a.email) = ${normalized} THEN TRUE ELSE FALSE END AS same_email,
      EXISTS(
        SELECT 1
        FROM admin_notification_config anc
        WHERE anc.admin_id = a.id
      ) AS has_config,
      (
        SELECT COUNT(*)::int
        FROM admin_notification_logs anl
        WHERE anl.admin_id = a.id
      ) AS logs_count,
      (
        SELECT COUNT(*)::int
        FROM scheduled_notifications sn
        WHERE sn.admin_id = a.id
      ) AS scheduled_count,
      (
        SELECT COUNT(*)::int
        FROM admin_broadcasts ab
        WHERE ab.admin_id = a.id
      ) AS broadcasts_count,
      a.created_at
    FROM admins a
    WHERE LOWER(a.email) = ${normalized}
       OR a.role = 'owner'
  `);

  const candidates = (result.rows || [])
    .map((row: any) => {
      const logsCount = parseCount(row.logs_count);
      const scheduledCount = parseCount(row.scheduled_count);
      const broadcastsCount = parseCount(row.broadcasts_count);
      const hasConfig = Boolean(row.has_config);
      const dataSignals = [
        hasConfig,
        logsCount > 0,
        scheduledCount > 0,
        broadcastsCount > 0,
      ].filter(Boolean).length;

      return {
        id: String(row.id),
        email: String(row.email || ""),
        role: String(row.role || "admin"),
        sameEmail: Boolean(row.same_email),
        hasConfig,
        logsCount,
        scheduledCount,
        broadcastsCount,
        totalRecords: logsCount + scheduledCount + broadcastsCount + (hasConfig ? 1 : 0),
        dataSignals,
        createdAt: row.created_at ? new Date(row.created_at as string) : null,
      };
    })
    .sort((left, right) => {
      if (right.dataSignals !== left.dataSignals) {
        return right.dataSignals - left.dataSignals;
      }
      if (right.totalRecords !== left.totalRecords) {
        return right.totalRecords - left.totalRecords;
      }
      if (left.sameEmail !== right.sameEmail) {
        return left.sameEmail ? -1 : 1;
      }
      if ((left.role === "owner") !== (right.role === "owner")) {
        return left.role === "owner" ? -1 : 1;
      }

      const leftCreatedAt = left.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightCreatedAt = right.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftCreatedAt - rightCreatedAt;
    });

  const best = candidates[0];
  if (!best) {
    return null;
  }

  return {
    id: best.id,
    email: best.email,
    role: best.role,
    sameEmail: best.sameEmail,
    hasConfig: best.hasConfig,
    logsCount: best.logsCount,
    scheduledCount: best.scheduledCount,
    broadcastsCount: best.broadcastsCount,
    totalRecords: best.totalRecords,
    dataSignals: best.dataSignals,
  };
}

export async function getLegacyAdminIdForOwnerEmail(email?: string | null): Promise<string | null> {
  const match = await getLegacyAdminMatchForOwnerEmail(email);
  return match?.id || null;
}
