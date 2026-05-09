import assert from "node:assert/strict";

import {
  applyMediaExecutionAlignment,
  resolveMediaExecutionAlignment,
  shouldApplyHonestNoMediaFallback,
} from "../aiAgent";

const mediaLibrary = [
  {
    name: "ENVIO_EM_MASSA",
    mediaType: "video",
    whenToUse: "Quando o cliente perguntar sobre disparos e campanhas.",
    isActive: true,
  },
];

const rewriteExecutor = async () => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          hasImmediateDeliveryClaim: true,
          textShouldWaitForMedia: false,
          shouldRewriteWithoutMedia: true,
          rewrittenText: "Tem sim. Tenho videos de recursos especificos, como envio em massa. Se quiser, eu te explico essa parte agora.",
          reason: "nao_ha_envio_planejado",
        }),
      },
    },
  ],
});

const waitForMediaExecutor = async () => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          hasImmediateDeliveryClaim: true,
          textShouldWaitForMedia: true,
          shouldRewriteWithoutMedia: false,
          rewrittenText: null,
          reason: "texto_depende_do_envio_real",
        }),
      },
    },
  ],
});

const rewriteDecision = await resolveMediaExecutionAlignment({
  customerMessage: "Vc tem algum video mostrando como funciona?",
  assistantResponse: "Vou te enviar um video rapido mostrando como funciona.",
  mediaActions: [],
  mediaLibrary,
  llmExecutor: rewriteExecutor as any,
});

assert.equal(rewriteDecision.hasImmediateDeliveryClaim, true);
assert.equal(rewriteDecision.shouldRewriteWithoutMedia, true);
assert.equal(
  rewriteDecision.rewrittenText,
  "Tem sim. Tenho videos de recursos especificos, como envio em massa. Se quiser, eu te explico essa parte agora.",
);

const rewritten = applyMediaExecutionAlignment({
  responseText: "Vou te enviar um video rapido mostrando como funciona.",
  mediaActions: [],
  alignment: rewriteDecision,
});

assert.equal(
  rewritten.responseText,
  "Tem sim. Tenho videos de recursos especificos, como envio em massa. Se quiser, eu te explico essa parte agora.",
);
assert.deepEqual(rewritten.mediaActions, []);

const waitDecision = await resolveMediaExecutionAlignment({
  customerMessage: "Quero ver como funciona o envio em massa.",
  assistantResponse: "Aqui esta o video de envio em massa para voce assistir.",
  mediaActions: [{ type: "send_media", media_name: "ENVIO_EM_MASSA" }],
  mediaLibrary,
  llmExecutor: waitForMediaExecutor as any,
});

assert.equal(waitDecision.hasImmediateDeliveryClaim, true);
assert.equal(waitDecision.textShouldWaitForMedia, true);

const reordered = applyMediaExecutionAlignment({
  responseText: "Aqui esta o video de envio em massa para voce assistir.",
  mediaActions: [{ type: "send_media", media_name: "ENVIO_EM_MASSA" }],
  alignment: waitDecision,
});

assert.equal(reordered.responseText, null);
assert.deepEqual(reordered.mediaActions, [
  { type: "send_media", media_name: "ENVIO_EM_MASSA" },
  { type: "send_text", text: "Aqui esta o video de envio em massa para voce assistir." },
]);

assert.equal(
  shouldApplyHonestNoMediaFallback({
    shouldSemanticallyAlignTextWithoutMedia: true,
    mediaActionsCount: 0,
    responseText: "Claro, minha querida. A chave PIX e 123.",
    activeEstampariaProfile: false,
    alignmentDecision: {
      hasImmediateDeliveryClaim: false,
      shouldRewriteWithoutMedia: false,
    },
  }),
  false,
);

assert.equal(
  shouldApplyHonestNoMediaFallback({
    shouldSemanticallyAlignTextWithoutMedia: true,
    mediaActionsCount: 0,
    responseText: "Vou te mandar o video agora.",
    activeEstampariaProfile: false,
    alignmentDecision: {
      hasImmediateDeliveryClaim: true,
      shouldRewriteWithoutMedia: false,
    },
  }),
  true,
);

console.log("aiAgent.mediaExecutionAlignment.test.ts ok");
process.exit(0);
