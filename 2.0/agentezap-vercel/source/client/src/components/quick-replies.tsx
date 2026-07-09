import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Zap, 
  Plus, 
  Edit2, 
  Trash2, 
  Search,
  Sparkles,
  Save,
  X,
  Loader2
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export interface QuickReply {
  id: string;
  title: string;
  content: string;
  shortcut?: string;
  category?: string;
  createdAt?: string;
}

interface QuickRepliesProps {
  onSelect: (content: string) => void;
  disabled?: boolean;
  className?: string;
}

export function QuickReplies({ onSelect, disabled = false, className }: QuickRepliesProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);
  const [generateAIOpen, setGenerateAIOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Form state para criar/editar
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formShortcut, setFormShortcut] = useState("");

  // Buscar respostas rápidas
  const { data: quickReplies = [], isLoading } = useQuery<QuickReply[]>({
    queryKey: ["/api/admin/quick-replies"],
  });

  // Mutation para criar/atualizar
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<QuickReply>) => {
      if (editingReply?.id) {
        return await apiRequest("PUT", `/api/admin/quick-replies/${editingReply.id}`, data);
      }
      return await apiRequest("POST", "/api/admin/quick-replies", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quick-replies"] });
      setEditDialogOpen(false);
      resetForm();
      toast({
        title: editingReply ? "Resposta atualizada!" : "Resposta criada!",
        description: "Sua resposta rápida foi salva com sucesso.",
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

  // Mutation para deletar
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/quick-replies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quick-replies"] });
      toast({
        title: "Resposta removida",
        description: "A resposta rápida foi removida.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Gerar com IA
  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    
    setIsGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/admin/quick-replies/generate", {
        prompt: aiPrompt,
      });
      const response = await res.json();
      
      if (response.content) {
        setFormContent(response.content);
        setFormTitle(response.title || "Nova resposta");
        setGenerateAIOpen(false);
        setAiPrompt("");
        setEditDialogOpen(true);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao gerar",
        description: error.message || "Falha ao gerar mensagem com IA",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const resetForm = () => {
    setEditingReply(null);
    setFormTitle("");
    setFormContent("");
    setFormShortcut("");
  };

  const openEditDialog = (reply?: QuickReply) => {
    if (reply) {
      setEditingReply(reply);
      setFormTitle(reply.title);
      setFormContent(reply.content);
      setFormShortcut(reply.shortcut || "");
    } else {
      resetForm();
    }
    setEditDialogOpen(true);
  };

  const handleSave = () => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o título e o conteúdo.",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate({
      title: formTitle,
      content: formContent,
      shortcut: formShortcut || undefined,
    });
  };

  const handleSelect = (reply: QuickReply) => {
    onSelect(reply.content);
    setIsOpen(false);
  };

  // Filtrar respostas
  const filteredReplies = quickReplies.filter((reply) => {
    const search = searchQuery.toLowerCase();
    return (
      reply.title.toLowerCase().includes(search) ||
      reply.content.toLowerCase().includes(search) ||
      reply.shortcut?.toLowerCase().includes(search)
    );
  });

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className={cn(
              "text-muted-foreground hover:text-primary hover:bg-primary/10 touch-manipulation",
              className
            )}
            title="Respostas rápidas"
          >
            <Zap className="w-5 h-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          side="top" 
          align="end" 
          className="w-80 p-0"
        >
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">Respostas Rápidas</h4>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setIsOpen(false);
                    setGenerateAIOpen(true);
                  }}
                  title="Gerar com IA"
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setIsOpen(false);
                    openEditDialog();
                  }}
                  title="Nova resposta"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          <ScrollArea className="max-h-64">
            {isLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredReplies.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {searchQuery ? "Nenhuma resposta encontrada" : "Nenhuma resposta rápida ainda"}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredReplies.map((reply) => (
                  <div
                    key={reply.id}
                    className="group flex items-start gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer"
                    onClick={() => handleSelect(reply)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {reply.title}
                        </span>
                        {reply.shortcut && (
                          <span className="text-xs bg-muted-foreground/10 px-1.5 py-0.5 rounded">
                            /{reply.shortcut}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {reply.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOpen(false);
                          openEditDialog(reply);
                        }}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(reply.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Dialog para criar/editar resposta */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingReply ? "Editar Resposta" : "Nova Resposta Rápida"}
            </DialogTitle>
            <DialogDescription>
              Crie mensagens predefinidas para agilizar suas respostas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ex: Boas vindas"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shortcut">Atalho (opcional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">/</span>
                <Input
                  id="shortcut"
                  value={formShortcut}
                  onChange={(e) => setFormShortcut(e.target.value.replace(/\s/g, ""))}
                  placeholder="bv"
                  className="pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Digite /{formShortcut || "atalho"} no chat para usar rapidamente
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Mensagem *</Label>
              <Textarea
                id="content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Olá! Como posso ajudar você hoje?"
                className="min-h-[120px] resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para gerar com IA */}
      <Dialog open={generateAIOpen} onOpenChange={setGenerateAIOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Gerar com IA
            </DialogTitle>
            <DialogDescription>
              Descreva a mensagem que você precisa e a IA vai criar para você.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Ex: Uma mensagem de boas vindas amigável para novos clientes..."
              className="min-h-[100px] resize-none"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setGenerateAIOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={generateWithAI}
              disabled={isGenerating || !aiPrompt.trim()}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
