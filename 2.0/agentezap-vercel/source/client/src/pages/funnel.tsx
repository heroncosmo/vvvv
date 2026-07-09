/**
 * Funil de Vendas - Dashboard de Analytics do Kanban
 * 
 * Este é um DASHBOARD que mostra métricas e visualização do funil
 * baseado nos dados REAIS do Kanban (conversas/contatos).
 * 
 * NÃO é um sistema separado - é uma visão analítica do Kanban existente.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, 
  Users, 
  TrendingUp, 
  CheckCircle, 
  XCircle,
  ArrowRight,
  Filter,
  RefreshCw
} from "lucide-react";
import { Link } from "wouter";

interface KanbanStage {
  id: string;
  name: string;
  color: string;
  order: number;
}

interface Conversation {
  id: string;
  contactName: string;
  kanbanStageId: string | null;
}

export default function FunnelPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Buscar estágios do Kanban
  const { data: stages = [], refetch: refetchStages } = useQuery<KanbanStage[]>({
    queryKey: ["/api/kanban/stages"],
  });

  // Buscar conversas do Kanban
  const { data: conversations = [], refetch: refetchConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/kanban/conversations"],
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchStages(), refetchConversations()]);
    setIsRefreshing(false);
  };

  // Ordenar estágios
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  // Calcular métricas por estágio
  const stageMetrics = sortedStages.map(stage => {
    const count = conversations.filter(c => c.kanbanStageId === stage.id).length;
    return { ...stage, count };
  });

  // Métricas gerais
  const totalContacts = conversations.length;
  
  // Identificar estágio "Fechado" (conversão) e "Perdido"
  const closedStage = stages.find(s => 
    s.name.toLowerCase().includes('fechado') || 
    s.name.toLowerCase().includes('ganho') ||
    s.name.toLowerCase().includes('convertido')
  );
  const lostStage = stages.find(s => 
    s.name.toLowerCase().includes('perdido') || 
    s.name.toLowerCase().includes('cancelado')
  );

  const closedCount = closedStage 
    ? conversations.filter(c => c.kanbanStageId === closedStage.id).length 
    : 0;
  const lostCount = lostStage 
    ? conversations.filter(c => c.kanbanStageId === lostStage.id).length 
    : 0;

  // Taxa de conversão
  const conversionRate = totalContacts > 0 
    ? ((closedCount / totalContacts) * 100).toFixed(1) 
    : "0";

  // Calcular largura proporcional para visualização do funil
  const maxCount = Math.max(...stageMetrics.map(s => s.count), 1);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Funil de Vendas</h1>
          <p className="text-gray-500 mt-1">
            Visualização analítica baseada nos dados do Kanban
          </p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Link href="/kanban">
            <Button>
              <Filter className="w-4 h-4 mr-2" />
              Gerenciar Kanban
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total de Contatos</p>
                <p className="text-3xl font-bold">{totalContacts}</p>
              </div>
              <Users className="w-10 h-10 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Fechados</p>
                <p className="text-3xl font-bold text-green-600">{closedCount}</p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Perdidos</p>
                <p className="text-3xl font-bold text-red-600">{lostCount}</p>
              </div>
              <XCircle className="w-10 h-10 text-red-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Taxa de Conversão</p>
                <p className="text-3xl font-bold text-purple-600">{conversionRate}%</p>
              </div>
              <TrendingUp className="w-10 h-10 text-purple-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visualização do Funil */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Visualização do Funil
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stageMetrics.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum estágio configurado no Kanban</p>
              <Link href="/kanban">
                <Button variant="ghost" className="mt-2 text-blue-600 underline">
                  Configurar estágios
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {stageMetrics.map((stage, index) => {
                const widthPercent = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
                // Funil diminui gradualmente (efeito visual)
                const funnelWidth = 100 - (index * (60 / stageMetrics.length));
                const actualWidth = Math.max(widthPercent, 5); // Mínimo 5% para visualização
                
                return (
                  <div key={stage.id} className="relative">
                    <div className="flex items-center gap-4">
                      {/* Nome do estágio */}
                      <div className="w-32 text-right">
                        <span className="text-sm font-medium text-gray-700">
                          {stage.name}
                        </span>
                      </div>
                      
                      {/* Barra do funil */}
                      <div 
                        className="flex-1 relative"
                        style={{ maxWidth: `${funnelWidth}%` }}
                      >
                        <div 
                          className="h-12 rounded-lg flex items-center justify-end pr-4 transition-all duration-500"
                          style={{ 
                            backgroundColor: stage.color || '#3B82F6',
                            width: `${actualWidth}%`,
                            minWidth: '60px'
                          }}
                        >
                          <span className="text-white font-bold text-lg">
                            {stage.count}
                          </span>
                        </div>
                      </div>
                      
                      {/* Percentual */}
                      <div className="w-16 text-left">
                        <span className="text-sm text-gray-500">
                          {totalContacts > 0 
                            ? `${((stage.count / totalContacts) * 100).toFixed(0)}%`
                            : '0%'
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Distribuição por Estágio */}
      <Card>
        <CardHeader>
          <CardTitle>Distribuição por Estágio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {stageMetrics.map(stage => (
              <div 
                key={stage.id}
                className="p-4 rounded-lg border-2 text-center transition-all hover:shadow-md"
                style={{ borderColor: stage.color || '#E5E7EB' }}
              >
                <div 
                  className="w-3 h-3 rounded-full mx-auto mb-2"
                  style={{ backgroundColor: stage.color || '#9CA3AF' }}
                />
                <p className="text-sm text-gray-600 mb-1">{stage.name}</p>
                <p className="text-2xl font-bold" style={{ color: stage.color || '#1F2937' }}>
                  {stage.count}
                </p>
                <p className="text-xs text-gray-400">
                  {totalContacts > 0 
                    ? `${((stage.count / totalContacts) * 100).toFixed(1)}%`
                    : '0%'
                  }
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Nota informativa */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-700">
          <strong>💡 Dica:</strong> Este dashboard mostra métricas baseadas nos dados reais do seu Kanban. 
          Para mover contatos entre estágios, use a página{" "}
          <Link href="/kanban">
            <span className="underline cursor-pointer font-medium">Kanban</span>
          </Link>.
        </p>
      </div>
    </div>
  );
}
