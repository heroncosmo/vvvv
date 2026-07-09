import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import AdminWhatsAppSimulator from "@/components/admin-whatsapp-simulator";
import { repairMojibakeText } from "@shared/mojibake";
import { 
  Bot, Sparkles, TestTube, Save, AlertCircle, CheckCircle2, 
  Plus, X, Zap, Settings2, Image as ImageIcon, Music, Video, 
  FileText, Upload, Trash2, Edit2, Loader2, RefreshCw, Check,
  Clock, Filter, Info, ArrowRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ============== TIPOS ==============
interface AdminAgentMedia {
  id: string;
  adminId: string;
  name: string;
  mediaType: "audio" | "image" | "video" | "document";
  storageUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationSeconds?: number;
  description: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isActive: boolean;
  sendAlone: boolean;
  displayOrder: number;
  createdAt: string;
}

interface AdminAgentConfig {
  prompt: string;
  isActive: boolean;
  triggerPhrases: string[];
  messageSplitChars: number;
  responseDelaySeconds: number;
  typingDelayMin: number;
  typingDelayMax: number;
  messageIntervalMin: number;
  messageIntervalMax: number;
  model: string;
  promptStyle: string;
}

interface MediaFormData {
  name: string;
  mediaType: "audio" | "image" | "video" | "document";
  storageUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  description: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isActive: boolean;
  sendAlone: boolean;
}

const initialMediaForm: MediaFormData = {
  name: "",
  mediaType: "audio",
  storageUrl: "",
  fileName: "",
  description: "",
  whenToUse: "",
  caption: "",
  transcription: "",
  isActive: true,
  sendAlone: false,
};

const mediaTypeIcons = {
  audio: Music,
  image: ImageIcon,
  video: Video,
  document: FileText,
};

// ============== COMPONENTE PRINCIPAL ==============
export default function AdminAgentConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Extrair sub-tab da URL
  const getSubTabFromUrl = () => {
    const hash = window.location.hash.replace('#', '');
    const parts = hash.split('/');
    return parts[1] || 'atendimento';
  };
  
  const [activeTab, setActiveTab] = useState(getSubTabFromUrl);

  // Atualizar sub-aba se o hash mudar (back/forward ou deep link)
  useEffect(() => {
    const onHashChange = () => setActiveTab(getSubTabFromUrl());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  
  // Sincronizar sub-aba com URL
  const handleSubTabChange = (tab: string) => {
    setActiveTab(tab);
    window.history.replaceState(null, '', `/admin#agent/${tab}`);
  };
  
  // Estado do formulário principal
  const [prompt, setPrompt] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [triggerPhrases, setTriggerPhrases] = useState<string[]>([]);
  const [newTriggerPhrase, setNewTriggerPhrase] = useState("");
  const [messageSplitChars, setMessageSplitChars] = useState(400);
  const [responseDelaySeconds, setResponseDelaySeconds] = useState(30);
  const [model, setModel] = useState("mistral-medium-latest");
  const [promptStyle, setPromptStyle] = useState("nuclear");
  
  // Delays humanizados
  const [typingDelayMin, setTypingDelayMin] = useState(2);
  const [typingDelayMax, setTypingDelayMax] = useState(5);
  const [messageIntervalMin, setMessageIntervalMin] = useState(3);
  const [messageIntervalMax, setMessageIntervalMax] = useState(8);
  
  // Estado do atendimento automatizado (config adicional)
  const [ownerNotificationNumber, setOwnerNotificationNumber] = useState("5517991956944");
  const [isAdminWhatsAppConnected, setIsAdminWhatsAppConnected] = useState(false);
  
  // Estado do teste
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  
  // Estado da biblioteca de mídias
  const [mediaList, setMediaList] = useState<AdminAgentMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<AdminAgentMedia | null>(null);
  const [mediaForm, setMediaForm] = useState<MediaFormData>(initialMediaForm);
  const [savingMedia, setSavingMedia] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Query de configuração
  const { data: config, isLoading } = useQuery<AdminAgentConfig | null>({
    queryKey: ["/api/admin/agent/config"],
  });

  // Query de configuração do atendimento automatizado
  const { data: autoAtendimentoConfig } = useQuery<{
    enabled: boolean;
    prompt: string;
    ownerNotificationNumber: string;
  }>({
    queryKey: ["/api/admin/auto-atendimento/config"],
  });

  // Query de status do WhatsApp admin
  const { data: whatsappConnection } = useQuery<{ isConnected: boolean }>({
    queryKey: ["/api/admin/whatsapp/connection"],
    refetchInterval: 10000,
  });

  // Carregar configuração do atendimento automatizado
  useEffect(() => {
    if (autoAtendimentoConfig) {
      setOwnerNotificationNumber(autoAtendimentoConfig.ownerNotificationNumber || "5517991956944");
    }
  }, [autoAtendimentoConfig]);

  // Atualizar status do WhatsApp
  useEffect(() => {
    if (whatsappConnection) {
      setIsAdminWhatsAppConnected(whatsappConnection.isConnected);
    }
  }, [whatsappConnection]);

  // Handler adicional do atendimento automatizado

  const handleSaveNotificationNumber = async () => {
    try {
      await fetch("/api/admin/auto-atendimento/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ownerNotificationNumber }),
      });
      toast({ title: "Número salvo!", description: "Você receberá notificações de pagamento neste número." });
    } catch (error) {
      toast({ title: "Erro ao salvar número", variant: "destructive" });
    }
  };

  // Carregar configuração
  useEffect(() => {
    if (config) {
      setPrompt(repairMojibakeText(config.prompt || ""));
      setIsActive(config.isActive || false);
      setTriggerPhrases(config.triggerPhrases || []);
      setMessageSplitChars(config.messageSplitChars ?? 400);
      setResponseDelaySeconds(config.responseDelaySeconds ?? 30);
      setModel(config.model || "mistral-medium-latest");
      setPromptStyle(config.promptStyle || "nuclear");
      setTypingDelayMin(config.typingDelayMin ?? 2);
      setTypingDelayMax(config.typingDelayMax ?? 5);
      setMessageIntervalMin(config.messageIntervalMin ?? 3);
      setMessageIntervalMax(config.messageIntervalMax ?? 8);
    }
  }, [config]);

  // Carregar mídias
  const fetchMediaList = useCallback(async () => {
    try {
      setLoadingMedia(true);
      const response = await fetch("/api/admin/agent/media", {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setMediaList(data);
      }
    } catch (error) {
      console.error("Error fetching admin agent media:", error);
    } finally {
      setLoadingMedia(false);
    }
  }, []);

  useEffect(() => {
    fetchMediaList();
  }, [fetchMediaList]);

  // Mutation para salvar config
  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
        prompt: repairMojibakeText(prompt),
          isActive,
          triggerPhrases,
          messageSplitChars,
          responseDelaySeconds,
          typingDelayMin,
          typingDelayMax,
          messageIntervalMin,
          messageIntervalMax,
          model,
          promptStyle,
        }),
      });
      if (!response.ok) throw new Error("Failed to save config");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/config"] });
      toast({
        title: "✅ Configuração Salva",
        description: "O agente do administrador foi atualizado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle rápido (não exige salvar todo o formulário)
  const toggleActiveMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await fetch("/api/admin/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: enabled }),
      });
      if (!response.ok) throw new Error("Failed to update active state");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auto-atendimento/config"] });
    },
    onError: (error: Error, enabled: boolean) => {
      setIsActive(!enabled);
      toast({
        title: "Erro ao alterar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para testar
  const testAgentMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/agent/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: testMessage }),
      });
      if (!response.ok) throw new Error("Failed to test agent");
      return response.json();
    },
    onSuccess: (data: any) => {
      setTestResponse(data?.response || "Sem resposta");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao testar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ============== FUNÇÕES DE MÍDIA ==============
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setMediaForm(prev => ({
        ...prev,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        storageUrl: "",
      }));
    }
  };

  const uploadSelectedFile = async () => {
    if (!selectedFile) return null;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/admin/agent/media/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      
      if (data.transcription && !mediaForm.transcription) {
        setMediaForm(prev => ({ ...prev, transcription: data.transcription }));
      }
      
      setSelectedFile(null);
      return data;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleNewMedia = () => {
    setEditingMedia(null);
    setMediaForm({ ...initialMediaForm });
    setSelectedFile(null);
    setIsMediaDialogOpen(true);
  };

  const handleEditMedia = (media: AdminAgentMedia) => {
    setEditingMedia(media);
    setMediaForm({
      name: media.name,
      mediaType: media.mediaType,
      storageUrl: media.storageUrl,
      fileName: media.fileName || "",
      fileSize: media.fileSize,
      mimeType: media.mimeType || "",
      description: media.description,
      whenToUse: media.whenToUse || "",
      caption: media.caption || "",
      transcription: media.transcription || "",
      isActive: media.isActive,
      sendAlone: media.sendAlone || false,
    });
    setSelectedFile(null);
    setIsMediaDialogOpen(true);
  };

  const handleSaveMedia = async () => {
    try {
      setSavingMedia(true);
      
      if (!mediaForm.name.trim() || !mediaForm.description.trim()) {
        toast({ title: "Erro", description: "Nome e descrição são obrigatórios", variant: "destructive" });
        return;
      }

      if (!mediaForm.storageUrl.trim() && !selectedFile) {
        toast({ title: "Erro", description: "Selecione um arquivo", variant: "destructive" });
        return;
      }

      let uploadData = null;
      if (selectedFile) {
        uploadData = await uploadSelectedFile();
        if (!uploadData) throw new Error("Upload failed");
      }

      const dataToSave = {
        ...mediaForm,
        storageUrl: uploadData?.storageUrl || mediaForm.storageUrl,
        fileName: uploadData?.fileName || mediaForm.fileName,
        fileSize: uploadData?.fileSize ?? mediaForm.fileSize,
        mimeType: uploadData?.mimeType || mediaForm.mimeType,
        mediaType: uploadData?.mediaType || mediaForm.mediaType,
        name: mediaForm.name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, ''),
      };

      const url = editingMedia ? `/api/admin/agent/media/${editingMedia.id}` : "/api/admin/agent/media";
      const method = editingMedia ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(dataToSave),
      });

      if (response.ok) {
        toast({ title: "Sucesso", description: editingMedia ? "Mídia atualizada!" : "Mídia adicionada!" });
        setIsMediaDialogOpen(false);
        fetchMediaList();
      } else {
        throw new Error("Failed to save");
      }
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setSavingMedia(false);
    }
  };

  const handleDeleteMedia = async (media: AdminAgentMedia) => {
    if (!confirm(`Excluir "${media.name}"?`)) return;
    
    try {
      await fetch(`/api/admin/agent/media/${media.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast({ title: "Sucesso", description: "Mídia excluída!" });
      fetchMediaList();
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao excluir", variant: "destructive" });
    }
  };

  const handleTranscribe = async () => {
    if (!mediaForm.storageUrl || mediaForm.mediaType !== "audio") return;
    
    try {
      setTranscribing(true);
      const response = await fetch("/api/admin/agent/media/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          audioUrl: mediaForm.storageUrl,
          mimeType: mediaForm.mimeType || "audio/ogg",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMediaForm(prev => ({
          ...prev,
          transcription: data.transcription,
          description: prev.description || data.transcription.substring(0, 200),
        }));
        toast({ title: "Sucesso", description: "Áudio transcrito!" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Falha na transcrição", variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  };

  // Calcular progresso de configuração (Nuclear 20.0: prompt fixo no código)
  const configProgress = [
    isActive,
    mediaList.length > 0,
  ].filter(Boolean).length;
  const progressPercent = (configProgress / 2) * 100;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ============== HEADER COM PROGRESSO ============== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Agente IA do Admin</h2>
              <p className="text-muted-foreground">
                Configure o assistente que responderá no WhatsApp do administrador
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Badge
              variant={isActive ? "default" : "secondary"}
              className={`gap-2 px-4 py-2 text-sm ${isActive ? 'bg-green-500 hover:bg-green-600' : ''}`}
            >
              {isActive ? (
                <><CheckCircle2 className="w-4 h-4" /> Ativo</>
              ) : (
                <><AlertCircle className="w-4 h-4" /> Inativo</>
              )}
            </Badge>
            <Switch
              checked={isActive}
              onCheckedChange={(enabled) => {
                setIsActive(enabled);
                toggleActiveMutation.mutate(enabled);
              }}
              className="scale-125"
            />
          </div>
        </div>

        {/* Barra de Progresso */}
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progresso da configuração</span>
                <span className="font-medium">{configProgress}/2 etapas</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
            <div className="flex gap-2">
              {[
                { done: isActive, label: "Ativado" },
                { done: mediaList.length > 0, label: "Mídias" },
              ].map((step, i) => (
                <Badge
                  key={i}
                  variant={step.done ? "default" : "outline"}
                  className={`text-xs ${step.done ? 'bg-green-500' : ''}`}
                >
                  {step.done && <Check className="w-3 h-3 mr-1" />}
                  {step.label}
                </Badge>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ============== TABS PRINCIPAIS ============== */}
      <Tabs value={activeTab} onValueChange={handleSubTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-14">
          <TabsTrigger value="atendimento" className="gap-2 text-sm">
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">Atendimento</span>
          </TabsTrigger>
          <TabsTrigger value="media" className="gap-2 text-sm">
            <ImageIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Mídias</span>
            {mediaList.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{mediaList.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2 text-sm">
            <Settings2 className="w-4 h-4" />
            <span className="hidden sm:inline">Configurações</span>
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-2 text-sm">
            <TestTube className="w-4 h-4" />
            <span className="hidden sm:inline">Testar</span>
          </TabsTrigger>
        </TabsList>

        {/* ============== ABA: ATENDIMENTO AUTOMATIZADO ============== */}
        <TabsContent value="atendimento" className="space-y-4">
          <Card className="p-6">
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Zap className="w-5 h-5 text-green-500" />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-lg font-semibold">Atendimento Automatizado pelo WhatsApp</Label>
                  <p className="text-sm text-muted-foreground">
                    Configure o agente Rodrigo para atender clientes, criar contas, configurar agentes e processar pagamentos automaticamente.
                  </p>
                </div>
              </div>

              {/* Status (o toggle único fica no topo) */}
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div className="space-y-1">
                  <Label className="font-medium">Status do Atendimento Automatizado</Label>
                  <p className="text-xs text-muted-foreground">
                    Use o toggle "Ativo/Inativo" no topo para ligar/desligar o atendimento automático.
                  </p>
                </div>
                <Badge variant={isActive ? "default" : "secondary"} className={isActive ? 'bg-green-500 hover:bg-green-600' : ''}>
                  {isActive ? "Ativo" : "Inativo"}
                </Badge>
              </div>

              {/* Número para notificações */}
              <div className="space-y-2">
                <Label>Número para Notificações de Pagamento</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="5517991956944"
                    value={ownerNotificationNumber}
                    onChange={(e) => setOwnerNotificationNumber(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleSaveNotificationNumber} size="sm">
                    <Save className="w-4 h-4 mr-2" />
                    Salvar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Este número receberá notificações quando um cliente enviar comprovante de pagamento.
                </p>
              </div>

              {/* Instruções do Rodrigo ficam na aba "Instruções" (Prompt) */}

              {/* Fluxo de Atendimento */}
              <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    📋 Fluxo de Atendimento Automatizado
                  </h4>
                  <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
                    <li>Cliente envia mensagem → Rodrigo cumprimenta e oferece ajuda</li>
                    <li>Se quer criar conta → Pede email e configura agente</li>
                    <li>Configuração: Nome do agente, empresa, função e instruções</li>
                    <li>Conexão: QR Code (computador) ou Código de Pareamento (celular)</li>
                    <li>Teste grátis de 24h → Depois cobra R$ 99/mês via PIX</li>
                    <li>Cliente envia comprovante → Você é notificado para liberar</li>
                  </ol>
                </CardContent>
              </Card>

              {/* Status do WhatsApp Admin */}
              <div className="flex items-center gap-2 p-3 rounded-lg border">
                <div className={`w-3 h-3 rounded-full ${isAdminWhatsAppConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm">
                  WhatsApp Admin: {isAdminWhatsAppConnected ? 'Conectado' : 'Desconectado'}
                </span>
                {!isAdminWhatsAppConnected && (
                  <span className="text-xs text-muted-foreground">
                    (Conecte o WhatsApp na aba "WhatsApp" para ativar o atendimento)
                  </span>
                )}
              </div>
            </div>
          </Card>

          <AdminWhatsAppSimulator />
        </TabsContent>

        {/* ============== ABA: MÍDIAS ============== */}
        <TabsContent value="media" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Biblioteca de Mídias</h3>
              <p className="text-sm text-muted-foreground">
                Adicione áudios, imagens e vídeos para o agente enviar automaticamente
              </p>
            </div>
            <Button onClick={handleNewMedia}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Mídia
            </Button>
          </div>

          {loadingMedia ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : mediaList.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="p-4 rounded-full bg-primary/10 mb-4">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Nenhuma mídia cadastrada</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                  Adicione áudios, imagens ou vídeos que o agente pode enviar automaticamente.
                </p>
                <Button onClick={handleNewMedia}>
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar primeira mídia
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mediaList.map((media) => {
                const Icon = mediaTypeIcons[media.mediaType];
                return (
                  <Card key={media.id} className={`relative ${!media.isActive ? 'opacity-50' : ''}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-sm font-mono">{media.name}</CardTitle>
                            <Badge variant="secondary" className="text-xs mt-1">
                              {media.mediaType}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEditMedia(media)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteMedia(media)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {media.description}
                      </p>
                      {media.whenToUse && (
                        <p className="text-xs text-muted-foreground italic">
                          📌 {media.whenToUse}
                        </p>
                      )}
                      {media.mediaType === "audio" && media.storageUrl && (
                        <audio controls className="w-full h-8 mt-2" src={media.storageUrl} />
                      )}
                      {media.mediaType === "image" && media.storageUrl && (
                        <img src={media.storageUrl} alt={media.name} className="w-full h-20 object-cover rounded mt-2" />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ============== ABA: CONFIGURAÇÕES ============== */}
        <TabsContent value="settings" className="space-y-4">
          {/* Tempo de Resposta */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <Label className="text-base font-semibold">Tempo de Resposta</Label>
                  <p className="text-sm text-muted-foreground">
                    Aguarda antes de responder para acumular mensagens do cliente
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Input
                  type="number"
                  min={5}
                  max={120}
                  step={5}
                  value={responseDelaySeconds}
                  onChange={(e) => setResponseDelaySeconds(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">segundos</span>
                <div className="flex gap-2">
                  {[
                    { value: 10, label: "Rápido" },
                    { value: 30, label: "Normal" },
                    { value: 60, label: "Lento" },
                  ].map((opt) => (
                    <Button
                      key={opt.value}
                      variant={responseDelaySeconds === opt.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setResponseDelaySeconds(opt.value)}
                    >
                      {opt.label} ({opt.value}s)
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Modelo de IA */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <Label className="text-base font-semibold">Modelo de IA</Label>
                  <p className="text-sm text-muted-foreground">
                    Escolha qual modelo Mistral usar para gerar respostas
                  </p>
                </div>
              </div>

              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mistral-large-latest">
                    <div className="flex flex-col">
                      <span className="font-medium">Mistral Large</span>
                      <span className="text-xs text-muted-foreground">Mais inteligente, mais lento (~10s)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="mistral-medium-latest">
                    <div className="flex flex-col">
                      <span className="font-medium">Mistral Medium ⭐</span>
                      <span className="text-xs text-muted-foreground">Recomendado - Equilíbrio perfeito (~6s)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="mistral-small-latest">
                    <div className="flex flex-col">
                      <span className="font-medium">Mistral Small</span>
                      <span className="text-xs text-muted-foreground">Mais rápido, econômico (~3s)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ministral-8b-latest">
                    <div className="flex flex-col">
                      <span className="font-medium">Ministral 8B</span>
                      <span className="text-xs text-muted-foreground">Compacto e rápido (~2.8s)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ministral-3b-latest">
                    <div className="flex flex-col">
                      <span className="font-medium">Ministral 3B</span>
                      <span className="text-xs text-muted-foreground">Ultra rápido (~1.5s)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="open-mistral-7b">
                    <div className="flex flex-col">
                      <span className="font-medium">Open Mistral 7B</span>
                      <span className="text-xs text-muted-foreground">Código aberto (~2.5s)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="open-mixtral-8x7b">
                    <div className="flex flex-col">
                      <span className="font-medium">Open Mixtral 8x7B</span>
                      <span className="text-xs text-muted-foreground">Mixture of experts (~3.8s)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="codestral-latest">
                    <div className="flex flex-col">
                      <span className="font-medium">Codestral</span>
                      <span className="text-xs text-muted-foreground">Especializado em código (~2s)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/20">
                  Modelo ativo: {model}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Estilo do Agente */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Bot className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <Label className="text-base font-semibold">Estilo do Agente</Label>
                  <p className="text-sm text-muted-foreground">
                    Escolha a personalidade e o estilo de comunicação do agente
                  </p>
                </div>
              </div>

              <Select value={promptStyle} onValueChange={setPromptStyle}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o estilo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nuclear">
                    <div className="flex flex-col">
                      <span className="font-medium">Vendedor Completo (Nuclear)</span>
                      <span className="text-xs text-muted-foreground">Prompt detalhado, técnicas de vendas avançadas (Padrão)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="human">
                    <div className="flex flex-col">
                      <span className="font-medium">Vendedor Humano/Direto</span>
                      <span className="text-xs text-muted-foreground">Estilo mais curto, direto e natural (Similar ao Testador)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Delay de Digitação Humanizado */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <Zap className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <Label className="text-base font-semibold">Delay de Digitação (Humanizado)</Label>
                  <p className="text-sm text-muted-foreground">
                    Tempo de "digitando..." antes de cada bloco de mensagem
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Mínimo (segundos)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={typingDelayMin}
                      onChange={(e) => setTypingDelayMin(Number(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-muted-foreground">s</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Máximo (segundos)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={2}
                      max={15}
                      value={typingDelayMax}
                      onChange={(e) => setTypingDelayMax(Number(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-muted-foreground">s</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md">
                💡 Delay aleatório entre {typingDelayMin}s e {typingDelayMax}s simula tempo de digitação real.
              </p>
            </div>
          </Card>

          {/* Tamanho das Bolhas */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <Label className="text-base font-semibold">Tamanho das Mensagens</Label>
                  <p className="text-sm text-muted-foreground">
                    Quantos caracteres cada bolha de mensagem pode ter
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  step={50}
                  value={messageSplitChars}
                  onChange={(e) => setMessageSplitChars(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">caracteres</span>
                <div className="flex gap-2">
                  {[
                    { value: 200, label: "Pequeno" },
                    { value: 400, label: "Médio" },
                    { value: 600, label: "Grande" },
                    { value: 0, label: "Sem divisão" },
                  ].map((opt) => (
                    <Button
                      key={opt.value}
                      variant={messageSplitChars === opt.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMessageSplitChars(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Frases Gatilho */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Filter className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <Label className="text-base font-semibold">Frases Gatilho</Label>
                  <p className="text-sm text-muted-foreground">
                    O agente só responde se a conversa contiver estas frases. Deixe vazio para responder todas.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {triggerPhrases.map((phrase, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={phrase}
                      onChange={(e) => {
                        const updated = [...triggerPhrases];
                        updated[index] = e.target.value;
                        setTriggerPhrases(updated);
                      }}
                      placeholder="Ex: quero saber mais"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setTriggerPhrases(triggerPhrases.filter((_, i) => i !== index))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                <div className="flex gap-2">
                  <Input
                    value={newTriggerPhrase}
                    onChange={(e) => setNewTriggerPhrase(e.target.value)}
                    placeholder="Adicionar frase gatilho..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTriggerPhrase.trim()) {
                        setTriggerPhrases([...triggerPhrases, newTriggerPhrase.trim()]);
                        setNewTriggerPhrase("");
                      }
                    }}
                  />
                  <Button
                    onClick={() => {
                      if (newTriggerPhrase.trim()) {
                        setTriggerPhrases([...triggerPhrases, newTriggerPhrase.trim()]);
                        setNewTriggerPhrase("");
                      }
                    }}
                    disabled={!newTriggerPhrase.trim()}
                    variant="outline"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={() => saveConfigMutation.mutate()}
              disabled={saveConfigMutation.isPending}
              size="lg"
            >
              {saveConfigMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar Configurações
            </Button>
          </div>
        </TabsContent>

        {/* ============== ABA: TESTAR ============== */}
        <TabsContent value="test" className="space-y-4">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <TestTube className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <Label className="text-lg font-semibold">Testar Agente</Label>
                  <p className="text-sm text-muted-foreground">
                    Simule uma conversa para ver como o agente responde
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <Textarea
                  placeholder="Digite uma mensagem de teste..."
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={4}
                />

                <Button
                  onClick={() => testAgentMutation.mutate()}
                  disabled={testAgentMutation.isPending || !testMessage.trim()}
                  className="w-full"
                  size="lg"
                >
                  {testAgentMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Enviar Teste
                </Button>

                {testResponse && (
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <Label className="text-sm font-semibold">Resposta do Agente:</Label>
                    <p className="text-sm whitespace-pre-wrap">{testResponse}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============== DIALOG DE MÍDIA ============== */}
      <Dialog open={isMediaDialogOpen} onOpenChange={setIsMediaDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMedia ? "Editar Mídia" : "Nova Mídia"}</DialogTitle>
            <DialogDescription>
              Configure a mídia e sua descrição para que o agente saiba quando usá-la.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label>Nome da Mídia (ID)</Label>
              <Input
                placeholder="Ex: AUDIO_PRECO, IMG_CARDAPIO"
                value={mediaForm.name}
                onChange={(e) => setMediaForm(prev => ({ ...prev, name: e.target.value }))}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">
                Use letras maiúsculas e underscores. A IA usará este nome para identificar a mídia.
              </p>
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo de Mídia</Label>
              <Select
                value={mediaForm.mediaType}
                onValueChange={(value) => setMediaForm(prev => ({ ...prev, mediaType: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audio">🎵 Áudio</SelectItem>
                  <SelectItem value="image">🖼️ Imagem</SelectItem>
                  <SelectItem value="video">🎬 Vídeo</SelectItem>
                  <SelectItem value="document">📄 Documento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Upload */}
            <div className="space-y-2">
              <Label>Arquivo</Label>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept={
                  mediaForm.mediaType === "audio" ? "audio/*" :
                  mediaForm.mediaType === "image" ? "image/*" :
                  mediaForm.mediaType === "video" ? "video/*" : "*/*"
                }
                onChange={handleFileSelect}
              />

              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors`}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm">Enviando...</p>
                  </div>
                ) : selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <Check className="w-8 h-8 text-green-500" />
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button variant="outline" size="sm">Trocar arquivo</Button>
                  </div>
                ) : mediaForm.storageUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <Check className="w-8 h-8 text-green-500" />
                    <p className="text-sm text-green-600">Arquivo pronto</p>
                    <Button variant="outline" size="sm">Trocar arquivo</Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm">Clique para selecionar</p>
                  </div>
                )}
              </div>
            </div>

            {/* Preview de Imagem */}
            {mediaForm.mediaType === "image" && mediaForm.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg overflow-hidden">
                  <img src={mediaForm.storageUrl} alt="Preview" className="w-full max-h-48 object-contain" />
                  <div className="flex gap-2 p-2 bg-muted/30 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Trocar Imagem
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview de Áudio */}
            {mediaForm.mediaType === "audio" && mediaForm.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="p-3 border rounded-lg bg-muted/30">
                  <audio controls className="w-full mb-2" src={mediaForm.storageUrl} />
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleTranscribe(); }} disabled={transcribing}>
                      {transcribing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                      Transcrever
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Trocar Áudio
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "", transcription: "" }));
                        setSelectedFile(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview de Vídeo */}
            {mediaForm.mediaType === "video" && mediaForm.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg overflow-hidden">
                  <video 
                    controls 
                    className="w-full max-h-48 object-contain"
                    src={mediaForm.storageUrl}
                  />
                  <div className="flex gap-2 p-2 bg-muted/30 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Trocar Vídeo
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview de Documento */}
            {mediaForm.mediaType === "document" && mediaForm.storageUrl && (
              <div className="space-y-2">
                <Label>Arquivo</Label>
                <div className="p-3 border rounded-lg bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm truncate max-w-[200px]">{mediaForm.fileName || "Documento"}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Trocar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Transcrição */}
            {mediaForm.mediaType === "audio" && (
              <div className="space-y-2">
                <Label>Transcrição</Label>
                <Textarea
                  placeholder="Transcrição do áudio..."
                  value={mediaForm.transcription}
                  onChange={(e) => setMediaForm(prev => ({ ...prev, transcription: e.target.value }))}
                  rows={2}
                />
              </div>
            )}

            {/* Descrição */}
            <div className="space-y-2">
              <Label>Descrição para a IA *</Label>
              <Textarea
                placeholder="Ex: Áudio explicando os preços dos produtos principais"
                value={mediaForm.description}
                onChange={(e) => setMediaForm(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                A IA usa esta descrição para decidir quando enviar. NÃO é enviada ao cliente.
              </p>
            </div>

            {/* Quando usar */}
            <div className="space-y-2">
              <Label>Quando usar</Label>
              <Textarea
                placeholder="Ex: Quando o cliente perguntar sobre preços"
                value={mediaForm.whenToUse}
                onChange={(e) => setMediaForm(prev => ({ ...prev, whenToUse: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Legenda (só para imagem/vídeo) */}
            {(mediaForm.mediaType === "image" || mediaForm.mediaType === "video") && (
              <div className="space-y-2">
                <Label>Legenda da Mídia</Label>
                <Textarea
                  placeholder="Ex: 📍 Nossa localização! Estamos na Av. Principal, 123"
                  value={mediaForm.caption}
                  onChange={(e) => setMediaForm(prev => ({ ...prev, caption: e.target.value }))}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Esta legenda será enviada junto com a imagem/vídeo no WhatsApp.
                </p>
              </div>
            )}

            {/* Switches */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Mídia ativa</Label>
                  <p className="text-xs text-muted-foreground">Mídias inativas não são usadas pela IA</p>
                </div>
                <Switch
                  checked={mediaForm.isActive}
                  onCheckedChange={(checked) => setMediaForm(prev => ({ ...prev, isActive: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Enviar sozinha</Label>
                  <p className="text-xs text-muted-foreground">Se ativado, não será combinada com outras mídias</p>
                </div>
                <Switch
                  checked={mediaForm.sendAlone}
                  onCheckedChange={(checked) => setMediaForm(prev => ({ ...prev, sendAlone: checked }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMediaDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveMedia} disabled={savingMedia || uploadingFile}>
              {(savingMedia || uploadingFile) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingMedia ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
