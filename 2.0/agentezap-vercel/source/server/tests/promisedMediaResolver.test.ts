import assert from "node:assert/strict";

import { resolveContextualMediaWithAISdk, resolvePromisedMediaWithAISdk } from "../promisedMediaResolver";

const baseHistory = [
  { role: "user", content: "Quero ver como funciona o envio em massa." },
  { role: "assistant", content: "Claro, vou te mostrar." },
] as const;

const clearResolution = await resolvePromisedMediaWithAISdk({
  customerMessage: "Quero ver como funciona o envio em massa.",
  assistantResponse: "Vou te enviar um video rapido mostrando o envio em massa.",
  conversationHistory: baseHistory as any,
  mediaLibrary: [
    {
      name: "ENVIO_EM_MASSA",
      mediaType: "video",
      whenToUse: "Use quando o cliente quiser ver como funciona envio em massa e campanhas.",
      isActive: true,
    },
  ],
  structuredExecutor: async ({ candidates }) => ({
    decision: "SEND",
    candidateId: candidates[0]?.id,
    mediaName: candidates[0]?.name,
    confidence: 92,
    reason: "video corresponde ao pedido e a promessa",
  }),
});

assert.equal(clearResolution.shouldSendMedia, true);
assert.equal(clearResolution.mediaName, "ENVIO_EM_MASSA");
assert.equal(clearResolution.source, "structured_executor");

const ambiguousResolution = await resolvePromisedMediaWithAISdk({
  customerMessage: "Pode me mandar um video?",
  assistantResponse: "Vou te enviar um video agora.",
  mediaLibrary: [
    {
      name: "VIDEO_FUNIL_1",
      mediaType: "video",
      whenToUse: "Use para apresentar a primeira parte do funil.",
      isActive: true,
    },
    {
      name: "VIDEO_FUNIL_2",
      mediaType: "video",
      whenToUse: "Use para apresentar a segunda parte do funil.",
      isActive: true,
    },
  ],
  structuredExecutor: async () => ({
    decision: "NO_MEDIA",
    candidateId: null,
    mediaName: null,
    confidence: 88,
    reason: "mais de uma candidata sem diferenca clara",
  }),
});

assert.equal(ambiguousResolution.shouldSendMedia, false);
assert.equal(ambiguousResolution.mediaName, null);

const noInventedMedia = await resolvePromisedMediaWithAISdk({
  customerMessage: "Quero ver o catalogo.",
  assistantResponse: "Vou te mandar o material.",
  mediaLibrary: [
    {
      name: "CATALOGO_VALIDO",
      mediaType: "document",
      whenToUse: "Use quando o cliente pedir catalogo.",
      isActive: true,
    },
  ],
  structuredExecutor: async () => ({
    decision: "SEND",
    candidateId: "media_999",
    mediaName: "CATALOGO_INVENTADO",
    confidence: 99,
    reason: "nome inventado deve ser recusado",
  }),
});

assert.equal(noInventedMedia.shouldSendMedia, false);
assert.equal(noInventedMedia.mediaName, null);

const sentMediaIsSkipped = await resolvePromisedMediaWithAISdk({
  customerMessage: "Me manda outro material do catalogo.",
  assistantResponse: "Vou te mandar outro material agora.",
  mediaLibrary: [
    {
      name: "CATALOGO_JA_ENVIADO",
      mediaType: "document",
      whenToUse: "Use quando o cliente pedir catalogo.",
      isActive: true,
    },
    {
      name: "CATALOGO_COMPLEMENTAR",
      mediaType: "document",
      whenToUse: "Use quando o cliente pedir outro material do catalogo.",
      isActive: true,
    },
  ],
  sentMedias: ["CATALOGO_JA_ENVIADO"],
  structuredExecutor: async ({ candidates }) => {
    assert.deepEqual(candidates.map((candidate) => candidate.name), ["CATALOGO_COMPLEMENTAR"]);
    return {
      decision: "SEND",
      candidateId: candidates[0]?.id,
      mediaName: candidates[0]?.name,
      confidence: 91,
      reason: "respeitou midia ja enviada",
    };
  },
});

assert.equal(sentMediaIsSkipped.shouldSendMedia, true);
assert.equal(sentMediaIsSkipped.mediaName, "CATALOGO_COMPLEMENTAR");

const contextualCourseResolution = await resolveContextualMediaWithAISdk({
  customerMessage: "Quero saber sobre o curso de cabeleireira.",
  assistantResponse: "O curso de cabeleireira presencial tem aulas praticas e turma em julho.",
  mediaLibrary: [
    {
      name: "CABELEIREIRA",
      mediaType: "image",
      whenToUse: "Quando o lead perguntar sobre curso de cabeleireira presencial.",
      caption: "Curso presencial de cabeleireira.",
      isActive: true,
    },
    {
      name: "CURSO_DE_BARBEIRO",
      mediaType: "image",
      whenToUse: "Quando o lead perguntar sobre curso de barbeiro.",
      isActive: true,
    },
  ],
  structuredExecutor: async ({ prompt, candidates }) => {
    assert.match(prompt, /mesmo que o cliente nao use palavras como foto, imagem ou video/);
    assert.match(prompt, /Nao escolha midia de curso, produto, catalogo ou tema comercial para pergunta apenas de endereco/);
    assert.deepEqual(candidates.map((candidate) => candidate.name), ["CABELEIREIRA", "CURSO_DE_BARBEIRO"]);
    return {
      decision: "SEND",
      candidateId: candidates[0]?.id,
      mediaName: candidates[0]?.name,
      confidence: 88,
      reason: "whenToUse bate diretamente com curso de cabeleireira",
    };
  },
});

assert.equal(contextualCourseResolution.shouldSendMedia, true);
assert.equal(contextualCourseResolution.mediaName, "CABELEIREIRA");
assert.equal(contextualCourseResolution.source, "structured_executor");

const contextualAddressOnlyResolution = await resolveContextualMediaWithAISdk({
  customerMessage: "Qual e o endereco da escola?",
  assistantResponse: "O endereco e Av Independencia 1225, Unamar, Cabo Frio.",
  mediaLibrary: [
    {
      name: "CABELEIREIRA",
      mediaType: "image",
      whenToUse: "Quando o lead perguntar sobre curso de cabeleireira presencial.",
      caption: "Curso presencial. Endereco: Av Independencia 1225.",
      isActive: true,
    },
  ],
  structuredExecutor: async () => ({
    decision: "NO_MEDIA",
    candidateId: null,
    mediaName: null,
    confidence: 94,
    reason: "pedido apenas de endereco nao deve usar midia de curso",
  }),
});

assert.equal(contextualAddressOnlyResolution.shouldSendMedia, false);
assert.equal(contextualAddressOnlyResolution.mediaName, null);

console.log("promisedMediaResolver.test.ts ok");
process.exit(0);
