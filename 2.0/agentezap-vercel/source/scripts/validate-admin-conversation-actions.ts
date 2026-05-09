import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { clearClientSession, processAdminMessage } from "../server/adminAgentService";
import { storage } from "../server/storage";

type StepResult = {
  ok: boolean;
  details?: string;
};

type BootstrapResult = {
  ok: boolean;
  conversationId?: string;
  linkedUserId?: string;
  token?: string;
  finalReply?: string;
  error?: string;
};

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "rodrigoconexao128@gmail.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Ibira2019!";
const BASE_URL = (process.env.APP_URL || "https://agentezap.online").replace(/\/+$/, "");
const TEST_PHONE = process.env.UI_TEST_PHONE || "5511998899001";
const CONTACT_NAME = "UI Flow Test";

function expectedCanonicalEmail(phone: string): string {
  return `${String(phone || "").replace(/\D/g, "")}@agentezap.online`;
}

function nowIsoForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function resolveAdminIdByEmail(email: string): Promise<string> {
  const admins = await storage.getAllAdmins();
  const admin = admins.find((item: any) => String(item.email || "").toLowerCase() === email);
  if (!admin?.id) {
    throw new Error(`Admin nao encontrado para email: ${email}`);
  }
  return String(admin.id);
}

async function saveClientMessage(
  adminId: string,
  phone: string,
  contactName: string,
  text: string,
): Promise<{ conversationId: string; messageId: string }> {
  const now = new Date();
  const conversation = await storage.getOrCreateAdminConversation(
    adminId,
    phone,
    `${phone}@s.whatsapp.net`,
    contactName,
  );

  const messageId = `ui-client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await storage.createAdminMessage({
    conversationId: conversation.id,
    messageId,
    fromMe: false,
    text,
    timestamp: now,
    status: "received",
    isFromAgent: false,
  });

  await storage.updateAdminConversation(conversation.id, {
    contactName,
    lastMessageText: text,
    lastMessageTime: now,
    unreadCount: Number(conversation.unreadCount || 0) + 1,
  });

  return { conversationId: conversation.id, messageId };
}

async function saveAgentMessage(conversationId: string, text: string): Promise<string> {
  const now = new Date();
  const messageId = `ui-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await storage.createAdminMessage({
    conversationId,
    messageId,
    fromMe: true,
    text,
    timestamp: now,
    status: "sent",
    isFromAgent: true,
  });

  return messageId;
}

async function pollUntil(
  fn: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs: number = 500,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function bootstrapAccount(adminId: string, phone: string, contactName: string): Promise<BootstrapResult> {
  try {
    await storage.resetClientByPhone(phone);
    clearClientSession(phone);

    const onboarding = [
      "oi, quero criar meu agente agora",
      "minha empresa e lanches ui teste e vendo lanche e marmita",
      "quero resposta rapida e fechar pedido",
      "quero que ele conclua o pedido completo no whatsapp",
      "nao uso agendamento, delivery de segunda a sabado 10:00 as 22:00",
      "ok finaliza e manda meu link de teste",
    ];

    let conversationId: string | undefined;
    let finalReply = "";
    for (const userText of onboarding) {
      const savedClient = await saveClientMessage(adminId, phone, contactName, userText);
      conversationId = savedClient.conversationId;

      const response = await processAdminMessage(phone, userText, undefined, undefined, true, contactName);
      const agentReply = response?.text || "";
      if (agentReply) {
        await saveAgentMessage(savedClient.conversationId, agentReply);
        finalReply = agentReply;
      }
    }

    const conversation = await storage.getAdminConversationByPhone(phone);
    const user = await storage.getUserByPhone(phone);
    const expectedEmail = expectedCanonicalEmail(phone).toLowerCase();
    const emailMatches = String(user?.email || "").toLowerCase() === expectedEmail;
    const hasToken = Boolean(conversation?.lastTestToken);
    const hasLink = /\/test\/[a-z0-9]{8,}/i.test(finalReply);

    if (!conversationId || !conversation?.linkedUserId || !emailMatches || !hasToken || !hasLink) {
      return {
        ok: false,
        conversationId,
        linkedUserId: conversation?.linkedUserId || undefined,
        token: conversation?.lastTestToken || undefined,
        finalReply,
        error: "bootstrap_incompleto",
      };
    }

    return {
      ok: true,
      conversationId,
      linkedUserId: conversation.linkedUserId,
      token: conversation.lastTestToken,
      finalReply,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runPlaywrightFlow(phone: string): Promise<{
  ok: boolean;
  clearButtonVisible: boolean;
  resetButtonVisible: boolean;
  clearButtonLabelOk: boolean;
  resetButtonLabelOk: boolean;
  clearButtonText?: string;
  resetButtonText?: string;
  agentSwitchInitialState?: string;
  agentSwitchAfterOffState?: string;
  agentSwitchAfterOnState?: string;
  toggleOffObserved: boolean;
  toggleOnObserved: boolean;
  clearDialogAccepted: boolean;
  resetToastSeen: boolean;
  screenshotPath?: string;
  error?: string;
}> {
  const screenshotPath = path.resolve("test-results", `ui-actions-${nowIsoForFile()}.png`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  let clearDialogAccepted = false;

  page.on("dialog", async (dialog) => {
    if (/limpar o historico/i.test(dialog.message())) {
      clearDialogAccepted = true;
      await dialog.accept();
      return;
    }
    await dialog.dismiss();
  });

  try {
    await page.goto(`${BASE_URL}/admin#conversations`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(1400);

    if (await page.locator("input[type='email']").count()) {
      await page.locator("input[type='email']").fill(ADMIN_EMAIL);
      await page.locator("input[type='password']").fill(ADMIN_PASSWORD);
      await page.locator("button:has-text('Entrar')").click();
      await page.waitForTimeout(2500);
    }

    await page.goto(`${BASE_URL}/admin#conversations`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(1500);

    const searchInput = page.locator("[data-testid='input-search-admin-conversations']").first();
    await searchInput.fill(phone);
    await page.waitForTimeout(1000);

    const row = page.locator("button.w-full.p-4.text-left").first();
    if (!(await row.count())) {
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return {
        ok: false,
        clearButtonVisible: false,
        resetButtonVisible: false,
        clearDialogAccepted: false,
        resetToastSeen: false,
        screenshotPath,
        error: "row_not_found",
      };
    }
    await row.click({ timeout: 5000 });
    await page.waitForTimeout(1200);

    const clearButton = page.locator("[data-testid='button-clear-conversation-history']").first();
    const resetButton = page.locator("[data-testid='button-reset-linked-account']").first();
    const clearButtonVisible = await clearButton.isVisible();
    const resetButtonVisible = await resetButton.isVisible();
    if (!clearButtonVisible || !resetButtonVisible) {
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return {
        ok: false,
        clearButtonVisible,
        resetButtonVisible,
        clearButtonLabelOk: false,
        resetButtonLabelOk: false,
        toggleOffObserved: false,
        toggleOnObserved: false,
        clearDialogAccepted: false,
        resetToastSeen: false,
        screenshotPath,
        error: "action_buttons_not_visible",
      };
    }

    const clearButtonText = (await clearButton.innerText()).trim();
    const resetButtonText = (await resetButton.innerText()).trim();
    const clearButtonLabelOk = /limpar conversa/i.test(clearButtonText);
    const resetButtonLabelOk = /excluir conta vinculada/i.test(resetButtonText);
    if (!clearButtonLabelOk || !resetButtonLabelOk) {
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return {
        ok: false,
        clearButtonVisible,
        resetButtonVisible,
        clearButtonLabelOk,
        resetButtonLabelOk,
        clearButtonText,
        resetButtonText,
        toggleOffObserved: false,
        toggleOnObserved: false,
        clearDialogAccepted: false,
        resetToastSeen: false,
        screenshotPath,
        error: "action_labels_not_visible",
      };
    }

    const allSwitches = page.locator("button[role='switch']");
    const switchCount = await allSwitches.count();
    const agentSwitch = allSwitches.first();

    const readSwitchState = async (): Promise<string> => {
      const dataState = await agentSwitch.getAttribute("data-state");
      const ariaChecked = await agentSwitch.getAttribute("aria-checked");
      if (dataState === "checked" || ariaChecked === "true") return "checked";
      if (dataState === "unchecked" || ariaChecked === "false") return "unchecked";
      return "unknown";
    };

    if (switchCount < 1) {
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return {
        ok: false,
        clearButtonVisible,
        resetButtonVisible,
        clearButtonLabelOk,
        resetButtonLabelOk,
        clearButtonText,
        resetButtonText,
        toggleOffObserved: false,
        toggleOnObserved: false,
        clearDialogAccepted: false,
        resetToastSeen: false,
        screenshotPath,
        error: "agent_switch_not_found",
      };
    }

    const agentSwitchInitialState = await readSwitchState();

    await agentSwitch.click();
    await page.waitForTimeout(1000);
    const toggleOffObserved = await pollUntil(async () => (await readSwitchState()) === "unchecked", 6000, 400);
    const agentSwitchAfterOffState = await readSwitchState();

    await agentSwitch.click();
    await page.waitForTimeout(1000);
    const toggleOnObserved = await pollUntil(async () => (await readSwitchState()) === "checked", 6000, 400);
    const agentSwitchAfterOnState = await readSwitchState();

    await clearButton.click();
    await page.waitForTimeout(1200);

    await resetButton.click();
    await page.waitForTimeout(500);
    await page.locator("input[placeholder*='Digite DELETAR' i]").fill("DELETAR");
    await page.locator("button:has-text('Confirmar Delete')").click();
    await page.waitForTimeout(2000);

    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    const resetToastSeen = bodyText.includes("reset completo") || bodyText.includes("conta vinculada");

    await page.screenshot({ path: screenshotPath, fullPage: false });

    return {
      ok:
        clearDialogAccepted &&
        resetToastSeen &&
        clearButtonLabelOk &&
        resetButtonLabelOk &&
        toggleOffObserved &&
        toggleOnObserved,
      clearButtonVisible,
      resetButtonVisible,
      clearButtonLabelOk,
      resetButtonLabelOk,
      clearButtonText,
      resetButtonText,
      agentSwitchInitialState,
      agentSwitchAfterOffState,
      agentSwitchAfterOnState,
      toggleOffObserved,
      toggleOnObserved,
      clearDialogAccepted,
      resetToastSeen,
      screenshotPath,
    };
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    return {
      ok: false,
      clearButtonVisible: false,
      resetButtonVisible: false,
      clearButtonLabelOk: false,
      resetButtonLabelOk: false,
      toggleOffObserved: false,
      toggleOnObserved: false,
      clearDialogAccepted,
      resetToastSeen: false,
      screenshotPath,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const report: Record<string, any> = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    adminEmail: ADMIN_EMAIL,
    testPhone: TEST_PHONE,
    steps: {} as Record<string, StepResult>,
  };

  const adminId = await resolveAdminIdByEmail(ADMIN_EMAIL);
  report.adminId = adminId;

  const bootstrap = await bootstrapAccount(adminId, TEST_PHONE, CONTACT_NAME);
  report.bootstrap = bootstrap;
  report.steps.bootstrap = {
    ok: bootstrap.ok,
    details: bootstrap.ok ? "Conta e link inicial criados" : bootstrap.error,
  };

  if (!bootstrap.ok || !bootstrap.conversationId) {
    report.success = false;
    const outPath = path.resolve("test-results", `admin-ui-conversation-actions-${nowIsoForFile()}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(JSON.stringify({ success: false, outPath, reason: "bootstrap_failed" }, null, 2));
    process.exit(2);
  }

  const uiResult = await runPlaywrightFlow(TEST_PHONE);
  report.uiResult = uiResult;
  report.steps.ui_actions = {
    ok: uiResult.ok,
    details: uiResult.error || "UI actions executadas",
  };

  const clearedConversation = await storage.getAdminConversationByPhone(TEST_PHONE);
  const userAfterDelete = await storage.getUserByPhone(TEST_PHONE);
  report.afterDelete = {
    conversationExists: Boolean(clearedConversation),
    userExists: Boolean(userAfterDelete),
  };
  report.steps.after_delete = {
    ok: !clearedConversation && !userAfterDelete,
    details: `conversation=${Boolean(clearedConversation)} user=${Boolean(userAfterDelete)}`,
  };

  const recreated = await bootstrapAccount(adminId, TEST_PHONE, CONTACT_NAME);
  report.recreated = recreated;
  report.steps.recreate = {
    ok: recreated.ok,
    details: recreated.ok ? "Conta recriada com sucesso" : recreated.error,
  };

  report.success = Object.values(report.steps as Record<string, StepResult>).every((step) => step.ok);

  const outPath = path.resolve("test-results", `admin-ui-conversation-actions-${nowIsoForFile()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify({ success: report.success, outPath, report }, null, 2));
  process.exit(report.success ? 0 : 2);
}

main().catch((error) => {
  console.error("[admin-ui-conversation-actions] failed", error);
  process.exit(1);
});
