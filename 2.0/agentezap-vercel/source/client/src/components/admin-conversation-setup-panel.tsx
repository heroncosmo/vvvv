import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Bot, CheckCircle2, Loader2, Rocket, Send, Sparkles } from "lucide-react";
import type { AdminSetupRequest, AdminSetupRequestMessage } from "@shared/schema";

interface SetupBundle {
  request: AdminSetupRequest | null;
  messages: AdminSetupRequestMessage[];
  reply?: string;
}

interface SetupPanelProps {
  conversationId: string;
  bundle: SetupBundle | undefined;
  onRefresh: () => Promise<void> | void;
}

function normalizePlan(planLike: any) {
  return {
    summary: String(planLike?.summary || "").trim(),
    pains: Array.isArray(planLike?.pains) ? planLike.pains : [],
    objectives: Array.isArray(planLike?.objectives) ? planLike.objectives : [],
    workflowKind: String(planLike?.workflowKind || "normal"),
    companyName: String(planLike?.companyName || "").trim(),
    agentNameSuggestion: String(planLike?.agentNameSuggestion || "Atendente").trim(),
    businessDescription: String(planLike?.businessDescription || "").trim(),
    mainOffer: String(planLike?.mainOffer || "").trim(),
    desiredBehavior: String(planLike?.desiredBehavior || "").trim(),
    modules: Array.isArray(planLike?.modules) ? planLike.modules : [],
    mediaSuggestions: Array.isArray(planLike?.mediaSuggestions) ? planLike.mediaSuggestions : [],
    missingData: Array.isArray(planLike?.missingData) ? planLike.missingData : [],
    checklist: Array.isArray(planLike?.checklist) ? planLike.checklist : [],
  };
}

export function AdminConversationSetupPanel({ conversationId, bundle, onRefresh }: SetupPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adjustment, setAdjustment] = useState("");

  const request = bundle?.request || null;
  const plan = useMemo(
    () => normalizePlan(request?.refinedPlan || request?.suggestedPlan || {}),
    [request],
  );
  const executionResult = (request?.executionResult || {}) as any;

  const invalidate = async () => {
    await Promise.resolve(onRefresh());
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations", conversationId, "details"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations"] });
  };

  const openMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/conversations/${conversationId}/setup-request/open`, {});
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: "Pedido assistido aberto" });
      await invalidate();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao abrir pedido",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/conversations/${conversationId}/setup-request/analyze`, {});
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: "Análise concluída" });
      await invalidate();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao analisar conversa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", `/api/admin/conversations/${conversationId}/setup-request/chat`, { message });
      return response.json();
    },
    onSuccess: async (data) => {
      setAdjustment("");
      toast({
        title: "Plano ajustado",
        description: data?.reply || "A IA atualizou o plano.",
      });
      await invalidate();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao ajustar plano",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/conversations/${conversationId}/setup-request/approve`, {});
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: "Plano aprovado" });
      await invalidate();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao aprovar plano",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/conversations/${conversationId}/setup-request/create`, {});
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: "Criação concluída" });
      await invalidate();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar configuração",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendResultMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/conversations/${conversationId}/setup-request/send-result`, {});
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: "Resultado enviado ao cliente" });
      await invalidate();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar resultado",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const canCreate = request?.approvalStatus === "approved";
  const canSend = request?.status === "created" && executionResult?.success;

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {request ? (
          <>
            <Badge variant="outline">Configuração assistida</Badge>
            <Badge variant="secondary">Status: {request.status}</Badge>
            <Badge variant="secondary">Análise: {request.analysisStatus}</Badge>
            <Badge variant="secondary">Aprovação: {request.approvalStatus}</Badge>
            <Badge variant="secondary">Execução: {request.executionStatus}</Badge>
          </>
        ) : (
          <Badge variant="outline">Sem pedido assistido</Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!request && (
          <Button size="sm" onClick={() => openMutation.mutate()} disabled={openMutation.isPending}>
            {openMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Abrir pedido
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending || !request}
        >
          {analyzeMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
          Analisar conversa
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => approveMutation.mutate()}
          disabled={approveMutation.isPending || !request}
        >
          {approveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Aprovar plano
        </Button>
        <Button
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !canCreate}
        >
          {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
          Criar tudo agora
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => sendResultMutation.mutate()}
          disabled={sendResultMutation.isPending || !canSend}
        >
          {sendResultMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Enviar acesso
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr] flex-1 min-h-0">
        <div className="space-y-4 min-h-0">
          <Card>
            <CardHeader>
              <CardTitle>Plano sugerido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Resumo</div>
                <p className="text-sm whitespace-pre-wrap">{plan.summary || "Ainda sem resumo."}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Empresa</div>
                  <p className="text-sm">{plan.companyName || "Não identificado"}</p>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Tipo sugerido</div>
                  <p className="text-sm">{plan.workflowKind || "normal"}</p>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Agente sugerido</div>
                  <p className="text-sm">{plan.agentNameSuggestion || "Atendente"}</p>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Oferta principal</div>
                  <p className="text-sm">{plan.mainOffer || "Não definida"}</p>
                </div>
              </div>
              <Separator />
              <div>
                <div className="text-xs text-muted-foreground mb-2">Dores do cliente</div>
                <div className="flex flex-wrap gap-2">
                  {plan.pains.length > 0 ? plan.pains.map((item: string, index: number) => (
                    <Badge key={`${item}-${index}`} variant="secondary">{item}</Badge>
                  )) : <span className="text-sm text-muted-foreground">Nenhuma dor consolidada ainda.</span>}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Objetivos</div>
                <div className="flex flex-wrap gap-2">
                  {plan.objectives.length > 0 ? plan.objectives.map((item: string, index: number) => (
                    <Badge key={`${item}-${index}`} variant="secondary">{item}</Badge>
                  )) : <span className="text-sm text-muted-foreground">Nenhum objetivo consolidado ainda.</span>}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Módulos sugeridos</div>
                <div className="flex flex-wrap gap-2">
                  {plan.modules.length > 0 ? plan.modules.map((item: string, index: number) => (
                    <Badge key={`${item}-${index}`}>{item}</Badge>
                  )) : <span className="text-sm text-muted-foreground">Nenhum módulo definido.</span>}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Prompt base / comportamento</div>
                <p className="text-sm whitespace-pre-wrap">{plan.desiredBehavior || plan.businessDescription || "Ainda sem prompt base."}</p>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Mídias / fluxos sugeridos</div>
                <div className="space-y-2">
                  {plan.mediaSuggestions.length > 0 ? plan.mediaSuggestions.map((item: any, index: number) => (
                    <div key={`${item.name}-${index}`} className="rounded border p-2 text-sm">
                      <div className="font-medium">{item.name} <span className="text-xs text-muted-foreground">({item.type})</span></div>
                      <div>{item.description}</div>
                      <div className="text-xs text-muted-foreground mt-1">Usar quando: {item.whenToUse}</div>
                    </div>
                  )) : <span className="text-sm text-muted-foreground">Nenhuma mídia sugerida.</span>}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Dados faltantes</div>
                  <ul className="text-sm space-y-1">
                    {plan.missingData.length > 0 ? plan.missingData.map((item: string, index: number) => (
                      <li key={`${item}-${index}`}>• {item}</li>
                    )) : <li className="text-muted-foreground">Nenhuma lacuna crítica listada.</li>}
                  </ul>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Checklist final</div>
                  <ul className="text-sm space-y-1">
                    {plan.checklist.length > 0 ? plan.checklist.map((item: string, index: number) => (
                      <li key={`${item}-${index}`}>• {item}</li>
                    )) : <li className="text-muted-foreground">Nenhum checklist disponível.</li>}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pedir ajuste para IA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={adjustment}
                onChange={(event) => setAdjustment(event.target.value)}
                placeholder="Explique para a IA o que precisa mudar no plano antes de criar."
                className="min-h-[120px]"
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => adjustMutation.mutate(adjustment)}
                  disabled={adjustMutation.isPending || !request || !adjustment.trim()}
                >
                  {adjustMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                  Pedir ajuste para IA
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 min-h-0">
          <Card>
            <CardHeader>
              <CardTitle>Status da execução</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Array.isArray(executionResult?.steps) && executionResult.steps.length > 0 ? executionResult.steps.map((step: any) => (
                <div key={step.id} className="rounded border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{step.id}</span>
                    <Badge variant={step.status === "success" ? "default" : step.status === "failed" ? "destructive" : "secondary"}>
                      {step.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground mt-1">{step.detail}</div>
                </div>
              )) : (
                <p className="text-muted-foreground">A execução ainda não começou.</p>
              )}

              {executionResult?.panelUrl && (
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground mb-1">Painel gerado</div>
                  <a href={executionResult.panelUrl} target="_blank" rel="noreferrer" className="text-primary break-all">
                    {executionResult.panelUrl}
                  </a>
                </div>
              )}
              {executionResult?.simulatorUrl && (
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground mb-1">Simulador gerado</div>
                  <a href={executionResult.simulatorUrl} target="_blank" rel="noreferrer" className="text-primary break-all">
                    {executionResult.simulatorUrl}
                  </a>
                </div>
              )}
              {executionResult?.error && (
                <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-destructive">
                  {executionResult.error}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-0">
            <CardHeader>
              <CardTitle>Histórico da IA</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[420px] pr-3">
                <div className="space-y-3">
                  {bundle?.messages?.length ? bundle.messages.map((message) => (
                    <div key={message.id} className="rounded border p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Badge variant={message.role === "assistant" ? "default" : "outline"}>
                          {message.role === "assistant" ? "IA" : "Dono"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(message.createdAt).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">Sem histórico de ajustes ainda.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
