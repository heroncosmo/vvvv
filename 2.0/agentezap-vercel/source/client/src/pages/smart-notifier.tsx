import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContextualHelpButton } from "@/components/contextual-help-button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Bell, Save, RefreshCw, Brain, Keyboard, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";

function parseNotificationPhones(value: string): string[] {
  const seen = new Set<string>();
  const phones: string[] = [];

  value
    .split(/[\n,;|]+/g)
    .map((item) => item.replace(/\D/g, ""))
    .filter(Boolean)
    .forEach((digits) => {
      const normalized = (digits.length === 10 || digits.length === 11) && !digits.startsWith("55")
        ? `55${digits}`
        : digits;
      if (normalized.length >= 10 && normalized.length <= 15 && !seen.has(normalized)) {
        seen.add(normalized);
        phones.push(normalized);
      }
    });

  return phones;
}

export default function SmartNotifierPage() {
  const { toast } = useToast();
  const { data: notificationConfig, isLoading } = useQuery({
    queryKey: ["/api/agent/notification-config"],
  });

  const [notificationPhone, setNotificationPhone] = useState("");
  const [notificationTrigger, setNotificationTrigger] = useState("");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationMode, setNotificationMode] = useState<"ai" | "manual" | "both">("ai");
  const [notificationManualKeywords, setNotificationManualKeywords] = useState("");

  useEffect(() => {
    if (notificationConfig) {
      const phones = Array.isArray(notificationConfig.notificationPhoneNumbers)
        ? notificationConfig.notificationPhoneNumbers.join("\n")
        : notificationConfig.notificationPhoneNumber || "";
      setNotificationPhone(phones);
      setNotificationTrigger(notificationConfig.notificationTrigger || "");
      setNotificationEnabled(notificationConfig.notificationEnabled || false);
      setNotificationMode(notificationConfig.notificationMode || "ai");
      setNotificationManualKeywords(notificationConfig.notificationManualKeywords || "");
    }
  }, [notificationConfig]);

  const updateConfigMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/agent/notification-config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/notification-config"] });
      toast({
        title: "Configuração salva",
        description: "As configurações de notificação foram atualizadas.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveNotification = () => {
    const notificationPhoneNumbers = parseNotificationPhones(notificationPhone);
    updateConfigMutation.mutate({
      notificationPhoneNumber: notificationPhoneNumbers.join("\n"),
      notificationPhoneNumbers,
      notificationTrigger: notificationTrigger,
      notificationEnabled: notificationEnabled,
      notificationMode: notificationMode,
      notificationManualKeywords: notificationManualKeywords,
    });
  };
  const validNotificationPhones = parseNotificationPhones(notificationPhone);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-2xl mx-auto p-8 space-y-8">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Notificador Inteligente</h1>
            <ContextualHelpButton articleId="notifier-overview" title="Como usar o Notificador" description="Configure alertas automáticos para quando um cliente precisar de atenção." />
          </div>
          <p className="text-muted-foreground">
            Configure notificações automáticas baseadas no contexto das conversas
          </p>
        </div>

        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-md bg-orange-100 flex items-center justify-center">
                <Bell className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="font-semibold">Status do Notificador</h3>
                <p className="text-sm text-muted-foreground">
                  Receba notificações no seu WhatsApp pessoal
                </p>
              </div>
            </div>
            <Switch
              checked={notificationEnabled}
              onCheckedChange={setNotificationEnabled}
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Números para notificação</Label>
              <Textarea
                placeholder={"Ex:\n5511999999999\n5511888888888"}
                value={notificationPhone}
                onChange={(e) => setNotificationPhone(e.target.value)}
                rows={4}
                aria-label="Números para notificação"
              />
              {validNotificationPhones.length > 1 && (
                <p className="text-xs text-green-700">
                  {validNotificationPhones.length} destinos válidos para receber alertas.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Um número por linha. Inclua o código do país, por exemplo 55.
              </p>
            </div>

            {/* Modo de Notificação */}
            <div className="space-y-3">
              <Label>Modo de Detecção</Label>
              <RadioGroup 
                value={notificationMode} 
                onValueChange={(value) => setNotificationMode(value as "ai" | "manual" | "both")}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="ai" id="ai" className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-500" />
                      <Label htmlFor="ai" className="font-medium cursor-pointer">
                        Inteligência Artificial (Recomendado)
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      A IA analisa o contexto da conversa e decide quando notificar. Mais preciso e inteligente.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="manual" id="manual" className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Keyboard className="w-4 h-4 text-blue-500" />
                      <Label htmlFor="manual" className="font-medium cursor-pointer">
                        Palavras-chave Manual
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Notifica quando detectar palavras específicas. Mais simples, mas pode ter falsos positivos.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="both" id="both" className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-500" />
                      <span className="text-xs">+</span>
                      <Keyboard className="w-4 h-4 text-blue-500" />
                      <Label htmlFor="both" className="font-medium cursor-pointer">
                        Ambos (IA + Manual)
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Usa a IA e também verifica palavras-chave. Máxima cobertura, mas pode ter mais notificações.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Gatilho IA */}
            {(notificationMode === "ai" || notificationMode === "both") && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-500" />
                  <Label>Gatilho da IA</Label>
                </div>
                <Textarea
                  placeholder="Ex: Me notifique quando o cliente quiser agendar uma reunião ou demonstrar interesse em comprar."
                  value={notificationTrigger}
                  onChange={(e) => setNotificationTrigger(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Descreva em linguagem natural quando você quer ser notificado. A IA vai entender a intenção.
                </p>
              </div>
            )}

            {/* Palavras-chave Manual */}
            {(notificationMode === "manual" || notificationMode === "both") && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Keyboard className="w-4 h-4 text-blue-500" />
                  <Label>Palavras-chave (separadas por vírgula)</Label>
                </div>
                <Textarea
                  placeholder="Ex: agendar, marcar, encaminhar agora pra nossa equipe, nossa equipe vai analisar, já te retornamos"
                  value={notificationManualKeywords}
                  onChange={(e) => setNotificationManualKeywords(e.target.value)}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Detecta palavras tanto nas mensagens do <strong>cliente</strong> quanto nas <strong>respostas do agente</strong>.
                  Ideal para notificar quando o agente finaliza uma etapa (ex: "vou encaminhar para nossa equipe").
                </p>
              </div>
            )}

            {/* Guia de diferenças */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Diferença entre os modos:</strong>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  <li><strong>IA:</strong> Entende contexto. "Quero ver opções" pode não notificar, mas "Quero agendar para amanhã" sim.</li>
                  <li><strong>Manual:</strong> Busca exata nas mensagens do <strong>cliente</strong> E nas <strong>respostas do agente</strong>. 
                    Ex: "encaminhar agora pra nossa equipe" detecta quando o agente finaliza o atendimento.</li>
                  <li><strong>Ambos:</strong> Combina os dois. Use se a IA às vezes não detecta algo importante.</li>
                </ul>
                <p className="mt-2 text-muted-foreground">
                  💡 <strong>Dica:</strong> Para detectar quando o agente finaliza uma coleta de informações, 
                  adicione frases como: "encaminhar agora", "nossa equipe vai analisar", "já te retornamos"
                </p>
              </AlertDescription>
            </Alert>

            <Button 
              onClick={handleSaveNotification} 
              disabled={updateConfigMutation.isPending}
              className="w-full"
            >
              {updateConfigMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Configurações
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
