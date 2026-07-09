import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ContextualHelpButton } from "@/components/contextual-help-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBrazilDate, formatBrazilDateTime, formatBrazilTime, parseBrazilDateTime } from "@/lib/brazil-time";
import { 
  Bell, 
  Clock, 
  MessageCircle, 
  Settings, 
  Sparkles, 
  Plus, 
  Trash2, 
  Save,
  BarChart3,
  Calendar,
  CalendarDays,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  User,
  Timer,
  Send,
  Grid3X3,
  List,
  SkipForward,
  Zap,
  ZapOff
} from "lucide-react";

interface ImportantInfo {
  titulo: string;
  conteudo: string;
  usado?: boolean;
}

interface FollowupConfig {
  id: string;
  userId: string;
  isEnabled: boolean;
  maxAttempts: number;
  intervalsMinutes: number[];
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  respectBusinessHours: boolean;
  tone: string;
  formalityLevel: number;
  useEmojis: boolean;
  importantInfo: ImportantInfo[];
  infiniteLoop: boolean;
  infiniteLoopMinDays: number;
  infiniteLoopMaxDays: number;
}

interface FollowupStats {
  totalSent: number;
  totalFailed: number;
  totalCancelled: number;
  totalSkipped: number;
  pending: number;
  scheduledToday: number;
  scheduledThisWeek?: number;
  scheduledThisMonth?: number;
}

interface FollowupEvent {
  id: string;
  conversationId?: string;
  contactNumber: string;
  contactName: string | null;
  stage: number;
  nextFollowupAt: string;
  status?: 'pending' | 'sent' | 'cancelled' | 'failed' | 'skipped';
  type?: 'auto' | 'manual';
  note?: string;
}

type OutboundStatus =
  | "canal_livre"
  | "processando_fila"
  | "pausado_antiban"
  | "priorizando_clientes";

interface FollowupAnalytics {
  status: OutboundStatus;
  live: {
    antiBan: {
      consecutiveMessages: number;
      isPaused: boolean;
      pauseRemainingMs: number;
      minuteCount: number;
      hourCount: number;
      dayCount: number;
      batchPauseLevel: number;
      currentPauseDurationMs: number;
    };
    dispatch: {
      isActive: boolean;
      activeReason: string | null;
      activeForMs: number;
      waitingCount: number;
      lastCompletedAt: number | null;
      totalRuns: number;
    };
    centralized: {
      queueSize: number;
      byOrigin: Record<string, number>;
    };
    legacy: {
      queueLength: number;
      isProcessing: boolean;
      totalSent: number;
      totalErrors: number;
      lastSentAt: string | null;
      batchCount: number;
      isPaused: boolean;
      pauseRemainingMs: number;
      minuteCount: number;
      hourCount: number;
      dayCount: number;
      batchPauseLevel: number;
      currentPauseDurationMs: number;
    };
    pendingPriorityConversations: number;
  };
  daily: {
    totalOutbound: number;
    automatedOutbound: number;
    manualOutbound: number;
    outboundConversations: number;
    followupsProcessed: number;
    followupsSent: number;
    followupsSkipped: number;
    followupsFailed: number;
  };
  config: {
    minDelayMs: number;
    maxDelayMs: number;
    ownerMessageDelayMs: number;
    batchSize: number;
    batchPauseSequenceMs: number[];
    maxMessagesPerMinute: number;
    maxMessagesPerHour: number;
    typingEnabled: boolean;
    typingMinMs: number;
    typingMaxMs: number;
  };
  senderStats?: {
    totalSent: number;
    totalFailed: number;
    byOrigin: Record<string, number>;
    lastSentAt: number;
  } | null;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Timer }> = {
  pending: { label: "Pendente", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: Timer },
  sent: { label: "Enviado", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle },
  cancelled: { label: "Cancelado", color: "bg-gray-500/10 text-gray-600 border-gray-500/20", icon: XCircle },
  failed: { label: "Falhou", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: AlertCircle },
  skipped: { label: "Pulado", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: SkipForward },
};

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const TONE_OPTIONS = [
  { value: "consultivo", label: "Consultivo", description: "Ajuda o cliente a tomar decisões" },
  { value: "vendedor", label: "Vendedor", description: "Persuasivo mas não agressivo" },
  { value: "humano", label: "Humanizado", description: "Casual, como um amigo" },
  { value: "técnico", label: "Técnico", description: "Profissional e detalhado" },
];

const ANALYTICS_STATUS_META: Record<OutboundStatus, { label: string; description: string; badge: string }> = {
  canal_livre: {
    label: "Canal livre",
    description: "Sem fila e sem pausa anti-ban neste momento.",
    badge: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  },
  processando_fila: {
    label: "Processando fila",
    description: "O canal está enviando com espaçamento e controle de vazão.",
    badge: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  },
  pausado_antiban: {
    label: "Em pausa anti-ban",
    description: "O lote atual entrou em respiro automático antes de continuar.",
    badge: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  },
  priorizando_clientes: {
    label: "Priorizando respostas",
    description: "Clientes aguardando retorno têm prioridade antes dos follow-ups.",
    badge: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  },
};

function extractApiErrorMessage(error: unknown, fallback: string) {
  const raw = String((error as any)?.message || error || "").trim();
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      if (parsed?.message) return String(parsed.message);
      if (parsed?.reason) return String(parsed.reason);
    } catch {
      // Keep the plain fallback below.
    }
  }
  return raw.replace(/^\d+:\s*/, "") || fallback;
}

export default function FollowupConfigPage() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [newInfo, setNewInfo] = useState({ titulo: "", conteudo: "" });
  
  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedEvent, setSelectedEvent] = useState<FollowupEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tab sincronizada com URL query param
  const getTabFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('tab') || 'agenda';
  };
  
  const [mainTab, setMainTabState] = useState(getTabFromUrl);
  
  const setMainTab = (tab: string) => {
    setMainTabState(tab);
    // Atualizar URL sem recarregar
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
  };
  
  // Sincronizar com back/forward do browser
  useEffect(() => {
    const handlePopState = () => setMainTabState(getTabFromUrl());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Buscar configuração
  const { data: config, isLoading: configLoading } = useQuery<FollowupConfig>({
    queryKey: ["/api/followup/config"],
  });

  // Buscar estatísticas
  const { data: stats, refetch: refetchStats } = useQuery<FollowupStats>({
    queryKey: ["/api/followup/stats"],
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: analytics, refetch: refetchAnalytics } = useQuery<FollowupAnalytics>({
    queryKey: ["/api/followup/analytics"],
    enabled: mainTab === "analytics",
    staleTime: 30000,
    refetchInterval: 45000,
  });

  // Buscar pendentes
  const { data: pending, refetch: refetchPending } = useQuery<FollowupEvent[]>({
    queryKey: ["/api/followup/pending"],
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Buscar histórico de logs
  interface FollowupLog {
    id: number;
    conversationId: string;
    contactNumber: string;
    status: 'sent' | 'failed' | 'cancelled' | 'skipped';
    messageContent: string | null;
    aiDecision: { action: string; reason: string; context?: string } | null;
    stage: number;
    executedAt: string;
    errorReason: string | null;
  }
  
  const { data: logs, refetch: refetchLogs } = useQuery<FollowupLog[]>({
    queryKey: ["/api/followup/logs"],
    enabled: mainTab === "history",
    staleTime: 30000,
    refetchInterval: 120000,
  });

  // Estado local para edição
  const [formData, setFormData] = useState<Partial<FollowupConfig>>({});

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      return await apiRequest("POST", `/api/followup/conversation/${conversationId}/toggle`, { active: false });
    },
    onSuccess: () => {
      toast({ title: "Follow-up cancelado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/analytics"] });
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Erro ao cancelar follow-up", variant: "destructive" });
    },
  });

  // Reorganize all follow-ups
  const reorganizeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/followup/reorganize");
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Follow-ups reorganizados!", 
        description: `${data.reorganized} reagendados, ${data.skipped} ignorados`
      });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/analytics"] });
    },
    onError: () => {
      toast({ title: "Erro ao reorganizar follow-ups", variant: "destructive" });
    },
  });

  // Trigger follow-up now
  const triggerMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const response = await apiRequest("POST", `/api/followup/conversation/${conversationId}/trigger`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Follow-up enviado",
        description: data?.message || "A mensagem foi enviada para esta conversa.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/analytics"] });
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Follow-up não enviado",
        description: extractApiErrorMessage(error, "Não foi possível enviar o follow-up agora."),
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/analytics"] });
    },
  });

  // Mutation para salvar
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<FollowupConfig>) => {
      return await apiRequest("PUT", "/api/followup/config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/followup/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/analytics"] });
      toast({
        title: "Configuração salva!",
        description: "As alterações foram aplicadas com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const toggleDay = (day: number) => {
    const currentDays = formData.businessDays || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort();
    setFormData({ ...formData, businessDays: newDays });
  };

  const addImportantInfo = () => {
    if (!newInfo.titulo || !newInfo.conteudo) {
      toast({
        title: "Preencha todos os campos",
        description: "Título e conteúdo são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    const currentInfo = formData.importantInfo || [];
    if (currentInfo.length >= 10) {
      toast({
        title: "Limite atingido",
        description: "Máximo de 10 informações importantes.",
        variant: "destructive",
      });
      return;
    }

    setFormData({
      ...formData,
      importantInfo: [...currentInfo, { ...newInfo, usado: false }],
    });
    setNewInfo({ titulo: "", conteudo: "" });
  };

  const removeImportantInfo = (index: number) => {
    const currentInfo = formData.importantInfo || [];
    setFormData({
      ...formData,
      importantInfo: currentInfo.filter((_, i) => i !== index),
    });
  };

  const formatInterval = (minutes: number): string => {
    if (minutes < 60) return `${minutes}min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
    return `${Math.floor(minutes / 1440)}d`;
  };

  // Calendar helpers
  const events: FollowupEvent[] = pending || [];
  
  const filteredEvents = useMemo(() => {
    if (!searchQuery) return events;
    const query = searchQuery.toLowerCase();
    return events.filter(event => 
      event.contactNumber?.toLowerCase().includes(query) ||
      event.contactName?.toLowerCase().includes(query)
    );
  }, [events, searchQuery]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const getEventsForDate = (date: Date) => {
    return filteredEvents.filter(event => {
      const eventDate = parseBrazilDateTime(event.nextFollowupAt);
      if (!eventDate) return false;
      return (
        eventDate.getDate() === date.getDate() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getFullYear() === date.getFullYear()
      );
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const goToToday = () => setCurrentDate(new Date());

  const formatPhone = (phone: string) => {
    if (!phone) return "Sem número";
    if (phone.length >= 12) {
      return `(${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
    }
    return phone;
  };

  const formatDateTime = (dateStr: string) => {
    return formatBrazilDateTime(dateStr);
  };

  const formatDuration = (ms: number | null | undefined) => {
    if (!ms || ms <= 0) return "0s";
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) return `${seconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours <= 0) return `${minutes}min ${seconds}s`;
    return `${hours}h ${remainingMinutes}min`;
  };

  const formatOriginLabel = (origin: string) => {
    const labels: Record<string, string> = {
      user_follow_up: "Follow-up usuário",
      follow_up: "Follow-up",
      ai_agent: "IA ao vivo",
      conversation: "Conversa",
      manual_admin: "Manual",
      media: "Mídia",
      notification: "Notificação",
      broadcast: "Broadcast",
      whatsapp_sender: "WhatsApp sender",
      chatbot_flow: "Fluxo",
    };
    return labels[origin] || origin;
  };

  const analyticsMeta = analytics ? ANALYTICS_STATUS_META[analytics.status] : null;
  const centralizedOrigins = analytics
    ? Object.entries(analytics.live.centralized.byOrigin).sort((a, b) => b[1] - a[1])
    : [];

  const formatRelativeTime = (dateStr: string) => {
    const date = parseBrazilDateTime(dateStr);
    if (!date) return "—";
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMs < 0) {
      if (diffMins > -60) return `${Math.abs(diffMins)}min atrás`;
      if (diffHours > -24) return `${Math.abs(diffHours)}h atrás`;
      return `${Math.abs(diffDays)}d atrás`;
    } else {
      if (diffMins < 60) return `em ${diffMins}min`;
      if (diffHours < 24) return `em ${diffHours}h`;
      return `em ${diffDays}d`;
    }
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);
  const today = new Date();

  // Render Calendar Grid
  const renderCalendarGrid = () => {
    const days = [];
    const totalCells = Math.ceil((startingDayOfWeek + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      const dayNumber = i - startingDayOfWeek + 1;
      const isCurrentMonth = dayNumber > 0 && dayNumber <= daysInMonth;
      const currentCellDate = isCurrentMonth ? new Date(year, month, dayNumber) : null;
      const isToday = currentCellDate && 
        currentCellDate.getDate() === today.getDate() &&
        currentCellDate.getMonth() === today.getMonth() &&
        currentCellDate.getFullYear() === today.getFullYear();
      
      const dayEvents = currentCellDate ? getEventsForDate(currentCellDate) : [];

      days.push(
        <div
          key={i}
          className={cn(
            "min-h-[90px] border border-border/50 p-1 transition-colors",
            isCurrentMonth ? "bg-background" : "bg-muted/30",
            isToday && "bg-primary/5 border-primary"
          )}
        >
          {isCurrentMonth && (
            <>
              <div className={cn(
                "text-sm font-medium mb-1",
                isToday && "text-primary"
              )}>
                {dayNumber}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <TooltipProvider key={event.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "text-[10px] px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity",
                            event.type === 'manual' 
                              ? "bg-purple-500/20 text-purple-700" 
                              : "bg-blue-500/20 text-blue-700"
                          )}
                          onClick={() => {
                            setSelectedEvent(event);
                            setDialogOpen(true);
                          }}
                        >
                          {formatBrazilTime(event.nextFollowupAt)} - {event.contactName || formatPhone(event.contactNumber)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{event.contactName || formatPhone(event.contactNumber)}</p>
                        <p className="text-xs">Estágio {event.stage + 1}</p>
                        <p className="text-xs">{formatDateTime(event.nextFollowupAt)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">
                    +{dayEvents.length - 3} mais
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      );
    }

    return days;
  };

  // Render List View
  const renderListView = () => {
    const groupedByDate = filteredEvents.reduce((acc, event) => {
      const date = formatBrazilDate(event.nextFollowupAt);
      if (!acc[date]) acc[date] = [];
      acc[date].push(event);
      return acc;
    }, {} as Record<string, FollowupEvent[]>);

    const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
      const [dayA, monthA, yearA] = a.split('/').map(Number);
      const [dayB, monthB, yearB] = b.split('/').map(Number);
      return new Date(yearA, monthA - 1, dayA).getTime() - new Date(yearB, monthB - 1, dayB).getTime();
    });

    if (sortedDates.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Nenhum follow-up agendado</p>
          <p className="text-sm">Quando clientes pararem de responder, os follow-ups aparecerão aqui</p>
        </div>
      );
    }

    return (
      <ScrollArea className="h-[500px]">
        <div className="space-y-4">
          {sortedDates.map(date => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px flex-1 bg-border" />
                <Badge variant="outline" className="font-medium">{date}</Badge>
                <Badge variant="secondary">{groupedByDate[date].length}</Badge>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {groupedByDate[date].map(event => (
                  <Card 
                    key={event.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => { setSelectedEvent(event); setDialogOpen(true); }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center",
                            event.type === 'manual' ? "bg-purple-100" : "bg-blue-100"
                          )}>
                            <User className={cn("w-4 h-4", event.type === 'manual' ? "text-purple-600" : "text-blue-600")} />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{event.contactName || formatPhone(event.contactNumber)}</p>
                            <p className="text-xs text-muted-foreground">{formatPhone(event.contactNumber)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs font-medium">
                              {formatBrazilTime(event.nextFollowupAt)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{formatRelativeTime(event.nextFollowupAt)}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px]">#{event.stage + 1}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header com Toggle Principal */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-primary" />
            Follow-up Inteligente
          </h1>
          <p className="text-muted-foreground mt-1">
            Agenda de follow-ups e configurações automáticas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ContextualHelpButton articleId="followup-setup" title="Como usar o Follow-up" description="Tutorial passo a passo de configuração do follow-up automático." />
          {mainTab === 'config' && (
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          )}
        </div>
      </div>

      {/* Toggle de Ativar/Desativar + Botão Reorganizar - SEMPRE VISÍVEL */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-3">
                <Switch
                  id="followup-enabled-main"
                  checked={formData.isEnabled ?? false}
                  onCheckedChange={(checked) => {
                    setFormData({ ...formData, isEnabled: checked });
                    saveMutation.mutate({ ...formData, isEnabled: checked });
                  }}
                />
                <Label htmlFor="followup-enabled-main" className="flex items-center gap-2">
                  {formData.isEnabled ? (
                    <>
                      <Zap className="w-5 h-5 text-green-500" />
                      <span className="font-medium text-green-600">Follow-up Ativado</span>
                    </>
                  ) : (
                    <>
                      <ZapOff className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">Follow-up Desativado</span>
                    </>
                  )}
                </Label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => reorganizeMutation.mutate()}
                disabled={reorganizeMutation.isPending || !formData.isEnabled}
                title="Reagenda todos os follow-ups pendentes baseado na configuração atual"
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", reorganizeMutation.isPending && "animate-spin")} />
                {reorganizeMutation.isPending ? "Reorganizando..." : "Reorganizar Follow-ups"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refetchPending();
                  refetchStats();
                  refetchLogs();
                  refetchAnalytics();
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.totalSent || 0}</p>
                <p className="text-xs text-muted-foreground">Enviados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.pending || 0}</p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.scheduledToday || 0}</p>
                <p className="text-xs text-muted-foreground">Hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.totalCancelled || 0}</p>
                <p className="text-xs text-muted-foreground">Cancelados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 gap-2 md:grid-cols-7">
          <TabsTrigger value="agenda">
            <Calendar className="w-4 h-4 mr-2" />
            Agenda
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings className="w-4 h-4 mr-2" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="timing">
            <Clock className="w-4 h-4 mr-2" />
            Horários
          </TabsTrigger>
          <TabsTrigger value="content">
            <MessageCircle className="w-4 h-4 mr-2" />
            Conteúdo
          </TabsTrigger>
          <TabsTrigger value="pending">
            <Bell className="w-4 h-4 mr-2" />
            Pendentes ({pending?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="history">
            <BarChart3 className="w-4 h-4 mr-2" />
            Histórico
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Tab Agenda - Calendário Interativo */}
        <TabsContent value="agenda" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Agenda de Follow-ups
                  </CardTitle>
                  <CardDescription>
                    Visualize e gerencie todos os follow-ups agendados
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 w-[200px]"
                    />
                  </div>
                  <div className="flex border rounded-md">
                    <Button
                      variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('calendar')}
                      className="rounded-r-none"
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="rounded-l-none"
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {viewMode === 'calendar' ? (
                <div className="space-y-4">
                  {/* Navegação do Mês */}
                  <div className="flex items-center justify-between">
                    <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">
                        {MONTHS[month]} {year}
                      </h3>
                      <Button variant="ghost" size="sm" onClick={goToToday}>
                        Hoje
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigateMonth('next')}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Cabeçalho dos Dias */}
                  <div className="grid grid-cols-7 text-center text-sm font-medium text-muted-foreground">
                    {WEEKDAY_NAMES.map(day => (
                      <div key={day} className="py-2">{day}</div>
                    ))}
                  </div>

                  {/* Grid do Calendário */}
                  <div className="grid grid-cols-7">
                    {renderCalendarGrid()}
                  </div>

                  {/* Legenda */}
                  <div className="flex items-center gap-4 justify-center text-xs text-muted-foreground pt-2 border-t">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-blue-500/20" />
                      <span>Automático</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-purple-500/20" />
                      <span>Manual</span>
                    </div>
                  </div>
                </div>
              ) : (
                renderListView()
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Configuração */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configurações Gerais</CardTitle>
              <CardDescription>
                Ative ou desative o follow-up automático para todas as conversas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Follow-up Ativo</Label>
                  <p className="text-sm text-muted-foreground">
                    Quando ativado, mensagens automáticas serão enviadas para clientes que pararam de responder
                  </p>
                </div>
                <Switch
                  checked={formData.isEnabled ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label>Máximo de Tentativas</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[formData.maxAttempts || 8]}
                    onValueChange={([value]) => setFormData({ ...formData, maxAttempts: value })}
                    max={20}
                    min={1}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-12 text-center font-mono">{formData.maxAttempts || 8}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Número de mensagens de follow-up antes de pausar (ou entrar em loop infinito)
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Loop Infinito</Label>
                  <p className="text-sm text-muted-foreground">
                    Continuar enviando follow-ups a cada 15-30 dias após acabar a sequência
                  </p>
                </div>
                <Switch
                  checked={formData.infiniteLoop ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, infiniteLoop: checked })}
                />
              </div>

              {formData.infiniteLoop && (
                <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
                  <div className="space-y-2">
                    <Label>Mínimo (dias)</Label>
                    <Input
                      type="number"
                      value={formData.infiniteLoopMinDays || 15}
                      onChange={(e) => setFormData({ ...formData, infiniteLoopMinDays: parseInt(e.target.value) })}
                      min={1}
                      max={60}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Máximo (dias)</Label>
                    <Input
                      type="number"
                      value={formData.infiniteLoopMaxDays || 30}
                      onChange={(e) => setFormData({ ...formData, infiniteLoopMaxDays: parseInt(e.target.value) })}
                      min={1}
                      max={90}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label>Sequência de Intervalos (tempo entre cada follow-up)</Label>
                <div className="space-y-2">
                  {(formData.intervalsMinutes || [10, 30, 180, 1440, 2880, 4320, 10080, 21600]).map((interval, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Badge variant="outline" className="w-8 justify-center">#{i + 1}</Badge>
                      <Select
                        value={interval.toString()}
                        onValueChange={(value) => {
                          const newIntervals = [...(formData.intervalsMinutes || [10, 30, 180, 1440, 2880, 4320, 10080, 21600])];
                          newIntervals[i] = parseInt(value);
                          setFormData({ ...formData, intervalsMinutes: newIntervals });
                        }}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 min</SelectItem>
                          <SelectItem value="10">10 min</SelectItem>
                          <SelectItem value="15">15 min</SelectItem>
                          <SelectItem value="30">30 min</SelectItem>
                          <SelectItem value="60">1 hora</SelectItem>
                          <SelectItem value="120">2 horas</SelectItem>
                          <SelectItem value="180">3 horas</SelectItem>
                          <SelectItem value="360">6 horas</SelectItem>
                          <SelectItem value="720">12 horas</SelectItem>
                          <SelectItem value="1440">1 dia</SelectItem>
                          <SelectItem value="2880">2 dias</SelectItem>
                          <SelectItem value="4320">3 dias</SelectItem>
                          <SelectItem value="7200">5 dias</SelectItem>
                          <SelectItem value="10080">7 dias</SelectItem>
                          <SelectItem value="14400">10 dias</SelectItem>
                          <SelectItem value="21600">15 dias</SelectItem>
                          <SelectItem value="43200">30 dias</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground flex-1">
                        após {i === 0 ? 'última msg do cliente' : `follow-up #${i}`}
                      </span>
                      {(formData.intervalsMinutes || []).length > 3 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            const newIntervals = [...(formData.intervalsMinutes || [])];
                            newIntervals.splice(i, 1);
                            setFormData({ ...formData, intervalsMinutes: newIntervals });
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {(formData.intervalsMinutes || []).length < 12 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentIntervals = formData.intervalsMinutes || [10, 30, 180, 1440, 2880, 4320, 10080, 21600];
                      const lastInterval = currentIntervals[currentIntervals.length - 1] || 1440;
                      setFormData({ 
                        ...formData, 
                        intervalsMinutes: [...currentIntervals, Math.min(lastInterval * 2, 43200)] 
                      });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Etapa
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Configure o tempo de espera entre cada tentativa de follow-up
                </p>
              </div>

              {/* Botão Salvar */}
              <div className="pt-4 border-t">
                <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Horários */}
        <TabsContent value="timing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Horário Comercial</CardTitle>
              <CardDescription>
                Configure quando o follow-up pode ser enviado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Respeitar Horário Comercial</Label>
                  <p className="text-sm text-muted-foreground">
                    Enviar mensagens apenas durante o horário definido
                  </p>
                </div>
                <Switch
                  checked={formData.respectBusinessHours ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, respectBusinessHours: checked })}
                />
              </div>

              {formData.respectBusinessHours && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Início</Label>
                      <Input
                        type="time"
                        value={formData.businessHoursStart || "09:00"}
                        onChange={(e) => setFormData({ ...formData, businessHoursStart: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim</Label>
                      <Input
                        type="time"
                        value={formData.businessHoursEnd || "18:00"}
                        onChange={(e) => setFormData({ ...formData, businessHoursEnd: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Dias da Semana</Label>
                    <div className="flex gap-2">
                      {WEEKDAYS.map((day) => (
                        <Button
                          key={day.value}
                          variant={(formData.businessDays || [1, 2, 3, 4, 5]).includes(day.value) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleDay(day.value)}
                        >
                          {day.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Botão Salvar */}
              <div className="pt-4 border-t">
                <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saveMutation.isPending ? "Salvando..." : "Salvar Horários"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Conteúdo */}
        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tom e Estilo</CardTitle>
              <CardDescription>
                Configure como a IA deve se comunicar nas mensagens de follow-up
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Tom da Conversa</Label>
                <Select
                  value={formData.tone || "consultivo"}
                  onValueChange={(value) => setFormData({ ...formData, tone: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div>
                          <div className="font-medium">{option.label}</div>
                          <div className="text-xs text-muted-foreground">{option.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nível de Formalidade: {formData.formalityLevel || 5}/10</Label>
                <Slider
                  value={[formData.formalityLevel || 5]}
                  onValueChange={([value]) => setFormData({ ...formData, formalityLevel: value })}
                  max={10}
                  min={1}
                  step={1}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Informal</span>
                  <span>Formal</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Usar Emojis</Label>
                  <p className="text-sm text-muted-foreground">
                    Incluir emojis moderadamente nas mensagens
                  </p>
                </div>
                <Switch
                  checked={formData.useEmojis ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, useEmojis: checked })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações Importantes</CardTitle>
              <CardDescription>
                Adicione argumentos e informações que a IA pode usar nos follow-ups (máximo 10)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lista de informações existentes */}
              <div className="space-y-3">
                {(formData.importantInfo || []).map((info, index) => (
                  <div key={index} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{info.titulo}</p>
                      <p className="text-sm text-muted-foreground">{info.conteudo}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeImportantInfo(index)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Formulário para adicionar */}
              {(formData.importantInfo || []).length < 10 && (
                <div className="space-y-3 pt-3 border-t">
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      placeholder="Ex: Garantia, Desconto, Entrega Grátis..."
                      value={newInfo.titulo}
                      onChange={(e) => setNewInfo({ ...newInfo, titulo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Conteúdo</Label>
                    <Textarea
                      placeholder="Ex: Oferecemos 60 dias de garantia total com troca grátis..."
                      value={newInfo.conteudo}
                      onChange={(e) => setNewInfo({ ...newInfo, conteudo: e.target.value })}
                    />
                  </div>
                  <Button variant="outline" onClick={addImportantInfo}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Informação
                  </Button>
                </div>
              )}

              {/* Botão Salvar */}
              <div className="pt-4 border-t">
                <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saveMutation.isPending ? "Salvando..." : "Salvar Conteúdo"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Pendentes */}
        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Conversas com Follow-up Pendente</CardTitle>
              <CardDescription>
                Lista de conversas que receberão mensagens de follow-up. Clique para ver opções.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pending && pending.length > 0 ? (
                <div className="space-y-3">
                  {pending.map((conv) => {
                    const hasError = conv.note?.includes('Aguardando conexão') || conv.note?.includes('⚠️');
                    return (
                      <div 
                        key={conv.id} 
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-muted transition-colors",
                          hasError ? "bg-red-50 border border-red-200" : "bg-muted/50"
                        )}
                        onClick={() => {
                          setSelectedEvent(conv);
                          setDialogOpen(true);
                        }}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{conv.contactName || conv.contactNumber}</p>
                            {hasError && (
                              <Badge variant="destructive" className="text-[10px]">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Aguardando conexão
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{conv.contactNumber}</p>
                          <p className="text-xs text-muted-foreground">
                                  Estágio {conv.stage + 1} • Próximo: {conv.nextFollowupAt ? formatBrazilDateTime(conv.nextFollowupAt, { second: '2-digit' }) : 'N/A'}
                          </p>
                          {conv.note && (
                            <p className={cn("text-xs mt-1", hasError ? "text-red-600" : "text-muted-foreground")}>
                              {conv.note}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={conv.stage === 0 ? "default" : "secondary"}>
                            #{conv.stage + 1}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelMutation.mutate(conv.conversationId || conv.id);
                            }}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum follow-up pendente</p>
                  <p className="text-sm">Quando clientes pararem de responder, aparecerão aqui</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Histórico */}
        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Estado do Canal
                  </CardTitle>
                  <CardDescription>
                    Veja como o orquestrador está priorizando respostas, espaçando envios e protegendo o canal.
                  </CardDescription>
                </div>
                {analyticsMeta ? (
                  <Badge variant="outline" className={cn("px-3 py-1 text-xs font-medium", analyticsMeta.badge)}>
                    {analyticsMeta.label}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="px-3 py-1 text-xs font-medium">
                    Carregando
                  </Badge>
                )}
              </div>
              {analyticsMeta && (
                <p className="text-sm text-muted-foreground">{analyticsMeta.description}</p>
              )}
            </CardHeader>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <MessageCircle className="mt-0.5 h-5 w-5 text-violet-500" />
                  <div>
                    <p className="text-2xl font-bold">{analytics?.live.pendingPriorityConversations || 0}</p>
                    <p className="text-xs text-muted-foreground">Clientes aguardando resposta</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      O canal segura follow-up enquanto houver conversa quente sem retorno.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Timer className="mt-0.5 h-5 w-5 text-amber-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      {analytics?.live.antiBan.isPaused
                        ? formatDuration(analytics.live.antiBan.pauseRemainingMs)
                        : "Sem pausa"}
                    </p>
                    <p className="text-xs text-muted-foreground">Pausa anti-ban atual</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Nível de lote {analytics?.live.antiBan.batchPauseLevel ? analytics.live.antiBan.batchPauseLevel + 1 : 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Send className="mt-0.5 h-5 w-5 text-sky-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      {(analytics?.live.centralized.queueSize || 0) + (analytics?.live.legacy.queueLength || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Mensagens aguardando</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Central {analytics?.live.centralized.queueSize || 0} • Legado {analytics?.live.legacy.queueLength || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      {analytics ? `${Math.round(analytics.config.minDelayMs / 1000)}-${Math.round(analytics.config.maxDelayMs / 1000)}s` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Delay base do canal</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Após mensagem manual: +{analytics ? Math.round(analytics.config.ownerMessageDelayMs / 1000) : 0}s
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ritmo e proteção</CardTitle>
                <CardDescription>
                  Leituras do anti-ban, typing e trava única do canal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Janela curta</p>
                    <p className="mt-2 text-xl font-semibold">
                      {analytics ? `${analytics.live.antiBan.minuteCount}/${analytics.config.maxMessagesPerMinute}` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Mensagens por minuto</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Janela longa</p>
                    <p className="mt-2 text-xl font-semibold">
                      {analytics ? `${analytics.live.antiBan.hourCount}/${analytics.config.maxMessagesPerHour}` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Mensagens por hora</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Digitando antes</p>
                    <p className="mt-2 text-xl font-semibold">
                      {analytics?.config.typingEnabled ? `${Math.round(analytics.config.typingMinMs / 1000)}-${Math.round(analytics.config.typingMaxMs / 1000)}s` : "Desligado"}
                    </p>
                    <p className="text-xs text-muted-foreground">Simulação antes das mensagens automáticas</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Canal exclusivo</p>
                    <p className="mt-2 text-xl font-semibold">
                      {analytics?.live.dispatch.isActive ? "Canal ocupado" : "Canal livre"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Esperando vez: {analytics?.live.dispatch.waitingCount || 0}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 p-4">
                  <p className="text-sm font-medium">Escada de pausas em tráfego contínuo</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {analytics?.config.batchPauseSequenceMs.map((pauseMs, index) => (
                      <Badge
                        key={pauseMs}
                        variant="outline"
                        className={cn(
                          "px-3 py-1",
                          analytics.live.antiBan.batchPauseLevel === index && "border-primary text-primary",
                        )}
                      >
                        Lote {index + 1}: {formatDuration(pauseMs)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fila por origem</CardTitle>
                <CardDescription>
                  Respostas pendentes vencem follow-up dentro do mesmo canal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {centralizedOrigins.length > 0 ? (
                  centralizedOrigins.map(([origin, count]) => (
                    <div key={origin} className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{formatOriginLabel(origin)}</p>
                        <p className="text-xs text-muted-foreground">{origin}</p>
                      </div>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                    Nenhuma origem aguardando na fila central neste momento.
                  </div>
                )}

                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <p className="text-sm font-medium">Fila legada ainda ativa</p>
                  <p className="mt-2 text-2xl font-semibold">{analytics?.live.legacy.queueLength || 0}</p>
                  <p className="text-xs text-muted-foreground">
                    Ela também respeita o mesmo lock de canal e a mesma política anti-ban.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Saídas hoje</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{analytics?.daily.totalOutbound || 0}</p>
                <p className="text-xs text-muted-foreground">Mensagens enviadas no dia</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Manual x automática</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {analytics ? `${analytics.daily.manualOutbound}/${analytics.daily.automatedOutbound}` : "0/0"}
                </p>
                <p className="text-xs text-muted-foreground">Saída manual / automatizada</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Follow-up do dia</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{analytics?.daily.followupsProcessed || 0}</p>
                <p className="text-xs text-muted-foreground">
                  Enviados {analytics?.daily.followupsSent || 0} • Pulados {analytics?.daily.followupsSkipped || 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Conversas alcançadas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{analytics?.daily.outboundConversations || 0}</p>
                <p className="text-xs text-muted-foreground">Conversas com saída hoje</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Histórico de Follow-ups
                  </CardTitle>
                  <CardDescription>
                    Veja todos os follow-ups enviados, falhados e cancelados
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {logs && logs.length > 0 ? (
                <div className="space-y-3">
                  {logs.map((log) => {
                    const statusConfig = {
                      sent: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', label: 'Enviado' },
                      failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Falhou' },
                      cancelled: { icon: XCircle, color: 'text-orange-500', bg: 'bg-orange-50', label: 'Cancelado' },
                      skipped: { icon: SkipForward, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Pulado' },
                    };
                    const cfg = statusConfig[log.status] || statusConfig.failed;
                    const StatusIcon = cfg.icon;
                    
                    return (
                      <div 
                        key={log.id} 
                        className={cn(
                          "flex items-start justify-between p-4 rounded-lg border",
                          cfg.bg
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <StatusIcon className={cn("w-5 h-5 mt-0.5", cfg.color)} />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{formatPhone(log.contactNumber)}</p>
                              <Badge variant="outline" className="text-xs">
                                Estágio #{log.stage + 1}
                              </Badge>
                              <Badge className={cn("text-xs", 
                                log.status === 'sent' ? 'bg-green-500' : 
                                log.status === 'failed' ? 'bg-red-500' : 
                                log.status === 'cancelled' ? 'bg-orange-500' : 'bg-blue-500'
                              )}>
                                {cfg.label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(log.executedAt).toLocaleString('pt-BR')}
                            </p>
                            {log.messageContent && (
                              <p className="text-sm text-muted-foreground line-clamp-2 max-w-lg">
                                "{log.messageContent}"
                              </p>
                            )}
                            {log.errorReason && (
                              <p className="text-sm text-red-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {log.errorReason}
                              </p>
                            )}
                            {log.aiDecision && (
                              <p className="text-xs text-muted-foreground">
                                IA: {log.aiDecision.action} - {log.aiDecision.reason}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum follow-up executado ainda</p>
                  <p className="text-sm">O histórico aparecerá aqui quando houver envios</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de Detalhes do Follow-up */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {selectedEvent?.contactName || formatPhone(selectedEvent?.contactNumber || '')}
            </DialogTitle>
            <DialogDescription>
              Detalhes do follow-up agendado
            </DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Telefone</p>
                  <p className="font-medium">{formatPhone(selectedEvent.contactNumber)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Estágio</p>
                  <Badge variant="outline">#{selectedEvent.stage + 1}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Tipo</p>
                  <Badge variant={selectedEvent.type === 'manual' ? 'default' : 'secondary'}>
                    {selectedEvent.type === 'manual' ? 'Manual' : 'Automático'}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Agendado para</p>
                  <p className="font-medium text-sm">{formatDateTime(selectedEvent.nextFollowupAt)}</p>
                </div>
              </div>

              {selectedEvent.note && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Observação</p>
                  <p className="text-sm bg-muted p-2 rounded">{selectedEvent.note}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    if (!selectedEvent.conversationId) return;
                    cancelMutation.mutate(selectedEvent.conversationId);
                    setDialogOpen(false);
                  }}
                  disabled={cancelMutation.isPending || !selectedEvent.conversationId}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (!selectedEvent.conversationId) return;
                    triggerMutation.mutate(selectedEvent.conversationId);
                    setDialogOpen(false);
                  }}
                  disabled={triggerMutation.isPending || !selectedEvent.conversationId}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Enviar Agora
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
