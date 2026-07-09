import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const aiAgentSource = fs.readFileSync(path.resolve(process.cwd(), "server", "aiAgent.ts"), "utf8");

assert.doesNotMatch(
  aiAgentSource,
  /MediaExecutionAlignmentDecision|shouldApplyHonestNoMediaFallback|buildSafeMediaTopicLabel|buildSafeMediaExpectationFallback|resolveMediaExecutionAlignment|applyMediaExecutionAlignment/,
  "aiAgent runtime nao deve manter alinhador/fallback morto de midia como rewriter local de fala publica",
);

assert.doesNotMatch(
  aiAgentSource,
  /prometer m.{0,8}dia que n.{0,8}o foi anexada|tenho v.{0,8}deos de funcionalidades espec|me diz qual dessas partes voc.{0,8} quer ver/,
  "aiAgent runtime nao deve carregar copy publica local de fallback de midia prometida",
);

console.log("aiAgent.mediaExecutionAlignment.test.ts ok");
