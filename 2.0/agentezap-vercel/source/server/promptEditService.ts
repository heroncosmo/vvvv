import { z } from "zod";
import { editPrompt as editPromptWithEngine } from "./promptEditEngine";
import { runWebOnlyCodexPromptTextForUser } from "../api/http";

export interface Edicao {
  buscar: string;
  substituir: string;
}

export interface RespostaIA {
  resposta_chat: string;
  operacao: "nenhuma" | "editar";
  edicoes: Edicao[];
}

export interface ResultadoEdicao {
  success: boolean;
  novoPrompt: string;
  mensagemChat: string;
  edicoesAplicadas: number;
  edicoesFalharam: number;
  detalhes: {
    buscar: string;
    substituir: string;
    status: "aplicada" | "falhou";
    matchType?: "exato" | "fuzzy";
  }[];
}

interface PromptSection {
  id: string;
  title: string;
  content: string;
  startIndex: number;
  endIndex: number;
  order: number;
}

interface PromptEditOptions {
  onProgress?: (message: string) => void;
  userId?: string;
  conversationId?: string;
}

function resolvePromptEditCodexCliTimeoutMs(): number {
  const value = Number(process.env.PROMPT_EDIT_CODEX_CLI_TIMEOUT_MS || "");
  const requested = Number.isFinite(value) && value >= 30_000 ? Math.floor(value) : 90_000;
  return Math.max(30_000, Math.min(requested, 180_000));
}

function buildPromptEditLlmRuntime(options?: PromptEditOptions) {
  const userId = String(options?.userId || "").trim();
  if (!userId) {
    return {};
  }
  return {
    userId,
    conversationId: String(options?.conversationId || `prompt-edit:${userId}`).trim(),
    timeoutMs: resolvePromptEditCodexCliTimeoutMs(),
  };
}

async function runPromptEditCodexTextTask(input: {
  taskName: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
  options?: PromptEditOptions;
  contextArtifacts?: Record<string, unknown>;
}): Promise<string> {
  const userId = String(input.options?.userId || "").trim();
  if (!userId) {
    throw new Error(`Codex exige userId/contexto do tenant em ${input.taskName}`);
  }

  const raw = await runWebOnlyCodexPromptTextForUser({
    userId,
    task: input.taskName,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userMessage },
    ],
    message: input.userMessage,
    conversationId: input.options?.conversationId || `prompt-edit:${userId}:${input.taskName}`,
    contactName: "Personalize IA",
    maxTokens: input.maxTokens,
    timeoutMs: resolvePromptEditCodexCliTimeoutMs(),
    contextArtifacts: {
      channel: "prompt_edit_service",
      taskName: input.taskName,
      ...(input.contextArtifacts || {}),
    },
  });

  return String(raw || "").trim();
}

export interface PromptEditInstructionCheck {
  applied: boolean;
  missingLiteralRequirements: string[];
  feedbackMessage: string;
}

interface ExplicitTriggerResponseRule {
  trigger: string;
  response: string;
}

const plannerSchema = z.object({
  resposta_chat: z.string().min(1).max(320),
  objective: z.string().min(1).max(220),
  editScope: z.enum(["none", "targeted", "broad"]),
  sectionIds: z.array(z.string().min(1)).max(12),
  writerInstructions: z.array(z.string().min(1)).min(1).max(10),
  preserveDirectives: z.array(z.string().min(1)).max(8).default([]),
});

const rewriteSchema = z.object({
  resposta_chat: z.string().min(1).max(320),
  edits: z.array(
    z.object({
      sectionId: z.string().min(1),
      updatedContent: z.string().min(1),
      summary: z.string().min(1).max(200),
    }),
  ).min(1).max(6),
});

const fullRewriteSchema = z.object({
  resposta_chat: z.string().min(1).max(320),
  summary: z.string().min(1).max(220),
  updatedPrompt: z.string().min(1),
});

const explicitLiteralCuePhrases = [
  "literal exatamente assim:",
  "linha interna literal exatamente assim:",
  "linha final de marcador interno para ficar exatamente assim:",
  "ficar exatamente assim:",
  "exatamente assim:",
  "texto literal:",
];

function dedupeStringList(items: string[]): string[] {
  const unique: string[] = [];

  for (const item of items) {
    if (!item || unique.includes(item)) {
      continue;
    }

    unique.push(item);
  }

  return unique;
}

function isQuoteChar(char: string): boolean {
  return char === '"' || char === "'" || char === "“" || char === "”" || char === "‘" || char === "’";
}

function trimWrappingQuoteChars(value: string): string {
  let result = value.trim();

  while (result.length >= 2 && isQuoteChar(result[0]) && isQuoteChar(result[result.length - 1])) {
    result = result.slice(1, -1).trim();
  }

  return result;
}

function findNearestStopIndex(text: string, fromIndex: number): number {
  const normalized = text.toLocaleLowerCase("pt-BR");
  const stopPhrases = [
    "\npreserve",
    "\nmantenha",
    "\nsem ",
    "\nnao ",
    "\nnão ",
    " preserve todo o restante",
    " preserve todo o resto",
    " preserve regras",
    " preserve modulos",
    " preserve fluxos",
    " mantenha ",
    " sem mudar",
    " sem alter",
    " sem mexer",
  ];

  let endIndex = text.length;

  for (const phrase of stopPhrases) {
    const foundIndex = normalized.indexOf(phrase, fromIndex);
    if (foundIndex !== -1 && foundIndex < endIndex) {
      endIndex = foundIndex;
    }
  }

  return endIndex;
}

function collectQuotedSegments(text: string, minLength = 6): string[] {
  const candidates: string[] = [];
  let currentQuote = "";
  let currentValue = "";

  for (const char of text) {
    if (!currentQuote) {
      if (isQuoteChar(char)) {
        currentQuote = char === "“" ? "”" : char === "‘" ? "’" : char;
        currentValue = "";
      }
      continue;
    }

    if (char === currentQuote) {
      const normalizedValue = trimWrappingQuoteChars(currentValue);
      if (normalizedValue.length >= minLength) {
        candidates.push(normalizedValue);
      }
      currentQuote = "";
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  return candidates;
}

function extractRequiredLiteralCandidates(instruction: string): string[] {
  const originalInstruction = String(instruction || "");
  const normalizedInstruction = originalInstruction.toLocaleLowerCase("pt-BR");
  const candidates: string[] = [];

  for (const cue of explicitLiteralCuePhrases) {
    const cueIndex = normalizedInstruction.indexOf(cue);
    if (cueIndex === -1) {
      continue;
    }

    let cursor = cueIndex + cue.length;
    while (cursor < originalInstruction.length) {
      const char = originalInstruction[cursor];
      if (char !== " " && char !== "\t" && char !== "\n" && char !== "\r") {
        break;
      }
      cursor += 1;
    }

    const endIndex = findNearestStopIndex(originalInstruction, cursor);
    const literalTail = trimWrappingQuoteChars(originalInstruction.slice(cursor, endIndex).trim());
    if (literalTail.length >= 6) {
      candidates.push(literalTail);
    }

    const windowEnd = Math.min(originalInstruction.length, endIndex);
    const nearbyQuotedSegments = collectQuotedSegments(originalInstruction.slice(cursor, windowEnd));
    candidates.push(...nearbyQuotedSegments);
  }

  return dedupeStringList(candidates);
}

function normalizeSingleLinePromptText(value: string): string {
  return normalizePrompt(value).replace(/\s+/g, " ").trim();
}

function extractExplicitTriggerResponseRule(instruction: string): ExplicitTriggerResponseRule | null {
  const originalInstruction = String(instruction || "").trim();
  const normalizedInstruction = normalizeStyleInstruction(originalInstruction);
  if (!originalInstruction || !normalizedInstruction) {
    return null;
  }

  const triggerCues = [
    "quando",
    "se o cliente",
    "cliente escrever",
    "cliente disser",
    "cliente falar",
    "cliente perguntar",
    "cliente enviar",
  ];
  const responseCues = [
    "responda",
    "responder",
    "diga",
    "fale",
    "retorne",
    "envie",
    "mande",
    "exatamente",
  ];

  if (!includesCue(normalizedInstruction, triggerCues) || !includesCue(normalizedInstruction, responseCues)) {
    return null;
  }

  const quotedSegments = collectQuotedSegments(originalInstruction, 2)
    .map((segment) => normalizeSingleLinePromptText(segment))
    .filter(Boolean);

  if (quotedSegments.length < 2) {
    return null;
  }

  const trigger = quotedSegments[0];
  const response = quotedSegments[quotedSegments.length - 1];
  if (!trigger || !response || trigger === response) {
    return null;
  }

  return { trigger, response };
}

function instructionRequestsLiteralAtEnd(instruction: string): boolean {
  const normalized = String(instruction || "").toLocaleLowerCase("pt-BR");
  const endCues = [
    "linha final",
    "ao final do prompt",
    "final do prompt",
    "no final do prompt",
    "adicione ao final",
    "atualize a linha final",
  ];

  return endCues.some((cue) => normalized.includes(cue));
}

function includesCue(normalizedInstruction: string, cues: string[]): boolean {
  for (const cue of cues) {
    if (normalizedInstruction.includes(cue)) {
      return true;
    }
  }

  return false;
}

function shouldPreferDirectPromptRewrite(
  instruction: string,
  literalRequirements: string[],
): boolean {
  const normalizedInstruction = String(instruction || "").toLocaleLowerCase("pt-BR");
  const preserveCues = [
    "preserve",
    "mantenha",
    "sem mudar",
    "sem mexer",
    "apenas",
    "somente",
    "todo o restante",
    "tudo igual",
  ];
  const conciseStyleCues = [
    "mais curto",
    "mais curta",
    "mais curtas",
    "mais direto",
    "mais direta",
    "mais diretas",
    "mais objetivo",
    "mais objetiva",
    "mais objetivo",
    "mais concisa",
    "mais conciso",
    "mais profissional",
    "mais formal",
    "redacao mais",
    "redacao",
    "linguagem mais",
    "tom geral",
    "tom mais",
    "estilo",
    "enxuto",
    "secas",
    "claras",
  ];

  if (
    literalRequirements.length > 0 &&
    instructionRequestsLiteralAtEnd(instruction) &&
    includesCue(normalizedInstruction, preserveCues)
  ) {
    return true;
  }

  return includesCue(normalizedInstruction, preserveCues) && includesCue(normalizedInstruction, conciseStyleCues);
}

type QuickStyleEdit = {
  key: "formal" | "concise" | "sales";
  summary: string;
  lines: string[];
};

const STYLE_DIRECTIVE_HEADING = "## Diretriz de estilo da IA";
const BEHAVIOR_DIRECTIVE_HEADING = "## Regras especificas adicionadas pela IA";
const BEHAVIOR_PRESERVE_DIRECTIVE =
  "- Preserve todas as demais regras de negocio, midias, funil, limites, integracoes e contexto ja configurados.";

function normalizeStyleInstruction(instruction: string): string {
  return String(instruction || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function resolveQuickStyleEdit(instruction: string): QuickStyleEdit | null {
  const normalized = normalizeStyleInstruction(instruction);
  if (!normalized) return null;

  if (
    normalized.includes("mais formal") ||
    normalized.includes("tom formal") ||
    normalized.includes("formal e profissional")
  ) {
    return {
      key: "formal",
      summary: "Diretriz de tom formal e profissional aplicada.",
      lines: [
        "Responda com tom mais formal e profissional, mantendo cordialidade e clareza.",
        "Evite girias, excesso de informalidade e promessas que nao estejam nas regras do prompt.",
        "Preserve todas as regras de negocio, valores, midias, fluxo e limitacoes ja configuradas.",
      ],
    };
  }

  if (
    normalized.includes("mais curto") ||
    normalized.includes("mais curta") ||
    normalized.includes("mais curtas") ||
    normalized.includes("mais direto") ||
    normalized.includes("mais direta")
  ) {
    return {
      key: "concise",
      summary: "Diretriz de respostas curtas e diretas aplicada.",
      lines: [
        "Priorize respostas curtas, diretas e faceis de entender.",
        "Faca uma pergunta por vez quando precisar coletar dados do cliente.",
        "Preserve regras, valores, midias, funil e limites ja configurados no prompt.",
      ],
    };
  }

  if (
    normalized.includes("mais vendedor") ||
    normalized.includes("tecnicas de vendas") ||
    normalized.includes("persuas")
  ) {
    return {
      key: "sales",
      summary: "Diretriz comercial consultiva aplicada.",
      lines: [
        "Use linguagem comercial consultiva, conectando o produto ou servico a necessidade do cliente.",
        "Conduza para o proximo passo com perguntas simples e naturais, sem pressionar.",
        "Preserve todas as regras de negocio, valores, midias, fluxo e limitacoes ja configuradas.",
      ],
    };
  }

  return null;
}

function buildStyleDirectiveBlock(edit: QuickStyleEdit): string[] {
  return [
    STYLE_DIRECTIVE_HEADING,
    ...edit.lines.map((line) => `- ${line}`),
  ];
}

function buildExplicitTriggerResponseLine(rule: ExplicitTriggerResponseRule): string {
  return `- Quando o cliente disser "${rule.trigger}", responda exatamente: "${rule.response}".`;
}

function upsertExplicitTriggerResponseDirective(
  prompt: string,
  rule: ExplicitTriggerResponseRule,
): string {
  const normalizedPrompt = normalizePrompt(prompt).trimEnd();
  const ruleLine = buildExplicitTriggerResponseLine(rule);

  if (normalizedPrompt.includes(rule.trigger) && normalizedPrompt.includes(rule.response)) {
    return normalizedPrompt;
  }

  const lines = normalizedPrompt.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === BEHAVIOR_DIRECTIVE_HEADING);

  if (startIndex === -1) {
    return `${normalizedPrompt}\n\n${BEHAVIOR_DIRECTIVE_HEADING}\n${ruleLine}\n${BEHAVIOR_PRESERVE_DIRECTIVE}`.trim();
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith("## ") && line !== BEHAVIOR_DIRECTIVE_HEADING) {
      endIndex = index;
      break;
    }
  }

  const blockLines = lines.slice(startIndex, endIndex).map((line) => line.trim());
  const additions = [ruleLine];
  if (!blockLines.includes(BEHAVIOR_PRESERVE_DIRECTIVE)) {
    additions.push(BEHAVIOR_PRESERVE_DIRECTIVE);
  }

  const updatedLines = [
    ...lines.slice(0, endIndex),
    ...additions,
    ...lines.slice(endIndex),
  ];
  return updatedLines.join("\n").trim();
}

function applyDeterministicExplicitTriggerResponseEdit(
  promptAtual: string,
  instrucaoUsuario: string,
): ResultadoEdicao | null {
  const rule = extractExplicitTriggerResponseRule(instrucaoUsuario);
  if (!rule) return null;

  const novoPrompt = upsertExplicitTriggerResponseDirective(promptAtual, rule);
  const promptOriginal = normalizePrompt(promptAtual).trim();
  if (!novoPrompt || novoPrompt === promptOriginal) {
    return null;
  }

  return {
    success: true,
    novoPrompt,
    mensagemChat: "Alteracoes aplicadas com inteligencia artificial",
    edicoesAplicadas: 1,
    edicoesFalharam: 0,
    detalhes: [
      {
        buscar: BEHAVIOR_DIRECTIVE_HEADING,
        substituir: `Regra adicionada para responder "${rule.response}" quando o cliente disser "${rule.trigger}".`,
        status: "aplicada",
        matchType: "exato",
      },
    ],
  };
}

function upsertQuickStyleDirective(prompt: string, edit: QuickStyleEdit): string {
  const normalizedPrompt = normalizePrompt(prompt).trimEnd();
  const lines = normalizedPrompt.split(/\r?\n/);
  const directiveBlock = buildStyleDirectiveBlock(edit);
  const startIndex = lines.findIndex((line) => line.trim() === STYLE_DIRECTIVE_HEADING);

  if (startIndex === -1) {
    return `${normalizedPrompt}\n\n${directiveBlock.join("\n")}`.trim();
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith("## ") && line !== STYLE_DIRECTIVE_HEADING) {
      endIndex = index;
      break;
    }
  }

  const updatedLines = [
    ...lines.slice(0, startIndex),
    ...directiveBlock,
    ...lines.slice(endIndex),
  ];
  return updatedLines.join("\n").trim();
}

function applyDeterministicQuickStyleEdit(
  promptAtual: string,
  instrucaoUsuario: string,
): ResultadoEdicao | null {
  const edit = resolveQuickStyleEdit(instrucaoUsuario);
  if (!edit) return null;

  const novoPrompt = upsertQuickStyleDirective(promptAtual, edit);
  const promptOriginal = normalizePrompt(promptAtual).trim();
  if (!novoPrompt || novoPrompt === promptOriginal) {
    return null;
  }

  return {
    success: true,
    novoPrompt,
    mensagemChat: "Alteracoes aplicadas com inteligencia artificial",
    edicoesAplicadas: 1,
    edicoesFalharam: 0,
    detalhes: [
      {
        buscar: STYLE_DIRECTIVE_HEADING,
        substituir: edit.summary,
        status: "aplicada",
        matchType: "exato",
      },
    ],
  };
}

function extractLiteralLabel(literal: string): string | null {
  const normalized = String(literal || "").trim();
  const colonIndex = normalized.indexOf(":");
  if (colonIndex <= 0) {
    return null;
  }

  const label = normalized.slice(0, colonIndex).trim();
  return label || null;
}

export function validatePromptInstructionApplication(
  promptAntes: string,
  promptDepois: string,
  instrucaoUsuario: string,
): PromptEditInstructionCheck {
  const promptOriginal = normalizePrompt(promptAntes).trim();
  const promptAtualizado = normalizePrompt(promptDepois).trim();
  const instruction = String(instrucaoUsuario || "").trim();

  if (looksLikePromptRuntimeResponseEnvelope(promptAtualizado)) {
    return {
      applied: false,
      missingLiteralRequirements: [],
      feedbackMessage: "A edicao retornou uma resposta do agente em vez do prompt final.",
    };
  }

  if (!promptAtualizado || promptAtualizado === promptOriginal) {
    return {
      applied: false,
      missingLiteralRequirements: [],
      feedbackMessage: "A edicao nao alterou o prompt final.",
    };
  }

  const explicitRule = extractExplicitTriggerResponseRule(instruction);
  if (explicitRule) {
    const missingExplicitRequirements = [
      !promptAtualizado.includes(explicitRule.trigger) ? explicitRule.trigger : "",
      !promptAtualizado.includes(explicitRule.response) ? explicitRule.response : "",
    ].filter(Boolean);

    if (missingExplicitRequirements.length > 0) {
      return {
        applied: false,
        missingLiteralRequirements: missingExplicitRequirements,
        feedbackMessage:
          `A edicao nao manteve a regra explicita de gatilho/resposta: ${missingExplicitRequirements.join(" | ")}`,
      };
    }
  }

  const literalRequirements = extractRequiredLiteralCandidates(instruction);
  const missingLiteralRequirements = literalRequirements.filter((candidate) => !promptAtualizado.includes(candidate));

  if (missingLiteralRequirements.length > 0) {
    return {
      applied: false,
      missingLiteralRequirements,
      feedbackMessage: `A edicao gerada nao manteve requisitos literais obrigatorios: ${missingLiteralRequirements.join(" | ")}`,
    };
  }

  if (instructionRequestsLiteralAtEnd(instruction) && literalRequirements.length > 0) {
    const finalLines = promptAtualizado
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const trailingLines = finalLines.slice(-literalRequirements.length);
    const endsWithLiteralRequirements = literalRequirements.every(
      (literal, index) => trailingLines[index] === literal,
    );

    if (!endsWithLiteralRequirements) {
      return {
        applied: false,
        missingLiteralRequirements: [],
        feedbackMessage: "A edicao nao terminou com a linha literal obrigatoria no final do prompt.",
      };
    }
  }

  return {
    applied: true,
    missingLiteralRequirements: [],
    feedbackMessage: "A edicao atendeu os requisitos literais verificados.",
  };
}

function buildRejectedPromptEditResult(
  promptAtual: string,
  feedbackMessage: string,
  detalhes: ResultadoEdicao["detalhes"] = [],
): ResultadoEdicao {
  return {
    success: false,
    novoPrompt: promptAtual,
    mensagemChat: feedbackMessage,
    edicoesAplicadas: 0,
    edicoesFalharam: Math.max(1, detalhes.length || 0),
    detalhes,
  };
}

function emitProgress(options: PromptEditOptions | undefined, message: string): void {
  console.log(`[EditService] ${message}`);
  options?.onProgress?.(message);
}

async function repairPlainTextPromptRewrite(
  promptGerado: string,
  promptAtual: string,
  instrucaoUsuario: string,
  literalRequirements: string[],
  options?: PromptEditOptions,
): Promise<string | null> {
  emitProgress(options, "A reescrita direta ficou quase pronta. Corrigindo os requisitos literais finais.");

  const mustEndWithLiteral = instructionRequestsLiteralAtEnd(instrucaoUsuario);
  const repairedRaw = await runPromptEditCodexTextTask({
    taskName: "prompt_edit_literal_repair",
    systemPrompt: [
      "Voce corrige um prompt final que ficou quase certo.",
      "Mantenha tudo que ja estiver correto.",
      "Ajuste somente o necessario para garantir que os requisitos literais aparecam exatamente como pedidos.",
      mustEndWithLiteral
        ? "Se a instrucao mencionar linha final ou final do prompt, termine o prompt exatamente com a linha literal obrigatoria, sem adicionar nada depois."
        : "Insira os literais obrigatorios sem remover o restante do contexto.",
      "Retorne somente o prompt final completo entre as tags <prompt_final> e </prompt_final>.",
    ].join("\n"),
    userMessage: [
      `Instrucao original: ${String(instrucaoUsuario || "").trim()}`,
      "",
      "Prompt atual oficial:",
      normalizePrompt(promptAtual),
      "",
      "Rascunho gerado que precisa ser corrigido:",
      normalizePrompt(promptGerado),
      "",
      "Requisitos literais obrigatorios:",
      ...literalRequirements.map((literal) => `- ${literal}`),
    ].join("\n"),
    maxTokens: 7000,
    options,
    contextArtifacts: {
      literalRequirements,
      mustEndWithLiteral,
    },
  });
  const repairedPrompt = normalizePrompt(extractPromptFromPlainTextRewriteResponse(repairedRaw) || "").trim();
  return repairedPrompt || null;
}

function enforceLiteralRequirementsAsFinalLines(
  promptGerado: string,
  instrucaoUsuario: string,
  literalRequirements: string[],
  options?: PromptEditOptions,
): string {
  if (!instructionRequestsLiteralAtEnd(instrucaoUsuario) || literalRequirements.length === 0) {
    return normalizePrompt(promptGerado).trim();
  }

  let lines = normalizePrompt(promptGerado)
    .split("\n")
    .map((line) => line.replace("\r", ""));

  while (lines.length > 0 && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  for (const literal of literalRequirements) {
    const normalizedLiteral = String(literal || "").trim();
    if (!normalizedLiteral) {
      continue;
    }

    const label = extractLiteralLabel(normalizedLiteral);
    const filteredLines: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine === normalizedLiteral) {
        continue;
      }

      if (label && trimmedLine.startsWith(`${label}:`)) {
        continue;
      }

      filteredLines.push(line);
    }

    lines = filteredLines;
    lines.push(normalizedLiteral);
  }

  emitProgress(options, "Salvaguarda final aplicada para consolidar a linha literal obrigatoria no fim do prompt.");
  return lines.join("\n").trimEnd();
}

async function runAdvancedEditFallback(
  promptAtual: string,
  instrucaoUsuario: string,
  apiKey?: string,
  options?: PromptEditOptions,
): Promise<ResultadoEdicao> {
  emitProgress(options, "Usando fallback de edicao avancada.");

  const advancedResult = await editPromptWithEngine(promptAtual, instrucaoUsuario, apiKey, {
    userId: options?.userId,
    conversationId: options?.conversationId,
  });
  const novoPrompt = advancedResult.success ? advancedResult.newPrompt : promptAtual;
  const detalhes: ResultadoEdicao["detalhes"] = advancedResult.operations.map((operation) => ({
    buscar: operation.search || operation.anchor || operation.section || "",
    substituir: operation.replace || "",
    status: "aplicada",
    matchType: operation.search ? "fuzzy" : undefined,
  }));

  if (advancedResult.success && novoPrompt !== promptAtual) {
    const verification = validatePromptInstructionApplication(promptAtual, novoPrompt, instrucaoUsuario);
    if (!verification.applied) {
      emitProgress(
        options,
        `Fallback avancado gerou mudanca parcial. ${verification.feedbackMessage} Tentando reescrita final.`,
      );
      return runFullPromptRewriteFallback(promptAtual, instrucaoUsuario, options);
    }

    return {
      success: true,
      novoPrompt,
      mensagemChat:
        advancedResult.feedbackMessage ||
        advancedResult.summary ||
        "Mudancas aplicadas no prompt.",
      edicoesAplicadas: advancedResult.operations.length,
      edicoesFalharam: 0,
      detalhes,
    };
  }

  emitProgress(options, "Fallback avancado nao alterou o prompt. Tentando reescrita guiada.");
  return runFullPromptRewriteFallback(promptAtual, instrucaoUsuario, options);
}

function stripWrappingCodeFence(value: string): string {
  const normalized = normalizePrompt(value).trim();
  if (!normalized.startsWith("```")) {
    return normalized;
  }

  const firstLineBreak = normalized.indexOf("\n");
  if (firstLineBreak === -1) {
    return normalized;
  }

  const inner = normalized.slice(firstLineBreak + 1);
  const closingFenceIndex = inner.lastIndexOf("```");
  if (closingFenceIndex === -1) {
    return inner.trim();
  }

  return inner.slice(0, closingFenceIndex).trim();
}

export function extractPromptFromPlainTextRewriteResponse(rawResponse: string): string | null {
  const normalized = normalizePrompt(rawResponse).trim();
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLocaleLowerCase("pt-BR");
  const startTag = "<prompt_final>";
  const endTag = "</prompt_final>";
  const taggedStart = lower.indexOf(startTag);
  const taggedEnd = lower.indexOf(endTag);

  if (taggedStart !== -1 && taggedEnd > taggedStart) {
    const extracted = normalized.slice(taggedStart + startTag.length, taggedEnd).trim();
    const prompt = extracted ? stripWrappingCodeFence(extracted) : "";
    return sanitizePromptEditGeneratedPrompt(prompt) || null;
  }

  const strippedFence = stripWrappingCodeFence(normalized);
  if (!strippedFence || looksLikePromptRuntimeResponseEnvelope(strippedFence)) {
    return null;
  }

  const labeledPrefixes = [
    "prompt final:",
    "prompt final completo:",
    "prompt reescrito:",
    "prompt atualizado:",
  ];

  const strippedLower = strippedFence.toLocaleLowerCase("pt-BR");
  for (const prefix of labeledPrefixes) {
    if (!strippedLower.startsWith(prefix)) {
      continue;
    }

    const candidate = strippedFence.slice(prefix.length).trim();
    return sanitizePromptEditGeneratedPrompt(candidate) || null;
  }

  return sanitizePromptEditGeneratedPrompt(strippedFence) || null;
}

async function runPlainTextPromptRewriteFallback(
  promptAtual: string,
  instrucaoUsuario: string,
  options?: PromptEditOptions,
): Promise<ResultadoEdicao> {
  emitProgress(options, "Tentando reescrita direta sem depender de JSON estruturado.");

  try {
    const literalRequirements = extractRequiredLiteralCandidates(instrucaoUsuario);
    const mustEndWithLiteral = instructionRequestsLiteralAtEnd(instrucaoUsuario);
    const rawContent = await runPromptEditCodexTextTask({
      taskName: "prompt_edit_plain_rewrite",
      systemPrompt: [
        "Voce e um editor especialista em prompts de agentes conversacionais estilo orquestrador com memoria, contexto e continuidade de estado.",
        "Aplique a instrucao do usuario diretamente no prompt completo.",
        "Preserve tudo que nao foi pedido: identidade do agente, regras de negocio, modulos ativos, integracoes, listas, precos, blocos fixos e contexto operacional.",
        "Retorne somente o prompt final completo entre as tags <prompt_final> e </prompt_final>.",
        mustEndWithLiteral
          ? "Se a instrucao pedir uma linha final literal, termine o prompt exatamente com essa linha, sem adicionar nada depois."
          : "Garanta que todo requisito literal exigido apareca exatamente como o usuario escreveu.",
        "Nao retorne JSON, markdown, comentarios, checklist ou explicacao externa.",
      ].join("\n"),
      userMessage: [
        `Instrucao do usuario: ${String(instrucaoUsuario || "").trim()}`,
        literalRequirements.length > 0
          ? [
              "",
              "Requisitos literais obrigatorios. Cada um precisa aparecer exatamente assim no prompt final:",
              ...literalRequirements.map((literal) => `- ${literal}`),
            ].join("\n")
          : "",
        "",
        "Prompt atual completo:",
        normalizePrompt(promptAtual),
      ].join("\n"),
      maxTokens: 7000,
      options,
      contextArtifacts: {
        literalRequirements,
        mustEndWithLiteral,
      },
    });
    const novoPrompt = normalizePrompt(extractPromptFromPlainTextRewriteResponse(rawContent) || "").trim();
    const promptOriginal = normalizePrompt(promptAtual).trim();

    if (!novoPrompt || novoPrompt === promptOriginal) {
      return buildRejectedPromptEditResult(promptAtual, "A reescrita direta nao produziu um prompt final valido.");
    }

    const verification = validatePromptInstructionApplication(promptAtual, novoPrompt, instrucaoUsuario);
    if (!verification.applied) {
      emitProgress(options, `Reescrita direta rejeitada na verificacao interna. ${verification.feedbackMessage}`);
      if (literalRequirements.length > 0) {
        const repairedPrompt = await repairPlainTextPromptRewrite(
          novoPrompt,
          promptAtual,
          instrucaoUsuario,
          literalRequirements,
          options,
        );

        if (repairedPrompt) {
          const repairedWithLiteralSafeguard = enforceLiteralRequirementsAsFinalLines(
            repairedPrompt,
            instrucaoUsuario,
            literalRequirements,
            options,
          );

          const repairedVerification = validatePromptInstructionApplication(
            promptAtual,
            repairedWithLiteralSafeguard,
            instrucaoUsuario,
          );

          if (repairedVerification.applied) {
            return {
              success: true,
              novoPrompt: repairedWithLiteralSafeguard,
              mensagemChat: "Alteracoes aplicadas com inteligencia artificial",
              edicoesAplicadas: 1,
              edicoesFalharam: 0,
              detalhes: [
                {
                  buscar: "PROMPT_COMPLETO",
                  substituir: "Reescrita direta com correcao final dos requisitos literais.",
                  status: "aplicada",
                  matchType: "exato",
                },
              ],
            };
          }
        }
      }

      return buildRejectedPromptEditResult(promptAtual, verification.feedbackMessage);
    }

    return {
      success: true,
      novoPrompt,
      mensagemChat: "Alteracoes aplicadas com inteligencia artificial",
      edicoesAplicadas: 1,
      edicoesFalharam: 0,
      detalhes: [
        {
          buscar: "PROMPT_COMPLETO",
          substituir: "Reescrita direta do prompt completo sem JSON estruturado.",
          status: "aplicada",
          matchType: "exato",
        },
      ],
    };
  } catch (error: any) {
    console.error("[EditService] Falha na reescrita direta sem JSON:", error);
    return {
      success: false,
      novoPrompt: promptAtual,
      mensagemChat: error?.message || "Nao foi possivel reescrever o prompt completo sem JSON.",
      edicoesAplicadas: 0,
      edicoesFalharam: 1,
      detalhes: [],
    };
  }
}

async function runFullPromptRewriteFallback(
  promptAtual: string,
  instrucaoUsuario: string,
  options?: PromptEditOptions,
): Promise<ResultadoEdicao> {
  emitProgress(options, "Usando fallback de reescrita guiada.");

  const plainTextFirstAttempt = await runPlainTextPromptRewriteFallback(promptAtual, instrucaoUsuario, options);
  if (plainTextFirstAttempt.success) {
    return plainTextFirstAttempt;
  }

  emitProgress(
    options,
    "A reescrita direta nao concluiu sozinha. Tentando um full rewrite estruturado como apoio.",
  );

  try {
    const systemPrompt = [
      "Voce e um editor especialista em prompts de agentes conversacionais estilo orquestrador com memoria, contexto e continuidade de estado.",
      "Aplique a instrucao do usuario diretamente no prompt completo.",
      "Preserve tudo que nao foi pedido: identidade do agente, regras de negocio, modulos ativos, integracoes, listas, precos, blocos fixos e contexto operacional.",
      "Nao responda com explicacoes extras. Retorne o prompt completo final ja reescrito.",
    ].join("\n");
    const userMessage = [
      `Instrucao do usuario: ${String(instrucaoUsuario || "").trim()}`,
      "",
      "Prompt atual completo:",
      normalizePrompt(promptAtual),
    ].join("\n");

    const rewrite = await callStructuredTask({
      taskName: "prompt-edit-full-rewrite",
      systemPrompt,
      userMessage,
      schema: fullRewriteSchema,
      maxTokens: 6000,
      temperature: 0.2,
      options,
      onProgress: options?.onProgress,
    });

    const novoPrompt = sanitizePromptEditGeneratedPrompt(rewrite.updatedPrompt);
    const promptOriginal = normalizePrompt(promptAtual).trim();

    if (!novoPrompt || novoPrompt === promptOriginal) {
      emitProgress(options, "A reescrita guiada estruturada nao gerou mudanca valida. Tentando resposta direta.");
      const plainTextFallback = await runPlainTextPromptRewriteFallback(promptAtual, instrucaoUsuario, options);
      if (plainTextFallback.success) {
        return plainTextFallback;
      }

      return {
        success: false,
        novoPrompt: promptAtual,
        mensagemChat:
          plainTextFallback.mensagemChat ||
          plainTextFirstAttempt.mensagemChat ||
          rewrite.resposta_chat ||
          "A IA nao sugeriu mudancas aplicaveis no momento.",
        edicoesAplicadas: 0,
        edicoesFalharam: 1,
        detalhes: [],
      };
    }

    const verification = validatePromptInstructionApplication(promptAtual, novoPrompt, instrucaoUsuario);
    if (!verification.applied) {
      emitProgress(
        options,
        `A reescrita guiada estruturada ficou incompleta. ${verification.feedbackMessage} Tentando resposta direta.`,
      );
      const plainTextFallback = await runPlainTextPromptRewriteFallback(promptAtual, instrucaoUsuario, options);
      if (plainTextFallback.success) {
        return plainTextFallback;
      }

      return buildRejectedPromptEditResult(
        promptAtual,
        plainTextFallback.mensagemChat || plainTextFirstAttempt.mensagemChat || verification.feedbackMessage,
      );
    }

    return {
      success: true,
      novoPrompt,
      mensagemChat: rewrite.resposta_chat,
      edicoesAplicadas: 1,
      edicoesFalharam: 0,
      detalhes: [
        {
          buscar: "PROMPT_COMPLETO",
          substituir: rewrite.summary,
          status: "aplicada",
          matchType: "exato",
        },
      ],
    };
  } catch (error: any) {
    console.error("[EditService] Falha na reescrita guiada:", error);
    const plainTextFallback = await runPlainTextPromptRewriteFallback(promptAtual, instrucaoUsuario, options);
    if (plainTextFallback.success) {
      return plainTextFallback;
    }

    return {
      success: false,
      novoPrompt: promptAtual,
      mensagemChat:
        plainTextFallback.mensagemChat ||
        plainTextFirstAttempt.mensagemChat ||
        error?.message ||
        "Nao foi possivel aplicar as alteracoes sugeridas pela IA.",
      edicoesAplicadas: 0,
      edicoesFalharam: 1,
      detalhes: [],
    };
  }
}

function normalizePrompt(prompt: string): string {
  return String(prompt || "").replaceAll("\r\n", "\n");
}

export function looksLikePromptRuntimeResponseEnvelope(value: unknown): boolean {
  const text = normalizePrompt(String(value || "")).trim();
  if (!text) return false;
  return (
    /<assistant_response>\s*[\s\S]*?<\/assistant_response>/i.test(text) &&
    (
      /<attention_json>\s*[\s\S]*?<\/attention_json>/i.test(text) ||
      /<routing_json>\s*[\s\S]*?<\/routing_json>/i.test(text)
    )
  );
}

export function sanitizePromptEditGeneratedPrompt(value: unknown): string {
  const prompt = normalizePrompt(String(value || "")).trim();
  if (!prompt || looksLikePromptRuntimeResponseEnvelope(prompt)) {
    return "";
  }
  return prompt;
}

function isLetter(char: string): boolean {
  const lower = char.toLocaleLowerCase("pt-BR");
  const upper = char.toLocaleUpperCase("pt-BR");
  return lower !== upper;
}

function isLikelyHeading(line: string): boolean {
  const trimmed = line.trim();

  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("#")) {
    return true;
  }

  if (trimmed.length < 3 || trimmed.length > 120) {
    return false;
  }

  let letters = 0;
  let uppercaseLetters = 0;
  let spaces = 0;

  for (const char of trimmed) {
    if (char === " ") {
      spaces += 1;
      continue;
    }

    if (!isLetter(char)) {
      continue;
    }

    letters += 1;
    if (char === char.toLocaleUpperCase("pt-BR")) {
      uppercaseLetters += 1;
    }
  }

  if (letters === 0) {
    return trimmed.endsWith(":");
  }

  const uppercaseRatio = uppercaseLetters / letters;
  if (uppercaseRatio >= 0.82 && spaces <= 12) {
    return true;
  }

  return trimmed.endsWith(":") && spaces <= 10;
}

function cleanHeadingLine(line: string): string {
  let text = line.trim();

  while (text.startsWith("#") || text.startsWith("-") || text.startsWith("*") || text.startsWith("•")) {
    text = text.slice(1).trimStart();
  }

  while (text.endsWith(":")) {
    text = text.slice(0, -1).trimEnd();
  }

  return text || "SECAO";
}

function splitPromptIntoSections(prompt: string): PromptSection[] {
  const normalized = normalizePrompt(prompt);
  const lines = normalized.split("\n");
  const lineOffsets: number[] = [];
  let cursor = 0;

  for (const line of lines) {
    lineOffsets.push(cursor);
    cursor += line.length + 1;
  }

  const startLines = [0];
  for (let i = 1; i < lines.length; i += 1) {
    if (isLikelyHeading(lines[i])) {
      startLines.push(i);
    }
  }

  const sections: PromptSection[] = [];
  for (let index = 0; index < startLines.length; index += 1) {
    const startLine = startLines[index];
    const nextStartLine = startLines[index + 1];
    const startIndex = lineOffsets[startLine] ?? 0;
    const endIndex = nextStartLine !== undefined ? (lineOffsets[nextStartLine] ?? normalized.length) : normalized.length;
    const firstLine = lines[startLine] ?? "";
    const title = isLikelyHeading(firstLine)
      ? cleanHeadingLine(firstLine)
      : index === 0
        ? "INTRODUCAO"
        : `SECAO ${index + 1}`;

    sections.push({
      id: `sec-${String(index + 1).padStart(2, "0")}`,
      title,
      content: normalized.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      order: index,
    });
  }

  return sections;
}

function compactWhitespace(value: string): string {
  let result = "";
  let sawWhitespace = false;

  for (const char of value) {
    const isWhitespace = char === " " || char === "\n" || char === "\r" || char === "\t";
    if (isWhitespace) {
      if (!sawWhitespace) {
        result += " ";
      }
      sawWhitespace = true;
      continue;
    }

    sawWhitespace = false;
    result += char;
  }

  return result.trim();
}

function buildSectionCatalog(sections: PromptSection[]): string {
  return sections
    .map((section) => {
      const preview = compactWhitespace(section.content).slice(0, 220);
      return `${section.id} | ${section.title} | ${preview}`;
    })
    .join("\n");
}

function buildGlobalSummary(prompt: string, sections: PromptSection[]): string {
  const titles = sections.slice(0, 10).map((section) => section.title).join(", ");
  const head = compactWhitespace(prompt).slice(0, 500);
  return `Prompt com ${prompt.length} caracteres e ${sections.length} secoes. Titulos iniciais: ${titles}. Resumo do topo: ${head}`;
}

function safeParseStructuredResponse<T>(raw: string, schema: z.ZodType<T>): T | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return null;
  }

  const candidates = buildStructuredParseCandidates(trimmed);

  for (const candidate of candidates) {
    try {
      return schema.parse(JSON.parse(candidate));
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function buildStructuredParseCandidates(raw: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (value: string) => {
    const trimmed = String(value || "").trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    candidates.push(trimmed);
  };

  pushCandidate(raw);

  const balancedObjects = extractBalancedJsonObjects(raw);
  for (const candidate of balancedObjects) {
    pushCandidate(candidate);
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    pushCandidate(raw.slice(firstBrace, lastBrace + 1));
  }

  return candidates;
}

function extractBalancedJsonObjects(raw: string): string[] {
  const results: string[] = [];
  let startIndex = -1;
  let depth = 0;
  let insideString = false;
  let escaping = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (insideString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === "\"") {
        insideString = false;
      }

      continue;
    }

    if (char === "\"") {
      insideString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        results.push(raw.slice(startIndex, index + 1));
        startIndex = -1;
      }
    }
  }

  return results;
}

async function repairStructuredTaskOutput<T>(input: {
  taskName: string;
  systemPrompt: string;
  userMessage: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  temperature: number;
  invalidRawResponse: string;
  options?: PromptEditOptions;
  onProgress?: (message: string) => void;
}): Promise<T | null> {
  const schemaJson = describeStructuredSchema(input.schema);

  const repairedRaw = await runPromptEditCodexTextTask({
    taskName: `${input.taskName}_json_repair`,
    systemPrompt: [
      "Voce corrige saidas estruturadas do Codex para JSON valido.",
      "Transforme a saida bruta abaixo em JSON valido que respeite exatamente o schema informado.",
      "Se a saida bruta ja contiver o conteudo certo em formato ruim, preserve esse conteudo.",
      "Se a saida bruta vier incompleta, execute novamente a intencao original com base no contexto recebido.",
      "Retorne somente JSON valido, sem markdown.",
      "",
      "JSON Schema esperado:",
      schemaJson,
    ].join("\n"),
    userMessage: [
      `Tarefa original: ${input.taskName}`,
      "",
      "Instrucoes originais do sistema:",
      input.systemPrompt,
      "",
      "Mensagem original do usuario:",
      input.userMessage,
      "",
      "Saida bruta anterior:",
      String(input.invalidRawResponse || "").trim() || "(vazia)",
    ].join("\n"),
    maxTokens: input.maxTokens,
    options: input.options,
    contextArtifacts: {
      taskName: input.taskName,
      schema: schemaJson,
      repairReason: "invalid_structured_output",
    },
  });
  const repaired = safeParseStructuredResponse(repairedRaw, input.schema);
  if (repaired) {
    return repaired;
  }

  input.onProgress?.("A saida estruturada continuou invalida. Repetindo com schema reforcado.");

  const retriedRaw = await runPromptEditCodexTextTask({
    taskName: `${input.taskName}_json_retry`,
    systemPrompt: [
      input.systemPrompt,
      "",
      "Responda somente JSON valido, sem markdown, seguindo exatamente este JSON Schema:",
      schemaJson,
    ].join("\n"),
    userMessage: input.userMessage,
    maxTokens: input.maxTokens,
    options: input.options,
    contextArtifacts: {
      taskName: input.taskName,
      schema: schemaJson,
      retryReason: "invalid_structured_output",
    },
  });
  return safeParseStructuredResponse(retriedRaw, input.schema);
}

function describeStructuredSchema(schema: z.ZodTypeAny, depth = 0): string {
  const indent = "  ".repeat(depth);

  if (schema instanceof z.ZodDefault) {
    return describeStructuredSchema(schema._def.innerType, depth);
  }

  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return `${describeStructuredSchema(schema.unwrap(), depth)} (opcional)`;
  }

  if (schema instanceof z.ZodString) {
    const checks = Array.isArray(schema._def.checks) ? schema._def.checks : [];
    const rules = checks
      .map((check) => {
        if (check.kind === "min") {
          return `min ${check.value}`;
        }
        if (check.kind === "max") {
          return `max ${check.value}`;
        }
        return null;
      })
      .filter(Boolean);

    return rules.length > 0 ? `string (${rules.join(", ")})` : "string";
  }

  if (schema instanceof z.ZodEnum) {
    return `enum(${schema.options.join(" | ")})`;
  }

  if (schema instanceof z.ZodArray) {
    return `array<${describeStructuredSchema(schema.element, depth)}>`;
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const lines = Object.entries(shape).map(
      ([key, value]) => `${indent}  "${key}": ${describeStructuredSchema(value as z.ZodTypeAny, depth + 1)}`,
    );
    return `{\n${lines.join(",\n")}\n${indent}}`;
  }

  return schema._def?.typeName || "valor";
}

async function callStructuredTask<T>(input: {
  taskName: string;
  systemPrompt: string;
  userMessage: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  temperature: number;
  options?: PromptEditOptions;
  onProgress?: (message: string) => void;
}): Promise<T> {
  const userId = String(input.options?.userId || "").trim();
  if (!userId) {
    throw new Error(`Codex estruturado exige userId em ${input.taskName}`);
  }
  const raw = await runWebOnlyCodexPromptTextForUser({
    userId,
    task: input.taskName,
    messages: [
      { role: "system", content: `${input.systemPrompt}\nRetorne apenas JSON valido, sem markdown.` },
      { role: "user", content: input.userMessage },
    ],
    message: input.userMessage,
    conversationId: input.options?.conversationId || `prompt-edit:${userId}:${input.taskName}`,
    contactName: "Personalize IA",
    maxTokens: input.maxTokens,
    timeoutMs: resolvePromptEditCodexCliTimeoutMs(),
    contextArtifacts: {
      channel: "prompt_edit_structured_task",
      taskName: input.taskName,
      schema: describeStructuredSchema(input.schema),
    },
  });

  const parsed = safeParseStructuredResponse(raw, input.schema);
  if (parsed) {
    return parsed;
  }

  console.warn(`[EditService] JSON invalido retornado em ${input.taskName}. Tentando reparo automatico.`);
  input.onProgress?.("A saida estruturada veio incompleta. Reparando automaticamente.");

  const repaired = await repairStructuredTaskOutput({
    ...input,
    invalidRawResponse: raw,
  });
  if (repaired) {
    return repaired;
  }

  throw new Error(`Nao foi possivel obter JSON valido em ${input.taskName}`);
}

function includesAny(text: string, needles: string[]): boolean {
  const lower = text.toLocaleLowerCase("pt-BR");
  return needles.some((needle) => lower.includes(needle));
}

function isBroadInstruction(instruction: string): boolean {
  return includesAny(instruction, [
    "mais curto",
    "mais curtas",
    "mais direto",
    "mais direta",
    "mais objetiv",
    "mais formal",
    "mais vendedor",
    "tom",
    "estilo",
    "respostas",
    "mensagens",
    "linguagem",
  ]);
}

function rankCoreSections(sections: PromptSection[]): PromptSection[] {
  const priorities = [
    "objetivo",
    "abertura",
    "postura",
    "tom",
    "formato",
    "resposta",
    "regras",
    "fluxo",
    "atendimento",
    "vendas",
    "qualificacao",
    "mensagem",
  ];

  return [...sections].sort((left, right) => {
    const leftText = `${left.title} ${compactWhitespace(left.content).slice(0, 180)}`.toLocaleLowerCase("pt-BR");
    const rightText = `${right.title} ${compactWhitespace(right.content).slice(0, 180)}`.toLocaleLowerCase("pt-BR");

    let leftScore = 0;
    let rightScore = 0;

    for (const keyword of priorities) {
      if (leftText.includes(keyword)) {
        leftScore += 1;
      }
      if (rightText.includes(keyword)) {
        rightScore += 1;
      }
    }

    if (leftScore === rightScore) {
      return left.order - right.order;
    }

    return rightScore - leftScore;
  });
}

function selectSectionsForRewrite(
  sections: PromptSection[],
  plan: z.infer<typeof plannerSchema>,
  instruction: string,
): PromptSection[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const selected = new Map<string, PromptSection>();

  for (const sectionId of plan.sectionIds) {
    const section = byId.get(sectionId);
    if (section) {
      selected.set(section.id, section);
    }
  }

  const broad = plan.editScope === "broad" || isBroadInstruction(instruction);
  if (broad && selected.size < 4) {
    for (const section of rankCoreSections(sections)) {
      selected.set(section.id, section);
      if (selected.size >= 6) {
        break;
      }
    }
  }

  if (selected.size === 0) {
    for (const section of rankCoreSections(sections).slice(0, 4)) {
      selected.set(section.id, section);
    }
  }

  let selectedSections = [...selected.values()];

  if (broad && selectedSections.length > 8) {
    const allowedIds = new Set(
      rankCoreSections(selectedSections)
        .slice(0, 8)
        .map((section) => section.id),
    );
    selectedSections = selectedSections.filter((section) => allowedIds.has(section.id));
  }

  return selectedSections.sort((left, right) => left.order - right.order);
}

function chunkSections(sections: PromptSection[], maxSections: number, maxChars: number): PromptSection[][] {
  const chunks: PromptSection[][] = [];
  let currentChunk: PromptSection[] = [];
  let currentChars = 0;

  for (const section of sections) {
    const sectionChars = section.content.length;
    const mustFlush =
      currentChunk.length > 0 &&
      (currentChunk.length >= maxSections || currentChars + sectionChars > maxChars);

    if (mustFlush) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChars = 0;
    }

    currentChunk.push(section);
    currentChars += sectionChars;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function mergeEditedSections(prompt: string, sections: PromptSection[], rewrites: Map<string, string>): string {
  let output = "";
  let lastIndex = 0;

  for (const section of sections) {
    if (section.startIndex > lastIndex) {
      output += prompt.slice(lastIndex, section.startIndex);
    }

    output += rewrites.get(section.id) ?? section.content;
    lastIndex = section.endIndex;
  }

  if (lastIndex < prompt.length) {
    output += prompt.slice(lastIndex);
  }

  return output;
}

function summarizeRewriteMessages(messages: string[], fallback: string): string {
  const deduped: string[] = [];

  for (const message of messages) {
    const trimmed = message.trim();
    if (trimmed && !deduped.includes(trimmed)) {
      deduped.push(trimmed);
    }
  }

  if (deduped.length === 0) {
    return fallback;
  }

  return deduped.join(" ");
}

export async function editarPromptViaIA(
  promptAtual: string,
  instrucaoUsuario: string,
  _apiKey?: string,
  _modelo?: "codex",
  options?: PromptEditOptions,
): Promise<ResultadoEdicao> {
  const promptNormalizado = normalizePrompt(promptAtual);
  const instrucaoNormalizada = String(instrucaoUsuario || "").trim();

  if (!promptNormalizado || !instrucaoNormalizada) {
    return {
      success: false,
      novoPrompt: promptAtual,
      mensagemChat: "currentPrompt e instruction sao obrigatorios.",
      edicoesAplicadas: 0,
      edicoesFalharam: 0,
      detalhes: [],
    };
  }

  if (!options?.userId) {
    return {
      success: false,
      novoPrompt: promptAtual,
      mensagemChat: "Nao foi possivel editar agora porque faltou contexto do tenant para o Codex.",
      edicoesAplicadas: 0,
      edicoesFalharam: 1,
      detalhes: [],
    };
  }

  try {
    emitProgress(options, "Editando configuracao com Codex e contexto completo do tenant.");
    const raw = await runWebOnlyCodexPromptTextForUser({
      userId: options.userId,
      task: "prompt_edit_service",
      messages: [
        {
          role: "system",
          content: [
            "Voce e o editor Codex do AgenteZap para configuracao de agentes WhatsApp.",
            "Aplique exatamente a instrucao confirmada pelo cliente.",
            "Preserve identidade, regras de negocio, midias, catalogo, funil, agenda, links, placeholders, precos e contexto que nao foi pedido para remover.",
            "Nao invente telefone, preco, horario, politica, link ou dado comercial.",
            "Retorne somente o prompt completo final entre <prompt_final> e </prompt_final>.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Instrucao confirmada: ${instrucaoNormalizada}`,
            "",
            "Prompt atual completo:",
            promptAtual,
          ].join("\n"),
        },
      ],
      message: instrucaoNormalizada,
      conversationId: options.conversationId || `prompt-edit:${options.userId}`,
      contactName: "Personalize IA",
      timeoutMs: resolvePromptEditCodexCliTimeoutMs(),
      maxTokens: 12000,
      contextArtifacts: {
        channel: "prompt_edit_service",
        instruction: instrucaoNormalizada,
        currentPromptLength: promptAtual.length,
      },
    });
    const novoPrompt = sanitizePromptEditGeneratedPrompt(
      extractPromptFromPlainTextRewriteResponse(raw) || raw,
    );
    const promptOriginal = normalizePrompt(promptAtual).trim();
    if (!novoPrompt || novoPrompt === promptOriginal) {
      return {
        success: false,
        novoPrompt: promptAtual,
        mensagemChat: "O Codex nao retornou uma alteracao util para aplicar.",
        edicoesAplicadas: 0,
        edicoesFalharam: 1,
        detalhes: [],
      };
    }
    const verification = validatePromptInstructionApplication(promptAtual, novoPrompt, instrucaoNormalizada);
    if (!verification.applied) {
      return {
        success: false,
        novoPrompt: promptAtual,
        mensagemChat: verification.feedbackMessage,
        edicoesAplicadas: 0,
        edicoesFalharam: 1,
        detalhes: [],
      };
    }
    return {
      success: true,
      novoPrompt,
      mensagemChat: "Alteracoes aplicadas com Codex.",
      edicoesAplicadas: 1,
      edicoesFalharam: 0,
      detalhes: [{
        buscar: "prompt_atual",
        substituir: "prompt_final_codex",
        status: "aplicada",
        matchType: "exato",
      }],
    };
  } catch (error: any) {
    return {
      success: false,
      novoPrompt: promptAtual,
      mensagemChat: error?.message || "Nao foi possivel editar a configuracao com Codex agora.",
      edicoesAplicadas: 0,
      edicoesFalharam: 1,
      detalhes: [],
    };
  }

  const deterministicTriggerResponseEdit = applyDeterministicExplicitTriggerResponseEdit(
    promptAtual,
    instrucaoNormalizada,
  );
  if (deterministicTriggerResponseEdit) {
    emitProgress(options, "Regra explicita de resposta aplicada de forma segura.");
    return deterministicTriggerResponseEdit;
  }

  const deterministicQuickStyleEdit = applyDeterministicQuickStyleEdit(promptAtual, instrucaoNormalizada);
  if (deterministicQuickStyleEdit) {
    emitProgress(options, "Instrucao de estilo aplicada de forma segura.");
    return deterministicQuickStyleEdit;
  }

  const literalRequirements = extractRequiredLiteralCandidates(instrucaoNormalizada);
  if (shouldPreferDirectPromptRewrite(instrucaoNormalizada, literalRequirements)) {
    emitProgress(
      options,
      "Instrucao simples detectada. Priorizando reescrita direta antes da orquestracao estruturada.",
    );

    const directFirstAttempt = await runPlainTextPromptRewriteFallback(
      promptAtual,
      instrucaoUsuario,
      options,
    );

    if (directFirstAttempt.success) {
      return directFirstAttempt;
    }

    emitProgress(
      options,
      "A reescrita direta prioritaria nao concluiu sozinha. Voltando para a orquestracao estruturada.",
    );
  }

  emitProgress(options, "Mapeando secoes do prompt atual.");
  const sections = splitPromptIntoSections(promptNormalizado);

  if (sections.length === 0) {
    return runAdvancedEditFallback(promptAtual, instrucaoUsuario, _apiKey, options);
  }

  try {
    emitProgress(options, "Planejando quais blocos precisam mudar.");

    const plan = await callStructuredTask({
      taskName: "prompt-edit-plan",
      systemPrompt: [
        "Voce e um planejador de calibracao de prompt para um agente conversacional com memoria e contexto.",
        "Analise a instrucao do usuario e escolha apenas as secoes que realmente precisam mudar.",
        "Preserve identidade, regras de negocio, continuidade de estado, memoria operacional e blocos nao relacionados.",
        "Se a mudanca for ampla de tom, estilo, tamanho das respostas ou fluxo principal, marque editScope=broad e selecione todas as secoes relevantes.",
        "Nunca invente ids de secoes.",
      ].join("\n"),
      userMessage: [
        `Instrucao do usuario: ${instrucaoNormalizada}`,
        "",
        `Resumo global: ${buildGlobalSummary(promptNormalizado, sections)}`,
        "",
        "Catalogo de secoes:",
        buildSectionCatalog(sections),
      ].join("\n"),
      schema: plannerSchema,
      maxTokens: 1200,
      temperature: 0.1,
      options,
      onProgress: options?.onProgress,
    });

    const selectedSections = selectSectionsForRewrite(sections, plan, instrucaoNormalizada);
    if (selectedSections.length === 0) {
      return runAdvancedEditFallback(promptAtual, instrucaoUsuario, _apiKey, options);
    }

    emitProgress(options, `Reescrevendo ${selectedSections.length} secao(oes) relevantes em lotes menores.`);

    const batches = chunkSections(selectedSections, 4, 16000);
    const rewrites = new Map<string, string>();
    const detalhes: ResultadoEdicao["detalhes"] = [];
    const feedbackMessages = [plan.resposta_chat];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      emitProgress(options, `Processando lote ${batchIndex + 1}/${batches.length}.`);

      const rewrite = await callStructuredTask({
        taskName: `prompt-edit-rewrite-${batchIndex + 1}`,
        systemPrompt: [
          "Voce e um editor de prompt que trabalha por secoes.",
          "Reescreva somente as secoes fornecidas, mantendo a estrutura do agente como um orquestrador com memoria, contexto e continuidade de estado.",
          "Aplique a instrucao do usuario de forma real, sem metacomentarios.",
          "Nao apague placeholders, links, regras fixas, listas de produtos, precos ou integracoes, exceto se o usuario pedir explicitamente.",
          "Cada updatedContent deve ser o texto completo final da secao correspondente.",
        ].join("\n"),
        userMessage: [
          `Instrucao do usuario: ${instrucaoNormalizada}`,
          `Objetivo do plano: ${plan.objective}`,
          `Instrucoes de escrita: ${plan.writerInstructions.join(" | ")}`,
          `Preservar: ${plan.preserveDirectives.join(" | ") || "identidade, memoria, regras e contexto"}`,
          "",
          `Resumo global: ${buildGlobalSummary(promptNormalizado, sections)}`,
          "",
          "Secoes para reescrever:",
          batch.map((section) => `[${section.id}] ${section.title}\n${section.content}`).join("\n\n"),
        ].join("\n"),
        schema: rewriteSchema,
        maxTokens: 2600,
        temperature: 0.2,
        options,
        onProgress: options?.onProgress,
      });

      feedbackMessages.push(rewrite.resposta_chat);

      for (const edit of rewrite.edits) {
        const originalSection = batch.find((section) => section.id === edit.sectionId);
        if (!originalSection) {
          continue;
        }

        rewrites.set(edit.sectionId, edit.updatedContent);
        detalhes.push({
          buscar: originalSection.title,
          substituir: edit.summary,
          status: edit.updatedContent !== originalSection.content ? "aplicada" : "falhou",
          matchType: "exato",
        });
      }
    }

    emitProgress(options, "Remontando o prompt final.");
    const novoPrompt = mergeEditedSections(promptNormalizado, sections, rewrites);
    const aplicadas = selectedSections.filter((section) => {
      const updated = rewrites.get(section.id);
      return updated !== undefined && updated !== section.content;
    }).length;

    if (aplicadas === 0 || novoPrompt === promptNormalizado) {
      emitProgress(options, "Nenhuma secao mudou de fato. Tentando fallback de seguranca.");
      return runAdvancedEditFallback(promptAtual, instrucaoUsuario, _apiKey, options);
    }

    const verification = validatePromptInstructionApplication(promptAtual, novoPrompt, instrucaoNormalizada);
    if (!verification.applied) {
      emitProgress(
        options,
        `A edicao estruturada ficou incompleta. ${verification.feedbackMessage} Tentando reescrita final.`,
      );
      return runFullPromptRewriteFallback(promptAtual, instrucaoNormalizada, options);
    }

    return {
      success: true,
      novoPrompt,
      mensagemChat: summarizeRewriteMessages(
        feedbackMessages,
        `Atualizei ${aplicadas} secao(oes) do prompt.`,
      ),
      edicoesAplicadas: aplicadas,
      edicoesFalharam: Math.max(0, selectedSections.length - aplicadas),
      detalhes,
    };
  } catch (error: any) {
    console.error("[EditService] Falha na orquestracao estruturada:", error);
    emitProgress(options, "A orquestracao estruturada falhou. Executando fallback.");
    return runAdvancedEditFallback(promptAtual, instrucaoUsuario, _apiKey, options);
  }
}

interface ResultadoFuzzy {
  success: boolean;
  novoTexto: string;
  matchType?: "exato" | "fuzzy";
  textoEncontrado?: string;
}

function aplicarEdicaoFuzzy(
  documento: string,
  buscar: string,
  substituir: string,
): ResultadoFuzzy {
  if (documento.includes(buscar)) {
    return {
      success: true,
      novoTexto: documento.replace(buscar, substituir),
      matchType: "exato",
    };
  }

  const docLower = documento.toLocaleLowerCase("pt-BR");
  const buscarLower = buscar.toLocaleLowerCase("pt-BR");
  const indexCaseInsensitive = docLower.indexOf(buscarLower);

  if (indexCaseInsensitive !== -1) {
    const textoOriginal = documento.substring(indexCaseInsensitive, indexCaseInsensitive + buscar.length);
    return {
      success: true,
      novoTexto: documento.replace(textoOriginal, substituir),
      matchType: "fuzzy",
      textoEncontrado: textoOriginal,
    };
  }

  return {
    success: false,
    novoTexto: documento,
  };
}

function tokenizar(str: string): Set<string> {
  const normalized = compactWhitespace(str).toLocaleLowerCase("pt-BR");
  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);

  return new Set(tokens);
}

function coeficienteDice(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) {
    return 1;
  }
  if (set1.size === 0 || set2.size === 0) {
    return 0;
  }

  let intersection = 0;
  set1.forEach((token) => {
    if (set2.has(token)) {
      intersection += 1;
    }
  });

  return (2 * intersection) / (set1.size + set2.size);
}

export { aplicarEdicaoFuzzy, coeficienteDice, tokenizar };
