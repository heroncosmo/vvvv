import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const ENV_FILE =
  process.env.PROMPT_BENCH_ENV_FILE ||
  "C:/Users/rodri/Downloads/agentezap/vvvv/_vps_sync_state/backups/before-sync-20260418_021941/.env";

const NVIDIA_MODELS = [
  "deepseek-ai/deepseek-v4-flash",
  "nvidia/nemotron-3-super-120b-a12b",
  "z-ai/glm-5.1",
];

type Scenario = {
  id: string;
  size: "small" | "medium" | "large";
  business: string;
  prompt: string;
  instruction: string;
  clientMessage: string;
  mustPreserve: string[];
  mustAdd: string[];
  agentMustSay: string[];
  agentMustNotSay: string[];
};

type Keys = {
  databaseUrl: string;
  nvidiaApiKey: string;
  mistralApiKey: string;
  mistralModel: string;
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

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function includesAll(text: string, needles: string[]) {
  const normalized = normalize(text);
  return needles.every((needle) => normalized.includes(normalize(needle)));
}

function hasAny(text: string, needles: string[]) {
  const normalized = normalize(text);
  return needles.some((needle) => normalized.includes(normalize(needle)));
}

function hasMojibake(value: string) {
  const text = String(value || "");
  if (/\uFFFD|\b(?:voc\?|n\?o|produ\?\?|cat\?logo|card\?pio|edi\?\?o)\b/i.test(text)) return true;
  for (let index = 0; index < text.length - 1; index += 1) {
    const current = text.charCodeAt(index);
    const next = text.charCodeAt(index + 1);
    if ((current === 0x00c3 || current === 0x00c2) && next >= 0x0080 && next <= 0x00bf) return true;
    if (current === 0x00e2 && (next === 0x20ac || next === 0x0080)) return true;
    if (current === 0x00f0) return true;
  }
  return false;
}

function repeatBlock(title: string, body: string, repeat: number) {
  return Array.from({ length: repeat }, (_item, index) => `## ${title} ${index + 1}\n${body}`).join("\n\n");
}

function buildPrompt(business: string, core: string, protectedLines: string[], repeat: number) {
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
    repeatBlock("Base operacional", core, repeat),
    "",
    "## Saida esperada",
    "Sempre faca uma pergunta objetiva por vez quando faltar informacao.",
    "Nunca invente item, preco, prazo, disponibilidade, agenda ou condicao comercial.",
    "</prompt_final>",
  ].join("\n");
}

async function loadKeys(): Promise<Keys> {
  loadEnv(ENV_FILE);
  const databaseUrl = process.env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("DATABASE_URL ausente");

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query(
      `
        SELECT chave, valor
        FROM system_config
        WHERE chave = ANY($1::text[])
      `,
      [[
        "status_nvidia_api_key",
        "blog_nvidia_api_key",
        "nvidia_api_key",
        "mistral_api_key",
        "mistral_model",
      ]],
    );
    const map = new Map(result.rows.map((row) => [String(row.chave), String(row.valor || "").trim()]));
    return {
      databaseUrl,
      nvidiaApiKey: map.get("status_nvidia_api_key") || map.get("blog_nvidia_api_key") || map.get("nvidia_api_key") || "",
      mistralApiKey: map.get("mistral_api_key") || process.env.MISTRAL_API_KEY || "",
      mistralModel: process.env.PROMPT_QUALITY_MISTRAL_MODEL || map.get("mistral_model") || "mistral-small-latest",
    };
  } finally {
    await client.end();
  }
}

function extractPrompt(raw: string) {
  const text = String(raw || "").trim();
  const match = text.match(/<prompt_final>([\s\S]*?)<\/prompt_final>/i);
  return (match?.[1] || text)
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function callNvidiaEditor(apiKey: string, model: string, scenario: Scenario) {
  const systemPrompt = [
    "Voce e um editor senior de prompts comerciais para WhatsApp.",
    "Aplique a instrucao como uma alteracao localizada e preserve o contexto operacional.",
    "Nao apague midias, catalogo, delivery, agenda, links, placeholders ou regras existentes que nao foram pedidos para remover.",
    "Melhore o prompt para resolver o problema real do cliente, com regra clara e sem duplicidade inutil.",
    "Retorne somente o prompt final completo entre <prompt_final> e </prompt_final>.",
  ].join("\n");

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            `Negocio: ${scenario.business}`,
            `Instrucao: ${scenario.instruction}`,
            "",
            "Itens que devem continuar presentes:",
            scenario.mustPreserve.map((item) => `- ${item}`).join("\n"),
            "",
            "Prompt atual:",
            scenario.prompt,
          ].join("\n"),
        },
      ],
      temperature: 0.05,
      max_tokens: scenario.size === "large" ? 9000 : 5000,
      stream: false,
    }),
    signal: AbortSignal.timeout(75_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `NVIDIA ${response.status}`);
  return extractPrompt(String(data?.choices?.[0]?.message?.content || ""));
}

async function callMistralEditor(apiKey: string, model: string, scenario: Scenario) {
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: [
            "Voce e um editor senior de prompts comerciais para WhatsApp.",
            "Aplique a instrucao como alteracao localizada, preserve regras existentes e retorne somente o prompt final entre tags.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Negocio: ${scenario.business}`,
            `Instrucao: ${scenario.instruction}`,
            "",
            "Itens que devem continuar presentes:",
            scenario.mustPreserve.map((item) => `- ${item}`).join("\n"),
            "",
            "Prompt atual:",
            scenario.prompt,
          ].join("\n"),
        },
      ],
      temperature: 0.05,
      max_tokens: scenario.size === "large" ? 9000 : 5000,
    }),
    signal: AbortSignal.timeout(75_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error?.message || `Mistral ${response.status}`);
  return extractPrompt(String(data?.choices?.[0]?.message?.content || ""));
}

async function callMistralAgent(apiKey: string, model: string, prompt: string, scenario: Scenario) {
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: scenario.clientMessage },
      ],
      temperature: 0.25,
      max_tokens: 420,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error?.message || `Mistral agent ${response.status}`);
  return String(data?.choices?.[0]?.message?.content || "").trim();
}

function evaluateEditedPrompt(scenario: Scenario, editedPrompt: string) {
  const ratio = editedPrompt.length / Math.max(1, scenario.prompt.length);
  const preserveScore = scenario.mustPreserve.filter((item) => includesAll(editedPrompt, [item])).length;
  const addScore = scenario.mustAdd.filter((item) => includesAll(editedPrompt, [item])).length;
  const tooShort = scenario.prompt.length > 5000 && ratio < 0.72;
  const tooLong = ratio > 1.85;
  const chatPreamble = /^\s*(claro|entendi|segue|aqui esta)/i.test(editedPrompt.slice(0, 120));
  const broken = hasMojibake(editedPrompt);
  const score =
    preserveScore * 10 +
    addScore * 12 -
    (tooShort ? 30 : 0) -
    (tooLong ? 10 : 0) -
    (chatPreamble ? 20 : 0) -
    (broken ? 40 : 0);
  return {
    ratio: Number(ratio.toFixed(3)),
    preserveScore,
    preserveTotal: scenario.mustPreserve.length,
    addScore,
    addTotal: scenario.mustAdd.length,
    tooShort,
    tooLong,
    chatPreamble,
    mojibake: broken,
    promptScore: score,
  };
}

function evaluateAgentAnswer(scenario: Scenario, answer: string) {
  const mustSay = scenario.agentMustSay.filter((item) => includesAll(answer, [item])).length;
  const forbidden = hasAny(answer, scenario.agentMustNotSay);
  const invented = /nao informado|nao consta|inventei/i.test(answer);
  return {
    answer: answer.slice(0, 240),
    mustSay,
    mustSayTotal: scenario.agentMustSay.length,
    forbidden,
    invented,
    agentScore: mustSay * 15 - (forbidden ? 30 : 0) - (invented ? 20 : 0),
  };
}

async function main() {
  const keys = await loadKeys();
  if (!keys.nvidiaApiKey) throw new Error("NVIDIA key ausente");
  if (!keys.mistralApiKey) throw new Error("Mistral key ausente");

  const marcelPromptPath = path.join("tmp", "marcel-current-prompt-20260429.txt");
  const marcelPrompt = fs.existsSync(marcelPromptPath) ? fs.readFileSync(marcelPromptPath, "utf8") : "";
  const scenarios: Scenario[] = [
    {
      id: "small-pizzaria-cardapio",
      size: "small",
      business: "Pizzaria pequena",
      prompt: buildPrompt("PIZZARIA BELLA", "Cardapio com pizzas, bebidas e entrega. Envie [MEDIA:CARDAPIO_PIZZARIA] quando o cliente pedir cardapio.", ["[MEDIA:CARDAPIO_PIZZARIA]", "Confirmar pedido antes de finalizar"], 1),
      instruction: "Na primeira mensagem envie o cardapio em imagem e chame pelo nome se souber.",
      clientMessage: "Oi, sou Ana, quero pedir pizza",
      mustPreserve: ["[MEDIA:CARDAPIO_PIZZARIA]", "Confirmar pedido"],
      mustAdd: ["primeira mensagem", "cardapio", "nome"],
      agentMustSay: ["Ana", "cardapio"],
      agentMustNotSay: ["nao tenho cardapio", "procure no site"],
    },
    {
      id: "small-clinica-remarcar",
      size: "small",
      business: "Clinica",
      prompt: buildPrompt("CLINICA VIDA", "Agende consultas. Confirme data, horario, especialidade e convenio.", ["Nao diagnosticar", "Confirmar data e horario"], 1),
      instruction: "Antes de confirmar agendamento, avise que se nao puder comparecer precisa remarcar.",
      clientMessage: "Quero consulta amanha as 9",
      mustPreserve: ["Nao diagnosticar", "Confirmar data e horario"],
      mustAdd: ["remarcar", "comparecer"],
      agentMustSay: ["remarcar", "9"],
      agentMustNotSay: ["diagnostico", "garantido"],
    },
    {
      id: "small-autopecas-compatibilidade",
      size: "small",
      business: "Autopecas",
      prompt: buildPrompt("AUTOPECAS PRIME", "Venda por SKU, modelo, ano e motorizacao. Confira estoque antes de preco final.", ["Conferir compatibilidade", "Nao inventar estoque"], 1),
      instruction: "Sempre confirme ano, modelo e motor antes de dizer que a peca serve.",
      clientMessage: "Tem pastilha de freio do Corolla?",
      mustPreserve: ["Nao inventar estoque", "Conferir compatibilidade"],
      mustAdd: ["ano", "modelo", "motor"],
      agentMustSay: ["ano", "modelo"],
      agentMustNotSay: ["serve sim", "tenho em estoque"],
    },
    {
      id: "medium-imobiliaria-financiamento",
      size: "medium",
      business: "Imobiliaria",
      prompt: buildPrompt("IMOBILIARIA ALPHA", "Catalogo de imoveis com codigo, bairro, valor, metragem e fotos. Nunca invente disponibilidade.", ["[MEDIA:CATALOGO_IMOVEIS]", "Preservar codigos dos imoveis", "Confirmar faixa de preco antes de visita"], 8),
      instruction: "Quando o cliente pedir financiamento, confirme renda, entrada e cidade antes de simular.",
      clientMessage: "Quero financiar uma casa",
      mustPreserve: ["[MEDIA:CATALOGO_IMOVEIS]", "Preservar codigos", "faixa de preco"],
      mustAdd: ["financiamento", "renda", "entrada", "cidade"],
      agentMustSay: ["renda", "entrada", "cidade"],
      agentMustNotSay: ["aprovado", "credito garantido"],
    },
    {
      id: "medium-escola-matricula",
      size: "medium",
      business: "Escola de cursos",
      prompt: buildPrompt("CURSOS PRO", "Venda cursos livres. Preserve turmas, valores, horarios e certificado. Nunca prometa emprego.", ["[MEDIA:GRADE_CURSOS]", "Nao prometer emprego", "Confirmar turma"], 8),
      instruction: "Antes de mandar link de matricula, confirme curso desejado, turno e forma de pagamento.",
      clientMessage: "Quero me matricular",
      mustPreserve: ["[MEDIA:GRADE_CURSOS]", "Nao prometer emprego", "Confirmar turma"],
      mustAdd: ["curso desejado", "turno", "forma de pagamento"],
      agentMustSay: ["curso", "turno"],
      agentMustNotSay: ["emprego garantido"],
    },
    {
      id: "medium-delivery-troco",
      size: "medium",
      business: "Delivery",
      prompt: buildPrompt("BURGUER DELIVERY", "Receba pedidos por delivery. Confirme endereco, forma de pagamento, itens e taxa.", ["Delivery 2.0", "Confirmar endereco", "Nao alterar cardapio"], 8),
      instruction: "Se o pagamento for dinheiro, pergunte se precisa de troco antes de finalizar.",
      clientMessage: "Vou pagar em dinheiro",
      mustPreserve: ["Delivery 2.0", "Confirmar endereco", "Nao alterar cardapio"],
      mustAdd: ["dinheiro", "troco"],
      agentMustSay: ["troco"],
      agentMustNotSay: ["pedido finalizado"],
    },
    {
      id: "large-marcel-cardapio",
      size: "large",
      business: "Pizzaria Marcel",
      prompt: marcelPrompt,
      instruction: "Na primeira mensagem envie sempre a imagem do cardapio junto com a saudacao, sem remover Delivery 2.0.",
      clientMessage: "Oi, sou Carlos, quero ver o cardapio",
      mustPreserve: ["DELIVERY 2.0", "BLOQUEIO CRITICO DE CATALOGO", "pedido"],
      mustAdd: ["primeira mensagem", "imagem", "cardapio"],
      agentMustSay: ["Carlos", "cardapio"],
      agentMustNotSay: ["nao tenho cardapio"],
    },
    {
      id: "large-juridico-triagem",
      size: "large",
      business: "Juridico",
      prompt: buildPrompt("ADVOCACIA LEX", "Triar area juridica, cidade, urgencia e documentos. Nao dar parecer definitivo. Oferecer consulta.", ["Nao prometer resultado", "Preservar sigilo", "Confirmar area juridica"], 18),
      instruction: "Quando parecer caso trabalhista, pergunte se ainda esta empregado e quando foi a demissao.",
      clientMessage: "Fui mandado embora e quero meus direitos",
      mustPreserve: ["Nao prometer resultado", "Preservar sigilo", "Confirmar area juridica"],
      mustAdd: ["trabalhista", "empregado", "demissao"],
      agentMustSay: ["empregado", "demissao"],
      agentMustNotSay: ["causa ganha", "resultado garantido"],
    },
    {
      id: "large-salao-agenda",
      size: "large",
      business: "Salao",
      prompt: buildPrompt("SALAO BELLE", "Agende servicos de beleza. Preserve servicos, duracao, profissionais e horarios. Nao encaixar sem disponibilidade.", ["Confirmar profissional", "Confirmar horario", "Nao inventar disponibilidade"], 18),
      instruction: "Antes de confirmar, pergunte se a cliente aceita outro profissional caso o preferido nao tenha horario.",
      clientMessage: "Quero fazer cabelo com a Paula sexta",
      mustPreserve: ["Confirmar profissional", "Confirmar horario", "Nao inventar disponibilidade"],
      mustAdd: ["outro profissional", "preferido", "horario"],
      agentMustSay: ["Paula", "outro profissional"],
      agentMustNotSay: ["confirmado", "tem horario"],
    },
    {
      id: "large-provider-orcamento",
      size: "large",
      business: "Assistencia tecnica",
      prompt: buildPrompt("TECH REPAROS", "Atenda assistencia tecnica. Triar aparelho, defeito, tempo de uso, garantia e bairro. Nao passar orcamento final sem avaliar.", ["Nao prometer conserto", "Nao passar preco final", "Confirmar aparelho"], 18),
      instruction: "Quando pedirem preco, explique que precisa avaliar o defeito e peca foto ou descricao detalhada.",
      clientMessage: "Quanto fica para arrumar meu celular?",
      mustPreserve: ["Nao prometer conserto", "Nao passar preco final", "Confirmar aparelho"],
      mustAdd: ["avaliar", "defeito", "foto"],
      agentMustSay: ["defeito", "foto"],
      agentMustNotSay: ["fica R$", "preco final"],
    },
  ].filter((scenario) => scenario.prompt.trim().length > 0);

  const allModelRunners = [
    ...NVIDIA_MODELS.map((model) => ({
      id: model,
      run: (scenario: Scenario) => callNvidiaEditor(keys.nvidiaApiKey, model, scenario),
    })),
    {
      id: `mistral/${keys.mistralModel}`,
      run: (scenario: Scenario) => callMistralEditor(keys.mistralApiKey, keys.mistralModel, scenario),
    },
  ];
  const only = (process.env.PROMPT_QUALITY_ONLY || "").split(/[,;]+/g).map((item) => item.trim()).filter(Boolean);
  const modelRunners = only.length
    ? allModelRunners.filter((runner) => only.some((needle) => runner.id.includes(needle)))
    : allModelRunners;

  const rows: any[] = [];
  for (const runner of modelRunners) {
    for (const scenario of scenarios) {
      const started = Date.now();
      try {
        const editedPrompt = await runner.run(scenario);
        const promptEval = evaluateEditedPrompt(scenario, editedPrompt);
        const answer = await callMistralAgent(keys.mistralApiKey, keys.mistralModel, editedPrompt, scenario);
        const agentEval = evaluateAgentAnswer(scenario, answer);
        const totalScore = promptEval.promptScore + agentEval.agentScore;
        rows.push({
          model: runner.id,
          scenario: scenario.id,
          size: scenario.size,
          ok: promptEval.preserveScore === promptEval.preserveTotal &&
            promptEval.addScore === promptEval.addTotal &&
            agentEval.mustSay === agentEval.mustSayTotal &&
            !promptEval.tooShort &&
            !promptEval.mojibake &&
            !agentEval.forbidden,
          latencyMs: Date.now() - started,
          totalScore,
          ...promptEval,
          ...agentEval,
        });
        console.log(`DONE ${runner.id} ${scenario.id} score=${totalScore}`);
      } catch (error: any) {
        rows.push({
          model: runner.id,
          scenario: scenario.id,
          size: scenario.size,
          ok: false,
          latencyMs: Date.now() - started,
          error: error?.message || String(error),
          totalScore: -100,
        });
        console.log(`FAIL ${runner.id} ${scenario.id}: ${error?.message || error}`);
      }
    }
  }

  const summary = modelRunners.map((runner) => {
    const modelRows = rows.filter((row) => row.model === runner.id);
    const okRows = modelRows.filter((row) => row.ok);
    return {
      model: runner.id,
      calls: modelRows.length,
      ok: okRows.length,
      passRate: Number((okRows.length / Math.max(1, modelRows.length)).toFixed(2)),
      avgScore: Number((modelRows.reduce((sum, row) => sum + (row.totalScore || 0), 0) / Math.max(1, modelRows.length)).toFixed(1)),
      avgLatencyMs: Math.round(modelRows.reduce((sum, row) => sum + (row.latencyMs || 0), 0) / Math.max(1, modelRows.length)),
    };
  }).sort((left, right) => right.passRate - left.passRate || right.avgScore - left.avgScore || left.avgLatencyMs - right.avgLatencyMs);

  const report = [
    "# Prompt editor quality benchmark",
    "",
    `Date: ${new Date().toISOString()}`,
    `Scenarios: ${scenarios.length}`,
    `Agent simulation model: ${keys.mistralModel}`,
    "",
    "## Summary",
    "",
    "| Model | OK | Pass rate | Avg score | Avg latency ms |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...summary.map((row) => `| ${row.model} | ${row.ok}/${row.calls} | ${row.passRate} | ${row.avgScore} | ${row.avgLatencyMs} |`),
    "",
    "## Failed rows",
    "",
    ...rows
      .filter((row) => !row.ok)
      .map((row) => `- ${row.model} / ${row.scenario}: score=${row.totalScore}, error=${row.error || ""}, preserve=${row.preserveScore ?? ""}/${row.preserveTotal ?? ""}, add=${row.addScore ?? ""}/${row.addTotal ?? ""}, agent=${row.mustSay ?? ""}/${row.mustSayTotal ?? ""}, forbidden=${row.forbidden ?? ""}, answer=${JSON.stringify(row.answer || "")}`),
  ].join("\n");

  fs.mkdirSync("tmp", { recursive: true });
  fs.writeFileSync("tmp/prompt-editor-quality-benchmark-20260429.json", JSON.stringify({ summary, rows }, null, 2));
  fs.writeFileSync("tmp/prompt-editor-quality-benchmark-20260429.md", report);
  console.log(report);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
