import { type ChangeEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageSquareShare,
  RefreshCcw,
  Sparkles,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

import {
  artSourceLabel,
  formatRelative,
  prettifyStatus,
  requestTimestamp,
  statusVariant,
  type EstampariaRequestResponse,
} from "./estamparia-shared";

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EstampariaDetailPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/estamparia/:id");
  const requestId = match ? params.id : null;
  const [artDirectionDraft, setArtDirectionDraft] = useState("");
  const [reviewerNotesDraft, setReviewerNotesDraft] = useState("");
  const [approvalCaptionDraft, setApprovalCaptionDraft] = useState("");
  const [uploadLabel, setUploadLabel] = useState("Nenhuma arte enviada");

  const requestQuery = useQuery<EstampariaRequestResponse>({
    queryKey: ["/api/estamparia/request", requestId],
    enabled: Boolean(requestId),
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/estamparia/requests/${requestId}`);
      return response.json();
    },
  });

  const request = requestQuery.data?.request || null;

  useEffect(() => {
    if (!request) return;
    setArtDirectionDraft(request.artDirectionPrompt || "");
    setReviewerNotesDraft(request.reviewerNotes || "");
    setApprovalCaptionDraft(request.customerApprovalCaption || "");
    setUploadLabel(request.reviewerArtUrl ? "Arte do arte-finalista pronta" : "Nenhuma arte enviada");
  }, [request]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/estamparia/requests"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/estamparia/request", requestId] }),
    ]);
  };

  const patchMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!requestId) throw new Error("Pedido não encontrado");
      const response = await apiRequest("PATCH", `/api/estamparia/requests/${requestId}`, payload);
      return response.json();
    },
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Pedido atualizado", description: "As alterações foram salvas." });
    },
    onError: (error: any) => {
      toast({ title: "Falha ao salvar", description: error?.message || "Tente novamente.", variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      if (!requestId) throw new Error("Pedido não encontrado");
      const response = await apiRequest("POST", `/api/estamparia/requests/${requestId}/generate-art`);
      return response.json();
    },
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Nova arte gerada", description: "A IA criou uma nova versão para revisão." });
    },
    onError: (error: any) => {
      toast({ title: "Falha ao gerar", description: error?.message || "Tente novamente.", variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!requestId) throw new Error("Pedido não encontrado");
      const response = await apiRequest("POST", `/api/estamparia/requests/${requestId}/send-to-customer`, {
        caption: approvalCaptionDraft.trim(),
      });
      return response.json();
    },
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Arte enviada ao cliente", description: "Agora o pedido está aguardando a resposta do cliente." });
    },
    onError: (error: any) => {
      toast({ title: "Falha ao enviar", description: error?.message || "Tente novamente.", variant: "destructive" });
    },
  });

  const handleReviewerFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      setUploadLabel(file.name);
      await patchMutation.mutateAsync({
        reviewerArtUrl: dataUrl,
        currentArtSource: "reviewer",
        status: "pending_review",
      });
    } catch (error: any) {
      toast({ title: "Falha ao carregar arte", description: error?.message || "Arquivo inválido.", variant: "destructive" });
    } finally {
      event.target.value = "";
    }
  };

  if (!requestId) {
    return null;
  }

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => setLocation("/estamparia")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar aos pedidos
          </Button>
          {request ? (
            <>
              <Badge variant={statusVariant(request.status)}>{prettifyStatus(request.status)}</Badge>
              <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                {request.requestCode}
              </span>
            </>
          ) : null}
        </div>

        {requestQuery.isLoading ? (
          <Card className="border-border/70 bg-card/95 shadow-sm">
            <CardContent className="flex min-h-[320px] items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando pedido...
              </div>
            </CardContent>
          </Card>
        ) : !request ? (
          <Card className="border-border/70 bg-card/95 shadow-sm">
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <p className="text-lg font-semibold text-foreground">Pedido não encontrado</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Esse pedido pode ter sido removido ou você pode ter aberto um link antigo.
              </p>
              <Button type="button" onClick={() => setLocation("/estamparia")}>
                Voltar para a fila
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr),minmax(0,1.1fr)]">
            <div className="space-y-5">
              <Card className="border-border/70 bg-card/95 shadow-sm">
                <CardHeader className="border-b border-border/70">
                  <CardTitle>{request.requestTitle || request.productType || "Pedido sem título"}</CardTitle>
                  <CardDescription>
                    {request.contactName || request.contactNumber} • atualizado {formatRelative(requestTimestamp(request))}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={statusVariant(request.status)}>{prettifyStatus(request.status)}</Badge>
                    {request.briefingConfirmed ? <Badge variant="secondary">Briefing confirmado</Badge> : null}
                    {request.sourceConnectionName ? <Badge variant="outline">{request.sourceConnectionName}</Badge> : null}
                    <Badge variant="outline">{artSourceLabel(request)}</Badge>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Cliente</p>
                      <p className="mt-1 font-medium text-foreground">{request.contactName || request.contactNumber}</p>
                      <p className="text-sm text-muted-foreground">{request.contactNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Fluxo</p>
                      <p className="mt-1 font-medium text-foreground">
                        {request.briefingConfirmed ? "Pronto para arte" : "Coletando briefing"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {request.currentArtUrl ? "Arte pronta para revisão" : "A primeira arte é criada automaticamente quando o briefing fecha"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Resumo do pedido</p>
                    <p className="text-sm leading-6 text-foreground">
                      {request.briefingSummary || "A IA ainda está consolidando os detalhes da conversa."}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button type="button" variant="outline" onClick={() => setLocation(`/conversas/${request.conversationId}`)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Abrir conversa
                    </Button>
                    {request.currentArtUrl ? (
                      <Button type="button" variant="outline" onClick={() => regenerateMutation.mutate()} disabled={regenerateMutation.isPending}>
                        {regenerateMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="mr-2 h-4 w-4" />
                        )}
                        Gerar nova versão IA
                      </Button>
                    ) : (
                      <div className="flex items-center rounded-xl border border-dashed border-border/70 px-3 py-2 text-sm text-muted-foreground">
                        Aguardando a arte automática
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/95 shadow-sm">
                <CardHeader className="border-b border-border/70">
                  <CardTitle>Direção da arte</CardTitle>
                  <CardDescription>
                    Ajuste o briefing que será usado pela IA ou pelo arte-finalista.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="art-direction">Prompt da arte</Label>
                    <Textarea
                      id="art-direction"
                      value={artDirectionDraft}
                      onChange={(event) => setArtDirectionDraft(event.target.value)}
                      className="min-h-[180px] border-border/70"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="review-notes">Notas internas</Label>
                    <Textarea
                      id="review-notes"
                      value={reviewerNotesDraft}
                      onChange={(event) => setReviewerNotesDraft(event.target.value)}
                      className="min-h-[120px] border-border/70"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      patchMutation.mutate({
                        artDirectionPrompt: artDirectionDraft,
                        reviewerNotes: reviewerNotesDraft,
                      })
                    }
                    disabled={patchMutation.isPending}
                  >
                    Salvar direção da arte
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-5">
              <Card className="border-border/70 bg-card/95 shadow-sm">
                <CardHeader className="border-b border-border/70">
                  <CardTitle>Arte do pedido</CardTitle>
                  <CardDescription>
                    Revise a prévia automática, substitua por uma arte manual se quiser e envie ao cliente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  {request.currentArtUrl ? (
                    <img
                      src={request.currentArtUrl}
                      alt={request.requestTitle || "Arte do pedido"}
                      className="h-auto w-full rounded-2xl border border-border/70 bg-card object-cover"
                    />
                  ) : (
                    <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card px-6 text-center text-sm text-muted-foreground">
                      {request.briefingConfirmed
                        ? "A arte está sendo gerada automaticamente pela IA. Se quiser, você também pode subir a sua própria versão."
                        : "Assim que o briefing estiver completo, a IA gera a primeira versão automaticamente."}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{artSourceLabel(request)}</Badge>
                    {request.lastGeneratedAt ? <Badge variant="outline">IA {formatRelative(request.lastGeneratedAt)}</Badge> : null}
                    {request.approvedAt ? <Badge variant="secondary">Aprovado {formatRelative(request.approvedAt)}</Badge> : null}
                  </div>

                  <div className="space-y-3 rounded-2xl border border-border/70 bg-background p-4">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">Arte do arte-finalista</p>
                      <p className="text-sm text-muted-foreground">{uploadLabel}</p>
                    </div>
                    <Label
                      htmlFor="reviewer-upload"
                      className="inline-flex cursor-pointer items-center rounded-xl border border-border/70 bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Enviar arte pronta
                    </Label>
                    <Input id="reviewer-upload" type="file" accept="image/*" className="hidden" onChange={handleReviewerFile} />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/95 shadow-sm">
                <CardHeader className="border-b border-border/70">
                  <CardTitle>Envio para o cliente</CardTitle>
                  <CardDescription>
                    A mensagem entra no meio da conversa e a IA continua o atendimento a partir da resposta do cliente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="approval-caption">Legenda para o cliente</Label>
                    <Textarea
                      id="approval-caption"
                      value={approvalCaptionDraft}
                      onChange={(event) => setApprovalCaptionDraft(event.target.value)}
                      className="min-h-[120px] border-border/70"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => patchMutation.mutate({ customerApprovalCaption: approvalCaptionDraft })}
                    disabled={patchMutation.isPending}
                  >
                    Salvar legenda
                  </Button>

                  <div className="grid gap-3">
                    <Button
                      type="button"
                      onClick={() => sendMutation.mutate()}
                      disabled={sendMutation.isPending || !request.currentArtUrl}
                    >
                      {sendMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquareShare className="mr-2 h-4 w-4" />
                      )}
                      Enviar arte ao cliente
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => patchMutation.mutate({ status: "approved" })}
                      disabled={patchMutation.isPending}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Marcar como aprovado
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => patchMutation.mutate({ status: "changes_requested" })}
                      disabled={patchMutation.isPending}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Marcar alteração do cliente
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
