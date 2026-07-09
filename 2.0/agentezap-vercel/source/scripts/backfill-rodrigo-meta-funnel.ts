import dotenv from "dotenv";
import { sql } from "drizzle-orm";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env", override: true });

let db: { execute: (query: unknown) => Promise<unknown> };
let closeDbPool: (() => Promise<void>) | null = null;
let recordRodrigoWhatsappLowQualityLeadLabelFromConversation: typeof import("../server/rodrigoMetaFunnelService").recordRodrigoWhatsappLowQualityLeadLabelFromConversation;
let recordRodrigoWhatsappPurchaseFromSubscription: typeof import("../server/rodrigoMetaFunnelService").recordRodrigoWhatsappPurchaseFromSubscription;
let recordRodrigoWhatsappQualifiedLeadFromConversation: typeof import("../server/rodrigoMetaFunnelService").recordRodrigoWhatsappQualifiedLeadFromConversation;
let shouldSendRodrigoQualifiedLeadEvent: typeof import("../server/rodrigoMetaFunnelService").shouldSendRodrigoQualifiedLeadEvent;

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const hoursArg = process.argv.find((arg) => arg.startsWith("--hours="));
const hours = Math.max(1, Math.min(168, Number(hoursArg?.split("=")[1] || 72)));

type LeadRow = {
  conversation_id: string;
  contact_last4: string | null;
  is_potential: boolean;
  potential_score: number;
  potential_grade: string | null;
  business_type: string | null;
};

type SubscriptionRow = {
  subscription_id: string;
  amount: string | number | null;
  payment_id: string | null;
};

function moneyToNumber(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadWhatsappAdLeads(): Promise<LeadRow[]> {
  const result = await db.execute(sql`
    WITH owner AS (
      SELECT id FROM users WHERE lower(email) = lower('rodrigo4@gmail.com') LIMIT 1
    ), owner_connections AS (
      SELECT id FROM whatsapp_connections WHERE user_id = (SELECT id FROM owner)
    )
    SELECT
      c.id AS conversation_id,
      right(regexp_replace(coalesce(c.contact_number, ''), '\\D', '', 'g'), 4) AS contact_last4,
      cli.is_potential,
      cli.potential_score,
      cli.potential_grade,
      cli.business_type
    FROM conversations c
    JOIN conversation_lead_intelligence cli ON cli.conversation_id = c.id
    WHERE c.connection_id IN (SELECT id FROM owner_connections)
      AND COALESCE(c.last_message_time, c.created_at) >= (now() - (${hours}::int * interval '1 hour'))
      AND NULLIF(COALESCE(
        cli.raw_analysis->'whatsappAdsAttribution'->>'ctwaClid',
        cli.raw_analysis->'whatsappAdsAttribution'->>'ctwa_clid'
      ), '') IS NOT NULL
    ORDER BY COALESCE(c.last_message_time, c.created_at) DESC
  `);
  return (((result as any)?.rows || []) as LeadRow[]).map((row) => ({
    ...row,
    is_potential: Boolean(row.is_potential),
    potential_score: Number(row.potential_score || 0),
  }));
}

async function loadActiveSubscriptions(): Promise<SubscriptionRow[]> {
  const result = await db.execute(sql`
    WITH latest_payment AS (
      SELECT DISTINCT ON (subscription_id)
        id,
        subscription_id
      FROM payments
      ORDER BY subscription_id, created_at DESC
    )
    SELECT
      s.id AS subscription_id,
      COALESCE(s.coupon_price, p.valor) AS amount,
      lp.id AS payment_id
    FROM subscriptions s
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN latest_payment lp ON lp.subscription_id = s.id
    WHERE s.status = 'active'
      AND COALESCE(s.updated_at, s.created_at) >= (now() - (${hours}::int * interval '1 hour'))
      AND COALESCE(s.metadata->'rodrigoPaidLeadAttribution'->>'metaCapiStatus', '') <> 'sent'
    ORDER BY COALESCE(s.updated_at, s.created_at) DESC
  `);
  return (((result as any)?.rows || []) as SubscriptionRow[]);
}

async function main() {
  const dbModule = await import("../server/db");
  const funnelModule = await import("../server/rodrigoMetaFunnelService");
  db = dbModule.db;
  closeDbPool = dbModule.closeDbPool;
  recordRodrigoWhatsappLowQualityLeadLabelFromConversation =
    funnelModule.recordRodrigoWhatsappLowQualityLeadLabelFromConversation;
  recordRodrigoWhatsappPurchaseFromSubscription =
    funnelModule.recordRodrigoWhatsappPurchaseFromSubscription;
  recordRodrigoWhatsappQualifiedLeadFromConversation =
    funnelModule.recordRodrigoWhatsappQualifiedLeadFromConversation;
  shouldSendRodrigoQualifiedLeadEvent = funnelModule.shouldSendRodrigoQualifiedLeadEvent;

  console.log(`[Rodrigo Meta Funnel] modo=${apply ? "apply" : "dry-run"} janela=${hours}h`);

  const leads = await loadWhatsappAdLeads();
  let leadSubmitted = 0;
  let lowQualityLabeled = 0;
  for (const lead of leads) {
    const qualified = shouldSendRodrigoQualifiedLeadEvent({
      isPotential: lead.is_potential,
      potentialScore: lead.potential_score,
      potentialGrade: lead.potential_grade,
    });

    console.log(
      `[Lead] ${lead.conversation_id} last4=${lead.contact_last4 || "----"} score=${lead.potential_score} grade=${lead.potential_grade || ""} action=${qualified ? "LeadSubmitted" : "local-low-quality-label"}`,
    );

    if (!apply) continue;
    if (qualified) {
      const result = await recordRodrigoWhatsappQualifiedLeadFromConversation({
        conversationId: lead.conversation_id,
        isPotential: lead.is_potential,
        potentialScore: lead.potential_score,
        potentialGrade: lead.potential_grade,
        businessType: lead.business_type,
      });
      if (result.recorded) leadSubmitted++;
      console.log(`[Lead] result=${result.recorded ? "recorded" : result.skipped}`);
    } else {
      const result = await recordRodrigoWhatsappLowQualityLeadLabelFromConversation({
        conversationId: lead.conversation_id,
        isPotential: lead.is_potential,
        potentialScore: lead.potential_score,
        potentialGrade: lead.potential_grade,
        businessType: lead.business_type,
      });
      if (result.recorded) lowQualityLabeled++;
      console.log(`[Lead] result=${result.recorded ? "recorded" : result.skipped}`);
    }
  }

  const subscriptions = await loadActiveSubscriptions();
  let purchases = 0;
  for (const subscription of subscriptions) {
    console.log(`[Purchase] ${subscription.subscription_id} action=Purchase`);
    if (!apply) continue;
    const result = await recordRodrigoWhatsappPurchaseFromSubscription({
      subscriptionId: subscription.subscription_id,
      value: moneyToNumber(subscription.amount),
      paymentId: subscription.payment_id,
    });
    if (result.recorded) purchases++;
    console.log(`[Purchase] result=${result.recorded ? "recorded" : result.skipped}`);
  }

  console.log(
    `[Rodrigo Meta Funnel] concluido leads=${leads.length} leadSubmitted=${leadSubmitted} lowQualityLabels=${lowQualityLabeled} subscriptionsChecked=${subscriptions.length} purchases=${purchases}`,
  );
}

main()
  .catch((error) => {
    console.error("[Rodrigo Meta Funnel] falha:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbPool?.().catch(() => undefined);
  });
