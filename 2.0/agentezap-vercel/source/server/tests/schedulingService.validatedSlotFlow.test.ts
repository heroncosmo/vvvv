import assert from "node:assert/strict";
import { generateSchedulingTurnPrompt } from "../schedulingService.ts";
import { supabase } from "../supabaseAuth.ts";

const originalFrom = (supabase as any).from;
let exitCode = 0;

const configs: Record<string, any> = {
  "user-first": {
    is_enabled: true,
    available_days: [0, 1, 2, 3, 4, 5, 6],
    work_start_time: "00:00",
    work_end_time: "23:45",
    break_start_time: "12:00",
    break_end_time: "13:00",
    has_break: false,
    slot_duration: 60,
    service_duration: 60,
    buffer_between_appointments: 0,
    max_appointments_per_day: 20,
    advance_booking_days: 30,
    min_booking_notice_hours: 0,
    allow_cancellation: true,
    auto_confirm: false,
    google_calendar_enabled: false,
    service_name: "Instalacao",
    slot_suggestion_mode: "first_available",
  },
  "user-ask": {
    is_enabled: true,
    available_days: [0, 1, 2, 3, 4, 5, 6],
    work_start_time: "08:00",
    work_end_time: "18:00",
    break_start_time: "12:00",
    break_end_time: "13:00",
    has_break: false,
    slot_duration: 60,
    service_duration: 60,
    buffer_between_appointments: 0,
    max_appointments_per_day: 20,
    advance_booking_days: 30,
    min_booking_notice_hours: 0,
    allow_cancellation: true,
    auto_confirm: false,
    google_calendar_enabled: false,
    service_name: "Instalacao",
    slot_suggestion_mode: "ask_preference",
  },
};

(supabase as any).from = (tableName: string) => {
  if (tableName === "scheduling_config") {
    let currentUserId = "";
    return {
      select() {
        return this;
      },
      eq(_field: string, value: string) {
        currentUserId = value;
        return this;
      },
      single() {
        return Promise.resolve({
          data: configs[currentUserId] || null,
          error: null,
        });
      },
    };
  }

  if (tableName === "appointments") {
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      in() {
        return this;
      },
      order() {
        return Promise.resolve({ data: [], error: null });
      },
    };
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
          data: [{
            id: "svc-1",
            name: "Instalacao",
            duration_minutes: 60,
            price: "120",
            requires_customer_address: true,
          }],
          error: null,
        });
      },
    };
  }

  if (tableName === "scheduling_exceptions") {
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      single() {
        return Promise.resolve({ data: null, error: { code: "PGRST116" } });
      },
    };
  }

  throw new Error(`Tabela inesperada: ${tableName}`);
};

try {
  const offeredPrompt = await generateSchedulingTurnPrompt(
    "user-first",
    "5511999999999",
    "Quero agendar a instalacao",
  );

  assert.match(offeredPrompt, /primeiro horario validado/i);
  assert.match(offeredPrompt, /Nao peca endereco/i);

  const acceptedPrompt = await generateSchedulingTurnPrompt(
    "user-first",
    "5511999999999",
    "sim",
  );

  assert.match(acceptedPrompt, /ACEITAR o horario|ACEITOU o horario|ACEITAR o horario validado|ACEITOU o horario validado/i);
  assert.match(acceptedPrompt, /SERVICO="Instalacao"/i);
  assert.match(acceptedPrompt, /forma de pagamento/i);

  const guidedPrompt = await generateSchedulingTurnPrompt(
    "user-ask",
    "5511888888888",
    "Quero agendar a instalacao",
  );

  assert.match(guidedPrompt, /pergunte qual dia ou periodo/i);
  assert.doesNotMatch(guidedPrompt, /primeiro horario validado/i);


  console.log("schedulingService.validatedSlotFlow.test.ts ok");
} catch (error) {
  exitCode = 1;
  throw error;
} finally {
  (supabase as any).from = originalFrom;
  setImmediate(() => process.exit(exitCode));
}
