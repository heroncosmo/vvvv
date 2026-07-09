export type PendingActionExecutionType =
  | 'edit_prompt'
  | 'save_media'
  | 'GERAR_LINK_CONEXAO'
  | 'GERAR_LINK_PLANOS'
  | 'INFORMAR_PLANOS'
  | 'NENHUMA'
  | 'codex_create_agent_contract'
  | 'registrar_pagamento';

interface PendingActionExecutionPolicy {
  maxAttempts: number;
  retryBaseDelayMs: number;
  keepPendingAliveMs: number;
}

const DEFAULT_POLICY: PendingActionExecutionPolicy = {
  maxAttempts: 2,
  retryBaseDelayMs: 1200,
  keepPendingAliveMs: 10 * 60_000,
};

const POLICIES: Record<string, PendingActionExecutionPolicy> = {
  edit_prompt: {
    maxAttempts: 4,
    retryBaseDelayMs: 1200,
    keepPendingAliveMs: 10 * 60_000,
  },
  save_media: {
    maxAttempts: 4,
    retryBaseDelayMs: 1500,
    keepPendingAliveMs: 10 * 60_000,
  },
  codex_create_agent_contract: {
    maxAttempts: 1,
    retryBaseDelayMs: 0,
    keepPendingAliveMs: 12 * 60_000,
  },
  registrar_pagamento: {
    maxAttempts: 4,
    retryBaseDelayMs: 1500,
    keepPendingAliveMs: 12 * 60_000,
  },
};

export function getPendingActionExecutionPolicy(
  type: PendingActionExecutionType | string,
): PendingActionExecutionPolicy {
  return POLICIES[type] || DEFAULT_POLICY;
}

export function isTechnicalFailureMessage(text: string): boolean {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized.startsWith('❌') ||
    normalized.includes('nao foi possivel') ||
    normalized.includes('não foi possível') ||
    normalized.includes('ocorreu um erro') ||
    normalized.includes('erro desconhecido') ||
    normalized.includes('erro interno') ||
    normalized.includes('falha interna') ||
    normalized.includes('temporariamente indisponivel') ||
    normalized.includes('temporariamente indisponível') ||
    normalized.includes('timeout') ||
    normalized.includes('tente novamente')
  );
}
