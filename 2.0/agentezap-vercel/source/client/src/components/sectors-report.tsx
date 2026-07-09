import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BarChart3, Building2, Clock, Loader2, Sparkles, Users } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

interface SectorSummary {
  sectorId: string;
  sectorName: string;
  aiHandoffMode?: "copilot" | "human_only";
  assignedCount: number;
  closedCount: number;
  avgHours: number | null;
}

interface MemberSummary {
  memberId: string;
  memberName: string;
  memberEmail: string;
  assignedCount: number;
  closedCount: number;
  avgHours: number | null;
}

interface ReportSummary {
  period: { startDate: string; endDate: string };
  totalConversations: number;
  totalOpen: number;
  totalClosed: number;
  bySector: SectorSummary[];
  byMember: MemberSummary[];
}

interface SectorOption {
  id: string;
  name: string;
}

interface MemberOption {
  id: string;
  name: string;
  email: string;
}

interface ConversationRow {
  id: string;
  contactName?: string | null;
  contactNumber?: string | null;
  lastMessageText?: string | null;
  lastMessageTime?: string | null;
  updatedAt?: string | null;
  isClosed: boolean;
  orchestrationMode?: "ai" | "copilot" | "human" | null;
  routingIntent?: string | null;
  routingConfidence?: number | null;
  routingAt?: string | null;
  sectorId?: string | null;
  sectorName?: string | null;
  memberId?: string | null;
  memberName?: string | null;
}

function formatHours(hours: number | null) {
  if (hours == null || Number.isNaN(Number(hours))) {
    return "-";
  }

  const value = Number(hours);
  if (value < 1) {
    return `${Math.round(value * 60)} min`;
  }

  return `${value.toFixed(1)} h`;
}

function rate(closed: number, total: number) {
  return total > 0 ? `${Math.round((closed / total) * 100)}%` : "-";
}

function modeBadge(mode?: string | null) {
  if (mode === "human") {
    return { label: "Humano", className: "border-amber-300 bg-amber-50 text-amber-700" };
  }
  if (mode === "copilot") {
    return { label: "Copilot", className: "border-emerald-300 bg-emerald-50 text-emerald-700" };
  }
  return { label: "IA", className: "border-sky-300 bg-sky-50 text-sky-700" };
}

export default function SectorsReport() {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [filters, setFilters] = useState({
    startDate: thirtyDaysAgo,
    endDate: today,
    sectorId: "all",
    memberId: "all",
    status: "all",
  });

  const [appliedFilters, setAppliedFilters] = useState(filters);

  const { data: sectorsData } = useQuery<{ items: SectorOption[] }>({
    queryKey: ["/api/user/sectors"],
  });

  const { data: membersData } = useQuery<{ items: MemberOption[] }>({
    queryKey: ["/api/user/team-members-available"],
  });

  const summaryQuery = useQuery<ReportSummary>({
    queryKey: ["/api/user/sectors/reports", appliedFilters.startDate, appliedFilters.endDate],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/user/sectors/reports?startDate=${appliedFilters.startDate}&endDate=${appliedFilters.endDate}`,
      );
      return response.json();
    },
  });

  const conversationsQuery = useQuery<{ items: ConversationRow[] }>({
    queryKey: [
      "/api/user/sectors/reports/conversations",
      appliedFilters.startDate,
      appliedFilters.endDate,
      appliedFilters.sectorId,
      appliedFilters.memberId,
      appliedFilters.status,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: appliedFilters.startDate,
        endDate: appliedFilters.endDate,
        status: appliedFilters.status,
      });

      if (appliedFilters.sectorId !== "all") {
        params.set("sectorId", appliedFilters.sectorId);
      }

      if (appliedFilters.memberId !== "all") {
        params.set("memberId", appliedFilters.memberId);
      }

      const response = await apiRequest("GET", `/api/user/sectors/reports/conversations?${params.toString()}`);
      return response.json();
    },
  });

  const sectors = sectorsData?.items || [];
  const members = membersData?.items || [];
  const summary = summaryQuery.data;
  const conversations = conversationsQuery.data?.items || [];

  const topSector = useMemo(() => {
    return [...(summary?.bySector || [])].sort((left, right) => right.assignedCount - left.assignedCount)[0] || null;
  }, [summary]);

  const topMember = useMemo(() => {
    return [...(summary?.byMember || [])].sort((left, right) => right.assignedCount - left.assignedCount)[0] || null;
  }, [summary]);

  const isLoading = summaryQuery.isLoading || conversationsQuery.isLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Relatorios de setores e atendentes
        </CardTitle>
        <CardDescription>
          O dono acompanha distribuicao, desempenho e cada conversa roteada por setor ou por atendente.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
          <div className="space-y-1">
            <Label>Data inicial</Label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Data final</Label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Setor</Label>
            <Select
              value={filters.sectorId}
              onValueChange={(value) => setFilters((current) => ({ ...current, sectorId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os setores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os setores</SelectItem>
                {sectors.map((sector) => (
                  <SelectItem key={sector.id} value={sector.id}>
                    {sector.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Atendente</Label>
            <Select
              value={filters.memberId}
              onValueChange={(value) => setFilters((current) => ({ ...current, memberId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os atendentes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os atendentes</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Em aberto</SelectItem>
                <SelectItem value="closed">Fechadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full lg:w-auto" onClick={() => setAppliedFilters(filters)} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aplicar
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Carregando relatorios...
          </div>
        ) : !summary ? (
          <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-muted-foreground">
            Nenhum dado encontrado para o periodo selecionado.
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Card className="border-border/60 bg-muted/20 shadow-none">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Conversas</p>
                  <p className="mt-2 text-2xl font-bold">{summary.totalConversations}</p>
                  <p className="text-xs text-muted-foreground">Total roteado no periodo</p>
                </CardContent>
              </Card>
              <Card className="border-border/60 bg-muted/20 shadow-none">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Em aberto</p>
                  <p className="mt-2 text-2xl font-bold">{summary.totalOpen}</p>
                  <p className="text-xs text-muted-foreground">Atendimentos em curso</p>
                </CardContent>
              </Card>
              <Card className="border-border/60 bg-muted/20 shadow-none">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Fechadas</p>
                  <p className="mt-2 text-2xl font-bold">{summary.totalClosed}</p>
                  <p className="text-xs text-muted-foreground">Conversas encerradas</p>
                </CardContent>
              </Card>
              <Card className="border-border/60 bg-muted/20 shadow-none">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Setor lider</p>
                  <p className="mt-2 text-base font-semibold">{topSector?.sectorName || "-"}</p>
                  <p className="text-xs text-muted-foreground">
                    {topSector ? `${topSector.assignedCount} atribuicoes` : "Sem destaque"}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/60 bg-muted/20 shadow-none">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Atendente lider</p>
                  <p className="mt-2 text-base font-semibold">{topMember?.memberName || "-"}</p>
                  <p className="text-xs text-muted-foreground">
                    {topMember ? `${topMember.assignedCount} atribuicoes` : "Sem destaque"}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="sector" className="space-y-4">
              <TabsList>
                <TabsTrigger value="sector">
                  <Building2 className="mr-1 h-4 w-4" />
                  Por setor
                </TabsTrigger>
                <TabsTrigger value="member">
                  <Users className="mr-1 h-4 w-4" />
                  Por atendente
                </TabsTrigger>
                <TabsTrigger value="conversations">
                  <Clock className="mr-1 h-4 w-4" />
                  Conversas
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sector">
                <div className="rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Setor</TableHead>
                        <TableHead>Modo</TableHead>
                        <TableHead className="text-center">Atribuidas</TableHead>
                        <TableHead className="text-center">Fechadas</TableHead>
                        <TableHead className="text-center">Taxa</TableHead>
                        <TableHead className="text-center">Tempo medio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.bySector.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                            Nenhum dado por setor neste periodo.
                          </TableCell>
                        </TableRow>
                      ) : (
                        summary.bySector.map((row) => {
                          const handoff =
                            row.aiHandoffMode === "human_only"
                              ? { label: "Humano assume", className: "border-amber-300 bg-amber-50 text-amber-700" }
                              : { label: "IA em copilot", className: "border-emerald-300 bg-emerald-50 text-emerald-700" };

                          return (
                            <TableRow key={row.sectorId}>
                              <TableCell className="font-medium">{row.sectorName}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={handoff.className}>
                                  {handoff.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">{row.assignedCount}</TableCell>
                              <TableCell className="text-center">{row.closedCount}</TableCell>
                              <TableCell className="text-center">{rate(row.closedCount, row.assignedCount)}</TableCell>
                              <TableCell className="text-center">{formatHours(row.avgHours)}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="member">
                <div className="rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Atendente</TableHead>
                        <TableHead className="text-center">Atribuidas</TableHead>
                        <TableHead className="text-center">Fechadas</TableHead>
                        <TableHead className="text-center">Taxa</TableHead>
                        <TableHead className="text-center">Tempo medio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.byMember.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            Nenhum dado por atendente neste periodo.
                          </TableCell>
                        </TableRow>
                      ) : (
                        summary.byMember.map((row) => (
                          <TableRow key={row.memberId}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{row.memberName}</p>
                                <p className="text-xs text-muted-foreground">{row.memberEmail}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{row.assignedCount}</TableCell>
                            <TableCell className="text-center">{row.closedCount}</TableCell>
                            <TableCell className="text-center">{rate(row.closedCount, row.assignedCount)}</TableCell>
                            <TableCell className="text-center">{formatHours(row.avgHours)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="conversations" className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="h-4 w-4 text-emerald-600" />
                      Visao operacional
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Veja quem assumiu, em qual modo a conversa esta e para qual setor ela foi direcionada.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <Clock className="h-4 w-4 text-sky-600" />
                      Tempo e atividade
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Use ultima atividade e tempo medio para identificar filas lentas ou setores sobrecarregados.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <Users className="h-4 w-4 text-amber-600" />
                      Auditoria do dono
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Abra qualquer conversa para acompanhar atendimento humano e retorno da IA no mesmo historico.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Setor</TableHead>
                        <TableHead>Responsavel</TableHead>
                        <TableHead>Modo</TableHead>
                        <TableHead>Ultima atividade</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Abertura</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {conversations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                            Nenhuma conversa encontrada para os filtros aplicados.
                          </TableCell>
                        </TableRow>
                      ) : (
                        conversations.map((conversation) => {
                          const mode = modeBadge(conversation.orchestrationMode);
                          const when = conversation.updatedAt || conversation.lastMessageTime || conversation.routingAt;

                          return (
                            <TableRow key={conversation.id}>
                              <TableCell>
                                <div className="space-y-1">
                                  <p className="font-medium">
                                    {conversation.contactName || conversation.contactNumber || "Cliente sem nome"}
                                  </p>
                                  <p className="max-w-[320px] truncate text-xs text-muted-foreground">
                                    {conversation.lastMessageText || "Sem ultima mensagem registrada."}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>{conversation.sectorName || "-"}</TableCell>
                              <TableCell>{conversation.memberName || "-"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={mode.className}>
                                  {mode.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {when ? new Date(when).toLocaleString("pt-BR") : "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant={conversation.isClosed ? "secondary" : "default"}>
                                  {conversation.isClosed ? "Fechada" : "Aberta"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button asChild variant="outline" size="sm">
                                  <Link href={`/conversas/${conversation.id}`}>Abrir</Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>

            <p className="text-right text-xs text-muted-foreground">
              Periodo analisado: {appliedFilters.startDate} ate {appliedFilters.endDate}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
