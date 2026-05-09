import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContextualHelpButton } from "@/components/contextual-help-button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatBrazilDate, parseBrazilDateTime } from "@/lib/brazil-time";
import { getAuthToken } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Link2,
  Link2Off,
  Loader2,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  User,
  X,
} from "lucide-react";

interface Appointment {
  id: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  professional_name: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: string;
  created_by_ai: boolean;
  google_event_id?: string | null;
}

interface ProviderStatsResponse {
  today?: { total?: number; pending?: number; confirmed?: number };
  week?: { total?: number };
}

interface ProviderConfigResponse {
  google_calendar_enabled?: boolean;
  google_calendar_connected?: boolean;
  slot_duration?: number;
}

interface ProviderService {
  id: string;
  name: string;
  duration_minutes: number;
  price: number | null;
  is_active: boolean;
}

interface ProviderProfessional {
  id: string;
  name: string;
  is_active: boolean;
}

interface GoogleCalendarStatus {
  isConnected: boolean;
  configured: boolean;
  email?: string;
  providerLabel?: string;
  checked?: boolean;
  error?: string;
  selectedCalendarId?: string;
  calendars?: Array<{
    id: string;
    summary: string;
    primary?: boolean;
    accessRole?: string;
  }>;
}

interface GoogleCalendarEventDateTime {
  date?: string;
  dateTime?: string;
}

interface GoogleCalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  transparency?: string;
  htmlLink?: string;
  start?: GoogleCalendarEventDateTime | null;
  end?: GoogleCalendarEventDateTime | null;
}

interface ExternalCalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startDateTime: string;
  endDateTime: string;
  isAllDay: boolean;
  htmlLink?: string;
}

interface ManualAppointmentForm {
  clientName: string;
  clientPhone: string;
  serviceId: string;
  professionalId: string;
  appointmentDate: string;
  startTime: string;
  clientNotes: string;
  internalNotes: string;
}

function getTodayBrazilIso() {
  const now = parseBrazilDateTime(new Date());
  if (!now) return "";
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function createDefaultManualAppointmentForm(): ManualAppointmentForm {
  return {
    clientName: "",
    clientPhone: "",
    serviceId: "",
    professionalId: "",
    appointmentDate: getTodayBrazilIso(),
    startTime: "",
    clientNotes: "",
    internalNotes: "",
  };
}

async function authFetch(url: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers: Record<string, string> = { ...((options.headers as Record<string, string>) || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { ...options, headers, credentials: "include" });
}

function toCalendarDateTime(value?: GoogleCalendarEventDateTime | null, fallback = "00:00:00") {
  if (!value) return null;
  if (value.dateTime) return value.dateTime;
  if (value.date) return `${value.date}T${fallback}`;
  return null;
}

function mapExternalEvent(event: GoogleCalendarEvent, index: number): ExternalCalendarEvent | null {
  if (!event || event.status === "cancelled" || event.transparency === "transparent") return null;
  const startDateTime = toCalendarDateTime(event.start, "00:00:00");
  const endDateTime = toCalendarDateTime(event.end, "23:59:59");
  if (!startDateTime || !endDateTime) return null;
  return {
    id: event.id || `external-${index}`,
    title: event.summary || "Compromisso externo",
    description: event.description,
    location: event.location,
    startDateTime,
    endDateTime,
    isAllDay: Boolean(event.start?.date && !event.start?.dateTime),
    htmlLink: event.htmlLink,
  };
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof AlertCircle }> = {
  pending: { label: "Pendente", color: "bg-yellow-100 text-yellow-800", icon: AlertCircle },
  confirmed: { label: "Confirmado", color: "bg-blue-100 text-blue-800", icon: CheckCircle2 },
  completed: { label: "Concluido", color: "bg-green-100 text-green-800", icon: Check },
  cancelled: { label: "Cancelado", color: "bg-red-100 text-red-800", icon: X },
  no_show: { label: "Faltou", color: "bg-gray-100 text-gray-800", icon: AlertCircle },
};

export function ProviderAppointmentsPanel({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(() => getTodayBrazilIso());
  const [matonApiKey, setMatonApiKey] = useState("");
  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false);
  const [form, setForm] = useState<ManualAppointmentForm>(() => createDefaultManualAppointmentForm());
  const [slotSuggestions, setSlotSuggestions] = useState<string[]>([]);

  const { data: appointments = [], isLoading: appointmentsLoading, refetch: refetchAppointments } = useQuery<Appointment[]>({
    queryKey: ["provider-appointments", statusFilter, dateFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFilter) params.set("date", dateFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await authFetch(`/api/provider/appointments?${params.toString()}`);
      if (!res.ok) throw new Error("Erro ao buscar agendamentos");
      return res.json();
    },
  });

  const { data: stats } = useQuery<ProviderStatsResponse>({
    queryKey: ["provider-stats"],
    queryFn: async () => {
      const res = await authFetch("/api/provider/stats");
      if (!res.ok) throw new Error("Erro ao buscar stats");
      return res.json();
    },
  });

  const { data: providerConfig } = useQuery<ProviderConfigResponse>({
    queryKey: ["provider-config"],
    queryFn: async () => {
      const res = await authFetch("/api/provider/config");
      if (!res.ok) throw new Error("Erro ao buscar configuracao do prestador");
      return res.json();
    },
  });

  const { data: services = [] } = useQuery<ProviderService[]>({
    queryKey: ["provider-services-panel"],
    queryFn: async () => {
      const res = await authFetch("/api/provider/services");
      if (!res.ok) throw new Error("Erro ao buscar servicos do prestador");
      return res.json();
    },
  });

  const { data: professionals = [] } = useQuery<ProviderProfessional[]>({
    queryKey: ["provider-professionals-panel"],
    queryFn: async () => {
      const res = await authFetch("/api/provider/professionals");
      if (!res.ok) throw new Error("Erro ao buscar profissionais do prestador");
      return res.json();
    },
  });

  const { data: googleCalendarStatus, refetch: refetchGoogleStatus } = useQuery<GoogleCalendarStatus>({
    queryKey: ["provider-google-calendar-status"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await authFetch("/api/provider/google-calendar/status");
      if (!res.ok) return { isConnected: false, configured: true, providerLabel: "Maton" };
      const data = await res.json();
      return {
        isConnected: data.isConnected || data.connected || false,
        email: data.email || data.userEmail,
        configured: data.configured ?? true,
        providerLabel: data.providerLabel || "Maton",
        checked: data.checked ?? true,
        error: data.error,
        selectedCalendarId: data.selectedCalendarId ?? data.selected_calendar_id,
        calendars: Array.isArray(data.calendars) ? data.calendars : [],
      };
    },
  });

  const {
    data: externalCalendarEvents = [],
    isLoading: externalCalendarEventsLoading,
    refetch: refetchExternalCalendarEvents,
  } = useQuery<ExternalCalendarEvent[]>({
    queryKey: ["provider-google-calendar-events", dateFilter, googleCalendarStatus?.selectedCalendarId],
    enabled: Boolean(dateFilter && googleCalendarStatus?.isConnected),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const params = new URLSearchParams({
        from: `${dateFilter}T00:00:00`,
        to: `${dateFilter}T23:59:59`,
      });
      const res = await authFetch(`/api/provider/google-calendar/events?${params.toString()}`);
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload?.events)
        ? payload.events
            .map((event: GoogleCalendarEvent, index: number) => mapExternalEvent(event, index))
            .filter((event: ExternalCalendarEvent | null): event is ExternalCalendarEvent => Boolean(event))
        : [];
    },
  });

  const activeServices = services.filter((service) => service.is_active);
  const activeProfessionals = professionals.filter((professional) => professional.is_active);
  const selectedService = activeServices.find((service) => service.id === form.serviceId) || null;
  const selectedProfessional = activeProfessionals.find((professional) => professional.id === form.professionalId) || null;
  const manualDuration = selectedService?.duration_minutes || providerConfig?.slot_duration || 30;

  useEffect(() => {
    if (activeProfessionals.length !== 1) return;
    const professional = activeProfessionals[0];
    setForm((current) => (current.professionalId ? current : { ...current, professionalId: professional.id }));
  }, [activeProfessionals]);

  useEffect(() => {
    if (!dateFilter || !googleCalendarStatus?.isConnected) return;
    void refetchExternalCalendarEvents();
  }, [dateFilter, googleCalendarStatus?.isConnected, googleCalendarStatus?.selectedCalendarId, refetchExternalCalendarEvents]);

  const { data: availableSlots = [], isLoading: availableSlotsLoading } = useQuery<string[]>({
    queryKey: ["provider-available-slots", form.appointmentDate, form.professionalId || "auto", manualDuration, newAppointmentOpen],
    enabled: Boolean(newAppointmentOpen && form.appointmentDate),
    queryFn: async () => {
      const params = new URLSearchParams({
        date: form.appointmentDate,
        serviceDuration: String(manualDuration),
      });
      if (form.professionalId) params.set("professionalId", form.professionalId);
      const res = await authFetch(`/api/provider/available-slots?${params.toString()}`);
      if (!res.ok) throw new Error("Erro ao buscar horarios disponiveis");
      const payload = await res.json();
      return Array.isArray(payload?.availableSlots) ? payload.availableSlots : [];
    },
  });

  const createAppointmentMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await authFetch("/api/provider/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error(body?.message || "Erro ao criar agendamento") as Error & { suggestedSlots?: string[] };
        error.suggestedSlots = Array.isArray(body?.suggestedSlots) ? body.suggestedSlots : [];
        throw error;
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["provider-stats"] });
      queryClient.invalidateQueries({ queryKey: ["provider-google-calendar-events"] });
      setNewAppointmentOpen(false);
      setSlotSuggestions([]);
      setForm(createDefaultManualAppointmentForm());
      toast({ title: "Agendamento criado!" });
    },
    onError: (error: Error & { suggestedSlots?: string[] }) => {
      const suggestions = Array.isArray(error.suggestedSlots) ? error.suggestedSlots : [];
      setSlotSuggestions(suggestions);
      toast({
        title: "Erro ao criar agendamento",
        description: suggestions.length > 0 ? `${error.message}. Sugestoes: ${suggestions.join(", ")}` : error.message,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await authFetch(`/api/provider/appointments/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Erro ao atualizar status");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["provider-stats"] });
      queryClient.invalidateQueries({ queryKey: ["provider-google-calendar-events"] });
      toast({ title: "Status atualizado!" });
    },
  });

  const connectMatonMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/provider/google-calendar/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: matonApiKey }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Nao foi possivel validar a chave do Maton.");
      return body;
    },
    onSuccess: () => {
      setMatonApiKey("");
      queryClient.invalidateQueries({ queryKey: ["provider-google-calendar-status"] });
      queryClient.invalidateQueries({ queryKey: ["provider-config"] });
      queryClient.invalidateQueries({ queryKey: ["provider-google-calendar-events"] });
      toast({ title: "Maton conectado!" });
    },
  });

  const disconnectMatonMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/provider/google-calendar/disconnect", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Falha ao desconectar o Maton.");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-google-calendar-status"] });
      queryClient.invalidateQueries({ queryKey: ["provider-config"] });
      queryClient.invalidateQueries({ queryKey: ["provider-google-calendar-events"] });
      toast({ title: "Maton desconectado!" });
    },
  });

  const selectCalendarMutation = useMutation({
    mutationFn: async (calendarId: string) => {
      const res = await authFetch("/api/provider/google-calendar/calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Falha ao atualizar a agenda.");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-google-calendar-status"] });
      queryClient.invalidateQueries({ queryKey: ["provider-google-calendar-events"] });
      toast({ title: "Agenda atualizada!" });
    },
  });

  const toggleGoogleSyncMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await authFetch("/api/provider/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ google_calendar_enabled: enabled }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Falha ao atualizar a sincronizacao.");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-config"] });
      queryClient.invalidateQueries({ queryKey: ["provider-google-calendar-status"] });
      queryClient.invalidateQueries({ queryKey: ["provider-google-calendar-events"] });
      toast({ title: "Sincronizacao atualizada!" });
    },
  });

  const selectedDayAppointments = dateFilter
    ? appointments.filter((appointment) => appointment.appointment_date === dateFilter)
    : [];
  const selectedInternalEventIds = new Set(
    selectedDayAppointments.map((appointment) => appointment.google_event_id).filter((value): value is string => Boolean(value)),
  );
  const selectedDayExternalEvents = externalCalendarEvents.filter((event) => !selectedInternalEventIds.has(event.id));
  const agendaItems = [
    ...selectedDayAppointments.map((appointment) => ({
      id: appointment.id,
      kind: "internal" as const,
      sortKey: `${appointment.appointment_date}T${appointment.start_time}:00`,
      appointment,
    })),
    ...selectedDayExternalEvents.map((event) => ({
      id: `external-${event.id}`,
      kind: "external" as const,
      sortKey: event.startDateTime,
      event,
    })),
  ].sort((a, b) => new Date(a.sortKey).getTime() - new Date(b.sortKey).getTime());

  const writableCalendars = (googleCalendarStatus?.calendars || []).filter(
    (calendar) => calendar.accessRole === "owner" || calendar.accessRole === "writer",
  );

  const formatDate = (date: string) => formatBrazilDate(`${date}T12:00:00`);

  const handleRefresh = async () => {
    await Promise.all([
      refetchAppointments(),
      refetchGoogleStatus(),
      refetchExternalCalendarEvents(),
      queryClient.invalidateQueries({ queryKey: ["provider-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["provider-config"] }),
    ]);
  };

  const handleCreateAppointment = () => {
    if (!form.clientName.trim() || !form.clientPhone.trim() || !form.serviceId || !form.appointmentDate || !form.startTime) {
      toast({
        title: "Dados incompletos",
        description: "Preencha cliente, telefone, servico, data e horario.",
        variant: "destructive",
      });
      return;
    }

    createAppointmentMutation.mutate({
      clientName: form.clientName.trim(),
      clientPhone: form.clientPhone.trim(),
      serviceId: form.serviceId,
      professionalId: form.professionalId || undefined,
      appointmentDate: form.appointmentDate,
      startTime: form.startTime,
      durationMinutes: manualDuration,
      clientNotes: form.clientNotes.trim() || undefined,
      internalNotes: form.internalNotes.trim() || undefined,
    });
  };

  return (
    <div className={cn(embedded ? "space-y-6" : "mx-auto max-w-7xl space-y-6 p-4 md:p-6")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className={cn("flex items-center gap-2 font-bold", embedded ? "text-xl" : "text-2xl")}>
            <CalendarClock className="h-6 w-6" />
            Agendamentos do Prestador
          </h1>
          <p className="text-muted-foreground">
            Painel operacional proprio do prestador, com agendamento manual, agenda do dia e Google/Maton opcional.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setSlotSuggestions([]);
              setForm({
                ...createDefaultManualAppointmentForm(),
                professionalId: activeProfessionals.length === 1 ? activeProfessionals[0].id : "",
              });
              setNewAppointmentOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo Agendamento
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="mr-1 h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>
      <Dialog
        open={newAppointmentOpen}
        onOpenChange={(open) => {
          setNewAppointmentOpen(open);
          if (!open) {
            setSlotSuggestions([]);
            setForm(createDefaultManualAppointmentForm());
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-3xl">
          <div className="flex max-h-[92vh] flex-col">
            <DialogHeader className="border-b px-6 py-5">
              <DialogTitle>Novo Agendamento do Prestador</DialogTitle>
              <DialogDescription>
                Crie um agendamento manual sem depender do Google. Se a sincronizacao estiver ativa, o Google sera consultado automaticamente.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome do cliente *</Label>
                  <Input value={form.clientName} onChange={(e) => setForm((c) => ({ ...c, clientName: e.target.value }))} placeholder="Nome completo" />
                </div>
                <div className="space-y-2">
                  <Label>Telefone *</Label>
                  <Input value={form.clientPhone} onChange={(e) => setForm((c) => ({ ...c, clientPhone: e.target.value }))} placeholder="(11) 99999-9999" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Servico *</Label>
                    <p className="text-xs text-muted-foreground">Escolha o servico para calcular a duracao real do atendimento.</p>
                  </div>
                  {selectedService && (
                    <Badge variant="secondary">
                      {selectedService.duration_minutes} min
                      {selectedService.price ? ` • R$ ${Number(selectedService.price).toFixed(2).replace(".", ",")}` : ""}
                    </Badge>
                  )}
                </div>
                <div className="max-h-56 overflow-y-auto rounded-xl border bg-muted/20 p-3">
                  <div className="flex flex-wrap gap-2">
                    {activeServices.map((service) => (
                      <Button
                        key={service.id}
                        type="button"
                        variant={form.serviceId === service.id ? "default" : "outline"}
                        className="h-auto min-h-10 whitespace-normal text-left"
                        onClick={() => {
                          setForm((current) => ({ ...current, serviceId: service.id, startTime: "" }));
                          setSlotSuggestions([]);
                        }}
                      >
                        {service.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={form.appointmentDate} onChange={(e) => setForm((c) => ({ ...c, appointmentDate: e.target.value, startTime: "" }))} />
                </div>
                <div className="space-y-2">
                  <Label>Profissional</Label>
                  <Select
                    value={form.professionalId || "__auto__"}
                    onValueChange={(value) => {
                      setForm((current) => ({ ...current, professionalId: value === "__auto__" ? "" : value, startTime: "" }));
                      setSlotSuggestions([]);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha um profissional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Qualquer profissional disponivel</SelectItem>
                      {activeProfessionals.map((professional) => (
                        <SelectItem key={professional.id} value={professional.id}>
                          {professional.name.trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {selectedProfessional ? `Atendimento manual vinculado a ${selectedProfessional.name.trim()}.` : "Se nao escolher, o sistema tenta encaixar automaticamente um profissional disponivel."}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Horario escolhido *</Label>
                  <Input type="time" value={form.startTime} onChange={(e) => setForm((c) => ({ ...c, startTime: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Horarios disponiveis</Label>
                    <p className="text-xs text-muted-foreground">Sugestoes reais com base na configuracao do prestador e nos bloqueios atuais.</p>
                  </div>
                  {availableSlotsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                <div className="rounded-xl border bg-background p-3">
                  <div className="flex flex-wrap gap-2">
                    {(slotSuggestions.length > 0 ? slotSuggestions : availableSlots).map((slot) => (
                      <Button key={slot} type="button" variant={form.startTime === slot ? "default" : "outline"} size="sm" onClick={() => setForm((c) => ({ ...c, startTime: slot }))}>
                        {slot}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Observacoes para o cliente</Label>
                  <Textarea value={form.clientNotes} onChange={(e) => setForm((c) => ({ ...c, clientNotes: e.target.value }))} className="min-h-[110px]" />
                </div>
                <div className="space-y-2">
                  <Label>Observacoes internas</Label>
                  <Textarea value={form.internalNotes} onChange={(e) => setForm((c) => ({ ...c, internalNotes: e.target.value }))} className="min-h-[110px]" />
                </div>
              </div>
            </div>
            <DialogFooter className="border-t px-6 py-4">
              <Button variant="outline" onClick={() => setNewAppointmentOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreateAppointment} disabled={!form.clientName.trim() || !form.clientPhone.trim() || !form.serviceId || !form.appointmentDate || !form.startTime || createAppointmentMutation.isPending}>
                {createAppointmentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar agendamento
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold">{stats?.today?.total || 0}</div><div className="text-sm text-muted-foreground">Hoje</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-yellow-600">{stats?.today?.pending || 0}</div><div className="text-sm text-muted-foreground">Pendentes</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-blue-600">{stats?.today?.confirmed || 0}</div><div className="text-sm text-muted-foreground">Confirmados</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-green-600">{stats?.week?.total || 0}</div><div className="text-sm text-muted-foreground">Semana</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="rounded border px-3 py-1.5 text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="confirmed">Confirmados</SelectItem>
            <SelectItem value="completed">Concluidos</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => { setDateFilter(getTodayBrazilIso()); setStatusFilter("all"); }}>Hoje</Button>
        <Button variant="ghost" size="sm" onClick={() => { setDateFilter(""); setStatusFilter("all"); }}>Todos</Button>
      </div>

      {dateFilter && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base">Agenda do dia</CardTitle>
                <CardDescription>
                  {formatBrazilDate(`${dateFilter}T12:00:00`)} com eventos internos do prestador e, se existir conexao, bloqueios externos do Google/Maton.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-white">
                  {selectedDayAppointments.length} internos
                </Badge>
                <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                  {selectedDayExternalEvents.length} externos
                </Badge>
                {externalCalendarEventsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {agendaItems.length === 0 ? (
              <div className="space-y-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                <div>Nenhum item encontrado para esta data.</div>
                {googleCalendarStatus?.isConnected ? (
                  <div className="text-xs">
                    A agenda externa foi consultada em tempo real. Use <span className="font-medium">Atualizar</span> para forcar uma nova leitura imediata do Google/Maton.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {agendaItems.map((item) => {
                  if (item.kind === "internal") {
                    const appointment = item.appointment;
                    const status = statusConfig[appointment.status] || statusConfig.pending;
                    const StatusIcon = status.icon;
                    return (
                      <div key={item.id} className="rounded-lg border bg-background p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className={`${status.color} gap-1`}><StatusIcon className="h-3 w-3" />{status.label}</Badge>
                              <Badge variant="outline">Interno</Badge>
                              {appointment.created_by_ai && <Badge variant="outline">IA</Badge>}
                            </div>
                            <div className="font-medium">{appointment.start_time} - {appointment.end_time} • {appointment.client_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {appointment.service_name}{appointment.professional_name ? ` • ${appointment.professional_name}` : ""}
                            </div>
                          </div>
                          {appointment.google_event_id && <Badge variant="secondary">Sincronizado</Badge>}
                        </div>
                      </div>
                    );
                  }

                  const event = item.event;
                  const startLabel = event.isAllDay ? "Dia inteiro" : new Date(event.startDateTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  const endLabel = event.isAllDay ? "" : new Date(event.endDateTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={item.id} className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">Google/Maton</Badge>
                            <Badge variant="outline">{event.isAllDay ? "Dia inteiro" : `${startLabel}${endLabel ? ` - ${endLabel}` : ""}`}</Badge>
                          </div>
                          <div className="font-medium">{event.title}</div>
                          {event.location && <div className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{event.location}</div>}
                          {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
                        </div>
                        {event.htmlLink && <a href={event.htmlLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">Abrir evento<ExternalLink className="h-4 w-4" /></a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de agendamentos</CardTitle>
          <CardDescription>Painel operacional do prestador com status internos e sincronizacao opcional da agenda.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {appointmentsLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : appointments.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">Nao ha agendamentos para o filtro selecionado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horario</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Servico</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((appointment) => {
                  const status = statusConfig[appointment.status] || statusConfig.pending;
                  const StatusIcon = status.icon;
                  return (
                    <TableRow key={appointment.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-medium">{appointment.start_time}</span><span className="text-xs text-muted-foreground">- {appointment.end_time}</span></div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{formatDate(appointment.appointment_date)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-muted-foreground" /><span>{appointment.client_name}</span></div>
                        {appointment.client_phone && <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{appointment.client_phone}</div>}
                      </TableCell>
                      <TableCell><span className="font-medium">{appointment.service_name}</span><div className="text-xs text-muted-foreground">{appointment.duration_minutes}min</div></TableCell>
                      <TableCell>{appointment.professional_name || "-"}</TableCell>
                      <TableCell>
                        <Badge className={`${status.color} gap-1`}><StatusIcon className="h-3 w-3" />{status.label}</Badge>
                        {appointment.created_by_ai && <Badge variant="outline" className="ml-1 text-xs">IA</Badge>}
                        {appointment.google_event_id && <Badge variant="secondary" className="ml-1 text-xs">Google</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {appointment.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "confirmed" })}>
                                <Check className="mr-1 h-3 w-3" /> Confirmar
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "cancelled" })}>
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {appointment.status === "confirmed" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "completed" })}>
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Concluir
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          <div className="flex items-start gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100"><CalendarDays className="h-4 w-4 text-blue-600" /></div><div><h4 className="text-sm font-medium">Consulta real da agenda</h4><p className="text-xs text-muted-foreground">O painel manual usa a mesma disponibilidade real do prestador e, se houver Google ativo, tambem respeita os bloqueios externos.</p></div></div>
          <div className="flex items-start gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100"><CheckCircle2 className="h-4 w-4 text-green-600" /></div><div><h4 className="text-sm font-medium">Operacao independente</h4><p className="text-xs text-muted-foreground">Mesmo sem Maton, o prestador continua criando, confirmando e concluindo agendamentos normalmente.</p></div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link2 className="h-5 w-5" />
                  Google Calendario via Maton
                </CardTitle>
                <Badge variant={googleCalendarStatus?.isConnected ? "default" : "secondary"}>{googleCalendarStatus?.isConnected ? "Opcional conectado" : "Opcional"}</Badge>
              </div>
              <CardDescription className="mt-2">O prestador continua funcionando sem Google. Se quiser agenda compartilhada e bloqueios externos, conecte via Maton abaixo.</CardDescription>
            </div>
            <ContextualHelpButton articleId="scheduling-maton-google-calendar" title="Como integrar via Maton" label="Ajuda" description="Abra o passo a passo para conectar a agenda Google no Maton e colar a API key no prestador." />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className={cn("rounded-lg border-2 p-6", googleCalendarStatus?.isConnected ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50")}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{googleCalendarStatus?.isConnected ? "Conectado" : "Nao conectado"}</h3>
                <p className="text-sm text-muted-foreground">{(googleCalendarStatus?.providerLabel || "Maton")} para Google Calendar</p>
                {googleCalendarStatus?.email && <p className="text-sm text-muted-foreground">{googleCalendarStatus.email}</p>}
              </div>
              <div className="w-full max-w-xl space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="provider-maton-api-key">Chave da API do Maton</Label>
                  <Input id="provider-maton-api-key" type="password" value={matonApiKey} onChange={(e) => setMatonApiKey(e.target.value)} placeholder="Cole a chave do Maton" />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => connectMatonMutation.mutate()} disabled={connectMatonMutation.isPending || !matonApiKey.trim()}>{connectMatonMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {googleCalendarStatus?.isConnected ? "Atualizar chave Maton" : "Conectar com Maton"}</Button>
                  {googleCalendarStatus?.isConnected && <Button variant="outline" onClick={() => disconnectMatonMutation.mutate()} disabled={disconnectMatonMutation.isPending}>Desconectar</Button>}
                </div>
              </div>
            </div>
          </div>

          {googleCalendarStatus?.isConnected && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuracoes de sincronizacao</CardTitle>
                <CardDescription>Escolha a agenda do prestador e ative a sincronizacao automatica se quiser usar os bloqueios do Google.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Agenda usada na sincronizacao</Label>
                  <Select value={googleCalendarStatus.selectedCalendarId || ""} onValueChange={(value) => selectCalendarMutation.mutate(value)} disabled={selectCalendarMutation.isPending || writableCalendars.length === 0}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma agenda" /></SelectTrigger>
                    <SelectContent>
                      {writableCalendars.map((calendar) => (
                        <SelectItem key={calendar.id} value={calendar.id}>
                          {calendar.summary}{calendar.primary ? " (principal)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="font-medium">Sincronizacao automatica</Label>
                    <p className="text-sm text-muted-foreground">A IA e o painel consultam a agenda escolhida antes de confirmar horarios.</p>
                  </div>
                  <Switch checked={Boolean(providerConfig?.google_calendar_enabled)} disabled={toggleGoogleSyncMutation.isPending} onCheckedChange={(checked) => toggleGoogleSyncMutation.mutate(checked)} />
                </div>
                <Separator />
                <a href="https://www.maton.ai/" target="_blank" rel="noreferrer" className="inline-flex items-center text-sm font-medium text-primary hover:underline">Criar conta no Maton</a>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

