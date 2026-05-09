import assert from "node:assert/strict";
import {
  buildPromptEditAssistantFeedback,
  buildPromptEditCalibrationMessage,
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
    editQuotaMessage: "4 créditos restantes hoje.",
  }),
  "Mudanças aplicadas.\n\nCalibração: Score 61/100 (1 edições)\n\n4 créditos restantes hoje.",
);

assert.equal(
  buildPromptEditAssistantFeedback({
    baseMessage: "Mudanças aplicadas.",
    calibrationFallbackMessage: "Validação automática pendente.",
  }),
  "Mudanças aplicadas.\n\nValidação automática pendente.",
);
