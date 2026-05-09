/**
 * ========================================================================
 * ADMIN AGENT TURN AUDITOR — Auditor de Turnos
 * ========================================================================
 * Registra cada turno processado para análise posterior.
 * Funciona como "Layer 7" do orquestrador (transversal).
 *
 * Características:
 *  - Buffer em memória com flush periódico
 *  - Detecção de anti-padrões (re-ask loop, mojibake, false existing)
 *  - Métricas de performance por sessão
 *  - Log estruturado para debugging
 */

import type {
  AdminGraphState,
  TurnClassification,
  PolicyDecision,
  TurnAuditRecord,
  AdminMode,
  OnboardingStage,
} from "./adminAgentGraphState";

// ============================================================================
// AUDIT BUFFER
// ============================================================================

/** Buffer em memória — last N records per phone */
const auditBuffer = new Map<string, TurnAuditRecord[]>();
const MAX_RECORDS_PER_PHONE = 50;
const MAX_PHONES = 500;

// ============================================================================
// ANTI-PATTERN DETECTORS
// ============================================================================

export interface AntiPatternAlert {
  type: "re_ask_loop" | "mojibake_repeated" | "false_existing" | "stuck_stage" | "slow_response";
  severity: "warning" | "critical";
  message: string;
  turnIndex: number;
  phoneNumber: string;
  timestamp: number;
}

/** Buffer de alertas */
const alertBuffer: AntiPatternAlert[] = [];
const MAX_ALERTS = 200;

/**
 * Detecta re-ask loops: mesmo estágio perguntado 3+ vezes consecutivas.
 */
function detectReAskLoop(records: TurnAuditRecord[]): AntiPatternAlert | null {
  if (records.length < 3) return null;

  const lastThree = records.slice(-3);
  const allSameStage = lastThree.every(
    r => r.newStage === lastThree[0].newStage && r.previousStage === lastThree[0].previousStage,
  );
  const allStayDecisions = lastThree.every(
    r => r.decision.action === "stay_stage",
  );

  if (allSameStage && allStayDecisions) {
    return {
      type: "re_ask_loop",
      severity: "critical",
      message: `Re-ask loop detectado! Estágio "${lastThree[0].newStage}" perguntado ${lastThree.length}x consecutivas`,
      turnIndex: lastThree[lastThree.length - 1].turnIndex,
      phoneNumber: lastThree[0].phoneNumber,
      timestamp: Date.now(),
    };
  }

  return null;
}

/**
 * Detecta mojibake repetido em respostas consecutivas.
 */
function detectRepeatedMojibake(records: TurnAuditRecord[]): AntiPatternAlert | null {
  if (records.length < 2) return null;

  const recentMojibake = records.slice(-3).filter(r => r.hadMojibake);
  if (recentMojibake.length >= 2) {
    return {
      type: "mojibake_repeated",
      severity: "warning",
      message: `Mojibake detectado em ${recentMojibake.length} respostas consecutivas`,
      turnIndex: records[records.length - 1].turnIndex,
      phoneNumber: records[0].phoneNumber,
      timestamp: Date.now(),
    };
  }

  return null;
}

/**
 * Detecta estágio "stuck" — sem avanço após N turnos.
 */
function detectStuckStage(records: TurnAuditRecord[]): AntiPatternAlert | null {
  if (records.length < 5) return null;

  const lastFive = records.slice(-5);
  const allSameStage = lastFive.every(r => r.newStage === lastFive[0].newStage);

  if (allSameStage) {
    return {
      type: "stuck_stage",
      severity: "warning",
      message: `Estágio "${lastFive[0].newStage}" sem avanço há ${lastFive.length} turnos`,
      turnIndex: lastFive[lastFive.length - 1].turnIndex,
      phoneNumber: lastFive[0].phoneNumber,
      timestamp: Date.now(),
    };
  }

  return null;
}

// ============================================================================
// MAIN AUDITOR
// ============================================================================

/**
 * Registra um turno processado no buffer de auditoria.
 * Retorna alertas de anti-padrões detectados.
 */
export function auditTurn(
  state: AdminGraphState,
  classification: TurnClassification,
  decision: PolicyDecision,
  previousMode: AdminMode,
  previousStage: OnboardingStage,
  responseText: string,
  processingTimeMs: number,
  llmCalls: number = 0,
): AntiPatternAlert[] {
  const record: TurnAuditRecord = {
    turnIndex: state.turnIndex,
    timestamp: Date.now(),
    phoneNumber: state.phoneNumber,
    rawInput: classification.originalInput,
    normalizedInput: classification.normalizedInput,
    mediaType: classification.mediaType,
    classification,
    decision,
    previousMode,
    previousStage,
    newMode: state.mode,
    newStage: state.onboardingStage,
    responseText: responseText.substring(0, 200), // Limitar tamanho
    responseLength: responseText.length,
    hadMojibake: false, // Será atualizado pelo sanitizer
    hadFalseExisting: false, // Será atualizado pelo sanitizer
    processingTimeMs,
    llmCalls,
  };

  // Add to buffer
  let phoneRecords = auditBuffer.get(state.phoneNumber);
  if (!phoneRecords) {
    phoneRecords = [];
    auditBuffer.set(state.phoneNumber, phoneRecords);
  }
  phoneRecords.push(record);

  // Trim to max
  if (phoneRecords.length > MAX_RECORDS_PER_PHONE) {
    phoneRecords.splice(0, phoneRecords.length - MAX_RECORDS_PER_PHONE);
  }

  // Trim phones
  if (auditBuffer.size > MAX_PHONES) {
    const oldest = Array.from(auditBuffer.entries())
      .sort((a, b) => {
        const aLast = a[1][a[1].length - 1]?.timestamp || 0;
        const bLast = b[1][b[1].length - 1]?.timestamp || 0;
        return aLast - bLast;
      })
      .slice(0, auditBuffer.size - MAX_PHONES);
    for (const [phone] of oldest) {
      auditBuffer.delete(phone);
    }
  }

  // Detect anti-patterns
  const alerts: AntiPatternAlert[] = [];

  const reAsk = detectReAskLoop(phoneRecords);
  if (reAsk) alerts.push(reAsk);

  const mojibake = detectRepeatedMojibake(phoneRecords);
  if (mojibake) alerts.push(mojibake);

  const stuck = detectStuckStage(phoneRecords);
  if (stuck) alerts.push(stuck);

  // Slow response
  if (processingTimeMs > 15000) {
    alerts.push({
      type: "slow_response",
      severity: "warning",
      message: `Resposta lenta: ${processingTimeMs}ms`,
      turnIndex: state.turnIndex,
      phoneNumber: state.phoneNumber,
      timestamp: Date.now(),
    });
  }

  // Store alerts
  for (const alert of alerts) {
    alertBuffer.push(alert);
    if (alertBuffer.length > MAX_ALERTS) {
      alertBuffer.shift();
    }
    console.log(`[AUDITOR] ⚠ ${alert.severity.toUpperCase()}: ${alert.message}`);
  }

  // Log structured
  if (decision.shouldAudit) {
    console.log(
      `[AUDITOR] Turn ${state.turnIndex} | ${state.phoneNumber} | ` +
      `${previousMode}→${state.mode} | ${previousStage}→${state.onboardingStage} | ` +
      `Intent: ${classification.intent} (${classification.confidence.toFixed(2)}) | ` +
      `Action: ${decision.action} | ${processingTimeMs}ms`,
    );
  }

  return alerts;
}

/**
 * Atualiza o último registro de auditoria com informações do sanitizer.
 */
export function updateLastAuditWithSanitizeResult(
  phoneNumber: string,
  hadMojibake: boolean,
  hadFalseExisting: boolean,
): void {
  const records = auditBuffer.get(phoneNumber);
  if (!records || records.length === 0) return;

  const lastRecord = records[records.length - 1];
  lastRecord.hadMojibake = hadMojibake;
  lastRecord.hadFalseExisting = hadFalseExisting;
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/** Retorna os registros de auditoria para um telefone */
export function getAuditRecords(phoneNumber: string): TurnAuditRecord[] {
  return auditBuffer.get(phoneNumber) || [];
}

/** Retorna os alertas recentes */
export function getRecentAlerts(limit: number = 20): AntiPatternAlert[] {
  return alertBuffer.slice(-limit);
}

/** Retorna métricas agregadas para um telefone */
export function getSessionMetrics(phoneNumber: string): {
  totalTurns: number;
  avgProcessingTime: number;
  reAskCount: number;
  mojibakeCount: number;
  falseExistingCount: number;
  stageTransitions: string[];
  timeInOnboarding: number;
} {
  const records = auditBuffer.get(phoneNumber) || [];
  if (records.length === 0) {
    return {
      totalTurns: 0,
      avgProcessingTime: 0,
      reAskCount: 0,
      mojibakeCount: 0,
      falseExistingCount: 0,
      stageTransitions: [],
      timeInOnboarding: 0,
    };
  }

  const avgTime = records.reduce((sum, r) => sum + r.processingTimeMs, 0) / records.length;
  const reAskCount = records.filter(r => r.decision.action === "stay_stage").length;
  const mojibakeCount = records.filter(r => r.hadMojibake).length;
  const falseExistingCount = records.filter(r => r.hadFalseExisting).length;
  const transitions = records
    .filter(r => r.previousStage !== r.newStage)
    .map(r => `${r.previousStage}→${r.newStage}`);

  const firstOnboarding = records.find(r => r.previousMode === "onboarding" || r.newMode === "onboarding");
  const lastOnboarding = records.filter(r => r.newMode === "onboarding").pop();
  const timeInOnboarding = firstOnboarding && lastOnboarding
    ? lastOnboarding.timestamp - firstOnboarding.timestamp
    : 0;

  return {
    totalTurns: records.length,
    avgProcessingTime: Math.round(avgTime),
    reAskCount,
    mojibakeCount,
    falseExistingCount,
    stageTransitions: transitions,
    timeInOnboarding,
  };
}

/** Limpa buffer de auditoria para um telefone */
export function clearAuditRecords(phoneNumber: string): void {
  auditBuffer.delete(phoneNumber);
}

/** Retorna contagem global de alertas por tipo */
export function getAlertSummary(): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const alert of alertBuffer) {
    summary[alert.type] = (summary[alert.type] || 0) + 1;
  }
  return summary;
}
