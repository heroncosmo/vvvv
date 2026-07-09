import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routesSource = fs.readFileSync(path.resolve(root, "server", "routes.ts"), "utf8");
const webOnlySource = fs.readFileSync(path.resolve(root, "api", "http.ts"), "utf8");
const studioSource = fs.readFileSync(
  path.resolve(root, "client", "src", "components", "agent-studio-unified.tsx"),
  "utf8",
);
const calibrationSource = fs.readFileSync(path.resolve(root, "server", "promptCalibrationService.ts"), "utf8");
const legacyCliRuntimePattern = new RegExp(
  ["Open", "Code"].join("") + "|Mi" + "mo|use" + "Open" + "Code" + "Mi" + "mo|" + "open" + "code",
  "i",
);
const proposalSanitizerStart = webOnlySource.indexOf("function sanitizePromptEditProposalForClient");
const proposalSanitizerEnd = webOnlySource.indexOf("function isPromptEditRetryableProviderMessage", proposalSanitizerStart);
const proposalSanitizerBlock = proposalSanitizerStart >= 0 && proposalSanitizerEnd > proposalSanitizerStart
  ? webOnlySource.slice(proposalSanitizerStart, proposalSanitizerEnd)
  : "";
const promptChatHistoryStart = webOnlySource.indexOf("messages: result.rows.map");
const promptChatHistoryEnd = webOnlySource.indexOf("async function handleAgentGeneratePrompt", promptChatHistoryStart);
const promptChatHistoryBlock = promptChatHistoryStart >= 0 && promptChatHistoryEnd > promptChatHistoryStart
  ? webOnlySource.slice(promptChatHistoryStart, promptChatHistoryEnd)
  : "";
const publicErrorSanitizerStart = webOnlySource.indexOf("function sanitizePromptEditPublicErrorMessage");
const publicErrorSanitizerEnd = webOnlySource.indexOf("function sanitizePromptEditTraceForClient", publicErrorSanitizerStart);
const publicErrorSanitizerBlock = publicErrorSanitizerStart >= 0 && publicErrorSanitizerEnd > publicErrorSanitizerStart
  ? webOnlySource.slice(publicErrorSanitizerStart, publicErrorSanitizerEnd)
  : "";

assert.ok(
  proposalSanitizerBlock,
  "web-only prompt edit proposal sanitizer must exist",
);

assert.doesNotMatch(
  proposalSanitizerBlock,
  /technicalLeak|\bapi\|endpoint\|json\|tool\b|\bprovider\|provedor\|modelo\b|\bsupabase\|banco\|tabela\b/,
  "prompt edit proposal sanitizer must not replace Codex proposal text through technical-keyword filtering",
);

assert.match(
  proposalSanitizerBlock,
  /looksLikePromptEditInternalPayload\(repaired\)/,
  "prompt edit proposal sanitizer must keep deterministic internal payload blocking",
);

assert.match(
  proposalSanitizerBlock,
  /repaired\.length\s*>\s*1600/,
  "prompt edit proposal sanitizer must keep bounded output protection",
);

assert.ok(
  promptChatHistoryBlock,
  "web-only prompt chat history mapper must exist",
);

assert.doesNotMatch(
  promptChatHistoryBlock,
  /\.replace\([^)]*prompts?/,
  "prompt chat history must not rewrite Codex/assistant text by replacing prompt words locally",
);

assert.match(
  promptChatHistoryBlock,
  /sanitizePromptEditProposalForClient\(\s*String\(baseContent\s*\|\|\s*""\),\s*"",?\s*\)/,
  "prompt chat history must pass through repaired Codex text without semantic replacement",
);

assert.ok(
  publicErrorSanitizerBlock,
  "web-only prompt edit public error sanitizer must exist",
);

assert.doesNotMatch(
  webOnlySource,
  /PROMPT_EDIT_PUBLIC_ERROR_MESSAGE|O sistema ainda esta processando a edicao/,
  "prompt edit backend must not keep local public fallback text for stream errors",
);

assert.doesNotMatch(
  publicErrorSanitizerBlock,
  /Tente novamente|sem perder o contexto|PROMPT_EDIT_PUBLIC_ERROR_MESSAGE/,
  "prompt edit public error sanitizer must not invent retry/fallback copy",
);

assert.match(
  publicErrorSanitizerBlock,
  /if \(!message\) return "";/,
  "prompt edit public error sanitizer must fail closed on empty errors",
);

assert.match(
  publicErrorSanitizerBlock,
  /if \(technicalLeak\) return "";/,
  "prompt edit public error sanitizer must fail closed on technical leaks",
);

assert.match(
  publicErrorSanitizerBlock,
  /isPromptEditRetryableProviderMessage\(message\)[\s\S]*return "";/,
  "prompt edit public error sanitizer must fail closed on retryable provider errors",
);

assert.doesNotMatch(
  publicErrorSanitizerBlock,
  /message\.slice\(|return message/,
  "prompt edit public error sanitizer must not pass backend error text to client feedback",
);

assert.match(
  publicErrorSanitizerBlock,
  /return "";\s*\}/,
  "prompt edit public error sanitizer must fail closed for non-technical operational errors too",
);

assert.doesNotMatch(
  studioSource,
  /skipCalibration:\s*true/,
  "Personalize com IA must not skip calibration from the client",
);

assert.match(
  studioSource,
  /skipCalibration:\s*false/,
  "Personalize com IA must request the calibrated prompt-edit path",
);

assert.match(
  studioSource,
  /simulatorHistory:\s*simulatorHistoryForCalibration/,
  "Personalize com IA must send the simulator conversation history to prompt calibration",
);

assert.match(
  studioSource,
  /simulatorSentMedias:\s*simulatorSentMediasForCalibration/,
  "Personalize com IA must send already-sent simulator media state to prompt calibration",
);

assert.match(
  studioSource,
  /data\.success\s*&&\s*data\.newPrompt\s*&&\s*calibrationPassed/,
  "Personalize com IA must only show an applied edit after calibration passes",
);

assert.match(
  routesSource,
  /shouldAllowUncalibratedPromptEdit\(skipCalibration\)/,
  "prompt edit routes must not trust raw skipCalibration from the UI",
);

assert.match(
  routesSource,
  /normalizePromptEditSimulatorHistory\(req\.body\?\.simulatorHistory\)/,
  "prompt edit routes must normalize simulator history before calibration",
);

assert.match(
  routesSource,
  /runtimeSimulator:\s*async[\s\S]*runWebOnlyAgentTestForUser\(userId,[\s\S]*customPrompt:\s*prompt[\s\S]*history[\s\S]*sentMedias/,
  "prompt edit calibration must validate through the same runtime used by the agent simulator",
);

assert.match(
  routesSource,
  /!skipCalibrationAllowed\s*&&\s*\(!calibrationResult\s*\|\|\s*calibrationResult\.sucesso\s*!==\s*true\)[\s\S]*calibration_failed_no_save/,
  "stream prompt edit must fail closed and avoid saving when calibration does not pass",
);

assert.match(
  routesSource,
  /result\.success\s*&&\s*result\.novoPrompt\s*!==\s*currentPrompt\s*&&\s*!skipCalibrationAllowed\s*&&\s*\(!calibrationResult\s*\|\|\s*calibrationResult\.sucesso\s*!==\s*true\)/,
  "legacy prompt edit must fail closed when calibration does not pass",
);

assert.match(
  routesSource,
  /shouldSyncFlowFromPromptEditInstruction\(instruction\)[\s\S]*handleFlowPromptEdit/,
  "prompt edit must synchronize flow/funnel instructions before declaring success",
);

assert.match(
  calibrationSource,
  /Gere exatamente \{\{QUANTIDADE\}\}/,
  "calibration scenario generator must honor requested scenario count",
);

assert.match(
  calibrationSource,
  /runtimeSimulator\?:\s*\(input:\s*CalibrationRuntimeSimulationInput\)/,
  "prompt calibration service must accept a runtime simulator contract",
);

assert.match(
  calibrationSource,
  /repairPromptWithEditor\?:\s*\(input:\s*CalibrationPromptRepairInput\)/,
  "prompt calibration service must accept an external contextual repair editor",
);

assert.match(
  calibrationSource,
  /this\.config\.repairPromptWithEditor[\s\S]*resultadoFalhou:\s*piorResultado[\s\S]*this\.repararPrompt/,
  "prompt calibration repair loop must try the contextual editor before falling back to the legacy repairer",
);

assert.match(
  calibrationSource,
  /PROMPT_CALIBRATION_DEFAULT_CLI_TIMEOUT_MS\s*=\s*90_000/,
  "Codex CLI calibration must have enough time to complete real edit/test cycles",
);

assert.match(
  calibrationSource,
  /runWebOnlyCodexPromptTextForUser\(\{[\s\S]*task:\s*"prompt_calibration"[\s\S]*timeoutMs,[\s\S]*contextArtifacts:\s*\{[\s\S]*calibration:\s*true[\s\S]*jsonMode:\s*options\?\.jsonMode === true/,
  "prompt calibration must pass the resolved CLI timeout and context into the Codex CLI runtime",
);

assert.doesNotMatch(
  calibrationSource,
  legacyCliRuntimePattern,
  "prompt calibration service must not keep legacy CLI runtime branches",
);

assert.match(
  calibrationSource,
  /extractPublicCalibrationContent[\s\S]*extractFirstCalibrationJsonValue/,
  "prompt calibration must parse JSON values from the public assistant response envelope instead of the whole runtime envelope",
);

assert.match(
  calibrationSource,
  /char === "\{" \|\| char === "\["[\s\S]*expectedClosers/,
  "prompt calibration JSON parser must accept object or array roots from Codex CLI output",
);

assert.match(
  calibrationSource,
  /Array\.isArray\(parsed\)[\s\S]*Array\.isArray\(parsed\.cenarios\)/,
  "prompt calibration scenario generator must accept a root JSON array or an object with cenarios",
);

assert.match(
  calibrationSource,
  /deterministicScenarios\.length\s*>\s*0[\s\S]*return deterministicScenarios\.slice\(0,\s*quantidade\)/,
  "prompt calibration must skip LLM scenario generation when deterministic scenarios cover the edit",
);

assert.match(
  routesSource,
  /repairPromptWithEditor:\s*createPromptCalibrationRepairEditor\(\{[\s\S]*userId[\s\S]*sendEvent[\s\S]*\}\)/,
  "prompt edit calibration must repair failed rounds through the same contextual Codex editor used by Personalize com IA",
);

assert.match(
  routesSource,
  /conversationId:\s*`prompt-edit-repair:\$\{params\.userId\}`/,
  "prompt edit calibration repairs must keep a stable repair conversation context",
);

assert.match(
  calibrationSource,
  /instrucao_gatilho_resposta_exata/,
  "prompt calibration must create deterministic scenarios for explicit customer trigger and expected response instructions",
);

assert.match(
  calibrationSource,
  /this\.config\.runtimeSimulator[\s\S]*collectRuntimeSimulationText/,
  "prompt calibration service must read the real runtime simulation output",
);

assert.match(
  calibrationSource,
  /historyStrategy\?:\s*"replace"\s*\|\s*"append"/,
  "deterministic calibration scenarios must declare how their required context is combined",
);

assert.match(
  calibrationSource,
  /id:\s*`fluxo_etapa_\$\{stage\}_link`[\s\S]*historyStrategy:\s*"append"/,
  "funnel/link calibration scenarios must append their stage context to simulator history",
);

assert.match(
  calibrationSource,
  /resolveCalibrationScenarioHistory[\s\S]*baseHistory\.slice\(-16\)[\s\S]*scenarioHistory/,
  "prompt calibration must preserve simulator history while appending deterministic stage context",
);

assert.match(
  calibrationSource,
  /scenarioId\?:\s*string[\s\S]*resetState\?:\s*boolean/,
  "runtime calibration must expose scenario identity and reset state to isolate validation scenarios",
);

assert.match(
  calibrationSource,
  /scenarioId:\s*cenario\?\.id[\s\S]*resetState:\s*true/,
  "prompt calibration must request isolated runtime state for each validation scenario",
);

assert.match(
  calibrationSource,
  /action\?\.media_url[\s\S]*action\?\.mediaUrl[\s\S]*action\?\.url[\s\S]*action\?\.link/,
  "prompt calibration must validate links returned through structured media actions",
);

assert.match(
  routesSource,
  /scenarioSessionSuffix[\s\S]*sessionId:\s*`prompt-edit-calibration:\$\{userId\}\$\{scenarioSessionSuffix\}`[\s\S]*resetSimulator:\s*resetState\s*===\s*true/,
  "prompt edit calibration runtime must isolate simulator sessions per scenario",
);

assert.doesNotMatch(
  calibrationSource,
  /baseHistory\.length\s*>\s*0\s*\?\s*baseHistory\s*:\s*scenarioHistory/,
  "prompt calibration must not discard deterministic scenario history when simulator history exists",
);

assert.doesNotMatch(
  calibrationSource,
  /passou:\s*respostaAgente\.length\s*>\s*50/,
  "calibration must not approve a scenario only because the answer is long",
);

assert.match(
  webOnlySource,
  /finalSimulation[\s\S]*finalSimulation\.ok\s*!==\s*true[\s\S]*quick_edit_validation_failed/,
  "web-only prompt edit must not save when the post-edit simulation fails",
);

assert.match(
  webOnlySource,
  /validationPassed:\s*boolean/,
  "agentic test-and-fix must expose a validationPassed contract",
);

assert.match(
  webOnlySource,
  /!testResult\.validationPassed[\s\S]*quick_edit_agentic_test_failed/,
  "agentic test-and-fix must fail closed when critical retests fail",
);

console.log("promptEditCalibrationContract.source.test.ts: ok");
