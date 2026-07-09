export type SchoolTriageDecision = {
  handled: boolean;
  text: string;
  sector?: string;
  matchedStudent?: string;
  reason?: string;
};

type SchoolSector = {
  key: "sabrina" | "aline" | "maite" | "sonia" | "francieli";
  label: string;
  link: string;
};

const SECTORS: Record<SchoolSector["key"], SchoolSector> = {
  sabrina: {
    key: "sabrina",
    label: "Sabrina",
    link: "https://wa.me/5514998391204",
  },
  aline: {
    key: "aline",
    label: "Aline",
    link: "https://wa.me/551438412514",
  },
  maite: {
    key: "maite",
    label: "Maitê",
    link: "https://wa.me/5514997583372",
  },
  sonia: {
    key: "sonia",
    label: "Sonia",
    link: "https://wa.me/5514996747816",
  },
  francieli: {
    key: "francieli",
    label: "Francieli",
    link: "https://wa.me/5514998620954",
  },
};

function normalizeSchoolText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSchoolTriageMarker(prompt: unknown): boolean {
  const normalized = normalizeSchoolText(prompt);
  return (
    normalized.includes("agentezap escola triagem") ||
    (
      normalized.includes("colegio liceu arcanjos") &&
      normalized.includes("lista de setores e links") &&
      normalized.includes("alunos atendidos")
    )
  );
}

function extractMarkedBlock(prompt: string, key: string): string {
  const pattern = new RegExp(
    `${key}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*[A-Z0-9_]+\\s*:|\\n\\s*\\[/AGENTEZAP_ESCOLA_TRIAGEM\\]|$)`,
    "i",
  );
  return pattern.exec(prompt)?.[1] || "";
}

function extractPdfStyleBlock(prompt: string, startPattern: RegExp, endPatterns: RegExp[]): string {
  const startMatch = startPattern.exec(prompt);
  if (!startMatch || typeof startMatch.index !== "number") return "";
  const rest = prompt.slice(startMatch.index + startMatch[0].length);
  const endIndexes = endPatterns
    .map((pattern) => pattern.exec(rest)?.index ?? -1)
    .filter((index) => index >= 0);
  const end = endIndexes.length ? Math.min(...endIndexes) : rest.length;
  return rest.slice(0, end);
}

function extractNamesFromBlock(block: string): string[] {
  return block
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, " ")
    .split(/,|\n|;/)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter((name) => name.length >= 6 && /[A-Za-z\u00C0-\u00FF]/.test(name))
    .filter((name) => !/^(cargo|nome|whatsapp|funcoes|lista|setor|alunos atendidos)/i.test(name));
}

function loadSchoolStudentLists(prompt: string): Record<"maite" | "sonia" | "francieli", string[]> {
  const marked = {
    maite: extractNamesFromBlock(extractMarkedBlock(prompt, "SETOR_MAITE_ALUNOS")),
    sonia: extractNamesFromBlock(extractMarkedBlock(prompt, "SETOR_SONIA_ALUNOS")),
    francieli: extractNamesFromBlock(extractMarkedBlock(prompt, "SETOR_FRANCIELI_ALUNOS")),
  };

  if (marked.maite.length || marked.sonia.length || marked.francieli.length) {
    return marked;
  }

  const maite = extractPdfStyleBlock(
    prompt,
    /ALUNOS\s+ATENDIDOS\s+PELA\s+MAIT[ÊE]\s*:/i,
    [/Cargo:\s*Coordenadora/i, /ALUNOS\s+ATENDIDOS\s+PELA\s+DONA\s+SONIA/i, /ALUNOS\s+ATENDIDOS\s+PELA\s+SONIA/i],
  );
  const sonia = extractPdfStyleBlock(
    prompt,
    /ALUNOS\s+ATENDIDOS\s+PELA\s+(?:DONA\s+)?SONIA\s*:/i,
    [/Cargo:\s*Coordenadora/i, /ALUNOS\s+ATENDIDOS\s+PELA\s+FRANCIELI/i],
  );
  const francieli = extractPdfStyleBlock(
    prompt,
    /ALUNOS\s+ATENDIDOS\s+PELA\s+FRANCIELI\s*:/i,
    [/LISTA\s+DE\s+SETORES/i, /\[\/AGENTEZAP_ESCOLA_TRIAGEM\]/i],
  );

  return {
    maite: extractNamesFromBlock(maite),
    sonia: extractNamesFromBlock(sonia),
    francieli: extractNamesFromBlock(francieli),
  };
}

function findStudentSector(
  message: string,
  lists: Record<"maite" | "sonia" | "francieli", string[]>,
): { sector: SchoolSector["key"]; name: string } | null {
  const normalizedMessage = normalizeSchoolText(message);
  for (const sector of ["maite", "sonia", "francieli"] as const) {
    for (const name of lists[sector]) {
      const normalizedName = normalizeSchoolText(name);
      if (normalizedName && normalizedMessage.includes(normalizedName)) {
        return { sector, name };
      }
    }
  }
  return null;
}

function classifyAdministrativeSubject(normalizedMessage: string): SchoolSector["key"] | null {
  if (/\b(matricula|matriculas|vaga|vagas|mensalidade|mensalidades|pagamento|pagar|boleto|pix|comprovante|dinheiro|financeiro|imposto|renda|nota fiscal|notas fiscais|cantina|excursao|uniforme|uniformes|eduxe|sloop|formatura|formaturas|evento|eventos|carteirinha|curriculo|curriculum|aniversariante|psicolog)\b/.test(normalizedMessage)) {
    return "sabrina";
  }

  if (/\b(historico|declaracao|ballet|xadrez|horario de aula|horario das aulas|impressao|imprimir|atividade impressa|prova impressa|medicamento|remedio|mochila|sair mais cedo|saida antecipada)\b/.test(normalizedMessage)) {
    return "aline";
  }

  if (/\b(olimpiada|olimpiadas)\b/.test(normalizedMessage)) {
    return "francieli";
  }

  return null;
}

function hasExternalSchoolContactSubject(normalizedMessage: string): boolean {
  const hasExternalSignal = /\b(consultoria|consultor|consultora|fornecedor|fornecedora|parceria|empresa|grupo rabbit|sympla|evento online|proposta|apresentar|apresentacao|comercial|vendedor|vendedora|prestador|prestadora|treinamento|palestra|curso|servico educacional|servicos educacionais|escola crescer|horario disponivel|horarios disponiveis|atendimento comercial)\b/.test(normalizedMessage);
  if (!hasExternalSignal) return false;

  const hasGuardianOrStudentSignal = /\b(mae|pai|responsavel|filho|filha|aluno|aluna|estudante|serie|turma|matricula|mensalidade|boleto|pix|comprovante|declaracao|historico|falta|faltou|prova|remarcar|atestado)\b/.test(normalizedMessage);
  return !hasGuardianOrStudentSignal;
}

function hasPedagogicalSubject(normalizedMessage: string): boolean {
  return /\b(atestado|falta|faltar|faltou|ausencia|ausente|viagem|viajar|tarefa|atividade|roupa|festa|prova|remarcar|relatorio|comportamental|educacional|pedagogico|professor|professora|coordenadora|coordenador)\b/.test(normalizedMessage);
}

function formatSchoolRoute(sectorKey: SchoolSector["key"], matchedStudent?: string): SchoolTriageDecision {
  const sector = SECTORS[sectorKey];
  const subject = matchedStudent ? ` do(a) ${matchedStudent}` : "";
  return {
    handled: true,
    sector: sector.key,
    matchedStudent,
    reason: "school_triage_route",
    text: `Entendi. Para esse assunto${subject}, fale com ${sector.label}:\n${sector.link}`,
  };
}

export function buildSchoolTriageResponseFromPrompt(params: {
  prompt: unknown;
  message: unknown;
}): SchoolTriageDecision | null {
  const prompt = String(params.prompt || "");
  const message = String(params.message || "").trim();
  if (!message || !hasSchoolTriageMarker(prompt)) return null;

  const normalizedMessage = normalizeSchoolText(message);
  const isOnlyGreeting = /^(oi|ola|olá|bom dia|boa tarde|boa noite|tudo bem|boa)$/.test(message.trim().toLowerCase());
  if (isOnlyGreeting) {
    return {
      handled: true,
      reason: "school_triage_missing_context",
      text: "Olá! Para te encaminhar certinho, me informe o nome completo do aluno(a) e o assunto, por favor.",
    };
  }

  if (hasExternalSchoolContactSubject(normalizedMessage)) {
    return {
      handled: true,
      reason: "school_triage_external_contact",
      text: "Entendi. Esse e um contato externo/comercial. Para encaminhar corretamente, me confirme seu nome, empresa, assunto resumido e melhor telefone ou horario de retorno, por favor.",
    };
  }

  const administrativeSector = classifyAdministrativeSubject(normalizedMessage);
  if (administrativeSector === "sabrina" || administrativeSector === "aline") {
    return formatSchoolRoute(administrativeSector);
  }

  const lists = loadSchoolStudentLists(prompt);
  const matchedStudent = findStudentSector(message, lists);

  if (administrativeSector === "francieli") {
    return formatSchoolRoute("francieli", matchedStudent?.name);
  }

  if (matchedStudent && hasPedagogicalSubject(normalizedMessage)) {
    return formatSchoolRoute(matchedStudent.sector, matchedStudent.name);
  }

  if (matchedStudent) {
    return {
      handled: true,
      sector: matchedStudent.sector,
      matchedStudent: matchedStudent.name,
      reason: "school_triage_missing_subject",
      text: `Encontrei o(a) aluno(a) ${matchedStudent.name}. Qual é o assunto para eu te encaminhar certinho?`,
    };
  }

  if (hasPedagogicalSubject(normalizedMessage)) {
    return {
      handled: true,
      reason: "school_triage_missing_student",
      text: "Para te encaminhar à coordenação correta, me informe o nome completo do aluno(a) e a série/turma, por favor.",
    };
  }

  return {
    handled: true,
    sector: "sabrina",
    reason: "school_triage_fallback",
    text: `Entendi. Para esse assunto, fale com Sabrina:\n${SECTORS.sabrina.link}`,
  };
}
