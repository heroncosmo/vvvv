import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Save, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WelcomeMessageConfig {
  enabled: boolean;
  text: string;
}

export default function WelcomeMessageConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");

  // Buscar configuração
  const { data: config, isLoading } = useQuery<WelcomeMessageConfig>({
    queryKey: ["/api/admin/welcome-message"],
  });

  // Atualizar estado local quando config carregar
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setText(config.text);
    }
  }, [config]);

  // Mutation para salvar
  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/welcome-message", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ enabled, text }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao salvar configuração");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuração salva",
        description: "A mensagem de boas-vindas foi atualizada com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/welcome-message"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Mensagem de Boas-vindas
        </CardTitle>
        <CardDescription>
          Configure a mensagem automática enviada aos novos clientes após o cadastro
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enabled">Enviar mensagem de boas-vindas</Label>
            <p className="text-sm text-muted-foreground">
              Ativar envio automático de mensagem para novos clientes
            </p>
          </div>
          <Switch
            id="enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="message-text">Texto da mensagem</Label>
          <Textarea
            id="message-text"
            placeholder="Digite a mensagem de boas-vindas..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            disabled={!enabled}
          />
          <p className="text-xs text-muted-foreground">
            Esta mensagem será enviada via WhatsApp do administrador para o telefone do novo cliente
          </p>
        </div>

        <div className="p-4 bg-muted rounded-lg space-y-2">
          <p className="text-sm font-medium">Preview da mensagem:</p>
          <div className="p-3 bg-background rounded border whitespace-pre-wrap text-sm">
            {text || "Nenhuma mensagem configurada"}
          </div>
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !text.trim()}
          className="w-full"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Salvar Configuração
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

