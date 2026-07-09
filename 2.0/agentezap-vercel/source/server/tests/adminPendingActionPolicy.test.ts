import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canConfirmSaveMediaPendingAction,
  shouldAskForMediaResend,
} from "../adminPendingActionPolicy";

const __dirname = dirname(fileURLToPath(import.meta.url));
const policySource = readFileSync(resolve(__dirname, "../adminPendingActionPolicy.ts"), "utf8");

assert.equal(
  canConfirmSaveMediaPendingAction({
    mediaUrl: "https://cdn.exemplo.com/arquivo.jpg",
    whenToUse: "quando perguntarem sobre a promocao",
  }),
  true,
  "save_media so pode entrar em confirmacao quando houver arquivo e contexto de uso",
);

assert.equal(
  canConfirmSaveMediaPendingAction({
    mediaUrl: "",
    whenToUse: "quando perguntarem sobre a promocao",
  }),
  false,
  "nao pode prometer salvar midia sem arquivo real disponivel",
);

assert.equal(
  canConfirmSaveMediaPendingAction({
    mediaType: "flow",
    whenToUse: "quando o lead pedir mais detalhes do produto",
    flowItems: [
      { type: "text", text: "Oi! Vou te explicar rapidinho." },
      { type: "media", storageUrl: "https://cdn.exemplo.com/audio.mp3" },
    ],
  }),
  true,
  "fluxo com 2 itens validos tambem pode entrar em confirmacao",
);

assert.equal(
  canConfirmSaveMediaPendingAction({
    mediaType: "flow",
    whenToUse: "quando o lead pedir mais detalhes do produto",
    flowItems: [
      { type: "text", text: "Oi! Vou te explicar rapidinho." },
      { type: "media", storageUrl: "" },
    ],
  }),
  false,
  "fluxo com item de midia sem arquivo nao pode ser confirmado",
);

assert.equal(
  shouldAskForMediaResend({
    messageText: "salva essa midia para usar depois",
    mediaUrl: "",
    pendingMediaUrl: "",
    lastReceivedMediaUrl: "",
  }),
  true,
  "quando o admin pedir para salvar midia sem arquivo disponivel, o sistema deve pedir reenvio",
);

assert.equal(
  shouldAskForMediaResend({
    messageText: "salva essa mídia para usar depois",
    mediaUrl: "",
    pendingMediaUrl: "",
    lastReceivedMediaUrl: "",
  }),
  true,
  "a policy deve funcionar mesmo quando o texto vier acentuado",
);

assert.equal(
  shouldAskForMediaResend({
    messageText: "salva essa midia para usar depois",
    mediaUrl: "https://cdn.exemplo.com/arquivo.jpg",
  }),
  false,
  "com arquivo disponivel, o sistema nao deve pedir reenvio",
);

assert.doesNotMatch(
  policySource,
  /buildAskForMediaResendReply|reenvie o arquivo|quando ele deve ser usado/i,
  "policy de pending action nao deve escrever resposta publica local para reenvio de midia",
);

console.log("adminPendingActionPolicy.test.ts ok");
