import assert from "node:assert/strict";
import {
  buildFollowUpStageScheduleDate,
  buildMissingFollowUpScheduleDate,
  getNextBusinessTime,
  isWithinBusinessHours,
  type UserFollowUpScheduleConfig,
} from "../userFollowUpScheduling";

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

const config: UserFollowUpScheduleConfig = {
  intervalsMinutes: [15, 90],
  businessHoursStart: "09:00",
  businessHoursEnd: "18:00",
  businessDays: [1, 2, 3, 4, 5],
  respectBusinessHours: true,
  infiniteLoop: true,
  infiniteLoopMinDays: 5,
  infiniteLoopMaxDays: 5,
};

assert.equal(
  isWithinBusinessHours(config, new Date("2026-03-13T13:00:00.000Z")),
  true,
  "sexta-feira 10:00 BRT deve estar dentro do horário comercial",
);

assert.equal(
  isWithinBusinessHours(config, new Date("2026-03-13T22:00:00.000Z")),
  false,
  "sexta-feira 19:00 BRT deve ficar fora do horário comercial",
);

assert.equal(
  iso(getNextBusinessTime(config, new Date("2026-03-13T22:00:00.000Z"))),
  "2026-03-16T12:00:00.000Z",
  "fora do expediente na sexta deve reagendar para a próxima segunda às 09:00 no horário local configurado",
);

assert.equal(
  iso(buildFollowUpStageScheduleDate({
    config,
    stageIndex: 0,
    now: new Date("2026-03-13T13:00:00.000Z"),
    randomFn: () => 0,
  })),
  "2026-03-13T13:15:05.000Z",
  "retry do estágio atual deve usar o intervalo configurado de 15 minutos, não um valor fixo",
);

assert.equal(
  iso(buildFollowUpStageScheduleDate({
    config,
    stageIndex: 0,
    now: new Date("2026-03-13T22:00:00.000Z"),
    randomFn: () => 0,
  })),
  "2026-03-16T12:00:05.000Z",
  "retry fora do expediente deve alinhar para a próxima janela comercial configurada",
);

assert.equal(
  iso(buildFollowUpStageScheduleDate({
    config,
    stageIndex: 3,
    now: new Date("2026-03-13T13:00:00.000Z"),
    randomFn: () => 0,
  })),
  "2026-03-18T13:00:05.000Z",
  "loop infinito deve continuar respeitando a faixa configurada de dias",
);

assert.equal(
  iso(buildMissingFollowUpScheduleDate({
    config,
    currentStage: 0,
    baseDate: new Date("2026-03-12T12:00:00.000Z"),
    now: new Date("2026-03-13T13:00:00.000Z"),
    randomFn: () => 0,
  })),
  "2026-03-13T13:01:05.000Z",
  "reparo de agenda vencida deve reaproveitar a configuração e manter a data no futuro",
);

console.log("userFollowUpScheduling.test.ts ok");
