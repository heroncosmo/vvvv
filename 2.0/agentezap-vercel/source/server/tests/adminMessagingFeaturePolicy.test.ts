import test from "node:test";
import assert from "node:assert/strict";

import {
  isAdminAiSendingEnabled,
  isAdminFollowupEnabled,
  isAdminLiveAiEnabled,
  sanitizeAdminBroadcast,
  sanitizeAdminFollowupConfig,
  sanitizeAdminNotificationConfig,
  sanitizeAdminWhatsappConnection,
} from "../adminMessagingFeaturePolicy";

test("desativa IA do admin em qualquer configuração de notificação", () => {
  const sanitized = sanitizeAdminNotificationConfig({
    paymentReminderAiEnabled: true,
    payment_reminder_ai_enabled: true,
    overdueReminderAiEnabled: true,
    broadcastAiVariation: true,
    aiVariationEnabled: true,
    welcomeMessageAiEnabled: true,
    paymentReminderAiPrompt: "reescreva",
    aiVariationPrompt: "varie",
  });

  assert.equal(sanitized?.paymentReminderAiEnabled, false);
  assert.equal(sanitized?.payment_reminder_ai_enabled, false);
  assert.equal(sanitized?.overdueReminderAiEnabled, false);
  assert.equal(sanitized?.broadcastAiVariation, false);
  assert.equal(sanitized?.aiVariationEnabled, false);
  assert.equal(sanitized?.welcomeMessageAiEnabled, false);
  assert.equal(sanitized?.paymentReminderAiPrompt, "");
  assert.equal(sanitized?.aiVariationPrompt, "");
});

test("desativa follow-up global do admin mesmo quando vier habilitado", () => {
  const sanitized = sanitizeAdminFollowupConfig({
    enabled: true,
    isEnabled: true,
    followupNonPayersEnabled: true,
  });

  assert.equal(sanitized?.enabled, false);
  assert.equal(sanitized?.isEnabled, false);
  assert.equal(sanitized?.followupNonPayersEnabled, false);
});

test("desativa IA de broadcasts do admin", () => {
  const sanitized = sanitizeAdminBroadcast({
    aiVariation: true,
    ai_variation: true,
    antibotEnabled: true,
  });

  assert.equal(sanitized?.aiVariation, false);
  assert.equal(sanitized?.ai_variation, false);
  assert.equal(sanitized?.antibotEnabled, true);
});

test("desativa IA da conexao WhatsApp do admin", () => {
  const sanitized = sanitizeAdminWhatsappConnection({
    aiEnabled: true,
    ai_enabled: true,
    isConnected: true,
  });

  assert.equal(sanitized?.aiEnabled, false);
  assert.equal(sanitized?.ai_enabled, false);
  assert.equal(sanitized?.isConnected, true);
});

test("feature flags globais do admin ficam desligadas", () => {
  assert.equal(isAdminAiSendingEnabled(), false);
  assert.equal(isAdminLiveAiEnabled(), false);
  assert.equal(isAdminFollowupEnabled(), false);
});
