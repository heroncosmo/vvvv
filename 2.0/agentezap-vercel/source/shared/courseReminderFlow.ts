export type CourseReminderFlowItem = {
  id: string;
  order: number;
  type: "text";
  text: string;
};

export const DEFAULT_COURSE_REMINDER_HOURS_BEFORE = 1;

export function getDefaultCourseReminderFlowItems(): CourseReminderFlowItem[] {
  return [
    {
      id: "course-reminder-step-1",
      order: 0,
      type: "text",
      text: "Olá {nome}! Eu sou a Vitória da coordenação do Instituto Mix, tudo bem?",
    },
    {
      id: "course-reminder-step-2",
      order: 1,
      type: "text",
      text:
        "Estou mandando mensagem só para te avisar que a coordenação já está te aguardando para realizar sua inscrição no curso gratuito.\n{referencia_agendamento}, às {hora_agendamento}.\nPosso confirmar sua inscrição?",
    },
    {
      id: "course-reminder-step-3",
      order: 2,
      type: "text",
      text: "Parabéns pela oportunidade, sucesso em sua carreira profissional ✨",
    },
  ];
}

export function normalizeCourseReminderFlowItems(rawValue: unknown): CourseReminderFlowItem[] {
  if (!Array.isArray(rawValue)) {
    return getDefaultCourseReminderFlowItems();
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
        id: String(record.id || `course-reminder-step-${index + 1}`),
        order: Number.isFinite(Number(record.order)) ? Number(record.order) : index,
        type: "text" as const,
        text,
      };
    })
    .filter((entry): entry is CourseReminderFlowItem => Boolean(entry))
    .sort((left, right) => left.order - right.order)
    .map((entry, index) => ({
      ...entry,
      order: index,
    }));

  return normalized.length > 0 ? normalized : getDefaultCourseReminderFlowItems();
}
