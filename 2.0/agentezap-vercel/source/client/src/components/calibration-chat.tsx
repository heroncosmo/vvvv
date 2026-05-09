/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 CHAT DE CALIBRAÇÃO - Interface para corrigir problemas do agente IA
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Permite que o cliente descreva problemas que a IA está cometendo
 * e automaticamente ajusta o prompt para corrigir.
 * 
 * FLUXO:
 * 1. Cliente descreve: "A IA não está perguntando o nome do cliente"
 * 2. Sistema analisa e edita o prompt
 * 3. Mostra preview da mudança
 * 4. Cliente confirma ou ajusta
 */

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MessageSquare, Send, Loader2, CheckCircle2, AlertCircle, 
  Wand2, RefreshCw, X, ArrowRight, Zap, Bot, User,
  Lightbulb, Target, Wrench
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  PROMPT_EDIT_REQUEST_MAX_ATTEMPTS,
  getPromptEditRetryDelayMs,
  isRetryablePromptEditMessage,
  isRetryablePromptEditStatus,
} from "@shared/promptEditRetry";
import { extractSseDataEvents } from "@shared/sseStream";

// ============ INTERFACES ============
interface CalibrationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  status?: "pending" | "success" | "error";
  promptChange?: {
    before: string;
    after: string;
    summary: string;
  };
}

interface CalibrationChatProps {
  currentPrompt: string;
  onPromptUpdated?: (newPrompt: string) => void;
  className?: string;
}

// ============ SUGESTÕES RÁPIDAS ============
const QUICK_SUGGESTIONS = [
  { 
    icon: <Target className="w-4 h-4" />,
    label: "IA não pergunta o nome", 
    instruction: "A IA deveria perguntar o nome do cliente logo no início da conversa"
  },
  { 
    icon: <MessageSquare className="w-4 h-4" />,
    label: "Respostas muito longas", 
    instruction: "As respostas estão muito longas, preciso que sejam mais curtas e diretas"
  },
  { 
    icon: <Wand2 className="w-4 h-4" />,
    label: "Falta empatia", 
    instruction: "A IA precisa ser mais empática e acolhedora com os clientes"
  },
  { 
    icon: <Zap className="w-4 h-4" />,
    label: "Não oferece produtos", 
    instruction: "A IA deveria oferecer produtos ou serviços quando o cliente pergunta preços"
  },
];

// ============ COMPONENTE PRINCIPAL ============
export function CalibrationChat({ currentPrompt, onPromptUpdated, className }: CalibrationChatProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Estado
  const [messages, setMessages] = useState<CalibrationMessage[]>([{
    id: "welcome",
    role: "system",
    content: "👋 Olá! Me conte qual problema você está enfrentando com seu agente IA. Por exemplo: \"A IA não está perguntando o nome do cliente\" ou \"As respostas estão muito formais\".",
    timestamp: new Date()
  }]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamLogs, setStreamLogs] = useState<string[]>([]);
  
  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamLogs]);

  const buildRetryStatusMessage = (nextAttempt: number, delayMs: number) => {
    const seconds = Math.max(1, Math.ceil(delayMs / 1000));
    return `🔄 Provedor ocupado. Continuando automaticamente (${nextAttempt}/${PROMPT_EDIT_REQUEST_MAX_ATTEMPTS}) em ${seconds}s...`;
  };

  const waitForRetry = (delayMs: number) =>
    new Promise((resolve) => setTimeout(resolve, delayMs));

  // ============ ENVIAR PROBLEMA PARA CALIBRAÇÃO ============
  const handleSubmit = async (customInstruction?: string) => {
    const instruction = customInstruction || input.trim();
    if (!instruction || isProcessing) return;

    // Adiciona mensagem do usuário
    const userMessage: CalibrationMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: instruction,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsProcessing(true);
    setStreamLogs([]);

    // Adiciona mensagem de processamento
    const processingId = `processing-${Date.now()}`;
    const processingMessage: CalibrationMessage = {
      id: processingId,
      role: "assistant",
      content: "🔄 Analisando o problema...",
      timestamp: new Date(),
      status: "pending"
    };
    setMessages(prev => [...prev, processingMessage]);

    try {
      const token = await getAuthToken();

      for (let requestAttempt = 1; requestAttempt <= PROMPT_EDIT_REQUEST_MAX_ATTEMPTS; requestAttempt += 1) {
        try {
          const response = await fetch("/api/agent/edit-prompt-stream", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              currentPrompt,
              instruction: `PROBLEMA RELATADO PELO CLIENTE: ${instruction}\n\nCORRIJA o prompt para resolver este problema. Seja específico nas edições.`,
              skipCalibration: false
            })
          });

          if (!response.ok) {
            const rawError = await response.text().catch(() => "");
            if (
              requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS &&
              (isRetryablePromptEditStatus(response.status) || isRetryablePromptEditMessage(rawError))
            ) {
              const delayMs = getPromptEditRetryDelayMs(requestAttempt);
              setMessages(prev => prev.map(msg =>
                msg.id === processingId
                  ? { ...msg, content: buildRetryStatusMessage(requestAttempt + 1, delayMs), status: "pending" }
                  : msg
              ));
              await waitForRetry(delayMs);
              continue;
            }

            throw new Error(rawError || `HTTP ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            if (requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS) {
              const delayMs = getPromptEditRetryDelayMs(requestAttempt);
              setMessages(prev => prev.map(msg =>
                msg.id === processingId
                  ? { ...msg, content: buildRetryStatusMessage(requestAttempt + 1, delayMs), status: "pending" }
                  : msg
              ));
              await waitForRetry(delayMs);
              continue;
            }

            throw new Error("Não foi possível iniciar o streaming da calibração.");
          }

          const decoder = new TextDecoder();
          let currentLogs: string[] = [];
          let hasTerminalResponse = false;
          let shouldRetryRequest = false;
          let sseBuffer = "";

          while (true) {
            const { done, value } = await reader.read();
            sseBuffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            const parsedBatch = extractSseDataEvents(sseBuffer, { flush: done });
            sseBuffer = parsedBatch.remainder;

            for (const eventPayload of parsedBatch.events) {
              try {
                const data = JSON.parse(eventPayload);
                
                if (data.type === 'log' || data.type === 'calibration_log') {
                  const newMessage = String(data.message || "");
                  if (newMessage && !currentLogs.includes(newMessage)) {
                    currentLogs = [...currentLogs, newMessage];
                    setStreamLogs([...currentLogs]);
                  }
                  
                  const logText = currentLogs.slice(-3).map(log => `• ${log}`).join('\n');
                  setMessages(prev => prev.map(msg => 
                    msg.id === processingId 
                      ? { ...msg, content: `🔄 **Corrigindo seu agente...**\n\n${logText}`, status: "pending" }
                      : msg
                  ));
                }
                
                if (data.type === 'limit_reached') {
                  setMessages(prev => prev.map(msg => 
                    msg.id === processingId 
                      ? { 
                          ...msg, 
                          content: `🚀 Você atingiu o limite de calibrações gratuitas. Assine um plano PRO para continuar.`,
                          status: "error" 
                        }
                      : msg
                  ));
                  hasTerminalResponse = true;
                  break;
                }
                
                if (data.type === 'complete') {
                  if (data.success && data.newPrompt) {
                    onPromptUpdated?.(data.newPrompt);
                    queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/agent/prompt-versions"] });
                    
                    const calibInfo = data.calibration 
                      ? ` (Score: ${data.calibration.score}/100)`
                      : '';
                    
                    setMessages(prev => prev.map(msg => 
                      msg.id === processingId 
                        ? { 
                            ...msg, 
                            content: `✅ **Problema corrigido!**${calibInfo}\n\n${data.feedbackMessage || "Seu agente foi ajustado com sucesso."}`,
                            status: "success"
                          }
                        : msg
                    ));
                    
                    toast({
                      title: "✅ Agente calibrado!",
                      description: "O problema foi corrigido automaticamente."
                    });
                    hasTerminalResponse = true;
                    break;
                  }

                  const feedbackMessage = String(data.feedbackMessage || "");
                  if (
                    requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS &&
                    isRetryablePromptEditMessage(feedbackMessage)
                  ) {
                    shouldRetryRequest = true;
                    break;
                  }

                  setMessages(prev => prev.map(msg => 
                    msg.id === processingId 
                      ? { 
                          ...msg, 
                          content: feedbackMessage || "⚠️ Não foi possível corrigir automaticamente. Tente descrever o problema de outra forma.",
                          status: "error"
                        }
                      : msg
                  ));
                  hasTerminalResponse = true;
                  break;
                }
                
                if (data.type === 'error') {
                  const errorMessage = String(data.message || "");
                  if (
                    requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS &&
                    isRetryablePromptEditMessage(errorMessage)
                  ) {
                    shouldRetryRequest = true;
                    break;
                  }

                  setMessages(prev => prev.map(msg => 
                    msg.id === processingId 
                      ? { 
                          ...msg, 
                          content: `❌ Erro: ${errorMessage || "Falha ao calibrar."}`,
                          status: "error"
                        }
                      : msg
                  ));
                  hasTerminalResponse = true;
                  break;
                }
              } catch (e) {
                console.warn('Erro ao parsear SSE:', e);
              }
            }

            if (hasTerminalResponse || shouldRetryRequest) {
              break;
            }

            if (done) {
              break;
            }
          }

          if (hasTerminalResponse) {
            break;
          }

          if (shouldRetryRequest && requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS) {
            const delayMs = getPromptEditRetryDelayMs(requestAttempt);
            setMessages(prev => prev.map(msg =>
              msg.id === processingId
                ? { ...msg, content: buildRetryStatusMessage(requestAttempt + 1, delayMs), status: "pending" }
                : msg
            ));
            await waitForRetry(delayMs);
            continue;
          }

          setMessages(prev => prev.map(msg => 
            msg.id === processingId 
              ? { 
                  ...msg, 
                  content: "⚠️ Não foi possível concluir a calibração agora.",
                  status: "error"
                }
              : msg
          ));
          break;
        } catch (error: any) {
          console.error('Erro no streaming:', error);
          const rawMessage = error instanceof Error ? error.message : "";

          if (
            requestAttempt < PROMPT_EDIT_REQUEST_MAX_ATTEMPTS &&
            isRetryablePromptEditMessage(rawMessage)
          ) {
            const delayMs = getPromptEditRetryDelayMs(requestAttempt);
            setMessages(prev => prev.map(msg =>
              msg.id === processingId
                ? { ...msg, content: buildRetryStatusMessage(requestAttempt + 1, delayMs), status: "pending" }
                : msg
            ));
            await waitForRetry(delayMs);
            continue;
          }

          setMessages(prev => prev.map(msg => 
            msg.id === processingId 
              ? { 
                  ...msg, 
                  content: `⚠️ ${rawMessage || "Erro temporário. Por favor, tente novamente."}`,
                  status: "error"
                }
              : msg
          ));
          break;
        }
      }
    } finally {
      setIsProcessing(false);
      setStreamLogs([]);
    }
  };

  // ============ RENDERIZAÇÃO ============
  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-lg">Corrigir Problemas</CardTitle>
            <CardDescription className="text-xs">
              Descreva o que a IA está fazendo errado
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" && "justify-end"
                )}
              >
                {msg.role !== "user" && (
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                    msg.role === "system" && "bg-blue-100 dark:bg-blue-900/30",
                    msg.role === "assistant" && msg.status === "success" && "bg-green-100 dark:bg-green-900/30",
                    msg.role === "assistant" && msg.status === "error" && "bg-red-100 dark:bg-red-900/30",
                    msg.role === "assistant" && msg.status === "pending" && "bg-amber-100 dark:bg-amber-900/30",
                    msg.role === "assistant" && !msg.status && "bg-purple-100 dark:bg-purple-900/30"
                  )}>
                    {msg.status === "pending" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                    ) : msg.status === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : msg.status === "error" ? (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    ) : msg.role === "system" ? (
                      <Lightbulb className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Bot className="w-4 h-4 text-purple-600" />
                    )}
                  </div>
                )}
                
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                  msg.role === "user" && "bg-primary text-primary-foreground",
                  msg.role === "system" && "bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100",
                  msg.role === "assistant" && "bg-muted"
                )}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
                
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </ScrollArea>
        
        {/* Quick Suggestions */}
        {messages.length <= 2 && !isProcessing && (
          <div className="px-4 pb-2">
            <p className="text-xs text-muted-foreground mb-2">💡 Problemas comuns:</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_SUGGESTIONS.map((suggestion, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  className="h-auto py-1.5 px-3 text-xs"
                  onClick={() => handleSubmit(suggestion.instruction)}
                >
                  {suggestion.icon}
                  <span className="ml-1.5">{suggestion.label}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
        
        {/* Input Area */}
        <div className="p-4 border-t bg-muted/30">
          <div className="flex gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Descreva o problema da IA... (Ex: A IA não está oferecendo ajuda)"
              className="min-h-[60px] max-h-[120px] resize-none text-sm"
              disabled={isProcessing}
            />
            <Button
              onClick={() => handleSubmit()}
              disabled={!input.trim() || isProcessing}
              className="h-auto px-4"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Pressione Enter para enviar • A IA será ajustada automaticamente
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default CalibrationChat;
