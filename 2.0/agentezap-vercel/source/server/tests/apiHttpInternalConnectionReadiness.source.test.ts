import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const httpSource = readFileSync(join(process.cwd(), "api", "http.ts"), "utf8");

assert.match(
  httpSource,
  /const WEB_ONLY_FOLLOWUP_HARD_DISCONNECTED_STATUSES = new Set\(\[[\s\S]*"logged_out"[\s\S]*"invalid_session"[\s\S]*"removed"[\s\S]*\]\);/,
  "api/http.ts deve manter uma lista explicita de estados fortes de desconexao para follow-up",
);

assert.match(
  httpSource,
  /function followupConnectionRecordLooksConnected[\s\S]*isConnected === true[\s\S]*WEB_ONLY_FOLLOWUP_CONNECTED_STATUSES\.has\(status\)/,
  "follow-up interno deve aceitar isConnected=true antes de depender apenas de provider_status conectado",
);

assert.ok(
  !/COALESCE\(wc\.is_connected, false\) = true\s+AND\s+COALESCE\(NULLIF\(wc\.provider_status, ''\), 'connected'\) IN \('connected', 'open', 'ready', 'authenticated'\)/.test(httpSource),
  "consultas web-only de follow-up nao devem exigir provider_status conectado quando is_connected ja e verdadeiro",
);

assert.match(
  httpSource,
  /function gatewayFollowupStatusLooksConnected[\s\S]*followupProviderStatusLooksHardDisconnected\(status\.providerStatus\)[\s\S]*status\.isConnected === true/,
  "status vivo do gateway deve vencer estados recuperaveis, mas nao logout/sessao invalida",
);

assert.ok(
  !/blockedStatuses = new Set\(\["disconnected", "logged_out", "logout", "not_connected", "open_timeout"/.test(httpSource),
  "Meta formulario nao deve bloquear estados recuperaveis quando is_connected esta verdadeiro",
);

console.log("apiHttpInternalConnectionReadiness.source.test.ts ok");
