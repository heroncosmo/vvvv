import { prependWhatsappSignature } from "@shared/agentSignature";
import { sql } from "drizzle-orm";
import {
  CONVERSATION_SCHEDULED_MESSAGES_STATEFUL_MARKER,
  type ConversationScheduledMessageCronConfig,
  resolveConversationScheduledMessageCronConfig,
} from "./conversationScheduledMessageConfig";
import { db } from "./db";
import { resolveManualMessageSignatureName } from "./manualMessageSignature";
import { storage } from "./storage";
import { sendMessage as whatsappSendMessage } from "./whatsapp";

const DEFAULT_INTERVAL_MS = 60 * 1000;

type ClaimedScheduledMessageRow = {
  id: string;
  user_id: string;
  conversation_id: string;
  contact_number: string | null;
  text: string;
  use_ai: boolean | null;
  scheduled_for: Date | string;
};

export type ConversationScheduledMessageRunResult = {
  accepted: boolean;
  claimed: number;
  sent: number;
  failed: number;
  expired: number;
  recovered: number;
  skipped?: string;
};

function getReturnedRowCount(result: { rows?: unknown[] } | undefined | null): number {
  return Array.isArray(result?.rows) ? result.rows.length : 0;
}

function normalizeErrorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "Erro desconhecido");
  return message.slice(0, 500);
}

async function expireStaleScheduledMessages(maxOverdueMinutes: number): Promise<number> {
  const result = await db.execute(sql`
    UPDATE conversation_scheduled_messages
    SET status = 'failed',
        executed_at = NOW(),
        error_reason = 'Agendamento expirado; crie um novo agendamento para evitar envio atrasado.'
    WHERE status IN ('scheduled', 'processing')
      AND scheduled_for < (NOW() AT TIME ZONE 'America/Sao_Paulo') - (${maxOverdueMinutes}::int * interval '1 minute')
    RETURNING id
  `);

  return getReturnedRowCount(result);
}

async function recoverStuckProcessingMessages(stuckProcessingMinutes: number): Promise<number> {
  const result = await db.execute(sql`
    UPDATE conversation_scheduled_messages
    SET status = 'scheduled',
        error_reason = 'Retentativa automatica apos envio interrompido.'
    WHERE status = 'processing'
      AND executed_at < NOW() - (${stuckProcessingMinutes}::int * interval '1 minute')
    RETURNING id
  `);

  return getReturnedRowCount(result);
}

async function claimDueScheduledMessages(
  batchLimit: number,
  maxOverdueMinutes: number,
): Promise<ClaimedScheduledMessageRow[]> {
  const result = await db.execute(sql`
    WITH due AS (
      SELECT sm.id
      FROM conversation_scheduled_messages sm
      INNER JOIN conversations c
        ON c.id::text = sm.conversation_id::text
      INNER JOIN whatsapp_connections wc
        ON wc.id::text = c.connection_id::text
       AND wc.user_id::text = sm.user_id::text
      WHERE sm.status = 'scheduled'
        AND sm.conversation_id IS NOT NULL
        AND sm.user_id IS NOT NULL
        AND NULLIF(BTRIM(sm.text), '') IS NOT NULL
        AND sm.scheduled_for <= (NOW() AT TIME ZONE 'America/Sao_Paulo')
        AND sm.scheduled_for >= (NOW() AT TIME ZONE 'America/Sao_Paulo') - (${maxOverdueMinutes}::int * interval '1 minute')
        AND (
          COALESCE(wc.is_connected, false) = true
          OR LOWER(COALESCE(wc.provider_status, '')) IN ('connected', 'open')
        )
        AND COALESCE(c.jid_suffix, 's.whatsapp.net') <> 'g.us'
        AND COALESCE(c.remote_jid, '') NOT LIKE '%@g.us'
        AND NOT (
          regexp_replace(COALESCE(c.contact_number, ''), '\\D', '', 'g') LIKE '120363%'
          AND length(regexp_replace(COALESCE(c.contact_number, ''), '\\D', '', 'g')) >= 15
        )
      ORDER BY sm.scheduled_for ASC, sm.created_at ASC
      LIMIT ${batchLimit}
      FOR UPDATE OF sm SKIP LOCKED
    )
    UPDATE conversation_scheduled_messages sm
    SET status = 'processing',
        executed_at = NOW(),
        error_reason = NULL
    FROM due
    WHERE sm.id = due.id
    RETURNING
      sm.id,
      sm.user_id,
      sm.conversation_id,
      sm.contact_number,
      sm.text,
      sm.use_ai,
      sm.scheduled_for
  `);

  return (result.rows || []) as ClaimedScheduledMessageRow[];
}

async function markScheduledMessageSent(id: string): Promise<void> {
  await db.execute(sql`
    UPDATE conversation_scheduled_messages
    SET status = 'sent',
        executed_at = NOW(),
        error_reason = NULL
    WHERE id = ${id}
  `);
}

async function markScheduledMessageFailed(id: string, reason: string): Promise<void> {
  await db.execute(sql`
    UPDATE conversation_scheduled_messages
    SET status = 'failed',
        executed_at = NOW(),
        error_reason = ${reason}
    WHERE id = ${id}
  `);
}

async function buildFinalScheduledMessageText(row: ClaimedScheduledMessageRow): Promise<string> {
  const user = await storage.getUser(row.user_id);
  const signatureName = resolveManualMessageSignatureName({
    isMember: false,
    ownerSignature: user?.signature,
    ownerSignatureEnabled: user?.signatureEnabled,
  });

  return prependWhatsappSignature(row.text, signatureName);
}

export class ConversationScheduledMessageService {
  private interval: NodeJS.Timeout | null = null;
  private processing = false;

  start() {
    if (this.interval) return;

    this.interval = setInterval(() => {
      void this.runCycleOnce();
    }, DEFAULT_INTERVAL_MS);

    setTimeout(() => {
      void this.runCycleOnce();
    }, DEFAULT_INTERVAL_MS);

    console.log("[CONVERSATION-SCHEDULED-MESSAGES] Servico iniciado");
  }

  stop() {
    if (!this.interval) return;

    clearInterval(this.interval);
    this.interval = null;
    console.log("[CONVERSATION-SCHEDULED-MESSAGES] Servico parado");
  }

  async runCycleOnce(
    overrides: Partial<ConversationScheduledMessageCronConfig> = {},
  ): Promise<ConversationScheduledMessageRunResult> {
    void CONVERSATION_SCHEDULED_MESSAGES_STATEFUL_MARKER;

    if (this.processing) {
      return {
        accepted: false,
        claimed: 0,
        sent: 0,
        failed: 0,
        expired: 0,
        recovered: 0,
        skipped: "cycle_already_running",
      };
    }

    this.processing = true;
    const config = {
      ...resolveConversationScheduledMessageCronConfig(),
      ...overrides,
    };

    let sent = 0;
    let failed = 0;

    try {
      const expired = await expireStaleScheduledMessages(config.maxOverdueMinutes);
      const recovered = await recoverStuckProcessingMessages(config.stuckProcessingMinutes);
      const rows = await claimDueScheduledMessages(config.batchLimit, config.maxOverdueMinutes);

      for (const row of rows) {
        try {
          const finalText = await buildFinalScheduledMessageText(row);
          const sendResult = await whatsappSendMessage(row.user_id, row.conversation_id, finalText, {
            source: "owner",
            validateDestination: true,
            acceptQueued: true,
          });

          if (!sendResult.success) {
            failed += 1;
            await markScheduledMessageFailed(row.id, sendResult.reason || "Envio bloqueado");
            continue;
          }

          sent += 1;
          await markScheduledMessageSent(row.id);
        } catch (error) {
          failed += 1;
          await markScheduledMessageFailed(row.id, normalizeErrorReason(error));
        }
      }

      if (rows.length || sent || failed || expired || recovered) {
        console.log(
          `[CONVERSATION-SCHEDULED-MESSAGES] claimed=${rows.length} sent=${sent} failed=${failed} expired=${expired} recovered=${recovered}`,
        );
      }

      return {
        accepted: true,
        claimed: rows.length,
        sent,
        failed,
        expired,
        recovered,
      };
    } catch (error) {
      console.error("[CONVERSATION-SCHEDULED-MESSAGES] Falha no ciclo:", error);
      return {
        accepted: false,
        claimed: 0,
        sent,
        failed,
        expired: 0,
        recovered: 0,
        skipped: normalizeErrorReason(error),
      };
    } finally {
      this.processing = false;
    }
  }
}

export const conversationScheduledMessageService = new ConversationScheduledMessageService();
