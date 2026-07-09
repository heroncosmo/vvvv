import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

function arg(name: string, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function base64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(userId: string, email: string) {
  return [
    base64Url({ alg: "none", typ: "JWT" }),
    base64Url({
      sub: userId,
      aud: "authenticated",
      email,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    "signature",
  ].join(".");
}

async function readSse(response: Response) {
  const raw = await response.text();
  const events = raw
    .split(/\n\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => chunk.replace(/^data:\s*/i, ""))
    .map((chunk) => {
      try {
        return JSON.parse(chunk);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { raw, events, final: events[events.length - 1] || null };
}

async function postEdit(endpoint: string, token: string, currentPrompt: string, instruction: string) {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/agent/edit-prompt-stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ currentPrompt, instruction }),
  });
  return readSse(response);
}

async function main() {
  const promptPath = arg("--prompt", "tmp/marcel-current-prompt-20260429.txt");
  const instruction = arg("--instruction");
  const endpoint = arg("--endpoint", "https://agentezap.online");
  const out = arg("--out", "tmp/prompt-edit-agent-cli-result.json");
  if (!instruction) {
    throw new Error("Use --instruction \"pedido de edicao\"");
  }

  const currentPrompt = readFileSync(promptPath, "utf8").trim();
  const userId = randomUUID();
  const email = `prompt.edit.agent.cli.${Date.now()}@agentezap.local`;
  const token = fakeJwt(userId, email);

  const proposal = await postEdit(endpoint, token, currentPrompt, instruction);
  if (!proposal.final?.requiresConfirmation) {
    throw new Error(`Expected confirmation proposal. Raw: ${proposal.raw.slice(0, 600)}`);
  }

  const applied = await postEdit(endpoint, token, currentPrompt, "sim pode aplicar");
  if (!applied.final?.success) {
    throw new Error(`Expected successful apply. Raw: ${applied.raw.slice(0, 1000)}`);
  }

  const result = {
    endpoint,
    promptPath,
    instruction,
    beforeLength: currentPrompt.length,
    afterLength: String(applied.final.newPrompt || "").length,
    versionId: applied.final.versionId || null,
    proposal: proposal.final.feedbackMessage || "",
    agentTrace: applied.final.agentTrace || null,
  };
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
