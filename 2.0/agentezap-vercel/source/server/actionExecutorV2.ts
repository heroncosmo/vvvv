import { editarPromptComHistorico } from './promptHistoryService';
import { insertAgentMedia } from './mediaService';
import {
  buildPublicDestinationUrl,
  generateAutologinLinkWithRetry,
} from './autologinService';
import { storage } from './storage';
import { getLLMConfig } from './llm';
import { pool } from './db';
import { uploadMediaToStorage, isBase64Url } from './mediaStorageService';
import {
  createTestAccountWithCredentials,
  buildStructuredAccountDeliveryText,
  getClientSession,
  updateClientSession,
  createClientSession,
  generateTestToken,
} from './adminAgentService';
import { generatePixQRCode } from './pixService';
import {
  buildAdminPlanReplyText,
  detectAdminPlanFocusFromText,
  getAdminPlanDefaultUrl,
  type AdminPlanFocus,
} from './adminPlanPricing';
import {
  getPendingActionExecutionPolicy,
  isTechnicalFailureMessage,
  type PendingActionExecutionType,
} from './adminPendingActionExecutionPolicy';
import { buildAdminPanelPitch, clampAdminReplyLength } from './adminReplyPolicy';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
export function buildSimulatorUrl(token: string): string {
  const baseUrl = (process.env.APP_URL || 'https://agentezap.online').replace(/\/+$/, '');
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
      throw new Error('Formato base64 de mídia inválido');
    }

    detectedMimeType = normalizeMimeType(mediaType, mimeTypeHint, matches[1]);
    buffer = Buffer.from(matches[2], 'base64');
  } else {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Falha ao baixar mídia original: ${response.status} ${response.statusText}`);
    }

    detectedMimeType = normalizeMimeType(
      mediaType,
      mimeTypeHint,
      response.headers.get('content-type'),
    );
    buffer = Buffer.from(await response.arrayBuffer());
  }

  if (!buffer.length) {
    throw new Error('A mídia recebida está vazia');
  }

  const uploadResult = await uploadMediaToStorage(buffer, detectedMimeType, userId);
  if (!uploadResult?.url) {
    throw new Error('Falha ao reenviar mídia para o storage do cliente');
  }

  return {
    storageUrl: uploadResult.url,
    fileName: buildLibraryFileName(sourceUrl, mediaType, detectedMimeType),
    fileSize: uploadResult.size,
    mimeType: detectedMimeType,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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
    responseText: `Ocorreu um erro interno ao concluir ${actionType}.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

function getPLANS_INFO(): string {
  return buildAdminPlanReplyText({ includeSupportLine: false });
}

function resolveAdminPlanFocusFromPayload(payload?: Record<string, any>): AdminPlanFocus {
  const rawFocus = String(payload?.focus || '').trim().toLowerCase();
  if (rawFocus === 'annual' || rawFocus === 'monthly' || rawFocus === 'both') {
    return rawFocus;
  }

  const requestText = firstNonEmptyString(
    payload?.requestText,
    payload?.messageText,
    payload?.userMessage,
    payload?.currentMessage,
  );

  return detectAdminPlanFocusFromText(requestText);
}

async function getSafeAutologinUrl(userId: string | undefined, destination: '/conexao' | '/plans'): Promise<string> {
  if (userId && userId.length > 10) {
    try {
      return await generateAutologinLinkWithRetry(userId, destination);
    } catch (error) {
      console.warn(`[ExecutorV2] Falha ao gerar auto-login para ${destination}, usando link público:`, error);
    }
  }

  return buildPublicDestinationUrl(destination);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export async function executeAction(
  pendingAction: PendingAction,
  userId: string,
): Promise<{ success: boolean; responseText: string }> {
  console.log(`[ExecutorV2] Executando ação tipo="${pendingAction.type}" para userId=${userId}`);

  switch (pendingAction.type) {
    // ── Editar prompt do agente ──────────────────────────────────────────────
    case 'edit_prompt': {
      try {
        const agentConfig = await storage.getAgentConfig(userId);
        const promptAtual = agentConfig?.prompt || '';
        const config = await getLLMConfig(userId);
        const apiKey = config.mistralApiKey || process.env.MISTRAL_API_KEY || '';
        const instrucao = String(pendingAction.payload.descricaoMudanca || '');

        console.log(`[ExecutorV2] Editando prompt (${promptAtual.length} chars) com instrução: "${instrucao.slice(0, 80)}..."`);
        const result = await editarPromptComHistorico(userId, promptAtual, instrucao, apiKey);

        if (result.resultado.success) {
          const summary = (result.resultado as any).summary || (result.resultado as any).editSummary || '';
          let responseText = `✅ Prompt atualizado com sucesso!${summary ? ` ${summary}` : ''}`;

          // T4: Always include simulator link after editing prompt
          responseText += `\n\n🔗 Teste como ficou: ${await getOrCreateSimulatorUrlForUser(userId)}`;

          responseText += `\n\n${buildAdminPanelPitch('https://agentezap.online/meu-agente-ia')}`;
          responseText = clampAdminReplyLength(responseText);
          return {
            success: true,
            responseText,
          };
        } else {
          const err = (result.resultado as any).error || 'erro desconhecido';
          console.warn('[ExecutorV2] editarPromptComHistorico retornou failure:', err);
          return { success: false, responseText: `❌ Não foi possível editar o prompt: ${err}` };
        }
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao editar prompt:', e);
        return { success: false, responseText: '❌ Ocorreu um erro ao editar o prompt. Tente novamente.' };
      }
    }

    // ── Salvar mídia na biblioteca ────────────────────────────────────────────
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
              responseText: 'âŒ Para salvar esse fluxo, preciso do contexto de uso e de pelo menos 2 itens na sequÃªncia.',
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
                  responseText: `âŒ O item ${index + 1} do fluxo estÃ¡ vazio.`,
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
                responseText: `âŒ O item ${index + 1} do fluxo precisa ser texto preenchido ou mÃ­dia vÃ¡lida.`,
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
            const simulatorBlock = `\n\nðŸ”— Teste no simulador agora:\n${await getOrCreateSimulatorUrlForUser(userId)}`;
            return {
              success: true,
              responseText: `âœ… Fluxo *${flowInserted.name}* salvo com sucesso!\nVou usar esse fluxo quando: "${whenToUse}".${simulatorBlock}`,
            };
          }

          return { success: false, responseText: 'âŒ NÃ£o foi possÃ­vel salvar o fluxo. Tente novamente.' };
        }

        // Validate required context: both URL and usage description must be present
        if (!sourceUrl || !whenToUse) {
          console.log('[ExecutorV2] Mídia incompleta: faltam URL ou contexto de uso');
          const missing: string[] = [];
          if (!storageUrl) missing.push('URL/localização da mídia');
          if (!whenToUse) missing.push('contexto de quando usar');
          return {
            success: false,
            responseText: `❌ Para salvar a mídia, preciso de mais informações: ${missing.join(' e ')}. Pode detalhar?`,
          };
        }

        const name: string =
          String(pendingAction.payload.name || '').trim() ||
          `Mídia ${new Date().toLocaleDateString('pt-BR')}`;
        const description: string =
          String(pendingAction.payload.description || '').trim() || whenToUse;

        console.log(`[ExecutorV2] Salvando mídia "${name}" tipo "${mediaType}" com contexto: "${whenToUse.slice(0, 50)}..."`);
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
          const simulatorBlock = `\n\n🔗 Teste no simulador agora:\n${await getOrCreateSimulatorUrlForUser(userId)}`;
          return {
            success: true,
            responseText: `✅ Mídia *${inserted.name}* salva com sucesso!\nVou usá-la quando: "${whenToUse}".${simulatorBlock}`,
          };
        } else {
          return { success: false, responseText: '❌ Não foi possível salvar a mídia. Tente novamente.' };
        }
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao salvar mídia:', e);
        return { success: false, responseText: '❌ Ocorreu um erro ao salvar a mídia. Tente novamente.' };
      }
    }

    // ── Gerar link de conexão (autologin) ─────────────────────────────────────
    case 'GERAR_LINK_CONEXAO': {
      try {
        console.log('[ExecutorV2] Gerando link de conexão para userId:', userId);
        const url = await getSafeAutologinUrl(userId, '/conexao');
        return {
          success: true,
          responseText: `Aqui está seu link para conectar o WhatsApp:\n${url}\n\nEle fica válido por 60 minutos.`,
        };
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao gerar link de conexão:', e);
        const fallbackUrl = buildPublicDestinationUrl('/conexao');
        return {
          success: true,
          responseText: `Aqui esta seu link para conectar o WhatsApp:\n${fallbackUrl}\n\nSe quiser, eu tambem posso te orientar por aqui.`,
        };
      }
    }

    // ── Gerar link de planos (autologin) ─────────────────────────────────────
    case 'GERAR_LINK_PLANOS': {
      try {
        console.log('[ExecutorV2] Gerando link de planos para userId:', userId);
        const focus = resolveAdminPlanFocusFromPayload(pendingAction.payload);
        const promo49 = shouldUsePromo49Pricing(pendingAction.payload);
        const url = promo49 ? getAdminPlanDefaultUrl(true) : await getSafeAutologinUrl(userId, '/plans');
        return {
          success: true,
          responseText: buildAdminPlanReplyText({ focus, promo49, link: url }),
        };
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao gerar link de planos:', e);
        const focus = resolveAdminPlanFocusFromPayload(pendingAction.payload);
        const promo49 = shouldUsePromo49Pricing(pendingAction.payload);
        return {
          success: true,
          responseText: buildAdminPlanReplyText({
            focus,
            promo49,
            link: promo49 ? getAdminPlanDefaultUrl(true) : buildPublicDestinationUrl('/plans'),
          }),
        };
      }
    }
    // ── Informar planos ───────────────────────────────────────────────────────
    case 'INFORMAR_PLANOS': {
      console.log('[ExecutorV2] Retornando informações de planos');
      let planLink: string | undefined;
      const focus = resolveAdminPlanFocusFromPayload(pendingAction.payload);
      const promo49 = shouldUsePromo49Pricing(pendingAction.payload);

      if (userId && userId.length > 10) {
        try {
          planLink = promo49 ? getAdminPlanDefaultUrl(true) : await getSafeAutologinUrl(userId, '/plans');
        } catch (error) {
          console.warn('[ExecutorV2] Falha ao gerar auto login de planos, usando link padrão:', error);
        }
      }

      return {
        success: true,
        responseText: buildAdminPlanReplyText({ focus, promo49, link: planLink || getAdminPlanDefaultUrl(promo49) }),
      };
    }

    // ── Sem ação (resposta livre do LLM) ──────────────────────────────────────
    case 'NENHUMA': {
      console.log('[ExecutorV2] Tipo NENHUMA — retornando proposedText');
      return { success: true, responseText: pendingAction.proposedText };
    }

    // ── Criar agente de teste ────────────────────────────────────────────────
    case 'criar_agente': {
      try {
        const phoneNumber = String(pendingAction.payload.phoneNumber || '').trim();
        if (!phoneNumber) {
          return { success: false, responseText: '❌ Número de telefone não informado para criação de conta.' };
        }

        // Get or create session for the phone number
        let session = getClientSession(phoneNumber);
        if (!session) {
          session = createClientSession(phoneNumber);
        }

        // Accept canonical tool fields and common alias variants from fallback JSON.
        const agentConfig = { ...session.agentConfig };
        const resolvedCompanyName = firstNonEmptyString(
          pendingAction.payload.nomeEmpresa,
          pendingAction.payload.companyName,
          pendingAction.payload.company,
          pendingAction.payload.businessName,
          pendingAction.payload.nomeNegocio,
        );
        const resolvedBusinessSegment = firstNonEmptyString(
          pendingAction.payload.ramoAtuacao,
          pendingAction.payload.businessSegment,
          pendingAction.payload.businessType,
          pendingAction.payload.segment,
          pendingAction.payload.ramo,
        );
        const resolvedServiceDescription = firstNonEmptyString(
          pendingAction.payload.descricaoAtendimento,
          pendingAction.payload.attendanceDescription,
          pendingAction.payload.promptDescription,
          pendingAction.payload.instructions,
          pendingAction.payload.prompt,
        );

        if (resolvedCompanyName) {
          agentConfig.company = resolvedCompanyName;
        }
        if (resolvedBusinessSegment) {
          agentConfig.role = resolvedBusinessSegment;
        }
        if (resolvedServiceDescription) {
          agentConfig.prompt = resolvedServiceDescription;
        }

        session = updateClientSession(phoneNumber, { agentConfig });

        console.log(`[ExecutorV2] Criando agente para ${phoneNumber}: empresa=${agentConfig.company}, ramo=${agentConfig.role}`);

        const testResult = await createTestAccountWithCredentials(session);

        if (!testResult.success || !testResult.email || !testResult.simulatorToken) {
          return {
            success: false,
            responseText: '❌ Não foi possível criar a conta de teste. Tente novamente em alguns segundos.',
          };
        }

        const credentials = {
          email: testResult.email,
          password: testResult.password,
          loginUrl: testResult.loginUrl || 'https://agentezap.online',
          simulatorToken: testResult.simulatorToken,
          isExistingAccount: testResult.isExistingAccount === true,
        };

        // Update session with account info
        // V23j: NÃO sobrescrever userId — createTestAccountWithCredentials já definiu o UUID correto
        updateClientSession(phoneNumber, {
          flowState: 'active',
          email: credentials.email,
          lastGeneratedPassword: credentials.password,
        });

        const deliveryText = buildStructuredAccountDeliveryText(session, credentials as any);

        // V23k: Include real credentials in tool result — returned DIRECTLY to user (not reformatted by LLM)
        const simulatorUrl = buildSimulatorUrl(credentials.simulatorToken);
        const fullDelivery = `${deliveryText}\n\nSe quiser acessar sua conta por dentro do sistema, estes são os dados:\nE-mail: ${credentials.email}\nSenha: ${credentials.password}\n\nSeu teste:\n${simulatorUrl}\n\nAbre o link, conversa com o agente e me fala o que você quer ajustar. Se fizer sentido para você, já dá para conectar seu WhatsApp ainda no teste gratuito.`;

        const shortDelivery = clampAdminReplyLength(
          `${deliveryText}\n\nTeste: ${simulatorUrl}\n\n${buildAdminPanelPitch('https://agentezap.online/meu-agente-ia')} Se fizer sentido, eu já te ajudo a assinar ou conectar o WhatsApp agora.`,
        );

        console.log(`[ExecutorV2] Agente criado: ${credentials.email} (token: ${credentials.simulatorToken})`);

        return {
          success: true,
          responseText: shortDelivery,
        };
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao criar agente:', e);
        return { success: false, responseText: '❌ Ocorreu um erro ao criar o agente. Tente novamente.' };
      }
    }

    // ── Registrar pagamento ───────────────────────────────────────────────────
    case 'registrar_pagamento': {
      try {
        const phoneNumber = String(pendingAction.payload.phoneNumber || '').trim();
        const comprovanteUrl = String(pendingAction.payload.comprovanteUrl || '').trim();
        const valorInformado = String(pendingAction.payload.valorInformado || '').trim();
        const paymentId = String(pendingAction.payload.paymentId || '').trim();
        const mimeTypeHint = String(pendingAction.payload.mimeType || '').trim();

        if (!comprovanteUrl) {
          const plansUrl = await getSafeAutologinUrl(userId, '/plans');
          return {
            success: false,
            responseText: `Para registrar o pagamento oficialmente, eu preciso do comprovante anexado.\n\nUse este link:\n${plansUrl}\n\nLa voce abre o plano, gera o QR Code e clica em "Eu ja paguei" para enviar o comprovante pelo sistema.`,
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
          responseText: 'Pronto! Ja registrei seu comprovante oficialmente no sistema. Ele agora aparece no painel da equipe para conferencia e seu acesso ficou liberado.',
        };
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao registrar pagamento:', e);
        return { success: false, responseText: 'Ocorreu um erro ao registrar o pagamento. Tente novamente.' };
      }
    }
    default: {
      console.warn('[ExecutorV2] Tipo de ação desconhecido:', (pendingAction as any).type);
      return { success: false, responseText: '❌ Ação desconhecida.' };
    }
  }
}
