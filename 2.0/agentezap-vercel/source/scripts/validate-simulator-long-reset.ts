import dotenv from "dotenv";
import fs from "fs";
import http from "http";
import path from "path";
import type { AddressInfo } from "net";

dotenv.config({ path: ".env.local", override: false });

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.DISABLE_WHATSAPP_PROCESSING = "true";
process.env.DISABLE_BACKGROUND_SERVICES = "true";
process.env.DISABLE_BACKGROUND_JOBS = "true";
process.env.SKIP_WHATSAPP_RESTORE = "true";
process.env.ALLOW_INSECURE_LOCAL_SESSION = "true";
process.env.APP_RUNTIME_PROFILE = process.env.APP_RUNTIME_PROFILE || "full";
process.env.SERVICE_MODE = process.env.SERVICE_MODE || "monolith";

type HistoryItem = { role: "user" | "assistant"; content: string };
type TestStep = {
  path: "auth" | "web-only" | "public-web-only";
  label: string;
  message: string;
  sessionId: string;
  clearCart?: boolean;
};
type StepResult = {
  path: TestStep["path"];
  label: string;
  status: number;
  ok: boolean;
  durationMs: number;
  responseLength: number;
  splitCount: number;
  mediaCount: number;
  hasOutput: boolean;
  emptyResponse: boolean;
  blocked: boolean;
  limitReached: boolean;
  bubbleLeak: boolean;
  mojibake: boolean;
  mode?: string;
  serverMessage?: string;
  responsePreview?: string;
  error?: string;
};

const email = process.env.SIMULATOR_TEST_EMAIL || "rodrigo4@gmail.com";
const password = process.env.SIMULATOR_TEST_PASSWORD || "";
const externalBaseUrl = String(process.env.SIMULATOR_TEST_BASE_URL || "").trim().replace(/\/+$/, "");
const onlyPath = String(process.env.SIMULATOR_TEST_ONLY_PATH || "").trim() as TestStep["path"] | "";
const maxSteps = Number(process.env.SIMULATOR_TEST_MAX_STEPS || 0);
const customFirstMessage = String(process.env.SIMULATOR_TEST_FIRST_MESSAGE || "").trim();
const outputPath = process.env.SIMULATOR_TEST_OUTPUT ||
  path.join("validation-artifacts", `simulator-long-reset-${externalBaseUrl ? "live" : "local"}-${Date.now()}.json`);

function requireEnv(name: string, value: string | undefined) {
  if (!String(value || "").trim()) {
    throw new Error(`${name} is required`);
  }
}

function longMessage(topic: string, repeat = 12) {
  const paragraph =
    `Estou testando uma conversa longa sobre ${topic}. ` +
    "Quero uma resposta objetiva, em portugues correto, sem inventar configuracoes e sem dizer que fez alguma acao real. " +
    "Considere que o cliente esta apenas avaliando o atendimento no simulador e quer entender o proximo passo com calma.";
  return Array.from({ length: repeat }, (_, index) => `${index + 1}. ${paragraph}`).join("\n");
}

function hasMojibake(text: string) {
  if (/voc\?|n\?o|servi\?o|endere\?o/i.test(text)) return true;
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === 0x00c3 || codePoint === 0x00c2 || codePoint === 0xfffd) {
      return true;
    }
  }
  return false;
}

function collectVisiblePayloadText(data: any) {
  const parts: string[] = [];
  if (typeof data?.response === "string") parts.push(data.response);
  if (typeof data?.message === "string") parts.push(data.message);
  if (typeof data?.error === "string") parts.push(data.error);
  if (Array.isArray(data?.splitResponses)) {
    for (const part of data.splitResponses) {
      if (typeof part === "string") parts.push(part);
    }
  }
  if (Array.isArray(data?.mediaActions)) {
    for (const action of data.mediaActions) {
      for (const key of ["text", "caption", "description", "transcription"]) {
        if (typeof action?.[key] === "string") parts.push(action[key]);
      }
    }
  }
  return parts.join("\n");
}

function summarizePayload(data: any): Pick<StepResult,
  "responseLength" | "splitCount" | "mediaCount" | "hasOutput" | "emptyResponse" |
  "blocked" | "limitReached" | "bubbleLeak" | "mojibake" | "mode" | "serverMessage" | "responsePreview"
> {
  const response = typeof data?.response === "string" ? data.response : "";
  const splitResponses = Array.isArray(data?.splitResponses)
    ? data.splitResponses.filter((part: unknown) => String(part || "").trim())
    : [];
  const mediaActions = Array.isArray(data?.mediaActions) ? data.mediaActions : [];
  const visibleText = collectVisiblePayloadText(data);
  return {
    responseLength: response.trim().length,
    splitCount: splitResponses.length,
    mediaCount: mediaActions.length,
    hasOutput: Boolean(response.trim() || splitResponses.length > 0 || mediaActions.length > 0),
    emptyResponse: data?.emptyResponse === true,
    blocked: data?.blocked === true || data?.channelReady === false,
    limitReached: data?.limitReached === true,
    bubbleLeak: visibleText.includes("[BOLHA]"),
    mojibake: hasMojibake(visibleText),
    mode: typeof data?.mode === "string" ? data.mode : undefined,
    serverMessage: String(data?.message || data?.error || "").trim().slice(0, 220) || undefined,
    responsePreview: response.trim().slice(0, 220) || undefined,
  };
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

async function fetchJson(baseUrl: string, urlPath: string, options: RequestInit) {
  const response = await fetch(`${baseUrl}${urlPath}`, {
    ...options,
    signal: AbortSignal.timeout(Number(process.env.SIMULATOR_TEST_TIMEOUT_MS || 120_000)),
  });
  return { status: response.status, data: await readJsonResponse(response) };
}

function createMockRes() {
  let body = "";
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    setHeader(name: string, value: unknown) {
      headers[name] = String(value);
    },
    getHeader(name: string) {
      return headers[name];
    },
    end(value?: unknown) {
      if (value !== undefined) body += Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
    },
  };
  return {
    res,
    getPayload() {
      try {
        return body ? JSON.parse(body) : {};
      } catch {
        return { rawText: body };
      }
    },
  };
}

async function callWebOnlyHandler(
  handler: (req: any, res: any) => Promise<void>,
  token: string,
  step: TestStep,
  history: HistoryItem[],
  sentMedias: string[],
  userId?: string,
) {
  const { res, getPayload } = createMockRes();
  const body = {
    message: step.message,
    history,
    sentMedias,
    sessionId: step.sessionId,
    clearCart: step.clearCart === true,
    contactName: "Visitante",
    userId,
  };
  const req = {
    method: "POST",
    url: step.path === "public-web-only" ? "/api/test-agent/message" : "/api/agent/test",
    headers: step.path === "public-web-only"
      ? { "content-type": "application/json" }
      : { "content-type": "application/json", authorization: `Bearer ${token}` },
    body,
  };
  await handler(req, res);
  return { status: res.statusCode, data: getPayload() };
}

function appendAssistantHistory(history: HistoryItem[], data: any) {
  const parts: string[] = [];
  if (Array.isArray(data?.splitResponses)) {
    for (const part of data.splitResponses) {
      const text = String(part || "").trim();
      if (text) parts.push(text);
    }
  }
  if (Array.isArray(data?.mediaActions)) {
    for (const action of data.mediaActions) {
      const text = String(action?.text || action?.caption || "").trim();
      if (text) parts.push(text);
    }
  }
  const response = String(data?.response || "").trim();
  if (parts.length === 0 && response) parts.push(response);
  if (parts.length === 0 && Array.isArray(data?.mediaActions) && data.mediaActions.length > 0) {
    parts.push("[midia enviada no simulador]");
  }
  history.push({ role: "assistant", content: parts.join("\n\n").slice(0, 6000) });
}

function collectSentMediaNames(data: any) {
  const names: string[] = [];
  if (!Array.isArray(data?.mediaActions)) return names;
  for (const action of data.mediaActions) {
    const name = String(action?.media_name || action?.mediaName || action?.name || "").trim();
    if (name) names.push(name);
  }
  return names;
}

function buildSteps(pathName: TestStep["path"], prefix: string): TestStep[] {
  const sessionA = `${prefix}-sessao-longa-${Date.now()}`;
  const sessionB = `${prefix}-sessao-reset-${Date.now()}`;
  return [
    {
      path: pathName,
      label: `${prefix}-01-primeira-mensagem-clear`,
      sessionId: sessionA,
      clearCart: true,
      message: customFirstMessage || "Ola, estou testando meu atendimento pelo simulador. Quero entender como voce responde um cliente novo.",
    },
    {
      path: pathName,
      label: `${prefix}-02-segundo-turno`,
      sessionId: sessionA,
      message: "Entendi. Agora me explique de forma simples como voce continuaria a conversa sem repetir a abertura.",
    },
    {
      path: pathName,
      label: `${prefix}-03-contexto-detalhado`,
      sessionId: sessionA,
      message: "Meu negocio recebe clientes perguntando por atendimento, horarios e informacoes gerais. Responda como se estivesse orientando um cliente no WhatsApp.",
    },
    {
      path: pathName,
      label: `${prefix}-04-mensagem-longa`,
      sessionId: sessionA,
      message: longMessage("continuidade de conversa no simulador", 10),
    },
    {
      path: pathName,
      label: `${prefix}-05-continua-apos-longa`,
      sessionId: sessionA,
      message: "Depois dessa mensagem grande, responda normalmente e confirme o que voce entendeu sem travar.",
    },
    {
      path: pathName,
      label: `${prefix}-06-reset-nova-sessao`,
      sessionId: sessionB,
      clearCart: true,
      message: "Limpei o simulador e comecei de novo. Responda como primeira mensagem desta nova conversa.",
    },
    {
      path: pathName,
      label: `${prefix}-07-longa-apos-reset`,
      sessionId: sessionB,
      message: longMessage("nova sessao depois de limpar o simulador", 14),
    },
  ];
}

function validateStep(status: number, data: any, summary: ReturnType<typeof summarizePayload>) {
  const reasons: string[] = [];
  if (status < 200 || status >= 300) reasons.push(`http_${status}`);
  if (summary.emptyResponse) reasons.push("empty_response");
  if (!summary.hasOutput) reasons.push("no_output");
  if (summary.blocked) reasons.push("blocked");
  if (summary.limitReached) reasons.push("limit_reached");
  if (summary.bubbleLeak) reasons.push("bubble_leak");
  if (summary.mojibake) reasons.push("mojibake");
  if (String(data?.message || data?.error || "").toLowerCase().includes("unauthorized")) reasons.push("unauthorized");
  return reasons;
}

async function main() {
  requireEnv("SIMULATOR_TEST_PASSWORD", password);

  let baseUrl = externalBaseUrl;
  let server: http.Server | null = null;
  let closeDbPool: (() => Promise<void>) | null = null;
  let webOnlyHandler: ((req: any, res: any) => Promise<void>) | null = null;

  if (!baseUrl) {
    const httpApiApp = await import("../server/httpApiApp");
    const dbModule = await import("../server/db");
    const webOnlyModule = await import("../api/http");
    closeDbPool = dbModule.closeDbPool;
    webOnlyHandler = webOnlyModule.default;

    const created = await httpApiApp.createHttpApiApp({ mountHealthRoutes: true });
    server = created.server;
    baseUrl = await new Promise<string>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", () => {
        const address = server!.address() as AddressInfo;
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });
  }

  const startedAt = new Date().toISOString();
  const results: StepResult[] = [];
  let token = "";
  let userId = "";
  let fatalError: string | undefined;

  try {
    const login = await fetchJson(baseUrl, "/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (login.status !== 200 || !login.data?.session?.access_token) {
      throw new Error(`login_failed:${login.status}:${String(login.data?.message || login.data?.error || "")}`);
    }
    token = login.data.session.access_token;
    userId = String(login.data.user?.id || "");

    const authHistoryBySession = new Map<string, HistoryItem[]>();
    const webHistoryBySession = new Map<string, HistoryItem[]>();
    const publicHistoryBySession = new Map<string, HistoryItem[]>();
    const sentMediasBySession = new Map<string, string[]>();
    const plannedSteps = externalBaseUrl
      ? [
          ...buildSteps("auth", "auth-live"),
          ...buildSteps("public-web-only", "public-live"),
        ]
      : [
          ...buildSteps("auth", "auth"),
          ...buildSteps("web-only", "web"),
          ...buildSteps("public-web-only", "public").slice(0, 4),
        ];
    const allSteps = plannedSteps
      .filter((step) => !onlyPath || step.path === onlyPath)
      .slice(0, maxSteps > 0 ? maxSteps : undefined);

    for (const step of allSteps) {
      const historyMap = step.path === "auth"
        ? authHistoryBySession
        : step.path === "web-only"
          ? webHistoryBySession
          : publicHistoryBySession;
      const history = step.clearCart ? [] : (historyMap.get(step.sessionId) || []);
      if (step.clearCart) historyMap.set(step.sessionId, history);
      if (step.clearCart) sentMediasBySession.set(step.sessionId, []);
      const sentMedias = sentMediasBySession.get(step.sessionId) || [];

      const start = Date.now();
      const call = step.path === "auth"
        ? await fetchJson(baseUrl, "/api/agent/test", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              message: step.message,
              history,
              sentMedias,
              sessionId: step.sessionId,
              clearCart: step.clearCart === true,
              contactName: "Visitante",
            }),
          })
        : externalBaseUrl
          ? await fetchJson(baseUrl, "/api/test-agent/message", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: step.message,
                history,
                sentMedias,
                sessionId: step.sessionId,
                clearCart: step.clearCart === true,
                contactName: "Visitante",
                userId,
              }),
            })
          : await callWebOnlyHandler(webOnlyHandler!, token, step, history, sentMedias, userId);

      const durationMs = Date.now() - start;
      const summary = summarizePayload(call.data);
      const reasons = validateStep(call.status, call.data, summary);
      const result: StepResult = {
        path: step.path,
        label: step.label,
        status: call.status,
        ok: reasons.length === 0,
        durationMs,
        ...summary,
        error: reasons.length > 0 ? reasons.join(",") : undefined,
      };
      results.push(result);

      console.log(JSON.stringify(result));

      history.push({ role: "user", content: step.message.slice(0, 6000) });
      if (result.ok) {
        appendAssistantHistory(history, call.data);
        const nextSent = new Set(sentMedias);
        for (const name of collectSentMediaNames(call.data)) {
          nextSent.add(name);
        }
        sentMediasBySession.set(step.sessionId, Array.from(nextSent));
      }
      historyMap.set(step.sessionId, history);
    }
  } catch (error: any) {
    fatalError = error?.message || String(error);
    console.error(fatalError);
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    if (closeDbPool) {
      await closeDbPool().catch(() => undefined);
    }
  }

  const finishedAt = new Date().toISOString();
  const summary = {
    startedAt,
    finishedAt,
    email,
    userId,
    target: externalBaseUrl ? "production" : "local-source",
    baseUrl,
    fatalError,
    total: results.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`RESULT_FILE=${outputPath}`);

  if (summary.failed > 0 || fatalError) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
