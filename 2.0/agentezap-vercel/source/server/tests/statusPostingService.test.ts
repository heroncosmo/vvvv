import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStatusAudienceCandidates,
  buildStatusMessageContent,
  describeStatusPrivacyValue,
  normalizeStatusAudienceCandidates,
  normalizeStatusPrivacyValue,
  parseStatusPostPayload,
  sendStatusPostToSocket,
  serializeStatusPostPayload,
} from "../statusPostingHelpers";
import { computeNextStatusSchedule } from "../statusRecurrence";
import {
  buildNonRetryableStatusErrorMessage,
  buildRetryMessage,
  computeTransientRetryDelaySeconds,
  isStatusSendTimeoutError,
  isTransientStatusPublishError,
  shouldRetryStatusPublishError,
} from "../statusPostingRetry";
import { getStatusJobFailureState } from "../statusPublishJobState";

test("normalizeStatusAudienceCandidates deduplica e normaliza contatos", () => {
  const audience = normalizeStatusAudienceCandidates([
    "5511999999999",
    "5511999999999@s.whatsapp.net",
    "5511888888888@lid",
    "status@broadcast",
    "120363400000000@g.us",
    "nome invalido",
    "",
  ]);

  assert.deepEqual(audience, [
    "5511999999999@s.whatsapp.net",
    "5511888888888@lid",
  ]);
});

test("buildStatusAudienceCandidates prioriza numeros e remove destinos invalidos", () => {
  const audience = buildStatusAudienceCandidates([
    { phoneNumber: "5511999999999" },
    { primaryId: "5511888888888@s.whatsapp.net" },
    { lid: "5511777777777@lid" },
    { primaryId: "120363400000000@g.us" },
    { phoneNumber: "status@broadcast" },
  ]);

  assert.deepEqual(audience, [
    "5511999999999@s.whatsapp.net",
    "5511888888888@s.whatsapp.net",
    "5511777777777@lid",
  ]);
});

test("buildStatusAudienceCandidates preserva identificadores lid sem forcar numero opaco para s.whatsapp.net", () => {
  const audience = buildStatusAudienceCandidates([
    {
      phoneNumber: "111944145080366",
      primaryId: "111944145080366@lid",
    },
    {
      phoneNumber: "120363422321263712",
      primaryId: "120363422321263712@g.us",
    },
    {
      phoneNumber: "5517997634565@s.whatsapp.net",
      primaryId: "5517997634565@s.whatsapp.net",
      lid: "78941532499973@lid",
    },
  ]);

  assert.deepEqual(audience, [
    "111944145080366@lid",
    "5517997634565@s.whatsapp.net",
  ]);
});

test("buildStatusAudienceCandidates deduplica a mesma pessoa entre lid e s.whatsapp", () => {
  const audience = buildStatusAudienceCandidates([
    {
      phoneNumber: "100046985007357",
      primaryId: "100046985007357@lid",
    },
    {
      phoneNumber: "100046985007357",
      primaryId: "100046985007357@s.whatsapp.net",
    },
  ]);

  assert.deepEqual(audience, ["100046985007357@lid"]);
});

test("buildStatusAudienceCandidates mantem pn explicito quando ele existe junto do lid", () => {
  const audience = buildStatusAudienceCandidates([
    {
      phoneNumber: "5517997634565@s.whatsapp.net",
      primaryId: "5517997634565@s.whatsapp.net",
    },
    {
      primaryId: "5517997634565@lid",
    },
  ]);

  assert.deepEqual(audience, ["5517997634565@s.whatsapp.net"]);
});

test("privacidade do status eh normalizada e descrita em portugues", () => {
  assert.equal(normalizeStatusPrivacyValue("contacts"), "contacts");
  assert.equal(
    normalizeStatusPrivacyValue("CONTACT_BLACKLIST"),
    "contact_blacklist",
  );
  assert.equal(normalizeStatusPrivacyValue("desconhecido"), null);
  assert.equal(describeStatusPrivacyValue("all"), "todos");
  assert.equal(describeStatusPrivacyValue("contacts"), "meus contatos");
  assert.equal(
    describeStatusPrivacyValue("contact_blacklist"),
    "meus contatos, exceto alguns",
  );
  assert.equal(describeStatusPrivacyValue("none"), "lista restrita");
});

test("parseStatusPostPayload mantem compatibilidade com texto legado", () => {
  const legacy = parseStatusPostPayload("Texto antigo");
  assert.equal(legacy.contentType, "text");
  assert.equal(legacy.text, "Texto antigo");

  const serialized = serializeStatusPostPayload({
    contentType: "image",
    caption: "Legenda",
    mediaUrl: "https://example.com/image.png",
    storagePath: "media/u/file.png",
  });
  const parsed = parseStatusPostPayload(serialized);
  assert.equal(parsed.contentType, "image");
  assert.equal(parsed.caption, "Legenda");
  assert.equal(parsed.storagePath, "media/u/file.png");
});

test("serializeStatusPostPayload preserva recorrencia semanal e variacao com IA", () => {
  const serialized = serializeStatusPostPayload({
    connectionId: "conn-123",
    contentType: "text",
    text: "Base do status",
    selectedWeekdays: [3, 1, 3, 5],
    aiVariationEnabled: true,
    aiVariationPrompt: "Deixe mais vendedor",
    requestedAction: "weekdays",
    sendRetryCount: 2,
  });

  const parsed = parseStatusPostPayload(serialized);
  assert.equal(parsed.connectionId, "conn-123");
  assert.deepEqual(parsed.selectedWeekdays, [1, 3, 5]);
  assert.equal(parsed.aiVariationEnabled, true);
  assert.equal(parsed.aiVariationPrompt, "Deixe mais vendedor");
  assert.equal(parsed.requestedAction, "weekdays");
  assert.equal(parsed.sendRetryCount, 2);
});

test("buildStatusMessageContent gera texto simples", async () => {
  const content = await buildStatusMessageContent(
    parseStatusPostPayload(
      serializeStatusPostPayload({
        contentType: "text",
        text: "Ola mundo",
      }),
    ),
  );

  assert.deepEqual(content, { text: "Ola mundo" });
});

test("sendStatusPostToSocket usa broadcast real do status", async () => {
  const calls: any[] = [];
  const socket = {
    async onWhatsApp(...jids: string[]) {
      return jids.map((jid) => ({ jid, exists: true }));
    },
    async sendMessage(jid: string, content: unknown, options: unknown) {
      calls.push({ jid, content, options });
      return { ok: true };
    },
  };

  await sendStatusPostToSocket(
    socket,
    parseStatusPostPayload(
      serializeStatusPostPayload({
        contentType: "text",
        text: "Status real",
      }),
    ),
    ["5511999999999@s.whatsapp.net"],
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].jid, "status@broadcast");
  assert.deepEqual(calls[0].content, { text: "Status real" });
  assert.deepEqual(calls[0].options, {
    broadcast: true,
    statusJidList: ["5511999999999@s.whatsapp.net"],
    useUserDevicesCache: false,
  });
});

test("sendStatusPostToSocket filtra pns invalidos e preserva lids", async () => {
  const calls: any[] = [];
  const socket = {
    async onWhatsApp(...jids: string[]) {
      return jids.map((jid) => ({
        jid,
        exists: jid !== "5511888888888@s.whatsapp.net",
      }));
    },
    async sendMessage(jid: string, content: unknown, options: any) {
      calls.push({ jid, content, options });
      return { ok: true };
    },
  };

  await sendStatusPostToSocket(
    socket,
    parseStatusPostPayload(
      serializeStatusPostPayload({
        contentType: "text",
        text: "Status filtrado",
      }),
    ),
    [
      "5511999999999@s.whatsapp.net",
      "5511888888888@s.whatsapp.net",
      "111944145080366@lid",
    ],
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options.statusJidList, [
    "111944145080366@lid",
    "5511999999999@s.whatsapp.net",
  ]);
});

test("computeNextStatusSchedule encontra o proximo dia selecionado", () => {
  const next = computeNextStatusSchedule({
    base: new Date("2026-03-09T12:00:00.000Z"),
    recurrenceType: "weekly",
    interval: 1,
    selectedWeekdays: [2, 4],
  });

  assert.ok(next instanceof Date);
  assert.equal(next?.toISOString(), "2026-03-10T12:00:00.000Z");
});

test("retry do status cresce com backoff e reconhece erros transientes", () => {
  const timeoutError = new Error("Status send timed out after 90s");
  timeoutError.name = "StatusSendTimeoutError";

  assert.equal(isStatusSendTimeoutError(timeoutError), true);
  assert.equal(
    isTransientStatusPublishError(new Error("Connection Closed")),
    true,
  );
  assert.equal(
    isTransientStatusPublishError(new Error("socket timed out")),
    true,
  );
  assert.equal(
    isTransientStatusPublishError(new Error("WhatsApp nao conectado")),
    true,
  );
  assert.equal(
    isTransientStatusPublishError(
      new Error("WhatsApp não conectado na conexão selecionada"),
    ),
    true,
  );
  assert.equal(shouldRetryStatusPublishError(timeoutError), true);
  assert.equal(
    shouldRetryStatusPublishError(new Error("socket timed out")),
    true,
  );
  assert.equal(computeTransientRetryDelaySeconds(0), 15);
  assert.equal(computeTransientRetryDelaySeconds(1), 30);
  assert.equal(computeTransientRetryDelaySeconds(5), 300);
  assert.match(
    buildNonRetryableStatusErrorMessage(timeoutError),
    /evitar repostagem automatica duplicada/i,
  );
  assert.match(
    buildRetryMessage(timeoutError, new Date("2026-04-07T04:11:00.000Z"), 2),
    /01:11/,
  );
});

test("computeNextStatusSchedule usa dia da semana de Brasilia", () => {
  const next = computeNextStatusSchedule({
    base: new Date("2026-04-07T02:30:00.000Z"),
    recurrenceType: "weekly",
    interval: 1,
    selectedWeekdays: [2],
  });

  assert.ok(next instanceof Date);
  assert.equal(next?.toISOString(), "2026-04-08T02:30:00.000Z");
});

test("getStatusJobFailureState encerra jobs once em vez de reprocessar para sempre", () => {
  assert.deepEqual(
    getStatusJobFailureState({
      recurrenceType: "once",
      now: new Date("2026-03-13T16:22:43.089Z"),
      errorMessage: "WhatsApp nao conectado",
    }),
    {
      lastError: "WhatsApp nao conectado",
      nextRunAt: null,
      status: "failed",
      isActive: false,
      updatedAt: new Date("2026-03-13T16:22:43.089Z"),
    },
  );
});
