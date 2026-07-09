import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Scissors, 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Bot,
  Settings2,
  HelpCircle,
  Clock,
  DollarSign,
  User,
  Sparkles,
  Calendar,
  MessageSquare,
  Users,
  Palette,
  Save,
  Loader2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ProviderAppointmentsPanel } from "@/components/provider/provider-appointments-panel";

// ═══════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════

interface SalonConfig {
  id: string | null;
  user_id: string;
  is_active: boolean;
  send_to_ai: boolean;
  salon_name: string | null;
  salon_type: string;
  phone: string | null;
  address: string | null;
  opening_hours: Record<string, any>;  // Permitir __break e outros campos dinâmicos
  slot_duration: number;
  buffer_between: number;
  max_advance_days: number;
  min_notice_hours: number;
  min_notice_minutes: number;  // NOVO: antecedência em minutos
  allow_cancellation: boolean;
  cancellation_notice_hours: number;
  use_services: boolean;
  use_professionals: boolean;
  allow_multiple_services: boolean;
  welcome_message: string;
  booking_confirmation_message: string;
  reminder_message: string;
  cancellation_message: string;
  closed_message: string;
  humanize_responses: boolean;
  use_customer_name: boolean;
  response_variation: boolean;
  response_delay_min: number;
  response_delay_max: number;
  ai_instructions: string;
  display_instructions: string | null;
  require_confirmation?: boolean;
  auto_confirm?: boolean;
  send_reminder?: boolean;
  reminder_hours_before?: number;
  reminder_times?: number[];
  booking_notification_enabled?: boolean;
  booking_notification_phone?: string | null;
  slot_suggestion_mode?: "first_available" | "ask_preference";
  google_calendar_enabled?: boolean;
  google_calendar_connected?: boolean;
  google_calendar_source?: string | null;
}

interface SalonService {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  is_active: boolean;
  color: string | null;
  display_order: number;
}

interface SalonProfessional {
  id: string;
  user_id: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
  work_schedule: Record<string, any>;
  display_order: number;
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

export default function ProviderMenuPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const getInitialTab = () => {
    if (typeof window === "undefined") {
      return "agendamentos";
    }

    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    const allowedTabs = new Set(["agendamentos", "servicos", "profissionais", "horarios", "ia"]);
    return requestedTab && allowedTabs.has(requestedTab) ? requestedTab : "agendamentos";
  };
  
  // Estados principais
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modal states
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isProfessionalModalOpen, setIsProfessionalModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'service' | 'professional'; id: string } | null>(null);
  
  const [editingService, setEditingService] = useState<SalonService | null>(null);
  const [editingProfessional, setEditingProfessional] = useState<SalonProfessional | null>(null);
  
  // Form states
  const [serviceForm, setServiceForm] = useState({
    name: '',
    description: '',
    duration_minutes: 30,
    price: '',
    is_active: true,
    color: '#6366f1',
  });
  
  const [professionalForm, setProfessionalForm] = useState({
    name: '',
    bio: '',
    avatar_url: '',
    is_active: true,
  });
  
  // Config form state
  const [configForm, setConfigForm] = useState<Partial<SalonConfig>>({
    is_active: false,
    send_to_ai: true,
    salon_name: '',
    salon_type: 'provider',
    phone: '',
    address: '',
    slot_duration: 30,
    buffer_between: 10,
    max_advance_days: 30,
    min_notice_hours: 2,
    min_notice_minutes: 0,  // NOVO: antecedência em minutos (0 permite agendar imediatamente)
    allow_cancellation: true,
    cancellation_notice_hours: 4,
    use_services: true,
    use_professionals: true,
    allow_multiple_services: false,
    humanize_responses: true,
    use_customer_name: true,
    response_variation: true,
    response_delay_min: 1000,
    response_delay_max: 3000,
    require_confirmation: true,
    auto_confirm: false,
    send_reminder: true,
    reminder_hours_before: 24,
    reminder_times: [24],
    booking_notification_enabled: false,
    booking_notification_phone: '',
    slot_suggestion_mode: 'first_available',
    ai_instructions: '',
    welcome_message: 'Olá {cliente_nome}! 🔧 Bem-vindo(a) ao nosso salão! Como posso ajudar você hoje?',
    booking_confirmation_message: 'Perfeito! ✅ Seu agendamento foi confirmado:\n📅 {data}\n⏰ {horario}\n🔧 {servico}\n👤 {profissional}\n\nAguardamos você!',
    reminder_message: 'Lembrete: Você tem um agendamento amanhã às {horario}. Até lá! 🔧',
    cancellation_message: 'Agendamento cancelado. Se precisar remarcar, é só me chamar! 💬',
    closed_message: 'Desculpe, estamos fechados no momento. Nossos horários: {horarios}',
  });
  
  const [openingHours, setOpeningHours] = useState<Record<string, { enabled: boolean; open: string; close: string }>>({
    monday: { enabled: true, open: '09:00', close: '19:00' },
    tuesday: { enabled: true, open: '09:00', close: '19:00' },
    wednesday: { enabled: true, open: '09:00', close: '19:00' },
    thursday: { enabled: true, open: '09:00', close: '19:00' },
    friday: { enabled: true, open: '09:00', close: '19:00' },
    saturday: { enabled: true, open: '09:00', close: '17:00' },
    sunday: { enabled: false, open: '09:00', close: '17:00' },
  });

  // NOVO: Estado para horário de almoço (global)
  const [breakTime, setBreakTime] = useState<{ enabled: boolean; start: string; end: string }>({
    enabled: false,
    start: '12:00',
    end: '13:00',
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("tab", activeTab);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [activeTab]);

  // ═══════════════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════════════
  
  const { data: config, isLoading: isLoadingConfig } = useQuery<SalonConfig>({
    queryKey: ["/api/provider/config"],
  });
  
  const { data: services, isLoading: isLoadingServices } = useQuery<SalonService[]>({
    queryKey: ["/api/provider/services"],
  });
  
  const { data: professionals, isLoading: isLoadingProfessionals } = useQuery<SalonProfessional[]>({
    queryKey: ["/api/provider/professionals"],
  });

  // Sincronizar config quando carregar
  useEffect(() => {
    if (config) {
      console.log('[Salon] Config carregada:', config);
      setConfigForm({
        is_active: config.is_active,
        send_to_ai: config.send_to_ai,
        salon_name: config.salon_name || '',
        salon_type: config.salon_type,
        phone: config.phone || '',
        address: config.address || '',
        slot_duration: config.slot_duration,
        buffer_between: config.buffer_between,
        max_advance_days: config.max_advance_days,
        min_notice_hours: config.min_notice_hours,
        min_notice_minutes: config.min_notice_minutes ?? 0,  // NOVO: usar 0 como padrão
        allow_cancellation: config.allow_cancellation,
        cancellation_notice_hours: config.cancellation_notice_hours,
        use_services: config.use_services,
        use_professionals: config.use_professionals,
        allow_multiple_services: config.allow_multiple_services,
        humanize_responses: config.humanize_responses,
        use_customer_name: config.use_customer_name,
        response_variation: config.response_variation,
        response_delay_min: config.response_delay_min,
        response_delay_max: config.response_delay_max,
        require_confirmation: config.require_confirmation ?? true,
        auto_confirm: config.auto_confirm ?? false,
        send_reminder: config.send_reminder ?? true,
        reminder_hours_before: config.reminder_hours_before ?? 24,
        reminder_times: Array.isArray(config.reminder_times) && config.reminder_times.length > 0 ? config.reminder_times : [24],
        booking_notification_enabled: config.booking_notification_enabled ?? false,
        booking_notification_phone: config.booking_notification_phone || '',
        slot_suggestion_mode: config.slot_suggestion_mode === 'ask_preference' ? 'ask_preference' : 'first_available',
        ai_instructions: config.ai_instructions || '',
        welcome_message: config.welcome_message,
        booking_confirmation_message: config.booking_confirmation_message,
        reminder_message: config.reminder_message,
        cancellation_message: config.cancellation_message,
        closed_message: config.closed_message,
      });
      if (config.opening_hours && Object.keys(config.opening_hours).length > 0) {
        // Remover __break antes de setar openingHours
        const { __break, __settings, ...daysOnly } = config.opening_hours as any;
        setOpeningHours(daysOnly);
        // Carregar configuração de almoço do servidor
        if (__break && typeof __break === 'object') {
          console.log('[Salon] Carregando horário de almoço:', __break);
          setBreakTime({
            enabled: __break.enabled ?? false,
            start: __break.start || '12:00',
            end: __break.end || '13:00',
          });
        } else {
          // Reset para padrão se não houver config de almoço
          console.log('[Salon] Nenhum horário de almoço configurado, usando padrão');
          setBreakTime({ enabled: false, start: '12:00', end: '13:00' });
        }
      } else {
        // Resetar horário de almoço se não houver opening_hours
        setBreakTime({ enabled: false, start: '12:00', end: '13:00' });
      }
    }
  }, [config]);

  // Sincronizar breakTime com configForm sempre que alterar
  useEffect(() => {
    const openingHoursWithBreak = breakTime.enabled
      ? { ...openingHours, __break: breakTime }
      : { ...openingHours, __break: { enabled: false, start: '12:00', end: '13:00' } };
    
    setConfigForm(prev => {
      // Só atualiza se for diferente para evitar loops
      const currentOpeningHours = prev.opening_hours || {};
      
      // Comparar se mudou usando JSON.stringify para objetos
      const currentStr = JSON.stringify(currentOpeningHours);
      const newStr = JSON.stringify(openingHoursWithBreak);
      
      if (currentStr === newStr) {
        return prev;
      }
      
      return {
        ...prev,
        opening_hours: openingHoursWithBreak,
      };
    });
  }, [breakTime, openingHours]);

  // ═══════════════════════════════════════════════════════════════════════
  // MUTATIONS
  // ═══════════════════════════════════════════════════════════════════════
  
  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<SalonConfig>) => {
      const res = await apiRequest('PUT', '/api/provider/config', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/config"] });
      toast({ title: "Configuração salva com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar configuração", variant: "destructive" });
    },
  });

  const createServiceMutation = useMutation({
    mutationFn: async (data: typeof serviceForm) => {
      const res = await apiRequest('POST', '/api/provider/services', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      setIsServiceModalOpen(false);
      resetServiceForm();
      toast({ title: "Serviço criado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao criar serviço", variant: "destructive" });
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof serviceForm }) => {
      const res = await apiRequest('PUT', `/api/provider/services/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      setIsServiceModalOpen(false);
      setEditingService(null);
      resetServiceForm();
      toast({ title: "Serviço atualizado!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar serviço", variant: "destructive" });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/provider/services/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({ title: "Serviço removido!" });
    },
    onError: () => {
      toast({ title: "Erro ao remover serviço", variant: "destructive" });
    },
  });

  const createProfessionalMutation = useMutation({
    mutationFn: async (data: typeof professionalForm) => {
      const res = await apiRequest('POST', '/api/provider/professionals', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/professionals"] });
      setIsProfessionalModalOpen(false);
      resetProfessionalForm();
      toast({ title: "Profissional adicionado!" });
    },
    onError: () => {
      toast({ title: "Erro ao adicionar profissional", variant: "destructive" });
    },
  });

  const updateProfessionalMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof professionalForm }) => {
      const res = await apiRequest('PUT', `/api/provider/professionals/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/professionals"] });
      setIsProfessionalModalOpen(false);
      setEditingProfessional(null);
      resetProfessionalForm();
      toast({ title: "Profissional atualizado!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar profissional", variant: "destructive" });
    },
  });

  const deleteProfessionalMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/provider/professionals/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/professionals"] });
      toast({ title: "Profissional removido!" });
    },
    onError: () => {
      toast({ title: "Erro ao remover profissional", variant: "destructive" });
    },
  });

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════
  
  const resetServiceForm = () => {
    setServiceForm({
      name: '',
      description: '',
      duration_minutes: 30,
      price: '',
      is_active: true,
      color: '#6366f1',
    });
  };

  const resetProfessionalForm = () => {
    setProfessionalForm({
      name: '',
      bio: '',
      avatar_url: '',
      is_active: true,
    });
  };

  const openEditServiceModal = (service: SalonService) => {
    setEditingService(service);
    setServiceForm({
      name: service.name,
      description: service.description || '',
      duration_minutes: service.duration_minutes,
      price: service.price?.toString() || '',
      is_active: service.is_active,
      color: service.color || '#6366f1',
    });
    setIsServiceModalOpen(true);
  };

  const openEditProfessionalModal = (prof: SalonProfessional) => {
    setEditingProfessional(prof);
    setProfessionalForm({
      name: prof.name,
      bio: prof.bio || '',
      avatar_url: prof.avatar_url || '',
      is_active: prof.is_active,
    });
    setIsProfessionalModalOpen(true);
  };

  const handleSaveConfig = () => {
    // Garantir que estamos usando os estados mais atuais
    const openingHoursWithBreak: any = breakTime.enabled
      ? { ...openingHours, __break: breakTime }
      : { ...openingHours, __break: { enabled: false, start: '12:00', end: '13:00' } };

    const updateData = {
      ...configForm,
      auto_confirm: !(configForm.require_confirmation ?? true),
      reminder_times: Array.isArray(configForm.reminder_times) && configForm.reminder_times.length > 0
        ? [...configForm.reminder_times].map((value) => Number(value) || 1).sort((a, b) => b - a)
        : [configForm.reminder_hours_before || 24],
      reminder_hours_before: Array.isArray(configForm.reminder_times) && configForm.reminder_times.length > 0
        ? Math.max(...configForm.reminder_times.map((value) => Number(value) || 1))
        : (configForm.reminder_hours_before || 24),
      opening_hours: openingHoursWithBreak,
    };
    
    console.log('[Salon] Salvando config:', updateData);
    updateConfigMutation.mutate(updateData);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    
    if (deleteTarget.type === 'service') {
      deleteServiceMutation.mutate(deleteTarget.id);
    } else {
      deleteProfessionalMutation.mutate(deleteTarget.id);
    }
    
    setIsDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  const filteredServices = services?.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredProfessionals = professionals?.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const dayNames: Record<string, string> = {
    monday: 'Segunda-feira',
    tuesday: 'Terça-feira',
    wednesday: 'Quarta-feira',
    thursday: 'Quinta-feira',
    friday: 'Sexta-feira',
    saturday: 'Sábado',
    sunday: 'Domingo',
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 py-6 pb-28 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Scissors className="h-8 w-8" />
            Prestador de Serviço
          </h1>
          <p className="text-muted-foreground">
            Configure seu sistema de agendamentos para atendimento e visitas
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2">
            <Label htmlFor="salon-active">Ativar Prestador</Label>
            <Switch
              id="salon-active"
              checked={configForm.is_active}
              onCheckedChange={(checked) => {
                setConfigForm({ ...configForm, is_active: checked });
                updateConfigMutation.mutate({ is_active: checked });
              }}
            />
          </div>
          {configForm.is_active && (
            <Badge variant="default" className="bg-green-500">
              <span className="mr-1">●</span> Ativo
            </Badge>
          )}
        </div>
      </div>

      <Card className="border-dashed bg-muted/30">
        <CardContent className="flex flex-col gap-4 pt-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Agenda integrada ao proprio menu do prestador</span>
              <Badge variant={config?.google_calendar_connected ? "default" : "secondary"}>
                {config?.google_calendar_enabled
                  ? (config?.google_calendar_connected ? "Google conectado" : "Google habilitado sem conexao")
                  : "Google opcional"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Os agendamentos manuais, a operacao do dia e a configuracao da IA agora ficam todos dentro deste mesmo painel. O Google/Maton continua opcional.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setActiveTab("agendamentos")}>
            Ir para Agendamentos
          </Button>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 sm:grid-cols-3 lg:w-auto lg:inline-flex">
          <TabsTrigger value="agendamentos" className="flex min-h-12 items-center justify-start gap-2 rounded-lg border bg-background px-3 py-2 text-left sm:justify-center">
            <Calendar className="h-4 w-4" />
            <span className="text-xs leading-tight sm:text-sm">Agendamentos</span>
          </TabsTrigger>
          <TabsTrigger value="servicos" className="flex min-h-12 items-center justify-start gap-2 rounded-lg border bg-background px-3 py-2 text-left sm:justify-center">
            <Scissors className="h-4 w-4" />
            <span className="text-xs leading-tight sm:text-sm">Servicos</span>
          </TabsTrigger>
          <TabsTrigger value="profissionais" className="flex min-h-12 items-center justify-start gap-2 rounded-lg border bg-background px-3 py-2 text-left sm:justify-center">
            <Users className="h-4 w-4" />
            <span className="text-xs leading-tight sm:text-sm">Profissionais</span>
          </TabsTrigger>
          <TabsTrigger value="horarios" className="flex min-h-12 items-center justify-start gap-2 rounded-lg border bg-background px-3 py-2 text-left sm:justify-center">
            <Clock className="h-4 w-4" />
            <span className="text-xs leading-tight sm:text-sm">Horarios</span>
          </TabsTrigger>
          <TabsTrigger value="ia" className="flex min-h-12 items-center justify-start gap-2 rounded-lg border bg-background px-3 py-2 text-left sm:justify-center">
            <Bot className="h-4 w-4" />
            <span className="text-xs leading-tight sm:hidden">IA</span>
            <span className="hidden text-sm leading-tight sm:inline">IA & Mensagens</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agendamentos" className="space-y-4">
          <ProviderAppointmentsPanel embedded />
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB: SERVIÇOS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="servicos" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Serviços</CardTitle>
                <CardDescription>Gerencie os servicos do prestador</CardDescription>
              </div>
              <Button onClick={() => { resetServiceForm(); setEditingService(null); setIsServiceModalOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Serviço
              </Button>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Buscar serviço..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingServices ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : filteredServices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Nenhum serviço cadastrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredServices.map((service) => (
                      <TableRow key={service.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: service.color || '#6366f1' }}
                            />
                            <div>
                              <p className="font-medium">{service.name}</p>
                              {service.description && (
                                <p className="text-sm text-muted-foreground">{service.description}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{service.duration_minutes}min</TableCell>
                        <TableCell>
                          {service.price ? `R$ ${Number(service.price).toFixed(2).replace('.', ',')}` : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={service.is_active ? "default" : "secondary"}>
                            {service.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEditServiceModal(service)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => { setDeleteTarget({ type: 'service', id: service.id }); setIsDeleteDialogOpen(true); }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB: PROFISSIONAIS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="profissionais" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Profissionais</CardTitle>
                <CardDescription>Gerencie os profissionais do prestador</CardDescription>
              </div>
              <Button onClick={() => { resetProfessionalForm(); setEditingProfessional(null); setIsProfessionalModalOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Profissional
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoadingProfessionals ? (
                  <div className="col-span-full flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : filteredProfessionals.length === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground py-8">
                    Nenhum profissional cadastrado
                  </div>
                ) : (
                  filteredProfessionals.map((prof) => (
                    <Card key={prof.id} className="relative">
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                            {prof.avatar_url ? (
                              <img src={prof.avatar_url} alt={prof.name} className="w-full h-full object-cover" />
                            ) : (
                              <User className="h-8 w-8 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold">{prof.name}</h3>
                            {prof.bio && <p className="text-sm text-muted-foreground">{prof.bio}</p>}
                            <Badge variant={prof.is_active ? "default" : "secondary"} className="mt-2">
                              {prof.is_active ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                          <Button variant="outline" size="sm" onClick={() => openEditProfessionalModal(prof)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => { setDeleteTarget({ type: 'professional', id: prof.id }); setIsDeleteDialogOpen(true); }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB: HORÁRIOS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="horarios" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Horários de Funcionamento
              </CardTitle>
              <CardDescription>Configure os horarios de atendimento do prestador</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(openingHours).map(([day, hours]) => (
                <div key={day} className="flex items-center gap-4 py-2 border-b">
                  <div className="w-32">
                    <Label className="font-medium">{dayNames[day]}</Label>
                  </div>
                  <Switch
                    checked={hours.enabled}
                    onCheckedChange={(checked) => {
                      setOpeningHours({
                        ...openingHours,
                        [day]: { ...hours, enabled: checked }
                      });
                    }}
                  />
                  {hours.enabled && (
                    <>
                      <Input
                        type="time"
                        value={hours.open}
                        onChange={(e) => {
                          setOpeningHours({
                            ...openingHours,
                            [day]: { ...hours, open: e.target.value }
                          });
                        }}
                        className="w-32"
                      />
                      <span>até</span>
                      <Input
                        type="time"
                        value={hours.close}
                        onChange={(e) => {
                          setOpeningHours({
                            ...openingHours,
                            [day]: { ...hours, close: e.target.value }
                          });
                        }}
                        className="w-32"
                      />
                    </>
                  )}
                  {!hours.enabled && (
                    <span className="text-muted-foreground">Fechado</span>
                  )}
                </div>
              ))}
              
              <div className="pt-4 space-y-4">
                <h4 className="font-medium">Configurações de Agenda</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Duração padrão do serviço (min)</Label>
                    <Input
                      type="number"
                      value={configForm.slot_duration}
                      onChange={(e) => setConfigForm({ ...configForm, slot_duration: parseInt(e.target.value) || 30 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Intervalo entre atendimentos (min)</Label>
                    <Input
                      type="number"
                      value={configForm.buffer_between}
                      onChange={(e) => setConfigForm({ ...configForm, buffer_between: parseInt(e.target.value) || 10 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Máximo de dias para agendar</Label>
                    <Input
                      type="number"
                      value={configForm.max_advance_days}
                      onChange={(e) => setConfigForm({ ...configForm, max_advance_days: parseInt(e.target.value) || 30 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Antecedência mínima (minutos)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={configForm.min_notice_minutes ?? 0}
                      onChange={(e) => setConfigForm({ ...configForm, min_notice_minutes: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-muted-foreground">
                      0 = permite agendar a qualquer momento (inclusive imediatamente)
                    </p>
                  </div>
                </div>

                {/* NOVO: Configuração de horário de almoço */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium mb-3">Horário de Almoço (Intervalo Global)</h4>
                  <div className="flex items-center gap-4 mb-3">
                    <Switch
                      checked={breakTime.enabled}
                      onCheckedChange={(checked) => setBreakTime({ ...breakTime, enabled: checked })}
                    />
                    <Label>Ativar bloqueio de almoço</Label>
                  </div>
                  {breakTime.enabled && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">Das</span>
                      <Input
                        type="time"
                        value={breakTime.start}
                        onChange={(e) => setBreakTime({ ...breakTime, start: e.target.value })}
                        className="w-28"
                      />
                      <span className="text-sm text-muted-foreground">até</span>
                      <Input
                        type="time"
                        value={breakTime.end}
                        onChange={(e) => setBreakTime({ ...breakTime, end: e.target.value })}
                        className="w-28"
                      />
                      <span className="text-xs text-muted-foreground">
                        (nenhum agendamento será permitido neste intervalo)
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-4">
                  <Switch
                    checked={configForm.allow_cancellation}
                    onCheckedChange={(checked) => setConfigForm({ ...configForm, allow_cancellation: checked })}
                  />
                  <Label>Permitir cancelamento pelo cliente</Label>
                </div>
              </div>
              
              <Button onClick={handleSaveConfig} disabled={updateConfigMutation.isPending}>
                {updateConfigMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Horários
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB: IA & MENSAGENS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="ia" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Configurações da IA
              </CardTitle>
              <CardDescription>Personalize como a IA interage com seus clientes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Humanização */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Humanização
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={configForm.humanize_responses}
                      onCheckedChange={(checked) => setConfigForm({ ...configForm, humanize_responses: checked })}
                    />
                    <Label>Humanizar respostas</Label>
                  </div>
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={configForm.use_customer_name}
                      onCheckedChange={(checked) => setConfigForm({ ...configForm, use_customer_name: checked })}
                    />
                    <Label>Usar nome do cliente</Label>
                  </div>
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={configForm.response_variation}
                      onCheckedChange={(checked) => setConfigForm({ ...configForm, response_variation: checked })}
                    />
                    <Label>Variação nas respostas</Label>
                  </div>
                </div>
              </div>

              {/* Instruções da IA */}
              <div className="space-y-2">
                <Label>Instruções para a IA</Label>
                <Textarea
                  value={configForm.ai_instructions}
                  onChange={(e) => setConfigForm({ ...configForm, ai_instructions: e.target.value })}
                  placeholder="Ex: Seja sempre simpático e profissional. Ofereça os serviços de cabelo primeiro..."
                  rows={4}
                />
                <p className="text-sm text-muted-foreground">
                  Instruções adicionais para personalizar o comportamento da IA
                </p>
              </div>

              {/* Mensagens personalizadas */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Mensagens Personalizadas
                </h4>
                <p className="text-sm text-muted-foreground">
                  Variáveis disponíveis: {'{cliente_nome}'}, {'{data}'}, {'{horario}'}, {'{servico}'}, {'{profissional}'}
                </p>
                
                <div className="space-y-2">
                  <Label>Mensagem de boas-vindas</Label>
                  <Textarea
                    value={configForm.welcome_message}
                    onChange={(e) => setConfigForm({ ...configForm, welcome_message: e.target.value })}
                    rows={2}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Confirmação de agendamento</Label>
                  <Textarea
                    value={configForm.booking_confirmation_message}
                    onChange={(e) => setConfigForm({ ...configForm, booking_confirmation_message: e.target.value })}
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Lembrete</Label>
                  <Textarea
                    value={configForm.reminder_message}
                    onChange={(e) => setConfigForm({ ...configForm, reminder_message: e.target.value })}
                    rows={2}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Cancelamento</Label>
                  <Textarea
                    value={configForm.cancellation_message}
                    onChange={(e) => setConfigForm({ ...configForm, cancellation_message: e.target.value })}
                    rows={2}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Prestador indisponivel</Label>
                  <Textarea
                    value={configForm.closed_message}
                    onChange={(e) => setConfigForm({ ...configForm, closed_message: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="space-y-1">
                  <Label>Estrategia de oferta de horarios</Label>
                  <p className="text-sm text-muted-foreground">
                    O prestador sempre consulta a agenda real antes de sugerir um horario.
                  </p>
                </div>
                <Select
                  value={configForm.slot_suggestion_mode || 'first_available'}
                  onValueChange={(value: "first_available" | "ask_preference") => setConfigForm({ ...configForm, slot_suggestion_mode: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first_available">Sempre indicar o primeiro horario real</SelectItem>
                    <SelectItem value="ask_preference">Pedir preferencia antes de sugerir</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Exigir confirmacao manual</Label>
                    <p className="text-sm text-muted-foreground">Sem isso, o agendamento ja nasce confirmado.</p>
                  </div>
                  <Switch
                    checked={configForm.require_confirmation ?? true}
                    onCheckedChange={(checked) => setConfigForm({ ...configForm, require_confirmation: checked, auto_confirm: !checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enviar lembrete</Label>
                    <p className="text-sm text-muted-foreground">A IA envia lembretes naturais via WhatsApp antes do atendimento.</p>
                  </div>
                  <Switch
                    checked={configForm.send_reminder ?? true}
                    onCheckedChange={(checked) => setConfigForm({ ...configForm, send_reminder: checked })}
                  />
                </div>
                {(configForm.send_reminder ?? true) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Horarios de lembrete (horas antes)</Label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const times = [...(configForm.reminder_times || [24])];
                          const suggestions = [1, 2, 3, 4, 6, 12, 24, 48, 72];
                          const nextTime = suggestions.find((suggestion) => !times.includes(suggestion)) || 1;
                          times.push(nextTime);
                          times.sort((a, b) => b - a);
                          setConfigForm({
                            ...configForm,
                            reminder_times: times,
                            reminder_hours_before: Math.max(...times),
                          });
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar lembrete
                      </Button>
                    </div>
                    {(configForm.reminder_times || [24]).map((time, index) => (
                      <div key={`${time}-${index}`} className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={168}
                          value={time}
                          onChange={(e) => {
                            const times = [...(configForm.reminder_times || [24])];
                            times[index] = parseInt(e.target.value, 10) || 1;
                            times.sort((a, b) => b - a);
                            setConfigForm({
                              ...configForm,
                              reminder_times: times,
                              reminder_hours_before: Math.max(...times),
                            });
                          }}
                          className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">horas antes</span>
                        {(configForm.reminder_times || [24]).length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const times = (configForm.reminder_times || [24]).filter((_, itemIndex) => itemIndex !== index);
                              setConfigForm({
                                ...configForm,
                                reminder_times: times,
                                reminder_hours_before: Math.max(...times),
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Notificador de novos agendamentos</Label>
                    <p className="text-sm text-muted-foreground">Envia um WhatsApp operacional sempre que um novo agendamento for criado.</p>
                  </div>
                  <Switch
                    checked={configForm.booking_notification_enabled ?? false}
                    onCheckedChange={(checked) => setConfigForm({ ...configForm, booking_notification_enabled: checked })}
                  />
                </div>
                {(configForm.booking_notification_enabled ?? false) && (
                  <div className="space-y-2">
                    <Label>Numero do notificador</Label>
                    <Input
                      value={configForm.booking_notification_phone || ''}
                      onChange={(e) => setConfigForm({ ...configForm, booking_notification_phone: e.target.value })}
                      placeholder="5543999999999"
                    />
                  </div>
                )}
              </div>

              <Button onClick={handleSaveConfig} disabled={updateConfigMutation.isPending}>
                {updateConfigMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Configurações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: SERVIÇO */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={isServiceModalOpen} onOpenChange={setIsServiceModalOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingService ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle>
            <DialogDescription>
              {editingService ? 'Edite os dados do serviço' : 'Adicione um novo servico ao prestador'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do serviço *</Label>
              <Input
                value={serviceForm.name}
                onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                placeholder="Ex: Corte feminino"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={serviceForm.description}
                onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                placeholder="Descrição opcional do serviço"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Duração (minutos) *</Label>
                <Input
                  type="number"
                  value={serviceForm.duration_minutes}
                  onChange={(e) => setServiceForm({ ...serviceForm, duration_minutes: parseInt(e.target.value) || 30 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Preço (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={serviceForm.price}
                  onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={serviceForm.color}
                    onChange={(e) => setServiceForm({ ...serviceForm, color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">{serviceForm.color}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 sm:pt-6">
                <Switch
                  checked={serviceForm.is_active}
                  onCheckedChange={(checked) => setServiceForm({ ...serviceForm, is_active: checked })}
                />
                <Label>Serviço ativo</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsServiceModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editingService) {
                  updateServiceMutation.mutate({ id: editingService.id, data: serviceForm });
                } else {
                  createServiceMutation.mutate(serviceForm);
                }
              }}
              disabled={!serviceForm.name || createServiceMutation.isPending || updateServiceMutation.isPending}
            >
              {(createServiceMutation.isPending || updateServiceMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingService ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: PROFISSIONAL */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={isProfessionalModalOpen} onOpenChange={setIsProfessionalModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProfessional ? 'Editar Profissional' : 'Novo Profissional'}</DialogTitle>
            <DialogDescription>
              {editingProfessional ? 'Edite os dados do profissional' : 'Adicione um novo profissional ao prestador'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={professionalForm.name}
                onChange={(e) => setProfessionalForm({ ...professionalForm, name: e.target.value })}
                placeholder="Ex: Maria Silva"
              />
            </div>
            <div className="space-y-2">
              <Label>Bio / Especialidades</Label>
              <Textarea
                value={professionalForm.bio}
                onChange={(e) => setProfessionalForm({ ...professionalForm, bio: e.target.value })}
                placeholder="Ex: Especialista em coloração e mechas"
              />
            </div>
            <div className="space-y-2">
              <Label>URL da foto (opcional)</Label>
              <Input
                value={professionalForm.avatar_url}
                onChange={(e) => setProfessionalForm({ ...professionalForm, avatar_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="flex items-center gap-4">
              <Switch
                checked={professionalForm.is_active}
                onCheckedChange={(checked) => setProfessionalForm({ ...professionalForm, is_active: checked })}
              />
              <Label>Profissional ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProfessionalModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editingProfessional) {
                  updateProfessionalMutation.mutate({ id: editingProfessional.id, data: professionalForm });
                } else {
                  createProfessionalMutation.mutate(professionalForm);
                }
              }}
              disabled={!professionalForm.name || createProfessionalMutation.isPending || updateProfessionalMutation.isPending}
            >
              {(createProfessionalMutation.isPending || updateProfessionalMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingProfessional ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DIALOG: CONFIRMAR EXCLUSÃO */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este {deleteTarget?.type === 'service' ? 'serviço' : 'profissional'}?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
