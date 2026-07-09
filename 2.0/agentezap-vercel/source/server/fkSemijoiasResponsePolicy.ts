export type FkSemijoiasMediaAction = Record<string, any>;

const FK_SEMIJOIAS_GREETING = "Ola, futura revendedora Fk Semijoias, qual o seu nome?";
const FK_SEMIJOIAS_CATALOG_FALLBACK = "Essa informacao eu nao tenho aqui comigo, mas nosso setor de consignados pode te ajudar com isso!";
const FK_SEMIJOIAS_VIDEO_MEDIA_NAME = "VIDEO_SEMIJOIAS";
const FK_SEMIJOIAS_VIDEO_REPLY = "Vou te enviar um video com as pecas para voce conferir!";
const FK_SEMIJOIAS_CATALOG_WITH_CONTEXT_PREFIX = "Vou te enviar o catalogo das pecas.";
const FK_SEMIJOIAS_FICHA_MEDIA_NAME = "FICHA_REVENDEDORA_FK";
const FK_SEMIJOIAS_FICHA_ALREADY_SENT_REPLY = "Pode preencher os dados da ficha por aqui. Se algum campo ficar faltando, eu te aviso.";
const FK_SEMIJOIAS_REGISTRATION_RECEIVED_REPLY = "Muito obrigado. Agora e so aguardar que nosso setor de consignados entrara em contato com voce.";
const FK_SEMIJOIAS_POST_REGISTRATION_TIMELINE_REPLY = "Boa tarde. O retorno do setor de consignados e em ate 3 dias uteis. Fica de olho por aqui, porque eles conferem a ficha e entram em contato pelo WhatsApp.";
const FK_SEMIJOIAS_FICHA_CONSENT_REPLY = "Posso te enviar a ficha de cadastro por aqui para avaliarmos sua entrada como revendedora FK?";
const FK_SEMIJOIAS_REQUIRED_REGISTRATION_FIELDS = [
  "nome completo",
  "CPF",
  "data de nascimento",
  "endereco",
  "bairro",
  "CEP",
  "e-mail",
  "telefone",
  "emprego formal/CLT",
  "referencia 1 com telefone",
  "referencia 2 com telefone",
] as const;
const FK_SEMIJOIAS_CONSIGNADO_INFO_REPLY = [
  "Prazer, eu me chamo Franciele.",
  "Agora vou te explicar certinho como funcionam nossas maletas no consignado.",
  "",
  "E bem simples: voce preenche nossa ficha de cadastro e a equipe inicia a montagem da sua maleta. Depois disso, voce recebe a maleta na sua casa, sem custo inicial. Daqui a 30 dias, a equipe faz o fechamento e voce paga somente pelo que vender.",
  "",
  "A comissao pode ser de 20%, 30%, 40% ou 50%, conforme o valor vendido.",
  "",
  "Posso te enviar por aqui mesmo a ficha de cadastro?",
].join("\n");
const FK_SEMIJOIAS_COMMISSION_TABLE_REPLY = [
  "A comissao funciona assim:",
  "20% ate R$ 499,00 em vendas",
  "30% de R$ 500,00 a R$ 4.999,00",
  "40% de R$ 5.000,00 a R$ 7.999,00",
  "50% acima de R$ 8.000,00",
].join("\n");

function normalizeFkSemijoiasText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanFkSemijoiasOfficialAddress(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isFkSemijoiasBusinessLocationQuestion(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized) return false;
  if (/\b(meu|minha|moro|resido|entrega|cliente)\b.{0,30}\b(endereco|rua|avenida|av|bairro|cep)\b/.test(normalized)) {
    return false;
  }
  return (
    /\b(onde fica|onde voces ficam|onde vcs ficam|onde e a loja|loja fisica|localizacao|como chegar|mapa)\b/.test(normalized) ||
    /\b(qual|me passa|manda|envia|pode passar)\b.{0,30}\bendereco\b/.test(normalized) ||
    /\bendereco\b.{0,30}\b(voces|vcs|loja|fk|semijoias)\b/.test(normalized) ||
    /\b(de onde|da onde)\b.{0,20}\b(voces|vcs|voce|vc|loja|empresa|fk)\b/.test(normalized) ||
    /\b(voces|vcs|voce|vc|loja|empresa|fk)\b.{0,20}\b(de onde|da onde)\b/.test(normalized) ||
    /\batendem onde\b/.test(normalized) ||
    /\bposso ir\b.{0,20}\b(loja|ai|presencial)\b/.test(normalized)
  );
}

function buildFkSemijoiasOfficialAddressReply(officialAddress: unknown): string | null {
  const address = cleanFkSemijoiasOfficialAddress(officialAddress);
  if (!address) return null;
  return `Sou a Franciele, atendente da FK Semijoias. Nosso endereco e ${address}. Atendemos presencialmente Londrina e regiao.`;
}

export function isFkSemijoiasPrompt(prompt: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(prompt);
  return normalized.includes("fk semijoias") && normalized.includes("franciele");
}

function isFkSemijoiasCatalogOrPriceRequest(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (isFkSemijoiasCommissionTableRequest(normalized)) return false;
  if (isFkSemijoiasBusinessValueQuestion(normalized) || isFkSemijoiasWarrantyOrQualityQuestion(normalized)) {
    return false;
  }
  return (
    /\b(catalogo|catalogos)\b/.test(normalized) ||
    /\blink\b.{0,30}\b(catalogo|pecas|produtos)\b/.test(normalized) ||
    /\b(tabela|preco|precos|valor|valores)\b.{0,35}\b(peca|pecas|produto|produtos|brinco|brincos|anel|aneis|colar|colares|pulseira|pulseiras|corrente|correntes)\b/.test(normalized) ||
    /\b(peca|pecas|produto|produtos|brinco|brincos|anel|aneis|colar|colares|pulseira|pulseiras|corrente|correntes)\b.{0,35}\b(tabela|preco|precos|valor|valores)\b/.test(normalized)
  );
}

function isFkSemijoiasSpecificFlowOrMediaRequest(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  return /\b(ficha|cadastro|cpf|video|videos|foto|fotos|peca|pecas|mostruario|maleta|maletas|consignado|comissao|endereco|instagram|score|spc|serasa)\b/.test(normalized);
}

function isFkSemijoiasProductOrVideoRequest(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  return /\b(video|videos|foto|fotos|peca|pecas|produto|produtos|brinco|brincos|anel|aneis|colar|colares|pulseira|pulseiras|corrente|correntes|mostruario|codigo)\b/.test(normalized);
}

function isFkSemijoiasWarrantyOrQualityQuestion(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized) return false;
  return (
    /\b(garantia|garante|garantem|garantido|garantida|qualidade|boas|boa|banho|banhada|banhadas|banhado|18k|ouro)\b/.test(normalized) ||
    /\b(descasca|descascam|escurece|escurecem|defeito|troca)\b/.test(normalized)
  );
}

function isFkSemijoiasBusinessValueQuestion(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized) return false;
  const asksValue = /\b(valor|valores|preco|precos|custo|quanto|passa|passar|deixa|deixar|recebo|recebe|entrega|cidade|apucarana)\b/.test(normalized);
  const sellingContext = /\b(revender|revenda|vender|venda|vendendo|consignado|consignar|consignacao|maleta|maletas|mostruario|casa)\b/.test(normalized);
  return asksValue && sellingContext;
}

function buildFkSemijoiasQualityContextReply(prompt: unknown): string {
  const normalizedPrompt = normalizeFkSemijoiasText(prompt);
  const has18k = /\b18k\b/.test(normalizedPrompt) && /\b(banhad|ouro)\b/.test(normalizedPrompt);
  const hasOneYearWarranty = /\b(1|um)\b.{0,10}\bano\b.{0,40}\bgarantia\b/.test(normalizedPrompt) || /\bgarantia\b.{0,40}\b(1|um)\b.{0,10}\bano\b/.test(normalizedPrompt);

  if (has18k && hasOneYearWarranty) {
    return "As pecas sao banhadas a ouro 18k e tem garantia de 1 ano no banho.";
  }
  if (hasOneYearWarranty) {
    return "As pecas tem garantia de 1 ano.";
  }
  return FK_SEMIJOIAS_CATALOG_FALLBACK;
}

function isFkSemijoiasCommissionTableRequest(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized) return false;
  const hasCommissionWord = normalized.includes("comiss");
  const asksEarnings = /\b(quanto|qual|quais|como)\b.{0,30}\b(ganho|ganha|ganhar|vender|vendendo|venda|vendas)\b/.test(normalized);
  if (!hasCommissionWord && !asksEarnings) return false;
  return (
    hasCommissionWord ||
    asksEarnings ||
    normalized.includes("tabela") ||
    normalized.includes("faixa") ||
    normalized.includes("faixas") ||
    normalized.includes("porcentagem") ||
    normalized.includes("percentual") ||
    normalized.includes("quanto ganho") ||
    normalized.includes("quanto eu ganho") ||
    normalized.includes("como funciona") ||
    normalized.includes("me explica") ||
    normalized.includes("explica")
  );
}

function isFkSemijoiasConsignadoInfoRequest(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized) return false;
  if (isFkSemijoiasCommissionTableRequest(message)) return false;
  if (isFkSemijoiasProductOrVideoRequest(message)) return false;
  return (
    /\b(maleta|maletas|consignado|consignar|consignacao|sem custo|custo inicial|30 dias|como funciona|mais informacoes|informacoes|tenho interesse|quero fazer cadastro|fazer cadastro|cadastro)\b/.test(normalized) ||
    /\b(pegar|pega|quero|queria|gostaria|pretendo|posso)\b.{0,30}\b(vender|revender)\b/.test(normalized)
  );
}

function isFkSemijoiasFichaConsentNeeded(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized) return false;
  if (isFkSemijoiasRegistrationDataMessage(message) || isFkSemijoiasExplicitFichaConfirmation(message)) {
    return false;
  }
  return (
    normalized.includes("cpf") ||
    normalized.includes("score") ||
    normalized.includes("spc") ||
    normalized.includes("serasa") ||
    normalized.includes("ficha") ||
    normalized.includes("cadastro")
  );
}

function getFkSemijoiasRegistrationSignalCount(message: unknown): number {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized) return 0;

  const hasCpf = /\bcpf\b/.test(normalized) || /\b\d{11}\b/.test(normalized);
  const hasBirthDate = (
    /\b(nascimento|data de nascimento)\b/.test(normalized) ||
    /\b\d{1,2}\s+\d{1,2}\s+\d{2,4}\b/.test(normalized)
  );
  const signals = [
    hasCpf,
    hasBirthDate,
    /\b(endereco|rua|avenida|travessa|bairro)\b/.test(normalized),
    /\bcep\b/.test(normalized) || /\b\d{8}\b/.test(normalized) || /\b\d{5}\s*\d{3}\b/.test(normalized),
    /\b(email|e mail|gmail|hotmail|outlook|icloud|yahoo)\b/.test(normalized),
    /\b(telefone|fone|celular|whatsapp)\b/.test(normalized) || /\b(?:55)?\d{10,11}\b/.test(normalized),
    /\b(clt|emprego|formal|trabalha|trabalho)\b/.test(normalized),
    /\b(referencia|referencias)\b/.test(normalized),
  ].filter(Boolean).length;

  return hasCpf && signals >= 2 ? Math.max(signals, 4) : signals;
}

function countFkSemijoiasReferenceBlocks(value: unknown): number {
  const normalized = normalizeFkSemijoiasText(value);
  if (!normalized) return 0;

  const phoneLikeMatches = normalized.match(/\b(?:55\s*)?(?:\d{2}\s*)?\d{4,5}\s*\d{4}\b/g) || [];
  const uniquePhoneLikes = new Set(
    phoneLikeMatches
      .map((match) => match.replace(/\D/g, ""))
      .filter((digits) => digits.length >= 8 && digits.length <= 13)
  );

  const referencesWithPhone = new Set<number>();
  for (const index of [1, 2] as const) {
    const pattern = new RegExp(`\\breferencia\\s*${index}\\b.{0,140}\\b(?:55\\s*)?(?:\\d{2}\\s*)?\\d{4,5}\\s*\\d{4}\\b`);
    if (pattern.test(normalized)) {
      referencesWithPhone.add(index);
    }
  }
  if (referencesWithPhone.size >= 2) return 2;

  const genericReferenceMatches = normalized
    .split(/\breferencia\b/g)
    .slice(1)
    .filter((segment) => /\b(?:55\s*)?(?:\d{2}\s*)?\d{4,5}\s*\d{4}\b/.test(segment.slice(0, 140)))
    .length;
  if (genericReferenceMatches > 0 || referencesWithPhone.size > 0) {
    return Math.min(2, Math.max(referencesWithPhone.size, genericReferenceMatches));
  }

  return uniquePhoneLikes.size >= 4 ? 2 : 0;
}

function hasFkSemijoiasLikelyUnlabeledName(value: unknown): boolean {
  const raw = String(value || "");
  const cpfMatch = raw.match(/\b(?:cpf\D*)?\d{3}\D?\d{3}\D?\d{3}\D?\d{2}\b/i);
  if (!cpfMatch || typeof cpfMatch.index !== "number") return false;

  const beforeCpf = raw.slice(0, cpfMatch.index);
  const candidate = beforeCpf
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();
  if (!candidate) return false;

  const normalizedCandidate = normalizeFkSemijoiasText(candidate);
  if (
    !normalizedCandidate ||
    /\b(referencia|telefone|cpf|cep|endereco|rua|avenida|bairro|email|nascimento|data|clt|trabalho)\b/.test(normalizedCandidate)
  ) {
    return false;
  }

  const words = normalizedCandidate
    .split(/\s+/)
    .filter((word) => /^[a-z]{2,}$/.test(word));
  return words.length >= 2 && words.length <= 6;
}

function getFkSemijoiasCompleteRegistrationFields(value: unknown): Set<string> {
  const raw = String(value || "");
  const normalized = normalizeFkSemijoiasText(raw);
  const fields = new Set<string>();
  if (!normalized) return fields;

  if (
    /\bnome\s+completo\b/.test(normalized) ||
    /\brevendedora\s+fk\b[\s\S]*\bnome\b/.test(normalized) ||
    hasFkSemijoiasLikelyUnlabeledName(raw)
  ) {
    fields.add("nome completo");
  }
  if (/\bcpf\b/.test(normalized) || /\b\d{11}\b/.test(normalized)) {
    fields.add("CPF");
  }
  if (/\b(data\s+de\s+nascimento|nascimento)\b/.test(normalized) || /\b\d{1,2}\s+\d{1,2}\s+\d{2,4}\b/.test(normalized)) {
    fields.add("data de nascimento");
  }
  if (/\b(endereco|rua|avenida|travessa|logradouro)\b/.test(normalized)) {
    fields.add("endereco");
  }
  if (/\bbairro\b/.test(normalized) || /\bjardim\s+[a-z]/.test(normalized)) {
    fields.add("bairro");
  }
  if (/\bcep\b/.test(normalized) || /\b\d{8}\b/.test(normalized) || /\b\d{5}\s*\d{3}\b/.test(normalized)) {
    fields.add("CEP");
  }
  if (/\b(e\s*mail|email|gmail|hotmail|outlook|icloud|yahoo)\b/.test(normalized) || /[^\s@]+@[^\s@]+\.[^\s@]+/.test(raw)) {
    fields.add("e-mail");
  }
  if (/\b(telefone|fone|celular|whatsapp)\b/.test(normalized) || /\b(?:55)?\d{10,11}\b/.test(normalized)) {
    fields.add("telefone");
  }
  if (/\b(clt|emprego\s+formal|formal|trabalha|trabalho|funcionaria|funcionario|aposentada|aposentado|autonoma|autonomo|desempregada|desempregado|do lar)\b/.test(normalized)) {
    fields.add("emprego formal/CLT");
  }

  const referenceCount = countFkSemijoiasReferenceBlocks(raw);
  if (referenceCount >= 1) fields.add("referencia 1 com telefone");
  if (referenceCount >= 2) fields.add("referencia 2 com telefone");
  return fields;
}

function getFkSemijoiasMissingRegistrationFields(value: unknown): string[] {
  const fields = getFkSemijoiasCompleteRegistrationFields(value);
  return FK_SEMIJOIAS_REQUIRED_REGISTRATION_FIELDS.filter((field) => !fields.has(field));
}

function isFkSemijoiasCompleteRegistrationDataMessage(message: unknown): boolean {
  return getFkSemijoiasMissingRegistrationFields(message).length === 0;
}

function buildFkSemijoiasMissingRegistrationFieldsReply(message: unknown): string {
  const missing = getFkSemijoiasMissingRegistrationFields(message);
  const list = missing.length > 0 ? missing.join(", ") : "os dados que faltam";
  return `Ainda falta completar a ficha com: ${list}. Pode me enviar esses dados por aqui?`;
}

function getFkSemijoiasRegistrationTextAfterFicha(
  history: Array<{ role?: string; content?: string }> | undefined,
  currentMessage: unknown
): string {
  const parts: string[] = [];
  let fichaSeen = false;

  if (Array.isArray(history)) {
    for (const entry of history) {
      const content = String(entry?.content || "").trim();
      if (!content) continue;
      if (entry?.role === "assistant" && hasFkSemijoiasFichaText(content)) {
        fichaSeen = true;
        continue;
      }
      if (fichaSeen && entry?.role === "user") {
        parts.push(content);
      }
    }
  }

  const currentText = String(currentMessage || "").trim();
  if (currentText) {
    parts.push(currentText);
  }

  return parts.length > 0 ? parts.join("\n") : currentText;
}

function isFkSemijoiasRegistrationDataMessage(message: unknown): boolean {
  return getFkSemijoiasRegistrationSignalCount(message) >= 4;
}

function hasFkSemijoiasRegistrationDataInHistory(history: Array<{ role?: string; content?: string }> | undefined): boolean {
  return Array.isArray(history) && history.some((entry) =>
    entry?.role === "user" && isFkSemijoiasRegistrationDataMessage(entry?.content)
  );
}

function hasFkSemijoiasCompleteRegistrationDataInHistory(history: Array<{ role?: string; content?: string }> | undefined): boolean {
  return Array.isArray(history) && history.some((entry) =>
    entry?.role === "user" && isFkSemijoiasCompleteRegistrationDataMessage(entry?.content)
  );
}

function hasFkSemijoiasFragmentedRegistrationDataInHistory(history: Array<{ role?: string; content?: string }> | undefined): boolean {
  if (!Array.isArray(history) || !hasFkSemijoiasFichaInHistory(history)) return false;
  const combinedUserText = history
    .filter((entry) => entry?.role === "user")
    .map((entry) => String(entry?.content || ""))
    .join("\n");
  return getFkSemijoiasRegistrationSignalCount(combinedUserText) >= 5;
}

function hasFkSemijoiasCompleteFragmentedRegistrationDataInHistory(history: Array<{ role?: string; content?: string }> | undefined): boolean {
  if (!Array.isArray(history) || !hasFkSemijoiasFichaInHistory(history)) return false;
  const combinedUserText = history
    .filter((entry) => entry?.role === "user")
    .map((entry) => String(entry?.content || ""))
    .join("\n");
  return isFkSemijoiasCompleteRegistrationDataMessage(combinedUserText);
}

function hasFkSemijoiasRegistrationReceivedAckInHistory(history: Array<{ role?: string; content?: string }> | undefined): boolean {
  return Array.isArray(history) && history.some((entry) => {
    if (entry?.role !== "assistant") return false;
    const normalized = normalizeFkSemijoiasText(entry?.content);
    return normalized.includes("agora e so aguardar") && normalized.includes("setor de consignados");
  });
}

function isFkSemijoiasRegistrationDataFollowupMessage(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized) return false;
  return (
    /\b(qual|que)\s+ficha\b/.test(normalized) ||
    /\b(ja)\s+(mandei|enviei|preenchi)\b/.test(normalized) ||
    /\b(ficha|cadastro)\s+(ja)\s+(foi|esta)\s+(mandada|enviada|preenchida)\b/.test(normalized)
  );
}

function isFkSemijoiasPostRegistrationTimelineQuestion(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized) return false;
  const asksTiming = /\b(demora|demorar|quanto\s+tempo|prazo|quando|retorno|retorna|retornar|chama|chamam|contato|entrar\s+em\s+contato|entrarem\s+em\s+contato)\b/.test(normalized);
  const postRegistrationContext = /\b(eles|setor|consignado|consignados|analise|analisar|ficha|cadastro|dados)\b/.test(normalized);
  return asksTiming && postRegistrationContext;
}

function isFkSemijoiasMissingRegistrationFieldReply(reply: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(reply);
  if (!normalized) return false;
  const asksForMissingField = /\b(preciso|falta|faltam|faltando|envie|enviar|manda|mande|me\s+envia|me\s+mande)\b/.test(normalized);
  const namesSpecificField = /\b(cpf|cep|email|e mail|referencia|referencias|telefone|fone|celular|bairro|nascimento|endereco|clt|nome\s+completo)\b/.test(normalized);
  return asksForMissingField && namesSpecificField;
}

function hasFkSemijoiasVideoPromise(text: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(text);
  return (
    /\b(vou|posso|consigo)\b.{0,40}\b(enviar|mandar)\b.{0,40}\bvideo\b/.test(normalized) ||
    normalized.includes("video com as pecas")
  );
}

function hasFkSemijoiasVideoInHistory(history: Array<{ role?: string; content?: string }> | undefined): boolean {
  return Array.isArray(history) && history.some((entry) => {
    if (entry?.role !== "assistant") return false;
    const normalized = normalizeFkSemijoiasText(entry?.content);
    return (
      normalized === "video" ||
      normalized.includes("media video semijoias") ||
      normalized.includes("video com as pecas") ||
      normalized.includes("catalogo das pecas")
    );
  });
}

function isFkSemijoiasVideoMediaAction(action: FkSemijoiasMediaAction): boolean {
  const normalizedName = normalizeFkSemijoiasText(action?.media_name || action?.mediaName || action?.name || "");
  const normalizedType = normalizeFkSemijoiasText(action?.media_type || action?.mediaType || action?.type || "");
  return normalizedName === "video semijoias" || normalizedType === "video" || normalizedType === "send video";
}

function buildFkSemijoiasVideoAction(): FkSemijoiasMediaAction {
  return { type: "send_media", media_name: FK_SEMIJOIAS_VIDEO_MEDIA_NAME };
}

function buildFkSemijoiasFichaAction(): FkSemijoiasMediaAction {
  return { type: "send_media", media_name: FK_SEMIJOIAS_FICHA_MEDIA_NAME };
}

function ensureFkSemijoiasVideoAction(actions: FkSemijoiasMediaAction[]): FkSemijoiasMediaAction[] {
  const withoutOpening = dropGreetingOpeningActions(actions);
  if (withoutOpening.some(isFkSemijoiasVideoMediaAction)) {
    return withoutOpening;
  }
  return [...withoutOpening, buildFkSemijoiasVideoAction()];
}

function ensureFkSemijoiasFichaAction(actions: FkSemijoiasMediaAction[]): FkSemijoiasMediaAction[] {
  const withoutOpeningAndVideo = dropFkSemijoiasOpeningAndVideoActions(actions)
    .filter((action) => !isFkSemijoiasFichaMediaAction(action));
  return [...withoutOpeningAndVideo, buildFkSemijoiasFichaAction()];
}

function isFkSemijoiasFichaMediaAction(action: FkSemijoiasMediaAction): boolean {
  const normalizedName = normalizeFkSemijoiasText(action?.media_name || action?.mediaName || action?.name || "");
  const normalizedText = normalizeFkSemijoiasText(action?.text || action?.caption || "");
  return (
    normalizedName.includes("ficha") ||
    normalizedName.includes("revendedora") ||
    hasFkSemijoiasFichaText(normalizedText)
  );
}

function hasFkSemijoiasFichaText(value: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(value);
  if (!normalized) return false;
  if (
    (normalized.includes("posso te enviar") || normalized.includes("quer que eu te envie")) &&
    !normalized.includes("cpf")
  ) {
    return false;
  }
  return (
    (normalized.includes("ficha de cadastro") && normalized.includes("cpf")) ||
    (normalized.includes("nome completo") && normalized.includes("cpf")) ||
    (normalized.includes("revendedora fk") && normalized.includes("cpf")) ||
    (normalized.includes("dados") && normalized.includes("cadastro") && normalized.includes("cpf"))
  );
}

function hasFkSemijoiasFichaInHistory(history: Array<{ role?: string; content?: string }> | undefined): boolean {
  return Array.isArray(history) && history.some((entry) =>
    entry?.role === "assistant" && hasFkSemijoiasFichaText(entry?.content)
  );
}

function hasFkSemijoiasFichaOfferInHistory(history: Array<{ role?: string; content?: string }> | undefined): boolean {
  return Array.isArray(history) && history.some((entry) => {
    if (entry?.role !== "assistant") return false;
    const normalized = normalizeFkSemijoiasText(entry?.content);
    return (
      normalized.includes("posso te enviar") &&
      normalized.includes("ficha") &&
      normalized.includes("cadastro")
    );
  });
}

function hasFkSemijoiasConsignadoInfoOfferInHistory(history: Array<{ role?: string; content?: string }> | undefined): boolean {
  return Array.isArray(history) && history.some((entry) => {
    if (entry?.role !== "assistant") return false;
    const normalized = normalizeFkSemijoiasText(entry?.content);
    return (
      normalized.includes("posso te explicar") &&
      normalized.includes("maletas") &&
      normalized.includes("consignado")
    );
  });
}

function isFkSemijoiasShortAffirmative(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized) return false;
  const shortAffirmatives = new Set([
    "sim",
    "sim pode",
    "sim, pode",
    "sim pode sim",
    "sim pode mandar",
    "sim pode enviar",
    "sim sim",
    "ss",
    "s",
    "ok",
    "okay",
    "pode",
    "pode explicar",
    "pode sim",
    "pode ser",
    "pode mandar",
    "pode manda",
    "pode enviar",
    "pode sim mandar",
    "pode sim enviar",
    "manda",
    "manda sim",
    "mande",
    "envia",
    "envia sim",
    "quero",
    "quero sim",
    "claro",
    "isso",
    "isso mesmo",
    "ta",
    "ta bom",
  ]);
  return shortAffirmatives.has(normalized) || /\bpode\b.{0,30}\bexplicar\b/.test(normalized);
}

function isFkSemijoiasExplicitFichaConfirmation(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized || !/\b(ficha|cadastro|formulario|formulario)\b/.test(normalized)) return false;
  return /\b(sim|quero|pode|pode enviar|envia|mande|manda|preencher|preencho|fazer)\b/.test(normalized);
}

function isFkSemijoiasFichaConfirmationRequest(params: {
  message: unknown;
  history?: Array<{ role?: string; content?: string }>;
}): boolean {
  return (
    isFkSemijoiasExplicitFichaConfirmation(params.message) ||
    (isFkSemijoiasShortAffirmative(params.message) && hasFkSemijoiasFichaOfferInHistory(params.history))
  );
}

function isFkSemijoiasNameQuestionText(value: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(value);
  return normalized.includes("qual o seu nome") || normalized.includes("me diga seu nome");
}

function hasFkSemijoiasNameQuestionInHistory(history: Array<{ role?: string; content?: string }> | undefined): boolean {
  return Array.isArray(history) && history.some((entry) =>
    entry?.role === "assistant" && isFkSemijoiasNameQuestionText(entry?.content)
  );
}

function hasFkSemijoiasNameAnswerAfterQuestionInHistory(history: Array<{ role?: string; content?: string }> | undefined): boolean {
  if (!Array.isArray(history)) return false;
  let nameWasAsked = false;
  for (const entry of history) {
    if (entry?.role === "assistant" && isFkSemijoiasNameQuestionText(entry?.content)) {
      nameWasAsked = true;
      continue;
    }
    if (nameWasAsked && entry?.role === "user" && isFkSemijoiasLikelyNameAnswer(entry?.content)) {
      return true;
    }
  }
  return false;
}

function isFkSemijoiasLikelyNameAnswer(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized || normalized.length > 60 || /\d/.test(normalized)) return false;
  if (isFkSemijoiasShortAffirmative(message)) return false;
  if (new Set(["obrigado", "obrigada", "valeu", "beleza", "certo", "certinho"]).has(normalized)) return false;
  if (/\b(ficha|cadastro|cpf|catalogo|preco|valor|video|foto|comissao|endereco|score|spc|serasa|vender|revender|consignado|consignar|consignacao|maleta|maletas|como|funciona|interesse|informacao|informacoes|quero|queria|gostaria|fazer|voce|vc|quem|onde|qual|loja|empresa|atendente|linguagem)\b/.test(normalized)) {
    return false;
  }
  return /^[a-z]+(?:\s+[a-z]+){0,3}$/.test(normalized);
}

function isFkSemijoiasGenericInitialInterest(message: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(message);
  if (!normalized) return false;
  if (isFkSemijoiasCatalogOrPriceRequest(normalized) || isFkSemijoiasSpecificFlowOrMediaRequest(normalized)) {
    return false;
  }
  return (
    /\btenho interesse\b/.test(normalized) ||
    /\b(pegar|pega|quero|queria|gostaria|pretendo|posso)\b.{0,30}\b(vender|revender)\b/.test(normalized) ||
    /\b(para|pra)\b.{0,10}\b(vender|revender)\b/.test(normalized) ||
    /\bquero mais informacoes\b/.test(normalized) ||
    /\bqueria mais informacoes\b/.test(normalized) ||
    /\bgostaria de mais informacoes\b/.test(normalized) ||
    /\bmais informacoes\b/.test(normalized) ||
    /\bcomo funciona\b/.test(normalized) ||
    /\bconverse conosco\b/.test(normalized)
  );
}

function hasFkSemijoiasCatalogDigitalPromise(text: unknown): boolean {
  const normalized = normalizeFkSemijoiasText(text);
  return (
    normalized.includes("aqui vai o catalogo digital") ||
    normalized.includes("enviei nosso catalogo completo") ||
    normalized.includes("catalogo digital com todas as pecas") ||
    (normalized.includes("catalogo digital") && normalized.includes("tabela")) ||
    (normalized.includes("catalogo") && normalized.includes("comiss")) ||
    (normalized.includes("catalogo digital") && normalized.includes("pecas") && normalized.includes("valores")) ||
    (normalized.includes("catalogo completo") && normalized.includes("tabela de precos")) ||
    (normalized.includes("catalogo") && normalized.includes("tabela de precos"))
  );
}

function isGreetingOpeningAction(action: FkSemijoiasMediaAction): boolean {
  return String(action?.opening_flow_source || "") === "greeting";
}

function getGreetingOpeningText(actions: FkSemijoiasMediaAction[]): string {
  const textAction = actions.find((action) =>
    isGreetingOpeningAction(action) &&
    String(action?.type || "") === "send_text" &&
    String(action?.text || "").trim()
  );
  return String(textAction?.text || FK_SEMIJOIAS_GREETING).trim();
}

function dropGreetingOpeningActions(actions: FkSemijoiasMediaAction[]): FkSemijoiasMediaAction[] {
  return actions.filter((action) => !isGreetingOpeningAction(action));
}

function dropFkSemijoiasOpeningAndVideoActions(actions: FkSemijoiasMediaAction[]): FkSemijoiasMediaAction[] {
  return actions.filter((action) => !isGreetingOpeningAction(action) && !isFkSemijoiasVideoMediaAction(action));
}

export function applyFkSemijoiasResponsePolicy(params: {
  prompt: unknown;
  message: unknown;
  history?: Array<{ role?: string; content?: string }>;
  responseText: string;
  mediaActions: FkSemijoiasMediaAction[];
  isFirstAgentResponse?: boolean;
  officialAddress?: unknown;
}): { text: string; mediaActions: FkSemijoiasMediaAction[]; applied: string[] } {
  let text = String(params.responseText || "").trim();
  let mediaActions = Array.isArray(params.mediaActions) ? params.mediaActions : [];
  const applied: string[] = [];

  if (!isFkSemijoiasPrompt(params.prompt)) {
    return { text, mediaActions, applied };
  }

  const firstAgentResponse = params.isFirstAgentResponse ?? !(
    Array.isArray(params.history) &&
    params.history.some((entry) => entry?.role === "assistant")
  );
  const greetingText = getGreetingOpeningText(mediaActions);
  const hasGreetingAction = mediaActions.some(isGreetingOpeningAction);
  const hasVideoAction = mediaActions.some(isFkSemijoiasVideoMediaAction);
  const commissionTableRequest = isFkSemijoiasCommissionTableRequest(params.message);
  const consignadoInfoRequest = isFkSemijoiasConsignadoInfoRequest(params.message);
  const businessValueQuestion = isFkSemijoiasBusinessValueQuestion(params.message);
  const warrantyOrQualityQuestion = isFkSemijoiasWarrantyOrQualityQuestion(params.message);
  const catalogOrPriceRequest = isFkSemijoiasCatalogOrPriceRequest(params.message);
  const productOrVideoRequest = !warrantyOrQualityQuestion && !businessValueQuestion && isFkSemijoiasProductOrVideoRequest(params.message);
  const specificFlowOrMediaRequest = isFkSemijoiasSpecificFlowOrMediaRequest(params.message);
  const registrationDataMessage = isFkSemijoiasRegistrationDataMessage(params.message);
  const accumulatedRegistrationText = getFkSemijoiasRegistrationTextAfterFicha(params.history, params.message);
  const currentRegistrationFields = getFkSemijoiasCompleteRegistrationFields(params.message);
  const completeRegistrationDataMessage = isFkSemijoiasCompleteRegistrationDataMessage(params.message);
  const completeAccumulatedRegistrationDataMessage = isFkSemijoiasCompleteRegistrationDataMessage(accumulatedRegistrationText);
  const partialRegistrationDataMessage = currentRegistrationFields.size > 0 && !completeRegistrationDataMessage;
  const registrationDataInHistory = hasFkSemijoiasRegistrationDataInHistory(params.history);
  const completeRegistrationDataInHistory = hasFkSemijoiasCompleteRegistrationDataInHistory(params.history);
  const fragmentedRegistrationDataInHistory = hasFkSemijoiasFragmentedRegistrationDataInHistory(params.history);
  const completeFragmentedRegistrationDataInHistory = hasFkSemijoiasCompleteFragmentedRegistrationDataInHistory(params.history);
  const registrationReceivedAckInHistory = hasFkSemijoiasRegistrationReceivedAckInHistory(params.history);
  const genericInitialInterest = firstAgentResponse && isFkSemijoiasGenericInitialInterest(params.message);
  const catalogDigitalPromise = hasFkSemijoiasCatalogDigitalPromise(text);
  const videoPromise = hasFkSemijoiasVideoPromise(text);
  const videoAlreadySent = hasFkSemijoiasVideoInHistory(params.history);
  const fichaAlreadySent = hasFkSemijoiasFichaInHistory(params.history);
  const fichaOfferAlreadySent = hasFkSemijoiasFichaOfferInHistory(params.history);
  const consignadoInfoOfferAlreadySent = hasFkSemijoiasConsignadoInfoOfferInHistory(params.history);
  const fichaInCurrentTurn = hasFkSemijoiasFichaText(text) || mediaActions.some(isFkSemijoiasFichaMediaAction);
  const fichaConfirmationRequest = isFkSemijoiasFichaConfirmationRequest({
    message: params.message,
    history: params.history,
  });
  const nameQuestionAlreadySent = hasFkSemijoiasNameQuestionInHistory(params.history);
  const nameAnswerAlreadyReceived = hasFkSemijoiasNameAnswerAfterQuestionInHistory(params.history);
  const officialAddressReply = isFkSemijoiasBusinessLocationQuestion(params.message)
    ? buildFkSemijoiasOfficialAddressReply(params.officialAddress)
    : null;

  if (officialAddressReply) {
    text = officialAddressReply;
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("official_address_reply");
    return { text, mediaActions, applied };
  }

  if (businessValueQuestion && !commissionTableRequest) {
    text = FK_SEMIJOIAS_CONSIGNADO_INFO_REPLY;
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("business_value_no_video");
    return { text, mediaActions, applied };
  }

  if (warrantyOrQualityQuestion) {
    const qualityReply = buildFkSemijoiasQualityContextReply(params.prompt);
    const shouldSendCatalog = !videoAlreadySent;
    text = shouldSendCatalog && qualityReply !== FK_SEMIJOIAS_CATALOG_FALLBACK
      ? `${FK_SEMIJOIAS_CATALOG_WITH_CONTEXT_PREFIX}\n\n${qualityReply}`
      : qualityReply;
    mediaActions = shouldSendCatalog
      ? ensureFkSemijoiasVideoAction(mediaActions)
      : dropFkSemijoiasOpeningAndVideoActions(mediaActions);
    mediaActions = mediaActions.filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("warranty_quality_answer_from_context");
    if (shouldSendCatalog) {
      applied.push("ensure_video_media_after_warranty_quality");
    }
    return { text, mediaActions, applied };
  }

  if (
    ((consignadoInfoRequest && !genericInitialInterest) || fichaConfirmationRequest) &&
    !nameAnswerAlreadyReceived &&
    !isFkSemijoiasLikelyNameAnswer(params.message) &&
    !registrationDataMessage &&
    !fichaAlreadySent
  ) {
    text = greetingText;
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    if (fichaConfirmationRequest) {
      applied.push(nameQuestionAlreadySent ? "ficha_confirmation_before_name_repeat_name_question" : "ficha_confirmation_before_name_to_name_question");
    } else {
      applied.push(nameQuestionAlreadySent ? "consignado_before_name_repeat_name_question" : "consignado_before_name_to_name_question");
    }
    return { text, mediaActions, applied };
  }

  if (
    !firstAgentResponse &&
    !registrationDataMessage &&
    !fichaAlreadySent &&
    !fichaOfferAlreadySent &&
    nameQuestionAlreadySent &&
    !nameAnswerAlreadyReceived &&
    isFkSemijoiasLikelyNameAnswer(params.message) &&
    !commissionTableRequest &&
    !catalogOrPriceRequest &&
    !productOrVideoRequest &&
    !specificFlowOrMediaRequest
  ) {
    text = FK_SEMIJOIAS_CONSIGNADO_INFO_REPLY;
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("name_answer_to_consignado_info");
    return { text, mediaActions, applied };
  }

  if (
    !firstAgentResponse &&
    !registrationDataMessage &&
    !fichaAlreadySent &&
    !fichaOfferAlreadySent &&
    consignadoInfoOfferAlreadySent &&
    isFkSemijoiasShortAffirmative(params.message)
  ) {
    text = FK_SEMIJOIAS_CONSIGNADO_INFO_REPLY;
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("short_affirmative_after_consignado_offer");
    return { text, mediaActions, applied };
  }

  if (
    !firstAgentResponse &&
    !registrationDataMessage &&
    (completeRegistrationDataInHistory || completeFragmentedRegistrationDataInHistory || registrationReceivedAckInHistory) &&
    isFkSemijoiasPostRegistrationTimelineQuestion(params.message)
  ) {
    text = FK_SEMIJOIAS_POST_REGISTRATION_TIMELINE_REPLY;
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("registration_timeline_followup_reply");
    return { text, mediaActions, applied };
  }

  if (
    !firstAgentResponse &&
    !registrationDataMessage &&
    (completeRegistrationDataInHistory || completeFragmentedRegistrationDataInHistory) &&
    isFkSemijoiasRegistrationDataFollowupMessage(params.message)
  ) {
    text = FK_SEMIJOIAS_REGISTRATION_RECEIVED_REPLY;
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("registration_data_history_followup_ack");
    return { text, mediaActions, applied };
  }

  if (
    !firstAgentResponse &&
    !registrationDataMessage &&
    completeFragmentedRegistrationDataInHistory &&
    !commissionTableRequest &&
    !catalogOrPriceRequest &&
    !productOrVideoRequest &&
    !specificFlowOrMediaRequest
  ) {
    text = FK_SEMIJOIAS_REGISTRATION_RECEIVED_REPLY;
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("fragmented_registration_history_ack");
    return { text, mediaActions, applied };
  }

  if (!firstAgentResponse && registrationDataMessage) {
    if (!completeRegistrationDataMessage && !completeAccumulatedRegistrationDataMessage) {
      const keepMissingFieldReply = isFkSemijoiasMissingRegistrationFieldReply(text);
      if (!keepMissingFieldReply) {
        text = buildFkSemijoiasMissingRegistrationFieldsReply(accumulatedRegistrationText);
      }
      mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
        .filter((action) => !isFkSemijoiasFichaMediaAction(action));
      applied.push(keepMissingFieldReply ? "registration_data_no_video_guard" : "registration_data_missing_fields_guard");
      return { text, mediaActions, applied };
    }
    const keepMissingFieldReply = isFkSemijoiasMissingRegistrationFieldReply(text);
    if (!keepMissingFieldReply) {
      text = FK_SEMIJOIAS_REGISTRATION_RECEIVED_REPLY;
    }
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions);
    mediaActions = mediaActions.filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("registration_data_no_video_guard");
    return { text, mediaActions, applied };
  }

  if (!firstAgentResponse && fichaAlreadySent && partialRegistrationDataMessage) {
    text = completeAccumulatedRegistrationDataMessage
      ? FK_SEMIJOIAS_REGISTRATION_RECEIVED_REPLY
      : buildFkSemijoiasMissingRegistrationFieldsReply(accumulatedRegistrationText);
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push(completeAccumulatedRegistrationDataMessage ? "partial_registration_history_ack" : "partial_registration_missing_fields_guard");
    return { text, mediaActions, applied };
  }

  if (commissionTableRequest) {
    text = FK_SEMIJOIAS_COMMISSION_TABLE_REPLY;
    if (!fichaAlreadySent && !fichaOfferAlreadySent) {
      text = `${text}\n\n${FK_SEMIJOIAS_FICHA_CONSENT_REPLY}`;
    }
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("commission_table_no_video");
    return { text, mediaActions, applied };
  }

  if (consignadoInfoRequest && !firstAgentResponse) {
    text = FK_SEMIJOIAS_CONSIGNADO_INFO_REPLY;
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("consignado_info_reply");
    return { text, mediaActions, applied };
  }

  if (firstAgentResponse && fichaInCurrentTurn) {
    text = greetingText;
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("first_response_ficha_to_name_question");
    return { text, mediaActions, applied };
  }

  if (fichaAlreadySent && (fichaInCurrentTurn || fichaConfirmationRequest || isFkSemijoiasShortAffirmative(params.message))) {
    text = FK_SEMIJOIAS_FICHA_ALREADY_SENT_REPLY;
    mediaActions = mediaActions.filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("drop_duplicate_ficha_after_confirmation");
    return { text, mediaActions, applied };
  }

  if (!firstAgentResponse && fichaConfirmationRequest) {
    text = "";
    mediaActions = ensureFkSemijoiasFichaAction(mediaActions);
    applied.push("send_ficha_after_confirmation");
    return { text, mediaActions, applied };
  }

  if (
    !firstAgentResponse &&
    !fichaAlreadySent &&
    !fichaConfirmationRequest &&
    (fichaInCurrentTurn || isFkSemijoiasFichaConsentNeeded(params.message))
  ) {
    text = FK_SEMIJOIAS_FICHA_CONSENT_REPLY;
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions)
      .filter((action) => !isFkSemijoiasFichaMediaAction(action));
    applied.push("ficha_requires_consent");
    return { text, mediaActions, applied };
  }

  if (firstAgentResponse && (catalogOrPriceRequest || productOrVideoRequest || specificFlowOrMediaRequest)) {
    if (
      normalizeFkSemijoiasText(text) !== normalizeFkSemijoiasText(greetingText) ||
      hasGreetingAction ||
      hasVideoAction ||
      videoPromise
    ) {
      applied.push(catalogOrPriceRequest ? "catalog_request_before_name_to_name_question" : "specific_request_before_name_to_name_question");
    }
    text = greetingText;
    if (mediaActions.length > 0) {
      applied.push("clear_media_before_name");
    }
    mediaActions = [];
    return { text, mediaActions, applied };
  }

  if (genericInitialInterest) {
    if (normalizeFkSemijoiasText(text) !== normalizeFkSemijoiasText(greetingText) || hasGreetingAction) {
      applied.push("generic_initial_interest_to_name_question");
    }
    text = greetingText;
    mediaActions = dropGreetingOpeningActions(mediaActions);
    return { text, mediaActions, applied };
  }

  if (catalogOrPriceRequest) {
    text = FK_SEMIJOIAS_VIDEO_REPLY;
    applied.push("catalog_request_video");
    const nextMediaActions = ensureFkSemijoiasVideoAction(mediaActions);
    if (hasGreetingAction || !hasVideoAction || nextMediaActions.length !== mediaActions.length) {
      applied.push("ensure_video_media_after_catalog_request");
    }
    mediaActions = nextMediaActions;
    return { text, mediaActions, applied };
  }

  if (productOrVideoRequest || videoPromise || hasVideoAction) {
    if (productOrVideoRequest || !text || videoPromise) {
      text = FK_SEMIJOIAS_VIDEO_REPLY;
      applied.push("product_or_video_request_video");
    }
    const nextMediaActions = ensureFkSemijoiasVideoAction(mediaActions);
    if (hasGreetingAction || !hasVideoAction || nextMediaActions.length !== mediaActions.length) {
      applied.push("ensure_video_media_after_product_request");
    }
    mediaActions = nextMediaActions;
    return { text, mediaActions, applied };
  }

  if (catalogDigitalPromise) {
    text = firstAgentResponse ? greetingText : FK_SEMIJOIAS_CATALOG_FALLBACK;
    mediaActions = dropFkSemijoiasOpeningAndVideoActions(mediaActions);
    applied.push(firstAgentResponse ? "catalog_drift_to_name_question" : "catalog_drift_fallback");
    return { text, mediaActions, applied };
  }

  if (hasGreetingAction && normalizeFkSemijoiasText(text) === normalizeFkSemijoiasText(greetingText)) {
    mediaActions = dropGreetingOpeningActions(mediaActions);
    applied.push("drop_duplicate_opening_greeting");
  }

  return { text, mediaActions, applied };
}

export const fkSemijoiasPolicyTexts = {
  greeting: FK_SEMIJOIAS_GREETING,
  catalogFallback: FK_SEMIJOIAS_CATALOG_FALLBACK,
  videoReply: FK_SEMIJOIAS_VIDEO_REPLY,
  fichaAlreadySentReply: FK_SEMIJOIAS_FICHA_ALREADY_SENT_REPLY,
  registrationReceivedReply: FK_SEMIJOIAS_REGISTRATION_RECEIVED_REPLY,
  postRegistrationTimelineReply: FK_SEMIJOIAS_POST_REGISTRATION_TIMELINE_REPLY,
  fichaConsentReply: FK_SEMIJOIAS_FICHA_CONSENT_REPLY,
  consignadoInfoReply: FK_SEMIJOIAS_CONSIGNADO_INFO_REPLY,
  commissionTableReply: FK_SEMIJOIAS_COMMISSION_TABLE_REPLY,
};
