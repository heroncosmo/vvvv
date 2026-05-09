export type PendingActionExecutionType =
  | 'edit_prompt'
  | 'save_media'
  | 'GERAR_LINK_CONEXAO'
  | 'GERAR_LINK_PLANOS'
  | 'INFORMAR_PLANOS'
  | 'NENHUMA'
  | 'criar_agente'
  | 'registrar_pagamento';

interface PendingActionExecutionPolicy {
  maxAttempts: number;
  retryBaseDelayMs: number;
  keepPendingAliveMs: number;
  recoveryReply: string;
}

const DEFAULT_POLICY: PendingActionExecutionPolicy = {
  maxAttempts: 2,
  retryBaseDelayMs: 1200,
  keepPendingAliveMs: 10 * 60_000,
  recoveryReply: 'Estou concluindo isso aqui e te confirmo assim que terminar.',
};

const POLICIES: Record<string, PendingActionExecutionPolicy> = {
  edit_prompt: {
    maxAttempts: 4,
    retryBaseDelayMs: 1200,
    keepPendingAliveMs: 10 * 60_000,
    recoveryReply: 'Estou aplicando esse ajuste aqui e te confirmo assim que terminar.',
  },
  save_media: {
    maxAttempts: 4,
    retryBaseDelayMs: 1500,
    keepPendingAliveMs: 10 * 60_000,
    recoveryReply: 'Estou finalizando o cadastro dessa midia aqui e te confirmo assim que concluir.',
  },
  criar_agente: {
    maxAttempts: 5,
    retryBaseDelayMs: 1500,
    keepPendingAliveMs: 12 * 60_000,
    recoveryReply: 'Estou terminando a configuracao do seu teste aqui e te mando o acesso assim que concluir.',
  },
  registrar_pagamento: {
    maxAttempts: 4,
    retryBaseDelayMs: 1500,
    keepPendingAliveMs: 12 * 60_000,
    recoveryReply: 'Estou validando esse comprovante aqui e te confirmo assim que terminar.',
  },
};

export function getPendingActionExecutionPolicy(
  type: PendingActionExecutionType | string,
): PendingActionExecutionPolicy {
  return POLICIES[type] || DEFAULT_POLICY;
}

export function buildPendingActionRecoveryReply(
  type: PendingActionExecutionType | string,
): string {
  return getPendingActionExecutionPolicy(type).recoveryReply;
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

export function buildGenericAssistantFallbackReply(): string {
  return 'Me fala sua duvida ou o que voce quer ajustar que eu sigo por aqui.';
}
