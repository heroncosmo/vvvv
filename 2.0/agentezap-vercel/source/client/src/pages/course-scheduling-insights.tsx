import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  BookUser,
  CalendarClock,
  ChevronRight,
  Clock3,
  MessageSquarePlus,
  MessageSquareText,
  Phone,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import PremiumBlocked from "@/components/premium-overlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { openAppRealtimeConnection } from "@/lib/app-realtime";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import type { WhatsappConnection } from "@shared/schema";
import {
  DEFAULT_COURSE_REMINDER_HOURS_BEFORE,
  getDefaultCourseReminderFlowItems,
  normalizeCourseReminderFlowItems,
  type CourseReminderFlowItem,
} from "@shared/courseReminderFlow";

type CourseSchedulingInsightRecord = {
  id: string;
  conversationId: string;
  connectionId: string;
  contactNumber: string;
  contactName: string | null;
  status: "scheduled" | "cancelled" | "not_scheduled";
  agreedSchedule: string | null;
  summary: string | null;
  evidence: string[];
  confidence: number;
  scheduledDate: string | null;
  scheduledTime: string | null;
  lastScheduledAt: string | null;
  lastAnalyzedAt: string | null;
  sourceConnectionName: string | null;
};

interface CourseSchedulingResponse {
  data: CourseSchedulingInsightRecord[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

type CourseConfig = {
  is_active: boolean;
  send_to_ai: boolean;
  scheduling_tracker_enabled: boolean;
  course_reminder_enabled: boolean;
  course_reminder_hours_before: number;
  course_reminder_flow: CourseReminderFlowItem[] | null;
};

type AgendaScope = "all" | "today" | "tomorrow" | "next7" | "custom" | "undated";
type AgendaDayOption = { key: string; date: string | null; title: string; shortLabel: string; hint: string; count: number };
type AgendaGroup = AgendaDayOption & { items: CourseSchedulingInsightRecord[] };

const AGENDA_SCOPE_OPTIONS: Array<{ value: AgendaScope; label: string; description: string }> = [
  { value: "all", label: "Todos", description: "Mostra toda a agenda capturada pela IA." },
  { value: "today", label: "Hoje", description: "Foco total no que precisa acontecer ainda hoje." },
  { value: "tomorrow", label: "Amanhã", description: "Separa rapidamente o que já ficou para o próximo dia." },
  { value: "next7", label: "Próximos 7 dias", description: "Visão curta da semana para agir como uma agenda de SaaS." },
  { value: "custom", label: "Personalizado", description: "Use quando precisar focar em um dia específico ou em uma janela de datas." },
  { value: "undated", label: "Sem data", description: "Casos em que a IA fechou o contexto, mas o dia ainda não veio estruturado." },
];

function formatConfidence(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Math.round(value)}%`;
}

function formatRelativeDate(value: string | null) {
  if (!value) return "Agora mesmo";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

function buildEmptyReminderItem(index: number): CourseReminderFlowItem {
  return { id: `course-reminder-custom-${Date.now()}-${index}`, order: index, type: "text", text: "" };
}

function capitalizeText(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseScheduledDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDateInputForDisplay(value: string) {
  const date = parseScheduledDate(value);
  if (!date) return null;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getCustomDateBounds(startValue: string, endValue: string) {
  const startDate = parseScheduledDate(startValue);
  const endDate = parseScheduledDate(endValue);
  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    return { startDate: endDate, endDate: startDate };
  }
  return { startDate, endDate };
}

function matchesCustomDateRange(item: CourseSchedulingInsightRecord, startValue: string, endValue: string) {
  const itemDate = parseScheduledDate(item.scheduledDate);
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

function parseClockToMinutes(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const [hourPart, minutePart] = value.split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.POSITIVE_INFINITY;
  return hour * 60 + minute;
}

function getBrazilCalendarDayDifference(date: Date) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((targetStart.getTime() - todayStart.getTime()) / 86400000);
}

function buildAgendaDayMeta(dateValue: string | null): Omit<AgendaDayOption, "key" | "count"> {
  if (!dateValue) {
    return { date: null, title: "Sem data definida", shortLabel: "Sem dia", hint: "A IA fechou o contexto, mas ainda sem dia estruturado." };
  }
  const date = parseScheduledDate(dateValue);
  if (!date) {
    return { date: null, title: "Sem data válida", shortLabel: "Sem dia", hint: "O registro precisa ser revisado no histórico da conversa." };
  }
  const diffDays = getBrazilCalendarDayDifference(date);
  let hint = "Agenda futura";
  if (diffDays === 0) hint = "Hoje";
  else if (diffDays === 1) hint = "Amanhã";
  else if (diffDays > 1) hint = `Em ${diffDays} dias`;
  else if (diffDays === -1) hint = "Ontem";
  else hint = `${Math.abs(diffDays)} dias atrás`;
  return {
    date: dateValue,
    title: capitalizeText(date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })),
    shortLabel: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    hint,
  };
}

function matchesAgendaScope(item: CourseSchedulingInsightRecord, scope: AgendaScope, customStartDate: string, customEndDate: string) {
  if (scope === "all") return true;
  if (scope === "undated") return !item.scheduledDate;
  if (scope === "custom") return matchesCustomDateRange(item, customStartDate, customEndDate);
  const date = parseScheduledDate(item.scheduledDate);
  if (!date) return false;
  const diffDays = getBrazilCalendarDayDifference(date);
  if (scope === "today") return diffDays === 0;
  if (scope === "tomorrow") return diffDays === 1;
  return diffDays >= 0 && diffDays <= 6;
}

function sortInsightsForAgenda(items: CourseSchedulingInsightRecord[]) {
  return [...items].sort((left, right) => {
    const leftDate = parseScheduledDate(left.scheduledDate);
    const rightDate = parseScheduledDate(right.scheduledDate);
    if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) return leftDate.getTime() - rightDate.getTime();
    if (leftDate && !rightDate) return -1;
    if (!leftDate && rightDate) return 1;
    const leftMinutes = parseClockToMinutes(left.scheduledTime);
    const rightMinutes = parseClockToMinutes(right.scheduledTime);
    if (leftMinutes !== rightMinutes) return leftMinutes - rightMinutes;
    const leftUpdated = left.lastScheduledAt ? new Date(left.lastScheduledAt).getTime() : 0;
    const rightUpdated = right.lastScheduledAt ? new Date(right.lastScheduledAt).getTime() : 0;
    return rightUpdated - leftUpdated;
  });
}

function formatScheduleHeadline(item: CourseSchedulingInsightRecord) {
  const parts: string[] = [];
  if (item.scheduledDate) parts.push(buildAgendaDayMeta(item.scheduledDate).shortLabel);
  if (item.scheduledTime) parts.push(item.scheduledTime);
  if (parts.length === 0) return "Sem data definida";
  return parts.join(" · ");
}

export default function CourseSchedulingInsightsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("insights");
  const [connectionId, setConnectionId] = useState("all");
  const [agendaScope, setAgendaScope] = useState<AgendaScope>("all");
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderFlowItems, setReminderFlowItems] = useState<CourseReminderFlowItem[]>(getDefaultCourseReminderFlowItems());

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const { data: connections = [] } = useQuery<WhatsappConnection[]>({ queryKey: ["/api/whatsapp/connections"] });

  const { data: courseConfig } = useQuery<CourseConfig>({
    queryKey: ["/api/course-config"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/course-config");
      return response.json();
    },
  });

  useEffect(() => {
    if (!courseConfig) return;
    setReminderEnabled(courseConfig.course_reminder_enabled === true);
    setReminderFlowItems(normalizeCourseReminderFlowItems(courseConfig.course_reminder_flow));
  }, [courseConfig]);

  const toggleTrackingMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest("PUT", "/api/course-config", { scheduling_tracker_enabled: enabled });
      return response.json();
    },
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-config"] });
      toast({
        title: enabled ? "Agendamento de cursos ativado" : "Agendamento de cursos desativado",
        description: enabled
          ? "O módulo voltou a registrar novos agendamentos e a liberar as automações configuradas."
          : "O módulo deixa de registrar novos agendamentos e bloqueia os disparos automáticos até ser ligado novamente.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível atualizar o agendamento de cursos", description: error.message, variant: "destructive" });
    },
  });

  const saveReminderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/course-config", {
        course_reminder_enabled: reminderEnabled,
        course_reminder_hours_before: DEFAULT_COURSE_REMINDER_HOURS_BEFORE,
        course_reminder_flow: reminderFlowItems
          .map((item, index) => ({ id: item.id || `course-reminder-step-${index + 1}`, order: index, type: "text", text: item.text.trim() }))
          .filter((item) => item.text.length > 0),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-config"] });
      toast({ title: "Configurações de lembrete salvas", description: "O fluxo do lembrete de cursos foi atualizado." });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível salvar o lembrete", description: error.message, variant: "destructive" });
    },
  });

  const queryKey = ["/api/course-scheduling-insights", "scheduled", connectionId, query];

  const { data, isLoading } = useQuery<CourseSchedulingResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ status: "scheduled", limit: "100", offset: "0" });
      if (connectionId !== "all") params.set("connectionId", connectionId);
      if (query) params.set("q", query);
      const token = await getAuthToken();
      const response = await fetch(`/api/course-scheduling-insights?${params.toString()}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Falha ao carregar o painel de cursos");
      return response.json();
    },
  });

  useEffect(() => {
    let realtimeConnection: { close: () => Promise<void> } | null = null;
    let reconnectTimeout: number | undefined;
    let cancelled = false;
    const connectRealtime = async () => {
      try {
        realtimeConnection = await openAppRealtimeConnection({
          scope: "user",
          getToken: getAuthToken,
          onEvent: (payload) => {
            if (payload.type === "course_scheduling_updated" || payload.type === "new_message" || payload.type === "agent_response" || payload.type === "message_sent") {
              queryClient.invalidateQueries({ queryKey: ["/api/course-scheduling-insights"] });
            }
          },
          onClose: () => {
            if (!cancelled) reconnectTimeout = window.setTimeout(connectRealtime, 3000);
          },
        });

        if (!realtimeConnection && !cancelled) {
          reconnectTimeout = window.setTimeout(connectRealtime, 3000);
        }
      } catch (_error) {
        if (!cancelled) reconnectTimeout = window.setTimeout(connectRealtime, 3000);
      }
    };
    void connectRealtime();
    return () => {
      cancelled = true;
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      void realtimeConnection?.close();
    };
  }, []);

  const insights = data?.data || [];
  const sortedInsights = useMemo(() => sortInsightsForAgenda(insights), [insights]);
  const scopeFilteredInsights = useMemo(
    () => sortedInsights.filter((item) => matchesAgendaScope(item, agendaScope, customStartDate, customEndDate)),
    [agendaScope, customEndDate, customStartDate, sortedInsights],
  );
  const agendaDayOptions = useMemo(() => {
    const grouped = new Map<string, AgendaDayOption>();
    for (const item of scopeFilteredInsights) {
      const key = item.scheduledDate || "undated";
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const meta = buildAgendaDayMeta(item.scheduledDate);
      grouped.set(key, { key, date: meta.date, title: meta.title, shortLabel: meta.shortLabel, hint: meta.hint, count: 1 });
    }
    return Array.from(grouped.values()).sort((left, right) => {
      const leftDate = parseScheduledDate(left.date);
      const rightDate = parseScheduledDate(right.date);
      if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) return leftDate.getTime() - rightDate.getTime();
      if (leftDate && !rightDate) return -1;
      if (!leftDate && rightDate) return 1;
      return left.title.localeCompare(right.title, "pt-BR");
    });
  }, [scopeFilteredInsights]);

  useEffect(() => {
    if (!selectedDayKey) return;
    const stillExists = agendaDayOptions.some((option) => option.key === selectedDayKey);
    if (!stillExists) setSelectedDayKey(null);
  }, [agendaDayOptions, selectedDayKey]);

  const filteredInsights = useMemo(() => {
    if (!selectedDayKey) return scopeFilteredInsights;
    return scopeFilteredInsights.filter((item) => (item.scheduledDate || "undated") === selectedDayKey);
  }, [scopeFilteredInsights, selectedDayKey]);

  const agendaGroups = useMemo(() => {
    const groups = new Map<string, AgendaGroup>();
    for (const item of filteredInsights) {
      const key = item.scheduledDate || "undated";
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
        existing.count += 1;
        continue;
      }
      const meta = buildAgendaDayMeta(item.scheduledDate);
      groups.set(key, { key, date: meta.date, title: meta.title, shortLabel: meta.shortLabel, hint: meta.hint, count: 1, items: [item] });
    }
    return Array.from(groups.values()).sort((left, right) => {
      const leftDate = parseScheduledDate(left.date);
      const rightDate = parseScheduledDate(right.date);
      if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) return leftDate.getTime() - rightDate.getTime();
      if (leftDate && !rightDate) return -1;
      if (!leftDate && rightDate) return 1;
      return left.title.localeCompare(right.title, "pt-BR");
    });
  }, [filteredInsights]);

  const summary = useMemo(() => {
    const connectionCount = new Set(filteredInsights.map((item) => item.connectionId)).size;
    const visibleDays = agendaGroups.filter((group) => group.date).length;
    const undatedCount = filteredInsights.filter((item) => !item.scheduledDate).length;
    const nextScheduled = filteredInsights.find((item) => item.scheduledDate || item.scheduledTime) || null;
    return { totalFetched: data?.total || 0, totalVisible: filteredInsights.length, connectionCount, visibleDays, undatedCount, nextScheduled };
  }, [agendaGroups, data?.total, filteredInsights]);

  const reminderFlowIsValid = reminderFlowItems.some((item) => item.text.trim().length > 0);
  const canSaveReminderConfig = (!reminderEnabled || reminderFlowIsValid) && !saveReminderMutation.isPending;
  const activeScopeMeta = AGENDA_SCOPE_OPTIONS.find((option) => option.value === agendaScope) || AGENDA_SCOPE_OPTIONS[0];
  const activeScopeDescription = agendaScope === "custom" ? describeCustomDateRange(customStartDate, customEndDate) : activeScopeMeta.description;
  const selectedDayMeta = agendaDayOptions.find((option) => option.key === selectedDayKey) || null;
  const customStartLabel = formatDateInputForDisplay(customStartDate);
  const customEndLabel = formatDateInputForDisplay(customEndDate);

  const updateReminderItem = (id: string, text: string) => {
    setReminderFlowItems((current) => current.map((item) => (item.id === id ? { ...item, text } : item)));
  };
  const moveReminderItem = (index: number, direction: "up" | "down") => {
    setReminderFlowItems((current) => {
      const next = [...current];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return current;
      const currentItem = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = currentItem;
      return next.map((item, itemIndex) => ({ ...item, order: itemIndex }));
    });
  };
  const addReminderItem = () => setReminderFlowItems((current) => [...current, buildEmptyReminderItem(current.length)]);
  const removeReminderItem = (id: string) => {
    setReminderFlowItems((current) => current.filter((item) => item.id !== id).map((item, index) => ({ ...item, order: index })));
  };

  return (
    <PremiumBlocked title="Cursos" subtitle="Seu período de teste acabou" description="Assine um plano para usar o módulo de agendamento de cursos com a IA." ctaLabel="Ativar Plano Ilimitado">
      <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.02),_rgba(15,23,42,0))] p-4 sm:p-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <div className="space-y-2">
            <Badge variant="outline" className="rounded-full border-sky-200 bg-sky-50 text-sky-700">Agendamento de cursos</Badge>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Cursos</h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">A IA continua conduzindo a conversa normalmente e este módulo mostra quem realmente fechou um agendamento de curso.</p>
              </div>
              <Card className="w-full max-w-xl border-sky-200/70 bg-background/90 shadow-sm">
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <ShieldCheck className="h-4 w-4 text-sky-700" />
                      Agendamento de cursos
                      <Badge variant="outline" className={courseConfig?.scheduling_tracker_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}>
                        {courseConfig?.scheduling_tracker_enabled ? "Ligado" : "Desligado"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Quando estiver ligado, o módulo registra novos agendamentos de cursos e libera o lembrete configurado abaixo.</p>
                  </div>
                  <Switch checked={courseConfig?.scheduling_tracker_enabled === true} disabled={toggleTrackingMutation.isPending} onCheckedChange={(checked) => toggleTrackingMutation.mutate(checked)} aria-label="Ativar agendamento de cursos" />
                </CardContent>
              </Card>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="insights">Agendamentos</TabsTrigger>
              <TabsTrigger value="settings">Configurações</TabsTrigger>
            </TabsList>
            <TabsContent value="insights" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="border-sky-200 bg-sky-50/80">
                  <CardHeader className="pb-2">
                    <CardDescription>No filtro atual</CardDescription>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <BookUser className="h-5 w-5 text-sky-700" />
                      {summary.totalVisible}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-emerald-200 bg-emerald-50/80">
                  <CardHeader className="pb-2">
                    <CardDescription>Dias visíveis na agenda</CardDescription>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <CalendarClock className="h-5 w-5 text-emerald-700" />
                      {summary.visibleDays}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-slate-200 bg-slate-50/80">
                  <CardHeader className="pb-2">
                    <CardDescription>Sem data definida</CardDescription>
                    <CardTitle className="flex items-center gap-2 text-2xl text-slate-700">
                      <MessageSquareText className="h-5 w-5 text-slate-700" />
                      {summary.undatedCount}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-violet-200 bg-violet-50/80">
                  <CardHeader className="pb-2">
                    <CardDescription>Próxima referência</CardDescription>
                    <CardTitle className="flex items-center gap-2 text-base font-medium text-violet-700">
                      <Clock3 className="h-5 w-5 text-violet-700" />
                      {summary.nextScheduled ? formatScheduleHeadline(summary.nextScheduled) : "Sem agenda"}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <Card className="border-border/70 bg-background/90 shadow-sm">
                <CardHeader className="gap-5">
                  <div className="space-y-2">
                    <CardTitle>Agenda viva dos fechamentos</CardTitle>
                    <CardDescription>
                      Combine busca, conexão, período e dia específico para navegar como uma agenda real sem mexer na lógica da IA.
                    </CardDescription>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        placeholder="Buscar por nome, número, resumo ou combinado"
                        className="pl-9"
                      />
                    </div>

                    <select
                      value={connectionId}
                      onChange={(event) => setConnectionId(event.target.value)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="all">Todas as conexões</option>
                      {connections.map((connection) => (
                        <option key={connection.id} value={connection.id}>
                          {connection.connectionName || connection.phoneNumber || "Conexão"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Período rápido
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {AGENDA_SCOPE_OPTIONS.map((option) => {
                        const isActive = agendaScope === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setAgendaScope(option.value);
                              setSelectedDayKey(null);
                            }}
                            className={`min-w-fit rounded-full border px-4 py-2 text-sm transition ${
                              isActive
                                ? "border-sky-200 bg-sky-50 text-sky-700 shadow-sm"
                                : "border-border/70 bg-background text-muted-foreground hover:border-sky-100 hover:text-foreground"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
                      <div className="font-medium">{activeScopeMeta.label}</div>
                      <div className="mt-1 text-sky-800/80">{activeScopeDescription}</div>
                    </div>
                  </div>

                  {agendaScope === "custom" ? (
                    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            Data personalizada
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Escolha um dia único ou combine início e fim para ver uma janela exata da agenda.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setCustomStartDate("");
                            setCustomEndDate("");
                            setAgendaScope("all");
                            setSelectedDayKey(null);
                          }}
                          className="w-fit text-sm text-sky-700 transition hover:text-sky-800"
                        >
                          Limpar personalizada
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="course-agenda-start-date">De</Label>
                          <Input
                            id="course-agenda-start-date"
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
                          <Label htmlFor="course-agenda-end-date">Até</Label>
                          <Input
                            id="course-agenda-end-date"
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

                      <div className="rounded-xl border border-slate-200 bg-background px-3 py-2 text-sm text-muted-foreground">
                        {customStartLabel || customEndLabel ? (
                          <span>
                            Filtro manual: {customStartLabel || "início livre"} até {customEndLabel || customStartLabel}
                          </span>
                        ) : (
                          <span>Sem data manual aplicada. Os atalhos rápidos continuam controlando a agenda.</span>
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Dias encontrados
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedDayKey(null)}
                        className={`text-sm transition ${
                          selectedDayKey ? "text-sky-700 hover:text-sky-800" : "text-muted-foreground"
                        }`}
                      >
                        {selectedDayKey ? "Limpar dia selecionado" : "Sem dia travado"}
                      </button>
                    </div>

                    {agendaDayOptions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
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
                              className={`min-w-[180px] rounded-2xl border p-4 text-left transition ${
                                isActive
                                  ? "border-sky-300 bg-sky-50 text-sky-900 shadow-sm"
                                  : "border-border/70 bg-background/95 hover:border-sky-100 hover:shadow-sm"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold">{option.shortLabel}</div>
                                <Badge
                                  variant="outline"
                                  className={
                                    isActive
                                      ? "border-sky-200 bg-white text-sky-700"
                                      : "border-slate-200 bg-slate-50 text-slate-600"
                                  }
                                >
                                  {option.count}
                                </Badge>
                              </div>

                              <div className="mt-3 text-sm font-medium leading-5">{option.title}</div>
                              <div className="mt-2 text-xs text-muted-foreground">{option.hint}</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-border/70 bg-background/85 backdrop-blur">
                <CardHeader className="gap-4">
                  <div>
                    <CardTitle>
                      {selectedDayMeta ? `Agenda de ${selectedDayMeta.title}` : "Clientes que fecharam"}
                    </CardTitle>
                    <CardDescription>
                      {selectedDayMeta
                        ? `${selectedDayMeta.count} registro(s) visíveis para o dia escolhido.`
                        : `${summary.totalFetched} fechamento(s) encontrados com busca e conexão atuais. ${summary.connectionCount} conexão(ões) aparecem na visão filtrada.`}
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6 px-3 pb-4 pt-0 sm:px-6 sm:pb-6">
                  {isLoading ? (
                    <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                      Carregando fechamentos de cursos...
                    </div>
                  ) : agendaGroups.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                      Nenhum cliente com agendamento fechado foi encontrado com os filtros atuais.
                    </div>
                  ) : (
                    agendaGroups.map((group) => (
                      <section key={group.key} className="space-y-4">
                        <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-base font-semibold text-foreground">{group.title}</div>
                            <div className="text-sm text-muted-foreground">{group.hint}</div>
                          </div>

                          <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                            {group.count} agendamento(s)
                          </Badge>
                        </div>
                        <div className="space-y-4">
                          {group.items.map((item: CourseSchedulingInsightRecord) => (
                            <div
                              key={item.id}
                              className="overflow-hidden rounded-2xl border border-border/70 bg-background/95 p-4 shadow-sm transition hover:border-sky-200 hover:shadow-md sm:p-5"
                            >
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 flex-1 space-y-3">
                                  <div className="space-y-2">
                                    <h2 className="break-words text-lg font-semibold leading-tight text-foreground">
                                      {item.contactName || item.contactNumber}
                                    </h2>
                                    <div className="flex max-w-full flex-wrap items-center gap-2">
                                      <Badge className="max-w-full rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                        Agendado
                                      </Badge>
                                      <Badge variant="outline" className="max-w-full whitespace-normal rounded-full border-violet-200 bg-violet-50 text-left leading-5 text-violet-700">
                                        {formatScheduleHeadline(item)}
                                      </Badge>
                                      {item.agreedSchedule ? (
                                        <Badge variant="outline" className="max-w-full whitespace-normal rounded-full border-sky-200 bg-sky-50 text-left leading-5 text-sky-700">
                                          {item.agreedSchedule}
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="grid gap-2 text-sm text-muted-foreground sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                                    <span className="inline-flex min-w-0 items-center gap-1.5">
                                      <Phone className="h-4 w-4 shrink-0" />
                                      <span className="min-w-0 break-words">{item.contactNumber}</span>
                                    </span>
                                    {item.sourceConnectionName ? <span className="break-words">{item.sourceConnectionName}</span> : null}
                                    <span>Atualizado {formatRelativeDate(item.lastAnalyzedAt)}</span>
                                  </div>

                                  <p className="max-w-3xl break-words text-sm leading-6 text-foreground/90">
                                    {item.summary || "Sem resumo disponível."}
                                  </p>

                                  {item.evidence.length > 0 ? (
                                    <div className="flex max-w-full flex-wrap gap-2">
                                      {item.evidence.map((evidence: string) => (
                                        <Badge
                                          key={evidence}
                                          variant="secondary"
                                          className="max-w-full whitespace-normal rounded-full bg-slate-100 text-left leading-5 text-slate-700 hover:bg-slate-100"
                                        >
                                          {evidence}
                                        </Badge>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>

                                <div className="grid w-full gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3 sm:grid-cols-[1fr_auto] sm:items-center lg:w-auto lg:min-w-[220px] lg:grid-cols-1 lg:items-stretch">
                                  <div className="text-sm text-muted-foreground sm:min-w-[120px] lg:text-right">
                                    <div>Confiança</div>
                                    <div className="text-base font-semibold text-foreground">
                                      {formatConfidence(item.confidence) || "N/D"}
                                    </div>
                                  </div>

                                  <Button
                                    onClick={() => setLocation(`/conversas/${item.conversationId}`)}
                                    className="w-full justify-center rounded-full sm:w-auto lg:w-full"
                                  >
                                    Entrar na conversa
                                    <ChevronRight className="ml-1 h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <Card className="border-border/70 bg-background/90">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5 text-sky-700" />
                    <CardTitle>Configurações do lembrete</CardTitle>
                  </div>
                  <CardDescription>
                    O disparo acontece 1 hora antes do agendamento fechado neste módulo e só roda quando Agendamento de cursos estiver ligado.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Clock3 className="h-4 w-4 text-sky-700" />
                            Lembrete 1 hora antes
                            <Badge
                              variant="outline"
                              className={
                                reminderEnabled
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                              }
                            >
                              {reminderEnabled ? "Ligado" : "Desligado"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Quando ligado, o sistema envia o fluxo abaixo exatamente 1 hora antes do horário fechado com a IA.
                          </p>
                        </div>

                        <Switch
                          checked={reminderEnabled}
                          onCheckedChange={setReminderEnabled}
                          aria-label="Ativar lembrete 1 hora antes"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-sky-50/80 p-4 text-sm text-sky-900">
                      <div className="font-medium">Placeholders disponíveis</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                          {"{nome}"}
                        </Badge>
                        <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                          {"{referencia_agendamento}"}
                        </Badge>
                        <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                          {"{hora_agendamento}"}
                        </Badge>
                        <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                          {"{data_agendamento}"}
                        </Badge>
                        <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                          {"{data_agendamento_extenso}"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-background/95 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">Fluxo de mensagens do lembrete</Label>
                        <p className="text-sm text-muted-foreground">
                          Monte as bolhas na ordem em que devem sair. Você pode deixar uma mensagem por etapa.
                        </p>
                      </div>

                      <Button type="button" variant="outline" size="sm" onClick={addReminderItem}>
                        <MessageSquarePlus className="mr-2 h-4 w-4" />
                        Adicionar mensagem
                      </Button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {reminderFlowItems.map((item, index) => (
                        <div key={item.id} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">Mensagem {index + 1}</Badge>
                              <span className="text-sm text-muted-foreground">Bolha de texto</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={index === 0}
                                onClick={() => moveReminderItem(index, "up")}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={index === reminderFlowItems.length - 1}
                                onClick={() => moveReminderItem(index, "down")}
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={reminderFlowItems.length === 1}
                                onClick={() => removeReminderItem(item.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>

                          <Textarea
                            className="mt-3 min-h-[120px] resize-y"
                            placeholder="Escreva a mensagem desta bolha..."
                            value={item.text}
                            onChange={(event) => updateReminderItem(item.id, event.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
                    <div className="font-medium">Como este disparo funciona</div>
                    <p>
                      O lembrete só sai quando a IA fechou data e horário claros no módulo Cursos. Se o módulo estiver desligado, nenhum disparo acontece.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => saveReminderMutation.mutate()} disabled={!canSaveReminderConfig}>
                      <Save className="mr-2 h-4 w-4" />
                      {saveReminderMutation.isPending ? "Salvando..." : "Salvar configurações"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PremiumBlocked>
  );
}
