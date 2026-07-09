type NeuropsiHistoryItem = {
  text?: string | null;
  mediaCaption?: string | null;
  fromMe?: boolean | null;
  isFromAgent?: boolean | null;
};

const NEUROPSI_SHEILA_USER_ID = "760b411d-ba7c-4003-bc5f-2fbd568f571d";

function normalizeNeuropsiText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFFFD/g, "")
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

function isNeuropsiSheilaTenant(params: { userId?: string | null; prompt?: unknown }): boolean {
  if (params.userId === NEUROPSI_SHEILA_USER_ID) return true;
  const prompt = normalizeNeuropsiText(params.prompt);
  return prompt.includes("neuropsicologa sheila ribeiro") && prompt.includes("regina");
}

function hasNeuropsiEvaluationContext(historyText: string, messageText: string): boolean {
  const context = `${historyText} ${messageText}`.trim();
  return /\b(avaliacao|neuropsicologica|neuropsicologico|avaliando|avaliado|avaliada|testes?|laudo|anamnese|devolutiva)\b/.test(context);
}

function extractAges(messageText: string): number[] {
  const ages: number[] = [];
  for (const match of messageText.matchAll(/\b(\d{1,2})\s*(?:anos?|ano)?\b/g)) {
    const age = Number(match[1]);
    if (Number.isFinite(age) && age > 0 && age < 100) {
      ages.push(age);
    }
  }
  return Array.from(new Set(ages));
}

function promptHasDetailedOnlineAssessmentInstructions(prompt: unknown): boolean {
  const text = normalizeNeuropsiText(prompt);
  if (!text.includes("avaliacao online")) return false;
  const requiredSignals = [
    ["anamnese"],
    ["link"],
    ["whatsapp"],
    ["email", "e-mail", "e mail"],
    ["video"],
    ["laudo"],
    ["pdf"],
    ["plataforma oficial"],
  ];
  return requiredSignals.every((signals) => signals.some((signal) => text.includes(signal)));
}

function asksAboutOnlineAssessment(messageText: string, hasEvaluationContext: boolean): boolean {
  if (!hasEvaluationContext) return false;
  return ["online", "remoto", "virtual", "videochamada"].some((signal) => messageText.includes(signal));
}

function mentionsMinorAssessment(messageText: string, ages: number[]): boolean {
  return ages.some((age) => age < 18) || ["filho", "filha", "crianca", "adolescente", "menor"].some((signal) => messageText.includes(signal));
}

export function buildNeuropsiRuntimeResponse(params: {
  userId?: string | null;
  prompt?: unknown;
  message: unknown;
  conversationHistory?: NeuropsiHistoryItem[];
}): string | null {
  if (!isNeuropsiSheilaTenant({ userId: params.userId, prompt: params.prompt })) {
    return null;
  }

  const messageText = normalizeNeuropsiText(params.message);
  if (!messageText) return null;

  const historyText = normalizeNeuropsiText(
    (params.conversationHistory || [])
      .slice(-10)
      .map((entry) => [entry.text, entry.mediaCaption].filter(Boolean).join("\n"))
      .join("\n"),
  );
  const hasEvaluationContext = hasNeuropsiEvaluationContext(historyText, messageText);
  const ages = extractAges(messageText);
  const asksOnlineAssessment = asksAboutOnlineAssessment(messageText, hasEvaluationContext);
  const isMinorAssessment = mentionsMinorAssessment(messageText, ages);

  if (
    asksOnlineAssessment &&
    !isMinorAssessment &&
    promptHasDetailedOnlineAssessmentInstructions(params.prompt)
  ) {
    return null;
  }

  if (/\b(supervisao|supervisionar|supervisao clinica|supervisao de casos|laudos)\b/.test(messageText)) {
    return [
      "*Regina:*",
      "A supervisao clinica tem estes valores: avulsa R$ 200; um caso completo R$ 400; varios casos R$ 600 por mes ate a estruturacao do ultimo laudo contratado.",
    ].join("\n");
  }

  if (/\b(parcelamento|parcelar|parcelas?|cartao|credito|pix|dinheiro|juros|taxa|desconto|pagamento|pagar)\b/.test(messageText)) {
    return [
      "*Regina:*",
      "O pagamento pode ser combinado em cartao, Pix ou dinheiro.",
      "A equipe confirma as condicoes e parcelas no atendimento, sem eu prometer quantidade de parcelas, desconto ou ausencia de juros por aqui.",
    ].join("\n");
  }

  if (/\b(telefone|numero|contato|whatsapp|zap)\b/.test(messageText)) {
    return [
      "*Regina:*",
      "Pode falar por aqui mesmo.",
      "A equipe acompanha este atendimento e confirma os proximos passos por aqui.",
    ].join("\n");
  }

  if (/\b(psicotecnico|psicotecnica|psicotecnicos|teste psicologico|testes psicologicos|carreira policial|carreiras policiais|policial|concurso|concursos)\b/.test(messageText)) {
    return [
      "*Regina:*",
      "Para psicotecnico, concurso ou carreira policial, o servico cadastrado e avaliacao psicologica para concursos, no valor de R$ 600.",
      "Para encaminhar certinho, me diga se o teste foi solicitado por edital, concurso ou outro objetivo. A equipe confirma os proximos passos pelo atendimento.",
    ].join("\n");
  }

  if (/\b(relatorio escolar|escola|documento escolar)\b/.test(messageText)) {
    return [
      "*Regina:*",
      "O relatorio escolar e um documento fornecido pela escola e ajuda a equipe a entender melhor o desenvolvimento da crianca.",
      "Ele pode ser solicitado junto com outros dados da avaliacao, mas a equipe confere certinho no atendimento.",
    ].join("\n");
  }

  if (/\b(encaminhamento|papel|documento|laudo anterior|relatorio|imagem)\b/.test(messageText)) {
    return [
      "*Regina:*",
      "Esse documento pode ajudar a equipe a entender o caso, mas eu nao consigo validar ou interpretar documento medico por aqui.",
      "Pode enviar para a equipe conferir no atendimento. Para seguir, qual e o motivo principal da avaliacao?",
    ].join("\n");
  }

  if (/\b(como funciona|dias|sessoes|sessao|uma vez|passo a passo|quantas vezes|irao|iram)\b/.test(messageText) && hasEvaluationContext) {
    return [
      "*Regina:*",
      "A avaliacao neuropsicologica costuma ter 1 sessao de anamnese com o responsavel, de 3 a 5 sessoes de testes conforme a necessidade, e 1 devolutiva com entrega e orientacao do laudo.",
      "Para menores de 18 anos, a avaliacao e presencial.",
    ].join("\n");
  }

  if (/\b(online|remoto|virtual|videochamada)\b/.test(messageText) && hasEvaluationContext) {
    if (isMinorAssessment) {
      return [
        "*Regina:*",
        "Para menores de 18 anos, a avaliacao neuropsicologica deve ser presencial.",
        "A equipe confirma os proximos passos depois de entender idade, motivo da avaliacao e indicacao.",
      ].join("\n");
    }
    return [
      "*Regina:*",
      "Para adultos com 18 anos ou mais, a avaliacao neuropsicologica pode ser online conforme o caso.",
      "A equipe confirma o formato depois de entender o motivo da avaliacao e a indicacao.",
    ].join("\n");
  }

  if (/\b(evelyn|liliane|dr lucas|doutor lucas|fono)\b/.test(messageText) && !hasEvaluationContext) {
    return [
      "*Regina:*",
      "Entendi a indicacao. O que voce procura: avaliacao neuropsicologica, psicoterapia ou supervisao?",
    ].join("\n");
  }

  if (/\b(avaliacao neuropsicologica|avaliacao neuropsicologico|neuropsicologica|neuropsicologico|avalia\w*\s+neuropsicol\w*|neuropsicol\w*)\b/.test(messageText)) {
    return ["*Regina:*", "Qual a idade de quem sera avaliado?"].join("\n");
  }

  if (ages.length > 0 && hasEvaluationContext) {
    if (ages.length >= 2) {
      return [
        "*Regina:*",
        `Entendi, sao ${ages.length} criancas: ${ages.join(" e ")} anos.`,
        "A avaliacao e para todas elas? Qual e o motivo principal de cada avaliacao?",
      ].join("\n");
    }

    return [
      "*Regina:*",
      `Entendi, ${ages[0]} anos.`,
      "Qual e o motivo principal da avaliacao e quem indicou?",
    ].join("\n");
  }

  return null;
}
