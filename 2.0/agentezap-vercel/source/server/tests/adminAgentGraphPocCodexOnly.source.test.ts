import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const graphPocSource = fs.readFileSync(path.resolve(root, "server", "adminAgentGraphPOC.ts"), "utf8");
const routesSource = fs.readFileSync(path.resolve(root, "server", "routes.ts"), "utf8");

test("admin graph POC is state-only and cannot act as a legacy runtime brain", () => {
  assert.doesNotMatch(
    graphPocSource,
    /from "\.\/adminAgentGraphClassifier"|from "\.\/adminAgentGraphPolicy"|from "\.\/adminAgentGraphExecutor"|from "\.\/adminAgentOutputSanitizer"|from "\.\/adminAgentGraphValidator"|from "\.\/adminAgentTurnAuditor"/,
  );
  assert.doesNotMatch(
    graphPocSource,
    /classifyTurn\(|evaluatePolicy\(|executePolicyDecision\(|sanitizeOutput\(|validateDelivery\(|auditTurn\(|updateLastAuditWithSanitizeResult\(/,
  );
  assert.match(graphPocSource, /export function clearGraphState\(phoneNumber: string\): void/);
  assert.match(graphPocSource, /export async function processAdminMessageGraph[\s\S]*return buildNoSendResult\(state, startTime\)/);
  assert.match(graphPocSource, /admin_graph_poc_disabled_until_codex_structured_contract/);
  assert.match(routesSource, /const \{ clearGraphState \} = await import\("\.\/adminAgentGraphPOC"\)/);
});
