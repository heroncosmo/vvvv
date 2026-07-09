import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SectorHandoffMode = "copilot" | "human_only";
type MemberReplyScope = "assigned_only" | "shared";

interface Sector {
  id: string;
  name: string;
  description?: string | null;
  keywords?: string[];
  member_count?: number;
  ai_handoff_mode?: SectorHandoffMode;
  aiHandoffMode?: SectorHandoffMode;
  controlled_handoff_enabled?: boolean;
  controlledHandoffEnabled?: boolean;
  member_reply_scope?: MemberReplyScope;
  memberReplyScope?: MemberReplyScope;
}

interface SectorMember {
  id: string;
  sector_id: string;
  member_id: string;
  member_name: string;
  member_email: string;
  member_role: string;
  member_is_active: boolean;
  is_primary: boolean;
  can_receive_tickets: boolean;
  max_open_tickets: number;
  current_open_tickets: number;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

const defaultSectorForm = {
  name: "",
  description: "",
  keywordsText: "",
  aiHandoffMode: "copilot" as SectorHandoffMode,
  controlledHandoffEnabled: true,
  memberReplyScope: "assigned_only" as MemberReplyScope,
};

const defaultMemberForm = {
  memberId: "",
  isPrimary: false,
  maxOpenTickets: 10,
  canReceiveTickets: true,
};

function resolveHandoffMode(sector?: Sector | null): SectorHandoffMode {
  return sector?.aiHandoffMode || sector?.ai_handoff_mode || "copilot";
}

function resolveControlledHandoffEnabled(sector?: Sector | null): boolean {
  if (!sector) {
    return true;
  }

  if (sector.controlledHandoffEnabled === false || sector.controlled_handoff_enabled === false) {
    return false;
  }

  return true;
}

function resolveMemberReplyScope(sector?: Sector | null): MemberReplyScope {
  return sector?.memberReplyScope || sector?.member_reply_scope || "assigned_only";
}

function handoffBadge(mode: SectorHandoffMode) {
  if (mode === "human_only") {
    return {
      label: "Humano assume",
      className: "border-amber-300 bg-amber-50 text-amber-700",
      helper: "A IA pausa ao entrar no setor.",
    };
  }

  return {
    label: "IA em copilot",
    className: "border-emerald-300 bg-emerald-50 text-emerald-700",
    helper: "A IA pode continuar apoiando o setor.",
  };
}

function collaborationBadge(scope: MemberReplyScope) {
  if (scope === "shared") {
    return {
      label: "Resposta colaborativa",
      className: "border-sky-300 bg-sky-50 text-sky-700",
      helper: "Qualquer membro do setor pode responder conversas já em andamento.",
    };
  }

  return {
    label: "Resposta do responsável",
    className: "border-slate-300 bg-slate-50 text-slate-700",
    helper: "Só o membro que assumiu continua a conversa após atendimento humano.",
  };
}

export default function SectorsManager() {
  const { toast } = useToast();
  const [sectorDialogOpen, setSectorDialogOpen] = useState(false);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [sectorForm, setSectorForm] = useState(defaultSectorForm);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [activeSector, setActiveSector] = useState<Sector | null>(null);
  const [addMemberForm, setAddMemberForm] = useState(defaultMemberForm);

  const { data: sectorsData, isLoading: loadingSectors } = useQuery<{ items: Sector[] }>({
    queryKey: ["/api/user/sectors"],
  });

  const { data: membersData, isLoading: loadingMembers } = useQuery<{ items: SectorMember[] }>({
    queryKey: ["/api/user/sectors", activeSector?.id, "members"],
    enabled: membersDialogOpen && !!activeSector,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/user/sectors/${activeSector?.id}/members`);
      return response.json();
    },
  });

  const { data: teamMembersData } = useQuery<{ items: TeamMember[] }>({
    queryKey: ["/api/user/team-members-available"],
    enabled: membersDialogOpen,
  });

  const sectors = sectorsData?.items || [];
  const sectorMembers = membersData?.items || [];
  const teamMembers = teamMembersData?.items || [];

  const availableTeamMembers = useMemo(() => {
    const linkedIds = new Set(sectorMembers.map((item) => item.member_id));
    return teamMembers.filter((item) => item.is_active && !linkedIds.has(item.id));
  }, [teamMembers, sectorMembers]);

  const createSectorMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      description?: string | null;
      keywords: string[];
      aiHandoffMode: SectorHandoffMode;
      controlledHandoffEnabled: boolean;
      memberReplyScope: MemberReplyScope;
    }) => {
      const response = await apiRequest("POST", "/api/user/sectors", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors"] });
      setSectorDialogOpen(false);
      setSectorForm(defaultSectorForm);
      setEditingSector(null);
      toast({ title: "Setor criado com sucesso." });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar setor",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateSectorMutation = useMutation({
    mutationFn: async ({ id, payload }: {
      id: string;
      payload: {
        name: string;
        description?: string | null;
        keywords: string[];
        aiHandoffMode: SectorHandoffMode;
        controlledHandoffEnabled: boolean;
        memberReplyScope: MemberReplyScope;
      };
    }) => {
      const response = await apiRequest("PATCH", `/api/user/sectors/${id}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors"] });
      setSectorDialogOpen(false);
      setSectorForm(defaultSectorForm);
      setEditingSector(null);
      toast({ title: "Setor atualizado com sucesso." });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar setor",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteSectorMutation = useMutation({
    mutationFn: async (sectorId: string) => {
      await apiRequest("DELETE", `/api/user/sectors/${sectorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors"] });
      toast({ title: "Setor removido." });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover setor",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/user/sectors/${activeSector?.id}/members`, addMemberForm);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors", activeSector?.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors"] });
      setAddMemberForm(defaultMemberForm);
      toast({ title: "Membro vinculado ao setor." });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao vincular membro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await apiRequest("DELETE", `/api/user/sectors/${activeSector?.id}/members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors", activeSector?.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors"] });
      toast({ title: "Membro removido do setor." });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover membro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const openCreateSector = () => {
    setEditingSector(null);
    setSectorForm(defaultSectorForm);
    setSectorDialogOpen(true);
  };

  const openEditSector = (sector: Sector) => {
    setEditingSector(sector);
    setSectorForm({
      name: sector.name,
      description: sector.description || "",
      keywordsText: (sector.keywords || []).join(", "),
      aiHandoffMode: resolveHandoffMode(sector),
      controlledHandoffEnabled: resolveControlledHandoffEnabled(sector),
      memberReplyScope: resolveMemberReplyScope(sector),
    });
    setSectorDialogOpen(true);
  };

  const openMembersDialog = (sector: Sector) => {
    setActiveSector(sector);
    setAddMemberForm(defaultMemberForm);
    setMembersDialogOpen(true);
  };

  const handleSubmitSector = () => {
    const payload = {
      name: sectorForm.name.trim(),
      description: sectorForm.description.trim() || null,
      keywords: sectorForm.keywordsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      aiHandoffMode: sectorForm.aiHandoffMode,
      controlledHandoffEnabled: sectorForm.controlledHandoffEnabled,
      memberReplyScope: sectorForm.memberReplyScope,
    };

    if (!payload.name) {
      toast({ title: "Informe o nome do setor.", variant: "destructive" });
      return;
    }

    if (editingSector) {
      updateSectorMutation.mutate({ id: editingSector.id, payload });
      return;
    }

    createSectorMutation.mutate(payload);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Setores de atendimento
            </CardTitle>
            <CardDescription className="max-w-3xl">
              Separe a operacao por times. A IA interpreta o contexto da conversa, direciona para o setor mais adequado
              e cada setor define se o humano assume ou se a IA continua como copilot.
            </CardDescription>
          </div>

          <Button onClick={openCreateSector}>
            <Plus className="mr-2 h-4 w-4" />
            Novo setor
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {loadingSectors ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Carregando setores...
          </div>
        ) : sectors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center">
            <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Nenhum setor criado.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Comece por Comercial, Financeiro, Suporte ou qualquer estrutura que faça sentido para sua operacao.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setor</TableHead>
                  <TableHead>Modo de handoff</TableHead>
                  <TableHead>Sinais de contexto</TableHead>
                  <TableHead className="text-center">Membros</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sectors.map((sector) => {
                  const badge = handoffBadge(resolveHandoffMode(sector));
                  const collaboration = collaborationBadge(resolveMemberReplyScope(sector));
                  const controlledHandoffEnabled = resolveControlledHandoffEnabled(sector);

                  return (
                    <TableRow key={sector.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{sector.name}</p>
                          <p className="max-w-[320px] text-xs text-muted-foreground">
                            {sector.description || "Sem descricao configurada."}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <Badge variant="outline" className={badge.className}>
                            {badge.label}
                          </Badge>
                          <p className="text-xs text-muted-foreground">{badge.helper}</p>
                          <Badge
                            variant="outline"
                            className={
                              controlledHandoffEnabled
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-orange-300 bg-orange-50 text-orange-700"
                            }
                          >
                            {controlledHandoffEnabled ? "Handoff controlado ativo" : "Fila visível para o setor"}
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            {controlledHandoffEnabled
                              ? "Após resposta humana, a conversa deixa de aparecer para os demais membros."
                              : "Todos os membros do setor continuam vendo as conversas desse setor."}
                          </p>
                          <Badge variant="outline" className={collaboration.className}>
                            {collaboration.label}
                          </Badge>
                          <p className="text-xs text-muted-foreground">{collaboration.helper}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[260px] flex-wrap gap-1">
                          {(sector.keywords || []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">Sem pistas configuradas.</span>
                          ) : (
                            (sector.keywords || []).slice(0, 5).map((keyword) => (
                              <Badge key={keyword} variant="secondary" className="text-xs">
                                {keyword}
                              </Badge>
                            ))
                          )}
                          {(sector.keywords || []).length > 5 && (
                            <Badge variant="outline" className="text-xs">
                              +{(sector.keywords || []).length - 5}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          onClick={() => openMembersDialog(sector)}
                        >
                          <Users className="h-3.5 w-3.5" />
                          {sector.member_count ?? 0}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openMembersDialog(sector)}>
                            <UserPlus className="mr-1 h-3.5 w-3.5" />
                            Membros
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEditSector(sector)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            disabled={deleteSectorMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`Excluir o setor "${sector.name}"?`)) {
                                deleteSectorMutation.mutate(sector.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Roteamento semantico
            </div>
            <p className="text-sm text-muted-foreground">
              A IA usa a mensagem do cliente para inferir o melhor setor. As pistas cadastradas ajudam no contexto,
              mas o roteador nao depende de combinacao literal.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Workflow className="h-4 w-4 text-sky-600" />
              Handoff por setor
            </div>
            <p className="text-sm text-muted-foreground">
              Escolha se o setor recebe a conversa com a IA ainda ativa em copilot ou se o humano assume por completo.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <ArrowRight className="h-4 w-4 text-amber-600" />
              Encaminhamento operacional
            </div>
            <p className="text-sm text-muted-foreground">
              Atendentes podem transferir entre setores, entre membros e devolver a conversa para a IA sem perder historico.
            </p>
          </div>
        </div>
      </CardContent>

      <Dialog
        open={sectorDialogOpen}
        onOpenChange={(open) => {
          setSectorDialogOpen(open);
          if (!open) {
            setEditingSector(null);
            setSectorForm(defaultSectorForm);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSector ? "Editar setor" : "Novo setor"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sector-name">Nome do setor</Label>
              <Input
                id="sector-name"
                value={sectorForm.name}
                onChange={(event) => setSectorForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ex: Comercial, Financeiro, Suporte"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sector-description">Descricao</Label>
              <Textarea
                id="sector-description"
                rows={3}
                value={sectorForm.description}
                onChange={(event) => setSectorForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Explique quando esse setor deve assumir a conversa."
              />
            </div>

            <div className="space-y-2">
              <Label>Modo de handoff com a IA</Label>
              <Select
                value={sectorForm.aiHandoffMode}
                onValueChange={(value: SectorHandoffMode) =>
                  setSectorForm((current) => ({ ...current, aiHandoffMode: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o modo do setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="copilot">IA continua em copilot</SelectItem>
                  <SelectItem value="human_only">Humano assume e IA pausa</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Em copilot a IA pode continuar apoiando o setor. Em humano assume, a IA fica pausada ate que alguem devolva a conversa.
              </p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="controlled-handoff" className="text-sm font-medium">
                    Handoff controlado
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Quando ativo, a conversa deixa de aparecer para os outros membros depois que um humano assume.
                  </p>
                </div>
                <Switch
                  id="controlled-handoff"
                  checked={sectorForm.controlledHandoffEnabled}
                  onCheckedChange={(checked) =>
                    setSectorForm((current) => ({ ...current, controlledHandoffEnabled: checked }))
                  }
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {sectorForm.controlledHandoffEnabled
                  ? "Ativo: a fila fica protegida assim que um membro começa o atendimento humano."
                  : "Desativado: todos os membros do setor continuam vendo as conversas desse setor."}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Colaboração entre membros</Label>
              <Select
                value={sectorForm.memberReplyScope}
                onValueChange={(value: MemberReplyScope) =>
                  setSectorForm((current) => ({ ...current, memberReplyScope: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Defina quem pode responder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assigned_only">Só o responsável atual continua</SelectItem>
                  <SelectItem value="shared">Qualquer membro do setor pode responder</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {sectorForm.memberReplyScope === "shared"
                  ? "Modo colaborativo: qualquer membro do setor pode entrar na conversa e responder."
                  : "Modo protegido: só o membro que assumiu o atendimento continua a conversa após atendimento humano."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sector-context">Pistas de contexto para o roteador</Label>
              <Input
                id="sector-context"
                value={sectorForm.keywordsText}
                onChange={(event) => setSectorForm((current) => ({ ...current, keywordsText: event.target.value }))}
                placeholder="Ex: boleto, segunda via, cancelamento, contrato"
              />
              <p className="text-xs text-muted-foreground">
                Separe por virgulas. Isso ajuda a IA a reconhecer melhor o tipo de demanda.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSectorDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitSector}
              disabled={!sectorForm.name.trim() || createSectorMutation.isPending || updateSectorMutation.isPending}
            >
              {(createSectorMutation.isPending || updateSectorMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingSector ? "Salvar setor" : "Criar setor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Membros do setor {activeSector ? `- ${activeSector.name}` : ""}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="linked">
            <TabsList>
              <TabsTrigger value="linked">Vinculados ({sectorMembers.length})</TabsTrigger>
              <TabsTrigger value="add">Adicionar membro</TabsTrigger>
            </TabsList>

            <TabsContent value="linked" className="space-y-3">
              {loadingMembers ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Carregando membros...
                </div>
              ) : sectorMembers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center">
                  <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">Nenhum membro vinculado.</p>
                  <p className="text-sm text-muted-foreground">
                    Vincule pelo menos um atendente para este setor receber atribuicoes automaticamente.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Membro</TableHead>
                        <TableHead>Cargo</TableHead>
                        <TableHead>Prioridade</TableHead>
                        <TableHead>Recebe atribuicoes</TableHead>
                        <TableHead>Carga</TableHead>
                        <TableHead className="text-right">Acoes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sectorMembers.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{member.member_name}</p>
                              <p className="text-xs text-muted-foreground">{member.member_email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{member.member_role}</Badge>
                          </TableCell>
                          <TableCell>
                            {member.is_primary ? (
                              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                <Star className="mr-1 h-3 w-3" />
                                Principal
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Normal</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={member.can_receive_tickets ? "default" : "secondary"}>
                              {member.can_receive_tickets ? "Sim" : "Nao"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {member.current_open_tickets}/{member.max_open_tickets}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:bg-destructive/10"
                                disabled={removeMemberMutation.isPending}
                                onClick={() => {
                                  if (window.confirm(`Remover ${member.member_name} deste setor?`)) {
                                    removeMemberMutation.mutate(member.member_id);
                                  }
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="add" className="space-y-4">
              <div className="space-y-2">
                <Label>Membro da equipe</Label>
                <Select
                  value={addMemberForm.memberId}
                  onValueChange={(value) => setAddMemberForm((current) => ({ ...current, memberId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um membro..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTeamMembers.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        Nenhum membro disponivel
                      </SelectItem>
                    ) : (
                      availableTeamMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name} - {member.email}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <div>
                  <Label className="text-sm">Membro principal</Label>
                  <p className="text-xs text-muted-foreground">
                    Recebe prioridade quando houver atribuicao automatica no setor.
                  </p>
                </div>
                <Switch
                  checked={addMemberForm.isPrimary}
                  onCheckedChange={(value) => setAddMemberForm((current) => ({ ...current, isPrimary: value }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <div>
                  <Label className="text-sm">Pode receber atribuicoes</Label>
                  <p className="text-xs text-muted-foreground">
                    Se desligado, o membro continua no setor mas nao entra na distribuicao automatica.
                  </p>
                </div>
                <Switch
                  checked={addMemberForm.canReceiveTickets}
                  onCheckedChange={(value) =>
                    setAddMemberForm((current) => ({ ...current, canReceiveTickets: value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-open-tickets">Maximo de atendimentos simultaneos</Label>
                <Input
                  id="max-open-tickets"
                  type="number"
                  min={1}
                  max={100}
                  value={addMemberForm.maxOpenTickets}
                  onChange={(event) =>
                    setAddMemberForm((current) => ({
                      ...current,
                      maxOpenTickets: Number(event.target.value) || 1,
                    }))
                  }
                />
              </div>

              <Button
                className="w-full"
                onClick={() => addMemberMutation.mutate()}
                disabled={!addMemberForm.memberId || addMemberMutation.isPending}
              >
                {addMemberMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <UserPlus className="mr-2 h-4 w-4" />
                Vincular ao setor
              </Button>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
