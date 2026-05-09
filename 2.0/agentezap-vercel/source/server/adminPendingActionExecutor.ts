import { executeAction, type PendingAction } from './actionExecutorV2';
import {
  getPendingActionExecutionPolicy,
  isTechnicalFailureMessage,
} from './adminPendingActionExecutionPolicy';

export interface RetriedActionResult {
  success: boolean;
  responseText: string;
  lastFailureWasTechnical: boolean;
}

async function waitBeforeRetry(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function executeActionWithTechnicalRetry(
  pendingAction: PendingAction,
  userId: string,
): Promise<RetriedActionResult> {
  const policy = getPendingActionExecutionPolicy(pendingAction.type);
  let lastFailureWasTechnical = false;
  let lastResponseText = '';

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      const result = await executeAction(pendingAction, userId);
      if (result.success) {
        return {
          success: true,
          responseText: result.responseText,
          lastFailureWasTechnical: false,
        };
      }

      lastResponseText = String(result.responseText || '').trim();
      lastFailureWasTechnical = isTechnicalFailureMessage(lastResponseText);
      if (!lastFailureWasTechnical || attempt === policy.maxAttempts) {
        return {
          success: false,
          responseText: lastResponseText,
          lastFailureWasTechnical,
        };
      }
    } catch (error) {
      lastFailureWasTechnical = true;
      lastResponseText = error instanceof Error ? error.message : String(error || '');
      if (attempt === policy.maxAttempts) {
        return {
          success: false,
          responseText: lastResponseText || 'erro desconhecido',
          lastFailureWasTechnical: true,
        };
      }
    }

    await waitBeforeRetry(policy.retryBaseDelayMs * attempt);
  }

  return {
    success: false,
    responseText: lastResponseText || 'erro desconhecido',
    lastFailureWasTechnical,
  };
}
