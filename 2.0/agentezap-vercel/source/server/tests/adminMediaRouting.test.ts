import test from "node:test";
import assert from "node:assert/strict";
import {
  alignReplyTextToSelectedMedia,
  extractSentAdminMediaNames,
  mediaActionsCoverDemoRequest,
  resolveAdminContextualMediaSelection,
} from "../adminMediaRouting";
import type { AdminMedia } from "../adminMediaStore";

const baseVideo: AdminMedia = {
  id: "media-1",
  adminId: "admin-1",
  name: "DETALHES_DO_SISTEMA",
  mediaType: "video",
  storageUrl: "https://cdn.example.com/cadastro.mp4",
  description: "Video do sistema",
  whenToUse: "Quando o cliente pedir video do sistema ou quiser ver como funciona",
  isActive: true,
  sendAlone: false,
  displayOrder: 10,
  createdAt: new Date().toISOString(),
};

const calibrationVideo: AdminMedia = {
  id: "media-2",
  adminId: "admin-1",
  name: "COMO_CALIBRAR_E_MELHORAR_O_AGENE_COMO_EDITAR_O_AGENTE_PARA_ATENDER",
  mediaType: "video",
  storageUrl: "https://cdn.example.com/calibracao.mp4",
  description: "Video para calibrar e editar o agente",
  whenToUse: "Quando o cliente perguntar como calibrar, treinar, editar ou melhorar o agente",
  isActive: true,
  sendAlone: false,
  displayOrder: 9,
  createdAt: new Date().toISOString(),
};

test("alignReplyTextToSelectedMedia corrige resposta que negava video existente", () => {
  const aligned = alignReplyTextToSelectedMedia(
    "Ainda nao temos um video demonstrativo, mas posso criar um teste pratico.",
    baseVideo,
  );

  assert.equal(aligned, "Vou te mandar um video do sistema para voce ver por dentro.");
});

test("extractSentAdminMediaNames detecta midia ja enviada pelo nome ou url", () => {
  const sent = extractSentAdminMediaNames(
    [
      {
        role: "assistant",
        content: "Segue DETALHES_DO_SISTEMA https://cdn.example.com/cadastro.mp4",
      },
      {
        role: "user",
        content: "vi aqui",
      },
    ],
    [baseVideo],
  );

  assert.deepEqual(sent, ["DETALHES_DO_SISTEMA"]);
});

test("resolveAdminContextualMediaSelection escolhe midia pronta via classificador semantico", async () => {
  const result = await resolveAdminContextualMediaSelection({
    messageText: "Teria um video do sistema?",
    replyText: "Ainda nao temos um video demonstrativo.",
    conversationHistory: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Como funciona depende do seu caso" },
    ],
    mediaLibrary: [baseVideo],
    classify: async () => ({
      shouldSend: true,
      mediaName: "DETALHES_DO_SISTEMA",
      confidence: 93,
      reason: "Cliente pediu video do sistema",
    }),
  });

  assert.equal(result.mediaAction?.media_name, "DETALHES_DO_SISTEMA");
  assert.equal(result.harmonizedText, "Vou te mandar um video do sistema para voce ver por dentro.");
});

test("mediaActionsCoverDemoRequest evita gerar demo quando video ja cobre o pedido", () => {
  const covered = mediaActionsCoverDemoRequest(
    { wantsScreenshot: false, wantsVideo: true },
    [{ mediaData: baseVideo }],
  );

  assert.equal(covered, true);
});

test("resolveAdminContextualMediaSelection usa fallback de metadata quando a LLM nao marcar midia", async () => {
  const result = await resolveAdminContextualMediaSelection({
    messageText: "Quero entender como calibra e edita o agente",
    replyText: "Me fala o nome do seu negocio primeiro.",
    conversationHistory: [{ role: "user", content: "Quero entender como calibra e edita o agente" }],
    mediaLibrary: [calibrationVideo],
    classify: async () => ({
      shouldSend: false,
      mediaName: null,
      confidence: 22,
      reason: "LLM nao marcou midia",
    }),
  });

  assert.equal(
    result.mediaAction?.media_name,
    "COMO_CALIBRAR_E_MELHORAR_O_AGENE_COMO_EDITAR_O_AGENTE_PARA_ATENDER",
  );
});
