export const BITTENCOURT_USER_ID = "76d7832a-6950-4f8d-83ed-f4d69abf9cdd";

export type BittencourtResponsePolicyResult = {
  text: string;
  applied: string[];
};

export const bittencourtPolicyTexts = {
  greeting:
    "Olá, seja muito bem-vindo. Sou o concierge digital da Bittencourt Company. Estou aqui para garantir que seu atendimento seja rápido, exclusivo e direcionado exatamente ao que você precisa. Como posso ajudar você hoje?",
  boleto:
    "Para enviar o boleto da mensalidade, preciso apenas confirmar seu nome completo, exatamente como cadastrado, e o mês referente ao pagamento. Assim que receber essas informações, a equipe envia a segunda via para o contato registrado.",
  memberArea: "Claro. Segue o acesso restrito:\nhttps://ead.institutobittencourt.psc.br/ead/",
  ampMonthly:
    "A mensalidade da AMP é R$ 50,00. Para confirmar sua vaga, use este link:\nhttps://www.asaas.com/c/hxyma7z46vwdj6pi",
  ampAnnual:
    "A anuidade da AMP é R$ 500,00. Para confirmar sua vaga, use este link:\nhttps://www.asaas.com/c/qhcsdbcha4nv2v1f",
  ampOptions:
    "A filiação à AMP pode ser feita de duas formas:\nMensalidade: R$ 50,00\nhttps://www.asaas.com/c/hxyma7z46vwdj6pi\n\nAnuidade: R$ 500,00\nhttps://www.asaas.com/c/qhcsdbcha4nv2v1f",
  clinicAppointment:
    "Para agendar consulta, acesse:\nhttps://www.institutobittencourt.psc.br/agendar-consulta/",
};

function normalizeBittencourtText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBittencourtTenant(userId: unknown): boolean {
  return String(userId || "").trim() === BITTENCOURT_USER_ID;
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function isShortGreeting(text: string): boolean {
  if (!text) return false;
  const greetings = new Set([
    "oi",
    "ola",
    "olá",
    "bom dia",
    "boa tarde",
    "boa noite",
    "oie",
    "oi bom dia",
    "ola bom dia",
    "olá bom dia",
    "oi boa tarde",
    "ola boa tarde",
    "olá boa tarde",
    "oi boa noite",
    "ola boa noite",
    "olá boa noite",
  ]);
  return greetings.has(text) || (text.length <= 24 && hasAny(text, ["bom dia", "boa tarde", "boa noite"]));
}

function hasMemberAreaIntent(text: string): boolean {
  return hasAny(text, [
    "area de membros",
    "area do membro",
    "area de membro",
    "area do aluno",
    "portal do aluno",
    "sala virtual",
    "acesso ead",
    "acessar ead",
    "link do ead",
    "link da area",
    "link de acesso",
    "acesso restrito",
    "ead",
  ]);
}

function hasAmpIntent(text: string): boolean {
  return hasAny(text, [" amp ", "amp ", " amp", "associacao mundial de psicanalise"]);
}

function hasMonthlyIntent(text: string): boolean {
  return hasAny(text, ["mensal", "mensalidade", "r 50", "50 00", "cinquenta"]);
}

function hasAnnualIntent(text: string): boolean {
  return hasAny(text, ["anual", "anuidade", "r 500", "500 00", "quinhentos"]);
}

function hasFormationCourseIntent(text: string): boolean {
  return hasAny(text, [
    "formacao",
    "curso de formacao",
    "curso",
    "pos graduacao",
    "especializacao",
    "matricula",
    "aula",
    "aluno",
    "grade curricular",
    "conteudo programatico",
  ]);
}

function hasBoletoIntent(text: string): boolean {
  return (
    hasAny(text, ["boleto", "segunda via", "2 via", "mensalidade", "pagamento em aberto", "pagamento atrasado"]) &&
    !hasAmpIntent(text) &&
    !hasFormationCourseIntent(text)
  );
}

function hasClinicAppointmentIntent(text: string): boolean {
  if (hasFormationCourseIntent(text)) return false;

  return hasAny(text, [
    "clinica",
    "clinico",
    "consulta",
    "consultas",
    "agendar consulta",
    "marcar consulta",
    "terapia",
    "atendimento clinico",
    "atendimento psicanalitico",
    "psicanalise infantil",
    "atendimento social",
  ]);
}

export function resolveBittencourtDirectResponse(params: {
  userId: unknown;
  message: unknown;
}): BittencourtResponsePolicyResult | null {
  if (!isBittencourtTenant(params.userId)) return null;

  const text = normalizeBittencourtText(params.message);
  if (!text) return null;

  if (hasMemberAreaIntent(text)) {
    return { text: bittencourtPolicyTexts.memberArea, applied: ["member_area_link"] };
  }

  if (hasAmpIntent(` ${text} `)) {
    if (hasMonthlyIntent(text) && !hasAnnualIntent(text)) {
      return { text: bittencourtPolicyTexts.ampMonthly, applied: ["amp_monthly"] };
    }
    if (hasAnnualIntent(text) && !hasMonthlyIntent(text)) {
      return { text: bittencourtPolicyTexts.ampAnnual, applied: ["amp_annual"] };
    }
    return { text: bittencourtPolicyTexts.ampOptions, applied: ["amp_options"] };
  }

  if (hasBoletoIntent(text)) {
    return { text: bittencourtPolicyTexts.boleto, applied: ["boleto_minimal"] };
  }

  if (hasClinicAppointmentIntent(text)) {
    return { text: bittencourtPolicyTexts.clinicAppointment, applied: ["clinic_appointment_link"] };
  }

  if (isShortGreeting(text)) {
    return { text: bittencourtPolicyTexts.greeting, applied: ["greeting"] };
  }

  return null;
}
