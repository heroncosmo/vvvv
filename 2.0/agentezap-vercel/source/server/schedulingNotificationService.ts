import { sendWhatsAppMessageFromUser } from "./whatsappSender";

interface SchedulingNotificationServiceItem {
  name: string;
  price?: number | null;
  durationMinutes?: number | null;
}

interface SchedulingNotificationPayload {
  id: string;
  clientName: string;
  clientPhone: string;
  appointmentDate: string;
  startTime: string;
  endTime?: string;
  location?: string | null;
  serviceName?: string | null;
  selectedServices?: SchedulingNotificationServiceItem[];
  totalPrice?: number | null;
}

function formatCurrencyBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatAppointmentDate(dateValue: string): string {
  const [year, month, day] = String(dateValue || "").split("-");
  if (!year || !month || !day) {
    return dateValue;
  }

  return `${day}/${month}/${year}`;
}

export async function sendSchedulingBookingNotification(
  userId: string,
  phoneNumber: string,
  appointment: SchedulingNotificationPayload,
): Promise<boolean> {
  const targetPhone = String(phoneNumber || "").replace(/\D/g, "");
  if (!targetPhone) {
    return false;
  }

  const serviceLines = (appointment.selectedServices || [])
    .map((service) => {
      const extras: string[] = [];
      if (typeof service.durationMinutes === "number" && service.durationMinutes > 0) {
        extras.push(`${service.durationMinutes} min`);
      }
      if (typeof service.price === "number" && Number.isFinite(service.price)) {
        extras.push(formatCurrencyBRL(service.price));
      }
      return `- ${service.name}${extras.length ? ` (${extras.join(" | ")})` : ""}`;
    });

  const lines = [
    "Novo agendamento recebido",
    "",
    `Cliente: ${appointment.clientName}`,
    `Telefone: ${appointment.clientPhone}`,
    `Data: ${formatAppointmentDate(appointment.appointmentDate)}`,
    `Horario: ${appointment.startTime}${appointment.endTime ? ` - ${appointment.endTime}` : ""}`,
    appointment.serviceName ? `Servico: ${appointment.serviceName}` : "",
    appointment.location ? `Endereco: ${appointment.location}` : "",
    serviceLines.length ? "" : "",
    ...serviceLines,
    typeof appointment.totalPrice === "number" && Number.isFinite(appointment.totalPrice)
      ? `Total: ${formatCurrencyBRL(appointment.totalPrice)}`
      : "",
    `ID interno: ${appointment.id}`,
  ].filter(Boolean);

  return sendWhatsAppMessageFromUser(
    userId,
    targetPhone,
    lines.join("\n"),
    "scheduling_notification",
  );
}
