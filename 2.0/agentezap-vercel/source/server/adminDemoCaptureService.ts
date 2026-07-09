import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

export interface DemoCaptureOptions {
  simulatorLink: string;
  includeScreenshot?: boolean;
  includeVideo?: boolean;
  scenarioMessages?: string[];
}

export interface DemoCaptureResult {
  success: boolean;
  screenshotUrl?: string;
  videoUrl?: string;
  screenshotPath?: string;
  videoPath?: string;
  error?: string;
}

const DEFAULT_MESSAGES = [
  "Oi, quero testar como voce atende meus clientes.",
  "Tambem preciso de agendamento e envio de cardapio.",
  "Mostra um exemplo de resposta para cliente indeciso.",
];

const VIEWPORT = { width: 430, height: 920 };
const NAV_TIMEOUT_MS = 45000;
const WAIT_BETWEEN_MESSAGES_MS = 3200;
const WAIT_AFTER_OPEN_MS = 4000;

function safeSuffix(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "demo";
}

function buildPublicBaseUrl(preferredUrl?: string): string {
  const appUrl = (process.env.APP_URL || "").trim();
  if (appUrl) {
    return appUrl.replace(/\/+$/, "");
  }

  if (preferredUrl) {
    try {
      return new URL(preferredUrl).origin;
    } catch {
      // Ignore invalid fallback URLs and use the default public domain below.
    }
  }

  return "https://agentezap.online";
}

function buildPublicUrl(relativePath: string, preferredUrl?: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${buildPublicBaseUrl(preferredUrl)}/${normalized}`;
}

async function ensureDir(dirPath: string): Promise<void> {
  if (!fs.existsSync(dirPath)) {
    await fsp.mkdir(dirPath, { recursive: true });
  }
}

async function waitForSimulatorInput(page: any): Promise<void> {
  const locator = page.locator('input[placeholder*="Digite uma mensagem"]');
  await locator.first().waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
}

async function sendScenarioMessages(page: any, messages: string[]): Promise<void> {
  const input = page.locator('input[placeholder*="Digite uma mensagem"]').first();
  for (const message of messages) {
    await input.fill(message);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(WAIT_BETWEEN_MESSAGES_MS);
  }
}

export async function generateSimulatorDemoCapture(
  options: DemoCaptureOptions,
): Promise<DemoCaptureResult> {
  const includeScreenshot = options.includeScreenshot !== false;
  const includeVideo = options.includeVideo === true;

  if (!includeScreenshot && !includeVideo) {
    return { success: false, error: "Nenhum formato solicitado para demo" };
  }

  const uploadsRoot = path.join(process.cwd(), "uploads");
  const demoDir = path.join(uploadsRoot, "admin-demos");
  const videoTempDir = path.join(demoDir, "tmp-videos");

  await ensureDir(demoDir);
  await ensureDir(videoTempDir);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = safeSuffix(options.simulatorLink.split("/").pop() || "demo");

  const screenshotFileName = `simulator-demo-${suffix}-${stamp}.png`;
  const screenshotAbsPath = path.join(demoDir, screenshotFileName);

  const videoFileName = `simulator-demo-${suffix}-${stamp}.webm`;
  const videoAbsPath = path.join(demoDir, videoFileName);

  let browser: any = null;
  let context: any = null;
  let page: any = null;
  let videoRef: any = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    context = await browser.newContext({
      viewport: VIEWPORT,
      ...(includeVideo
        ? {
            recordVideo: {
              dir: videoTempDir,
              size: VIEWPORT,
            },
          }
        : {}),
    });

    page = await context.newPage();
    videoRef = page.video();

    await page.goto(options.simulatorLink, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });

    await waitForSimulatorInput(page);
    await page.waitForTimeout(WAIT_AFTER_OPEN_MS);

    const messages =
      options.scenarioMessages && options.scenarioMessages.length > 0
        ? options.scenarioMessages.slice(0, 4)
        : DEFAULT_MESSAGES;

    await sendScenarioMessages(page, messages);

    if (includeScreenshot) {
      await page.screenshot({ path: screenshotAbsPath, fullPage: false });
    }

    await context.close();

    let copiedVideo = false;
    if (includeVideo && videoRef) {
      try {
        const rawVideoPath = await videoRef.path();
        if (rawVideoPath && fs.existsSync(rawVideoPath)) {
          await fsp.copyFile(rawVideoPath, videoAbsPath);
          copiedVideo = true;
        }
      } catch (videoError) {
        console.error("[ADMIN DEMO] Falha ao materializar video:", videoError);
      }
    }

    const screenshotRelative = `uploads/admin-demos/${screenshotFileName}`;
    const videoRelative = `uploads/admin-demos/${videoFileName}`;

    return {
      success: true,
      screenshotPath: includeScreenshot ? screenshotAbsPath : undefined,
      screenshotUrl:
        includeScreenshot && fs.existsSync(screenshotAbsPath)
          ? buildPublicUrl(screenshotRelative, options.simulatorLink)
          : undefined,
      videoPath: copiedVideo ? videoAbsPath : undefined,
      videoUrl: copiedVideo ? buildPublicUrl(videoRelative, options.simulatorLink) : undefined,
    };
  } catch (error) {
    console.error("[ADMIN DEMO] Erro ao gerar captura do simulador:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try {
      if (context) {
        await context.close();
      }
    } catch {}

    try {
      if (browser) {
        await browser.close();
      }
    } catch {}
  }
}
