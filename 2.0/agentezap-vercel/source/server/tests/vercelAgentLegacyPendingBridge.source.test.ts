import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const httpSource = fs.readFileSync(path.resolve(process.cwd(), "api", "http.ts"), "utf8");

function blockBetween(startMarker: string, endMarker: string): string {
  const start = httpSource.indexOf(startMarker);
  assert.notEqual(start, -1, `Nao encontrou ${startMarker}`);
  const end = httpSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Nao encontrou fim ${endMarker}`);
  return httpSource.slice(start, end);
}

const bridgeBlock = blockBetween(
  "async function bridgeDueLegacyPendingAIResponsesToVercelQueue",
  "function getVercelAgentQueueLimit",
);
const drainBlock = blockBetween(
  "async function drainVercelAgentResponseQueue",
  "async function runVercelAgentForGatewayEvent",
);

assert.match(
  bridgeBlock,
  /FROM pending_ai_responses p[\s\S]*FOR UPDATE OF p SKIP LOCKED/,
  "bridge deve claimar pendencias legadas com lock transacional",
);

assert.match(
  bridgeBlock,
  /p\.execute_at <= NOW\(\) - \(\$1::int \* INTERVAL '1 second'\)/,
  "bridge deve migrar somente pendencias vencidas alem da janela de seguranca",
);

assert.match(
  bridgeBlock,
  /SET status = 'cancelled'[\s\S]*failure_reason = 'cancelled:bridged_to_vercel_agent_queue'/,
  "bridge deve cancelar a pendencia legada depois de mover para a fila Codex",
);

assert.match(
  bridgeBlock,
  /INSERT INTO vercel_agent_response_jobs[\s\S]*'queued:vercel_gateway_agent:legacy_pending_bridge'/,
  "bridge deve enfileirar pelo contrato duravel do runtime Codex",
);

assert.match(
  bridgeBlock,
  /m\.user_id::text/,
  "bridge deve converter user_id legado uuid para o tipo text usado pela fila Codex",
);

assert.match(
  bridgeBlock,
  /COALESCE\(wc\.provider, 'baileys'\) = 'baileys'[\s\S]*COALESCE\(wc\.connection_method, 'qr'\) <> 'coexistence'/,
  "bridge deve limitar o reparo ao caminho gateway/Baileys elegivel",
);

assert.match(
  drainBlock,
  /const legacyBridge = await bridgeDueLegacyPendingAIResponsesToVercelQueue/,
  "drain da fila Codex deve puxar pendencias legadas antes do claim principal",
);

assert.doesNotMatch(
  bridgeBlock,
  /customerFacingMessages|runWebOnlyAgentTestForUser|sendWebOnlyAgentActionsViaGateway|sendJson\(/,
  "bridge nao pode gerar fala publica nem executar side effects de atendimento por conta propria",
);
