/**
 * Flow Builder - Construtor Visual de Fluxo de Chatbot
 * Sistema de Robô com Fluxo Predefinido (sem IA)
 * 
 * Inspirado em: ManyChat, Tidio, WATI, Landbot
 * UX/UI: Eye-tracking, visual hierarchy, conversion triggers
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { 
  Bot, 
  MessageSquare, 
  MousePointerClick, 
  ListOrdered, 
  FormInput,
  Image as ImageIcon,
  Music,
  Video,
  FileText,
  Clock,
  GitBranch,
  UserCog,
  ArrowRight,
  Plus,
  Trash2,
  Save,
  Play,
  Settings,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  GripVertical,
  Copy,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Upload,
  Eye,
  Smartphone,
  LayoutTemplate,
  Wand2,
  X,
  ChevronDown,
  Send,
  MoreHorizontal,
  Pencil,
  Target,
  CircleDot,
  Square,
  Layers,
  ShoppingCart,
  Calendar
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// ============== TIPOS ==============

interface FlowNode {
  id: string;
  node_id: string;
  name: string;
  node_type: NodeType;
  content: NodeContent;
  next_node_id?: string;
  position_x: number;
  position_y: number;
  display_order: number;
}

interface FlowConnection {
  id?: string;
  from_node_id: string;
  from_handle: string;
  to_node_id: string;
  label?: string;
}

interface ChatbotConfig {
  id?: string;
  name: string;
  description?: string;
  welcome_message: string;
  fallback_message: string;
  goodbye_message: string;
  is_active: boolean;
  is_published: boolean;
  typing_delay_ms: number;
  message_delay_ms: number;
  collect_user_data: boolean;
  send_welcome_on_first_contact: boolean;
  restart_on_keyword: boolean;
  restart_keywords: string[];
  // Anti-ban: variação humanizada das mensagens
  enable_humanization: boolean;
  humanization_level: 'low' | 'medium' | 'high';
  // Sistema Híbrido IA+Fluxo
  advanced_settings?: {
    enable_hybrid_ai: boolean;
    ai_confidence_threshold: number;
    fallback_to_flow: boolean;
    interpret_dates: boolean;
    interpret_times: boolean;
  };
}

interface FlowTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  thumbnail_url?: string;
  usage_count: number;
  is_featured: boolean;
  flow_data: any;
}

type NodeType = 
  | 'start'
  | 'message'
  | 'buttons'
  | 'list'
  | 'poll'
  | 'input'
  | 'media'
  | 'condition'
  | 'delay'
  | 'set_variable'
  | 'api_call'
  | 'transfer_human'
  | 'end'
  | 'goto'
  | 'delivery_order'
  | 'check_business_hours'
  | 'create_appointment';

interface NodeContent {
  text?: string;
  body?: string;
  header?: { type: string; content: string };
  footer?: string;
  buttons?: Array<{ id: string; title: string; text?: string; next_node?: string }>;
  sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string; next_node?: string }> }>;
  button_text?: string;
  prompt?: string;
  variable_name?: string;
  input_type?: string;
  validation_message?: string;
  required?: boolean;
  media_type?: string;
  url?: string;
  caption?: string;
  file_name?: string;
  variable?: string;
  operator?: string;
  value?: string;
  true_node?: string;
  false_node?: string;
  seconds?: number;
  message?: string;
  notify_admin?: boolean;
  target_node?: string;
  format_whatsapp?: boolean;
  api_url?: string;
  api_method?: string;
  // Campos para Poll/Enquete
  poll_question?: string;
  poll_options?: Array<{ id: string; text: string; next_node?: string }>;
  poll_allow_multiple?: boolean;
  poll_save_to_variable?: string;
  // Campos para Delivery Dinâmico
  dynamicSource?: string;
  createOrder?: boolean;
  // Campos para Delivery Order (Criar Pedido)
  confirmation_message?: string;
  default_payment?: string;
  default_delivery_type?: string;
  address_variable?: string;
  // Campos para Check Business Hours
  opening_hours?: Record<string, { open: string; close: string; is_open: boolean }>;
  closed_message?: string;
  // Campos para Create Appointment (Agendamento)
  service_name?: string;
  service_id?: string;
  professional_name?: string;
  professional_id?: string;
  duration_minutes?: number;
  location?: string;
  location_type?: string;
  missing_data_message?: string;
}

// Configuração dos tipos de nós
const NODE_TYPES_CONFIG: Record<NodeType, {
  label: string;
  icon: any;
  color: string;
  bgColor: string;
  description: string;
  category: 'flow' | 'message' | 'collect' | 'action' | 'logic';
}> = {
  start: {
    label: 'Início',
    icon: CircleDot,
    color: 'text-green-600',
    bgColor: 'bg-green-50 border-green-200',
    description: 'Ponto de início do fluxo',
    category: 'flow'
  },
  message: {
    label: 'Mensagem',
    icon: MessageSquare,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    description: 'Envia uma mensagem de texto',
    category: 'message'
  },
  buttons: {
    label: 'Botões',
    icon: MousePointerClick,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 border-purple-200',
    description: 'Mensagem com até 3 botões clicáveis',
    category: 'message'
  },
  list: {
    label: 'Lista',
    icon: ListOrdered,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 border-indigo-200',
    description: 'Menu com até 10 opções em lista',
    category: 'message'
  },
  poll: {
    label: 'Enquete',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 border-emerald-200',
    description: 'Enquete interativa com votação',
    category: 'message'
  },
  input: {
    label: 'Coletar Dados',
    icon: FormInput,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 border-amber-200',
    description: 'Solicita e armazena resposta do usuário',
    category: 'collect'
  },
  media: {
    label: 'Mídia',
    icon: ImageIcon,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50 border-pink-200',
    description: 'Envia imagem, áudio, vídeo ou documento',
    category: 'message'
  },
  condition: {
    label: 'Condição',
    icon: GitBranch,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 border-orange-200',
    description: 'Bifurcação baseada em variável',
    category: 'logic'
  },
  delay: {
    label: 'Aguardar',
    icon: Clock,
    color: 'text-slate-600',
    bgColor: 'bg-slate-50 border-slate-200',
    description: 'Pausa antes de continuar',
    category: 'action'
  },
  set_variable: {
    label: 'Definir Variável',
    icon: Target,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50 border-cyan-200',
    description: 'Define ou altera uma variável',
    category: 'action'
  },
  api_call: {
    label: 'Chamar API',
    icon: ArrowRight,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50 border-violet-200',
    description: 'Faz requisição a API externa',
    category: 'action'
  },
  transfer_human: {
    label: 'Transferir',
    icon: UserCog,
    color: 'text-red-600',
    bgColor: 'bg-red-50 border-red-200',
    description: 'Transfere para atendente humano',
    category: 'action'
  },
  end: {
    label: 'Fim',
    icon: Square,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50 border-gray-200',
    description: 'Finaliza o fluxo',
    category: 'flow'
  },
  goto: {
    label: 'Ir Para',
    icon: ArrowRight,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50 border-teal-200',
    description: 'Pula para outro nó do fluxo',
    category: 'logic'
  },
  delivery_order: {
    label: '🍕 Criar Pedido',
    icon: ShoppingCart,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 border-orange-200',
    description: 'Cria pedido de delivery no sistema',
    category: 'action'
  },
  check_business_hours: {
    label: '⏰ Horário',
    icon: Clock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 border-amber-200',
    description: 'Verifica horário de funcionamento',
    category: 'logic'
  },
  create_appointment: {
    label: '📅 Agendar',
    icon: Calendar,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 border-emerald-200',
    description: 'Cria agendamento no sistema',
    category: 'action'
  }
};

// Valores padrão para cada tipo de nó
const DEFAULT_NODE_CONTENT: Record<NodeType, NodeContent> = {
  start: {},
  message: { text: 'Olá! 👋', format_whatsapp: true },
  buttons: { 
    body: 'Escolha uma opção:', 
    buttons: [
      { id: 'btn_1', title: 'Opção 1' },
      { id: 'btn_2', title: 'Opção 2' }
    ] 
  },
  list: { 
    body: 'Selecione uma opção:', 
    button_text: 'Ver opções',
    sections: [{
      title: 'Opções',
      rows: [
        { id: 'opt_1', title: 'Opção 1', description: 'Descrição da opção 1' },
        { id: 'opt_2', title: 'Opção 2', description: 'Descrição da opção 2' }
      ]
    }]
  },
  poll: {
    poll_question: 'Qual sua opinião?',
    poll_options: [
      { id: 'poll_1', text: 'Opção 1' },
      { id: 'poll_2', text: 'Opção 2' },
      { id: 'poll_3', text: 'Opção 3' }
    ],
    poll_allow_multiple: false,
    poll_save_to_variable: 'voto_enquete'
  },
  input: { 
    prompt: 'Qual é o seu nome?', 
    variable_name: 'nome', 
    input_type: 'text',
    required: true 
  },
  media: { media_type: 'image', url: '', caption: '' },
  condition: { variable: '', operator: 'equals', value: '' },
  delay: { seconds: 3 },
  set_variable: { variable_name: '', value: '' },
  api_call: { api_url: '', api_method: 'GET' },
  transfer_human: { message: 'Aguarde, vou transferir para um atendente...', notify_admin: true },
  end: {},
  goto: { target_node: '' },
  delivery_order: { 
    confirmation_message: '✅ *Pedido Confirmado!*\n\n📋 Itens: {{pedido_itens}}\n💰 Total: R$ {{pedido_total}}\n📍 Entrega: {{endereco}}\n💳 Pagamento: {{pagamento}}',
    default_payment: 'dinheiro',
    default_delivery_type: 'delivery'
  },
  check_business_hours: {
    opening_hours: {
      monday: { open: '09:00', close: '18:00', is_open: true },
      tuesday: { open: '09:00', close: '18:00', is_open: true },
      wednesday: { open: '09:00', close: '18:00', is_open: true },
      thursday: { open: '09:00', close: '18:00', is_open: true },
      friday: { open: '09:00', close: '18:00', is_open: true },
      saturday: { open: '09:00', close: '12:00', is_open: true },
      sunday: { open: '', close: '', is_open: false }
    },
    closed_message: '😴 Estamos fechados no momento.\nNosso horário de funcionamento é de segunda a sexta das 9h às 18h.'
  },
  create_appointment: {
    confirmation_message: '✅ *Agendamento Confirmado!*\n\n📅 Data: {{agendamento_data}}\n⏰ Horário: {{agendamento_horario}}\n💼 Serviço: {{agendamento_servico}}\n👤 Profissional: {{agendamento_profissional}}\n⏱️ Duração: {{agendamento_duracao}} minutos\n\nAguardamos você! 📋',
    service_name: '',
    professional_name: '',
    duration_minutes: 60,
    location: '',
    location_type: 'presencial',
    missing_data_message: '❌ Desculpe, preciso da data e horário para agendar. Pode informar?'
  }
};

// ============== COMPONENTES ==============

// Componente de nó individual no canvas
function FlowNodeCard({ 
  node, 
  isSelected, 
  onSelect, 
  onDelete,
  onEdit,
  onDuplicate 
}: { 
  node: FlowNode; 
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
}) {
  const config = NODE_TYPES_CONFIG[node.node_type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "group relative p-3 rounded-lg border-2 cursor-pointer transition-all duration-200",
        "hover:shadow-md",
        config.bgColor,
        isSelected && "ring-2 ring-primary ring-offset-2"
      )}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("p-1.5 rounded", config.color, "bg-white/50")}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{node.name}</p>
          <p className="text-xs text-muted-foreground">{config.label}</p>
        </div>
        
        {/* Menu de ações (visível no hover) */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4 mr-2" /> Duplicar
              </DropdownMenuItem>
              {node.node_type !== 'start' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Preview do conteúdo */}
      <div className="text-xs text-muted-foreground line-clamp-2">
        {node.node_type === 'message' && node.content.text}
        {node.node_type === 'buttons' && node.content.body}
        {node.node_type === 'list' && node.content.body}
        {node.node_type === 'poll' && `📊 ${node.content.poll_question || 'Enquete'}`}
        {node.node_type === 'input' && node.content.prompt}
        {node.node_type === 'media' && `📷 ${node.content.media_type || 'mídia'}`}
        {node.node_type === 'condition' && `Se ${node.content.variable} ${node.content.operator} ${node.content.value}`}
        {node.node_type === 'delay' && `⏱ ${node.content.seconds}s`}
        {node.node_type === 'transfer_human' && '👤 Transferir para humano'}
        {node.node_type === 'start' && '▶️ Início do fluxo'}
        {node.node_type === 'end' && '⏹ Fim do fluxo'}
      </div>

      {/* Indicadores de conexão */}
      {node.node_type === 'buttons' && node.content.buttons && (
        <div className="flex flex-wrap gap-1 mt-2">
          {node.content.buttons.map((btn, idx) => (
            <Badge key={idx} variant="outline" className="text-[10px]">
              {btn.title}
            </Badge>
          ))}
        </div>
      )}
      
      {/* Indicadores de opções de enquete */}
      {node.node_type === 'poll' && node.content.poll_options && (
        <div className="flex flex-wrap gap-1 mt-2">
          {node.content.poll_options.slice(0, 3).map((opt, idx) => (
            <Badge key={idx} variant="outline" className="text-[10px] bg-emerald-50">
              {opt.text}
            </Badge>
          ))}
          {node.content.poll_options.length > 3 && (
            <Badge variant="outline" className="text-[10px]">
              +{node.content.poll_options.length - 3}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// Painel de edição de nó
function NodeEditorPanel({
  node,
  onSave,
  onClose,
  nodes
}: {
  node: FlowNode | null;
  onSave: (updatedNode: FlowNode) => void;
  onClose: () => void;
  nodes: FlowNode[];
}) {
  const { toast } = useToast();
  const [editedNode, setEditedNode] = useState<FlowNode | null>(node);
  
  useEffect(() => {
    setEditedNode(node);
  }, [node]);

  if (!editedNode) return null;

  const config = NODE_TYPES_CONFIG[editedNode.node_type];
  const Icon = config.icon;

  const updateContent = (key: string, value: any) => {
    setEditedNode(prev => prev ? {
      ...prev,
      content: { ...prev.content, [key]: value }
    } : null);
  };

  const handleSave = () => {
    if (editedNode) {
      onSave(editedNode);
    }
  };

  return (
    <Sheet open={!!node} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-lg", config.bgColor)}>
              <Icon className={cn("h-5 w-5", config.color)} />
            </div>
            <div>
              <SheetTitle>{config.label}</SheetTitle>
              <SheetDescription>{config.description}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Nome do nó */}
          <div className="space-y-2">
            <Label>Nome do bloco</Label>
            <Input
              value={editedNode.name}
              onChange={(e) => setEditedNode(prev => prev ? { ...prev, name: e.target.value } : null)}
              placeholder="Ex: Boas-vindas"
            />
          </div>

          <Separator />

          {/* Campos específicos por tipo de nó */}
          {editedNode.node_type === 'message' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea
                  value={editedNode.content.text || ''}
                  onChange={(e) => updateContent('text', e.target.value)}
                  placeholder="Digite a mensagem..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Use *texto* para negrito, _texto_ para itálico
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editedNode.content.format_whatsapp ?? true}
                  onCheckedChange={(checked) => updateContent('format_whatsapp', checked)}
                />
                <Label>Formatação WhatsApp</Label>
              </div>
            </div>
          )}

          {editedNode.node_type === 'buttons' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cabeçalho (opcional)</Label>
                <Input
                  value={editedNode.content.header?.content || ''}
                  onChange={(e) => updateContent('header', e.target.value ? { type: 'text', content: e.target.value } : undefined)}
                  placeholder="Título do cabeçalho"
                />
              </div>
              <div className="space-y-2">
                <Label>Mensagem *</Label>
                <Textarea
                  value={editedNode.content.body || ''}
                  onChange={(e) => updateContent('body', e.target.value)}
                  placeholder="Texto da mensagem com botões..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Rodapé (opcional)</Label>
                <Input
                  value={editedNode.content.footer || ''}
                  onChange={(e) => updateContent('footer', e.target.value)}
                  placeholder="Texto pequeno do rodapé"
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Botões (máx. 3)</Label>
                  {(editedNode.content.buttons?.length || 0) < 3 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const buttons = editedNode.content.buttons || [];
                        updateContent('buttons', [
                          ...buttons,
                          { id: `btn_${Date.now()}`, title: `Botão ${buttons.length + 1}` }
                        ]);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Adicionar
                    </Button>
                  )}
                </div>
                {editedNode.content.buttons?.map((btn, idx) => (
                  <div key={btn.id} className="flex items-center gap-2">
                    <Input
                      value={btn.title}
                      onChange={(e) => {
                        const buttons = [...(editedNode.content.buttons || [])];
                        buttons[idx] = { ...buttons[idx], title: e.target.value };
                        updateContent('buttons', buttons);
                      }}
                      placeholder="Texto do botão"
                      maxLength={20}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const buttons = editedNode.content.buttons?.filter((_, i) => i !== idx);
                        updateContent('buttons', buttons);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Máximo de 20 caracteres por botão
                </p>
              </div>
            </div>
          )}

          {editedNode.node_type === 'list' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cabeçalho (opcional)</Label>
                <Input
                  value={editedNode.content.header?.content || ''}
                  onChange={(e) => updateContent('header', e.target.value ? { type: 'text', content: e.target.value } : undefined)}
                  placeholder="Título"
                />
              </div>
              <div className="space-y-2">
                <Label>Mensagem *</Label>
                <Textarea
                  value={editedNode.content.body || ''}
                  onChange={(e) => updateContent('body', e.target.value)}
                  placeholder="Texto da mensagem..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Texto do botão *</Label>
                <Input
                  value={editedNode.content.button_text || ''}
                  onChange={(e) => updateContent('button_text', e.target.value)}
                  placeholder="Ex: Ver opções"
                  maxLength={20}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Opções (máx. 10)</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const sections = editedNode.content.sections || [{ title: 'Opções', rows: [] }];
                      const rows = sections[0].rows || [];
                      if (rows.length < 10) {
                        sections[0].rows = [...rows, { id: `opt_${Date.now()}`, title: `Opção ${rows.length + 1}` }];
                        updateContent('sections', sections);
                      }
                    }}
                    disabled={(editedNode.content.sections?.[0]?.rows?.length || 0) >= 10}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
                {editedNode.content.sections?.[0]?.rows?.map((row, idx) => (
                  <Card key={row.id} className="p-2">
                    <div className="space-y-2">
                      <Input
                        value={row.title}
                        onChange={(e) => {
                          const sections = [...(editedNode.content.sections || [])];
                          sections[0].rows[idx] = { ...sections[0].rows[idx], title: e.target.value };
                          updateContent('sections', sections);
                        }}
                        placeholder="Título da opção"
                        maxLength={24}
                      />
                      <div className="flex gap-2">
                        <Input
                          value={row.description || ''}
                          onChange={(e) => {
                            const sections = [...(editedNode.content.sections || [])];
                            sections[0].rows[idx] = { ...sections[0].rows[idx], description: e.target.value };
                            updateContent('sections', sections);
                          }}
                          placeholder="Descrição (opcional)"
                          maxLength={72}
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const sections = [...(editedNode.content.sections || [])];
                            sections[0].rows = sections[0].rows.filter((_, i) => i !== idx);
                            updateContent('sections', sections);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Editor de Enquete/Poll */}
          {editedNode.node_type === 'poll' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Pergunta da Enquete *</Label>
                <Textarea
                  value={editedNode.content.poll_question || ''}
                  onChange={(e) => updateContent('poll_question', e.target.value)}
                  placeholder="Ex: Qual sua forma de pagamento preferida?"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Salvar resposta na variável</Label>
                <Input
                  value={editedNode.content.poll_save_to_variable || ''}
                  onChange={(e) => updateContent('poll_save_to_variable', e.target.value.replace(/\s/g, '_').toLowerCase())}
                  placeholder="Ex: voto_enquete"
                />
                <p className="text-xs text-muted-foreground">
                  Use em mensagens como: {'{{'}voto_enquete{'}}'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editedNode.content.poll_allow_multiple ?? false}
                  onCheckedChange={(checked) => updateContent('poll_allow_multiple', checked)}
                />
                <Label>Permitir múltiplas respostas</Label>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Opções de voto (máx. 12)</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const options = editedNode.content.poll_options || [];
                      if (options.length < 12) {
                        updateContent('poll_options', [
                          ...options,
                          { id: `poll_${Date.now()}`, text: `Opção ${options.length + 1}` }
                        ]);
                      }
                    }}
                    disabled={(editedNode.content.poll_options?.length || 0) >= 12}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
                {editedNode.content.poll_options?.map((opt, idx) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-medium text-emerald-700">
                      {idx + 1}
                    </div>
                    <Input
                      value={opt.text}
                      onChange={(e) => {
                        const options = [...(editedNode.content.poll_options || [])];
                        options[idx] = { ...options[idx], text: e.target.value };
                        updateContent('poll_options', options);
                      }}
                      placeholder="Texto da opção"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const options = (editedNode.content.poll_options || []).filter((_, i) => i !== idx);
                        updateContent('poll_options', options);
                      }}
                      disabled={(editedNode.content.poll_options?.length || 0) <= 2}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  📊 As enquetes do WhatsApp exibem votação em tempo real
                </p>
              </div>
            </div>
          )}

          {editedNode.node_type === 'input' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Pergunta *</Label>
                <Textarea
                  value={editedNode.content.prompt || ''}
                  onChange={(e) => updateContent('prompt', e.target.value)}
                  placeholder="Ex: Qual é o seu nome?"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Nome da variável *</Label>
                <Input
                  value={editedNode.content.variable_name || ''}
                  onChange={(e) => updateContent('variable_name', e.target.value.replace(/\s/g, '_').toLowerCase())}
                  placeholder="Ex: nome_cliente"
                />
                <p className="text-xs text-muted-foreground">
                  Use em mensagens como: {'{{'}nome_cliente{'}}'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Tipo de dado</Label>
                <Select
                  value={editedNode.content.input_type || 'text'}
                  onValueChange={(value) => updateContent('input_type', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto livre</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="date">Data</SelectItem>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="cep">CEP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mensagem de erro (opcional)</Label>
                <Input
                  value={editedNode.content.validation_message || ''}
                  onChange={(e) => updateContent('validation_message', e.target.value)}
                  placeholder="Ex: Por favor, digite um email válido"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editedNode.content.required ?? true}
                  onCheckedChange={(checked) => updateContent('required', checked)}
                />
                <Label>Campo obrigatório</Label>
              </div>
            </div>
          )}

          {editedNode.node_type === 'media' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de mídia</Label>
                <Select
                  value={editedNode.content.media_type || 'image'}
                  onValueChange={(value) => updateContent('media_type', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">🖼️ Imagem (JPG, PNG, GIF, WEBP)</SelectItem>
                    <SelectItem value="audio">🎵 Áudio (MP3, OGG, WAV)</SelectItem>
                    <SelectItem value="video">🎬 Vídeo (MP4, WEBM)</SelectItem>
                    <SelectItem value="document">📄 PDF / Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Upload de arquivo */}
              <div className="space-y-2">
                <Label>Fazer upload do arquivo</Label>
                <div className="flex gap-2">
                  <input
                    type="file"
                    id="media-upload"
                    className="hidden"
                    accept={
                      editedNode.content.media_type === 'image' ? 'image/jpeg,image/png,image/gif,image/webp' :
                      editedNode.content.media_type === 'audio' ? 'audio/mpeg,audio/ogg,audio/wav,audio/mp4' :
                      editedNode.content.media_type === 'video' ? 'video/mp4,video/webm,video/quicktime' :
                      'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    }
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      // Validar tamanho (max 50MB)
                      if (file.size > 50 * 1024 * 1024) {
                        toast({ title: "Arquivo muito grande", description: "Máximo 50MB", variant: "destructive" });
                        return;
                      }
                      
                      try {
                        const formData = new FormData();
                        formData.append('file', file);
                        
                        toast({ title: "Enviando arquivo...", description: file.name });
                        
                        const response = await fetch('/api/chatbot/media/upload', {
                          method: 'POST',
                          body: formData,
                          credentials: 'include'
                        });
                        
                        if (!response.ok) {
                          throw new Error('Falha no upload');
                        }
                        
                        const data = await response.json();
                        
                        if (data.success && data.url) {
                          updateContent('url', data.url);
                          updateContent('file_name', data.fileName);
                          toast({ title: "✅ Upload concluído!", description: data.fileName });
                        } else {
                          throw new Error(data.error || 'Erro desconhecido');
                        }
                      } catch (error) {
                        console.error('Erro no upload:', error);
                        toast({ title: "Erro no upload", description: "Não foi possível enviar o arquivo", variant: "destructive" });
                      }
                      
                      // Limpar input
                      e.target.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('media-upload')?.click()}
                    className="flex-1"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {editedNode.content.media_type === 'image' ? 'Enviar Imagem' :
                     editedNode.content.media_type === 'audio' ? 'Enviar Áudio' :
                     editedNode.content.media_type === 'video' ? 'Enviar Vídeo' :
                     'Enviar PDF/Documento'}
                  </Button>
                </div>
                {editedNode.content.file_name && (
                  <p className="text-xs text-muted-foreground">
                    📎 Arquivo: {editedNode.content.file_name}
                  </p>
                )}
              </div>
              
              <div className="text-center text-xs text-muted-foreground">— ou cole a URL —</div>
              
              <div className="space-y-2">
                <Label>URL da mídia</Label>
                <Input
                  value={editedNode.content.url || ''}
                  onChange={(e) => updateContent('url', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              
              {/* Preview da mídia */}
              {editedNode.content.url && (
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="border rounded-lg p-2 bg-muted/50">
                    {editedNode.content.media_type === 'image' && (
                      <img 
                        src={editedNode.content.url} 
                        alt="Preview" 
                        className="max-h-32 mx-auto rounded object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    {editedNode.content.media_type === 'audio' && (
                      <audio 
                        src={editedNode.content.url} 
                        controls 
                        className="w-full"
                      />
                    )}
                    {editedNode.content.media_type === 'video' && (
                      <video 
                        src={editedNode.content.url} 
                        controls 
                        className="max-h-32 mx-auto rounded"
                      />
                    )}
                    {editedNode.content.media_type === 'document' && (
                      <div className="flex items-center gap-2 p-2">
                        <FileText className="h-8 w-8 text-red-500" />
                        <div>
                          <p className="font-medium text-sm">Documento PDF</p>
                          <a 
                            href={editedNode.content.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline"
                          >
                            Abrir em nova aba
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label>Legenda (opcional)</Label>
                <Textarea
                  value={editedNode.content.caption || ''}
                  onChange={(e) => updateContent('caption', e.target.value)}
                  placeholder="Texto que acompanha a mídia..."
                  rows={2}
                />
              </div>
            </div>
          )}

          {editedNode.node_type === 'condition' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Variável *</Label>
                <Input
                  value={editedNode.content.variable || ''}
                  onChange={(e) => updateContent('variable', e.target.value)}
                  placeholder="Ex: nome_cliente"
                />
              </div>
              <div className="space-y-2">
                <Label>Operador</Label>
                <Select
                  value={editedNode.content.operator || 'equals'}
                  onValueChange={(value) => updateContent('operator', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">É igual a</SelectItem>
                    <SelectItem value="contains">Contém</SelectItem>
                    <SelectItem value="starts_with">Começa com</SelectItem>
                    <SelectItem value="ends_with">Termina com</SelectItem>
                    <SelectItem value="greater">Maior que</SelectItem>
                    <SelectItem value="less">Menor que</SelectItem>
                    <SelectItem value="exists">Existe (não vazio)</SelectItem>
                    <SelectItem value="not_exists">Não existe (vazio)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!['exists', 'not_exists'].includes(editedNode.content.operator || '') && (
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input
                    value={editedNode.content.value || ''}
                    onChange={(e) => updateContent('value', e.target.value)}
                    placeholder="Valor a comparar"
                  />
                </div>
              )}
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-green-600">✓ Se verdadeiro, ir para:</Label>
                  <Select
                    value={editedNode.content.true_node || ''}
                    onValueChange={(value) => updateContent('true_node', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {nodes.filter(n => n.node_id !== editedNode.node_id).map(n => (
                        <SelectItem key={n.node_id} value={n.node_id}>{n.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-red-600">✗ Se falso, ir para:</Label>
                  <Select
                    value={editedNode.content.false_node || ''}
                    onValueChange={(value) => updateContent('false_node', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {nodes.filter(n => n.node_id !== editedNode.node_id).map(n => (
                        <SelectItem key={n.node_id} value={n.node_id}>{n.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {editedNode.node_type === 'delay' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tempo de espera (segundos)</Label>
                <Input
                  type="number"
                  min={1}
                  max={300}
                  value={editedNode.content.seconds || 3}
                  onChange={(e) => updateContent('seconds', parseInt(e.target.value) || 3)}
                />
                <p className="text-xs text-muted-foreground">
                  Simula digitação e torna a conversa mais natural
                </p>
              </div>
            </div>
          )}

          {editedNode.node_type === 'transfer_human' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Mensagem ao transferir</Label>
                <Textarea
                  value={editedNode.content.message || ''}
                  onChange={(e) => updateContent('message', e.target.value)}
                  placeholder="Aguarde, vou transferir para um atendente..."
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editedNode.content.notify_admin ?? true}
                  onCheckedChange={(checked) => updateContent('notify_admin', checked)}
                />
                <Label>Notificar administrador</Label>
              </div>
            </div>
          )}

          {editedNode.node_type === 'goto' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Ir para o bloco</Label>
                <Select
                  value={editedNode.content.target_node || ''}
                  onValueChange={(value) => updateContent('target_node', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o bloco destino..." />
                  </SelectTrigger>
                  <SelectContent>
                    {nodes.filter(n => n.node_id !== editedNode.node_id).map(n => (
                      <SelectItem key={n.node_id} value={n.node_id}>{n.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* 🍕 DELIVERY ORDER - Criar Pedido */}
          {editedNode.node_type === 'delivery_order' && (
            <div className="space-y-4">
              <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-sm text-orange-700">
                  <strong>🍕 Criar Pedido de Delivery</strong><br/>
                  Este nó cria um pedido automaticamente usando as variáveis coletadas no fluxo.
                </p>
                <p className="text-xs text-orange-600 mt-2">
                  Variáveis usadas: <code>pedido_itens</code>, <code>pedido_total</code>, <code>endereco</code>, <code>pagamento</code>
                </p>
              </div>
              <div className="space-y-2">
                <Label>Mensagem de confirmação</Label>
                <Textarea
                  value={editedNode.content.confirmation_message || ''}
                  onChange={(e) => updateContent('confirmation_message', e.target.value)}
                  placeholder="✅ *Pedido Confirmado!*&#10;&#10;📋 Itens: {{pedido_itens}}&#10;💰 Total: R$ {{pedido_total}}"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">Use {'{{variavel}}'} para inserir variáveis</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pagamento padrão</Label>
                  <Select
                    value={editedNode.content.default_payment || 'dinheiro'}
                    onValueChange={(value) => updateContent('default_payment', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">💵 Dinheiro</SelectItem>
                      <SelectItem value="pix">📱 Pix</SelectItem>
                      <SelectItem value="cartao">💳 Cartão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de entrega padrão</Label>
                  <Select
                    value={editedNode.content.default_delivery_type || 'delivery'}
                    onValueChange={(value) => updateContent('default_delivery_type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="delivery">🛵 Entrega</SelectItem>
                      <SelectItem value="pickup">🏪 Retirada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* ⏰ CHECK BUSINESS HOURS - Horário de Funcionamento */}
          {editedNode.node_type === 'check_business_hours' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-700">
                  <strong>⏰ Verificar Horário</strong><br/>
                  Direciona o fluxo baseado no horário de funcionamento.
                </p>
                <p className="text-xs text-amber-600 mt-2">
                  Conexões: <strong>open</strong> (aberto) e <strong>closed</strong> (fechado)
                </p>
              </div>
              <div className="space-y-2">
                <Label>Mensagem quando fechado</Label>
                <Textarea
                  value={editedNode.content.closed_message || ''}
                  onChange={(e) => updateContent('closed_message', e.target.value)}
                  placeholder="😴 Estamos fechados no momento. Nosso horário de funcionamento é..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Horários de Funcionamento</Label>
                <div className="space-y-2 text-sm">
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                    const dayLabels: Record<string, string> = {
                      monday: 'Segunda',
                      tuesday: 'Terça',
                      wednesday: 'Quarta',
                      thursday: 'Quinta',
                      friday: 'Sexta',
                      saturday: 'Sábado',
                      sunday: 'Domingo'
                    };
                    const hours = editedNode.content.opening_hours || {};
                    const dayHours = hours[day] || { open: '09:00', close: '18:00', is_open: true };
                    
                    return (
                      <div key={day} className="flex items-center gap-2 py-1">
                        <Switch
                          checked={dayHours.is_open}
                          onCheckedChange={(checked) => {
                            const newHours = { ...hours };
                            newHours[day] = { ...dayHours, is_open: checked };
                            updateContent('opening_hours', newHours);
                          }}
                        />
                        <span className="w-20 text-sm">{dayLabels[day]}</span>
                        <Input
                          type="time"
                          value={dayHours.open}
                          onChange={(e) => {
                            const newHours = { ...hours };
                            newHours[day] = { ...dayHours, open: e.target.value };
                            updateContent('opening_hours', newHours);
                          }}
                          className="w-24 h-8"
                          disabled={!dayHours.is_open}
                        />
                        <span>até</span>
                        <Input
                          type="time"
                          value={dayHours.close}
                          onChange={(e) => {
                            const newHours = { ...hours };
                            newHours[day] = { ...dayHours, close: e.target.value };
                            updateContent('opening_hours', newHours);
                          }}
                          className="w-24 h-8"
                          disabled={!dayHours.is_open}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 📅 CREATE_APPOINTMENT - Criar Agendamento */}
          {editedNode.node_type === 'create_appointment' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-sm text-emerald-700">
                  <strong>📅 Criar Agendamento</strong><br/>
                  Este nó cria um agendamento automaticamente usando as variáveis coletadas no fluxo.
                </p>
                <p className="text-xs text-emerald-600 mt-2">
                  Variáveis usadas: <code>nome</code>, <code>data</code>, <code>horario</code>, <code>servico</code>, <code>profissional</code>
                </p>
              </div>
              <div className="space-y-2">
                <Label>Mensagem de confirmação</Label>
                <Textarea
                  value={editedNode.content.confirmation_message || ''}
                  onChange={(e) => updateContent('confirmation_message', e.target.value)}
                  placeholder="✅ *Agendamento Confirmado!*&#10;&#10;📅 Data: {{agendamento_data}}&#10;⏰ Horário: {{agendamento_horario}}"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">Use {'{{variavel}}'} para inserir variáveis</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do serviço (padrão)</Label>
                  <Input
                    value={editedNode.content.service_name || ''}
                    onChange={(e) => updateContent('service_name', e.target.value)}
                    placeholder="Ex: Corte de Cabelo"
                  />
                  <p className="text-xs text-muted-foreground">Usado se <code>servico</code> não for coletado</p>
                </div>
                <div className="space-y-2">
                  <Label>Nome do profissional (padrão)</Label>
                  <Input
                    value={editedNode.content.professional_name || ''}
                    onChange={(e) => updateContent('professional_name', e.target.value)}
                    placeholder="Ex: Maria"
                  />
                  <p className="text-xs text-muted-foreground">Usado se <code>profissional</code> não for coletado</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Duração padrão (minutos)</Label>
                  <Input
                    type="number"
                    value={editedNode.content.duration_minutes || 60}
                    onChange={(e) => updateContent('duration_minutes', parseInt(e.target.value) || 60)}
                    min={15}
                    step={15}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de atendimento</Label>
                  <Select
                    value={editedNode.content.location_type || 'presencial'}
                    onValueChange={(value) => updateContent('location_type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="presencial">🏢 Presencial</SelectItem>
                      <SelectItem value="online">💻 Online</SelectItem>
                      <SelectItem value="domicilio">🏠 Domicílio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Local/Endereço (opcional)</Label>
                <Input
                  value={editedNode.content.location || ''}
                  onChange={(e) => updateContent('location', e.target.value)}
                  placeholder="Ex: Rua das Flores, 123 - Centro"
                />
              </div>
              <div className="space-y-2">
                <Label>Mensagem se faltar dados</Label>
                <Textarea
                  value={editedNode.content.missing_data_message || ''}
                  onChange={(e) => updateContent('missing_data_message', e.target.value)}
                  placeholder="❌ Desculpe, preciso da data e horário para agendar. Pode informar?"
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* Próximo nó (para tipos simples) */}
          {!['start', 'condition', 'end', 'goto', 'buttons', 'list'].includes(editedNode.node_type) && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Próximo bloco</Label>
                <Select
                  value={editedNode.next_node_id || 'none'}
                  onValueChange={(value) => setEditedNode(prev => prev ? { ...prev, next_node_id: value === 'none' ? undefined : value } : null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o próximo bloco..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (fim do caminho)</SelectItem>
                    {nodes.filter(n => n.node_id !== editedNode.node_id).map(n => (
                      <SelectItem key={n.node_id} value={n.node_id}>{n.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Simulador de WhatsApp com suporte a Delivery Dinâmico
function WhatsAppSimulator({
  nodes,
  connections,
  config
}: {
  nodes: FlowNode[];
  connections: FlowConnection[];
  config: ChatbotConfig | null;
}) {
  const [messages, setMessages] = useState<Array<{
    id: string;
    text: string;
    type: 'user' | 'bot';
    timestamp: Date;
    buttons?: Array<{ id: string; title?: string; text?: string }>;
    list?: { button_text: string; sections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }> };
    media?: { type: string; url: string; caption?: string };
    poll?: { question: string; options: Array<{ id: string; text: string }>; allowMultiple: boolean };
  }>>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [isTyping, setIsTyping] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [currentInputNode, setCurrentInputNode] = useState<FlowNode | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 🛒 CARRINHO DE COMPRAS para delivery dinâmico
  const [cart, setCart] = useState<Array<{ id: string; name: string; price: number; quantity: number }>>([]);
  const [dynamicMenuSections, setDynamicMenuSections] = useState<Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }> | null>(null);
  
  // 🔐 Usar hook useAuth para obter userId diretamente (sem fetch que dá 401)
  const { user } = useAuth();
  const userId = user?.id || null;
  
  // Buscar cardápio dinâmico DIRETAMENTE do Supabase (evita problemas com API 401)
  useEffect(() => {
    const fetchDynamicMenu = async () => {
      if (!userId) {
        console.log('⏳ Aguardando userId para carregar cardápio...');
        return;
      }
      try {
        console.log('🔄 Buscando cardápio DIRETO do Supabase para userId:', userId);
        
        // Buscar categorias diretamente do Supabase
        const { data: categories, error: catError } = await supabase
          .from('menu_categories')
          .select('*')
          .eq('user_id', userId)
          .order('display_order', { ascending: true });
        
        if (catError) {
          console.log('⚠️ Erro ao buscar categorias:', catError.message);
        }
        
        // Buscar itens diretamente do Supabase
        const { data: items, error: itemsError } = await supabase
          .from('menu_items')
          .select('*')
          .eq('user_id', userId)
          .eq('is_available', true)
          .order('name', { ascending: true });
        
        if (itemsError) {
          console.log('⚠️ Erro ao buscar itens:', itemsError.message);
        }
        
        console.log('📦 Dados do Supabase:', {
          categorias: categories?.length || 0,
          itens: items?.length || 0
        });
        
        if (categories && items && items.length > 0) {
          // Converter para formato de sections para a lista do WhatsApp
          const sections = categories.map((cat: any) => ({
            title: cat.name,
            rows: items
              .filter((item: any) => item.category_id === cat.id)
              .map((item: any) => ({
                id: item.id,
                title: item.name,
                description: `R$ ${parseFloat(item.price).toFixed(2).replace('.', ',')}${item.description ? ' - ' + item.description.substring(0, 50) : ''}`,
                price: parseFloat(item.price),
                menuItemId: item.id,
              }))
          })).filter((s: any) => s.rows.length > 0);
          
          // Itens sem categoria
          const uncategorizedItems = items.filter((item: any) => !item.category_id);
          if (uncategorizedItems.length > 0) {
            sections.push({
              title: '🍽️ Outros',
              rows: uncategorizedItems.map((item: any) => ({
                id: item.id,
                title: item.name,
                description: `R$ ${parseFloat(item.price).toFixed(2).replace('.', ',')}${item.description ? ' - ' + item.description.substring(0, 50) : ''}`,
                price: parseFloat(item.price),
                menuItemId: item.id,
              }))
            });
          }
          
          if (sections.length > 0) {
            setDynamicMenuSections(sections);
            console.log('✅ Cardápio dinâmico carregado:', sections.length, 'categorias com', 
              sections.reduce((total: number, s: any) => total + (s.rows?.length || 0), 0), 'itens');
            console.log('📋 Categorias:', sections.map((s: any) => `${s.title} (${s.rows.length} itens)`).join(', '));
          } else {
            console.log('⚠️ Cardápio sem categorias com itens');
          }
        } else {
          console.log('⚠️ Nenhum item no cardápio para este usuário');
        }
      } catch (error) {
        console.error('❌ Erro ao buscar cardápio:', error);
      }
    };
    fetchDynamicMenu();
  }, [userId]);
  
  // Calcular total do carrinho
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartItemsText = cart.length > 0 
    ? cart.map(i => `• ${i.quantity}x ${i.name} - R$ ${(i.price * i.quantity).toFixed(2).replace('.', ',')}`).join('\n')
    : 'Carrinho vazio';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Interpolação de variáveis no texto (inclui variáveis do carrinho)
  const interpolateVariables = (text: string): string => {
    // Adicionar variáveis do carrinho
    const allVars: Record<string, string> = {
      ...variables,
      carrinho_total: cartTotal.toFixed(2).replace('.', ','),
      carrinho_itens: cartItemsText,
      item_nome: variables.item_nome || '',
    };
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return allVars[varName] || match;
    });
  };

  // Encontrar próximo nó baseado na conexão
  const findNextNode = (fromNodeId: string, handle: string = 'default'): FlowNode | null => {
    console.log('🔍 findNextNode chamado:', { fromNodeId, handle, totalConnections: connections.length });
    
    const connection = connections.find(
      c => c.from_node_id === fromNodeId && c.from_handle === handle
    );
    
    if (connection) {
      console.log('✅ Conexão encontrada:', connection);
      const nextNode = nodes.find(n => n.node_id === connection.to_node_id);
      console.log('➡️ Próximo nó:', nextNode?.node_id, nextNode?.node_type);
      return nextNode || null;
    }
    
    console.log('⚠️ Nenhuma conexão encontrada para:', { fromNodeId, handle });
    console.log('📋 Conexões disponíveis:', connections.map(c => ({ from: c.from_node_id, handle: c.from_handle, to: c.to_node_id })));
    
    // Fallback para next_node_id
    const currentNode = nodes.find(n => n.node_id === fromNodeId);
    if (currentNode?.next_node_id) {
      console.log('🔄 Usando fallback next_node_id:', currentNode.next_node_id);
      return nodes.find(n => n.node_id === currentNode.next_node_id) || null;
    }
    
    // Fallback para próximo nó baseado em display_order
    if (currentNode) {
      const sortedNodes = [...nodes].sort((a, b) => a.display_order - b.display_order);
      const currentIndex = sortedNodes.findIndex(n => n.node_id === fromNodeId);
      if (currentIndex >= 0 && currentIndex < sortedNodes.length - 1) {
        return sortedNodes[currentIndex + 1];
      }
    }
    
    return null;
  };

  // Processar nó
  const processNode = async (node: FlowNode) => {
    setCurrentNodeId(node.node_id);
    
    // Simular delay de digitação
    const typingDelay = config?.typing_delay_ms || 1500;
    setIsTyping(true);
    await new Promise(resolve => setTimeout(resolve, typingDelay));
    setIsTyping(false);

    switch (node.node_type) {
      case 'start':
        // Ir para próximo nó
        const nextAfterStart = findNextNode(node.node_id);
        if (nextAfterStart) {
          await processNode(nextAfterStart);
        }
        break;

      case 'message':
        const msgText = interpolateVariables(node.content.text || '');
        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}`,
          text: msgText,
          type: 'bot',
          timestamp: new Date()
        }]);
        
        // 🛒 CRIAR PEDIDO NO SUPABASE quando a flag createOrder estiver presente
        if (node.content.createOrder && userId && cart.length > 0) {
          try {
            console.log('📦 Criando pedido no Supabase...');
            const orderData = {
              user_id: userId,
              customer_name: variables.nome || 'Cliente Simulador',
              customer_phone: variables.telefone || '5500000000000',
              customer_address: variables.endereco || 'Endereço não informado',
              items: cart.map(item => ({
                menu_item_id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity
              })),
              total: cartTotal,
              delivery_fee: 0,
              payment_method: variables.pagamento || 'pix',
              notes: 'Pedido criado via Simulador de Fluxo',
              status: 'pending'
            };
            
            const response = await fetch('/api/public/delivery/orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(orderData)
            });
            
            if (response.ok) {
              const result = await response.json();
              console.log('✅ Pedido criado com sucesso:', result.orderNumber);
              // Limpar carrinho após criar pedido
              setCart([]);
            } else {
              console.error('❌ Erro ao criar pedido:', await response.text());
            }
          } catch (error) {
            console.error('❌ Erro ao criar pedido:', error);
          }
        }
        
        // Ir para próximo nó
        const nextAfterMessage = findNextNode(node.node_id);
        if (nextAfterMessage) {
          await new Promise(resolve => setTimeout(resolve, config?.message_delay_ms || 500));
          await processNode(nextAfterMessage);
        }
        break;

      case 'buttons':
        const btnBody = interpolateVariables(node.content.body || '');
        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}`,
          text: btnBody,
          type: 'bot',
          timestamp: new Date(),
          buttons: node.content.buttons
        }]);
        setWaitingForInput(true);
        setCurrentInputNode(node);
        break;

      case 'list':
        const listBody = interpolateVariables(node.content.body || '');
        
        // 🚀 CARDÁPIO DINÂMICO: Se tiver dynamicSource e temos cardápio carregado, usar ele
        let finalSections: any[] = node.content.sections || [];
        if (node.content.dynamicSource === 'menu_items' && dynamicMenuSections && dynamicMenuSections.length > 0) {
          finalSections = dynamicMenuSections;
          console.log('📋 Usando cardápio dinâmico com', finalSections.length, 'categorias');
        }
        
        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}`,
          text: listBody,
          type: 'bot',
          timestamp: new Date(),
          list: {
            button_text: node.content.button_text || 'Ver opções',
            sections: finalSections
          }
        }]);
        setWaitingForInput(true);
        setCurrentInputNode(node);
        break;

      case 'poll':
        const pollQuestion = interpolateVariables(node.content.poll_question || '');
        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}`,
          text: pollQuestion,
          type: 'bot',
          timestamp: new Date(),
          poll: {
            question: pollQuestion,
            options: node.content.poll_options || [],
            allowMultiple: node.content.poll_allow_multiple || false
          }
        }]);
        setWaitingForInput(true);
        setCurrentInputNode(node);
        break;

      case 'input':
        const prompt = interpolateVariables(node.content.prompt || '');
        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}`,
          text: prompt,
          type: 'bot',
          timestamp: new Date()
        }]);
        setWaitingForInput(true);
        setCurrentInputNode(node);
        break;

      case 'media':
        const caption = interpolateVariables(node.content.caption || '');
        const mediaUrl = node.content.url || '';
        const mediaType = node.content.media_type || 'image';
        
        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}`,
          text: caption || '',
          type: 'bot',
          timestamp: new Date(),
          media: {
            type: mediaType,
            url: mediaUrl,
            caption: caption
          }
        }]);
        
        const nextAfterMedia = findNextNode(node.node_id);
        if (nextAfterMedia) {
          await new Promise(resolve => setTimeout(resolve, config?.message_delay_ms || 500));
          await processNode(nextAfterMedia);
        }
        break;

      case 'condition':
        const varValue = variables[node.content.variable || ''] || '';
        let conditionResult = false;
        
        switch (node.content.operator) {
          case 'equals':
            conditionResult = varValue === node.content.value;
            break;
          case 'contains':
            conditionResult = varValue.includes(node.content.value || '');
            break;
          case 'starts_with':
            conditionResult = varValue.startsWith(node.content.value || '');
            break;
          case 'ends_with':
            conditionResult = varValue.endsWith(node.content.value || '');
            break;
          case 'greater':
            conditionResult = parseFloat(varValue) > parseFloat(node.content.value || '0');
            break;
          case 'less':
            conditionResult = parseFloat(varValue) < parseFloat(node.content.value || '0');
            break;
          case 'exists':
            conditionResult = !!varValue;
            break;
          case 'not_exists':
            conditionResult = !varValue;
            break;
        }
        
        const nextNodeId = conditionResult ? node.content.true_node : node.content.false_node;
        if (nextNodeId) {
          const nextNode = nodes.find(n => n.node_id === nextNodeId);
          if (nextNode) {
            await processNode(nextNode);
          }
        }
        break;

      case 'delay':
        await new Promise(resolve => setTimeout(resolve, (node.content.seconds || 3) * 1000));
        const nextAfterDelay = findNextNode(node.node_id);
        if (nextAfterDelay) {
          await processNode(nextAfterDelay);
        }
        break;

      case 'transfer_human':
        const transferMsg = interpolateVariables(node.content.message || 'Transferindo para um atendente...');
        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}`,
          text: `👤 ${transferMsg}`,
          type: 'bot',
          timestamp: new Date()
        }]);
        break;

      case 'goto':
        if (node.content.target_node) {
          const targetNode = nodes.find(n => n.node_id === node.content.target_node);
          if (targetNode) {
            await processNode(targetNode);
          }
        }
        break;

      case 'set_variable':
        if (node.content.variable_name) {
          setVariables(prev => ({
            ...prev,
            [node.content.variable_name!]: node.content.value || ''
          }));
        }
        const nextAfterSetVar = findNextNode(node.node_id);
        if (nextAfterSetVar) {
          await processNode(nextAfterSetVar);
        }
        break;

      case 'end':
        const goodbyeMsg = interpolateVariables(config?.goodbye_message || 'Até mais! 👋');
        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}`,
          text: goodbyeMsg,
          type: 'bot',
          timestamp: new Date()
        }]);
        break;

      // 🍕 DELIVERY_ORDER - Criar pedido no sistema
      case 'delivery_order':
        try {
          const orderItems = variables['pedido_itens'] || variables['items'] || variables['carrinho'] || cartItemsText;
          const orderTotal = variables['pedido_total'] || variables['total'] || cartTotal.toFixed(2);
          const deliveryAddr = variables['endereco'] || variables['address'] || 'Endereço não informado';
          const payment = variables['pagamento'] || variables['payment'] || node.content.default_payment || 'dinheiro';
          const deliveryTypeVar = variables['tipo_entrega'] || variables['delivery_type'] || node.content.default_delivery_type || 'delivery';
          
          // Criar pedido no Supabase
          if (userId) {
            try {
              const orderData = {
                user_id: userId,
                customer_name: variables.nome || 'Cliente Simulador',
                customer_phone: variables.telefone || '5500000000000',
                customer_address: deliveryAddr,
                items: cart.length > 0 ? cart.map(item => ({
                  menu_item_id: item.id,
                  name: item.name,
                  price: item.price,
                  quantity: item.quantity
                })) : [{ name: orderItems, price: parseFloat(orderTotal), quantity: 1 }],
                total: parseFloat(orderTotal) || cartTotal,
                delivery_fee: parseFloat(variables['taxa_entrega'] || '0'),
                payment_method: payment,
                notes: variables['observacoes'] || '',
                status: 'pending',
                delivery_type: deliveryTypeVar
              };
              
              const response = await fetch('/api/public/delivery/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
              });
              
              if (response.ok) {
                console.log('✅ Pedido criado via delivery_order node');
                setCart([]); // Limpar carrinho
              }
            } catch (orderError) {
              console.error('❌ Erro ao criar pedido:', orderError);
            }
          }
          
          // Mensagem de confirmação
          const confirmOrderMsg = interpolateVariables(
            node.content.confirmation_message || 
            `✅ *Pedido Confirmado!*\n\n📋 Itens: ${orderItems}\n💰 Total: R$ ${orderTotal}\n📍 Entrega: ${deliveryAddr}\n💳 Pagamento: ${payment}`
          );
          setMessages(prev => [...prev, {
            id: `msg_${Date.now()}`,
            text: confirmOrderMsg,
            type: 'bot',
            timestamp: new Date()
          }]);
          
          // Ir para próximo nó
          const nextAfterOrder = findNextNode(node.node_id);
          if (nextAfterOrder) {
            await new Promise(resolve => setTimeout(resolve, config?.message_delay_ms || 500));
            await processNode(nextAfterOrder);
          }
        } catch (deliveryError) {
          console.error('❌ Erro no nó delivery_order:', deliveryError);
          setMessages(prev => [...prev, {
            id: `msg_${Date.now()}`,
            text: '❌ Erro ao processar pedido.',
            type: 'bot',
            timestamp: new Date()
          }]);
        }
        break;

      // ⏰ CHECK_BUSINESS_HOURS - Verificar horário de funcionamento
      case 'check_business_hours':
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const now = new Date();
        const dayOfWeek = days[now.getDay()];
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const hours = node.content.opening_hours || {};
        const todayHours = hours[dayOfWeek];
        
        let isBusinessOpen = false;
        if (todayHours?.is_open) {
          const [openH, openM] = (todayHours.open || '09:00').split(':').map(Number);
          const [closeH, closeM] = (todayHours.close || '18:00').split(':').map(Number);
          const openMinutes = openH * 60 + openM;
          const closeMinutes = closeH * 60 + closeM;
          
          if (closeMinutes > openMinutes) {
            isBusinessOpen = currentTime >= openMinutes && currentTime < closeMinutes;
          } else {
            // Passa da meia-noite
            isBusinessOpen = currentTime >= openMinutes || currentTime < closeMinutes;
          }
        }
        
        // Armazenar resultado
        setVariables(prev => ({
          ...prev,
          is_open: isBusinessOpen ? 'true' : 'false',
          business_status: isBusinessOpen ? 'aberto' : 'fechado'
        }));
        
        // Se fechado, mostrar mensagem
        if (!isBusinessOpen && node.content.closed_message) {
          const closedMsgText: string = node.content.closed_message;
          setMessages(prev => [...prev, {
            id: `msg_${Date.now()}`,
            text: interpolateVariables(closedMsgText),
            type: 'bot',
            timestamp: new Date()
          }]);
        }
        
        // Ir para nó correto baseado no status
        const handleToFollow = isBusinessOpen ? 'open' : 'closed';
        const nextAfterHours = findNextNode(node.node_id, handleToFollow) || findNextNode(node.node_id);
        if (nextAfterHours) {
          await new Promise(resolve => setTimeout(resolve, config?.message_delay_ms || 500));
          await processNode(nextAfterHours);
        }
        break;

      // 📅 CREATE_APPOINTMENT - Criar agendamento no sistema
      case 'create_appointment':
        try {
          const clientName = variables['nome'] || variables['cliente_nome'] || 'Cliente Simulador';
          const clientPhone = variables['telefone'] || variables['cliente_telefone'] || '5500000000000';
          const clientEmail = variables['email'] || variables['cliente_email'] || '';
          const serviceName = variables['servico'] || variables['servico_nome'] || node.content.service_name || 'Serviço';
          const serviceId = variables['servico_id'] || node.content.service_id || '';
          const professionalName = variables['profissional'] || variables['profissional_nome'] || node.content.professional_name || '';
          const professionalId = variables['profissional_id'] || node.content.professional_id || '';
          const appointmentDate = variables['data'] || variables['data_agendamento'] || new Date().toISOString().split('T')[0];
          const appointmentTime = variables['horario'] || variables['hora'] || variables['horario_agendamento'] || '10:00';
          const durationMinutes = parseInt(variables['duracao'] || String(node.content.duration_minutes) || '60') || 60;
          const customerNotes = variables['observacoes'] || variables['notas'] || '';
          const location = variables['local'] || node.content.location || '';
          const locationType = variables['tipo_atendimento'] || node.content.location_type || 'presencial';

          // Atualizar variáveis para mensagem de confirmação
          setVariables(prev => ({
            ...prev,
            agendamento_data: appointmentDate,
            agendamento_horario: appointmentTime,
            agendamento_servico: serviceName,
            agendamento_profissional: professionalName || 'A definir',
            agendamento_duracao: String(durationMinutes)
          }));

          // Criar agendamento no Supabase
          if (userId) {
            try {
              // Calcular end_time baseado em duration_minutes
              const [hours, minutes] = appointmentTime.split(':').map(Number);
              const endDate = new Date(2000, 0, 1, hours, minutes + durationMinutes);
              const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
              
              const appointmentData = {
                id: `apt_sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                user_id: userId,
                client_name: clientName,
                client_phone: clientPhone,
                client_email: clientEmail,
                service_id: serviceId || null,
                service_name: serviceName,
                professional_id: professionalId || null,
                professional_name: professionalName || null,
                appointment_date: appointmentDate,
                start_time: appointmentTime,
                end_time: endTime,
                duration_minutes: durationMinutes,
                location: location || null,
                location_type: locationType,
                status: 'pendente',
                confirmed_by_client: false,
                confirmed_by_business: false,
                created_by_ai: true,
                ai_confirmation_pending: true,
                client_notes: customerNotes || null
              };

              const { error } = await supabase
                .from('appointments')
                .insert(appointmentData);

              if (error) {
                console.error('❌ Erro ao criar agendamento:', error);
              } else {
                console.log('✅ Agendamento criado via create_appointment node');
              }
            } catch (appointmentError) {
              console.error('❌ Erro ao criar agendamento:', appointmentError);
            }
          }

          // Mensagem de confirmação
          const confirmAppointmentMsg = interpolateVariables(
            node.content.confirmation_message ||
            `✅ *Agendamento Confirmado!*\n\n📅 Data: ${appointmentDate}\n⏰ Horário: ${appointmentTime}\n💼 Serviço: ${serviceName}\n👤 Profissional: ${professionalName || 'A definir'}\n⏱️ Duração: ${durationMinutes} minutos\n\nAguardamos você! 📋`
          );
          setMessages(prev => [...prev, {
            id: `msg_${Date.now()}`,
            text: confirmAppointmentMsg,
            type: 'bot',
            timestamp: new Date()
          }]);

          // Ir para próximo nó
          const nextAfterAppointment = findNextNode(node.node_id);
          if (nextAfterAppointment) {
            await new Promise(resolve => setTimeout(resolve, config?.message_delay_ms || 500));
            await processNode(nextAfterAppointment);
          }
        } catch (appointmentError) {
          console.error('❌ Erro no nó create_appointment:', appointmentError);
          setMessages(prev => [...prev, {
            id: `msg_${Date.now()}`,
            text: '❌ Erro ao processar agendamento.',
            type: 'bot',
            timestamp: new Date()
          }]);
        }
        break;
    }
  };

  // Iniciar simulação
  const startSimulation = async () => {
    setMessages([]);
    setVariables({});
    setCurrentNodeId(null);
    setWaitingForInput(false);
    setCurrentInputNode(null);

    // Mensagem de boas-vindas
    if (config?.send_welcome_on_first_contact && config?.welcome_message) {
      setMessages([{
        id: 'welcome',
        text: config.welcome_message,
        type: 'bot',
        timestamp: new Date()
      }]);
    }

    // Encontrar nó de início
    const startNode = nodes.find(n => n.node_type === 'start');
    if (startNode) {
      await new Promise(resolve => setTimeout(resolve, 500));
      await processNode(startNode);
    }
  };

  // Processar entrada do usuário
  const handleUserInput = async (input: string) => {
    console.log('📨 handleUserInput:', { input, waitingForInput, currentInputNode: currentInputNode?.node_id, nodeType: currentInputNode?.node_type });
    if (!input.trim()) return;

    // Adicionar mensagem do usuário
    setMessages(prev => [...prev, {
      id: `user_${Date.now()}`,
      text: input,
      type: 'user',
      timestamp: new Date()
    }]);
    setInputValue('');

    // Verificar palavra-chave de reinício
    if (config?.restart_on_keyword && config?.restart_keywords?.some(kw => 
      input.toLowerCase() === kw.toLowerCase()
    )) {
      await startSimulation();
      return;
    }

    if (!waitingForInput || !currentInputNode) {
      console.log('⚠️ Parando: waitingForInput=', waitingForInput, 'currentInputNode=', currentInputNode?.node_id);
      return;
    }

    setWaitingForInput(false);

    // Processar baseado no tipo de nó atual
    if (currentInputNode.node_type === 'input') {
      // Salvar variável - templates usam 'variable', editor visual usa 'variable_name'
      const varName = currentInputNode.content.variable_name || currentInputNode.content.variable || 'input';
      console.log('📝 Salvando variável:', varName, '=', input);
      setVariables(prev => ({ ...prev, [varName]: input }));
      
      // Ir para próximo nó
      const nextNode = findNextNode(currentInputNode.node_id);
      if (nextNode) {
        await processNode(nextNode);
      }
    } else if (currentInputNode.node_type === 'buttons') {
      // Encontrar botão clicado (por título/text ou id) - templates usam text, visual usa title
      const button = currentInputNode.content.buttons?.find(
        btn => (btn.title || btn.text || '').toLowerCase() === input.toLowerCase() || btn.id === input
      );
      
      if (button) {
        // Tentar múltiplos formatos de handle (templates usam formatos diferentes)
        // 1. Formato direto (btn_1, cardapio, pix) - usado nos templates hardcoded
        // 2. Formato com prefixo (button_btn_1) - usado em fluxos criados pelo visual editor
        const nextNode = findNextNode(currentInputNode.node_id, button.id) || 
                        findNextNode(currentInputNode.node_id, `button_${button.id}`) ||
                        findNextNode(currentInputNode.node_id);
        if (nextNode) {
          await processNode(nextNode);
        }
      } else {
        // Fallback message
        setMessages(prev => [...prev, {
          id: `fallback_${Date.now()}`,
          text: config?.fallback_message || 'Não entendi. Escolha uma das opções acima.',
          type: 'bot',
          timestamp: new Date()
        }]);
        setWaitingForInput(true);
      }
    } else if (currentInputNode.node_type === 'list') {
      // Encontrar opção selecionada em TODAS as seções (não só na primeira)
      // 🚀 USAR CARDÁPIO DINÂMICO se disponível
      let option: any = null;
      let sections: any[] = currentInputNode.content.sections || [];
      
      if (currentInputNode.content.dynamicSource === 'menu_items' && dynamicMenuSections && dynamicMenuSections.length > 0) {
        sections = dynamicMenuSections;
      }
      
      for (const section of sections) {
        const found = section.rows?.find(
          (row: any) => row.title.toLowerCase() === input.toLowerCase() || row.id === input
        );
        if (found) {
          option = found;
          break;
        }
      }
      
      if (option) {
        // 🛒 SALVAR ITEM SELECIONADO na variável
        const itemName = option.title || 'Item';
        console.log('📋 Item selecionado da lista:', itemName);
        setVariables(prev => ({ ...prev, item_selecionado: itemName }));
        
        // Tentar múltiplos formatos de handle
        const nextNode = findNextNode(currentInputNode.node_id, option.id) ||
                        findNextNode(currentInputNode.node_id, `row_${option.id}`) || 
                        findNextNode(currentInputNode.node_id);
        console.log('➡️ Próximo nó após lista:', nextNode?.node_id || 'não encontrado');
        if (nextNode) {
          await processNode(nextNode);
        } else {
          console.warn('⚠️ Nenhum próximo nó encontrado após lista! Verificar conexões.');
        }
      } else {
        setMessages(prev => [...prev, {
          id: `fallback_${Date.now()}`,
          text: config?.fallback_message || 'Não entendi. Selecione uma das opções da lista.',
          type: 'bot',
          timestamp: new Date()
        }]);
        setWaitingForInput(true);
      }
    } else if (currentInputNode.node_type === 'poll') {
      // Processar voto na enquete
      const pollOption = currentInputNode.content.poll_options?.find(
        opt => opt.text.toLowerCase() === input.toLowerCase() || opt.id === input
      );
      
      if (pollOption) {
        // Salvar voto na variável
        const varName = currentInputNode.content.poll_save_to_variable || 'voto_enquete';
        setVariables(prev => ({ ...prev, [varName]: pollOption.text }));
        
        // Tentar múltiplos formatos de handle
        const nextNode = findNextNode(currentInputNode.node_id, pollOption.id) ||
                        findNextNode(currentInputNode.node_id, `poll_${pollOption.id}`) || 
                        findNextNode(currentInputNode.node_id);
        if (nextNode) {
          await processNode(nextNode);
        }
      } else {
        setMessages(prev => [...prev, {
          id: `fallback_${Date.now()}`,
          text: config?.fallback_message || 'Não entendi. Selecione uma das opções da enquete.',
          type: 'bot',
          timestamp: new Date()
        }]);
        setWaitingForInput(true);
      }
    }

    // NÃO resetar currentInputNode aqui - o próximo nó define seu próprio estado
    // setCurrentInputNode(null); // REMOVIDO: causava bug - resetava APÓS processNode definir o novo nó
  };

  // Clique em botão - suporta title ou text (templates usam formatos diferentes)
  const handleButtonClick = (button: { id: string; title?: string; text?: string }) => {
    handleUserInput(button.title || button.text || button.id);
  };

  // Clique em item da lista - COM SUPORTE A CARRINHO DE DELIVERY
  const handleListItemClick = (item: { id: string; title?: string; text?: string; description?: string }) => {
    console.log('🖱️ handleListItemClick:', { item: item.title, waitingForInput, currentInputNode: currentInputNode?.node_id, nodeType: currentInputNode?.node_type });
    
    // Se o nó atual é de cardápio dinâmico, adicionar ao carrinho
    if (currentInputNode?.content?.dynamicSource === 'menu_items') {
      // Extrair preço da descrição (formato: "Descrição - R$ 10,00")
      const priceMatch = item.description?.match(/R\$\s*(\d+(?:[.,]\d{2})?)/);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0;
      const name = item.title || item.text || 'Item';
      
      // Verificar se já existe no carrinho
      const existingIndex = cart.findIndex(c => c.id === item.id);
      if (existingIndex >= 0) {
        // Aumentar quantidade
        const newCart = [...cart];
        newCart[existingIndex].quantity += 1;
        setCart(newCart);
      } else {
        // Adicionar novo item
        setCart(prev => [...prev, { id: item.id, name, price, quantity: 1 }]);
      }
      
      // Atualizar variável do item selecionado
      setVariables(prev => ({ 
        ...prev, 
        item_nome: name,
        item_preco: price.toFixed(2).replace('.', ',')
      }));
      
      console.log('🛒 Item adicionado ao carrinho:', name, 'R$', price);
    }
    
    handleUserInput(item.title || item.text || item.id);
  };

  return (
    <div className="flex flex-col h-full bg-[#0b141a] rounded-lg overflow-hidden">
      {/* Header do WhatsApp */}
      <div className="bg-[#202c33] px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#6b7b8a] flex items-center justify-center">
          <Bot className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-white font-medium text-sm">{config?.name || 'Meu Robô'}</p>
          <p className="text-[#8696a0] text-xs">
            {isTyping ? 'digitando...' : 'online'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={startSimulation}
          className="text-white hover:bg-white/10"
        >
          <Play className="h-4 w-4 mr-1" /> Reiniciar
        </Button>
      </div>

      {/* Área de mensagens */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2">
          {messages.length === 0 && (
            <div className="text-center py-8 text-[#8696a0]">
              <Smartphone className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Clique em "Reiniciar" para iniciar a simulação</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                msg.type === 'user' 
                  ? "ml-auto bg-[#005c4b] text-white rounded-br-none"
                  : "mr-auto bg-[#202c33] text-white rounded-bl-none"
              )}
            >
              {/* Renderizar mídia */}
              {msg.media && (
                <div className="mb-2">
                  {msg.media.type === 'image' && msg.media.url && (
                    <img 
                      src={msg.media.url} 
                      alt="Imagem" 
                      className="rounded-lg max-h-48 object-contain"
                    />
                  )}
                  {msg.media.type === 'audio' && msg.media.url && (
                    <audio 
                      src={msg.media.url} 
                      controls 
                      className="w-full max-w-[200px]"
                    />
                  )}
                  {msg.media.type === 'video' && msg.media.url && (
                    <video 
                      src={msg.media.url} 
                      controls 
                      className="rounded-lg max-h-48"
                    />
                  )}
                  {msg.media.type === 'document' && msg.media.url && (
                    <a 
                      href={msg.media.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 bg-[#2a3942] rounded-lg hover:bg-[#3a4952] transition-colors"
                    >
                      <FileText className="h-8 w-8 text-red-400" />
                      <div>
                        <p className="text-sm font-medium text-white">Documento PDF</p>
                        <p className="text-xs text-[#8696a0]">Clique para abrir</p>
                      </div>
                    </a>
                  )}
                </div>
              )}
              
              {/* Renderizar texto apenas se houver texto e não for apenas mídia */}
              {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
              
              {/* Botões */}
              {msg.buttons && (
                <div className="flex flex-col gap-1 mt-2">
                  {msg.buttons.map(btn => (
                    <Button
                      key={btn.id}
                      variant="outline"
                      size="sm"
                      className="w-full bg-transparent border-[#005c4b] text-[#00a884] hover:bg-[#005c4b]/20"
                      onClick={() => handleButtonClick(btn)}
                    >
                      {btn.title || btn.text}
                    </Button>
                  ))}
                </div>
              )}

              {/* Lista - Mostra todas as opções clicáveis */}
              {msg.list && (
                <div className="mt-2 bg-[#1a2930] rounded-lg p-3 border border-[#2a3942]">
                  <div className="flex items-center gap-2 mb-2">
                    <ListOrdered className="h-4 w-4 text-blue-400" />
                    <span className="text-xs text-blue-400 font-medium">LISTA</span>
                  </div>
                  {msg.list.sections.map((section, sIdx) => (
                    <div key={sIdx} className="space-y-2">
                      {section.title && (
                        <p className="text-xs text-[#8696a0] font-medium mt-2">{section.title}</p>
                      )}
                      {section.rows.map((row, rIdx) => (
                        <Button
                          key={row.id}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start bg-transparent border-[#3a4952] text-white hover:bg-[#2a3942] hover:border-blue-500"
                          onClick={() => handleListItemClick(row)}
                        >
                          <span className="w-5 h-5 rounded-full border border-[#8696a0] flex items-center justify-center mr-2 text-xs">
                            {rIdx + 1}
                          </span>
                          <div className="text-left">
                            <p className="text-sm">{row.title}</p>
                            {row.description && (
                              <p className="text-xs text-[#8696a0]">{row.description}</p>
                            )}
                          </div>
                        </Button>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Enquete/Poll */}
              {msg.poll && (
                <div className="mt-2 bg-[#1a2930] rounded-lg p-3 border border-[#2a3942]">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs text-emerald-400 font-medium">ENQUETE</span>
                    {msg.poll.allowMultiple && (
                      <span className="text-[10px] text-[#8696a0]">• Múltiplas respostas</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {msg.poll.options.map((opt, idx) => (
                      <Button
                        key={opt.id}
                        variant="outline"
                        size="sm"
                        className="w-full justify-start bg-transparent border-[#3a4952] text-white hover:bg-[#2a3942] hover:border-emerald-500"
                        onClick={() => handleUserInput(opt.text)}
                      >
                        <span className="w-5 h-5 rounded-full border border-[#8696a0] flex items-center justify-center mr-2 text-xs">
                          {idx + 1}
                        </span>
                        {opt.text}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              
              <p className="text-[10px] text-[#8696a0] text-right mt-1">
                {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
          
          {isTyping && (
            <div className="mr-auto bg-[#202c33] rounded-lg px-4 py-3 rounded-bl-none">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-[#8696a0] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-[#8696a0] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-[#8696a0] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input de mensagem */}
      <div className="bg-[#202c33] px-4 py-3">
        <div className="flex items-center gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUserInput(inputValue)}
            placeholder="Digite uma mensagem..."
            className="flex-1 bg-[#2a3942] border-none text-white placeholder:text-[#8696a0]"
            disabled={!waitingForInput && messages.length > 0}
          />
          <Button
            size="icon"
            onClick={() => handleUserInput(inputValue)}
            disabled={!inputValue.trim() || (!waitingForInput && messages.length > 0)}
            className="bg-[#00a884] hover:bg-[#008069]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Debug: Variáveis */}
      {Object.keys(variables).length > 0 && (
        <div className="bg-[#111b21] px-4 py-2 border-t border-[#2a3942]">
          <p className="text-[10px] text-[#8696a0] mb-1">Variáveis coletadas:</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(variables).map(([key, value]) => (
              <Badge key={key} variant="outline" className="text-[10px] bg-[#005c4b]/20 text-[#00a884] border-[#005c4b]">
                {key}: {value}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== COMPONENTE PRINCIPAL ==============

// Importar o novo FlowBuilderStudio
import { FlowBuilderStudio } from "@/components/flow-builder-studio";

export default function FlowBuilderPage() {
  // Usar o novo FlowBuilderStudio com chat IA + simulador
  return <FlowBuilderStudio />;
}

// ============== COMPONENTE ANTIGO (LEGADO) ==============
// Mantido para referência, pode ser removido no futuro

function FlowBuilderPageLegacy() {
  const { toast } = useToast();
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [connections, setConnections] = useState<FlowConnection[]>([]);
  const [config, setConfig] = useState<ChatbotConfig | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<FlowNode | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Carregar fluxo
  const { data: flowData, isLoading, refetch } = useQuery<{
    config: ChatbotConfig;
    nodes: FlowNode[];
    connections: FlowConnection[];
  }>({
    queryKey: ["/api/chatbot/flow"],
    refetchOnWindowFocus: false
  });

  // Carregar templates
  const { data: templates } = useQuery<FlowTemplate[]>({
    queryKey: ["/api/chatbot/templates"],
  });

  // Efeito para carregar dados
  useEffect(() => {
    if (flowData) {
      if (flowData.config) {
        setConfig(flowData.config);
      }
      if (flowData.nodes?.length > 0) {
        setNodes(flowData.nodes);
      } else {
        // Criar nó de início padrão
        setNodes([{
          id: 'default_start',
          node_id: 'start',
          name: 'Início',
          node_type: 'start',
          content: {},
          position_x: 250,
          position_y: 50,
          display_order: 0
        }]);
      }
      if (flowData.connections) {
        setConnections(flowData.connections);
      }
    }
  }, [flowData]);

  // Salvar fluxo
  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/chatbot/flow/save", {
          nodes: nodes.map(n => ({
            node_id: n.node_id,
            name: n.name,
            node_type: n.node_type,
            content: n.content,
            next_node_id: n.next_node_id,
            position_x: n.position_x,
            position_y: n.position_y,
            display_order: n.display_order
          })),
          connections: connections.map(c => ({
            from_node_id: c.from_node_id,
            from_handle: c.from_handle,
            to_node_id: c.to_node_id,
            label: c.label
          })),
          config: config
      });
    },
    onSuccess: () => {
      toast({
        title: "Fluxo salvo!",
        description: "Suas alterações foram salvas com sucesso.",
      });
      setHasChanges(false);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar o fluxo.",
        variant: "destructive"
      });
    }
  });

  // Aplicar template
  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await apiRequest("POST", `/api/chatbot/templates/${templateId}/apply`);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Template aplicado!",
        description: `O template "${data.templateName || 'Selecionado'}" foi aplicado com sucesso.`,
      });
      setShowTemplates(false);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao aplicar template",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Toggle chatbot ativo
  const toggleMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      return apiRequest("POST", "/api/chatbot/toggle", { is_active: isActive });
    },
    onSuccess: (data: any) => {
      setConfig(prev => prev ? { ...prev, is_active: data.is_active } : null);
      toast({
        title: data.is_active ? "Robô ativado!" : "Robô desativado",
        description: data.is_active 
          ? "O robô agora está respondendo as mensagens." 
          : "O robô foi pausado.",
      });
    }
  });

  // Adicionar nó
  const addNode = (type: NodeType) => {
    const newNodeId = `${type}_${Date.now()}`;
    const config = NODE_TYPES_CONFIG[type];
    const lastNode = nodes[nodes.length - 1];
    
    const newNode: FlowNode = {
      id: newNodeId,
      node_id: newNodeId,
      name: config.label,
      node_type: type,
      content: { ...DEFAULT_NODE_CONTENT[type] },
      position_x: lastNode ? lastNode.position_x : 250,
      position_y: lastNode ? lastNode.position_y + 150 : 150,
      display_order: nodes.length
    };

    setNodes(prev => [...prev, newNode]);
    setHasChanges(true);
    setEditingNode(newNode);
  };

  // Atualizar nó
  const updateNode = (updatedNode: FlowNode) => {
    setNodes(prev => prev.map(n => 
      n.node_id === updatedNode.node_id ? updatedNode : n
    ));
    setHasChanges(true);
    setEditingNode(null);
  };

  // Deletar nó
  const deleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.node_id !== nodeId));
    setConnections(prev => prev.filter(c => 
      c.from_node_id !== nodeId && c.to_node_id !== nodeId
    ));
    setHasChanges(true);
    setSelectedNodeId(null);
  };

  // Duplicar nó
  const duplicateNode = (nodeId: string) => {
    const node = nodes.find(n => n.node_id === nodeId);
    if (!node) return;

    const newNodeId = `${node.node_type}_${Date.now()}`;
    const newNode: FlowNode = {
      ...node,
      id: newNodeId,
      node_id: newNodeId,
      name: `${node.name} (cópia)`,
      position_x: node.position_x + 50,
      position_y: node.position_y + 50,
      display_order: nodes.length
    };

    setNodes(prev => [...prev, newNode]);
    setHasChanges(true);
  };

  // Nó selecionado
  const selectedNode = nodes.find(n => n.node_id === selectedNodeId);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando fluxo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold">Construtor de Fluxo</h1>
              <p className="text-sm text-muted-foreground">
                Crie conversas automatizadas sem usar IA
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Ativo */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border">
                    <Switch
                      checked={config?.is_active ?? false}
                      onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                      disabled={toggleMutation.isPending}
                    />
                    <span className="text-sm">
                      {config?.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {config?.is_active 
                    ? 'Desativar robô (ativar IA)' 
                    : 'Ativar robô (desativar IA)'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Separator orientation="vertical" className="h-6" />

            {/* Templates */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowTemplates(true)}
            >
              <LayoutTemplate className="h-4 w-4 mr-2" />
              Templates
            </Button>

            {/* Configurações */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowSettings(true)}
            >
              <Settings className="h-4 w-4 mr-2" />
              Config
            </Button>

            {/* Simulador */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowSimulator(true)}
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Testar
            </Button>

            {/* Salvar */}
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !hasChanges}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Tipos de nós */}
        <div className="w-64 border-r bg-muted/30 p-4 overflow-y-auto">
          <h2 className="font-medium text-sm mb-3">Blocos</h2>
          
          {/* Categorias */}
          {(['message', 'collect', 'logic', 'action', 'flow'] as const).map(category => {
            const categoryNodes = Object.entries(NODE_TYPES_CONFIG)
              .filter(([_, cfg]) => cfg.category === category);
            
            if (categoryNodes.length === 0) return null;
            
            const categoryLabels = {
              message: '💬 Mensagens',
              collect: '📝 Coleta',
              logic: '🔀 Lógica',
              action: '⚡ Ações',
              flow: '🔄 Fluxo'
            };

            return (
              <div key={category} className="mb-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {categoryLabels[category]}
                </p>
                <div className="space-y-1">
                  {categoryNodes.map(([type, cfg]) => {
                    const Icon = cfg.icon;
                    const nodeType = type as NodeType;
                    
                    // Não permitir adicionar mais de um nó start
                    if (nodeType === 'start' && nodes.some(n => n.node_type === 'start')) {
                      return null;
                    }
                    
                    return (
                      <Button
                        key={type}
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-start text-left h-auto py-2",
                          "hover:bg-background"
                        )}
                        onClick={() => addNode(nodeType)}
                      >
                        <div className={cn("p-1 rounded mr-2", cfg.bgColor)}>
                          <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                        </div>
                        <span className="text-sm">{cfg.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <Separator className="my-4" />

          {/* Dica */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-3">
              <div className="flex gap-2">
                <Sparkles className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Dica</p>
                  <p>Clique em um bloco para adicioná-lo ao fluxo. Depois, configure as conexões entre eles.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Canvas - Lista de nós */}
        <div className="flex-1 p-4 overflow-y-auto bg-muted/10">
          {nodes.length === 0 || (nodes.length === 1 && nodes[0].node_type === 'start') ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="p-4 rounded-full bg-primary/10 mb-4">
                <Bot className="h-12 w-12 text-primary" />
              </div>
              <h2 className="font-semibold text-lg mb-2">Crie seu primeiro fluxo!</h2>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                Adicione blocos de mensagem, botões e coleta de dados para criar 
                uma conversa automatizada com seus clientes.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => addNode('message')}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Adicionar Mensagem
                </Button>
                <Button variant="outline" onClick={() => setShowTemplates(true)}>
                  <LayoutTemplate className="h-4 w-4 mr-2" />
                  Usar Template
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-w-2xl mx-auto">
              {/* Lista de nós ordenada */}
              {nodes
                .sort((a, b) => a.display_order - b.display_order)
                .map((node, index) => (
                  <div key={node.node_id} className="relative">
                    {/* Linha de conexão */}
                    {index > 0 && (
                      <div className="absolute left-1/2 -top-3 w-0.5 h-3 bg-border" />
                    )}
                    
                    <FlowNodeCard
                      node={node}
                      isSelected={selectedNodeId === node.node_id}
                      onSelect={() => setSelectedNodeId(node.node_id)}
                      onDelete={() => deleteNode(node.node_id)}
                      onEdit={() => setEditingNode(node)}
                      onDuplicate={() => duplicateNode(node.node_id)}
                    />

                    {/* Seta para baixo */}
                    {index < nodes.length - 1 && (
                      <div className="absolute left-1/2 -bottom-3 transform -translate-x-1/2">
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}

              {/* Botão para adicionar mais */}
              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={() => addNode('message')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar bloco
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Editor de nó */}
      <NodeEditorPanel
        node={editingNode}
        onSave={updateNode}
        onClose={() => setEditingNode(null)}
        nodes={nodes}
      />

      {/* Dialog de Templates */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Templates de Fluxo</DialogTitle>
            <DialogDescription>
              Escolha um template para começar rapidamente
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            {templates?.map(template => (
              <Card 
                key={template.id} 
                className={cn(
                  "cursor-pointer transition-all hover:border-primary",
                  template.is_featured && "border-primary/50"
                )}
                onClick={() => applyTemplateMutation.mutate(template.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <Badge variant="outline" className="mt-1">
                        {template.category}
                      </Badge>
                    </div>
                    {template.is_featured && (
                      <Badge className="bg-primary">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Popular
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {template.description || 'Sem descrição'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Usado {template.usage_count} vezes
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Configurações */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurações do Robô</DialogTitle>
            <DialogDescription>
              Configure o comportamento geral do seu chatbot
            </DialogDescription>
          </DialogHeader>
          
          {config && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome do robô</Label>
                <Input
                  value={config.name}
                  onChange={(e) => {
                    setConfig(prev => prev ? { ...prev, name: e.target.value } : null);
                    setHasChanges(true);
                  }}
                  placeholder="Ex: Assistente Virtual"
                />
              </div>

              <div className="space-y-2">
                <Label>Mensagem de boas-vindas</Label>
                <Textarea
                  value={config.welcome_message}
                  onChange={(e) => {
                    setConfig(prev => prev ? { ...prev, welcome_message: e.target.value } : null);
                    setHasChanges(true);
                  }}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Mensagem de fallback (quando não entender)</Label>
                <Textarea
                  value={config.fallback_message}
                  onChange={(e) => {
                    setConfig(prev => prev ? { ...prev, fallback_message: e.target.value } : null);
                    setHasChanges(true);
                  }}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Mensagem de despedida</Label>
                <Textarea
                  value={config.goodbye_message}
                  onChange={(e) => {
                    setConfig(prev => prev ? { ...prev, goodbye_message: e.target.value } : null);
                    setHasChanges(true);
                  }}
                  rows={2}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enviar boas-vindas automaticamente</Label>
                    <p className="text-xs text-muted-foreground">No primeiro contato</p>
                  </div>
                  <Switch
                    checked={config.send_welcome_on_first_contact}
                    onCheckedChange={(checked) => {
                      setConfig(prev => prev ? { ...prev, send_welcome_on_first_contact: checked } : null);
                      setHasChanges(true);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Permitir reinício por palavra-chave</Label>
                    <p className="text-xs text-muted-foreground">menu, início, voltar...</p>
                  </div>
                  <Switch
                    checked={config.restart_on_keyword}
                    onCheckedChange={(checked) => {
                      setConfig(prev => prev ? { ...prev, restart_on_keyword: checked } : null);
                      setHasChanges(true);
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Delay de digitação (ms)</Label>
                  <Input
                    type="number"
                    value={config.typing_delay_ms}
                    onChange={(e) => {
                      setConfig(prev => prev ? { ...prev, typing_delay_ms: parseInt(e.target.value) || 1500 } : null);
                      setHasChanges(true);
                    }}
                    min={500}
                    max={5000}
                  />
                </div>

                <Separator className="my-4" />

                {/* Sistema Híbrido IA+Fluxo */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    <Label className="text-sm font-semibold">Sistema Híbrido IA + Fluxo</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A IA interpreta a intenção do cliente e aciona o fluxo correto. 
                    As respostas sempre vêm do fluxo predefinido.
                  </p>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Ativar IA Híbrida</Label>
                      <p className="text-xs text-muted-foreground">IA interpreta e aciona fluxo</p>
                    </div>
                    <Switch
                      checked={config.advanced_settings?.enable_hybrid_ai ?? true}
                      onCheckedChange={(checked) => {
                        setConfig(prev => prev ? { 
                          ...prev, 
                          advanced_settings: {
                            ...prev.advanced_settings,
                            enable_hybrid_ai: checked,
                            ai_confidence_threshold: prev.advanced_settings?.ai_confidence_threshold ?? 0.7,
                            fallback_to_flow: prev.advanced_settings?.fallback_to_flow ?? true,
                            interpret_dates: prev.advanced_settings?.interpret_dates ?? true,
                            interpret_times: prev.advanced_settings?.interpret_times ?? true
                          }
                        } : null);
                        setHasChanges(true);
                      }}
                    />
                  </div>

                  {config.advanced_settings?.enable_hybrid_ai && (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Interpretar datas naturais</Label>
                          <p className="text-xs text-muted-foreground">Entende "hoje", "amanhã", etc.</p>
                        </div>
                        <Switch
                          checked={config.advanced_settings?.interpret_dates ?? true}
                          onCheckedChange={(checked) => {
                            setConfig(prev => prev ? { 
                              ...prev, 
                              advanced_settings: {
                                ...prev.advanced_settings!,
                                interpret_dates: checked
                              }
                            } : null);
                            setHasChanges(true);
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Interpretar horários naturais</Label>
                          <p className="text-xs text-muted-foreground">Entende "às 14h", "manhã", etc.</p>
                        </div>
                        <Switch
                          checked={config.advanced_settings?.interpret_times ?? true}
                          onCheckedChange={(checked) => {
                            setConfig(prev => prev ? { 
                              ...prev, 
                              advanced_settings: {
                                ...prev.advanced_settings!,
                                interpret_times: checked
                              }
                            } : null);
                            setHasChanges(true);
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Confiança mínima da IA (0-100%)</Label>
                        <Input
                          type="number"
                          value={Math.round((config.advanced_settings?.ai_confidence_threshold ?? 0.7) * 100)}
                          onChange={(e) => {
                            const value = Math.min(100, Math.max(0, parseInt(e.target.value) || 70)) / 100;
                            setConfig(prev => prev ? { 
                              ...prev, 
                              advanced_settings: {
                                ...prev.advanced_settings!,
                                ai_confidence_threshold: value
                              }
                            } : null);
                            setHasChanges(true);
                          }}
                          min={0}
                          max={100}
                        />
                        <p className="text-xs text-muted-foreground">
                          Quanto maior, mais preciso mas menos flexível (recomendado: 70%)
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog do Simulador */}
      <Dialog open={showSimulator} onOpenChange={setShowSimulator}>
        <DialogContent className="max-w-md h-[600px] p-0 overflow-hidden">
          <WhatsAppSimulator
            nodes={nodes}
            connections={connections}
            config={config}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
