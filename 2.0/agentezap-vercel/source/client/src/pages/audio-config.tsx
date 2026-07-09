import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  Gauge,
  Loader2,
  Mic,
  Play,
  Sparkles,
  Volume2,
  Waves,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type AudioResponseMode =
  | "first_message_text_audio_then_mirror"
  | "audio_on_customer_audio"
  | "audio_only"
  | "audio_text";

type FollowupAudioMode =
  | "text_only"
  | "audio_only"
  | "alternate_text_audio"
  | "random_text_audio";

type AudioVoiceType = "female" | "male";

interface AudioConfig {
  isEnabled: boolean;
  voiceType: AudioVoiceType;
  responseMode: AudioResponseMode;
  speed: number;
}

interface AudioUsage {
  used: number;
  remaining: number;
  limit: number;
  canSend: boolean;
  isUnlimited?: boolean;
}

interface AudioConfigResponse {
  config: AudioConfig;
  usage: AudioUsage;
}

interface FollowupConfigResponse {
  isEnabled: boolean;
  followupAudioMode: FollowupAudioMode;
}

function normalizeAudioResponseMode(mode: string | null | undefined): AudioResponseMode {
  if (mode === "audio_first_message_then_customer_audio") {
    return "first_message_text_audio_then_mirror";
  }

  if (
    mode === "first_message_text_audio_then_mirror" ||
    mode === "audio_on_customer_audio" ||
    mode === "audio_only" ||
    mode === "audio_text"
  ) {
    return mode;
  }

  return "audio_text";
}

const responseModeOptions: Array<{
  value: AudioResponseMode;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    value: "first_message_text_audio_then_mirror",
    eyebrow: "Mais guiado",
    title: "Primeira mensagem em texto + áudio",
    description:
      "Na abertura o agente envia texto e áudio juntos. Depois espelha o cliente e só volta para áudio quando a pessoa também manda áudio.",
  },
  {
    value: "audio_on_customer_audio",
    eyebrow: "Mais natural",
    title: "Espelhar o formato do cliente",
    description:
      "Quem escreve recebe texto. Quem manda áudio recebe áudio. Mantém a conversa leve sem repetir voz para quem prefere ler.",
  },
  {
    value: "audio_only",
    eyebrow: "Mais direto",
    title: "Somente áudio",
    description:
      "Toda resposta sai em voz. Se o áudio falhar, o sistema cai para texto para a conversa não ficar sem retorno.",
  },
  {
    value: "audio_text",
    eyebrow: "Mais completo",
    title: "Texto + áudio sempre",
    description:
      "Toda resposta envia os dois formatos ao mesmo tempo. Funciona bem quando você quer reforçar entendimento e manter registro em texto.",
  },
];

const followupModeOptions: Array<{
  value: FollowupAudioMode;
  title: string;
  description: string;
}> = [
  {
    value: "text_only",
    title: "Follow-up normal em texto",
    description: "Se ficar assim, o follow-up continua como hoje: só texto.",
  },
  {
    value: "audio_only",
    title: "Follow-up só em áudio",
    description: "Cada follow-up tenta sair em voz. Se falhar, o sistema cai para texto.",
  },
  {
    value: "alternate_text_audio",
    title: "Texto, áudio, texto, áudio",
    description: "Alterna por estágio para parecer atendimento ativo e com ritmo humano.",
  },
  {
    value: "random_text_audio",
    title: "Texto ou áudio aleatório",
    description: "O sistema varia entre texto e áudio ao longo do ciclo para gerar percepção de atenção.",
  },
];

const voiceOptions = [
  { value: "female" as const, title: "Voz feminina", description: "Voz brasileira natural para atendimento" },
  { value: "male" as const, title: "Voz masculina", description: "Voz brasileira firme para atendimento comercial" },
];

const speedPresets = [
  { value: 0.9, label: "Calmo" },
  { value: 1.0, label: "Normal" },
  { value: 1.15, label: "Ágil" },
  { value: 1.3, label: "Rápido" },
];

export default function AudioConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPreviewOpen, setIsPreviewOpen] = useState(true);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [activePreviewLabel, setActivePreviewLabel] = useState<string | null>(null);
  const [localSpeed, setLocalSpeed] = useState(1);
  const [localVoiceType, setLocalVoiceType] = useState<AudioVoiceType>("female");
  const [localIsEnabled, setLocalIsEnabled] = useState(false);
  const [localResponseMode, setLocalResponseMode] = useState<AudioResponseMode>("audio_text");
  const [localFollowupAudioMode, setLocalFollowupAudioMode] = useState<FollowupAudioMode>("text_only");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: audioConfigData, isLoading: isAudioLoading } = useQuery<AudioConfigResponse>({
    queryKey: ["/api/audio-config"],
  });

  const { data: followupConfigData, isLoading: isFollowupLoading } = useQuery<FollowupConfigResponse>({
    queryKey: ["/api/followup/config"],
  });

  useEffect(() => {
    if (!audioConfigData || !followupConfigData) {
      return;
    }

    setLocalSpeed(audioConfigData.config.speed);
    setLocalVoiceType(audioConfigData.config.voiceType);
    setLocalIsEnabled(audioConfigData.config.isEnabled);
    setLocalResponseMode(normalizeAudioResponseMode(audioConfigData.config.responseMode));
    setLocalFollowupAudioMode(followupConfigData.followupAudioMode ?? "text_only");
    setHasUnsavedChanges(false);
  }, [audioConfigData, followupConfigData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        apiRequest("PUT", "/api/audio-config", {
          isEnabled: localIsEnabled,
          voiceType: localVoiceType,
          responseMode: localResponseMode,
          speed: localSpeed,
        }),
        apiRequest("PUT", "/api/followup/config", {
          followupAudioMode: localFollowupAudioMode,
        }),
      ]);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/audio-config"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/followup/config"] }),
      ]);
      setHasUnsavedChanges(false);
      toast({
        title: "Configuração salva",
        description: "Áudio principal e áudio no follow-up foram atualizados.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error?.message || "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    },
  });

  const usagePercentage = audioConfigData?.usage
    ? audioConfigData.usage.isUnlimited
      ? 0
      : Math.min(100, (audioConfigData.usage.used / audioConfigData.usage.limit) * 100)
    : 0;

  const activeResponseMode = useMemo(
    () => responseModeOptions.find((option) => option.value === localResponseMode),
    [localResponseMode]
  );

  const activeFollowupMode = useMemo(
    () => followupModeOptions.find((option) => option.value === localFollowupAudioMode),
    [localFollowupAudioMode]
  );

  const generatePreview = async (speed: number, label: string) => {
    setIsGeneratingPreview(true);
    setActivePreviewLabel(label);

    try {
      const response = await apiRequest("POST", "/api/audio-config/preview", {
        speed,
        voiceType: localVoiceType,
      });

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
      }
    } catch {
      toast({
        title: "Erro ao gerar preview",
        description: "Não foi possível tocar o áudio de teste.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const markDirty = () => setHasUnsavedChanges(true);

  if (isAudioLoading || isFollowupLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-full w-full bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_24%)]">
      <div className="overflow-hidden border-y border-border/60 bg-background/95 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.45)] md:border md:rounded-[28px]">
        <div className="flex flex-col gap-5 border-b border-border/60 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Mic className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold tracking-tight">Falar por áudio</h1>
                  <p className="text-sm text-muted-foreground">
                    Tudo fica na mesma área: resposta principal, follow-up, voz e teste, sem blocos soltos.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={localIsEnabled ? "default" : "secondary"} className="rounded-full px-3 py-1">
                  {localIsEnabled ? "Áudio ativo" : "Áudio desligado"}
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {activeResponseMode?.title ?? "Modo de resposta"}
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  Follow-up: {activeFollowupMode?.title ?? "texto"}
                </Badge>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[280px]">
              <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</p>
                  <p className="text-sm font-medium">
                    {hasUnsavedChanges ? "Alterações prontas para salvar" : "Tudo sincronizado"}
                  </p>
                </div>
                {hasUnsavedChanges ? (
                  <span className="text-xs font-medium text-amber-600">Pendente</span>
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                )}
              </div>

              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !hasUnsavedChanges}
                className="h-11 rounded-full px-5 text-sm font-medium"
              >
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Uso diário</p>
              <p className="mt-1 text-2xl font-semibold">
                {audioConfigData?.usage.used ?? 0}
                <span className="text-base font-medium text-muted-foreground">
                  {" "}
                  / {audioConfigData?.usage.limit ?? 30}
                </span>
              </p>
              {!audioConfigData?.usage.isUnlimited && <Progress value={usagePercentage} className="mt-3 h-2" />}
            </div>

            <div className="rounded-2xl bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Restante hoje</p>
              <p className="mt-1 text-2xl font-semibold">
                  {audioConfigData?.usage.remaining ?? 0}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">O contador reinicia automaticamente à meia-noite.</p>
            </div>

            <div className="rounded-2xl bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Follow-up</p>
              <p className="mt-1 text-sm font-medium leading-6">
                Se você ativar áudio aqui, o follow-up pode continuar em texto, virar áudio ou alternar texto e áudio.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.2fr)_380px]">
          <div className="space-y-8 px-4 py-5 sm:px-6 lg:px-8">
            <section className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Controle principal</p>
                  <h2 className="text-xl font-semibold">Modo de resposta do agente</h2>
                </div>
                <div className="flex items-center gap-3 rounded-full border border-border/60 px-3 py-2">
                  <Label htmlFor="audio-enabled" className="text-sm font-medium">
                    {localIsEnabled ? "Ligado" : "Desligado"}
                  </Label>
                  <Switch
                    id="audio-enabled"
                    checked={localIsEnabled}
                    onCheckedChange={(checked) => {
                      setLocalIsEnabled(checked);
                      markDirty();
                    }}
                  />
                </div>
              </div>

              <RadioGroup
                value={localResponseMode}
                onValueChange={(value: AudioResponseMode) => {
                  setLocalResponseMode(value);
                  markDirty();
                }}
                className="grid gap-3"
              >
                {responseModeOptions.map((option) => (
                  <div key={option.value}>
                    <RadioGroupItem id={option.value} value={option.value} className="peer sr-only" />
                    <Label
                      htmlFor={option.value}
                      className={cn(
                        "flex cursor-pointer flex-col gap-2 rounded-[24px] border border-border/60 px-4 py-4 transition-all",
                        "bg-background hover:border-primary/40 hover:bg-primary/[0.03]",
                        "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/[0.05]"
                      )}
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {option.eyebrow}
                      </span>
                      <span className="text-base font-semibold">{option.title}</span>
                      <span className="text-sm leading-6 text-muted-foreground">{option.description}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </section>

            <Separator />

            <Collapsible open={isPreviewOpen} onOpenChange={setIsPreviewOpen} className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Follow-up</p>
                  <h2 className="text-xl font-semibold">Áudio no follow-up</h2>
                  <p className="text-sm text-muted-foreground">
                    Abra para decidir se o follow-up continua em texto, fala em áudio ou alterna entre os dois.
                  </p>
                </div>

                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="h-10 rounded-full px-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                    Configurar
                    <ChevronDown className={cn("ml-2 h-4 w-4 transition-transform", isPreviewOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent className="space-y-4">
                <div className="rounded-[24px] bg-muted/30 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Regra do follow-up</p>
                      <p className="text-sm text-muted-foreground">
                        Se o áudio geral estiver desligado, o follow-up cai para texto automaticamente.
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full px-3 py-1">
                      {activeFollowupMode?.title ?? "Follow-up em texto"}
                    </Badge>
                  </div>

                  <RadioGroup
                    value={localFollowupAudioMode}
                    onValueChange={(value: FollowupAudioMode) => {
                      setLocalFollowupAudioMode(value);
                      markDirty();
                    }}
                    className="grid gap-3"
                  >
                    {followupModeOptions.map((option) => (
                      <div key={option.value}>
                        <RadioGroupItem id={`followup-${option.value}`} value={option.value} className="peer sr-only" />
                        <Label
                          htmlFor={`followup-${option.value}`}
                          className={cn(
                            "flex cursor-pointer flex-col gap-2 rounded-[20px] border border-border/60 bg-background px-4 py-4 transition-all",
                            "hover:border-primary/40 hover:bg-primary/[0.03]",
                            "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/[0.05]"
                          )}
                        >
                          <span className="text-sm font-semibold">{option.title}</span>
                          <span className="text-sm leading-6 text-muted-foreground">{option.description}</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <aside className="border-t border-border/60 bg-muted/[0.18] px-4 py-5 sm:px-6 lg:border-l lg:border-t-0 lg:px-8">
            <div className="space-y-8">
              <section className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Voz</p>
                  <h2 className="text-xl font-semibold">Tom da fala</h2>
                </div>

                <RadioGroup
                  value={localVoiceType}
                  onValueChange={(value: AudioVoiceType) => {
                    setLocalVoiceType(value);
                    markDirty();
                  }}
                  className="grid gap-3"
                >
                  {voiceOptions.map((option) => (
                    <div key={option.value}>
                      <RadioGroupItem id={`voice-${option.value}`} value={option.value} className="peer sr-only" />
                      <Label
                        htmlFor={`voice-${option.value}`}
                        className={cn(
                          "flex cursor-pointer items-center justify-between rounded-[20px] border border-border/60 bg-background px-4 py-4 transition-all",
                          "hover:border-primary/40 hover:bg-primary/[0.03]",
                          "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/[0.05]"
                        )}
                      >
                        <div>
                          <p className="text-sm font-semibold">{option.title}</p>
                          <p className="text-sm text-muted-foreground">{option.description}</p>
                        </div>
                        <Volume2 className="h-5 w-5 text-primary" />
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </section>

              <Separator />

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ritmo</p>
                    <h2 className="text-xl font-semibold">Velocidade</h2>
                  </div>
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {localSpeed.toFixed(2)}x
                  </Badge>
                </div>

                <Slider
                  value={[localSpeed]}
                  min={0.75}
                  max={1.4}
                  step={0.05}
                  onValueChange={([value]) => {
                    setLocalSpeed(value);
                    markDirty();
                  }}
                />

                <div className="grid grid-cols-2 gap-2">
                  {speedPresets.map((preset) => (
                    <Button
                      key={preset.value}
                      variant="outline"
                      className={cn(
                        "h-auto rounded-2xl px-3 py-3 text-sm",
                        Math.abs(localSpeed - preset.value) < 0.01 && "border-primary bg-primary/[0.05] text-primary"
                      )}
                      onClick={() => {
                        setLocalSpeed(preset.value);
                        markDirty();
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </section>

              <Separator />

              <section className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Teste</p>
                  <h2 className="text-xl font-semibold">Ouvir antes de salvar</h2>
                </div>

                <div className="rounded-[24px] border border-border/60 bg-background px-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    Escute como a voz vai sair com a configuração atual. O preview usa a voz e a velocidade selecionadas acima.
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {speedPresets.map((preset) => (
                      <Button
                        key={preset.label}
                        variant="outline"
                        className="justify-start rounded-2xl"
                        onClick={() => generatePreview(preset.value, preset.label)}
                        disabled={isGeneratingPreview}
                      >
                        {isGeneratingPreview && activePreviewLabel === preset.label ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="mr-2 h-4 w-4" />
                        )}
                        {preset.label}
                      </Button>
                    ))}
                  </div>

                  <Button
                    variant="secondary"
                    className="mt-3 w-full rounded-2xl"
                    onClick={() => generatePreview(localSpeed, "Atual")}
                    disabled={isGeneratingPreview}
                  >
                    {isGeneratingPreview && activePreviewLabel === "Atual" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Waves className="mr-2 h-4 w-4" />
                    )}
                    Testar configuração atual
                  </Button>
                </div>
              </section>

              <Separator />

              <section className="space-y-3 rounded-[24px] bg-background px-4 py-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Resumo rápido</p>
                </div>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li>Modo principal: {activeResponseMode?.title ?? "Não definido"}.</li>
                  <li>Follow-up: {activeFollowupMode?.description ?? "Sem áudio no follow-up."}</li>
                  <li>Se o áudio falhar ou a cota acabar, o sistema volta para texto.</li>
                </ul>
              </section>
            </div>
          </aside>
        </div>
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
