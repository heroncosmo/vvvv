import assert from "node:assert/strict";

import { parseAgendamento2Insight } from "../agendamento2InsightsHelpers";

const parsed = parseAgendamento2Insight(`{
  "hasScheduledConversation": true,
  "status": "scheduled",
  "agreedSchedule": "Quarta-feira, 01 de abril de 2026 as 09:30",
  "scheduledDate": "2026-04-01",
  "scheduledTime": "09:30",
  "summary": "Cliente confirmou visita tecnica para quarta as 09:30.",
  "evidence": ["CLIENTE: pode marcar", "IA: quarta as 09:30"],
  "followUpQuestionSuggestion": "Posso te adiantar o que vamos precisar no local?",
  "confidence": 91
}`);

assert.equal(parsed.status, "scheduled");
assert.equal(parsed.scheduledDate, "2026-04-01");
assert.equal(parsed.scheduledTime, "09:30");
assert.equal(parsed.followUpQuestionSuggestion, "Posso te adiantar o que vamos precisar no local?");

console.log("agendamento2InsightsHelpers.test.ts ok");
