import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  UserRound,
  XCircle,
} from "lucide-react";

import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type LeadInsight = {
  id: string;
  contactName: string | null;
  contactNumber: string;
  isPotential: boolean;
  potentialScore: number;
  potentialGrade: string;
  businessType: string | null;
  personaType: string | null;
  summary: string | null;
  qualificationReason: string | null;
  evidence: string[];
  recommendedApproach: string | null;
  recommendedMessage: string | null;
  confidence: number;
  adminStatus: string;
  campaignCount: number;
  lastCampaignAt: string | null;
  lastAnalyzedAt: string | null;
  sourceAccountName: string | null;
  sourceAccountEmail: string | null;
  sourceConnectionName: string | null;
  sourceConnectionPhone: string | null;
};

type LeadCampaignPreview = {
  leadId: string;
  conversationId: string;
  contactNumber: string;
  leadName: string;
  sourceAccountName: string | null;
  message: string;
  rationale: string;
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

function statusBadge(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") {
    return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">Aprovado</Badge>;
  }
  if (normalized === "queued") {
    return <Badge className="border-violet-200 bg-violet-100 text-violet-800">Na fila</Badge>;
  }
  if (normalized === "contacted") {
    return <Badge className="border-blue-200 bg-blue-100 text-blue-800">Contatado</Badge>;
  }
  if (normalized === "dismissed") {
    return <Badge variant="outline">Dispensado</Badge>;
  }
  return <Badge variant="secondary">Novo</Badge>;
}

function getLeadDisplayName(lead: Pick<LeadInsight, "contactName" | "contactNumber">) {
  return lead.contactName?.trim() || lead.contactNumber || "Cliente";
}

export default function AdminLeadIntelligence() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [onlyPotential, setOnlyPotential] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [manualBaseText, setManualBaseText] = useState("");
  const [suggestedTemplate, setSuggestedTemplate] = useState("");
  const [generationRationale, setGenerationRationale] = useState("");
  const [generatedPreviews, setGeneratedPreviews] = useState<LeadCampaignPreview[]>([]);
  const [minIntervalMinutes, setMinIntervalMinutes] = useState("10");
  const [maxIntervalMinutes, setMaxIntervalMinutes] = useState("10");
  const [batchSize, setBatchSize] = useState("10");
  const [batchPauseMinutes, setBatchPauseMinutes] = useState("10");
  const [sendAndDelete, setSendAndDelete] = useState(false);

  const { data: leads = [], isLoading, refetch } = useQuery<LeadInsight[]>({
    queryKey: ["/api/admin/lead-intelligence", search, grade, status, onlyPotential],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      params.set("grade", grade);
      params.set("status", status);
      params.set("onlyPotential", String(onlyPotential));
      const response = await apiRequest("GET", `/api/admin/lead-intelligence?${params.toString()}`);
      return response.json();
    },
  });

  const selectedIdsKey = useMemo(() => [...selectedIds].sort().join("|"), [selectedIds]);

  const selectedLeads = useMemo(
    () => leads.filter((lead) => selectedIds.includes(lead.id)),
    [leads, selectedIds],
  );

  const previewMap = useMemo(
    () => new Map(generatedPreviews.map((preview) => [preview.leadId, preview])),
    [generatedPreviews],
  );

  const readyToSend = selectedLeads.length > 0 && selectedLeads.every((lead) => previewMap.has(lead.id));
  const totalPotential = leads.filter((lead) => lead.isPotential).length;
  const highPotential = leads.filter((lead) => lead.potentialGrade === "alto").length;

  useEffect(() => {
    setGeneratedPreviews([]);
    setSuggestedTemplate("");
    setGenerationRationale("");
  }, [selectedIdsKey, manualBaseText]);

  const toggleSelection = (leadId: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(leadId) ? current : [...current, leadId];
      }
      return current.filter((id) => id !== leadId);
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds(checked ? leads.map((lead) => lead.id) : []);
  };

  const updatePreviewMessage = (leadId: string, message: string) => {
    setGeneratedPreviews((current) =>
      current.map((preview) => (preview.leadId === leadId ? { ...preview, message } : preview)),
    );
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, adminStatus }: { id: string; adminStatus: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/lead-intelligence/${id}`, { adminStatus });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lead-intelligence"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Nao foi possivel atualizar o status do lead.",
        variant: "destructive",
      });
    },
  });

  const reanalyzeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/admin/lead-intelligence/${id}/reanalyze`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lead-intelligence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lead-catalog"] });
      toast({
        title: "Lead reanalisado",
        description: "A classificacao interna foi atualizada.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Nao foi possivel reanalisar o lead.",
        variant: "destructive",
      });
    },
  });

  const generateMessageMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/lead-intelligence/generate-message", {
        leadIds: selectedIds,
        baseManualText: manualBaseText,
      });
      return response.json();
    },
    onSuccess: (data: {
      messageTemplate?: string;
      rationale?: string;
      previews?: LeadCampaignPreview[];
    }) => {
      setSuggestedTemplate(data.messageTemplate || "");
      setGenerationRationale(data.rationale || "");
      setGeneratedPreviews(Array.isArray(data.previews) ? data.previews : []);
      toast({
        title: "Mensagens geradas",
        description: "Revise a previa individual de cada lead antes de enviar.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Nao foi possivel gerar as mensagens com IA.",
        variant: "destructive",
      });
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/lead-intelligence/campaigns", {
        leadIds: selectedIds,
        name: campaignName,
        messageTemplate: suggestedTemplate || manualBaseText || generatedPreviews[0]?.message || "Oi {lead_nome}, tudo bem?",
        preparedMessages: generatedPreviews.map((preview) => ({
          leadId: preview.leadId,
          message: preview.message,
        })),
        minIntervalMinutes: Number(minIntervalMinutes),
        maxIntervalMinutes: Number(maxIntervalMinutes),
        batchSize: Number(batchSize),
        batchPauseMinutes: Number(batchPauseMinutes),
        aiVariation: false,
        antibotEnabled: true,
        sendAndDelete,
        autoStart: true,
      });
      return response.json();
    },
    onSuccess: (data: { totalRecipients: number }) => {
      setSelectedIds([]);
      setGeneratedPreviews([]);
      setSuggestedTemplate("");
      setGenerationRationale("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lead-intelligence"] });
      toast({
        title: sendAndDelete ? "Contato armado" : "Campanha iniciada",
        description: sendAndDelete
          ? `${data.totalRecipients || 0} lead(s) receberam a mensagem com apagar e vao responder com a mensagem da campanha quando voltarem.`
          : `${data.totalRecipients || 0} lead(s) enviados para a fila lenta do WhatsApp do admin.`,
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Nao foi possivel criar a campanha de leads.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total analisado</CardDescription>
                <CardTitle className="text-3xl">{leads.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Potenciais AgenteZap</CardDescription>
                <CardTitle className="text-3xl">{totalPotential}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Alto potencial</CardDescription>
                <CardTitle className="text-3xl">{highPotential}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Leads AgenteZap por IA
                  </CardTitle>
                  <CardDescription>
                    Lista interna de potenciais. Contatos que ja sao clientes da base nao aparecem aqui para nao poluir a prospeccao.
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Atualizar
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <Input
                  placeholder="Buscar por nome, numero ou conta"
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
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="todos">Todos os status</option>
                  <option value="new">Novo</option>
                  <option value="approved">Aprovado</option>
                  <option value="queued">Na fila</option>
                  <option value="contacted">Contatado</option>
                  <option value="dismissed">Dispensado</option>
                </select>
                <label className="flex items-center gap-3 rounded-md border px-3">
                  <input
                    type="checkbox"
                    checked={onlyPotential}
                    onChange={(event) => setOnlyPotential(event.target.checked)}
                  />
                  <span className="text-sm">Mostrar so potenciais</span>
                </label>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Checkbox
                  checked={leads.length > 0 && selectedIds.length === leads.length}
                  onCheckedChange={(checked) => toggleAllVisible(Boolean(checked))}
                />
                <p className="text-sm text-muted-foreground">
                  {selectedIds.length} lead(s) selecionado(s) para gerar a previa de campanha
                </p>
              </div>

              <div className="space-y-3">
                {leads.map((lead) => (
                  <article key={lead.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedIds.includes(lead.id)}
                          onCheckedChange={(checked) => toggleSelection(lead.id, Boolean(checked))}
                        />
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{getLeadDisplayName(lead)}</h3>
                            {gradeBadge(lead.potentialGrade)}
                            {statusBadge(lead.adminStatus)}
                            <Badge variant="outline">Score {lead.potentialScore}</Badge>
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
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: lead.id, adminStatus: "approved" })}>
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          Aprovar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: lead.id, adminStatus: "contacted" })}>
                          <UserRound className="mr-1 h-4 w-4" />
                          Contatado
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: lead.id, adminStatus: "dismissed" })}>
                          <XCircle className="mr-1 h-4 w-4" />
                          Dispensar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => reanalyzeMutation.mutate(lead.id)}>
                          <RefreshCw className="mr-1 h-4 w-4" />
                          Reanalisar
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-3">
                      <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Leitura da IA</p>
                        <p className="text-sm">{lead.summary || "Sem resumo."}</p>
                        <p className="text-xs text-muted-foreground">{lead.qualificationReason || "Sem justificativa."}</p>
                      </div>

                      <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Perfil detectado</p>
                        <p className="text-sm">{lead.businessType || "Tipo de negocio nao identificado"}</p>
                        <p className="text-xs text-muted-foreground">{lead.personaType || "Persona nao identificada"}</p>
                        <p className="text-xs text-muted-foreground">Confianca {lead.confidence}%</p>
                      </div>

                      <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Abordagem sugerida</p>
                        <p className="text-sm">{lead.recommendedApproach || "Sem abordagem sugerida."}</p>
                        <p className="text-xs text-muted-foreground">
                          Campanhas: {lead.campaignCount}
                          {lead.lastCampaignAt ? ` | Ultima: ${new Date(lead.lastCampaignAt).toLocaleString("pt-BR")}` : ""}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}

                {!isLoading && leads.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Nenhum lead AgenteZap encontrado com os filtros atuais.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Campanha para Leads
            </CardTitle>
            <CardDescription>
              Gere as mensagens em lote, revise uma a uma e envie exatamente a previa aprovada. A IA prioriza a abordagem sugerida e usa perfil detectado e leitura da IA como contexto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{selectedLeads.length} lead(s) selecionado(s)</p>
              <p className="text-muted-foreground">
                {selectedLeads.slice(0, 3).map((lead) => getLeadDisplayName(lead)).join(", ") || "Selecione leads na lista"}
                {selectedLeads.length > 3 ? ` +${selectedLeads.length - 3}` : ""}
              </p>
            </div>

            <Input
              placeholder="Nome da campanha"
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
            />

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Base manual opcional</p>
              <Textarea
                rows={7}
                placeholder="Escreva aqui a linha manual que deve orientar cada mensagem. A IA adapta por lead usando abordagem sugerida, perfil detectado e leitura da IA."
                value={manualBaseText}
                onChange={(event) => setManualBaseText(event.target.value)}
              />
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => generateMessageMutation.mutate()}
              disabled={selectedIds.length === 0 || generateMessageMutation.isPending}
            >
              {generateMessageMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Gerar mensagens de envio
            </Button>

            {generationRationale ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Base da geracao</p>
                <p className="text-muted-foreground">{generationRationale}</p>
                {suggestedTemplate ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Modelo consolidado: {suggestedTemplate}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Previa por lead</p>
                  <p className="text-xs text-muted-foreground">
                    O envio usa exatamente estas mensagens. Se alterar o texto-base ou a selecao, gere de novo.
                  </p>
                </div>
                <Badge variant={readyToSend ? "default" : "secondary"}>
                  {generatedPreviews.length}/{selectedLeads.length}
                </Badge>
              </div>

              {generatedPreviews.length > 0 ? (
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {generatedPreviews.map((preview) => (
                    <div key={preview.leadId} className="rounded-lg border bg-background p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{preview.leadName}</p>
                        <span className="text-xs text-muted-foreground">{preview.contactNumber}</span>
                        {preview.sourceAccountName ? (
                          <span className="text-xs text-muted-foreground">via {preview.sourceAccountName}</span>
                        ) : null}
                      </div>
                      <Textarea
                        rows={5}
                        value={preview.message}
                        onChange={(event) => updatePreviewMessage(preview.leadId, event.target.value)}
                      />
                      <p className="mt-2 text-xs text-muted-foreground">{preview.rationale}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Gere a previa depois de selecionar os leads. A requisicao sai em lote e volta com uma mensagem por contato.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Min. entre envios (min)</p>
                <Input value={minIntervalMinutes} onChange={(event) => setMinIntervalMinutes(event.target.value)} />
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Max. entre envios (min)</p>
                <Input value={maxIntervalMinutes} onChange={(event) => setMaxIntervalMinutes(event.target.value)} />
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Lote</p>
                <Input value={batchSize} onChange={(event) => setBatchSize(event.target.value)} />
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Pausa apos lote (min)</p>
                <Input value={batchPauseMinutes} onChange={(event) => setBatchPauseMinutes(event.target.value)} />
              </div>
            </div>

            <label className="flex items-start justify-between gap-3 rounded-md border px-3 py-3">
              <div>
                <span className="text-sm font-medium">Enviar, apagar e responder quando o lead voltar</span>
                <p className="text-xs text-muted-foreground">
                  Quando ligado, o sistema envia a mensagem, apaga e guarda esta mesma previa para responder assim que o lead retornar.
                </p>
              </div>
              <input type="checkbox" checked={sendAndDelete} onChange={(event) => setSendAndDelete(event.target.checked)} />
            </label>

            <Button
              className="w-full"
              onClick={() => createCampaignMutation.mutate()}
              disabled={!readyToSend || createCampaignMutation.isPending}
            >
              {createCampaignMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {sendAndDelete ? "Criar campanha com envio e apagar" : "Criar campanha e enviar lento"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
