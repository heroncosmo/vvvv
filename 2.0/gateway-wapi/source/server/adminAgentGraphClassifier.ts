/**
 * ========================================================================
 * ADMIN AGENT TURN CLASSIFIER — Classificador de Intenção por Turno
 * ========================================================================
 * Analisa a mensagem do usuário e retorna uma classificação estruturada.
 * Funciona como "Layer 2" do orquestrador: entende O QUE o usuário quer.
 *
 * Regras:
 *  - Determinístico primeiro (regex/heurística), LLM só como fallback
 *  - Nunca altera estado — apenas classifica
 *  - Retorna TurnClassification com confidence score
 */

import type {
  AdminGraphState,
  TurnClassification,
  TurnIntent,
  OnboardingStage,
} from "./adminAgentGraphState";

// ============================================================================
// NORMALIZAÇÕES
// ============================================================================

/** Normaliza texto para matching: lowercase, remove acentos, trim */
function normalizeForClassification(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s@#.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================================
// PATTERN MATCHERS
// ============================================================================

/** Padrões de comandos especiais */
const COMMAND_PATTERNS: Array<{ pattern: RegExp; intent: TurnIntent }> = [
  { pattern: /^#(limpar|reset|novo)$/i, intent: "command" },
  { pattern: /^#reset-suave$/i, intent: "command" },
  { pattern: /^#(sair|exit|voltar)$/i, intent: "exit_test" },
  { pattern: /^#(status|info)$/i, intent: "command" },
  { pattern: /^#(debug|log)$/i, intent: "command" },
  { pattern: /^#(plano|preco|valor)$/i, intent: "change_plan" },
];

/** Padrões afirmativos */
const AFFIRMATIVE_PATTERNS = [
  /\bsim\b/,
  /\bok\b/,
  /\btudo\b/,
  /\bpode\s*ser\b/,
  /\bisso\b/,
  /\bcom\s*certeza\b/,
  /\bclaro\b/,
  /\bexato\b/,
  /\bperfeito\b/,
  /\bcerto\b/,
  /\bconfirm(o|a|ado)?\b/,
  /\bvamos\b/,
  /\bbora\b/,
  /\bfechado\b/,
  /\btop\b/,
  /\bbeleza\b/,
  /\bshow\b/,
  /\bvaleu\b/,
  /\bfechar\b/,
  /\bquero\b/,
];

/** Padrões negativos */
const NEGATIVE_PATTERNS = [
  /\bnao\b/,
  /\bneg(ativo|a)?\b/,
  /\bsem\s+(isso|follow|fup)\b/,
  /\bnao\s+precisa\b/,
  /\bnao\s+quero\b/,
  /\bcancela\b/,
  /\bdesist(o|ir|i)\b/,
];

/** Padrões de saudação */
const GREETING_PATTERNS = [
  /^(oi|ola|hey|eae|fala|bom\s*dia|boa\s*(tarde|noite)|salve)\b/,
  /^(hello|hi|yo)\b/,
];

/** Padrões de retomada de sessão */
const RESUME_PATTERNS = [
  /\b(followp|fup|follow\s*up|follow-up)\b/,
  /\b(continuar|retomar|voltar)\b/,
  /\b(onde\s+parei|onde\s+paramos)\b/,
  /\b(ja\s+mandei|ja\s+enviei|ja\s+respondi)\b/,
];

/** Padrões de teste */
const TEST_PATTERNS = [
  /\b(testar|teste|testa|experimentar|simular)\b/,
  /\b(quero\s+ver|ver\s+como\s+funciona)\b/,
  /\b(modo\s+teste|simulador)\b/,
];

/** Padrões de pagamento */
const PAYMENT_PATTERNS = [
  /\b(comprovante|pix|pagamento|pag(uei|ar)|transferi|deposito)\b/,
  /\b(recibo|nota|comprov)\b/,
];

/** Padrões de suporte */
const SUPPORT_PATTERNS = [
  /\b(ajuda|help|suporte|problema|erro|bug|nao\s+funciona)\b/,
  /\b(como\s+faz|como\s+funciona|como\s+configur)\b/,
  /\b(duvida|pergunta)\b/,
];

/** Padrões de pergunta lateral (side question) */
const SIDE_QUESTION_PATTERNS = [
  /\bqual\s+(o\s+)?(preco|valor|custo)\b/,
  /\bquanto\s+(custa|e|fica)\b/,
  /\b(funcionalidade|recurso|feature)\b/,
  /\bcomo\b.*\b(funciona|configura|faz)\b/,
  /\btem\s+(suporte|garantia|teste)\b/,
  /\bo\s+que\s+(e|significa|faz)\b/,
  /\?$/,
];

// ============================================================================
// SLOT EXTRACTORS (heurísticos)
// ============================================================================

/** Tenta extrair informação de negócio do texto */
function extractBusinessInfo(text: string): string | undefined {
  const normalized = normalizeForClassification(text);
  // Padrões comuns: "sou dono de...", "tenho uma...", "minha empresa é...", "trabalho com..."
  const businessPatterns = [
    /(?:sou\s+dono|tenho|minha?\s+(?:empresa|loja|negocio|clinica|escritorio))\s+(?:de?\s+)?(.{5,})/,
    /(?:trabalho\s+com|vendo|ofereco|faco)\s+(.{5,})/,
    /(?:e\s+uma?\s+|somos\s+uma?\s+)(.{5,})/,
  ];
  for (const pat of businessPatterns) {
    const match = normalized.match(pat);
    if (match?.[1]) return match[1].trim();
  }
  // Se a mensagem tem mais de 15 chars e não é pergunta, pode ser info de negócio
  if (normalized.length > 15 && !normalized.includes("?")) return undefined;
  return undefined;
}

/** Tenta extrair informação de comportamento do texto */
function extractBehaviorInfo(text: string): string | undefined {
  const normalized = normalizeForClassification(text);
  const behaviorPatterns = [
    /(?:quero\s+que|preciso\s+que|gostaria\s+que)\s+(?:o\s+(?:agente|bot|robo)\s+)?(.{5,})/,
    /(?:deve\s+ser|precisa\s+ser|tem\s+que\s+ser)\s+(.{5,})/,
    /(?:tom|estilo|personalidade|jeito)\s+(.{5,})/,
    /(?:formal|informal|amigavel|profissional|descontraido)/,
  ];
  for (const pat of behaviorPatterns) {
    const match = normalized.match(pat);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

/** Tenta extrair preferência de workflow */
function extractWorkflowInfo(text: string): { wantsFollowUp?: boolean; wantsScheduling?: boolean } | undefined {
  const normalized = normalizeForClassification(text);

  // Follow-up affirmative
  if (
    /\b(follow\s*u?p?|followp|fup)\b/.test(normalized) ||
    /\btudo\b/.test(normalized) ||
    /\bpode\s*ser\b/.test(normalized) ||
    /\bquero\b/.test(normalized) ||
    /\bcom\s*certeza\b/.test(normalized) ||
    /\bclaro\b/.test(normalized) ||
    /\brecuperar\b/.test(normalized) ||
    /\bcontinuar\s+tentando\b/.test(normalized)
  ) {
    return { wantsFollowUp: true };
  }

  // Follow-up negative
  if (
    /\bsem\s+follow\b/.test(normalized) ||
    /\bnao\s+precisa\b/.test(normalized) ||
    /\bsomente\s+venda\b/.test(normalized) ||
    /\bso\s+venda\b/.test(normalized) ||
    /\bapenas\s+venda\b/.test(normalized)
  ) {
    return { wantsFollowUp: false };
  }

  // Negação de agendamento — deve ser tratado ANTES do match positivo
  if (
    /\b(nao|sem|nunca|nenhum)\b/.test(normalized) &&
    /\b(agenda|agendamento|horario|marcar)\b/.test(normalized)
  ) {
    return { wantsFollowUp: false };
  }

  // Scheduling affirmative
  if (
    /\b(agenda|agendar|agendamento|horario|marcar|consulta)\b/.test(normalized)
  ) {
    return { wantsScheduling: true };
  }

  return undefined;
}

/** Tenta extrair horários do texto */
function extractHoursInfo(text: string): { days?: string; hours?: string } | undefined {
  const normalized = normalizeForClassification(text);
  const hasDays = /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)\b/.test(normalized);
  const hasHours = /\b\d{1,2}[\s:h]\d{0,2}\b/.test(normalized);

  if (hasDays || hasHours) {
    return {
      days: hasDays ? text : undefined,
      hours: hasHours ? text : undefined,
    };
  }
  return undefined;
}

// ============================================================================
// MAIN CLASSIFIER
// ============================================================================

/**
 * Classifica um turno do usuário. Determinístico (sem LLM).
 * 
 * @param rawInput   Texto bruto do usuário
 * @param state      Estado atual do grafo
 * @param mediaType  Tipo de mídia (se houver)
 * @param mediaUrl   URL da mídia (se houver)
 * @returns TurnClassification
 */
export function classifyTurn(
  rawInput: string,
  state: AdminGraphState,
  mediaType?: string,
  mediaUrl?: string,
): TurnClassification {
  const normalized = normalizeForClassification(rawInput);
  const isMedia = !!(mediaType && mediaUrl);

  // Base result
  const result: TurnClassification = {
    intent: "unclear",
    confidence: 0.3,
    hasBusinessInfo: false,
    hasBehaviorInfo: false,
    hasWorkflowInfo: false,
    hasHoursInfo: false,
    isAffirmative: false,
    isNegative: false,
    isMediaMessage: isMedia,
    mediaType,
    mediaUrl,
    normalizedInput: normalized,
    originalInput: rawInput,
    extractedSlots: {},
  };

  // (1) Comandos especiais — prioridade máxima
  for (const cmd of COMMAND_PATTERNS) {
    if (cmd.pattern.test(rawInput)) {
      result.intent = cmd.intent;
      result.confidence = 1.0;
      return result;
    }
  }

  // (2) Mídia durante onboarding → media_upload
  if (isMedia && state.mode !== "test_mode") {
    result.intent = "media_upload";
    result.confidence = 0.9;
    return result;
  }

  // (3) Pagamento (comprovante + mídia)
  if (isMedia && PAYMENT_PATTERNS.some(p => p.test(normalized))) {
    result.intent = "payment_proof";
    result.confidence = 0.95;
    return result;
  }
  if (!isMedia && PAYMENT_PATTERNS.some(p => p.test(normalized)) && state.mode === "payment_pending") {
    result.intent = "payment_proof";
    result.confidence = 0.8;
    return result;
  }

  // (4) Retomada de sessão
  if (RESUME_PATTERNS.some(p => p.test(normalized))) {
    result.intent = "resume_session";
    result.confidence = 0.85;
    return result;
  }

  // (5) Teste — only trigger on short messages or explicit test patterns to avoid misclassifying
  // business descriptions that contain the word 'teste' (e.g. "Empresa Teste Ltda")
  const isShortMessage = normalized.split(/\s+/).length <= 5;
  const hasExplicitTestIntent = /\b(modo\s*teste|simulador|quero\s+ver|ver\s+como\s+funciona)\b/.test(normalized);
  if ((isShortMessage || hasExplicitTestIntent) && TEST_PATTERNS.some(p => p.test(normalized))) {
    result.intent = "test_request";
    result.confidence = 0.85;
    return result;
  }

  // (6) Check affirmative/negative
  result.isAffirmative = AFFIRMATIVE_PATTERNS.some(p => p.test(normalized));
  result.isNegative = NEGATIVE_PATTERNS.some(p => p.test(normalized));

  // (7) Onboarding stage-specific extraction
  if (state.mode === "onboarding") {
    const businessInfo = extractBusinessInfo(rawInput);
    const behaviorInfo = extractBehaviorInfo(rawInput);
    const workflowInfo = extractWorkflowInfo(rawInput);
    const hoursInfo = extractHoursInfo(rawInput);

    result.hasBusinessInfo = !!businessInfo;
    result.hasBehaviorInfo = !!behaviorInfo;
    result.hasWorkflowInfo = !!workflowInfo;
    result.hasHoursInfo = !!hoursInfo;

    if (businessInfo) result.extractedSlots!["businessSummary"] = businessInfo;
    if (behaviorInfo) result.extractedSlots!["desiredAgentBehavior"] = behaviorInfo;
    if (workflowInfo) {
      result.extractedSlots!["workflowPreference"] = JSON.stringify(workflowInfo);
    }
    if (hoursInfo) {
      result.extractedSlots!["hoursInfo"] = JSON.stringify(hoursInfo);
    }

    // Determine if this is an answer to the current stage
    // Guard: don't misclassify side questions (pricing, "como funciona", etc.) as stage answers
    const isSideQuestion = SIDE_QUESTION_PATTERNS.some(p => p.test(normalized));

    switch (state.onboardingStage) {
      case "business":
        if (result.hasBusinessInfo || (!isSideQuestion && normalized.length > 10 && !normalized.includes("?"))) {
          result.intent = "answer_stage";
          result.confidence = result.hasBusinessInfo ? 0.9 : 0.6;
          return result;
        }
        break;
      case "behavior":
        if (result.hasBehaviorInfo || result.isAffirmative || (!isSideQuestion && normalized.length > 10 && !normalized.includes("?"))) {
          result.intent = "answer_stage";
          result.confidence = result.hasBehaviorInfo ? 0.9 : 0.6;
          return result;
        }
        break;
      case "workflow":
        if (result.hasWorkflowInfo || result.isAffirmative || result.isNegative) {
          result.intent = "answer_stage";
          result.confidence = result.hasWorkflowInfo ? 0.9 : 0.7;
          return result;
        }
        break;
      case "hours":
        if (result.hasHoursInfo || (normalized.length > 5 && /\d/.test(normalized))) {
          result.intent = "answer_stage";
          result.confidence = result.hasHoursInfo ? 0.9 : 0.6;
          return result;
        }
        break;
    }
  }

  // (8) Saudação simples
  if (GREETING_PATTERNS.some(p => p.test(normalized)) && normalized.split(/\s+/).length <= 4) {
    result.intent = "greeting";
    result.confidence = 0.8;
    return result;
  }

  // (9) Confirmação genérica (sim/ok sem contexto de estágio)
  if (result.isAffirmative && normalized.split(/\s+/).length <= 3) {
    result.intent = "confirmation";
    result.confidence = 0.75;
    return result;
  }

  // (10) Negação genérica
  if (result.isNegative && normalized.split(/\s+/).length <= 3) {
    result.intent = "negation";
    result.confidence = 0.75;
    return result;
  }

  // (11) Side question
  if (SIDE_QUESTION_PATTERNS.some(p => p.test(normalized))) {
    result.intent = "side_question";
    result.confidence = 0.65;
    return result;
  }

  // (12) Suporte
  if (SUPPORT_PATTERNS.some(p => p.test(normalized))) {
    result.intent = "support";
    result.confidence = 0.7;
    return result;
  }

  // (13) Fallback: durante onboarding, tratar como answer_stage com baixa confiança
  if (state.mode === "onboarding" && normalized.length > 5) {
    result.intent = "answer_stage";
    result.confidence = 0.4;
    return result;
  }

  // (14) Fallback genérico
  result.intent = "unclear";
  result.confidence = 0.3;
  return result;
}

/**
 * Verifica se o turno é uma resposta direta ao estágio atual
 * (atalho para uso comum)
 */
export function isStageAnswer(classification: TurnClassification): boolean {
  return classification.intent === "answer_stage" && classification.confidence >= 0.4;
}

/**
 * Verifica se o turno deve avançar o onboarding
 * (resposta ao estágio OU confirmação)
 */
export function shouldAdvanceOnboarding(classification: TurnClassification): boolean {
  return (
    classification.intent === "answer_stage" ||
    classification.intent === "confirmation"
  );
}
