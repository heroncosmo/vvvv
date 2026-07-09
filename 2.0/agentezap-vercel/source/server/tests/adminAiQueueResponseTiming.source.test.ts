import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routesSource = readFileSync(join(process.cwd(), "server", "routes.ts"), "utf8");
const panelSource = readFileSync(join(process.cwd(), "client", "src", "components", "admin-ai-queue-panel.tsx"), "utf8");

test("admin queue status exposes real response timing separate from job duration", () => {
  assert.match(routesSource, /responseTimeSeconds/);
  assert.match(routesSource, /whatsappToAppSeconds/);
  assert.match(routesSource, /jobTotalSeconds/);
  assert.match(routesSource, /lastCustomerPersistedAt/);
  assert.match(routesSource, /firstAgentAt/);
  assert.match(routesSource, /LEFT JOIN LATERAL[\s\S]*FROM messages m[\s\S]*m\.from_me = false/);
  assert.match(routesSource, /LEFT JOIN LATERAL[\s\S]*m\.from_me = true[\s\S]*is_from_agent/);
});

test("admin queue panel shows response time details with view action and pagination", () => {
  assert.match(panelSource, /Cliente -&gt; resposta criada/);
  assert.match(panelSource, /WhatsApp -&gt; app/);
  assert.match(panelSource, /Gerando resposta/);
  assert.match(panelSource, /Entrega/);
  assert.match(panelSource, /Tempo total do job/);
  assert.match(panelSource, /recentJobsPage/);
  assert.match(panelSource, /setRecentPage/);
  assert.match(panelSource, /<Eye className=/);
  assert.doesNotMatch(panelSource, /<TableHead>Duracao<\/TableHead>/);
});

test("admin queue does not count scheduled wait as customer response SLA", () => {
  assert.ok(
    routesSource.includes(
      "COALESCE(m.timestamp, m.created_at) >= COALESCE(p.last_attempt_at, p.execute_at, p.updated_at, p.created_at) - INTERVAL '2 minutes'",
    ),
    "timer rows must only attach a customer message near execution time",
  );
  assert.match(routesSource, /'timer' AS source[\s\S]*NULL::int AS "responseTimeSeconds"/);
  assert.match(
    routesSource,
    /COALESCE\(m\.timestamp, m\.created_at\) >= COALESCE\(customer_msg\.msg_at, p\.last_attempt_at, p\.execute_at, p\.created_at\)/,
  );
  assert.match(
    panelSource,
    /job\.source === "timer"[\s\S]*"retorno programado"/,
  );
});

test("admin queue separates WhatsApp arrival delay from app processing delay", () => {
  assert.match(routesSource, /incoming_message_log l/);
  assert.match(routesSource, /app_persist_seconds/);
  assert.match(routesSource, /p90AppPersistSeconds/);
  assert.match(routesSource, /appOver5Seconds/);
  assert.match(panelSource, /WhatsApp -&gt; app P90/);
  assert.match(panelSource, /Servidor -&gt; app P90/);
  assert.match(panelSource, /Servidor -&gt; app acima de 5s/);
});

test("admin queue history can focus real attendances separate from programmed returns", () => {
  assert.match(routesSource, /const recentSource = normalizeAdminRecentSource\(req\.query\?\.source\)/);
  assert.match(routesSource, /const buildRuntimeRecentJobs = \(runtime: any\)/);
  assert.match(routesSource, /const rawRuntime = null/);
  assert.match(routesSource, /const runtimeRecentJobs: any\[\] = \[\]/);
  assert.doesNotMatch(routesSource, /getOpenCodeMimoRuntimeStatusForAdmin/);
  assert.match(routesSource, /\.\.\.runtimeRecentJobs/);
  assert.match(routesSource, /\.\.\.\(recentSource !== "timer" \? activeJobs\.rows : \[\]\)/);
  assert.match(routesSource, /\.\.\.\(recentSource !== "principal" \? legacyJobs\.rows : \[\]\)/);
  assert.match(routesSource, /source: "principal"/);
  assert.match(routesSource, /Atendimento em andamento/);
  assert.match(routesSource, /Atendimento registrado em tempo real/);
  assert.match(routesSource, /source: recentSource/);
  assert.match(routesSource, /agent_msg\.status AS "deliveryStatus"/);
  assert.match(panelSource, /const \[recentSource, setRecentSource\] = useState<RecentSource>\("principal"\)/);
  assert.match(panelSource, /source=\$\{recentSource\}/);
  assert.match(panelSource, /Atendimento real/);
  assert.match(panelSource, /Retornos programados/);
  assert.match(panelSource, /incluindo atendimentos em tempo real e registros salvos/);
  assert.match(panelSource, /sem envio agora/);
});
