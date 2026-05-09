import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  MessageSquare, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Sparkles, 
  Loader2,
  Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface UserQuickReply {
  id: string;
  userId: string;
  title: string;
  content: string;
  shortcut?: string;
  category?: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface UserQuickRepliesProps {
  onSelect: (content: string) => void;
  disabled?: boolean;
}

export function UserQuickReplies({ onSelect, disabled }: UserQuickRepliesProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReply, setEditingReply] = useState<UserQuickReply | null>(null);
  const [formData, setFormData] = useState({ title: "", content: "", shortcut: "", category: "" });
  const [isGenerating, setIsGenerating] = useState(false);

  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );

  const { data: quickReplies = [], isLoading } = useQuery<UserQuickReply[]>({
    queryKey: ["/api/user/quick-replies"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/user/quick-replies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/quick-replies"] });
      setDialogOpen(false);
      setFormData({ title: "", content: "", shortcut: "", category: "" });
      toast({ title: "Resposta rápida criada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await apiRequest("PUT", `/api/user/quick-replies/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/quick-replies"] });
      setDialogOpen(false);
      setEditingReply(null);
      setFormData({ title: "", content: "", shortcut: "", category: "" });
      toast({ title: "Resposta rápida atualizada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/user/quick-replies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/quick-replies"] });
      toast({ title: "Resposta rápida excluída!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  });

  const handleSelectReply = async (reply: UserQuickReply) => {
    onSelect(reply.content);
    setIsOpen(false);
    
    // Incrementar contador de uso
    try {
      await apiRequest("POST", `/api/user/quick-replies/${reply.id}/use`);
      queryClient.invalidateQueries({ queryKey: ["/api/user/quick-replies"] });
    } catch {}
  };

  const handleEdit = (reply: UserQuickReply) => {
    // Fechar popover primeiro
    setIsOpen(false);
    
    // Aguardar um pouco e então abrir o dialog de edição
    setTimeout(() => {
      setEditingReply(reply);
      setFormData({
        title: reply.title,
        content: reply.content,
        shortcut: reply.shortcut || "",
        category: reply.category || "",
      });
      setDialogOpen(true);
    }, 100);
  };

  const handleCreate = () => {
    // Fechar popover primeiro
    setIsOpen(false);
    
    // Aguardar um pouco e então abrir o dialog de criação
    setTimeout(() => {
      setEditingReply(null);
      setFormData({ title: "", content: "", shortcut: "", category: "" });
      setDialogOpen(true);
    }, 100);
  };

  const handleSubmit = () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast({ title: "Preencha título e conteúdo", variant: "destructive" });
      return;
    }

    if (editingReply) {
      updateMutation.mutate({ id: editingReply.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const generateWithAI = async () => {
    if (!formData.title.trim()) {
      toast({ title: "Digite um título primeiro", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/user/quick-replies/generate", {
        title: formData.title,
      });
      const data = await res.json();
      setFormData(prev => ({ ...prev, content: data.content }));
      toast({ title: "Conteúdo gerado com IA!" });
    } catch (error) {
      toast({ title: "Erro ao gerar", description: "Tente novamente", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredReplies = quickReplies.filter(reply =>
    reply.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reply.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (reply.shortcut && reply.shortcut.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Ordenar por mais usadas
  const sortedReplies = [...filteredReplies].sort((a, b) => b.usageCount - a.usageCount);

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            className={cn(
              "text-muted-foreground hover:text-primary touch-manipulation",
              isMobile && "h-11 w-11"
            )}
            title="Respostas rápidas"
          >
            <Zap className={cn("w-5 h-5", isMobile && "w-6 h-6")} />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-80 p-0" 
          side="top"
          align="start"
        >
          <div className="p-3 border-b">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold text-sm">Respostas Rápidas</h4>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 ml-auto"
                onClick={handleCreate}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar ou digite atalho..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>
          
          <ScrollArea className="h-64">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : sortedReplies.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                {searchTerm ? "Nenhuma resposta encontrada" : "Crie sua primeira resposta rápida"}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {sortedReplies.map((reply) => (
                  <div
                    key={reply.id}
                    className="group relative p-2 rounded-md hover:bg-muted cursor-pointer"
                    onClick={() => handleSelectReply(reply)}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{reply.title}</span>
                          {reply.shortcut && (
                            <code className="text-xs bg-muted px-1 rounded">{reply.shortcut}</code>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {reply.content}
                        </p>
                      </div>
                    </div>
                    
                    {/* Ações */}
                    <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(reply);
                        }}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
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

      {/* Dialog de criação/edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingReply ? "Editar Resposta Rápida" : "Nova Resposta Rápida"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input
                placeholder="Ex: Boas vindas, Promoção, etc."
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conteúdo *</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generateWithAI}
                  disabled={isGenerating || !formData.title.trim()}
                  className="h-7 text-xs"
                >
                  {isGenerating ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3 mr-1" />
                  )}
                  Gerar com IA
                </Button>
              </div>
              <Textarea
                placeholder="Mensagem que será enviada..."
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                💡 Use <code className="bg-muted px-1 rounded">{'{nome}'}</code> para inserir automaticamente o nome do cliente
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Atalho (opcional)</Label>
                <Input
                  placeholder="Ex: /bv"
                  value={formData.shortcut}
                  onChange={(e) => setFormData(prev => ({ ...prev, shortcut: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria (opcional)</Label>
                <Input
                  placeholder="Ex: Vendas"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingReply ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
