import assert from "node:assert/strict";

import { parseCourseSchedulingInsight } from "../courseSchedulingInsightsHelpers";

const parsed = parseCourseSchedulingInsight(`{
  "hasScheduledConversation": true,
  "status": "scheduled",
  "agreedSchedule": "Segunda-feira, 30 de março às 20:30",
  "scheduledDate": "2026-03-30",
  "scheduledTime": "20:30",
  "summary": "Cliente confirmou presença para inscrição no curso.",
  "evidence": ["CLIENTE: pode marcar", "IA: segunda às 20:30"],
  "followUpQuestionSuggestion": "Posso te adiantar os documentos?",
  "confidence": 94
}`);

assert.equal(parsed.status, "scheduled");
assert.equal(parsed.scheduledDate, "2026-03-30");
assert.equal(parsed.scheduledTime, "20:30");
assert.equal(parsed.followUpQuestionSuggestion, "Posso te adiantar os documentos?");

console.log("courseSchedulingInsightsHelpers.test.ts ok");
