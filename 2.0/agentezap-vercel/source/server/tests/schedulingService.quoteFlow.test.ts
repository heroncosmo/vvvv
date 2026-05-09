import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSchedulingNextSlotsReplyWithMemoryForTests,
  clearSchedulingConversationStateForTests,
  extractOrdinalSlotFromListingForTests,
  findClosestSchedulingSlotWithinToleranceForTests,
  getValidatedSlotOfferForTests,
  generateDeterministicSchedulingReply,
  generateSchedulingTurnPrompt,
  rememberValidatedSlotOfferForTests,
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
        select() { return this; },
        eq() { return this; },
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
      return {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    }

    if (tableName === "scheduling_services") {
      return {
        select() { return this; },
        eq() { return this; },
        order() {
          return Promise.resolve({
            data: [
              {
                id: "svc-tomada",
                name: "Tomada - troca ou instalação",
                duration_minutes: 60,
                price: "70.00",
                requires_customer_address: true,
                is_active: true,
              },
              {
                id: "svc-resistencia",
                name: "Resistência do chuveiro - troca",
                duration_minutes: 60,
                price: "75.00",
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
        select() { return this; },
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

function installJBElectricalSchedulingMocks() {
  (supabase as any).from = (tableName: string) => {
    if (tableName === "scheduling_config") {
      return {
        select() { return this; },
        eq() { return this; },
        single() {
          return Promise.resolve({
            data: {
              is_enabled: true,
              available_days: [1, 2, 3, 4, 5],
              work_start_time: "08:30",
              work_end_time: "12:30",
              break_start_time: "13:30",
              break_end_time: "17:30",
              has_break: false,
              slot_duration: 60,
              buffer_between_appointments: 15,
              max_appointments_per_day: 6,
              advance_booking_days: 30,
              min_booking_notice_hours: 0,
              allow_cancellation: true,
              auto_confirm: false,
              google_calendar_enabled: false,
              service_name: "Servicos eletricos",
            },
            error: null,
          });
        },
      };
    }

    if (tableName === "appointments") {
      return {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    }

    if (tableName === "scheduling_services") {
      return {
        select() { return this; },
        eq() { return this; },
        order() {
          return Promise.resolve({
            data: [
              {
                id: "svc-tomada-jb",
                name: "Tomada - troca ou instalacao",
                duration_minutes: 30,
                price: "70.00",
                requires_customer_address: true,
                is_active: true,
              },
              {
                id: "svc-chuveiro-jb",
                name: "Chuveiro - instalacao ou troca",
                duration_minutes: 30,
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
      return {
        select() { return this; },
        eq() { return this; },
        single() {
          return Promise.resolve({ data: null, error: { code: "PGRST116" } });
        },
      };
    }

    throw new Error(`Tabela inesperada no teste JB: ${tableName}`);
  };
}

function installJBElectricalAfternoonSchedulingMocks() {
  (supabase as any).from = (tableName: string) => {
    if (tableName === "scheduling_config") {
      return {
        select() { return this; },
        eq() { return this; },
        single() {
          return Promise.resolve({
            data: {
              is_enabled: true,
              available_days: [1, 2, 3, 4, 5],
              work_start_time: "13:30",
              work_end_time: "16:45",
              break_start_time: "18:00",
              break_end_time: "19:00",
              has_break: false,
              slot_duration: 60,
              buffer_between_appointments: 15,
              max_appointments_per_day: 6,
              advance_booking_days: 30,
              min_booking_notice_hours: 0,
              allow_cancellation: true,
              auto_confirm: false,
              google_calendar_enabled: false,
              service_name: "Servicos eletricos",
            },
            error: null,
          });
        },
      };
    }

    if (tableName === "appointments") {
      return {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    }

    if (tableName === "scheduling_services") {
      return {
        select() { return this; },
        eq() { return this; },
        order() {
          return Promise.resolve({
            data: [
              {
                id: "svc-tomada-jb",
                name: "Tomada - troca ou instalacao",
                duration_minutes: 30,
                price: "70.00",
                requires_customer_address: true,
                is_active: true,
              },
              {
                id: "svc-chuveiro-jb",
                name: "Chuveiro - instalacao ou troca",
                duration_minutes: 30,
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
      return {
        select() { return this; },
        eq() { return this; },
        single() {
          return Promise.resolve({ data: null, error: { code: "PGRST116" } });
        },
      };
    }

    throw new Error(`Tabela inesperada no teste JB tarde: ${tableName}`);
  };
}

function installClinicSchedulingMocks() {
  (supabase as any).from = (tableName: string) => {
    if (tableName === "scheduling_config") {
      return {
        select() { return this; },
        eq() { return this; },
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
              service_name: "Consulta de Teste",
            },
            error: null,
          });
        },
      };
    }

    if (tableName === "appointments") {
      return {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    }

    if (tableName === "scheduling_services") {
      return {
        select() { return this; },
        eq() { return this; },
        order() {
          return Promise.resolve({
            data: [
              {
                id: "svc-consulta",
                name: "Consulta de Teste - 30min",
                duration_minutes: 45,
                price: "75.00",
                requires_customer_address: false,
                is_active: true,
              },
            ],
            error: null,
          });
        },
      };
    }

    if (tableName === "scheduling_exceptions") {
      return {
        select() { return this; },
        eq() { return this; },
        single() {
          return Promise.resolve({ data: null, error: { code: "PGRST116" } });
        },
      };
    }

    throw new Error(`Tabela inesperada no teste clinic: ${tableName}`);
  };
}

function installClinicSchedulingMocksWithBlockedWednesday() {
  (supabase as any).from = (tableName: string) => {
    if (tableName === "scheduling_config") {
      return {
        select() { return this; },
        eq() { return this; },
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
              service_name: "Consulta de Teste",
            },
            error: null,
          });
        },
      };
    }

    if (tableName === "appointments") {
      return {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    }

    if (tableName === "scheduling_services") {
      return {
        select() { return this; },
        eq() { return this; },
        order() {
          return Promise.resolve({
            data: [
              {
                id: "svc-consulta",
                name: "Consulta de Teste - 30min",
                duration_minutes: 45,
                price: "75.00",
                requires_customer_address: false,
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
        select() { return this; },
        eq(column: string, value: string) {
          filters[column] = value;
          return this;
        },
        single() {
          if (filters.exception_date === "2026-03-18") {
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

    throw new Error(`Tabela inesperada no teste clinic blocked: ${tableName}`);
  };
}

function installClinicSchedulingMocksWithSlotBecomingUnavailableAfterOffer() {
  const availabilityChecksByDate = new Map<string, number>();

  (supabase as any).from = (tableName: string) => {
    if (tableName === "scheduling_config") {
      return {
        select() { return this; },
        eq() { return this; },
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
              service_name: "Consulta de Teste",
            },
            error: null,
          });
        },
      };
    }

    if (tableName === "appointments") {
      const filters: Record<string, string> = {};
      return {
        select() { return this; },
        eq(column: string, value: string) {
          filters[column] = value;
          return this;
        },
        in() { return this; },
        order() {
          if (filters.client_phone) {
            return Promise.resolve({ data: [], error: null });
          }

          const date = filters.appointment_date || "";
          const lookupCount = (availabilityChecksByDate.get(date) || 0) + 1;
          availabilityChecksByDate.set(date, lookupCount);

          if (date === "2026-03-16" && lookupCount >= 2) {
            return Promise.resolve({
              data: [
                {
                  id: "apt-conflict-1",
                  user_id: filters.user_id || "clinic-user-availability-race",
                  appointment_date: "2026-03-16",
                  start_time: "08:30",
                  end_time: "09:15",
                  status: "confirmed",
                  client_name: "Outro Cliente",
                  client_phone: "5511999990999",
                  service_name: "Consulta de Teste - 30min",
                },
              ],
              error: null,
            });
          }

          return Promise.resolve({ data: [], error: null });
        },
      };
    }

    if (tableName === "scheduling_services") {
      return {
        select() { return this; },
        eq() { return this; },
        order() {
          return Promise.resolve({
            data: [
              {
                id: "svc-consulta",
                name: "Consulta de Teste - 30min",
                duration_minutes: 45,
                price: "75.00",
                requires_customer_address: false,
                is_active: true,
              },
            ],
            error: null,
          });
        },
      };
    }

    if (tableName === "scheduling_exceptions") {
      return {
        select() { return this; },
        eq() { return this; },
        single() {
          return Promise.resolve({ data: null, error: { code: "PGRST116" } });
        },
      };
    }

    throw new Error(`Tabela inesperada no teste clinic race: ${tableName}`);
  };
}

function installClinicDopplerSchedulingMocks() {
  (supabase as any).from = (tableName: string) => {
    if (tableName === "scheduling_config") {
      return {
        select() { return this; },
        eq() { return this; },
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
              slot_duration: 10,
              buffer_between_appointments: 0,
              max_appointments_per_day: 10,
              advance_booking_days: 30,
              min_booking_notice_hours: 0,
              allow_cancellation: true,
              auto_confirm: false,
              google_calendar_enabled: false,
              service_name: "Atendimento Clinica do Centro",
            },
            error: null,
          });
        },
      };
    }

    if (tableName === "appointments") {
      return {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    }

    if (tableName === "scheduling_services") {
      return {
        select() { return this; },
        eq() { return this; },
        order() {
          return Promise.resolve({
            data: [
              {
                id: "svc-usg-abd-sup-doppler",
                name: "Ultrassom abd superior com Doppler",
                duration_minutes: 10,
                price: 149,
                is_active: true,
                requires_customer_address: false,
              },
              {
                id: "svc-usg-abd-total-doppler",
                name: "Ultrassom abd total com Doppler",
                duration_minutes: 10,
                price: 149,
                is_active: true,
                requires_customer_address: false,
              },
              {
                id: "svc-usg-cervical-doppler",
                name: "Ultrassom cervical com Doppler",
                duration_minutes: 10,
                price: 149,
                is_active: true,
                requires_customer_address: false,
              },
              {
                id: "svc-usg-transvaginal-doppler",
                name: "Ultrassom transvaginal com Doppler",
                duration_minutes: 10,
                price: 149,
                is_active: true,
                requires_customer_address: false,
              },
              {
                id: "svc-usg-obstetrico-doppler",
                name: "Ultrassom obstetrico com Doppler",
                duration_minutes: 10,
                price: 149,
                is_active: true,
                requires_customer_address: false,
              },
              {
                id: "svc-doppler-carotidas",
                name: "Doppler carotidas e vertebrais",
                duration_minutes: 10,
                price: 149,
                is_active: true,
                requires_customer_address: false,
              },
            ],
            error: null,
          });
        },
      };
    }

    if (tableName === "scheduling_exceptions") {
      return {
        select() { return this; },
        eq() { return this; },
        single() {
          return Promise.resolve({ data: null, error: { code: "PGRST116" } });
        },
      };
    }

    throw new Error(`Tabela inesperada no teste clinic doppler: ${tableName}`);
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

test("quote inicial resolve chuveiro + tomada sem cair em resistencia", async () => {
  installSchedulingMocks();
  installFixedDate();

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999990001",
    "preciso da instação de um chuveiro e uma tomada",
    [],
  );

  const normalizedReply = String(reply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReply, /chuveiro - instalacao ou troca/i);
  assert.match(normalizedReply, /tomada - troca ou instalacao/i);
  assert.doesNotMatch(normalizedReply, /resistencia do chuveiro/i);
  assert.doesNotMatch(normalizedReply, /endereco completo/i);
});

test("nova descricao de servico substitui o pacote lembrado no orcamento", async () => {
  installSchedulingMocks();
  installFixedDate();

  const firstReply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999990010",
    "preciso da instaÃ§Ã£o de um chuveiro e uma tomada",
    [],
  );

  const secondReply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999990010",
    "agora quero so a resistencia do chuveiro",
    [
      { text: "preciso da instaÃ§Ã£o de um chuveiro e uma tomada", fromMe: false },
      { text: String(firstReply || ""), fromMe: true },
    ],
  );

  const normalizedSecondReply = String(secondReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedSecondReply, /resistencia do chuveiro - troca/i);
  assert.doesNotMatch(normalizedSecondReply, /tomada - troca ou instalacao/i);
  assert.doesNotMatch(normalizedSecondReply, /chuveiro - instalacao ou troca/i);
});

test("sim depois do orcamento vira consulta real de agenda", async () => {
  installSchedulingMocks();
  installFixedDate();

  const reply = await generateDeterministicSchedulingReply(
    "user-1",
    "5511999990002",
    "sim",
    [
      { text: "preciso da instação de um chuveiro e uma tomada", fromMe: false },
      {
        text: "Encontrei este orcamento inicial para o seu pedido:\n- Chuveiro - instalação ou troca | R$ 95,00 | 90 min\n- Tomada - troca ou instalação | R$ 70,00 | 60 min\nTotal estimado: R$ 165,00\nSe voce quiser, eu tambem posso verificar os proximos horarios realmente disponiveis na agenda.",
        fromMe: true,
      },
    ],
  );

  const normalizedReply = String(reply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReply, /horarios disponiveis/i);
  assert.match(normalizedReply, /(terca-feira \(17\/03\): 08:30|segunda-feira \(23\/03\) as 08:30)/i);
  assert.doesNotMatch(normalizedReply, /orcamento inicial/i);
});

test("fluxo sem endereco usa memoria do servico para consultar horario e finalizar so com nome", async () => {
  installClinicSchedulingMocks();
  installFixedDate();

  const quoteReply = await generateDeterministicSchedulingReply(
    "clinic-user-1",
    "5511999990003",
    "preciso de uma consulta de teste",
    [],
  );

  const normalizedQuoteReply = String(quoteReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedQuoteReply, /consulta de teste - 30min/i);
  assert.doesNotMatch(normalizedQuoteReply, /endereco completo/i);

  const slotsReply = await generateDeterministicSchedulingReply(
    "clinic-user-1",
    "5511999990003",
    "sim",
    [
      { text: "quero agendar consulta de teste", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
    ],
  );

  const normalizedSlotsReply = String(slotsReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedSlotsReply, /horarios disponiveis/i);

  const slotPickReply = await generateDeterministicSchedulingReply(
    "clinic-user-1",
    "5511999990003",
    "quarta feira as 09",
    [
      { text: "preciso de uma consulta de teste", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
    ],
  );

  const normalizedSlotPickReply = String(slotPickReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedSlotPickReply, /(nome completo|preciso do seu nome|seu nome pra finalizar)/i);
  assert.doesNotMatch(normalizedSlotPickReply, /endereco completo/i);

  const finalReply = await generateDeterministicSchedulingReply(
    "clinic-user-1",
    "5511999990003",
    "Maria Silva",
    [
      { text: "preciso de uma consulta de teste", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
      { text: "quarta feira as 09", fromMe: false },
      { text: String(slotPickReply || ""), fromMe: true },
    ],
  );

  const normalizedFinalReply = String(finalReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedFinalReply, /\[AGENDAR:\s*DATA=2026-03-18,\s*HORA=(08:30|09:45)/i);
  assert.doesNotMatch(normalizedFinalReply, /endereco/i);
});

test("fluxo sem endereco exige escolher outro horario antes de aceitar so o nome", async () => {
  installClinicSchedulingMocksWithBlockedWednesday();
  installFixedDate();

  const quoteReply = await generateDeterministicSchedulingReply(
    "clinic-user-2",
    "5511999990004",
    "preciso de uma consulta de teste",
    [],
  );

  const slotsReply = await generateDeterministicSchedulingReply(
    "clinic-user-2",
    "5511999990004",
    "sim",
    [
      { text: "preciso de uma consulta de teste", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
    ],
  );

  const unavailableReply = await generateDeterministicSchedulingReply(
    "clinic-user-2",
    "5511999990004",
    "quarta feira as 09",
    [
      { text: "preciso de uma consulta de teste", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
    ],
  );

  const normalizedUnavailableReply = String(unavailableReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedUnavailableReply, /data indisponivel/i);
  assert.match(normalizedUnavailableReply, /horarios disponiveis/i);

  const nameWithoutSlotReply = await generateDeterministicSchedulingReply(
    "clinic-user-2",
    "5511999990004",
    "Maria Silva",
    [
      { text: "preciso de uma consulta de teste", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
      { text: "quarta feira as 09", fromMe: false },
      { text: String(unavailableReply || ""), fromMe: true },
    ],
  );

  const normalizedNameWithoutSlotReply = String(nameWithoutSlotReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedNameWithoutSlotReply, /escolha um dos horarios disponiveis primeiro/i);
  assert.match(normalizedNameWithoutSlotReply, /horarios disponiveis/i);
});

test("slot ja oferecido fica na memoria e nao dispara nova busca antes de pedir nome", async () => {
  installClinicSchedulingMocksWithSlotBecomingUnavailableAfterOffer();
  installFixedDate();

  const quoteReply = await generateDeterministicSchedulingReply(
    "clinic-user-race",
    "5511999990005",
    "preciso de uma consulta de teste",
    [],
  );

  const slotsReply = await generateDeterministicSchedulingReply(
    "clinic-user-race",
    "5511999990005",
    "sim",
    [
      { text: "preciso de uma consulta de teste", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
    ],
  );

  const normalizedSlotsReply = String(slotsReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedSlotsReply, /segunda-feira \(16\/03\).*08:30/i);

  const slotPickReply = await generateDeterministicSchedulingReply(
    "clinic-user-race",
    "5511999990005",
    "segunda feira as 08:30",
    [
      { text: "preciso de uma consulta de teste", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
    ],
  );

  const normalizedSlotPickReply = String(slotPickReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedSlotPickReply, /(nome completo|preciso do seu nome|seu nome pra finalizar)/i);
  assert.doesNotMatch(normalizedSlotPickReply, /nao encontrei esse horario disponivel/i);
  assert.doesNotMatch(normalizedSlotPickReply, /proximos horarios realmente disponiveis/i);

  const finalReply = await generateDeterministicSchedulingReply(
    "clinic-user-race",
    "5511999990005",
    "Maria Silva",
    [
      { text: "preciso de uma consulta de teste", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
      { text: "segunda feira as 08:30", fromMe: false },
      { text: String(slotPickReply || ""), fromMe: true },
    ],
  );

  const normalizedFinalReply = String(finalReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedFinalReply, /\[AGENDAR:\s*DATA=2026-03-16,\s*HORA=08:30/i);
});

test("horario escolhido so com a hora usa memoria dos slots oferecidos e finaliza sem nova busca", async () => {
  installJBElectricalSchedulingMocks();
  installFixedDate();

  const quoteReply = await generateDeterministicSchedulingReply(
    "user-jb-1",
    "5511999990011",
    "quero trocar um chuveiro e uma tomada",
    [],
  );

  const slotsReply = await generateDeterministicSchedulingReply(
    "user-jb-1",
    "5511999990011",
    "sim por favor",
    [
      { text: "quero trocar um chuveiro e uma tomada", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
    ],
  );

  const slotPickReply = await generateDeterministicSchedulingReply(
    "user-jb-1",
    "5511999990011",
    "Pode ser às 9h45",
    [
      { text: "quero trocar um chuveiro e uma tomada", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim por favor", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
    ],
  );

  const normalizedSlotPickReply = String(slotPickReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedSlotPickReply, /endereco completo/i);
  assert.doesNotMatch(normalizedSlotPickReply, /horarios disponiveis/i);
  assert.doesNotMatch(normalizedSlotPickReply, /qual desses horarios/i);

  const addressReply = await generateDeterministicSchedulingReply(
    "user-jb-1",
    "5511999990011",
    "Avenida dos Cheetos, 54, Bairro Laranjeira",
    [
      { text: "quero trocar um chuveiro e uma tomada", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim por favor", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
      { text: "Pode ser às 9h45", fromMe: false },
      { text: String(slotPickReply || ""), fromMe: true },
    ],
  );

  const normalizedAddressReply = String(addressReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedAddressReply, /nome completo/i);
  assert.doesNotMatch(normalizedAddressReply, /horarios disponiveis/i);
  assert.doesNotMatch(normalizedAddressReply, /vamos confirmar/i);

  const finalReply = await generateDeterministicSchedulingReply(
    "user-jb-1",
    "5511999990011",
    "Julio da Silva Baltar",
    [
      { text: "quero trocar um chuveiro e uma tomada", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim por favor", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
      { text: "Pode ser às 9h45", fromMe: false },
      { text: String(slotPickReply || ""), fromMe: true },
      { text: "Avenida dos Cheetos, 54, Bairro Laranjeira", fromMe: false },
      { text: String(addressReply || ""), fromMe: true },
    ],
  );

  const normalizedFinalReply = String(finalReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedFinalReply, /\[AGENDAR:\s*DATA=2026-03-16,\s*HORA=09:45/i);
  assert.match(normalizedFinalReply, /ENDERECO=\"Avenida dos Cheetos, 54, Bairro Laranjeira\"/i);
  assert.match(normalizedFinalReply, /NOME=\"Julio da Silva Baltar\"/i);
});

test("hora explicita fora da lista nao pode virar escolha valida nem avancar para endereco", async () => {
  installJBElectricalAfternoonSchedulingMocks();
  installFixedDate();

  const quoteReply = await generateDeterministicSchedulingReply(
    "user-jb-invalid-time",
    "5511999990091",
    "quero trocar um chuveiro e uma tomada",
    [],
  );

  const slotsReply = await generateDeterministicSchedulingReply(
    "user-jb-invalid-time",
    "5511999990091",
    "sim por favor",
    [
      { text: "quero trocar um chuveiro e uma tomada", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
    ],
  );

  const normalizedSlotsReply = String(slotsReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedSlotsReply, /13:30 ou 14:45/i);

  const invalidTimeReply = await generateDeterministicSchedulingReply(
    "user-jb-invalid-time",
    "5511999990091",
    "Pode ser às 9h45",
    [
      { text: "quero trocar um chuveiro e uma tomada", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim por favor", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
    ],
  );

  const normalizedInvalidTimeReply = String(invalidTimeReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedInvalidTimeReply, /escolha um dia e horario especifico da lista abaixo/i);
  assert.match(normalizedInvalidTimeReply, /13:30 ou 14:45/i);
  assert.doesNotMatch(normalizedInvalidTimeReply, /endereco completo/i);
  assert.doesNotMatch(normalizedInvalidTimeReply, /nome completo/i);
  assert.doesNotMatch(normalizedInvalidTimeReply, /\[AGENDAR:/i);

  const addressReply = await generateDeterministicSchedulingReply(
    "user-jb-invalid-time",
    "5511999990091",
    "Avenida dos Cheetos, 54, Bairro Laranjeira",
    [
      { text: "quero trocar um chuveiro e uma tomada", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim por favor", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
      { text: "Pode ser às 9h45", fromMe: false },
      { text: String(invalidTimeReply || ""), fromMe: true },
    ],
  );

  const normalizedAddressReply = String(addressReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedAddressReply, /escolha um dos horarios disponiveis primeiro/i);
  assert.match(normalizedAddressReply, /13:30 ou 14:45/i);
  assert.doesNotMatch(normalizedAddressReply, /nome completo/i);
  assert.doesNotMatch(normalizedAddressReply, /\[AGENDAR:/i);
});

test("horario aproximado depois da lista usa o slot mais proximo da memoria oferecida", async () => {
  installJBElectricalSchedulingMocks();
  installFixedDate();

  const quoteReply = await generateDeterministicSchedulingReply(
    "user-jb-2",
    "5511999990012",
    "quero trocar um chuveiro e uma tomada",
    [],
  );

  const slotsReply = await generateDeterministicSchedulingReply(
    "user-jb-2",
    "5511999990012",
    "sim por favor",
    [
      { text: "quero trocar um chuveiro e uma tomada", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
    ],
  );

  const slotPickReply = await generateDeterministicSchedulingReply(
    "user-jb-2",
    "5511999990012",
    "Pode ser 9h40 45",
    [
      { text: "quero trocar um chuveiro e uma tomada", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim por favor", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
    ],
  );

  const normalizedSlotPickReply = String(slotPickReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedSlotPickReply, /endereco completo/i);
  assert.doesNotMatch(normalizedSlotPickReply, /horarios disponiveis/i);

  const addressReply = await generateDeterministicSchedulingReply(
    "user-jb-2",
    "5511999990012",
    "Rua Exemplo, 10, Centro",
    [
      { text: "quero trocar um chuveiro e uma tomada", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim por favor", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
      { text: "Pode ser 9h40 45", fromMe: false },
      { text: String(slotPickReply || ""), fromMe: true },
    ],
  );

  const finalReply = await generateDeterministicSchedulingReply(
    "user-jb-2",
    "5511999990012",
    "Julio da Silva Baltar",
    [
      { text: "quero trocar um chuveiro e uma tomada", fromMe: false },
      { text: String(quoteReply || ""), fromMe: true },
      { text: "sim por favor", fromMe: false },
      { text: String(slotsReply || ""), fromMe: true },
      { text: "Pode ser 9h40 45", fromMe: false },
      { text: String(slotPickReply || ""), fromMe: true },
      { text: "Rua Exemplo, 10, Centro", fromMe: false },
      { text: String(addressReply || ""), fromMe: true },
    ],
  );

  const normalizedFinalReply = String(finalReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedFinalReply, /\[AGENDAR:\s*DATA=2026-03-16,\s*HORA=09:45/i);
});

test("slot validado antigo e substituido quando a agenda devolve um novo unico horario", () => {
  installFixedDate();

  const bundle = {
    combinedServiceName: "Chuveiro - instalacao ou troca + Tomada - troca ou instalacao",
    selectedServices: [
      {
        id: "svc-chuveiro-jb",
        name: "Chuveiro - instalacao ou troca",
        durationMinutes: 30,
        price: 95,
        requiresCustomerAddress: true,
      },
      {
        id: "svc-tomada-jb",
        name: "Tomada - troca ou instalacao",
        durationMinutes: 30,
        price: 70,
        requiresCustomerAddress: true,
      },
    ],
    totalDurationMinutes: 60,
    totalPrice: 165,
    requiresCustomerAddress: true,
    isAmbiguousMatch: false,
  } as any;

  rememberValidatedSlotOfferForTests(
    "user-jb-stale-offer",
    "5511999990033",
    "2026-03-23",
    "14:45",
    bundle,
  );

  assert.deepEqual(
    getValidatedSlotOfferForTests("user-jb-stale-offer", "5511999990033"),
    { date: "2026-03-23", time: "14:45" },
  );

  const alternativeReply = buildSchedulingNextSlotsReplyWithMemoryForTests(
    "user-jb-stale-offer",
    "5511999990033",
    bundle,
    [
      {
        date: "2026-03-24",
        slots: [
          { start: "14:45", end: "15:45", available: true },
        ],
      },
    ],
    {
      requiresCustomerAddress: true,
      unavailableDate: "2026-03-23",
    },
  );

  const normalizedAlternativeReply = String(alternativeReply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(normalizedAlternativeReply, /24\/03/i);
  assert.deepEqual(
    getValidatedSlotOfferForTests("user-jb-stale-offer", "5511999990033"),
    { date: "2026-03-24", time: "14:45" },
  );
});

test("lista com varios horarios limpa slot validado antigo para nao vazar no fechamento", () => {
  installFixedDate();

  const bundle = {
    combinedServiceName: "Chuveiro - instalacao ou troca + Tomada - troca ou instalacao",
    selectedServices: [
      {
        id: "svc-chuveiro-jb",
        name: "Chuveiro - instalacao ou troca",
        durationMinutes: 30,
        price: 95,
        requiresCustomerAddress: true,
      },
      {
        id: "svc-tomada-jb",
        name: "Tomada - troca ou instalacao",
        durationMinutes: 30,
        price: 70,
        requiresCustomerAddress: true,
      },
    ],
    totalDurationMinutes: 60,
    totalPrice: 165,
    requiresCustomerAddress: true,
    isAmbiguousMatch: false,
  } as any;

  rememberValidatedSlotOfferForTests(
    "user-jb-multi-slot",
    "5511999990034",
    "2026-03-23",
    "14:45",
    bundle,
  );

  buildSchedulingNextSlotsReplyWithMemoryForTests(
    "user-jb-multi-slot",
    "5511999990034",
    bundle,
    [
      {
        date: "2026-03-24",
        slots: [
          { start: "09:00", end: "10:00", available: true },
          { start: "14:45", end: "15:45", available: true },
        ],
      },
    ],
    {
      requiresCustomerAddress: true,
      unavailableDate: "2026-03-23",
    },
  );

  assert.equal(
    getValidatedSlotOfferForTests("user-jb-multi-slot", "5511999990034"),
    null,
  );
});

test("horario distante demais nao deve ser encaixado automaticamente em slot oferecido", () => {
  assert.equal(
    findClosestSchedulingSlotWithinToleranceForTests(["08:30", "13:30", "14:45"], "09:45"),
    null,
  );
});

test("horario aproximado ainda pode encaixar quando a diferenca for pequena ou razoavel", () => {
  assert.equal(
    findClosestSchedulingSlotWithinToleranceForTests(["09:45"], "09:40"),
    "09:45",
  );
  assert.equal(
    findClosestSchedulingSlotWithinToleranceForTests(["09:45"], "09:00"),
    "09:45",
  );
});

test("mensagem com hora explicita nao pode virar automaticamente o primeiro slot da lista", () => {
  const slot = extractOrdinalSlotFromListingForTests(
    "Pode ser às 9h45",
    [
      {
        fromMe: true,
        text: "HORÁRIOS DISPONÍVEIS:\n- Terça-feira (24/03): 13:30 ou 14:45\nPRÓXIMO PASSO: cliente escolhe um horário",
      },
    ],
  );

  assert.equal(slot, null);
});

test("mensagem ordinal sem hora explicita ainda pode escolher o primeiro slot", () => {
  const slot = extractOrdinalSlotFromListingForTests(
    "Pode ser o primeiro",
    [
      {
        fromMe: true,
        text: "HORÁRIOS DISPONÍVEIS:\n- Terça-feira (24/03): 13:30 ou 14:45\nPRÓXIMO PASSO: cliente escolhe um horário",
      },
    ],
  );

  assert.deepEqual(slot, { date: "2026-03-24", time: "13:30" });
});

test("usg com doppler pede desambiguacao mesmo quando a LLM chuta um exame especifico", async () => {
  installClinicDopplerSchedulingMocks();
  installFixedDate();
  setSchedulingOrchestratorTestDependencies({
    async resolveServiceViaLLM() {
      return {
        serviceIds: ["svc-doppler-carotidas"],
        isAmbiguous: false,
      };
    },
  });

  const reply = await generateDeterministicSchedulingReply(
    "clinic-doppler-1",
    "5511999990099",
    "tem usg com doppler?",
    [],
  );
  const prompt = await generateSchedulingTurnPrompt(
    "clinic-doppler-1",
    "5511999990099",
    "tem usg com doppler?",
    [],
  );

  const normalizedReply = String(reply || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const normalizedPrompt = String(prompt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReply, /pedido ambiguo/i);
  assert.match(normalizedReply, /ultrassom abd superior com doppler/i);
  assert.match(normalizedReply, /ultrassom transvaginal com doppler/i);
  assert.doesNotMatch(normalizedReply, /doppler carotidas e vertebrais/i);
  assert.match(normalizedReply, /confirmar qual servico especifico/i);

  assert.match(normalizedPrompt, /nao assuma um servico por conta propria/i);
  assert.match(normalizedPrompt, /ultrassom abd total com doppler/i);
  assert.doesNotMatch(normalizedPrompt, /doppler carotidas e vertebrais/i);
});
