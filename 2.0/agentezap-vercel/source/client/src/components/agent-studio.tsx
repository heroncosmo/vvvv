import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Bot, ArrowRight, Sparkles, MessageSquare, Edit3, 
  Loader2, Send, Eye, Code, Smartphone, Monitor, 
  CheckCircle2, Wand2, RefreshCw, Settings, Zap,
  Undo2, Redo2, History, ChevronUp, ChevronDown,
  Lock, Rocket
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { repairMojibakeText } from "@shared/mojibake";

// 🔒 Modal de upgrade estilo Lovable
interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  used: number;
  limit: number;
  type: "calibration" | "simulator";
}

function UpgradeModal({ isOpen, onClose, title, description, used, limit, type }: UpgradeModalProps) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-8 animate-in fade-in-50 zoom-in-95">
        {/* Badge decorativo */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 px-4 py-1 text-sm font-medium">
            Limite atingido
          </Badge>
        </div>
        
        {/* Ícone */}
        <div className="flex justify-center mb-6 pt-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center">
            <Rocket className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        
        {/* Título */}
        <h3 className="text-xl font-semibold text-white text-center mb-2">{title}</h3>
        
        {/* Barra de progresso */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-slate-400 mb-2">
            <span>{type === "calibration" ? "Calibrações hoje" : "Mensagens hoje"}</span>
            <span className="text-emerald-400 font-medium">{used}/{limit}</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full" style={{width: "100%"}} />
          </div>
        </div>
        
        {/* Descrição */}
        <p className="text-slate-300 text-center text-sm mb-6">{description}</p>
        
        {/* Benefícios */}
        <div className="bg-slate-800/50 rounded-xl p-4 mb-6 border border-slate-700">
          <p className="text-emerald-400 text-sm font-medium mb-3">✨ Com o plano PRO você terá:</p>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Calibrações ilimitadas por dia</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Simulador sem limite de mensagens</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Mensagens reais ilimitadas no WhatsApp</span>
            </li>
          </ul>
        </div>
        
        {/* Botões */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            Agora não
          </Button>
          <Button
            onClick={() => window.location.href = "/plans"}
            className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-600 hover:to-cyan-600"
          >
            <Zap className="w-4 h-4 mr-2" />
            Ver planos
          </Button>
        </div>
      </div>
    </div>
  );
}

interface AgentStudioProps {
  initialPrompt: string;
  onSave: (prompt: string) => void;
  onNavigateToConnect?: () => void;
  isNew?: boolean; // Se é um agente recém-criado
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isEditing?: boolean;
}

interface SimulatorMessage {
  id: string;
  role: "user" | "agent";
  message: string;
  time: string;
}

// Interface para histórico de versões do prompt
interface PromptHistoryEntry {
  id: string;
  prompt: string;
  instruction: string;
  timestamp: Date;
  summary: string;
}

// Constantes para controle de histórico
const MAX_CHAT_MESSAGES_VISIBLE = 50; // Mensagens visíveis por padrão
const CHAT_LOAD_INCREMENT = 20; // Mensagens carregadas por vez

export function AgentStudio({ initialPrompt, onSave, onNavigateToConnect, isNew = false }: AgentStudioProps) {
  const { toast } = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const simulatorEndRef = useRef<HTMLDivElement>(null);
  
  // Estado do prompt
  const [currentPrompt, setCurrentPrompt] = useState(repairMojibakeText(initialPrompt));
  const [hasChanges, setHasChanges] = useState(false);
  
  // Estado do chat de edição com lazy loading
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [visibleMessages, setVisibleMessages] = useState(MAX_CHAT_MESSAGES_VISIBLE);
  const [editInput, setEditInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Sistema de Undo/Redo (histórico de versões)
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showHistory, setShowHistory] = useState(false);
  
  // Estado do simulador
  const [simulatorMessages, setSimulatorMessages] = useState<SimulatorMessage[]>([]);
  const [simulatorInput, setSimulatorInput] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatorSentMedias, setSimulatorSentMedias] = useState<string[]>([]); // 🆕 Mídias já enviadas
  const simulatorSessionIdRef = useRef(`sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  
  // 🔒 Estado do modal de upgrade (estilo Lovable)
  const [upgradeModal, setUpgradeModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    used: number;
    limit: number;
    type: "calibration" | "simulator";
  }>({ isOpen: false, title: "", description: "", used: 0, limit: 0, type: "calibration" });
  
  // View mode
  const [activeView, setActiveView] = useState<"chat" | "code">("chat");
  const [mobileView, setMobileView] = useState<"editor" | "simulator">("editor");

  // Inicialização
  useEffect(() => {
    // Se é agente novo, mostra mensagem de boas-vindas
    if (isNew && chatMessages.length === 0) {
      setChatMessages([{
        id: "welcome",
        role: "system",
        content: "🎉 Agente criado! Você pode me dizer ajustes que quer fazer ou testar no simulador ao lado.",
        timestamp: new Date()
      }]);
    }
  }, [isNew]);

  // Scroll automático
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    simulatorEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [simulatorMessages]);

  // Atualiza quando prompt inicial mudar
  useEffect(() => {
    const normalizedPrompt = repairMojibakeText(initialPrompt);
    setCurrentPrompt(normalizedPrompt);
    // Inicializa histórico com prompt inicial
    if (promptHistory.length === 0) {
      setPromptHistory([{
        id: "initial",
        prompt: normalizedPrompt,
        instruction: "Prompt inicial",
        timestamp: new Date(),
        summary: "Versão original"
      }]);
      setHistoryIndex(0);
    }
  }, [initialPrompt]);

  // ============ FUNÇÕES DE HISTÓRICO (UNDO/REDO) ============
  
  const addToHistory = useCallback((newPrompt: string, instruction: string, summary: string) => {
    const newEntry: PromptHistoryEntry = {
      id: `history-${Date.now()}`,
      prompt: newPrompt,
      instruction,
      timestamp: new Date(),
      summary
    };
    
    // Remove entradas futuras se estamos no meio do histórico
    const newHistory = [...promptHistory.slice(0, historyIndex + 1), newEntry];
    setPromptHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [promptHistory, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < promptHistory.length - 1;

  const handleUndo = useCallback(() => {
    if (canUndo) {
      const newIndex = historyIndex - 1;
      const previousEntry = promptHistory[newIndex];
      setCurrentPrompt(repairMojibakeText(previousEntry.prompt));
      setHistoryIndex(newIndex);
      setHasChanges(true);
      
      // Adiciona mensagem no chat
      setChatMessages(prev => [...prev, {
        id: `system-undo-${Date.now()}`,
        role: "system",
        content: `⏪ Desfez: "${previousEntry.instruction}"`,
        timestamp: new Date()
      }]);
    }
  }, [canUndo, historyIndex, promptHistory]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      const newIndex = historyIndex + 1;
      const nextEntry = promptHistory[newIndex];
      setCurrentPrompt(repairMojibakeText(nextEntry.prompt));
      setHistoryIndex(newIndex);
      setHasChanges(true);
      
      // Adiciona mensagem no chat
      setChatMessages(prev => [...prev, {
        id: `system-redo-${Date.now()}`,
        role: "system",
        content: `⏩ Refez: "${nextEntry.instruction}"`,
        timestamp: new Date()
      }]);
    }
  }, [canRedo, historyIndex, promptHistory]);

  const restoreFromHistory = useCallback((index: number) => {
    const entry = promptHistory[index];
    if (entry) {
      setCurrentPrompt(repairMojibakeText(entry.prompt));
      setHistoryIndex(index);
      setHasChanges(true);
      setShowHistory(false);
      
      setChatMessages(prev => [...prev, {
        id: `system-restore-${Date.now()}`,
        role: "system",
        content: `🔄 Restaurado: "${entry.instruction}" (${entry.timestamp.toLocaleTimeString()})`,
        timestamp: new Date()
      }]);
    }
  }, [promptHistory]);

  // ============ LAZY LOADING DO CHAT ============
  
  const loadMoreMessages = useCallback(() => {
    setVisibleMessages(prev => Math.min(prev + CHAT_LOAD_INCREMENT, chatMessages.length));
  }, [chatMessages.length]);

  const hasMoreMessages = chatMessages.length > visibleMessages;
  const displayedMessages = chatMessages.slice(-visibleMessages);

  // ============ EDIÇÃO VIA CHAT ============
  const handleEditPrompt = async () => {
    if (!editInput.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: editInput,
      timestamp: new Date()
    };
    
    const currentInstruction = editInput;
    setChatMessages(prev => [...prev, userMessage]);
    setEditInput("");
    setIsProcessing(true);

    try {
      // Chama API de edição com novo engine
      const response = await apiRequest("POST", "/api/agent/edit-prompt", {
        currentPrompt,
        instruction: currentInstruction
      });
      
      const data = await response.json();
      
      // 🔒 Verificar se atingiu limite de calibrações
      if (data.limitReached) {
        setUpgradeModal({
          isOpen: true,
          title: "Você atingiu o limite de calibrações",
          description: data.message || "Assine um plano para continuar calibrando seu agente de IA.",
          used: data.used || 5,
          limit: data.limit || 5,
          type: "calibration"
        });
        
        // Mensagem no chat sobre o limite
        const limitMessage: ChatMessage = {
          id: `limit-${Date.now()}`,
          role: "assistant",
          content: `🚀 Você usou todas as ${data.limit} calibrações gratuitas de hoje! Para continuar aperfeiçoando seu agente, assine um plano PRO.`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, limitMessage]);
        return;
      }
      
      if (data.success && data.newPrompt && data.newPrompt !== currentPrompt) {
        // Adiciona ao histórico antes de atualizar
        const normalizedPrompt = repairMojibakeText(data.newPrompt);
        addToHistory(normalizedPrompt, currentInstruction, data.summary || "Edição aplicada");
        
        setCurrentPrompt(normalizedPrompt);
        setHasChanges(false); // Reset porque vamos salvar automaticamente
        
        // Mensagem de confirmação com feedback detalhado
        const feedbackContent = data.feedbackMessage || data.summary || "Mudanças aplicadas!";
        const changesInfo = data.changes?.length > 0 
          ? `\n\n📋 ${data.changes.length} operação(ões)` 
          : "";
        
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: feedbackContent + changesInfo,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, assistantMessage]);
        
        // AUTO-SAVE: Salvar automaticamente após edição bem-sucedida
        onSave(normalizedPrompt);
        
        toast({
          title: "✅ Prompt atualizado e salvo",
          description: data.summary || "Mudanças aplicadas e salvas automaticamente!"
        });
      } else {
        // Nenhuma mudança feita
        const warningMessage: ChatMessage = {
          id: `warning-${Date.now()}`,
          role: "assistant",
          content: data.feedbackMessage || `⚠️ Não consegui aplicar essa mudança. Tente ser mais específico.\n\n💡 Dicas:\n• Para mudar nome: "mude o nome para X"\n• Para mudar preço: "preço: R$50"\n• Para remover: "remova a parte sobre X"\n• Para adicionar: "adicione que fechamos às 22h"`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, warningMessage]);
      }
    } catch (error: any) {
      console.error("Erro ao editar prompt:", error);
      
      // Mensagem de erro amigável
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `❌ Erro ao processar. Tente novamente ou edite manualmente clicando em "Código".`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  // ============ SIMULADOR ============
  const handleSimulate = async () => {
    if (!simulatorInput.trim() || isSimulating) return;

    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    // Adiciona mensagem do usuário
    const userMsg: SimulatorMessage = {
      id: `sim-user-${Date.now()}`,
      role: "user",
      message: simulatorInput,
      time
    };
    setSimulatorMessages(prev => [...prev, userMsg]);
    setSimulatorInput("");
    setIsSimulating(true);

    try {
      // 🆕 CONVERTER HISTÓRICO DO SIMULADOR PARA FORMATO DO BACKEND
      const historyForBackend = simulatorMessages.map(msg => ({
        role: msg.role === "agent" ? "assistant" : "user" as "user" | "assistant",
        content: msg.message
      }));
      
      // Usa o prompt atual para teste
      const response = await apiRequest("POST", "/api/agent/test", {
        message: simulatorInput,
        customPrompt: hasChanges ? currentPrompt : undefined, // Se tem mudanças não salvas, usa o atual
        // 🆕 ENVIAR HISTÓRICO E MÍDIAS PARA SIMULADOR UNIFICADO
        history: historyForBackend,
        sentMedias: simulatorSentMedias,
        sessionId: simulatorSessionIdRef.current
      });
      
      const data = await response.json();
      
      // 🔒 Verificar se atingiu limite do simulador
      if (data.limitReached) {
        setUpgradeModal({
          isOpen: true,
          title: "Limite de testes atingido",
          description: data.message || "Assine um plano para testar seu agente sem limites.",
          used: data.used || 25,
          limit: data.limit || 25,
          type: "simulator"
        });
        
        // Adiciona mensagem de limite no simulador
        const limitMsg: SimulatorMessage = {
          id: `sim-limit-${Date.now()}`,
          role: "agent",
          message: `🚀 Você usou todas as ${data.limit} mensagens de teste gratuitas de hoje! Assine um plano PRO para testar sem limites.`,
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        };
        setSimulatorMessages(prev => [...prev, limitMsg]);
        return;
      }
      
      // Adiciona resposta do agente
      const agentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const responseText = typeof data?.response === "string" ? data.response : "";
      if (responseText.trim()) {
        const agentMsg: SimulatorMessage = {
          id: `sim-agent-${Date.now()}`,
          role: "agent",
          message: responseText,
          time: agentTime
        };
        setSimulatorMessages(prev => [...prev, agentMsg]);
      }
      
      // 🆕 RASTREAR MÍDIAS ENVIADAS NESTA SESSÃO
      if (data?.mediaActions && data.mediaActions.length > 0) {
        const newMediaNames = data.mediaActions
          .filter((a: any) => a.type === 'send_media' && a.media_name)
          .map((a: any) => a.media_name.toUpperCase());
        setSimulatorSentMedias(prev => [...new Set([...prev, ...newMediaNames])]);
      }
      
    } catch (error: any) {
      toast({
        title: "Erro no simulador",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSimulating(false);
    }
  };

  // ============ SALVAR ============
  const handleSave = () => {
    onSave(repairMojibakeText(currentPrompt));
    setHasChanges(false);
    toast({
      title: "Salvo!",
      description: "Configurações do agente atualizadas."
    });
    
    // Se for novo e tiver callback, redireciona
    if (isNew && onNavigateToConnect) {
      setTimeout(() => {
        onNavigateToConnect();
      }, 1000);
    }
  };

  // ============ SUGESTÕES RÁPIDAS ============
  const quickActions = [
    { label: "Mais formal", instruction: "Torne o tom mais formal e profissional" },
    { label: "Mais vendedor", instruction: "Adicione técnicas de vendas e persuasão" },
    { label: "Mais curto", instruction: "Faça as respostas serem mais curtas e diretas" },
    { label: "Mais emojis", instruction: "Use mais emojis nas respostas" },
  ];

  // ============ RENDER ============
  return (
    <div className="flex flex-col h-full">
      
      {/* Mobile Tab Switcher - Design melhorado */}
      <div className="md:hidden flex items-center justify-center gap-2 px-3 py-2 border-b bg-background">
        <button
          onClick={() => setMobileView("editor")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all",
            mobileView === "editor" 
              ? "bg-primary text-primary-foreground shadow-md" 
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
        >
          <Edit3 className="w-4 h-4" />
          Editor
        </button>
        <button
          onClick={() => setMobileView("simulator")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all",
            mobileView === "simulator" 
              ? "bg-[#075E54] text-white shadow-md" 
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
        >
          <Smartphone className="w-4 h-4" />
          Preview
        </button>
      </div>

      {/* Main Split View */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* ============ LEFT PANEL: EDITOR ============ */}
        <div className={cn(
          "flex-1 flex flex-col border-r bg-background relative overflow-hidden",
          mobileView !== "editor" && "hidden md:flex"
        )}>
          
          {/* Editor Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Editor de Agente</h3>
                <p className="text-[10px] text-muted-foreground">
                  {activeView === "chat" ? "Converse para editar" : "Edite o código"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Undo/Redo Buttons */}
              <div className="flex items-center gap-0.5 mr-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="h-8 w-8 p-0"
                  title="Desfazer (Ctrl+Z)"
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="h-8 w-8 p-0"
                  title="Refazer (Ctrl+Y)"
                >
                  <Redo2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn("h-8 w-8 p-0", showHistory && "bg-muted")}
                  title="Histórico de versões"
                >
                  <History className="w-4 h-4" />
                </Button>
              </div>

              {/* View Toggle */}
              <div className="hidden md:flex bg-muted rounded-lg p-0.5">
                <Button
                  variant={activeView === "chat" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveView("chat")}
                  className="h-7 px-2 text-xs"
                >
                  <MessageSquare className="w-3 h-3 mr-1" />
                  Chat
                </Button>
                <Button
                  variant={activeView === "code" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveView("code")}
                  className="h-7 px-2 text-xs"
                >
                  <Code className="w-3 h-3 mr-1" />
                  Código
                </Button>
              </div>
              
              {/* Save Button (desktop) */}
              {hasChanges && (
                <Button size="sm" onClick={handleSave} className="hidden md:flex">
                  <Zap className="w-3 h-3 mr-1" />
                  Salvar
                </Button>
              )}
            </div>
          </div>

          {/* History Panel (collapsible) - Posicionado como overlay para não quebrar layout */}
          {showHistory && promptHistory.length > 1 && (
            <div className="absolute top-12 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur-sm shadow-lg px-4 py-3 max-h-48 overflow-y-auto mx-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">
                  📜 Histórico ({promptHistory.length})
                </p>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1">
                {[...promptHistory].reverse().slice(0, 10).map((entry, idx) => {
                  const actualIndex = promptHistory.length - 1 - idx;
                  const isActive = actualIndex === historyIndex;
                  return (
                    <button
                      key={entry.id}
                      onClick={() => restoreFromHistory(actualIndex)}
                      className={cn(
                        "w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors overflow-hidden",
                        isActive 
                          ? "bg-primary/10 border border-primary/30" 
                          : "hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("truncate flex-1 min-w-0", isActive && "font-medium")}>
                          {entry.instruction}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {entry.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Editor Content */}
          {activeView === "chat" ? (
            <>
              {/* Chat Messages with Lazy Loading */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                
                {/* Load More Button */}
                {hasMoreMessages && (
                  <div className="flex justify-center pb-2">
                    <button
                      onClick={loadMoreMessages}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <ChevronUp className="w-3 h-3" />
                      Carregar mais ({chatMessages.length - visibleMessages} anteriores)
                    </button>
                  </div>
                )}
                
                {/* Mensagem inicial */}
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                      <Wand2 className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg">Editor Inteligente</h4>
                      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                        Diga o que quer mudar no seu agente. Ex: "torne mais formal" ou "adicione foco em vendas"
                      </p>
                    </div>
                    
                    {/* Quick Actions */}
                    <div className="flex flex-wrap gap-2 justify-center mt-4">
                      {quickActions.map((action, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          onClick={() => setEditInput(action.instruction)}
                          className="text-xs h-8 rounded-full"
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Histórico de chat com lazy loading */}
                {displayedMessages.map((msg) => (
                  <div key={msg.id} className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}>
                    <div className={cn(
                      "px-4 py-2.5 rounded-2xl max-w-[85%] shadow-sm",
                      msg.role === "user" 
                        ? "bg-primary text-primary-foreground rounded-br-md" 
                        : msg.role === "system"
                        ? "bg-muted/50 text-muted-foreground text-center mx-auto text-sm"
                        : "bg-muted rounded-bl-md"
                    )}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                
                {/* Loading */}
                {isProcessing && (
                  <div className="flex justify-start">
                    <div className="bg-muted px-4 py-3 rounded-2xl rounded-bl-md">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Aplicando mudanças...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>
              
              {/* Chat Input */}
              <div className="border-t bg-muted/10 p-3">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Ex: Torne as respostas mais curtas..."
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleEditPrompt();
                      }
                    }}
                    className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl bg-background"
                    rows={1}
                  />
                  <Button
                    onClick={handleEditPrompt}
                    disabled={isProcessing || !editInput.trim()}
                    size="icon"
                    className="h-11 w-11 rounded-xl flex-shrink-0"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                
                {/* Quick action chips */}
                {editInput === "" && chatMessages.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {quickActions.slice(0, 3).map((action, i) => (
                      <button
                        key={i}
                        onClick={() => setEditInput(action.instruction)}
                        className="text-[10px] px-2 py-1 rounded-full border border-border/50 bg-background hover:bg-muted transition-colors"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Code View */
            <div className="flex-1 flex flex-col p-4">
              <Textarea
                value={currentPrompt}
                onChange={(e) => {
          setCurrentPrompt(repairMojibakeText(e.target.value));
                  setHasChanges(true);
                }}
                className="flex-1 font-mono text-sm resize-none bg-zinc-950 text-green-400 rounded-xl p-4 border-zinc-800"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* ============ RIGHT PANEL: SIMULATOR ============ */}
        <div className={cn(
          "w-full md:w-[380px] lg:w-[420px] flex-shrink-0 flex flex-col bg-[#e5ddd5] dark:bg-zinc-900",
          mobileView !== "simulator" && "hidden md:flex"
        )}>
          
          {/* Simulator Header */}
          <div className="bg-[#075E54] dark:bg-zinc-800 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Simulador WhatsApp</p>
              <p className="text-xs text-white/70">
                Teste seu agente em tempo real
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSimulatorMessages([])}
              className="text-white/70 hover:text-white hover:bg-white/10 text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Limpar
            </Button>
          </div>

          {/* Simulator Messages */}
          <div 
            className="flex-1 overflow-y-auto p-4 space-y-3"
            style={{ 
              backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' 
            }}
          >
            {/* Empty state */}
            {simulatorMessages.length === 0 && (
              <div className="flex justify-center">
                <div className="bg-[#FCF4CB] dark:bg-yellow-900/30 text-[#54656F] dark:text-yellow-200 text-xs px-4 py-2 rounded-lg shadow-sm text-center max-w-[250px]">
                  <Smartphone className="w-4 h-4 mx-auto mb-1" />
                  Teste como seu agente responde. Digite uma mensagem abaixo.
                </div>
              </div>
            )}

            {/* Messages */}
            {simulatorMessages.map((msg) => (
              <div key={msg.id} className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}>
                <div className={cn(
                  "px-3 py-2 rounded-lg max-w-[80%] shadow-sm",
                  msg.role === "user" 
                    ? "bg-[#DCF8C6] dark:bg-green-800 text-[#303030] dark:text-white rounded-tr-none" 
                    : "bg-white dark:bg-zinc-700 text-[#303030] dark:text-white rounded-tl-none"
                )}>
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                  <p className={cn(
                    "text-[10px] text-right mt-1",
                    msg.role === "user" ? "text-[#667781] dark:text-green-300" : "text-[#667781] dark:text-zinc-400"
                  )}>
                    {msg.time} {msg.role === "user" && "\u2713\u2713"}
                  </p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isSimulating && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-zinc-700 px-4 py-3 rounded-lg rounded-tl-none shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-muted-foreground">digitando...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={simulatorEndRef} />
          </div>

          {/* Simulator Input */}
          <div className="bg-[#F0F0F0] dark:bg-zinc-800 px-3 py-2 flex items-end gap-2 flex-shrink-0">
            <Textarea
              placeholder="Digite sua mensagem..."
              value={simulatorInput}
              onChange={(e) => setSimulatorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && simulatorInput.trim()) {
                  e.preventDefault();
                  handleSimulate();
                }
              }}
              className="flex-1 resize-none rounded-2xl border-0 bg-white dark:bg-zinc-700 min-h-[44px] max-h-[120px] py-3 px-4 text-sm"
              rows={1}
            />
            <Button
              onClick={handleSimulate}
              disabled={isSimulating || !simulatorInput.trim()}
              size="icon"
              className="h-11 w-11 rounded-full bg-[#00A884] hover:bg-[#008f6f] flex-shrink-0"
            >
              {isSimulating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ArrowRight className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar (New Agent) */}
      {isNew && (
        <div className="border-t bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              Agente pronto! Teste e depois conecte ao WhatsApp.
            </span>
          </div>
          <Button 
            onClick={() => {
              handleSave();
            }}
            className="bg-green-600 hover:bg-green-700"
          >
            <Zap className="w-4 h-4 mr-2" />
            Salvar e Conectar
          </Button>
        </div>
      )}
      
      {/* 🔒 Modal de Upgrade (estilo Lovable) */}
      <UpgradeModal
        isOpen={upgradeModal.isOpen}
        onClose={() => setUpgradeModal(prev => ({ ...prev, isOpen: false }))}
        title={upgradeModal.title}
        description={upgradeModal.description}
        used={upgradeModal.used}
        limit={upgradeModal.limit}
        type={upgradeModal.type}
      />
    </div>
  );
}
