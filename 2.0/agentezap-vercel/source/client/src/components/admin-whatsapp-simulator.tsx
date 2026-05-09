import { useEffect, useRef, useState } from "react";
import { Bot, Copy, ExternalLink, ImageIcon, Loader2, RefreshCw, Send, Trash2, User, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatWhatsAppTextForHtml } from "@/lib/whatsapp-format";

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  mediaActions?: TestMediaAction[];
};

type SimulatorCredentials = {
  email: string;
  password?: string | null;
  loginUrl: string;
  simulatorToken?: string | null;
  simulatorLink?: string | null;
};

type DemoAssets = {
  screenshotUrl?: string | null;
  videoUrl?: string | null;
  error?: string | null;
};

type TestMediaAction = {
  type: string;
  media_name?: string;
  text?: string;
  media_url?: string;
  media_type?: "image" | "video" | "audio" | "document";
  mediaData?: {
    storageUrl?: string;
    mediaType?: "image" | "video" | "audio" | "document";
  };
};

type TestResponse = {
  response: string | null;
  skipped?: boolean;
  reason?: string;
  testLink?: string | null;
  credentials?: SimulatorCredentials | null;
  demoAssets?: DemoAssets | null;
  mediaActions?: TestMediaAction[];
};

type HistoryResponse = {
  history?: HistoryMessage[];
  flowState?: string | null;
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function parseFlowStateLabel(flowState?: string | null): string {
  if (!flowState) return "Sem estado";
  switch (flowState) {
    case "onboarding":
      return "Onboarding";
    case "test_mode":
      return "Teste";
    case "post_test":
      return "Pos teste";
    case "payment_pending":
      return "Pagamento";
    case "active":
      return "Ativo";
    default:
      return flowState;
  }
}

export default function AdminWhatsAppSimulator() {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState("5511999999999");
  const [contactName, setContactName] = useState("Cliente WhatsApp");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [flowState, setFlowState] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [latestLink, setLatestLink] = useState<string | null>(null);
  const [latestCredentials, setLatestCredentials] = useState<SimulatorCredentials | null>(null);
  const [latestDemoAssets, setLatestDemoAssets] = useState<DemoAssets | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchHistory = async (targetPhone?: string) => {
    const cleanPhone = (targetPhone || phoneNumber).replace(/\D/g, "");
    if (!cleanPhone) {
      setMessages([]);
      setFlowState(null);
      return;
    }

    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/admin/agent/test/history?phoneNumber=${cleanPhone}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Falha ao carregar historico");
      }

      const data = (await res.json()) as HistoryResponse;
      const history = Array.isArray(data.history) ? data.history : [];

      setFlowState(data.flowState || null);
      setMessages(
        history.map((msg, index) => ({
          id: `history-${index}-${msg.timestamp}`,
          role: msg.role,
          text: msg.content,
          timestamp: new Date(msg.timestamp),
        })),
      );
    } catch (error) {
      console.error("[ADMIN SIM] Erro ao buscar historico:", error);
      toast({
        title: "Erro ao carregar historico",
        description: "Nao foi possivel carregar as mensagens salvas dessa simulacao.",
        variant: "destructive",
      });
    } finally {
      setLoadingHistory(false);
    }
  };

  const resetSimulation = async (deleteTestAccount = false) => {
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    if (!cleanPhone) return;

    if (deleteTestAccount) {
      const confirmReset = window.confirm(
        "Isso vai limpar a sessao e tentar apagar a conta de teste desse telefone. Deseja continuar?",
      );
      if (!confirmReset) return;
    }

    try {
      const res = await fetch("/api/admin/agent/test/reset", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: cleanPhone, deleteTestAccount }),
      });
      if (!res.ok) throw new Error("Falha ao resetar simulacao");

      setMessages([]);
      setFlowState(null);
      setLatestLink(null);
      setLatestCredentials(null);
      setLatestDemoAssets(null);
      toast({
        title: deleteTestAccount ? "Sessao e conta resetadas" : "Sessao resetada",
        description: deleteTestAccount
          ? "Conta de teste removida e conversa reiniciada do zero."
          : "Historico da simulacao limpo com sucesso.",
      });
    } catch (error) {
      console.error("[ADMIN SIM] Erro ao resetar:", error);
      toast({
        title: "Erro ao resetar",
        description: "Nao foi possivel resetar a simulacao agora.",
        variant: "destructive",
      });
    }
  };

  const sendMessage = async (forcedText?: string) => {
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    const text = (forcedText ?? input).trim();
    if (!cleanPhone || !text || sending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!forcedText) {
      setInput("");
    }
    setSending(true);

    try {
      const res = await fetch("/api/admin/agent/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          phoneNumber: cleanPhone,
          contactName: contactName.trim() || undefined,
          testTrigger: false,
        }),
      });
      if (!res.ok) {
        throw new Error("Falha ao enviar mensagem de teste");
      }

      const data = (await res.json()) as TestResponse;
      const assistantText =
        data.response ||
        data.reason ||
        "Mensagem recebida, mas nao houve resposta do agente neste passo.";

      const resolvedMediaActions = Array.isArray(data.mediaActions) ? data.mediaActions : [];
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: assistantText,
          timestamp: new Date(),
          mediaActions: resolvedMediaActions.length > 0 ? resolvedMediaActions : undefined,
        },
      ]);

      if (data.testLink) setLatestLink(data.testLink);
      if (data.credentials) {
        setLatestCredentials(data.credentials);
        if (data.credentials.simulatorLink) setLatestLink(data.credentials.simulatorLink);
      }
      if (data.demoAssets) {
        setLatestDemoAssets(data.demoAssets);
      }
      if (Array.isArray(data.mediaActions)) {
        const screenshotFromMedia = data.mediaActions.find(
          (action) => action.mediaData?.mediaType === "image" && action.mediaData?.storageUrl,
        )?.mediaData?.storageUrl;
        const videoFromMedia = data.mediaActions.find(
          (action) => action.mediaData?.mediaType === "video" && action.mediaData?.storageUrl,
        )?.mediaData?.storageUrl;
        if (screenshotFromMedia || videoFromMedia) {
          setLatestDemoAssets((prev) => ({
            screenshotUrl: screenshotFromMedia || prev?.screenshotUrl || null,
            videoUrl: videoFromMedia || prev?.videoUrl || null,
            error: null,
          }));
        }
      }

      // Sync flowState from server without overwriting messages (which carry mediaActions)
      try {
        const histRes = await fetch(`/api/admin/agent/test/history?phoneNumber=${cleanPhone}`, {
          credentials: "include",
        });
        if (histRes.ok) {
          const histData = (await histRes.json()) as HistoryResponse;
          setFlowState(histData.flowState || null);
        }
      } catch {
        // ignore - flowState sync is best-effort
      }
    } catch (error) {
      console.error("[ADMIN SIM] Erro ao enviar mensagem:", error);
      toast({
        title: "Erro no simulador",
        description: "Nao foi possivel processar a mensagem agora.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copiado", description: successMessage });
    } catch (error) {
      console.error("[ADMIN SIM] Falha ao copiar:", error);
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          Simulador do Agente no WhatsApp
        </CardTitle>
        <CardDescription>
          Teste o fluxo real de criacao e edicao de agente como se fosse um cliente no WhatsApp.
        </CardDescription>

        <div className="grid gap-2 md:grid-cols-3">
          <Input
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            onBlur={() => void fetchHistory()}
            placeholder="Telefone de teste (com DDI)"
          />
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Nome do contato no WhatsApp"
          />

          <div className="flex gap-2">
            <Button variant="outline" className="w-full" onClick={() => void fetchHistory()} disabled={loadingHistory}>
              {loadingHistory ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Atualizar
            </Button>
            <Button variant="outline" className="w-full" onClick={() => void resetSimulation(false)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Limpar
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary">Estado: {parseFlowStateLabel(flowState)}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {(latestLink || latestCredentials || latestDemoAssets) && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-600">Conta pronta</Badge>
              {latestLink && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void copyText(latestLink, "Link do simulador copiado.")}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copiar Link
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(latestLink, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Abrir
                  </Button>
                </>
              )}
            </div>

            {latestLink && <div className="break-all text-emerald-900">{latestLink}</div>}

            {latestCredentials && (
              <div className="space-y-1 text-emerald-900">
                <div>Email: {latestCredentials.email}</div>
                {latestCredentials.password ? (
                  <div>Senha: {latestCredentials.password}</div>
                ) : (
                  <div>Senha: mantem a senha atual do cliente.</div>
                )}
                <div>Login: {latestCredentials.loginUrl}/login</div>
                <div>Painel: {latestCredentials.loginUrl}/meu-agente-ia</div>
              </div>
            )}

            {latestDemoAssets && (
              <div className="space-y-2 rounded border border-emerald-200 bg-white/70 p-2 text-emerald-950">
                <div className="text-xs font-semibold">Demonstracao automatica</div>

                {latestDemoAssets.screenshotUrl && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <ImageIcon className="w-3 h-3" />
                      <span>Print</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void copyText(latestDemoAssets.screenshotUrl!, "Link do print copiado.")}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copiar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(latestDemoAssets.screenshotUrl!, "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Abrir
                      </Button>
                    </div>
                    <img src={latestDemoAssets.screenshotUrl} alt="Print da demo" className="max-h-40 rounded border" />
                  </div>
                )}

                {latestDemoAssets.videoUrl && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Video className="w-3 h-3" />
                      <span>Video</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void copyText(latestDemoAssets.videoUrl!, "Link do video copiado.")}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copiar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(latestDemoAssets.videoUrl!, "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Abrir
                      </Button>
                    </div>
                    <video src={latestDemoAssets.videoUrl} controls className="max-h-40 w-full rounded border bg-black" />
                  </div>
                )}

                {latestDemoAssets.error && <div className="text-xs text-red-700">Erro: {latestDemoAssets.error}</div>}
              </div>
            )}

            <div className="pt-1">
              <Button size="sm" variant="outline" onClick={() => void resetSimulation(true)}>
                Resetar conta de teste
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-muted/20 p-3 h-[360px] overflow-y-auto space-y-3">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-4">
              Envie uma mensagem para comecar. O fluxo usa o mesmo motor do WhatsApp real do admin.
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 shadow-sm ${
                  msg.role === "user" ? "bg-emerald-100 text-emerald-950" : "bg-white text-foreground"
                }`}
              >
                <div className="flex items-center gap-1 mb-1 text-[11px] opacity-70">
                  {msg.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                  <span>{msg.role === "user" ? "Cliente" : "Agente"}</span>
                </div>
                <p
                  className="whitespace-pre-wrap text-sm"
                  dangerouslySetInnerHTML={{ __html: formatWhatsAppTextForHtml(msg.text) }}
                />
                {msg.mediaActions && msg.mediaActions.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.mediaActions.map((action, idx) => {
                      if (action.type === "send_text" && action.text) {
                        return (
                          <div key={idx} className="rounded-lg border bg-emerald-50 px-3 py-2 text-sm whitespace-pre-wrap text-emerald-900">
                            {action.text}
                          </div>
                        );
                      }

                      const url = action.mediaData?.storageUrl || action.media_url;
                      const mType = action.mediaData?.mediaType || action.media_type;
                      if (!url) return null;
                      return (
                        <div key={idx} className="rounded-lg overflow-hidden border bg-gray-50 p-1">
                          <div className="text-[10px] font-medium text-emerald-700 mb-1 px-1">
                            📎 {action.media_name || "Mídia"}
                          </div>
                          {mType === "audio" && (
                            <audio controls className="w-full h-8" src={url}>
                              Seu navegador não suporta áudio.
                            </audio>
                          )}
                          {mType === "image" && (
                            <img src={url} alt={action.media_name || "Imagem"} className="max-h-40 w-full object-contain rounded" />
                          )}
                          {mType === "video" && (
                            <video controls className="max-h-40 w-full rounded bg-black" src={url} />
                          )}
                          {mType === "document" && (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline px-1">
                              📄 Baixar documento
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-1 text-[10px] opacity-60 text-right">{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-xl bg-white px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Agente digitando...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void sendMessage("Me envia um print e um video da demonstracao do meu agente funcionando.")}
            disabled={sending}
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            Gerar print e video
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite a mensagem do cliente..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendMessage();
              }
            }}
          />
          <Button onClick={() => void sendMessage()} disabled={sending || !input.trim()}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
