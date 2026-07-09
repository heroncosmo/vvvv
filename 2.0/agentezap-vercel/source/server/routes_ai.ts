import type { Express, Request, Response } from "express";
import { isAdmin, isAuthenticated } from "./supabaseAuth";
import { db } from "./db";
import { conversations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  generateAIMessage,
  type AIMessageCodexExecutor,
  type AIMessageConversationSnapshot,
  type AIMessageGenerationRequest,
} from "./aiMessageGenerationService";

const generateMessageRequestSchema = z
  .object({
    conversationId: z.string().trim().optional(),
    baseMessage: z.string().trim().optional(),
    prompt: z.string().trim().optional(),
    context: z.unknown().optional(),
    contactName: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.baseMessage && !data.prompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "baseMessage ou prompt é obrigatório",
        path: ["baseMessage"],
      });
    }
  });

async function loadConversationSnapshot(
  conversationId?: string,
): Promise<AIMessageConversationSnapshot | null> {
  if (!conversationId) {
    return null;
  }

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });

  if (!conversation) {
    return null;
  }

  return {
    contactName: conversation.contactName,
    contactNumber: conversation.contactNumber,
    lastMessageText: conversation.lastMessageText,
  };
}

function buildSuccessfulResponse(
  result: Awaited<ReturnType<typeof generateAIMessage>>,
) {
  return {
    generatedMessage: result.generatedMessage,
    message: result.generatedMessage,
    originalMessage: result.originalMessage,
    model: result.model,
  };
}

function resolveRequestUserId(req: Request, explicitUserId?: string): string | undefined {
  return (
    explicitUserId ||
    (req as any).user?.id ||
    (req as any).auth?.user?.id ||
    (req as any).session?.user?.id
  );
}

async function handleGenerateMessage(
  req: Request,
  res: Response,
  logLabel: string,
  userId?: string,
) {
  try {
    const payload = generateMessageRequestSchema.parse(
      req.body ?? {},
    ) as AIMessageGenerationRequest;
    const conversation = await loadConversationSnapshot(payload.conversationId);
    const resolvedUserId = resolveRequestUserId(req, userId);
    if (!resolvedUserId) {
      throw new Error("Codex CLI exige userId autenticado para gerar mensagem.");
    }

    const executeCodex: AIMessageCodexExecutor = async (codexInput) => {
      const { runWebOnlyCodexPromptTextForUser } = await import("../api/http");
      return runWebOnlyCodexPromptTextForUser({
        userId: resolvedUserId,
        task: "ai_message_generation",
        messages: codexInput.messages,
        message: codexInput.message,
        conversationId: codexInput.conversationId,
        contactName: codexInput.contactName,
        timeoutMs: codexInput.timeoutMs,
        maxTokens: codexInput.maxTokens,
        contextArtifacts: codexInput.contextArtifacts,
      });
    };

    const result = await generateAIMessage(payload, conversation, executeCodex);
    return res.json(buildSuccessfulResponse(result));
  } catch (error: any) {
    console.error(logLabel, error);

    const status = error instanceof z.ZodError ? 400 : 503;
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Dados inválidos para gerar a mensagem"
        : "IA temporariamente indisponível para gerar a mensagem";

    return res.status(status).json({
      message,
      error: error?.message || message,
    });
  }
}

// ============================================================================
// ROTAS DE IA PARA AGENDAMENTO E GERAÇÃO DE MENSAGENS
// ============================================================================

export function registerAIRoutes(app: Express) {
  app.post("/api/ai/generate-message", isAdmin, async (req: Request, res: Response) => {
    await handleGenerateMessage(req, res, "Erro ao gerar mensagem com IA:");
  });

  app.post("/api/admin/ai/generate-message", isAdmin, async (req: Request, res: Response) => {
    await handleGenerateMessage(req, res, "Erro ao gerar mensagem com IA (admin):");
  });

  app.post("/api/user/ai/generate-message", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    await handleGenerateMessage(req, res, "Erro ao gerar mensagem com IA (user):", userId);
  });

  console.log("✅ [AI ROUTES] Rotas de IA registradas");
}
