import type { Express, Request, Response } from "express";
import { isAdmin, isAuthenticated } from "./supabaseAuth";
import { db } from "./db";
import { conversations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  generateAIMessage,
  type AIMessageConversationSnapshot,
  type AIMessageGenerationRequest,
} from "./aiMessageGenerationService";
import { runWithLLMUserContext } from "./llmUserContext";

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

function buildFallbackResponse(body: AIMessageGenerationRequest) {
  const fallback = body.baseMessage?.trim();
  if (!fallback) {
    return null;
  }

  return {
    generatedMessage: fallback,
    message: fallback,
    originalMessage: fallback,
    model: "fallback",
  };
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
    const result = userId
      ? await runWithLLMUserContext(userId, () => generateAIMessage(payload, conversation))
      : await generateAIMessage(payload, conversation);
    return res.json(buildSuccessfulResponse(result));
  } catch (error: any) {
    console.error(logLabel, error);

    const fallback = buildFallbackResponse((req.body ?? {}) as AIMessageGenerationRequest);
    if (fallback) {
      return res.json(fallback);
    }

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
