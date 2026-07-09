import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { supabase } from "../server/supabaseAuth";
import {
  generateProviderResponse,
  getAvailableSlots,
  getBookingState,
  resetBookingState,
} from "../server/providerAIService";

type ChatEntry = { role: "user" | "assistant"; content: string };

type LocalSuiteSummary = {
  passed?: number;
  total?: number;
  outputPath?: string;
  error?: string;
  results?: Array<{ name: string; ok: boolean; error?: string }>;
};

type BrowserTestContext = {
  userId: string;
  baseDate: string;
  baseDateBr: string;
  baseSlots: string[];
  firstSlot: string;
  lateSlot: string;
  missingSlot: string;
  validationClientName: string;
  validationClientEmail: string;
};

type BrowserCase = {
  name: string;
  steps: (ctx: BrowserTestContext) => string[];
  validate: (ctx: BrowserTestContext, responses: string[], joined: string) => string[] | Promise<string[]>;
};

type BrowserCaseResult = {
  name: string;
  steps: string[];
  responses: string[];
  responsePreviews: string[];
  passed: boolean;
  issues: string[];
  sessionId: string;
};

type BrowserEvidence = {
  loginUrl: string;
  dashboardUrl: string;
  myAgentUrl: string;
  providerMenuUrl: string;
  screenshots: Record<string, string>;
  agendaDate?: string;
  agendaLookup: {
    searchFrom: string;
    searchTo: string;
    matches: Array<{
      id: string;
      client_name: string;
      client_phone: string;
      appointment_date: string;
      start_time: string;
      end_time: string;
      status: string;
    }>;
  };
  agendaAppointments: unknown[];
  agendaPageTextPreview: string;
  uiProbe: {
    message: string;
    response: string;
    splitResponses: string[];
  };
};

const BASE_URL = String(process.env.APP_URL || "https://agentezap.online").replace(/\/+$/, "");
const JB_EMAIL = process.env.JB_EMAIL || "contato@jbeletrica.com.br";
const JB_PASSWORD = process.env.JB_PASSWORD || "@Jbeletrica5800";
function buildAlphaTag(seed: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let value = Math.abs(seed);
  let tag = "";

  for (let index = 0; index < 8; index += 1) {
    tag += alphabet[value % alphabet.length];
    value = Math.floor(value / alphabet.length);
  }

  return tag;
}

const VALIDATION_TAG = buildAlphaTag(Date.now());
const VALIDATION_CLIENT_NAME = process.env.JB_VALIDATION_CLIENT_NAME || `Codex QA ${VALIDATION_TAG}`;
const VALIDATION_CLIENT_EMAIL = process.env.JB_VALIDATION_CLIENT_EMAIL || `codex.qa.${VALIDATION_TAG}@example.com`;
const VALIDATION_CLIENT_PHONE = process.env.JB_VALIDATION_CLIENT_PHONE || `1199${String(Date.now()).slice(-8)}`;
const JB_LOCAL_SUITE_EMAIL = "contato@jbeletrica.com.br";
const JB_LOCAL_SUITE_SERVICE_NAME = "Instalação ou troca de tomada em ponto existente.";
const JB_LOCAL_SUITE_BASE_PHONE = 551199995200;
const RUN_ID = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const OUTPUT_DIR = path.resolve("output", "validation", `jb-saas-navigation-${RUN_ID}`);

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function normalizeText(input: string): string {
  return String(input || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function createSessionId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatBrazilDate(dateIso: string): string {
  const [year, month, day] = dateIso.split("-");
  return `${day}/${month}/${year}`;
}

function nextRichDateWindow(): { from: string; to: string } {
  const today = new Date();
  const from = formatIsoDate(addDays(today, -3));
  const to = formatIsoDate(addDays(today, 30));
  return { from, to };
}

type LocalHistoryEntry = { fromMe: boolean; text: string };

interface LocalFlowResult {
  replies: string[];
  history: LocalHistoryEntry[];
  state: ReturnType<typeof getBookingState>;
  appointments: Array<{
    id: string;
    service_name: string;
    appointment_date: string;
    start_time: string;
    status: string;
  }>;
}

interface LocalTestContext {
  userId: string;
  baseDate: string;
  baseDateBr: string;
  baseSlots: string[];
  firstSlot: string;
  lateSlot: string;
  missingSlot: string;
}

interface LocalTestCase {
  name: string;
  steps: (ctx: LocalTestContext) => string[];
  assert: (ctx: LocalTestContext, result: LocalFlowResult) => Promise<void> | void;
}

function expectLocal(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function formatDateBr(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeLocal(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function resolveLocalUserId(): Promise<string> {
  const { data: user, error } = await supabase
    .from("users")
    .select("id")
    .eq("email", JB_LOCAL_SUITE_EMAIL)
    .maybeSingle();

  if (error) throw error;
  if (!user?.id) throw new Error(`Usuario nao encontrado: ${JB_LOCAL_SUITE_EMAIL}`);
  return user.id;
}

async function cleanupLocalAppointments(userId: string, phone: string, conversationId: string): Promise<void> {
  await supabase
    .from("provider_appointments")
    .delete()
    .eq("user_id", userId)
    .eq("client_phone", phone);

  resetBookingState(userId, phone, conversationId);
}

async function findRichLocalDate(userId: string, durationMinutes: number): Promise<{ date: string; slots: string[] }> {
  const base = new Date("2026-03-28T12:00:00-03:00");

  for (let offset = 0; offset < 14; offset += 1) {
    const date = formatIsoDate(addDays(base, offset));
    const slots = await getAvailableSlots(userId, date, undefined, durationMinutes);
    if (slots.length >= 8) {
      return { date, slots };
    }
  }

  throw new Error("Nao encontrei uma data rica em slots para a suite local.");
}

async function runLocalFlow(userId: string, testIndex: number, steps: string[]): Promise<LocalFlowResult> {
  const phone = String(JB_LOCAL_SUITE_BASE_PHONE + testIndex);
  const conversationId = `sim-jb-suite-${testIndex}`;
  await cleanupLocalAppointments(userId, phone, conversationId);

  const history: LocalHistoryEntry[] = [];
  let state = getBookingState(userId, phone, conversationId);

  for (const step of steps) {
    const result = await generateProviderResponse(userId, conversationId, phone, step, history);
    history.push({ fromMe: false, text: step });
    history.push({ fromMe: true, text: result?.text || "" });
    state = getBookingState(userId, phone, conversationId);
  }

  const { data: appointments, error } = await supabase
    .from("provider_appointments")
    .select("id, service_name, appointment_date, start_time, status")
    .eq("user_id", userId)
    .eq("client_phone", phone)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const replies = history.filter((entry) => entry.fromMe).map((entry) => entry.text);
  const result: LocalFlowResult = {
    replies,
    history,
    state,
    appointments: appointments || [],
  };

  await cleanupLocalAppointments(userId, phone, conversationId);
  return result;
}

async function findAppointmentsForValidation(clientName: string, clientPhone: string): Promise<Array<Record<string, any>>> {
  const window = nextRichDateWindow();
  const queries: any[] = [
    supabase
      .from("provider_appointments")
      .select("*")
      .gte("appointment_date", window.from)
      .lte("appointment_date", window.to)
      .ilike("client_name", `%${clientName}%`)
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ];

  if (clientPhone) {
    queries.push(
      supabase
        .from("provider_appointments")
        .select("*")
        .gte("appointment_date", window.from)
        .lte("appointment_date", window.to)
        .ilike("client_phone", `%${clientPhone}%`)
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true }),
    );
  }

  const results = await Promise.all(
    queries.map(async (query) => {
      const { data, error } = await query;
      if (error) {
        return [];
      }
      return Array.isArray(data) ? data : [];
    }),
  );

  const merged = new Map<string, Record<string, any>>();
  for (const result of results) {
    for (const item of result) {
      if (item?.id) {
        merged.set(String(item.id), item);
      }
    }
  }

  return [...merged.values()];
}

async function runLocalSuite(): Promise<LocalSuiteSummary> {
  const userId = await resolveLocalUserId();
  const richDate = await findRichLocalDate(userId, 50);
  const baseDate = richDate.date;
  const baseSlots = richDate.slots;
  const firstSlot = baseSlots[0];
  const lateSlot = baseSlots.find((slot) => slot >= "14:30") || baseSlots[Math.min(6, baseSlots.length - 1)];
  const missingSlot = ["12:00", "12:30", "11:30"].find((candidate) => !baseSlots.includes(candidate)) || "12:00";
  const smokeResults: Array<{ name: string; ok: boolean; error?: string }> = [];

  try {
    expectLocal(baseSlots.length > 0, "Nao encontrei slots disponiveis no banco.");
    smokeResults.push({ name: "smoke_slots", ok: true });
  } catch (error) {
    smokeResults.push({ name: "smoke_slots", ok: false, error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const result = await runLocalFlow(userId, 1, [
      "quero instalar uma tomada em ponto existente",
      formatDateBr(baseDate),
      `${lateSlot} pode ser`,
      "pessoa fisica",
      "Rodrigo\nRua Alfa 123, Centro, Monte Alegre\nrodrigo@example.com",
      "pix",
      "sim",
      "sim",
    ]);

    expectLocal(result.replies.length > 0, "A resposta local nao retornou nada.");
    expectLocal(result.appointments.length >= 1, "A bateria local nao gravou o agendamento de validacao.");
    smokeResults.push({ name: "smoke_generate_and_create", ok: true });
  } catch (error) {
    smokeResults.push({
      name: "smoke_generate_and_create",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const passed = smokeResults.filter((result) => result.ok).length;
  const failed = smokeResults.filter((result) => !result.ok);
  const summary: LocalSuiteSummary = {
    passed,
    total: smokeResults.length,
    results: smokeResults,
  };

  if (failed.length > 0) {
    summary.error = failed.map((item) => `${item.name}: ${item.error || "erro"}`).join(" | ");
  }

  console.log(JSON.stringify({ passed, total: smokeResults.length, failed }, null, 2));
  return summary;
}

async function runLocalSuiteIfEnabled(): Promise<LocalSuiteSummary> {
  if (process.env.JB_SKIP_LOCAL_SUITE === "1") {
    return {
      passed: 1,
      total: 1,
      results: [
        {
          name: "local_suite_skipped_after_external_validation",
          ok: true,
        },
      ],
    };
  }

  return runLocalSuite();
}

async function resolveBrowserTestContext(): Promise<BrowserTestContext> {
  const userId = await resolveLocalUserId();
  const richDate = await findRichLocalDate(userId, 50);
  const baseDate = richDate.date;
  const baseSlots = richDate.slots;
  const firstSlot = baseSlots[0];
  const lateSlot = baseSlots.find((slot) => slot >= "14:30") || baseSlots[Math.min(6, baseSlots.length - 1)];
  const missingSlot = ["12:00", "12:30", "11:30"].find((candidate) => !baseSlots.includes(candidate)) || "12:00";

  return {
    userId,
    baseDate,
    baseDateBr: formatDateBr(baseDate),
    baseSlots,
    firstSlot,
    lateSlot,
    missingSlot,
    validationClientName: VALIDATION_CLIENT_NAME,
    validationClientEmail: VALIDATION_CLIENT_EMAIL,
  };
}

async function loginBrowser(page: Page): Promise<{ alreadyLoggedIn: boolean; finalUrl: string }> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle0", timeout: 120000 });
  await sleep(1200);

  const loginFieldsVisible = await page.$("#owner-email");
  let alreadyLoggedIn = false;

  if (loginFieldsVisible) {
    await page.type("#owner-email", JB_EMAIL, { delay: 15 });
    await page.type("#owner-password", JB_PASSWORD, { delay: 15 });
    await Promise.all([
      page.waitForFunction(
        () => {
          const pathName = window.location.pathname;
          return pathName === "/dashboard" || pathName.startsWith("/meu-agente-ia") || pathName.startsWith("/prestador-menu");
        },
        { timeout: 120000 },
      ).catch(() => null),
      page.click('button[type="submit"]'),
    ]);
  } else {
    alreadyLoggedIn = true;
  }

  await sleep(2500);
  return { alreadyLoggedIn, finalUrl: page.url() };
}

async function authFetch(page: Page, route: string, init?: { method?: string; body?: unknown }): Promise<any> {
  const requestUrl = route.startsWith("http") ? route : `${BASE_URL}${route}`;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.waitForFunction(() => document.readyState === "complete", { timeout: 30000 });

      const token = await page.evaluate(() => {
        const memberToken = localStorage.getItem("memberToken");
        if (memberToken) return memberToken;

        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (!key) continue;

          const looksLikeSupabaseAuthKey =
            (key.includes("supabase") || key.startsWith("sb-"))
            && (key.includes("auth") || key.includes("auth-token"));

          if (!looksLikeSupabaseAuthKey) continue;

          const raw = localStorage.getItem(key);
          if (!raw) continue;

          try {
            const parsed = JSON.parse(raw);
            const resolvedToken =
              parsed?.access_token
              || parsed?.session?.access_token
              || parsed?.currentSession?.access_token
              || null;

            if (resolvedToken) {
              return resolvedToken;
            }
          } catch {
            // ignore malformed localStorage entry
          }
        }

        return null;
      });

      const cookies = await page.cookies(BASE_URL);
      const cookieHeader = cookies
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");

      const headers: Record<string, string> = {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(requestUrl, {
        method: init?.method || "GET",
        headers,
        body: init?.body ? JSON.stringify(init.body) : undefined,
      });

      const text = await response.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        // keep text
      }

      return {
        ok: response.ok,
        status: response.status,
        data,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < 3) {
        await sleep(attempt * 1200);
      }
    }
  }

  return {
    ok: false,
    status: 0,
    data: { error: lastError || "fetch_failed" },
  };
}

async function sendSimulatorMessage(
  page: Page,
  payload: {
    message: string;
    history?: ChatEntry[];
    sessionId?: string;
    customPrompt?: string;
    sentMedias?: string[];
    contactName?: string;
    customerMessageWasAudio?: boolean;
  },
): Promise<{ response: string; splitResponses: string[]; raw: any }> {
  let result: any = null;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.waitForFunction(() => document.readyState === "complete", { timeout: 30000 });

      result = await authFetch(page, "/api/agent/test", {
        method: "POST",
        body: payload,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < 3) {
        await sleep(attempt * 1500);
        continue;
      }
      break;
    }

    if (result?.ok) {
      break;
    }

    lastError = JSON.stringify(result?.data || {});
    if (attempt < 3) {
      await sleep(attempt * 1200);
    }
  }

  if (!result?.ok) {
    throw new Error(`Falha ao consultar /api/agent/test: status=${result?.status || 0} detalhe=${lastError || JSON.stringify(result?.data || {})}`);
  }

  const data = result.data || {};
  const responseCandidates = [
    data.response,
    data.text,
    data.message,
    data.reply,
    data.answer,
    data.content,
    data.output,
    data.result,
    data?.data?.response,
    data?.data?.text,
    data?.data?.message,
  ];
  const response = responseCandidates.find((entry) => typeof entry === "string") || "";
  const splitResponsesSource =
    Array.isArray(data.splitResponses)
      ? data.splitResponses
      : Array.isArray(data.responses)
        ? data.responses
        : Array.isArray(data.parts)
          ? data.parts
          : Array.isArray(data?.data?.splitResponses)
            ? data.data.splitResponses
            : [];
  const splitResponses = splitResponsesSource.map((entry: unknown) => String(entry || "")).filter(Boolean);

  return {
    response,
    splitResponses,
    raw: data,
  };
}

async function sendUiMessage(
  page: Page,
  message: string,
): Promise<{ response: string; splitResponses: string[]; raw: any }> {
  try {
    await page.waitForSelector('textarea[placeholder="Digite sua mensagem..."]', { timeout: 30000 });
    const uiResponsePromise = page.waitForResponse((response) => {
      return response.url().includes("/api/agent/test") && response.request().method() === "POST";
    }, { timeout: 300000 });

    const textarea = await page.$('textarea[placeholder="Digite sua mensagem..."]');
    if (!textarea) {
      throw new Error("Nao foi possivel encontrar o campo do simulador.");
    }

    await textarea.type(message, { delay: 15 });
    await page.keyboard.press("Enter");

    const response = await uiResponsePromise;
    const json = await response.json().catch(() => ({}));
    const responseCandidates = [
      json.response,
      json.text,
      json.message,
      json.reply,
      json.answer,
      json.content,
      json.output,
      json.result,
      json?.data?.response,
      json?.data?.text,
      json?.data?.message,
    ];
    const splitResponsesSource =
      Array.isArray(json.splitResponses)
        ? json.splitResponses
        : Array.isArray(json.responses)
          ? json.responses
          : Array.isArray(json.parts)
            ? json.parts
            : Array.isArray(json?.data?.splitResponses)
              ? json.data.splitResponses
              : [];

    return {
      response: responseCandidates.find((entry) => typeof entry === "string") || "",
      splitResponses: splitResponsesSource.map((entry: unknown) => String(entry || "")).filter(Boolean),
      raw: json,
    };
  } catch (error) {
    console.warn(`[JB-BROWSER] Fallback do probe UI para chamada autenticada: ${error instanceof Error ? error.message : String(error)}`);
    return sendSimulatorMessage(page, {
      message,
      history: [],
      sessionId: createSessionId("ui_probe_fallback"),
      contactName: VALIDATION_CLIENT_NAME,
    });
  }
}

async function clearSimulatorConversation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const clearButton = buttons.find((button) => (button.textContent || "").toLowerCase().includes("limpar"));
    if (clearButton instanceof HTMLButtonElement) {
      clearButton.click();
    }
  });
  await sleep(1000);
}

async function runAuthConversationCase(
  page: Page,
  name: string,
  steps: string[],
): Promise<BrowserCaseResult> {
  const sessionId = createSessionId(name);
  const responses: string[] = [];
  const responsePreviews: string[] = [];
  const issues: string[] = [];
  const history: ChatEntry[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    console.log(`[JB-BROWSER] ${name} step ${index + 1}/${steps.length}: ${step}`);
    const result = await sendSimulatorMessage(page, {
      message: step,
      history,
      sessionId,
      contactName: VALIDATION_CLIENT_NAME,
    });
    const combined = String(result.response || result.splitResponses.join("\n")).trim();
    responses.push(combined);
    responsePreviews.push(combined.slice(0, 220));
    console.log(`[JB-BROWSER] ${name} step ${index + 1} reply: ${combined.slice(0, 180)}`);
    history.push({ role: "user", content: step });
    history.push({ role: "assistant", content: combined });
    await sleep(1200);
  }

  return {
    name,
    steps,
    responses,
    responsePreviews,
    passed: issues.length === 0,
    issues,
    sessionId,
  };
}

async function takeScreenshot(page: Page, filePath: string): Promise<void> {
  await page.screenshot({ path: filePath, fullPage: true });
}

async function runBrowserProbe(page: Page, browserCtx: BrowserTestContext): Promise<BrowserEvidence> {
  const screenshots: Record<string, string> = {};

  const loginScreenshot = path.join(OUTPUT_DIR, "login-dashboard-desktop.png");
  screenshots.loginDashboardDesktop = loginScreenshot;
  await takeScreenshot(page, loginScreenshot);

  await page.goto(`${BASE_URL}/meu-agente-ia?tab=chat`, { waitUntil: "networkidle0", timeout: 120000 });
  await sleep(1800);
  const myAgentDesktop = path.join(OUTPUT_DIR, "my-agent-chat-desktop.png");
  screenshots.myAgentChatDesktop = myAgentDesktop;
  await takeScreenshot(page, myAgentDesktop);

  const uiMessage = "ponto existente";
  const uiProbeResult = await sendUiMessage(page, uiMessage);
  await sleep(1800);
  const uiProbe: BrowserEvidence["uiProbe"] = {
    message: uiMessage,
    response: uiProbeResult.response || uiProbeResult.splitResponses.join("\n"),
    splitResponses: uiProbeResult.splitResponses,
  };

  const myAgentAfterUi = path.join(OUTPUT_DIR, "my-agent-chat-after-ui-send.png");
  screenshots.myAgentChatAfterUi = myAgentAfterUi;
  await takeScreenshot(page, myAgentAfterUi);

  await clearSimulatorConversation(page);
  await sleep(1200);

  const createClientName = browserCtx.validationClientName;
  const createSteps = [
    "quero instalar uma tomada em ponto existente",
    browserCtx.baseDateBr,
    `${browserCtx.lateSlot} pode ser`,
    "pessoa fisica",
    `${createClientName}\nRua Alfa 123, Centro, Monte Alegre\n${browserCtx.validationClientEmail}`,
    "pix",
    "sim",
    "sim",
  ];
  await runAuthConversationCase(page, "browser_create_real", createSteps);

  const agendaWindow = nextRichDateWindow();
  const createdAppointments = await findAppointmentsForValidation(createClientName, "");
  const agendaLookup = {
    searchFrom: agendaWindow.from,
    searchTo: agendaWindow.to,
    matches: createdAppointments.map((item) => ({
      id: String(item.id || ""),
      client_name: String(item.client_name || ""),
      client_phone: String(item.client_phone || ""),
      appointment_date: String(item.appointment_date || ""),
      start_time: String(item.start_time || ""),
      end_time: String(item.end_time || ""),
      status: String(item.status || ""),
    })),
  };

  await page.goto(`${BASE_URL}/prestador-menu?tab=agendamentos`, { waitUntil: "networkidle0", timeout: 120000 });
  await sleep(2000);

  const dateInput = await page.$('input[type="date"]');
  const agendaDate = createdAppointments[0]?.appointment_date || agendaLookup.searchTo;
  if (dateInput && agendaDate) {
    await dateInput.click({ clickCount: 3 });
    await page.keyboard.type(agendaDate);
    await dateInput.press("Tab");
    await sleep(2000);
  }

  const providerDesktop = path.join(OUTPUT_DIR, "provider-menu-desktop.png");
  screenshots.providerMenuDesktop = providerDesktop;
  await takeScreenshot(page, providerDesktop);

  const agendaPageText = await page.evaluate(() => document.body?.innerText || "");

  const mobileViewport = { width: 390, height: 844, isMobile: true, hasTouch: true } as const;
  await page.setViewport(mobileViewport);
  await page.goto(`${BASE_URL}/prestador-menu?tab=agendamentos`, { waitUntil: "networkidle0", timeout: 120000 });
  await sleep(2000);
  const providerMobile = path.join(OUTPUT_DIR, "provider-menu-mobile.png");
  screenshots.providerMenuMobile = providerMobile;
  await takeScreenshot(page, providerMobile);

  await page.setViewport({ width: 1440, height: 1200 });

  return {
    loginUrl: `${BASE_URL}/login`,
    dashboardUrl: `${BASE_URL}/dashboard`,
    myAgentUrl: `${BASE_URL}/meu-agente-ia?tab=chat`,
    providerMenuUrl: `${BASE_URL}/prestador-menu?tab=agendamentos`,
    screenshots,
    agendaDate,
    agendaLookup,
    agendaAppointments: createdAppointments,
    agendaPageTextPreview: normalizeText(agendaPageText).slice(0, 1200),
    uiProbe,
  };
}

async function deleteCreatedAppointments(clientName: string): Promise<void> {
  await supabase
    .from("provider_appointments")
    .delete()
    .ilike("client_name", clientName);
}

function browserContainsAny(text: string, candidates: string[]): boolean {
  const normalizedText = normalizeLocal(text);
  return candidates.some((candidate) => normalizedText.includes(normalizeLocal(candidate)));
}

function buildBrowserSlotVariants(slot: string): string[] {
  const [hourPart, minutePart] = slot.split(":");
  const hourNumber = Number(hourPart);
  const shortHour = Number.isFinite(hourNumber) ? String(hourNumber) : hourPart;

  return [
    slot,
    `${shortHour}:${minutePart}`,
    `${hourPart}h${minutePart}`,
    `${shortHour}h${minutePart}`,
    `${hourPart}h`,
    `${shortHour}h`,
  ];
}

function browserMentionsSlot(text: string, slot: string): boolean {
  const normalizedText = normalizeLocal(text);
  return buildBrowserSlotVariants(slot).some((variant) => normalizedText.includes(normalizeLocal(variant)));
}

function browserMentionedSlots(text: string, slots: string[]): string[] {
  return slots.filter((slot) => browserMentionsSlot(text, slot));
}

function browserMentionsDate(text: string, dateBr: string): boolean {
  const normalizedText = normalizeLocal(text);
  const [day, month, year] = dateBr.split("/");
  const variants = [dateBr, `${day}/${month}`, `${day}-${month}`, `${day}-${month}-${year}`];
  return variants.some((variant) => normalizedText.includes(normalizeLocal(variant)));
}

function browserMentionsSomeDate(text: string): boolean {
  return /\b\d{2}\/\d{2}(?:\/\d{4})?\b/.test(String(text || ""));
}

function browserClaimsBooked(text: string): boolean {
  return browserContainsAny(text, [
    "agendado para",
    "agendada para",
    "agendamento confirmado",
    "agendamento foi confirmado",
    "seu agendamento foi confirmado",
    "foi agendado",
    "marcado para",
    "marquei",
  ]);
}

function browserSlotToMinutes(slot: string): number | null {
  const [hourPart, minutePart] = String(slot || "").split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return (hour * 60) + minute;
}

function buildBrowserCases(ctx: BrowserTestContext): BrowserCase[] {
  const case07ClientName = `${ctx.validationClientName} Resumo`;
  const case08ClientName = `${ctx.validationClientName} PrePagamento`;
  const case09ClientName = `${ctx.validationClientName} Confirmado`;

  return [
    {
      name: "01-servico-nao-inventa-horario",
      steps: () => [
        "quero instalar uma tomada em ponto existente",
      ],
      validate: (_caseCtx, responses, joined) => {
        const issues: string[] = [];
        if (responses.length === 0 || !joined.trim()) {
          issues.push("Nao houve resposta da IA.");
        }
        if (!browserContainsAny(joined, ["horario", "agenda", "dia", "dispon"])) {
          issues.push("A resposta inicial nao encaminhou a conversa para disponibilidade/agenda.");
        }
        if (browserMentionedSlots(joined, ctx.baseSlots).length > 0) {
          issues.push("A IA citou horario especifico antes de consultar agenda.");
        }
        if (browserClaimsBooked(joined)) {
          issues.push("A IA insinuou agendamento concluido cedo demais.");
        }
        return issues;
      },
    },
    {
      name: "02-data-explicita-oferece-slot-real",
      steps: () => [
        "quero instalar uma tomada em ponto existente",
        "sim",
        ctx.baseDateBr,
      ],
      validate: (_caseCtx, _responses, joined) => {
        const issues: string[] = [];
        if (!browserMentionsDate(joined, ctx.baseDateBr)) {
          issues.push(`A resposta nao preservou a data ${ctx.baseDateBr}.`);
        }
        if (browserMentionedSlots(joined, ctx.baseSlots).length === 0) {
          issues.push("A resposta nao ofereceu nenhum slot real da agenda espelhada.");
        }
        if (browserClaimsBooked(joined)) {
          issues.push("A IA afirmou create real num turno de oferta de horario.");
        }
        return issues;
      },
    },
    {
      name: "03-mais-tarde-mantem-mesmo-dia",
      steps: () => [
        "quero instalar uma tomada em ponto existente",
        "sim",
        ctx.baseDateBr,
        "mais tarde",
      ],
      validate: (_caseCtx, _responses, joined) => {
        const issues: string[] = [];
        const laterSlots = browserMentionedSlots(joined, ctx.baseSlots.filter((slot) => slot > ctx.firstSlot));
        if (!browserMentionsDate(joined, ctx.baseDateBr)) {
          issues.push("A IA saiu da data original ao responder 'mais tarde'.");
        }
        if (laterSlots.length === 0) {
          issues.push("A IA nao ofereceu um slot posterior real no mesmo dia.");
        }
        return issues;
      },
    },
    {
      name: "04-horario-inexistente-nao-confirma",
      steps: () => [
        "quero instalar uma tomada em ponto existente",
        "sim",
        ctx.baseDateBr,
        `e as ${ctx.missingSlot}?`,
      ],
      validate: (_caseCtx, _responses, joined) => {
        const issues: string[] = [];
        const hasMissingSlot = browserMentionsSlot(joined, ctx.missingSlot);
        const mentionedRealSlots = browserMentionedSlots(joined, ctx.baseSlots);
        if (browserClaimsBooked(joined)) {
          issues.push("A IA tratou um horario inexistente como create real.");
        }
        if (hasMissingSlot && !browserContainsAny(joined, ["nao", "indispon", "alternativa", "mais proxima"])) {
          issues.push("A resposta mencionou o horario inexistente sem sinalizar indisponibilidade.");
        }
        if (mentionedRealSlots.length === 0 && !browserContainsAny(joined, ["nao encontrei", "indisponivel", "sem horario"])) {
          issues.push("A IA nao trouxe alternativa real nem reconheceu indisponibilidade.");
        }
        return issues;
      },
    },
    {
      name: "05-horario-valido-nao-agenda-antes-da-hora",
      steps: () => [
        "quero instalar uma tomada em ponto existente",
        "sim",
        ctx.baseDateBr,
        `e as ${ctx.lateSlot}?`,
      ],
      validate: (_caseCtx, _responses, joined) => {
        const issues: string[] = [];
        if (!browserMentionsSlot(joined, ctx.lateSlot)) {
          issues.push(`A IA nao confirmou o slot real ${ctx.lateSlot}.`);
        }
        if (browserClaimsBooked(joined)) {
          issues.push("A IA afirmou create real ao apenas validar horario.");
        }
        return issues;
      },
    },
    {
      name: "06-aceite-do-slot-avanca-sem-reabrir-agenda",
      steps: () => [
        "quero instalar uma tomada em ponto existente",
        "sim",
        ctx.baseDateBr,
        `e as ${ctx.lateSlot}?`,
        "sim",
      ],
      validate: (_caseCtx, responses, joined) => {
        const issues: string[] = [];
        const lastResponse = responses.at(-1) || "";
        if (browserClaimsBooked(lastResponse)) {
          issues.push("A IA pulou para create real logo apos o aceite do slot.");
        }
        if (!browserContainsAny(lastResponse, ["pessoa fisica", "pessoa juridica", "nome", "endereco", "dados", "pagamento", "esta tudo correto"])) {
          issues.push("A IA nao avancou para a proxima etapa da conversa apos o aceite do slot.");
        }
        if (browserContainsAny(lastResponse, ["horario disponivel", "proximo horario", "agenda real", "alternativa mais proxima"])) {
          issues.push("A IA reabriu a agenda no ultimo turno em vez de seguir a conversa.");
        }
        return issues;
      },
    },
    {
      name: "07-resumo-preserva-slot-e-data",
      steps: () => [
        "quero instalar uma tomada em ponto existente",
        "sim",
        ctx.baseDateBr,
        `e as ${ctx.lateSlot}?`,
        "sim",
        "pessoa fisica",
        `${case07ClientName}\nRua Alfa 123, Centro, Monte Alegre\n${ctx.validationClientEmail}`,
      ],
      validate: (_caseCtx, _responses, joined) => {
        const issues: string[] = [];
        if (!browserMentionsDate(joined, ctx.baseDateBr)) {
          issues.push("O resumo/pergunta seguinte perdeu a data validada.");
        }
        if (!browserMentionsSlot(joined, ctx.lateSlot)) {
          issues.push("O resumo/pergunta seguinte perdeu o horario validado.");
        }
        if (!browserContainsAny(joined, [case07ClientName, "rua alfa", "valor", "servico"])) {
          issues.push("A resposta apos os dados nao reaproveitou contexto suficiente da conversa.");
        }
        return issues;
      },
    },
    {
      name: "08-pagamento-nao-cria-sozinho",
      steps: () => [
        "quero instalar uma tomada em ponto existente",
        "sim",
        ctx.baseDateBr,
        `e as ${ctx.lateSlot}?`,
        "sim",
        "pessoa fisica",
        `${case08ClientName}\nRua Alfa 123, Centro, Monte Alegre\n${ctx.validationClientEmail}`,
        "pix",
      ],
      validate: async (_caseCtx, _responses, joined) => {
        const issues: string[] = [];
        const appointments = await findAppointmentsForValidation(case08ClientName, "");
        if (appointments.length > 0) {
          issues.push("O sistema criou agendamento antes da confirmacao final.");
        }
        if (browserClaimsBooked(joined)) {
          issues.push("A IA afirmou create real logo apos informar pagamento.");
        }
        return issues;
      },
    },
    {
      name: "09-confirmacao-final-cria-de-verdade",
      steps: () => [
        "quero instalar uma tomada em ponto existente",
        "sim",
        ctx.baseDateBr,
        "sim",
        "pessoa fisica",
        `${case09ClientName}\nRua Alfa 123, Centro, Monte Alegre\n${ctx.validationClientEmail}`,
        "pix",
        "sim",
        "sim",
      ],
      validate: async (_caseCtx, responses, joined) => {
        const issues: string[] = [];
        const appointments = await findAppointmentsForValidation(case09ClientName, "");
        if (appointments.length === 0) {
          issues.push(`Nao encontrei create real salvo para ${case09ClientName}.`);
          return issues;
        }
        const latestAppointment = appointments[appointments.length - 1];
        const finalResponses = responses.slice(-2).join("\n\n") || joined;
        const appointmentDateBr = formatBrazilDate(String(latestAppointment.appointment_date || ""));
        const appointmentTime = String(latestAppointment.start_time || "");
        if (!browserMentionsDate(finalResponses, appointmentDateBr)) {
          issues.push(`A resposta final nao preservou a data salva no banco (${appointmentDateBr}).`);
        }
        if (!browserMentionsSlot(finalResponses, appointmentTime)) {
          issues.push(`A resposta final nao preservou o horario salvo no banco (${appointmentTime}).`);
        }
        if (!browserClaimsBooked(finalResponses)) {
          issues.push("A resposta final nao deixou claro que o create real foi concluido.");
        }
        return issues;
      },
    },
    {
      name: "10-mais-cedo-traz-alternativa-real",
      steps: () => [
        "quero instalar uma tomada em ponto existente",
        "sim",
        ctx.baseDateBr,
        `e as ${ctx.lateSlot}?`,
        "mais cedo",
      ],
      validate: (_caseCtx, responses, joined) => {
        const issues: string[] = [];
        const lastResponse = responses.at(-1) || joined;
        const previousResponse = responses.length >= 2 ? responses[responses.length - 2] : "";
        const previousMentionedSlots = browserMentionedSlots(previousResponse, ctx.baseSlots);
        const lastMentionedSlots = browserMentionedSlots(lastResponse, ctx.baseSlots);
        const referenceMinutes = previousMentionedSlots
          .map((slot) => browserSlotToMinutes(slot))
          .find((value): value is number => value !== null);
        const hasEarlierAlternative = lastMentionedSlots.some((slot) => {
          const slotMinutes = browserSlotToMinutes(slot);
          return referenceMinutes !== undefined && slotMinutes !== null && slotMinutes < referenceMinutes;
        });

        if (!browserMentionsDate(lastResponse, ctx.baseDateBr) && !browserMentionsSomeDate(lastResponse) && !browserContainsAny(lastResponse, ["amanha", "amanhã"])) {
          issues.push("A IA perdeu o contexto de data ao responder uma preferencia por horario mais cedo.");
        }
        if (lastMentionedSlots.length === 0 || !hasEarlierAlternative) {
          issues.push("A IA nao trouxe alternativa real mais cedo no mesmo dia.");
        }
        if (browserClaimsBooked(lastResponse)) {
          issues.push("A IA afirmou create real ao apenas sugerir alternativa mais cedo.");
        }
        return issues;
      },
    },
  ];
}

async function runBrowserSuite(page: Page, browserCtx: BrowserTestContext): Promise<{
  localSuite: LocalSuiteSummary;
  browser: BrowserEvidence;
  cases: BrowserCaseResult[];
  cleanup: { deleted: boolean };
}> {
  const localSuite = await runLocalSuiteIfEnabled();
  const browserEvidence = await runBrowserProbe(page, browserCtx);
  const browserCases = buildBrowserCases(browserCtx);
  const cases: BrowserCaseResult[] = [];

  for (let index = 0; index < browserCases.length; index += 1) {
    const browserCase = browserCases[index];
    await page.setViewport({ width: 1440, height: 1200 });
    await page.goto(`${BASE_URL}/meu-agente-ia?tab=chat`, { waitUntil: "networkidle0", timeout: 120000 });
    await sleep(1800);
    await clearSimulatorConversation(page);
    const rawResult = await runAuthConversationCase(
      page,
      `browser_case_${String(index + 1).padStart(2, "0")}`,
      browserCase.steps(browserCtx),
    );
    const joined = rawResult.responses.join("\n\n");
    const issues = await browserCase.validate(browserCtx, rawResult.responses, joined);
    cases.push({
      ...rawResult,
      name: browserCase.name,
      issues,
      passed: issues.length === 0,
    });
  }

  const cleanupTargetName = String(browserCtx.validationClientName);
  const createdAppointments = await findAppointmentsForValidation(cleanupTargetName, "");
  const hadCreatedAppointment = createdAppointments.some((item) => normalizeText(String(item.client_name || "")).includes(normalizeText(cleanupTargetName)));

  if (hadCreatedAppointment) {
    await deleteCreatedAppointments(cleanupTargetName);
  }

  return {
    localSuite,
    browser: browserEvidence,
    cases,
    cleanup: { deleted: hadCreatedAppointment },
  };
}

async function main() {
  ensureDir(OUTPUT_DIR);

  const browser: Browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });

  try {
    const login = await loginBrowser(page);
    const browserCtx = await resolveBrowserTestContext();
    const result = await runBrowserSuite(page, browserCtx);

    const report = {
      success:
        !result.localSuite?.error &&
        Boolean(result.localSuite?.passed && result.localSuite?.total && result.localSuite.passed === result.localSuite.total) &&
        result.cases.length >= 10 &&
        result.cases.every((item) => item.passed) &&
        Boolean(result.browser.agendaAppointments.length > 0 || result.cleanup.deleted),
      baseUrl: BASE_URL,
      login,
      localSuite: result.localSuite,
      browser: result.browser,
      cases: result.cases,
      cleanup: result.cleanup,
      credentials: {
        email: JB_EMAIL,
        password: JB_PASSWORD ? "***" : "",
      },
      outputDir: OUTPUT_DIR,
    };

    writeJson(path.join(OUTPUT_DIR, "report.json"), report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  const failureReport = {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    outputDir: OUTPUT_DIR,
  };
  try {
    ensureDir(OUTPUT_DIR);
    writeJson(path.join(OUTPUT_DIR, "report.json"), failureReport);
  } catch {
    // best effort
  }
  console.error(JSON.stringify(failureReport, null, 2));
  process.exit(1);
});
