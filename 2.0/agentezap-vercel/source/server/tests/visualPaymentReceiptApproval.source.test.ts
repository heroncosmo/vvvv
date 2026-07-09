import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const runtimeSource = readFileSync(join(root, "server", "agenteZapCodexCliRuntime.ts"), "utf8");
const bridgeSource = readFileSync(join(root, "server", "adminAgentToolCalling.ts"), "utf8");
const receiptSource = readFileSync(join(root, "server", "paymentReceiptService.ts"), "utf8");

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing start marker ${start}`);
  assert.ok(endIndex > startIndex, `missing end marker ${end}`);
  return source.slice(startIndex, endIndex);
}

const tenantActionsBlock = sliceBetween(
  runtimeSource,
  "const TENANT_SUPPORT_ACTIONS",
  "const RODRIGO_CREATOR_ACTIONS",
);
const rodrigoCreatorBlock = sliceBetween(
  runtimeSource,
  "const RODRIGO_CREATOR_ACTIONS",
  "const RODRIGO_EXISTING_ACCOUNT_ACTIONS",
);
const rodrigoExistingBlock = sliceBetween(
  runtimeSource,
  "const RODRIGO_EXISTING_ACCOUNT_ACTIONS",
  "const PERSONALIZE_ACTIONS",
);

assert.ok(
  rodrigoCreatorBlock.includes("'approve_payment_from_visual_receipt'"),
  "Rodrigo creator scope must be able to request visual receipt approval as a structured action",
);
assert.ok(
  rodrigoExistingBlock.includes("'approve_payment_from_visual_receipt'"),
  "Rodrigo existing-account scope must be able to request visual receipt approval as a structured action",
);
assert.equal(
  tenantActionsBlock.includes("'approve_payment_from_visual_receipt'"),
  false,
  "normal tenant support must not receive Rodrigo billing approval capability",
);

assert.match(
  runtimeSource,
  /approve_payment_from_visual_receipt[\s\S]*arguments\.subscriptionId[\s\S]*arguments\.valorPago[\s\S]*arguments\.dataPagamento[\s\S]*arguments\.statusComprovante[\s\S]*arguments\.recebedor[\s\S]*arguments\.instituicaoRecebedor[\s\S]*arguments\.evidenceSummary/,
  "Codex prompt must describe the visual receipt approval contract and required subscription/value/date/receiver arguments",
);
assert.match(
  runtimeSource,
  /Nao aprove pagamento por texto solto[\s\S]*subscriptionId ausente\/divergente[\s\S]*valor\/data\/recebedor\/instituicao ausentes[\s\S]*recebedor\/banco errado[\s\S]*sem currentMediaEvidence ok/,
  "Codex prompt must forbid approval without current visual evidence, subscription and expected receiver data",
);

assert.match(
  bridgeSource,
  /import \{ approveVisualPaymentReceiptFromWhatsApp \} from '\.\/paymentReceiptService';/,
  "admin bridge must execute approval through the deterministic payment receipt service",
);
assert.match(
  bridgeSource,
  /function isUsableVisualPaymentEvidence[\s\S]*evidence\.status !== 'ok'[\s\S]*evidence\.kind !== 'image' && evidence\.kind !== 'pdf'[\s\S]*metadata_only[\s\S]*extractedText[\s\S]*actual === expected/,
  "admin bridge must require OCR/vision evidence from the current image/PDF media URL",
);
assert.match(
  bridgeSource,
  /firstLiveCliAction\(result\.plan\.actions, \['approve_payment_from_visual_receipt'\]\)/,
  "admin bridge must handle the Codex visual payment action explicitly",
);
assert.match(
  bridgeSource,
  /approveVisualPaymentReceiptFromWhatsApp\(\{[\s\S]*sourceUrl: params\.mediaEvidence\.mediaUrl[\s\S]*subscriptionId[\s\S]*amountPaid[\s\S]*paymentDate[\s\S]*receiptStatus[\s\S]*receiverName[\s\S]*receiverInstitution[\s\S]*evidenceSummary/,
  "admin bridge must pass structured Codex subscription arguments and media evidence to the executor",
);

assert.match(
  receiptSource,
  /export async function approveVisualPaymentReceiptFromWhatsApp/,
  "payment receipt service must expose the visual approval executor",
);
assert.match(
  receiptSource,
  /Valor esperado do plano indisponivel para aprovacao automatica/,
  "visual approval must fail closed when the expected plan value is unavailable",
);
assert.match(
  receiptSource,
  /amountPaid < minimumAmount/,
  "visual approval must reject receipts below the expected plan value",
);
assert.match(
  receiptSource,
  /amountPaid > maximumAmount/,
  "visual approval must reject receipts above the expected plan value tolerance",
);
assert.match(
  receiptSource,
  /validateVisualReceiptReceiver[\s\S]*AGENTEZAP_VISUAL_RECEIPT_EXPECTED_RECEIVER_NAMES[\s\S]*Maria Fernandes de Bessa Macedo[\s\S]*AGENTEZAP_VISUAL_RECEIPT_EXPECTED_RECEIVER_INSTITUTIONS[\s\S]*Nu Pagamentos[\s\S]*Nubank/,
  "visual approval must validate the expected AgenteZap receiver and institution deterministically",
);
assert.match(
  receiptSource,
  /UPDATE payment_receipts[\s\S]*status = 'approved'[\s\S]*reviewed_by = 'codex_visual_receipt'/,
  "visual approval must mark the receipt as approved with an audit reviewer",
);
assert.match(
  receiptSource,
  /UPDATE subscriptions s[\s\S]*status = 'active'[\s\S]*pending_receipt = false/,
  "visual approval must activate the subscription and clear pending receipt state",
);
assert.match(
  receiptSource,
  /manual_receipt_visual_approved/,
  "visual approval must write a payment_history record with a distinct status detail",
);
assert.match(
  receiptSource,
  /Assinatura do contrato Codex nao confere com a conta resolvida/,
  "visual approval must reject a Codex contract whose subscriptionId does not match the resolved account",
);
assert.match(
  receiptSource,
  /cleanupRodrigoPaidLeadFollowupInTransaction[\s\S]*UPDATE conversations c[\s\S]*UPDATE admin_conversations ac[\s\S]*UPDATE owner_scheduled_notifications osn[\s\S]*UPDATE admin_pix_recovery_messages/,
  "visual approval must clean Rodrigo paid-lead follow-up inside the same transaction",
);
const cleanupIndex = receiptSource.indexOf("cleanupRodrigoPaidLeadFollowupInTransaction(client");
const commitIndex = receiptSource.indexOf('await client.query("COMMIT")');
assert.ok(cleanupIndex >= 0 && commitIndex > cleanupIndex, "visual approval cleanup must run before COMMIT");
assert.doesNotMatch(
  receiptSource,
  /error_message = 'skipped_payment_already_recorded'|processed_at = NOW\(\)[\s\S]*admin_pix_recovery_messages/,
  "visual approval must use the actual admin_pix_recovery_messages columns",
);

console.log("visualPaymentReceiptApproval.source.test.ts ok");
