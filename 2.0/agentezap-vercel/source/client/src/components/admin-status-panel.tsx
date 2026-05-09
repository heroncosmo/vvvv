import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Edit,
  Play,
  Pause,
  RefreshCw,
  Calendar,
  Repeat,
  Music,
  Image,
  Video,
  FileText,
  Check,
  X,
  Clock,
  Send,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { Media } from "@shared/schema";

export interface Status {
  id: string;
  name: string;
  type: "text" | "image" | "video" | "audio";
  content: string;
  contentUrl?: string;
  duration?: number;
  schedule?: {
    enabled: boolean;
    daysOfWeek: number[]; // 0-6 (Sunday-Saturday)
    time: string; // "HH:MM"
    recurrence: "once" | "daily" | "weekly" | "monthly";
  };
  rotation: {
    enabled: boolean;
    type: "sequential" | "random";
    priority?: number;
  };
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface StatusHistory {
  id: string;
  statusId: string;
  userId: string;
  phoneNumber: string;
  sentAt: string;
  content: string;
  type: string;
  rotationUsed?: string;
}

interface AdminStatusPanelProps {
  onTabChange?: (tab: string) => void;
  defaultSubTab?: string;
  onSubTabChange?: (subTab: string) => void;
}

export default function AdminStatusPanel({ onTabChange, defaultSubTab, onSubTabChange }: AdminStatusPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<Status | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<Status | null>(null);

  // Form states
  const [statusName, setStatusName] = useState("");
  const [statusType, setStatusType] = useState<"text" | "image" | "video" | "audio">("text");
  const [textContent, setTextContent] = useState("");
  const [contentUrl, setContentUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleRecurrence, setScheduleRecurrence] = useState<"once" | "daily" | "weekly" | "monthly">("weekly");
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [rotationType, setRotationType] = useState<"sequential" | "random">("sequential");
  const [rotationPriority, setRotationPriority] = useState("");

  // Query for statuses
  const { data: statuses, isLoading, refetch } = useQuery<Status[]>({
    queryKey: ["/api/admin/statuses"],
  });

  // Query for status history
  const { data: history, isLoading: isLoadingHistory } = useQuery<StatusHistory[]>({
    queryKey: ["/api/admin/status-history"],
  });

  // Create status mutation
  const createStatusMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/statuses", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/status-history"] });
      toast({ title: "Status criado com sucesso!", description: "O status foi adicionado à biblioteca." });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar status", description: error.message, variant: "destructive" });
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/admin/statuses/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/status-history"] });
      toast({ title: "Status atualizado com sucesso!", description: "As alterações foram salvas." });
      resetForm();
      setIsDialogOpen(false);
      setEditingStatus(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    },
  });

  // Delete status mutation
  const deleteStatusMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/statuses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/status-history"] });
      toast({ title: "Status excluído com sucesso!", description: "O status foi removido da biblioteca." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir status", description: error.message, variant: "destructive" });
    },
  });

  // Send status mutation
  const sendStatusMutation = useMutation({
    mutationFn: async ({ statusId, userId, phoneNumber }: { statusId: string; userId: string; phoneNumber: string }) => {
      return await apiRequest("POST", "/api/admin/statuses/send", { statusId, userId, phoneNumber });
    },
    onSuccess: () => {
      toast({ title: "Status enviado com sucesso!", description: "A mensagem foi enviada ao cliente." });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Erro ao enviar status", description: error.message, variant: "destructive" });
    },
  });

  // Send to all users mutation
  const sendToAllMutation = useMutation({
    mutationFn: async (statusId: string) => {
      return await apiRequest("POST", "/api/admin/statuses/send-all", { statusId });
    },
    onSuccess: () => {
      toast({ title: "Enviado para todos!", description: "O status foi enviado a todos os usuários com WhatsApp conectado." });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setStatusName("");
    setTextContent("");
    setContentUrl("");
    setDuration("");
    setScheduleEnabled(false);
    setScheduleDays([]);
    setScheduleTime("09:00");
    setScheduleRecurrence("weekly");
    setRotationEnabled(false);
    setRotationType("sequential");
    setRotationPriority("");
  };

  const handleEdit = (status: Status) => {
    setEditingStatus(status);
    setStatusName(status.name);
    setStatusType(status.type);
    setTextContent(status.content);
    setContentUrl(status.contentUrl || "");
    setDuration(status.duration?.toString() || "");
    setScheduleEnabled(status.schedule?.enabled || false);
    setScheduleDays(status.schedule?.daysOfWeek || []);
    setScheduleTime(status.schedule?.time || "09:00");
    setScheduleRecurrence(status.schedule?.recurrence || "weekly");
    setRotationEnabled(status.rotation?.enabled || false);
    setRotationType(status.rotation?.type || "sequential");
    setRotationPriority(status.rotation?.priority?.toString() || "");
    setIsDialogOpen(true);
  };

  const handleSend = (status: Status) => {
    setSelectedStatus(status);
  };

  const handleSendToAll = (status: Status) => {
    setSelectedStatus(status);
    if (confirm(`Enviar o status "${status.name}" para TODOS os usuários com WhatsApp conectado?`)) {
      sendToAllMutation.mutate(status.id);
    }
  };

  const handleDelete = (status: Status) => {
    if (confirm(`Tem certeza que deseja excluir o status "${status.name}"? Esta ação não pode ser desfeita.`)) {
      deleteStatusMutation.mutate(status.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const submitData = {
      name: statusName,
      type: statusType,
      content: textContent,
      contentUrl: contentUrl || undefined,
      duration: duration ? parseInt(duration) : undefined,
      schedule: scheduleEnabled ? {
        enabled: true,
        daysOfWeek: scheduleDays,
        time: scheduleTime,
        recurrence: scheduleRecurrence,
      } : undefined,
      rotation: rotationEnabled ? {
        enabled: true,
        type: rotationType,
        priority: rotationPriority ? parseInt(rotationPriority) : undefined,
      } : undefined,
    };

    if (editingStatus) {
      updateStatusMutation.mutate({ id: editingStatus.id, data: submitData });
    } else {
      createStatusMutation.mutate(submitData);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const getDaysOfWeek = (days: number[]) => {
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return days.map(day => dayNames[day]).join(', ');
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'text':
        return <FileText className="h-4 w-4" />;
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'audio':
        return <Music className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'text':
        return <Badge variant="secondary">Texto</Badge>;
      case 'image':
        return <Badge variant="secondary">Imagem</Badge>;
      case 'video':
        return <Badge variant="secondary">Vídeo</Badge>;
      case 'audio':
        return <Badge variant="secondary">Áudio</Badge>;
      default:
        return <Badge variant="secondary">Texto</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Repeat className="h-5 w-5" />
                Status WhatsApp
              </CardTitle>
              <CardDescription>
                Gerencie mensagens de status, imagens e vídeos que serão enviados automaticamente
              </CardDescription>
            </div>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Status
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={defaultSubTab || "library"} onValueChange={(v) => onSubTabChange?.(v)} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="library">Biblioteca</TabsTrigger>
              <TabsTrigger value="schedule">Agendados</TabsTrigger>
              <TabsTrigger value="history">Histórico</TabsTrigger>
            </TabsList>

            {/* Library Tab */}
            <TabsContent value="library" className="mt-4 space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : statuses && statuses.length > 0 ? (
                <div className="space-y-4">
                  {statuses.map((status) => (
                    <Card key={status.id} className={cn(
                      "border-2",
                      status.isActive && "border-green-200 bg-green-50/50",
                      !status.isActive && "border-gray-200"
                    )}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <CardTitle className="text-lg">{status.name}</CardTitle>
                              {getTypeBadge(status.type)}
                              {status.isActive && (
                                <Badge variant="default" className="bg-green-600">
                                  Ativo
                                </Badge>
                              )}
                            </div>
                            <CardDescription className="flex items-center gap-2">
                              <Clock className="h-3 w-3" />
                              {status.type === 'text' ? (
                                <span className="max-w-md truncate">{status.content}</span>
                              ) : status.contentUrl ? (
                                <span className="max-w-md truncate">{status.contentUrl}</span>
                              ) : (
                                <span>Sem conteúdo</span>
                              )}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSend(status)}
                            >
                              <Send className="h-4 w-4" />
                              Testar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSendToAll(status)}
                            >
                              <RefreshCw className="h-4 w-4" />
                              Enviar para Todos
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(status)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(status)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Repeat className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Rotação:</span>
                            <span className="font-medium">
                              {status.rotation?.enabled ? status.rotation.type : "Desativada"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Agendamento:</span>
                            <span className="font-medium">
                              {status.schedule?.enabled ? `${getDaysOfWeek(status.schedule.daysOfWeek)} às ${status.schedule.time}` : "Desativado"}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Repeat className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum status configurado</p>
                  <p className="text-sm">Clique em "Novo Status" para começar</p>
                </div>
              )}
            </TabsContent>

            {/* Schedule Tab */}
            <TabsContent value="schedule" className="mt-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : statuses && statuses.some(s => s.schedule?.enabled) ? (
                <div className="space-y-4">
                  {statuses
                    .filter(s => s.schedule?.enabled)
                    .map((status) => (
                      <Card key={status.id}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle>{status.name}</CardTitle>
                              <CardDescription>
                                {getDaysOfWeek(status.schedule!.daysOfWeek)} às {status.schedule!.time} ({status.schedule!.recurrence})
                              </CardDescription>
                            </div>
                            {status.isActive ? (
                              <Badge variant="default" className="bg-green-600">
                                Ativo
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                Inativo
                              </Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-sm">
                            <p className="text-muted-foreground">
                              {status.type === 'text' ? status.content : status.contentUrl || 'Sem conteúdo'}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum status agendado</p>
                </div>
              )}
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="mt-4">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : history && history.length > 0 ? (
                <div className="space-y-4">
                  {history.map((item) => (
                    <Card key={item.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle>{item.phoneNumber}</CardTitle>
                            <CardDescription>
                              {item.sentAt ? formatDate(item.sentAt) : 'N/A'}
                            </CardDescription>
                          </div>
                          <Badge>{item.type}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">{item.content}</p>
                        {item.rotationUsed && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Rotação usada: {item.rotationUsed}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum histórico disponível</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStatus ? "Editar Status" : "Novo Status"}
            </DialogTitle>
            <DialogDescription>
              Configure o status com conteúdo, agendamento e rotação
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">Nome do Status</Label>
                <Input
                  id="name"
                  value={statusName}
                  onChange={(e) => setStatusName(e.target.value)}
                  placeholder="Ex: Boas-vindas, Promoção, Lembrete"
                  required
                />
              </div>

              <div>
                <Label htmlFor="type">Tipo de Conteúdo</Label>
                <Select
                  value={statusType}
                  onValueChange={(value) => setStatusType(value as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="image">Imagem</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                    <SelectItem value="audio">Áudio</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="duration">Duração (segundos)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="30"
                  disabled={statusType === 'text'}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {statusType === 'audio' ? 'Duração do áudio em segundos' : 
                   statusType === 'video' ? 'Duração do vídeo em segundos' : 'Ignorado para texto'}
                </p>
              </div>

              {/* Text Content */}
              {statusType === 'text' && (
                <div className="col-span-2">
                  <Label htmlFor="textContent">Conteúdo do Texto</Label>
                  <textarea
                    id="textContent"
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Digite sua mensagem aqui..."
                    rows={4}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    required
                  />
                </div>
              )}

              {/* Media Content */}
              {(statusType === 'image' || statusType === 'video' || statusType === 'audio') && (
                <div className="col-span-2">
                  <Label htmlFor="contentUrl">URL do Conteúdo</Label>
                  <Input
                    id="contentUrl"
                    type="url"
                    value={contentUrl}
                    onChange={(e) => setContentUrl(e.target.value)}
                    placeholder="https://exemplo.com/arquivo.jpg"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    O conteúdo deve estar disponível via URL pública
                  </p>
                </div>
              )}
            </div>

            {/* Schedule Section */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Agendamento</h3>
                <Switch
                  checked={scheduleEnabled}
                  onCheckedChange={setScheduleEnabled}
                />
              </div>

              {scheduleEnabled && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Dias da Semana</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => {
                              const newDays = scheduleDays.includes(index)
                                ? scheduleDays.filter(d => d !== index)
                                : [...scheduleDays, index];
                              setScheduleDays(newDays);
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                              scheduleDays.includes(index)
                                ? "bg-blue-600 text-white"
                                : "bg-muted hover:bg-muted/80"
                            )}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="scheduleTime">Horário</Label>
                      <Input
                        id="scheduleTime"
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="recurrence">Recorrência</Label>
                    <Select
                      value={scheduleRecurrence}
                      onValueChange={(value) => setScheduleRecurrence(value as any)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">Única vez</SelectItem>
                        <SelectItem value="daily">Diariamente</SelectItem>
                        <SelectItem value="weekly">Semanalmente</SelectItem>
                        <SelectItem value="monthly">Mensalmente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Rotation Section */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Rotação</h3>
                <Switch
                  checked={rotationEnabled}
                  onCheckedChange={setRotationEnabled}
                />
              </div>

              {rotationEnabled && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="rotationType">Tipo de Rotação</Label>
                    <Select
                      value={rotationType}
                      onValueChange={(value) => setRotationType(value as any)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sequential">Sequencial</SelectItem>
                        <SelectItem value="random">Aleatória</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="rotationPriority">Prioridade (opcional)</Label>
                    <Input
                      id="rotationPriority"
                      type="number"
                      value={rotationPriority}
                      onChange={(e) => setRotationPriority(e.target.value)}
                      placeholder="1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Números menores têm prioridade maior
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm();
                  setIsDialogOpen(false);
                  setEditingStatus(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createStatusMutation.isPending || updateStatusMutation.isPending}
              >
                {(createStatusMutation.isPending || updateStatusMutation.isPending) && (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingStatus ? "Atualizar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
