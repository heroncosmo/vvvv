import type { StructuredRoutingDecision } from "./attentionQueue";

export type HumanHandoffSectorCandidate = {
  id: string;
  name?: string | null;
  description?: string | null;
  ai_handoff_mode?: string | null;
};

function normalizeSemanticText(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function assistantResponsePromisesHumanContinuation(responseText: string | null | undefined): boolean {
  const normalized = normalizeSemanticText(responseText);
  if (!normalized) return false;

  const humanSignals = [
    "humano",
    "uma pessoa",
    "pessoa da equipe",
    "nossa equipe",
    "equipe responsavel",
    "atendente",
    "consultor",
    "vendedor",
    "time responsavel",
  ];
  const continuationSignals = [
    "vai continuar",
    "dara continuidade",
    "dar continuidade",
    "continuidade ao atendimento",
    "continuar o atendimento",
    "assumir",
    "vai assumir",
    "vou passar",
    "passar para",
    "segue com voce",
    "seguir com voce",
  ];

  return (
    humanSignals.some((signal) => normalized.includes(signal)) &&
    continuationSignals.some((signal) => normalized.includes(signal))
  );
}

function scoreHumanOnlySector(sector: HumanHandoffSectorCandidate, responseText: string): number {
  const sectorText = normalizeSemanticText([sector.name, sector.description].filter(Boolean).join(" "));
  const response = normalizeSemanticText(responseText);
  let score = 0;

  if (sectorText.includes("fechamento")) score += 6;
  if (sectorText.includes("humano")) score += 5;
  if (sectorText.includes("atendente")) score += 4;
  if (sectorText.includes("final")) score += 3;
  if (sectorText.includes("pedido")) score += 3;
  if (sectorText.includes("venda") || sectorText.includes("comercial")) score += 2;
  if (sectorText.includes("suporte")) score += 1;

  if (response.includes("fechamento") && sectorText.includes("fechamento")) score += 3;
  if (response.includes("pedido") && sectorText.includes("pedido")) score += 2;
  if (response.includes("equipe") && sectorText.includes("equipe")) score += 1;

  return score;
}

export function buildHumanHandoffRoutingOverride(params: {
  responseText: string | null | undefined;
  currentRouting?: StructuredRoutingDecision | null;
  sectors: HumanHandoffSectorCandidate[];
  canChangeSector?: boolean;
  currentOrchestrationMode?: string | null;
}): StructuredRoutingDecision | null {
  const {
    responseText,
    currentRouting = null,
    sectors,
    canChangeSector = true,
    currentOrchestrationMode = null,
  } = params;

  if (currentRouting?.mode === "route_to_sector" && currentRouting.targetSectorId) {
    return null;
  }

  if (canChangeSector === false || currentOrchestrationMode === "human") {
    return null;
  }

  if (!assistantResponsePromisesHumanContinuation(responseText)) {
    return null;
  }

  const humanOnlySectors = sectors.filter((sector) => sector.ai_handoff_mode === "human_only");
  if (humanOnlySectors.length === 0) {
    return null;
  }

  const selectedSector =
    humanOnlySectors.length === 1
      ? humanOnlySectors[0]
      : humanOnlySectors
          .map((sector) => ({ sector, score: scoreHumanOnlySector(sector, String(responseText || "")) }))
          .sort((a, b) => b.score - a.score)[0]?.sector || null;

  if (!selectedSector) {
    return null;
  }

  return {
    mode: "route_to_sector",
    targetSectorId: selectedSector.id,
    confidence: Math.max(currentRouting?.confidence || 0, 0.86),
    intent: "handoff_humano_prometido",
    reason: "A resposta do agente prometeu continuidade por humano/equipe; alinhando o handoff ao setor humano configurado.",
  };
}
