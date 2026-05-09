import { formatStatusBrazilTime } from "./statusBrazilTime";

const DEFAULT_STATUS_SEND_TIMEOUT_MS = 90_000;
const INTERRUPTED_PROCESSING_RECOVERY_GRACE_MS = 10_000;
const DEFAULT_IMMEDIATE_STATUS_RECOVERY_MAX_AGE_MS = 10 * 60 * 1000;

function toValidDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function getStatusSendTimeoutMs() {
  const parsed = Number(process.env.STATUS_SEND_TIMEOUT_MS || process.env.STATUS_POST_SEND_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed >= 10_000) {
    return parsed;
  }

  return DEFAULT_STATUS_SEND_TIMEOUT_MS;
}

export function getImmediateStatusRecoveryMaxAgeMs() {
  const parsed = Number(process.env.STATUS_IMMEDIATE_RECOVERY_MAX_AGE_MS);
  if (Number.isFinite(parsed) && parsed >= 60_000) {
    return parsed;
  }

  return DEFAULT_IMMEDIATE_STATUS_RECOVERY_MAX_AGE_MS;
}

export function createStatusSendTimeoutError(timeoutMs = getStatusSendTimeoutMs()) {
  const seconds = Math.ceil(timeoutMs / 1000);
  const error = new Error(`Status send timed out after ${seconds}s`);
  error.name = "StatusSendTimeoutError";
  return error;
}

export async function withStatusSendTimeout<T>(
  operation: Promise<T>,
  timeoutMs = getStatusSendTimeoutMs(),
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(createStatusSendTimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function isInterruptedScheduledStatusProcessing(params: {
  status: string | null | undefined;
  updatedAt: Date | string | null | undefined;
  schedulerBootStartedAt: Date | string | null | undefined;
}) {
  if (params.status !== "processing") {
    return false;
  }

  const updatedAt = toValidDate(params.updatedAt);
  const bootStartedAt = toValidDate(params.schedulerBootStartedAt);

  if (!updatedAt || !bootStartedAt) {
    return false;
  }

  return updatedAt.getTime() < bootStartedAt.getTime();
}

export function shouldRecoverInterruptedScheduledStatus(params: {
  status: string | null | undefined;
  updatedAt: Date | string | null | undefined;
  schedulerBootStartedAt: Date | string | null | undefined;
  now?: Date;
}) {
  if (
    !isInterruptedScheduledStatusProcessing({
      status: params.status,
      updatedAt: params.updatedAt,
      schedulerBootStartedAt: params.schedulerBootStartedAt,
    })
  ) {
    return false;
  }

  const bootStartedAt = toValidDate(params.schedulerBootStartedAt);
  const now = params.now || new Date();

  if (!bootStartedAt) {
    return false;
  }

  return now.getTime() >= bootStartedAt.getTime() + INTERRUPTED_PROCESSING_RECOVERY_GRACE_MS;
}

export function shouldExpireInterruptedImmediateStatus(params: {
  status: string | null | undefined;
  updatedAt: Date | string | null | undefined;
  schedulerBootStartedAt: Date | string | null | undefined;
  createdAt: Date | string | null | undefined;
  requestedAction?: string | null | undefined;
  now?: Date;
}) {
  if (
    !isInterruptedScheduledStatusProcessing({
      status: params.status,
      updatedAt: params.updatedAt,
      schedulerBootStartedAt: params.schedulerBootStartedAt,
    })
  ) {
    return false;
  }

  if (params.requestedAction !== "now") {
    return false;
  }

  const createdAt = toValidDate(params.createdAt);
  if (!createdAt) {
    return false;
  }

  const now = params.now || new Date();
  return now.getTime() - createdAt.getTime() > getImmediateStatusRecoveryMaxAgeMs();
}

export function buildInterruptedScheduledStatusMessage(now = new Date()) {
  return `Envio interrompido por reinicio da aplicacao. Retomando automaticamente desde ${formatStatusBrazilTime(now)}.`;
}

export function buildExpiredImmediateScheduledStatusMessage(now = new Date()) {
  return `O envio imediato expirou apos uma interrupcao e nao sera retomado automaticamente desde ${formatStatusBrazilTime(now)}. Confirme o status novamente para publicar na hora certa.`;
}

export function getScheduledStatusPresentation(params: {
  status: string;
  updatedAt: Date | string | null | undefined;
  schedulerBootStartedAt: Date | string | null | undefined;
  errorMessage?: string | null | undefined;
}) {
  if (
    isInterruptedScheduledStatusProcessing({
      status: params.status,
      updatedAt: params.updatedAt,
      schedulerBootStartedAt: params.schedulerBootStartedAt,
    })
  ) {
    return {
      displayStatus: "retrying",
      statusDetail:
        params.errorMessage ||
        "O aplicativo reiniciou durante esse envio. Vamos retomar automaticamente.",
      wasInterrupted: true,
    };
  }

  return {
    displayStatus: params.status,
    statusDetail: params.errorMessage || null,
    wasInterrupted: false,
  };
}
