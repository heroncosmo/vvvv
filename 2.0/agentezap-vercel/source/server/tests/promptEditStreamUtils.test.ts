import assert from "node:assert/strict";
import {
  buildPromptEditAssistantFeedback,
  buildPromptEditCalibrationMessage,
  isPromptEditFreeQuotaNotice,
  stripPromptEditFreeQuotaNoticeForPaidUser,
} from "../promptEditStreamUtils";

assert.equal(
  buildPromptEditCalibrationMessage({
    sucesso: true,
    scoreGeral: 88,
    edicoesAplicadas: 2,
  }),
  "\n\nValidação: Score 88/100 (2 edições)",
);

assert.equal(
  buildPromptEditCalibrationMessage(null, "Validação automática pendente."),
  "\n\nValidação automática pendente.",
);

assert.equal(
  buildPromptEditAssistantFeedback({
    baseMessage: "Mudanças aplicadas.",
    calibrationResult: {
      sucesso: false,
      scoreGeral: 61,
      edicoesAplicadas: 1,
    },
  }),
  "Mudanças aplicadas.\n\nCalibração: Score 61/100 (1 edições)",
);

assert.equal(
  buildPromptEditAssistantFeedback({
    baseMessage: "Mudanças aplicadas.",
    calibrationFallbackMessage: "Validação automática pendente.",
  }),
  "Mudanças aplicadas.\n\nValidação automática pendente.",
);

assert.equal(
  isPromptEditFreeQuotaNotice("3 créditos restantes hoje. No gratuito são 5 alterações por dia."),
  true,
);

assert.equal(
  isPromptEditFreeQuotaNotice("Ok, a primeira mensagem será atualizada conforme solicitado."),
  false,
);

assert.equal(
  stripPromptEditFreeQuotaNoticeForPaidUser(
    "Ok, a primeira mensagem será atualizada conforme solicitado.\n\n3 créditos restantes hoje. No gratuito são 5 alterações por dia.",
  ),
  "Ok, a primeira mensagem será atualizada conforme solicitado.",
);
