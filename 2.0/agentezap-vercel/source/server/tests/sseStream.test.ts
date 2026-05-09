import assert from "node:assert/strict";
import { extractSseDataEvents } from "../../shared/sseStream";

const firstChunk = 'data: {"type":"log","message":"Iniciando';
const secondChunk = ' processamento"}\n\ndata: {"type":"complete","success":true}\n\n';

const partialParse = extractSseDataEvents(firstChunk);
assert.deepEqual(
  partialParse.events,
  [],
  "nao deve emitir evento quando o JSON SSE ainda esta incompleto",
);
assert.equal(
  partialParse.remainder,
  firstChunk,
  "deve preservar o restante para o proximo chunk",
);

const mergedParse = extractSseDataEvents(partialParse.remainder + secondChunk);
assert.deepEqual(
  mergedParse.events,
  [
    '{"type":"log","message":"Iniciando processamento"}',
    '{"type":"complete","success":true}',
  ],
  "deve remontar eventos SSE quebrados em multiplos chunks",
);

const multiLineParse = extractSseDataEvents(
  "data: primeira linha\ndata: segunda linha\n\n",
  { flush: true },
);
assert.deepEqual(
  multiLineParse.events,
  ["primeira linha\nsegunda linha"],
  "deve juntar multiplas linhas data do mesmo evento",
);

console.log("sseStream.test.ts: ok");
