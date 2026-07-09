import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const agentStudioSource = fs.readFileSync(
  path.resolve(process.cwd(), "client", "src", "components", "agent-studio-unified.tsx"),
  "utf8",
);
const routesSource = fs.readFileSync(path.resolve(process.cwd(), "server", "routes.ts"), "utf8");

function blockBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Nao encontrou bloco ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Nao encontrou fim ${endMarker}`);
  return source.slice(start, end);
}

const simulatorSendBlock = blockBetween(
  agentStudioSource,
  "const sendSimulatorMessage = async (payload: SimulatorSendPayload)",
  "const handleSimulate = async ()",
);

assert.match(
  simulatorSendBlock,
  /const customerMediaItems = payload\.mediaUrl[\s\S]*mediaType: payload\.mediaType \|\| "image"[\s\S]*mediaUrl: payload\.mediaUrl/,
  "simulador autenticado deve montar mediaItems com mediaUrl/mediaType do cliente",
);

assert.match(
  simulatorSendBlock,
  /mediaItems: customerMediaItems[\s\S]*mediaUrl: payload\.mediaUrl[\s\S]*mediaType: payload\.mediaType/,
  "simulador autenticado deve enviar mediaItems/mediaUrl/mediaType para /api/agent/test",
);

const agentTestSchemaBlock = blockBetween(
  routesSource,
  "const schema = z.object({",
  "const result = schema.safeParse(req.body);",
);

assert.match(
  agentTestSchemaBlock,
  /mediaItems: z\.array\(z\.object\([\s\S]*mediaUrl: z\.string\(\)\.optional\(\)[\s\S]*mediaType: z\.string\(\)\.optional\(\)/,
  "rota autenticada /api/agent/test deve aceitar campos de midia do cliente",
);

const webOnlyRuntimeBlock = blockBetween(
  routesSource,
  "const runRealWebOnlySimulatorRuntime = async (reason: string) =>",
  "const webOnlyPayload: any = webOnlyRetry?.payload || {};",
);

assert.match(
  webOnlyRuntimeBlock,
  /mediaItems: result\.data\.mediaItems \|\| \[\][\s\S]*mediaUrl: result\.data\.mediaUrl[\s\S]*mediaType: result\.data\.mediaType/,
  "rota autenticada deve repassar midia ao runtime web-only real",
);

console.log("authenticatedSimulatorImageContract.source.test.ts: ok");
