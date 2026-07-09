import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.DATABASE_URL ||= "postgresql://user:pass@localhost:5432/agentezap_test";

const {
  editarPromptViaIA,
  extractPromptFromPlainTextRewriteResponse,
  looksLikePromptRuntimeResponseEnvelope,
  sanitizePromptEditGeneratedPrompt,
  validatePromptInstructionApplication,
} = await import("../promptEditService");

const basePrompt = [
  "Voce e o atendente da empresa.",
  "",
  "## Regras de negocio",
  "- Nunca invente valores.",
  "- Envie midias somente quando estiverem configuradas.",
].join("\n");

const runtimeEnvelope = [
  "<assistant_response>",
  "Sim, ja deixei pronto para voce.",
  "</assistant_response>",
  "<attention_json>{\"needs_attention\":false}</attention_json>",
].join("");

assert.equal(looksLikePromptRuntimeResponseEnvelope(runtimeEnvelope), true);
assert.equal(sanitizePromptEditGeneratedPrompt(runtimeEnvelope), "");
assert.equal(extractPromptFromPlainTextRewriteResponse(runtimeEnvelope), null);
assert.equal(
  validatePromptInstructionApplication(basePrompt, runtimeEnvelope, "adicione uma regra").applied,
  false,
);

const formalResult = await editarPromptViaIA(basePrompt, "Torne o tom mais formal e profissional");

assert.equal(formalResult.success, true);
assert.equal(formalResult.edicoesAplicadas, 1);
assert.notEqual(formalResult.novoPrompt, basePrompt);
assert.match(formalResult.novoPrompt, /## Diretriz de estilo da IA/);
assert.match(formalResult.novoPrompt, /tom mais formal e profissional/);
assert.match(formalResult.novoPrompt, /Nunca invente valores/);
assert.match(formalResult.novoPrompt, /Envie midias somente quando estiverem configuradas/);

const conciseResult = await editarPromptViaIA(
  formalResult.novoPrompt,
  "Faca as respostas serem mais curtas e diretas",
);

assert.equal(conciseResult.success, true);
assert.equal((conciseResult.novoPrompt.match(/## Diretriz de estilo da IA/g) || []).length, 1);
assert.match(conciseResult.novoPrompt, /respostas curtas, diretas/);
assert.doesNotMatch(conciseResult.novoPrompt, /tom mais formal e profissional/);
assert.match(conciseResult.novoPrompt, /Nunca invente valores/);

const explicitInstruction =
  'Quando o cliente escrever "codigo teste calibrador", responda exatamente "Teste calibrador aprovado". Mantenha o restante igual.';
const explicitResult = await editarPromptViaIA(basePrompt, explicitInstruction);

assert.equal(explicitResult.success, true);
assert.equal(explicitResult.edicoesAplicadas, 1);
assert.match(explicitResult.novoPrompt, /## Regras especificas adicionadas pela IA/);
assert.match(explicitResult.novoPrompt, /codigo teste calibrador/);
assert.match(explicitResult.novoPrompt, /Teste calibrador aprovado/);
assert.match(explicitResult.novoPrompt, /Nunca invente valores/);
assert.equal(
  validatePromptInstructionApplication(basePrompt, explicitResult.novoPrompt, explicitInstruction).applied,
  true,
);
assert.equal(
  validatePromptInstructionApplication(basePrompt, basePrompt, explicitInstruction).applied,
  false,
);

const routesSource = fs.readFileSync(path.resolve(process.cwd(), "server", "routes.ts"), "utf8");

assert.equal(
  routesSource.includes("PROMPT_EDIT_STREAM_HEARTBEAT_MS"),
  true,
  "edit-prompt-stream must keep the SSE connection alive while long edits run",
);
assert.equal(
  routesSource.includes("withPromptEditStreamTimeout"),
  true,
  "edit-prompt-stream must time-box each provider attempt instead of hanging indefinitely",
);
assert.equal(
  routesSource.includes("Ainda estou processando a edicao com seguranca"),
  true,
  "heartbeat message must be customer-safe and not expose provider/runtime details",
);

console.log("promptEditQuickStyleAndStreamGuard.test.ts: ok");
