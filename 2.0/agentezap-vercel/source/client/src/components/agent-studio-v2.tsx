import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Pencil, Image, Settings, History, Send, MessageSquare, Bot, User,
  Sparkles, Plus, Trash2, ChevronLeft, ChevronRight, Clock, FileText,
  AlertCircle, X, Loader2, ArrowLeft, Save, Play, Zap, Pause, Brain,
  Upload, Music, Video, File, Eye, Check, MoreVertical
} from "lucide-react";
import { repairMojibakeText } from "@shared/mojibake";

interface MediaItem {
  id: string;
  name: string;
  mediaType: 'image' | 'audio' | 'video' | 'document';
  storageUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  durationSeconds?: number;
  description?: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isPtt?: boolean;
  sendAlone?: boolean;
  isActive: boolean;
  displayOrder: number;
}

interface AgentConfig {
  id: string;
  prompt: string;
  isActive: boolean;
  model: string;
  triggerPhrases: string[];
  messageSplitChars: number;
  responseDelaySeconds: number;
  fetchHistoryOnFirstResponse: boolean;
  pauseOnManualReply: boolean;
}

interface PromptVersion {
  id: string;
  prompt: string;
  versionNumber: number;
  createdAt: string;
  changeDescription?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

type Section = 'editor' | 'media' | 'config' | 'history';
type EditorMode = 'edit' | 'test';

export function AgentStudioV2() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State principal
  const [activeSection, setActiveSection] = useState<Section>('editor');
  const [editorMode, setEditorMode] = useState<EditorMode>('edit');
  const [prompt, setPrompt] = useState("");
  const [editRequest, setEditRequest] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  
  // Simulator state
  const [testMessages, setTestMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [testInput, setTestInput] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Config state
  const [responseDelaySeconds, setResponseDelaySeconds] = useState(30);
  const [messageSplitChars, setMessageSplitChars] = useState(400);
  const [triggerPhrases, setTriggerPhrases] = useState<string[]>([]);
  const [newTriggerPhrase, setNewTriggerPhrase] = useState("");
  const [fetchHistoryOnFirstResponse, setFetchHistoryOnFirstResponse] = useState(true);
  const [pauseOnManualReply, setPauseOnManualReply] = useState(true);
  
  // Media state
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);
  const [mediaForm, setMediaForm] = useState({
    name: "",
    description: "",
    whenToUse: "",
    caption: "",
    isPtt: false,
    sendAlone: false
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: config, isLoading: configLoading } = useQuery<AgentConfig>({
    queryKey: ["/api/agent/config"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/config");
      return res.json();
    }
  });

  const { data: mediaItems = [], isLoading: mediaLoading } = useQuery<MediaItem[]>({
    queryKey: ["/api/agent/media"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/media");
      return res.json();
    }
  });

  const { data: versionsData, isLoading: versionsLoading } = useQuery<{versions: PromptVersion[]}>({
    queryKey: ["/api/agent/prompt-versions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/prompt-versions");
      return res.json();
    }
  });

  const { data: chatHistoryData } = useQuery<{messages: ChatMessage[]}>({
    queryKey: ["/api/agent/prompt-chat"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/prompt-chat");
      return res.json();
    }
  });

  // Mutations
  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<AgentConfig>) => {
      const res = await apiRequest("POST", "/api/agent/config", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/prompt-versions"] });
      toast({ title: "Salvo!", description: "Configurações atualizadas com sucesso." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao salvar configurações.", variant: "destructive" });
    }
  });

  const editWithAIMutation = useMutation({
    mutationFn: async (data: { currentPrompt: string; editRequest: string }) => {
      const res = await apiRequest("POST", "/api/agent/edit-prompt", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.newPrompt) {
        setPrompt(repairMojibakeText(data.newPrompt));
        toast({ title: "Prompt editado!", description: "A IA modificou seu prompt." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/agent/prompt-chat"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao editar com IA.", variant: "destructive" });
    }
  });

  const uploadMediaMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/agent/media", {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      toast({ title: "Mídia salva!", description: "Arquivo adicionado à biblioteca." });
      closeMediaDialog();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao fazer upload.", variant: "destructive" });
    }
  });

  const updateMediaMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<MediaItem> }) => {
      const res = await apiRequest("PUT", `/api/agent/media/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      toast({ title: "Atualizado!", description: "Mídia atualizada com sucesso." });
      closeMediaDialog();
    }
  });

  const deleteMediaMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/agent/media/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      toast({ title: "Removido!", description: "Mídia removida da biblioteca." });
    }
  });

  // Effects
  useEffect(() => {
    if (config) {
      setPrompt(repairMojibakeText(config.prompt || ""));
      setResponseDelaySeconds(config.responseDelaySeconds || 30);
      setMessageSplitChars(config.messageSplitChars || 400);
      setTriggerPhrases(config.triggerPhrases || []);
      setFetchHistoryOnFirstResponse(config.fetchHistoryOnFirstResponse ?? true);
      setPauseOnManualReply(config.pauseOnManualReply ?? true);
    }
  }, [config]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [testMessages]);

  // Handlers
  const handleSavePrompt = () => {
    updateConfigMutation.mutate({ prompt: repairMojibakeText(prompt) });
  };

  const handleEditWithAI = () => {
    if (!editRequest.trim()) return;
    setIsEditing(true);
    editWithAIMutation.mutate(
      { currentPrompt: prompt, editRequest },
      { onSettled: () => setIsEditing(false) }
    );
    setEditRequest("");
  };

  const handleSaveConfig = () => {
    updateConfigMutation.mutate({
      responseDelaySeconds,
      messageSplitChars,
      triggerPhrases,
      fetchHistoryOnFirstResponse,
      pauseOnManualReply
    });
  };

  const handleAddTriggerPhrase = () => {
    if (!newTriggerPhrase.trim()) return;
    if (!triggerPhrases.includes(newTriggerPhrase.trim())) {
      setTriggerPhrases([...triggerPhrases, newTriggerPhrase.trim()]);
    }
    setNewTriggerPhrase("");
  };

  const handleRemoveTriggerPhrase = (phrase: string) => {
    setTriggerPhrases(triggerPhrases.filter(p => p !== phrase));
  };

  const handleRestoreVersion = (version: PromptVersion) => {
    setPrompt(repairMojibakeText(version.prompt));
    setActiveSection('editor');
    toast({ title: "Versão restaurada", description: `Versão ${version.versionNumber} carregada no editor.` });
  };

  const handleSimulateMessage = async () => {
    if (!testInput.trim()) return;
    
    const userMsg = testInput.trim();
    setTestMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setTestInput("");
    setIsSimulating(true);

    try {
      const res = await apiRequest("POST", "/api/agent/simulate", {
        message: userMsg,
        prompt: prompt
      });
      const data = await res.json();
      setTestMessages(prev => [...prev, { role: 'assistant', content: data.response || "Sem resposta" }]);
    } catch {
      setTestMessages(prev => [...prev, { role: 'assistant', content: "Erro ao simular resposta." }]);
    } finally {
      setIsSimulating(false);
    }
  };

  const closeMediaDialog = () => {
    setMediaDialogOpen(false);
    setEditingMedia(null);
    setSelectedFile(null);
    setMediaForm({ name: "", description: "", whenToUse: "", caption: "", isPtt: false, sendAlone: false });
  };

  const openNewMediaDialog = () => {
    setEditingMedia(null);
    setMediaForm({ name: "", description: "", whenToUse: "", caption: "", isPtt: false, sendAlone: false });
    setSelectedFile(null);
    setMediaDialogOpen(true);
  };

  const openEditMediaDialog = (media: MediaItem) => {
    setEditingMedia(media);
    setMediaForm({
      name: media.name,
      description: media.description || "",
      whenToUse: media.whenToUse || "",
      caption: media.caption || "",
      isPtt: media.isPtt || false,
      sendAlone: media.sendAlone || false
    });
    setMediaDialogOpen(true);
  };

  const handleMediaSubmit = async () => {
    if (editingMedia) {
      updateMediaMutation.mutate({
        id: editingMedia.id,
        data: {
          name: mediaForm.name,
          description: mediaForm.description,
          whenToUse: mediaForm.whenToUse,
          caption: mediaForm.caption,
          isPtt: mediaForm.isPtt,
          sendAlone: mediaForm.sendAlone
        }
      });
    } else {
      if (!selectedFile) {
        toast({ title: "Selecione um arquivo", variant: "destructive" });
        return;
      }
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("name", mediaForm.name || selectedFile.name);
      formData.append("description", mediaForm.description);
      formData.append("whenToUse", mediaForm.whenToUse);
      formData.append("caption", mediaForm.caption);
      formData.append("isPtt", String(mediaForm.isPtt));
      formData.append("sendAlone", String(mediaForm.sendAlone));
      uploadMediaMutation.mutate(formData);
    }
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="h-5 w-5" />;
      case 'audio': return <Music className="h-5 w-5" />;
      case 'video': return <Video className="h-5 w-5" />;
      default: return <File className="h-5 w-5" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Mobile: Tela cheia para Testar
  if (editorMode === 'test' && activeSection === 'editor') {
    return (
      <div className="flex flex-col h-[calc(100vh-120px)] md:h-auto">
        {/* Header compacto mobile */}
        <div className="flex items-center justify-between p-3 border-b bg-background">
          <Button variant="ghost" size="sm" onClick={() => setEditorMode('edit')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Voltar</span>
          </Button>
          <h2 className="font-semibold text-sm">Simulador</h2>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setTestMessages([])}
            disabled={testMessages.length === 0}
          >
            Limpar
          </Button>
        </div>

        {/* Messages - área expansível */}
        <ScrollArea className="flex-1 p-4">
          {testMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Bot className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Envie uma mensagem para testar seu agente
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {testMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                    msg.role === 'user' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              {isSimulating && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl px-4 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input fixo no fundo */}
        <div className="p-3 border-t bg-background">
          <div className="flex gap-2">
            <Input
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="Digite uma mensagem..."
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSimulateMessage()}
              disabled={isSimulating}
              className="flex-1"
            />
            <Button onClick={handleSimulateMessage} disabled={isSimulating || !testInput.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header Compacto - UMA linha só */}
      <div className="flex items-center gap-2 p-2 border-b bg-background overflow-x-auto">
        <Button
          variant={activeSection === 'editor' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveSection('editor')}
          className="shrink-0"
        >
          <Pencil className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Editor</span>
        </Button>
        <Button
          variant={activeSection === 'media' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveSection('media')}
          className="shrink-0"
        >
          <Image className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Mídias</span>
        </Button>
        <Button
          variant={activeSection === 'config' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveSection('config')}
          className="shrink-0"
        >
          <Settings className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Config</span>
        </Button>
        <Button
          variant={activeSection === 'history' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveSection('history')}
          className="shrink-0"
        >
          <History className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Histórico</span>
        </Button>
        
        <div className="flex-1" />
        
        {activeSection === 'editor' && (
          <div className="flex gap-1 shrink-0">
            <Button
              variant={editorMode === 'edit' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setEditorMode('edit')}
            >
              <Pencil className="h-3 w-3 mr-1" />
              Editar
            </Button>
            <Button
              variant={editorMode === 'test' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setEditorMode('test')}
            >
              <Play className="h-3 w-3 mr-1" />
              Testar
            </Button>
          </div>
        )}
      </div>

      {/* Conteúdo Principal */}
      <div className="flex-1 overflow-auto">
        {/* SECTION: EDITOR */}
        {activeSection === 'editor' && (
          <div className="p-4 space-y-4">
            {/* Prompt Principal */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Prompt do Agente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Descreva como seu agente deve se comportar..."
                  className="min-h-[200px] resize-y"
                />
                <Button onClick={handleSavePrompt} disabled={updateConfigMutation.isPending}>
                  {updateConfigMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar Prompt
                </Button>
              </CardContent>
            </Card>

            {/* Editar com IA */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-yellow-500" />
                  Editar com IA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={editRequest}
                  onChange={(e) => setEditRequest(e.target.value)}
                  placeholder="Ex: Adicione mais emojis, seja mais formal, inclua saudação..."
                  className="min-h-[80px]"
                />
                <Button 
                  onClick={handleEditWithAI} 
                  disabled={isEditing || !editRequest.trim()}
                  variant="secondary"
                >
                  {isEditing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Aplicar Edição
                </Button>

                {/* Chat history */}
                {chatHistoryData?.messages && chatHistoryData.messages.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <p className="text-sm text-muted-foreground mb-2">Histórico de edições:</p>
                    <ScrollArea className="max-h-48">
                      <div className="space-y-2">
                        {chatHistoryData.messages.slice(-6).map((msg: ChatMessage) => (
                          <div key={msg.id} className={`text-sm p-2 rounded ${
                            msg.role === 'user' ? 'bg-muted' : 'bg-primary/10'
                          }`}>
                            <span className="font-medium">
                              {msg.role === 'user' ? 'Você: ' : 'IA: '}
                            </span>
                            {(msg.content || '').substring(0, 100)}...
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* SECTION: MÍDIAS */}
        {activeSection === 'media' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Biblioteca de Mídias</h2>
              <Button onClick={openNewMediaDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar
              </Button>
            </div>

            {mediaLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : mediaItems.length === 0 ? (
              <Card className="py-12">
                <CardContent className="flex flex-col items-center text-center">
                  <Image className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Nenhuma mídia cadastrada ainda
                  </p>
                  <Button onClick={openNewMediaDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar primeira mídia
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {mediaItems.map((media) => (
                  <Card key={media.id} className="overflow-hidden">
                    <div className="aspect-video bg-muted flex items-center justify-center relative">
                      {media.mediaType === 'image' && media.storageUrl ? (
                        <img 
                          src={media.storageUrl} 
                          alt={media.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          {getMediaIcon(media.mediaType)}
                          <span className="text-xs">{media.mediaType}</span>
                        </div>
                      )}
                      <Badge className="absolute top-2 right-2 text-xs">
                        {media.mediaType}
                      </Badge>
                    </div>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{media.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(media.fileSize)}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => openEditMediaDialog(media)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive"
                            onClick={() => deleteMediaMutation.mutate(media.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {media.whenToUse && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {media.whenToUse}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Media Dialog */}
            <Dialog open={mediaDialogOpen} onOpenChange={setMediaDialogOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {editingMedia ? 'Editar Mídia' : 'Nova Mídia'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingMedia 
                      ? 'Atualize as informações da mídia'
                      : 'Adicione uma nova mídia à biblioteca do agente'
                    }
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  {!editingMedia && (
                    <div>
                      <Label>Arquivo</Label>
                      <div 
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {selectedFile ? (
                          <div className="flex items-center justify-center gap-2">
                            <Check className="h-5 w-5 text-green-500" />
                            <span className="text-sm">{selectedFile.name}</span>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              Clique para selecionar arquivo
                            </p>
                          </>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>Nome</Label>
                    <Input
                      value={mediaForm.name}
                      onChange={(e) => setMediaForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Nome da mídia"
                    />
                  </div>

                  <div>
                    <Label>Quando usar</Label>
                    <Textarea
                      value={mediaForm.whenToUse}
                      onChange={(e) => setMediaForm(prev => ({ ...prev, whenToUse: e.target.value }))}
                      placeholder="Ex: Enviar quando cliente perguntar sobre preços"
                      className="min-h-[60px]"
                    />
                  </div>

                  <div>
                    <Label>Legenda (caption)</Label>
                    <Input
                      value={mediaForm.caption}
                      onChange={(e) => setMediaForm(prev => ({ ...prev, caption: e.target.value }))}
                      placeholder="Texto enviado junto com a mídia"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Enviar sozinho</Label>
                      <p className="text-xs text-muted-foreground">
                        Enviar mídia sem texto adicional
                      </p>
                    </div>
                    <Switch
                      checked={mediaForm.sendAlone}
                      onCheckedChange={(v) => setMediaForm(prev => ({ ...prev, sendAlone: v }))}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={closeMediaDialog}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleMediaSubmit}
                    disabled={uploadMediaMutation.isPending || updateMediaMutation.isPending}
                  >
                    {(uploadMediaMutation.isPending || updateMediaMutation.isPending) && (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    )}
                    {editingMedia ? 'Atualizar' : 'Adicionar'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* SECTION: CONFIGURAÇÕES */}
        {activeSection === 'config' && (
          <div className="p-4 space-y-4">
            <h2 className="text-lg font-semibold">Configurações do Agente</h2>

            {/* Tempo de Resposta */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Tempo de Resposta
                </CardTitle>
                <CardDescription>
                  Delay antes de enviar resposta (simula digitação)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={responseDelaySeconds === 10 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setResponseDelaySeconds(10)}
                  >
                    <Zap className="h-3 w-3 mr-1" />
                    Rápido (10s)
                  </Button>
                  <Button
                    variant={responseDelaySeconds === 30 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setResponseDelaySeconds(30)}
                  >
                    Normal (30s)
                  </Button>
                  <Button
                    variant={responseDelaySeconds === 60 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setResponseDelaySeconds(60)}
                  >
                    Lento (60s)
                  </Button>
                </div>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[responseDelaySeconds]}
                    onValueChange={([v]) => setResponseDelaySeconds(v)}
                    min={5}
                    max={120}
                    step={5}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-12 text-right">{responseDelaySeconds}s</span>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    💡 Recomendado: 20-40 segundos para parecer mais natural
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Tamanho das Mensagens */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Tamanho das Mensagens
                </CardTitle>
                <CardDescription>
                  Dividir mensagens longas em partes menores
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={messageSplitChars === 200 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMessageSplitChars(200)}
                  >
                    Pequeno (200)
                  </Button>
                  <Button
                    variant={messageSplitChars === 400 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMessageSplitChars(400)}
                  >
                    Médio (400)
                  </Button>
                  <Button
                    variant={messageSplitChars === 600 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMessageSplitChars(600)}
                  >
                    Grande (600)
                  </Button>
                  <Button
                    variant={messageSplitChars === 0 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMessageSplitChars(0)}
                  >
                    Sem divisão
                  </Button>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    💬 Mensagens divididas parecem mais naturais no WhatsApp
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Frases Gatilho */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Frases Gatilho
                </CardTitle>
                <CardDescription>
                  A IA só responde se a mensagem contiver uma dessas frases
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={newTriggerPhrase}
                    onChange={(e) => setNewTriggerPhrase(e.target.value)}
                    placeholder="Ex: olá, quero saber, quanto custa"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTriggerPhrase()}
                  />
                  <Button onClick={handleAddTriggerPhrase} disabled={!newTriggerPhrase.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {triggerPhrases.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {triggerPhrases.map((phrase, i) => (
                      <Badge key={i} variant="secondary" className="pl-2 pr-1 py-1">
                        {phrase}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 ml-1"
                          onClick={() => handleRemoveTriggerPhrase(phrase)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sem frases gatilho = IA responde a todas mensagens
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Memória de Conversas */}
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Brain className="h-4 w-4" />
                      Memória de Conversas
                    </CardTitle>
                    <CardDescription>
                      Buscar histórico na primeira resposta
                    </CardDescription>
                  </div>
                  <Switch
                    checked={fetchHistoryOnFirstResponse}
                    onCheckedChange={setFetchHistoryOnFirstResponse}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                  <p className="text-sm text-purple-800 dark:text-purple-200">
                    🧠 Quando ativo, a IA lembra do contexto de conversas anteriores
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Pausar ao Responder Manualmente */}
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Pause className="h-4 w-4" />
                      Pausar IA ao Responder Manualmente
                    </CardTitle>
                    <CardDescription>
                      Desativa IA quando você responde
                    </CardDescription>
                  </div>
                  <Switch
                    checked={pauseOnManualReply}
                    onCheckedChange={setPauseOnManualReply}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                  <p className="text-sm text-orange-800 dark:text-orange-200">
                    ⏸️ Quando você envia uma mensagem manual, a IA para de responder naquela conversa
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Botão Salvar */}
            <Button 
              onClick={handleSaveConfig} 
              disabled={updateConfigMutation.isPending}
              className="w-full"
              size="lg"
            >
              {updateConfigMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Configurações
            </Button>
          </div>
        )}

        {/* SECTION: HISTÓRICO */}
        {activeSection === 'history' && (
          <div className="p-4 space-y-4">
            <h2 className="text-lg font-semibold">Histórico de Versões</h2>
            
            {versionsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : versionsData?.versions?.length === 0 ? (
              <Card className="py-12">
                <CardContent className="flex flex-col items-center text-center">
                  <History className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Nenhuma versão salva ainda
                  </p>
                  <p className="text-sm text-muted-foreground">
                    As versões são criadas automaticamente ao salvar
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {versionsData?.versions?.map((version: PromptVersion) => (
                  <Card key={version.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">v{version.versionNumber}</Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(version.createdAt).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {(version.prompt || '').substring(0, 150)}...
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestoreVersion(version)}
                        >
                          Restaurar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
