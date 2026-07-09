import assert from "node:assert/strict";

async function main() {
  const { parseAgendamento3Extraction } = await import("../agendamento3ExtractorHelpers");

  const scheduled = parseAgendamento3Extraction(`
    Texto antes
    {
      "hasScheduledConversation": true,
      "status": "scheduled",
      "action": "book",
      "agreedSchedule": "Cliente confirmou visita",
      "scheduledDate": "2026-05-20",
      "scheduledTime": "15:00",
      "serviceName": "Visita",
      "clientName": "Ana Teste",
      "clientPhone": "17999999999",
      "summary": "Visita confirmada",
      "evidence": ["cliente aceitou 15:00"],
      "confidence": "91"
    }
  `);

  assert.equal(scheduled.status, "scheduled");
  assert.equal(scheduled.action, "book");
  assert.equal(scheduled.scheduledDate, "2026-05-20");
  assert.equal(scheduled.scheduledTime, "15:00");
  assert.equal(scheduled.confidence, 91);
  assert.equal(scheduled.hasScheduledConversation, true);

  const rescheduled = parseAgendamento3Extraction(`{
    "hasScheduledConversation": true,
    "status": "scheduled",
    "action": "reschedule",
    "agreedSchedule": "Cliente mudou o horario para sexta as 10:00",
    "scheduledDate": "2026-05-15",
    "scheduledTime": "10:00:00",
    "serviceName": "Reuniao online",
    "clientName": "Fernando",
    "clientPhone": "555193846386",
    "summary": "Reuniao remarcada",
    "evidence": ["cliente pediu alterar e aceitou sexta 10:00"],
    "confidence": 94
  }`);

  assert.equal(rescheduled.status, "scheduled");
  assert.equal(rescheduled.action, "reschedule");
  assert.equal(rescheduled.scheduledDate, "2026-05-15");
  assert.equal(rescheduled.scheduledTime, "10:00");

  const incomplete = parseAgendamento3Extraction(`{
    "hasScheduledConversation": true,
    "status": "scheduled",
    "action": "book",
    "agreedSchedule": "Cliente quer marcar",
    "scheduledDate": "20/05/2026",
    "scheduledTime": "15h",
    "serviceName": null,
    "clientName": null,
    "clientPhone": null,
    "summary": "Ainda sem formato valido",
    "evidence": [],
    "confidence": 72
  }`);

  assert.equal(incomplete.scheduledDate, null);
  assert.equal(incomplete.scheduledTime, null);
  assert.equal(incomplete.action, "book");

  const notScheduled = parseAgendamento3Extraction(`{
    "hasScheduledConversation": false,
    "status": "not_scheduled",
    "action": "none",
    "agreedSchedule": null,
    "scheduledDate": null,
    "scheduledTime": null,
    "serviceName": null,
    "clientName": null,
    "clientPhone": null,
    "summary": "Cliente apenas perguntou horario",
    "evidence": ["pergunta de disponibilidade"],
    "confidence": 66
  }`);

  assert.equal(notScheduled.status, "not_scheduled");
  assert.equal(notScheduled.action, "none");
  assert.equal(notScheduled.hasScheduledConversation, false);

  console.log("agendamento3ExtractorService.test.ts ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
