import assert from "node:assert/strict";
import { createPendingAppointment } from "../schedulingService.ts";
import { supabase } from "../supabaseAuth.ts";

const existingAppointment = {
  id: "apt-existing-1",
  user_id: "user-1",
  client_name: "Alice Silva",
  client_phone: "557186678920",
  service_name: "Combo Bumbum na Nuca",
  appointment_date: "2026-03-20",
  start_time: "10:00:00",
  end_time: "11:00:00",
  duration_minutes: 60,
  location: "Sala 25",
  location_type: "presencial",
  status: "confirmed",
  confirmed_by_client: false,
  confirmed_by_business: true,
  created_by_ai: true,
  reminder_sent: false,
};

const providedConfig = {
  is_enabled: true,
  auto_confirm: true,
  slot_duration: 60,
  location: "Sala 25",
  location_type: "presencial",
  service_name: "Combo Bumbum na Nuca",
} as any;

const originalFrom = (supabase as any).from;
let insertCalled = false;
let exitCode = 0;

const mockedQueryBuilder: any = {
  select() {
    return mockedQueryBuilder;
  },
  eq() {
    return mockedQueryBuilder;
  },
  order() {
    return mockedQueryBuilder;
  },
  in() {
    return mockedQueryBuilder;
  },
  limit() {
    return {
      data: [existingAppointment],
      error: null,
    };
  },
  insert() {
    insertCalled = true;
    return {
      select() {
        return {
          single() {
            return {
              data: null,
              error: new Error("insert should not be called for duplicate appointment"),
            };
          },
        };
      },
    };
  },
};

(supabase as any).from = (tableName: string) => {
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

  assert.equal(tableName, "appointments");
  return mockedQueryBuilder;
};

try {
  const result = await createPendingAppointment(
    "user-1",
    "Alice Silva",
    "557186678920",
    "2026-03-20",
    "10:00",
    undefined,
    providedConfig,
    "Combo Bumbum na Nuca",
    "conversation-1",
  );

  assert.equal(result.success, true);
  assert.equal(result.appointment?.id, existingAppointment.id);
  assert.equal(insertCalled, false);

  console.log("schedulingService.idempotency.test.ts ok");
} catch (error) {
  exitCode = 1;
  throw error;
} finally {
  (supabase as any).from = originalFrom;
  setImmediate(() => process.exit(exitCode));
}
