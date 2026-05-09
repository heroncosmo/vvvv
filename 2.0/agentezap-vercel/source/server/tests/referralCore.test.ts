import assert from "node:assert/strict";

import {
  buildReferralCode,
  buildReferralOutreachFallbackMessage,
  buildShareUrl,
  OFFICIAL_WHATSAPP,
  parseFlexibleMoney,
} from "../referralCore";

function testBuildReferralCode() {
  const code = buildReferralCode("Joao da Silva", "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(code, "joao-da-silva-123e4567");
}

function testBuildShareUrl() {
  const url = buildShareUrl("abc-123", "https://app.agentezap.com/");
  assert.equal(url, "https://app.agentezap.com/?ref=abc-123");
}

function testFallbackRespectsSameDayConversation() {
  const message = buildReferralOutreachFallbackMessage({
    contactName: "Carlos",
    shareUrl: "https://app.agentezap.com/?ref=abc-123",
    recentMessages: [
      {
        fromMe: false,
        text: "manda o link",
        timestamp: new Date().toISOString(),
      },
    ],
  });

  assert.ok(message.startsWith("Seguindo o que te falei"));
  assert.ok(message.includes(OFFICIAL_WHATSAPP));
  assert.ok(message.includes("https://app.agentezap.com/?ref=abc-123"));
}

function testFallbackGreetsWhenNoSameDayConversation() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const message = buildReferralOutreachFallbackMessage({
    contactName: "Marina",
    shareUrl: "https://app.agentezap.com/?ref=marina-01",
    recentMessages: [{ fromMe: false, text: "oi", timestamp: yesterday }],
  });

  assert.ok(message.startsWith("Oi Marina"));
}

function testParseFlexibleMoneySupportsBrazilianFormat() {
  assert.equal(parseFlexibleMoney("50,00"), 50);
  assert.equal(parseFlexibleMoney("1.250,75"), 1250.75);
  assert.equal(parseFlexibleMoney("R$ 99,90"), 99.9);
}

testBuildReferralCode();
testBuildShareUrl();
testFallbackRespectsSameDayConversation();
testFallbackGreetsWhenNoSameDayConversation();
testParseFlexibleMoneySupportsBrazilianFormat();

console.log("referralCore.test.ts ok");
