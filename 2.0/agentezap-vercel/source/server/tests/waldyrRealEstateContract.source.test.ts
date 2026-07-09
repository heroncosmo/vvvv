import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const httpSource = readFileSync(resolve(__dirname, "../../api/http.ts"), "utf8");
const aiAgentSource = readFileSync(resolve(__dirname, "../aiAgent.ts"), "utf8");

assert.ok(
  httpSource.includes("wal_brisas_nearby_context_contract"),
  "WAL/Brisas contract must handle nearby-region questions without falling through to an empty LLM reply",
);

assert.ok(
  httpSource.includes("wal_brisas_opening_contract") &&
    httpSource.includes("Qual opcao voce prefere?"),
  "WAL/Brisas opening contract must answer first direct Brisas inquiries without waiting on the long prompt",
);

assert.ok(
  httpSource.includes("WEB_ONLY_WALDYR_PROJECTS") &&
    httpSource.includes("Seleto Amoreiras") &&
    httpSource.includes("Orla Recreio/Pontal") &&
    httpSource.includes("Like Jardim Oriente"),
  "WAL real estate contract must cover known registered projects, not only Brisas",
);

assert.ok(
  httpSource.includes("buildWebOnlyWaldyrConfiguredProjects") &&
    httpSource.includes("triggerPhrases: config?.trigger_phrases"),
  "WAL web-only contract must build project context from tenant trigger phrases, not only hard-coded projects",
);

assert.ok(
  httpSource.includes("WEB_ONLY_WALDYR_CONFIGURED_PROJECT_STOPWORDS") &&
    httpSource.includes('"barra"') &&
    httpSource.includes('"quero informacoes"') &&
    httpSource.includes('"apresentacao"') &&
    httpSource.includes('"fotos e videos"') &&
    httpSource.includes('"sao jose dos campos"') &&
    httpSource.includes('"sjc"') &&
    aiAgentSource.includes("WALDYR_RUNTIME_CONFIGURED_PROJECT_STOPWORDS") &&
    aiAgentSource.includes('"apresentacao"') &&
    aiAgentSource.includes('"fotos e videos"'),
  "WAL configured projects must ignore broad region/action words so names like Duet are not shadowed by Barra or menu labels",
);

assert.ok(
  httpSource.includes("sortWebOnlyWaldyrProjectMatches") &&
    httpSource.includes("aliasLength") &&
    httpSource.includes("isWebOnlyWaldyrRegionProject") &&
    aiAgentSource.includes("sortWaldyrRuntimeProjectMatches") &&
    aiAgentSource.includes("isWaldyrRuntimeRegionProject"),
  "WAL project resolver must rank specific project aliases above broad aliases/regions like Reserva or SJC",
);

const webSortIndex = httpSource.indexOf("function sortWebOnlyWaldyrProjectMatches");
const webConfiguredPriorityIndex = httpSource.indexOf("if (a.configuredProject !== b.configuredProject)", webSortIndex);
const webAliasPriorityIndex = httpSource.indexOf("if (a.aliasLength !== b.aliasLength)", webSortIndex);
const runtimeSortIndex = aiAgentSource.indexOf("function sortWaldyrRuntimeProjectMatches");
const runtimeConfiguredPriorityIndex = aiAgentSource.indexOf("if (a.configuredProject !== b.configuredProject)", runtimeSortIndex);
const runtimeAliasPriorityIndex = aiAgentSource.indexOf("if (a.aliasLength !== b.aliasLength)", runtimeSortIndex);
assert.ok(
  webSortIndex >= 0 &&
    webConfiguredPriorityIndex > webSortIndex &&
    webAliasPriorityIndex > webConfiguredPriorityIndex &&
    runtimeSortIndex >= 0 &&
    runtimeConfiguredPriorityIndex > runtimeSortIndex &&
    runtimeAliasPriorityIndex > runtimeConfiguredPriorityIndex,
  "WAL project resolver must prefer curated project aliases over configured location fragments before comparing alias length",
);

assert.ok(
  httpSource.includes("hasExplicitWebOnlyWaldyrCurrentProjectSignal") &&
    httpSource.includes("allowContextProjectFallback") &&
    httpSource.includes("allowTurnContextFallback: allowContextProjectFallback") &&
    httpSource.includes("params.history.slice(-3)") &&
    httpSource.includes("recentHistoryProjectSources") &&
    httpSource.includes(".slice(-3)\n    .reverse()") &&
    aiAgentSource.includes("hasExplicitWaldyrRuntimeCurrentProjectSignal") &&
    aiAgentSource.includes("allowContextProjectFallback") &&
    aiAgentSource.includes("allowTurnContextFallback: allowContextProjectFallback") &&
    aiAgentSource.includes("recentHistoryProjectSources") &&
    aiAgentSource.includes(".slice(-3)\n    .reverse()"),
  "WAL project resolver must not let old history override a new explicit project inquiry or a more recent project continuation; history fallback is only for short/material continuations",
);

assert.ok(
  httpSource.includes("wal_project_information_contract") &&
    httpSource.includes("hasInformationIntent") &&
    httpSource.includes("fgts") &&
    !httpSource.includes("renda|entrada|fab") &&
    aiAgentSource.includes("hasInformationIntent") &&
    !aiAgentSource.includes("renda|entrada|fab"),
  "WAL information requests for project + FAB audience must not be treated as simulation unless simulation terms are present",
);

const earlyRealEstateContractIndex = httpSource.indexOf("const earlyPromptCanonicalTurn = resolveWebOnlyPromptCanonicalRealEstateTurn");
const triggerBlockedIndex = httpSource.indexOf('mode: "trigger_blocked"');
assert.ok(
  earlyRealEstateContractIndex >= 0 &&
    triggerBlockedIndex >= 0 &&
    earlyRealEstateContractIndex < triggerBlockedIndex,
  "WAL real estate contract must run before the web-only trigger gate so known project inquiries are not blocked",
);

assert.match(
  httpSource,
  /faculdade\|universidade\|escola\|creche\|hospital\|mercado\|shopping\|comercio\|onibus\|transporte\|praia/,
  "WAL/Brisas nearby-region contract must cover common infrastructure questions",
);

assert.ok(
  httpSource.includes("Vou deixar como solicitacao para a equipe conferir"),
  "WAL/Brisas simulation contract must acknowledge already provided simulation data",
);

assert.ok(
  aiAgentSource.includes("buildWaldyrRuntimeRealEstateContract"),
  "Unified WhatsApp/public simulator runtime must also expose the WAL/Brisas contract",
);

assert.ok(
  aiAgentSource.includes("wal_canonico_brisas") &&
    aiAgentSource.includes("wal canonico brisas") &&
    aiAgentSource.includes("wal_brisas_nearby_context_contract") === false,
  "Unified runtime must scope the WAL/Brisas contract by the tenant prompt marker without relying on the web-only reason string",
);

assert.ok(
  aiAgentSource.includes("Consigo deixar essa duvida sobre a regiao para a equipe confirmar com precisao."),
  "Unified runtime must answer nearby-region questions without falling through to an empty LLM reply",
);

assert.ok(
  aiAgentSource.includes("buildWaldyrRuntimeProjectOpeningText") &&
    aiAgentSource.includes("Qual opcao voce prefere?"),
  "Unified runtime must answer first direct Brisas inquiries without falling through to the long prompt",
);

assert.ok(
  aiAgentSource.includes("WALDYR_RUNTIME_PROJECTS") &&
    aiAgentSource.includes("Seleto Amoreiras") &&
    aiAgentSource.includes("Orla Recreio/Pontal") &&
    aiAgentSource.includes("Like Jardim Oriente"),
  "Unified runtime must cover known registered WAL projects, not only Brisas",
);

const runtimeEarlyRealEstateIndex = aiAgentSource.indexOf("const earlyWaldyrRealEstateContract = buildWaldyrRuntimeRealEstateContract");
const runtimeTriggerGateIndex = aiAgentSource.indexOf("const triggerGate = pendingFirstMessageRecovery");
assert.ok(
  runtimeEarlyRealEstateIndex >= 0 &&
    runtimeTriggerGateIndex >= 0 &&
    runtimeEarlyRealEstateIndex < runtimeTriggerGateIndex &&
    aiAgentSource.includes("buildWaldyrRuntimeConfiguredProjects") &&
    aiAgentSource.includes("triggerPhrases: agentConfig.triggerPhrases"),
  "Unified runtime must use tenant trigger phrases before the trigger gate for configured WAL projects",
);

console.log("waldyrRealEstateContract.source.test.ts ok");
