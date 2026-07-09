import { editarPromptComHistorico } from './promptHistoryService';
import { insertAgentMedia } from './mediaService';
import {
  buildPublicDestinationUrl,
  generateAutologinLinkWithRetry,
} from './autologinService';
import { storage } from './storage';
import { pool } from './db';
import { uploadMediaToStorage, isBase64Url } from './mediaStorageService';
import {
  createTestAccountWithCredentials,
  getClientSession,
  updateClientSession,
  createClientSession,
  generateTestToken,
} from './adminAgentService';
import { generatePixQRCode } from './pixService';
import {
  getPendingActionExecutionPolicy,
  isTechnicalFailureMessage,
  type PendingActionExecutionType,
} from './adminPendingActionExecutionPolicy';

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Helpers
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/**
 * Busca o token de simulador mais recente para um userId
 */
export async function getSimulatorTokenForUser(userId: string): Promise<string | null> {
  try {
    const result = await pool.query(
      `SELECT token FROM admin_test_tokens
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    return result.rows[0]?.token || null;
  } catch (e) {
    console.warn('[ExecutorV2] Erro ao buscar simulator token:', e);
    return null;
  }
}

/**
 * Monta o link do simulador a partir de um token
 */
function canonicalizeAgenteZapPublicBaseUrl(value?: string): string {
  const raw = String(value || 'https://www.agentezap.online').trim() || 'https://www.agentezap.online';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (parsed.hostname.toLowerCase() === 'agentezap.online') {
      parsed.hostname = 'www.agentezap.online';
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return raw.replace(/^http:\/\//i, 'https://').replace(/\/+$/, '');
  }
}

export function buildSimulatorUrl(token: string): string {
  const baseUrl = canonicalizeAgenteZapPublicBaseUrl(process.env.APP_URL);
  return `${baseUrl}/test/${token}`;
}

async function getSimulatorIdentityForUser(userId: string): Promise<{
  agentName: string;
  company: string;
}> {
  const agentConfig = await storage.getAgentConfig(userId).catch(() => null);

  return {
    agentName:
      firstNonEmptyString(
        (agentConfig as any)?.agentName,
        (agentConfig as any)?.name,
        (agentConfig as any)?.agentDisplayName,
        'Agente',
      ) || 'Agente',
    company:
      firstNonEmptyString(
        (agentConfig as any)?.company,
        (agentConfig as any)?.businessName,
        (agentConfig as any)?.nomeEmpresa,
        'Empresa',
      ) || 'Empresa',
  };
}

export async function getOrCreateSimulatorUrlForUser(userId: string): Promise<string> {
  const existingToken = await getSimulatorTokenForUser(userId);
  if (existingToken) {
    return buildSimulatorUrl(existingToken);
  }

  const identity = await getSimulatorIdentityForUser(userId);
  const createdToken = await generateTestToken(userId, identity.agentName, identity.company);
  return buildSimulatorUrl(createdToken.token);
}

const DEFAULT_MEDIA_MIME_TYPES: Record<string, string> = {
  image: 'image/jpeg',
  video: 'video/mp4',
  audio: 'audio/ogg; codecs=opus',
  document: 'application/octet-stream',
};

const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/ogg; codecs=opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

function firstNonEmptyString(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function normalizeCustomerEmailForCreateAgent(value: unknown): string {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  if (email.endsWith('@agentezap.online')) return '';
  if (['eu@email.com', 'seu@email.com', 'email@email.com', 'teste@teste.com'].includes(email)) return '';
  if (/@(?:example|exemplo)\./i.test(email)) return '';
  return email;
}

function extractCustomerEmailFromCreateAgentPayload(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    const direct = normalizeCustomerEmailForCreateAgent(value);
    if (direct) return direct;

    const text = String(value ?? '');
    if (!text || !text.includes('@')) continue;

    const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    for (const match of matches) {
      const normalized = normalizeCustomerEmailForCreateAgent(match);
      if (normalized) return normalized;
    }
  }

  return undefined;
}

function buildCreateAgentPromptContext(params: {
  serviceDescription?: string;
  sourceCustomerBrief?: string;
}): string {
  const serviceDescription = String(params.serviceDescription || '').trim();
  const sourceCustomerBrief = String(params.sourceCustomerBrief || '').trim();
  if (!sourceCustomerBrief) return serviceDescription;
  if (!serviceDescription) return sourceCustomerBrief.slice(0, 24000);

  const fingerprint = sourceCustomerBrief.slice(0, 240);
  if (fingerprint && serviceDescription.includes(fingerprint)) {
    return serviceDescription.slice(0, 24000);
  }

  return [
    serviceDescription,
    '<briefing_original_cliente>',
    sourceCustomerBrief,
    '</briefing_original_cliente>',
  ].join('\n\n').slice(0, 24000);
}

function normalizeCommercialToken(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldUsePromo49Pricing(payload?: Record<string, any>): boolean {
  const commercialContext = normalizeCommercialToken(
    [
      payload?.requestText,
      payload?.messageText,
      payload?.userMessage,
      payload?.currentMessage,
      payload?.conversationContext,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (!commercialContext) {
    return false;
  }

  return (
    (commercialContext.includes("r$49") || commercialContext.includes(" 49 ") || commercialContext.endsWith(" 49")) &&
    (
      commercialContext.includes("agentezap") ||
      commercialContext.includes("plano") ||
      commercialContext.includes("mensal") ||
      commercialContext.includes("valor") ||
      commercialContext.includes("interesse")
    )
  );
}

function normalizeMimeType(mediaType: string, ...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_MEDIA_MIME_TYPES[mediaType] || 'application/octet-stream';
}

function getFileExtension(mimeType: string): string {
  const normalized = mimeType.split(';')[0].trim().toLowerCase();
  return MIME_TYPE_TO_EXTENSION[mimeType.toLowerCase()] || MIME_TYPE_TO_EXTENSION[normalized] || 'bin';
}

function buildLibraryFileName(sourceUrl: string, mediaType: string, mimeType: string): string {
  if (!isBase64Url(sourceUrl)) {
    try {
      const url = new URL(sourceUrl);
      const originalName = url.pathname.split('/').pop();
      if (originalName) {
        return decodeURIComponent(originalName);
      }
    } catch {
      // Ignore URL parsing errors and fall back to generated filename
    }
  }

  return `media-${Date.now()}.${getFileExtension(mimeType)}`;
}

async function ingestMediaForLibrary(params: {
  userId: string;
  sourceUrl: string;
  mediaType: string;
  mimeTypeHint?: string;
}): Promise<{
  storageUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}> {
  const { userId, sourceUrl, mediaType, mimeTypeHint } = params;

  let buffer: Buffer;
  let detectedMimeType: string;

  if (isBase64Url(sourceUrl)) {
    const matches = sourceUrl.match(/^data:([^,]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Formato base64 de mÃƒÂ­dia invÃƒÂ¡lido');
    }

    detectedMimeType = normalizeMimeType(mediaType, mimeTypeHint, matches[1]);
    buffer = Buffer.from(matches[2], 'base64');
  } else {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Falha ao baixar mÃƒÂ­dia original: ${response.status} ${response.statusText}`);
    }

    detectedMimeType = normalizeMimeType(
      mediaType,
      mimeTypeHint,
      response.headers.get('content-type'),
    );
    buffer = Buffer.from(await response.arrayBuffer());
  }

  if (!buffer.length) {
    throw new Error('A mÃƒÂ­dia recebida estÃƒÂ¡ vazia');
  }

  const uploadResult = await uploadMediaToStorage(buffer, detectedMimeType, userId);
  if (!uploadResult?.url) {
    throw new Error('Falha ao reenviar mÃƒÂ­dia para o storage do cliente');
  }

  return {
    storageUrl: uploadResult.url,
    fileName: buildLibraryFileName(sourceUrl, mediaType, detectedMimeType),
    fileSize: uploadResult.size,
    mimeType: detectedMimeType,
  };
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Types
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export interface PendingAction {
  /**
   * 'edit_prompt' and 'save_media' are used for stored confirmation flows.
   * 'GERAR_LINK_CONEXAO', 'INFORMAR_PLANOS', 'NENHUMA' are ephemeral action
   * types produced by the orchestrator and passed directly to executeAction
   * when requerConfirmacao = false.
   */
  type: PendingActionExecutionType;
  payload: Record<string, any>;
  proposedText: string;
  expiresAt: number;
}

async function waitBeforeRetry(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function executeSensitiveActionWithRetry(
  actionType: PendingActionExecutionType,
  run: () => Promise<{ success: boolean; responseText: string }>,
): Promise<{ success: boolean; responseText: string }> {
  const policy = getPendingActionExecutionPolicy(actionType);
  let lastResult: { success: boolean; responseText: string } | null = null;
  let lastError = '';

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      const result = await run();
      lastResult = result;

      if (result.success || !isTechnicalFailureMessage(result.responseText) || attempt === policy.maxAttempts) {
        return result;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error || '');
      if (attempt === policy.maxAttempts) {
        break;
      }
    }

    await waitBeforeRetry(policy.retryBaseDelayMs * attempt);
  }

  if (lastResult) {
    return lastResult;
  }

  return {
    success: false,
    responseText: '',
  };
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Constants
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function getSafeAutologinUrl(userId: string | undefined, destination: '/conexao' | '/plans'): Promise<string> {
  if (userId && userId.length > 10) {
    try {
      return await generateAutologinLinkWithRetry(userId, destination);
    } catch (error) {
      console.warn(`[ExecutorV2] Falha ao gerar auto-login para ${destination}, usando link pÃƒÂºblico:`, error);
    }
  }

  return buildPublicDestinationUrl(destination);
}

function normalizeValidationText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasCreatedAgentValidationFailureText(text: string): boolean {
  const normalized = normalizeValidationText(text);
  if (!normalized) return true;
  return [
    /instabilidade/,
    /tente novamente/,
    /erro interno/,
    /falha interna/,
    /\bcodex\b/,
    /\bruntime\b/,
    /\bendpoint\b/,
    /\bapi\b/,
    /\bcli\b/,
    /\bprompt\b/,
  ].some((pattern) => pattern.test(normalized));
}

function buildCreatedAgentValidationMessages(params: {
  payload: Record<string, any>;
  session: NonNullable<ReturnType<typeof getClientSession>>;
}): string[] {
  const companyName = firstNonEmptyString(
    params.payload.nomeEmpresa,
    params.payload.companyName,
    params.payload.company,
    params.session.agentConfig?.company,
  ) || "sua empresa";
  const segment = firstNonEmptyString(
    params.payload.ramoAtuacao,
    params.payload.businessSegment,
    params.payload.businessType,
    params.session.agentConfig?.role,
  ) || "atendimento";

  return [
    `Oi, quero entender o atendimento da ${companyName}.`,
    `Tenho interesse em ${segment}. Como voces costumam ajudar um cliente novo?`,
    "Tenho uma situacao concreta e queria saber o proximo passo. Quais informacoes voce precisa de mim?",
    "Pode resumir como seguimos daqui e quando alguem humano entra se precisar?",
  ];
}

async function validateCreatedAgentBeforeDelivery(params: {
  userId: string;
  simulatorToken: string;
  session: NonNullable<ReturnType<typeof getClientSession>>;
  payload: Record<string, any>;
}): Promise<{ turns: number; transcript: Array<{ user: string; assistant: string }> }> {
  const { runWebOnlyAgentTestForUser } = await import("../api/http");
  const messages = buildCreatedAgentValidationMessages({
    payload: params.payload || {},
    session: params.session,
  });
  const timeoutMs = Math.max(
    30_000,
    Math.min(Number(process.env.AGENTEZAP_CREATE_AGENT_VALIDATION_TIMEOUT_MS || 90_000), 90_000),
  );
  const sessionId = `codex-create-validation-${params.userId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  const transcript: Array<{ user: string; assistant: string }> = [];

  for (const message of messages) {
    const result = await runWebOnlyAgentTestForUser(params.userId, {
      message,
      history,
      sessionId,
      conversationId: sessionId,
      testConversationKey: sessionId,
      token: params.simulatorToken,
      contactName: "Cliente de validacao",
      contactPhone: params.session.phoneNumber,
      skipAccessCheck: true,
      agenticRuntimeEnabled: true,
      llmProviderTimeoutMs: timeoutMs,
    });
    const payload = result?.payload || {};
    const responseText = String(
      payload.response ||
      (Array.isArray(payload.splitResponses) ? payload.splitResponses.join("\n\n") : "") ||
      "",
    ).trim();

    if (Number(result?.status || 500) !== 200 || hasCreatedAgentValidationFailureText(responseText)) {
      throw new Error(`created_agent_validation_failed:${Number(result?.status || 500)}:${responseText.slice(0, 180)}`);
    }

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: responseText });
    transcript.push({ user: message, assistant: responseText });
  }

  return {
    turns: transcript.length,
    transcript,
  };
}

export interface CodexCreateAgentExecutionArtifacts {
  userId: string;
  simulatorToken: string;
  simulatorUrl: string;
  validationTurns: number;
  validationTranscript: Array<{ user: string; assistant: string }>;
  isExistingAccount: boolean;
  companyName?: string;
}

export interface CodexCreateAgentExecutionResult {
  success: boolean;
  responseText: string;
  validationTurns?: number;
  artifacts?: CodexCreateAgentExecutionArtifacts;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Main
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export interface CodexCreateAgentContract {
  phoneNumber: string;
  payload: Record<string, any>;
}

export async function executeCodexCreateAgentContract(
  contract: CodexCreateAgentContract,
): Promise<CodexCreateAgentExecutionResult> {
  try {
    const payload = contract.payload || {};
    const phoneNumber = String(contract.phoneNumber || payload.phoneNumber || '').trim();
    if (!phoneNumber) {
      return { success: false, responseText: '' };
    }

    let session = getClientSession(phoneNumber);
    if (!session) {
      session = createClientSession(phoneNumber);
    }

    const agentConfig = { ...session.agentConfig };
    const resolvedCompanyName = firstNonEmptyString(
      payload.nomeEmpresa,
      payload.companyName,
      payload.company,
      payload.businessName,
      payload.nomeNegocio,
    );
    const resolvedBusinessSegment = firstNonEmptyString(
      payload.ramoAtuacao,
      payload.businessSegment,
      payload.businessType,
      payload.segment,
      payload.ramo,
    );
    const resolvedServiceDescription = firstNonEmptyString(
      payload.descricaoAtendimento,
      payload.attendanceDescription,
      payload.promptDescription,
      payload.instructions,
      payload.prompt,
    );
    const resolvedSourceCustomerBrief = firstNonEmptyString(
      payload.sourceCustomerBrief,
      payload.originalCustomerBrief,
      payload.customerBrief,
      payload.fullCustomerContext,
    );
    const resolvedCustomerEmail = extractCustomerEmailFromCreateAgentPayload(
      payload.customerEmail,
      payload.email,
      payload.leadEmail,
      payload.contactEmail,
      payload.accountEmail,
      payload.sourceCustomerBrief,
      payload.originalCustomerBrief,
      payload.customerBrief,
      payload.fullCustomerContext,
      payload.descricaoAtendimento,
      payload.attendanceDescription,
      payload.promptDescription,
      payload.instructions,
      payload.prompt,
    );

    if (resolvedCompanyName) {
      agentConfig.company = resolvedCompanyName;
    }
    if (resolvedBusinessSegment) {
      agentConfig.role = resolvedBusinessSegment;
    }
    if (resolvedServiceDescription || resolvedSourceCustomerBrief) {
      agentConfig.prompt = buildCreateAgentPromptContext({
        serviceDescription: resolvedServiceDescription,
        sourceCustomerBrief: resolvedSourceCustomerBrief,
      });
      agentConfig.serviceDescription = resolvedServiceDescription || resolvedSourceCustomerBrief;
      if (resolvedSourceCustomerBrief) {
        agentConfig.sourceCustomerBrief = resolvedSourceCustomerBrief;
      }
    }
    if (resolvedCustomerEmail) {
      agentConfig.customerEmail = resolvedCustomerEmail;
    }
    agentConfig.codexCreateAgentContract = true;
    if (!agentConfig.sourceCustomerBrief) {
      agentConfig.sourceCustomerBrief = firstNonEmptyString(
        resolvedSourceCustomerBrief,
        resolvedServiceDescription,
        agentConfig.prompt,
      );
    }
    if (!agentConfig.serviceDescription) {
      agentConfig.serviceDescription = firstNonEmptyString(
        resolvedServiceDescription,
        resolvedSourceCustomerBrief,
        agentConfig.prompt,
      );
    }

    session = updateClientSession(phoneNumber, { agentConfig });
    console.log(`[ExecutorV2] Aplicando contrato Codex de agente para ${phoneNumber}: empresa=${agentConfig.company}, ramo=${agentConfig.role}`);

    const testResult = await createTestAccountWithCredentials(session);
    if (!testResult.success || !testResult.email || !testResult.simulatorToken || !testResult.userId) {
      return {
        success: false,
        responseText: '',
      };
    }

    let validationResult: Awaited<ReturnType<typeof validateCreatedAgentBeforeDelivery>>;
    try {
      validationResult = await validateCreatedAgentBeforeDelivery({
        userId: testResult.userId,
        simulatorToken: testResult.simulatorToken,
        session,
        payload,
      });
    } catch (validationError: any) {
      console.warn('[ExecutorV2] Validacao do agente materializado falhou antes do envio do link:', validationError?.message || validationError);
      return {
        success: false,
        responseText: '',
      };
    }

    const credentials = {
      email: testResult.email,
      password: testResult.password,
      loginUrl: testResult.loginUrl || 'https://agentezap.online',
      simulatorToken: testResult.simulatorToken,
      isExistingAccount: testResult.isExistingAccount === true,
    };

    updateClientSession(phoneNumber, {
      flowState: 'active',
      email: credentials.email,
      lastGeneratedPassword: credentials.password,
    });

    const artifacts: CodexCreateAgentExecutionArtifacts = {
      userId: testResult.userId,
      simulatorToken: credentials.simulatorToken,
      simulatorUrl: buildSimulatorUrl(credentials.simulatorToken),
      validationTurns: validationResult.turns,
      validationTranscript: validationResult.transcript,
      isExistingAccount: credentials.isExistingAccount === true,
      companyName: firstNonEmptyString(session.agentConfig?.company, agentConfig.company),
    };

    console.log(`[ExecutorV2] Contrato Codex de agente materializado e validado: ${credentials.email} (token: ${credentials.simulatorToken}, turns=${validationResult.turns})`);

    return {
      success: true,
      responseText: '',
      validationTurns: validationResult.turns,
      artifacts,
    };
  } catch (e: any) {
    console.error('[ExecutorV2] Erro ao aplicar contrato Codex de agente:', e);
    return { success: false, responseText: '' };
  }
}

export async function executeAction(
  pendingAction: PendingAction,
  userId: string,
): Promise<{ success: boolean; responseText: string; artifacts?: CodexCreateAgentExecutionArtifacts }> {
  console.log(`[ExecutorV2] Executando aÃƒÂ§ÃƒÂ£o tipo="${pendingAction.type}" para userId=${userId}`);

  switch (pendingAction.type) {
    // Ã¢â€â‚¬Ã¢â€â‚¬ Editar prompt do agente Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    case 'edit_prompt': {
      try {
        const agentConfig = await storage.getAgentConfig(userId);
        const promptAtual = agentConfig?.prompt || '';        const instrucao = String(pendingAction.payload.descricaoMudanca || '');

        console.log(`[ExecutorV2] Editando prompt (${promptAtual.length} chars) com instruÃƒÂ§ÃƒÂ£o: "${instrucao.slice(0, 80)}..."`);
        const result = await editarPromptComHistorico(userId, promptAtual, instrucao, '');

        if (result.resultado.success) {
          return {
            success: true,
            responseText: '',
          };
        } else {
          const err = (result.resultado as any).error || 'erro desconhecido';
          console.warn('[ExecutorV2] editarPromptComHistorico retornou failure:', err);
          return { success: false, responseText: '' };
        }
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao editar prompt:', e);
        return { success: false, responseText: '' };
      }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Salvar mÃƒÂ­dia na biblioteca Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    case 'save_media': {
      try {
        const sourceUrl: string = String(pendingAction.payload.mediaUrl || pendingAction.payload.storageUrl || '').trim();
        const storageUrl = sourceUrl;
        const whenToUse: string = String(pendingAction.payload.whenToUse || '').trim();
        const mediaType: string = String(pendingAction.payload.mediaType || 'image').trim().toLowerCase();

        if (mediaType === 'flow') {
          const rawFlowItems = Array.isArray(pendingAction.payload.flowItems)
            ? pendingAction.payload.flowItems
            : [];

          if (!whenToUse || rawFlowItems.length < 2) {
            return {
              success: false,
              responseText: '',
            };
          }

          const normalizedFlowItems: any[] = [];
          for (let index = 0; index < rawFlowItems.length; index++) {
            const item = rawFlowItems[index] || {};
            const itemType = String(item.type || '').trim().toLowerCase();

            if (itemType === 'text') {
              const text = String(item.text || '').trim();
              if (!text) {
                return {
                  success: false,
                  responseText: '',
                };
              }

              normalizedFlowItems.push({
                id: String(item.id || `flow-text-${index}`),
                order: index,
                type: 'text',
                text,
              });
              continue;
            }

            const itemUrl = String(item.storageUrl || item.mediaUrl || '').trim();
            const itemMediaType = String(item.mediaType || '').trim().toLowerCase();
            if (itemType !== 'media' || !itemUrl || !itemMediaType) {
              return {
                success: false,
                responseText: '',
              };
            }

            const ingestedItem = await ingestMediaForLibrary({
              userId,
              sourceUrl: itemUrl,
              mediaType: itemMediaType,
              mimeTypeHint: String(item.mimeType || '').trim() || undefined,
            });

            normalizedFlowItems.push({
              id: String(item.id || `flow-media-${index}`),
              order: index,
              type: 'media',
              storageUrl: ingestedItem.storageUrl,
              mediaType: itemMediaType,
              caption: String(item.caption || '').trim() || undefined,
              fileName: String(item.fileName || '').trim() || ingestedItem.fileName,
              mimeType: ingestedItem.mimeType,
            });
          }

          const flowInserted = await insertAgentMedia({
            userId,
            name: String(pendingAction.payload.name || '').trim() || `Fluxo ${new Date().toLocaleDateString('pt-BR')}`,
            storageUrl: '',
            mediaType: 'flow',
            whenToUse,
            description: String(pendingAction.payload.description || '').trim() || whenToUse,
            flowItems: normalizedFlowItems,
            isActive: true,
            sendAlone: false,
            displayOrder: 0,
          } as any);

          if (flowInserted) {
            return {
              success: true,
              responseText: '',
            };
          }

          return { success: false, responseText: '' };
        }

        // Validate required context: both URL and usage description must be present
        if (!sourceUrl || !whenToUse) {
          console.log('[ExecutorV2] MÃƒÂ­dia incompleta: faltam URL ou contexto de uso');
          return {
            success: false,
            responseText: '',
          };
        }

        const name: string =
          String(pendingAction.payload.name || '').trim() ||
          `MÃƒÂ­dia ${new Date().toLocaleDateString('pt-BR')}`;
        const description: string =
          String(pendingAction.payload.description || '').trim() || whenToUse;

        console.log(`[ExecutorV2] Salvando mÃƒÂ­dia "${name}" tipo "${mediaType}" com contexto: "${whenToUse.slice(0, 50)}..."`);
        const ingestedMedia = await ingestMediaForLibrary({
          userId,
          sourceUrl,
          mediaType,
          mimeTypeHint: String(pendingAction.payload.mimeType || '').trim() || undefined,
        });
        const parsedDuration = Number(pendingAction.payload.durationSeconds);
        const inserted = await insertAgentMedia({
          userId,
          name,
          storageUrl: ingestedMedia.storageUrl,
          mediaType,
          whenToUse,
          description,
          fileName: String(pendingAction.payload.fileName || '').trim() || ingestedMedia.fileName,
          fileSize: ingestedMedia.fileSize,
          mimeType: ingestedMedia.mimeType,
          durationSeconds: Number.isFinite(parsedDuration) ? parsedDuration : undefined,
          caption: String(pendingAction.payload.caption || '').trim() || undefined,
          transcription: String(pendingAction.payload.transcription || '').trim() || undefined,
          isPtt: mediaType === 'audio' ? pendingAction.payload.isPtt !== false : undefined,
        });

        if (inserted) {
          return {
            success: true,
            responseText: '',
          };
        } else {
          return { success: false, responseText: '' };
        }
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao salvar mÃƒÂ­dia:', e);
        return { success: false, responseText: '' };
      }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Gerar link de conexÃƒÂ£o (autologin) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    case 'GERAR_LINK_CONEXAO': {
      try {
        console.log('[ExecutorV2] Gerando link de conexÃƒÂ£o para userId:', userId);
        await getSafeAutologinUrl(userId, '/conexao');
        return {
          success: true,
          responseText: '',
        };
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao gerar link de conexÃƒÂ£o:', e);
        return {
          success: false,
          responseText: '',
        };
      }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Gerar link de planos (autologin) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    case 'GERAR_LINK_PLANOS': {
      try {
        console.log('[ExecutorV2] Gerando link de planos para userId:', userId);
        const promo49 = shouldUsePromo49Pricing(pendingAction.payload);
        if (!promo49) {
          await getSafeAutologinUrl(userId, '/plans');
        }
        return {
          success: true,
          responseText: '',
        };
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao gerar link de planos:', e);
        return {
          success: false,
          responseText: '',
        };
      }
    }
    // Ã¢â€â‚¬Ã¢â€â‚¬ Informar planos Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    case 'INFORMAR_PLANOS': {
      console.log('[ExecutorV2] Retornando informaÃƒÂ§ÃƒÂµes de planos');
      const promo49 = shouldUsePromo49Pricing(pendingAction.payload);

      if (!promo49 && userId && userId.length > 10) {
        try {
          await getSafeAutologinUrl(userId, '/plans');
        } catch (error) {
          console.warn('[ExecutorV2] Falha ao gerar auto login de planos, usando link padrÃƒÂ£o:', error);
        }
      }

      return {
        success: true,
        responseText: '',
      };
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Sem aÃƒÂ§ÃƒÂ£o (resposta livre do LLM) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    case 'NENHUMA': {
      console.log('[ExecutorV2] Tipo NENHUMA Ã¢â‚¬â€ retornando proposedText');
      return { success: true, responseText: pendingAction.proposedText };
    }

    case 'codex_create_agent_contract': {
      return executeCodexCreateAgentContract({
        phoneNumber: String(pendingAction.payload.phoneNumber || '').trim(),
        payload: pendingAction.payload,
      });
    }

    case 'registrar_pagamento': {
      try {
        const phoneNumber = String(pendingAction.payload.phoneNumber || '').trim();
        const comprovanteUrl = String(pendingAction.payload.comprovanteUrl || '').trim();
        const valorInformado = String(pendingAction.payload.valorInformado || '').trim();
        const paymentId = String(pendingAction.payload.paymentId || '').trim();
        const mimeTypeHint = String(pendingAction.payload.mimeType || '').trim();

        if (!comprovanteUrl) {
          return {
            success: false,
            responseText: '',
          };
        }

        await registerPaymentReceiptFromWhatsApp({
          userId,
          phoneNumber,
          sourceUrl: comprovanteUrl,
          amount: valorInformado || undefined,
          paymentId: paymentId || undefined,
          mimeTypeHint: mimeTypeHint || undefined,
        });

        if (phoneNumber) {
          updateClientSession(phoneNumber, {
            flowState: 'payment_pending' as any,
            awaitingPaymentProof: false,
          });
        }

        return {
          success: true,
          responseText: '',
        };
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao registrar pagamento:', e);
        return { success: false, responseText: '' };
      }
    }
    default: {
      console.warn('[ExecutorV2] Tipo de aÃƒÂ§ÃƒÂ£o desconhecido:', (pendingAction as any).type);
      return { success: false, responseText: '' };
    }
  }
}

