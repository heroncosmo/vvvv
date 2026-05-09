import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

type ChatEntry = {
  role: "user" | "assistant";
  content: string;
};

type ScenarioResult = {
  label: string;
  address: string;
  ok: boolean;
  orderId?: string | null;
  orderNumber?: number | null;
  deliveryFee?: number | null;
  total?: number | null;
  distanceLine?: string | null;
  feeLine?: string | null;
  responsePreview?: string | null;
  transcript?: ChatEntry[];
  error?: string | null;
};

const baseUrl = process.env.LOCAL_BASE_URL || "http://127.0.0.1:5003";
const email = process.env.QA_DELIVERY_EMAIL || "";
const password = process.env.QA_DELIVERY_PASSWORD || "";
const outputDir = path.resolve("output", "playwright");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Variaveis do Supabase ausentes no ambiente local.");
}

if (!email || !password) {
  throw new Error("Defina QA_DELIVERY_EMAIL e QA_DELIVERY_PASSWORD para rodar a bateria local.");
}

const userSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const adminSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const configuredScenarioLabels = (process.env.QA_SCENARIO_LABELS || "")
  .split(",")
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);

const scenarios = [
  { label: "rua", address: "Rua Antonio Plastina, 252A" },
  { label: "avenida", address: "Avenida Brigadeiro Eduardo Gomes, 620" },
  { label: "av abreviada", address: "Av Vicente Ferreira, 120" },
  { label: "travessa", address: "Travessa Primavera, 45" },
  { label: "alameda", address: "Alameda Almeria, 88" },
  { label: "praca", address: "Praca Dona Maria Izabel, 123" },
  { label: "estrada", address: "Estrada Municipal Danilo Gonzales, 299" },
].filter(scenario => configuredScenarioLabels.length === 0 || configuredScenarioLabels.includes(scenario.label));

async function api<T>(token: string, route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${route}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${route} -> ${response.status} ${text}`);
  }

  return response.json() as Promise<T>;
}

async function sendSimulatorMessage(
  token: string,
  sessionId: string,
  history: ChatEntry[],
  message: string,
) {
  const data = await api<{
    response?: string;
    splitResponses?: string[];
  }>(token, "/api/agent/test", {
    method: "POST",
    body: JSON.stringify({
      message,
      history,
      sessionId,
    }),
  });

  history.push({ role: "user", content: message });
  for (const split of data.splitResponses || []) {
    history.push({ role: "assistant", content: split });
  }

  return data;
}

function openAllWeekHours() {
  return {
    monday: { enabled: true, open: "00:00", close: "23:59" },
    tuesday: { enabled: true, open: "00:00", close: "23:59" },
    wednesday: { enabled: true, open: "00:00", close: "23:59" },
    thursday: { enabled: true, open: "00:00", close: "23:59" },
    friday: { enabled: true, open: "00:00", close: "23:59" },
    saturday: { enabled: true, open: "00:00", close: "23:59" },
    sunday: { enabled: true, open: "00:00", close: "23:59" },
  };
}

function extractInterestingLine(text: string, keyword: string): string | null {
  const line = (text || "")
    .split(/\r?\n/)
    .map(entry => entry.trim())
    .find(entry => entry.toLowerCase().includes(keyword.toLowerCase()));
  return line || null;
}

async function main() {
  const { data: authData, error: authError } = await userSupabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError || !authData.session?.access_token) {
    throw new Error(`Falha no login Supabase: ${authError?.message || "sem token"}`);
  }

  const token = authData.session.access_token;
  const { data: userRow, error: userError } = await adminSupabase
    .from("users")
    .select("id,email,name")
    .eq("email", email)
    .single();

  if (userError || !userRow?.id) {
    throw new Error(`Usuario nao encontrado para QA: ${userError?.message || email}`);
  }

  const userId = userRow.id as string;
  const { data: originalConfig, error: configError } = await adminSupabase
    .from("delivery_config")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (configError || !originalConfig) {
    throw new Error(`Config delivery ausente: ${configError?.message || "sem config"}`);
  }

  const originalOpeningHours = structuredClone(originalConfig.opening_hours || {});
  const originalFeeSettings = structuredClone(originalConfig.delivery_fee_settings || {});
  const originalIsActive = originalConfig.is_active;
  const originalSendToAi = originalConfig.send_to_ai;

  const startedAt = new Date().toISOString();
  const results: ScenarioResult[] = [];
  const createdOrderIds: string[] = [];

  try {
    const patchedConfig = {
      is_active: true,
      send_to_ai: true,
      accepts_delivery: true,
      accepts_pickup: true,
      opening_hours: openAllWeekHours(),
      delivery_fee_settings: {
        mode: "distance",
        originAddress: "Rua Jose Batista de Almeida Sobrinho, 503, Marilia - SP",
        cityContext: "Marilia - SP",
        baseFee: 2,
        baseDistanceKm: 2,
        additionalFeePerKm: 1,
        maxDistanceKm: 20,
        fallbackFee: 0,
      },
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await adminSupabase
      .from("delivery_config")
      .update(patchedConfig)
      .eq("user_id", userId);

    if (updateError) {
      throw new Error(`Falha ao preparar config local: ${updateError.message}`);
    }

    for (const scenario of scenarios) {
      const history: ChatEntry[] = [];
      const sessionId = `qa-local-${Date.now()}-${scenario.label}`;
      const customerName = "Lucas";

      try {
        await sendSimulatorMessage(token, sessionId, history, "quero ver as pizzas");
        await sendSimulatorMessage(token, sessionId, history, "quero uma pizza de calabresa");
        const summary = await sendSimulatorMessage(
          token,
          sessionId,
          history,
          `${customerName}, entrega, ${scenario.address}, pix`,
        );
        const confirmation = await sendSimulatorMessage(token, sessionId, history, "sim");

        const responseText = summary.response || "";
        const { data: orders, error: ordersError } = await adminSupabase
          .from("delivery_orders")
          .select("id, order_number, delivery_fee, total, customer_name, customer_address, created_at")
          .eq("user_id", userId)
          .eq("customer_name", customerName)
          .eq("customer_address", scenario.address)
          .gte("created_at", startedAt)
          .order("created_at", { ascending: false })
          .limit(1);

        if (ordersError) {
          throw new Error(`Falha consultando pedido: ${ordersError.message}`);
        }

        const order = orders?.[0];
        if (!order?.id) {
          throw new Error(`Pedido nao foi criado apos a confirmacao. Ultima resposta: ${confirmation.response || "sem resposta"}`);
        }

        createdOrderIds.push(order.id);
        results.push({
          label: scenario.label,
          address: scenario.address,
          ok: true,
          orderId: order.id,
          orderNumber: order.order_number,
          deliveryFee: Number(order.delivery_fee ?? 0),
          total: Number(order.total ?? 0),
          feeLine: extractInterestingLine(responseText, "taxa"),
          distanceLine: extractInterestingLine(responseText, "distancia"),
          responsePreview: responseText.slice(0, 220),
          transcript: [...history],
        });
      } catch (error: any) {
        results.push({
          label: scenario.label,
          address: scenario.address,
          ok: false,
          transcript: [...history],
          error: error?.message || String(error),
        });
      }
    }
  } finally {
    if (createdOrderIds.length > 0) {
      const { error: deleteError } = await adminSupabase
        .from("delivery_orders")
        .delete()
        .in("id", createdOrderIds);
      if (deleteError) {
        console.error("Falha limpando pedidos QA:", deleteError.message);
      }
    }

    const { error: restoreError } = await adminSupabase
      .from("delivery_config")
      .update({
        is_active: originalIsActive,
        send_to_ai: originalSendToAi,
        opening_hours: originalOpeningHours,
        delivery_fee_settings: originalFeeSettings,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (restoreError) {
      console.error("Falha restaurando config original:", restoreError.message);
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(outputDir, `delivery-local-address-battery-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    baseUrl,
    email,
    startedAt,
    scenarios: results,
  }, null, 2));

  const failed = results.filter(result => !result.ok);
  console.log(JSON.stringify({ reportPath, results }, null, 2));

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
