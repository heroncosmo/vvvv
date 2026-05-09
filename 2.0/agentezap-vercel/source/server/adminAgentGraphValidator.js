"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCredentialConsistency = validateCredentialConsistency;
exports.validateDeliveryText = validateDeliveryText;
exports.validateDelivery = validateDelivery;
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
function validateCredentialConsistency(credentials, state) {
    var _a;
    var checks = [];
    // Check 1: Email
    var hasEmail = !!(credentials.email && credentials.email.includes("@"));
    checks.push({
        name: "email_valid",
        passed: hasEmail,
        details: hasEmail
            ? "Email: ".concat(credentials.email)
            : "Email inv\u00E1lido ou ausente: ".concat(credentials.email || "(vazio)"),
    });
    // Check 2: LoginUrl
    var hasLoginUrl = !!(credentials.loginUrl && credentials.loginUrl.startsWith("http"));
    checks.push({
        name: "login_url_valid",
        passed: hasLoginUrl,
        details: hasLoginUrl
            ? "LoginUrl: ".concat(credentials.loginUrl)
            : "LoginUrl inv\u00E1lido: ".concat(credentials.loginUrl || "(vazio)"),
    });
    // Check 3: Password (se não é conta existente)
    if (!credentials.isExistingAccount) {
        var hasPassword = !!(credentials.password && credentials.password.length >= 4);
        checks.push({
            name: "password_present",
            passed: hasPassword,
            details: hasPassword
                ? "Password presente e válido"
                : "Password ausente ou muito curto",
        });
    }
    // Check 4: isExistingAccount flag consistency
    var hasLinkedUser = !!state.linkedUserId;
    var flagConsistent = !credentials.isExistingAccount || hasLinkedUser;
    checks.push({
        name: "existing_account_flag",
        passed: flagConsistent,
        details: flagConsistent
            ? "isExisting=".concat(credentials.isExistingAccount, ", linkedUser=").concat(hasLinkedUser)
            : "Flag isExistingAccount=true mas sem linkedUserId",
    });
    // Check 5: SimulatorToken
    var hasToken = !!(credentials.simulatorToken && credentials.simulatorToken.length > 10);
    checks.push({
        name: "simulator_token",
        passed: hasToken,
        details: hasToken
            ? "Token presente (".concat((_a = credentials.simulatorToken) === null || _a === void 0 ? void 0 : _a.substring(0, 8), "...)")
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
function validateDeliveryText(text, credentials) {
    var checks = [];
    var normalizedText = text.toLowerCase();
    // Check 1: Não contém "conta existente" falso
    var falseExistingPatterns = [
        /mantive.*conta/i,
        /conta.*existente/i,
        /conta.*anterior/i,
        /cadastro.*existente/i,
    ];
    var hasFalseExisting = !credentials.isExistingAccount &&
        falseExistingPatterns.some(function (p) { return p.test(text); });
    checks.push({
        name: "no_false_existing",
        passed: !hasFalseExisting,
        details: hasFalseExisting
            ? "ALERTA: Texto menciona 'conta existente' mas isExistingAccount=false"
            : "OK: Sem menção falsa a conta existente",
    });
    // Check 2: Contém email
    var containsEmail = !!(credentials.email && normalizedText.includes(credentials.email.toLowerCase()));
    checks.push({
        name: "contains_email",
        passed: containsEmail,
        details: containsEmail
            ? "Email ".concat(credentials.email, " encontrado no texto")
            : "Email ".concat(credentials.email || "(vazio)", " N\u00C3O encontrado no texto"),
    });
    // Check 3: Contém link
    var containsLink = /https?:\/\/[^\s]+/.test(text);
    checks.push({
        name: "contains_login_link",
        passed: containsLink,
        details: containsLink
            ? "Link de login presente no texto"
            : "ALERTA: Sem link de login no texto de entrega",
    });
    // Check 4: Mojibake residual
    var mojibakeCount = (text.match(/[ÃÂ]/g) || []).length;
    var hasMojibake = mojibakeCount > 2;
    checks.push({
        name: "no_mojibake",
        passed: !hasMojibake,
        details: hasMojibake
            ? "ALERTA: ".concat(mojibakeCount, " caracteres mojibake residuais")
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
function validateDelivery(state, deliveryText, credentials) {
    var allChecks = [];
    var errors = [];
    var warnings = [];
    // Run credential checks
    var credChecks = validateCredentialConsistency(credentials, state);
    allChecks.push.apply(allChecks, credChecks);
    // Run delivery text checks
    var textChecks = validateDeliveryText(deliveryText, credentials);
    allChecks.push.apply(allChecks, textChecks);
    // Aggregate results
    for (var _i = 0, allChecks_1 = allChecks; _i < allChecks_1.length; _i++) {
        var check = allChecks_1[_i];
        if (!check.passed) {
            // Some checks are errors, some are warnings
            if (["email_valid", "login_url_valid", "existing_account_flag"].includes(check.name)) {
                errors.push("[".concat(check.name, "] ").concat(check.details));
            }
            else {
                warnings.push("[".concat(check.name, "] ").concat(check.details));
            }
        }
    }
    // Determine delivery status
    var deliveryStatus = "not_started";
    var passedNames = new Set(allChecks.filter(function (c) { return c.passed; }).map(function (c) { return c.name; }));
    if (passedNames.has("email_valid"))
        deliveryStatus = "account_created";
    if (passedNames.has("email_valid") && passedNames.has("simulator_token"))
        deliveryStatus = "token_generated";
    if (passedNames.has("contains_login_link") && passedNames.has("contains_email"))
        deliveryStatus = "credentials_sent";
    if (errors.length === 0 && warnings.length === 0)
        deliveryStatus = "confirmed";
    return {
        valid: errors.length === 0,
        deliveryStatus: deliveryStatus,
        checks: allChecks,
        errors: errors,
        warnings: warnings,
        timestamp: Date.now(),
    };
}
