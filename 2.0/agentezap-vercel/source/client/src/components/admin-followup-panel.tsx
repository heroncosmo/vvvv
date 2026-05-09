import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Loader2, Bell, Save, RefreshCw, CheckCircle, XCircle, AlertCircle, MessageCircle, Calendar, TrendingUp, History, UserX, Settings2, Plus, Trash2 } from "lucide-react";

interface FollowupConfig {
  id: string;
  userId: string;
  isEnabled: boolean;
  followupNonPayersEnabled: boolean;
  maxAttempts: number;
  intervalsMinutes: number[];
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  respectBusinessHours: boolean;
  tone: string;
  formalityLevel: number;
  useEmojis: boolean;
  importantInfo: { titulo: string; conteudo: string }[];
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
  unpaid?: number;
  unpaidFollowupsEnabled?: number;
}

interface FollowupLog {
  id: number;
  conversationId: string;
  contactNumber: string;
  contactName?: string | null;
  status: 'sent' | 'failed' | 'cancelled' | 'skipped' | 'scheduled';
  messageContent: string | null;
  stage?: number | null;
  executedAt: string;
  errorReason: string | null;
  followupType?: string | null;
  paymentStatus?: string | null;
}

interface FollowupEvent {
  id: string;
  conversationId?: string;
  contactNumber: string;
  contactName: string | null;
  stage: number;
  nextFollowupAt: string;
  status?: 'pending' | 'scheduled' | 'sent' | 'cancelled' | 'failed' | 'skipped';
  paymentStatus?: string;
  followupForNonPayers?: boolean;
}

interface AdminFollowUpPanelProps {
  defaultSubTab?: string;
  onSubTabChange?: (subTab: string) => void;
}

const DEFAULT_INTERVALS = [10, 180, 1440, 2880, 4320, 10080, 21600];

export default function AdminFollowUpPanel({ defaultSubTab, onSubTabChange }: AdminFollowUpPanelProps) {
  const { toast } = useToast();

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: config, isLoading: configLoading, refetch: refetchConfig } = useQuery<FollowupConfig>({
    queryKey: ["/api/admin/followup/config"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/followup/config");
      return res.json();
    },
  });

  const { data: stats, refetch: refetchStats } = useQuery<FollowupStats>({
    queryKey: ["/api/admin/followup/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/followup/stats");
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: pending, refetch: refetchPending } = useQuery<FollowupEvent[]>({
    queryKey: ["/api/admin/followup/pending"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/followup/pending");
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: agenda, refetch: refetchAgenda } = useQuery<FollowupEvent[]>({
    queryKey: ["/api/admin/followup/agenda"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/followup/agenda?limit=500");
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 90000,
  });

  const { data: logs, refetch: refetchLogs } = useQuery<FollowupLog[]>({
    queryKey: ["/api/admin/followup/logs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/followup/logs?limit=200");
      return res.json();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  // ─── Local state ─────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState<Partial<FollowupConfig>>({});
  const [activeTab, setActiveTab] = useState(defaultSubTab || "overview");

  useEffect(() => {
    if (config) setFormData(config);
  }, [config]);

  useEffect(() => {
    if (defaultSubTab && defaultSubTab !== activeTab) {
      setActiveTab(defaultSubTab);
    }
  }, [defaultSubTab, activeTab]);

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<FollowupConfig>) => {
      const res = await apiRequest("PUT", "/api/admin/followup/config", data);
      return res.json();
    },
    onSuccess: () => {
      refetchConfig();
      refetchStats();
      toast({ title: "Configuração salva!", description: "Alterações aplicadas." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    },
  });

  const reorganizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/followup/reorganize");
      return res.json();
    },
    onSuccess: (data: any) => {
      refetchAgenda();
      refetchPending();
      refetchStats();
      refetchLogs();
      toast({
        title: "Follow-ups reorganizados!",
        description: `${data.reorganized ?? 0} reagendados, ${data.skipped ?? 0} ignorados`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao reorganizar", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => saveMutation.mutate(formData);
  const refreshAll = () => {
    refetchAgenda();
    refetchPending();
    refetchStats();
    refetchLogs();
  };

  const toggleDay = (day: number) => {
    const current = formData.businessDays || [];
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort();
    setFormData({ ...formData, businessDays: next });
  };

  // ─── Formatters ──────────────────────────────────────────────────────────────
  const formatInterval = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
    return `${Math.floor(minutes / 1440)}d`;
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  };

  const formatPhone = (phone: string) => {
    if (!phone) return "Sem número";
    if (phone.length >= 12) return `(${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
    return phone;
  };

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    pending:   { label: "Pendente",  color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: Bell },
    sent:      { label: "Enviado",   color: "bg-green-500/10 text-green-600 border-green-500/20",   icon: CheckCircle },
    cancelled: { label: "Cancelado", color: "bg-gray-500/10 text-gray-600 border-gray-500/20",      icon: XCircle },
    failed:    { label: "Falhou",    color: "bg-red-500/10 text-red-600 border-red-500/20",         icon: AlertCircle },
    skipped:   { label: "Pulado",    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",      icon: MessageCircle },
    scheduled: { label: "Agendado",  color: "bg-purple-500/10 text-purple-600 border-purple-500/20",icon: Calendar },
  };

  const paymentBadge: Record<string, { label: string; color: string }> = {
    paid:    { label: "Pago",     color: "bg-green-100 text-green-700" },
    unpaid:  { label: "Não pago", color: "bg-red-100 text-red-700" },
    pending: { label: "Pendente", color: "bg-yellow-100 text-yellow-700" },
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Follow-up Inteligente
          </h2>
          <p className="text-muted-foreground mt-1">Sistema automático de follow-ups para conversas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => reorganizeMutation.mutate()}
            disabled={reorganizeMutation.isPending || !formData.isEnabled}
            title="Reagenda os follow-ups preservando o estágio atual"
          >
            {reorganizeMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            {reorganizeMutation.isPending ? "Reorganizando..." : "Reorganizar Follow-ups"}
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      {/* Toggle Principal */}
      <Card>
        <CardContent className="py-4 space-y-4">
          {/* Follow-up global */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Switch
                id="followup-enabled-main"
                checked={formData.isEnabled ?? false}
                onCheckedChange={(checked) => {
                  const next = { ...formData, isEnabled: checked };
                  setFormData(next);
                  saveMutation.mutate(next);
                }}
              />
              <Label htmlFor="followup-enabled-main" className="flex items-center gap-2 cursor-pointer">
                {formData.isEnabled ? (
                  <><TrendingUp className="w-5 h-5 text-green-500" /><span className="font-medium text-green-600">Follow-up Ativado</span></>
                ) : (
                  <><Bell className="w-5 h-5 text-muted-foreground" /><span className="font-medium text-muted-foreground">Follow-up Desativado</span></>
                )}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => reorganizeMutation.mutate()}
                disabled={reorganizeMutation.isPending || !formData.isEnabled}
              >
                {reorganizeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {reorganizeMutation.isPending ? "Reorganizando..." : "Reorganizar Follow-ups"}
              </Button>
              <Button variant="outline" size="sm" onClick={refreshAll}>
                <RefreshCw className="w-4 h-4 mr-2" />Atualizar
              </Button>
            </div>
          </div>

          {/* Toggle não pagantes */}
          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex items-center space-x-3">
              <Switch
                id="followup-nonpayers"
                checked={formData.followupNonPayersEnabled ?? true}
                onCheckedChange={(checked) => {
                  const next = { ...formData, followupNonPayersEnabled: checked };
                  setFormData(next);
                  saveMutation.mutate(next);
                }}
              />
              <Label htmlFor="followup-nonpayers" className="flex items-center gap-2 cursor-pointer">
                <UserX className={cn("w-5 h-5", formData.followupNonPayersEnabled ? "text-orange-500" : "text-muted-foreground")} />
                <div>
                  <span className="font-medium">Follow-up para Não Pagantes</span>
                  <p className="text-xs text-muted-foreground">
                    {formData.followupNonPayersEnabled
                      ? "Enviando follow-ups para contatos com pagamento pendente/não pago"
                      : "Follow-up para não pagantes desativado"}
                  </p>
                </div>
              </Label>
            </div>
            {stats?.unpaid !== undefined && (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                {stats.unpaid} não pagantes
              </Badge>
            )}
          </div>

          {/* Periodicidade loop infinito */}
          {formData.followupNonPayersEnabled && (
            <div className="pl-4 border-l-2 border-orange-200 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-orange-500" />
                Periodicidade do Loop (dias após sequência)
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Mínimo (dias)</Label>
                  <Input
                    type="number"
                    min={1} max={365}
                    value={formData.infiniteLoopMinDays ?? 15}
                    onChange={(e) => setFormData({ ...formData, infiniteLoopMinDays: parseInt(e.target.value) })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Máximo (dias)</Label>
                  <Input
                    type="number"
                    min={1} max={365}
                    value={formData.infiniteLoopMaxDays ?? 30}
                    onChange={(e) => setFormData({ ...formData, infiniteLoopMaxDays: parseInt(e.target.value) })}
                    className="h-8"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Após completar a sequência de follow-ups, o próximo será enviado entre {formData.infiniteLoopMinDays ?? 15} e {formData.infiniteLoopMaxDays ?? 30} dias aleatoriamente.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { icon: CheckCircle, color: "text-green-500", value: stats?.totalSent ?? 0, label: "Enviados" },
          { icon: Bell, color: "text-yellow-500", value: stats?.pending ?? 0, label: "Pendentes" },
          { icon: Calendar, color: "text-orange-500", value: stats?.scheduledToday ?? 0, label: "Hoje" },
          { icon: XCircle, color: "text-red-500", value: stats?.totalCancelled ?? 0, label: "Cancelados" },
          { icon: MessageCircle, color: "text-blue-500", value: stats?.totalSkipped ?? 0, label: "Pulados" },
        ].map(({ icon: Icon, color, value, label }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Icon className={cn("w-5 h-5", color)} />
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); onSubTabChange?.(v); }} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="agenda">Agenda ({agenda?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="pending">Pendentes ({pending?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-1" />
            Histórico ({logs?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        {/* ── Overview ──────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Agenda de Follow-ups</CardTitle>
              <CardDescription>Inclui follow-ups futuros e vencidos do admin</CardDescription>
            </CardHeader>
            <CardContent>
              {(!pending || pending.length === 0) && (agenda?.length ?? 0) > 0 && (
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                  Nenhum follow-up está vencido agora. Existem {agenda?.length ?? 0} follow-ups ativos na fila futura.
                </div>
              )}
              {agenda && agenda.length > 0 ? (
                <div className="space-y-3">
                  {agenda.slice(0, 5).map((event) => (
                    <div key={event.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex-1">
                        <p className="font-medium">{event.contactName || formatPhone(event.contactNumber)}</p>
                        <p className="text-sm text-muted-foreground">{formatPhone(event.contactNumber)}</p>
                        <p className="text-xs text-muted-foreground">
                          Estágio {event.stage + 1} • Próximo: {formatDateTime(event.nextFollowupAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {event.paymentStatus && paymentBadge[event.paymentStatus] && (
                          <Badge className={cn("text-[10px]", paymentBadge[event.paymentStatus].color)}>
                            {paymentBadge[event.paymentStatus].label}
                          </Badge>
                        )}
                        <Badge className={cn("text-[10px]", (event.status ? statusConfig[event.status] : statusConfig.pending).color)}>
                          {(event.status ? statusConfig[event.status] : statusConfig.pending).label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">#{event.stage + 1}</Badge>
                      </div>
                    </div>
                  ))}
                  {agenda.length > 5 && (
                    <Button variant="ghost" className="w-full" onClick={() => setActiveTab("agenda")}>
                      Ver toda a agenda com {agenda.length} follow-ups →
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Nenhum follow-up agendado</p>
                  <p className="text-sm">Quando houver follow-ups ativos no admin, a agenda aparecerá aqui</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logs Recentes</CardTitle>
              <CardDescription>Últimas ações do sistema de follow-up</CardDescription>
            </CardHeader>
            <CardContent>
              {logs && logs.length > 0 ? (
                <div className="space-y-2">
                  {logs.slice(0, 10).map((log) => {
                    const s = statusConfig[log.status] || statusConfig.skipped;
                    const StatusIcon = s.icon;
                    return (
                      <div key={log.id} className="flex items-center justify-between p-2 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <StatusIcon className="w-4 h-4" />
                          <div>
                            <p className="text-sm font-medium">
                              {log.contactName || formatPhone(log.contactNumber)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Estágio {(log.stage ?? 0) + 1} • {formatDateTime(log.executedAt)}
                            </p>
                          </div>
                        </div>
                        <Badge className={cn("text-[10px]", s.color)}>{s.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center py-4 text-sm text-muted-foreground">Nenhum log encontrado</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pendentes ─────────────────────────────────────────────────── */}
        <TabsContent value="agenda">
          <Card>
            <CardHeader>
              <CardTitle>Agenda Completa</CardTitle>
              <CardDescription>
                Todos os follow-ups ativos do admin, inclusive os migrados que ainda estão no futuro
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(!pending || pending.length === 0) && (agenda?.length ?? 0) > 0 && (
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                  Os follow-ups não sumiram. Existem {agenda?.length ?? 0} agendados no futuro; veja a aba `Agenda`.
                </div>
              )}
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {agenda && agenda.length > 0 ? (
                    agenda.map((conv) => (
                      <div key={conv.id} className="flex items-center justify-between p-4 rounded-lg border">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="font-medium">{conv.contactName || formatPhone(conv.contactNumber)}</p>
                            <Badge className={cn("text-[10px]", (conv.status ? statusConfig[conv.status] : statusConfig.pending).color)}>
                              {(conv.status ? statusConfig[conv.status] : statusConfig.pending).label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">#{conv.stage + 1}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{formatPhone(conv.contactNumber)}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Próximo: {formatDateTime(conv.nextFollowupAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {conv.paymentStatus && paymentBadge[conv.paymentStatus] && (
                            <Badge className={cn("text-xs", paymentBadge[conv.paymentStatus].color)}>
                              {paymentBadge[conv.paymentStatus].label}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">Nenhum follow-up na agenda</p>
                      <p className="text-sm">Os follow-ups ativos do admin aparecerão aqui</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Conversas com Follow-up Pendente</CardTitle>
              <CardDescription>Lista de conversas que receberão mensagens automáticas</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {pending && pending.length > 0 ? (
                    pending.map((conv) => (
                      <div key={conv.id} className="flex items-center justify-between p-4 rounded-lg border">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{conv.contactName || formatPhone(conv.contactNumber)}</p>
                            <Badge variant="outline" className="text-[10px]">#{conv.stage + 1}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{formatPhone(conv.contactNumber)}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Próximo: {formatDateTime(conv.nextFollowupAt)}
                          </p>
                        </div>
                        {conv.paymentStatus && paymentBadge[conv.paymentStatus] && (
                          <Badge className={cn("text-xs", paymentBadge[conv.paymentStatus].color)}>
                            {paymentBadge[conv.paymentStatus].label}
                          </Badge>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bell className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">Nenhum follow-up pendente</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Histórico ─────────────────────────────────────────────────── */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Histórico Completo de Follow-ups
                </CardTitle>
                <CardDescription>
                  Todos os follow-ups enviados, falhados ou cancelados • {logs?.length ?? 0} registros
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
                <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[550px]">
                <div className="space-y-3">
                  {logs && logs.length > 0 ? (
                    logs.map((log) => {
                      const s = statusConfig[log.status] || statusConfig.skipped;
                      const StatusIcon = s.icon;
                      return (
                        <div key={log.id} className="flex items-start gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                          <StatusIcon className="w-5 h-5 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                              <p className="font-medium text-sm">
                                {log.contactName || formatPhone(log.contactNumber)}
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {log.paymentStatus && paymentBadge[log.paymentStatus] && (
                                  <Badge className={cn("text-[10px]", paymentBadge[log.paymentStatus].color)}>
                                    {paymentBadge[log.paymentStatus].label}
                                  </Badge>
                                )}
                                {log.followupType && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {log.followupType === "non_payer" ? "Não pagante" :
                                      log.followupType === "final" ? "Final" : "Regular"}
                                  </Badge>
                                )}
                                <Badge className={cn("text-[10px]", s.color)}>{s.label}</Badge>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mb-1">
                              Estágio {(log.stage ?? 0) + 1} • {formatPhone(log.contactNumber)}
                            </p>
                            {log.messageContent && (
                              <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mt-1 line-clamp-2">
                                "{log.messageContent}"
                              </p>
                            )}
                            {log.errorReason && (
                              <p className="text-xs text-red-600 mt-1">Erro: {log.errorReason}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">{formatDateTime(log.executedAt)}</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">Nenhum log encontrado</p>
                      <p className="text-sm">O histórico será preenchido conforme os follow-ups são executados</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Configurações ─────────────────────────────────────────────── */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configurações Gerais</CardTitle>
              <CardDescription>Configure o comportamento do follow-up automático</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Follow-up ativo */}
              <div className="space-y-3">
                <Label>Sequência de Intervalos (tempo entre cada follow-up)</Label>
                <div className="space-y-2">
                  {(formData.intervalsMinutes || DEFAULT_INTERVALS).map((interval, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Badge variant="outline" className="w-8 justify-center">#{i + 1}</Badge>
                      <Select
                        value={interval.toString()}
                        onValueChange={(value) => {
                          const newIntervals = [...(formData.intervalsMinutes || DEFAULT_INTERVALS)];
                          newIntervals[i] = parseInt(value, 10);
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
                        após {i === 0 ? "última msg do cliente" : `follow-up #${i}`}
                      </span>
                      {(formData.intervalsMinutes || []).length > 3 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            const newIntervals = [...(formData.intervalsMinutes || DEFAULT_INTERVALS)];
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
                {(formData.intervalsMinutes || DEFAULT_INTERVALS).length < 12 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentIntervals = formData.intervalsMinutes || DEFAULT_INTERVALS;
                      const lastInterval = currentIntervals[currentIntervals.length - 1] || 1440;
                      setFormData({
                        ...formData,
                        intervalsMinutes: [...currentIntervals, Math.min(lastInterval * 2, 43200)],
                      });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Etapa
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Configure o mesmo tempo de espera do painel antigo entre cada tentativa.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Follow-up Ativo</Label>
                  <p className="text-sm text-muted-foreground">
                    Mensagens automáticas para clientes que pararam de responder
                  </p>
                </div>
                <Switch
                  checked={formData.isEnabled ?? true}
                  onCheckedChange={(c) => setFormData({ ...formData, isEnabled: c })}
                />
              </div>

              {/* Follow-up não pagantes */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base flex items-center gap-2">
                    <UserX className="w-4 h-4 text-orange-500" />
                    Follow-up para Não Pagantes
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Enviar follow-ups para contatos com status de pagamento pendente ou não pago
                  </p>
                </div>
                <Switch
                  checked={formData.followupNonPayersEnabled ?? true}
                  onCheckedChange={(c) => setFormData({ ...formData, followupNonPayersEnabled: c })}
                />
              </div>

              {/* Máximo de tentativas */}
              <div className="space-y-2">
                <Label>Máximo de Tentativas</Label>
                <Input
                  type="number" min={1} max={20}
                  value={formData.maxAttempts ?? 8}
                  onChange={(e) => setFormData({ ...formData, maxAttempts: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">Número de mensagens antes de entrar no loop infinito</p>
              </div>

              {/* Loop infinito */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Loop Infinito</Label>
                  <p className="text-sm text-muted-foreground">
                    Continuar enviando follow-ups periodicamente após acabar a sequência
                  </p>
                </div>
                <Switch
                  checked={formData.infiniteLoop ?? true}
                  onCheckedChange={(c) => setFormData({ ...formData, infiniteLoop: c })}
                />
              </div>

              {/* Periodicidade */}
              {(formData.infiniteLoop !== false) && (
                <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
                  <div className="space-y-2">
                    <Label>Periodicidade Mínima (dias)</Label>
                    <Input
                      type="number" min={1} max={365}
                      value={formData.infiniteLoopMinDays ?? 15}
                      onChange={(e) => setFormData({ ...formData, infiniteLoopMinDays: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Periodicidade Máxima (dias)</Label>
                    <Input
                      type="number" min={1} max={365}
                      value={formData.infiniteLoopMaxDays ?? 30}
                      onChange={(e) => setFormData({ ...formData, infiniteLoopMaxDays: parseInt(e.target.value) })}
                    />
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground">
                    Intervalo aleatório entre {formData.infiniteLoopMinDays ?? 15}–{formData.infiniteLoopMaxDays ?? 30} dias para o loop de reengajamento
                  </p>
                </div>
              )}

              {/* Horário comercial */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Respeitar Horário Comercial</Label>
                  <p className="text-sm text-muted-foreground">Enviar apenas durante o horário configurado</p>
                </div>
                <Switch
                  checked={formData.respectBusinessHours ?? true}
                  onCheckedChange={(c) => setFormData({ ...formData, respectBusinessHours: c })}
                />
              </div>

              {formData.respectBusinessHours && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Início</Label>
                      <Input type="time" value={formData.businessHoursStart ?? "09:00"}
                        onChange={(e) => setFormData({ ...formData, businessHoursStart: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim</Label>
                      <Input type="time" value={formData.businessHoursEnd ?? "18:00"}
                        onChange={(e) => setFormData({ ...formData, businessHoursEnd: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Dias da Semana</Label>
                    <div className="flex gap-2 flex-wrap">
                      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day, i) => (
                        <Button
                          key={i}
                          variant={(formData.businessDays ?? [1, 2, 3, 4, 5]).includes(i) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleDay(i)}
                        >
                          {day}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Emojis */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Usar Emojis</Label>
                  <p className="text-sm text-muted-foreground">Incluir emojis moderadamente nas mensagens</p>
                </div>
                <Switch
                  checked={formData.useEmojis ?? true}
                  onCheckedChange={(c) => setFormData({ ...formData, useEmojis: c })}
                />
              </div>

              <div className="pt-4 border-t">
                <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
