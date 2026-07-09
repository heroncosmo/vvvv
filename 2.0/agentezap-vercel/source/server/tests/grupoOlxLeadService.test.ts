import assert from "node:assert/strict";

import type { GrupoOlxIntegration } from "@shared/schema";
import {
  buildGrupoOlxSyntheticMessage,
  inferGrupoOlxPortalSource,
  isGrupoOlxRecoverableSendError,
  normalizeGrupoOlxLeadPayload,
  processGrupoOlxLeadCandidate,
  renderGrupoOlxAutoReply,
  type GrupoOlxNormalizedLead,
} from "../grupoOlxLeadService";

const integration: GrupoOlxIntegration = {
  id: "integration-1",
  userId: "user-1",
  status: "active",
  token: "token-1",
  connectionId: "connection-1",
  createDealEnabled: true,
  funnelId: "funnel-1",
  stageId: "stage-1",
  aiVariation: "consultivo",
  autoReplyTemplate:
    "Ola {{nome}}, recebemos seu interesse no imovel {{imovel_titulo}} pelo {{portal}} em {{cidade}}. Bairro: {{bairro}}. Mensagem: {{mensagem}}",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const normalizedLead = normalizeGrupoOlxLeadPayload({
  originLeadId: "lead-123",
  clientListingId: "listing-77",
  leadOrigin: "Grupo OLX",
  extraData: { leadType: "click_whatsapp" },
  contact: {
    name: "Maria Souza",
    email: "maria@example.com",
  },
  customer: {
    phones: [{ number: "+55 (11) 99999-8888" }],
  },
  listing: {
    title: "Apartamento com varanda",
    url: "https://www.vivareal.com.br/imovel/123",
    city: "Sao Paulo",
    neighborhood: "Moema",
  },
  message: "Quero saber se ainda esta disponivel",
});

assert.equal(normalizedLead.originLeadId, "lead-123");
assert.equal(normalizedLead.clientListingId, "listing-77");
assert.equal(normalizedLead.portalSource, "Viva Real");
assert.equal(normalizedLead.leadType, "CLICK_WHATSAPP");
assert.equal(normalizedLead.phone, "5511999998888");
assert.equal(normalizedLead.email, "maria@example.com");
assert.equal(normalizedLead.city, "Sao Paulo");

const emailLeadWithLocalPhone = normalizeGrupoOlxLeadPayload({
  originLeadId: "lead-local-phone",
  contactPhone: "17991956944",
});

assert.equal(emailLeadWithLocalPhone.phone, "5517991956944");

assert.equal(inferGrupoOlxPortalSource({ leadOrigin: "desconhecido" }), "Grupo OLX");

const renderedReply = renderGrupoOlxAutoReply(integration.autoReplyTemplate || "", normalizedLead);
assert.match(renderedReply, /Maria Souza/);
assert.match(renderedReply, /Apartamento com varanda/);
assert.match(renderedReply, /Viva Real/);
assert.match(renderedReply, /Moema/);
assert.match(renderedReply, /Quero saber se ainda esta disponivel/);

const renderedReplyWithCodeOnly = renderGrupoOlxAutoReply(integration.autoReplyTemplate || "", {
  ...normalizedLead,
  listingTitle: null,
  clientListingId: "RP22864",
});
assert.match(renderedReplyWithCodeOnly, /imovel codigo RP22864 pelo Viva Real/);
assert.doesNotMatch(renderedReplyWithCodeOnly, /imovel\s+pelo/);

const renderedReplyWithoutListing = renderGrupoOlxAutoReply(integration.autoReplyTemplate || "", {
  ...normalizedLead,
  listingTitle: null,
  clientListingId: null,
});
assert.match(renderedReplyWithoutListing, /imovel que voce viu pelo Viva Real/);
assert.doesNotMatch(renderedReplyWithoutListing, /imovel\s+pelo/);

const syntheticMessage = buildGrupoOlxSyntheticMessage(normalizedLead);
assert.match(syntheticMessage, /Lead recebido via Viva Real/);
assert.match(syntheticMessage, /Codigo do imovel: listing-77/);

const duplicateResult = await processGrupoOlxLeadCandidate(
  normalizedLead,
  { integration, autoReplyTemplate: integration.autoReplyTemplate || "" },
  {
    createLeadEvent: async () => ({ kind: "duplicate", event: { id: "evt-dup", status: "processed" } }),
    updateLeadEvent: async () => undefined,
    createDeal: async () => {
      throw new Error("should not create deal for duplicate");
    },
    ensureConversation: async () => {
      throw new Error("should not create conversation for duplicate");
    },
    createSyntheticMessage: async () => undefined,
    ensureTags: async () => undefined,
    sendAutoReply: async () => undefined,
  },
);

assert.equal(duplicateResult.status, "duplicate");
assert.equal(duplicateResult.eventId, "evt-dup");

const noPhoneLead: GrupoOlxNormalizedLead = {
  ...normalizedLead,
  originLeadId: "lead-no-phone",
  phone: null,
};

let missingPhoneStatus = "";
const missingPhoneResult = await processGrupoOlxLeadCandidate(
  noPhoneLead,
  { integration, autoReplyTemplate: integration.autoReplyTemplate || "" },
  {
    createLeadEvent: async () => ({ kind: "created", event: { id: "evt-missing", status: "received" } }),
    updateLeadEvent: async (_eventId, patch) => {
      missingPhoneStatus = patch.status || "";
    },
    createDeal: async (_lead, conversationId) => {
      assert.equal(conversationId, null);
      return "deal-no-phone";
    },
    ensureConversation: async () => {
      throw new Error("should not create conversation without phone");
    },
    createSyntheticMessage: async () => undefined,
    ensureTags: async () => undefined,
    sendAutoReply: async () => {
      throw new Error("should not send auto reply without phone");
    },
  },
);

assert.equal(missingPhoneResult.status, "missing_phone");
assert.equal(missingPhoneResult.dealId, "deal-no-phone");
assert.equal(missingPhoneStatus, "missing_phone");

let finalStatus = "";
let finalError = "";
const sendErrorResult = await processGrupoOlxLeadCandidate(
  { ...normalizedLead, originLeadId: "lead-send-error" },
  { integration, autoReplyTemplate: integration.autoReplyTemplate || "" },
  {
    createLeadEvent: async () => ({ kind: "created", event: { id: "evt-send", status: "received" } }),
    updateLeadEvent: async (_eventId, patch) => {
      finalStatus = patch.status || "";
      finalError = patch.errorMessage || "";
    },
    createDeal: async (_lead, conversationId) => {
      assert.equal(conversationId, "conversation-1");
      return "deal-send";
    },
    ensureConversation: async () => "conversation-1",
    createSyntheticMessage: async (conversationId) => {
      assert.equal(conversationId, "conversation-1");
    },
    ensureTags: async (conversationId) => {
      assert.equal(conversationId, "conversation-1");
    },
    sendAutoReply: async () => {
      throw new Error("socket offline");
    },
  },
);

assert.equal(sendErrorResult.status, "processed_with_send_error");
assert.equal(sendErrorResult.conversationId, "conversation-1");
assert.equal(sendErrorResult.dealId, "deal-send");
assert.equal(finalStatus, "processed_with_send_error");
assert.match(finalError, /socket offline/);

let retryStatus = "";
let retryAt: Date | null = null;
const retryResult = await processGrupoOlxLeadCandidate(
  { ...normalizedLead, originLeadId: "lead-retry" },
  { integration, autoReplyTemplate: integration.autoReplyTemplate || "" },
  {
    createLeadEvent: async () => ({ kind: "created", event: { id: "evt-retry", status: "received" } }),
    updateLeadEvent: async (_eventId, patch) => {
      retryStatus = patch.status || "";
      retryAt = patch.nextRetryAt || null;
    },
    createDeal: async () => "deal-retry",
    ensureConversation: async () => "conversation-retry",
    createSyntheticMessage: async () => undefined,
    ensureTags: async () => undefined,
    sendAutoReply: async () => {
      throw new Error("WhatsApp not connected");
    },
    scheduleRetry: async ({ error }) => {
      assert.equal(isGrupoOlxRecoverableSendError(error), true);
      return {
        nextRetryAt: new Date("2026-03-13T12:00:00.000Z"),
        retryCount: 0,
      };
    },
  },
);

assert.equal(retryResult.status, "pending_retry");
assert.equal(retryStatus, "pending_retry");
assert.equal(retryAt?.toISOString(), "2026-03-13T12:00:00.000Z");
assert.equal(isGrupoOlxRecoverableSendError(new Error("socket offline")), true);
assert.equal(isGrupoOlxRecoverableSendError(new Error("template vazio")), false);

const integrationWithoutCrm: GrupoOlxIntegration = {
  ...integration,
  id: "integration-2",
  createDealEnabled: false,
  funnelId: null,
  stageId: null,
};

let dealCreated = false;
const noCrmResult = await processGrupoOlxLeadCandidate(
  { ...normalizedLead, originLeadId: "lead-no-crm" },
  { integration: integrationWithoutCrm, autoReplyTemplate: integration.autoReplyTemplate || "" },
  {
    createLeadEvent: async () => ({ kind: "created", event: { id: "evt-no-crm", status: "received" } }),
    updateLeadEvent: async () => undefined,
    createDeal: async () => {
      dealCreated = true;
      return "deal-should-not-happen";
    },
    ensureConversation: async () => "conversation-2",
    createSyntheticMessage: async () => undefined,
    ensureTags: async () => undefined,
    sendAutoReply: async () => undefined,
  },
);

assert.equal(noCrmResult.status, "processed");
assert.equal(noCrmResult.dealId, null);
assert.equal(dealCreated, false);

console.log("grupoOlxLeadService.test.ts ok");
