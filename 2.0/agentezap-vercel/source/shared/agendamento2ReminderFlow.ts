export type Agendamento2ReminderFlowItem = {
  id: string;
  order: number;
  type: "text";
  text: string;
};

export const DEFAULT_AGENDAMENTO2_REMINDER_HOURS_BEFORE = 1;

export function getDefaultAgendamento2ReminderFlowItems(): Agendamento2ReminderFlowItem[] {
  return [
    {
      id: "agendamento2-reminder-step-1",
      order: 0,
      type: "text",
      text: "Oi {nome}! Passando para lembrar do seu atendimento {referencia_agendamento}.",
    },
    {
      id: "agendamento2-reminder-step-2",
      order: 1,
      type: "text",
      text:
        "Seu horario esta confirmado para {data_agendamento_extenso}, as {hora_agendamento}. Se precisar ajustar algo, me avise por aqui.",
    },
  ];
}

export function normalizeAgendamento2ReminderFlowItems(rawValue: unknown): Agendamento2ReminderFlowItem[] {
  if (!Array.isArray(rawValue)) {
    return getDefaultAgendamento2ReminderFlowItems();
  }

  const normalized = rawValue
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const text = String(record.text || "").trim();
      if (!text) {
        return null;
      }

      return {
        id: String(record.id || `agendamento2-reminder-step-${index + 1}`),
        order: Number.isFinite(Number(record.order)) ? Number(record.order) : index,
        type: "text" as const,
        text,
      };
    })
    .filter((entry): entry is Agendamento2ReminderFlowItem => Boolean(entry))
    .sort((left, right) => left.order - right.order)
    .map((entry, index) => ({
      ...entry,
      order: index,
    }));

  return normalized.length > 0 ? normalized : getDefaultAgendamento2ReminderFlowItems();
}
