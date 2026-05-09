/**
 * Flow Builder Studio - Construtor de Fluxo com IA Conversacional
 *
 * Interface dividida em 2 painéis:
 * - ESQUERDA: Chat com IA para criar/editar o fluxo conversando
 * - DIREITA: Simulador WhatsApp que executa o fluxo deterministicamente (sem IA)
 *
 * Inspirado em: AgentStudioUnified + ManyChat + Tidio
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Bot, ArrowRight, Sparkles, MessageSquare,
  Loader2, Send, Smartphone,
  CheckCircle2, Wand2, RefreshCw, Settings, Zap,
  Undo2, Redo2, History, ChevronUp, Clock as ClockIcon,
  Plus, Trash2, Save, Pencil, Rocket, RotateCcw,
  Workflow, Play, Eye, Code, MousePointerClick,
  ListOrdered, Clock, GitBranch, UserCog, FormInput,
  Image as ImageIcon, Music, Video, FileText, Square, CircleDot, Target,
  ShoppingCart
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// ============ INTERFACES ============

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
  // Horário de funcionamento
  business_hours_enabled: boolean;
  opening_time: string;
  closing_time: string;
  closed_days: number[]; // 0=Dom, 1=Seg, 2=Ter, etc.
  closed_message: string;
  // Sistema Híbrido IA+Fluxo
  advanced_settings?: {
    enable_hybrid_ai: boolean;
    ai_confidence_threshold: number;
    fallback_to_flow: boolean;
    interpret_dates: boolean;
    interpret_times: boolean;
  };
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
  | 'check_business_hours';

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
  poll_question?: string;
  poll_options?: Array<{ id: string; text: string; next_node?: string }>;
  poll_allow_multiple?: boolean;
  poll_save_to_variable?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  // Novos campos para melhor UX
  actionButtons?: { label: string; value: string; variant?: "default" | "outline" | "destructive" }[];
  isConfirmation?: boolean;
  confirmationType?: "edit" | "create" | "delete" | "general";
}

interface SimulatorMessage {
  id: string;
  role: "user" | "bot";
  message: string;
  time: string;
  buttons?: Array<{ id: string; title: string; next_node?: string }>;
  listSections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string; next_node?: string }> }>;
  mediaUrl?: string;
  mediaType?: string;
  isTyping?: boolean;
  saveVariable?: string; // Nome da variável a salvar quando usuário selecionar opção
}

interface FlowVersion {
  id: string;
  version_number: number;
  edit_type: 'manual' | 'ai_chat' | 'ai_generate' | 'restore';
  edit_summary: string;
  is_current: boolean;
  created_at: string;
  nodes_count: number;
}

// Configuracao dos tipos de nos
const NODE_TYPES_CONFIG: Record<NodeType, {
  label: string;
  icon: any;
  color: string;
  description: string;
}> = {
  start: { label: 'Inicio', icon: CircleDot, color: 'text-green-600', description: 'Ponto de inicio do fluxo' },
  message: { label: 'Mensagem', icon: MessageSquare, color: 'text-blue-600', description: 'Envia uma mensagem de texto' },
  buttons: { label: 'Botoes', icon: MousePointerClick, color: 'text-purple-600', description: 'Mensagem com ate 3 botoes clicaveis' },
  list: { label: 'Lista', icon: ListOrdered, color: 'text-indigo-600', description: 'Menu com ate 10 opcoes em lista' },
  poll: { label: 'Enquete', icon: CheckCircle2, color: 'text-emerald-600', description: 'Enquete interativa com votacao' },
  input: { label: 'Coletar Dados', icon: FormInput, color: 'text-amber-600', description: 'Solicita e armazena resposta do usuario' },
  media: { label: 'Midia', icon: ImageIcon, color: 'text-pink-600', description: 'Envia imagem, audio, video ou documento' },
  condition: { label: 'Condicao', icon: GitBranch, color: 'text-orange-600', description: 'Bifurcacao baseada em variavel' },
  delay: { label: 'Aguardar', icon: Clock, color: 'text-slate-600', description: 'Pausa antes de continuar' },
  set_variable: { label: 'Definir Variavel', icon: Target, color: 'text-cyan-600', description: 'Define ou altera uma variavel' },
  api_call: { label: 'Chamar API', icon: ArrowRight, color: 'text-violet-600', description: 'Faz requisicao a API externa' },
  transfer_human: { label: 'Transferir', icon: UserCog, color: 'text-red-600', description: 'Transfere para atendente humano' },
  end: { label: 'Fim', icon: Square, color: 'text-gray-600', description: 'Finaliza o fluxo' },
  goto: { label: 'Ir Para', icon: ArrowRight, color: 'text-teal-600', description: 'Pula para outro no do fluxo' },
  delivery_order: { label: 'Pedido Delivery', icon: ShoppingCart, color: 'text-orange-500', description: 'Cria pedido de delivery no sistema' },
  check_business_hours: { label: 'Verificar Horário', icon: Clock, color: 'text-blue-500', description: 'Verifica horário de funcionamento' }
};

// ============ HELPER: FORMATACAO WHATSAPP ============
function formatWhatsAppText(text: string): string {
  if (!text) return text;

  let formatted = text;
  formatted = formatted.replace(/\n/g, '<br>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\b_([^_]+)_\b/g, '<em>$1</em>');
  formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-zinc-700 px-1 rounded text-sm">$1</code>');

  return formatted;
}

// ============ HELPER: NORMALIZAR NÓS DA IA ============
// Converte nós retornados pela IA para o formato esperado pelo frontend
function normalizeAINodes(nodes: any[]): FlowNode[] {
  if (!nodes || !Array.isArray(nodes)) return [];
  
  return nodes.map((node, index) => {
    // Garantir que node_id existe (usar id se não tiver node_id)
    const nodeId = node.node_id || node.id || `node_${index + 1}`;
    
    // Normalizar o tipo do nó
    const nodeType = (node.node_type || node.type || 'message') as NodeType;
    
    // Extrair nome do nó
    let nodeName = node.name || node.title || '';
    if (!nodeName) {
      // Tentar extrair nome baseado no tipo e conteúdo
      const typeLabels: Record<string, string> = {
        'start': 'Início',
        'message': 'Mensagem',
        'buttons': 'Menu de Botões',
        'list': 'Lista de Opções',
        'input': 'Coletar Dados',
        'media': 'Mídia',
        'condition': 'Condição',
        'delay': 'Aguardar',
        'transfer_human': 'Transferir',
        'end': 'Fim',
        'goto': 'Ir Para',
        'delivery_order': 'Pedido Delivery',
        'check_business_hours': 'Verificar Horário'
      };
      nodeName = typeLabels[nodeType] || `Nó ${index + 1}`;
    }
    
    // Normalizar o conteúdo - pode vir como "content" ou campos diretos
    let content: NodeContent = {};
    if (node.content && typeof node.content === 'object') {
      content = node.content;
    } else {
      // Tentar extrair conteúdo dos campos diretos
      if (node.text) content.text = node.text;
      if (node.body) content.body = node.body;
      if (node.buttons) content.buttons = node.buttons;
      if (node.sections) content.sections = node.sections;
      if (node.button_text) content.button_text = node.button_text;
      if (node.prompt) content.prompt = node.prompt;
      if (node.variable_name) content.variable_name = node.variable_name;
      if (node.input_type) content.input_type = node.input_type;
      if (node.media_type) content.media_type = node.media_type;
      if (node.url) content.url = node.url;
      if (node.caption) content.caption = node.caption;
      if (node.variable) content.variable = node.variable;
      if (node.operator) content.operator = node.operator;
      if (node.value) content.value = node.value;
      if (node.true_node) content.true_node = node.true_node;
      if (node.false_node) content.false_node = node.false_node;
      if (node.seconds) content.seconds = node.seconds;
      if (node.message) content.message = node.message;
      if (node.notify_admin !== undefined) content.notify_admin = node.notify_admin;
      if (node.target_node) content.target_node = node.target_node;
    }
    
    // Normalizar next_node_id
    const nextNodeId = node.next_node_id || node.nextNode || node.next || null;
    
    // Criar nó normalizado
    return {
      id: nodeId,
      node_id: nodeId,
      name: nodeName,
      node_type: nodeType,
      content: content,
      next_node_id: nextNodeId,
      position_x: node.position_x || node.positionX || 100 + (index * 50),
      position_y: node.position_y || node.positionY || 100 + (index * 100),
      display_order: node.display_order || index
    } as FlowNode;
  });
}

// ============ COMPONENTE PRINCIPAL ============
export function FlowBuilderStudio() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const simulatorEndRef = useRef<HTMLDivElement>(null);

  // ============ ESTADO PRINCIPAL ============
  const [mobileView, setMobileView] = useState<"editor" | "simulator">("editor");
  const [activeTab, setActiveTab] = useState<"chat" | "flow" | "config">("chat");

  // Estado do fluxo
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([]);
  const [flowConnections, setFlowConnections] = useState<FlowConnection[]>([]);
  const [chatbotConfig, setChatbotConfig] = useState<ChatbotConfig>({
    name: "Meu Chatbot",
    description: "",
    welcome_message: "Ola! Como posso ajudar?",
    fallback_message: "Desculpe, nao entendi. Por favor, escolha uma opcao.",
    goodbye_message: "Obrigado pelo contato! Ate mais!",
    is_active: false,
    is_published: false,
    typing_delay_ms: 1500,
    message_delay_ms: 1000,
    collect_user_data: true,
    send_welcome_on_first_contact: true,
    restart_on_keyword: true,
    restart_keywords: ["voltar", "inicio", "menu", "reiniciar"],
    enable_humanization: false,
    humanization_level: 'medium',
    // Horário de funcionamento
    business_hours_enabled: false,
    opening_time: '08:00',
    closing_time: '18:00',
    closed_days: [0], // Domingo fechado por padrão
    closed_message: '⏰ Nosso horário de atendimento é de segunda a sábado, das 08h às 18h. Deixe sua mensagem que responderemos assim que possível!'
  });
  const [hasChanges, setHasChanges] = useState(false);

  // Estado do chat de criacao com IA
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Ola! Sou seu assistente para criar fluxos de chatbot.

Me conte sobre o seu negocio e o que voce gostaria que o chatbot fizesse. Por exemplo:
- "Quero um chatbot para minha pizzaria que mostra o cardapio e faz pedidos"
- "Preciso de um atendimento para clinica odontologica com agendamento"
- "Crie um fluxo para imobiliaria com opcoes de compra e aluguel"

Quanto mais detalhes voce me der, melhor sera o fluxo que vou criar!`,
      timestamp: new Date()
    }
  ]);
  const [editInput, setEditInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Estado do simulador
  const [simulatorMessages, setSimulatorMessages] = useState<SimulatorMessage[]>([]);
  const [simulatorInput, setSimulatorInput] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [simulatorVariables, setSimulatorVariables] = useState<Record<string, string>>({});
  const simulatorVariablesRef = useRef<Record<string, string>>({}); // Ref para acesso síncrono
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [pendingInputNode, setPendingInputNode] = useState<FlowNode | null>(null);

  // Estado do histórico de versões
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [isRestoringVersion, setIsRestoringVersion] = useState(false);

  // Estado para confirmações pendentes e edição de nós
  const [pendingConfirmation, setPendingConfirmation] = useState<{ message: string; context: any } | null>(null);
  const [editingNode, setEditingNode] = useState<FlowNode | null>(null);
  const [showNodeEditor, setShowNodeEditor] = useState(false);

  // ============ QUERIES ============
  const { data: existingConfig, isLoading: configLoading } = useQuery<any>({
    queryKey: ["/api/chatbot/config"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/chatbot/config");
        return res.json();
      } catch {
        return null;
      }
    }
  });

  const { data: existingNodes, isLoading: nodesLoading } = useQuery<FlowNode[]>({
    queryKey: ["/api/chatbot/nodes"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/chatbot/nodes");
        return res.json();
      } catch {
        return [];
      }
    }
  });

  // Query para carregar histórico de versões
  const { data: flowVersions, refetch: refetchVersions } = useQuery<FlowVersion[]>({
    queryKey: ["/api/chatbot/flow-versions"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/chatbot/flow-versions");
        return res.json();
      } catch {
        return [];
      }
    },
    enabled: showVersionHistory
  });

  // Carregar configuracao existente
  useEffect(() => {
    if (existingConfig) {
      setChatbotConfig(prev => ({ ...prev, ...existingConfig }));
    }
  }, [existingConfig]);

  useEffect(() => {
    if (existingNodes && existingNodes.length > 0) {
      // Normalizar nós carregados do banco
      const normalizedNodes = normalizeAINodes(existingNodes);
      setFlowNodes(normalizedNodes);
    }
  }, [existingNodes]);

  // Auto-scroll do chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    simulatorEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [simulatorMessages]);

  // ============ MUTATIONS ============
  const saveFlowMutation = useMutation({
    mutationFn: async () => {
      // Salvar config
      await apiRequest("POST", "/api/chatbot/config", chatbotConfig);

      // Salvar nodes
      await apiRequest("POST", "/api/chatbot/nodes", { nodes: flowNodes });

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/nodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/flow-versions"] });
      setHasChanges(false);
      toast({
        title: "Fluxo salvo!",
        description: "Seu chatbot foi atualizado com sucesso."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Restaurar versão anterior
  const restoreVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await apiRequest("POST", `/api/chatbot/flow-versions/${versionId}/restore`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/nodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/flow-versions"] });
      setShowVersionHistory(false);
      toast({
        title: "Versão restaurada!",
        description: data.message || "O fluxo foi restaurado com sucesso."
      });
      // Recarregar nodes
      setTimeout(() => {
        window.location.reload();
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao restaurar",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // ============ FUNCOES DO CHAT COM IA ============
  const handleSendMessage = async () => {
    if (!editInput.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: editInput,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    const currentMessage = editInput;
    setEditInput("");
    setIsProcessing(true);

    try {
      // Detectar se o usuário quer criar algo novo explicitamente
      const lowerMessage = currentMessage.toLowerCase();
      const isExplicitNew = /cri(e|ar)|novo|nova|fazer um|quero um|preciso de um/.test(lowerMessage) && 
                           /(chatbot|fluxo|robô|atendimento|salão|loja|restaurante|pizzaria|clínica|imobili)/i.test(lowerMessage);
      
      // Se existe fluxo, a mensagem é curta (provável edição), e não é explicitamente criar algo novo
      const hasExistingFlow = flowNodes.length > 1;
      const isShortMessage = currentMessage.length < 80;
      const looksLikeEdit = hasExistingFlow && isShortMessage && !isExplicitNew;
      
      // Palavras-chave de edição
      const editKeywords = /(adiciona|remove|tira|bota|coloca|muda|altera|troca|exclui|apaga|deleta|modifica)/i;
      const isDefinitelyEdit = editKeywords.test(lowerMessage);
      
      let data: any;
      
      // Usar rota inteligente que deixa a IA interpretar a intenção
      const response = await apiRequest("POST", "/api/chatbot/generate-flow", {
        message: currentMessage,
        currentFlow: hasExistingFlow ? flowNodes : [],
        currentConfig: chatbotConfig,
        hasExistingFlow: hasExistingFlow,
        isDefinitelyEdit: isDefinitelyEdit, // Flag para indicar que é edição
        chatHistory: chatMessages.map(m => ({ role: m.role, content: m.content }))
      });
      data = await response.json();

      // Se a IA pediu confirmação, mostrar mensagem COM BOTÕES DE AÇÃO
      if (data.needsConfirmation) {
        const assistantMessage: ChatMessage = {
          id: `confirm_${Date.now()}`,
          role: "assistant",
          content: data.confirmationMessage || data.message,
          timestamp: new Date(),
          isConfirmation: true,
          confirmationType: data.confirmationType || "general",
          actionButtons: data.suggestedActions || [
            { label: "✏️ Editar fluxo atual", value: "edit_flow", variant: "outline" },
            { label: "🆕 Criar novo fluxo", value: "create_new", variant: "default" },
            { label: "❌ Cancelar", value: "cancel", variant: "destructive" }
          ]
        };
        setChatMessages(prev => [...prev, assistantMessage]);
        setPendingConfirmation({ message: currentMessage, context: data });
        setIsProcessing(false);
        return;
      }

      // PRIMEIRO: Atualizar config local se a IA retornou config
      if (data.config) {
        setChatbotConfig(prev => ({ ...prev, ...data.config }));
        setHasChanges(true);
      }

      if (data.flow && data.flow.nodes) {
        // Normalizar nós da IA para formato do frontend
        const normalizedNodes = normalizeAINodes(data.flow.nodes);
        console.log('📋 Nós normalizados:', normalizedNodes.length, normalizedNodes);
        setFlowNodes(normalizedNodes);
        setHasChanges(true);
        
        // Atualizar config COM O NOVO nome/configurações da IA antes de salvar
        const updatedConfig = data.config 
          ? { ...chatbotConfig, ...data.config }
          : chatbotConfig;
        
        // Auto-salvar após criar/editar fluxo com sucesso - USANDO CONFIG ATUALIZADO
        try {
          await apiRequest("POST", "/api/chatbot/config", updatedConfig);
          await apiRequest("POST", "/api/chatbot/nodes", { nodes: normalizedNodes });
          queryClient.invalidateQueries({ queryKey: ["/api/chatbot/flow-versions"] });
          queryClient.invalidateQueries({ queryKey: ["/api/chatbot/config"] });
        } catch (saveError) {
          console.error("Erro no auto-save:", saveError);
        }
      }

      // Mensagem de sucesso com botões de próximas ações
      const assistantMessage: ChatMessage = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: data.message || "✅ Pronto! Atualizei o fluxo conforme sua solicitação.",
        timestamp: new Date(),
        actionButtons: [
          { label: "▶️ Testar no Simulador", value: "test_simulator", variant: "default" },
          { label: "👁️ Ver Fluxo", value: "view_flow", variant: "outline" },
          { label: "✏️ Fazer mais alterações", value: "more_changes", variant: "outline" }
        ]
      };

      setChatMessages(prev => [...prev, assistantMessage]);

    } catch (error: any) {
      console.error("Erro ao processar mensagem:", error);

      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        role: "assistant",
        content: `Desculpe, tive um problema ao processar sua solicitação. Por favor, tente novamente ou seja mais específico sobre o que deseja criar.`,
        timestamp: new Date(),
        actionButtons: [
          { label: "🔄 Tentar novamente", value: "retry", variant: "default" },
          { label: "❓ Preciso de ajuda", value: "help", variant: "outline" }
        ]
      };

      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  // ============ FUNÇÃO PARA LIDAR COM BOTÕES DE AÇÃO DO CHAT ============
  const handleActionButton = async (action: string) => {
    switch (action) {
      case "test_simulator":
        setMobileView("simulator");
        // Recarregar nós da API para garantir dados atualizados
        try {
          const res = await apiRequest("GET", "/api/chatbot/nodes");
          const freshNodes = await res.json();
          if (freshNodes && freshNodes.length > 0) {
            const normalizedNodes = normalizeAINodes(freshNodes);
            setFlowNodes(normalizedNodes);
            console.log('🔄 Nós recarregados da API:', normalizedNodes.length);
            // Passar nós diretamente para evitar problemas de timing do estado
            startSimulation(normalizedNodes);
          } else {
            // Se não há nós na API, usar os do estado atual
            startSimulation();
          }
        } catch (error) {
          console.error('Erro ao recarregar nós:', error);
          startSimulation();
        }
        break;
      case "view_flow":
        setActiveTab("flow");
        break;
      case "more_changes":
        // Já está na aba de chat, apenas focar no input
        break;
      case "edit_flow":
        if (pendingConfirmation) {
          setEditInput(`Quero editar o fluxo atual: ${pendingConfirmation.message}`);
          setPendingConfirmation(null);
        }
        break;
      case "create_new":
        if (pendingConfirmation) {
          setEditInput(`Criar novo fluxo do zero: ${pendingConfirmation.message}`);
          setPendingConfirmation(null);
          // Enviar automaticamente
          setTimeout(() => handleSendMessage(), 100);
        }
        break;
      case "cancel":
        setPendingConfirmation(null);
        const cancelMsg: ChatMessage = {
          id: `cancel_${Date.now()}`,
          role: "assistant",
          content: "Ok, operação cancelada. Como posso ajudar?",
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, cancelMsg]);
        break;
      case "retry":
        // Pegar última mensagem do usuário e reenviar
        const lastUserMsg = chatMessages.filter(m => m.role === "user").pop();
        if (lastUserMsg) {
          setEditInput(lastUserMsg.content);
        }
        break;
      case "help":
        const helpMsg: ChatMessage = {
          id: `help_${Date.now()}`,
          role: "assistant",
          content: `💡 **Como usar o Construtor de Fluxo:**

1️⃣ **Criar um chatbot novo:**
   "Crie um chatbot para minha pizzaria com cardápio e pedidos"

2️⃣ **Editar o fluxo existente:**
   "Adiciona uma pizza de frango por R$45"
   "Remove o item Coca-Cola"
   "Muda o preço da margherita para R$40"

3️⃣ **Ver o fluxo:**
   Clique na aba "Ver Fluxo" para ver todos os nós

4️⃣ **Testar:**
   Use o simulador à direita para testar seu chatbot

Diga o que você precisa e eu te ajudo! 😊`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, helpMsg]);
        break;
      default:
        console.log("Ação não reconhecida:", action);
    }
  };

  // ============ FUNÇÃO PARA EDITAR UM NÓ ESPECÍFICO ============
  const handleEditNode = (nodeId: string) => {
    const node = flowNodes.find(n => n.node_id === nodeId || n.id === nodeId);
    if (node) {
      setEditingNode(node);
      setShowNodeEditor(true);
    } else {
      toast({
        title: "Erro",
        description: "Nó não encontrado.",
        variant: "destructive"
      });
    }
  };

  const handleSaveNodeEdit = async (updatedNode: FlowNode) => {
    const updatedNodes = flowNodes.map(n => 
      n.node_id === updatedNode.node_id ? updatedNode : n
    );
    setFlowNodes(updatedNodes);
    setHasChanges(true);
    setShowNodeEditor(false);
    setEditingNode(null);
    
    toast({
      title: "Nó atualizado!",
      description: `"${updatedNode.name}" foi modificado com sucesso.`
    });
  };

  const handleDeleteNode = async (nodeId: string) => {
    const node = flowNodes.find(n => n.node_id === nodeId);
    if (node?.node_type === 'start') {
      toast({
        title: "Erro",
        description: "Não é possível excluir o nó de início.",
        variant: "destructive"
      });
      return;
    }
    
    const updatedNodes = flowNodes.filter(n => n.node_id !== nodeId);
    setFlowNodes(updatedNodes);
    setHasChanges(true);
    
    toast({
      title: "Nó excluído!",
      description: "O nó foi removido do fluxo."
    });
  };

  // ============ FUNCOES DO SIMULADOR ============
  const startSimulation = (nodesToUse?: FlowNode[]) => {
    // Usar nós passados como parâmetro ou os do estado
    const nodes = nodesToUse || flowNodes;
    
    // Debug: Verificar nós disponíveis
    console.log('🎮 Iniciando simulador - nós:', nodes.length);
    console.log('🎮 Tipos de nós:', nodes.map(n => ({ id: n.node_id, type: n.node_type, name: n.name })));
    
    // Reset do simulador - GARANTIR LIMPEZA COMPLETA
    setSimulatorMessages([]);
    setSimulatorVariables({});
    simulatorVariablesRef.current = {}; // Reset da ref também
    setWaitingForInput(false);
    setPendingInputNode(null);

    // Encontrar no de inicio - procurar por node_type 'start' ou node_id contendo 'start'
    let startNode = nodes.find(n => n.node_type === 'start');
    if (!startNode) {
      // Fallback: procurar por node_id que contenha 'start'
      startNode = nodes.find(n => n.node_id && n.node_id.toLowerCase().includes('start'));
    }
    if (!startNode && nodes.length > 0) {
      // Fallback 2: pegar o primeiro nó como início
      console.log('⚠️ Nó start não encontrado, usando primeiro nó como início');
      startNode = nodes[0];
    }
    
    if (!startNode) {
      console.error('❌ Nenhum nó disponível para simulação');
      toast({
        title: "Erro",
        description: "O fluxo precisa de um no de inicio.",
        variant: "destructive"
      });
      return;
    }
    
    console.log('✅ Nó de início encontrado:', startNode);

    // Adicionar mensagem de boas-vindas se configurado
    if (chatbotConfig.send_welcome_on_first_contact && chatbotConfig.welcome_message) {
      const welcomeMsg: SimulatorMessage = {
        id: `welcome_${Date.now()}`,
        role: "bot",
        message: chatbotConfig.welcome_message,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
      setSimulatorMessages([welcomeMsg]);
    }

    // Processar proximo no apos o start
    setCurrentNodeId(startNode.node_id);
    setTimeout(() => {
      processNextNode(startNode.next_node_id || null);
    }, chatbotConfig.typing_delay_ms);
  };

  const processNextNode = (nodeId: string | null) => {
    if (!nodeId) return;

    const node = flowNodes.find(n => n.node_id === nodeId);
    if (!node) return;

    setCurrentNodeId(nodeId);

    // Adicionar indicador de digitacao
    const typingMsg: SimulatorMessage = {
      id: `typing_${Date.now()}`,
      role: "bot",
      message: "",
      time: "",
      isTyping: true
    };
    setSimulatorMessages(prev => [...prev, typingMsg]);

    setTimeout(() => {
      // Remover indicador de digitacao
      setSimulatorMessages(prev => prev.filter(m => !m.isTyping));

      // Processar no baseado no tipo
      switch (node.node_type) {
        case 'message':
          handleMessageNode(node);
          break;
        case 'buttons':
          handleButtonsNode(node);
          break;
        case 'list':
          handleListNode(node);
          break;
        case 'input':
          handleInputNode(node);
          break;
        case 'media':
          handleMediaNode(node);
          break;
        case 'delay':
          handleDelayNode(node);
          break;
        case 'condition':
          handleConditionNode(node);
          break;
        case 'transfer_human':
          handleTransferNode(node);
          break;
        case 'set_variable':
          handleSetVariableNode(node);
          break;
        case 'end':
          handleEndNode(node);
          break;
        case 'goto':
          handleGotoNode(node);
          break;
        default:
          if (node.next_node_id) {
            processNextNode(node.next_node_id);
          }
      }
    }, chatbotConfig.typing_delay_ms);
  };

  // Função para interpolar variáveis em textos (usa ref para acesso síncrono)
  // Suporta {{variavel}}, {variavel} e templates condicionais Handlebars
  const interpolateVariables = (text: string): string => {
    if (!text) return text;
    
    let result = text;
    const vars = simulatorVariablesRef.current;
    
    // 1. Processar blocos {{#ifEqual variavel "valor"}}...{{/ifEqual}}
    result = result.replace(/\{\{#ifEqual\s+(\w+)\s+["']([^"']+)["']\}\}([\s\S]*?)\{\{\/ifEqual\}\}/g, 
      (match, varName, compareValue, content) => {
        const varValue = vars[varName];
        if (varValue !== undefined && String(varValue) === compareValue) {
          return content; // Mostra o conteúdo se a condição for verdadeira
        }
        return ''; // Remove se a condição for falsa
      });
    
    // 2. Processar blocos {{#ifNotEqual variavel "valor"}}...{{/ifNotEqual}}
    result = result.replace(/\{\{#ifNotEqual\s+(\w+)\s+["']([^"']+)["']\}\}([\s\S]*?)\{\{\/ifNotEqual\}\}/g, 
      (match, varName, compareValue, content) => {
        const varValue = vars[varName];
        if (varValue === undefined || String(varValue) !== compareValue) {
          return content;
        }
        return '';
      });
    
    // 3. Processar blocos {{#if variavel}}...{{else}}...{{/if}}
    result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, 
      (match, varName, trueContent, falseContent) => {
        const varValue = vars[varName];
        if (varValue !== undefined && varValue !== '' && varValue !== false && varValue !== null) {
          return trueContent;
        }
        return falseContent;
      });
    
    // 4. Processar blocos {{#if variavel}}...{{/if}} (sem else)
    result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, 
      (match, varName, content) => {
        const varValue = vars[varName];
        if (varValue !== undefined && varValue !== '' && varValue !== false && varValue !== null) {
          return content;
        }
        return '';
      });
    
    // 5. Processar blocos {{#unless variavel}}...{{/unless}}
    result = result.replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, 
      (match, varName, content) => {
        const varValue = vars[varName];
        if (varValue === undefined || varValue === '' || varValue === false || varValue === null) {
          return content;
        }
        return '';
      });
    
    // 6. Processar blocos {{#ifContains variavel "texto"}}...{{/ifContains}}
    result = result.replace(/\{\{#ifContains\s+(\w+)\s+["']([^"']+)["']\}\}([\s\S]*?)\{\{\/ifContains\}\}/g, 
      (match, varName, searchText, content) => {
        const varValue = vars[varName];
        if (varValue !== undefined && String(varValue).includes(searchText)) {
          return content;
        }
        return '';
      });
    
    // 7. Substituir sintaxe {{variavel}} (duplas chaves - Handlebars style)
    result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = vars[varName];
      return value !== undefined ? String(value) : '';
    });
    
    // 8. Substituir sintaxe {variavel} (chaves simples)
    result = result.replace(/\{(\w+)\}/g, (match, varName) => {
      const value = vars[varName];
      return value !== undefined ? String(value) : '';
    });
    
    // 9. Limpar qualquer template Handlebars restante não processado
    result = result.replace(/\{\{#\w+[^}]*\}\}/g, '');
    result = result.replace(/\{\{\/\w+\}\}/g, '');
    result = result.replace(/\{\{else\}\}/g, '');
    result = result.replace(/\{\{this\.\w+\}\}/g, '');
    result = result.replace(/\{\{@\w+\}\}/g, '');
    
    return result;
  };

  const handleMessageNode = (node: FlowNode) => {
    // DEBUG: Verificar se next_node_id existe
    console.log('[DEBUG handleMessageNode]', {
      nodeId: node.node_id,
      nodeType: node.node_type,
      next_node_id: node.next_node_id,
      hasNextNode: !!node.next_node_id
    });
    
    // Interpolar variáveis no texto da mensagem
    const interpolatedText = interpolateVariables(node.content.text || "");
    
    const msg: SimulatorMessage = {
      id: `msg_${Date.now()}`,
      role: "bot",
      message: interpolatedText,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    setSimulatorMessages(prev => [...prev, msg]);

    if (node.next_node_id) {
      console.log('[DEBUG] Agendando processNextNode para:', node.next_node_id, 'em', chatbotConfig.message_delay_ms, 'ms');
      setTimeout(() => {
        console.log('[DEBUG] Executando processNextNode para:', node.next_node_id);
        processNextNode(node.next_node_id!);
      }, chatbotConfig.message_delay_ms);
    } else {
      console.log('[DEBUG] Nó sem next_node_id, fluxo para aqui');
    }
  };

  const handleButtonsNode = (node: FlowNode) => {
    // Gerar texto com menu numérico
    let menuText = interpolateVariables(node.content.body || "");
    if (node.content.buttons && node.content.buttons.length > 0) {
      menuText += "\n\n*📋 Escolha uma opção:*";
      node.content.buttons.forEach((btn: any, index: number) => {
        menuText += `\n*${index + 1}.* ${btn.title}`;
      });
      menuText += "\n\n_👆 Digite o número ou escreva sua escolha_";
    }
    
    const msg: SimulatorMessage = {
      id: `btn_${Date.now()}`,
      role: "bot",
      message: menuText,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      buttons: node.content.buttons,
      saveVariable: node.content.save_variable // Nome da variável para salvar a escolha
    };
    setSimulatorMessages(prev => [...prev, msg]);
  };

  const handleListNode = (node: FlowNode) => {
    // Gerar texto com menu numérico para listas
    let menuText = interpolateVariables(node.content.body || "");
    if (node.content.sections && node.content.sections.length > 0) {
      let itemIndex = 1;
      node.content.sections.forEach((section: any) => {
        if (section.title) {
          menuText += `\n\n*📂 ${section.title}*`;
        }
        if (section.rows && section.rows.length > 0) {
          section.rows.forEach((row: any) => {
            menuText += `\n*${itemIndex}.* ${row.title}`;
            if (row.description) {
              menuText += `\n   _${row.description}_`;
            }
            itemIndex++;
          });
        }
      });
      menuText += "\n\n_👆 Digite o número ou escreva sua escolha_";
    }
    
    const msg: SimulatorMessage = {
      id: `list_${Date.now()}`,
      role: "bot",
      message: menuText,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      listSections: node.content.sections,
      saveVariable: node.content.save_variable // Nome da variável para salvar a escolha
    };
    setSimulatorMessages(prev => [...prev, msg]);
  };

  const handleInputNode = (node: FlowNode) => {
    const msg: SimulatorMessage = {
      id: `input_${Date.now()}`,
      role: "bot",
      message: interpolateVariables(node.content.body || node.content.prompt || "Por favor, digite sua resposta:"),
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    setSimulatorMessages(prev => [...prev, msg]);
    setWaitingForInput(true);
    setPendingInputNode(node);
  };

  const handleMediaNode = (node: FlowNode) => {
    const msg: SimulatorMessage = {
      id: `media_${Date.now()}`,
      role: "bot",
      message: node.content.caption || "",
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      mediaUrl: node.content.url,
      mediaType: node.content.media_type
    };
    setSimulatorMessages(prev => [...prev, msg]);

    if (node.next_node_id) {
      setTimeout(() => processNextNode(node.next_node_id!), chatbotConfig.message_delay_ms);
    }
  };

  const handleDelayNode = (node: FlowNode) => {
    const seconds = node.content.seconds || 3;
    setTimeout(() => {
      if (node.next_node_id) {
        processNextNode(node.next_node_id);
      }
    }, seconds * 1000);
  };

  const handleConditionNode = (node: FlowNode) => {
    const variable = node.content.variable || "";
    const operator = node.content.operator || "equals";
    const value = node.content.value || "";
    const varValue = simulatorVariablesRef.current[variable] || "";

    let conditionMet = false;
    switch (operator) {
      case 'equals':
        conditionMet = varValue.toLowerCase() === value.toLowerCase();
        break;
      case 'contains':
        conditionMet = varValue.toLowerCase().includes(value.toLowerCase());
        break;
      case 'not_equals':
        conditionMet = varValue.toLowerCase() !== value.toLowerCase();
        break;
      case 'greater_than':
        conditionMet = parseFloat(varValue) > parseFloat(value);
        break;
      case 'less_than':
        conditionMet = parseFloat(varValue) < parseFloat(value);
        break;
      default:
        conditionMet = varValue === value;
    }

    const nextNode = conditionMet ? node.content.true_node : node.content.false_node;
    if (nextNode) {
      processNextNode(nextNode);
    }
  };

  const handleTransferNode = (node: FlowNode) => {
    const msg: SimulatorMessage = {
      id: `transfer_${Date.now()}`,
      role: "bot",
      message: node.content.message || "Aguarde, vou transferir para um atendente...",
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    setSimulatorMessages(prev => [...prev, msg]);

    // Simulador termina aqui - em producao transferiria para humano
    const systemMsg: SimulatorMessage = {
      id: `system_${Date.now()}`,
      role: "bot",
      message: "[Sistema] Conversa transferida para atendimento humano.",
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    setTimeout(() => {
      setSimulatorMessages(prev => [...prev, systemMsg]);
    }, 1000);
  };

  const handleSetVariableNode = (node: FlowNode) => {
    const varName = node.content.variable_name || "";
    const varValue = node.content.value || "";

    if (varName) {
      simulatorVariablesRef.current = { ...simulatorVariablesRef.current, [varName]: varValue };
      setSimulatorVariables(prev => ({ ...prev, [varName]: varValue }));
    }

    if (node.next_node_id) {
      processNextNode(node.next_node_id);
    }
  };

  const handleEndNode = (node: FlowNode) => {
    if (chatbotConfig.goodbye_message) {
      const msg: SimulatorMessage = {
        id: `end_${Date.now()}`,
        role: "bot",
        message: chatbotConfig.goodbye_message,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
      setSimulatorMessages(prev => [...prev, msg]);
    }
  };

  const handleGotoNode = (node: FlowNode) => {
    if (node.content.target_node) {
      processNextNode(node.content.target_node);
    }
  };

  // Processar clique em botao
  const handleButtonClick = (button: { id: string; title: string; next_node?: string }, saveVariable?: string) => {
    // Adicionar mensagem do usuario
    const userMsg: SimulatorMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      message: button.title,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    setSimulatorMessages(prev => [...prev, userMsg]);

    // Salvar variável se configurado (atualiza state e ref)
    if (saveVariable) {
      simulatorVariablesRef.current = { ...simulatorVariablesRef.current, [saveVariable]: button.title };
      setSimulatorVariables(prev => ({ ...prev, [saveVariable]: button.title }));
    }

    // Processar proximo no
    if (button.next_node) {
      setTimeout(() => processNextNode(button.next_node!), 500);
    }
  };

  // Processar selecao de lista
  const handleListSelect = (row: { id: string; title: string; next_node?: string }, saveVariable?: string) => {
    const userMsg: SimulatorMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      message: row.title,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    setSimulatorMessages(prev => [...prev, userMsg]);

    // Salvar variável se configurado (atualiza state e ref)
    if (saveVariable) {
      simulatorVariablesRef.current = { ...simulatorVariablesRef.current, [saveVariable]: row.title };
      setSimulatorVariables(prev => ({ ...prev, [saveVariable]: row.title }));
    }

    if (row.next_node) {
      setTimeout(() => processNextNode(row.next_node!), 500);
    }
  };

  // ============ SISTEMA HÍBRIDO IA + FLUXO (SEM KEYWORDS FIXAS) ============
  // A IA analisa semanticamente a mensagem do usuário e encontra a melhor opção
  
  // Função para chamar a IA e encontrar a melhor opção
  const findMatchingOptionWithAI = async (userMessage: string): Promise<{ type: 'button' | 'list'; option: any; saveVariable?: string } | null> => {
    const lastBotMessage = [...simulatorMessages].reverse().find(m => m.role === 'bot' && (m.buttons || m.listSections));
    if (!lastBotMessage) return null;

    // Coletar todas as opções disponíveis
    const availableOptions: Array<{ type: 'button' | 'list'; option: any; title: string }> = [];
    
    if (lastBotMessage.buttons && lastBotMessage.buttons.length > 0) {
      for (const button of lastBotMessage.buttons) {
        availableOptions.push({ type: 'button', option: button, title: button.title });
      }
    }
    
    if (lastBotMessage.listSections && lastBotMessage.listSections.length > 0) {
      for (const section of lastBotMessage.listSections) {
        for (const row of section.rows) {
          availableOptions.push({ type: 'list', option: row, title: row.title });
        }
      }
    }

    if (availableOptions.length === 0) return null;

    // Construir lista de opções para a IA
    const optionsText = availableOptions.map((opt, i) => `${i + 1}. ${opt.title}`).join('\n');
    
    // Extrair contexto do negócio a partir do nome do chatbot ou primeiro nó
    const startNode = flowNodes.find(n => n.type === 'inicio' || n.data?.type === 'inicio');
    const businessContext = chatbotConfig?.name || startNode?.data?.title || '';
    
    try {
      // Chamar API da IA para encontrar a melhor correspondência
      const response = await fetch('/api/ai/match-flow-option', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage,
          options: optionsText,
          optionsList: availableOptions.map(o => o.title),
          businessContext: businessContext // Contexto do tipo de negócio
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.matchedIndex !== null && result.matchedIndex >= 0 && result.matchedIndex < availableOptions.length) {
          const matched = availableOptions[result.matchedIndex];
          console.log(`🤖 IA encontrou match: "${userMessage}" → "${matched.title}" (confiança: ${result.confidence})`);
          return { 
            type: matched.type, 
            option: matched.option, 
            saveVariable: lastBotMessage.saveVariable 
          };
        }
      }
    } catch (error) {
      console.log('⚠️ Erro ao chamar IA, usando fallback local:', error);
    }

    // Fallback: busca semântica local simples (sem keywords fixas)
    return findMatchingOptionLocal(userMessage, availableOptions, lastBotMessage.saveVariable);
  };

  // Busca semântica local - análise de similaridade sem keywords fixas
  // ATUALIZADO: Agora aceita NÚMEROS como entrada (1, 2, 3, etc)
  const findMatchingOptionLocal = (
    userMessage: string, 
    options: Array<{ type: 'button' | 'list'; option: any; title: string }>,
    saveVariable?: string
  ): { type: 'button' | 'list'; option: any; saveVariable?: string } | null => {
    
    // 🔢 PRIMEIRO: Verificar se é uma entrada numérica (1, 2, 3, etc)
    const numericInput = parseInt(userMessage.trim(), 10);
    if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= options.length) {
      const selectedOption = options[numericInput - 1];
      console.log(`🔢 Entrada numérica: ${numericInput} → "${selectedOption.title}"`);
      return {
        type: selectedOption.type,
        option: selectedOption.option,
        saveVariable
      };
    }
    
    // Normalizar texto removendo acentos e convertendo para minúsculas
    const normalize = (text: string) => text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .trim();
    
    const userNorm = normalize(userMessage);
    const userWords = userNorm.split(/\s+/).filter(w => w.length > 2);
    
    let bestMatch: { option: typeof options[0] | null; score: number } = { option: null, score: 0 };
    
    for (const opt of options) {
      const optNorm = normalize(opt.title);
      const optWords = optNorm.split(/\s+/).filter(w => w.length > 2);
      
      let score = 0;
      
      // 1. Match exato (usuário digitou exatamente a opção)
      if (userNorm === optNorm) {
        score = 100;
      }
      // 2. Opção contida na mensagem do usuário
      else if (userNorm.includes(optNorm)) {
        score = 90;
      }
      // 3. Mensagem do usuário contida na opção
      else if (optNorm.includes(userNorm)) {
        score = 85;
      }
      // 4. Análise de palavras em comum (semântica básica)
      else {
        // Contar palavras em comum
        let commonWords = 0;
        let totalRelevantWords = 0;
        
        for (const userWord of userWords) {
          if (userWord.length > 2) {
            totalRelevantWords++;
            // Verificar se a palavra do usuário está na opção
            if (optNorm.includes(userWord)) {
              commonWords++;
              // Palavras maiores têm mais peso
              score += userWord.length * 5;
            }
            // Verificar se alguma palavra da opção contém a palavra do usuário
            for (const optWord of optWords) {
              if (optWord.includes(userWord) || userWord.includes(optWord)) {
                if (userWord.length >= 4 || optWord.length >= 4) {
                  score += 15;
                }
              }
            }
          }
        }
        
        // Bonus por quantidade de palavras em comum
        if (commonWords > 0 && totalRelevantWords > 0) {
          score += (commonWords / totalRelevantWords) * 30;
        }
      }
      
      // Atualizar melhor match
      if (score > bestMatch.score) {
        bestMatch = { option: opt, score };
      }
    }
    
    // Só retornar se tiver confiança mínima (score > 20)
    if (bestMatch.option && bestMatch.score > 20) {
      console.log(`🧠 Match local: "${userMessage}" → "${bestMatch.option.title}" (score: ${bestMatch.score})`);
      return { 
        type: bestMatch.option.type, 
        option: bestMatch.option.option, 
        saveVariable 
      };
    }
    
    return null;
  };

  // Função síncrona de fallback para compatibilidade
  const findMatchingOption = (userMessage: string): { type: 'button' | 'list'; option: any; saveVariable?: string } | null => {
    const lastBotMessage = [...simulatorMessages].reverse().find(m => m.role === 'bot' && (m.buttons || m.listSections));
    if (!lastBotMessage) return null;

    const availableOptions: Array<{ type: 'button' | 'list'; option: any; title: string }> = [];
    
    if (lastBotMessage.buttons && lastBotMessage.buttons.length > 0) {
      for (const button of lastBotMessage.buttons) {
        availableOptions.push({ type: 'button', option: button, title: button.title });
      }
    }
    
    if (lastBotMessage.listSections && lastBotMessage.listSections.length > 0) {
      for (const section of lastBotMessage.listSections) {
        for (const row of section.rows) {
          availableOptions.push({ type: 'list', option: row, title: row.title });
        }
      }
    }

    return findMatchingOptionLocal(userMessage, availableOptions, lastBotMessage.saveVariable);
  };

  // Enviar mensagem do simulador
  const handleSimulatorSend = async () => {
    if (!simulatorInput.trim()) return;

    const currentInput = simulatorInput; // Capturar antes de limpar
    setSimulatorInput(""); // Limpar input imediatamente para UX responsiva

    const userMsg: SimulatorMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      message: currentInput,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    setSimulatorMessages(prev => [...prev, userMsg]);

    // Se esperando input, salvar variavel (atualiza state e ref)
    if (waitingForInput && pendingInputNode) {
      const varName = pendingInputNode.content.variable_name || "";
      if (varName) {
        simulatorVariablesRef.current = { ...simulatorVariablesRef.current, [varName]: currentInput };
        setSimulatorVariables(prev => ({ ...prev, [varName]: currentInput }));
      }
      setWaitingForInput(false);

      // Processar proximo no
      if (pendingInputNode.next_node_id) {
        setTimeout(() => processNextNode(pendingInputNode.next_node_id!), 500);
      }
      setPendingInputNode(null);
    } else {
      // Verificar keywords de restart
      if (chatbotConfig.restart_on_keyword && chatbotConfig.restart_keywords.some(k =>
        currentInput.toLowerCase().includes(k.toLowerCase())
      )) {
        // Mensagem já adicionada acima - só reiniciar fluxo (simula WhatsApp real)
        
        // Reiniciar fluxo (como faria o backend no WhatsApp)
        setCurrentNodeId(null);
        simulatorVariablesRef.current = {};
        setSimulatorVariables({});
        
        // Processar do início
        const startNode = flowNodes.find(n => n.node_type === 'start');
        if (startNode) {
          setTimeout(() => processNextNode(startNode.node_id), 500);
        }
        return;
      } else {
        const inputLower = currentInput.toLowerCase().trim()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove acentos para melhor matching
        
        // ==============================================================
        // 🤖 DETECÇÃO COM IA: Sistema genérico para QUALQUER negócio
        // (Simula exatamente como o backend vai processar no WhatsApp)
        // ==============================================================
        
        // Saudações genéricas (universal para qualquer negócio)
        const greetingPatterns = [
          /^(oi|ola|oie|oii|hey|hi|hello|eae|eai|fala|salve|opa|bom\s*dia|boa\s*tarde|boa\s*noite)$/i,
          /^(oi|ola|oie|hey|eae|eai|fala|salve|opa)\s/i,
          /^(tudo\s*bem|tudo\s*bom|como\s*vai|beleza|blz)/i
        ];
        const isGreeting = greetingPatterns.some(pattern => pattern.test(inputLower));
        
        if (isGreeting) {
          console.log(`👋 [IA] Saudação detectada: "${currentInput}" - Simulando reinício de fluxo`);
          
          // Mensagem já adicionada acima - só reiniciar fluxo (simula comportamento do backend)
          setCurrentNodeId(null);
          simulatorVariablesRef.current = {};
          setSimulatorVariables({});
          
          // Processar do início
          const startNode = flowNodes.find(n => n.node_type === 'start');
          if (startNode) {
            setTimeout(() => processNextNode(startNode.node_id), 500);
          }
          return;
        }
        
        // Pedidos de menu/catálogo (genérico - funciona para qualquer negócio)
        const menuPatterns = [
          /\b(menu|cardapio|catalogo|opcoes|servicos|produtos)\b/i,
          /\b(quero\s*ver|o\s*que\s*tem)\b/i
        ];
        const isMenuRequest = menuPatterns.some(pattern => pattern.test(inputLower));
        
        if (isMenuRequest) {
          console.log(`📋 [IA] Pedido de menu detectado: "${currentInput}" - Simulando menu inicial`);
          
          // Mensagem já adicionada acima - só reiniciar fluxo
          setCurrentNodeId(null);
          simulatorVariablesRef.current = {};
          setSimulatorVariables({});
          
          // Processar do início
          const startNode = flowNodes.find(n => n.node_type === 'start');
          if (startNode) {
            setTimeout(() => processNextNode(startNode.node_id), 500);
          }
          return;
        }
        
        // ============ PRIMEIRO: Verificar entrada numérica (prioridade máxima) ============
        const numericInput = parseInt(currentInput.trim(), 10);
        const isNumeric = !isNaN(numericInput) && currentInput.trim().match(/^\d+$/);
        
        // Tentar match local primeiro (funciona com números)
        const localMatch = findMatchingOption(currentInput);
        
        if (localMatch) {
          console.log(`✅ Match local encontrado: "${currentInput}" → "${localMatch.option.title}"${isNumeric ? ' (entrada numérica)' : ''}`);
          if (localMatch.saveVariable) {
            simulatorVariablesRef.current = { ...simulatorVariablesRef.current, [localMatch.saveVariable]: localMatch.option.title };
            setSimulatorVariables(prev => ({ ...prev, [localMatch.saveVariable]: localMatch.option.title }));
          }
          if (localMatch.option.next_node) {
            setTimeout(() => processNextNode(localMatch.option.next_node!), 500);
          }
          return; // Sair aqui - não precisa chamar IA
        }
        
        // ============ SISTEMA HÍBRIDO - tentar com IA apenas se match local falhou ============
        const advSettings = chatbotConfig.advanced_settings || { enable_hybrid_ai: true };
        const hybridEnabled = advSettings.enable_hybrid_ai !== false;
        
        let foundMatch = false;
        
        if (hybridEnabled && !isNumeric) {
          // Tentar com a IA (assíncrono) - mas NÃO para entradas numéricas
          console.log('🧠 Sistema Híbrido: tentando match com IA para:', currentInput);
          
          try {
            const aiMatch = await findMatchingOptionWithAI(currentInput);
            if (aiMatch) {
              foundMatch = true;
              console.log('🤖 IA encontrou match:', aiMatch);
              
              // Simular seleção do botão/lista encontrado
              if (aiMatch.type === 'button') {
                if (aiMatch.saveVariable) {
                  simulatorVariablesRef.current = { ...simulatorVariablesRef.current, [aiMatch.saveVariable]: aiMatch.option.title };
                  setSimulatorVariables(prev => ({ ...prev, [aiMatch.saveVariable]: aiMatch.option.title }));
                }
                if (aiMatch.option.next_node) {
                  setTimeout(() => processNextNode(aiMatch.option.next_node!), 500);
                }
              } else if (aiMatch.type === 'list') {
                if (aiMatch.saveVariable) {
                  simulatorVariablesRef.current = { ...simulatorVariablesRef.current, [aiMatch.saveVariable]: aiMatch.option.title };
                  setSimulatorVariables(prev => ({ ...prev, [aiMatch.saveVariable]: aiMatch.option.title }));
                }
                if (aiMatch.option.next_node) {
                  setTimeout(() => processNextNode(aiMatch.option.next_node!), 500);
                }
              }
            }
          } catch (error) {
            console.log('⚠️ Erro na IA:', error);
          }
        }
          
        // Fallback local já foi tentado acima
        if (!foundMatch) {
          const localMatchFinal = findMatchingOption(currentInput);
          if (localMatchFinal) {
            foundMatch = true;
            console.log('🧠 Match local encontrado:', localMatchFinal);
              
            if (localMatchFinal.type === 'button') {
              if (localMatchFinal.saveVariable) {
                simulatorVariablesRef.current = { ...simulatorVariablesRef.current, [localMatchFinal.saveVariable]: localMatchFinal.option.title };
                setSimulatorVariables(prev => ({ ...prev, [localMatchFinal.saveVariable]: localMatchFinal.option.title }));
              }
              if (localMatchFinal.option.next_node) {
                setTimeout(() => processNextNode(localMatchFinal.option.next_node!), 500);
              }
            } else if (localMatchFinal.type === 'list') {
              if (localMatchFinal.saveVariable) {
                simulatorVariablesRef.current = { ...simulatorVariablesRef.current, [localMatchFinal.saveVariable]: localMatchFinal.option.title };
                setSimulatorVariables(prev => ({ ...prev, [localMatchFinal.saveVariable]: localMatchFinal.option.title }));
              }
              if (localMatchFinal.option.next_node) {
                setTimeout(() => processNextNode(localMatchFinal.option.next_node!), 500);
              }
            }
          }
        }
        
        // Se não encontrou match, mostrar fallback
        if (!foundMatch) {
          const fallbackMsg: SimulatorMessage = {
            id: `fallback_${Date.now()}`,
            role: "bot",
            message: chatbotConfig.fallback_message,
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          };
          setTimeout(() => {
            setSimulatorMessages(prev => [...prev, fallbackMsg]);
          }, chatbotConfig.typing_delay_ms);
        }
      }
    }
  };

  // ============ RENDER ============
  const isLoading = configLoading || nodesLoading;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500">
              <Workflow className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Construtor de Fluxo</h1>
              <p className="text-xs text-muted-foreground">Crie chatbots com IA conversacional</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle mobile */}
            <div className="md:hidden">
              <Tabs value={mobileView} onValueChange={(v) => setMobileView(v as "editor" | "simulator")}>
                <TabsList className="h-8">
                  <TabsTrigger value="editor" className="text-xs px-2">
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Editor
                  </TabsTrigger>
                  <TabsTrigger value="simulator" className="text-xs px-2">
                    <Smartphone className="w-3 h-3 mr-1" />
                    Teste
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Status e acoes */}
            <Badge variant={chatbotConfig.is_active ? "default" : "secondary"} className={chatbotConfig.is_active ? "bg-green-500" : ""}>
              {chatbotConfig.is_active ? "Ativo" : "Inativo"}
            </Badge>

            <Switch
              checked={chatbotConfig.is_active}
              onCheckedChange={(checked) => {
                setChatbotConfig(prev => ({ ...prev, is_active: checked }));
                setHasChanges(true);
              }}
            />

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowVersionHistory(true);
                refetchVersions();
              }}
            >
              <History className="w-4 h-4 mr-1" />
              Histórico
            </Button>

            <Button
              onClick={() => saveFlowMutation.mutate()}
              disabled={saveFlowMutation.isPending || !hasChanges}
              size="sm"
            >
              {saveFlowMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Salvar
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* PAINEL ESQUERDO - Chat com IA para criar fluxo */}
        <div className={cn(
          "flex flex-col border-r bg-background",
          mobileView === "editor" ? "flex w-full md:w-1/2" : "hidden md:flex md:w-1/2"
        )}>
          {/* Tabs do editor */}
          <div className="flex-shrink-0 border-b px-4 py-2">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "chat" | "flow" | "config")}>
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="chat" className="gap-1 text-xs">
                  <Sparkles className="w-3 h-3" />
                  <span className="hidden sm:inline">Criar com IA</span>
                  <span className="sm:hidden">IA</span>
                </TabsTrigger>
                <TabsTrigger value="flow" className="gap-1 text-xs">
                  <Eye className="w-3 h-3" />
                  <span className="hidden sm:inline">Ver Fluxo</span>
                  <span className="sm:hidden">Fluxo</span>
                </TabsTrigger>
                <TabsTrigger value="config" className="gap-1 text-xs">
                  <Settings className="w-3 h-3" />
                  <span className="hidden sm:inline">Configurar</span>
                  <span className="sm:hidden">Config</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Conteudo das tabs */}
          <div className="flex-1 overflow-hidden">
            {/* Tab: Chat com IA */}
            {activeTab === "chat" && (
              <div className="h-full flex flex-col">
                {/* Header do chat */}
                <div className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <Wand2 className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Assistente de Fluxo</p>
                      <p className="text-xs text-white/70">Descreva o que deseja criar</p>
                    </div>
                  </div>
                </div>

                {/* Mensagens do chat */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex",
                          msg.role === "user" ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-lg px-4 py-2",
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : msg.isConfirmation 
                                ? "bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700"
                                : "bg-muted"
                          )}
                        >
                          {/* Indicador de confirmação */}
                          {msg.isConfirmation && (
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-amber-200 dark:border-amber-700">
                              <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
                                <span className="text-white text-xs">?</span>
                              </div>
                              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Confirmação necessária</span>
                            </div>
                          )}
                          
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          
                          {/* Botões de ação */}
                          {msg.actionButtons && msg.actionButtons.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-muted-foreground/20">
                              {msg.actionButtons.map((btn, idx) => (
                                <Button
                                  key={idx}
                                  variant={btn.variant as any || "outline"}
                                  size="sm"
                                  className="text-xs h-8"
                                  onClick={() => handleActionButton(btn.value)}
                                >
                                  {btn.label}
                                </Button>
                              ))}
                            </div>
                          )}
                          
                          <p className={cn(
                            "text-[10px] mt-1",
                            msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                    {isProcessing && (
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-lg px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm text-muted-foreground">Criando fluxo...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </ScrollArea>

                {/* Input do chat */}
                <div className="flex-shrink-0 border-t p-4">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Descreva o fluxo que deseja criar..."
                      value={editInput}
                      onChange={(e) => setEditInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="min-h-[44px] max-h-[120px] resize-none"
                      rows={1}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={isProcessing || !editInput.trim()}
                      size="icon"
                      className="h-11 w-11 flex-shrink-0"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Pressione Enter para enviar ou Shift+Enter para nova linha
                  </p>
                </div>
              </div>
            )}

            {/* Tab: Visualizar Fluxo */}
            {activeTab === "flow" && (
              <ScrollArea className="h-full p-4">
                <div className="space-y-3">
                  {flowNodes.length === 0 ? (
                    <div className="text-center py-12">
                      <Workflow className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-semibold mb-2">Nenhum fluxo criado</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Use a aba "Criar com IA" para construir seu chatbot
                      </p>
                      <Button variant="outline" onClick={() => setActiveTab("chat")}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Comecar a criar
                      </Button>
                    </div>
                  ) : (
                    flowNodes.map((node, index) => {
                      const config = NODE_TYPES_CONFIG[node.node_type];
                      const Icon = config?.icon || MessageSquare;

                      return (
                        <Card key={node.id} className="p-3 hover:border-primary/50 transition-colors group">
                          <div className="flex items-start gap-3">
                            <div className={cn("p-2 rounded-lg bg-muted", config?.color)}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">
                                  {index + 1}
                                </Badge>
                                <p className="font-medium text-sm truncate">{node.name}</p>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {config?.label || node.node_type}
                              </p>
                              {node.content.text && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {node.content.text}
                                </p>
                              )}
                              {node.content.body && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {node.content.body}
                                </p>
                              )}
                              {node.content.buttons && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {node.content.buttons.map((btn) => (
                                    <Badge key={btn.id} variant="secondary" className="text-[10px]">
                                      {btn.title}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Botões de Ação */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Editar nó"
                                onClick={() => handleEditNode(node.id)}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                title="Excluir nó"
                                onClick={() => handleDeleteNode(node.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            )}

            {/* Tab: Configuracoes */}
            {activeTab === "config" && (
              <ScrollArea className="h-full p-4">
                <div className="space-y-6">
                  {/* Nome do chatbot */}
                  <div className="space-y-2">
                    <Label>Nome do Chatbot</Label>
                    <Input
                      value={chatbotConfig.name}
                      onChange={(e) => {
                        setChatbotConfig(prev => ({ ...prev, name: e.target.value }));
                        setHasChanges(true);
                      }}
                      placeholder="Ex: Atendimento Pizzaria"
                    />
                  </div>

                  {/* Mensagem de boas-vindas */}
                  <div className="space-y-2">
                    <Label>Mensagem de Boas-vindas</Label>
                    <Textarea
                      value={chatbotConfig.welcome_message}
                      onChange={(e) => {
                        setChatbotConfig(prev => ({ ...prev, welcome_message: e.target.value }));
                        setHasChanges(true);
                      }}
                      placeholder="Ola! Como posso ajudar?"
                      rows={3}
                    />
                  </div>

                  {/* Mensagem de fallback */}
                  <div className="space-y-2">
                    <Label>Mensagem de Fallback</Label>
                    <Textarea
                      value={chatbotConfig.fallback_message}
                      onChange={(e) => {
                        setChatbotConfig(prev => ({ ...prev, fallback_message: e.target.value }));
                        setHasChanges(true);
                      }}
                      placeholder="Desculpe, nao entendi..."
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enviada quando o usuario digita algo nao reconhecido
                    </p>
                  </div>

                  {/* Mensagem de despedida */}
                  <div className="space-y-2">
                    <Label>Mensagem de Despedida</Label>
                    <Textarea
                      value={chatbotConfig.goodbye_message}
                      onChange={(e) => {
                        setChatbotConfig(prev => ({ ...prev, goodbye_message: e.target.value }));
                        setHasChanges(true);
                      }}
                      placeholder="Obrigado pelo contato!"
                      rows={2}
                    />
                  </div>

                  {/* Tempo de digitacao */}
                  <div className="space-y-2">
                    <Label>Tempo de Digitacao (ms)</Label>
                    <Input
                      type="number"
                      min={500}
                      max={5000}
                      step={100}
                      value={chatbotConfig.typing_delay_ms}
                      onChange={(e) => {
                        setChatbotConfig(prev => ({ ...prev, typing_delay_ms: parseInt(e.target.value) }));
                        setHasChanges(true);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Tempo que mostra "digitando..." antes de enviar
                    </p>
                  </div>

                  {/* Keywords de restart */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Keywords para Reiniciar</Label>
                      <Switch
                        checked={chatbotConfig.restart_on_keyword}
                        onCheckedChange={(checked) => {
                          setChatbotConfig(prev => ({ ...prev, restart_on_keyword: checked }));
                          setHasChanges(true);
                        }}
                      />
                    </div>
                    {chatbotConfig.restart_on_keyword && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {chatbotConfig.restart_keywords.map((keyword, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {keyword}
                            <button
                              className="ml-1 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setChatbotConfig(prev => ({
                                  ...prev,
                                  restart_keywords: prev.restart_keywords.filter((_, i) => i !== idx)
                                }));
                                setHasChanges(true);
                              }}
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Sistema Anti-Banimento: Humanização de Mensagens */}
                  <div className="space-y-3 border-t pt-4 mt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">🛡️ Variação IA (Anti-Ban)</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Adiciona variações naturais nas mensagens para evitar detecção de bot
                        </p>
                      </div>
                      <Switch
                        checked={chatbotConfig.enable_humanization || false}
                        onCheckedChange={(checked) => {
                          setChatbotConfig(prev => ({ ...prev, enable_humanization: checked }));
                          setHasChanges(true);
                        }}
                      />
                    </div>
                    {chatbotConfig.enable_humanization && (
                      <div className="space-y-2 ml-2">
                        <Label className="text-xs">Nível de Humanização</Label>
                        <select
                          className="w-full p-2 border rounded-md text-sm bg-background"
                          value={chatbotConfig.humanization_level || 'medium'}
                          onChange={(e) => {
                            setChatbotConfig(prev => ({ 
                              ...prev, 
                              humanization_level: e.target.value as 'low' | 'medium' | 'high' 
                            }));
                            setHasChanges(true);
                          }}
                        >
                          <option value="low">🔵 Baixo - Pequenas variações de pontuação</option>
                          <option value="medium">🟡 Médio - Variações de emojis e palavras</option>
                          <option value="high">🔴 Alto - Reescrita com IA (mais natural)</option>
                        </select>
                        <p className="text-xs text-muted-foreground">
                          {chatbotConfig.humanization_level === 'low' && '• Adiciona/remove espaços, pontuação variada'}
                          {chatbotConfig.humanization_level === 'medium' && '• Troca emojis similares, sinônimos básicos'}
                          {chatbotConfig.humanization_level === 'high' && '• IA reescreve mantendo sentido (usa créditos)'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Sistema Híbrido IA+Fluxo */}
                  <div className="space-y-3 border-t pt-4 mt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">🧠 Sistema Híbrido IA + Fluxo</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          A IA interpreta a intenção e aciona o fluxo correto
                        </p>
                      </div>
                      <Switch
                        checked={chatbotConfig.advanced_settings?.enable_hybrid_ai ?? true}
                        onCheckedChange={(checked) => {
                          setChatbotConfig(prev => ({ 
                            ...prev, 
                            advanced_settings: {
                              ...prev.advanced_settings,
                              enable_hybrid_ai: checked,
                              ai_confidence_threshold: prev.advanced_settings?.ai_confidence_threshold ?? 0.7,
                              fallback_to_flow: prev.advanced_settings?.fallback_to_flow ?? true,
                              interpret_dates: prev.advanced_settings?.interpret_dates ?? true,
                              interpret_times: prev.advanced_settings?.interpret_times ?? true
                            }
                          }));
                          setHasChanges(true);
                        }}
                      />
                    </div>
                    {chatbotConfig.advanced_settings?.enable_hybrid_ai && (
                      <div className="space-y-3 ml-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-xs">📅 Interpretar datas naturais</Label>
                            <p className="text-xs text-muted-foreground">Entende "hoje", "amanhã", etc.</p>
                          </div>
                          <Switch
                            checked={chatbotConfig.advanced_settings?.interpret_dates ?? true}
                            onCheckedChange={(checked) => {
                              setChatbotConfig(prev => ({ 
                                ...prev, 
                                advanced_settings: {
                                  ...prev.advanced_settings!,
                                  interpret_dates: checked
                                }
                              }));
                              setHasChanges(true);
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-xs">⏰ Interpretar horários naturais</Label>
                            <p className="text-xs text-muted-foreground">Entende "às 14h", "manhã", etc.</p>
                          </div>
                          <Switch
                            checked={chatbotConfig.advanced_settings?.interpret_times ?? true}
                            onCheckedChange={(checked) => {
                              setChatbotConfig(prev => ({ 
                                ...prev, 
                                advanced_settings: {
                                  ...prev.advanced_settings!,
                                  interpret_times: checked
                                }
                              }));
                              setHasChanges(true);
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Confiança mínima da IA (0-100%)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={Math.round((chatbotConfig.advanced_settings?.ai_confidence_threshold ?? 0.7) * 100)}
                            onChange={(e) => {
                              const value = Math.min(100, Math.max(0, parseInt(e.target.value) || 70)) / 100;
                              setChatbotConfig(prev => ({ 
                                ...prev, 
                                advanced_settings: {
                                  ...prev.advanced_settings!,
                                  ai_confidence_threshold: value
                                }
                              }));
                              setHasChanges(true);
                            }}
                            className="text-sm mt-1"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Quanto maior, mais preciso mas menos flexível (recomendado: 70%)
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Horário de Funcionamento */}
                  <div className="space-y-3 border-t pt-4 mt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">⏰ Horário de Funcionamento</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Responde fora do horário com mensagem automática
                        </p>
                      </div>
                      <Switch
                        checked={chatbotConfig.business_hours_enabled || false}
                        onCheckedChange={(checked) => {
                          setChatbotConfig(prev => ({ ...prev, business_hours_enabled: checked }));
                          setHasChanges(true);
                        }}
                      />
                    </div>
                    {chatbotConfig.business_hours_enabled && (
                      <div className="space-y-3 ml-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Abertura</Label>
                            <Input
                              type="time"
                              value={chatbotConfig.opening_time || '08:00'}
                              onChange={(e) => {
                                setChatbotConfig(prev => ({ ...prev, opening_time: e.target.value }));
                                setHasChanges(true);
                              }}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Fechamento</Label>
                            <Input
                              type="time"
                              value={chatbotConfig.closing_time || '18:00'}
                              onChange={(e) => {
                                setChatbotConfig(prev => ({ ...prev, closing_time: e.target.value }));
                                setHasChanges(true);
                              }}
                              className="text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Dias fechados</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, idx) => (
                              <button
                                key={day}
                                type="button"
                                className={`px-2 py-1 text-xs rounded ${
                                  (chatbotConfig.closed_days || []).includes(idx)
                                    ? 'bg-red-500 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700'
                                }`}
                                onClick={() => {
                                  const days = chatbotConfig.closed_days || [];
                                  const newDays = days.includes(idx)
                                    ? days.filter(d => d !== idx)
                                    : [...days, idx];
                                  setChatbotConfig(prev => ({ ...prev, closed_days: newDays }));
                                  setHasChanges(true);
                                }}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Mensagem fora do horário</Label>
                          <Textarea
                            value={chatbotConfig.closed_message || ''}
                            onChange={(e) => {
                              setChatbotConfig(prev => ({ ...prev, closed_message: e.target.value }));
                              setHasChanges(true);
                            }}
                            placeholder="⏰ Estamos fechados no momento..."
                            rows={2}
                            className="text-sm mt-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* PAINEL DIREITO - Simulador WhatsApp */}
        <div className={cn(
          "flex flex-col bg-[#e5ddd5] dark:bg-zinc-900",
          mobileView === "simulator" ? "flex w-full md:w-1/2" : "hidden md:flex md:w-1/2"
        )}>
          {/* Header do simulador - estilo WhatsApp */}
          <div className="flex-shrink-0 bg-[#075E54] dark:bg-zinc-800 text-white px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{chatbotConfig.name || "Chatbot"}</p>
                  <p className="text-xs text-white/70">
                    Simulador de Teste
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    // Recarregar nós da API antes de iniciar simulação
                    try {
                      const res = await apiRequest("GET", "/api/chatbot/nodes");
                      const freshNodes = await res.json();
                      if (freshNodes && freshNodes.length > 0) {
                        const normalizedNodes = normalizeAINodes(freshNodes);
                        setFlowNodes(normalizedNodes);
                        startSimulation(normalizedNodes);
                      } else {
                        startSimulation();
                      }
                    } catch {
                      startSimulation();
                    }
                  }}
                  className="text-white hover:bg-white/10"
                >
                  <Play className="w-4 h-4 mr-1" />
                  Iniciar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSimulatorMessages([])}
                  className="text-white hover:bg-white/10"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Area de mensagens do simulador */}
          <ScrollArea className="flex-1 p-4" style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
          }}>
            <div className="space-y-3">
              {simulatorMessages.length === 0 ? (
                <div className="text-center py-12">
                  <Smartphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-muted-foreground mb-2">Simulador de Teste</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Clique em "Iniciar" para testar o fluxo
                  </p>
                </div>
              ) : (
                simulatorMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.isTyping ? (
                      <div className="bg-white dark:bg-zinc-700 rounded-lg rounded-tl-none px-4 py-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "max-w-[85%] rounded-lg px-3 py-2 shadow-sm",
                          msg.role === "user"
                            ? "bg-[#DCF8C6] dark:bg-green-800 rounded-tr-none"
                            : "bg-white dark:bg-zinc-700 rounded-tl-none"
                        )}
                      >
                        {/* Media */}
                        {msg.mediaUrl && (
                          <div className="mb-2">
                            {msg.mediaType === 'image' && (
                              <img src={msg.mediaUrl} alt="Media" className="rounded max-w-full max-h-48 object-cover" />
                            )}
                            {msg.mediaType === 'video' && (
                              <video src={msg.mediaUrl} controls className="rounded max-w-full max-h-48" />
                            )}
                            {msg.mediaType === 'audio' && (
                              <audio src={msg.mediaUrl} controls className="w-full" />
                            )}
                          </div>
                        )}

                        {/* Mensagem */}
                        {msg.message && (
                          <p
                            className="text-sm"
                            dangerouslySetInnerHTML={{ __html: formatWhatsAppText(msg.message) }}
                          />
                        )}

                        {/* Botoes */}
                        {msg.buttons && msg.buttons.length > 0 && (
                          <div className="flex flex-col gap-1 mt-2 pt-2 border-t">
                            {msg.buttons.map((btn) => (
                              <Button
                                key={btn.id}
                                variant="outline"
                                size="sm"
                                className="w-full justify-center text-xs h-8 bg-white dark:bg-zinc-600"
                                onClick={() => handleButtonClick(btn as any, (btn as any).save_variable || msg.saveVariable)}
                              >
                                {btn.title}
                              </Button>
                            ))}
                          </div>
                        )}

                        {/* Lista */}
                        {msg.listSections && msg.listSections.length > 0 && (
                          <div className="mt-2 pt-2 border-t">
                            {msg.listSections.map((section, sIdx) => (
                              <div key={sIdx} className="mb-2">
                                <p className="text-xs font-semibold text-muted-foreground mb-1">
                                  {section.title}
                                </p>
                                {section.rows.map((row) => (
                                  <Button
                                    key={row.id}
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-start text-xs h-auto py-2 px-2"
                                    onClick={() => handleListSelect(row as any, (row as any).save_variable || msg.saveVariable)}
                                  >
                                    <div className="text-left">
                                      <p className="font-medium">{row.title}</p>
                                      {row.description && (
                                        <p className="text-muted-foreground text-[10px]">{row.description}</p>
                                      )}
                                    </div>
                                  </Button>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Timestamp */}
                        <p className={cn(
                          "text-[10px] mt-1 text-right",
                          msg.role === "user" ? "text-[#667781] dark:text-green-300" : "text-[#667781] dark:text-zinc-400"
                        )}>
                          {msg.time} {msg.role === "user" && "\u2713\u2713"}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={simulatorEndRef} />
            </div>
          </ScrollArea>

          {/* Input do simulador - estilo WhatsApp */}
          <div className="flex-shrink-0 bg-[#F0F0F0] dark:bg-zinc-800 px-3 py-2">
            <div className="flex items-end gap-2">
              <Textarea
                placeholder="Digite sua mensagem..."
                value={simulatorInput}
                onChange={(e) => setSimulatorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSimulatorSend();
                  }
                }}
                className="flex-1 resize-none rounded-2xl border-0 bg-white dark:bg-zinc-700 min-h-[44px] max-h-[120px] py-3 px-4 text-sm"
                rows={1}
              />
              <Button
                onClick={handleSimulatorSend}
                disabled={!simulatorInput.trim()}
                size="icon"
                className="h-11 w-11 rounded-full bg-[#00A884] hover:bg-[#008f6f] flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Dialog de Edição de Nó - SIMPLIFICADO: Apenas textos visíveis ao cliente */}
      <Dialog open={showNodeEditor} onOpenChange={(open) => {
        setShowNodeEditor(open);
        if (!open) setEditingNode(null);
      }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Editar Conteúdo
            </DialogTitle>
            <DialogDescription>
              Edite os textos que aparecem para o cliente no chat
            </DialogDescription>
          </DialogHeader>

          {editingNode && (
            <ScrollArea className="flex-1 max-h-[50vh] pr-4">
              <div className="space-y-4">
                {/* Indicador do tipo de nó */}
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <Badge variant="secondary" className="text-xs">
                    {editingNode.node_type === 'message' && '💬 Mensagem'}
                    {editingNode.node_type === 'buttons' && '🔘 Botões'}
                    {editingNode.node_type === 'list' && '📋 Lista'}
                    {editingNode.node_type === 'input' && '📝 Coleta de Dados'}
                    {editingNode.node_type === 'start' && '🚀 Início'}
                    {editingNode.node_type === 'end' && '🏁 Fim'}
                    {editingNode.node_type === 'transfer_human' && '👤 Transferir'}
                    {!['message','buttons','list','input','start','end','transfer_human'].includes(editingNode.node_type) && `📦 ${editingNode.node_type}`}
                  </Badge>
                  <span className="text-sm text-muted-foreground">{editingNode.name}</span>
                </div>

                {/* MENSAGEM: Apenas o texto */}
                {(editingNode.node_type === 'message' || editingNode.node_type === 'start' || editingNode.node_type === 'end') && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Texto da Mensagem
                    </Label>
                    <Textarea
                      value={editingNode.content.text || ''}
                      onChange={(e) => setEditingNode({
                        ...editingNode, 
                        content: {...editingNode.content, text: e.target.value}
                      })}
                      placeholder="Digite o texto que o cliente verá..."
                      className="min-h-[150px] font-medium"
                    />
                    <p className="text-xs text-muted-foreground">
                      💡 Use *texto* para <strong>negrito</strong>, _texto_ para <em>itálico</em>
                    </p>
                  </div>
                )}

                {/* BOTÕES: Texto + lista de botões */}
                {editingNode.node_type === 'buttons' && (
                  <>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Texto/Pergunta
                      </Label>
                      <Textarea
                        value={editingNode.content.text || editingNode.content.body || ''}
                        onChange={(e) => setEditingNode({
                          ...editingNode, 
                          content: {...editingNode.content, text: e.target.value, body: e.target.value}
                        })}
                        placeholder="Texto que aparece antes dos botões..."
                        className="min-h-[80px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <span className="text-lg">🔘</span>
                        Opções de Botões ({editingNode.content.buttons?.length || 0})
                      </Label>
                      <div className="space-y-2 bg-muted/30 p-3 rounded-lg">
                        {editingNode.content.buttons?.map((btn, idx) => (
                          <div key={btn.id || idx} className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-6">{idx + 1}.</span>
                            <Input
                              value={btn.title}
                              onChange={(e) => {
                                const newButtons = [...(editingNode.content.buttons || [])];
                                newButtons[idx] = {...btn, title: e.target.value};
                                setEditingNode({
                                  ...editingNode,
                                  content: {...editingNode.content, buttons: newButtons}
                                });
                              }}
                              placeholder={`Botão ${idx + 1}`}
                              className="flex-1"
                            />
                            {editingNode.content.buttons && editingNode.content.buttons.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => {
                                  const newButtons = editingNode.content.buttons?.filter((_, i) => i !== idx);
                                  setEditingNode({
                                    ...editingNode,
                                    content: {...editingNode.content, buttons: newButtons}
                                  });
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-2"
                          onClick={() => {
                            const newButtons = [...(editingNode.content.buttons || []), {
                              id: `btn_${Date.now()}`,
                              title: 'Nova Opção'
                            }];
                            setEditingNode({
                              ...editingNode,
                              content: {...editingNode.content, buttons: newButtons}
                            });
                          }}
                        >
                          <Plus className="w-4 h-4 mr-1" /> Adicionar Opção
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {/* LISTA: Texto + botão da lista */}
                {editingNode.node_type === 'list' && (
                  <>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Texto da Lista
                      </Label>
                      <Textarea
                        value={editingNode.content.text || editingNode.content.body || ''}
                        onChange={(e) => setEditingNode({
                          ...editingNode, 
                          content: {...editingNode.content, text: e.target.value, body: e.target.value}
                        })}
                        placeholder="Texto que aparece antes da lista..."
                        className="min-h-[80px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <span className="text-lg">📋</span>
                        Texto do Botão
                      </Label>
                      <Input
                        value={editingNode.content.button_text || 'Ver opções'}
                        onChange={(e) => setEditingNode({
                          ...editingNode, 
                          content: {...editingNode.content, button_text: e.target.value}
                        })}
                        placeholder="Ex: Ver cardápio, Escolher, etc."
                      />
                    </div>
                  </>
                )}

                {/* INPUT: Apenas a pergunta (variável é técnico, não mostrar) */}
                {editingNode.node_type === 'input' && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Pergunta para o Cliente
                    </Label>
                    <Textarea
                      value={editingNode.content.prompt || editingNode.content.text || ''}
                      onChange={(e) => setEditingNode({
                        ...editingNode, 
                        content: {...editingNode.content, prompt: e.target.value, text: e.target.value}
                      })}
                      placeholder="Ex: Qual seu nome completo?"
                      className="min-h-[100px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      💡 Esta é a pergunta que o cliente verá no chat
                    </p>
                  </div>
                )}

                {/* TRANSFER: Mensagem de transferência */}
                {editingNode.node_type === 'transfer_human' && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Mensagem de Transferência
                    </Label>
                    <Textarea
                      value={editingNode.content.message || editingNode.content.text || ''}
                      onChange={(e) => setEditingNode({
                        ...editingNode, 
                        content: {...editingNode.content, message: e.target.value, text: e.target.value}
                      })}
                      placeholder="Ex: Aguarde, vou transferir para um atendente..."
                      className="min-h-[80px]"
                    />
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => {
              setShowNodeEditor(false);
              setEditingNode(null);
            }}>
              Cancelar
            </Button>
            <Button onClick={() => {
              if (editingNode) {
                handleSaveNodeEdit(editingNode);
              }
            }} className="bg-primary">
              <Save className="w-4 h-4 mr-2" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Histórico de Versões */}
      <Dialog open={showVersionHistory} onOpenChange={setShowVersionHistory}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Versões
            </DialogTitle>
            <DialogDescription>
              Visualize e restaure versões anteriores do seu fluxo
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[50vh]">
            {!flowVersions || flowVersions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma versão salva ainda.</p>
                <p className="text-sm mt-1">As versões são salvas automaticamente ao criar ou editar o fluxo com IA.</p>
              </div>
            ) : (
              <div className="space-y-2 p-1">
                {flowVersions.map((version) => (
                  <Card 
                    key={version.id} 
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/50",
                      version.is_current && "border-primary bg-primary/5"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              v{version.version_number}
                            </Badge>
                            <Badge 
                              variant={version.edit_type === 'ai_generate' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {version.edit_type === 'ai_generate' && '🤖 IA'}
                              {version.edit_type === 'ai_chat' && '💬 Chat IA'}
                              {version.edit_type === 'manual' && '✏️ Manual'}
                              {version.edit_type === 'restore' && '↩️ Restauração'}
                            </Badge>
                            {version.is_current && (
                              <Badge className="bg-green-500 text-xs">Atual</Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium">{version.edit_summary}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <ClockIcon className="h-3 w-3" />
                              {new Date(version.created_at).toLocaleString('pt-BR')}
                            </span>
                            <span>{version.nodes_count} nós</span>
                          </div>
                        </div>
                        {!version.is_current && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => restoreVersionMutation.mutate(version.id)}
                            disabled={restoreVersionMutation.isPending}
                          >
                            {restoreVersionMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <RotateCcw className="h-4 w-4 mr-1" />
                                Restaurar
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVersionHistory(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FlowBuilderStudio;
