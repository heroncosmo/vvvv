import { z } from "zod";

export const leadQualificationSchema = z.object({
  isPotentialLead: z.boolean(),
  potentialScore: z.coerce.number().min(0).max(100),
  potentialGrade: z.string().min(1),
  businessType: z.string().nullable().optional(),
  personaType: z.string().nullable().optional(),
  summary: z.string().min(1),
  qualificationReason: z.string().min(1),
  evidence: z.array(z.string()).max(6).default([]),
  recommendedApproach: z.string().nullable().optional(),
  recommendedMessage: z.string().nullable().optional(),
  confidence: z.coerce.number().min(0).max(100),
});

export const leadCatalogProfileSchema = z.object({
  isQualifiedLead: z.boolean(),
  qualificationScore: z.coerce.number().min(0).max(100),
  qualificationGrade: z.string().min(1),
  segment: z.string().nullable().optional(),
  persona: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  leadStage: z.string().nullable().optional(),
  summary: z.string().min(1),
  needSummary: z.string().min(1),
  buyerFitSummary: z.string().min(1),
  signals: z.array(z.string()).max(6).default([]),
  confidence: z.coerce.number().min(0).max(100),
});

export type LeadQualificationPayload = z.infer<typeof leadQualificationSchema>;
export type LeadCatalogProfilePayload = z.infer<typeof leadCatalogProfileSchema>;

export type LeadCampaignRecipient = {
  leadId?: string;
  conversationId?: string;
  userId?: string;
  phone: string;
  name: string;
  sourceAccountName?: string | null;
  sourceConnectionName?: string | null;
  sourceConnectionPhone?: string | null;
  businessType?: string | null;
  personaType?: string | null;
  potentialGrade?: string | null;
  potentialScore?: number | null;
  qualificationReason?: string | null;
  summary?: string | null;
  recommendedApproach?: string | null;
  preparedMessage?: string | null;
  replyMessageOnInbound?: string | null;
  sendAndDelete?: boolean;
};

export function clampScore(value: number, fallback: number = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function trimText(value: unknown, limit: number) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.length > limit ? text.slice(0, limit) : text;
}

export function normalizeComparablePhone(phone: unknown) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  let normalized = digits;
  if (normalized.startsWith("55") && normalized.length >= 12) {
    normalized = normalized.slice(2);
  }

  if (normalized.length === 11 && normalized[2] === "9") {
    return normalized.slice(0, 2) + normalized.slice(3);
  }

  return normalized;
}

export function buildComparablePhoneVariants(phone: unknown) {
  const digits = String(phone || "").replace(/\D/g, "");
  const variants = new Set<string>();
  const comparable = normalizeComparablePhone(digits);

  if (digits) {
    variants.add(digits);
  }
  if (comparable) {
    variants.add(comparable);
  }

  let withoutCountry = digits;
  if (withoutCountry.startsWith("55") && withoutCountry.length >= 12) {
    withoutCountry = withoutCountry.slice(2);
    variants.add(withoutCountry);
  }

  if (withoutCountry.length === 11 && withoutCountry[2] === "9") {
    variants.add(withoutCountry.slice(0, 2) + withoutCountry.slice(3));
  }

  return Array.from(variants).filter(Boolean);
}

export function resolveLeadDisplayName(name: unknown, phone: unknown) {
  const trimmedName = trimText(name, 120);
  if (trimmedName) {
    return trimmedName;
  }

  const trimmedPhone = trimText(phone, 40);
  if (trimmedPhone) {
    return trimmedPhone;
  }

  return "Cliente";
}

export function extractFirstJsonObject(raw: string) {
  const text = String(raw || "");
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error("Resposta da IA sem objeto JSON");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  const repaired = repairIncompleteJson(text.slice(start));
  if (repaired) {
    return repaired;
  }

  throw new Error("Nao foi possivel fechar o JSON retornado pela IA");
}

function repairIncompleteJson(fragment: string) {
  const text = String(fragment || "").trim();
  if (!text.startsWith("{")) {
    return null;
  }

  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  let candidate = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    candidate += char;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      stack.push("}");
      continue;
    }

    if (char === "[") {
      stack.push("]");
      continue;
    }

    if ((char === "}" || char === "]") && stack[stack.length - 1] === char) {
      stack.pop();
    }
  }

  if (inString) {
    candidate += "\"";
  }

  while (stack.length > 0) {
    candidate += stack.pop();
  }

  candidate = candidate.replace(/,\s*([}\]])/g, "$1");

  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}

export function normalizePotentialGrade(rawGrade: string, potentialScore: number, isPotentialLead: boolean) {
  const grade = String(rawGrade || "").trim().toLowerCase();

  if (grade === "a" || grade.includes("alto")) return "alto";
  if (grade === "b" || grade.includes("medio") || grade.includes("médio")) return "medio";
  if (grade === "c" || grade.includes("baix")) return isPotentialLead ? "baixo" : "descartar";
  if (grade.includes("desc")) return "descartar";

  if (!isPotentialLead && potentialScore < 50) return "descartar";
  if (potentialScore >= 80) return "alto";
  if (potentialScore >= 55) return "medio";
  return isPotentialLead ? "baixo" : "descartar";
}

export function normalizeCatalogStage(rawStage: string, score: number, isQualifiedLead: boolean) {
  const stage = String(rawStage || "").trim().toLowerCase();

  if (stage.includes("desc")) return "descartar";
  if (stage.includes("urg") || stage.includes("pronto")) return "urgente";
  if (stage.includes("qualif") || stage.includes("negoc")) return "qualificado";
  if (stage.includes("inter") || stage.includes("consider")) return "interesse";
  if (stage.includes("novo") || stage.includes("descob")) return "novo";

  if (!isQualifiedLead && score < 45) return "descartar";
  if (score >= 85) return "urgente";
  if (score >= 65) return "qualificado";
  if (score >= 45) return "interesse";
  return isQualifiedLead ? "novo" : "descartar";
}

export function parseLeadQualification(rawResponse: string) {
  const parsed = JSON.parse(extractFirstJsonObject(rawResponse));
  const payload = leadQualificationSchema.parse(parsed);
  const potentialScore = clampScore(payload.potentialScore);
  const confidence = clampScore(payload.confidence);
  const isPotentialLead = Boolean(payload.isPotentialLead);

  return {
    ...payload,
    potentialScore,
    confidence,
    potentialGrade: normalizePotentialGrade(payload.potentialGrade, potentialScore, isPotentialLead),
    recommendedMessage: trimText(payload.recommendedMessage || "", 1000) || null,
    recommendedApproach: trimText(payload.recommendedApproach || "", 600) || null,
    summary: trimText(payload.summary, 600),
    qualificationReason: trimText(payload.qualificationReason, 600),
    businessType: trimText(payload.businessType || "", 180) || null,
    personaType: trimText(payload.personaType || "", 180) || null,
    evidence: payload.evidence
      .map((entry) => trimText(entry, 180))
      .filter(Boolean)
      .slice(0, 6),
  };
}

export function parseLeadCatalogProfile(rawResponse: string) {
  const parsed = JSON.parse(extractFirstJsonObject(rawResponse));
  const payload = leadCatalogProfileSchema.parse(parsed);
  const qualificationScore = clampScore(payload.qualificationScore);
  const confidence = clampScore(payload.confidence);
  const isQualifiedLead = Boolean(payload.isQualifiedLead);

  return {
    ...payload,
    qualificationScore,
    confidence,
    qualificationGrade: normalizePotentialGrade(
      payload.qualificationGrade,
      qualificationScore,
      isQualifiedLead,
    ),
    segment: trimText(payload.segment || "", 180) || null,
    persona: trimText(payload.persona || "", 180) || null,
    region: trimText(payload.region || "", 180) || null,
    leadStage: normalizeCatalogStage(payload.leadStage || "", qualificationScore, isQualifiedLead),
    summary: trimText(payload.summary, 600),
    needSummary: trimText(payload.needSummary, 600),
    buyerFitSummary: trimText(payload.buyerFitSummary, 600),
    signals: payload.signals
      .map((entry) => trimText(entry, 180))
      .filter(Boolean)
      .slice(0, 6),
  };
}

export function renderLeadCampaignTemplate(template: string, recipient: LeadCampaignRecipient) {
  const resolvedName = resolveLeadDisplayName(recipient.name, recipient.phone);
  const sourceAccountName = trimText(recipient.sourceAccountName || recipient.sourceConnectionName || "", 120);
  const summary = trimText(recipient.summary || "", 280);
  const approach = trimText(recipient.recommendedApproach || "", 220);
  const businessType = trimText(recipient.businessType || "", 120);
  const personaType = trimText(recipient.personaType || "", 120);
  const qualificationReason = trimText(recipient.qualificationReason || recipient.summary || "", 280);

  const replacements: Record<string, string> = {
    "{cliente_nome}": resolvedName,
    "{nome}": resolvedName,
    "{lead_nome}": resolvedName,
    "{lead_telefone}": recipient.phone || "",
    "{conta_nome}": sourceAccountName,
    "{cliente_referencia}": sourceAccountName,
    "{conta_whatsapp}": trimText(recipient.sourceConnectionPhone || "", 40),
    "{tipo_negocio}": businessType,
    "{perfil_detectado}": businessType,
    "{persona_tipo}": personaType,
    "{grau_potencial}": trimText(recipient.potentialGrade || "", 40),
    "{score_potencial}": recipient.potentialScore != null ? String(recipient.potentialScore) : "",
    "{motivo_lead}": qualificationReason,
    "{dor_lead}": qualificationReason,
    "{leitura_ia}": summary,
    "{abordagem_sugerida}": approach,
  };

  let rendered = String(template || "");
  for (const [token, value] of Object.entries(replacements)) {
    rendered = rendered.split(token).join(value);
  }
  return rendered;
}
