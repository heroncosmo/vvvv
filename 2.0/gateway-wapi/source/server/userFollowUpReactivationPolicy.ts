import { isGlobalFollowUpPauseReason } from "./userFollowUpGlobalPause";

const HARD_STOP_REASON_SNIPPETS = [
  "Desativado pelo usuário",
  "Usuário desativou follow-up",
  "Desativado manualmente",
  "Conta suspensa",
  "Número na lista de exclusão",
  "lista de exclusão",
  "Conexão removida",
  "Conexao removida",
  "Duplicado",
  "Espelhado com conversa do admin",
  "Número pertence a outro canal",
  "Cliente demonstrou irritação",
  "não receber mais mensagens",
] as const;

export function isHardStopFollowUpDisableReason(reason: string | null | undefined): boolean {
  if (!reason) {
    return false;
  }

  return HARD_STOP_REASON_SNIPPETS.some((snippet) => reason.includes(snippet));
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
