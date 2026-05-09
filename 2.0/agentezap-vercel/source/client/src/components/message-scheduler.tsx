import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, Send, Sparkles, Edit, Trash2 } from "lucide-react";
import type { Conversation } from "@shared/schema";
import {
  formatBrazilDateTime,
  getBrazilDateTimeLocalInputValue,
} from "@/lib/brazil-time";

interface MessageSchedulerProps {
  conversation: Conversation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ScheduledMessage {
  id: string;
  text: string;
  scheduledFor: string;
  useAI: boolean;
  note?: string | null;
  status: string;
  createdAt: string;
}

function isGroupConversation(
  conversation: Pick<Conversation, "remoteJid" | "jidSuffix"> | null | undefined,
) {
  return Boolean(
    conversation?.jidSuffix === "g.us" ||
      String(conversation?.remoteJid || "").trim().endsWith("@g.us"),
  );
}

export default function MessageScheduler({ conversation, open, onOpenChange }: MessageSchedulerProps) {
  const { toast } = useToast();
  const [scheduledFor, setScheduledFor] = useState("");
  const [messageText, setMessageText] = useState("");
  const [useAI, setUseAI] = useState(false);
  const [note, setNote] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const groupConversation = isGroupConversation(conversation);
  const groupId = String(conversation?.remoteJid || "").trim()
    || `${String(conversation?.contactNumber || "").trim()}@g.us`;

  // Buscar mensagens agendadas
  const { data: scheduledMessages = [], refetch } = useQuery<ScheduledMessage[]>({
    queryKey: ["/api/conversations", conversation?.id, "scheduled-messages"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/conversations/${conversation?.id}/scheduled-messages`);
      return res.json();
    },
    enabled: open && !!conversation?.id && !groupConversation,
  });

  // Mutation para agendar mensagem
  const scheduleMutation = useMutation({
    mutationFn: async (data: { scheduledFor: string; text: string; useAI: boolean; note?: string }) => {
      if (groupConversation) {
        return await apiRequest("POST", "/api/whatsapp/groups/bulk-send", {
          groupIds: [groupId],
          message: data.text,
          settings: {
            useAI: false,
            delayMin: 5,
            delayMax: 15,
          },
          scheduledAt: data.scheduledFor,
          connectionId: conversation?.connectionId,
        });
      }
      return await apiRequest("POST", `/api/conversations/${conversation?.id}/schedule-message`, data);
    },
    onSuccess: async () => {
      toast({
        title: "Mensagem agendada!",
        description: groupConversation
          ? "O envio no grupo entrou na fila programada com proteção anti-ban."
          : "A mensagem será enviada na data especificada.",
      });
      setMessageText("");
      setScheduledFor("");
      setNote("");
      if (!groupConversation) {
        await refetch();
      }
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao agendar mensagem",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para cancelar mensagem
  const cancelMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return await apiRequest("DELETE", `/api/conversations/${conversation?.id}/scheduled-messages/${messageId}`);
    },
    onSuccess: () => {
      toast({
        title: "Mensagem cancelada",
        description: "O agendamento foi removido.",
      });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao cancelar mensagem",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Gerar mensagem com IA
  const generateWithAI = async () => {
    if (groupConversation) {
      toast({
        title: "Somente manual",
        description: "Grupos usam apenas mensagem manual.",
        variant: "destructive",
      });
      return;
    }

    if (!messageText.trim()) {
      toast({
        title: "Campo vazio",
        description: "Digite uma mensagem base primeiro.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await apiRequest("POST", `/api/user/ai/generate-message`, {
        conversationId: conversation?.id,
        baseMessage: messageText,
        context: "Agendamento de mensagem",
      });

      const data = await response.json();
      setMessageText(data.generatedMessage || data.message || messageText);
      setUseAI(true);

      toast({
        title: "Mensagem gerada com IA",
        description: "Você pode editar antes de agendar.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao gerar com IA",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Limpar formulário
  const handleReset = () => {
    setMessageText("");
    setScheduledFor("");
    setNote("");
    setUseAI(false);
  };

  if (!conversation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Agendar Mensagem
          </DialogTitle>
          <DialogDescription>
            {groupConversation
              ? "Agende uma mensagem manual para este grupo. O envio usará a mesma fila com delay anti-ban do envio em grupos."
              : "Agende uma mensagem para ser enviada automaticamente em uma data específica. Você pode digitar manualmente ou gerar com IA e editar antes de agendar."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
          {/* Mensagens Agendadas */}
          {!groupConversation && scheduledMessages.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Mensagens Agendadas</span>
                  <Badge variant="secondary">{scheduledMessages.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {scheduledMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="flex items-start justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex-1 space-y-1">
                      <p className="text-sm">{msg.text}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>{formatBrazilDateTime(msg.scheduledFor)}</span>
                        {msg.useAI && <Badge variant="outline" className="text-[10px]">IA</Badge>}
                        {msg.status === 'scheduled' && <Badge variant="outline" className="text-[10px]">Agendado</Badge>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => cancelMutation.mutate(msg.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {groupConversation && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Grupo em modo manual</CardTitle>
                <CardDescription>
                  Este agendamento envia uma mensagem manual para o grupo usando a fila protegida. Cancelamentos continuam pelo histórico de campanhas.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Formulário de Agendamento */}
          <div className="space-y-4">
            {/* Campo de Texto */}
            <div className="space-y-2">
              <Label htmlFor="message-text">
                Mensagem {useAI && <Badge variant="outline" className="ml-2">Gerada com IA</Badge>}
              </Label>
              <Textarea
                id="message-text"
                placeholder="Digite a mensagem que deseja enviar..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>

            {/* Botão Gerar com IA */}
            {!groupConversation && (
              <Button
                variant="outline"
                size="sm"
                onClick={generateWithAI}
                disabled={isGenerating || !messageText.trim()}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando com IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
                    Gerar com IA
                  </>
                )}
              </Button>
            )}

            {/* Data de Agendamento */}
            <div className="space-y-2">
              <Label htmlFor="scheduled-for">Data e Hora</Label>
              <Input
                id="scheduled-for"
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                min={getBrazilDateTimeLocalInputValue()}
                className="w-full"
              />
            </div>

            {/* Nota Opcional */}
            <div className="space-y-2">
              <Label htmlFor="note">Nota (opcional)</Label>
              <Input
                id="note"
                placeholder="Ex: Cliente pediu para ligar amanhã às 10h"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleReset} disabled={scheduleMutation.isPending}>
            Limpar
          </Button>
          <Button
            onClick={() => {
              if (!scheduledFor || !messageText.trim()) {
                toast({
                  title: "Campos obrigatórios",
                  description: "Preencha a data e a mensagem.",
                  variant: "destructive",
                });
                return;
              }
              scheduleMutation.mutate({
                scheduledFor,
                text: messageText,
                useAI: groupConversation ? false : useAI,
                note,
              });
            }}
            disabled={!scheduledFor || !messageText.trim() || scheduleMutation.isPending}
          >
            {scheduleMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Agendando...
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4 mr-2" />
                Agendar Mensagem
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
