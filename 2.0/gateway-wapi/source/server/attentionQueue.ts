import type { AttentionPriority } from "@shared/schema";
import { sanitizeCustomerFacingResponseText } from "./customerFacingResponsePolicy";

export interface AttentionAssessment {
  priority: AttentionPriority | null;
  needsHumanAttention: boolean;
  reason: string | null;
  confidence: number | null;
}

export interface StructuredRoutingDecision {
  mode: "keep_current" | "route_to_sector";
  targetSectorId: string | null;
  confidence: number | null;
  intent: string | null;
  reason: string | null;
}

export interface StructuredAIEnvelope {
  assistantResponse: string | null;
  attention?: AttentionAssessment;
  routing?: StructuredRoutingDecision;
}

const ASSISTANT_RESPONSE_START = "<assistant_response>";
const ASSISTANT_RESPONSE_END = "</assistant_response>";
const ATTENTION_JSON_START = "<attention_json>";
const ATTENTION_JSON_END = "</attention_json>";
const ROUTING_JSON_START = "<routing_json>";
const ROUTING_JSON_END = "</routing_json>";

type StructuredBlockTag = {
  startTag: string;
  endTag: string;
};

const OPERATIONAL_BLOCK_TAGS: StructuredBlockTag[] = [
  { startTag: ATTENTION_JSON_START, endTag: ATTENTION_JSON_END },
  { startTag: ROUTING_JSON_START, endTag: ROUTING_JSON_END },
];

function extractDelimitedBlock(source: string, startTag: string, endTag: string): string | null {
  const startIndex = source.indexOf(startTag);
  if (startIndex === -1) return null;

  const contentStart = startIndex + startTag.length;
  const endIndex = source.indexOf(endTag, contentStart);
  if (endIndex === -1) return null;

  return source.slice(contentStart, endIndex).trim();
}

function stripDelimitedBlock(source: string, startTag: string, endTag: string): string {
  let cleaned = source;

  while (true) {
    const startIndex = cleaned.indexOf(startTag);
    if (startIndex === -1) {
      break;
    }

    const endIndex = cleaned.indexOf(endTag, startIndex + startTag.length);
    if (endIndex === -1) {
      cleaned = cleaned.slice(0, startIndex);
      break;
    }

    cleaned = cleaned.slice(0, startIndex) + cleaned.slice(endIndex + endTag.length);
  }

  return cleaned;
}

function stripStandaloneTag(source: string, tag: string): string {
  let cleaned = source;

  while (true) {
    const tagIndex = cleaned.indexOf(tag);
    if (tagIndex === -1) {
      return cleaned;
    }
    cleaned = cleaned.slice(0, tagIndex) + cleaned.slice(tagIndex + tag.length);
  }
}

function sanitizeAssistantResponseText(source: string | null): string | null {
  if (!source) {
    return null;
  }

  let cleaned = source;

  for (const blockTag of OPERATIONAL_BLOCK_TAGS) {
    cleaned = stripDelimitedBlock(cleaned, blockTag.startTag, blockTag.endTag);
    cleaned = stripStandaloneTag(cleaned, blockTag.startTag);
    cleaned = stripStandaloneTag(cleaned, blockTag.endTag);
  }

  return sanitizeCustomerFacingResponseText(cleaned);
}

function clampAttentionConfidence(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Math.round(value * 100) / 100;
}

function normalizeAttentionPriority(value: unknown): AttentionPriority | null {
  if (value !== "critica" && value !== "alta" && value !== "media" && value !== "baixa") {
    return null;
  }
  return value;
}

function sanitizeRoutingMode(value: unknown): StructuredRoutingDecision["mode"] {
  return value === "route_to_sector" ? "route_to_sector" : "keep_current";
}

function sanitizeRoutingText(value: unknown, maxLength = 240): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

export function sanitizeStructuredRoutingDecision(payload: unknown): StructuredRoutingDecision | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const raw = payload as Record<string, unknown>;
  const mode = sanitizeRoutingMode(raw.mode);
  const targetSectorId =
    typeof raw.targetSectorId === "string" && raw.targetSectorId.trim().length > 0
      ? raw.targetSectorId.trim()
      : null;
  const confidence = clampAttentionConfidence(raw.confidence);
  const intent = sanitizeRoutingText(raw.intent, 100);
  const reason = sanitizeRoutingText(raw.reason);

  if (mode === "route_to_sector" && !targetSectorId) {
    return {
      mode: "keep_current",
      targetSectorId: null,
      confidence,
      intent,
      reason,
    };
  }

  return {
    mode,
    targetSectorId,
    confidence,
    intent,
    reason,
  };
}

export function sanitizeAttentionAssessment(payload: unknown): AttentionAssessment | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const raw = payload as Record<string, unknown>;
  const needsHumanAttention = raw.needsHumanAttention === true;
  const priority = normalizeAttentionPriority(raw.priority);
  const reason =
    typeof raw.reason === "string" && raw.reason.trim().length > 0
      ? raw.reason.trim()
      : null;
  const confidence = clampAttentionConfidence(raw.confidence);

  return {
    priority: needsHumanAttention ? priority : null,
    needsHumanAttention,
    reason,
    confidence,
  };
}

export function parseStructuredAIEnvelope(rawContent: string | null): StructuredAIEnvelope {
  if (!rawContent) {
    return { assistantResponse: null };
  }

  const assistantResponseBlock = extractDelimitedBlock(
    rawContent,
    ASSISTANT_RESPONSE_START,
    ASSISTANT_RESPONSE_END,
  );
  const attentionBlock = extractDelimitedBlock(
    rawContent,
    ATTENTION_JSON_START,
    ATTENTION_JSON_END,
  );
  const routingBlock = extractDelimitedBlock(
    rawContent,
    ROUTING_JSON_START,
    ROUTING_JSON_END,
  );

  let attention: AttentionAssessment | undefined;
  if (attentionBlock) {
    try {
      attention = sanitizeAttentionAssessment(JSON.parse(attentionBlock));
    } catch (error) {
      console.warn("⚠️ [Attention Queue] Falha ao fazer parse do bloco de atenção:", error);
    }
  }

  let routing: StructuredRoutingDecision | undefined;
  if (routingBlock) {
    try {
      routing = sanitizeStructuredRoutingDecision(JSON.parse(routingBlock));
    } catch (error) {
      console.warn("Falha ao fazer parse do bloco de roteamento:", error);
    }
  }

  if (assistantResponseBlock !== null) {
    return {
      assistantResponse: sanitizeAssistantResponseText(assistantResponseBlock),
      attention,
      routing,
    };
  }

  const attentionStartIndex = rawContent.indexOf(ATTENTION_JSON_START);
  const routingStartIndex = rawContent.indexOf(ROUTING_JSON_START);
  let fallbackAssistantResponse = rawContent;
  if (attentionStartIndex !== -1) {
    fallbackAssistantResponse = rawContent.slice(0, attentionStartIndex);
  } else if (routingStartIndex !== -1) {
    fallbackAssistantResponse = rawContent.slice(0, routingStartIndex);
  }

  return {
    assistantResponse: sanitizeAssistantResponseText(fallbackAssistantResponse),
    attention,
    routing,
  };
}
