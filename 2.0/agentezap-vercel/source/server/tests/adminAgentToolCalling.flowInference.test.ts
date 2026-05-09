import assert from "node:assert/strict";
import { inferFlowItemsHeuristically } from "../adminAgentToolCalling";

const recentMediaBuffer = [
  {
    id: "audio-1",
    url: "https://cdn.exemplo.com/audio.mp3",
    type: "audio" as const,
    summary: "audio de abertura",
  },
  {
    id: "video-1",
    url: "https://cdn.exemplo.com/video.mp4",
    type: "video" as const,
    summary: "video com explicacao",
  },
];

const inferred = inferFlowItemsHeuristically({
  messageText:
    "quero salvar um fluxo. primeiro manda esse audio, depois o texto 'Perfeito, vou te mostrar como funciona na pratica.', depois esse video.",
  recentMediaBuffer,
});

assert.equal(inferred.length, 3, "o fluxo deve conter audio, texto e video");
assert.equal(inferred[0]?.type, "media");
assert.equal(inferred[0]?.mediaType, "audio");
assert.equal(inferred[0]?.storageUrl, "https://cdn.exemplo.com/audio.mp3");
assert.equal(inferred[1]?.type, "text");
assert.equal(inferred[1]?.text, "Perfeito, vou te mostrar como funciona na pratica.");
assert.equal(inferred[2]?.type, "media");
assert.equal(inferred[2]?.mediaType, "video");
assert.equal(inferred[2]?.storageUrl, "https://cdn.exemplo.com/video.mp4");

const onlyOneItem = inferFlowItemsHeuristically({
  messageText: "salva esse audio como fluxo",
  recentMediaBuffer,
});

assert.equal(onlyOneItem.length, 0, "nao deve montar fluxo incompleto com menos de 2 itens");

console.log("adminAgentToolCalling.flowInference.test.ts ok");
process.exit(0);
