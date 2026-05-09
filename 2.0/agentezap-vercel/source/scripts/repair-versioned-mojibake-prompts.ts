import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

import { repairMojibakeText } from "../shared/mojibake";

type PromptRow = {
  config_id: string;
  user_id: string;
  email: string;
  prompt: string;
};

type PromptVersionRow = {
  version_number: number;
  prompt_type: string;
  model: string | null;
  is_active: boolean | null;
  config_type: string | null;
  metadata: unknown;
};

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 1) {
  const entry = process.argv[index];
  if (!entry.startsWith("--")) continue;
  const nextEntry = process.argv[index + 1];
  if (!nextEntry || nextEntry.startsWith("--")) {
    args.set(entry, "true");
    continue;
  }
  args.set(entry, nextEntry);
  index += 1;
}

const shouldApply = args.get("--apply") === "true";
const onlyEmail = args.get("--email")?.trim().toLowerCase() || "";
const limit = Number(args.get("--limit") || "500");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL nao configurado.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function extractProtectedTokens(text: string): string[] {
  const emailMatches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const urlMatches = text.match(/https?:\/\/\S+/gi) || [];
  const numericMatches = text.match(/\b\d[\d./-]{3,}\d\b/g) || [];
  return Array.from(new Set([...emailMatches, ...urlMatches, ...numericMatches]));
}

function validateRepair(original: string, repaired: string): string[] {
  const issues: string[] = [];

  if (!repaired.trim()) {
    issues.push("saida_vazia");
  }

  if (repaired.includes("\ufffd")) {
    issues.push("replacement_char");
  }

  if (repairMojibakeText(repaired) !== repaired) {
    issues.push("nao_idempotente");
  }

  for (const token of extractProtectedTokens(original)) {
    if (!repaired.includes(token)) {
      issues.push(`token_perdido:${token}`);
    }
  }

  return issues;
}

async function loadCandidates(): Promise<PromptRow[]> {
  const result = await pool.query<PromptRow>(`
    select
      a.id as config_id,
      a.user_id,
      u.email,
      a.prompt
    from ai_agent_config a
    join users u on u.id = a.user_id
    order by u.email asc
  `);

  return result.rows
    .filter((row) => {
      if (onlyEmail) {
        return row.email.toLowerCase() === onlyEmail;
      }

      return true;
    })
    .slice(0, limit);
}

async function loadLatestVersion(userId: string): Promise<PromptVersionRow | null> {
  const result = await pool.query<PromptVersionRow>(`
    select version_number, prompt_type, model, is_active, config_type, metadata
    from prompt_versions
    where user_id = $1
    order by version_number desc
    limit 1
  `, [userId]);

  return result.rows[0] || null;
}

async function applyRepair(row: PromptRow, repairedPrompt: string) {
  const latestVersion = await loadLatestVersion(row.user_id);
  const nextVersionNumber = (latestVersion?.version_number || 0) + 1;
  const promptType = latestVersion?.prompt_type || "main";
  const configType = latestVersion?.config_type || "ai_agent_config";
  const model = latestVersion?.model || null;
  const isActive = latestVersion?.is_active ?? false;
  const metadata = latestVersion?.metadata || {};

  await pool.query("BEGIN");
  try {
    await pool.query(
      "update ai_agent_config set prompt = $1 where id = $2",
      [repairedPrompt, row.config_id],
    );

    await pool.query(
      "update prompt_versions set is_current = false where user_id = $1 and config_type = $2 and is_current = true",
      [row.user_id, configType],
    );

    await pool.query(
      `
        insert into prompt_versions (
          user_id,
          version_number,
          prompt_type,
          prompt_content,
          model,
          is_active,
          created_at,
          metadata,
          config_type,
          edit_summary,
          edit_type,
          edit_details,
          is_current
        ) values (
          $1, $2, $3, $4, $5, $6, now(), $7::jsonb, $8, $9, $10, $11::jsonb, true
        )
      `,
      [
        row.user_id,
        nextVersionNumber,
        promptType,
        repairedPrompt,
        model,
        isActive,
        JSON.stringify(metadata),
        configType,
        "Reparo automatico de mojibake",
        "ia",
        JSON.stringify([
          {
            source: "repair-versioned-mojibake-prompts",
            repairedAt: new Date().toISOString(),
            originalLength: row.prompt.length,
            repairedLength: repairedPrompt.length,
          },
        ]),
      ],
    );

    await pool.query("COMMIT");
    return nextVersionNumber;
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const outputDir = path.join(process.cwd(), "output", "prompt-repairs");
  fs.mkdirSync(outputDir, { recursive: true });

  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    totalScanned: 0,
    totalCandidates: 0,
    repaired: [] as Array<Record<string, unknown>>,
    skipped: [] as Array<Record<string, unknown>>,
  };

  const candidates = await loadCandidates();
  report.totalScanned = candidates.length;

  for (const row of candidates) {
    const repairedPrompt = repairMojibakeText(row.prompt);
    const changed = repairedPrompt !== row.prompt;

    if (!changed) {
      continue;
    }

    report.totalCandidates += 1;

    const issues = validateRepair(row.prompt, repairedPrompt);
    if (issues.length > 0) {
      report.skipped.push({
        email: row.email,
        userId: row.user_id,
        issues,
        before: row.prompt.slice(0, 280),
        after: repairedPrompt.slice(0, 280),
      });
      continue;
    }

    let versionNumber: number | null = null;
    if (shouldApply) {
      versionNumber = await applyRepair(row, repairedPrompt);
    }

    report.repaired.push({
      email: row.email,
      userId: row.user_id,
      versionNumber,
      before: row.prompt.slice(0, 320),
      after: repairedPrompt.slice(0, 320),
    });
  }

  const reportPath = path.join(outputDir, `repair-versioned-mojibake-prompts-${Date.now()}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
