import assert from "node:assert/strict";

async function main() {
  process.env.DATABASE_URL ||= "postgresql://localhost/dummy";
  process.env.ENABLE_RUNTIME_AUTO_MIGRATIONS ||= "0";

  const { PromptCalibrationService } = await import("../promptCalibrationService");
  let capturedHistoryText = "";
  let capturedScenarioId = "";
  let capturedResetState = false;

  const service = new PromptCalibrationService({
    numeroCenarios: 1,
    maxTentativasReparo: 0,
    turnosConversaMax: 1,
    scoreMinimoAprovacao: 70,
    timeoutMs: 10_000,
    simulatorHistory: [
      { role: "user", content: "Ola, como voce funciona?" },
      { role: "assistant", content: "Posso te explicar em etapas." },
    ],
    runtimeSimulator: async ({ history, scenarioId, resetState }) => {
      capturedHistoryText = history.map((message) => message.content).join("\n");
      capturedScenarioId = scenarioId || "";
      capturedResetState = resetState === true;
      const hasStageContext = capturedHistoryText.includes("segunda etapa antes do link final");
      return {
        response: hasStageContext
          ? "Claro, agora na terceira etapa voce pode acessar agentezap.online para criar a conta."
          : "Antes disso me conta melhor o seu negocio.",
      };
    },
  });

  const result = await service.calibrarPrompt(
    "Atenda o cliente em etapas e envie o link quando chegar na etapa correta.",
    "Depois que o cliente estiver na terceira etapa do funil, envie o link agentezap.online.",
  );

  assert.equal(result.sucesso, true, "calibration should pass when scenario stage context is appended");
  assert.equal(result.cenariosAprovados, 1);
  assert.match(
    capturedHistoryText,
    /Ola, como voce funciona\?[\s\S]*segunda etapa antes do link final/,
    "calibration must preserve simulator history and append the deterministic stage context",
  );
  assert.equal(capturedScenarioId, "fluxo_etapa_3_link");
  assert.equal(capturedResetState, true);

  const mediaActionService = new PromptCalibrationService({
    numeroCenarios: 1,
    maxTentativasReparo: 0,
    turnosConversaMax: 1,
    scoreMinimoAprovacao: 70,
    timeoutMs: 10_000,
    runtimeSimulator: async () => ({
      response: "",
      splitResponses: [],
      mediaActions: [
        {
          type: "send_media_url",
          media_url: "https://agentezap.online/cadastro",
        },
      ],
    }),
  });

  const mediaActionResult = await mediaActionService.calibrarPrompt(
    "Envie a midia correta quando o cliente pedir o link.",
    "Quando o cliente pedir o link, envie agentezap.online.",
  );

  assert.equal(
    mediaActionResult.sucesso,
    true,
    "calibration should read links from structured media actions, not only text responses",
  );
}

main()
  .then(() => {
    console.log("promptCalibrationStageHistory.test.ts: ok");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
