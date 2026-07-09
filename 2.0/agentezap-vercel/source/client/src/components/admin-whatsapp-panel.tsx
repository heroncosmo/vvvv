import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, QrCode, CheckCircle2, XCircle, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AdminWhatsAppSimulator from "@/components/admin-whatsapp-simulator";
import { openAppRealtimeConnection, type AppRealtimeConnection } from "@/lib/app-realtime";

interface AdminWhatsappConnection {
  id?: string;
  adminId?: string;
  phoneNumber?: string;
  isConnected: boolean;
  qrCode?: string;
  _devMode?: boolean;
}

interface AdminSession {
  authenticated: boolean;
  adminId: string;
  adminRole?: string;
}

interface AdminConversationSummary {
  id: string;
}

// Configurações de reconexão
const WS_RECONNECT_INTERVAL = 3000; // 3 segundos inicial
const WS_MAX_RECONNECT_INTERVAL = 30000; // 30 segundos máximo
const WS_PING_INTERVAL = 25000; // Ping a cada 25 segundos
const WS_MAX_RECONNECT_ATTEMPTS = 10; // Máximo de tentativas

export default function AdminWhatsappPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  
  // Refs para gerenciamento de reconexão
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const realtimeConnectionRef = useRef<AppRealtimeConnection | null>(null);
  const isReconnectingRef = useRef(false);
  const lastPongRef = useRef<number>(Date.now());
  const isManualCloseRef = useRef(false);
  const connectWebSocketRef = useRef<() => void>(() => {});
  const connectionGenerationRef = useRef(0);

  // Buscar sessão do admin para obter o adminId real
  const { data: adminSession } = useQuery<AdminSession>({
    queryKey: ["/api/admin/session"],
  });

  // Buscar status da conexão
  const { data: connection, isLoading, refetch: refetchConnection } = useQuery<AdminWhatsappConnection>({
    queryKey: ["/api/admin/whatsapp/connection"],
    refetchInterval: 15000, // Atualizar a cada 15 segundos
    refetchIntervalInBackground: false,
  });

  const { data: adminConversations = [] } = useQuery<AdminConversationSummary[]>({
    queryKey: ["/api/admin/conversations"],
    refetchInterval: 10000,
  });

  // Calcular delay de reconexão com backoff exponencial
  const getReconnectDelay = useCallback(() => {
    const delay = Math.min(
      WS_RECONNECT_INTERVAL * Math.pow(1.5, reconnectAttemptsRef.current),
      WS_MAX_RECONNECT_INTERVAL
    );
    return delay;
  }, []);

  // Limpar timers e recursos
  const cleanupWebSocket = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (realtimeConnectionRef.current) {
      const currentConnection = realtimeConnectionRef.current;
      realtimeConnectionRef.current = null;
      void currentConnection.close();
    }
    setWsConnected(false);
  }, []);

  // Iniciar ping para manter conexão viva
  const startPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    
    pingIntervalRef.current = setInterval(() => {
      const realtimeConnection = realtimeConnectionRef.current;
      if (realtimeConnection?.provider === "ws" && realtimeConnection.send) {

        const timeSinceLastPong = Date.now() - lastPongRef.current;
        if (timeSinceLastPong > WS_PING_INTERVAL * 2) {
          console.log(`[WS] Nenhuma atividade há ${Math.round(timeSinceLastPong/1000)}s, forçando reconexão`);
          isManualCloseRef.current = false;
          cleanupWebSocket();
          scheduleReconnect();
          return;
        }
        
        try {
          realtimeConnection.send({ type: 'ping', timestamp: Date.now() });
        } catch (err) {
          console.log('[WS] Erro ao enviar ping:', err);
          isManualCloseRef.current = false;
          cleanupWebSocket();
          scheduleReconnect();
        }
      }
    }, WS_PING_INTERVAL);
  }, [cleanupWebSocket]);

  // Agendar reconexão
  const scheduleReconnect = useCallback(() => {
    if (isReconnectingRef.current) return;
    if (reconnectAttemptsRef.current >= WS_MAX_RECONNECT_ATTEMPTS) {
      console.log('[WS] Máximo de tentativas de reconexão atingido');
      toast({
        title: "Conexão instável",
        description: "Não foi possível manter a conexão em tempo real. Recarregue a página para tentar novamente.",
        variant: "destructive",
      });
      return;
    }

    isReconnectingRef.current = true;
    const delay = getReconnectDelay();
    
    console.log(`[WS] Agendando reconexão em ${Math.round(delay/1000)}s (tentativa ${reconnectAttemptsRef.current + 1}/${WS_MAX_RECONNECT_ATTEMPTS})`);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttemptsRef.current++;
      isReconnectingRef.current = false;
      connectWebSocketRef.current();
    }, delay);
  }, [getReconnectDelay, toast]);

  // Conectar WebSocket
  const connectWebSocket = useCallback(() => {
    const connectionGeneration = ++connectionGenerationRef.current;

    // Limpar qualquer conexão existente primeiro
    isManualCloseRef.current = true;
    cleanupWebSocket();
    
    // Obter adminId da sessão
    if (!adminSession?.adminId) {
      console.log('[WS] Admin ID não disponível, pulando conexão');
      return;
    }

    // 🛡️ MODO DESENVOLVIMENTO: Não conectar se estiver em dev mode
    if (connection?._devMode) {
      console.log('[WS] Modo desenvolvimento detectado, pulando WebSocket');
      return;
    }

    const adminId = adminSession.adminId;

    console.log(`[WS] Conectando realtime admin com adminId: ${adminId}`);
    
    void (async () => {
      try {
        const realtimeConnection = await openAppRealtimeConnection({
          scope: "admin",
          adminId,
          onOpen: () => {
            console.log(`[WS] Admin realtime conectado com sucesso`);
            setWsConnected(true);
            lastPongRef.current = Date.now();
            reconnectAttemptsRef.current = 0;
            isReconnectingRef.current = false;
            isManualCloseRef.current = false;
          },
          onEvent: (data) => {
            if (data.type === 'pong') {
              lastPongRef.current = Date.now();
              return;
            }

            if (data.type === 'ping') {
              lastPongRef.current = Date.now();
              return;
            }

            console.log("[WS] Admin WebSocket message:", data.type);

            if (data.type === 'qr') {
              console.log("[WS] QR Code recebido!");
              setQrCode(data.qr);
              setIsConnecting(false);
            } else if (data.type === 'connecting') {
              console.log("[WS] WhatsApp conectando...");
              setQrCode(null);
              setIsConnecting(true);
              toast({
                title: "Conectando...",
                description: "Aguarde enquanto estabelecemos a conexão",
              });
            } else if (data.type === 'connected') {
              setQrCode(null);
              setIsConnecting(false);
              toast({
                title: "WhatsApp conectado!",
                description: `Número: ${data.phoneNumber}`,
              });
              queryClient.invalidateQueries({ queryKey: ["/api/admin/whatsapp/connection"] });
            } else if (data.type === 'disconnected') {
              setQrCode(null);
              setIsConnecting(false);
              queryClient.invalidateQueries({ queryKey: ["/api/admin/whatsapp/connection"] });
              
              if (data.reason === 'logout') {
                toast({
                  title: "WhatsApp desconectado",
                  description: "Você foi desconectado. Clique em Conectar para gerar um novo QR Code.",
                });
              }
            }
          },
          onError: (error) => {
            console.error("[WS] Erro no realtime:", error);
            setWsConnected(false);
          },
          onClose: () => {
            console.log("[WS] Admin realtime desconectado");
            setWsConnected(false);
            
            if (pingIntervalRef.current) {
              clearInterval(pingIntervalRef.current);
              pingIntervalRef.current = null;
            }

            if (connectionGenerationRef.current === connectionGeneration) {
              realtimeConnectionRef.current = null;
            }
            
            if (!isManualCloseRef.current) {
              scheduleReconnect();
            }
          },
        });

        if (!realtimeConnection) {
          setWsConnected(false);
          isManualCloseRef.current = false;
          scheduleReconnect();
          return;
        }

        if (connectionGenerationRef.current !== connectionGeneration) {
          void realtimeConnection.close();
          return;
        }

        realtimeConnectionRef.current = realtimeConnection;
        if (realtimeConnection.provider === "ws") {
          startPingInterval();
        } else if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
      } catch (error) {
        console.error('[WS] Erro ao criar realtime:', error);
        setWsConnected(false);
        isManualCloseRef.current = false;
        scheduleReconnect();
      }
    })();
  }, [adminSession?.adminId, connection?._devMode, cleanupWebSocket, startPingInterval, scheduleReconnect, queryClient, toast]);

  // Keep ref in sync so scheduleReconnect always calls the latest version
  connectWebSocketRef.current = connectWebSocket;

  // Efeito para conectar WebSocket quando tivermos o adminId
  useEffect(() => {
    if (!adminSession?.adminId) return;

    // Conectar imediatamente
    connectWebSocket();

    // Cleanup ao desmontar
    return () => {
      isManualCloseRef.current = true;
      cleanupWebSocket();
    };
  }, [adminSession?.adminId, connectWebSocket, cleanupWebSocket]);

  // NOTE: Removed the useEffect that killed the panel WebSocket when polling returned
  // isConnected: false. The panel WebSocket (real-time updates) and WhatsApp Baileys
  // connection are independent. Killing the panel WS based on polling caused a rapid
  // connect/disconnect cycle. The WebSocket's own onclose handler + scheduleReconnect
  // is sufficient for reconnection.

  // Mutation para conectar
  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/whatsapp/connect", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao conectar WhatsApp");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Conectando WhatsApp",
        description: "Aguarde o QR Code aparecer...",
      });
      setIsConnecting(true);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/whatsapp/connection"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao conectar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para desconectar
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/whatsapp/disconnect", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao desconectar WhatsApp");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "WhatsApp desconectado",
        description: "Sua conexão foi encerrada com sucesso.",
      });
      setQrCode(null);
      setIsConnecting(false);
      // Fechar WebSocket manualmente
      isManualCloseRef.current = true;
      cleanupWebSocket();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/whatsapp/connection"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao desconectar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                WhatsApp do Administrador
              </CardTitle>
              <CardDescription>
                Conecte seu WhatsApp para enviar mensagens de boas-vindas aos novos clientes
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Indicador de status do WebSocket */}
              <Badge
                variant={wsConnected ? "default" : "secondary"}
                className={`flex items-center gap-1 ${wsConnected ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-gray-100 text-gray-600'}`}
              >
                {wsConnected ? (
                  <>
                    <Wifi className="w-3 h-3" />
                    Real-time
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3" />
                    Polling
                  </>
                )}
              </Badge>
              {/* Indicador de reconexão automática */}
              {!connection?.isConnected && !wsConnected && reconnectAttemptsRef.current > 0 && (
                <Badge variant="outline" className="flex items-center gap-1 bg-amber-50 text-amber-700 border-amber-200">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Reconectando...
                </Badge>
              )}
              {connection?.isConnected ? (
                <Badge variant="default" className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <XCircle className="w-3 h-3" />
                  Desconectado
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium">IA de resposta automática e follow-up do admin estão desativados.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Este painel permanece apenas com conexão, simulador e opções manuais/convencionais de envio.
            </p>
          </div>

          {connection?.isConnected ? (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">Número conectado:</p>
                <p className="text-lg font-semibold">{connection.phoneNumber || "Carregando..."}</p>
              </div>
              {/* Status da conexão real-time */}
              <div className={`flex items-center gap-2 text-xs ${wsConnected ? 'text-green-600' : 'text-amber-600'}`}>
                <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                {wsConnected
                  ? `Conexão em tempo real ativa (tentativas: ${reconnectAttemptsRef.current})`
                  : reconnectAttemptsRef.current > 0
                    ? `Reconexão automática em andamento (tentativa ${reconnectAttemptsRef.current}/${WS_MAX_RECONNECT_ATTEMPTS})`
                    : 'Usando polling a cada 5s'}
              </div>
              <Button
                variant="destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="w-full"
              >
                {disconnectMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Desconectando...
                  </>
                ) : (
                  "Desconectar WhatsApp"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {isConnecting ? (
                <div className="flex flex-col items-center space-y-4 p-8">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  <div className="text-center space-y-2">
                    <p className="text-lg font-semibold">Conectando...</p>
                    <p className="text-sm text-muted-foreground">
                      Aguarde enquanto estabelecemos a conexão com o WhatsApp
                    </p>
                  </div>
                  {/* Status da conexão */}
                  <div className={`flex items-center gap-2 text-xs ${wsConnected ? 'text-green-600' : 'text-amber-600'}`}>
                    <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                    {wsConnected
                      ? 'Conexão em tempo real ativa'
                      : reconnectAttemptsRef.current > 0
                        ? `Reconexão automática em andamento (tentativa ${reconnectAttemptsRef.current}/${WS_MAX_RECONNECT_ATTEMPTS})`
                        : 'Reconectando para atualizações em tempo real...'}
                  </div>
                </div>
              ) : qrCode ? (
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-full p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-semibold text-sm mb-2 text-blue-900">Como conectar seu WhatsApp:</h4>
                    <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                      <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
                      <li>Toque em <strong>Menu</strong> (⋮) ou <strong>Configurações</strong></li>
                      <li>Toque em <strong>Aparelhos conectados</strong></li>
                      <li>Toque em <strong>Conectar um aparelho</strong></li>
                      <li>Aponte a câmera do celular para este QR Code</li>
                    </ol>
                  </div>
                  <div className="p-4 bg-white border-2 border-gray-200 rounded-lg shadow-sm">
                    <img src={qrCode} alt="QR Code" className="w-64 h-64" />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium flex items-center justify-center gap-2 text-primary">
                      <QrCode className="w-4 h-4" />
                      Escaneie o QR Code acima
                    </p>
                    {/* Status da conexão */}
                    <div className={`flex items-center gap-2 text-xs ${wsConnected ? 'text-green-600' : 'text-amber-600'}`}>
                      <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                      {wsConnected
                        ? 'Atualizações em tempo real ativas'
                        : 'Reconectando para atualizações em tempo real...'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Button
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                    className="w-full"
                  >
                    {connectMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Conectando...
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Conectar WhatsApp
                      </>
                    )}
                  </Button>
                  {/* Status da conexão */}
                  <div className={`flex items-center justify-center gap-2 text-xs ${wsConnected ? 'text-green-600' : 'text-amber-600'}`}>
                    <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                    {wsConnected
                      ? 'Conexão em tempo real ativa'
                      : reconnectAttemptsRef.current > 0
                        ? `Reconexão automática em andamento (tentativa ${reconnectAttemptsRef.current}/${WS_MAX_RECONNECT_ATTEMPTS})`
                        : 'Conectando para atualizações em tempo real...'}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Conversas do Agente
          </CardTitle>
          <CardDescription>
            Acompanhe todas as conversas da IA com clientes, limpe histórico e exclua contas de teste para validar novamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Conversas registradas: <span className="font-semibold text-foreground">{adminConversations.length}</span>
          </div>
          <Button
            onClick={() => {
              window.location.hash = "#conversations";
              window.dispatchEvent(new CustomEvent("admin-tab-change", { detail: "conversations" }));
            }}
          >
            Abrir painel de conversas
          </Button>
        </CardContent>
      </Card>

      <AdminWhatsAppSimulator />
    </div>
  );
}
