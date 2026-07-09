/**
 * 🧪 PÁGINA DE TESTE DO AGENTE - Interface estilo WhatsApp
 * 
 * Permite testar o agente sem precisar conectar ao WhatsApp real.
 * URL: /test/:token ou /test-agent
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send, Bot, Loader2, Mic, Smile, Check, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatWhatsAppTextForHtml } from "@/lib/whatsapp-format";

interface Message {
  id: string;
  text: string;
  fromMe: boolean;
  timestamp: Date;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaName?: string; // V23g: nome da mídia para dedup
}

type PublicTestAgentMessagePayload = {
  message: string;
  token: string;
  userId?: string;
  sessionId: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  sentMedias: string[];
};

const PUBLIC_TEST_AGENT_MESSAGE_MAX_ATTEMPTS = 2;
const PUBLIC_TEST_AGENT_MESSAGE_TIMEOUT_MS = 45_000;
const PUBLIC_TEST_CHAT_STORAGE_PREFIX = "agentezap:public-test-chat:v1:";
const PUBLIC_TEST_CHAT_MAX_STORED_MESSAGES = 160;

type StoredPublicTestMessage = Omit<Message, "timestamp"> & { timestamp: string };

type PublicTestChatStorage = {
  version: 1;
  sessionId: string;
  messages: StoredPublicTestMessage[];
};

type PublicTestSessionServerMessage = {
  id?: string;
  role?: "user" | "assistant";
  content?: string;
  createdAt?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaName?: string | null;
};

function createPublicTestSessionId() {
  const browserCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (browserCrypto?.randomUUID) {
    return `sim-${browserCrypto.randomUUID()}`;
  }

  if (browserCrypto?.getRandomValues) {
    const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `sim-${token}`;
  }

  return `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function publicTestChatStorageKey(identifier: string) {
  return `${PUBLIC_TEST_CHAT_STORAGE_PREFIX}${identifier || "demo"}`;
}

function serializePublicTestMessages(messages: Message[]): StoredPublicTestMessage[] {
  return messages.slice(-PUBLIC_TEST_CHAT_MAX_STORED_MESSAGES).map((message) => ({
    ...message,
    timestamp: message.timestamp instanceof Date
      ? message.timestamp.toISOString()
      : new Date(message.timestamp).toISOString(),
  }));
}

function restorePublicTestMessages(messages: StoredPublicTestMessage[] | undefined): Message[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && typeof message.text === "string" && typeof message.id === "string")
    .slice(-PUBLIC_TEST_CHAT_MAX_STORED_MESSAGES)
    .map((message) => ({
      ...message,
      timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
    }));
}

function readPublicTestChatStorage(storageKey: string): PublicTestChatStorage | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PublicTestChatStorage;
    if (!parsed || typeof parsed.sessionId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePublicTestChatStorage(storageKey: string, value: PublicTestChatStorage) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private/locked-down browsers. The live chat still works.
  }
}

function removePublicTestChatStorage(storageKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Best effort cleanup.
  }
}

function canUsePublicTestServerSession(token?: string): boolean {
  return Boolean(
    token &&
    token !== "demo" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token),
  );
}

function restorePublicTestMessagesFromServer(messages: PublicTestSessionServerMessage[] | undefined): Message[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && typeof message.content === "string")
    .slice(-PUBLIC_TEST_CHAT_MAX_STORED_MESSAGES)
    .map((message, index) => ({
      id: message.id || `server-msg-${index}`,
      text: String(message.content || ""),
      fromMe: message.role !== "assistant",
      timestamp: message.createdAt ? new Date(message.createdAt) : new Date(),
      status: message.role === "assistant" ? "read" : "sent",
      mediaUrl: message.mediaUrl || undefined,
      mediaType: (
        message.mediaType === "image" ||
        message.mediaType === "video" ||
        message.mediaType === "audio" ||
        message.mediaType === "document"
      ) ? message.mediaType : undefined,
      mediaName: message.mediaName || undefined,
    }));
}

async function fetchPublicTestSession(params: { token?: string; userId?: string; sessionId: string }) {
  if (!canUsePublicTestServerSession(params.token)) return null;

  const searchParams = new URLSearchParams();
  searchParams.set("sessionId", params.sessionId);
  if (params.token) searchParams.set("token", params.token);
  if (params.userId) searchParams.set("userId", params.userId);

  const res = await fetch(`/api/test-agent/session?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

async function clearPublicTestSession(params: { token?: string; userId?: string; sessionId: string }) {
  if (!canUsePublicTestServerSession(params.token)) return;

  const searchParams = new URLSearchParams();
  searchParams.set("sessionId", params.sessionId);
  if (params.token) searchParams.set("token", params.token);
  if (params.userId) searchParams.set("userId", params.userId);

  await fetch(`/api/test-agent/session?${searchParams.toString()}`, {
    method: "DELETE",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  }).catch(() => null);
}

function waitForPublicTestRetry(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function sendPublicTestAgentMessageWithRetry(payload: PublicTestAgentMessagePayload) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= PUBLIC_TEST_AGENT_MESSAGE_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), PUBLIC_TEST_AGENT_MESSAGE_TIMEOUT_MS);
    try {
      const res = await fetch("/api/test-agent/message", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        return res.json();
      }

      const isRetriable =
        res.status === 408 ||
        res.status === 409 ||
        res.status === 425 ||
        res.status === 429 ||
        res.status >= 500;
      const responseText = await res.text().catch(() => "");
      lastError = new Error(`Falha no teste do agente (${res.status}) ${responseText}`.trim());

      if (!isRetriable || attempt === PUBLIC_TEST_AGENT_MESSAGE_MAX_ATTEMPTS) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      if (attempt === PUBLIC_TEST_AGENT_MESSAGE_MAX_ATTEMPTS) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new Error("Tempo esgotado no teste do agente");
        }
        throw error;
      }
    } finally {
      window.clearTimeout(timeoutId);
    }

    await waitForPublicTestRetry(700 * attempt);
  }

  throw lastError instanceof Error ? lastError : new Error("Falha ao consultar o agente de teste");
}

export default function TestAgent() {
  const { token } = useParams<{ token?: string }>();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentName, setAgentName] = useState("Agente IA");
  const [agentCompany, setAgentCompany] = useState("AgenteZap");
  const [invalidTokenMessage, setInvalidTokenMessage] = useState<string | null>(null);
  
  // 🔧 FIX: Ler userId da query string OU do path param
  const urlParams = new URLSearchParams(window.location.search);
  const userIdFromQuery = urlParams.get('userId');
  const [userId, setUserId] = useState<string | undefined>(userIdFromQuery || undefined);
  const simulatorSessionIdRef = useRef(createPublicTestSessionId());
  const storageIdentifier = useMemo(() => token || userIdFromQuery || userId || "demo", [token, userIdFromQuery, userId]);
  const chatStorageKey = useMemo(() => publicTestChatStorageKey(storageIdentifier), [storageIdentifier]);
  const [chatHydrated, setChatHydrated] = useState(false);
  const [serverChatHydrated, setServerChatHydrated] = useState(false);
  const autoStartedStorageKeyRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carregar informações do agente pelo token OU userId
  const { data: agentInfo } = useQuery({
    queryKey: ["/api/test-agent/info", token || userIdFromQuery],
    queryFn: async () => {
      // Prioridade: token do path, depois userId da query
      const identifier = token || userIdFromQuery;
      if (!identifier) return null;
      const res = await fetch(`/api/test-agent/info/${identifier}`);
      if (!res.ok) {
        if (res.status === 404) {
          const data = await res.json().catch(() => null);
          return {
            invalidToken: true,
            message:
              data?.message ||
              "Esse link de teste e invalido ou expirou. Peca um novo link para o administrador.",
          };
        }
        return null;
      }
      return res.json();
    },
    enabled: !!(token || userIdFromQuery),
  });

  useEffect(() => {
    if ((agentInfo as any)?.invalidToken) {
      setInvalidTokenMessage(
        (agentInfo as any)?.message ||
          "Esse link de teste e invalido ou expirou. Peca um novo link para o administrador.",
      );
      setMessages([]);
      setIsTyping(false);
      return;
    }

    setInvalidTokenMessage(null);
    if (agentInfo) {
      setAgentName(agentInfo.agentName || "Agente IA");
      setAgentCompany(agentInfo.company || "AgenteZap");
      if (agentInfo.userId) {
        setUserId(agentInfo.userId);
      }
    }
  }, [agentInfo]);

  useEffect(() => {
    setChatHydrated(false);
    setServerChatHydrated(false);
    const stored = readPublicTestChatStorage(chatStorageKey);
    simulatorSessionIdRef.current = stored?.sessionId || createPublicTestSessionId();
    const restoredMessages = restorePublicTestMessages(stored?.messages);
    setMessages(restoredMessages);
    setIsTyping(false);
    autoStartedStorageKeyRef.current = restoredMessages.length > 0 ? chatStorageKey : null;
    setChatHydrated(true);
  }, [chatStorageKey]);

  useEffect(() => {
    if (!chatHydrated) return;
    if (invalidTokenMessage) {
      setServerChatHydrated(true);
      return;
    }

    let cancelled = false;
    const sessionId = simulatorSessionIdRef.current;

    fetchPublicTestSession({
      token: token || undefined,
      userId,
      sessionId,
    }).then((data) => {
      if (cancelled || simulatorSessionIdRef.current !== sessionId) return;
      const serverMessages = restorePublicTestMessagesFromServer(data?.messages);
      if (serverMessages.length > 0) {
        setMessages(serverMessages);
        autoStartedStorageKeyRef.current = chatStorageKey;
        writePublicTestChatStorage(chatStorageKey, {
          version: 1,
          sessionId,
          messages: serializePublicTestMessages(serverMessages),
        });
      }
    }).finally(() => {
      if (!cancelled) setServerChatHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [chatHydrated, chatStorageKey, invalidTokenMessage, token, userId]);

  useEffect(() => {
    if (!chatHydrated || invalidTokenMessage) return;
    writePublicTestChatStorage(chatStorageKey, {
      version: 1,
      sessionId: simulatorSessionIdRef.current,
      messages: serializePublicTestMessages(messages),
    });
  }, [chatHydrated, chatStorageKey, invalidTokenMessage, messages]);

  // Scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Simular interação inicial do cliente ("oie")
  useEffect(() => {
    if (!chatHydrated || !serverChatHydrated || messages.length > 0 || autoStartedStorageKeyRef.current === chatStorageKey) {
      return;
    }
    if (invalidTokenMessage) {
      return;
    }
    autoStartedStorageKeyRef.current = chatStorageKey;
    const timer = setTimeout(() => {
      const initialUserMessage: Message = {
        id: `msg_init_user`,
        text: "oie",
        fromMe: true,
        timestamp: new Date(),
        status: 'sent',
      };
      setMessages([initialUserMessage]);
      setIsTyping(true);
      
      // Disparar resposta da IA
      sendMessageMutation.mutate("oie");
    }, 1000);
    return () => clearTimeout(timer);
  }, [chatHydrated, serverChatHydrated, chatStorageKey, invalidTokenMessage, messages.length]); // Executar apenas quando o link for valido

  // Mutation para enviar mensagem
  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      // V23g: Rastrear mídias já enviadas para evitar repetição
      const alreadySentMedias = messages
        .filter(m => !m.fromMe && m.mediaName)
        .map(m => m.mediaName!)
        .filter(Boolean);

      return sendPublicTestAgentMessageWithRetry({
        message: text,
        token: token || "demo",
        userId: userId,
        sessionId: simulatorSessionIdRef.current,
        history: messages.map(m => ({
          role: m.fromMe ? "user" : "assistant",
          content: m.text
        })),
        sentMedias: alreadySentMedias,
      });
    },
    onSuccess: (data) => {
      setIsTyping(false);
      
      const newMessages: Message[] = [];
      const mediaActions = Array.isArray(data.mediaActions) ? data.mediaActions : [];
      const textActions = mediaActions.filter((action: any) => action?.type === "send_text" && String(action.text || "").trim());
      
      // Se houver mídias para enviar, adicionar cada uma como mensagem separada
      if (mediaActions.length > 0) {
        console.log(`📁 Frontend recebeu ${mediaActions.length} mídia(s)`, mediaActions);
        for (const action of mediaActions) {
          if (action.type === "send_text" && String(action.text || "").trim()) {
            newMessages.push({
              id: `msg_${Date.now()}_${Math.random()}`,
              text: String(action.text).trim(),
              fromMe: false,
              timestamp: new Date(),
              status: 'read',
            });
          }
          if (action.type === 'send_media' && action.media_url) {
            newMessages.push({
              id: `msg_media_${Date.now()}_${Math.random()}`,
              text: '',
              mediaUrl: action.media_url,
              mediaType: action.media_type || 'image',
              mediaName: action.media_name || '', // V23g: guardar nome para dedup
              fromMe: false,
              timestamp: new Date(),
              status: 'read',
            });
          }
          if (action.type === 'send_media_url' && action.media_url) {
            newMessages.push({
              id: `msg_media_${Date.now()}_${Math.random()}`,
              text: '',
              mediaUrl: action.media_url,
              mediaType: action.media_type || 'image',
              mediaName: action.media_name || '',
              fromMe: false,
              timestamp: new Date(),
              status: 'read',
            });
          }
        }
      }
      
      // Adicionar resposta de texto do agente - V22: suporte a bolhas separadas
      if (data.splitResponses && Array.isArray(data.splitResponses) && data.splitResponses.length > 1) {
        // Múltiplas bolhas da IA
        for (const part of data.splitResponses) {
          if (part.trim()) {
            newMessages.push({
              id: `msg_${Date.now()}_${Math.random()}`,
              text: part.trim(),
              fromMe: false,
              timestamp: new Date(),
              status: 'read',
            });
          }
        }
      } else if (textActions.length === 0 && typeof data.response === 'string' && data.response.trim()) {
        newMessages.push({
          id: `msg_${Date.now()}`,
          text: data.response,
          fromMe: false,
          timestamp: new Date(),
          status: 'read',
        });
      }
      
      setMessages(prev => [...prev, ...newMessages]);
    },
    onError: () => {
      setIsTyping(false);
      const errorMessage: Message = {
        id: `msg_${Date.now()}`,
        text: "Tive uma instabilidade no teste. Mande a mensagem de novo que eu continuo daqui.",
        fromMe: false,
        timestamp: new Date(),
        status: 'read',
      };
      setMessages(prev => [...prev, errorMessage]);
    },
  });

  const handleSend = () => {
    if (!inputText.trim() || sendMessageMutation.isPending || invalidTokenMessage) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      text: inputText.trim(),
      fromMe: true,
      timestamp: new Date(),
      status: 'sent',
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText("");
    setIsTyping(true);

    // Delay para simular "digitando..."
    setTimeout(() => {
      sendMessageMutation.mutate(userMessage.text);
    }, 500);
  };

  const handleClearChat = () => {
    const previousSessionId = simulatorSessionIdRef.current;
    clearPublicTestSession({
      token: token || undefined,
      userId,
      sessionId: previousSessionId,
    });
    removePublicTestChatStorage(chatStorageKey);
    simulatorSessionIdRef.current = createPublicTestSessionId();
    autoStartedStorageKeyRef.current = chatStorageKey;
    setMessages([]);
    setInputText("");
    setIsTyping(false);
    sendMessageMutation.reset();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const MessageStatus = ({ status }: { status: Message['status'] }) => {
    if (status === 'sending') return <Loader2 className="w-3 h-3 animate-spin text-gray-400" />;
    if (status === 'sent') return <Check className="w-3 h-3 text-gray-400" />;
    if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-gray-400" />;
    if (status === 'read') return <CheckCheck className="w-3 h-3 text-blue-500" />;
    return null;
  };

  return (
    <div className="fixed inset-0 flex flex-col h-[100dvh] bg-gray-100 max-w-md mx-auto border-x border-gray-200 shadow-xl">
      {/* Header */}
      <div className="bg-[#008069] text-white p-4 flex items-center gap-3 shadow-sm z-10 flex-none">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-lg">{agentCompany}</h1>
          <p className="text-xs text-white/80">Online</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClearChat}
          className="h-10 w-10 rounded-full text-white/80 hover:bg-white/10 hover:text-white"
          title="Limpar conversa"
          aria-label="Limpar conversa"
        >
          <Trash2 className="h-5 w-5" />
        </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#efeae2] bg-opacity-50" style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')", backgroundBlendMode: "overlay" }}>
        {invalidTokenMessage && (
          <div className="flex justify-center pt-8">
            <div className="max-w-[90%] rounded-lg bg-white p-4 shadow-sm text-center">
              <p className="text-sm font-medium text-gray-900">Link invalido ou expirado</p>
              <p className="mt-2 text-sm text-gray-600">{invalidTokenMessage}</p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex w-full",
              msg.fromMe ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg p-3 shadow-sm relative",
                msg.fromMe ? "bg-[#d9fdd3] rounded-tr-none" : "bg-white rounded-tl-none"
              )}
            >
              {msg.mediaUrl && (
                  <div className="mb-2">
                    {msg.mediaType === 'image' && (
                      <img 
                        src={msg.mediaUrl} 
                        alt="Imagem"
                        className="max-w-full rounded-lg object-cover"
                        style={{ maxHeight: '300px' }}
                      />
                    )}
                    {msg.mediaType === 'audio' && (
                      <div className="flex items-center gap-2 bg-[#F0F2F5] rounded-lg p-2 min-w-[200px]">
                        <audio 
                          src={msg.mediaUrl} 
                          controls 
                          controlsList="nodownload"
                          className="w-full"
                          style={{
                            height: '32px',
                            accentColor: '#00A884'
                          }}
                        />
                      </div>
                    )}
                    {msg.mediaType === 'video' && (
                      <video controls className="max-w-full rounded-lg bg-black" src={msg.mediaUrl} style={{ maxHeight: '300px' }} />
                    )}
                    {msg.mediaType === 'document' && (
                      <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" 
                         className="flex items-center gap-2 bg-[#F0F2F5] rounded-lg p-3 text-sm text-gray-700 hover:bg-gray-200 transition-colors">
                        <span className="text-xl">📄</span>
                        <span className="flex-1 truncate">Abrir documento</span>
                        <span className="text-blue-600 text-xs">Baixar</span>
                      </a>
                    )}
                  </div>
              )}

              <p
                className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed"
                dangerouslySetInnerHTML={{ __html: formatWhatsAppTextForHtml(msg.text) }}
              />
              <span className="text-[10px] text-gray-500 block text-right mt-1">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {msg.fromMe && <span className="ml-1 text-blue-500">✓✓</span>}
              </span>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white rounded-lg p-3 rounded-tl-none shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#008069]" />
              <span className="text-xs text-gray-500">Digitando...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-[#f0f2f5] p-3 flex items-center gap-2 flex-none">
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-500 hover:bg-gray-200 rounded-full"
        >
          <Smile className="w-6 h-6" />
        </Button>
        
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={invalidTokenMessage ? "Solicite um novo link ao administrador" : "Digite uma mensagem"}
          className="flex-1 bg-white border-none focus-visible:ring-0 rounded-lg"
          disabled={Boolean(invalidTokenMessage)}
        />
        
        <Button
          onClick={handleSend}
          size="icon"
          className={cn(
            "rounded-full transition-all",
            inputText.trim() ? "bg-[#008069] hover:bg-[#006d59]" : "bg-gray-300 hover:bg-gray-400"
          )}
          disabled={!inputText.trim() || Boolean(invalidTokenMessage)}
        >
          {inputText.trim() ? <Send className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
        </Button>
      </div>
    </div>
  );
}
