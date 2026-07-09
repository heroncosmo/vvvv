import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit2, Play, Square, GripVertical, Image, Music, Video, FileText } from "lucide-react";
import type { Agent } from "@shared/schema";

interface AdminMedia {
  id: string;
  name: string;
  mediaType: "audio" | "image" | "video" | "document";
  storageUrl: string;
  caption?: string | null;
}

interface MediaFlowItem {
  id: string;
  flowId: string;
  mediaId?: string | null;
  mediaName: string;
  mediaType: "audio" | "image" | "video" | "document";
  storageUrl: string;
  caption?: string | null;
  delaySeconds: number;
  displayOrder: number;
}

interface MediaFlow {
  id: string;
  agentId: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  agent?: Agent | null;
  items?: MediaFlowItem[];
}

interface FlowFormState {
  name: string;
  agentId: string;
  description: string;
  isActive: boolean;
}

interface ItemFormState {
  mediaId: string;
  delaySeconds: number;
  caption: string;
}

const emptyFlowForm: FlowFormState = {
  name: "",
  agentId: "",
  description: "",
  isActive: true,
};

const emptyItemForm: ItemFormState = {
  mediaId: "",
  delaySeconds: 0,
  caption: "",
};

const mediaTypeIcons = {
  audio: Music,
  image: Image,
  video: Video,
  document: FileText,
};

export default function AdminMediaFlowsPage() {
  const { toast } = useToast();
  const [flowDialogOpen, setFlowDialogOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<MediaFlow | null>(null);
  const [flowForm, setFlowForm] = useState<FlowFormState>(emptyFlowForm);
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<MediaFlowItem[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simIndex, setSimIndex] = useState(0);

  const { data: flows = [] } = useQuery<MediaFlow[]>({
    queryKey: ["/api/admin/media-flows"],
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/admin/agents"],
  });

  const { data: mediaList = [] } = useQuery<AdminMedia[]>({
    queryKey: ["/api/admin/agent/media"],
  });

  const selectedFlow = useMemo(
    () => flows.find((flow) => flow.id === selectedFlowId) || null,
    [flows, selectedFlowId]
  );

  useEffect(() => {
    if (!selectedFlowId && flows.length > 0) {
      setSelectedFlowId(flows[0].id);
    }
  }, [flows, selectedFlowId]);

  useEffect(() => {
    setLocalItems(selectedFlow?.items ? [...selectedFlow.items] : []);
  }, [selectedFlow?.id, selectedFlow?.items]);

  useEffect(() => {
    setIsPlaying(false);
    setSimIndex(0);
  }, [selectedFlowId]);

  const currentItem = localItems.length > 0
    ? localItems[Math.min(simIndex, localItems.length - 1)]
    : null;

  useEffect(() => {
    if (!isPlaying || localItems.length === 0) {
      return;
    }

    if (simIndex >= localItems.length) {
      setIsPlaying(false);
      setSimIndex(0);
      return;
    }

    const delayMs = (localItems[simIndex]?.delaySeconds || 0) * 1000;
    const timer = setTimeout(() => {
      setSimIndex((prev) => prev + 1);
    }, Math.max(delayMs, 0));

    return () => clearTimeout(timer);
  }, [isPlaying, simIndex, localItems]);

  const saveFlowMutation = useMutation({
    mutationFn: async (payload: FlowFormState) => {
      const url = editingFlow ? `/api/admin/media-flows/${editingFlow.id}` : "/api/admin/media-flows";
      const method = editingFlow ? "PUT" : "POST";
      await apiRequest(method, url, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/media-flows"] });
      setFlowDialogOpen(false);
      setEditingFlow(null);
      setFlowForm(emptyFlowForm);
      toast({ title: "Fluxo salvo com sucesso" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar fluxo",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const deleteFlowMutation = useMutation({
    mutationFn: async (flowId: string) => {
      await apiRequest("DELETE", `/api/admin/media-flows/${flowId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/media-flows"] });
      setSelectedFlowId(null);
      toast({ title: "Fluxo removido" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover fluxo",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const createItemMutation = useMutation({
    mutationFn: async (payload: {
      flowId: string;
      media: AdminMedia;
      delaySeconds: number;
      caption: string;
    }) => {
      await apiRequest("POST", `/api/admin/media-flows/${payload.flowId}/items`, {
        mediaId: payload.media.id,
        mediaName: payload.media.name,
        mediaType: payload.media.mediaType,
        storageUrl: payload.media.storageUrl,
        caption: payload.caption || payload.media.caption || null,
        delaySeconds: payload.delaySeconds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/media-flows"] });
      setItemDialogOpen(false);
      setItemForm(emptyItemForm);
      toast({ title: "Midia adicionada ao fluxo" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao adicionar midia",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async (payload: { id: string; delaySeconds?: number; caption?: string | null }) => {
      await apiRequest("PUT", `/api/admin/media-flows/items/${payload.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/media-flows"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar item",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/admin/media-flows/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/media-flows"] });
      toast({ title: "Item removido" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover item",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (payload: { flowId: string; order: string[] }) => {
      await apiRequest("POST", `/api/admin/media-flows/${payload.flowId}/reorder`, {
        order: payload.order,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/media-flows"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao reordenar itens",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const openNewFlowDialog = () => {
    setEditingFlow(null);
    setFlowForm(emptyFlowForm);
    setFlowDialogOpen(true);
  };

  const openEditFlowDialog = () => {
    if (!selectedFlow) return;
    setEditingFlow(selectedFlow);
    setFlowForm({
      name: selectedFlow.name,
      agentId: selectedFlow.agentId,
      description: selectedFlow.description || "",
      isActive: selectedFlow.isActive ?? true,
    });
    setFlowDialogOpen(true);
  };

  const openNewItemDialog = () => {
    setItemForm(emptyItemForm);
    setItemDialogOpen(true);
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    const updated = [...localItems];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, moved);
    setLocalItems(updated);
    setDragIndex(null);
    if (selectedFlow) {
      reorderMutation.mutate({
        flowId: selectedFlow.id,
        order: updated.map((item) => item.id),
      });
    }
  };

  const startSimulation = () => {
    if (!localItems.length) return;
    setSimIndex(0);
    setIsPlaying(true);
  };

  const stopSimulation = () => {
    setIsPlaying(false);
    setSimIndex(0);
  };

  const renderMediaPreview = (item: MediaFlowItem) => {
    if (item.mediaType === "audio") {
      return <audio controls className="w-full" src={item.storageUrl} />;
    }
    if (item.mediaType === "image") {
      return <img src={item.storageUrl} alt={item.mediaName} className="w-full max-h-56 object-contain" />;
    }
    if (item.mediaType === "video") {
      return <video controls className="w-full max-h-56 object-contain" src={item.storageUrl} />;
    }
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <FileText className="w-4 h-4" />
        Documento pronto para envio
      </div>
    );
  };

  const selectedMedia = mediaList.find((media) => media.id === itemForm.mediaId);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-slate-500 hover:text-slate-800">
            ← Voltar ao Painel
          </Link>
          <h1 className="text-xl font-bold">Media Flows</h1>
        </div>
        <Button onClick={openNewFlowDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Novo fluxo
        </Button>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Fluxos</CardTitle>
              <CardDescription>Escolha um fluxo para editar os itens.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {flows.length === 0 && (
                <div className="text-sm text-muted-foreground">Nenhum fluxo cadastrado.</div>
              )}
              {flows.map((flow) => (
                <button
                  key={flow.id}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                    flow.id === selectedFlowId
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-primary/60"
                  }`}
                  onClick={() => setSelectedFlowId(flow.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{flow.name}</span>
                    <Badge variant={flow.isActive ? "default" : "secondary"}>
                      {flow.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {flow.agent?.name || "Sem agente"} · {flow.items?.length || 0} itens
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {!selectedFlow ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Selecione ou crie um fluxo para comecar.
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-4">
                    <div>
                      <CardTitle>{selectedFlow.name}</CardTitle>
                      <CardDescription>
                        {selectedFlow.agent?.name || "Sem agente"} · {localItems.length} itens
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={openEditFlowDialog}>
                        <Edit2 className="w-4 h-4 mr-2" />
                        Editar
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          if (confirm("Excluir este fluxo?")) {
                            deleteFlowMutation.mutate(selectedFlow.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {selectedFlow.description || "Sem descricao"}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Itens do fluxo</CardTitle>
                      <CardDescription>Arraste para reordenar e ajuste delays.</CardDescription>
                    </div>
                    <Button onClick={openNewItemDialog}>
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar midia
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {localItems.length === 0 && (
                      <div className="text-sm text-muted-foreground">
                        Nenhum item adicionado.
                      </div>
                    )}
                    {localItems.map((item, index) => {
                      const Icon = mediaTypeIcons[item.mediaType];
                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => handleDrop(index)}
                          className="flex items-center gap-3 rounded-lg border border-muted bg-white px-3 py-2"
                        >
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                          <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{item.mediaName}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.mediaType} · Delay {item.delaySeconds}s
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              className="w-24"
                              value={item.delaySeconds}
                              onChange={(event) => {
                                const value = Number(event.target.value || 0);
                                setLocalItems((prev) =>
                                  prev.map((entry) =>
                                    entry.id === item.id
                                      ? { ...entry, delaySeconds: value }
                                      : entry
                                  )
                                );
                              }}
                              onBlur={(event) => {
                                const value = Number(event.target.value || 0);
                                updateItemMutation.mutate({ id: item.id, delaySeconds: value });
                              }}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteItemMutation.mutate(item.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Simulador</CardTitle>
                      <CardDescription>Preview com delays entre midias.</CardDescription>
                    </div>
                    {isPlaying ? (
                      <Button variant="outline" onClick={stopSimulation}>
                        <Square className="w-4 h-4 mr-2" />
                        Parar
                      </Button>
                    ) : (
                      <Button onClick={startSimulation} disabled={localItems.length === 0}>
                        <Play className="w-4 h-4 mr-2" />
                        Simular
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {currentItem ? (
                      <>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>
                            Item {Math.min(simIndex + 1, localItems.length)} de {localItems.length}
                          </span>
                          <span>Delay atual: {currentItem.delaySeconds}s</span>
                        </div>
                        <div className="border rounded-lg p-4 bg-muted/30">
                          <p className="font-medium mb-2">{currentItem.mediaName}</p>
                          {renderMediaPreview(currentItem)}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Adicione itens para visualizar o preview.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </main>

      <Dialog open={flowDialogOpen} onOpenChange={setFlowDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingFlow ? "Editar fluxo" : "Novo fluxo"}</DialogTitle>
            <DialogDescription>Configure o fluxo e vincule a um agente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={flowForm.name}
                onChange={(event) => setFlowForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Agente</Label>
              <Select
                value={flowForm.agentId}
                onValueChange={(value) => setFlowForm((prev) => ({ ...prev, agentId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um agente" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descricao</Label>
              <Textarea
                rows={3}
                value={flowForm.description}
                onChange={(event) =>
                  setFlowForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Fluxo ativo</Label>
                <p className="text-xs text-muted-foreground">Desative para pausar envios.</p>
              </div>
              <Switch
                checked={flowForm.isActive}
                onCheckedChange={(checked) => setFlowForm((prev) => ({ ...prev, isActive: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlowDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveFlowMutation.mutate(flowForm)}
              disabled={!flowForm.name.trim() || !flowForm.agentId}
            >
              {editingFlow ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar midia</DialogTitle>
            <DialogDescription>Selecione uma midia da biblioteca do admin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Midia</Label>
              <Select
                value={itemForm.mediaId}
                onValueChange={(value) => setItemForm((prev) => ({ ...prev, mediaId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma midia" />
                </SelectTrigger>
                <SelectContent>
                  {mediaList.map((media) => (
                    <SelectItem key={media.id} value={media.id}>
                      {media.name} ({media.mediaType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Delay (segundos)</Label>
              <Input
                type="number"
                min={0}
                value={itemForm.delaySeconds}
                onChange={(event) =>
                  setItemForm((prev) => ({
                    ...prev,
                    delaySeconds: Number(event.target.value || 0),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Legenda (opcional)</Label>
              <Textarea
                rows={3}
                value={itemForm.caption}
                onChange={(event) =>
                  setItemForm((prev) => ({ ...prev, caption: event.target.value }))
                }
              />
            </div>
            {selectedMedia && (
              <div className="rounded-lg border p-3 bg-muted/30 text-sm text-muted-foreground">
                {selectedMedia.name} · {selectedMedia.mediaType}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!selectedFlow || !selectedMedia) return;
                createItemMutation.mutate({
                  flowId: selectedFlow.id,
                  media: selectedMedia,
                  delaySeconds: itemForm.delaySeconds,
                  caption: itemForm.caption,
                });
              }}
              disabled={!selectedFlow || !selectedMedia}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
