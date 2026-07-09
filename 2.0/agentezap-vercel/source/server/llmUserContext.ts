import { AsyncLocalStorage } from "node:async_hooks";

interface LLMUserContextStore {
  userId?: string;
}

const llmUserContext = new AsyncLocalStorage<LLMUserContextStore>();

function normalizeUserId(userId?: string | null): string | undefined {
  const normalized = String(userId || "").trim();
  return normalized || undefined;
}

export function getLLMUserContext(): string | undefined {
  return normalizeUserId(llmUserContext.getStore()?.userId);
}

export async function runWithLLMUserContext<T>(
  userId: string | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return fn();
  }

  if (getLLMUserContext() === normalizedUserId) {
    return fn();
  }

  return llmUserContext.run({ userId: normalizedUserId }, fn);
}
