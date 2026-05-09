import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Bot, Loader2, Sparkles, UserRound, Users } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";

interface CurrentRouting {
  sector_id?: string | null;
  sector_name?: string | null;
  assigned_to_member_id?: string | null;
  assigned_member_name?: string | null;
  orchestration_mode?: "ai" | "copilot" | "human" | null;
  can_change_sector?: boolean;
  canChangeSector?: boolean;
  transfer_lock_reason?: string | null;
  transferLockReason?: string | null;
  has_manual_human_reply_since_handoff?: boolean;
}

interface SectorOption {
  id: string;
  name: string;
  description?: string | null;
  aiHandoffMode?: "copilot" | "human_only";
  memberCount?: number;
}

interface MemberOption {
  id: string;
  name: string;
  email: string;
  role: string;
  sectorId: string;
  sectorName: string;
  isPrimary?: boolean;
  canReceiveTickets?: boolean;
}

interface RoutingOptionsResponse {
  current?: CurrentRouting | null;
  sectors: SectorOption[];
  members: MemberOption[];
}

interface TransferResult {
  sectorId: string | null;
  sectorName: string | null;
  assignedMemberId: string | null;
  assignedMemberName: string | null;
  orchestrationMode: "ai" | "copilot" | "human";
}

interface ConversationTransferProps {
  conversationId: string;
  currentSectorId?: string | null;
  currentSectorName?: string | null;
  onTransferred?: (result: TransferResult) => void;
  triggerClassName?: string;
  showLabel?: boolean;
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

export default function ConversationTransfer({
  conversationId,
  currentSectorId,
  currentSectorName,
  onTransferred,
  triggerClassName,
  showLabel = true,
}: ConversationTransferProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [targetType, setTargetType] = useState<"sector" | "member" | "ai">("sector");
  const [targetSectorId, setTargetSectorId] = useState("");
  const [targetMemberId, setTargetMemberId] = useState("");
  const [reason, setReason] = useState("");

  const routingOptionsQuery = useQuery<RoutingOptionsResponse>({
    queryKey: ["/api/conversations", conversationId, "routing-options"],
    enabled: open,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/conversations/${conversationId}/routing-options`);
      return response.json();
    },
  });

  const sectors = useMemo(
    () => (routingOptionsQuery.data?.sectors || []).filter((sector) => sector.id !== currentSectorId),
    [routingOptionsQuery.data?.sectors, currentSectorId],
  );
  const members = routingOptionsQuery.data?.members || [];
  const current = routingOptionsQuery.data?.current;
  const currentMode = modeBadge(current?.orchestration_mode);
  const currentLockReason = current?.transferLockReason || current?.transfer_lock_reason || null;
  const canChangeSector = current?.canChangeSector ?? current?.can_change_sector ?? true;
  const lockedSectorId = current?.sector_id || currentSectorId || "";

  const membersForSelectedSector = useMemo(() => {
    const scopedMembers = !targetSectorId
      ? members
      : members.filter((member) => member.sectorId === targetSectorId);

    if (canChangeSector || !lockedSectorId) {
      return scopedMembers;
    }

    return scopedMembers.filter((member) => member.sectorId === lockedSectorId);
  }, [canChangeSector, lockedSectorId, members, targetSectorId]);

  const transferMutation = useMutation({
    mutationFn: async () => {
      const selectedMember = members.find((member) => member.id === targetMemberId);
      const payload =
        targetType === "ai"
          ? { returnToAI: true, reason: reason.trim() || undefined }
          : targetType === "member"
            ? {
                targetMemberId,
                targetSectorId: selectedMember?.sectorId || targetSectorId || undefined,
                reason: reason.trim() || undefined,
              }
            : { targetSectorId, reason: reason.trim() || undefined };

      const response = await apiRequest("POST", `/api/conversations/${conversationId}/assignment`, payload);
      return response.json() as Promise<TransferResult>;
    },
    onSuccess: (result) => {
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/conversation", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/user/sectors/reports"] }),
      ]);

      const targetLabel =
        result.orchestrationMode === "ai"
          ? "A conversa voltou para a IA."
          : result.assignedMemberName
            ? `Responsavel atual: ${result.assignedMemberName}.`
            : result.sectorName
              ? `Setor atual: ${result.sectorName}.`
              : "Encaminhamento atualizado.";

      toast({
        title: "Encaminhamento atualizado",
        description: targetLabel,
      });

      setOpen(false);
      setTargetType("sector");
      setTargetSectorId("");
      setTargetMemberId("");
      setReason("");
      onTransferred?.(result);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao encaminhar conversa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitDisabled =
    transferMutation.isPending ||
    (targetType === "sector" && (!targetSectorId || !canChangeSector)) ||
    (targetType === "member" && !targetMemberId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`${showLabel ? "gap-1.5" : "px-0"} ${triggerClassName ?? ""}`.trim()}
          aria-label="Encaminhar"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          {showLabel && "Encaminhar"}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Encaminhar conversa</DialogTitle>
          <DialogDescription>
            Transfira entre setores, atendentes ou devolva a conversa para a IA sem perder o historico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={currentMode.className}>
                {currentMode.label}
              </Badge>
              <Badge variant="outline">
                {current?.sector_name || currentSectorName || "Sem setor"}
              </Badge>
              {current?.assigned_member_name && (
                <Badge variant="secondary">{current.assigned_member_name}</Badge>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Estado atual da conversa: {current?.sector_name || currentSectorName || "sem setor definido"}.
            </p>
            {currentLockReason && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {currentLockReason}
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => setTargetType("sector")}
              disabled={!canChangeSector}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                targetType === "sector" ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/30"
              } ${!canChangeSector ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <Users className="mb-2 h-4 w-4" />
              <p className="font-medium">Outro setor</p>
              <p className="text-xs text-muted-foreground">A conversa muda de fila e pode ser reatribuida.</p>
            </button>

            <button
              type="button"
              onClick={() => setTargetType("member")}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                targetType === "member" ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/30"
              }`}
            >
              <UserRound className="mb-2 h-4 w-4" />
              <p className="font-medium">Outro atendente</p>
              <p className="text-xs text-muted-foreground">Entrega direta para um responsavel especifico.</p>
            </button>

            <button
              type="button"
              onClick={() => setTargetType("ai")}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                targetType === "ai" ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/30"
              }`}
            >
              <Bot className="mb-2 h-4 w-4" />
              <p className="font-medium">Voltar para IA</p>
              <p className="text-xs text-muted-foreground">Remove a atribuicao humana e reativa o orquestrador.</p>
            </button>
          </div>

          {targetType === "sector" && (
            <div className="space-y-2">
              <Label>Setor de destino</Label>
              {!canChangeSector ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                  O setor atual já iniciou atendimento humano. A troca de setor fica bloqueada nesta etapa.
                </div>
              ) : null}
              <Select
                value={targetSectorId}
                onValueChange={(value) => {
                  setTargetSectorId(value);
                  setTargetMemberId("");
                }}
                disabled={!canChangeSector}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um setor" />
                </SelectTrigger>
                <SelectContent>
                  {sectors.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      Nenhum outro setor disponivel
                    </SelectItem>
                  ) : (
                    sectors.map((sector) => (
                      <SelectItem key={sector.id} value={sector.id}>
                        {sector.name} {sector.memberCount ? `(${sector.memberCount} membros)` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {targetType === "member" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Filtrar por setor</Label>
                <Select value={targetSectorId || "all"} onValueChange={(value) => setTargetSectorId(value === "all" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os setores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os setores</SelectItem>
                    {(routingOptionsQuery.data?.sectors || [])
                      .filter((sector) => (canChangeSector || !lockedSectorId ? true : sector.id === lockedSectorId))
                      .map((sector) => (
                      <SelectItem key={sector.id} value={sector.id}>
                        {sector.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Atendente de destino</Label>
                <Select value={targetMemberId} onValueChange={setTargetMemberId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um atendente" />
                  </SelectTrigger>
                  <SelectContent>
                    {membersForSelectedSector.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        Nenhum atendente disponivel
                      </SelectItem>
                    ) : (
                      membersForSelectedSector.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name} - {member.sectorName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {targetType === "ai" && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
              A conversa volta para o modo IA. O setor e o atendente responsavel sao removidos para o orquestrador
              retomar o atendimento normalmente.
            </div>
          )}

          <div className="space-y-2">
            <Label>Motivo</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ex: cliente pediu financeiro, escalado para especialista, devolvido para IA apos encerramento..."
            />
          </div>

          {routingOptionsQuery.isLoading && (
            <div className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando destinos disponiveis...
            </div>
          )}

          {targetType === "member" && targetMemberId && (
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
              {(() => {
                const selectedMember = members.find((member) => member.id === targetMemberId);
                if (!selectedMember) {
                  return "Atendente selecionado.";
                }

                return (
                  <>
                    <span className="font-medium text-foreground">{selectedMember.name}</span>
                    {" - "}
                    {selectedMember.sectorName}
                    {selectedMember.isPrimary ? " - principal do setor" : ""}
                    {!selectedMember.canReceiveTickets ? " - sem atribuicao automatica" : ""}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => transferMutation.mutate()} disabled={submitDisabled}>
            {transferMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {targetType === "ai" ? (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Devolver para IA
              </>
            ) : (
              "Confirmar encaminhamento"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
