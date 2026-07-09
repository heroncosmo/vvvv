import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "../whatsapp.ts"), "utf8");

assert.match(
  source,
  /const resetFollowUpAfterAutomatedAgentReply = async \(/,
  "resposta automatica precisa usar helper unico de reset de follow-up",
);

assert.match(
  source,
  /await resetFollowUpAfterAutomatedAgentReply\(sentAt\);/,
  "mensagem automatica persistida deve reiniciar follow-up no horario do envio",
);

assert.match(
  source,
  /deliveredToCustomer = true;\s+await resetFollowUpAfterAutomatedAgentReply\(new Date\(\)\);/s,
  "texto automatico entregue deve reiniciar follow-up imediatamente",
);

const automaticFollowUpMarker = source.indexOf("// ?? FOLLOW-UP: a resposta automatica da IA precisa reiniciar o ciclo do usuario.");
assert.ok(automaticFollowUpMarker >= 0, "marcador de follow-up automatico ausente");

const finalAutomaticResetBlock = source.slice(automaticFollowUpMarker, automaticFollowUpMarker + 400);
assert.match(
  finalAutomaticResetBlock,
  /if \(textSentToCustomer \|\| audioSent \|\| mediaActionsSent\) \{\s+await resetFollowUpAfterAutomatedAgentReply\(new Date\(\)\);/s,
  "fallback final deve resetar somente quando houve saida automatica real",
);
assert.doesNotMatch(
  finalAutomaticResetBlock,
  /userFollowUpService\.resetFollowUpCycle/,
  "bloco final nao deve chamar reset direto sem a trava de execucao unica",
);

assert.match(
  source,
  /onOutgoingPersisted: async \(sentAt\) => \{\s+mediaActionsSent = true;\s+await resetFollowUpAfterAutomatedAgentReply\(sentAt\);/s,
  "midia automatica deve reiniciar follow-up somente apos persistencia confirmada",
);

console.log("whatsappAgentFollowUpReset.source.test.ts ok");
