import { isGlobalFollowUpPauseReason } from "./userFollowUpGlobalPause";

const HARD_STOP_REASON_SNIPPETS = [
  "desativado pelo usuario",
  "usuario desativou follow-up",
  "desativado manualmente",
  "conta suspensa",
  "numero na lista de exclusao",
  "lista de exclusao",
  "conexao removida",
  "conversa encerrada",
  "sequencia completa",
  "follow-up automatico nao esta disponivel para grupos",
  "conversa indica pagamento",
  "cliente convertido",
  "pedido concluido",
  "conversa pertence a outro numero whatsapp",
  "numero dono da conversa nao confere",
  "outro numero dono",
  "conversa sem conexao whatsapp vinculada",
  "aguardando confirmacao do numero dono",
  "duplicado",
  "espelhado com conversa do admin",
  "numero pertence a outro canal",
  "cliente demonstrou irritacao",
  "nao receber mais mensagens",
] as const;

const HARD_STOP_REASON_COMPAT_SNIPPETS = [
  "desativado pelo usu\u00e3\u00a1rio",
  "usu\u00e3\u00a1rio desativou follow-up",
  "n\u00e3\u00bamero na lista de exclus\u00e3\u00a3o",
  "lista de exclus\u00e3\u00a3o",
  "conex\u00e3\u00a3o removida",
  "n\u00e3\u00bamero pertence a outro canal",
  "cliente demonstrou irrita\u00e3\u00a7\u00e3\u00a3o",
  "n\u00e3\u00a3o receber mais mensagens",
] as const;

function normalizeReasonForHardStop(reason: string): string {
  return Array.from(reason.normalize("NFD"))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code < 0x0300 || code > 0x036f;
    })
    .join("")
    .toLowerCase();
}

export function isHardStopFollowUpDisableReason(reason: string | null | undefined): boolean {
  if (!reason) {
    return false;
  }

  const normalizedReason = normalizeReasonForHardStop(reason);
  if (HARD_STOP_REASON_SNIPPETS.some((snippet) => normalizedReason.includes(snippet))) {
    return true;
  }

  const lowerReason = reason.toLowerCase();
  return HARD_STOP_REASON_COMPAT_SNIPPETS.some((snippet) => lowerReason.includes(snippet));
}

export function canReactivateFollowUpOnCompanyReply(params: {
  followupActive?: boolean | null;
  followupDisabledReason?: string | null;
  isGlobalFollowUpEnabled?: boolean | null;
}): boolean {
  if (!params.isGlobalFollowUpEnabled) {
    return false;
  }

  if (params.followupActive) {
    return true;
  }

  const reason = params.followupDisabledReason;
  if (!reason) {
    return true;
  }

  if (isGlobalFollowUpPauseReason(reason)) {
    return true;
  }

  return !isHardStopFollowUpDisableReason(reason);
}
