import assert from "node:assert/strict";
import { applyBroadcastTemplate, resolveBroadcastGreetingForDate } from "../broadcastTemplate";

function atBrazilHour(hour: number): Date {
  return new Date(Date.UTC(2026, 4, 18, hour + 3, 0, 0));
}

assert.equal(resolveBroadcastGreetingForDate(atBrazilHour(8)), "Bom dia");
assert.equal(resolveBroadcastGreetingForDate(atBrazilHour(14)), "Boa tarde");
assert.equal(resolveBroadcastGreetingForDate(atBrazilHour(21)), "Boa noite");

assert.equal(
  applyBroadcastTemplate("[saudacao] [nome], temos novidade.", "Simon", { now: atBrazilHour(9) }),
  "Bom dia Simon, temos novidade.",
);

assert.equal(
  applyBroadcastTemplate("[sauda\u00e7\u00e3o] [nome], temos novidade.", "Ana", { now: atBrazilHour(15) }),
  "Boa tarde Ana, temos novidade.",
);

assert.equal(
  applyBroadcastTemplate("[cumprimento] [nome]", "", { now: atBrazilHour(22) }),
  "Boa noite Cliente",
);

console.log("broadcastTemplate tests passed");
