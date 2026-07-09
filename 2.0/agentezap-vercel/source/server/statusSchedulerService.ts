import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db, pool } from "./db";
import {
  scheduledStatus,
  scheduledStatusRuns,
  statusRotation,
  statusRotationItems,
} from "@shared/schema";
import {
  parseStatusPostPayload,
  processStatusPublishJobs,
  processStatusRotations,
  sendStatusPostForUser,
} from "./statusPostingService";
import {
  buildNonRetryableStatusErrorMessage,
  buildRetryMessage,
  computeTransientRetryDelaySeconds,
  shouldRetryStatusPublishError,
  TRANSIENT_RETRY_LIMIT,
} from "./statusPostingRetry";
import {
  buildExpiredImmediateScheduledStatusMessage,
  buildInterruptedScheduledStatusMessage,
  shouldExpireInterruptedImmediateStatus,
  shouldRecoverInterruptedScheduledStatus,
} from "./statusProcessingRuntime";
import {
  getScheduledStatusFailureState,
  getScheduledStatusSuccessState,
} from "./statusScheduledState";

const CHECK_INTERVAL_MS = 60 * 1000;
const RETRY_DELAY_MINUTES = 15;

type RotationMode = "sequential" | "random";

let scheduledStatusRunsReady: Promise<void> | null = null;

async function ensureScheduledStatusRunsTable(): Promise<void> {
  if (scheduledStatusRunsReady) {
    return scheduledStatusRunsReady;
  }

  scheduledStatusRunsReady = (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS scheduled_status_runs (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          status_id VARCHAR NOT NULL REFERENCES scheduled_status(id) ON DELETE CASCADE,
          user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          scheduled_for TIMESTAMP,
          attempted_at TIMESTAMP DEFAULT NOW(),
          status VARCHAR(20) NOT NULL,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_scheduled_status_runs_status
          ON scheduled_status_runs(status_id, attempted_at DESC);

        CREATE INDEX IF NOT EXISTS idx_scheduled_status_runs_user
          ON scheduled_status_runs(user_id, attempted_at DESC);
      `);
      console.log("[STATUS SCHEDULER] scheduled_status_runs table ensured");
    } catch (error) {
      console.error(
        "[STATUS SCHEDULER] Failed to ensure scheduled_status_runs table:",
        error,
      );
    }
  })();

  return scheduledStatusRunsReady;
}

async function recordScheduledStatusRun(params: {
  statusId: string;
  userId: string;
  scheduledFor: Date | null;
  attemptedAt: Date;
  status: "sent" | "failed";
  errorMessage?: string | null;
}) {
  try {
    await db.insert(scheduledStatusRuns).values({
      statusId: params.statusId,
      userId: params.userId,
      scheduledFor: params.scheduledFor,
      attemptedAt: params.attemptedAt,
      status: params.status,
      errorMessage: params.errorMessage || null,
      createdAt: params.attemptedAt,
    });
  } catch (error) {
    console.error(
      "[STATUS SCHEDULER] Failed to record scheduled status run:",
      error,
    );
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function pickSequentialItem<T extends { id: string }>(
  items: T[],
  lastItemId: string | null | undefined,
): T {
  if (items.length === 0) {
    throw new Error("No items to rotate");
  }
  if (!lastItemId) {
    return items[0];
  }
  const idx = items.findIndex((item) => item.id === lastItemId);
  if (idx === -1) {
    return items[0];
  }
  return items[(idx + 1) % items.length];
}

function pickWeightedRandomItem<
  T extends { id: string; weight: number | null },
>(items: T[], lastItemId: string | null | undefined): T {
  const pool =
    items.length > 1 ? items.filter((item) => item.id !== lastItemId) : items;
  const total = pool.reduce(
    (sum, item) => sum + Math.max(1, item.weight || 1),
    0,
  );
  let rand = Math.random() * total;
  for (const item of pool) {
    rand -= Math.max(1, item.weight || 1);
    if (rand <= 0) return item;
  }
  return pool[0];
}

export class StatusSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;
  private processingScheduledStatusIds = new Set<string>();
  private readonly bootStartedAt = new Date();
  private bootRecoveryDone = false;

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[STATUS SCHEDULER] Service started");
    void ensureScheduledStatusRunsTable();
    this.timer = setInterval(() => this.process(), CHECK_INTERVAL_MS);
    setTimeout(() => this.process(), 15 * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  queueScheduledStatusProcessing(statusId: string, delayMs = 0): void {
    const safeDelay = Math.max(0, delayMs);
    setTimeout(() => {
      void this.processScheduledStatusById(statusId);
    }, safeDelay);
  }

  getBootStartedAt(): Date {
    return this.bootStartedAt;
  }

  async runCycleOnce(): Promise<{ accepted: boolean; skipped?: string }> {
    if (this.isProcessing) {
      return { accepted: false, skipped: "already_processing" };
    }

    await ensureScheduledStatusRunsTable();
    await this.process();

    return { accepted: true };
  }

  private async process(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this.recoverInterruptedScheduledStatuses();
      await processStatusPublishJobs();
      await processStatusRotations();
      await this.processScheduledStatus();
      await this.processRotations();
    } catch (error) {
      console.error("[STATUS SCHEDULER] Error:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async recoverInterruptedScheduledStatuses(): Promise<void> {
    if (this.bootRecoveryDone) {
      return;
    }

    const now = new Date();
    const interrupted = await db
      .select()
      .from(scheduledStatus)
      .where(eq(scheduledStatus.status, "processing"))
      .orderBy(asc(scheduledStatus.updatedAt));

    const recoverable = interrupted.filter((item) =>
      shouldRecoverInterruptedScheduledStatus({
        status: item.status,
        updatedAt: item.updatedAt,
        schedulerBootStartedAt: this.bootStartedAt,
        now,
      }),
    );

    this.bootRecoveryDone = true;

    if (recoverable.length === 0) {
      return;
    }

    console.warn(
      `[STATUS SCHEDULER] Recovering ${recoverable.length} interrupted scheduled status publish(es) from previous boot`,
    );

    for (const item of recoverable) {
      const payload = parseStatusPostPayload(item.statusText);
      if (
        shouldExpireInterruptedImmediateStatus({
          status: item.status,
          updatedAt: item.updatedAt,
          schedulerBootStartedAt: this.bootStartedAt,
          createdAt: item.createdAt,
          requestedAction: payload.requestedAction,
          now,
        })
      ) {
        await db
          .update(scheduledStatus)
          .set({
            status: "failed",
            errorMessage: buildExpiredImmediateScheduledStatusMessage(now),
            updatedAt: now,
          })
          .where(eq(scheduledStatus.id, item.id));
        continue;
      }

      const nextAttempt = Number(payload.sendRetryCount || 0) + 1;
      const serializedRetryPayload = JSON.stringify({
        ...payload,
        sendRetryCount: nextAttempt,
      });

      await db
        .update(scheduledStatus)
        .set({
          status: "retrying",
          statusText: serializedRetryPayload,
          scheduledFor: now,
          errorMessage: buildInterruptedScheduledStatusMessage(now),
          updatedAt: now,
        })
        .where(eq(scheduledStatus.id, item.id));
    }
  }

  private async processScheduledStatus(): Promise<void> {
    const now = new Date();
    const pending = await db
      .select()
      .from(scheduledStatus)
      .where(
        and(
          inArray(scheduledStatus.status, ["pending", "retrying"]),
          lte(scheduledStatus.scheduledFor, now),
        ),
      )
      .orderBy(asc(scheduledStatus.scheduledFor));

    for (const item of pending) {
      await this.processScheduledStatusById(item.id);
    }
  }

  private async processScheduledStatusById(statusId: string): Promise<void> {
    if (this.processingScheduledStatusIds.has(statusId)) {
      return;
    }

    this.processingScheduledStatusIds.add(statusId);
    try {
      const [item] = await db
        .select()
        .from(scheduledStatus)
        .where(eq(scheduledStatus.id, statusId));

      if (!item) {
        return;
      }

      if (!["pending", "retrying"].includes(item.status)) {
        return;
      }

      const now = new Date();
      if (item.scheduledFor && item.scheduledFor > now) {
        return;
      }

      await db
        .update(scheduledStatus)
        .set({
          status: "processing",
          updatedAt: now,
        })
        .where(eq(scheduledStatus.id, item.id));

      try {
        const payload = parseStatusPostPayload(item.statusText);
        console.log(
          `[STATUS SCHEDULER] Processing scheduled status ${item.id} for ${item.userId.slice(0, 8)}...`,
        );
        await sendStatusPostForUser(item.userId, payload, {
          preferredConnectionId: payload.connectionId || null,
        });

        const successState = getScheduledStatusSuccessState({
          rawStatusText: item.statusText,
          scheduledFor: item.scheduledFor,
          recurrenceType: item.recurrenceType,
          recurrenceInterval: item.recurrenceInterval,
          now,
        });

        await db
          .update(scheduledStatus)
          .set(successState)
          .where(eq(scheduledStatus.id, item.id));

        await recordScheduledStatusRun({
          statusId: item.id,
          userId: item.userId,
          scheduledFor: item.scheduledFor || null,
          attemptedAt: now,
          status: "sent",
        });

        console.log(
          successState.status === "pending"
            ? `[STATUS SCHEDULER] Scheduled status ${item.id} re-queued for next recurrence`
            : `[STATUS SCHEDULER] Scheduled status ${item.id} marked as sent`,
        );
      } catch (error: any) {
        const payload = parseStatusPostPayload(item.statusText);
        const nextAttempt = Number(payload.sendRetryCount || 0) + 1;
        const serializedRetryPayload = JSON.stringify({
          ...payload,
          sendRetryCount: nextAttempt,
        });

        if (
          shouldRetryStatusPublishError(error) &&
          nextAttempt <= TRANSIENT_RETRY_LIMIT
        ) {
          const retryAt = addSeconds(
            now,
            computeTransientRetryDelaySeconds(nextAttempt - 1),
          );
          await db
            .update(scheduledStatus)
            .set({
              status: "retrying",
              statusText: serializedRetryPayload,
              errorMessage: buildRetryMessage(error, retryAt, nextAttempt),
              scheduledFor: retryAt,
              updatedAt: now,
            })
            .where(eq(scheduledStatus.id, item.id));
          await recordScheduledStatusRun({
            statusId: item.id,
            userId: item.userId,
            scheduledFor: item.scheduledFor || null,
            attemptedAt: now,
            status: "failed",
            errorMessage: error?.message || "Falha ao publicar status",
          });
          console.warn(
            `[STATUS SCHEDULER] Scheduled status ${item.id} transient failure. Retry ${nextAttempt}/${TRANSIENT_RETRY_LIMIT}`,
          );
          return;
        }

        const failureState = getScheduledStatusFailureState({
          rawStatusText: item.statusText,
          scheduledFor: item.scheduledFor,
          recurrenceType: item.recurrenceType,
          recurrenceInterval: item.recurrenceInterval,
          now,
          errorMessage: buildNonRetryableStatusErrorMessage(error),
          nextAttempt,
        });

        await db
          .update(scheduledStatus)
          .set(failureState)
          .where(eq(scheduledStatus.id, item.id));
        await recordScheduledStatusRun({
          statusId: item.id,
          userId: item.userId,
          scheduledFor: item.scheduledFor || null,
          attemptedAt: now,
          status: "failed",
          errorMessage:
            failureState.errorMessage ||
            error?.message ||
            "Falha ao publicar status",
        });
        console.error(
          failureState.status === "pending"
            ? `[STATUS SCHEDULER] Scheduled status ${item.id} skipped this occurrence and kept recurrence active:`
            : `[STATUS SCHEDULER] Scheduled status ${item.id} failed:`,
          error?.message || error,
        );
      }
    } finally {
      this.processingScheduledStatusIds.delete(statusId);
    }
  }

  private async processRotations(): Promise<void> {
    const now = new Date();
    const rotations = await db
      .select()
      .from(statusRotation)
      .where(
        and(
          eq(statusRotation.isActive, true),
          or(
            isNull(statusRotation.nextRunAt),
            lte(statusRotation.nextRunAt, now),
          ),
        ),
      )
      .orderBy(asc(statusRotation.nextRunAt));

    for (const rotation of rotations) {
      const items = await db
        .select()
        .from(statusRotationItems)
        .where(
          and(
            eq(statusRotationItems.rotationId, rotation.id),
            eq(statusRotationItems.isActive, true),
          ),
        )
        .orderBy(asc(statusRotationItems.displayOrder));

      if (items.length === 0) {
        await db
          .update(statusRotation)
          .set({
            nextRunAt: addMinutes(now, RETRY_DELAY_MINUTES),
            updatedAt: now,
          })
          .where(eq(statusRotation.id, rotation.id));
        continue;
      }

      const mode = (rotation.mode || "sequential") as RotationMode;
      const selected =
        mode === "random"
          ? pickWeightedRandomItem(items, rotation.lastItemId)
          : pickSequentialItem(items, rotation.lastItemId);

      try {
        await sendStatusPostForUser(
          rotation.userId,
          parseStatusPostPayload(selected.statusText),
        );

        const intervalMinutes = Math.max(1, rotation.intervalMinutes || 240);
        const nextRunAt = addMinutes(now, intervalMinutes);

        await db
          .update(statusRotation)
          .set({
            lastSentAt: now,
            nextRunAt,
            lastItemId: selected.id,
            updatedAt: now,
          })
          .where(eq(statusRotation.id, rotation.id));

        await db
          .update(statusRotationItems)
          .set({
            lastSentAt: now,
            updatedAt: now,
          })
          .where(eq(statusRotationItems.id, selected.id));
      } catch (error: any) {
        await db
          .update(statusRotation)
          .set({
            nextRunAt: addMinutes(now, RETRY_DELAY_MINUTES),
            updatedAt: now,
          })
          .where(eq(statusRotation.id, rotation.id));
      }
    }
  }
}

export const statusSchedulerService = new StatusSchedulerService();
