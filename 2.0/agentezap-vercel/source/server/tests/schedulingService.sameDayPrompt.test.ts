import assert from "node:assert/strict";
import {
  generateSchedulingTurnPrompt,
  setSchedulingOrchestratorTestDependencies,
} from "../schedulingService.ts";
import { supabase } from "../supabaseAuth.ts";

const originalFrom = (supabase as any).from;
let exitCode = 0;

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
            available_days: [1, 2, 3, 4, 5, 6],
            work_start_time: "09:00",
            work_end_time: "18:00",
            break_start_time: "12:00",
            break_end_time: "13:00",
            has_break: false,
            slot_duration: 60,
            buffer_between_appointments: 0,
            max_appointments_per_day: 10,
            advance_booking_days: 30,
            min_booking_notice_hours: 0,
            allow_cancellation: true,
            auto_confirm: false,
            google_calendar_enabled: false,
            service_name: "Consulta",
          },
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
        return Promise.resolve({
          data: [{
            id: "apt-1",
            appointment_date: "2026-03-20",
            start_time: "10:00:00",
            service_name: "Consulta",
            client_name: "Cliente Teste",
            client_phone: "5511999999999",
            status: "pending",
          }],
          error: null,
        });
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
        return Promise.resolve({ data: [], error: null });
      },
    };
  }

  throw new Error(`Tabela inesperada: ${tableName}`);
};

setSchedulingOrchestratorTestDependencies({
  async callPlanner() {
      return {
        shouldHandle: true,
        action: "READY_TO_BOOK",
        requestedDate: "2026-03-20",
        requestedTime: "11:00",
        selectedDate: "2026-03-20",
        selectedTime: "11:00",
        customerName: "Cliente Teste",
      customerAddress: null,
      wantsBookingDetails: false,
      confidence: 0.95,
      reasoning: "cliente quer outro horario no mesmo dia",
    };
  },
});

try {
  const prompt = await generateSchedulingTurnPrompt(
    "user-1",
    "5511999999999",
    "Pode agendar para 20/03 às 11h?",
  );

  const normalizedPrompt = String(prompt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedPrompt, /ja possui agendamento/i);

  console.log("schedulingService.sameDayPrompt.test.ts ok");
} catch (error) {
  exitCode = 1;
  throw error;
} finally {
  (supabase as any).from = originalFrom;
  setSchedulingOrchestratorTestDependencies(null);
  setImmediate(() => process.exit(exitCode));
}
