import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

import { repairMojibakeText } from "../shared/mojibake";
import { chatComplete } from "../server/llm";

type PromptRow = {
  config_id: string;
  user_id: string;
  email: string;
  name: string | null;
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

type RepairProviderConfig = {
  openrouterApiKey: string;
  openrouterModel: string;
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
const limit = Number(args.get("--limit") || "50");

const DAMAGE_MARKERS = [
  "voc ",
  "servios",
  "informaes",
  "descrio",
  "histrico",
  "secretria",
  "eltrica",
  "uberlndia",
  "tcnico",
  "horrio",
  "endereo",
  "prximo",
  "dbito",
  "carto",
  "crdito",
  "condies",
  "instalao",
  "verificao",
  "observao",
  "mltiplas",
  "obrigatria",
  "\u0013",
  "\u0014",
  "\u0005",
  "\u000f",
  "dÒ",
  "preÒ",
  "horÒ",
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL nao configurado.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let repairProviderConfig: RepairProviderConfig = {
  openrouterApiKey: "",
  openrouterModel: "google/gemma-3-4b-it:free",
};

function looksLikeDamagedPrompt(text: string): boolean {
  const normalized = repairMojibakeText(String(text || "")).toLowerCase();
  return DAMAGE_MARKERS.some((marker) => normalized.includes(marker));
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

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

  if (repaired.length < original.length * 0.7) {
    issues.push("saida_muito_curta");
  }

  if (repaired.length > original.length * 1.45) {
    issues.push("saida_muito_longa");
  }

  for (const token of extractProtectedTokens(original)) {
    if (!repaired.includes(token)) {
      issues.push(`token_perdido:${token}`);
    }
  }

  return issues;
}

async function repairPromptText(prompt: string): Promise<string> {
  const cleanedPrompt = repairMojibakeText(prompt);
  const messages = [
    {
      role: "system" as const,
      content: [
        "Voce e um revisor de texto especializado em recuperar prompts corrompidos.",
        "Corrija apenas palavras quebradas por perda de letras, acentos, cedilha, simbolos de controle ou mojibake.",
        "Preserve rigorosamente a estrutura, as regras, os nomes proprios, emails, URLs, CNPJ, telefones, numeros e a intencao do prompt.",
        "Nao invente regras novas, nao resuma, nao explique, nao mude o negocio.",
        "Se ficar em duvida sobre uma palavra, prefira manter o original.",
        "Retorne somente o prompt final corrigido, sem markdown e sem comentarios.",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: `PROMPT PARA CORRIGIR:\n<<<PROMPT>>>\n${cleanedPrompt}\n<<<FIM_PROMPT>>>`,
    },
  ];

  let content = "";
  if (repairProviderConfig.openrouterApiKey) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${repairProviderConfig.openrouterApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: repairProviderConfig.openrouterModel,
          messages,
          temperature: 0,
          max_tokens: Math.max(6000, Math.ceil(cleanedPrompt.length * 1.2)),
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter repair error: ${response.status}`);
      }

      const parsed = await response.json();
      content = String(parsed?.choices?.[0]?.message?.content || "");
    } catch (error) {
      console.log(`[repair-damaged-prompts] OpenRouter indisponivel, usando chatComplete: ${String((error as Error)?.message || error)}`);
    }
  }

  if (!content) {
    const response = await chatComplete({
      temperature: 0,
      maxTokens: Math.max(6000, Math.ceil(cleanedPrompt.length * 1.2)),
      skipMistralQueue: true,
      messages,
    });
    content = String(response.choices?.[0]?.message?.content || "");
  }

  return repairMojibakeText(stripCodeFences(content));
}

async function loadCandidates(): Promise<PromptRow[]> {
  const result = await pool.query<PromptRow>(`
    select
      a.id as config_id,
      a.user_id,
      u.email,
      u.name,
      a.prompt
    from ai_agent_config a
    join users u on u.id = a.user_id
    order by u.email asc
  `);

  const filtered = result.rows.filter((row) => {
    if (onlyEmail) {
      return row.email.toLowerCase() === onlyEmail;
    }
    return looksLikeDamagedPrompt(row.prompt);
  });

  return filtered.slice(0, limit);
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
        "Reparo ortografico automatico de prompt",
        "ia",
        JSON.stringify([
          {
            source: "repair-damaged-prompts",
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

  const configResult = await pool.query<{ chave: string; valor: string | null }>(`
    select chave, valor
    from system_config
    where chave in ('openrouter_api_key', 'openrouter_model')
  `);
  const configMap = new Map(configResult.rows.map((row) => [row.chave, String(row.valor || "")]));
  repairProviderConfig = {
    openrouterApiKey: configMap.get("openrouter_api_key") || "",
    openrouterModel: "google/gemma-3-4b-it:free",
  };

  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    totalCandidates: 0,
    repaired: [] as Array<Record<string, unknown>>,
    skipped: [] as Array<Record<string, unknown>>,
  };

  const candidates = await loadCandidates();
  report.totalCandidates = candidates.length;

  for (const row of candidates) {
    const repairedPrompt = await repairPromptText(row.prompt);
    const issues = validateRepair(row.prompt, repairedPrompt);
    const changed = repairedPrompt.trim() !== repairMojibakeText(row.prompt).trim();

    if (!changed || issues.length > 0) {
      report.skipped.push({
        email: row.email,
        userId: row.user_id,
        changed,
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
      before: row.prompt.slice(0, 500),
      after: repairedPrompt.slice(0, 500),
    });
  }

  const reportPath = path.join(outputDir, `repair-damaged-prompts-${Date.now()}.json`);
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
