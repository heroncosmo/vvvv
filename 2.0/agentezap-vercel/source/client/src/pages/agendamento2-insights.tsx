import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  BookUser,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Clock3,
  Link2,
  Link2Off,
  Loader2,
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
import { ContextualHelpButton } from "@/components/contextual-help-button";
import { useToast } from "@/hooks/use-toast";
import { openAppRealtimeConnection } from "@/lib/app-realtime";
import { openGoogleCalendarPopup } from "@/lib/google-calendar-popup";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import type { WhatsappConnection } from "@shared/schema";
import {
  DEFAULT_AGENDAMENTO2_REMINDER_HOURS_BEFORE,
  getDefaultAgendamento2ReminderFlowItems,
  normalizeAgendamento2ReminderFlowItems,
  type Agendamento2ReminderFlowItem,
} from "@shared/agendamento2ReminderFlow";

type Agendamento2InsightRecord = {
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

interface Agendamento2Response {
  data: Agendamento2InsightRecord[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

type Agendamento2Config = {
  is_active: boolean;
  send_to_ai: boolean;
  scheduling_tracker_enabled: boolean;
  display_name: string | null;
  reminder_enabled: boolean;
  reminder_hours_before: number;
  reminder_flow: Agendamento2ReminderFlowItem[] | null;
};

type SchedulingConfig = {
  googleCalendarEnabled?: boolean;
  selectedCalendarId?: string;
};

type GoogleCalendarStatus = {
  isConnected: boolean;
  configured: boolean;
  email?: string;
  provider?: string;
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
};

type AgendaScope = "all" | "today" | "tomorrow" | "next7" | "custom" | "undated";
type AgendaSortMode = "latest" | "earliest";
type AgendaDayOption = { key: string; date: string | null; title: string; shortLabel: string; hint: string; count: number };
type AgendaGroup = AgendaDayOption & { items: Agendamento2InsightRecord[] };
type Agendamento2TabValue = "insights" | "settings";

const AGENDA_SCOPE_OPTIONS: Array<{ value: AgendaScope; label: string; description: string }> = [
  { value: "all", label: "Todos", description: "Mostra toda a agenda capturada pela IA." },
  { value: "today", label: "Hoje", description: "Foco total no que precisa acontecer ainda hoje." },
  { value: "tomorrow", label: "Amanhã", description: "Separa rapidamente o que já ficou para o próximo dia." },
  { value: "next7", label: "Próximos 7 dias", description: "Visão curta da semana para agir como uma agenda real." },
  { value: "custom", label: "Personalizado", description: "Use quando precisar focar em um dia específico ou em uma janela de datas." },
  { value: "undated", label: "Sem data", description: "Casos em que a IA fechou o contexto, mas o dia ainda não veio estruturado." },
];

function getAgendamento2TabFromSearch(search: string): Agendamento2TabValue {
  const params = new URLSearchParams(search);
  const tab = String(params.get("tab") || "").trim().toLowerCase();
  if (tab === "operational") return "settings";
  if (tab === "settings") return "settings";
  return "insights";
}

function formatRelativeDate(value: string | null) {
  if (!value) return "Agora mesmo";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sem data";
  }

  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: ptBR,
  });
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

function matchesCustomDateRange(item: Agendamento2InsightRecord, startValue: string, endValue: string) {
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
  if (startLabel && endLabel) return `Mostrando de ${startLabel} ate ${endLabel}.`;
  if (startLabel) return `Mostrando somente ${startLabel}.`;
  return `Mostrando tudo ate ${endLabel}.`;
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
    return { date: null, title: "Sem data valida", shortLabel: "Sem dia", hint: "O registro precisa ser revisado no historico da conversa." };
  }

  const diffDays = getBrazilCalendarDayDifference(date);
  let hint = "Agenda futura";
  if (diffDays === 0) hint = "Hoje";
  else if (diffDays === 1) hint = "Amanhã";
  else if (diffDays > 1) hint = `Em ${diffDays} dias`;
  else if (diffDays === -1) hint = "Ontem";
  else hint = `${Math.abs(diffDays)} dias atras`;

  return {
    date: dateValue,
    title: capitalizeText(date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })),
    shortLabel: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    hint,
  };
}

function matchesAgendaScope(item: Agendamento2InsightRecord, scope: AgendaScope, customStartDate: string, customEndDate: string) {
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

function sortInsightsForAgenda(items: Agendamento2InsightRecord[], sortMode: AgendaSortMode) {
  return [...items].sort((left, right) => {
    const leftDate = parseScheduledDate(left.scheduledDate);
    const rightDate = parseScheduledDate(right.scheduledDate);
    const direction = sortMode === "latest" ? -1 : 1;
    if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) return (leftDate.getTime() - rightDate.getTime()) * direction;
    if (leftDate && !rightDate) return -1;
    if (!leftDate && rightDate) return 1;
    const leftMinutes = parseClockToMinutes(left.scheduledTime);
    const rightMinutes = parseClockToMinutes(right.scheduledTime);
    if (leftMinutes !== rightMinutes) return (leftMinutes - rightMinutes) * direction;
    const leftUpdated = left.lastScheduledAt ? new Date(left.lastScheduledAt).getTime() : 0;
    const rightUpdated = right.lastScheduledAt ? new Date(right.lastScheduledAt).getTime() : 0;
    return sortMode === "latest" ? rightUpdated - leftUpdated : leftUpdated - rightUpdated;
  });
}

function compareAgendaDays(leftDateValue: string | null, rightDateValue: string | null, sortMode: AgendaSortMode) {
  const leftDate = parseScheduledDate(leftDateValue);
  const rightDate = parseScheduledDate(rightDateValue);
  const direction = sortMode === "latest" ? -1 : 1;

  if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) {
    return (leftDate.getTime() - rightDate.getTime()) * direction;
  }
  if (leftDate && !rightDate) return -1;
  if (!leftDate && rightDate) return 1;
  return 0;
}

function formatScheduleHeadline(item: Agendamento2InsightRecord) {
  const parts: string[] = [];
  if (item.scheduledDate) parts.push(buildAgendaDayMeta(item.scheduledDate).shortLabel);
  if (item.scheduledTime) parts.push(item.scheduledTime);
  if (parts.length === 0) return "Sem data definida";
  return parts.join(" · ");
}

function buildEmptyReminderItem(index: number): Agendamento2ReminderFlowItem {
  return {
    id: `agendamento2-reminder-custom-${Date.now()}-${index}`,
    order: index,
    type: "text",
    text: "",
  };
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
}

function isSimulatorValue(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text === "Visitante" || text.startsWith("sim-");
}

function stripSimpleMarkdown(value: string | null | undefined) {
  return String(value || "").split("**").join("").trim();
}

function takeBeforeAny(value: string, markers: string[]) {
  let endIndex = -1;
  for (const marker of markers) {
    const index = value.indexOf(marker);
    if (index > 0 && (endIndex === -1 || index < endIndex)) {
      endIndex = index;
    }
  }
  return endIndex > 0 ? value.slice(0, endIndex) : value;
}

function deriveNameFromSummary(summary: string | null | undefined) {
  const text = stripSimpleMarkdown(summary);
  const starts = ["Cliente ", "cliente "];
  const ends = [
    " confirmou",
    " confirmou agendamento",
    " agendou",
    " fechou",
    " solicitou",
  ];

  for (const start of starts) {
    const startIndex = text.indexOf(start);
    if (startIndex < 0) continue;

    const candidate = takeBeforeAny(text.slice(startIndex + start.length), ends).trim();
    if (candidate.length >= 3 && candidate.length <= 80) {
      return candidate;
    }
  }

  return null;
}

function resolveDisplayName(item: Agendamento2InsightRecord) {
  const contactName = String(item.contactName || "").trim();
  if (contactName && !isSimulatorValue(contactName)) {
    return contactName;
  }

  const nameFromSummary = deriveNameFromSummary(item.summary);
  if (nameFromSummary) {
    return nameFromSummary;
  }

  const contactNumber = String(item.contactNumber || "").trim();
  if (contactNumber && !isSimulatorValue(contactNumber)) {
    return contactNumber;
  }

  return "Visitante";
}

function resolveDisplayPhone(item: Agendamento2InsightRecord) {
  const contactNumber = String(item.contactNumber || "").trim();
  return contactNumber && !isSimulatorValue(contactNumber) ? contactNumber : null;
}

function renderSimpleBoldText(value: string) {
  const parts: Array<{ text: string; strong: boolean }> = [];
  let buffer = "";
  let strong = false;
  let index = 0;

  const pushBuffer = () => {
    if (!buffer) return;
    parts.push({ text: buffer, strong });
    buffer = "";
  };

  while (index < value.length) {
    const marker = value.slice(index, index + 2) === "**" ? "**" : value[index] === "*" ? "*" : "";
    if (marker && value.indexOf(marker, index + marker.length) > index) {
      pushBuffer();
      strong = !strong;
      index += marker.length;
      continue;
    }

    buffer += value[index];
    index += 1;
  }

  pushBuffer();

  return parts.map((part, partIndex) =>
    part.strong
      ? <strong key={partIndex}>{part.text}</strong>
      : <Fragment key={partIndex}>{part.text}</Fragment>,
  );
}

export default function Agendamento2InsightsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Agendamento2TabValue>(() => getAgendamento2TabFromSearch(window.location.search));
  const [connectionId, setConnectionId] = useState("all");
  const [agendaScope, setAgendaScope] = useState<AgendaScope>("all");
  const [agendaSortMode, setAgendaSortMode] = useState<AgendaSortMode>("latest");
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderFlowItems, setReminderFlowItems] = useState<Agendamento2ReminderFlowItem[]>(
    getDefaultAgendamento2ReminderFlowItems(),
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const syncTabFromUrl = () => {
      const nextTab = getAgendamento2TabFromSearch(window.location.search);
      setActiveTab((currentTab) => (currentTab === nextTab ? currentTab : nextTab));
    };

    window.addEventListener("popstate", syncTabFromUrl);
    syncTabFromUrl();

    return () => window.removeEventListener("popstate", syncTabFromUrl);
  }, []);

  const { data: connections = [] } = useQuery<WhatsappConnection[]>({
    queryKey: ["/api/whatsapp/connections"],
  });

  const { data: config } = useQuery<Agendamento2Config>({
    queryKey: ["/api/agendamento-2-config"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/agendamento-2-config");
      return response.json();
    },
  });

  useEffect(() => {
    if (!config) return;
    setReminderEnabled(config.reminder_enabled === true);
    setReminderFlowItems(normalizeAgendamento2ReminderFlowItems(config.reminder_flow));
  }, [config]);

  const { data: schedulingConfig } = useQuery<SchedulingConfig>({
    queryKey: ["scheduling-config", "agendamento-2"],
    queryFn: async () => {
      const response = await authFetch("/api/scheduling/config");
      if (!response.ok) {
        throw new Error("Não foi possível carregar a configuração da agenda integrada.");
      }

      const data = await response.json();
      return {
        googleCalendarEnabled: data.google_calendar_enabled ?? false,
        selectedCalendarId: data.google_calendar_id ?? undefined,
      };
    },
  });

  const { data: googleCalendarStatus } = useQuery<GoogleCalendarStatus>({
    queryKey: ["google-calendar-status", "agendamento-2"],
    queryFn: async () => {
      const response = await authFetch("/api/scheduling/google-calendar/status");
      if (!response.ok) {
        return {
          isConnected: false,
          configured: true,
          provider: "google",
          providerLabel: "Google",
        };
      }

      const data = await response.json();
      return {
        isConnected: data.isConnected || data.connected || false,
        configured: data.configured ?? true,
        email: data.email || data.userEmail,
        provider: data.provider,
        providerLabel: data.providerLabel,
        checked: data.checked ?? true,
        error: data.error,
        selectedCalendarId: data.selectedCalendarId ?? data.selected_calendar_id,
        calendars: Array.isArray(data.calendars) ? data.calendars : [],
      };
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest("PUT", "/api/agendamento-2-config", {
        scheduling_tracker_enabled: enabled,
      });
      return response.json();
    },
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agendamento-2-config"] });
      toast({
        title: enabled ? "Agendamento 2.0 ativado" : "Agendamento 2.0 desativado",
        description: enabled
          ? "O módulo voltou a registrar novos agendamentos em paralelo."
          : "O módulo deixou de registrar novos agendamentos em paralelo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Não foi possível atualizar o Agendamento 2.0",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveReminderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/agendamento-2-config", {
        reminder_enabled: reminderEnabled,
        reminder_hours_before: DEFAULT_AGENDAMENTO2_REMINDER_HOURS_BEFORE,
        reminder_flow: reminderFlowItems
          .map((item, index) => ({
            id: item.id || `agendamento2-reminder-step-${index + 1}`,
            order: index,
            type: "text",
            text: item.text.trim(),
          }))
          .filter((item) => item.text.length > 0),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agendamento-2-config"] });
      toast({
        title: "Lembretes do Agendamento 2.0 salvos",
        description: "O fluxo de mensagens foi atualizado.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Nao foi possivel salvar os lembretes",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const connectGoogleCalendarMutation = useMutation({
    mutationFn: async () => {
      const response = await authFetch("/api/scheduling/google-calendar/connect");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.message || "Nao foi possivel iniciar a conexao com Google Calendar.");
      }
      if (!body?.authUrl) {
        throw new Error("A resposta da conexao Google nao trouxe a URL de autorizacao.");
      }
      const popupResult = await openGoogleCalendarPopup(body.authUrl, "agendamento2-google-calendar-connect");
      if (!popupResult.success) {
        throw new Error(popupResult.message || "Nao foi possivel concluir a conexao com Google Calendar.");
      }
      return popupResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-status", "agendamento-2"] });
      queryClient.invalidateQueries({ queryKey: ["scheduling-config", "agendamento-2"] });
      toast({
        title: "Google conectado",
        description: "A agenda Google foi integrada ao Agendamento 2.0.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Nao foi possivel conectar o Google",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectGoogleCalendarMutation = useMutation({
    mutationFn: async () => {
      const response = await authFetch("/api/scheduling/google-calendar/disconnect", {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.message || "Nao foi possivel desconectar o Google Calendar.");
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-status", "agendamento-2"] });
      queryClient.invalidateQueries({ queryKey: ["scheduling-config", "agendamento-2"] });
      toast({
        title: "Google desconectado",
        description: "A integracao Google foi removida do Agendamento 2.0.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Nao foi possivel desconectar o Google",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const selectGoogleCalendarMutation = useMutation({
    mutationFn: async (calendarId: string) => {
      const response = await authFetch("/api/scheduling/google-calendar/calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.message || "Não foi possível selecionar a agenda Google.");
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-status", "agendamento-2"] });
      queryClient.invalidateQueries({ queryKey: ["scheduling-config", "agendamento-2"] });
      toast({
        title: "Agenda selecionada",
        description: "O Agendamento 2.0 vai usar esta agenda integrada nas sincronizacoes.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Não foi possível trocar a agenda",
        description: error.message,
        variant: "destructive",
      });
    },
  });


  const queryKey = ["/api/agendamento-2-insights", "scheduled", connectionId, query];

  const { data, isLoading } = useQuery<Agendamento2Response>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        status: "scheduled",
        limit: "100",
        offset: "0",
      });

      if (connectionId !== "all") params.set("connectionId", connectionId);
      if (query) params.set("q", query);

      const token = await getAuthToken();
      const response = await fetch(`/api/agendamento-2-insights?${params.toString()}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Falha ao carregar o painel do Agendamento 2.0");
      }

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
            if (
              payload.type === "agendamento2_updated" ||
              payload.type === "new_message" ||
              payload.type === "agent_response" ||
              payload.type === "message_sent"
            ) {
              queryClient.invalidateQueries({ queryKey: ["/api/agendamento-2-insights"] });
            }
          },
          onClose: () => {
            if (!cancelled) {
              reconnectTimeout = window.setTimeout(connectRealtime, 3000);
            }
          },
        });

        if (!realtimeConnection && !cancelled) {
          reconnectTimeout = window.setTimeout(connectRealtime, 3000);
        }
      } catch {
        if (!cancelled) {
          reconnectTimeout = window.setTimeout(connectRealtime, 3000);
        }
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
  const sortedInsights = useMemo(() => sortInsightsForAgenda(insights, agendaSortMode), [agendaSortMode, insights]);
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
      const dateComparison = compareAgendaDays(left.date, right.date, agendaSortMode);
      if (dateComparison !== 0) return dateComparison;
      return left.title.localeCompare(right.title, "pt-BR");
    });
  }, [agendaSortMode, scopeFilteredInsights]);

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
      const dateComparison = compareAgendaDays(left.date, right.date, agendaSortMode);
      if (dateComparison !== 0) return dateComparison;
      return left.title.localeCompare(right.title, "pt-BR");
    });
  }, [agendaSortMode, filteredInsights]);

  const summary = useMemo(() => {
    const connectionCount = new Set(filteredInsights.map((item) => item.connectionId)).size;
    const visibleDays = agendaGroups.filter((group) => group.date).length;
    const undatedCount = filteredInsights.filter((item) => !item.scheduledDate).length;
    const nextScheduled = filteredInsights.find((item) => item.scheduledDate || item.scheduledTime) || null;
    return {
      totalFetched: data?.total || 0,
      totalVisible: filteredInsights.length,
      connectionCount,
      visibleDays,
      undatedCount,
      nextScheduled,
    };
  }, [agendaGroups, data?.total, filteredInsights]);

  const activeScopeMeta = AGENDA_SCOPE_OPTIONS.find((option) => option.value === agendaScope) || AGENDA_SCOPE_OPTIONS[0];
  const activeScopeDescription = agendaScope === "custom" ? describeCustomDateRange(customStartDate, customEndDate) : activeScopeMeta.description;
  const selectedDayMeta = agendaDayOptions.find((option) => option.key === selectedDayKey) || null;

  const updateReminderItem = (id: string, text: string) => {
    setReminderFlowItems((currentItems) =>
      currentItems.map((item) => (item.id === id ? { ...item, text } : item)),
    );
  };

  const addReminderItem = () => {
    setReminderFlowItems((currentItems) => [...currentItems, buildEmptyReminderItem(currentItems.length)]);
  };

  const removeReminderItem = (id: string) => {
    setReminderFlowItems((currentItems) => {
      if (currentItems.length === 1) return currentItems;
      return currentItems
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, order: index }));
    });
  };

  const moveReminderItem = (index: number, direction: "up" | "down") => {
    setReminderFlowItems((currentItems) => {
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= currentItems.length) return currentItems;
      const nextItems = [...currentItems];
      const [removed] = nextItems.splice(index, 1);
      nextItems.splice(nextIndex, 0, removed);
      return nextItems.map((item, itemIndex) => ({ ...item, order: itemIndex }));
    });
  };

  const reminderFlowIsValid = reminderFlowItems.some((item) => item.text.trim().length > 0);
  const canSaveReminderConfig = (!reminderEnabled || reminderFlowIsValid) && !saveReminderMutation.isPending;
  const customStartLabel = formatDateInputForDisplay(customStartDate);
  const customEndLabel = formatDateInputForDisplay(customEndDate);

  return (
    <PremiumBlocked
      title="Agendamento 2.0"
      subtitle="Seu período de teste acabou"
      description="Assine um plano para usar o módulo Agendamento 2.0 com o Meu Agente IA."
      ctaLabel="Ativar Plano Ilimitado"
    >
      <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.02),_rgba(15,23,42,0))] p-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <div className="space-y-2">
            <Badge variant="outline" className="rounded-full border-sky-200 bg-sky-50 text-sky-700">
              Agendamento 2.0
            </Badge>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Agendamento 2.0</h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  A IA continua conduzindo a conversa normalmente e este módulo mostra quem realmente fechou um
                  agendamento.
                </p>
              </div>

              <Card className="w-full max-w-xl border-border/70 bg-background/90 shadow-sm">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-sky-700" />
                      <span className="font-medium">Agendamento 2.0</span>
                      <Badge
                        variant="outline"
                        className={
                          config?.scheduling_tracker_enabled
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }
                      >
                        {config?.scheduling_tracker_enabled ? "Ligado" : "Desligado"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Quando estiver ligado, o módulo acompanha novos agendamentos fechados com a IA.
                    </p>
                  </div>

                  <Switch
                    checked={config?.scheduling_tracker_enabled === true}
                    disabled={toggleMutation.isPending}
                    onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                    aria-label="Ativar Agendamento 2.0"
                  />
                </CardContent>
              </Card>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(nextValue) => {
              const nextTab = nextValue as Agendamento2TabValue;
              setActiveTab(nextTab);
              const params = new URLSearchParams(window.location.search);
              if (nextTab === "insights") {
                params.delete("tab");
              } else {
                params.set("tab", nextTab);
              }
              const search = params.toString();
              window.history.replaceState({}, "", search ? `/agendamento-2?${search}` : "/agendamento-2");
            }}
            className="space-y-6"
          >
            <TabsList className="grid w-full max-w-xl grid-cols-2">
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
                    <CardDescription>Dias visiveis na agenda</CardDescription>
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
                    <CardDescription>{agendaSortMode === "latest" ? "Última referência" : "Primeira referência"}</CardDescription>
                    <CardTitle className="flex items-center gap-2 text-base font-medium text-violet-700">
                      <Clock3 className="h-5 w-5 text-violet-700" />
                      {summary.nextScheduled ? formatScheduleHeadline(summary.nextScheduled) : "Sem agenda"}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <Card className="border-border/70 bg-background/85 backdrop-blur">
                <CardHeader className="gap-5">
                  <div>
                    <CardTitle>Agenda viva dos fechamentos</CardTitle>
                    <CardDescription>
                      Combine busca, conexão, período e dia específico para navegar como uma agenda real, no mesmo estilo do módulo de Cursos.
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
                            Escolha um dia unico ou combine inicio e fim para ver uma janela exata da agenda.
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
                          <Label htmlFor="agendamento2-start-date">De</Label>
                          <Input
                            id="agendamento2-start-date"
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
                          <Label htmlFor="agendamento2-end-date">Ate</Label>
                          <Input
                            id="agendamento2-end-date"
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
                            Filtro manual: {customStartLabel || "inicio livre"} ate {customEndLabel || customStartLabel}
                          </span>
                        ) : (
                          <span>Sem data manual aplicada. Os atalhos rapidos continuam controlando a agenda.</span>
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

                <CardContent className="space-y-6 px-3 pb-4 pt-0 sm:px-6 sm:pb-6">
                  <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/95 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-muted-foreground">
                      {selectedDayMeta
                        ? `${selectedDayMeta.count} registro(s) visiveis para ${selectedDayMeta.title}.`
                        : `${summary.totalFetched} fechamento(s) encontrados com busca e conexão atuais. ${summary.connectionCount} conexões aparecem na visão filtrada.`}
                    </div>

                    <div className="flex items-center gap-2 sm:justify-end">
                      <Label htmlFor="agendamento2-sort-mode" className="shrink-0 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Ordenar
                      </Label>
                      <select
                        id="agendamento2-sort-mode"
                        value={agendaSortMode}
                        onChange={(event) => setAgendaSortMode(event.target.value as AgendaSortMode)}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="latest">Últimos agendados</option>
                        <option value="earliest">Primeiros agendados</option>
                      </select>
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                      Carregando fechamentos...
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
                          {group.items.map((item) => {
                            const displayName = resolveDisplayName(item);
                            const displayPhone = resolveDisplayPhone(item);

                            return (
                              <div
                                key={item.id}
                                className="overflow-hidden rounded-2xl border border-border/70 bg-background/95 p-4 shadow-sm transition hover:border-sky-200 hover:shadow-md sm:p-5"
                              >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0 flex-1 space-y-3">
                                    <div className="space-y-2">
                                      <h2 className="break-words text-lg font-semibold leading-tight text-foreground">
                                        {displayName}
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
                                            {renderSimpleBoldText(item.agreedSchedule)}
                                          </Badge>
                                        ) : null}
                                      </div>
                                    </div>

                                    <div className="grid gap-2 text-sm text-muted-foreground sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                                      {displayPhone ? (
                                        <span className="inline-flex min-w-0 items-center gap-1.5">
                                          <Phone className="h-4 w-4 shrink-0" />
                                          <span className="min-w-0 break-words">{displayPhone}</span>
                                        </span>
                                      ) : null}
                                      {item.sourceConnectionName ? <span className="break-words">{item.sourceConnectionName}</span> : null}
                                      <span>Atualizado {formatRelativeDate(item.lastAnalyzedAt)}</span>
                                    </div>

                                    <p className="max-w-3xl break-words text-sm leading-6 text-foreground/90">
                                      {renderSimpleBoldText(item.summary || "Sem resumo disponivel.")}
                                    </p>

                                    {item.evidence.length > 0 ? (
                                      <div className="flex max-w-full flex-wrap gap-2">
                                        {item.evidence.map((evidence, evidenceIndex) => (
                                          <Badge
                                            key={`${item.id}-${evidenceIndex}`}
                                            variant="secondary"
                                            className="max-w-full whitespace-normal rounded-full bg-slate-100 text-left leading-5 text-slate-700 hover:bg-slate-100"
                                          >
                                            {renderSimpleBoldText(evidence)}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="grid w-full gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3 sm:grid-cols-[1fr_auto] sm:items-center lg:w-auto lg:min-w-[220px] lg:grid-cols-1 lg:items-stretch">
                                    <div className="text-sm text-muted-foreground sm:min-w-[120px] lg:text-right">
                                      <div>Referencia</div>
                                      <div className="text-base font-semibold text-foreground">
                                        {item.scheduledTime || item.scheduledDate ? formatScheduleHeadline(item) : "Sem data"}
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
                            );
                          })}
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
                    <CardTitle>Configurações do módulo</CardTitle>
                  </div>
                  <CardDescription>
                    O Agendamento 2.0 usa a configuração padrão interna do sistema e não expõe esse conteúdo para edição.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5">
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <ShieldCheck className="h-4 w-4 text-sky-700" />
                          Status do módulo
                          <Badge
                            variant="outline"
                            className={
                              config?.scheduling_tracker_enabled
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            }
                          >
                            {config?.scheduling_tracker_enabled ? "Ligado" : "Desligado"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Quando ligado, o módulo acompanha os novos agendamentos fechados com a IA.
                        </p>
                      </div>

                      <Switch
                        checked={config?.scheduling_tracker_enabled === true}
                        disabled={toggleMutation.isPending}
                        onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                        aria-label="Ativar Agendamento 2.0 nas configurações"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-sm text-sky-900">
                    As instruções internas deste módulo permanecem protegidas pelo sistema. Nesta área não existe prompt
                    editável.
                  </div>

                  <Card className="border-border/70 bg-background/95 shadow-sm">
                    <CardHeader className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-5 w-5 text-sky-700" />
                          <CardTitle>Google Calendar direto</CardTitle>
                        </div>
                        <ContextualHelpButton
                          articleId="scheduling-maton-google-calendar"
                          label="Ajuda"
                        />
                      </div>
                      <CardDescription>
                        Esta area conecta o Google Calendar direto no AgenteZap para manter o
                        Agendamento 2.0 sincronizado, sem alterar a lógica atual do módulo.
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-5">
                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">Status da integracao</span>
                              <Badge
                                variant="outline"
                                className={
                                  googleCalendarStatus?.isConnected
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                                }
                              >
                                {googleCalendarStatus?.isConnected ? "Conectado" : "Desconectado"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {googleCalendarStatus?.isConnected
                                ? `Conectado via ${googleCalendarStatus.providerLabel || "Google"}${googleCalendarStatus.email ? ` em ${googleCalendarStatus.email}` : ""}.`
                                : "Conecte sua conta Google para manter os agendamentos sincronizados."}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Use o popup seguro do Google para autorizar a agenda.
                            </p>
                            {googleCalendarStatus?.checked === false && googleCalendarStatus?.error ? (
                              <p className="text-sm text-amber-700">{googleCalendarStatus.error}</p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <Button
                              onClick={() => connectGoogleCalendarMutation.mutate()}
                              disabled={connectGoogleCalendarMutation.isPending}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              {connectGoogleCalendarMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Link2 className="mr-2 h-4 w-4" />
                              )}
                              {googleCalendarStatus?.isConnected ? "Reconectar Google" : "Conectar Google"}
                            </Button>

                            {googleCalendarStatus?.isConnected ? (
                              <Button
                                variant="outline"
                                className="border-red-200 text-red-600 hover:bg-red-50"
                                onClick={() => disconnectGoogleCalendarMutation.mutate()}
                                disabled={disconnectGoogleCalendarMutation.isPending}
                              >
                                {disconnectGoogleCalendarMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Link2Off className="mr-2 h-4 w-4" />
                                )}
                                Desconectar
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {googleCalendarStatus?.isConnected ? (
                        <div className="grid gap-5 lg:grid-cols-[1.3fr_0.9fr]">
                          <div className="space-y-3 rounded-2xl border border-border/70 bg-background p-4">
                            <div className="space-y-1">
                              <div className="text-sm font-medium">Agenda usada na sincronizacao</div>
                              <p className="text-sm text-muted-foreground">
                                Escolha a agenda Google que deve permanecer sincronizada com os novos agendamentos.
                              </p>
                            </div>

                            <select
                              value={googleCalendarStatus.selectedCalendarId || schedulingConfig?.selectedCalendarId || ""}
                              onChange={(event) => selectGoogleCalendarMutation.mutate(event.target.value)}
                              disabled={selectGoogleCalendarMutation.isPending}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value="" disabled>
                                Selecione uma agenda
                              </option>
                              {(googleCalendarStatus.calendars || [])
                                .filter((calendar) => calendar.accessRole === "owner" || calendar.accessRole === "writer")
                                .map((calendar) => (
                                  <option key={calendar.id} value={calendar.id}>
                                    {calendar.summary}
                                    {calendar.primary ? " (principal)" : ""}
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div className="rounded-2xl border border-border/70 bg-background p-4">
                            <div className="space-y-1">
                              <div className="text-sm font-medium">Sincronização no prompt</div>
                              <p className="text-sm text-muted-foreground">
                                Quando o Google estiver conectado, a agenda sincronizada segue junto no contexto do prompt automaticamente.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-border/70 bg-background p-4">
                          <div className="text-sm font-medium">Agendamento 2.0 preservado</div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            O módulo continua funcionando baseado no prompt e na extração da conversa, sem criar regra nova aqui.
                          </p>
                        </div>

                        <div className="rounded-2xl border border-border/70 bg-background p-4">
                          <div className="text-sm font-medium">Agenda viva atualizada</div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            A conexão Google só mantém a agenda sincronizada para o contexto enviado ao prompt.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border/70 bg-background/95 shadow-sm">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-5 w-5 text-sky-700" />
                        <CardTitle>Lembrete 1 hora antes</CardTitle>
                      </div>
                      <CardDescription>
                        Mesmo padrao do modulo Cursos: o disparo sai 1 hora antes do horario fechado neste modulo.
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-6">
                      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <Clock3 className="h-4 w-4 text-sky-700" />
                                Lembrete automatico
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
                                Quando ligado, o sistema envia o fluxo abaixo exatamente 1 hora antes do horario agendado.
                              </p>
                            </div>

                            <Switch
                              checked={reminderEnabled}
                              onCheckedChange={setReminderEnabled}
                              aria-label="Ativar lembrete 1 hora antes no Agendamento 2.0"
                            />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-border/70 bg-sky-50/80 p-4 text-sm text-sky-900">
                          <div className="font-medium">Placeholders disponiveis</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {["{nome}", "{referencia_agendamento}", "{hora_agendamento}", "{data_agendamento}", "{data_agendamento_extenso}"].map((placeholder) => (
                              <Badge key={placeholder} variant="outline" className="border-sky-200 bg-white text-sky-700">
                                {placeholder}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/70 bg-background/95 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <Label className="text-sm font-semibold">Fluxo de mensagens do lembrete</Label>
                            <p className="text-sm text-muted-foreground">
                              Monte as bolhas na ordem em que devem sair. Voce pode deixar uma mensagem por etapa.
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
                          O lembrete so sai quando a IA fechou data e horario claros no Agendamento 2.0. Se o modulo estiver desligado, nenhum disparo acontece.
                        </p>
                      </div>

                      <div className="flex justify-end">
                        <Button onClick={() => saveReminderMutation.mutate()} disabled={!canSaveReminderConfig}>
                          <Save className="mr-2 h-4 w-4" />
                          {saveReminderMutation.isPending ? "Salvando..." : "Salvar configuracoes"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PremiumBlocked>
  );
}
