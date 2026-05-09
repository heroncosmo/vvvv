import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MessageCircle, Users, CheckCircle, Clock, Bot, AlertCircle, Sparkles, Smartphone, ChevronRight, Zap } from "lucide-react";
import type { WhatsappConnection, AiAgentConfig } from "@shared/schema";
import { UsageLimitBanner } from "@/components/usage-limit-banner";
import { useLocation } from "wouter";

interface DashboardStatsProps {
  connection?: WhatsappConnection;
}

interface Stats {
  totalConversations: number;
  unreadMessages: number;
  todayMessages: number;
  agentMessages: number;
}

export function DashboardStats({ connection }: DashboardStatsProps) {
  const [, setLocation] = useLocation();
  
  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    staleTime: 30000, // Cache 30s - dados estatísticos não precisam ser real-time
    refetchInterval: 60000, // Atualizar a cada 60s
  });

  const { data: agentConfig } = useQuery<AiAgentConfig | null>({
    queryKey: ["/api/agent/config"],
    staleTime: 60000,
  });

  // Calcular progresso de configuração estilo Shopify
  const setupSteps = [
    { 
      id: 1, 
      title: "Conectar WhatsApp", 
      done: !!connection?.isConnected,
      action: () => setLocation("/conexao"),
      icon: Smartphone
    },
    { 
      id: 2, 
      title: "Configurar Agente IA", 
      done: !!agentConfig?.prompt && agentConfig.prompt.length > 50,
      action: () => setLocation("/meu-agente-ia"),
      icon: Bot
    },
    { 
      id: 3, 
      title: "Ativar o Agente", 
      done: !!agentConfig?.isActive,
      action: () => setLocation("/meu-agente-ia"),
      icon: Zap
    },
  ];
  
  const completedSteps = setupSteps.filter(s => s.done).length;
  const progressPercent = (completedSteps / setupSteps.length) * 100;
  const allSetupComplete = completedSteps === setupSteps.length;

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto p-4 md:p-8 space-y-4 md:space-y-8 pb-24 md:pb-8">
        <div className="space-y-1 md:space-y-2">
          <h1 className="text-xl md:text-3xl font-bold">Dashboard</h1>
          <p className="text-xs md:text-base text-muted-foreground">
            Visão geral das suas conversas no WhatsApp
          </p>
        </div>

        {/* Usage Limit Banner - shows for free trial users */}
        <UsageLimitBanner />

        {/* Guia de Configuração Estilo Shopify - Mostra se setup incompleto */}
        {!allSetupComplete && (
          <Card className="p-4 md:p-6 border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                    Prepare-se para vender
                  </h2>
                  <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                    Use este guia para lançar seu agente
                  </p>
                </div>
                <span className="text-xs md:text-sm text-muted-foreground font-medium">
                  {completedSteps} de {setupSteps.length} tarefas
                </span>
              </div>
              
              <Progress value={progressPercent} className="h-2" />
              
              <div className="space-y-2">
                {setupSteps.map((step) => (
                  <button
                    key={step.id}
                    onClick={step.action}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      step.done 
                        ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
                        : 'bg-background hover:bg-accent border-border hover:border-primary/30'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      step.done 
                        ? 'bg-green-500 text-white' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {step.done ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <step.icon className="w-4 h-4" />
                      )}
                    </div>
                    <span className={`flex-1 text-left text-sm font-medium ${
                      step.done ? 'text-green-700 dark:text-green-300 line-through' : ''
                    }`}>
                      {step.title}
                    </span>
                    {!step.done && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {!connection?.isConnected ? (
          <Card className="p-8 md:p-12 text-center">
            <MessageCircle className="w-10 h-10 md:w-12 md:h-12 mx-auto text-muted-foreground mb-3 md:mb-4" />
            <h3 className="font-semibold text-base md:text-lg mb-2">WhatsApp não conectado</h3>
            <p className="text-xs md:text-sm text-muted-foreground mb-4">
              Conecte seu WhatsApp para visualizar as estatísticas
            </p>
            <Button onClick={() => setLocation("/conexao")} size="sm">
              <Smartphone className="w-4 h-4 mr-2" />
              Conectar WhatsApp
            </Button>
          </Card>
        ) : (
          <>
            {/* Cards de estatísticas - Grid responsivo */}
            <div className="grid gap-3 md:gap-6 grid-cols-2 lg:grid-cols-4">
              <Card className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 md:space-y-1">
                    <p className="text-[10px] md:text-sm text-muted-foreground">Total de Conversas</p>
                    <p className="text-2xl md:text-3xl font-bold" data-testid="stat-total-conversations">
                      {stats?.totalConversations || 0}
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-md bg-primary/10 flex items-center justify-center">
                    <Users className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                  </div>
                </div>
              </Card>

              <Card className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 md:space-y-1">
                    <p className="text-[10px] md:text-sm text-muted-foreground">Não Lidas</p>
                    <p className="text-2xl md:text-3xl font-bold" data-testid="stat-unread">
                      {stats?.unreadMessages || 0}
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-md bg-primary/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                  </div>
                </div>
              </Card>

              <Card className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 md:space-y-1">
                    <p className="text-[10px] md:text-sm text-muted-foreground">Mensagens Hoje</p>
                    <p className="text-2xl md:text-3xl font-bold" data-testid="stat-today">
                      {stats?.todayMessages || 0}
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-md bg-primary/10 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                  </div>
                </div>
              </Card>

              <Card className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 md:space-y-1">
                    <p className="text-[10px] md:text-sm text-muted-foreground">Status WhatsApp</p>
                    <p className="text-lg md:text-xl font-semibold text-primary">Conectado</p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-md bg-primary/10 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                  </div>
                </div>
              </Card>
            </div>

            {/* Cards do Agente */}
            <div className="grid gap-3 md:gap-6 grid-cols-1 md:grid-cols-2">
              <Card className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 md:space-y-1">
                    <p className="text-xs md:text-sm text-muted-foreground">Status do Agente IA</p>
                    <p className={`text-lg md:text-xl font-semibold ${agentConfig?.isActive ? 'text-primary' : 'text-muted-foreground'}`} data-testid="stat-agent-status">
                      {agentConfig?.isActive ? 'Ativo' : 'Inativo'}
                    </p>
                    {agentConfig?.isActive && (
                      <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">
                        Respondendo automaticamente
                      </p>
                    )}
                  </div>
                  <div className={`w-10 h-10 md:w-12 md:h-12 rounded-md flex items-center justify-center ${agentConfig?.isActive ? 'bg-primary/10' : 'bg-muted'}`}>
                    <Bot className={`w-5 h-5 md:w-6 md:h-6 ${agentConfig?.isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                </div>
              </Card>

              <Card className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 md:space-y-1">
                    <p className="text-xs md:text-sm text-muted-foreground">Respostas do Agente</p>
                    <p className="text-2xl md:text-3xl font-bold" data-testid="stat-agent-messages">
                      {stats?.agentMessages || 0}
                    </p>
                    <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">
                      Mensagens automáticas enviadas
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-md bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
