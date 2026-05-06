import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  scheduledStatus,
  scheduledStatusRuns,
  whatsappConnections,
} from "@shared/schema";
import { db } from "./db";
import { isAuthenticated, supabase } from "./supabaseAuth";
import {
  getStatusPostSummary,
  parseStatusPostPayload,
  previewStatusAudienceForUser,
  serializeStatusPostPayload,
  type StatusPostContentType,
} from "./statusPostingService";
import { normalizeSelectedWeekdays } from "./statusRecurrence";
import { statusSchedulerService } from "./statusSchedulerService";
import { resolveStatusNowFollowUp } from "./statusPostCreation";
import { generateWithLLM } from "./llm";
import { getScheduledStatusPresentation } from "./statusProcessingRuntime";
import { parseStatusBrazilDateTime } from "./statusBrazilTime";
import { generateNvidiaImage } from "./nvidiaImageService";

type CreatePostAction = "now" | "daily" | "weekdays" | "schedule";

interface CreateStatusPostBody {
  action: CreatePostAction;
  connectionId?: string;
  contentType: StatusPostContentType;
  text?: string;
  caption?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  storagePath?: string;
  scheduledFor?: string;
  selectedWeekdays?: number[];
  aiVariationEnabled?: boolean;
  aiVariationPrompt?: string;
  continueAutomationAfterNow?: boolean;
  followUpAction?: Exclude<CreatePostAction, "now" | "schedule">;
  followUpScheduledFor?: string;
  followUpSelectedWeekdays?: number[];
}

interface GenerateImageBody {
  prompt?: string;
}

interface GenerateImageIdeaBody {
  message?: string;
  businessHint?: string;
}

function stripWrappingQuotes(value: string) {
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getRequestUserId(req: any): string | null {
  return req.user?.claims?.sub || req.user?.id || null;
}

function mapScheduledRow(row: typeof scheduledStatus.$inferSelect) {
  const payload = parseStatusPostPayload(row.statusText);
  const presentation = getScheduledStatusPresentation({
    status: row.status,
    updatedAt: row.updatedAt,
    schedulerBootStartedAt: statusSchedulerService.getBootStartedAt(),
    errorMessage: row.errorMessage,
  });
  const scheduledAt = row.scheduledFor ? new Date(row.scheduledFor) : null;
  const createdAt = row.createdAt ? new Date(row.createdAt) : scheduledAt;
  const isImmediate = Boolean(
    createdAt &&
    scheduledAt &&
    Math.abs(createdAt.getTime() - scheduledAt.getTime()) < 60_000 &&
    row.recurrenceType === "none",
  );

  return {
    id: row.id,
    connectionId: payload.connectionId || null,
    contentType: payload.contentType,
    text: payload.text || "",
    caption: payload.caption || "",
    mediaUrl: payload.mediaUrl || "",
    mimeType: payload.mimeType || "",
    fileName: payload.fileName || "",
    storagePath: payload.storagePath || "",
    summary: getStatusPostSummary(payload),
    status: row.status,
    displayStatus: presentation.displayStatus,
    statusDetail: presentation.statusDetail,
    wasInterrupted: presentation.wasInterrupted,
    scheduledFor: row.scheduledFor,
    lastSentAt: row.lastSentAt,
    errorMessage: row.errorMessage,
    recurrenceType: row.recurrenceType,
    recurrenceInterval: row.recurrenceInterval,
    selectedWeekdays: payload.selectedWeekdays || [],
    aiVariationEnabled: Boolean(payload.aiVariationEnabled),
    aiVariationPrompt: payload.aiVariationPrompt || "",
    requestedAction: payload.requestedAction || null,
    sendRetryCount: Number(payload.sendRetryCount || 0),
    actionLabel:
      payload.requestedAction === "now"
        ? row.status === "sent"
          ? "Postado agora"
          : "Postar agora"
        : row.recurrenceType === "daily"
          ? "Todos os dias"
          : row.recurrenceType === "weekly"
            ? "Dias da semana"
            : isImmediate
              ? "Postado agora"
              : "Agendado",
    createdAt: row.createdAt,
  };
}

async function resolveRequestedConnectionId(
  userId: string,
  rawConnectionId?: string | null,
) {
  const connectionId = String(rawConnectionId || "").trim();
  if (!connectionId) {
    return null;
  }

  const [connection] = await db
    .select({
      id: whatsappConnections.id,
    })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.userId, userId),
        eq(whatsappConnections.id, connectionId),
      ),
    )
    .limit(1);

  if (!connection) {
    throw new Error("Conexao selecionada nao pertence ao usuario");
  }

  return connection.id;
}

function validateBody(body: CreateStatusPostBody) {
  if (
    !body.action ||
    !["now", "daily", "weekdays", "schedule"].includes(body.action)
  ) {
    throw new Error("Acao invalida");
  }

  if (
    !body.contentType ||
    !["text", "image", "video", "audio"].includes(body.contentType)
  ) {
    throw new Error("Tipo de conteudo invalido");
  }

  if (body.contentType === "text" && !body.text?.trim()) {
    throw new Error("Digite o texto que sera postado");
  }

  if (body.contentType !== "text" && !body.mediaUrl) {
    throw new Error("Envie uma imagem, video ou audio");
  }

  if (
    (body.action === "daily" ||
      body.action === "weekdays" ||
      body.action === "schedule") &&
    !body.scheduledFor
  ) {
    throw new Error("Defina data e horario");
  }

  if (
    body.action === "weekdays" &&
    normalizeSelectedWeekdays(body.selectedWeekdays).length === 0
  ) {
    throw new Error("Escolha ao menos um dia da semana");
  }
}

function getInitialScheduledDate(
  action: CreatePostAction,
  scheduledFor?: string,
) {
  if (action === "now") {
    return new Date();
  }

  const parsedDate = parseStatusBrazilDateTime(scheduledFor);
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    throw new Error("Data invalida");
  }

  return parsedDate;
}

function buildPostPayload(
  body: CreateStatusPostBody,
  overrides?: Partial<CreateStatusPostBody>,
) {
  const merged = { ...body, ...overrides };
  const selectedWeekdays =
    merged.action === "weekdays"
      ? normalizeSelectedWeekdays(merged.selectedWeekdays)
      : [];
  const aiVariationEnabled =
    merged.contentType === "text" && merged.action !== "now"
      ? Boolean(merged.aiVariationEnabled)
      : false;
  return {
    connectionId: merged.connectionId || "",
    contentType: merged.contentType,
    text: merged.text || "",
    caption: merged.caption || "",
    mediaUrl: merged.mediaUrl || "",
    mimeType: merged.mimeType || "",
    fileName: merged.fileName || "",
    storagePath: merged.storagePath || "",
    selectedWeekdays,
    aiVariationEnabled,
    aiVariationPrompt: merged.aiVariationPrompt || "",
    requestedAction: merged.action,
    sendRetryCount: 0,
  };
}

function isNotFoundStorageError(message: string | undefined) {
  const safeMessage = String(message || "").toLowerCase();
  return (
    safeMessage.includes("not found") || safeMessage.includes("no such file")
  );
}

async function removeStoredMedia(storagePath?: string | null) {
  const safePath = String(storagePath || "").trim();
  if (!safePath) {
    return;
  }

  const { error } = await supabase.storage
    .from("agent-media")
    .remove([safePath]);
  if (error && !isNotFoundStorageError(error.message)) {
    console.warn(
      "[STATUS POSTS] Failed to delete storage object:",
      safePath,
      error.message,
    );
  }
}

async function generateImageIdea(body: GenerateImageIdeaBody) {
  const message = String(body.message || "").trim();
  const businessHint = String(body.businessHint || "").trim();

  if (!message) {
    throw new Error("Escreva ao menos a mensagem base para eu sugerir a arte");
  }

  const prompt = stripWrappingQuotes(
    await generateWithLLM(
      [
        "Voce cria prompts curtos para imagem vertical de status do WhatsApp.",
        "Escreva em portugues do Brasil.",
        "Entregue somente o prompt final, pronto para gerar arte.",
        "Pense como diretor de arte comercial: foco visual, contraste, oferta e leitura rapida no celular.",
      ].join(" "),
      [
        `Mensagem do status: ${message}`,
        businessHint ? `Contexto do negocio: ${businessHint}` : "",
        "Crie um prompt de imagem vertical 9:16 com um visual forte e pronto para vender no status.",
      ]
        .filter(Boolean)
        .join("\n"),
      {
        maxTokens: 180,
        temperature: 0.8,
      },
    ),
  );

  if (!prompt) {
    throw new Error("Nao consegui sugerir uma ideia de imagem agora");
  }

  return prompt;
}

export function registerStatusPostRoutes(app: Express) {
  app.get(
    "/api/status/posts",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getRequestUserId(req);
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const rows = await db
          .select()
          .from(scheduledStatus)
          .where(eq(scheduledStatus.userId, userId))
          .orderBy(desc(scheduledStatus.createdAt));

        return res.json(rows.map(mapScheduledRow));
      } catch (error) {
        console.error("[STATUS POSTS] Failed to list posts:", error);
        return res.status(500).json({ message: "Falha ao carregar postagens" });
      }
    },
  );

  app.get(
    "/api/status/posts/:id/history",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getRequestUserId(req);
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const statusId = String(req.params.id || "").trim();
        if (!statusId) {
          return res.status(400).json({ message: "Postagem invalida" });
        }

        const rows = await db
          .select()
          .from(scheduledStatusRuns)
          .where(
            and(
              eq(scheduledStatusRuns.statusId, statusId),
              eq(scheduledStatusRuns.userId, userId),
            ),
          )
          .orderBy(desc(scheduledStatusRuns.attemptedAt))
          .limit(20);

        return res.json(
          rows.map((row) => ({
            id: row.id,
            status: row.status,
            attemptedAt: row.attemptedAt,
            scheduledFor: row.scheduledFor,
            errorMessage: row.errorMessage,
          })),
        );
      } catch (error) {
        console.error("[STATUS POSTS] Failed to load history:", error);
        return res.status(500).json({ message: "Falha ao carregar historico" });
      }
    },
  );

  app.post(
    "/api/status/posts/generate-image",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const body = req.body as GenerateImageBody;
        const prompt = String(body.prompt || "").trim();
        if (!prompt) {
          return res
            .status(400)
            .json({ message: "Descreva a imagem que deseja gerar" });
        }

        const image = await generateNvidiaImage(prompt, {
          filePrefix: "status-ai",
          useCase: "status",
        });
        return res.json({
          success: true,
          ...image,
        });
      } catch (error: any) {
        console.error("[STATUS POSTS] Failed to generate image:", error);
        return res
          .status(503)
          .json({ message: error?.message || "Falha ao gerar imagem com IA" });
      }
    },
  );

  app.post(
    "/api/status/posts/generate-image-idea",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const prompt = await generateImageIdea(
          req.body as GenerateImageIdeaBody,
        );
        return res.json({ success: true, prompt });
      } catch (error: any) {
        console.error("[STATUS POSTS] Failed to generate image idea:", error);
        return res.status(503).json({
          message: error?.message || "Falha ao criar uma ideia de imagem",
        });
      }
    },
  );

  app.post(
    "/api/status/posts",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getRequestUserId(req);
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const body = req.body as CreateStatusPostBody;
        validateBody(body);
        const requestedConnectionId = await resolveRequestedConnectionId(
          userId,
          body.connectionId,
        );

        const scheduledFor = getInitialScheduledDate(
          body.action,
          body.scheduledFor,
        );
        const serializedPayload = serializeStatusPostPayload(
          buildPostPayload(body, {
            connectionId: requestedConnectionId || undefined,
          }),
        );

        if (body.action === "now") {
          const now = new Date();
          const audiencePreview = await previewStatusAudienceForUser(
            userId,
            requestedConnectionId,
          );
          const followUpPlan = resolveStatusNowFollowUp(body);
          const [queuedRow] = await db
            .insert(scheduledStatus)
            .values({
              userId,
              statusText: serializedPayload,
              scheduledFor: now,
              recurrenceType: "none",
              recurrenceInterval: 1,
              status: "pending",
              createdAt: now,
              updatedAt: now,
            })
            .returning();

          if (followUpPlan) {
            const followUpPayload = serializeStatusPostPayload(
              buildPostPayload(body, {
                connectionId: requestedConnectionId || undefined,
                action: followUpPlan.action,
                selectedWeekdays: followUpPlan.selectedWeekdays,
              }),
            );

            await db.insert(scheduledStatus).values({
              userId,
              statusText: followUpPayload,
              scheduledFor: new Date(followUpPlan.scheduledFor),
              recurrenceType:
                followUpPlan.action === "daily" ? "daily" : "weekly",
              recurrenceInterval: 1,
              status: "pending",
              createdAt: now,
              updatedAt: now,
            });
          }

          statusSchedulerService.queueScheduledStatusProcessing(
            queuedRow.id,
            250,
          );

          return res.status(201).json({
            message:
              audiencePreview.audienceCount > 0
                ? `Tentativa criada para ${audiencePreview.audienceCount} contatos salvos desta conexao. A exibicao final respeita a privacidade do WhatsApp${audiencePreview.statusPrivacyLabel ? ` (${audiencePreview.statusPrivacyLabel})` : ""}.`
                : "Tentativa criada. Assim que sair, a lista abaixo atualiza sozinha.",
            audienceCount: audiencePreview.audienceCount,
            audienceSource: audiencePreview.audienceSource,
            statusPrivacy: audiencePreview.statusPrivacy,
            statusPrivacyLabel: audiencePreview.statusPrivacyLabel,
            followUpCreated: Boolean(followUpPlan),
            followUpAction: followUpPlan?.action || null,
            followUpScheduledFor: followUpPlan?.scheduledFor || null,
            item: mapScheduledRow(queuedRow),
          });
        }

        const [createdRow] = await db
          .insert(scheduledStatus)
          .values({
            userId,
            statusText: serializedPayload,
            scheduledFor,
            recurrenceType:
              body.action === "daily"
                ? "daily"
                : body.action === "weekdays"
                  ? "weekly"
                  : "none",
            recurrenceInterval: 1,
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return res.status(201).json({
          message:
            body.action === "daily"
              ? "Postagem diaria ativada"
              : body.action === "weekdays"
                ? "Postagem recorrente por dias da semana ativada"
                : "Postagem agendada",
          item: mapScheduledRow(createdRow),
        });
      } catch (error: any) {
        console.error("[STATUS POSTS] Failed to create post:", error);
        return res
          .status(400)
          .json({ message: error?.message || "Falha ao criar postagem" });
      }
    },
  );

  app.delete(
    "/api/status/posts/:id",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const userId = getRequestUserId(req);
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const { id } = req.params;
        const [existingRow] = await db
          .select()
          .from(scheduledStatus)
          .where(
            and(eq(scheduledStatus.id, id), eq(scheduledStatus.userId, userId)),
          );

        if (!existingRow) {
          return res.status(404).json({ message: "Postagem nao encontrada" });
        }

        const payload = parseStatusPostPayload(existingRow.statusText);
        await removeStoredMedia(payload.storagePath);

        await db
          .delete(scheduledStatus)
          .where(
            and(eq(scheduledStatus.id, id), eq(scheduledStatus.userId, userId)),
          );

        return res.json({
          message: "Postagem excluida",
        });
      } catch (error) {
        console.error("[STATUS POSTS] Failed to delete post:", error);
        return res.status(500).json({ message: "Falha ao excluir postagem" });
      }
    },
  );
}
