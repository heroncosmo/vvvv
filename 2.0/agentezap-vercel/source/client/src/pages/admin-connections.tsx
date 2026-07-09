import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Edit2,
  Trash2,
  Link2,
  Smartphone,
  Settings,
  Activity,
  PlusCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  Bot,
  Phone,
  Search,
  Users,
  CheckCircle2,
  CircleSlash,
  UserPlus,
  Shield,
} from "lucide-react";
import type { Agent, User as UserType } from "@shared/schema";

interface ConnectionWithMeta {
  id: string;
  userId: string;
  agentId?: string | null;
  phoneNumber?: string | null;
  isConnected: boolean;
  connectionName?: string | null;
  connectionType?: string | null;
  isPrimary?: boolean | null;
  createdAt?: string;
  updatedAt?: string;
  user?: UserType | null;
  agent?: Agent | null;
}

interface ConnectionAgentItem {
  id: string;
  connectionId: string;
  agentId: string;
  isActive: boolean | null;
  assignedAt?: string;
  assignedBy?: string | null;
  agent?: Agent | null;
}

interface AgentFormState {
  name: string;
  prompt: string;
  isActive: boolean;
}

interface ConnectionFormState {
  userId: string;
  agentId: string;
  phoneNumber: string;
  isConnected: boolean;
  connectionName: string;
  connectionType: string;
  isPrimary: boolean;
}

const emptyAgentForm: AgentFormState = {
  name: "",
  prompt: "",
  isActive: true,
};

const emptyConnectionForm: ConnectionFormState = {
  userId: "",
  agentId: "",
  phoneNumber: "",
  isConnected: false,
  connectionName: "",
  connectionType: "primary",
  isPrimary: true,
};

export default function AdminConnectionsPage() {
  const { toast } = useToast();
  const getSubTab = () => window.location.hash.replace('#', '') || 'connections';
  const [activeConnTab, setActiveConnTab] = useState(getSubTab());
  const handleConnTabChange = (tab: string) => {
    setActiveConnTab(tab);
    window.location.hash = tab;
  };
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editingConnection, setEditingConnection] = useState<ConnectionWithMeta | null>(null);
  const [agentForm, setAgentForm] = useState<AgentFormState>(emptyAgentForm);
  const [connectionForm, setConnectionForm] = useState<ConnectionFormState>(emptyConnectionForm);
  const [connectionSearch, setConnectionSearch] = useState("");
  const [connectionStatusFilter, setConnectionStatusFilter] = useState<"all" | "connected" | "disconnected">("all");
  const [agentSearch, setAgentSearch] = useState("");
  const [agentStatusFilter, setAgentStatusFilter] = useState<"all" | "active" | "inactive">("all");
  // Multi-agent dialog state
  const [multiAgentDialogOpen, setMultiAgentDialogOpen] = useState(false);
  const [selectedConnectionForAgents, setSelectedConnectionForAgents] = useState<ConnectionWithMeta | null>(null);
  const [addAgentId, setAddAgentId] = useState("");

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/admin/agents"],
  });

  const { data: connections = [] } = useQuery<ConnectionWithMeta[]>({
    queryKey: ["/api/admin/connections"],
  });

  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/admin/users"],
  });

  // Query for agents assigned to the selected connection (multi-agent)
  const { data: connectionAgentsList = [] } = useQuery<ConnectionAgentItem[]>({
    queryKey: ["/api/admin/connections", selectedConnectionForAgents?.id, "agents"],
    queryFn: async () => {
      if (!selectedConnectionForAgents?.id) return [];
      const res = await fetch(`/api/admin/connections/${selectedConnectionForAgents.id}/agents`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedConnectionForAgents?.id && multiAgentDialogOpen,
  });

  const activeAgents = useMemo(() => agents.filter((agent) => agent.isActive), [agents]);

  const connectionAgents = useMemo(() => {
    if (!editingConnection?.agentId) {
      return activeAgents;
    }
    const currentAgent = agents.find((agent) => agent.id === editingConnection.agentId);
    if (!currentAgent || currentAgent.isActive) {
      return activeAgents;
    }
    return [currentAgent, ...activeAgents];
  }, [agents, activeAgents, editingConnection?.agentId]);

  const filteredConnections = useMemo(() => {
    const term = connectionSearch.trim().toLowerCase();
    return connections.filter((connection) => {
      const matchesSearch =
        !term ||
        connection.user?.name?.toLowerCase().includes(term) ||
        connection.user?.email?.toLowerCase().includes(term) ||
        connection.phoneNumber?.toLowerCase().includes(term) ||
        connection.agent?.name?.toLowerCase().includes(term);

      const matchesStatus =
        connectionStatusFilter === "all" ||
        (connectionStatusFilter === "connected" && connection.isConnected) ||
        (connectionStatusFilter === "disconnected" && !connection.isConnected);

      return !!matchesSearch && matchesStatus;
    });
  }, [connections, connectionSearch, connectionStatusFilter]);

  const filteredAgents = useMemo(() => {
    const term = agentSearch.trim().toLowerCase();
    return agents.filter((agent) => {
      const matchesSearch =
        !term ||
        agent.name.toLowerCase().includes(term) ||
        agent.prompt.toLowerCase().includes(term);

      const matchesStatus =
        agentStatusFilter === "all" ||
        (agentStatusFilter === "active" && agent.isActive) ||
        (agentStatusFilter === "inactive" && !agent.isActive);

      return matchesSearch && matchesStatus;
    });
  }, [agents, agentSearch, agentStatusFilter]);

  const connectedCount = useMemo(() => connections.filter((item) => item.isConnected).length, [connections]);
  const disconnectedCount = connections.length - connectedCount;
  const activeAgentCount = useMemo(() => agents.filter((item) => item.isActive).length, [agents]);

  const saveAgentMutation = useMutation({
    mutationFn: async (payload: AgentFormState) => {
      const url = editingAgent ? `/api/admin/agents/${editingAgent.id}` : "/api/admin/agents";
      const method = editingAgent ? "PUT" : "POST";
      await apiRequest(method, url, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents"] });
      setAgentDialogOpen(false);
      setEditingAgent(null);
      setAgentForm(emptyAgentForm);
      toast({ title: "Agente salvo com sucesso" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar agente",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      await apiRequest("DELETE", `/api/admin/agents/${agentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents"] });
      toast({ title: "Agente removido" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover agente",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const saveConnectionMutation = useMutation({
    mutationFn: async (payload: ConnectionFormState) => {
      const url = editingConnection
        ? `/api/admin/connections/${editingConnection.id}`
        : "/api/admin/connections";
      const method = editingConnection ? "PUT" : "POST";
      await apiRequest(method, url, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/connections"] });
      setConnectionDialogOpen(false);
      setEditingConnection(null);
      setConnectionForm(emptyConnectionForm);
      toast({ title: "Conexao salva com sucesso" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar conexao",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      await apiRequest("DELETE", `/api/admin/connections/${connectionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/connections"] });
      toast({ title: "Conexao removida" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover conexao",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  // Multi-agent mutations
  const addConnectionAgentMutation = useMutation({
    mutationFn: async ({ connectionId, agentId }: { connectionId: string; agentId: string }) => {
      await apiRequest("POST", `/api/admin/connections/${connectionId}/agents`, { agentId, isActive: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/connections", selectedConnectionForAgents?.id, "agents"] });
      setAddAgentId("");
      toast({ title: "Agente vinculado com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao vincular agente", description: error?.message, variant: "destructive" });
    },
  });

  const toggleConnectionAgentMutation = useMutation({
    mutationFn: async ({ connectionId, agentId, isActive }: { connectionId: string; agentId: string; isActive: boolean }) => {
      await apiRequest("PUT", `/api/admin/connections/${connectionId}/agents/${agentId}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/connections", selectedConnectionForAgents?.id, "agents"] });
      toast({ title: "Status do agente atualizado" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar agente", description: error?.message, variant: "destructive" });
    },
  });

  const removeConnectionAgentMutation = useMutation({
    mutationFn: async ({ connectionId, agentId }: { connectionId: string; agentId: string }) => {
      await apiRequest("DELETE", `/api/admin/connections/${connectionId}/agents/${agentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/connections", selectedConnectionForAgents?.id, "agents"] });
      toast({ title: "Agente removido da conexão" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao remover agente", description: error?.message, variant: "destructive" });
    },
  });

  const openNewAgentDialog = () => {
    setEditingAgent(null);
    setAgentForm(emptyAgentForm);
    setAgentDialogOpen(true);
  };

  const openEditAgentDialog = (agent: Agent) => {
    setEditingAgent(agent);
    setAgentForm({
      name: agent.name,
      prompt: agent.prompt,
      isActive: agent.isActive ?? true,
    });
    setAgentDialogOpen(true);
  };

  const openNewConnectionDialog = () => {
    setEditingConnection(null);
    setConnectionForm(emptyConnectionForm);
    setConnectionDialogOpen(true);
  };

  const openEditConnectionDialog = (connection: ConnectionWithMeta) => {
    setEditingConnection(connection);
    setConnectionForm({
      userId: connection.userId,
      agentId: connection.agentId || "",
      phoneNumber: connection.phoneNumber || "",
      isConnected: connection.isConnected ?? false,
      connectionName: connection.connectionName || "",
      connectionType: connection.connectionType || "primary",
      isPrimary: connection.isPrimary ?? true,
    });
    setConnectionDialogOpen(true);
  };

  const openMultiAgentDialog = (connection: ConnectionWithMeta) => {
    setSelectedConnectionForAgents(connection);
    setAddAgentId("");
    setMultiAgentDialogOpen(true);
  };

  // Available agents not yet assigned to the selected connection
  const availableAgentsForConnection = useMemo(() => {
    const assignedIds = new Set(connectionAgentsList.map((ca) => ca.agentId));
    return agents.filter((a) => a.isActive && !assignedIds.has(a.id));
  }, [agents, connectionAgentsList]);

  return (
    <div className="min-h-screen bg-slate-50/60 flex flex-col">
      <header className="bg-white/90 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin" className="p-2 hover:bg-slate-100 rounded-lg transition-colors shrink-0">
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-slate-900 flex items-center gap-2 truncate">
              <Link2 className="w-5 h-5 text-blue-600 shrink-0" />
              <span className="truncate">Conexões e Agentes</span>
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">Gerencie múltiplas conexões e configure seus agentes</p>
          </div>
        </div>
        <Button onClick={openNewConnectionDialog} size="sm" className="shrink-0">
          <Plus className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Nova conexão</span>
          <span className="sm:hidden">Nova</span>
        </Button>
      </header>

      <main className="flex-1 p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-auto">
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Total de conexões</p>
                <p className="text-2xl font-semibold text-slate-900">{connections.length}</p>
              </div>
              <Smartphone className="w-5 h-5 text-slate-500" />
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-700">Conectadas</p>
                <p className="text-2xl font-semibold text-emerald-800">{connectedCount}</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/40 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-700">Desconectadas</p>
                <p className="text-2xl font-semibold text-amber-800">{disconnectedCount}</p>
              </div>
              <CircleSlash className="w-5 h-5 text-amber-600" />
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50/40 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-700">Agentes ativos</p>
                <p className="text-2xl font-semibold text-blue-800">{activeAgentCount}</p>
              </div>
              <Bot className="w-5 h-5 text-blue-600" />
            </CardContent>
          </Card>
        </section>

        <Tabs value={activeConnTab} onValueChange={handleConnTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:grid-cols-2 bg-slate-100">
            <TabsTrigger value="connections" className="gap-2">
              <Smartphone className="w-4 h-4" />
              Conexões
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-2">
              <Settings className="w-4 h-4" />
              Agentes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connections" className="mt-4 space-y-3">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Smartphone className="w-5 h-5 text-green-600" />
                      Conexões WhatsApp
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Gerencie múltiplas conexões e vincule cada uma a um agente</CardDescription>
                  </div>
                  <Button onClick={openNewConnectionDialog} size="sm" className="w-full sm:w-auto">
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Nova conexão
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar por usuário, e-mail, agente ou número"
                      value={connectionSearch}
                      onChange={(event) => setConnectionSearch(event.target.value)}
                    />
                  </div>
                  <Select
                    value={connectionStatusFilter}
                    onValueChange={(value: "all" | "connected" | "disconnected") => setConnectionStatusFilter(value)}
                  >
                    <SelectTrigger className="w-full sm:w-[190px]">
                      <SelectValue placeholder="Filtrar status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      <SelectItem value="connected">Somente conectados</SelectItem>
                      <SelectItem value="disconnected">Somente desconectados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2 border-slate-200">
                        <TableHead className="font-semibold text-slate-700">Usuário</TableHead>
                        <TableHead className="font-semibold text-slate-700">Conexão</TableHead>
                        <TableHead className="font-semibold text-slate-700">Agente Principal</TableHead>
                        <TableHead className="font-semibold text-slate-700">Número</TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredConnections.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <WifiOff className="w-10 h-10 sm:w-12 sm:h-12 opacity-50" />
                              <p className="text-sm sm:text-base">Nenhuma conexão encontrada</p>
                              <p className="text-xs">Ajuste os filtros ou crie uma nova conexão</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredConnections.map((connection) => (
                          <TableRow key={connection.id} className="hover:bg-slate-50 transition-colors">
                            <TableCell className="py-3 sm:py-4">
                              <div className="space-y-0.5">
                                <p className="font-medium text-sm sm:text-base text-slate-900">{connection.user?.name || "Sem nome"}</p>
                                <p className="text-xs text-slate-500 truncate max-w-[320px]">{connection.user?.email || connection.userId}</p>
                              </div>
                            </TableCell>
                            <TableCell className="py-3 sm:py-4">
                              <div className="space-y-0.5">
                                <p className="text-sm font-medium text-slate-900">{connection.connectionName || "Principal"}</p>
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {connection.connectionType || "primary"}
                                  </Badge>
                                  {connection.isPrimary && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700">
                                      Principal
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3 sm:py-4">
                              <div className="flex items-center gap-2">
                                <Bot className="w-4 h-4 text-purple-600" />
                                <span className="text-sm sm:text-base text-slate-900">{connection.agent?.name || "Sem agente"}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-3 sm:py-4">
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-slate-400" />
                                <span className="text-sm sm:text-base text-slate-700">{connection.phoneNumber || "-"}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-3 sm:py-4">
                              <Badge variant={connection.isConnected ? "default" : "secondary"} className="gap-1.5">
                                {connection.isConnected ? (
                                  <>
                                    <Wifi className="w-3 h-3" />
                                    Conectado
                                  </>
                                ) : (
                                  <>
                                    <WifiOff className="w-3 h-3" />
                                    Desconectado
                                  </>
                                )}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3 sm:py-4 text-right">
                              <div className="flex items-center justify-end gap-1 sm:gap-2">
                                <Button variant="ghost" size="icon" className="h-9 w-9" title="Multi-Agentes" onClick={() => openMultiAgentDialog(connection)}>
                                  <Users className="w-4 h-4 text-blue-600" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEditConnectionDialog(connection)}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-destructive hover:text-destructive"
                                  onClick={() => {
                                    if (confirm("Excluir esta conexão?")) {
                                      deleteConnectionMutation.mutate(connection.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid gap-3 md:hidden">
                  {filteredConnections.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-center bg-slate-50/70">
                      <WifiOff className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                      <p className="text-sm font-medium text-slate-700">Nenhuma conexão encontrada</p>
                      <p className="text-xs text-slate-500 mt-1">Ajuste os filtros ou crie uma nova conexão</p>
                    </div>
                  ) : (
                    filteredConnections.map((connection) => (
                      <Card key={connection.id} className="border border-slate-200 shadow-none">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-slate-900 truncate">{connection.user?.name || "Sem nome"}</p>
                              <p className="text-xs text-slate-500 truncate">{connection.user?.email || connection.userId}</p>
                            </div>
                            <Badge variant={connection.isConnected ? "default" : "secondary"} className="shrink-0">
                              {connection.isConnected ? "Conectado" : "Desconectado"}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-1 gap-2 text-xs">
                            <div className="flex items-center gap-2 text-slate-600">
                              <Link2 className="w-3.5 h-3.5 text-blue-600" />
                              <span>Conexão: {connection.connectionName || "Principal"}</span>
                              {connection.isPrimary && (
                                <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-blue-50 text-blue-700">Principal</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Bot className="w-3.5 h-3.5 text-purple-600" />
                              <span>Agente: {connection.agent?.name || "Sem agente"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              <span>Número: {connection.phoneNumber || "-"}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <Button variant="outline" size="sm" onClick={() => openMultiAgentDialog(connection)}>
                              <Users className="w-4 h-4 mr-1 text-blue-600" />
                              Multi-Agentes
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openEditConnectionDialog(connection)}>
                              <Edit2 className="w-4 h-4 mr-1" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive border-destructive/30 hover:text-destructive"
                              onClick={() => {
                                if (confirm("Excluir esta conexão?")) {
                                  deleteConnectionMutation.mutate(connection.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Excluir
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents" className="mt-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Settings className="w-5 h-5 text-blue-600" />
                      Agentes
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Cadastre prompts personalizados para cada agente</CardDescription>
                  </div>
                  <Button onClick={openNewAgentDialog} size="sm" className="w-full sm:w-auto">
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Novo agente
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar por nome ou prompt"
                      value={agentSearch}
                      onChange={(event) => setAgentSearch(event.target.value)}
                    />
                  </div>
                  <Select
                    value={agentStatusFilter}
                    onValueChange={(value: "all" | "active" | "inactive") => setAgentStatusFilter(value)}
                  >
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Filtrar status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="active">Ativos</SelectItem>
                      <SelectItem value="inactive">Inativos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2 border-slate-200">
                        <TableHead className="font-semibold text-slate-700">Nome</TableHead>
                        <TableHead className="font-semibold text-slate-700">Prompt</TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAgents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Bot className="w-10 h-10 sm:w-12 sm:h-12 opacity-50" />
                              <p className="text-sm sm:text-base">Nenhum agente encontrado</p>
                              <p className="text-xs">Ajuste os filtros ou crie um novo agente</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredAgents.map((agent) => (
                          <TableRow key={agent.id} className="hover:bg-slate-50 transition-colors">
                            <TableCell className="py-3 sm:py-4">
                              <div className="flex items-center gap-2">
                                <Bot className="w-5 h-5 text-purple-600" />
                                <span className="font-medium text-sm sm:text-base text-slate-900">{agent.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-3 sm:py-4">
                              <p className="max-w-[280px] sm:max-w-[360px] text-sm text-slate-600 line-clamp-2">{agent.prompt}</p>
                            </TableCell>
                            <TableCell className="py-3 sm:py-4">
                              <Badge variant={agent.isActive ? "default" : "secondary"} className="gap-1.5">
                                {agent.isActive ? (
                                  <>
                                    <Activity className="w-3 h-3" />
                                    Ativo
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-3 h-3" />
                                    Inativo
                                  </>
                                )}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3 sm:py-4 text-right">
                              <div className="flex items-center justify-end gap-1 sm:gap-2">
                                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEditAgentDialog(agent)}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-destructive hover:text-destructive"
                                  onClick={() => {
                                    if (confirm(`Excluir agente "${agent.name}"?`)) {
                                      deleteAgentMutation.mutate(agent.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid gap-3 md:hidden">
                  {filteredAgents.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-center bg-slate-50/70">
                      <Users className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                      <p className="text-sm font-medium text-slate-700">Nenhum agente encontrado</p>
                      <p className="text-xs text-slate-500 mt-1">Ajuste os filtros ou crie um novo agente</p>
                    </div>
                  ) : (
                    filteredAgents.map((agent) => (
                      <Card key={agent.id} className="border border-slate-200 shadow-none">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-2">
                              <Bot className="w-4 h-4 text-purple-600 shrink-0" />
                              <p className="font-medium text-sm text-slate-900 truncate">{agent.name}</p>
                            </div>
                            <Badge variant={agent.isActive ? "default" : "secondary"}>{agent.isActive ? "Ativo" : "Inativo"}</Badge>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-3">{agent.prompt}</p>
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <Button variant="outline" size="sm" onClick={() => openEditAgentDialog(agent)}>
                              <Edit2 className="w-4 h-4 mr-1" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive border-destructive/30 hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Excluir agente "${agent.name}"?`)) {
                                  deleteAgentMutation.mutate(agent.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Excluir
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">{editingAgent ? "Editar agente" : "Novo agente"}</DialogTitle>
            <DialogDescription>Defina o nome e prompt do agente personalizado</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Nome do Agente</Label>
              <Input
                placeholder="Ex: Atendente IA"
                value={agentForm.name}
                onChange={(event) => setAgentForm((prev) => ({ ...prev, name: event.target.value }))}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Prompt do Agente</Label>
              <Textarea
                rows={6}
                placeholder="Descreva como este agente deve responder..."
                value={agentForm.prompt}
                onChange={(event) => setAgentForm((prev) => ({ ...prev, prompt: event.target.value }))}
                className="min-h-[150px]"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg gap-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Agente Ativo</Label>
                <p className="text-xs text-slate-500">Agentes inativos não aparecem para novas conexões</p>
              </div>
              <Switch checked={agentForm.isActive} onCheckedChange={(checked) => setAgentForm((prev) => ({ ...prev, isActive: checked }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => setAgentDialogOpen(false)} className="h-10">
              Cancelar
            </Button>
            <Button onClick={() => saveAgentMutation.mutate(agentForm)} disabled={!agentForm.name.trim() || !agentForm.prompt.trim()} className="h-10">
              {editingAgent ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={connectionDialogOpen} onOpenChange={setConnectionDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">{editingConnection ? "Editar conexão" : "Nova conexão"}</DialogTitle>
            <DialogDescription>Vincule a conexão a um usuário e agente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Nome da Conexão</Label>
              <Input
                placeholder="Ex: WhatsApp Vendas, Suporte, etc."
                value={connectionForm.connectionName}
                onChange={(event) => setConnectionForm((prev) => ({ ...prev, connectionName: event.target.value }))}
                className="h-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipo</Label>
                <Select value={connectionForm.connectionType} onValueChange={(value) => setConnectionForm((prev) => ({ ...prev, connectionType: value }))}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primária</SelectItem>
                    <SelectItem value="secondary">Secundária</SelectItem>
                    <SelectItem value="support">Suporte</SelectItem>
                    <SelectItem value="sales">Vendas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-1">
                <div className="flex items-center gap-2">
                  <Switch checked={connectionForm.isPrimary} onCheckedChange={(checked) => setConnectionForm((prev) => ({ ...prev, isPrimary: checked }))} />
                  <Label className="text-sm">Principal</Label>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Usuário</Label>
              <Select value={connectionForm.userId} onValueChange={(value) => setConnectionForm((prev) => ({ ...prev, userId: value }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{user.name}</span>
                        <span className="text-xs text-slate-500">{user.email || connectionForm.userId}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Agente</Label>
              <Select value={connectionForm.agentId} onValueChange={(value) => setConnectionForm((prev) => ({ ...prev, agentId: value }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione um agente" />
                </SelectTrigger>
                <SelectContent>
                  {connectionAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-purple-600" />
                        {agent.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Número WhatsApp</Label>
              <Input
                placeholder="Ex: +5511999999999"
                value={connectionForm.phoneNumber}
                onChange={(event) => setConnectionForm((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                className="h-10"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg gap-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Conectado</Label>
                <p className="text-xs text-slate-500">Atualize manualmente se a sessão já estiver ativa</p>
              </div>
              <Switch checked={connectionForm.isConnected} onCheckedChange={(checked) => setConnectionForm((prev) => ({ ...prev, isConnected: checked }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => setConnectionDialogOpen(false)} className="h-10">
              Cancelar
            </Button>
            <Button onClick={() => saveConnectionMutation.mutate(connectionForm)} disabled={!connectionForm.userId || !connectionForm.agentId} className="h-10">
              {editingConnection ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Multi-Agent Dialog */}
      <Dialog open={multiAgentDialogOpen} onOpenChange={setMultiAgentDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Multi-Agentes
            </DialogTitle>
            <DialogDescription>
              Gerencie múltiplos agentes para a conexão{" "}
              <span className="font-medium text-slate-700">
                {selectedConnectionForAgents?.connectionName || selectedConnectionForAgents?.user?.name || "selecionada"}
              </span>
              {selectedConnectionForAgents?.phoneNumber && (
                <span className="text-slate-500"> ({selectedConnectionForAgents.phoneNumber})</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Add agent form */}
            <div className="flex gap-2">
              <Select value={addAgentId} onValueChange={setAddAgentId}>
                <SelectTrigger className="flex-1 h-10">
                  <SelectValue placeholder="Selecione um agente para vincular" />
                </SelectTrigger>
                <SelectContent>
                  {availableAgentsForConnection.length === 0 ? (
                    <SelectItem value="__none" disabled>Todos os agentes já estão vinculados</SelectItem>
                  ) : (
                    availableAgentsForConnection.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-purple-600" />
                          {agent.name}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-10 px-4"
                disabled={!addAgentId || addAgentId === "__none" || !selectedConnectionForAgents}
                onClick={() => {
                  if (selectedConnectionForAgents && addAgentId) {
                    addConnectionAgentMutation.mutate({
                      connectionId: selectedConnectionForAgents.id,
                      agentId: addAgentId,
                    });
                  }
                }}
              >
                <UserPlus className="w-4 h-4 mr-1" />
                Vincular
              </Button>
            </div>

            {/* Current agents list */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-700">Agente</TableHead>
                    <TableHead className="font-semibold text-slate-700">Status</TableHead>
                    <TableHead className="font-semibold text-slate-700">Vinculado em</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connectionAgentsList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Bot className="w-8 h-8 opacity-50" />
                          <p className="text-sm">Nenhum agente vinculado</p>
                          <p className="text-xs">Selecione um agente acima para vincular</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    connectionAgentsList.map((ca) => (
                      <TableRow key={ca.id} className="hover:bg-slate-50">
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-purple-600" />
                            <span className="font-medium text-sm">{ca.agent?.name || ca.agentId}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant={ca.isActive ? "default" : "secondary"} className="gap-1">
                            {ca.isActive ? (
                              <>
                                <Activity className="w-3 h-3" />
                                Ativo
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3 h-3" />
                                Inativo
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-sm text-slate-500">
                          {ca.assignedAt ? new Date(ca.assignedAt).toLocaleDateString("pt-BR") : "-"}
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={ca.isActive ? "Desativar" : "Ativar"}
                              onClick={() => {
                                if (selectedConnectionForAgents) {
                                  toggleConnectionAgentMutation.mutate({
                                    connectionId: selectedConnectionForAgents.id,
                                    agentId: ca.agentId,
                                    isActive: !ca.isActive,
                                  });
                                }
                              }}
                            >
                              <Shield className={`w-4 h-4 ${ca.isActive ? "text-green-600" : "text-slate-400"}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (selectedConnectionForAgents && confirm("Remover este agente da conexão?")) {
                                  removeConnectionAgentMutation.mutate({
                                    connectionId: selectedConnectionForAgents.id,
                                    agentId: ca.agentId,
                                  });
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Info about primary agent */}
            {selectedConnectionForAgents?.agent && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <Bot className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-800">
                  <p className="font-medium">Agente principal (1:1): {selectedConnectionForAgents.agent.name}</p>
                  <p className="mt-0.5 text-blue-600">
                    O agente principal é definido no campo &quot;Agente&quot; ao editar a conexão. Os agentes acima são vinculações adicionais (many-to-many).
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMultiAgentDialogOpen(false)} className="h-10">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
