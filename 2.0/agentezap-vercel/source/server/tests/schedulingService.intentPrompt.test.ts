import test from "node:test";
import assert from "node:assert/strict";

import {
  clearSchedulingConversationStateForTests,
  generateDeterministicSchedulingReply,
  generateSchedulingTurnPrompt,
  setSchedulingOrchestratorTestDependencies,
} from "../schedulingService.ts";
import { supabase } from "../supabaseAuth.ts";

const originalFrom = (supabase as any).from;
const RealDate = Date;

function installFixedDate() {
  class FixedDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super("2026-03-15T12:00:00.000Z");
        return;
      }
      super(...(args as ConstructorParameters<typeof Date>));
    }

    static now() {
      return new RealDate("2026-03-15T12:00:00.000Z").getTime();
    }
  }

  // @ts-expect-error teste controla o relógio
  global.Date = FixedDate;
}

function installSchedulingMocks() {
  (supabase as any).from = (tableName: string) => {
    if (tableName === "scheduling_config") {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        single() {
          return Promise.resolve({
            data: {
              is_enabled: true,
              available_days: [1, 2, 3, 4, 5],
              work_start_time: "08:30",
              work_end_time: "11:30",
              break_start_time: "13:30",
              break_end_time: "17:30",
              has_break: false,
              slot_duration: 60,
              buffer_between_appointments: 15,
              max_appointments_per_day: 3,
              advance_booking_days: 30,
              min_booking_notice_hours: 0,
              allow_cancellation: true,
              auto_confirm: false,
              google_calendar_enabled: false,
              service_name: "Visita técnica / Orçamento",
            },
            error: null,
          });
        },
      };
    }

    if (tableName === "appointments") {
      const filters: Record<string, string> = {};
      const query = {
        select() {
          return this;
        },
        eq(column: string, value: string) {
          filters[column] = value;
          return this;
        },
        in() {
          return this;
        },
        order() {
          if (
            filters.user_id === "user-1"
            && filters.client_phone === "5511999999999"
            && filters.appointment_date === "2026-03-17"
          ) {
            return Promise.resolve({
              data: [
                {
                  id: "appt-1",
                  user_id: "user-1",
                  client_name: "Ana Teste",
                  client_phone: "5511999999999",
                  service_name: "Verificação técnica",
                  appointment_date: "2026-03-17",
                  start_time: "08:30:00",
                  end_time: "09:30:00",
                  status: "pending",
                },
              ],
              error: null,
            });
          }

          return Promise.resolve({
            data: [],
            error: null,
          });
        },
      };

      return query;
    }

    if (tableName === "scheduling_services") {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return Promise.resolve({
            data: [
              {
                id: "svc-check-1",
                name: "Verificação técnica",
                duration_minutes: 60,
                price: "50.00",
                requires_customer_address: true,
                is_active: true,
              },
              {
                id: "svc-check-2",
                name: "Verificação técnica",
                duration_minutes: 60,
                price: "50.00",
                requires_customer_address: true,
                is_active: true,
              },
              {
                id: "svc-tomada",
                name: "Tomada - troca ou instalação",
                duration_minutes: 60,
                price: "70.00",
                requires_customer_address: true,
                is_active: true,
              },
              {
                id: "svc-chuveiro",
                name: "Chuveiro - instalação ou troca",
                duration_minutes: 90,
                price: "95.00",
                requires_customer_address: true,
                is_active: true,
              },
            ],
            error: null,
          });
        },
      };
    }

    if (tableName === "scheduling_exceptions") {
      const filters: Record<string, string> = {};
      return {
        select() {
          return this;
        },
        eq(column: string, value: string) {
          filters[column] = value;
          return this;
        },
        single() {
          if (filters.exception_date === "2026-03-16") {
            return Promise.resolve({
              data: {
                exception_type: "blocked",
                reason: "agenda lotada",
              },
              error: null,
            });
          }

          return Promise.resolve({ data: null, error: { code: "PGRST116" } });
        },
      };
    }

    throw new Error(`Tabela inesperada no teste: ${tableName}`);
  };
}

test.afterEach(() => {
  setSchedulingOrchestratorTestDependencies(null);
  clearSchedulingConversationStateForTests();
  global.Date = RealDate;
});

test.after(() => {
  (supabase as any).from = originalFrom;
  setImmediate(() => process.exit(process.exitCode ?? 0));
});

test("generateSchedulingTurnPrompt injeta o resultado validado do executor para consulta de data", async () => {
  installSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async callPlanner() {
      return {
        shouldHandle: true,
        action: "LOOKUP_DATE_AVAILABILITY",
        selectedServiceIds: ["svc-check-1"],
        requestedDate: "2026-03-16",
        requestedTime: null,
        selectedDate: null,
        selectedTime: null,
        customerName: null,
        customerAddress: null,
        wantsSchedulingNow: true,
        wantsBookingDetails: false,
        confidence: 0.92,
        reasoning: "cliente pediu segunda-feira",
      };
    },
  });

  const prompt = await generateSchedulingTurnPrompt(
    "user-1",
    "5511999999999",
    "na segunda tem?",
    [
      { text: "Quero agendar verificacao tecnica", fromMe: false },
    ],
  );

  const normalizedPrompt = String(prompt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedPrompt, /decisao de agendamento deste turno ja foi validada pelo executor/i);
  assert.match(normalizedPrompt, /para segunda-feira \(16\/03\), nao encontrei horario disponivel/i);
  assert.match(normalizedPrompt, /terca-feira \(17\/03\) as 08:30/i);
});

test("generateDeterministicSchedulingReply lista apenas slots reais quando o planner pede lookup geral", async () => {
  installSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async callPlanner() {
      return {
        shouldHandle: true,
        action: "LOOKUP_NEXT_SLOTS",
        selectedServiceIds: ["svc-tomada", "svc-chuveiro"],
        requestedDate: null,
        requestedTime: null,
        selectedDate: null,
        selectedTime: null,
        customerName: null,
        customerAddress: null,
        wantsSchedulingNow: true,
        wantsBookingDetails: false,
        confidence: 0.93,
        reasoning: "cliente pediu próximos horários",
      };
    },
  });

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "Sim",
    [
      { text: "Preciso de uma instalação de uma tomada e um chuveiro", fromMe: false },
      { text: "Deseja que eu verifique o próximo horário disponível para realizar o serviço?", fromMe: true },
    ],
  );

  const normalizedReply = String(reply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReply, /proximos horarios realmente disponiveis/i);
  assert.match(normalizedReply, /terca-feira \(17\/03\) as 08:30/i);
  assert.doesNotMatch(normalizedReply, /segunda-feira \(16\/03\) as 08:30/i);
});

test("generateDeterministicSchedulingReply gera [AGENDAR:] somente com horario e dados completos entregues pelo planner", async () => {
  installSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async callPlanner() {
      return {
        shouldHandle: true,
        action: "READY_TO_BOOK",
        requestedDate: null,
        requestedTime: null,
        selectedDate: "2026-03-18",
        selectedTime: "08:30",
        customerName: "Ana Teste",
        customerAddress: "Rua A, 10, Centro",
        wantsBookingDetails: false,
        confidence: 0.96,
        reasoning: "cliente escolheu horário e passou os dados",
      };
    },
  });

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "Meu nome completo é Ana Teste e o endereço completo é Rua A, 10, Centro",
    [
      { text: "Quero agendar verificação técnica para quarta-feira às 08:30", fromMe: false },
      {
        text: "Quarta-feira (18/03) às 08:30 está disponível para esse atendimento. Para finalizar o agendamento, me confirme o nome completo e o endereço completo do local.",
        fromMe: true,
      },
    ],
  );

  assert.match(String(reply || ""), /\[AGENDAR:\s*DATA=2026-03-18,\s*HORA=08:30/i);
  assert.match(String(reply || ""), /NOME="Ana Teste"/i);
  assert.match(String(reply || ""), /ENDERECO="Rua A, 10, Centro"/i);
});

test("generateDeterministicSchedulingReply respeita fase de orcamento antes de consultar horarios", async () => {
  installSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async callPlanner() {
      return {
        shouldHandle: true,
        action: "LOOKUP_NEXT_SLOTS",
        selectedServiceIds: ["svc-tomada", "svc-chuveiro"],
        requestedDate: null,
        requestedTime: null,
        selectedDate: null,
        selectedTime: null,
        customerName: null,
        customerAddress: null,
        wantsSchedulingNow: false,
        wantsBookingDetails: false,
        confidence: 0.95,
        reasoning: "cliente descreveu servicos, mas ainda nao pediu agendamento",
      };
    },
  });

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "preciso de uma instalacao de tomada e um de chuveiro",
    [],
  );
  const turnPrompt = await generateSchedulingTurnPrompt(
    "user-1",
    "5511999999999",
    "preciso de uma instalacao de tomada e um de chuveiro",
    [],
  );
  const normalizedTurnPrompt = String(turnPrompt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.equal(reply, null);
  assert.match(normalizedTurnPrompt, /nao responda com horarios/i);
});

test("generateDeterministicSchedulingReply ignora saudacao sem servico real em contexto", async () => {
  installSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async callPlanner() {
      return {
        shouldHandle: true,
        action: "QUOTE_ONLY",
        selectedServiceIds: [],
        requestedDate: null,
        requestedTime: null,
        selectedDate: null,
        selectedTime: null,
        customerName: null,
        customerAddress: null,
        wantsSchedulingNow: false,
        wantsBookingDetails: false,
        confidence: 0.51,
        reasoning: "saudacao simples sem servico real",
      };
    },
  });

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "oi",
    [],
  );

  assert.equal(reply, null);
});

test("generateDeterministicSchedulingReply bloqueia lookup quando o gate semantico detecta fase de orcamento", async () => {
  installSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async callPlanner() {
      return {
        shouldHandle: true,
        action: "LOOKUP_NEXT_SLOTS",
        selectedServiceIds: ["svc-tomada", "svc-chuveiro"],
        requestedDate: null,
        requestedTime: null,
        selectedDate: null,
        selectedTime: null,
        customerName: null,
        customerAddress: null,
        wantsSchedulingNow: true,
        wantsBookingDetails: false,
        confidence: 0.91,
        reasoning: "planner permissivo demais no primeiro turno",
      };
    },
    async callSchedulingGate() {
      return false;
    },
  });

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "preciso da instacao de um chuveiro e uma tomada",
    [],
  );

  const turnPrompt = await generateSchedulingTurnPrompt(
    "user-1",
    "5511999999999",
    "preciso da instacao de um chuveiro e uma tomada",
    [],
  );
  const normalizedTurnPrompt = String(turnPrompt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.equal(reply, null);
  assert.match(normalizedTurnPrompt, /fase de orcamento\/descricao do servico/i);
});

test("generateDeterministicSchedulingReply pede nome e endereco quando o servico exige atendimento no local", async () => {
  installSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async callPlanner() {
      return {
        shouldHandle: true,
        action: "REQUEST_NAME",
        selectedServiceIds: ["svc-tomada", "svc-chuveiro"],
        requestedDate: "2026-03-18",
        requestedTime: "08:30",
        selectedDate: "2026-03-18",
        selectedTime: "08:30",
        customerName: null,
        customerAddress: null,
        wantsSchedulingNow: true,
        wantsBookingDetails: true,
        confidence: 0.96,
        reasoning: "cliente escolheu horario para servicos com endereco obrigatorio",
      };
    },
  });

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "quarta 08:30 pode ser",
    [
      {
        text: "Os proximos horarios realmente disponiveis sao:\n- Quarta-feira (18/03) as 08:30\nQual desses horarios funciona melhor para voce?\nDepois que voce escolher o horario, eu vou te pedir o endereco completo para finalizar o agendamento.",
        fromMe: true,
      },
    ],
  );

  const normalizedReply = String(reply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReply, /nome completo e o endereco completo/i);
});

test("generateDeterministicSchedulingReply preserva endereco obrigatorio ao sair do orcamento para os horarios", async () => {
  installSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async callPlanner() {
      return {
        shouldHandle: true,
        action: "LOOKUP_NEXT_SLOTS",
        selectedServiceIds: ["svc-tomada", "svc-chuveiro"],
        requestedDate: null,
        requestedTime: null,
        selectedDate: null,
        selectedTime: null,
        customerName: null,
        customerAddress: null,
        wantsSchedulingNow: true,
        wantsBookingDetails: false,
        confidence: 0.94,
        reasoning: "cliente aceitou agendar depois do orcamento",
      };
    },
  });

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "sim confirmo pode agendar",
    [
      { text: "preciso de uma instalacao de tomada e um de chuveiro", fromMe: false },
      {
        text: "Encontrei este orcamento inicial para o seu pedido:\n- Tomada - troca ou instalacao | R$ 70,00 | 60 min\n- Chuveiro - instalacao ou troca | R$ 95,00 | 90 min\nTotal estimado: R$ 165,00\nComo este atendimento e no endereco do cliente, eu vou pedir o endereco completo antes de finalizar o agendamento.\nSe voce quiser, eu tambem posso verificar os proximos horarios realmente disponiveis na agenda.",
        fromMe: true,
      },
    ],
  );

  const normalizedReply = String(reply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReply, /proximos horarios realmente disponiveis/i);
  assert.match(normalizedReply, /depois que voce escolher o horario, eu vou te pedir o endereco completo/i);
});

test("generateDeterministicSchedulingReply considera tomada e chuveiro juntos ao sair do orcamento para agenda", async () => {
  installSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async callPlanner() {
      return {
        shouldHandle: true,
        action: "LOOKUP_NEXT_SLOTS",
        selectedServiceIds: [],
        requestedDate: null,
        requestedTime: null,
        selectedDate: null,
        selectedTime: null,
        customerName: null,
        customerAddress: null,
        wantsSchedulingNow: true,
        wantsBookingDetails: false,
        confidence: 0.93,
        reasoning: "cliente quer agendar pacote de tomada e chuveiro",
      };
    },
  });

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "sim, pode agendar",
    [
      { text: "preciso da instacao de um chuveiro e uma tomada", fromMe: false },
      { text: "Pode me dizer se quer que eu verifique os horarios disponiveis?", fromMe: true },
    ],
  );

  const normalizedReply = String(reply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReply, /proximos horarios realmente disponiveis/i);
  assert.match(normalizedReply, /quarta-feira \(18\/03\) as 08:30/i);
  assert.doesNotMatch(normalizedReply, /quarta-feira \(18\/03\) as 09:45/i);
  assert.match(normalizedReply, /depois que voce escolher o horario, eu vou te pedir o endereco completo/i);
});

test("generateDeterministicSchedulingReply nao finaliza quando falta endereco do servico presencial", async () => {
  installSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async callPlanner() {
      return {
        shouldHandle: true,
        action: "READY_TO_BOOK",
        selectedServiceIds: ["svc-tomada", "svc-chuveiro"],
        requestedDate: "2026-03-18",
        requestedTime: "08:30",
        selectedDate: "2026-03-18",
        selectedTime: "08:30",
        customerName: "Rodrigo",
        customerAddress: null,
        wantsSchedulingNow: true,
        wantsBookingDetails: false,
        confidence: 0.97,
        reasoning: "cliente passou so o nome e ainda falta endereco",
      };
    },
  });

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "Rodrigo",
    [
      {
        text: "Quarta-feira (18/03) as 08:30 esta disponivel para esse atendimento. Para finalizar o agendamento, me confirme o nome completo e o endereco completo do local.",
        fromMe: true,
      },
    ],
  );

  const normalizedReply = String(reply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReply, /confirme o endereco completo/i);
  assert.doesNotMatch(normalizedReply, /\[AGENDAR:/i);
});

test("generateDeterministicSchedulingReply preserva endereco e servicos na memoria entre turnos curtos", async () => {
  installSchedulingMocks();
  installFixedDate();

  setSchedulingOrchestratorTestDependencies({
    async callPlanner(input) {
      if (input.messageText === "sexta as 08:30") {
        return {
          shouldHandle: true,
          action: "REQUEST_ADDRESS",
          selectedServiceIds: ["svc-tomada", "svc-chuveiro"],
          requestedDate: "2026-03-20",
          requestedTime: "08:30",
          selectedDate: "2026-03-20",
          selectedTime: "08:30",
          customerName: null,
          customerAddress: null,
          wantsSchedulingNow: true,
          wantsBookingDetails: true,
          confidence: 0.95,
          reasoning: "cliente escolheu o horario",
        };
      }

      if (input.messageText === "avenida dos amores,222") {
        return {
          shouldHandle: true,
          action: "REQUEST_NAME",
          selectedServiceIds: [],
          requestedDate: "2026-03-20",
          requestedTime: "08:30",
          selectedDate: "2026-03-20",
          selectedTime: "08:30",
          customerName: null,
          customerAddress: null,
          wantsSchedulingNow: true,
          wantsBookingDetails: true,
          confidence: 0.95,
          reasoning: "cliente informou o endereco e falta o nome",
        };
      }

      return {
        shouldHandle: true,
        action: "READY_TO_BOOK",
        selectedServiceIds: ["svc-chuveiro"],
        requestedDate: "2026-03-20",
        requestedTime: "08:30",
        selectedDate: "2026-03-20",
        selectedTime: "08:30",
        customerName: null,
        customerAddress: null,
        wantsSchedulingNow: true,
        wantsBookingDetails: false,
        confidence: 0.96,
        reasoning: "cliente informou o nome por ultimo",
      };
    },
  });

  const replyAfterSlot = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "sexta as 08:30",
    [
      { text: "preciso da instacao de um chuveiro e uma tomada", fromMe: false },
      { text: "Encontrei este orcamento inicial para o seu pedido.", fromMe: true },
      {
        text: "Os proximos horarios realmente disponiveis sao:\n- Sexta-feira (20/03) as 08:30\nQual desses horarios funciona melhor para voce?\nDepois que voce escolher o horario, eu vou te pedir o endereco completo para finalizar o agendamento.",
        fromMe: true,
      },
    ],
  );

  const normalizedReplyAfterSlot = String(replyAfterSlot || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReplyAfterSlot, /confirme o endereco completo/i);

  const replyAfterAddress = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "avenida dos amores,222",
    [
      { text: "sexta as 08:30", fromMe: false },
      { text: "Perfeito, agora me confirme o endereco completo do local para eu finalizar o agendamento.", fromMe: true },
    ],
  );

  const normalizedReplyAfterAddress = String(replyAfterAddress || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReplyAfterAddress, /confirme o nome completo/i);
  assert.doesNotMatch(normalizedReplyAfterAddress, /nome completo e o endereco completo/i);

  const replyAfterName = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "rodrigo amcedo",
    [
      { text: "avenida dos amores,222", fromMe: false },
      { text: "Perfeito, agora me confirme o nome completo para eu finalizar o agendamento.", fromMe: true },
    ],
  );

  const normalizedReplyAfterName = String(replyAfterName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReplyAfterName, /\[AGENDAR:/i);
  assert.match(normalizedReplyAfterName, /ENDERECO=\"avenida dos amores,222\"/i);
  assert.match(normalizedReplyAfterName, /SERVICO=\"Tomada - troca ou instalacao \+ Chuveiro - instalacao ou troca\"/i);
});

test("generateDeterministicSchedulingReply preserva o pacote completo entre o turno de orcamento e o pedido de agenda", async () => {
  installSchedulingMocks();
  installFixedDate();

  setSchedulingOrchestratorTestDependencies({
    async callPlanner(input) {
      if (input.messageText === "preciso da instalacao de um chuveiro e uma tomada") {
        return {
          shouldHandle: true,
          action: "QUOTE_ONLY",
          selectedServiceIds: ["svc-chuveiro"],
          requestedDate: null,
          requestedTime: null,
          selectedDate: null,
          selectedTime: null,
          customerName: null,
          customerAddress: null,
          wantsSchedulingNow: false,
          wantsBookingDetails: false,
          confidence: 0.84,
          reasoning: "turno de orcamento ainda sem agenda",
        };
      }

      return {
        shouldHandle: true,
        action: "LOOKUP_NEXT_SLOTS",
        selectedServiceIds: ["svc-chuveiro"],
        requestedDate: null,
        requestedTime: null,
        selectedDate: null,
        selectedTime: null,
        customerName: null,
        customerAddress: null,
        wantsSchedulingNow: true,
        wantsBookingDetails: false,
        confidence: 0.91,
        reasoning: "cliente aceitou consultar agenda",
      };
    },
  });

  const quoteReply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "preciso da instalacao de um chuveiro e uma tomada",
    [],
  );

  assert.equal(quoteReply, null);

  const lookupReply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "sim",
    [
      { text: "preciso da instalacao de um chuveiro e uma tomada", fromMe: false },
      { text: "Deseja que eu verifique a disponibilidade para agendar o servico?", fromMe: true },
    ],
  );

  const normalizedLookupReply = String(lookupReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedLookupReply, /proximos horarios realmente disponiveis/i);
  assert.match(normalizedLookupReply, /terca-feira \(17\/03\) as 08:30/i);
  assert.doesNotMatch(normalizedLookupReply, /terca-feira \(17\/03\) as 09:45/i);
});

test("generateDeterministicSchedulingReply trava o slot validado e nao repete endereco depois que ele ja foi informado", async () => {
  installSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async callPlanner(input) {
      const normalized = String(input.messageText || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      if (normalized.includes("chuveiro") || normalized.includes("tomada")) {
        return {
          shouldHandle: true,
          action: "QUOTE_ONLY",
          selectedServiceIds: ["svc-tomada", "svc-chuveiro"],
          requestedDate: null,
          requestedTime: null,
          selectedDate: null,
          selectedTime: null,
          customerName: null,
          customerAddress: null,
          wantsSchedulingNow: false,
          wantsBookingDetails: false,
          confidence: 0.9,
          reasoning: "orcamento inicial",
        };
      }

      if (normalized === "sim") {
        return {
          shouldHandle: true,
          action: "LOOKUP_NEXT_SLOTS",
          selectedServiceIds: ["svc-tomada", "svc-chuveiro"],
          requestedDate: null,
          requestedTime: null,
          selectedDate: null,
          selectedTime: null,
          customerName: null,
          customerAddress: null,
          wantsSchedulingNow: true,
          wantsBookingDetails: false,
          confidence: 0.9,
          reasoning: "cliente quer consultar agenda",
        };
      }

      if (normalized.includes("sexta") && normalized.includes("08:30")) {
        return {
          shouldHandle: true,
          action: "READY_TO_BOOK",
          selectedServiceIds: ["svc-tomada", "svc-chuveiro"],
          requestedDate: "2026-03-20",
          requestedTime: "08:30",
          selectedDate: "2026-03-20",
          selectedTime: "08:30",
          customerName: null,
          customerAddress: null,
          wantsSchedulingNow: true,
          wantsBookingDetails: true,
          confidence: 0.95,
          reasoning: "cliente escolheu horario exato",
        };
      }

      if (normalized.includes("avenida dos amores")) {
        return {
          shouldHandle: true,
          action: "READY_TO_BOOK",
          selectedServiceIds: ["svc-tomada", "svc-chuveiro"],
          requestedDate: null,
          requestedTime: null,
          selectedDate: null,
          selectedTime: null,
          customerName: null,
          customerAddress: null,
          wantsSchedulingNow: true,
          wantsBookingDetails: true,
          confidence: 0.95,
          reasoning: "cliente informou endereco",
        };
      }

      return {
        shouldHandle: true,
        action: "READY_TO_BOOK",
        selectedServiceIds: ["svc-tomada", "svc-chuveiro"],
        requestedDate: null,
        requestedTime: null,
        selectedDate: null,
        selectedTime: null,
        customerName: null,
        customerAddress: null,
        wantsSchedulingNow: true,
        wantsBookingDetails: true,
        confidence: 0.95,
        reasoning: "cliente informou nome",
      };
    },
  });

  const phone = "5511888880001";

  const quoteReply = await generateDeterministicSchedulingReply(
    "user-1",
    phone,
    "preciso da instalação de um chuveiro e uma tomada",
    [],
  );
  assert.equal(quoteReply, null);

  const slotsReply = await generateDeterministicSchedulingReply(
    "user-1",
    phone,
    "sim",
    [
      { text: "preciso da instalação de um chuveiro e uma tomada", fromMe: false },
      { text: "Deseja que eu verifique a disponibilidade para agendar o serviço?", fromMe: true },
    ],
  );

  const slotChoiceReply = await generateDeterministicSchedulingReply(
    "user-1",
    phone,
    "pode ser sexta as 08:30",
    [
      { text: "preciso da instalação de um chuveiro e uma tomada", fromMe: false },
      { text: "Deseja que eu verifique a disponibilidade para agendar o serviço?", fromMe: true },
      { text: "sim", fromMe: false },
      { text: slotsReply || "", fromMe: true },
    ],
  );
  assert.match(String(slotChoiceReply || ""), /me confirme o endereço completo/i);

  const addressReply = await generateDeterministicSchedulingReply(
    "user-1",
    phone,
    "avenida dos amores,222",
    [
      { text: "preciso da instalação de um chuveiro e uma tomada", fromMe: false },
      { text: "Deseja que eu verifique a disponibilidade para agendar o serviço?", fromMe: true },
      { text: "sim", fromMe: false },
      { text: slotsReply || "", fromMe: true },
      { text: "pode ser sexta as 08:30", fromMe: false },
      { text: slotChoiceReply || "", fromMe: true },
    ],
  );
  const normalizedAddressReply = String(addressReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedAddressReply, /me confirme o nome completo/i);
  assert.doesNotMatch(normalizedAddressReply, /endereco completo do local/i);

  const finalReply = await generateDeterministicSchedulingReply(
    "user-1",
    phone,
    "rodrigo amcedo",
    [
      { text: "preciso da instalação de um chuveiro e uma tomada", fromMe: false },
      { text: "Deseja que eu verifique a disponibilidade para agendar o serviço?", fromMe: true },
      { text: "sim", fromMe: false },
      { text: slotsReply || "", fromMe: true },
      { text: "pode ser sexta as 08:30", fromMe: false },
      { text: slotChoiceReply || "", fromMe: true },
      { text: "avenida dos amores,222", fromMe: false },
      { text: addressReply || "", fromMe: true },
    ],
  );

  const normalizedFinalReply = String(finalReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedFinalReply, /\[AGENDAR:\s*DATA=2026-03-20,\s*HORA=08:30/i);
  assert.match(normalizedFinalReply, /ENDERECO=\"avenida dos amores,222\"/i);
  assert.match(normalizedFinalReply, /SERVICO=\"Tomada - troca ou instalacao \+ Chuveiro - instalacao ou troca\"/i);
});

test("generateDeterministicSchedulingReply volta para escolha de horario quando o cliente envia endereco sem slot confirmado", async () => {
  installSchedulingMocks();
  installFixedDate();

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511888880002",
    "avenida dos amores,222",
    [
      { text: "preciso da instalação de um chuveiro e uma tomada", fromMe: false },
      { text: "Deseja que eu verifique a disponibilidade para agendar o serviço?", fromMe: true },
      { text: "sim", fromMe: false },
      { text: "Os próximos horários realmente disponíveis são:\n- Segunda-feira (23/03) às 08:30 ou 09:45\nQual desses horários funciona melhor para você?\nDepois que você escolher o horário, eu vou te pedir o endereço completo para finalizar o agendamento.", fromMe: true },
      { text: "pode ser sexta as 08:30", fromMe: false },
      { text: "Para Sexta-feira (20/03), não encontrei horário disponível para esse atendimento.\nOs próximos horários realmente disponíveis são:\n- Segunda-feira (23/03) às 08:30 ou 09:45\nQual desses horários funciona melhor para você?\nDepois que você escolher o horário, eu vou te pedir o endereço completo para finalizar o agendamento.", fromMe: true },
    ],
  );

  const normalizedReply = String(reply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReply, /escolha um dos horarios disponiveis primeiro/i);
  assert.match(normalizedReply, /segunda-feira \(23\/03\) as 08:30 ou 09:45/i);
  assert.doesNotMatch(normalizedReply, /bairro e a cidade/i);
});

test("generateDeterministicSchedulingReply gera [CANCELAR:] quando o planner resolve o alvo do cancelamento", async () => {
  installSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async callPlanner() {
      return {
        shouldHandle: true,
        action: "CANCEL_READY",
        requestedDate: "2026-03-17",
        requestedTime: "08:30",
        selectedDate: "2026-03-17",
        selectedTime: "08:30",
        customerName: "Ana Teste",
        customerAddress: null,
        wantsBookingDetails: false,
        confidence: 0.94,
        reasoning: "cliente pediu cancelamento do horário conhecido",
      };
    },
  });

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999999999",
    "Pode cancelar aquele horário para mim",
    [
      { text: "Quero cancelar meu horário de terça-feira às 08:30", fromMe: false },
    ],
  );

  assert.match(String(reply || ""), /\[CANCELAR:\s*DATA=2026-03-17,\s*HORA=08:30/i);
  assert.match(String(reply || ""), /Entendido\. Vou cancelar o agendamento para você\./i);
});
