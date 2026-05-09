import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Filter,
  GitMerge,
  GitPullRequest,
  History,
  Layers,
  Settings,
  Zap,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Clock,
  AlertTriangle,
  MessageSquare,
  Target,
  ArrowRight,
  Sparkles,
  Phone,
  Calendar,
  MoreHorizontal,
  ChevronRight,
  Activity,
  Award,
  Star,
  Trophy,
  Rocket,
  CheckCircle2,
  Timer,
  Bell,
  Crown,
  Plus,
  Loader2,
  Trash2,
  Edit,
  X,
  Check,
  XCircle,
} from "lucide-react";
import PremiumBlocked from "@/components/premium-overlay";
import { apiRequest } from "@/lib/queryClient";

// Types for real API data
interface Deal {
  id: string;
  name: string;
  company: string;
  value: number;
  valuePeriod: string;
  priority: "Alta" | "Média" | "Baixa";
  assignee: string;
  phone?: string;
  email?: string;
  notes?: string;
  lastContact: string;
  conversationId?: string;
}

interface Stage {
  id: string;
  name: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  iconColor: string;
  automations: number;
  position: number;
  deals: Deal[];
}

interface Funnel {
  id: string;
  name: string;
  product: string;
  manager: string;
  deals: number;
  value: number;
  conversionRate: number;
  estimatedRevenue: number;
  stages: Stage[];
}

const priorityColors: Record<Deal["priority"], string> = {
  Alta: "bg-red-100 text-red-700 border-red-200",
  Média: "bg-amber-100 text-amber-700 border-amber-200",
  Baixa: "bg-blue-100 text-blue-700 border-blue-200",
};

export default function FunnelPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [isCreateFunnelOpen, setIsCreateFunnelOpen] = useState(false);
  const [isCreateDealOpen, setIsCreateDealOpen] = useState(false);
  const [selectedStageForDeal, setSelectedStageForDeal] = useState<string | null>(null);
  
  // Form states for creating funnel
  const [newFunnelName, setNewFunnelName] = useState("");
  const [newFunnelProduct, setNewFunnelProduct] = useState("");
  const [newFunnelManager, setNewFunnelManager] = useState("");
  
  // Form states for creating deal
  const [newDealName, setNewDealName] = useState("");
  const [newDealCompany, setNewDealCompany] = useState("");
  const [newDealValue, setNewDealValue] = useState("");
  const [newDealPriority, setNewDealPriority] = useState<"Alta" | "Média" | "Baixa">("Média");
  const [newDealPhone, setNewDealPhone] = useState("");
  const [newDealNotes, setNewDealNotes] = useState("");

  // Fetch all funnels from real API
  const { data: funnels = [], isLoading: isLoadingFunnels, error: funnelsError } = useQuery<Funnel[]>({
    queryKey: ["/api/funnels"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/funnels");
      return res.json();
    },
  });

  // Set initial funnel selection
  useEffect(() => {
    if (funnels.length > 0 && !selectedFunnelId) {
      setSelectedFunnelId(funnels[0].id);
    }
  }, [funnels, selectedFunnelId]);

  const selectedFunnel = funnels.find((f) => f.id === selectedFunnelId);

  // Create funnel mutation
  const createFunnelMutation = useMutation({
    mutationFn: async (data: { name: string; product?: string; manager?: string }) => {
      const res = await apiRequest("POST", "/api/funnels", data);
      return res.json();
    },
    onSuccess: (newFunnel) => {
      queryClient.invalidateQueries({ queryKey: ["/api/funnels"] });
      setIsCreateFunnelOpen(false);
      setNewFunnelName("");
      setNewFunnelProduct("");
      setNewFunnelManager("");
      setSelectedFunnelId(newFunnel.id);
      toast({ title: "Funil criado!", description: "Seu novo funil foi criado com estágios padrão." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar funil", description: error.message || "Tente novamente.", variant: "destructive" });
    },
  });

  // Delete funnel mutation
  const deleteFunnelMutation = useMutation({
    mutationFn: async (funnelId: string) => {
      const res = await apiRequest("DELETE", `/api/funnels/${funnelId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/funnels"] });
      setSelectedFunnelId(null);
      toast({ title: "Funil excluído", description: "O funil foi removido com sucesso." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir funil", description: error.message || "Tente novamente.", variant: "destructive" });
    },
  });

  // Create deal mutation
  const createDealMutation = useMutation({
    mutationFn: async (data: { 
      funnelId: string; 
      stageId: string; 
      contactName: string; 
      companyName?: string; 
      value?: number; 
      priority?: string; 
      contactPhone?: string; 
      notes?: string 
    }) => {
      const res = await apiRequest("POST", `/api/funnels/${data.funnelId}/stages/${data.stageId}/deals`, {
        contactName: data.contactName,
        companyName: data.companyName,
        value: data.value,
        priority: data.priority,
        contactPhone: data.contactPhone,
        notes: data.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/funnels"] });
      setIsCreateDealOpen(false);
      resetDealForm();
      toast({ title: "Deal criado!", description: "Nova oportunidade adicionada ao funil." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar deal", description: error.message || "Tente novamente.", variant: "destructive" });
    },
  });

  // Move deal mutation (drag & drop)
  const moveDealMutation = useMutation({
    mutationFn: async ({ dealId, toStageId }: { dealId: string; toStageId: string }) => {
      const res = await apiRequest("PUT", `/api/deals/${dealId}/move`, { toStageId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/funnels"] });
      toast({ title: "Deal movido!", description: "A oportunidade foi movida para o novo estágio." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao mover deal", description: error.message || "Tente novamente.", variant: "destructive" });
    },
  });

  // Mark deal as won
  const markDealWonMutation = useMutation({
    mutationFn: async (dealId: string) => {
      const res = await apiRequest("PUT", `/api/deals/${dealId}/won`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/funnels"] });
      toast({ title: "🎉 Parabéns!", description: "Deal marcado como ganho!" });
    },
  });

  // Mark deal as lost
  const markDealLostMutation = useMutation({
    mutationFn: async ({ dealId, reason }: { dealId: string; reason?: string }) => {
      const res = await apiRequest("PUT", `/api/deals/${dealId}/lost`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/funnels"] });
      toast({ title: "Deal perdido", description: "O deal foi marcado como perdido." });
    },
  });

  // Delete deal mutation
  const deleteDealMutation = useMutation({
    mutationFn: async (dealId: string) => {
      const res = await apiRequest("DELETE", `/api/deals/${dealId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/funnels"] });
      toast({ title: "Deal removido", description: "A oportunidade foi excluída." });
    },
  });

  const resetDealForm = () => {
    setNewDealName("");
    setNewDealCompany("");
    setNewDealValue("");
    setNewDealPriority("Média");
    setNewDealPhone("");
    setNewDealNotes("");
    setSelectedStageForDeal(null);
  };

  const handleCreateFunnel = () => {
    if (!newFunnelName.trim()) {
      toast({ title: "Nome obrigatório", description: "Digite um nome para o funil.", variant: "destructive" });
      return;
    }
    createFunnelMutation.mutate({
      name: newFunnelName,
      product: newFunnelProduct || undefined,
      manager: newFunnelManager || undefined,
    });
  };

  const handleCreateDeal = () => {
    if (!newDealName.trim() || !selectedStageForDeal || !selectedFunnelId) {
      toast({ title: "Dados obrigatórios", description: "Nome do contato e estágio são obrigatórios.", variant: "destructive" });
      return;
    }
    createDealMutation.mutate({
      funnelId: selectedFunnelId,
      stageId: selectedStageForDeal,
      contactName: newDealName,
      companyName: newDealCompany || undefined,
      value: newDealValue ? parseFloat(newDealValue) : undefined,
      priority: newDealPriority,
      contactPhone: newDealPhone || undefined,
      notes: newDealNotes || undefined,
    });
  };

  const handleDragStart = (dealId: string) => setDraggedDeal(dealId);
  
  const handleDrop = (stageId: string) => {
    if (!draggedDeal) return;
    moveDealMutation.mutate({ dealId: draggedDeal, toStageId: stageId });
    setDraggedDeal(null);
  };

  // Social proof animation state
  const [liveUsers, setLiveUsers] = useState(2847);
  const [recentDeal, setRecentDeal] = useState<string | null>(null);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveUsers(prev => prev + Math.floor(Math.random() * 5) - 2);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const dealNames = ["TechCorp", "StartupXYZ", "MegaStore", "DigitalBR"];
    const interval = setInterval(() => {
      const randomDeal = dealNames[Math.floor(Math.random() * dealNames.length)];
      setRecentDeal(randomDeal);
      setTimeout(() => setRecentDeal(null), 4000);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Calculate metrics from real data
  const metrics = useMemo(() => {
    if (!selectedFunnel) return { totalDeals: 0, stuck: 0, conversion: 0, revenue: "R$ 0" };
    
    let totalDeals = 0;
    let totalValue = 0;
    let stuck = 0;
    
    selectedFunnel.stages.forEach((stage) => {
      totalDeals += stage.deals.length;
      stage.deals.forEach((deal) => {
        totalValue += deal.value || 0;
        if (deal.lastContact) {
          const diffDays = Math.floor((new Date().getTime() - new Date(deal.lastContact).getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 2) stuck++;
        }
      });
    });
    
    return {
      totalDeals,
      stuck,
      conversion: selectedFunnel.conversionRate || 0,
      revenue: `R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`,
    };
  }, [selectedFunnel]);

  // Loading state
  if (isLoadingFunnels) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mx-auto" />
          <p className="text-slate-600">Carregando funis de vendas...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (funnelsError) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Erro ao carregar funis</h2>
          <p className="text-slate-500 mb-4">Não foi possível carregar seus funis de vendas.</p>
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/funnels"] })}>
            Tentar novamente
          </Button>
        </Card>
      </div>
    );
  }

  // Empty state - no funnels
  if (funnels.length === 0) {
    return (
      <PremiumBlocked
        title="Continue Vendendo com o Funil"
        subtitle="Seu período de teste acabou"
        description="Assine para usar o funil de vendas e converter mais leads."
        ctaLabel="Ativar Plano Ilimitado"
        benefits={["Pipeline visual drag & drop ilimitado", "Automações de WhatsApp por estágio"]}
      >
        <div className="flex-1 flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-white">
          <Card className="max-w-lg w-full mx-4 border-0 shadow-xl">
            <CardContent className="p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center mx-auto mb-6">
                <GitPullRequest className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Crie seu primeiro funil de vendas</h2>
              <p className="text-slate-500 mb-6">
                Organize suas oportunidades em estágios e acompanhe cada deal até a conversão.
              </p>
              
              <Dialog open={isCreateFunnelOpen} onOpenChange={setIsCreateFunnelOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                    <Plus className="w-5 h-5" />
                    Criar Primeiro Funil
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Criar Novo Funil</DialogTitle>
                    <DialogDescription>
                      Configure seu funil de vendas. Estágios padrão serão criados automaticamente.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="funnelName">Nome do Funil *</Label>
                      <Input
                        id="funnelName"
                        placeholder="Ex: Funil Comercial WhatsApp"
                        value={newFunnelName}
                        onChange={(e) => setNewFunnelName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="funnelProduct">Produto/Serviço</Label>
                      <Input
                        id="funnelProduct"
                        placeholder="Ex: Assinaturas CRM"
                        value={newFunnelProduct}
                        onChange={(e) => setNewFunnelProduct(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="funnelManager">Responsável</Label>
                      <Input
                        id="funnelManager"
                        placeholder="Ex: Equipe de Vendas"
                        value={newFunnelManager}
                        onChange={(e) => setNewFunnelManager(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateFunnelOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleCreateFunnel}
                      disabled={createFunnelMutation.isPending}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {createFunnelMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Criar Funil
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>
      </PremiumBlocked>
    );
  }

  return (
    <PremiumBlocked
      title="Continue Vendendo com o Funil"
      subtitle="Seu período de teste acabou"
      description="Você aproveitou todas as mensagens gratuitas! Assine agora para continuar usando o funil de vendas e converter mais leads em clientes."
      ctaLabel="Ativar Plano Ilimitado"
      benefits={["Pipeline visual drag & drop ilimitado", "Automações de WhatsApp por estágio", "Métricas de conversão em tempo real", "Alertas de deals parados automaticamente"]}
    >
      <div className="flex-1 overflow-auto p-4 md:p-6 bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Social Proof Notification */}
          {recentDeal && (
            <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-500">
              <div className="bg-white rounded-xl shadow-2xl border border-emerald-100 p-4 flex items-center gap-3 max-w-xs">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{recentDeal}</p>
                  <p className="text-xs text-emerald-600">Acabou de fechar um deal!</p>
                </div>
              </div>
            </div>
          )}

          {/* Hero Section */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-500 text-white shadow-2xl">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            
            <div className="relative p-6 md:p-8">
              {/* Live counter */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-emerald-200 text-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                  <span>{liveUsers.toLocaleString()} empresas usando agora</span>
                </div>
                <div className="flex items-center gap-1 text-amber-300 text-sm">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className="w-4 h-4 fill-amber-300" />
                  ))}
                  <span className="ml-1">4.9</span>
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                      <Rocket className="w-7 h-7" />
                    </div>
                    <div>
                      <h1 className="text-2xl md:text-3xl font-bold">
                        Transforme Leads em <span className="text-amber-300">Clientes</span>
                      </h1>
                      <p className="text-emerald-200 text-sm md:text-base mt-1">
                        Pipeline visual + WhatsApp = <strong className="text-white">3x mais conversões</strong>
                      </p>
                    </div>
                  </div>
                  
                  {/* Trust badges */}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <div className="flex items-center gap-1 bg-white/10 rounded-full px-3 py-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                      <span>Setup em 5 min</span>
                    </div>
                    <div className="flex items-center gap-1 bg-white/10 rounded-full px-3 py-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                      <span>Sem cartão</span>
                    </div>
                    <div className="flex items-center gap-1 bg-white/10 rounded-full px-3 py-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                      <span>Suporte 24/7</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2">
                  <Dialog open={isCreateFunnelOpen} onOpenChange={setIsCreateFunnelOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-white text-emerald-700 hover:bg-emerald-50 shadow-xl font-bold text-base px-6 py-6 transform hover:scale-105 transition-all duration-300">
                        <GitPullRequest className="w-5 h-5 mr-2" />
                        Criar Novo Funil
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Criar Novo Funil</DialogTitle>
                        <DialogDescription>
                          Configure seu funil de vendas. Estágios padrão serão criados automaticamente.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="funnelName2">Nome do Funil *</Label>
                          <Input
                            id="funnelName2"
                            placeholder="Ex: Funil Comercial WhatsApp"
                            value={newFunnelName}
                            onChange={(e) => setNewFunnelName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="funnelProduct2">Produto/Serviço</Label>
                          <Input
                            id="funnelProduct2"
                            placeholder="Ex: Assinaturas CRM"
                            value={newFunnelProduct}
                            onChange={(e) => setNewFunnelProduct(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="funnelManager2">Responsável</Label>
                          <Input
                            id="funnelManager2"
                            placeholder="Ex: Equipe de Vendas"
                            value={newFunnelManager}
                            onChange={(e) => setNewFunnelManager(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateFunnelOpen(false)}>Cancelar</Button>
                        <Button onClick={handleCreateFunnel} disabled={createFunnelMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                          {createFunnelMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Criar Funil
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <p className="text-emerald-200 text-xs text-center">
                    ✨ 7 dias grátis • Cancele quando quiser
                  </p>
                </div>
              </div>

              {/* KPIs em destaque */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105 cursor-pointer group">
                  <div className="flex items-center justify-between">
                    <TrendingUp className="w-5 h-5 text-emerald-200 group-hover:scale-110 transition-transform" />
                    <Badge className="bg-emerald-400/30 text-white border-0 text-xs font-bold">+12%</Badge>
                  </div>
                  <p className="text-3xl md:text-4xl font-bold mt-2">{metrics.conversion}%</p>
                  <p className="text-emerald-200 text-xs mt-1">Taxa de conversão</p>
                  <div className="mt-2 h-1 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-300 to-green-200 rounded-full" style={{ width: `${metrics.conversion}%` }} />
                  </div>
                </div>
                
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105 cursor-pointer group">
                  <div className="flex items-center justify-between">
                    <DollarSign className="w-5 h-5 text-emerald-200 group-hover:scale-110 transition-transform" />
                    <Badge className="bg-emerald-400/30 text-white border-0 text-xs font-bold">Pipeline</Badge>
                  </div>
                  <p className="text-2xl md:text-3xl font-bold mt-2">{metrics.revenue}</p>
                  <p className="text-emerald-200 text-xs mt-1">Receita prevista</p>
                  <p className="text-emerald-300 text-[10px] mt-1.5 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> +R$ 23.500 este mês
                  </p>
                </div>
                
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105 cursor-pointer group">
                  <div className="flex items-center justify-between">
                    <Users className="w-5 h-5 text-emerald-200 group-hover:scale-110 transition-transform" />
                    <Badge className="bg-white/20 text-white border-0 text-xs font-bold">Ativos</Badge>
                  </div>
                  <p className="text-3xl md:text-4xl font-bold mt-2">{metrics.totalDeals}</p>
                  <p className="text-emerald-200 text-xs mt-1">Deals no funil</p>
                  <p className="text-emerald-300 text-[10px] mt-1.5 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> 3 novos hoje
                  </p>
                </div>
                
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105 cursor-pointer group relative overflow-hidden">
                  {metrics.stuck > 0 && (
                    <div className="absolute top-2 right-2">
                      <span className="flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <AlertTriangle className="w-5 h-5 text-amber-300 group-hover:scale-110 transition-transform" />
                    <Badge className="bg-amber-400/30 text-white border-0 text-xs font-bold">Atenção!</Badge>
                  </div>
                  <p className="text-3xl md:text-4xl font-bold mt-2">{metrics.stuck}</p>
                  <p className="text-emerald-200 text-xs mt-1">Deals parados +48h</p>
                  <p className="text-amber-300 text-[10px] mt-1.5 flex items-center gap-1">
                    <Bell className="w-3 h-3" /> Requerem ação
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Seletor de Funil */}
          <Card className="border-0 shadow-sm bg-white/80 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Funil ativo</label>
                  <select
                    value={selectedFunnelId || ""}
                    onChange={(e) => setSelectedFunnelId(e.target.value)}
                    className="w-full sm:w-auto min-w-[240px] border-2 border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer"
                  >
                    {funnels.map((funnel) => (
                      <option key={funnel.id} value={funnel.id}>
                        {funnel.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedFunnel && (
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      <span>{selectedFunnel.product || "Sem produto"}</span>
                    </div>
                    <span className="text-slate-300">•</span>
                    <span>Gestão: {selectedFunnel.manager || "Não definido"}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => deleteFunnelMutation.mutate(selectedFunnel.id)} className="text-red-600">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir Funil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Estágios do Funil - Visual Progress */}
          {selectedFunnel && (
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-white border-b">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                      <Sparkles className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Estágios do Funil</CardTitle>
                      <CardDescription className="text-xs">
                        Configure automações e gatilhos para cada etapa da jornada
                      </CardDescription>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Settings className="w-4 h-4" />
                    Reordenar
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent className="p-6">
                {/* Progress Bar Visual */}
                <div className="relative mb-8">
                  <div className="absolute top-5 left-0 right-0 h-1 bg-slate-200 rounded-full" />
                  <div className="absolute top-5 left-0 h-1 bg-gradient-to-r from-emerald-500 to-green-400 rounded-full" style={{ width: `${(Math.min(4, selectedFunnel.stages.length) / selectedFunnel.stages.length) * 100}%` }} />
                  
                  <div className="relative flex justify-between">
                    {selectedFunnel.stages
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map((stage, index) => (
                        <div key={stage.id} className="flex flex-col items-center" style={{ width: `${100 / selectedFunnel.stages.length}%` }}>
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${index < 4 ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : `${stage.bgColor} ${stage.color} border-2 ${stage.borderColor}`} transition-all hover:scale-110 cursor-pointer`}>
                            {stage.position}
                          </div>
                          <p className={`text-xs font-medium mt-2 text-center ${index < 4 ? 'text-emerald-700' : 'text-slate-600'}`}>
                            {stage.name.split(' ')[0]}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{stage.automations} aut.</p>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Cards de Estágio */}
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  {selectedFunnel.stages
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .slice(0, 4)
                    .map((stage) => (
                      <article key={stage.id} className={`rounded-xl border-2 ${stage.borderColor} ${stage.bgColor} p-4 space-y-3 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer group`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg ${stage.bgColor} border ${stage.borderColor} flex items-center justify-center font-bold text-sm ${stage.color}`}>
                              {stage.position}
                            </div>
                            <div>
                              <p className={`font-semibold ${stage.color}`}>{stage.name}</p>
                              <p className="text-[10px] text-slate-500">{stage.description}</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs">
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${stage.bgColor} ${stage.color}`}>
                            <Zap className="w-3 h-3" />
                            <span className="font-medium">{stage.automations} automações</span>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs">
                            <Settings className="w-3 h-3 mr-1" />
                            Editar
                          </Button>
                        </div>
                      </article>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pipeline Visual - Kanban Style */}
          {selectedFunnel && (
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-white border-b">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Layers className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Pipeline de Oportunidades</CardTitle>
                      <CardDescription className="text-xs">
                        Arraste deals entre estágios • Automações ativas em cada coluna
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={isCreateDealOpen} onOpenChange={setIsCreateDealOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                          <Plus className="w-4 h-4" />
                          Nova Oportunidade
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Adicionar Nova Oportunidade</DialogTitle>
                          <DialogDescription>
                            Preencha os dados do novo deal para adicionar ao funil.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Estágio Inicial *</Label>
                            <Select value={selectedStageForDeal || ""} onValueChange={setSelectedStageForDeal}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o estágio" />
                              </SelectTrigger>
                              <SelectContent>
                                {selectedFunnel.stages.map((stage) => (
                                  <SelectItem key={stage.id} value={stage.id}>
                                    {stage.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Nome do Contato *</Label>
                            <Input placeholder="Ex: João Silva" value={newDealName} onChange={(e) => setNewDealName(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Empresa</Label>
                            <Input placeholder="Ex: TechCorp" value={newDealCompany} onChange={(e) => setNewDealCompany(e.target.value)} />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Valor (R$)</Label>
                              <Input type="number" placeholder="0,00" value={newDealValue} onChange={(e) => setNewDealValue(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label>Prioridade</Label>
                              <Select value={newDealPriority} onValueChange={(v) => setNewDealPriority(v as any)}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Alta">Alta</SelectItem>
                                  <SelectItem value="Média">Média</SelectItem>
                                  <SelectItem value="Baixa">Baixa</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Telefone</Label>
                            <Input placeholder="Ex: (11) 99999-9999" value={newDealPhone} onChange={(e) => setNewDealPhone(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Notas</Label>
                            <Textarea placeholder="Observações sobre o deal..." value={newDealNotes} onChange={(e) => setNewDealNotes(e.target.value)} />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => { setIsCreateDealOpen(false); resetDealForm(); }}>Cancelar</Button>
                          <Button onClick={handleCreateDeal} disabled={createDealMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                            {createDealMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Criar Deal
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                
                {/* Mini KPIs */}
                <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-slate-600"><strong className="text-emerald-600">12</strong> mensagens automáticas ativas</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">Tempo médio: <strong>2,4 dias</strong> por estágio</span>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-4 overflow-x-auto bg-slate-50/50">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 min-h-[420px]">
                  {selectedFunnel.stages
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .slice(0, 4)
                    .map((stage) => (
                      <section
                        key={stage.id}
                        className={`flex flex-col rounded-xl border-2 ${stage.borderColor} bg-white transition-all duration-300 hover:shadow-lg`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(stage.id)}
                      >
                        {/* Header do estágio */}
                        <header className={`p-4 border-b ${stage.borderColor} ${stage.bgColor}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${stage.position === 1 ? 'from-slate-400 to-slate-500' : stage.position === 2 ? 'from-blue-400 to-blue-500' : stage.position === 3 ? 'from-amber-400 to-amber-500' : 'from-purple-400 to-purple-500'}`} />
                              <p className={`font-bold ${stage.color}`}>{stage.name}</p>
                            </div>
                            <Badge variant="secondary" className="font-mono text-xs">
                              {stage.deals.length}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                            <Zap className={`w-3 h-3 ${stage.iconColor}`} />
                            {stage.automations} automações
                          </div>
                        </header>
                        
                        {/* Área de deals */}
                        <div className="flex-1 space-y-3 p-3 min-h-[280px]">
                          {stage.deals.map((deal) => (
                            <article
                              key={deal.id}
                              draggable
                              onDragStart={() => handleDragStart(deal.id)}
                              className={`rounded-xl border-2 p-4 bg-white shadow-sm cursor-grab active:cursor-grabbing active:shadow-lg active:scale-[1.02] hover:border-emerald-300 hover:shadow-md transition-all duration-200 ${draggedDeal === deal.id ? 'opacity-50 scale-95' : ''}`}
                            >
                              {/* Header do deal */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${deal.priority === 'Alta' ? 'bg-gradient-to-br from-red-400 to-rose-500' : deal.priority === 'Média' ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-blue-400 to-blue-500'}`}>
                                    {deal.name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-sm text-slate-800">{deal.name}</p>
                                    <p className="text-[10px] text-slate-500">{deal.company}</p>
                                  </div>
                                </div>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent>
                                    <DropdownMenuItem onClick={() => markDealWonMutation.mutate(deal.id)}>
                                      <Check className="w-4 h-4 mr-2 text-emerald-600" />
                                      Marcar como Ganho
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => markDealLostMutation.mutate({ dealId: deal.id })}>
                                      <XCircle className="w-4 h-4 mr-2 text-red-600" />
                                      Marcar como Perdido
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => deleteDealMutation.mutate(deal.id)} className="text-red-600">
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Excluir
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              
                              {/* Valor em destaque */}
                              <div className="mt-3 p-2 bg-emerald-50 rounded-lg">
                                <p className="text-lg font-bold text-emerald-700">
                                  R$ {(deal.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                              </div>
                              
                              {/* Meta info */}
                              <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                                <div className="flex items-center gap-1.5">
                                  <Users className="w-3 h-3" />
                                  <span>{deal.assignee || "Não atribuído"}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Clock className={`w-3 h-3 ${deal.lastContact && deal.lastContact.includes('dias') ? 'text-amber-500' : 'text-emerald-500'}`} />
                                  <span className={deal.lastContact && deal.lastContact.includes('dias') ? 'text-amber-600 font-medium' : ''}>
                                    {deal.lastContact || "Sem contato"}
                                  </span>
                                </div>
                              </div>
                              
                              {/* Actions */}
                              <div className="mt-3 pt-3 border-t flex gap-2">
                                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs">
                                  <Calendar className="w-3 h-3 mr-1" />
                                  Timeline
                                </Button>
                                <Button size="sm" className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
                                  <Phone className="w-3 h-3 mr-1" />
                                  WhatsApp
                                </Button>
                              </div>
                            </article>
                          ))}
                          
                          {stage.deals.length === 0 && (
                            <div className="h-full min-h-[200px] rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-4 bg-slate-50/50">
                              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                                <Layers className="w-6 h-6 text-slate-400" />
                              </div>
                              <p className="text-sm font-medium text-slate-500">Nenhum deal</p>
                              <p className="text-xs text-slate-400 mt-1">Arraste cards para cá</p>
                            </div>
                          )}
                        </div>
                      </section>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* CTA de Conversão Final */}
          <Card className="border-0 shadow-xl overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-900">
            <CardContent className="p-8 md:p-12">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="text-center md:text-left space-y-4">
                  <div className="flex items-center justify-center md:justify-start gap-2">
                    <Crown className="w-8 h-8 text-amber-400" />
                    <h2 className="text-2xl md:text-3xl font-bold text-white">
                      Pronto para <span className="text-emerald-400">triplicar</span> suas vendas?
                    </h2>
                  </div>
                  <p className="text-slate-300 max-w-lg">
                    Junte-se a mais de <strong className="text-white">2.500 empresas</strong> que já automatizaram
                    seus funis de vendas com WhatsApp. Sem complicação, sem código.
                  </p>
                  <div className="flex flex-wrap justify-center md:justify-start gap-4 text-sm text-slate-400">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Setup em 5 minutos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Suporte em português</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Cancele quando quiser</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-center gap-4">
                  <Button 
                    onClick={() => setLocation("/plans")}
                    size="lg"
                    className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-bold text-lg px-8 py-6 shadow-xl shadow-emerald-500/30 transform hover:scale-105 transition-all duration-300"
                  >
                    <Rocket className="w-5 h-5 mr-2" />
                    Começar Agora — Grátis
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                  <p className="text-slate-500 text-xs flex items-center gap-2">
                    <Timer className="w-3 h-3" />
                    Oferta por tempo limitado
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </PremiumBlocked>
  );
}
