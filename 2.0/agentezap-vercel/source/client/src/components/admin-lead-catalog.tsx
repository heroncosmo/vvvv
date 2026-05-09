import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Globe2, Loader2, RefreshCw, Tags, UserRound } from "lucide-react";

import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LeadCatalogEntry = {
  id: string;
  contactName: string | null;
  contactNumber: string;
  sourceAccountName: string | null;
  sourceConnectionName: string | null;
  sourceConnectionPhone: string | null;
  catalogIsQualified: boolean;
  catalogScore: number;
  catalogGrade: string;
  catalogSegment: string | null;
  catalogPersona: string | null;
  catalogRegion: string | null;
  catalogStage: string | null;
  catalogSummary: string | null;
  catalogNeedSummary: string | null;
  catalogBuyerFitSummary: string | null;
  catalogSignals: string[];
  catalogConfidence: number;
  catalogLastAnalyzedAt: string | null;
};

function gradeBadge(grade: string) {
  const normalized = String(grade || "").toLowerCase();
  if (normalized === "alto") {
    return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">Alto</Badge>;
  }
  if (normalized === "medio") {
    return <Badge className="border-amber-200 bg-amber-100 text-amber-800">Medio</Badge>;
  }
  if (normalized === "baixo") {
    return <Badge className="border-sky-200 bg-sky-100 text-sky-800">Baixo</Badge>;
  }
  return <Badge variant="outline">Descartar</Badge>;
}

function stageBadge(stage: string | null) {
  const normalized = String(stage || "").toLowerCase();
  if (normalized === "urgente") {
    return <Badge className="border-rose-200 bg-rose-100 text-rose-800">Urgente</Badge>;
  }
  if (normalized === "qualificado") {
    return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">Qualificado</Badge>;
  }
  if (normalized === "interesse") {
    return <Badge className="border-blue-200 bg-blue-100 text-blue-800">Interesse</Badge>;
  }
  if (normalized === "novo") {
    return <Badge variant="secondary">Novo</Badge>;
  }
  return <Badge variant="outline">Descartar</Badge>;
}

export default function AdminLeadCatalog() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("todos");
  const [stage, setStage] = useState("todos");
  const [onlyQualified, setOnlyQualified] = useState(true);

  const { data: leads = [], isLoading, refetch } = useQuery<LeadCatalogEntry[]>({
    queryKey: ["/api/admin/lead-catalog", search, grade, stage, onlyQualified],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      params.set("grade", grade);
      params.set("stage", stage);
      params.set("onlyQualified", String(onlyQualified));
      const response = await apiRequest("GET", `/api/admin/lead-catalog?${params.toString()}`);
      return response.json();
    },
  });

  const reanalyzeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/admin/lead-intelligence/${id}/reanalyze`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lead-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lead-intelligence"] });
      toast({
        title: "Lead reanalisado",
        description: "O catalogo interno foi atualizado.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Nao foi possivel reanalisar o lead do catalogo.",
        variant: "destructive",
      });
    },
  });

  const qualifiedCount = leads.filter((lead) => lead.catalogIsQualified).length;
  const highValueCount = leads.filter((lead) => lead.catalogGrade === "alto").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total catalogado</CardDescription>
            <CardTitle className="text-3xl">{leads.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Qualificados</CardDescription>
            <CardTitle className="text-3xl">{qualifiedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Alto valor</CardDescription>
            <CardTitle className="text-3xl">{highValueCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Banco de Leads por IA</CardTitle>
              <CardDescription>
                Catalogo permanente de todos os leads interpretados pela IA para uso futuro e venda de leads.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Buscar por nome, numero, segmento ou conta"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="h-10 rounded-md border px-3 text-sm"
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
            >
              <option value="todos">Todos os graus</option>
              <option value="alto">Alto</option>
              <option value="medio">Medio</option>
              <option value="baixo">Baixo</option>
              <option value="descartar">Descartar</option>
            </select>
            <select
              className="h-10 rounded-md border px-3 text-sm"
              value={stage}
              onChange={(event) => setStage(event.target.value)}
            >
              <option value="todos">Todos os estagios</option>
              <option value="novo">Novo</option>
              <option value="interesse">Interesse</option>
              <option value="qualificado">Qualificado</option>
              <option value="urgente">Urgente</option>
              <option value="descartar">Descartar</option>
            </select>
            <label className="flex items-center gap-3 rounded-md border px-3">
              <input
                type="checkbox"
                checked={onlyQualified}
                onChange={(event) => setOnlyQualified(event.target.checked)}
              />
              <span className="text-sm">Mostrar so qualificados</span>
            </label>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {leads.map((lead) => (
            <article key={lead.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{lead.contactName || "Lead sem nome"}</h3>
                    {gradeBadge(lead.catalogGrade)}
                    {stageBadge(lead.catalogStage)}
                    <Badge variant="outline">Score {lead.catalogScore}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{lead.contactNumber}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {lead.sourceAccountName || "Conta sem nome"}
                    </span>
                    <span>{lead.sourceConnectionName || "WhatsApp principal"}</span>
                    {lead.sourceConnectionPhone ? <span>{lead.sourceConnectionPhone}</span> : null}
                  </div>
                </div>

                <Button size="sm" variant="outline" onClick={() => reanalyzeMutation.mutate(lead.id)}>
                  <RefreshCw className="mr-1 h-4 w-4" />
                  Reanalisar
                </Button>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Leitura da IA</p>
                  <p className="text-sm">{lead.catalogSummary || "Sem leitura registrada."}</p>
                  <p className="text-xs text-muted-foreground">{lead.catalogNeedSummary || "Sem necessidade resumida."}</p>
                </div>

                <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Perfil detectado</p>
                  <p className="flex items-center gap-2 text-sm">
                    <Tags className="h-4 w-4 text-muted-foreground" />
                    {lead.catalogSegment || "Segmento nao identificado"}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <UserRound className="h-3 w-3" />
                    {lead.catalogPersona || "Persona nao identificada"}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Globe2 className="h-3 w-3" />
                    {lead.catalogRegion || "Regiao nao identificada"}
                  </p>
                  <p className="text-xs text-muted-foreground">Confianca {lead.catalogConfidence}%</p>
                </div>

                <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aderencia comercial</p>
                  <p className="text-sm">{lead.catalogBuyerFitSummary || "Sem aderencia resumida."}</p>
                  <div className="flex flex-wrap gap-2">
                    {lead.catalogSignals.length > 0 ? (
                      lead.catalogSignals.map((signal) => (
                        <Badge key={signal} variant="secondary" className="font-normal">
                          {signal}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem sinais destacados.</span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}

          {!isLoading && leads.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum lead encontrado no banco com os filtros atuais.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
