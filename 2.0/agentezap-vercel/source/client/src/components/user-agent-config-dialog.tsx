import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, KeyRound, Loader2, Save } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentLlmConfig } from "@shared/schema";

interface UserAgentConfigDialogProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName?: string;
}

interface UserAgentConfigResponse {
  prompt?: string | null;
  isActive?: boolean;
  model?: string | null;
  llmConfig?: AgentLlmConfig | null;
}

interface AdminLlmConfigResponse {
  mistral_model?: string | null;
}

const GLOBAL_MISTRAL_MODEL_VALUE = "__GLOBAL_MISTRAL_MODEL__";

const mistralModelOptions = [
  {
    value: "mistral-medium-latest",
    label: "Balanceado (recomendado)",
  },
  {
    value: "mistral-medium-2312",
    label: "Balanceado - fallback 1",
  },
  {
    value: "mistral-medium",
    label: "Balanceado - fallback 2",
  },
  {
    value: "mistral-large-2411",
    label: "Avançado - fallback 1",
  },
  {
    value: "mistral-large-latest",
    label: "Avançado",
  },
  {
    value: "mistral-large-2407",
    label: "Avançado - fallback 2",
  },
] as const;

function getModelLabel(value?: string | null): string {
  const normalized = value?.trim();
  if (!normalized) return "Modelo padrão";
  const knownOption = mistralModelOptions.find((option) => option.value === normalized);
  return knownOption?.label || "Modelo personalizado";
}

export function UserAgentConfigDialog({
  userId,
  open,
  onOpenChange,
  userName,
}: UserAgentConfigDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [prompt, setPrompt] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [model, setModel] = useState(GLOBAL_MISTRAL_MODEL_VALUE);
  const [llmMode, setLlmMode] = useState<"global" | "custom">("global");
  const [customMistralKey, setCustomMistralKey] = useState("");
  const [showCustomMistralKey, setShowCustomMistralKey] = useState(false);

  const { data: config, isLoading } = useQuery<UserAgentConfigResponse>({
    queryKey: [`/api/admin/users/${userId}/agent-config`],
    enabled: !!userId && open,
  });

  const { data: adminConfig } = useQuery<AdminLlmConfigResponse>({
    queryKey: ["/api/admin/config"],
    enabled: open,
  });

  const globalMistralModel =
    adminConfig?.mistral_model?.trim() || "mistral-medium-latest";
  const hasKnownMistralModel =
    model === GLOBAL_MISTRAL_MODEL_VALUE ||
    mistralModelOptions.some((option) => option.value === model);

  useEffect(() => {
    if (!config) {
      return;
    }

    setPrompt(config.prompt || "");
    setIsActive(config.isActive || false);
    setModel(config.model?.trim() || GLOBAL_MISTRAL_MODEL_VALUE);

    const llmConfig = (config.llmConfig || { mode: "global" }) as AgentLlmConfig;
    setLlmMode(llmConfig.mode === "custom" ? "custom" : "global");
    setCustomMistralKey(llmConfig.mistralApiKey || "");
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (data: unknown) => {
      const res = await fetch(`/api/admin/users/${userId}/agent-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error("Failed to save config");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/users/${userId}/agent-config`],
      });
      toast({ title: "Configuracao salva com sucesso!" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Erro ao salvar configuracao", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!userId) {
      return;
    }

    if (llmMode === "custom" && !customMistralKey.trim()) {
      toast({
        title: "Informe a chave de IA da conta",
        variant: "destructive",
      });
      return;
    }

    const resolvedAgentModel =
      model === GLOBAL_MISTRAL_MODEL_VALUE ? globalMistralModel : model;

    saveMutation.mutate({
      prompt,
      isActive,
      model: resolvedAgentModel,
      llmConfig:
        llmMode === "custom"
          ? {
              mode: "custom",
              provider: "mistral",
              mistralApiKey: customMistralKey.trim(),
              mistralModel: resolvedAgentModel,
            }
          : { mode: "global" },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Agente - {userName}</DialogTitle>
          <DialogDescription>
            Ajuste as configuracoes do agente IA para este usuario.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between space-x-2 border p-4 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base">Agente Ativo</Label>
                <p className="text-sm text-muted-foreground">
                  Ativar ou desativar o agente para este usuario
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <div className="space-y-2">
              <Label>Modelo da IA da conta</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL_MISTRAL_MODEL_VALUE}>
                    Usar o mesmo modelo global do admin ({getModelLabel(globalMistralModel)})
                  </SelectItem>
                  {!hasKnownMistralModel ? (
                    <SelectItem value={model}>
                      Modelo legado salvo
                    </SelectItem>
                  ) : null}
                  {mistralModelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Esse e o modelo usado pela IA desta conta. Se a conta estiver
                com chave propria, o mesmo modelo tambem sera aplicado
                ao follow-up e aos demais pontos que usam o resolvedor da conta.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Prompt do Sistema</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
                placeholder="Voce e um assistente util..."
              />
              <p className="text-xs text-muted-foreground">
                Defina a personalidade e as instrucoes principais do agente.
              </p>
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-base">Chave LLM por cliente</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  O padrao continua vindo de <code>/admin#config</code>. Ative
                  abaixo apenas quando esta conta precisar usar uma chave
                  propria.
                </p>
                <p className="text-xs text-muted-foreground">
                  Modelo global atual do admin:{" "}
                  <span className="font-medium text-foreground">
                    {getModelLabel(globalMistralModel)}
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Origem da configuracao</Label>
                <Select
                  value={llmMode}
                  onValueChange={(value) =>
                    setLlmMode(value as "global" | "custom")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">
                      Usar padrao global do admin
                    </SelectItem>
                    <SelectItem value="custom">
                      Usar chave propria desta conta
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {llmMode === "custom" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Chave de IA desta conta</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showCustomMistralKey ? "text" : "password"}
                        value={customMistralKey}
                        onChange={(e) =>
                          setCustomMistralKey(e.target.value)
                        }
                        placeholder="Cole a chave de IA do cliente"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          setShowCustomMistralKey((current) => !current)
                        }
                      >
                        {showCustomMistralKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending || isLoading}>
            {saveMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <Save className="mr-2 h-4 w-4" />
            Salvar Alteracoes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
