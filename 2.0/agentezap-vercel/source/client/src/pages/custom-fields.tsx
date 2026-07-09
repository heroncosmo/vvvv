import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  Info,
  User,
  Building2,
  Mail,
  Phone,
  FileText,
  Calendar,
  List,
  Hash,
  MapPin,
  Loader2,
} from "lucide-react";

// Tipos
interface CustomFieldDefinition {
  id: string;
  user_id: string;
  name: string;
  label: string;
  field_type: string;
  options: string[];
  required: boolean;
  placeholder?: string;
  help_text?: string;
  ai_extraction_prompt?: string;
  ai_extraction_enabled: boolean;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Tipos de campo disponíveis
const fieldTypes = [
  { value: "text", label: "Texto", icon: FileText, description: "Campo de texto simples" },
  { value: "email", label: "Email", icon: Mail, description: "Email com validação" },
  { value: "phone", label: "Telefone", icon: Phone, description: "Número de telefone" },
  { value: "cpf_cnpj", label: "CPF/CNPJ", icon: User, description: "Documento com formatação" },
  { value: "number", label: "Número", icon: Hash, description: "Valor numérico" },
  { value: "date", label: "Data", icon: Calendar, description: "Seletor de data" },
  { value: "select", label: "Seleção", icon: List, description: "Lista de opções" },
  { value: "textarea", label: "Texto Longo", icon: MapPin, description: "Texto com múltiplas linhas" },
];

// Ícone por tipo de campo
function getFieldIcon(fieldType: string) {
  const type = fieldTypes.find(t => t.value === fieldType);
  return type?.icon || FileText;
}

export default function CustomFieldsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Estados
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    label: "",
    fieldType: "text",
    options: [] as string[],
    required: false,
    placeholder: "",
    helpText: "",
    aiExtractionPrompt: "",
    aiExtractionEnabled: true,
  });
  const [newOption, setNewOption] = useState("");

  // Query para buscar campos
  const { data: fields = [], isLoading } = useQuery<CustomFieldDefinition[]>({
    queryKey: ["/api/custom-fields"],
  });

  // Mutation para criar campo
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/custom-fields", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-fields"] });
      toast({ title: "Campo criado com sucesso!" });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar campo", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para atualizar campo
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/custom-fields/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-fields"] });
      toast({ title: "Campo atualizado com sucesso!" });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar campo", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para deletar campo
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/custom-fields/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-fields"] });
      toast({ title: "Campo removido com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao remover campo", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para toggle ativo/inativo
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/custom-fields/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-fields"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" });
    },
  });

  // Funções auxiliares
  const openNewDialog = () => {
    setEditingField(null);
    setFormData({
      name: "",
      label: "",
      fieldType: "text",
      options: [],
      required: false,
      placeholder: "",
      helpText: "",
      aiExtractionPrompt: "",
      aiExtractionEnabled: true,
    });
    setEditDialogOpen(true);
  };

  const openEditDialog = (field: CustomFieldDefinition) => {
    setEditingField(field);
    setFormData({
      name: field.name,
      label: field.label,
      fieldType: field.field_type,
      options: field.options || [],
      required: field.required,
      placeholder: field.placeholder || "",
      helpText: field.help_text || "",
      aiExtractionPrompt: field.ai_extraction_prompt || "",
      aiExtractionEnabled: field.ai_extraction_enabled,
    });
    setEditDialogOpen(true);
  };

  const closeDialog = () => {
    setEditDialogOpen(false);
    setEditingField(null);
    setNewOption("");
  };

  const handleSave = () => {
    if (!formData.label.trim()) {
      toast({ title: "Nome do campo é obrigatório", variant: "destructive" });
      return;
    }

    const data = {
      name: formData.name || formData.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      label: formData.label,
      fieldType: formData.fieldType,
      options: formData.fieldType === 'select' ? formData.options : [],
      required: formData.required,
      placeholder: formData.placeholder || null,
      helpText: formData.helpText || null,
      aiExtractionPrompt: formData.aiExtractionPrompt || null,
      aiExtractionEnabled: formData.aiExtractionEnabled,
    };

    if (editingField) {
      updateMutation.mutate({ id: editingField.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const addOption = () => {
    if (newOption.trim() && !formData.options.includes(newOption.trim())) {
      setFormData({ ...formData, options: [...formData.options, newOption.trim()] });
      setNewOption("");
    }
  };

  const removeOption = (option: string) => {
    setFormData({ ...formData, options: formData.options.filter(o => o !== option) });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const activeFields = fields.filter(f => f.is_active);
  const inactiveFields = fields.filter(f => !f.is_active);

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campos Personalizados</h1>
          <p className="text-muted-foreground">
            Configure campos para coletar informações dos clientes durante as conversas
          </p>
        </div>
        <Button onClick={openNewDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Campo
        </Button>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Como funcionam os campos personalizados
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Os campos aparecem no painel lateral das conversas. Você pode preenchê-los manualmente 
                ou usar a IA para extrair automaticamente as informações das mensagens.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Campos Ativos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Campos Ativos ({activeFields.length})
          </CardTitle>
          <CardDescription>
            Estes campos aparecem no painel de detalhes do contato
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeFields.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum campo ativo</p>
              <p className="text-sm">Crie um novo campo para começar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeFields.map((field, index) => {
                const Icon = getFieldIcon(field.field_type);
                return (
                  <div
                    key={field.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{field.label}</span>
                        {field.required && (
                          <Badge variant="secondary" className="text-xs">Obrigatório</Badge>
                        )}
                        {field.ai_extraction_enabled && field.ai_extraction_prompt && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Extração automática com IA</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {fieldTypes.find(t => t.value === field.field_type)?.label || field.field_type}
                        {field.placeholder && ` • ${field.placeholder}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleActiveMutation.mutate({ id: field.id, isActive: false })}
                            >
                              <EyeOff className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Desativar</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(field)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir campo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Isso irá remover o campo "{field.label}" e todos os valores preenchidos. Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteMutation.mutate(field.id)}
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campos Inativos */}
      {inactiveFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <EyeOff className="h-5 w-5" />
              Campos Inativos ({inactiveFields.length})
            </CardTitle>
            <CardDescription>
              Estes campos não aparecem nas conversas mas mantêm os dados salvos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {inactiveFields.map((field) => {
                const Icon = getFieldIcon(field.field_type);
                return (
                  <div
                    key={field.id}
                    className="flex items-center gap-3 p-3 border rounded-lg opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate">{field.label}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActiveMutation.mutate({ id: field.id, isActive: true })}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Ativar
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de Edição/Criação */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingField ? "Editar Campo" : "Novo Campo Personalizado"}
            </DialogTitle>
            <DialogDescription>
              Configure as propriedades do campo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome do Campo */}
            <div className="space-y-2">
              <Label htmlFor="label">Nome do Campo *</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="Ex: Nome do Responsável"
              />
            </div>

            {/* Tipo do Campo */}
            <div className="space-y-2">
              <Label>Tipo do Campo</Label>
              <Select
                value={formData.fieldType}
                onValueChange={(value) => setFormData({ ...formData, fieldType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        <span>{type.label}</span>
                        <span className="text-xs text-muted-foreground">- {type.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Opções para Select */}
            {formData.fieldType === "select" && (
              <div className="space-y-2">
                <Label>Opções</Label>
                <div className="flex gap-2">
                  <Input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Digite uma opção"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
                  />
                  <Button type="button" variant="outline" onClick={addOption}>
                    Adicionar
                  </Button>
                </div>
                {formData.options.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.options.map((opt) => (
                      <Badge key={opt} variant="secondary" className="gap-1">
                        {opt}
                        <button
                          type="button"
                          onClick={() => removeOption(opt)}
                          className="ml-1 hover:text-destructive"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Placeholder */}
            <div className="space-y-2">
              <Label htmlFor="placeholder">Texto de Exemplo (placeholder)</Label>
              <Input
                id="placeholder"
                value={formData.placeholder}
                onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
                placeholder="Ex: Digite o nome completo"
              />
            </div>

            {/* Campo Obrigatório */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Campo Obrigatório</Label>
                <p className="text-xs text-muted-foreground">
                  Exibe indicador de obrigatoriedade
                </p>
              </div>
              <Switch
                checked={formData.required}
                onCheckedChange={(checked) => setFormData({ ...formData, required: checked })}
              />
            </div>

            <Separator />

            {/* Extração com IA */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Extração Automática com IA
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    A IA pode preencher este campo automaticamente
                  </p>
                </div>
                <Switch
                  checked={formData.aiExtractionEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, aiExtractionEnabled: checked })}
                />
              </div>

              {formData.aiExtractionEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="aiPrompt">Instrução para a IA</Label>
                  <Textarea
                    id="aiPrompt"
                    value={formData.aiExtractionPrompt}
                    onChange={(e) => setFormData({ ...formData, aiExtractionPrompt: e.target.value })}
                    placeholder="Ex: Extraia o nome completo da pessoa que está conversando"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Descreva o que a IA deve procurar na conversa para preencher este campo
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingField ? "Salvar" : "Criar Campo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
