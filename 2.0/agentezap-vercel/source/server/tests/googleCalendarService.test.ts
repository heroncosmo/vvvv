import assert from "node:assert/strict";
import {
  addMinutesToCalendarDateTime,
  parseCalendarDateTimeWithTimeZone,
  rangesOverlap,
} from "../calendarDateTime";

const blockedStart = parseCalendarDateTimeWithTimeZone("2026-03-13T14:00:00");
const blockedEnd = parseCalendarDateTimeWithTimeZone(addMinutesToCalendarDateTime("2026-03-13", "14:00", 60));

assert.equal(
  blockedStart.toISOString(),
  "2026-03-13T17:00:00.000Z",
  "14:00 em Sao Paulo precisa virar 17:00Z quando o servidor estiver em UTC",
);

assert.equal(
  blockedEnd.toISOString(),
  "2026-03-13T18:00:00.000Z",
  "a soma de duracao precisa preservar a mesma base temporal da agenda",
);

assert.equal(
  rangesOverlap(
    blockedStart,
    blockedEnd,
    new Date("2026-03-13T17:00:00.000Z"),
    new Date("2026-03-13T18:00:00.000Z"),
  ),
  true,
  "um evento das 14:00-15:00 na agenda deve bloquear o mesmo horario pedido pelo cliente",
);

const freeStart = parseCalendarDateTimeWithTimeZone("2026-03-13T18:00:00");
const freeEnd = parseCalendarDateTimeWithTimeZone(addMinutesToCalendarDateTime("2026-03-13", "18:00", 60));

assert.equal(
  rangesOverlap(
    freeStart,
    freeEnd,
    new Date("2026-03-13T17:00:00.000Z"),
    new Date("2026-03-13T18:00:00.000Z"),
  ),
  false,
  "18:00 local nao pode colidir com um evento que termina as 15:00 local",
);

assert.equal(
  parseCalendarDateTimeWithTimeZone("2026-03-13T00:00:00").toISOString(),
  "2026-03-13T03:00:00.000Z",
  "a busca diaria precisa comecar no inicio do dia de Sao Paulo",
);

assert.equal(
  parseCalendarDateTimeWithTimeZone("2026-03-13T23:59:59").toISOString(),
  "2026-03-14T02:59:59.000Z",
  "a busca diaria precisa terminar no fim do dia de Sao Paulo",
);

console.log("googleCalendarService.test.ts ok");
