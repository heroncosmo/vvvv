/**
 * Legacy LLM compatibility surface.
 *
 * AgenteZap 4.0 routes agent decisions through the live Codex runtime with
 * tenant context and a structured contract. This module intentionally keeps
 * only type/export compatibility for old imports and fails closed for any
 * provider-style call.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMChatResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
    finishReason?: string;
  }>;
}

export interface MediaClassificationInput {
  userId?: string;
  conversationId?: string;
  contactPhone?: string;
  clientMessage: string;
  conversationHistory: Array<{ text: string; fromMe: boolean }>;
  mediaLibrary: Array<{
    name: string;
    type: string;
    whenToUse?: string;
    isActive?: boolean;
  }>;
  sentMedias?: string[];
  aiResponseText?: string;
}

export interface MediaClassificationResult {
  shouldSend: boolean;
  mediaName: string | null;
  confidence: number;
  reason: string;
}

export async function callGroq(
  messages: ChatMessage[] | string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
  },
): Promise<string> {
  void messages;
  void options;
  throw new Error("legacy_llm_provider_disabled_codex_contract_required");
}

export async function classifyMediaWithLLM(
  input: MediaClassificationInput,
): Promise<MediaClassificationResult> {
  void input;
  return {
    shouldSend: false,
    mediaName: null,
    confidence: 0,
    reason: "media_classifier_disabled_codex_contract_required",
  };
}

export function detectMediaSendingIntent(aiResponseText: string): boolean {
  void aiResponseText;
  return false;
}
