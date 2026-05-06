import { isSchedulingDisambiguationReply } from "./schedulingService";

export type SchedulingHumanizationCategory =
  | "DISAMBIGUATION"
  | "NAME_REQUEST"
  | "ADDRESS_REQUEST"
  | "QUOTE"
  | "SLOT_LISTING"
  | "BOOKING_CONFIRMATION"
  | "CANCELLATION"
  | "OTHER";

type SchedulingDisambiguationPromptContext = {
  serviceNames: string[];
  highlightedServices: string[];
  examplesText: string;
  hasMoreOptions: boolean;
  familyLabel: string | null;
  questionTarget: string;
};

function buildOwnerPromptInstruction(promptDoNegocio: string): string {
  const trimmedPrompt = String(promptDoNegocio || "").trim();
  if (!trimmedPrompt) {
    return "";
  }

  const promptResumo =
    trimmedPrompt.length > 2000 ? `${trimmedPrompt.substring(0, 2000)}...` : trimmedPrompt;

  return `\n\nINSTRUCOES DO DONO DO NEGOCIO (siga fielmente estas regras ao conversar):\n---\n${promptResumo}\n---\nSiga o tom, o estilo e todas as regras acima. Se o prompt pede para perguntar forma de pagamento, pergunte. Se pede para coletar dados, colete. Se tem uma forma especifica de atender, siga exatamente.`;
}

function extractSchedulingDisambiguationServiceNames(structuredReply: string): string[] {
  const lines = String(structuredReply || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const services: string[] = [];
  let insideOptionsBlock = false;

  for (const line of lines) {
    if (line === "OPCOES RELACIONADAS:") {
      insideOptionsBlock = true;
      continue;
    }

    if (!insideOptionsBlock) {
      continue;
    }

    if (line.startsWith("PROXIMO PASSO:")) {
      break;
    }

    if (!line.startsWith("- ")) {
      continue;
    }

    if (line.startsWith("- ...")) {
      continue;
    }

    let serviceName = line.slice(2).trim();
    const detailStart = serviceName.lastIndexOf(" (");
    if (detailStart > 0 && serviceName.endsWith(")")) {
      serviceName = serviceName.slice(0, detailStart).trim();
    }

    if (serviceName) {
      services.push(serviceName);
    }
  }

  return services;
}

function joinHumanList(items: string[]): string {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} ou ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")} ou ${items[items.length - 1]}`;
}

type SchedulingSlotListingDay = {
  dayLabel: string;
  times: string[];
};

type SchedulingSlotListingContext = {
  days: SchedulingSlotListingDay[];
  unavailableLabel: string | null;
  requiresAddress: boolean;
};

function normalizeSchedulingSlotTimeToken(value: string): string {
  return String(value || "").trim().replace("h", ":");
}

function formatSchedulingSlotTimeForChat(value: string): string {
  return normalizeSchedulingSlotTimeToken(value).replace(":", "h");
}

function ownerPromptPrefersSingleSlot(promptDoNegocio?: string | null): boolean {
  const normalized = normalizeFamilyLabelText(String(promptDoNegocio || ""));
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("primeiro horario disponivel")
    || normalized.includes("apenas um horario")
    || normalized.includes("um unico horario")
    || normalized.includes("nunca mostrar uma lista")
    || normalized.includes("nunca oferecer mais de um horario")
    || normalized.includes("apresentar apenas um unico horario")
  );
}

function extractSchedulingSlotListingContext(structuredReply: string): SchedulingSlotListingContext {
  const lines = String(structuredReply || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const days: SchedulingSlotListingDay[] = [];
  let unavailableLabel: string | null = null;
  let requiresAddress = false;

  for (const line of lines) {
    if (line.startsWith("DATA INDISPONIVEL:")) {
      unavailableLabel = line.slice("DATA INDISPONIVEL:".length).trim();
      continue;
    }

    if (line.startsWith("DADO NECESSARIO:")) {
      requiresAddress = line.toLowerCase().includes("endereco");
      continue;
    }

    if (!line.startsWith("- ")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const dayLabel = line.slice(2, separatorIndex).trim();
    const times = (line.slice(separatorIndex + 1).match(/\d{2}[h:]\d{2}/g) || [])
      .map((token) => normalizeSchedulingSlotTimeToken(token));

    if (dayLabel && times.length > 0) {
      days.push({ dayLabel, times });
    }
  }

  return { days, unavailableLabel, requiresAddress };
}

export function buildDeterministicSchedulingSlotListingChatReply(
  structuredReply: string,
  promptDoNegocio?: string | null,
): string {
  const context = extractSchedulingSlotListingContext(structuredReply);
  if (context.days.length === 0) {
    return "Tenho horarios reais na agenda e posso te passar certinho. Qual periodo fica melhor para voce?";
  }

  const prefersSingleSlot = ownerPromptPrefersSingleSlot(promptDoNegocio);
  if (prefersSingleSlot) {
    const firstDay = context.days[0];
    const firstTime = formatSchedulingSlotTimeForChat(firstDay.times[0]);
    const prefix = context.unavailableLabel
      ? `Esse horario pedido nao esta livre agora. `
      : "";
    return `${prefix}O primeiro horario disponivel e ${firstDay.dayLabel}, as ${firstTime}. Posso agendar para voce nesse horario?`;
  }

  const daySegments = context.days.map((day) => (
    `${day.dayLabel}: ${joinHumanList(day.times.map((time) => formatSchedulingSlotTimeForChat(time)))}`
  ));
  const prefix = context.unavailableLabel
    ? `Esse horario pedido nao esta livre agora. `
    : "";

  if (daySegments.length === 1) {
    return `${prefix}Temos horarios disponiveis para ${daySegments[0]}. Qual horario fica melhor para voce?`;
  }

  return `${prefix}Tenho estes horarios reais na agenda: ${daySegments.join(". ")}. Qual horario fica melhor para voce?`;
}

function extractEmphasizedSegments(value: string): string[] {
  const matches = String(value || "").match(/\*[^*]+\*/g) || [];
  return matches
    .map((match) => match.slice(1, -1).trim())
    .filter(Boolean);
}

const FAMILY_LABEL_STOPWORDS = new Set([
  "a",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "para",
  "por",
  "tipo",
  "tipos",
  "um",
  "uma",
]);

const GENERIC_FAMILY_LABELS = new Set([
  "agenda",
  "agendamento",
  "atendimento",
  "doppler",
  "horario",
  "horarios",
  "opcao",
  "opcoes",
  "parecida",
  "parecidas",
  "regiao",
  "servico",
  "servicos",
]);

const TYPE_BASED_FAMILY_LABEL_HEADS = new Set([
  "assistencia",
  "instalacao",
  "limpeza",
  "manutencao",
  "reparo",
  "troca",
]);

const PROMPT_FAMILY_FALLBACK_TOKENS = [
  "ultrassom",
  "consulta",
  "exame",
  "procedimento",
  "sessao",
  "visita",
  "vistoria",
  "manutencao",
  "instalacao",
  "reparo",
  "limpeza",
  "tratamento",
  "servico",
];

const SHARED_FAMILY_QUALIFIER_CONNECTORS = new Map<string, string>([
  ["doppler", "com"],
]);

function normalizeFamilyLabelText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeFamilyLabelToken(token: string): string {
  const value = String(token || "").trim();
  if (!value) {
    return "";
  }

  if (value.endsWith("oes") && value.length > 4) {
    return `${value.slice(0, -3)}ao`;
  }

  if (value.endsWith("s") && value.length > 4) {
    return value.slice(0, -1);
  }

  return value;
}

function buildMeaningfulFamilyTokens(value: string): string[] {
  return normalizeFamilyLabelText(value)
    .split(" ")
    .map((token) => singularizeFamilyLabelToken(token))
    .filter((token) => token && !FAMILY_LABEL_STOPWORDS.has(token));
}

function buildQuestionTargetForFamilyLabel(familyLabel: string | null): string {
  const normalizedLabel = String(familyLabel || "").trim();
  if (!normalizedLabel) {
    return "qual servico";
  }

  const headToken = buildMeaningfulFamilyTokens(normalizedLabel)[0] || "";
  if (TYPE_BASED_FAMILY_LABEL_HEADS.has(headToken)) {
    return `qual tipo de ${normalizedLabel}`;
  }

  return `qual ${normalizedLabel}`;
}

function inferCommonLeadingFamilyLabel(serviceNames: string[]): string | null {
  const tokenLists = serviceNames
    .map((serviceName) => buildMeaningfulFamilyTokens(serviceName))
    .filter((tokens) => tokens.length > 0);

  if (tokenLists.length === 0) {
    return null;
  }

  const firstTokens = [...tokenLists[0]];
  while (
    firstTokens.length > 0
    && !tokenLists.every(
      (tokens) =>
        tokens.length >= firstTokens.length
        && firstTokens.every((token, index) => tokens[index] === token),
    )
  ) {
    firstTokens.pop();
  }

  while (firstTokens.length > 0 && GENERIC_FAMILY_LABELS.has(firstTokens[firstTokens.length - 1])) {
    firstTokens.pop();
  }

  if (firstTokens.length === 0) {
    return null;
  }

  const headToken = firstTokens[0] || "";
  if (TYPE_BASED_FAMILY_LABEL_HEADS.has(headToken)) {
    return headToken;
  }

  return firstTokens.slice(0, 2).join(" ");
}

function inferPromptBackedFamilyLabel(
  serviceNames: string[],
  promptDoNegocio?: string | null,
): string | null {
  const promptTokens = new Set(buildMeaningfulFamilyTokens(String(promptDoNegocio || "")));
  if (promptTokens.size === 0) {
    return null;
  }

  const tokenFrequency = new Map<string, number>();
  for (const serviceName of serviceNames) {
    const uniqueTokens = new Set(buildMeaningfulFamilyTokens(serviceName));
    for (const token of uniqueTokens) {
      tokenFrequency.set(token, (tokenFrequency.get(token) || 0) + 1);
    }
  }

  let bestToken = "";
  let bestScore = 0;
  for (const [token, score] of tokenFrequency.entries()) {
    if (score < 2 || !promptTokens.has(token) || GENERIC_FAMILY_LABELS.has(token)) {
      continue;
    }

    if (score > bestScore) {
      bestToken = token;
      bestScore = score;
    }
  }

  if (bestToken) {
    return bestToken;
  }

  for (const token of PROMPT_FAMILY_FALLBACK_TOKENS) {
    if (promptTokens.has(token)) {
      return token;
    }
  }

  return null;
}

function maybeAppendSharedFamilyQualifier(
  baseFamilyLabel: string | null,
  serviceNames: string[],
  promptDoNegocio?: string | null,
): string | null {
  const normalizedBase = String(baseFamilyLabel || "").trim();
  if (!normalizedBase || serviceNames.length < 2) {
    return normalizedBase || null;
  }

  const baseTokens = new Set(buildMeaningfulFamilyTokens(normalizedBase));
  const tokenLists = serviceNames
    .map((serviceName) => buildMeaningfulFamilyTokens(serviceName))
    .filter((tokens) => tokens.length > 0);
  if (tokenLists.length !== serviceNames.length) {
    return normalizedBase;
  }

  const promptTokens = new Set(buildMeaningfulFamilyTokens(String(promptDoNegocio || "")));
  for (const [qualifierToken, connector] of SHARED_FAMILY_QUALIFIER_CONNECTORS.entries()) {
    if (baseTokens.has(qualifierToken)) {
      continue;
    }

    const appearsInEveryService = tokenLists.every((tokens) => tokens.includes(qualifierToken));
    if (!appearsInEveryService) {
      continue;
    }

    if (promptTokens.size > 0 && !promptTokens.has(qualifierToken)) {
      continue;
    }

    return `${normalizedBase} ${connector} ${qualifierToken}`;
  }

  return normalizedBase;
}

function resolveDisambiguationFamilyLabel(
  serviceNames: string[],
  promptDoNegocio?: string | null,
): string | null {
  const baseFamilyLabel =
    inferCommonLeadingFamilyLabel(serviceNames)
    || inferPromptBackedFamilyLabel(serviceNames, promptDoNegocio)
    || null;

  return maybeAppendSharedFamilyQualifier(
    baseFamilyLabel,
    serviceNames,
    promptDoNegocio,
  );
}

function buildSchedulingDisambiguationPromptContext(
  structuredReply: string,
  promptDoNegocio?: string | null,
): SchedulingDisambiguationPromptContext {
  const serviceNames = extractSchedulingDisambiguationServiceNames(structuredReply);
  const highlightedServices = serviceNames.slice(0, 4).map((serviceName) => `*${serviceName}*`);
  const examplesText = joinHumanList(highlightedServices);
  const hasMoreOptions =
    serviceNames.length > highlightedServices.length || String(structuredReply || "").includes("- ...");
  const familyLabel = resolveDisambiguationFamilyLabel(serviceNames, promptDoNegocio);

  return {
    serviceNames,
    highlightedServices,
    examplesText,
    hasMoreOptions,
    familyLabel,
    questionTarget: buildQuestionTargetForFamilyLabel(familyLabel),
  };
}

export function buildDeterministicSchedulingDisambiguationChatReply(
  structuredReply: string,
  promptDoNegocio?: string | null,
): string {
  const context = buildSchedulingDisambiguationPromptContext(structuredReply, promptDoNegocio);
  if (context.serviceNames.length === 0) {
    return "Quero te confirmar certinho qual exame ou servico voce precisa antes de falar de agenda. Pode me dizer qual e?";
  }

  const intro = context.familyLabel
    ? `Claro. Me diz ${context.questionTarget} voce precisa.`
    : "Claro. Me diz qual servico voce precisa.";

  if (context.hasMoreOptions) {
    return `${intro} Se ajudar, tenho por aqui ${context.examplesText}. Se for outro parecido, pode me falar a regiao ou a descricao.`;
  }

  return `${intro} Pode ser ${context.examplesText}.`;
}

export function validateSchedulingDisambiguationHumanizedReply(input: {
  replyText: string;
  structuredReply: string;
  promptDoNegocio?: string | null;
}): {
  isValid: boolean;
  issues: string[];
  fallbackReply: string;
} {
  const fallbackReply = buildDeterministicSchedulingDisambiguationChatReply(
    input.structuredReply,
    input.promptDoNegocio,
  );
  const context = buildSchedulingDisambiguationPromptContext(
    input.structuredReply,
    input.promptDoNegocio,
  );
  const rawReply = String(input.replyText || "");
  const normalizedReply = normalizeFamilyLabelText(rawReply);
  const issues: string[] = [];

  if (!normalizedReply || normalizedReply.length < 12) {
    issues.push("reply_empty_or_too_short");
  }

  if (context.familyLabel) {
    const familyTokens = buildMeaningfulFamilyTokens(context.familyLabel);
    const missingFamilyToken = familyTokens.find((token) => !normalizedReply.includes(token));
    if (missingFamilyToken) {
      issues.push(`missing_family_token:${missingFamilyToken}`);
    }
  }

  const clarificationSignals = ["qual", "me diz", "pode me dizer", "?"];
  if (!clarificationSignals.some((signal) => rawReply.toLowerCase().includes(signal))) {
    issues.push("missing_clarification_question");
  }

  const forbiddenSchedulingSignals = [
    "ver os horarios",
    "verificar os horarios",
    "horarios disponiveis",
    "ja posso agendar",
    "posso agendar",
    "qual horario",
    "qual data",
  ];
  if (forbiddenSchedulingSignals.some((signal) => normalizedReply.includes(signal))) {
    issues.push("scheduling_offer_before_disambiguation");
  }

  const allowedServiceNames = new Set(
    context.serviceNames.map((serviceName) => normalizeFamilyLabelText(serviceName)),
  );
  const emphasizedSegments = extractEmphasizedSegments(rawReply);
  for (const segment of emphasizedSegments) {
    if (!allowedServiceNames.has(normalizeFamilyLabelText(segment))) {
      issues.push(`mentioned_service_not_in_catalog:${segment}`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    fallbackReply,
  };
}

export function validateSchedulingSlotListingHumanizedReply(input: {
  replyText: string;
  structuredReply: string;
  promptDoNegocio?: string | null;
}): {
  isValid: boolean;
  issues: string[];
  fallbackReply: string;
} {
  const fallbackReply = buildDeterministicSchedulingSlotListingChatReply(
    input.structuredReply,
    input.promptDoNegocio,
  );
  const context = extractSchedulingSlotListingContext(input.structuredReply);
  const allowedTimes = context.days.flatMap((day) => day.times);
  const replyTimes = Array.from(new Set(
    (String(input.replyText || "").match(/\d{2}[h:]\d{2}/g) || [])
      .map((token) => normalizeSchedulingSlotTimeToken(token)),
  ));
  const issues: string[] = [];
  const prefersSingleSlot = ownerPromptPrefersSingleSlot(input.promptDoNegocio);

  if (allowedTimes.length === 0) {
    issues.push("missing_structured_slots");
  }

  if (replyTimes.length === 0) {
    issues.push("missing_slot_time");
  }

  for (const replyTime of replyTimes) {
    if (!allowedTimes.includes(replyTime)) {
      issues.push(`invented_slot_time:${replyTime}`);
    }
  }

  if (prefersSingleSlot) {
    const expectedFirstTime = allowedTimes[0] || "";
    if (replyTimes.length !== 1 || replyTimes[0] !== expectedFirstTime) {
      issues.push("single_slot_mode_mismatch");
    }
  } else {
    const missingAllowedTime = allowedTimes.find((allowedTime) => !replyTimes.includes(allowedTime));
    if (missingAllowedTime) {
      issues.push(`missing_allowed_time:${missingAllowedTime}`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    fallbackReply,
  };
}

export function classifySchedulingHumanizationCategory(
  deterministicSchedulingReply: string,
): SchedulingHumanizationCategory {
  const reply = String(deterministicSchedulingReply || "").trim();
  if (!reply) {
    return "OTHER";
  }

  if (isSchedulingDisambiguationReply(reply)) {
    return "DISAMBIGUATION";
  }

  const replyLower = reply.toLowerCase();
  if (/nome\s*(completo|pra|para)|seu\s*nome/.test(replyLower) && reply.length < 120) {
    return "NAME_REQUEST";
  }

  if (/endere[cç]o/.test(replyLower) && reply.length < 150) {
    return "ADDRESS_REQUEST";
  }

  if (/r\$\s*\d/.test(replyLower)) {
    return "QUOTE";
  }

  if ((reply.match(/\d{2}:\d{2}/g) || []).length >= 2) {
    return "SLOT_LISTING";
  }

  return "OTHER";
}

export function buildSchedulingHumanizationUserInstruction(input: {
  category: SchedulingHumanizationCategory;
  schedulingReplyForHumanization: string;
  nomeNegocio?: string | null;
  promptDoNegocio?: string | null;
}): string {
  const structuredReply = String(input.schedulingReplyForHumanization || "").trim();
  if (!structuredReply) {
    return "";
  }

  const instrucaoPrompt = buildOwnerPromptInstruction(String(input.promptDoNegocio || ""));
  const nomeNegocioCtx = input.nomeNegocio ? `Voce e a atendente da ${input.nomeNegocio}. ` : "";

  if (input.category === "DISAMBIGUATION") {
    const disambiguationContext = buildSchedulingDisambiguationPromptContext(
      structuredReply,
      input.promptDoNegocio,
    );
    const contextLines = [
      disambiguationContext.familyLabel
        ? `FAMILIA PRINCIPAL IDENTIFICADA: ${disambiguationContext.familyLabel}`
        : null,
      `ALVO DE ESCLARECIMENTO DESTE TURNO: ${disambiguationContext.questionTarget}`,
      disambiguationContext.examplesText
        ? `EXEMPLOS REAIS QUE PODEM SER CITADOS: ${disambiguationContext.examplesText}`
        : null,
    ].filter(Boolean).join("\n");

    return `${nomeNegocioCtx}O cliente descreveu o servico de forma generica e o sistema ainda nao tem contexto suficiente para escolher um item especifico do catalogo.

DADOS REAIS DO SISTEMA (formato estruturado - nao copie este formato na resposta):
---
${structuredReply}
---

CONTEXTO DE CONDUCAO DESTE TURNO:
${contextLines}

Responda ao cliente de forma natural e humana, como uma IA conversacional inteligente no WhatsApp.
REGRAS:
- Use somente as opcoes listadas no bloco acima
- Nao acrescente outras opcoes, exames, regioes ou nomes de servico
- Nao escolha um servico por conta propria
- Nao fale em horarios, datas ou agenda ainda
- Seu objetivo e pedir que o cliente diga qual exame, servico ou regiao deseja
- Se citar servicos, copie o nome exatamente como aparece no bloco acima
- Nao resuma, renomeie, agrupe ou misture servicos diferentes em uma categoria generica
- Se houver muitas opcoes, cite so algumas linhas do bloco acima e diga que ha outras parecidas
- Preserve exatamente o escopo do catalogo acima; nao invente servicos
- Nao use frases template como "Encontrei essa opcao pra voce", "Consigo te ajudar com isso" ou "Separei estas possibilidades"
- A pergunta precisa ficar explicitamente no eixo "${disambiguationContext.questionTarget}"
- Se o prompt do dono pedir um jeito mais direto ou mais humano de perguntar, siga esse jeito, mas sem perder o eixo "${disambiguationContext.questionTarget}"
- Nao ofereca agendamento, horarios ou datas antes de o cliente esclarecer o item correto
- Fale com suas proprias palavras, em tom humano, acolhedor e direto${instrucaoPrompt}`;
  }

  if (input.category === "QUOTE" || input.category === "SLOT_LISTING") {
    if (input.category === "QUOTE") {
      return `${nomeNegocioCtx}O cliente perguntou sobre um servico. Aqui estao os dados reais do sistema de agendamento (formato estruturado - nao copie este formato na resposta):

${structuredReply}

Responda ao cliente de forma natural e humana, como uma IA conversacional inteligente, tipo uma atendente real no WhatsApp.
REGRAS:
- Os valores em R$, nomes dos servicos e duracoes sao dados reais - inclua todos na sua resposta
- Se houver mais de um servico, mencione cada um com seu valor naturalmente e ofereca o total
- Pergunte se o cliente quer ver os horarios disponiveis para agendar
- Nunca mencione horarios especificos, datas especificas ou slots de agenda nesta resposta - a agenda ainda nao foi consultada
- Nunca diga coisas como "o primeiro horario e as X" ou "temos disponivel dia Y" - isso seria inventar dados
- Esta resposta e somente sobre preco e servico. Horarios virao apenas depois de o cliente pedir
- Nao invente dados que nao estejam acima
- Nao diga que vai "verificar preco" ou "consultar" - os dados ja sao definitivos
- Nunca use frases template como "Encontrei essa opcao pra voce", "Consigo te ajudar com isso", "Separei estas possibilidades"
- Fale com suas proprias palavras, de forma conversacional e natural, como se fosse uma pessoa real digitando no WhatsApp${instrucaoPrompt}`;
    }

    const prefersSingleSlot = ownerPromptPrefersSingleSlot(input.promptDoNegocio);
    if (prefersSingleSlot) {
      return `${nomeNegocioCtx}O cliente quer agendar. Aqui esta o horario real devolvido pela agenda:

${structuredReply}

Responda ao cliente de forma natural e humana, como uma IA conversacional inteligente, tipo uma atendente real no WhatsApp.
REGRAS:
- O prompt do dono pediu para conduzir com apenas um horario por vez
- Use somente o primeiro horario cronologico que aparece nos dados acima
- Nao mencione nenhum outro horario alem desse primeiro
- Nao invente horario nenhum
- Pergunte se pode agendar nesse horario
- Nao peca endereco, nome ou pagamento antes de o cliente aceitar esse horario
- Esses dados de agenda ja sao reais e valem para a continuidade da conversa
- Fale de forma natural, sem parecer bloco tecnico${instrucaoPrompt}`;
    }

    return `${nomeNegocioCtx}O cliente quer agendar. Aqui estao os horarios reais disponiveis na agenda:

${structuredReply}

Responda ao cliente de forma natural e humana, como uma IA conversacional inteligente, tipo uma atendente real no WhatsApp.
REGRAS:
- Inclua todos os horarios listados acima - nao omita nenhum
- Agrupe os horarios do mesmo dia: diga o dia uma vez e liste os horarios juntos (ex: "Sexta dia 20 temos as 08:30, 13:30 e 14:45")
- Nao repita o nome do dia para cada horario separado - isso e robotico
- Se alguma data ou horario pedido nao estava disponivel, informe isso
- Peca para o cliente escolher um horario
- Esses horarios ja vieram da consulta real e ficam valendo para a continuidade da conversa
- Se o cliente escolher um deles depois, nao diga que vai pesquisar tudo de novo; apenas siga com os dados finais que faltarem
- Depois de escolher, vai precisar do endereco e do nome - pode mencionar de forma natural
- Nao invente horarios que nao estejam na lista acima
- Nunca use frases template como "Os proximos horarios realmente disponiveis sao" ou "Qual desses funciona melhor?" de forma mecanica
- Fale como se fosse uma conversa normal de WhatsApp, de forma conversacional e natural${instrucaoPrompt}`;
  }

  let categoryDirective = "";
  switch (input.category) {
    case "NAME_REQUEST":
      categoryDirective = "Preciso que voce peca o nome completo do cliente para finalizar o agendamento. Fale de forma natural e gentil, como uma atendente real.";
      break;
    case "ADDRESS_REQUEST":
      categoryDirective = "Preciso que voce peca o endereco completo do cliente para o agendamento. Fale de forma natural e gentil, como uma atendente real.";
      break;
    case "BOOKING_CONFIRMATION":
      categoryDirective = "O agendamento foi confirmado com sucesso. Informe a data e horario ao cliente de forma calorosa e positiva.";
      break;
    case "CANCELLATION":
      categoryDirective = "O agendamento foi cancelado. Informe ao cliente com empatia. Ofereca ajuda para reagendar se precisar.";
      break;
    default:
      categoryDirective = "Responda ao cliente de forma natural mantendo todos os dados.";
      break;
  }

  return `${categoryDirective}

DADOS DO SISTEMA (formato estruturado - nao copie este formato):
---
${structuredReply}
---

Responda de forma natural e humana, como uma IA conversacional inteligente digitando no WhatsApp.
- Mantenha todos os dados: valores R$, horarios, datas, servicos
- Nao adicione informacoes que nao estejam nos dados acima
- Nao diga que vai "verificar" ou "consultar" - os dados sao definitivos
- Nunca copie frases dos dados acima - transforme tudo em linguagem conversacional com suas proprias palavras
- Fale de forma natural, como uma pessoa real conversando${instrucaoPrompt}`;
}
