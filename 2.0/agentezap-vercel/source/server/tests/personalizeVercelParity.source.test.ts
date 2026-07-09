import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const paritySource = fs.readFileSync(path.resolve(process.cwd(), "server", "vercelHttpParity.ts"), "utf8");
const httpSource = fs.readFileSync(path.resolve(process.cwd(), "api", "http.ts"), "utf8");
const calibrationChatSource = fs.readFileSync(
  path.resolve(process.cwd(), "client", "src", "components", "calibration-chat.tsx"),
  "utf8",
);
const agentStudioUnifiedSource = fs.readFileSync(
  path.resolve(process.cwd(), "client", "src", "components", "agent-studio-unified.tsx"),
  "utf8",
);

assert.match(
  paritySource,
  /app\.all\("\/api\/agent\/edit-prompt-stream",\s*delegateToVercelHttpHandler\)/,
  "Personalize com IA no monolito deve usar o handler HTTP novo antes da rota legada",
);

const successCalibrationSignals = Array.from(
  httpSource.matchAll(/type:\s*"complete",\s*success:\s*true,[\s\S]{0,450}calibration:\s*\{\s*success:\s*true,/g),
);

assert.ok(
  successCalibrationSignals.length >= 3,
  "todo sucesso do Personalize HTTP deve enviar calibration.success=true para a tela sincronizar o prompt aplicado",
);

assert.match(
  calibrationChatSource,
  /const \[awaitingConfirmation,\s*setAwaitingConfirmation\] = useState\(false\)/,
  "Personalize UI deve lembrar quando existe proposta pendente",
);

assert.match(
  calibrationChatSource,
  /PERSONALIZE_CONFIRMATION_FLOW_V827/,
  "Personalize UI deve manter marcador de deploy da confirmacao em duas etapas",
);

assert.match(
  agentStudioUnifiedSource,
  /PERSONALIZE_CONFIRMATION_FLOW_V827/,
  "Tela principal Meu Agente IA deve carregar o marcador de confirmacao v827",
);

assert.match(
  agentStudioUnifiedSource,
  /const \[awaitingPromptEditConfirmation,\s*setAwaitingPromptEditConfirmation\] = useState\(false\)/,
  "Tela principal deve lembrar proposta pendente do Personalize",
);

assert.match(
  agentStudioUnifiedSource,
  /if \(data\.requiresConfirmation\) \{[\s\S]{0,240}setAwaitingPromptEditConfirmation\(true\)[\s\S]{0,420}Proposta pronta aguardando confirmacao/,
  "Tela principal deve tratar requiresConfirmation como proposta aguardando confirmacao",
);

assert.match(
  calibrationChatSource,
  /instruction:\s*isConfirmingPendingEdit\s*\?\s*instruction\s*:\s*`PROBLEMA RELATADO PELO CLIENTE:/,
  "confirmacao do Personalize deve chegar crua ao backend, sem virar novo problema envelopado",
);

assert.match(
  calibrationChatSource,
  /if \(data\.requiresConfirmation\) \{[\s\S]{0,260}setAwaitingConfirmation\(true\)[\s\S]{0,520}status:\s*undefined/,
  "proposta pendente do Personalize deve aparecer como mensagem normal aguardando resposta, nao como erro vermelho",
);

console.log("personalizeVercelParity.source.test.ts: ok");
