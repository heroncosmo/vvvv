import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.resolve(process.cwd(), "server", "adminSetupRequestService.ts"), "utf8");

test("admin setup analyzer/chat fail closed until a Codex structured setup contract exists", () => {
  assert.doesNotMatch(source, /runWebOnlyCodexPromptTextForUser|callJsonLlm|admin_setup_request_json/);
  assert.doesNotMatch(source, /replyText|Ajustei o plano|Fallback seguro|monta um plano inicial|refinar um plano/);
  assert.match(
    source,
    /export async function classifyAdminConversationMode[\s\S]*void params;[\s\S]*mode:\s*"normal_sales"[\s\S]*disabled_until_codex_structured_contract/,
  );
  assert.match(
    source,
    /export async function analyzeSetupRequest[\s\S]*throw new Error\("SETUP_REQUEST_ANALYSIS_REQUIRES_CODEX_STRUCTURED_CONTRACT"\)/,
  );
  assert.match(
    source,
    /export async function chatSetupRequest[\s\S]*throw new Error\("SETUP_REQUEST_CHAT_REQUIRES_CODEX_STRUCTURED_CONTRACT"\)/,
  );
});
