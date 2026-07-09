import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Clock3,
  Link2,
  Loader2,
  MessageSquarePlus,
  Power,
  RefreshCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { openGoogleCalendarPopup } from "@/lib/google-calendar-popup";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  DEFAULT_AGENDAMENTO2_REMINDER_HOURS_BEFORE,
  getDefaultAgendamento2ReminderFlowItems,
  normalizeAgendamento2ReminderFlowItems,
  type Agendamento2ReminderFlowItem,
} from "@shared/agendamento2ReminderFlow";

type AgendaScope = "all" | "today" | "tomorrow" | "next7" | "custom";
type AgendaSortMode = "earliest" | "latest";
type AgendaDayOption = { key: string; date: string; title: string; shortLabel: string; hint: string; count: number };
type AgendaGroup = AgendaDayOption & { items: NonNullable<Agendamento3Status["appointments"]> };

type Agendamento3Status = {
  config?: {
    is_active?: boolean;
    reminder_enabled?: boolean;
    reminder_hours_before?: number | null;
    reminder_flow?: Agendamento2ReminderFlowItem[] | null;
  };
  google?: {
    isConnected?: boolean;
    configured?: boolean;
    email?: string;
    providerLabel?: string;
    selectedCalendarId?: string;
    error?: string;
  };
  appointments?: Array<{
    id: string;
    client_name?: string | null;
    client_phone?: string | null;
    service_name?: string | null;
    appointment_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    status?: string | null;
    google_calendar_synced?: boolean | null;
  }>;
};

const AGENDA_SCOPE_OPTIONS: Array<{ value: AgendaScope; label: string; description: string }> = [
  { value: "all", label: "Todos", description: "Mostra todos os agendamentos futuros." },
  { value: "today", label: "Hoje", description: "Foco no que ainda acontece hoje." },
  { value: "tomorrow", label: "Amanhã", description: "Mostra somente a agenda de amanhã." },
  { value: "next7", label: "Próximos 7 dias", description: "Visão curta da semana para acompanhar a operação." },
  { value: "custom", label: "Personalizado", description: "Use um dia exato ou uma janela de datas." },
];

async function fetchAgendamento3Status(): Promise<Agendamento3Status> {
  const response = await apiRequest("GET", "/api/agendamento-3/status");
  return response.json();
}

function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function parseScheduledDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateInputForDisplay(value: string) {
  const date = parseScheduledDate(value);
  return date ? date.toLocaleDateString("pt-BR") : null;
}

function getCustomDateBounds(startValue: string, endValue: string) {
  const startDate = parseScheduledDate(startValue);
  const endDate = parseScheduledDate(endValue);
  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    return { startDate: endDate, endDate: startDate };
  }
  return { startDate, endDate };
}

function matchesCustomDateRange(dateValue: string | null | undefined, startValue: string, endValue: string) {
  const itemDate = parseScheduledDate(dateValue);
  if (!itemDate) return false;
  const { startDate, endDate } = getCustomDateBounds(startValue, endValue);
  if (!startDate && !endDate) return true;
  if (startDate && !endDate) return itemDate.getTime() === startDate.getTime();
  if (!startDate && endDate) return itemDate.getTime() <= endDate.getTime();
  return itemDate.getTime() >= startDate!.getTime() && itemDate.getTime() <= endDate!.getTime();
}

function describeCustomDateRange(startValue: string, endValue: string) {
  const { startDate, endDate } = getCustomDateBounds(startValue, endValue);
  if (!startDate && !endDate) return "Escolha um dia exato ou preencha data inicial e final para filtrar a agenda.";
  const startLabel = startDate ? startDate.toLocaleDateString("pt-BR") : null;
  const endLabel = endDate ? endDate.toLocaleDateString("pt-BR") : null;
  if (startLabel && endLabel && startDate!.getTime() === endDate!.getTime()) return `Mostrando somente ${startLabel}.`;
  if (startLabel && endLabel) return `Mostrando de ${startLabel} até ${endLabel}.`;
  if (startLabel) return `Mostrando somente ${startLabel}.`;
  return `Mostrando tudo até ${endLabel}.`;
}

function getBrazilCalendarDayDifference(date: Date) {
  const today = parseScheduledDate(todayKey()) || new Date();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

function buildAgendaDayMeta(dateValue: string): Omit<AgendaDayOption, "key" | "count"> {
  const date = parseScheduledDate(dateValue);
  if (!date) {
    return { date: dateValue, title: "Data pendente", shortLabel: "--/--", hint: "Registro precisa de revisão." };
  }
  const diffDays = getBrazilCalendarDayDifference(date);
  let hint = "Agenda futura";
  if (diffDays === 0) hint = "Hoje";
  else if (diffDays === 1) hint = "Amanhã";
  else if (diffDays > 1) hint = `Em ${diffDays} dias`;
  else hint = `${Math.abs(diffDays)} dias atras`;
  return {
    date: dateValue,
    title: date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }),
    shortLabel: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    hint,
  };
}

function compareAgendaDays(left?: string | null, right?: string | null, sortMode: AgendaSortMode = "earliest") {
  const leftValue = left ? new Date(`${left}T00:00:00`).getTime() : 0;
  const rightValue = right ? new Date(`${right}T00:00:00`).getTime() : 0;
  return sortMode === "latest" ? rightValue - leftValue : leftValue - rightValue;
}

function formatAppointmentDate(date?: string | null, time?: string | null) {
  if (!date) return "Sem data";
  const [year, month, day] = String(date).slice(0, 10).split("-");
  return `${day}/${month}/${year}${time ? ` ${String(time).slice(0, 5)}` : ""}`;
}

function formatAppointmentTimeRange(date?: string | null, startTime?: string | null, endTime?: string | null) {
  const start = formatAppointmentDate(date, startTime);
  return endTime ? `${start} - ${String(endTime).slice(0, 5)}` : start;
}

function formatAppointmentStatus(status?: string | null) {
  if (!status) return "Pendente";
  const labels: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmado",
    cancelled: "Cancelado",
    completed: "Concluído",
  };
  return labels[status] || status;
}

function buildEmptyReminderItem(index: number): Agendamento2ReminderFlowItem {
  return {
    id: `agendamento3-reminder-${Date.now()}-${index}`,
    type: "text",
    text: "",
    order: index,
  };
}

export default function Agendamento3AgenticPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"agenda" | "settings">(() => (
    new URLSearchParams(window.location.search).get("tab") === "configuracoes" ? "settings" : "agenda"
  ));
  const [search, setSearch] = useState("");
  const [agendaScope, setAgendaScope] = useState<AgendaScope>("all");
  const [agendaSortMode, setAgendaSortMode] = useState<AgendaSortMode>("earliest");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [expandedAppointmentId, setExpandedAppointmentId] = useState<string | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderFlowItems, setReminderFlowItems] = useState<Agendamento2ReminderFlowItem[]>(
    getDefaultAgendamento2ReminderFlowItems(),
  );

  const statusQuery = useQuery({
    queryKey: ["/api/agendamento-3/status"],
    queryFn: fetchAgendamento3Status,
  });

  const config = statusQuery.data?.config || {};
  const google = statusQuery.data?.google || {};
  const appointments = statusQuery.data?.appointments || [];
  const activeScopeMeta = AGENDA_SCOPE_OPTIONS.find((option) => option.value === agendaScope) || AGENDA_SCOPE_OPTIONS[0];
  const activeScopeDescription = agendaScope === "custom" ? describeCustomDateRange(customStartDate, customEndDate) : activeScopeMeta.description;
  const customStartLabel = customStartDate ? formatDateInputForDisplay(customStartDate) : null;
  const customEndLabel = customEndDate ? formatDateInputForDisplay(customEndDate) : null;

  useEffect(() => {
    if (!statusQuery.data?.config) return;
    setReminderEnabled(statusQuery.data.config.reminder_enabled === true);
    setReminderFlowItems(normalizeAgendamento2ReminderFlowItems(statusQuery.data.config.reminder_flow));
  }, [statusQuery.data?.config]);

  const scopeFilteredAppointments = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const today = todayKey();
    const tomorrow = addDays(today, 1);
    const next7 = addDays(today, 7);

    return [...appointments].sort((left, right) => {
      const dateComparison = compareAgendaDays(
        String(left.appointment_date || "").slice(0, 10),
        String(right.appointment_date || "").slice(0, 10),
        agendaSortMode,
      );
      if (dateComparison !== 0) return dateComparison;
      const leftTime = String(left.start_time || "00:00");
      const rightTime = String(right.start_time || "00:00");
      return agendaSortMode === "latest" ? rightTime.localeCompare(leftTime) : leftTime.localeCompare(rightTime);
    }).filter((appointment) => {
      const date = String(appointment.appointment_date || "").slice(0, 10);
      if (agendaScope === "today" && date !== today) return false;
      if (agendaScope === "tomorrow" && date !== tomorrow) return false;
      if (agendaScope === "next7" && (date < today || date > next7)) return false;
      if (agendaScope === "custom" && !matchesCustomDateRange(date, customStartDate, customEndDate)) return false;
      if (!normalizedSearch) return true;
      const haystack = [
        appointment.client_name,
        appointment.client_phone,
        appointment.service_name,
        appointment.status,
        date,
      ].map((value) => String(value || "").toLowerCase()).join(" ");
      return haystack.includes(normalizedSearch);
    });
  }, [appointments, agendaScope, agendaSortMode, customEndDate, customStartDate, search]);

  const agendaDayOptions = useMemo(() => {
    const grouped = new Map<string, AgendaDayOption>();
    for (const appointment of scopeFilteredAppointments) {
      const key = String(appointment.appointment_date || "").slice(0, 10);
      if (!key) continue;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const meta = buildAgendaDayMeta(key);
      grouped.set(key, { key, date: meta.date, title: meta.title, shortLabel: meta.shortLabel, hint: meta.hint, count: 1 });
    }
    return Array.from(grouped.values()).sort((left, right) => compareAgendaDays(left.date, right.date, agendaSortMode));
  }, [agendaSortMode, scopeFilteredAppointments]);

  useEffect(() => {
    if (!selectedDayKey) return;
    if (!agendaDayOptions.some((option) => option.key === selectedDayKey)) {
      setSelectedDayKey(null);
    }
  }, [agendaDayOptions, selectedDayKey]);

  const filteredAppointments = useMemo(() => {
    if (!selectedDayKey) return scopeFilteredAppointments;
    return scopeFilteredAppointments.filter((appointment) => String(appointment.appointment_date || "").slice(0, 10) === selectedDayKey);
  }, [scopeFilteredAppointments, selectedDayKey]);

  const agendaGroups = useMemo(() => {
    const groups = new Map<string, AgendaGroup>();
    for (const appointment of filteredAppointments) {
      const key = String(appointment.appointment_date || "").slice(0, 10);
      if (!key) continue;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(appointment);
        existing.count += 1;
        continue;
      }
      const meta = buildAgendaDayMeta(key);
      groups.set(key, { key, date: meta.date, title: meta.title, shortLabel: meta.shortLabel, hint: meta.hint, count: 1, items: [appointment] });
    }
    return Array.from(groups.values()).sort((left, right) => compareAgendaDays(left.date, right.date, agendaSortMode));
  }, [agendaSortMode, filteredAppointments]);

  const selectedDayMeta = agendaDayOptions.find((option) => option.key === selectedDayKey) || null;

  const toggleMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      const response = await apiRequest("PUT", "/api/agendamento-3/config", {
        is_active: isActive,
        agentic_mode_enabled: true,
        require_google_validation: true,
        auto_confirm: true,
      });
      return response.json();
    },
    onSuccess: (_data, isActive) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agendamento-3/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agendamento-2-config"] });
      toast({
        title: isActive ? "Agenda inteligente ligada" : "Agenda inteligente desligada",
        description: isActive ? "O atendimento passa a confirmar horários pela agenda atual." : "A confirmação automática de horários ficou pausada.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Nao foi possivel salvar", description: error.message, variant: "destructive" });
    },
  });

  const saveReminderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/agendamento-3/config", {
        reminder_enabled: reminderEnabled,
        reminder_hours_before: DEFAULT_AGENDAMENTO2_REMINDER_HOURS_BEFORE,
        reminder_flow: reminderFlowItems.map((item, index) => ({
          id: item.id || `agendamento3-reminder-step-${index + 1}`,
          type: "text",
          text: item.text,
          order: index,
        })),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agendamento-3/status"] });
      toast({ title: "Lembretes salvos", description: "O fluxo de lembrete do Agendamento 3.0 foi atualizado." });
    },
    onError: (error: Error) => {
      toast({ title: "Nao foi possivel salvar os lembretes", description: error.message, variant: "destructive" });
    },
  });

  const connectGoogleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/scheduling/google-calendar/connect?returnTo=${encodeURIComponent("/agendamento-3")}`,
      );
      return response.json() as Promise<{ authUrl?: string }>;
    },
    onSuccess: async (data) => {
      if (!data.authUrl) throw new Error("URL Google nao retornada.");
      let popupResult: Awaited<ReturnType<typeof openGoogleCalendarPopup>>;
      try {
        popupResult = await openGoogleCalendarPopup(data.authUrl, "agendamento3-google-calendar");
      } catch (error) {
        const latestStatus = await fetchAgendamento3Status().catch(() => null);
        if (latestStatus?.google?.isConnected) {
          queryClient.setQueryData(["/api/agendamento-3/status"], latestStatus);
          queryClient.invalidateQueries({ queryKey: ["/api/agendamento-3/status"] });
          toast({ title: "Google conectado", description: "A agenda integrada foi atualizada." });
          return;
        }
        throw error;
      }
      if (!popupResult.success) {
        const latestStatus = await fetchAgendamento3Status().catch(() => null);
        if (latestStatus?.google?.isConnected) {
          queryClient.setQueryData(["/api/agendamento-3/status"], latestStatus);
          queryClient.invalidateQueries({ queryKey: ["/api/agendamento-3/status"] });
          toast({ title: "Google conectado", description: "A agenda integrada foi atualizada." });
          return;
        }
        throw new Error(popupResult.message || "Nao foi possivel concluir a conexao com Google Calendar.");
      }
      const latestStatus = await fetchAgendamento3Status().catch(() => null);
      if (latestStatus) {
        queryClient.setQueryData(["/api/agendamento-3/status"], latestStatus);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/agendamento-3/status"] });
      toast({ title: "Google conectado", description: "A agenda integrada foi atualizada." });
    },
    onError: (error: Error) => {
      toast({ title: "Falha na conexão Google", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get("googleCalendarConnected");
    const googleError = params.get("googleCalendarError");

    if (!googleConnected && !googleError) return;

    if (googleConnected) {
      queryClient.invalidateQueries({ queryKey: ["/api/agendamento-3/status"] });
      toast({ title: "Google conectado", description: "A agenda integrada foi atualizada." });
    }

    if (googleError) {
      toast({ title: "Falha na conexao Google", description: googleError, variant: "destructive" });
    }

    params.delete("googleCalendarConnected");
    params.delete("googleCalendarError");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, [queryClient, toast]);

  const updateReminderItem = (id: string, text: string) => {
    setReminderFlowItems((items) => items.map((item) => (item.id === id ? { ...item, text } : item)));
  };

  const addReminderItem = () => {
    setReminderFlowItems((items) => [...items, buildEmptyReminderItem(items.length)]);
  };

  const removeReminderItem = (id: string) => {
    setReminderFlowItems((items) => {
      if (items.length === 1) return items;
      return items.filter((item) => item.id !== id).map((item, index) => ({ ...item, order: index }));
    });
  };

  const moveReminderItem = (index: number, direction: "up" | "down") => {
    setReminderFlowItems((items) => {
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= items.length) return items;
      const nextItems = [...items];
      const [removed] = nextItems.splice(index, 1);
      nextItems.splice(nextIndex, 0, removed);
      return nextItems.map((item, itemIndex) => ({ ...item, order: itemIndex }));
    });
  };

  const reminderFlowIsValid = reminderFlowItems.some((item) => item.text.trim().length > 0);
  const canSaveReminderConfig = (!reminderEnabled || reminderFlowIsValid) && !saveReminderMutation.isPending;

  return (
      <div className="space-y-5 p-4 pb-24 md:p-6" data-testid="page-agendamento-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-950">Agendamento 3.0</h1>
              <Badge variant={config.is_active ? "default" : "outline"}>{config.is_active ? "Ativo" : "Inativo"}</Badge>
              <Badge variant="secondary">Agenda inteligente</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Confirma horários com base na agenda real, nos agendamentos salvos e no Google Calendar conectado.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-md border bg-white px-3 py-2">
            <Power className="h-4 w-4 text-slate-500" />
            <Label htmlFor="agendamento3-active" className="text-sm font-medium">Agendamento 3.0</Label>
            <Switch
              id="agendamento3-active"
              checked={Boolean(config.is_active)}
              disabled={toggleMutation.isPending || statusQuery.isLoading}
              data-gated-action="true"
              aria-label="Ativar Agendamento 3.0"
              onCheckedChange={(checked) => toggleMutation.mutate(checked)}
            />
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            const nextTab = value === "settings" ? "settings" : "agenda";
            setActiveTab(nextTab);
          }}
          className="space-y-4"
        >
          <TabsList className="grid h-auto w-full grid-cols-2 bg-slate-100 p-1 sm:w-[360px]">
            <TabsTrigger value="agenda" className="gap-2">
              <CalendarClock className="h-4 w-4" />
              Agenda
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Clock3 className="h-4 w-4" />
              Configurações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Link2 className="h-5 w-5 text-blue-600" />
                Google Calendar
              </CardTitle>
              <CardDescription>Usa a mesma conexão de agenda que já existe no módulo de agendamento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{google.isConnected ? "Conectado" : "Desconectado"}</p>
                  <p className="text-xs text-slate-500">{google.email || google.error || "Nenhuma conta Google ativa."}</p>
                </div>
                <Badge variant={google.isConnected ? "default" : "outline"}>{google.providerLabel || "Google"}</Badge>
              </div>
              <Button
                variant={google.isConnected ? "outline" : "default"}
                onClick={() => connectGoogleMutation.mutate()}
                disabled={connectGoogleMutation.isPending}
                data-gated-action="true"
                className="w-full gap-2"
              >
                {connectGoogleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                {google.isConnected ? "Reconectar Google" : "Conectar Google"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock3 className="h-5 w-5 text-sky-700" />
                Lembrete 1 hora antes
              </CardTitle>
              <CardDescription>Envia o fluxo abaixo antes do horário confirmado pelo Agendamento 3.0.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-md border bg-slate-50 px-3 py-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    Lembrete automatico
                    <Badge variant="outline">{reminderEnabled ? "Ligado" : "Desligado"}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">Quando ligado, sai 1 hora antes do horário agendado.</p>
                </div>
                <Switch
                  checked={reminderEnabled}
                  onCheckedChange={setReminderEnabled}
                  data-gated-action="true"
                  aria-label="Ativar lembrete automatico"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <Label className="text-sm font-semibold">Mensagens do lembrete</Label>
                  <p className="text-sm text-slate-600">Monte as bolhas na ordem em que devem ser enviadas.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addReminderItem} data-gated-action="true">
                  <MessageSquarePlus className="mr-2 h-4 w-4" />
                  Adicionar
                </Button>
              </div>

              <div className="space-y-3">
                {reminderFlowItems.map((item, index) => (
                  <div key={item.id} className="rounded-md border bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Badge variant="secondary">Mensagem {index + 1}</Badge>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => moveReminderItem(index, "up")}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" disabled={index === reminderFlowItems.length - 1} onClick={() => moveReminderItem(index, "down")}>
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" disabled={reminderFlowItems.length === 1} onClick={() => removeReminderItem(item.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      className="min-h-24 resize-y"
                      placeholder="Escreva a mensagem desta bolha..."
                      value={item.text}
                      onChange={(event) => updateReminderItem(item.id, event.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 rounded-md border bg-sky-50 p-3 text-sm text-sky-900">
                {["{nome}", "{referencia_agendamento}", "{hora_agendamento}", "{data_agendamento}", "{data_agendamento_extenso}"].map((placeholder) => (
                  <Badge key={placeholder} variant="outline" className="bg-white">{placeholder}</Badge>
                ))}
              </div>

              <div className="flex justify-end">
                <Button onClick={() => saveReminderMutation.mutate()} disabled={!canSaveReminderConfig} data-gated-action="true">
                  <Save className="mr-2 h-4 w-4" />
                  {saveReminderMutation.isPending ? "Salvando..." : "Salvar lembrete"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
          </TabsContent>

          <TabsContent value="agenda" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="h-5 w-5 text-slate-700" />
              Agenda viva
            </CardTitle>
            <CardDescription>Busque e filtre os agendamentos confirmados pelo módulo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar na agenda"
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2 pb-1">
                {AGENDA_SCOPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setAgendaScope(option.value);
                      setSelectedDayKey(null);
                    }}
                    className={`min-w-fit rounded-full border px-4 py-2 text-sm transition ${
                      agendaScope === option.value
                        ? "border-sky-200 bg-sky-50 text-sky-700 shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-sky-100 hover:text-slate-900"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <div className="font-medium">{activeScopeMeta.label}</div>
              <div className="mt-1 text-sky-800/80">{activeScopeDescription}</div>
            </div>

            {agendaScope === "custom" ? (
              <div className="space-y-3 rounded-md border bg-slate-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-medium uppercase text-slate-500">Data personalizada</div>
                    <p className="mt-1 text-sm text-slate-600">Escolha um dia único ou uma janela exata da agenda.</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCustomStartDate("");
                      setCustomEndDate("");
                      setAgendaScope("all");
                      setSelectedDayKey(null);
                    }}
                  >
                    Limpar
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="agendamento3-start-date">De</Label>
                    <Input
                      id="agendamento3-start-date"
                      type="date"
                      value={customStartDate}
                      onChange={(event) => {
                        setCustomStartDate(event.target.value);
                        setAgendaScope("custom");
                        setSelectedDayKey(null);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agendamento3-end-date">Até</Label>
                    <Input
                      id="agendamento3-end-date"
                      type="date"
                      value={customEndDate}
                      onChange={(event) => {
                        setCustomEndDate(event.target.value);
                        setAgendaScope("custom");
                        setSelectedDayKey(null);
                      }}
                    />
                  </div>
                </div>
                <div className="rounded-md border bg-white px-3 py-2 text-sm text-slate-600">
                  {customStartLabel || customEndLabel
                    ? `Filtro manual: ${customStartLabel || "início livre"} até ${customEndLabel || customStartLabel}`
                    : "Sem data manual aplicada. Os atalhos rapidos continuam controlando a agenda."}
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium uppercase text-slate-500">Dias encontrados</div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedDayKey(null)} disabled={!selectedDayKey}>
                  {selectedDayKey ? "Limpar dia" : "Sem dia travado"}
                </Button>
              </div>
              {agendaDayOptions.length === 0 ? (
                <div className="rounded-md border border-dashed px-4 py-5 text-sm text-slate-500">
                  Nenhum dia foi encontrado dentro dos filtros atuais.
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {agendaDayOptions.map((option) => {
                    const isActive = selectedDayKey === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setSelectedDayKey(isActive ? null : option.key)}
                        className={`min-w-[168px] rounded-md border p-3 text-left transition ${
                          isActive
                            ? "border-sky-300 bg-sky-50 text-sky-900 shadow-sm"
                            : "border-slate-200 bg-white hover:border-sky-100 hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold">{option.shortLabel}</div>
                          <Badge variant="outline" className="bg-white">{option.count}</Badge>
                        </div>
                        <div className="mt-2 text-sm font-medium">{option.title}</div>
                        <div className="mt-1 text-xs text-slate-500">{option.hint}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-md border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">
                {selectedDayMeta
                  ? `${selectedDayMeta.count} agendamento(s) visiveis para ${selectedDayMeta.title}.`
                  : `${scopeFilteredAppointments.length} agendamento(s) no filtro atual.`}
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="agendamento3-sort-mode" className="text-xs font-medium uppercase text-slate-500">Ordenar</Label>
                <select
                  id="agendamento3-sort-mode"
                  value={agendaSortMode}
                  onChange={(event) => setAgendaSortMode(event.target.value as AgendaSortMode)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="earliest">Primeiros agendados</option>
                  <option value="latest">Últimos agendados</option>
                </select>
              </div>
            </div>

            {statusQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando agenda...</div>
            ) : agendaGroups.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum agendamento encontrado para este filtro.</p>
            ) : (
              <div className="space-y-4">
                {agendaGroups.map((group) => (
                  <div key={group.key} className="overflow-hidden rounded-md border">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{group.title}</div>
                        <div className="text-xs text-slate-500">{group.hint}</div>
                      </div>
                      <Badge variant="outline" className="bg-white">{group.count} agendamento(s)</Badge>
                    </div>
                    {group.items.map((appointment) => {
                      const expanded = expandedAppointmentId === appointment.id;
                      return (
                        <div key={appointment.id} className="border-b last:border-b-0">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setExpandedAppointmentId(expanded ? null : appointment.id)}
                            className="grid w-full gap-2 p-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 md:grid-cols-[1fr_160px_120px] md:items-center"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-900">{appointment.client_name || "Cliente"}</p>
                              <p className="text-xs text-slate-500">{appointment.service_name || "Atendimento"} {appointment.client_phone ? `- ${appointment.client_phone}` : ""}</p>
                            </div>
                            <p className="text-sm text-slate-700">{formatAppointmentDate(appointment.appointment_date, appointment.start_time)}</p>
                            <span className={`inline-flex w-fit items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${
                              appointment.google_calendar_synced
                                ? "border-transparent bg-primary text-primary-foreground"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}>
                              {appointment.google_calendar_synced ? "Google OK" : formatAppointmentStatus(appointment.status)}
                            </span>
                          </button>
                          {expanded ? (
                            <div className="grid gap-3 border-t bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                              <div>
                                <p className="text-xs font-medium uppercase text-slate-500">Cliente</p>
                                <p className="mt-1 font-medium text-slate-900">{appointment.client_name || "Cliente sem nome"}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase text-slate-500">Telefone</p>
                                <p className="mt-1">{appointment.client_phone || "Sem telefone salvo"}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase text-slate-500">Serviço</p>
                                <p className="mt-1">{appointment.service_name || "Atendimento"}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase text-slate-500">Data e horário</p>
                                <p className="mt-1">{formatAppointmentTimeRange(appointment.appointment_date, appointment.start_time, appointment.end_time)}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase text-slate-500">Status</p>
                                <p className="mt-1">{formatAppointmentStatus(appointment.status)}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase text-slate-500">Google Calendar</p>
                                <p className="mt-1">{appointment.google_calendar_synced ? "Sincronizado" : "Ainda não sincronizado"}</p>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}
