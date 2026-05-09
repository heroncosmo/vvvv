import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ContextualHelpButton } from "@/components/contextual-help-button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ContactImportModal } from "@/components/contact-import-modal";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Send, 
  Users, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  FileText,
  Phone,
  RefreshCw,
  AlertCircle,
  Loader2,
  Sparkles,
  Clock,
  Shield,
  Search,
  Eye,
  History,
  BarChart3,
  MessageSquare,
  Zap,
  ChevronRight,
  UserCheck,
  List,
  BookUser,
  Import,
  HelpCircle,
  CheckCheck,
  ChevronDown,
  Timer,
  Calendar,
  ChevronLeft,
  ArrowLeft,
  UsersRound,
  Image,
  Video,
  Mic,
  File,
  Upload,
  X
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLocation } from "wouter";

interface Contact {
  id: string;
  name: string;
  phone: string;
  selected?: boolean;
  hasReplied?: boolean;
  lastMessage?: string;
  tags?: string[];
}

interface WhatsAppGroup {
  id: string;
  name: string;
  participantsCount: number;
  description?: string;
  owner?: string;
  createdAt?: number;
  isAdmin?: boolean;
  connectionId?: string;
  connectionName?: string | null;
  connectionPhoneNumber?: string | null;
  connectionOwner?: string;
}

interface WhatsAppConnectionOption {
  id: string;
  connectionName?: string | null;
  connectionType?: string | null;
  phoneNumber?: string | null;
  isConnected: boolean;
  isRecovering?: boolean;
  isPrimary?: boolean | null;
  providerStatus?: string | null;
}

interface ContactList {
  id: string;
  name: string;
  description: string;
  contacts: Contact[];
  createdAt: string;
}

interface SendProgress {
  total: number;
  sent: number;
  failed: number;
  status: 'idle' | 'running' | 'paused' | 'scheduled' | 'completed' | 'error' | 'cancelled';
  currentPhone?: string;
  estimatedTime?: number;
}

interface CampaignHistory {
  id: string;
  name: string;
  message?: string;
  sentCount?: number;
  failedCount?: number;
  totalSent?: number;    // Backend pode enviar nesse formato
  totalFailed?: number;  // Backend pode enviar nesse formato
  sent_count?: number;   // snake_case DB field
  failed_count?: number; // snake_case DB field
  total_contacts?: number; // snake_case DB field
  createdAt?: string;
  scheduledAt?: string;
  errorMessage?: string;
  useAi?: boolean;
  use_ai?: boolean;
  executedAt?: string;
  completed_at?: string; // snake_case DB field
  started_at?: string;   // snake_case DB field
  status: string;
  recipients?: string[];
  recipientNames?: Record<string, string>;
  delayProfile?: string;
  useAiVariation?: boolean;
  results?: {
    sent?: { contactId?: string; phone: string; name?: string; timestamp: string; message?: string }[];
    failed?: { contactId?: string; phone: string; name?: string; error: string; timestamp: string; message?: string }[];
    pending?: { contactId?: string; phone: string; name?: string; retrying?: { error?: string; retryAt?: string | null; retryAttempt?: number } | null }[];
  };
}

const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const GROUP_CONNECTION_ALL_VALUE = "__all_connections__";
const BRAZIL_UTC_OFFSET = "-03:00";
const BROADCAST_DELAY_MIN_MS = 60_000;
const BROADCAST_DELAY_MAX_MS = 300_000;
const BROADCAST_BATCH_SIZE = 10;
const BROADCAST_BATCH_PAUSE_MAX_MS = 1_200_000;

function getBrazilDateInputValue(reference: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const byType = new Map(formatter.formatToParts(reference).map((part) => [part.type, part.value]));

  return `${byType.get("year") || "0000"}-${byType.get("month") || "00"}-${byType.get("day") || "00"}`;
}

function buildBrazilScheduledAt(date: string, time: string) {
  const normalizedDate = String(date || "").trim();
  const normalizedTime = String(time || "").trim();

  if (!normalizedDate || !normalizedTime) {
    return undefined;
  }

  const timeWithSeconds = normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime;
  return `${normalizedDate}T${timeWithSeconds}${BRAZIL_UTC_OFFSET}`;
}

function formatCampaignDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
  });
}

function formatCampaignDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
  });
}

type AffiliateCampaignDraft = {
  source: "affiliate-program";
  campaignName: string;
  messageTemplate: string;
  createdAt: string;
};

function mapCampaignStatusToProgress(status?: string): SendProgress["status"] {
  if (status === "completed") {
    return "completed";
  }
  if (status === "error") {
    return "error";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  if (status === "scheduled") {
    return "scheduled";
  }
  if (status === "running") {
    return "running";
  }

  return status === "pending" ? "paused" : "idle";
}

function getCampaignStatusLabel(status?: string) {
  if (status === "completed") {
    return "Concluída";
  }
  if (status === "running") {
    return "Em andamento";
  }
  if (status === "pending") {
    return "Aguardando retomada";
  }
  if (status === "scheduled") {
    return "Agendada";
  }
  if (status === "error") {
    return "Erro";
  }
  if (status === "cancelled") {
    return "Cancelada";
  }

  return status || "Aguardando";
}

function getCampaignStatusBadgeClass(status?: string) {
  if (status === "completed") {
    return "bg-green-100 text-green-800 border-green-200";
  }
  if (status === "running") {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }
  if (status === "pending") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  if (status === "scheduled") {
    return "bg-violet-100 text-violet-800 border-violet-200";
  }
  if (status === "error") {
    return "bg-red-100 text-red-800 border-red-200";
  }
  if (status === "cancelled") {
    return "bg-orange-100 text-orange-800 border-orange-200";
  }

  return "bg-gray-100 text-gray-800 border-gray-200";
}

function formatBroadcastConnectionLabel(connection: WhatsAppConnectionOption) {
  const name = String(connection.connectionName || "").trim();
  const phone = String(connection.phoneNumber || "").trim();

  if (name && phone) {
    return `${name} • ${phone}`;
  }

  if (name) {
    return name;
  }

  if (phone) {
    return `Linha ${phone}`;
  }

  return `Conexão ${connection.id.slice(0, 6)}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = error => reject(error);
  });
}

// Componente para tooltips informativos
function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help inline ml-1" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-sm">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Step Indicator Component
function StepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center mb-6">
      {steps.map((step, index) => (
        <div key={index} className="flex items-center">
          <div className={`
            flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors
            ${index + 1 <= currentStep 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-muted text-muted-foreground'
            }
          `}>
            {index + 1 < currentStep ? <CheckCheck className="w-4 h-4" /> : index + 1}
          </div>
          <span className={`ml-2 text-sm hidden md:inline ${index + 1 <= currentStep ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            {step}
          </span>
          {index < steps.length - 1 && (
            <ChevronRight className="w-4 h-4 mx-2 md:mx-3 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function MassSendPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  // Estados do Wizard/Passo a Passo
  const [currentStep, setCurrentStep] = useState(1);
  const steps = ["Destinatários", "Mensagem", "Configurações", "Revisar"];
  
  // Estado para modo de entrada de destinatários
  const [recipientMode, setRecipientMode] = useState<'manual' | 'list' | 'synced' | 'groups'>('manual');
  
  // Estado para envio manual com nome
  const [manualContacts, setManualContacts] = useState<string>("");
  const [messageTemplate, setMessageTemplate] = useState<string>("");
  const [campaignName, setCampaignName] = useState<string>("");
  const [affiliateDraft, setAffiliateDraft] = useState<AffiliateCampaignDraft | null>(null);
  
  // Estado para mídia (imagem, vídeo, áudio, documento)
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>("");
  const [mediaType, setMediaType] = useState<'none' | 'image' | 'video' | 'audio' | 'document'>('none');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Configurações de envio
  const useAI = true;
  const [broadcastConnectionMode, setBroadcastConnectionMode] = useState<'single' | 'rotate'>('single');
  const [selectedBroadcastConnectionId, setSelectedBroadcastConnectionId] = useState("");
  const [selectedRotationConnectionIds, setSelectedRotationConnectionIds] = useState<Set<string>>(new Set());
  const [selectedGroupConnectionScope, setSelectedGroupConnectionScope] = useState(GROUP_CONNECTION_ALL_VALUE);
  const [inboundGateEnabled, setInboundGateEnabled] = useState(true);
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(true);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Estado para listas e contatos selecionados
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [selectedSyncedContacts, setSelectedSyncedContacts] = useState<Record<string, { phone: string; name: string }>>({});
  const [searchTerm, setSearchTerm] = useState("");
  // Flag para indicar se a seleção foi inicializada
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  
  // Estado para grupos selecionados
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [groupSearchTerm, setGroupSearchTerm] = useState("");
  
  // Progresso de envio
  const [sendProgress, setSendProgress] = useState<SendProgress>({
    total: 0,
    sent: 0,
    failed: 0,
    status: 'idle'
  });
  
  // Estados de diálogo
  const [showCreateListDialog, setShowCreateListDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showCampaignDetailsDialog, setShowCampaignDetailsDialog] = useState(false);
  const [selectedCampaignDetails, setSelectedCampaignDetails] = useState<CampaignHistory | null>(null);
  const [showListDetailsDialog, setShowListDetailsDialog] = useState(false);
  const [selectedListDetails, setSelectedListDetails] = useState<ContactList | null>(null);
  const [listSearchTerm, setListSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importDestination, setImportDestination] = useState<'mass-send' | 'contact-list'>('mass-send');
  const [listPage, setListPage] = useState(1);
  const listsPerPage = 5;
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");

  useEffect(() => {
    const rawDraft = localStorage.getItem("affiliate_campaign_draft");
    if (!rawDraft) {
      return;
    }

    try {
      const parsed = JSON.parse(rawDraft) as AffiliateCampaignDraft;
      if (parsed?.source === "affiliate-program") {
        setAffiliateDraft(parsed);
        setCampaignName(parsed.campaignName || "");
        setMessageTemplate(parsed.messageTemplate || "");
        toast({
          title: "Campanha de indicação carregada",
          description: "A mensagem pronta foi aplicada para você revisar e enviar.",
        });
      }
    } catch {
      localStorage.removeItem("affiliate_campaign_draft");
    }
  }, [toast]);

  // Estados de agendamento
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  
  // Sincronização
  const [syncProgress, setSyncProgress] = useState<{ syncing: boolean; count: number }>({ syncing: false, count: 0 });
  
  // Estado para carregamento de grupos
  const [groupsLoading, setGroupsLoading] = useState(false);
  
  // Buscar conexão WhatsApp
  const { data: connection } = useQuery<{ id?: string; isConnected: boolean } | null>({
    queryKey: ["/api/whatsapp/connection"],
  });

  const { data: whatsappConnections = [] } = useQuery<WhatsAppConnectionOption[]>({
    queryKey: ["/api/whatsapp/connections"],
    retry: false,
  });

  const connectedBroadcastConnections = useMemo(
    () => whatsappConnections.filter((item) => item.isConnected),
    [whatsappConnections],
  );

  const selectedBroadcastConnection = useMemo(
    () => connectedBroadcastConnections.find((item) => item.id === selectedBroadcastConnectionId) || null,
    [connectedBroadcastConnections, selectedBroadcastConnectionId],
  );

  const selectedRotationConnections = useMemo(
    () => connectedBroadcastConnections.filter((item) => selectedRotationConnectionIds.has(item.id)),
    [connectedBroadcastConnections, selectedRotationConnectionIds],
  );

  const activeGroupsConnectionId = useMemo(
    () => (selectedGroupConnectionScope === GROUP_CONNECTION_ALL_VALUE ? "" : selectedGroupConnectionScope),
    [selectedGroupConnectionScope],
  );

  useEffect(() => {
    if (connectedBroadcastConnections.length === 0) {
      setSelectedBroadcastConnectionId("");
      setSelectedRotationConnectionIds(new Set());
      setSelectedGroupConnectionScope(GROUP_CONNECTION_ALL_VALUE);
      return;
    }

    if (!selectedBroadcastConnectionId || !connectedBroadcastConnections.some((item) => item.id === selectedBroadcastConnectionId)) {
      setSelectedBroadcastConnectionId(connectedBroadcastConnections[0].id);
    }
  }, [connectedBroadcastConnections, selectedBroadcastConnectionId]);

  useEffect(() => {
    if (
      selectedGroupConnectionScope !== GROUP_CONNECTION_ALL_VALUE &&
      !connectedBroadcastConnections.some((item) => item.id === selectedGroupConnectionScope)
    ) {
      setSelectedGroupConnectionScope(GROUP_CONNECTION_ALL_VALUE);
    }
  }, [connectedBroadcastConnections, selectedGroupConnectionScope]);

  useEffect(() => {
    if (broadcastConnectionMode !== "rotate") {
      return;
    }

    setSelectedRotationConnectionIds((current) => {
      const connectedIds = connectedBroadcastConnections.map((item) => item.id);
      const filtered = new Set(Array.from(current).filter((connectionId) => connectedIds.includes(connectionId)));

      if (filtered.size > 0) {
        return filtered;
      }

      return new Set(connectedIds);
    });
  }, [broadcastConnectionMode, connectedBroadcastConnections]);

  useEffect(() => {
    if (recipientMode !== "groups") {
      return;
    }

    setBroadcastConnectionMode("single");
    setSelectedGroupIds(new Set());
    setGroupSearchTerm("");
  }, [activeGroupsConnectionId, recipientMode]);

  // Buscar listas de contatos
  const { data: contactLists = [], isLoading: listsLoading, refetch: refetchLists } = useQuery<ContactList[]>({
    queryKey: ["/api/contacts/lists"],
  });

  // Buscar contagem de contatos sincronizados (apenas que já responderam)
  const { data: syncedContactsCount = { total: 0 } } = useQuery<{ total: number }>({
    queryKey: ["/api/contacts/synced/count"],
  });

  // Estados para paginação e busca no modo synced
  const [syncedPage, setSyncedPage] = useState(1);
  const [syncedSearch, setSyncedSearch] = useState("");
  const [debouncedSyncedSearch, setDebouncedSyncedSearch] = useState("");

  // Debounce para busca sínced (400ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSyncedSearch(syncedSearch), 400);
    return () => clearTimeout(timer);
  }, [syncedSearch]);

  // Reset page ao mudar busca sínced
  useEffect(() => {
    setSyncedPage(1);
  }, [debouncedSyncedSearch]);

  // Query lazy de contatos paginados para quando modo synced estiver ativo
  const { data: syncedContactsData } = useQuery<{
    contacts: Contact[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: ["/api/contacts/synced", syncedPage, debouncedSyncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(syncedPage), limit: '50' });
      if (debouncedSyncedSearch) params.set('search', debouncedSyncedSearch);
      const res = await apiRequest('GET', `/api/contacts/synced?${params}`);
      return res.json();
    },
    enabled: recipientMode === 'synced',
    retry: false,
  });

  const syncedContacts = syncedContactsData?.contacts || [];

  // Buscar grupos do WhatsApp
  const groupsQueryEnabled = recipientMode === 'groups' && connectedBroadcastConnections.length > 0;
  const groupsQueryScope = useMemo(
    () => selectedGroupConnectionScope,
    [selectedGroupConnectionScope],
  );

  const {
    data: whatsappGroups = [],
    isLoading: groupsQueryLoading,
    error: groupsQueryError,
    isError: groupsQueryHasError,
    refetch: refetchGroups,
  } = useQuery<WhatsAppGroup[]>({
    queryKey: ["/api/whatsapp/groups", groupsQueryScope],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeGroupsConnectionId) {
        params.set("connectionId", activeGroupsConnectionId);
      }
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const response = await apiRequest("GET", `/api/whatsapp/groups${suffix}`);
      return response.json();
    },
    retry: false,
    enabled: groupsQueryEnabled,
  });

  // Buscar histórico de campanhas
  const { data: campaignHistory = [] } = useQuery<CampaignHistory[]>({
    queryKey: ["/api/campaigns"],
    retry: false,
  });

  // Iniciar polling com setInterval
  const startPolling = (campaignId: string, total: number) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    localStorage.setItem('activeCampaignId', campaignId);
    setActiveCampaignId(campaignId);

    const intervalId = setInterval(async () => {
      try {
        const response = await apiRequest("GET", `/api/campaigns/${campaignId}`);
        const campaign = await response.json();
        if (campaign) {
          const sent = campaign.sent_count ?? campaign.totalSent ?? 0;
          const failed = campaign.failed_count ?? campaign.totalFailed ?? 0;
          const totalContacts = campaign.total_contacts ?? campaign.totalContacts ?? total;
          const progressStatus = mapCampaignStatusToProgress(campaign.status);
          setSendProgress({
            total: totalContacts,
            sent,
            failed,
            status: progressStatus,
          });
          setIsSending(campaign.status === 'running' || campaign.status === 'pending');
          if (['completed', 'error', 'cancelled'].includes(campaign.status)) {
            clearInterval(intervalId);
            pollingIntervalRef.current = null;
            localStorage.removeItem('activeCampaignId');
            setActiveCampaignId(null);
            setIsSending(false);
            queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
            if (campaign.status === 'completed') {
              toast({
                title: "Envio concluído!",
                description: `${sent} mensagens enviadas${failed > 0 ? `, ${failed} falharam` : ''}.`,
              });
            } else if (campaign.status === 'cancelled') {
              toast({
                title: "Envio cancelado",
                description: "A campanha foi cancelada pelo servidor.",
              });
            } else if (campaign.status === 'error') {
              toast({
                title: "Erro no envio",
                description: campaign.errorMessage || "Ocorreu um erro durante o envio.",
                variant: "destructive",
              });
            }
          }
        }
      } catch (error) {
        console.error('Erro ao verificar progresso:', error);
      }
    }, 3000);
    pollingIntervalRef.current = intervalId;
  };

  // Retomar polling ao montar + cleanup ao desmontar
  useEffect(() => {
    const savedCampaignId = localStorage.getItem('activeCampaignId');
    if (savedCampaignId) {
      apiRequest("GET", `/api/campaigns/${savedCampaignId}`)
        .then(r => r.json())
        .then(campaign => {
          if (campaign && !['completed', 'error', 'cancelled'].includes(campaign.status)) {
            const progressStatus = mapCampaignStatusToProgress(campaign.status);
            setActiveCampaignId(savedCampaignId);
            const total = campaign.total_contacts ?? campaign.totalContacts ?? 0;
            setSendProgress({
              total,
              sent: campaign.sent_count ?? 0,
              failed: campaign.failed_count ?? 0,
              status: progressStatus,
            });
            setIsSending(campaign.status === 'running' || campaign.status === 'pending');
            startPolling(savedCampaignId, total);
          } else {
            localStorage.removeItem('activeCampaignId');
          }
        })
        .catch(() => localStorage.removeItem('activeCampaignId'));
    }
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Mutation para envio em massa
  const sendBulkMutation = useMutation({
    mutationFn: async (data: { 
      contacts: { phone: string; name?: string }[]; 
      message: string;
      useAI: boolean;
      campaignName?: string;
      scheduledAt?: string;
      connectionId?: string;
      connectionMode?: 'single' | 'rotate';
      rotationConnectionIds?: string[];
      metadata?: Record<string, any>;
    }) => {
      const response = await apiRequest("POST", "/api/campaigns", {
        contacts: data.contacts,
        messageTemplate: data.message,
        useAi: data.useAI,
        name: data.campaignName || "Campanha " + new Date().toLocaleDateString('pt-BR'),
        scheduledAt: data.scheduledAt,
        connectionId: data.connectionId,
        connectionMode: data.connectionMode,
        rotationConnectionIds: data.rotationConnectionIds,
        delayMinMs: BROADCAST_DELAY_MIN_MS,
        delayMaxMs: BROADCAST_DELAY_MAX_MS,
        batchSize: BROADCAST_BATCH_SIZE,
        batchPauseMs: BROADCAST_BATCH_PAUSE_MAX_MS,
        metadata: data.metadata,
      });
      const result = await response.json();
      return { ...result, totalContacts: data.contacts.length };
    },
    onSuccess: async (data) => {
      const campaignId = data.campaignId || data.id;
      const total = data.total || data.total_contacts || data.totalContacts || 0;
      const isScheduled = Boolean(data.scheduled);
      setSendProgress({ total, sent: 0, failed: 0, status: isScheduled ? 'scheduled' : 'running' });
      setIsSending(!isScheduled);
      toast({
        title: isScheduled ? "Envio agendado!" : "Envio iniciado!",
        description: data.message || (isScheduled ? "Campanha agendada com sucesso." : "Mensagens sendo enviadas em background."),
      });
      if (affiliateDraft) {
        await apiRequest("POST", "/api/affiliate/events", {
          type: "campaign_sent",
          meta: {
            campaignId,
            campaignName: affiliateDraft.campaignName,
            contactsTotal: total,
          },
        }).catch(() => {});
        localStorage.removeItem("affiliate_campaign_draft");
        setAffiliateDraft(null);
      }
      if (campaignId) {
        startPolling(campaignId, total);
      }
    },
    onError: (error: Error) => {
      setSendProgress(prev => ({ ...prev, status: 'error' }));
      setIsSending(false);
      toast({
        title: "Erro no envio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para envio em grupos
  const sendToGroupsMutation = useMutation({
    mutationFn: async (data: { 
      groupIds: string[]; 
      groupTargets?: Array<{ groupId: string; connectionId?: string }>;
      message: string;
      useAI: boolean;
      delayMin: number;
      delayMax: number;
      scheduledAt?: string;
      connectionId?: string;
      mediaFile?: File | null;
      mediaType?: 'none' | 'image' | 'video' | 'audio' | 'document';
      metadata?: Record<string, any>;
    }) => {
      const mediaDataUrl = data.mediaFile ? await fileToDataUrl(data.mediaFile) : "";
      const response = await apiRequest("POST", "/api/whatsapp/groups/bulk-send", { 
        groupIds: data.groupIds, 
        groupTargets: data.groupTargets,
        message: data.message,
        mediaUrl: mediaDataUrl || undefined,
        mediaType: data.mediaFile && data.mediaType && data.mediaType !== "none" ? data.mediaType : undefined,
        settings: {
          useAI: data.useAI,
          delayMin: data.delayMin,
          delayMax: data.delayMax,
        },
        scheduledAt: data.scheduledAt,
        connectionId: data.connectionId,
        metadata: data.metadata,
      });
      return response.json();
    },
    onSuccess: (data) => {
      const campaignId = data.campaignId || data.id;
      const total = data.total || 0;
      if (data.scheduled) {
        setSendProgress({ total, sent: 0, failed: 0, status: 'scheduled' });
        setIsSending(false);
        toast({
          title: "Envio agendado!",
          description: data.message,
        });
      } else {
        setSendProgress({ 
          total, 
          sent: data.sent || 0, 
          failed: data.failed || 0, 
          status: 'running'
        });
        setIsSending(true);
        toast({
          title: "Envio para grupos iniciado!",
          description: `Enviando para ${total} grupos com as regras de seguranca escolhidas.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      if (campaignId) {
        startPolling(campaignId, total);
      }
    },
    onError: (error: Error) => {
      setSendProgress(prev => ({ ...prev, status: 'error' }));
      setIsSending(false);
      toast({
        title: "Erro no envio para grupos",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para criar lista
  const createListMutation = useMutation({
    mutationFn: async ({ name, description, contacts }: { name: string; description: string; contacts?: Contact[] }) => {
      const response = await apiRequest("POST", "/api/contacts/lists", { name, description, contacts });
      return response.json();
    },
    onSuccess: () => {
      setShowCreateListDialog(false);
      setNewListName("");
      setNewListDescription("");
      refetchLists();
      toast({ title: "Lista criada!", description: "Sua nova lista de contatos foi criada." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar lista", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para sincronizar contatos
  const syncContactsMutation = useMutation({
    mutationFn: async () => {
      setSyncProgress({ syncing: true, count: 0 });
      const response = await apiRequest("POST", "/api/contacts/sync");
      return response.json();
    },
    onSuccess: (data) => {
      setSyncProgress({ syncing: false, count: data.count || 0 });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/synced"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/synced/count"] });
      toast({
        title: "Sincronização concluída!",
        description: `${data.count || 0} contatos que já conversaram foram sincronizados.`,
      });
    },
    onError: (error: Error) => {
      setSyncProgress({ syncing: false, count: 0 });
      toast({ title: "Erro na sincronização", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para envio em massa COM MÍDIA
  const sendBulkMediaMutation = useMutation({
    mutationFn: async (data: { 
      contacts: { phone: string; name?: string }[]; 
      message: string;
      mediaFile: File;
      mediaType: 'image' | 'video' | 'audio' | 'document';
      useAI: boolean;
      campaignName?: string;
      scheduledAt?: string;
      connectionId?: string;
      connectionMode?: 'single' | 'rotate';
      rotationConnectionIds?: string[];
      metadata?: Record<string, any>;
    }) => {
      const mediaDataUrl = await fileToDataUrl(data.mediaFile);
      const response = await apiRequest("POST", "/api/campaigns", {
        contacts: data.contacts,
        messageTemplate: data.message,
        useAi: data.useAI,
        name: data.campaignName || "Campanha " + new Date().toLocaleDateString('pt-BR'),
        mediaUrl: mediaDataUrl,
        mediaType: data.mediaType,
        scheduledAt: data.scheduledAt,
        connectionId: data.connectionId,
        connectionMode: data.connectionMode,
        rotationConnectionIds: data.rotationConnectionIds,
        delayMinMs: BROADCAST_DELAY_MIN_MS,
        delayMaxMs: BROADCAST_DELAY_MAX_MS,
        batchSize: BROADCAST_BATCH_SIZE,
        batchPauseMs: BROADCAST_BATCH_PAUSE_MAX_MS,
        metadata: data.metadata,
      });
      const result = await response.json();
      return { ...result, totalContacts: data.contacts.length };
    },
    onSuccess: async (data) => {
      const campaignId = data.campaignId || data.id;
      const total = data.total || data.total_contacts || data.totalContacts || 0;
      const isScheduled = Boolean(data.scheduled);
      setSendProgress({ total, sent: 0, failed: 0, status: isScheduled ? 'scheduled' : 'running' });
      setIsSending(!isScheduled);
      toast({
        title: isScheduled ? "Envio de mídia agendado!" : "Envio de mídia iniciado!",
        description: data.message || (isScheduled ? "Campanha com mídia agendada com sucesso." : "Mensagens com mídia sendo enviadas em background."),
      });
      if (affiliateDraft) {
        await apiRequest("POST", "/api/affiliate/events", {
          type: "campaign_sent",
          meta: {
            campaignId,
            campaignName: affiliateDraft.campaignName,
            contactsTotal: total,
            mediaType,
          },
        }).catch(() => {});
        localStorage.removeItem("affiliate_campaign_draft");
        setAffiliateDraft(null);
      }
      if (campaignId) {
        startPolling(campaignId, total);
      }
    },
    onError: (error: Error) => {
      setSendProgress(prev => ({ ...prev, status: 'error' }));
      setIsSending(false);
      toast({
        title: "Erro no envio de mídia",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Função para lidar com seleção de arquivo de mídia
  const handleMediaFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Verificar tamanho (max 16MB para WhatsApp)
    const maxSize = 16 * 1024 * 1024; // 16MB
    if (file.size > maxSize) {
      toast({
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 16MB.",
        variant: "destructive"
      });
      return;
    }

    // Determinar tipo de mídia
    let type: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (file.type.startsWith('image/')) {
      type = 'image';
    } else if (file.type.startsWith('video/')) {
      type = 'video';
    } else if (file.type.startsWith('audio/')) {
      type = 'audio';
    }

    setMediaFile(file);
    setMediaType(type);

    // Criar preview para imagens e vídeos
    if (type === 'image' || type === 'video') {
      const url = URL.createObjectURL(file);
      setMediaPreview(url);
    } else {
      setMediaPreview('');
    }
  };

  // Função para remover mídia
  const handleRemoveMedia = () => {
    setMediaFile(null);
    setMediaType('none');
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview);
    }
    setMediaPreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Função para abrir seletor de arquivo por tipo
  const handleSelectMediaType = (type: 'image' | 'video' | 'audio' | 'document') => {
    if (fileInputRef.current) {
      let accept = '*/*';
      switch (type) {
        case 'image':
          accept = 'image/*';
          break;
        case 'video':
          accept = 'video/*';
          break;
        case 'audio':
          accept = 'audio/*';
          break;
        case 'document':
          accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar';
          break;
      }
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  };

  // Parsear contatos do textarea (nome, número)
  const parseManualContacts = (text: string): { phone: string; name: string }[] => {
    const lines = text.split('\n').filter(line => line.trim());
    const contacts: { phone: string; name: string }[] = [];
    
    for (const line of lines) {
      // Formato: Nome, Número ou apenas Número
      const parts = line.split(/[,;\t]/).map(p => p.trim());
      
      if (parts.length >= 2) {
        // Nome e número fornecidos
        const name = parts[0];
        const phone = parts[1].replace(/\D/g, '');
        if (phone.length >= 10 && phone.length <= 15) {
          contacts.push({ name, phone });
        }
      } else if (parts.length === 1) {
        // Apenas número
        const phone = parts[0].replace(/\D/g, '');
        if (phone.length >= 10 && phone.length <= 15) {
          contacts.push({ name: '', phone });
        }
      }
    }
    
    return contacts;
  };

  // Obter contatos selecionados baseado no modo
  const getSelectedContacts = useMemo(() => {
    if (recipientMode === 'manual') {
      return parseManualContacts(manualContacts);
    } else if (recipientMode === 'list' && selectedListId) {
      const list = contactLists.find(l => l.id === selectedListId);
      if (list?.contacts) {
        const selected = list.contacts.filter(c => selectedContactIds.has(c.id));
        return selected.map(c => ({ phone: c.phone, name: c.name || '' }));
      }
    } else if (recipientMode === 'synced') {
      return Object.values(selectedSyncedContacts);
    } else if (recipientMode === 'groups') {
      // Para grupos, retornamos os grupos selecionados como "contatos" para contagem
      const selectedGroups = whatsappGroups?.filter(g => selectedGroupIds.has(g.id)) || [];
      return selectedGroups.map(g => ({ phone: g.id, name: g.name }));
    }
    return [];
  }, [recipientMode, manualContacts, selectedListId, selectedContactIds, selectedSyncedContacts, contactLists, selectedGroupIds, whatsappGroups]);

  // Aplicar variáveis na mensagem
  const applyMessageTemplate = (template: string, name: string): string => {
    return template.replace(/\[nome\]/gi, name || 'Cliente');
  };

  // Gerar preview da mensagem
  const previewMessage = useMemo(() => {
    const sample = getSelectedContacts[0] || { name: 'João', phone: '11999887766' };
    return applyMessageTemplate(messageTemplate, sample.name);
  }, [messageTemplate, getSelectedContacts]);

  // Formatar número para exibição
  const formatPhone = (phone: string): string => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 11) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    } else if (clean.length === 13) {
      return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    }
    return phone;
  };

  const normalizePhoneValue = (phone: string): string => phone.replace(/\D/g, '');

  const getCampaignResultKey = (item: any): string => {
    const id = String(item?.contactId || item?.id || '').trim();
    const phone = normalizePhoneValue(String(item?.phone || ''));
    return id || phone;
  };

  const normalizeCampaignDetails = (campaign: CampaignHistory, detail: any): CampaignHistory => {
    const contacts = Array.isArray(detail?.contactsJson)
      ? detail.contactsJson
      : Array.isArray(detail?.contacts_json)
        ? detail.contacts_json
        : Array.isArray(campaign.recipients)
          ? campaign.recipients.map((phone) => ({ phone, name: campaign.recipientNames?.[phone] }))
          : [];

    const rawResults = Array.isArray(detail?.resultsJson)
      ? detail.resultsJson
      : Array.isArray(detail?.results_json)
        ? detail.results_json
        : [];

    const sent = rawResults
      .filter((result: any) => result?.status === 'sent')
      .map((result: any) => ({
        contactId: result.contactId,
        phone: result.phone,
        name: result.name,
        timestamp: result.sentAt || '',
        message: result.message || '',
      }));

    const failed = rawResults
      .filter((result: any) => result?.status === 'failed')
      .map((result: any) => ({
        contactId: result.contactId,
        phone: result.phone,
        name: result.name,
        error: result.error || 'Erro desconhecido',
        timestamp: result.sentAt || '',
        message: result.message || '',
      }));

    const retryingByContact = new Map<string, any>();
    rawResults
      .filter((result: any) => result?.status === 'retrying')
      .forEach((result: any) => {
        const key = getCampaignResultKey(result);
        const previous = retryingByContact.get(key);
        if (!previous || new Date(result.sentAt || 0).getTime() >= new Date(previous.sentAt || 0).getTime()) {
          retryingByContact.set(key, result);
        }
      });

    const resultKeys = new Set<string>();
    [...sent, ...failed].forEach((result) => {
      if (result.contactId) resultKeys.add(`id:${result.contactId}`);
      if (result.phone) resultKeys.add(`phone:${normalizePhoneValue(result.phone)}`);
    });

    const pending = contacts
      .filter((contact: any) => {
        const contactId = String(contact?.id || '');
        const phone = normalizePhoneValue(String(contact?.phone || ''));
        return !resultKeys.has(`id:${contactId}`) && !resultKeys.has(`phone:${phone}`);
      })
      .map((contact: any) => ({
        contactId: contact?.id ? String(contact.id) : undefined,
        phone: String(contact?.phone || ''),
        name: String(contact?.name || campaign.recipientNames?.[contact?.phone] || ''),
        retrying: retryingByContact.get(getCampaignResultKey(contact)) || null,
      }));

    const recipients = contacts.length
      ? contacts.map((contact: any) => String(contact?.phone || '')).filter(Boolean)
      : campaign.recipients || [];

    const recipientNames: Record<string, string> = contacts.reduce((acc: Record<string, string>, contact: any) => {
      const phone = String(contact?.phone || '');
      if (phone) {
        acc[phone] = String(contact?.name || campaign.recipientNames?.[phone] || '');
      }
      return acc;
    }, { ...(campaign.recipientNames || {}) });

    return {
      ...campaign,
      name: detail?.name || campaign.name,
      message: detail?.messageTemplate || detail?.message || campaign.message,
      status: detail?.status || campaign.status,
      createdAt: detail?.createdAt || campaign.createdAt,
      scheduledAt: detail?.scheduledAt || detail?.scheduled_at || campaign.scheduledAt,
      errorMessage: detail?.errorMessage || detail?.error_message || campaign.errorMessage,
      recipients,
      recipientNames,
      totalSent: detail?.sentCount ?? detail?.sent_count ?? campaign.totalSent ?? campaign.sentCount ?? sent.length,
      totalFailed: detail?.failedCount ?? detail?.failed_count ?? campaign.totalFailed ?? campaign.failedCount ?? failed.length,
      total_contacts: detail?.totalContacts ?? detail?.total_contacts ?? campaign.total_contacts ?? recipients.length,
      executedAt: detail?.completedAt || detail?.completed_at || detail?.startedAt || detail?.started_at || campaign.executedAt,
      delayProfile: detail?.delayProfile || campaign.delayProfile,
      useAiVariation: detail?.useAi ?? detail?.use_ai ?? campaign.useAiVariation,
      results: { sent, failed, pending },
    };
  };

  const openCampaignDetails = async (campaign: CampaignHistory) => {
    try {
      const response = await apiRequest("GET", `/api/campaigns/${campaign.id}`);
      const detail = await response.json();
      setSelectedCampaignDetails(normalizeCampaignDetails(campaign, detail));
    } catch {
      setSelectedCampaignDetails(normalizeCampaignDetails(campaign, campaign));
    }
    setLocation(`/campanhas/${campaign.id}`);
  };

  // Calcular tempo estimado de envio (valores fixos do BroadcastService)
  const estimatedTime = useMemo(() => {
    const count = getSelectedContacts.length;
    if (count === 0) return 0;
    // Estimativa: media de 3min por mensagem e 17,5min entre lotes de 10.
    const FIXED_DELAY = 180;
    const FIXED_BATCH_SIZE = 10;
    const FIXED_BATCH_INTERVAL = 1050;
    const batches = Math.ceil(count / FIXED_BATCH_SIZE);
    const totalSeconds = (count * FIXED_DELAY) + ((batches - 1) * FIXED_BATCH_INTERVAL);
    return Math.ceil(totalSeconds / 60); // Em minutos
  }, [getSelectedContacts.length]);

  // Filtrar contatos da lista por busca local
  const filteredListContacts = useMemo(() => {
    const contacts = recipientMode === 'list' && selectedListId
      ? contactLists.find(l => l.id === selectedListId)?.contacts || []
      : [];

    if (!searchTerm) return contacts;

    const term = searchTerm.toLowerCase();
    return contacts.filter(c =>
      c.name?.toLowerCase().includes(term) ||
      c.phone.includes(term)
    );
  }, [recipientMode, selectedListId, contactLists, searchTerm]);

  const allVisibleListContactsSelected = filteredListContacts.length > 0 &&
    filteredListContacts.every(contact => selectedContactIds.has(contact.id));

  const allVisibleSyncedContactsSelected = syncedContacts.length > 0 &&
    syncedContacts.every(contact => selectedContactIds.has(contact.id));

  const toggleSelectAllListContacts = () => {
    const next = new Set(selectedContactIds);

    if (allVisibleListContactsSelected) {
      filteredListContacts.forEach(contact => next.delete(contact.id));
    } else {
      filteredListContacts.forEach(contact => next.add(contact.id));
    }

    setSelectedContactIds(next);
  };

  const toggleSyncedContact = (contact: Contact, checked: boolean) => {
    const nextIds = new Set(selectedContactIds);

    if (checked) {
      nextIds.add(contact.id);
      setSelectedSyncedContacts(prev => ({
        ...prev,
        [contact.id]: { phone: contact.phone, name: contact.name || "" },
      }));
    } else {
      nextIds.delete(contact.id);
      setSelectedSyncedContacts(prev => {
        const next = { ...prev };
        delete next[contact.id];
        return next;
      });
    }

    setSelectedContactIds(nextIds);
  };

  const toggleSelectAllSyncedContacts = () => {
    const nextIds = new Set(selectedContactIds);
    const nextSelectedContacts = { ...selectedSyncedContacts };

    if (allVisibleSyncedContactsSelected) {
      syncedContacts.forEach(contact => {
        nextIds.delete(contact.id);
        delete nextSelectedContacts[contact.id];
      });
    } else {
      syncedContacts.forEach(contact => {
        nextIds.add(contact.id);
        nextSelectedContacts[contact.id] = { phone: contact.phone, name: contact.name || "" };
      });
    }

    setSelectedContactIds(nextIds);
    setSelectedSyncedContacts(nextSelectedContacts);
  };

  // Estado para prevenir múltiplos cliques
  const [isSending, setIsSending] = useState(false);

  // Iniciar envio - com proteção contra múltiplos cliques
  const handleSend = () => {
    // Prevenir múltiplos cliques
    if (isSending || ['running', 'paused', 'scheduled'].includes(sendProgress.status)) {
      return;
    }

    const contacts = getSelectedContacts;
    
    if (contacts.length === 0) {
      toast({ title: "Nenhum destinatário", description: recipientMode === 'groups' ? "Selecione pelo menos um grupo." : "Selecione pelo menos um contato.", variant: "destructive" });
      return;
    }

    if (!messageTemplate.trim() && !mediaFile) {
      toast({ title: "Mensagem vazia", description: "Digite uma mensagem ou anexe uma mídia para enviar.", variant: "destructive" });
      return;
    }

    const rotationConnectionIds = Array.from(selectedRotationConnectionIds);
    const shouldUseRotationalConnections = recipientMode !== 'groups' && broadcastConnectionMode === 'rotate';
    const selectedConnectionPayload = shouldUseRotationalConnections
      ? {
          connectionMode: 'rotate' as const,
          rotationConnectionIds,
          connectionId: rotationConnectionIds[0],
        }
      : {
          connectionMode: 'single' as const,
          rotationConnectionIds: [] as string[],
          connectionId: selectedBroadcastConnectionId || undefined,
        };

    if (recipientMode !== 'groups') {
      if (shouldUseRotationalConnections && rotationConnectionIds.length < 2) {
        toast({
          title: "Rotacional incompleto",
          description: "Selecione pelo menos duas conexões conectadas para alternar os envios.",
          variant: "destructive",
        });
        return;
      }

      if (!shouldUseRotationalConnections && connectedBroadcastConnections.length > 0 && !selectedConnectionPayload.connectionId) {
        toast({
          title: "Escolha a conexão",
          description: "Selecione qual conexão vai fazer este envio em massa.",
          variant: "destructive",
        });
        return;
      }
    }

    // Marcar como enviando para prevenir cliques duplos
    setIsSending(true);
    setSendProgress({ total: contacts.length, sent: 0, failed: 0, status: 'running' });

    const scheduledAtStr = scheduleEnabled
      ? buildBrazilScheduledAt(scheduledDate, scheduledTime)
      : undefined;
    const broadcastSafetyMetadata = {
      broadcastSafety: {
        inboundGateEnabled,
        businessHoursEnabled,
        businessHoursStartHour: 8,
        businessHoursEndHour: 20,
        businessHoursTimeZone: "America/Sao_Paulo",
      },
    };
    
    // Se for modo grupos, usar mutation específica
    if (recipientMode === 'groups') {
      const selectedGroups = whatsappGroups.filter((group) => selectedGroupIds.has(group.id));
      const groupTargets = selectedGroups.map((group) => ({
        groupId: group.id,
        connectionId: group.connectionId,
      }));
      const distinctTargetConnectionIds = Array.from(
        new Set(groupTargets.map((target) => target.connectionId).filter(Boolean)),
      );
      sendToGroupsMutation.mutate({
        groupIds: selectedGroups.map((group) => group.id),
        groupTargets,
        message: messageTemplate,
        useAI,
        delayMin: 60,
        delayMax: 300,
        scheduledAt: scheduledAtStr,
        connectionId: distinctTargetConnectionIds.length === 1 ? distinctTargetConnectionIds[0] : undefined,
        mediaFile,
        mediaType,
        metadata: broadcastSafetyMetadata,
      });
    } else if (mediaFile && mediaType !== 'none') {
      // Modo de envio com mídia
      sendBulkMediaMutation.mutate({
        contacts,
        message: messageTemplate,
        mediaFile: mediaFile,
        mediaType: mediaType as 'image' | 'video' | 'audio' | 'document',
        useAI,
        campaignName,
        scheduledAt: scheduledAtStr,
        metadata: broadcastSafetyMetadata,
        ...selectedConnectionPayload,
      });
    } else {
      // Modo normal de contatos (apenas texto)
      sendBulkMutation.mutate({
        contacts,
        message: messageTemplate,
        useAI,
        campaignName,
        scheduledAt: scheduledAtStr,
        metadata: broadcastSafetyMetadata,
        ...selectedConnectionPayload,
      });
    }
  };
  const isConnected = connectedBroadcastConnections.length > 0 || connection?.isConnected;
  const hasValidConnectionSelection = recipientMode === 'groups'
    ? connectedBroadcastConnections.length > 0
    : broadcastConnectionMode === 'rotate'
      ? selectedRotationConnectionIds.size >= 2
      : Boolean(selectedBroadcastConnectionId || connection?.isConnected);
  const messageHasLink = /\b(?:https?:\/\/|www\.)\S+/i.test(messageTemplate);
  const shouldShowAntiBanContentWarning = Boolean(messageTemplate.trim() || mediaFile);

  return (
    <div className="flex-1 overflow-auto">
      {/* Header Fixo */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                <Send className="w-4 h-4" /> Envio em Massa
              </div>
              <h1 className="text-2xl font-bold mt-1">Disparo de Mensagens</h1>
            </div>
            <div className="flex items-center gap-3">
              {isConnected ? (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Conectado
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="w-3 h-3 mr-1" /> Desconectado
                </Badge>
              )}
              
              <Button variant="outline" size="sm" onClick={() => setLocation("/campanhas")}>
                <History className="w-4 h-4 mr-2" />
                Histórico
              </Button>
              <ContextualHelpButton articleId="mass-send-setup" title="Como usar o Envio em Massa" description="Aprenda a disparar mensagens para múltiplos contatos de forma segura." />
            </div>
          </div>
          
          {/* Step Indicator */}
          <div className="mt-4">
            <StepIndicator currentStep={currentStep} steps={steps} />
          </div>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">
        
        {/* Alerta de desconexão */}
        {!isConnected && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>WhatsApp não conectado</AlertTitle>
            <AlertDescription>
              Conecte seu WhatsApp na página de conexão para usar o envio em massa.
            </AlertDescription>
          </Alert>
        )}

        {/* STEP 1: Destinatários */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {affiliateDraft && (
              <Alert className="border-primary/20 bg-primary/5">
                <Sparkles className="h-4 w-4 text-primary" />
                <AlertTitle>Mensagem pronta carregada</AlertTitle>
                <AlertDescription>
                  A campanha <strong>{campaignName || affiliateDraft.campaignName}</strong> ja preencheu a mensagem.
                  Agora selecione os destinatarios para seguir o fluxo completo desde a etapa 1.
                </AlertDescription>
              </Alert>
            )}

            {/* Seletor de Modo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Como você quer adicionar os destinatários?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {/* Opção Manual */}
                  <button
                    onClick={() => setRecipientMode('manual')}
                    className={`
                      p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50
                      ${recipientMode === 'manual' ? 'border-primary bg-primary/5' : 'border-border'}
                    `}
                  >
                    <Import className="w-8 h-8 mb-2 text-primary" />
                    <h3 className="font-semibold">Inserir Manualmente</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Digite nome e número. Formato: Nome, Número
                    </p>
                  </button>

                  {/* Opção Lista */}
                  <button
                    onClick={() => setRecipientMode('list')}
                    className={`
                      p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50
                      ${recipientMode === 'list' ? 'border-primary bg-primary/5' : 'border-border'}
                    `}
                  >
                    <List className="w-8 h-8 mb-2 text-primary" />
                    <h3 className="font-semibold">Listas de Contatos</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Selecione uma lista salva ({contactLists.length} disponíveis)
                    </p>
                  </button>

                  {/* Opção Sincronizados */}
                  <button
                    onClick={() => setRecipientMode('synced')}
                    className={`
                      p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50
                      ${recipientMode === 'synced' ? 'border-primary bg-primary/5' : 'border-border'}
                    `}
                  >
                    <UserCheck className="w-8 h-8 mb-2 text-green-600" />
                    <h3 className="font-semibold">Contatos Seguros</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="text-green-600">✓</span> Quem já conversou ({syncedContactsCount.total})
                    </p>
                  </button>

                  {/* Opção Grupos */}
                  <button
                    onClick={() => setRecipientMode('groups')}
                    className={`
                      p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50
                      ${recipientMode === 'groups' ? 'border-primary bg-primary/5' : 'border-border'}
                    `}
                  >
                    <UsersRound className="w-8 h-8 mb-2 text-blue-600" />
                    <h3 className="font-semibold">Grupos do WhatsApp</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="text-blue-600">✓</span> Enviar para grupos ({whatsappGroups?.length || 0})
                    </p>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Área de Input baseado no modo */}
            {recipientMode === 'manual' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Inserir Contatos em Massa
                    <InfoTooltip text="Digite Nome, Número (um por linha). Se não fornecer nome, apenas o número será usado. A variável [nome] na mensagem usará o nome fornecido." />
                  </CardTitle>
                  <CardDescription>
                    Formato: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Nome, Número</code> ou apenas <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Número</code> (um por linha)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder={`João Silva, 17991234567
Maria Santos, 11987654321
21999887766
Pedro Oliveira, 31988776655`}
                    value={manualContacts}
                    onChange={(e) => setManualContacts(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                    disabled={!isConnected || sendProgress.status === 'running'}
                  />
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {parseManualContacts(manualContacts).length} contatos
                      </span>
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-4 h-4" />
                        {parseManualContacts(manualContacts).filter(c => c.name).length} com nome
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setManualContacts("")}
                        disabled={!manualContacts}
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Limpar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setImportDestination('mass-send'); setShowImportModal(true); }}
                      >
                        <Upload className="w-4 h-4 mr-1" /> Importar Planilha
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const contacts = parseManualContacts(manualContacts);
                          if (contacts.length > 0) {
                            setShowCreateListDialog(true);
                          } else {
                            toast({ title: "Sem contatos", description: "Insira contatos primeiro.", variant: "destructive" });
                          }
                        }}
                      >
                        <Plus className="w-4 h-4 mr-1" /> Salvar Lista
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {recipientMode === 'list' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <BookUser className="w-5 h-5" />
                        Listas de Contatos
                      </CardTitle>
                      <CardDescription>
                        Gerencie e selecione listas para envio
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowCreateListDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Nova Lista
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setImportDestination('contact-list'); setShowImportModal(true); }}>
                        <Upload className="w-4 h-4 mr-2" />
                        Importar Planilha
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {contactLists.length === 0 ? (
                    <div className="text-center py-8">
                      <List className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-4">Nenhuma lista criada ainda</p>
                      <Button onClick={() => setShowCreateListDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Criar Lista
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Busca nas listas */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar lista..."
                          value={listSearchTerm}
                          onChange={(e) => { setListSearchTerm(e.target.value); setListPage(1); }}
                          className="pl-9"
                        />
                      </div>
                      
                      {/* Lista de listas com paginação */}
                      {(() => {
                        const filteredLists = contactLists.filter(l => 
                          l.name.toLowerCase().includes(listSearchTerm.toLowerCase()) ||
                          l.description?.toLowerCase().includes(listSearchTerm.toLowerCase())
                        );
                        const totalPages = Math.ceil(filteredLists.length / listsPerPage);
                        const paginatedLists = filteredLists.slice((listPage - 1) * listsPerPage, listPage * listsPerPage);
                        
                        return (
                          <div className="space-y-3">
                            <div className="space-y-2">
                              {paginatedLists.map((list) => (
                                <div 
                                  key={list.id} 
                                  className={`p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer ${
                                    selectedListId === list.id ? 'border-primary bg-primary/5' : ''
                                  }`}
                                  onClick={() => { 
                                    setSelectedListId(list.id); 
                                    // Selecionar todos os contatos da nova lista
                                    setSelectedContactIds(new Set(list.contacts?.map(c => c.id) || []));
                                  }}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-3 h-3 rounded-full ${selectedListId === list.id ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                                      <div>
                                        <p className="font-medium">{list.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {list.contacts?.length || 0} contatos • {list.description || 'Sem descrição'}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          setSelectedListDetails(list); 
                                          setShowListDetailsDialog(true); 
                                        }}
                                      >
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      <Badge variant="outline">
                                        {list.contacts?.length || 0}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            {/* Paginação */}
                            {totalPages > 1 && (
                              <div className="flex items-center justify-between pt-2 border-t">
                                <span className="text-sm text-muted-foreground">
                                  {filteredLists.length} listas encontradas
                                </span>
                                <div className="flex items-center gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setListPage(p => Math.max(1, p - 1))}
                                    disabled={listPage === 1}
                                  >
                                    <ChevronLeft className="w-4 h-4" />
                                  </Button>
                                  <span className="text-sm">
                                    {listPage} de {totalPages}
                                  </span>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setListPage(p => Math.min(totalPages, p + 1))}
                                    disabled={listPage === totalPages}
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {selectedListId && (
                        <div className="space-y-3 pt-4 border-t">
                          <h4 className="font-medium text-sm">Contatos da Lista Selecionada</h4>
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                            <div className="relative flex-1 max-w-xs">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                placeholder="Buscar contato..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={toggleSelectAllListContacts}>
                                {allVisibleListContactsSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
                              </Button>
                              <span className="text-sm text-muted-foreground">
                                {selectedContactIds.size} selecionados
                              </span>
                            </div>
                          </div>
                          
                          <ScrollArea className="h-[300px] border rounded-md">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-12"></TableHead>
                                  <TableHead>Nome</TableHead>
                                  <TableHead>Telefone</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredListContacts.map((contact) => (
                                  <TableRow key={contact.id}>
                                    <TableCell>
                                      <Checkbox
                                        checked={selectedContactIds.has(contact.id)}
                                        onCheckedChange={(checked) => {
                                          const newSet = new Set(selectedContactIds);
                                          if (checked) {
                                            newSet.add(contact.id);
                                          } else {
                                            newSet.delete(contact.id);
                                          }
                                          setSelectedContactIds(newSet);
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell className="font-medium">{contact.name || '-'}</TableCell>
                                    <TableCell className="text-muted-foreground">{formatPhone(contact.phone)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {recipientMode === 'synced' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-green-600" />
                    Contatos Seguros
                    <Badge variant="outline" className="text-green-600 border-green-600 ml-2">Anti-Spam</Badge>
                  </CardTitle>
                  <CardDescription>
                    Contatos que já iniciaram conversa ou responderam você
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert className="bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800">
                    <Shield className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800 dark:text-green-200">Por que é mais seguro?</AlertTitle>
                    <AlertDescription className="text-green-700 dark:text-green-300">
                      Enviar para quem já conversou com você reduz muito o risco de bloqueio. O WhatsApp prioriza conversas já estabelecidas.
                    </AlertDescription>
                  </Alert>

                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <Button
                      onClick={() => syncContactsMutation.mutate()}
                      disabled={!isConnected || syncProgress.syncing}
                    >
                      {syncProgress.syncing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Sincronizar
                        </>
                      )}
                    </Button>
                    
                    <span className="text-sm text-muted-foreground">
                      {syncedContactsCount.total} contatos disponíveis
                    </span>
                  </div>

                  {syncedContacts.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="relative flex-1 max-w-xs">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="Buscar por nome ou telefone..."
                            value={syncedSearch}
                            onChange={(e) => setSyncedSearch(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={toggleSelectAllSyncedContacts}>
                            {allVisibleSyncedContactsSelected ? 'Desmarcar Página' : 'Selecionar Página'}
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            {Object.keys(selectedSyncedContacts).length} selecionados
                          </span>
                        </div>
                      </div>
                      
                      <ScrollArea className="h-[300px] border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12"></TableHead>
                              <TableHead>Nome</TableHead>
                              <TableHead>Telefone</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {syncedContacts.map((contact) => (
                              <TableRow key={contact.id}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedContactIds.has(contact.id)}
                                    onCheckedChange={(checked) => {
                                      toggleSyncedContact(contact, !!checked);
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">{contact.name || '-'}</TableCell>
                                <TableCell className="text-muted-foreground">{formatPhone(contact.phone)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>

                      {/* Controles de Paginação */}
                      {(syncedContactsData?.totalPages ?? 1) > 1 && (
                        <div className="flex items-center justify-center gap-4 pt-4 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={syncedPage <= 1}
                            onClick={() => setSyncedPage(p => p - 1)}
                          >
                            ← Anterior
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            Página {syncedPage} de {syncedContactsData?.totalPages ?? 1}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={syncedPage >= (syncedContactsData?.totalPages ?? 1)}
                            onClick={() => setSyncedPage(p => p + 1)}
                          >
                            Próxima →
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Seção de Grupos */}
            {recipientMode === 'groups' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UsersRound className="w-5 h-5 text-blue-600" />
                    Grupos do WhatsApp
                    <Badge variant="outline" className="text-blue-600 border-blue-600 ml-2">Envio em Massa</Badge>
                  </CardTitle>
                  <CardDescription>
                    Selecione os grupos que você participa para enviar mensagens
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Conexao dos grupos</Label>
                    {connectedBroadcastConnections.length === 0 ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Nenhuma conexao conectada</AlertTitle>
                        <AlertDescription>
                          Conecte pelo menos uma linha do WhatsApp antes de listar os grupos.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Select value={selectedGroupConnectionScope} onValueChange={setSelectedGroupConnectionScope}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma conexao" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={GROUP_CONNECTION_ALL_VALUE}>
                            Todas as conexoes conectadas
                          </SelectItem>
                          {connectedBroadcastConnections.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {formatBroadcastConnectionLabel(item)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <p className="text-xs text-muted-foreground">
                      A lista abaixo mostra todos os grupos conectados. Use o filtro se quiser enviar por uma linha especifica.
                    </p>
                  </div>

                  <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
                    <UsersRound className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-800 dark:text-blue-200">Envio para Grupos</AlertTitle>
                    <AlertDescription className="text-blue-700 dark:text-blue-300">
                      A mensagem será enviada diretamente nos grupos selecionados. Todos os participantes receberão a mensagem.
                    </AlertDescription>
                  </Alert>

                  {groupsQueryLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mr-2" />
                      <span>Carregando grupos...</span>
                    </div>
                  ) : groupsQueryHasError ? (
                    <div className="text-center py-8 space-y-4">
                      <AlertCircle className="w-12 h-12 mx-auto text-destructive" />
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">Não foi possível carregar os grupos</p>
                        <p className="text-sm text-muted-foreground">
                          {groupsQueryError instanceof Error
                            ? groupsQueryError.message
                            : "O servidor não conseguiu listar os grupos desta conexão."}
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => refetchGroups()}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Tentar novamente
                      </Button>
                    </div>
                  ) : !whatsappGroups || whatsappGroups.length === 0 ? (
                    <div className="text-center py-8">
                      <UsersRound className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-4">Nenhum grupo encontrado</p>
                      <p className="text-sm text-muted-foreground">
                        {isConnected ? 'Você não participa de nenhum grupo no WhatsApp' : 'Conecte seu WhatsApp para ver os grupos'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Busca nos grupos */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="relative flex-1 max-w-xs">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="Buscar grupo..."
                            value={groupSearchTerm}
                            onChange={(e) => setGroupSearchTerm(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                              if (selectedGroupIds.size === whatsappGroups.length) {
                                setSelectedGroupIds(new Set());
                              } else {
                                setSelectedGroupIds(new Set(whatsappGroups.map(g => g.id)));
                              }
                            }}
                          >
                            {selectedGroupIds.size === whatsappGroups.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            {selectedGroupIds.size} grupos selecionados
                          </span>
                        </div>
                      </div>

                      {/* Lista de grupos */}
                      <ScrollArea className="h-[350px] border rounded-md">
                        <div className="p-2 space-y-2">
                          {whatsappGroups
                            .filter(group => 
                              group.name.toLowerCase().includes(groupSearchTerm.toLowerCase())
                            )
                            .map((group) => (
                              <div 
                                key={group.id}
                                className={`
                                  p-3 rounded-lg border cursor-pointer transition-all hover:bg-muted/50
                                  ${selectedGroupIds.has(group.id) ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-border'}
                                `}
                                onClick={() => {
                                  const newSet = new Set(selectedGroupIds);
                                  if (newSet.has(group.id)) {
                                    newSet.delete(group.id);
                                  } else {
                                    newSet.add(group.id);
                                  }
                                  setSelectedGroupIds(newSet);
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <Checkbox
                                    checked={selectedGroupIds.has(group.id)}
                                    onCheckedChange={(checked) => {
                                      const newSet = new Set(selectedGroupIds);
                                      if (checked) {
                                        newSet.add(group.id);
                                      } else {
                                        newSet.delete(group.id);
                                      }
                                      setSelectedGroupIds(newSet);
                                    }}
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{group.name}</span>
                                      {group.isAdmin && (
                                        <Badge variant="secondary" className="text-xs">Admin</Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {group.participantsCount} participantes
                                    </p>
                                    {(group.connectionName || group.connectionPhoneNumber) && (
                                      <p className="text-xs text-muted-foreground">
                                        {group.connectionName || "Conexão"}{group.connectionPhoneNumber ? ` • ${formatPhone(group.connectionPhoneNumber)}` : ""}
                                      </p>
                                    )}
                                  </div>
                                  <Badge variant="outline" className="text-blue-600">
                                    {group.participantsCount}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                        </div>
                      </ScrollArea>

                      {/* Resumo da seleção */}
                      {selectedGroupIds.size > 0 && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                              {selectedGroupIds.size} grupos selecionados
                            </span>
                            <span className="text-xs text-blue-600">
                              (~{whatsappGroups
                                .filter(g => selectedGroupIds.has(g.id))
                                .reduce((acc, g) => acc + g.participantsCount, 0)} pessoas alcançadas)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Navegação */}
            <div className="flex justify-end">
              <Button 
                onClick={() => setCurrentStep(2)}
                disabled={getSelectedContacts.length === 0}
              >
                Próximo: Mensagem
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Mensagem */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Escreva sua Mensagem
                </CardTitle>
                <CardDescription>
                  Use <code className="bg-muted px-1.5 py-0.5 rounded text-xs">[nome]</code> para personalizar com o nome do contato
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder={`Olá [nome], tudo bem?

Estou entrando em contato para...

💡 Use [nome] para inserir o nome do contato automaticamente!`}
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  className="min-h-[200px]"
                  disabled={sendProgress.status === 'running'}
                />

                {/* Seção de Upload de Mídia */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-medium">Anexar Mídia (opcional)</Label>
                    {mediaFile && (
                      <Badge variant="secondary" className="text-xs">
                        {mediaType === 'image' && <Image className="w-3 h-3 mr-1" />}
                        {mediaType === 'video' && <Video className="w-3 h-3 mr-1" />}
                        {mediaType === 'audio' && <Mic className="w-3 h-3 mr-1" />}
                        {mediaType === 'document' && <File className="w-3 h-3 mr-1" />}
                        {mediaType === 'image' ? 'Imagem' : mediaType === 'video' ? 'Vídeo' : mediaType === 'audio' ? 'Áudio' : 'Documento'}
                      </Badge>
                    )}
                  </div>

                  {/* Input file oculto */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleMediaFileSelect}
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                  />

                  {/* Botões para selecionar tipo de mídia */}
                  {!mediaFile && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-24 flex flex-col gap-2 hover:bg-blue-50 hover:border-blue-300 dark:hover:bg-blue-950/30"
                        onClick={() => handleSelectMediaType('image')}
                        disabled={sendProgress.status === 'running'}
                      >
                        <Image className="w-8 h-8 text-blue-500" />
                        <span className="text-sm">Imagem</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-24 flex flex-col gap-2 hover:bg-purple-50 hover:border-purple-300 dark:hover:bg-purple-950/30"
                        onClick={() => handleSelectMediaType('video')}
                        disabled={sendProgress.status === 'running'}
                      >
                        <Video className="w-8 h-8 text-purple-500" />
                        <span className="text-sm">Vídeo</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-24 flex flex-col gap-2 hover:bg-green-50 hover:border-green-300 dark:hover:bg-green-950/30"
                        onClick={() => handleSelectMediaType('audio')}
                        disabled={sendProgress.status === 'running'}
                      >
                        <Mic className="w-8 h-8 text-green-500" />
                        <span className="text-sm">Áudio</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-24 flex flex-col gap-2 hover:bg-orange-50 hover:border-orange-300 dark:hover:bg-orange-950/30"
                        onClick={() => handleSelectMediaType('document')}
                        disabled={sendProgress.status === 'running'}
                      >
                        <File className="w-8 h-8 text-orange-500" />
                        <span className="text-sm">Documento</span>
                      </Button>
                    </div>
                  )}

                  {/* Preview da mídia selecionada */}
                  {mediaFile && (
                    <div className="relative border rounded-lg p-4 bg-muted/30">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8 rounded-full bg-red-100 hover:bg-red-200 text-red-600"
                        onClick={handleRemoveMedia}
                      >
                        <X className="w-4 h-4" />
                      </Button>

                      <div className="flex items-start gap-4">
                        {/* Preview visual para imagens/vídeos */}
                        {mediaType === 'image' && mediaPreview && (
                          <img 
                            src={mediaPreview} 
                            alt="Preview" 
                            className="w-32 h-32 object-cover rounded-lg border"
                          />
                        )}
                        {mediaType === 'video' && mediaPreview && (
                          <video 
                            src={mediaPreview} 
                            className="w-32 h-32 object-cover rounded-lg border"
                            controls={false}
                            muted
                          />
                        )}
                        {mediaType === 'audio' && (
                          <div className="w-32 h-32 flex items-center justify-center bg-green-100 dark:bg-green-950/50 rounded-lg border">
                            <Mic className="w-12 h-12 text-green-500" />
                          </div>
                        )}
                        {mediaType === 'document' && (
                          <div className="w-32 h-32 flex items-center justify-center bg-orange-100 dark:bg-orange-950/50 rounded-lg border">
                            <File className="w-12 h-12 text-orange-500" />
                          </div>
                        )}

                        {/* Informações do arquivo */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{mediaFile.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {(mediaFile.size / (1024 * 1024)).toFixed(2)} MB
                          </p>
                          <Badge variant="outline" className="mt-2">
                            {mediaType === 'image' && 'Imagem'}
                            {mediaType === 'video' && 'Vídeo'}
                            {mediaType === 'audio' && 'Áudio'}
                            {mediaType === 'document' && 'Documento'}
                          </Badge>
                          
                          {/* Dica sobre legenda */}
                          <p className="text-xs text-muted-foreground mt-3 bg-muted/50 p-2 rounded">
                            💡 A mensagem acima será enviada como legenda junto com a mídia
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{messageTemplate.length} caracteres</span>
                    {messageTemplate.toLowerCase().includes('[nome]') && (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <UserCheck className="w-3 h-3 mr-1" />
                        Personalizado
                      </Badge>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowPreviewDialog(true)}
                    disabled={!messageTemplate}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Ver Preview
                  </Button>
                </div>

                {/* Botão para inserir variável */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Inserir:</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setMessageTemplate(prev => prev + '[nome]')}
                  >
                    [nome]
                  </Button>
                </div>

                {shouldShowAntiBanContentWarning && (
                  <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-900 dark:text-amber-100">
                      Risco de bloqueio por duplicidade
                    </AlertTitle>
                    <AlertDescription className="space-y-2 text-amber-800 dark:text-amber-200">
                      <p>
                        A Meta pode identificar duplicidade quando varios clientes recebem a mesma mensagem,
                        midia ou link. Isso aumenta o risco de bloqueio da linha.
                      </p>
                      <p>
                        Estrategia mais segura: envie primeiro uma mensagem simples e natural. Quando o cliente
                        responder, envie a imagem, video, documento ou link na conversa.
                      </p>
                      {(mediaFile || messageHasLink) && (
                        <p className="font-medium">
                          Esta campanha contem {mediaFile ? "midia" : "link"}; use somente se aceitar esse risco.
                        </p>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Opção de IA */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  Variação com IA
                  <Badge variant="outline" className="text-purple-600 border-purple-600">BETA</Badge>
                </CardTitle>
                <CardDescription>
                  Gera versões únicas da mensagem em todos os disparos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="use-ai">Variação com IA obrigatória</Label>
                    <p className="text-sm text-muted-foreground">
                      Cada contato sempre recebe uma versão diferente
                    </p>
                  </div>
                  <Switch
                    id="use-ai"
                    checked={useAI}
                    disabled
                  />
                </div>
                
                <Alert className="mt-4 bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <AlertDescription className="text-purple-700 dark:text-purple-300">
                    A IA mantém o significado, varia a escrita e preserva a variável [nome] automaticamente em toda campanha.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            {/* Navegação */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                Voltar
              </Button>
              <Button 
                onClick={() => setCurrentStep(3)}
                disabled={!messageTemplate.trim() && !mediaFile}
              >
                Próximo: Configurações
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Configurações Anti-Spam */}
        {currentStep === 3 && (
          <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    Conexão de envio
                  </CardTitle>
                  <CardDescription>
                    Escolha uma linha específica ou alterne entre conexões conectadas sem acelerar o anti-banimento.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {connectedBroadcastConnections.length === 0 ? (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Nenhuma conexão conectada</AlertTitle>
                      <AlertDescription>
                        Conecte pelo menos uma linha do WhatsApp antes de iniciar o envio em massa.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setBroadcastConnectionMode('single')}
                          className={`rounded-xl border p-4 text-left transition-all ${
                            broadcastConnectionMode === 'single'
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold">Escolher uma conexão</p>
                              <p className="text-sm text-muted-foreground">Toda a campanha sai por uma linha selecionada.</p>
                            </div>
                            {broadcastConnectionMode === 'single' && <CheckCircle2 className="w-5 h-5 text-primary" />}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setBroadcastConnectionMode('rotate')}
                          disabled={connectedBroadcastConnections.length < 2}
                          className={`rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                            broadcastConnectionMode === 'rotate'
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold">Rotacional entre linhas</p>
                              <p className="text-sm text-muted-foreground">Alterna uma mensagem por conexão em ordem.</p>
                            </div>
                            {broadcastConnectionMode === 'rotate' && <RefreshCw className="w-5 h-5 text-primary" />}
                          </div>
                        </button>
                      </div>

                      {broadcastConnectionMode === 'single' ? (
                        <div className="space-y-2">
                          <Label>Conexão que vai enviar</Label>
                          <Select value={selectedBroadcastConnectionId} onValueChange={setSelectedBroadcastConnectionId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione uma conexão" />
                            </SelectTrigger>
                            <SelectContent>
                              {connectedBroadcastConnections.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {formatBroadcastConnectionLabel(item)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <Label>Conexões do rotacional</Label>
                            <Badge variant="secondary">{selectedRotationConnections.length} selecionadas</Badge>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            {connectedBroadcastConnections.map((item) => {
                              const checked = selectedRotationConnectionIds.has(item.id);
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedRotationConnectionIds((current) => {
                                      const next = new Set(current);
                                      if (next.has(item.id)) {
                                        next.delete(item.id);
                                      } else {
                                        next.add(item.id);
                                      }
                                      return next;
                                    });
                                  }}
                                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                                    checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                                  }`}
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">{formatBroadcastConnectionLabel(item)}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {item.isPrimary ? 'Principal' : item.connectionType || 'Secundária'}
                                    </span>
                                  </span>
                                  <span
                                    aria-hidden="true"
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                      checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                                    }`}
                                  >
                                    {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {selectedRotationConnections.length < 2 && (
                            <p className="text-sm text-amber-700">
                              Selecione pelo menos duas conexões para ativar o rotacional.
                            </p>
                          )}
                        </div>
                      )}

                      <Alert className="bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800">
                        <Shield className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-700 dark:text-green-300">
                          O rotacional não acelera a campanha: cada mensagem continua respeitando 1-5 minutos aleatórios,
                          e o lote pausa 15-20 minutos após 10 envios.
                        </AlertDescription>
                      </Alert>
                    </>
                  )}
                </CardContent>
              </Card>
            <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800 dark:text-blue-200">Proteção Anti-Spam</AlertTitle>
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                Configure intervalos e lotes para simular comportamento humano e evitar bloqueios.
              </AlertDescription>
            </Alert>

            <Card>
              <CardContent className="pt-6">
                <Alert className="bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800">
                  <Shield className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800 dark:text-green-200">🛡️ Proteção Anti-Bloqueio Ativa</AlertTitle>
                  <AlertDescription className="text-green-700 dark:text-green-300 space-y-1">
                    <p>• Delay aleatório: 1 a 5 minutos entre mensagens</p>
                    <p>• Lotes de 10 mensagens por vez</p>
                    <p>• Pausa aleatória de 15 a 20 minutos entre lotes</p>
                    <p className="mt-2 text-xs">Esta configuração protege sua conta de bloqueios pelo WhatsApp.</p>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            {/* Resumo das proteções */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Regras de seguranca da campanha
                </CardTitle>
                <CardDescription>
                  As duas opcoes ficam ativas por padrao e podem ser desligadas somente nesta campanha.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                  <div className="space-y-1">
                    <Label className="text-base">Anti-banimento por mensagens recebidas</Label>
                    <p className="text-sm text-muted-foreground">
                      Aguarda 10 mensagens recebidas na conexao antes do proximo envio. Se a janela vencer, libera um envio controlado.
                    </p>
                  </div>
                  <Switch checked={inboundGateEnabled} onCheckedChange={setInboundGateEnabled} />
                </div>
                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                  <div className="space-y-1">
                    <Label className="text-base">Horario de envio Brasilia</Label>
                    <p className="text-sm text-muted-foreground">
                      Envia somente das 08:00 as 20:00. Fora desse horario a campanha pausa e continua no proximo dia.
                    </p>
                  </div>
                  <Switch checked={businessHoursEnabled} onCheckedChange={setBusinessHoursEnabled} />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <h4 className="font-medium mb-4">Resumo das Proteções</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>Delay humanizado (1-5 min proteção ativa)</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {useAI ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>Variação com IA</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {recipientMode === 'synced' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>Apenas contatos seguros</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {messageTemplate.toLowerCase().includes('[nome]') ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>Personalização com nome</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {scheduleEnabled ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>Agendamento {scheduleEnabled && scheduledDate && scheduledTime ? `(${scheduledDate} ${scheduledTime})` : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>{broadcastConnectionMode === 'rotate' ? 'Rotacional por conexão' : 'Conexão escolhida'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {inboundGateEnabled ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>Anti-banimento por mensagens recebidas</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {businessHoursEnabled ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>Horario 08:00-20:00 Brasilia</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Agendamento */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Agendamento
                  <InfoTooltip text="Agende o envio para uma data e hora específica. Ideal para enviar em horário comercial." />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Agendar envio</Label>
                    <p className="text-sm text-muted-foreground">
                      Defina data e hora para iniciar o envio
                    </p>
                  </div>
                  <Switch
                    checked={scheduleEnabled}
                    onCheckedChange={setScheduleEnabled}
                  />
                </div>

                {scheduleEnabled && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        min={getBrazilDateInputValue()}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Hora</Label>
                      <Input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Alert className="bg-blue-50 border-blue-200">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-blue-700">
                          <strong>Dica:</strong> Envie entre 9h e 18h em dias úteis para melhores resultados.
                        </AlertDescription>
                      </Alert>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Navegação */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>
                Voltar
              </Button>
              <Button onClick={() => setCurrentStep(4)}>
                Próximo: Revisar
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: Revisão e Envio */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Resumo do Envio
                </CardTitle>
                <CardDescription>
                  Revise antes de iniciar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4 space-y-1">
                    <p className="text-sm text-muted-foreground">Destinatários</p>
                    <p className="text-3xl font-bold">{getSelectedContacts.length}</p>
                  </div>
                  <div className="rounded-lg border p-4 space-y-1">
                    <p className="text-sm text-muted-foreground">Tempo estimado</p>
                    <p className="text-3xl font-bold">~{estimatedTime} min</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium">Configurações</h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Origem:</span>
                      <span className="font-medium">
                        {recipientMode === 'manual' ? 'Manual' : recipientMode === 'list' ? 'Lista' : recipientMode === 'groups' ? 'Grupos' : 'Contatos seguros'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delay:</span>
                      <span className="font-medium">1-5 min + pausas de lote de 15-20 min</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Anti-banimento:</span>
                      <span className="text-right font-medium">
                        {inboundGateEnabled
                          ? "Ativo - aguarda 10 mensagens recebidas por conexao antes do proximo envio"
                          : "Desativado nesta campanha"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Horario:</span>
                      <span className="text-right font-medium">
                        {businessHoursEnabled
                          ? "08:00-20:00 Brasilia; fora disso continua no proximo dia"
                          : "Sem restricao de horario nesta campanha"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IA:</span>
                      <span className="font-medium">Obrigatoria</span>
                    </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Conexão:</span>
                        <span className="text-right font-medium">
                          {broadcastConnectionMode === 'rotate'
                            ? `Rotacional (${selectedRotationConnections.length} linhas)`
                            : selectedBroadcastConnection
                              ? formatBroadcastConnectionLabel(selectedBroadcastConnection)
                              : 'Automática'}
                        </span>
                      </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium">Preview</h4>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="whitespace-pre-wrap text-sm">{previewMessage}</p>
                  </div>
                  
                  {/* Preview da mídia anexada */}
                  {mediaFile && mediaType !== 'none' && (
                    <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                      <div className="flex-shrink-0">
                        {mediaType === 'image' && mediaPreview && (
                          <img src={mediaPreview} alt="Preview" className="w-16 h-16 object-cover rounded" />
                        )}
                        {mediaType === 'video' && (
                          <div className="w-16 h-16 flex items-center justify-center bg-purple-100 dark:bg-purple-950/50 rounded">
                            <Video className="w-8 h-8 text-purple-500" />
                          </div>
                        )}
                        {mediaType === 'audio' && (
                          <div className="w-16 h-16 flex items-center justify-center bg-green-100 dark:bg-green-950/50 rounded">
                            <Mic className="w-8 h-8 text-green-500" />
                          </div>
                        )}
                        {mediaType === 'document' && (
                          <div className="w-16 h-16 flex items-center justify-center bg-orange-100 dark:bg-orange-950/50 rounded">
                            <File className="w-8 h-8 text-orange-500" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{mediaFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(mediaFile.size / (1024 * 1024)).toFixed(2)} MB • 
                          {mediaType === 'image' ? ' Imagem' : mediaType === 'video' ? ' Vídeo' : mediaType === 'audio' ? ' Áudio' : ' Documento'}
                        </p>
                      </div>
                      <Badge variant="secondary" className="flex-shrink-0">
                        <Upload className="w-3 h-3 mr-1" />
                        Mídia anexada
                      </Badge>
                    </div>
                  )}
                  
                  {/* Aviso sobre IA quando ativada */}
                  <Alert className="bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    <AlertTitle className="text-purple-800 dark:text-purple-200">Variação com IA obrigatória</AlertTitle>
                    <AlertDescription className="text-purple-700 dark:text-purple-300">
                      O sistema irá gerar automaticamente <strong>{getSelectedContacts.length} versões únicas</strong> desta mensagem,
                      uma para cada contato. A variável [nome] será preservada e substituída pelo nome de cada contato.
                    </AlertDescription>
                  </Alert>
                </div>

                {/* Progresso de envio */}
                {sendProgress.status !== 'idle' && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Progresso</h4>
                        <Badge variant={
                          sendProgress.status === 'completed' ? 'default' : 
                          sendProgress.status === 'error' ? 'destructive' :
                          sendProgress.status === 'cancelled' ? 'outline' : 'secondary'
                        }>
                          {sendProgress.status === 'running' ? 'Enviando...' : 
                           sendProgress.status === 'scheduled' ? 'Agendada em Brasília' :
                           sendProgress.status === 'paused' ? 'Aguardando retomada' :
                           sendProgress.status === 'completed' ? 'Concluído' :
                           sendProgress.status === 'cancelled' ? 'Cancelado' :
                           sendProgress.status === 'error' ? 'Erro' : 'Aguardando'}
                        </Badge>
                      </div>
                      <Progress 
                        value={sendProgress.total > 0 ? ((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100 : 0} 
                        className="h-3"
                      />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{sendProgress.sent + sendProgress.failed} de {sendProgress.total}</span>
                        <div className="flex gap-4">
                          <span className="text-green-600">{sendProgress.sent} ✓</span>
                          <span className="text-red-600">{sendProgress.failed} ✗</span>
                        </div>
                      </div>
                    </div>
                    {(sendProgress.status === 'running' || sendProgress.status === 'paused' || sendProgress.status === 'scheduled') && (
                      <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                        <AlertDescription className="text-amber-700 dark:text-amber-300">
                          {sendProgress.status === 'scheduled'
                            ? 'A campanha ficou agendada no servidor e será iniciada automaticamente no horário programado.'
                            : 'O envio continua em background. Você pode fechar esta página com segurança.'}
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </CardContent>
              <CardFooter className="flex justify-between border-t pt-6">
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setCurrentStep(3)} disabled={isSending}>
                    Voltar
                  </Button>
                  {['running', 'paused', 'scheduled'].includes(sendProgress.status) && activeCampaignId && (
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={async () => {
                        try {
                          await apiRequest("PUT", `/api/campaigns/${activeCampaignId}/cancel`, {});
                          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
                          pollingIntervalRef.current = null;
                          localStorage.removeItem('activeCampaignId');
                          setActiveCampaignId(null);
                          setSendProgress(prev => ({ ...prev, status: 'cancelled' }));
                          setIsSending(false);
                          toast({ title: "Envio cancelado", description: "A campanha foi cancelada." });
                        } catch {
                          toast({ title: "Erro ao cancelar", variant: "destructive" });
                        }
                      }}
                    >
                      Parar agora
                    </Button>
                  )}
                </div>
                {/* Botão desaparece após envio concluído */}
                {sendProgress.status !== 'completed' ? (
                  <Button 
                    size="lg"
                    onClick={handleSend}
                    disabled={!isConnected || !hasValidConnectionSelection || isSending || ['running', 'paused', 'scheduled'].includes(sendProgress.status) || getSelectedContacts.length === 0}
                    className="min-w-[200px]"
                  >
                    {sendProgress.status === 'running' || sendProgress.status === 'paused' || isSending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {sendProgress.status === 'paused' ? 'Aguardando...' : 'Enviando...'}
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        {scheduleEnabled ? 'Agendar' : 'Enviar'} ({getSelectedContacts.length})
                      </>
                    )}
                  </Button>
                ) : (
                  <Button 
                    size="lg"
                    onClick={() => {
                      // Reset para novo envio
                      setIsSending(false);
                      setSendProgress({ total: 0, sent: 0, failed: 0, status: 'idle' });
                      setCurrentStep(1);
                      setManualContacts('');
                    }}
                    className="min-w-[200px]"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Novo Envio
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        )}

        {/* Histórico de Campanhas - Visível no Step 1 */}
        {currentStep === 1 && campaignHistory.filter(c => c.status === 'completed').length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Envios Recentes
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/campanhas")}>
                Ver todos
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {campaignHistory.filter(c => c.status === 'completed').slice(0, 3).map((campaign) => {
                  const sentCount = campaign.sent_count ?? campaign.totalSent ?? campaign.sentCount ?? 0;
                  const failedCount = campaign.failed_count ?? campaign.totalFailed ?? campaign.failedCount ?? 0;
                  const campaignDate = campaign.executedAt || campaign.completed_at || campaign.started_at;
                  
                  return (
                    <div 
                      key={campaign.id} 
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => openCampaignDetails(campaign)}
                    >
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatCampaignDate(campaignDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-green-600">
                          {sentCount} ✓
                        </Badge>
                        {failedCount > 0 && (
                          <Badge variant="outline" className="text-red-600">
                            {failedCount} ✗
                          </Badge>
                        )}
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog: Criar Lista */}
      <Dialog open={showCreateListDialog} onOpenChange={setShowCreateListDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Nova Lista</DialogTitle>
            <DialogDescription>
              Salve os contatos para usar novamente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Lista</Label>
              <Input
                placeholder="Ex: Clientes VIP"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                placeholder="Descrição..."
                value={newListDescription}
                onChange={(e) => setNewListDescription(e.target.value)}
              />
            </div>
            {recipientMode === 'manual' && (
              <p className="text-sm text-muted-foreground">
                {parseManualContacts(manualContacts).length} contatos serão salvos
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateListDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                const contacts = recipientMode === 'manual' 
                  ? parseManualContacts(manualContacts).map((c, i) => ({
                      id: `contact_${Date.now()}_${i}`,
                      name: c.name,
                      phone: c.phone,
                    }))
                  : [];
                createListMutation.mutate({ 
                  name: newListName, 
                  description: newListDescription,
                  contacts 
                });
              }}
              disabled={!newListName.trim() || createListMutation.isPending}
            >
              {createListMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Preview */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview da Mensagem</DialogTitle>
            <DialogDescription>
              Como a mensagem aparecerá
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {getSelectedContacts.slice(0, 3).map((contact, i) => (
              <div key={i} className="p-4 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">
                  Para: {contact.name || 'Sem nome'} ({formatPhone(contact.phone)})
                </p>
                <p className="whitespace-pre-wrap text-sm">
                  {applyMessageTemplate(messageTemplate, contact.name)}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowPreviewDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Histórico */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Histórico de Envios
            </DialogTitle>
            <DialogDescription>
              Clique em uma campanha para ver os detalhes dos números enviados
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-3">
              {campaignHistory.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhuma campanha enviada ainda</p>
                </div>
              ) : (
                campaignHistory.map((campaign) => {
                  const sentCount = campaign.sent_count ?? campaign.totalSent ?? campaign.sentCount ?? 0;
                  const failedCount = campaign.failed_count ?? campaign.totalFailed ?? campaign.failedCount ?? 0;
                  const total = campaign.total_contacts ?? (sentCount + failedCount);
                  const recipientsCount = campaign.recipients?.length || campaign.total_contacts || total;
                  const campaignDate = campaign.scheduledAt || campaign.executedAt || campaign.completed_at || campaign.started_at || campaign.createdAt;
                  
                  return (
                    <div 
                      key={campaign.id} 
                      className="p-4 border rounded-lg space-y-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => openCampaignDetails(campaign)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{campaign.name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {formatCampaignDateTime(campaignDate)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getCampaignStatusBadgeClass(campaign.status)}>
                            {getCampaignStatusLabel(campaign.status)}
                          </Badge>
                          {['running', 'pending', 'scheduled'].includes(campaign.status) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await apiRequest("PUT", `/api/campaigns/${campaign.id}/cancel`);
                                  queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
                                } catch { /* silently ignore */ }
                              }}
                            >
                              Parar
                            </Button>
                          )}
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 text-center text-sm">
                        <div className="bg-muted rounded p-2">
                          <Users className="w-4 h-4 mx-auto mb-1" />
                          <p className="font-bold">{recipientsCount}</p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 rounded p-2">
                          <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-green-600" />
                          <p className="font-bold text-green-600">{sentCount}</p>
                          <p className="text-xs text-muted-foreground">Enviados</p>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 rounded p-2">
                          <XCircle className="w-4 h-4 mx-auto mb-1 text-red-600" />
                          <p className="font-bold text-red-600">{failedCount}</p>
                          <p className="text-xs text-muted-foreground">Falhas</p>
                        </div>
                      </div>
                      
                      {total > 0 && (
                        <Progress value={(sentCount / total) * 100} className="h-2" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistoryDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Detalhes da Campanha */}
      <Dialog open={showCampaignDetailsDialog} onOpenChange={setShowCampaignDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowCampaignDetailsDialog(false)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <DialogTitle>{selectedCampaignDetails?.name || 'Detalhes da Campanha'}</DialogTitle>
                <DialogDescription>
                  {selectedCampaignDetails?.executedAt 
                    ? `Enviada em ${formatCampaignDateTime(selectedCampaignDetails.executedAt)}`
                    : 'Detalhes dos números enviados'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          {selectedCampaignDetails && (
            <div className="space-y-4">
              {(() => {
                const totalRecipients =
                  selectedCampaignDetails.total_contacts ||
                  selectedCampaignDetails.recipients?.length ||
                  0;
                const sentCount =
                  selectedCampaignDetails.totalSent ||
                  selectedCampaignDetails.sentCount ||
                  selectedCampaignDetails.results?.sent?.length ||
                  0;
                const failedCount =
                  selectedCampaignDetails.totalFailed ||
                  selectedCampaignDetails.failedCount ||
                  selectedCampaignDetails.results?.failed?.length ||
                  0;
                const pendingCount =
                  selectedCampaignDetails.results?.pending?.length ||
                  Math.max(totalRecipients - sentCount - failedCount, 0);

                return (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <Card>
                        <CardContent className="pt-4 text-center">
                          <Users className="mx-auto mb-1 h-5 w-5 text-blue-600" />
                          <p className="text-xl font-bold">{totalRecipients}</p>
                          <p className="text-xs text-muted-foreground">Destinatarios</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4 text-center">
                          <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-green-600" />
                          <p className="text-xl font-bold text-green-600">{sentCount}</p>
                          <p className="text-xs text-muted-foreground">Ja enviados</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4 text-center">
                          <Clock className="mx-auto mb-1 h-5 w-5 text-amber-600" />
                          <p className="text-xl font-bold text-amber-600">{pendingCount}</p>
                          <p className="text-xs text-muted-foreground">Ainda vao enviar</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4 text-center">
                          <XCircle className="mx-auto mb-1 h-5 w-5 text-red-600" />
                          <p className="text-xl font-bold text-red-600">{failedCount}</p>
                          <p className="text-xs text-muted-foreground">Falhas</p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm text-green-700">Ja enviados</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[220px] pr-4">
                            <div className="space-y-2">
                              {selectedCampaignDetails.results?.sent?.length ? (
                                selectedCampaignDetails.results.sent.map((item, idx) => (
                                  <div key={`${item.contactId || item.phone}-${idx}`} className="rounded-xl border bg-background p-3 text-sm">
                                    <p className="font-medium">{item.name || "Sem nome"}</p>
                                    <p className="text-muted-foreground">{formatPhone(item.phone)}</p>
                                  </div>
                                ))
                              ) : (
                                <p className="py-4 text-center text-sm text-muted-foreground">Nenhum envio concluido ainda</p>
                              )}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm text-amber-700">Ainda vao enviar</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[220px] pr-4">
                            <div className="space-y-2">
                              {selectedCampaignDetails.results?.pending?.length ? (
                                selectedCampaignDetails.results.pending.map((item, idx) => (
                                  <div key={`${item.contactId || item.phone}-${idx}`} className="rounded-xl border bg-background p-3 text-sm">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="font-medium">{item.name || "Sem nome"}</p>
                                        <p className="text-muted-foreground">{formatPhone(item.phone)}</p>
                                      </div>
                                      {item.retrying && (
                                        <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                                          <RefreshCw className="mr-1 h-3 w-3" />
                                          Retentativa
                                        </Badge>
                                      )}
                                    </div>
                                    {item.retrying && (
                                      <p className="mt-2 text-xs leading-5 text-orange-700">
                                        {item.retrying.error || "Falha temporaria. Nova tentativa automatica agendada."}
                                        {item.retrying.retryAt ? ` Proxima tentativa: ${formatCampaignDateTime(item.retrying.retryAt)}.` : ""}
                                      </p>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <p className="py-4 text-center text-sm text-muted-foreground">Nenhum numero pendente</p>
                              )}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm text-red-700">Falhas</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[220px] pr-4">
                            <div className="space-y-2">
                              {selectedCampaignDetails.results?.failed?.length ? (
                                selectedCampaignDetails.results.failed.map((item, idx) => (
                                  <div key={`${item.contactId || item.phone}-${idx}`} className="rounded-xl border bg-background p-3 text-sm">
                                    <p className="font-medium">{item.name || "Sem nome"}</p>
                                    <p className="text-muted-foreground">{formatPhone(item.phone)}</p>
                                    <p className="mt-1 text-xs text-red-500">{item.error}</p>
                                  </div>
                                ))
                              ) : (
                                <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma falha registrada</p>
                              )}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                );
              })()}
              {/* Estatísticas */}
              <div className="hidden grid-cols-4 gap-3">
                <Card className="bg-blue-50 dark:bg-blue-900/20">
                  <CardContent className="pt-4 text-center">
                    <Users className="w-6 h-6 mx-auto mb-1 text-blue-600" />
                    <p className="text-xl font-bold">{selectedCampaignDetails.recipients?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Destinatários</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 dark:bg-green-900/20">
                  <CardContent className="pt-4 text-center">
                    <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-green-600" />
                    <p className="text-xl font-bold text-green-600">
                      {selectedCampaignDetails.totalSent || selectedCampaignDetails.sentCount || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Enviados</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 dark:bg-red-900/20">
                  <CardContent className="pt-4 text-center">
                    <XCircle className="w-6 h-6 mx-auto mb-1 text-red-600" />
                    <p className="text-xl font-bold text-red-600">
                      {selectedCampaignDetails.totalFailed || selectedCampaignDetails.failedCount || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Falhas</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 dark:bg-purple-900/20">
                  <CardContent className="pt-4 text-center">
                    <BarChart3 className="w-6 h-6 mx-auto mb-1 text-purple-600" />
                    <p className="text-xl font-bold text-purple-600">
                      {(() => {
                        const sent = selectedCampaignDetails.totalSent || selectedCampaignDetails.sentCount || 0;
                        const total = selectedCampaignDetails.recipients?.length || sent;
                        return total > 0 ? Math.round((sent / total) * 100) : 0;
                      })()}%
                    </p>
                    <p className="text-xs text-muted-foreground">Taxa Sucesso</p>
                  </CardContent>
                </Card>
              </div>

              {/* Mensagem enviada */}
              {selectedCampaignDetails.message && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Mensagem Enviada
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">
                      {selectedCampaignDetails.message}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Lista de números */}
              <div className="hidden md:grid-cols-2 gap-4">
                {/* Enviados com sucesso */}
                <Card className="bg-green-50/50 dark:bg-green-900/10">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Enviados com Sucesso
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-1">
                        {selectedCampaignDetails.results?.sent?.length ? (
                          selectedCampaignDetails.results.sent.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm bg-white dark:bg-background p-2 rounded">
                              <div>
                                {item.name && <span className="font-medium">{item.name} - </span>}
                                <span className="text-muted-foreground">{formatPhone(item.phone)}</span>
                              </div>
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            </div>
                          ))
                        ) : selectedCampaignDetails.recipients?.length ? (
                          // Fallback: mostrar os recipients se não tiver results
                          selectedCampaignDetails.recipients.slice(0, selectedCampaignDetails.totalSent || selectedCampaignDetails.sentCount || 0).map((phone, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm bg-white dark:bg-background p-2 rounded">
                              <div>
                                {selectedCampaignDetails.recipientNames?.[phone] && (
                                  <span className="font-medium">{selectedCampaignDetails.recipientNames[phone]} - </span>
                                )}
                                <span className="text-muted-foreground">{formatPhone(phone)}</span>
                              </div>
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">Sem dados detalhados</p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Falhas */}
                <Card className="bg-red-50/50 dark:bg-red-900/10">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                      <XCircle className="w-4 h-4" />
                      Falhas no Envio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-1">
                        {selectedCampaignDetails.results?.failed?.length ? (
                          selectedCampaignDetails.results.failed.map((item, idx) => (
                            <div key={idx} className="text-sm bg-white dark:bg-background p-2 rounded">
                              <div className="flex items-center justify-between">
                                <div>
                                  {item.name && <span className="font-medium">{item.name} - </span>}
                                  <span className="text-muted-foreground">{formatPhone(item.phone)}</span>
                                </div>
                                <XCircle className="w-4 h-4 text-red-600" />
                              </div>
                              <p className="text-xs text-red-500 mt-1">{item.error}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            {(selectedCampaignDetails.totalFailed || selectedCampaignDetails.failedCount || 0) === 0 
                              ? 'Nenhuma falha registrada' 
                              : 'Sem dados detalhados'}
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Configurações usadas */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Configurações Utilizadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {selectedCampaignDetails.delayProfile === 'humano' ? 'Delay humano' : 
                       selectedCampaignDetails.delayProfile === 'conservador' ? 'Conservador' : 
                       'Normal'}
                    </Badge>
                    {selectedCampaignDetails.useAiVariation && (
                      <Badge variant="outline" className="bg-purple-50">
                        <Sparkles className="w-3 h-3 mr-1" />
                        Variacao IA
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampaignDetailsDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Detalhes da Lista */}
      <Dialog open={showListDetailsDialog} onOpenChange={setShowListDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookUser className="w-5 h-5" />
              {selectedListDetails?.name || 'Detalhes da Lista'}
            </DialogTitle>
            <DialogDescription>
              {selectedListDetails?.description || 'Visualize os contatos desta lista'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedListDetails && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm">Total de contatos:</span>
                <Badge>{selectedListDetails.contacts?.length || 0}</Badge>
              </div>
              
              <ScrollArea className="h-[400px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedListDetails.contacts?.map((contact, idx) => (
                      <TableRow key={contact.id || idx}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{contact.name || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{formatPhone(contact.phone)}</TableCell>
                      </TableRow>
                    ))}
                    {(!selectedListDetails.contacts || selectedListDetails.contacts.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          Nenhum contato nesta lista
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowListDetailsDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        destination={importDestination}
        onSuccess={(contacts) => {
          if (contacts?.length) {
            if (importDestination === 'mass-send') {
              const lines = contacts.map(c => `${c.name}, ${c.phone}`).join('\n');
              setManualContacts(prev => prev ? `${prev}\n${lines}` : lines);
              toast({ title: "Contatos importados!", description: `${contacts.length} contatos adicionados.` });
            } else {
              queryClient.invalidateQueries({ queryKey: ['/api/contacts/lists'] });
              toast({ title: "Lista importada!", description: `${contacts.length} contatos importados para nova lista.` });
            }
          }
        }}
      />
    </div>
  );
}
