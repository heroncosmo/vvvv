import test from "node:test";
import assert from "node:assert/strict";

const {
  buildRodrigoSubscriptionPhoneCandidates,
  buildRodrigoMetaFunnelEventKey,
  hasRodrigoMetaFunnelSubscriptionEvidence,
  isRodrigoMetaFunnelRecordLinkedToSubscription,
  normalizeRodrigoWhatsappAdsAttribution,
  shouldSendRodrigoQualifiedLeadEvent,
} = await import("../rodrigoMetaFunnelHelpers");
const { buildMetaConversionUserData } = await import("../metaConversionsApi");

test("normaliza atribuicao WhatsApp Ads em camelCase e snake_case", () => {
  assert.deepEqual(
    normalizeRodrigoWhatsappAdsAttribution({
      ctwa_clid: "clid_123",
      source_id: "120",
      source_type: "ad",
      headline: "Campanha",
    }),
    {
      ctwaClid: "clid_123",
      sourceId: "120",
      sourceUrl: null,
      sourceType: "ad",
      title: "Campanha",
      body: null,
      mediaType: null,
      thumbnailUrl: null,
      capturedAt: null,
      messageId: null,
    },
  );
});

test("gera chave de dedupe por evento e id", () => {
  assert.equal(
    buildRodrigoMetaFunnelEventKey("InitiateCheckout", "subscription:abc:initiate_checkout"),
    "InitiateCheckout:subscription:abc:initiate_checkout",
  );
});

test("lead de qualidade so dispara para potencial com score alto", () => {
  assert.equal(shouldSendRodrigoQualifiedLeadEvent({ isPotential: true, potentialScore: 80, potentialGrade: "alto" }), true);
  assert.equal(shouldSendRodrigoQualifiedLeadEvent({ isPotential: true, potentialScore: 79, potentialGrade: "alto" }), false);
  assert.equal(shouldSendRodrigoQualifiedLeadEvent({ isPotential: false, potentialScore: 95, potentialGrade: "alto" }), false);
  assert.equal(shouldSendRodrigoQualifiedLeadEvent({ isPotential: true, potentialScore: 95, potentialGrade: "descartar" }), false);
});

test("payload WhatsApp CTWA usa WABA sem forcar page_id", () => {
  const userData = buildMetaConversionUserData(
    {
      eventId: "lead:1",
      whatsappAdsAttribution: { ctwaClid: "ctwa_123" },
    },
    {
      enabled: true,
      pixelId: "826929079927046",
      accessToken: "token",
      graphVersion: "v25.0",
      testEventCode: "",
      whatsappBusinessAccountId: "1302657831548178",
      pageId: "662992643570860",
      defaultEventName: "LeadSubmitted",
      paidEventName: "Purchase",
      paidActionSource: "business_messaging",
      whatsappMessagingChannel: "whatsapp",
    },
  );

  assert.equal(userData.ctwa_clid, "ctwa_123");
  assert.equal(userData.whatsapp_business_account_id, "1302657831548178");
  assert.equal("page_id" in userData, false);
});

test("matching de assinatura inclui telefone de cadastro, pagamento e WhatsApp conectado do comprador", () => {
  const candidates = buildRodrigoSubscriptionPhoneCandidates({
    phone: "(17) 99111-2222",
    whatsappNumber: "5517992223333",
    metadata: {
      checkoutPhone: "17 99333-4444",
      ignoredInternalId: "sim-33d36098",
    },
    paymentRawResponse: {
      payer: {
        phone: {
          area_code: "31",
          number: "971445063",
        },
      },
    },
  }, ["sim-49cc61e1", "553171445063"]);

  assert.equal(candidates.includes("5517991112222"), true);
  assert.equal(candidates.includes("5517992223333"), true);
  assert.equal(candidates.includes("5517993334444"), true);
  assert.equal(candidates.includes("5531971445063"), true);
  assert.equal(candidates.includes("553171445063"), true);
  assert.equal(candidates.some((candidate) => candidate.includes("33d36098")), false);
  assert.equal(candidates.some((candidate) => candidate.includes("49cc61")), false);
});

test("evidencia estruturada de assinatura aceita customData e eventId legado", () => {
  assert.equal(
    isRodrigoMetaFunnelRecordLinkedToSubscription({
      subscriptionId: "sub_123",
      eventRecord: {
        eventId: "subscription:sub_999:initiate_checkout",
        customData: { subscription_id: "sub_123" },
      },
    }),
    true,
  );

  assert.equal(
    isRodrigoMetaFunnelRecordLinkedToSubscription({
      subscriptionId: "sub_123",
      eventRecord: { eventId: "subscription:sub_123:initiate_checkout" },
    }),
    true,
  );

  assert.equal(
    isRodrigoMetaFunnelRecordLinkedToSubscription({
      subscriptionId: "sub_123",
      eventKey: "LocalPixPendingLabel:subscription:sub_123:pix_pending_step_2",
      eventRecord: { eventId: "subscription:sub_123:pix_pending_step_2" },
    }),
    true,
  );

  assert.equal(
    isRodrigoMetaFunnelRecordLinkedToSubscription({
      subscriptionId: "sub_123",
      eventRecord: { eventId: "subscription:sub_999:paid" },
    }),
    false,
  );
});

test("rawAnalysis encontra assinatura dentro de metaCapiFunnelEvents", () => {
  assert.equal(
    hasRodrigoMetaFunnelSubscriptionEvidence({
      metaCapiFunnelEvents: {
        "Purchase:subscription:sub_999:paid": {
          status: "sent",
          eventName: "Purchase",
          eventId: "subscription:sub_999:paid",
        },
        "InitiateCheckout:subscription:sub_abc:initiate_checkout": {
          status: "sent",
          eventName: "InitiateCheckout",
          eventId: "subscription:sub_abc:initiate_checkout",
          customData: { subscription_id: "sub_abc" },
        },
      },
    }, "sub_abc"),
    true,
  );
});
