import assert from "node:assert/strict";
import {
  isAdminConversationFollowupManuallyPaused,
  isAdminConversationManuallyPaused,
  shouldAutoReactivateAdminAgent,
  shouldAutoRescheduleAdminFollowup,
} from "../adminConversationAutomationState";

const followupConversation = {
  followupActive: true,
  contextState: {},
};

assert.equal(
  shouldAutoReactivateAdminAgent({
    isAgentEnabled: false,
    globalAgentEnabled: true,
    conversation: followupConversation,
  }),
  true,
  "a IA deve voltar automaticamente em conversa com follow-up ativo quando não houver pausa manual",
);

assert.equal(
  shouldAutoReactivateAdminAgent({
    isAgentEnabled: false,
    globalAgentEnabled: false,
    conversation: followupConversation,
  }),
  false,
  "o toggle global desligado deve impedir resposta automática mesmo com follow-up ativo",
);

assert.equal(
  shouldAutoReactivateAdminAgent({
    isAgentEnabled: false,
    globalAgentEnabled: true,
    conversation: {
      followupActive: true,
      contextState: { manualAgentPause: true },
    },
  }),
  false,
  "a pausa manual por conversa deve prevalecer sobre a retomada automática da IA",
);

assert.equal(
  isAdminConversationManuallyPaused({ contextState: { manualAgentPause: true } }),
  true,
  "o helper de pausa manual da IA deve reconhecer a marcação",
);

assert.equal(
  isAdminConversationFollowupManuallyPaused({ contextState: { manualFollowupPause: true } }),
  true,
  "o helper de pausa manual do follow-up deve reconhecer a marcação",
);

assert.equal(
  shouldAutoRescheduleAdminFollowup({
    conversation: { contextState: { manualFollowupPause: true } },
    hasScheduledFollowup: false,
  }),
  false,
  "o follow-up pausado manualmente não pode ser religado por rotinas automáticas",
);

assert.equal(
  shouldAutoRescheduleAdminFollowup({
    conversation: { contextState: { manualFollowupPause: true } },
    allowManualResume: true,
    hasScheduledFollowup: false,
  }),
  true,
  "a retomada manual do follow-up deve ignorar a trava automática",
);

console.log("adminConversationAutomationState.test.ts ok");
