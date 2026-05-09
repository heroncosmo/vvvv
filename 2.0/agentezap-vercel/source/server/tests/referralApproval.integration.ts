import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, closeDbPool } from "../db";
import {
  plans,
  referralAttributions,
  referralEvents,
  referralLinks,
  referralProfiles,
  referralWalletLedger,
  subscriptions,
  users,
} from "@shared/schema";
import {
  captureReferralAttribution,
  createManualReferralAttribution,
  ensureReferralProfile,
  processReferralCreditForApprovedSubscription,
} from "../referralService";

async function countCredits(subscriptionId: string) {
  const items = await db
    .select()
    .from(referralWalletLedger)
    .where(eq(referralWalletLedger.subscriptionId, subscriptionId));

  return items.filter((item) => item.entryType === "commission_credit");
}

async function countEvents(subscriptionId: string) {
  const items = await db
    .select()
    .from(referralEvents)
    .where(eq(referralEvents.subscriptionId, subscriptionId));

  return items.filter((item) => item.eventType === "first_paid_subscription");
}

async function cleanup(params: {
  referrerUserId?: string;
  referredUserId?: string;
  manualUserId?: string;
  subscriptionId?: string;
  manualSubscriptionId?: string;
  profileId?: string;
  attributionId?: string;
  manualAttributionId?: string;
}) {
  if (params.subscriptionId) {
    await db.delete(referralWalletLedger).where(eq(referralWalletLedger.subscriptionId, params.subscriptionId));
    await db.delete(referralEvents).where(eq(referralEvents.subscriptionId, params.subscriptionId));
    await db.delete(subscriptions).where(eq(subscriptions.id, params.subscriptionId));
  }

  if (params.manualSubscriptionId) {
    await db.delete(referralWalletLedger).where(eq(referralWalletLedger.subscriptionId, params.manualSubscriptionId));
    await db.delete(referralEvents).where(eq(referralEvents.subscriptionId, params.manualSubscriptionId));
    await db.delete(subscriptions).where(eq(subscriptions.id, params.manualSubscriptionId));
  }

  if (params.attributionId) {
    await db.delete(referralAttributions).where(eq(referralAttributions.id, params.attributionId));
  }

  if (params.manualAttributionId) {
    await db.delete(referralAttributions).where(eq(referralAttributions.id, params.manualAttributionId));
  }

  if (params.profileId) {
    await db.delete(referralLinks).where(eq(referralLinks.profileId, params.profileId));
    await db.delete(referralProfiles).where(eq(referralProfiles.id, params.profileId));
  }

  if (params.referredUserId) {
    await db.delete(users).where(eq(users.id, params.referredUserId));
  }

  if (params.manualUserId) {
    await db.delete(users).where(eq(users.id, params.manualUserId));
  }

  if (params.referrerUserId) {
    await db.delete(users).where(eq(users.id, params.referrerUserId));
  }
}

async function main() {
    const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const referrerEmail = `referrer-${tag}@teste.local`;
    const referredEmail = `referred-${tag}@teste.local`;
    const manualEmail = `manual-${tag}@teste.local`;
    const manualPhone = `55173${tag.replace(/\D/g, "").slice(-8).padStart(8, "3")}`;

  const state: {
    referrerUserId?: string;
    referredUserId?: string;
    manualUserId?: string;
    manualSubscriptionId?: string;
    subscriptionId?: string;
    profileId?: string;
    attributionId?: string;
    manualAttributionId?: string;
  } = {};

  try {
    // O projeto garante a estrutura de referral em background alguns segundos após subir o pool.
    await new Promise((resolve) => setTimeout(resolve, 7000));

    const [plan] = await db
      .select({ id: plans.id, valor: plans.valor, nome: plans.nome })
      .from(plans)
      .where(eq(plans.ativo, true))
      .limit(1);

    assert.ok(plan, "Nenhum plano ativo encontrado para o teste de referral");

    const [referrer] = await db
      .insert(users)
      .values({
        email: referrerEmail,
        name: `Referrer Teste ${tag}`,
        phone: `55179${tag.replace(/\D/g, "").slice(-8).padStart(8, "1")}`,
        role: "user",
      })
      .returning();
    state.referrerUserId = referrer.id;

    const [referred] = await db
      .insert(users)
      .values({
        email: referredEmail,
        name: `Referred Teste ${tag}`,
        phone: `55178${tag.replace(/\D/g, "").slice(-8).padStart(8, "2")}`,
        role: "user",
      })
      .returning();
    state.referredUserId = referred.id;

    const { profile } = await ensureReferralProfile(referrer.id);
    state.profileId = profile.id;

    const attribution = await captureReferralAttribution({
      referralCode: profile.referralCode,
      referredUserId: referred.id,
      referredEmail: referred.email,
      referredPhone: referred.phone,
      sourceChannel: "integration_test_signup",
      sourceUrl: "/cadastro",
    });

    assert.ok(attribution, "A atribuicao da indicacao deveria ser criada");
    state.attributionId = attribution?.id;

    const [pendingSubscription] = await db
      .insert(subscriptions)
      .values({
        userId: referred.id,
        planId: plan.id,
        status: "pending",
        pendingReceipt: true,
        referralCode: profile.referralCode,
      })
      .returning();
    state.subscriptionId = pendingSubscription.id;

    const creditsAfterSignup = await countCredits(pendingSubscription.id);
    const eventsAfterSignup = await countEvents(pendingSubscription.id);
    assert.equal(creditsAfterSignup.length, 0, "Nao pode gerar credito so por criar conta");
    assert.equal(eventsAfterSignup.length, 0, "Nao pode gerar evento de referral so por criar conta");

    const pendingResult = await processReferralCreditForApprovedSubscription({
      subscriptionId: pendingSubscription.id,
      amountPaid: Number(plan.valor || 99),
      source: "integration_test_pending",
    });
    assert.deepEqual(pendingResult, { credited: false, reason: "subscription_not_active" });

    const creditsWhilePending = await countCredits(pendingSubscription.id);
    const eventsWhilePending = await countEvents(pendingSubscription.id);
    assert.equal(creditsWhilePending.length, 0, "Assinatura pendente nao pode creditar referral");
    assert.equal(eventsWhilePending.length, 0, "Assinatura pendente nao pode gerar evento");

    await db
      .update(subscriptions)
      .set({
        status: "active",
        pendingReceipt: true,
        dataInicio: new Date(),
        dataFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .where(eq(subscriptions.id, pendingSubscription.id));

    const provisionalAccessResult = await processReferralCreditForApprovedSubscription({
      subscriptionId: pendingSubscription.id,
      amountPaid: Number(plan.valor || 99),
      source: "integration_test_pending_receipt",
    });
    assert.deepEqual(
      provisionalAccessResult,
      { credited: false, reason: "subscription_not_active" },
      "Acesso provisório com comprovante pendente nao pode gerar credito",
    );

    await db
      .update(subscriptions)
      .set({
        status: "active",
        pendingReceipt: false,
        dataInicio: new Date(),
        dataFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .where(eq(subscriptions.id, pendingSubscription.id));

    const unpaidActiveResult = await processReferralCreditForApprovedSubscription({
      subscriptionId: pendingSubscription.id,
      amountPaid: 0,
      source: "integration_test_unpaid_active",
    });
    assert.deepEqual(unpaidActiveResult, { credited: false, reason: "subscription_not_paid" });

    const creditsWithoutPayment = await countCredits(pendingSubscription.id);
    const eventsWithoutPayment = await countEvents(pendingSubscription.id);
    assert.equal(creditsWithoutPayment.length, 0, "Assinatura ativa sem pagamento nao pode creditar");
    assert.equal(eventsWithoutPayment.length, 0, "Assinatura ativa sem pagamento nao pode gerar evento");

    const approvedAmount = Number(plan.valor || 99);
    const approvedResult = await processReferralCreditForApprovedSubscription({
      subscriptionId: pendingSubscription.id,
      amountPaid: approvedAmount,
      source: "integration_test_paid",
    });

    assert.equal(approvedResult.credited, true, "A primeira assinatura paga deveria creditar a indicacao");
    assert.equal(approvedResult.amount, 50, "A comissao padrao do programa deveria ser R$50,00");

    const creditedEvents = await countEvents(pendingSubscription.id);
    const creditedLedger = await countCredits(pendingSubscription.id);
    assert.equal(creditedEvents.length, 1, "Deveria existir exatamente um evento de primeira assinatura paga");
    assert.equal(creditedLedger.length, 1, "Deveria existir exatamente um credito na wallet");
    assert.equal(Number(creditedLedger[0]?.amount || 0), 50, "A wallet deveria receber R$50,00");

    const convertedAttribution = await db.query.referralAttributions.findFirst({
      where: eq(referralAttributions.id, attribution.id),
    });
    assert.equal(convertedAttribution?.status, "converted", "A atribuicao deveria virar converted apos o pagamento");

    const creditedProfile = await db.query.referralProfiles.findFirst({
      where: eq(referralProfiles.id, profile.id),
    });
    assert.equal(Number(creditedProfile?.availableBalance || 0), 50, "O saldo disponivel deveria refletir o credito");
    assert.equal(Number(creditedProfile?.convertedReferrals || 0), 1, "A contagem de referrals convertidos deveria subir");

    const duplicateResult = await processReferralCreditForApprovedSubscription({
      subscriptionId: pendingSubscription.id,
      amountPaid: approvedAmount,
      source: "integration_test_duplicate",
    });
    assert.deepEqual(duplicateResult, { credited: false, reason: "duplicate" });

    const eventsAfterDuplicate = await countEvents(pendingSubscription.id);
    const ledgerAfterDuplicate = await countCredits(pendingSubscription.id);
    assert.equal(eventsAfterDuplicate.length, 1, "Nao pode duplicar evento quando o pagamento aprovado chega duas vezes");
    assert.equal(ledgerAfterDuplicate.length, 1, "Nao pode duplicar credito quando o pagamento aprovado chega duas vezes");

    const manualAttribution = await createManualReferralAttribution({
      userId: referrer.id,
      contactName: "Contato Manual Teste",
      contactPhone: manualPhone,
    });
    assert.ok(manualAttribution, "A indicacao manual por numero deveria ser criada");
    state.manualAttributionId = manualAttribution.id;

    const [manualUser] = await db
      .insert(users)
      .values({
        email: manualEmail,
        name: `Manual Teste ${tag}`,
        phone: manualPhone,
        role: "user",
      })
      .returning();
    state.manualUserId = manualUser.id;

    const reboundAttribution = await captureReferralAttribution({
      referralCode: profile.referralCode,
      referredUserId: manualUser.id,
      referredEmail: manualUser.email,
      referredPhone: manualUser.phone,
      sourceChannel: "integration_manual_phone_bind",
      sourceLabel: "Contato Manual Teste",
    });

    assert.equal(reboundAttribution?.id, manualAttribution.id, "A indicacao manual deve ser reaproveitada apos o cadastro");
    assert.equal(reboundAttribution?.referredUserId, manualUser.id, "A indicacao manual deve apontar para o usuario criado");

    const [manualSubscription] = await db
      .insert(subscriptions)
      .values({
        userId: manualUser.id,
        planId: plan.id,
        status: "active",
        pendingReceipt: false,
      })
      .returning();
    state.manualSubscriptionId = manualSubscription.id;

    const manualCreditResult = await processReferralCreditForApprovedSubscription({
      subscriptionId: manualSubscription.id,
      amountPaid: Number(plan.valor || 99),
      source: "integration_test_manual_phone_paid",
    });

    assert.equal(manualCreditResult.credited, true, "A indicacao manual deve gerar credito quando a primeira assinatura paga for aprovada");

    const manualCredits = await countCredits(manualSubscription.id);
    assert.equal(manualCredits.length, 1, "A indicacao manual deve gerar um unico credito");

    console.log("referralApproval.integration.ts ok");
  } finally {
    await cleanup(state);
    await closeDbPool();
  }
}

main().catch((error) => {
  console.error("referralApproval.integration.ts failed");
  console.error(error);
  process.exit(1);
});
