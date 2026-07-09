import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const httpSource = fs.readFileSync(path.resolve(root, "api", "http.ts"), "utf8");
const usageBannerSource = fs.readFileSync(
  path.resolve(root, "client", "src", "components", "usage-limit-banner.tsx"),
  "utf8",
);
const studioSource = fs.readFileSync(
  path.resolve(root, "client", "src", "components", "agent-studio-unified.tsx"),
  "utf8",
);

assert.match(
  httpSource,
  /FREE_PRIORITY_DAILY_BOOST_LIMIT\s*=\s*3/,
  "Free must use daily priority boosts, not a single hardcoded client slot.",
);

assert.match(
  httpSource,
  /FREE_PRIORITY_GRACE_HOURS\s*=\s*24/,
  "Gratis priority window must last 24h after WhatsApp connection.",
);

assert.match(
  httpSource,
  /getFreePriorityBoostsUsedToday/,
  "Free priority must count boost usage after the 24h WhatsApp connection window.",
);

assert.match(
  httpSource,
  /LIKE 'queued:vercel_gateway_agent:retry:free_economy_deferred%'/,
  "Free queue countdown must read only real economy queue jobs.",
);

assert.match(
  httpSource,
  /execute_at AS "executeAt"[\s\S]*remainingSeconds/,
  "Free queue payload must expose execute_at-derived countdown data.",
);

assert.match(
  httpSource,
  /status = 'pending'[\s\S]*free_economy_deferred[\s\S]*THEN vercel_agent_response_jobs\.execute_at/,
  "New inbound messages must not erase an existing Free economy execute_at.",
);

assert.doesNotMatch(
  httpSource,
  /type:\s*"free_queue"/,
  "Personalize streaming must not emit Free queue state; configuration must stay fast.",
);

assert.doesNotMatch(
  httpSource,
  /attachFreeQueuePayload\(result\.payload,\s*freeQueue\)/,
  "Authenticated simulator responses must not include Free queue state.",
);

assert.doesNotMatch(
  httpSource,
  /attachFreeQueuePayload\(payload,\s*freeQueue\)/,
  "Public simulator responses must not include Free queue state.",
);

assert.match(
  usageBannerSource,
  /useLiveQueueCountdown/,
  "The Free banner must render a live countdown from executeAt.",
);

assert.match(
  usageBannerSource,
  /Proxima resposta em|Pr[\s\S]{1,4}xima resposta em/,
  "The Free banner must show a live owner-facing queue countdown when a real job exists.",
);

assert.match(
  usageBannerSource,
  /Modo Econ[\s\S]{1,4}mico ativo/,
  "The Grátis banner must show an indeterminate economy state when no real executeAt exists.",
);

assert.match(
  usageBannerSource,
  /freeQueue\?\.active[\s\S]{0,120}freeQueueActive/,
  "The owner-facing economy notice must render only from real economy mode, limit, or active queue state.",
);

assert.doesNotMatch(
  usageBannerSource,
  /fila transparente|Free ativo|Continuar no Free|Free com prioridade/,
  "The owner-facing economy notice must not use confusing Free/fila transparente copy.",
);

assert.doesNotMatch(
  usageBannerSource,
  /Gr.tis ativo|prioridade inicial ativa/,
  "The owner-facing economy notice must not announce a normal free state; it only appears for Modo Economico.",
);

assert.doesNotMatch(
  usageBannerSource,
  /fixed\s+inset-0|z-\[130\]|bg-slate-950\/45|free_priority_notice_closed/,
  "The owner-facing economy notice must stay as a top banner, not a full-screen modal.",
);

assert.doesNotMatch(
  httpSource,
  /fila transparente|Seu agente esta no Free|prioridade inicial ativa/,
  "Backend usage payload must not send the old Free/fila transparente copy.",
);

assert.doesNotMatch(
  studioSource,
  /data\.type === 'free_queue'/,
  "Personalize UI must not render Free queue SSE events.",
);

assert.doesNotMatch(
  studioSource,
  /sim-free-queue/,
  "Agent simulator UI must not inject a Free economy message into the test chat.",
);

console.log("freePlusQueueContract source contract ok");
