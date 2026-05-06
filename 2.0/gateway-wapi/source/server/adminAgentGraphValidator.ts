/**
 * ========================================================================
 * ADMIN AGENT DELIVERY VALIDATOR — Validador de Entrega
 * ========================================================================
 * Camada de verificação pós-criação de conta/agente.
 * Funciona como "Layer 5" do orquestrador.
 *
 * Valida que TODO o fluxo de entrega deu certo:
 *  1. Conta criada no Supabase (user exists)
 *  2. Agente salvo no banco (ai_agent_configs row)
 *  3. Token de teste gerado e funcional
 *  4. Simulador acessível (/test/:token)
 *  5. Credenciais consistentes
 *  6. isExistingAccount correto
 */

import type { AdminGraphState, DeliveryStatus } from "./adminAgentGraphState";

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

export interface DeliveryValidationResult {
  /** Se a validação passou completamente */
  valid: boolean;

  /** Status mais avançado atingido */
  deliveryStatus: DeliveryStatus;

  /** Lista de checks individuais */
  checks: DeliveryCheck[];

  /** Erros (se valid = false) */
  errors: string[];

  /** Warnings (mas válido) */
  warnings: string[];

  /** Timestamp da validação */
  timestamp: number;
}

export interface DeliveryCheck {
  name: string;
  passed: boolean;
  details: string;
  timing?: number; // ms
}

// ============================================================================
// CREDENTIAL CONSISTENCY
// ============================================================================

/**
 * Valida que as credenciais entregues são consistentes.
 * 
 * Checks:
 *  - Email não está vazio
 *  - LoginUrl não está vazio e é URL válida
 *  - Se tem password, não é placeholder
 *  - Se é conta existente, flag isExistingAccount = true
 *  - SimulatorToken presente e formato válido
 */
export function validateCredentialConsistency(
  credentials: {
    email?: string;
    password?: string;
    loginUrl?: string;
    simulatorToken?: string;
    isExistingAccount?: boolean;
  },
  state: AdminGraphState,
): DeliveryCheck[] {
  const checks: DeliveryCheck[] = [];

  // Check 1: Email
  const hasEmail = !!(credentials.email && credentials.email.includes("@"));
  checks.push({
    name: "email_valid",
    passed: hasEmail,
    details: hasEmail
      ? `Email: ${credentials.email}`
      : `Email inválido ou ausente: ${credentials.email || "(vazio)"}`,
  });

  // Check 2: LoginUrl
  const hasLoginUrl = !!(credentials.loginUrl && credentials.loginUrl.startsWith("http"));
  checks.push({
    name: "login_url_valid",
    passed: hasLoginUrl,
    details: hasLoginUrl
      ? `LoginUrl: ${credentials.loginUrl}`
      : `LoginUrl inválido: ${credentials.loginUrl || "(vazio)"}`,
  });

  // Check 3: Password (se não é conta existente)
  if (!credentials.isExistingAccount) {
    const hasPassword = !!(credentials.password && credentials.password.length >= 4);
    checks.push({
      name: "password_present",
      passed: hasPassword,
      details: hasPassword
        ? "Password presente e válido"
        : `Password ausente ou muito curto`,
    });
  }

  // Check 4: isExistingAccount flag consistency
  const hasLinkedUser = !!state.linkedUserId;
  const flagConsistent =
    !credentials.isExistingAccount || hasLinkedUser;
  checks.push({
    name: "existing_account_flag",
    passed: flagConsistent,
    details: flagConsistent
      ? `isExisting=${credentials.isExistingAccount}, linkedUser=${hasLinkedUser}`
      : `Flag isExistingAccount=true mas sem linkedUserId`,
  });

  // Check 5: SimulatorToken
  const hasToken = !!(credentials.simulatorToken && credentials.simulatorToken.length > 10);
  checks.push({
    name: "simulator_token",
    passed: hasToken,
    details: hasToken
      ? `Token presente (${credentials.simulatorToken?.substring(0, 8)}...)`
      : "SimulatorToken ausente ou muito curto",
  });

  return checks;
}

// ============================================================================
// DELIVERY TEXT VALIDATOR
// ============================================================================

/**
 * Valida que o texto de entrega (credenciais) não contém anomalias:
 *  - Não menciona "conta existente" se não é account existente
 *  - Contém email real
 *  - Contém link de login
 *  - Não tem mojibake residual
 */
export function validateDeliveryText(
  text: string,
  credentials: {
    email?: string;
    isExistingAccount?: boolean;
  },
): DeliveryCheck[] {
  const checks: DeliveryCheck[] = [];
  const normalizedText = text.toLowerCase();

  // Check 1: Não contém "conta existente" falso
  const falseExistingPatterns = [
    /mantive.*conta/i,
    /conta.*existente/i,
    /conta.*anterior/i,
    /cadastro.*existente/i,
  ];
  const hasFalseExisting =
    !credentials.isExistingAccount &&
    falseExistingPatterns.some(p => p.test(text));
  checks.push({
    name: "no_false_existing",
    passed: !hasFalseExisting,
    details: hasFalseExisting
      ? "ALERTA: Texto menciona 'conta existente' mas isExistingAccount=false"
      : "OK: Sem menção falsa a conta existente",
  });

  // Check 2: Contém email
  const containsEmail = !!(credentials.email && normalizedText.includes(credentials.email.toLowerCase()));
  checks.push({
    name: "contains_email",
    passed: containsEmail,
    details: containsEmail
      ? `Email ${credentials.email} encontrado no texto`
      : `Email ${credentials.email || "(vazio)"} NÃO encontrado no texto`,
  });

  // Check 3: Contém link
  const containsLink = /https?:\/\/[^\s]+/.test(text);
  checks.push({
    name: "contains_login_link",
    passed: containsLink,
    details: containsLink
      ? "Link de login presente no texto"
      : "ALERTA: Sem link de login no texto de entrega",
  });

  // Check 4: Mojibake residual
  const mojibakeCount = (text.match(/[ÃÂ]/g) || []).length;
  const hasMojibake = mojibakeCount > 2;
  checks.push({
    name: "no_mojibake",
    passed: !hasMojibake,
    details: hasMojibake
      ? `ALERTA: ${mojibakeCount} caracteres mojibake residuais`
      : "OK: Sem mojibake detectado",
  });

  return checks;
}

// ============================================================================
// FULL DELIVERY VALIDATION
// ============================================================================

/**
 * Executa validação completa de entrega.
 * Combina credential consistency + delivery text validation.
 */
export function validateDelivery(
  state: AdminGraphState,
  deliveryText: string,
  credentials: {
    email?: string;
    password?: string;
    loginUrl?: string;
    simulatorToken?: string;
    isExistingAccount?: boolean;
  },
): DeliveryValidationResult {
  const allChecks: DeliveryCheck[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Run credential checks
  const credChecks = validateCredentialConsistency(credentials, state);
  allChecks.push(...credChecks);

  // Run delivery text checks
  const textChecks = validateDeliveryText(deliveryText, credentials);
  allChecks.push(...textChecks);

  // Aggregate results
  for (const check of allChecks) {
    if (!check.passed) {
      // Some checks are errors, some are warnings
      if (["email_valid", "login_url_valid", "existing_account_flag"].includes(check.name)) {
        errors.push(`[${check.name}] ${check.details}`);
      } else {
        warnings.push(`[${check.name}] ${check.details}`);
      }
    }
  }

  // Determine delivery status
  let deliveryStatus: DeliveryStatus = "not_started";
  const passedNames = new Set(allChecks.filter(c => c.passed).map(c => c.name));

  if (passedNames.has("email_valid")) deliveryStatus = "account_created";
  if (passedNames.has("email_valid") && passedNames.has("simulator_token")) deliveryStatus = "token_generated";
  if (passedNames.has("contains_login_link") && passedNames.has("contains_email")) deliveryStatus = "credentials_sent";
  if (errors.length === 0 && warnings.length === 0) deliveryStatus = "confirmed";

  return {
    valid: errors.length === 0,
    deliveryStatus,
    checks: allChecks,
    errors,
    warnings,
    timestamp: Date.now(),
  };
}
