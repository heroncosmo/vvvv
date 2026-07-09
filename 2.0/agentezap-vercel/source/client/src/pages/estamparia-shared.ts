import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export type EstampariaProfileResponse = {
  profile: { businessName: string; isActive: boolean } | null;
};

export type EstampariaRequestRecord = {
  id: string;
  conversationId: string;
  contactNumber: string;
  contactName: string | null;
  requestCode: string;
  status: string;
  productType: string | null;
  requestTitle: string | null;
  briefingSummary: string | null;
  artDirectionPrompt: string | null;
  customerApprovalCaption: string | null;
  reviewerNotes: string | null;
  currentArtUrl: string | null;
  currentArtSource: string | null;
  confidence: number;
  briefingConfirmed: boolean;
  sourceConnectionName: string | null;
  approvedAt: string | null;
  lastGeneratedAt: string | null;
  lastAnalyzedAt: string | null;
  updatedAt: string | null;
  reviewerArtUrl: string | null;
};

export type EstampariaRequestsResponse = {
  data: EstampariaRequestRecord[];
  total: number;
  hasMore: boolean;
};

export type EstampariaRequestResponse = {
  request: EstampariaRequestRecord | null;
};

export const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "needs_briefing", label: "Briefing" },
  { value: "pending_review", label: "Revisão interna" },
  { value: "awaiting_customer", label: "Aguardando cliente" },
  { value: "changes_requested", label: "Alterações" },
  { value: "approved", label: "Aprovados" },
] as const;

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function requestTimestamp(request: EstampariaRequestRecord) {
  return request.updatedAt || request.lastAnalyzedAt || request.approvedAt || request.lastGeneratedAt;
}

export function formatRelative(value: string | null) {
  if (!value) return "Agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

export function formatShortDate(request: EstampariaRequestRecord) {
  const value = requestTimestamp(request);
  if (!value) return "Agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return DATE_FORMATTER.format(date);
}

export function prettifyStatus(status: string) {
  switch (status) {
    case "needs_briefing":
      return "Briefing";
    case "pending_review":
      return "Revisão interna";
    case "awaiting_customer":
      return "Aguardando cliente";
    case "changes_requested":
      return "Alterações";
    case "approved":
      return "Aprovado";
    default:
      return status || "Sem status";
  }
}

export function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "approved") return "default";
  if (status === "awaiting_customer") return "secondary";
  return "outline";
}

export function artSourceLabel(request: EstampariaRequestRecord) {
  if (request.currentArtSource === "reviewer") return "Arte finalista";
  if (request.currentArtSource === "ai") return "Arte IA";
  if (request.currentArtUrl) return "Arte pronta";
  if (request.briefingConfirmed) return "Gerando arte";
  return "Aguardando briefing";
}
