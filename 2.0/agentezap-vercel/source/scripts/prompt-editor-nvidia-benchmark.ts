import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const ENV_FILE =
  process.env.PROMPT_BENCH_ENV_FILE ||
  "C:/Users/rodri/Downloads/agentezap/vvvv/_vps_sync_state/backups/before-sync-20260418_021941/.env";

const DEFAULT_MODELS = [
  "z-ai/glm-5.1",
  "nvidia/nemotron-3-super-120b-a12b",
  "deepseek-ai/deepseek-v4-pro",
  "deepseek-ai/deepseek-v4-flash",
];

const MODELS = (process.env.PROMPT_BENCH_MODELS || "")
  .split(/[\n,;]+/g)
  .map((item) => item.trim())
  .filter(Boolean);
if (MODELS.length === 0) MODELS.push(...DEFAULT_MODELS);

type Scenario = {
  id: string;
  business: string;
  prompt: string;
  instruction: string;
  required: string[];
  protectedLines: string[];
};

function loadEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

function repeatBlock(title: string, body: string, repeat = 8) {
  return Array.from({ length: repeat }, (_, index) => `## ${title} ${index + 1}\n${body}`).join("\n\n");
}

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasMojibake(value: string) {
  return /\uFFFD|Ã[\u0080-\u00BF]|Ãƒ|Ã‚|Â[\u0080-\u00BF]|â(?:€|€™|€œ|€|€¢|€˜|€¦)|ð|voc\?|n\?o|cat\?logo|card\?pio|produ\?\?/i.test(value);
}

function extractPrompt(raw: string) {
  const text = String(raw || "").trim();
  const match = text.match(/<prompt_final>([\s\S]*?)<\/prompt_final>/i);
  return (match?.[1] || text).replace(/^```[a-z]*\s*/i, "").replace(/```$/i, "").trim();
}

function buildSyntheticPrompt(business: string, core: string, protectedLines: string[]) {
  return [
    `<prompt_final>`,
    `# ${business}`,
    "",
    "## Identidade",
    `Voce atende pelo WhatsApp como especialista do negocio ${business}.`,
    "Seja claro, humano, objetivo e mantenha continuidade da conversa.",
    "",
    "## Regras protegidas",
    ...protectedLines.map((line) => `- ${line}`),
    "",
    repeatBlock("Base operacional", core, 10),
    "",
    "## Saida esperada",
    "Sempre faca uma pergunta objetiva por vez quando faltar informacao.",
    "Nunca invente item, preco, prazo, disponibilidade, agenda ou condicao comercial.",
    "</prompt_final>",
  ].join("\n");
}

async function loadNvidiaConfig() {
  loadEnv(ENV_FILE);
  const directKey =
    process.env.STATUS_NVIDIA_API_KEY ||
    process.env.BLOG_NVIDIA_API_KEY ||
    process.env.NVIDIA_API_KEY ||
    "";
  if (directKey.trim()) return { apiKey: directKey.trim(), source: "env" };

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente para buscar chave NVIDIA");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query(
      `
        SELECT chave, valor
        FROM system_config
        WHERE chave = ANY($1::text[])
      `,
      [["status_nvidia_api_key", "blog_nvidia_api_key", "nvidia_api_key"]],
    );
    const map = new Map(result.rows.map((row) => [String(row.chave), String(row.valor || "").trim()]));
    const apiKey = map.get("status_nvidia_api_key") || map.get("blog_nvidia_api_key") || map.get("nvidia_api_key") || "";
    if (!apiKey) throw new Error("Nenhuma chave NVIDIA encontrada em system_config");
    return { apiKey, source: "system_config" };
  } finally {
    await client.end();
  }
}

async function loadMarcelPrompt() {
  const local = path.join("tmp", "marcel-current-prompt-20260429.txt");
  if (fs.existsSync(local)) return fs.readFileSync(local, "utf8");
  loadEnv(ENV_FILE);
  if (!process.env.DATABASE_URL) return "";
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query(
      `
        SELECT c.prompt
        FROM ai_agent_config c
        JOIN users u ON u.id = c.user_id
        WHERE lower(u.email) = lower($1)
        ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST
        LIMIT 1
      `,
      ["marcelpinheiroadm@gmail.com"],
    );
    return String(result.rows[0]?.prompt || "");
  } finally {
    await client.end();
  }
}

async function callNvidia(model: string, apiKey: string, scenario: Scenario) {
  const appendOnly = scenario.prompt.length >= 8000;
  const systemPrompt = appendOnly
    ? [
        "Voce e um editor senior de prompts comerciais para WhatsApp.",
        "O prompt atual e grande. Nao reescreva o prompt completo.",
        "Crie apenas um bloco de regras adicionais que sera acrescentado ao final do prompt existente.",
        "O bloco deve aplicar a instrucao confirmada sem apagar catalogo, midias, delivery, pedido, agenda, links, placeholders ou regras existentes.",
        "Retorne somente o bloco entre <append_block> e </append_block>.",
      ].join("\n")
    : [
        "Voce e um editor senior de prompts comerciais para WhatsApp.",
        "Aplique a instrucao de edicao como uma alteracao localizada.",
        "Preserve identidade, catalogo, midias, delivery, pedido, agenda, regras de negocio, links, placeholders e detalhes comerciais nao pedidos para remover.",
        "Se houver conflito, preserve a regra existente e acrescente uma regra mais segura em vez de apagar contexto.",
        "Retorne somente o prompt final completo entre <prompt_final> e </prompt_final>.",
      ].join("\n");

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            `Negocio: ${scenario.business}`,
            `Instrucao confirmada: ${scenario.instruction}`,
            "",
            "Linhas protegidas:",
            scenario.protectedLines.map((line) => `- ${line}`).join("\n"),
            "",
            "Prompt atual completo:",
            scenario.prompt,
          ].join("\n"),
        },
      ],
      temperature: 0.05,
      max_tokens: appendOnly ? 1600 : 7000,
      stream: false,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `NVIDIA ${response.status}`);
  }
  const raw = String(data?.choices?.[0]?.message?.content || "");
  if (!raw.trim()) throw new Error("resposta vazia");
  if (!appendOnly) return extractPrompt(raw);
  const block = raw.match(/<append_block>([\s\S]*?)<\/append_block>/i)?.[1]?.trim() || raw.trim();
  const closingTagMatch = scenario.prompt.trim().match(/\n?<\/prompt_final>\s*$/i);
  if (closingTagMatch?.index !== undefined) {
    return `${scenario.prompt.trim().slice(0, closingTagMatch.index).trimEnd()}\n\n## AJUSTE CONFIRMADO PELO EDITOR\n${block}\n</prompt_final>`;
  }
  return `${scenario.prompt.trim()}\n\n## AJUSTE CONFIRMADO PELO EDITOR\n${block}`;
}

function scoreScenario(scenario: Scenario, output: string) {
  const beforeLen = scenario.prompt.length;
  const afterLen = output.length;
  const norm = normalize(output);
  const missing = scenario.required.filter((item) => !norm.includes(normalize(item)));
  const missingProtected = scenario.protectedLines.filter((line) => !norm.includes(normalize(line)));
  const tooShort = beforeLen > 5000 && afterLen < beforeLen * 0.72;
  const mojibake = hasMojibake(output);
  const startsWithChat = /^\s*(claro|entendi|segue|aqui esta)/i.test(output.slice(0, 120));
  const passed = missing.length === 0 && missingProtected.length === 0 && !tooShort && !mojibake && !startsWithChat;
  return {
    passed,
    beforeLen,
    afterLen,
    ratio: Number((afterLen / Math.max(1, beforeLen)).toFixed(3)),
    missing,
    missingProtected: missingProtected.slice(0, 3),
    tooShort,
    mojibake,
    startsWithChat,
  };
}

async function main() {
  const { apiKey, source } = await loadNvidiaConfig();
  const marcelPrompt = await loadMarcelPrompt();
  const scenarios: Scenario[] = [
    {
      id: "marcel-pizzaria-delivery-cardapio",
      business: "Estacao da Pizza",
      prompt: marcelPrompt,
      instruction:
        "quando o cliente iniciar uma conversa, chamar ele pelo nome, em seguida enviar o cardapio em imagem, mas nao altere o cardapio que esta no prompt",
      required: ["DELIVERY 2.0", "cardapio", "pedido", "nome"],
      protectedLines: [
        "DELIVERY 2.0",
        "BLOQUEIO CRITICO DE CATALOGO",
        "cardapio oficial",
        "pedido",
      ],
    },
    {
      id: "imobiliaria-remax",
      business: "Imobiliaria consultiva",
      prompt: buildSyntheticPrompt(
        "IMOBILIARIA CONSULTIVA",
        "Catalogo de imoveis com codigo, bairro, valor, metragem, condominio, financiamento e restricoes. O agente deve fazer triagem de finalidade, faixa de preco, forma de pagamento e urgencia antes de sugerir visitas. Nunca invente disponibilidade.",
        ["[MEDIA:CATALOGO_IMOVEIS_PDF]", "Preservar codigos dos imoveis", "Confirmar faixa de preco antes de visita"],
      ),
      instruction: "deixe o atendimento mais consultivo e confirme se o cliente quer comprar ou alugar antes de oferecer imovel",
      required: ["[MEDIA:CATALOGO_IMOVEIS_PDF]", "comprar", "alugar", "faixa de preco"],
      protectedLines: ["[MEDIA:CATALOGO_IMOVEIS_PDF]", "Preservar codigos dos imoveis"],
    },
    {
      id: "clinica-agendamento",
      business: "Clinica de consultas",
      prompt: buildSyntheticPrompt(
        "CLINICA DE CONSULTAS",
        "O agente agenda consultas, informa preparo basico e coleta nome, convenio, especialidade e melhor horario. Nao faz diagnostico, nao promete cura e orienta emergencia quando houver risco grave.",
        ["[MEDIA:TABELA_CONVENIOS_IMAGEM]", "Nao fazer diagnostico", "Confirmar especialidade antes de oferecer horario"],
      ),
      instruction: "melhore para sempre confirmar especialidade e convenio antes de marcar horario",
      required: ["[MEDIA:TABELA_CONVENIOS_IMAGEM]", "especialidade", "convenio", "Nao fazer diagnostico"],
      protectedLines: ["[MEDIA:TABELA_CONVENIOS_IMAGEM]", "Nao fazer diagnostico"],
    },
    {
      id: "salao-beleza",
      business: "Salao de beleza",
      prompt: buildSyntheticPrompt(
        "SALAO DE BELEZA",
        "Servicos incluem corte, escova, coloracao, manicure e pacotes de noiva. O agente confirma profissional, data, horario, sinal e politica de atraso. Nao agenda dois clientes no mesmo horario.",
        ["[MEDIA:TABELA_SERVICOS_SALAO]", "Confirmar sinal para pacote de noiva", "Nao alterar politica de atraso"],
      ),
      instruction: "adicione uma pergunta para saber se a cliente prefere manha ou tarde antes de listar horarios",
      required: ["[MEDIA:TABELA_SERVICOS_SALAO]", "manha", "tarde", "politica de atraso"],
      protectedLines: ["[MEDIA:TABELA_SERVICOS_SALAO]", "Nao alterar politica de atraso"],
    },
    {
      id: "autopecas-ecommerce",
      business: "Loja de autopecas",
      prompt: buildSyntheticPrompt(
        "LOJA DE AUTOPECAS",
        "O agente vende pecas por SKU, modelo do carro, ano, motorizacao e chassi quando necessario. Deve conferir estoque, compatibilidade e prazo de entrega antes de passar preco final.",
        ["[MEDIA:CATALOGO_AUTOPECAS_PDF]", "Nunca trocar SKU sem confirmar compatibilidade", "Confirmar modelo, ano e motorizacao"],
      ),
      instruction: "deixe mais rigoroso para pedir modelo, ano e motor antes de confirmar a peca",
      required: ["[MEDIA:CATALOGO_AUTOPECAS_PDF]", "modelo", "ano", "motor"],
      protectedLines: ["[MEDIA:CATALOGO_AUTOPECAS_PDF]", "Nunca trocar SKU sem confirmar compatibilidade"],
    },
    {
      id: "curso-online",
      business: "Curso online",
      prompt: buildSyntheticPrompt(
        "CURSO ONLINE",
        "O agente vende curso com modulos, garantia, certificado, bonus e formas de pagamento. Deve identificar objetivo do aluno, nivel atual e prazo desejado antes de oferecer plano.",
        ["[MEDIA:GRADE_CURSO_IMAGEM]", "Nao prometer renda garantida", "Explicar garantia sem inventar prazo"],
      ),
      instruction: "melhore para rebater objeções de preco com valor do certificado e suporte, sem prometer resultado garantido",
      required: ["[MEDIA:GRADE_CURSO_IMAGEM]", "certificado", "suporte", "Nao prometer renda garantida"],
      protectedLines: ["[MEDIA:GRADE_CURSO_IMAGEM]", "Nao prometer renda garantida"],
    },
  ].filter((scenario) => scenario.prompt && scenario.prompt.length > 1000);
  const scenarioFilter = (process.env.PROMPT_BENCH_SCENARIOS || "")
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const maxScenarios = Number(process.env.PROMPT_BENCH_MAX_SCENARIOS || 0);
  const selectedScenarios = scenarios
    .filter((scenario) => scenarioFilter.length === 0 || scenarioFilter.includes(scenario.id))
    .slice(0, maxScenarios > 0 ? maxScenarios : scenarios.length);

  const results = [];
  for (const scenario of selectedScenarios) {
    for (const model of MODELS) {
      const started = Date.now();
      try {
        const output = await callNvidia(model, apiKey, scenario);
        const score = scoreScenario(scenario, output);
        results.push({
          scenario: scenario.id,
          business: scenario.business,
          model,
          ok: true,
          latencyMs: Date.now() - started,
          ...score,
        });
        console.log(`${score.passed ? "PASS" : "FAIL"} ${model} ${scenario.id} ratio=${score.ratio}`);
      } catch (error: any) {
        results.push({
          scenario: scenario.id,
          business: scenario.business,
          model,
          ok: false,
          passed: false,
          latencyMs: Date.now() - started,
          error: String(error?.message || error).slice(0, 500),
        });
        console.log(`ERROR ${model} ${scenario.id}: ${String(error?.message || error).slice(0, 160)}`);
      }
    }
  }

  const summary = MODELS.map((model) => {
    const rows = results.filter((row: any) => row.model === model);
    const completed = rows.filter((row: any) => row.ok);
    const passed = rows.filter((row: any) => row.passed);
    return {
      model,
      calls: rows.length,
      completed: completed.length,
      passed: passed.length,
      passRate: rows.length ? Number((passed.length / rows.length).toFixed(3)) : 0,
      avgLatencyMs: completed.length
        ? Math.round(completed.reduce((sum: number, row: any) => sum + row.latencyMs, 0) / completed.length)
        : null,
    };
  });

  fs.mkdirSync("tmp", { recursive: true });
  const report = {
    createdAt: new Date().toISOString(),
    keySource: source,
    models: MODELS,
    scenarioCount: selectedScenarios.length,
    summary,
    results,
  };
  fs.writeFileSync("tmp/prompt-editor-nvidia-benchmark-20260429.json", JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(
    "tmp/prompt-editor-nvidia-benchmark-20260429.md",
    [
      "# Prompt editor NVIDIA benchmark",
      "",
      `Created: ${report.createdAt}`,
      `Key source: ${source}`,
      "",
      "## Summary",
      "",
      "| Model | Completed | Passed | Pass rate | Avg latency ms |",
      "| --- | ---: | ---: | ---: | ---: |",
      ...summary.map((row) => `| ${row.model} | ${row.completed}/${row.calls} | ${row.passed} | ${row.passRate} | ${row.avgLatencyMs ?? ""} |`),
      "",
      "## Failures",
      "",
      ...results
        .filter((row: any) => !row.passed)
        .map((row: any) => `- ${row.model} / ${row.scenario}: ${row.error || row.missingProtected?.[0] || row.missing?.[0] || "failed guard"}`),
      "",
    ].join("\n"),
    "utf8",
  );
  console.log(JSON.stringify({ summary, report: "tmp/prompt-editor-nvidia-benchmark-20260429.md" }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
