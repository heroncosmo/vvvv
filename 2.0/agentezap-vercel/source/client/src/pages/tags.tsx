import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Tags as TagsIcon, 
  Plus, 
  Pencil, 
  Trash2, 
  GripVertical,
  Loader2,
  Check,
  Palette,
  Star,
  UserPlus,
  ShoppingBag,
  Clock,
  CheckCircle,
  Package
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Interface para Tag
interface Tag {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon?: string | null;
  isDefault: boolean;
  position: number;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Cores predefinidas para seleção rápida
const presetColors = [
  { name: "Verde", value: "#22c55e" },
  { name: "Amarelo", value: "#eab308" },
  { name: "Laranja", value: "#f97316" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Vermelho", value: "#ef4444" },
  { name: "Roxo", value: "#a855f7" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Ciano", value: "#06b6d4" },
  { name: "Cinza", value: "#6b7280" },
  { name: "Índigo", value: "#6366f1" },
];

// Mapeamento de ícones
const iconMap: Record<string, any> = {
  "star": Star,
  "user-plus": UserPlus,
  "shopping-bag": ShoppingBag,
  "clock": Clock,
  "check-circle": CheckCircle,
  "package": Package,
};

function TagIcon({ iconName, className }: { iconName?: string | null; className?: string }) {
  if (!iconName || !iconMap[iconName]) {
    return <TagsIcon className={className} />;
  }
  const Icon = iconMap[iconName];
  return <Icon className={className} />;
}

export default function TagsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Estados
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  
  // Form states
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState("#6b7280");
  const [formDescription, setFormDescription] = useState("");

  // Query para buscar tags
  const { data: tags = [], isLoading } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  // Mutation para criar tag
  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string; color: string; description?: string }) => {
      return await apiRequest("POST", "/api/tags", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setShowCreateDialog(false);
      resetForm();
      toast({
        title: "Etiqueta criada",
        description: "A etiqueta foi criada com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível criar a etiqueta.",
        variant: "destructive",
      });
    },
  });

  // Mutation para atualizar tag
  const updateTagMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; color?: string; description?: string } }) => {
      return await apiRequest("PUT", `/api/tags/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setShowEditDialog(false);
      setSelectedTag(null);
      resetForm();
      toast({
        title: "Etiqueta atualizada",
        description: "A etiqueta foi atualizada com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível atualizar a etiqueta.",
        variant: "destructive",
      });
    },
  });

  // Mutation para deletar tag
  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/tags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setShowDeleteDialog(false);
      setSelectedTag(null);
      toast({
        title: "Etiqueta removida",
        description: "A etiqueta foi removida com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível remover a etiqueta.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormName("");
    setFormColor("#6b7280");
    setFormDescription("");
  };

  const openEditDialog = (tag: Tag) => {
    setSelectedTag(tag);
    setFormName(tag.name);
    setFormColor(tag.color);
    setFormDescription(tag.description || "");
    setShowEditDialog(true);
  };

  const openDeleteDialog = (tag: Tag) => {
    setSelectedTag(tag);
    setShowDeleteDialog(true);
  };

  const handleCreate = () => {
    if (!formName.trim()) {
      toast({
        title: "Erro",
        description: "Nome da etiqueta é obrigatório.",
        variant: "destructive",
      });
      return;
    }
    createTagMutation.mutate({
      name: formName.trim(),
      color: formColor,
      description: formDescription.trim() || undefined,
    });
  };

  const handleUpdate = () => {
    if (!selectedTag || !formName.trim()) return;
    updateTagMutation.mutate({
      id: selectedTag.id,
      data: {
        name: formName.trim(),
        color: formColor,
        description: formDescription.trim() || undefined,
      },
    });
  };

  const handleDelete = () => {
    if (!selectedTag) return;
    deleteTagMutation.mutate(selectedTag.id);
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <TagsIcon className="w-7 h-7 text-primary" />
              Etiquetas
            </h1>
            <p className="text-muted-foreground mt-1">
              Organize suas conversas com etiquetas coloridas
            </p>
          </div>
          <Button 
            onClick={() => {
              resetForm();
              setShowCreateDialog(true);
            }}
            className="w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Etiqueta
          </Button>
        </div>

        {/* Info Card */}
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardContent className="pt-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <TagsIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">Como usar etiquetas</p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Atribua etiquetas às conversas para organizar seus contatos por status, tipo de cliente ou qualquer categoria.
                  Use na página de Conversas clicando no ícone de etiqueta.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tags List */}
        <Card>
          <CardHeader>
            <CardTitle>Suas Etiquetas</CardTitle>
            <CardDescription>
              {tags.length === 0 
                ? "Nenhuma etiqueta criada ainda" 
                : `${tags.length} etiqueta${tags.length !== 1 ? 's' : ''} cadastrada${tags.length !== 1 ? 's' : ''}`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : tags.length === 0 ? (
              <div className="text-center py-8">
                <TagsIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma etiqueta encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Clique em "Nova Etiqueta" para criar sua primeira
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tag.name}</span>
                          {tag.isDefault && (
                            <Badge variant="outline" className="text-xs">
                              Padrão
                            </Badge>
                          )}
                        </div>
                        {tag.description && (
                          <p className="text-sm text-muted-foreground">{tag.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        style={{ 
                          backgroundColor: `${tag.color}20`,
                          color: tag.color,
                          borderColor: tag.color
                        }}
                        variant="outline"
                      >
                        <TagIcon iconName={tag.icon} className="w-3 h-3 mr-1" />
                        {tag.name}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => openEditDialog(tag)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        onClick={() => openDeleteDialog(tag)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nova Etiqueta</DialogTitle>
              <DialogDescription>
                Crie uma nova etiqueta para organizar suas conversas
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Lead Quente, Cliente VIP..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {presetColors.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        formColor === color.value 
                          ? 'border-foreground scale-110' 
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => setFormColor(color.value)}
                      title={color.name}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Palette className="w-4 h-4 text-muted-foreground" />
                  <Input
                    type="color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="w-12 h-8 p-0 border-none cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">
                    {formColor.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva quando usar esta etiqueta..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  maxLength={500}
                  rows={2}
                />
              </div>
              <div className="pt-2">
                <Label className="text-sm text-muted-foreground">Preview</Label>
                <div className="mt-2">
                  <Badge
                    style={{ 
                      backgroundColor: `${formColor}20`,
                      color: formColor,
                      borderColor: formColor
                    }}
                    variant="outline"
                    className="text-sm"
                  >
                    <TagsIcon className="w-3 h-3 mr-1" />
                    {formName || "Nome da etiqueta"}
                  </Badge>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleCreate}
                disabled={createTagMutation.isPending || !formName.trim()}
              >
                {createTagMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Etiqueta</DialogTitle>
              <DialogDescription>
                Altere as informações da etiqueta
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome *</Label>
                <Input
                  id="edit-name"
                  placeholder="Ex: Lead Quente, Cliente VIP..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {presetColors.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        formColor === color.value 
                          ? 'border-foreground scale-110' 
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => setFormColor(color.value)}
                      title={color.name}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Palette className="w-4 h-4 text-muted-foreground" />
                  <Input
                    type="color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="w-12 h-8 p-0 border-none cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">
                    {formColor.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Descrição (opcional)</Label>
                <Textarea
                  id="edit-description"
                  placeholder="Descreva quando usar esta etiqueta..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  maxLength={500}
                  rows={2}
                />
              </div>
              <div className="pt-2">
                <Label className="text-sm text-muted-foreground">Preview</Label>
                <div className="mt-2">
                  <Badge
                    style={{ 
                      backgroundColor: `${formColor}20`,
                      color: formColor,
                      borderColor: formColor
                    }}
                    variant="outline"
                    className="text-sm"
                  >
                    <TagsIcon className="w-3 h-3 mr-1" />
                    {formName || "Nome da etiqueta"}
                  </Badge>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleUpdate}
                disabled={updateTagMutation.isPending || !formName.trim()}
              >
                {updateTagMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover etiqueta?</AlertDialogTitle>
              <AlertDialogDescription>
                A etiqueta <strong>"{selectedTag?.name}"</strong> será removida de todas as conversas.
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteTagMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
