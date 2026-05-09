import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Clock, Loader2, Plus, RefreshCw, Shuffle, Trash2 } from "lucide-react";

interface ScheduledStatus {
  id: string;
  statusText: string;
  scheduledFor: string;
  recurrenceType: string;
  recurrenceInterval: number;
  status: string;
  lastSentAt?: string | null;
  errorMessage?: string | null;
}

interface StatusRotationItem {
  id: string;
  statusText: string;
  isActive: boolean;
  weight?: number | null;
  displayOrder?: number | null;
  lastSentAt?: string | null;
}

interface StatusRotation {
  id: string;
  name: string;
  isActive: boolean;
  mode: "sequential" | "random";
  intervalMinutes: number;
  lastSentAt?: string | null;
  nextRunAt?: string | null;
  items?: StatusRotationItem[];
}

interface WhatsAppStatusManagerProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const recurrenceOptions = [
  { value: "none", label: "Sem recorrência" },
  { value: "daily", label: "Diária" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
];

const statusBadgeMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Pendente", variant: "outline" },
  sent: { label: "Enviado", variant: "default" },
  failed: { label: "Falhou", variant: "destructive" },
  cancelled: { label: "Cancelado", variant: "secondary" },
};

function formatRecurrence(type: string, interval: number): string {
  if (type === "daily") return `Diária (a cada ${interval} dia${interval > 1 ? "s" : ""})`;
  if (type === "weekly") return `Semanal (a cada ${interval} semana${interval > 1 ? "s" : ""})`;
  if (type === "monthly") return `Mensal (a cada ${interval} mês${interval > 1 ? "es" : ""})`;
  return "Sem recorrência";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function RotationCard({
  rotation,
  authFetch,
  onRefresh,
}: {
  rotation: StatusRotation;
  authFetch: WhatsAppStatusManagerProps["authFetch"];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState({
    name: rotation.name,
    mode: rotation.mode,
    intervalMinutes: rotation.intervalMinutes,
    isActive: rotation.isActive,
  });
  const [newItemText, setNewItemText] = useState("");
  const [newItemWeight, setNewItemWeight] = useState(1);

  useEffect(() => {
    setDraft({
      name: rotation.name,
      mode: rotation.mode,
      intervalMinutes: rotation.intervalMinutes,
      isActive: rotation.isActive,
    });
  }, [rotation.id, rotation.name, rotation.mode, rotation.intervalMinutes, rotation.isActive]);

  const updateRotationMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/status/rotations/${rotation.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          mode: draft.mode,
          intervalMinutes: draft.intervalMinutes,
          isActive: draft.isActive,
        }),
      });
      if (!res.ok) throw new Error("Falha ao atualizar rotação");
      return res.json();
    },
    onSuccess: () => {
      onRefresh();
      toast({ title: "Rotação atualizada" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteRotationMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/status/rotations/${rotation.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao remover rotação");
      return res.json();
    },
    onSuccess: () => {
      onRefresh();
      toast({ title: "Rotação removida" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/status/rotations/${rotation.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statusText: newItemText,
          weight: newItemWeight,
        }),
      });
      if (!res.ok) throw new Error("Falha ao adicionar status");
      return res.json();
    },
    onSuccess: () => {
      setNewItemText("");
      setNewItemWeight(1);
      onRefresh();
      toast({ title: "Status adicionado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const toggleItemMutation = useMutation({
    mutationFn: async ({ itemId, isActive }: { itemId: string; isActive: boolean }) => {
      const res = await authFetch(`/api/status/rotations/${rotation.id}/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Falha ao atualizar status");
      return res.json();
    },
    onSuccess: () => {
      onRefresh();
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await authFetch(`/api/status/rotations/${rotation.id}/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao remover status");
      return res.json();
    },
    onSuccess: () => {
      onRefresh();
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{rotation.name}</CardTitle>
            <CardDescription>
              {rotation.mode === "random" ? "Aleatório" : "Sequencial"} · Intervalo de {rotation.intervalMinutes} min
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => deleteRotationMutation.mutate()}
            disabled={deleteRotationMutation.isPending}
          >
            {deleteRotationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Modo</Label>
            <Select value={draft.mode} onValueChange={(value) => setDraft({ ...draft, mode: value as "sequential" | "random" })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequential">Sequencial</SelectItem>
                <SelectItem value="random">Aleatório</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Intervalo (minutos)</Label>
            <Input
              type="number"
              min={1}
              value={draft.intervalMinutes}
              onChange={(e) => setDraft({ ...draft, intervalMinutes: Number(e.target.value) || 1 })}
            />
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <div>
              <Label>Rotação ativa</Label>
              <p className="text-xs text-muted-foreground">Executa automaticamente</p>
            </div>
            <Switch checked={draft.isActive} onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => updateRotationMutation.mutate()} disabled={updateRotationMutation.isPending}>
            {updateRotationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar rotações
          </Button>
          <Badge variant="outline" className="text-xs">
            Último envio: {formatDateTime(rotation.lastSentAt)}
          </Badge>
          <Badge variant="outline" className="text-xs">
            Próximo: {formatDateTime(rotation.nextRunAt)}
          </Badge>
        </div>

        <div className="space-y-2">
          <Label>Adicionar status</Label>
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              placeholder="Texto do status"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
            />
            <Input
              type="number"
              min={1}
              className="md:w-32"
              value={newItemWeight}
              onChange={(e) => setNewItemWeight(Number(e.target.value) || 1)}
              disabled={draft.mode !== "random"}
            />
            <Button
              onClick={() => addItemMutation.mutate()}
              disabled={!newItemText.trim() || addItemMutation.isPending}
            >
              {addItemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Adicionar
            </Button>
          </div>
          {draft.mode !== "random" && (
            <p className="text-xs text-muted-foreground">O peso só é aplicado no modo aleatório.</p>
          )}
        </div>

        {rotation.items && rotation.items.length > 0 ? (
          <div className="space-y-2">
            {rotation.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                <div>
                  <p className="font-medium">{item.statusText}</p>
                  <p className="text-xs text-muted-foreground">
                    Peso: {item.weight || 1} · Último envio: {formatDateTime(item.lastSentAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={item.isActive}
                    onCheckedChange={(checked) => toggleItemMutation.mutate({ itemId: item.id, isActive: checked })}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteItemMutation.mutate(item.id)}
                    disabled={deleteItemMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum status adicionado nesta rotação.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function WhatsAppStatusManager({ authFetch }: WhatsAppStatusManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusForm, setStatusForm] = useState({
    statusText: "",
    scheduledDate: format(new Date(), "yyyy-MM-dd"),
    scheduledTime: "09:00",
    recurrenceType: "none",
    recurrenceInterval: 1,
  });
  const [rotationForm, setRotationForm] = useState({
    name: "",
    mode: "sequential" as "sequential" | "random",
    intervalMinutes: 240,
  });

  const { data: scheduledStatuses = [], isLoading: scheduledLoading, refetch: refetchScheduled } = useQuery<ScheduledStatus[]>({
    queryKey: ["whatsapp-status-scheduled"],
    queryFn: async () => {
      const res = await authFetch("/api/status/scheduled");
      if (!res.ok) throw new Error("Falha ao carregar agendamentos");
      return res.json();
    },
  });

  const { data: rotations = [], isLoading: rotationsLoading, refetch: refetchRotations } = useQuery<StatusRotation[]>({
    queryKey: ["whatsapp-status-rotations"],
    queryFn: async () => {
      const res = await authFetch("/api/status/rotations");
      if (!res.ok) throw new Error("Falha ao carregar rotações");
      return res.json();
    },
  });

  const createScheduledMutation = useMutation({
    mutationFn: async () => {
      const scheduledFor = new Date(`${statusForm.scheduledDate}T${statusForm.scheduledTime}:00`);
      const res = await authFetch("/api/status/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statusText: statusForm.statusText,
          scheduledFor: scheduledFor.toISOString(),
          recurrenceType: statusForm.recurrenceType,
          recurrenceInterval: statusForm.recurrenceInterval,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Falha ao agendar status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status-scheduled"] });
      setStatusForm((prev) => ({ ...prev, statusText: "" }));
      toast({ title: "Status agendado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const cancelScheduledMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/status/scheduled/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao cancelar status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status-scheduled"] });
      toast({ title: "Status cancelado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const createRotationMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/status/rotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rotationForm),
      });
      if (!res.ok) throw new Error("Falha ao criar rotação");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status-rotations"] });
      setRotationForm({ name: "", mode: "sequential", intervalMinutes: 240 });
      toast({ title: "Rotação criada" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Agendar status do WhatsApp
          </CardTitle>
          <CardDescription>Defina data, horário e recorrência para publicar status automaticamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Texto do status</Label>
            <Textarea
              value={statusForm.statusText}
              onChange={(e) => setStatusForm({ ...statusForm, statusText: e.target.value })}
              placeholder="Escreva o status que será publicado..."
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input
                type="date"
                value={statusForm.scheduledDate}
                onChange={(e) => setStatusForm({ ...statusForm, scheduledDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Horário</Label>
              <Input
                type="time"
                value={statusForm.scheduledTime}
                onChange={(e) => setStatusForm({ ...statusForm, scheduledTime: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Recorrência</Label>
              <Select
                value={statusForm.recurrenceType}
                onValueChange={(value) => setStatusForm({ ...statusForm, recurrenceType: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {recurrenceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Intervalo</Label>
              <Input
                type="number"
                min={1}
                value={statusForm.recurrenceInterval}
                onChange={(e) => setStatusForm({ ...statusForm, recurrenceInterval: Number(e.target.value) || 1 })}
                disabled={statusForm.recurrenceType === "none"}
              />
            </div>
          </div>
          <Button
            onClick={() => createScheduledMutation.mutate()}
            disabled={!statusForm.statusText.trim() || createScheduledMutation.isPending}
          >
            {createScheduledMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Agendar status
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Status agendados</CardTitle>
              <CardDescription>Histórico e próximos disparos do status.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchScheduled()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {scheduledLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : scheduledStatuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum status agendado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Agendado para</TableHead>
                  <TableHead>Recorrência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último envio</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduledStatuses.map((item) => {
                  const badge = statusBadgeMap[item.status] || { label: item.status, variant: "outline" };
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-[260px] truncate">{item.statusText}</TableCell>
                      <TableCell>{formatDateTime(item.scheduledFor)}</TableCell>
                      <TableCell>{formatRecurrence(item.recurrenceType, item.recurrenceInterval)}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(item.lastSentAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancelScheduledMutation.mutate(item.id)}
                          disabled={cancelScheduledMutation.isPending || item.status === "cancelled"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shuffle className="w-4 h-4" />
            Status rotativo
          </CardTitle>
          <CardDescription>Crie rotações automáticas com sequência ou aleatoriedade.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-1">
              <Label>Nome da rotação</Label>
              <Input
                value={rotationForm.name}
                onChange={(e) => setRotationForm({ ...rotationForm, name: e.target.value })}
                placeholder="Ex: Promos da semana"
              />
            </div>
            <div className="space-y-2">
              <Label>Modo</Label>
              <Select
                value={rotationForm.mode}
                onValueChange={(value) => setRotationForm({ ...rotationForm, mode: value as "sequential" | "random" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequencial</SelectItem>
                  <SelectItem value="random">Aleatório</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Intervalo (minutos)</Label>
              <Input
                type="number"
                min={1}
                value={rotationForm.intervalMinutes}
                onChange={(e) => setRotationForm({ ...rotationForm, intervalMinutes: Number(e.target.value) || 1 })}
              />
            </div>
          </div>
          <Button
            onClick={() => createRotationMutation.mutate()}
            disabled={!rotationForm.name.trim() || createRotationMutation.isPending}
          >
            {createRotationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Criar rotação
          </Button>
        </CardContent>
      </Card>

      {rotationsLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando rotações...
        </div>
      ) : rotations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma rotação configurada.</p>
      ) : (
        <div className="space-y-4">
          {rotations.map((rotation) => (
            <RotationCard key={rotation.id} rotation={rotation} authFetch={authFetch} onRefresh={refetchRotations} />
          ))}
        </div>
      )}
    </div>
  );
}
