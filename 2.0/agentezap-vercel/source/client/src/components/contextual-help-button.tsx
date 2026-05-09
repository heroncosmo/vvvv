/**
 * ContextualHelpButton — Ajuda Contextual (ícone ? / "Saber mais")
 * Aparece em páginas funcionais para levar o usuário ao tutorial exato na Central de Ajuda.
 * Uso: <ContextualHelpButton articleId="followup-setup" />
 */
import { useState } from "react";
import { HelpCircle, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLocation } from "wouter";

interface ContextualHelpButtonProps {
  /** ID do artigo da Central de Ajuda para linkar diretamente */
  articleId: string;
  /** Título curto exibido no tooltip/popover */
  title?: string;
  /** Descrição curta do que o artigo cobre */
  description?: string;
  /** Tamanho do ícone: "sm" | "md" (padrão md) */
  size?: "sm" | "md";
  /** Variante visual: "ghost" | "outline" */
  variant?: "ghost" | "outline";
  /** Posição da seta: popover trigger */
  align?: "start" | "center" | "end";
  label?: string;
}

const ARTICLE_META: Record<string, { title: string; description: string }> = {
  "onboarding-connect":    { title: "Como conectar o WhatsApp", description: "Escanear QR Code e ativar a conexão." },
  "onboarding-agent":      { title: "Configurar seu Agente IA", description: "Definir prompt, nome e comportamento." },
  "onboarding-activate":   { title: "Ativar e testar o agente", description: "Validar antes de ir ao ar." },
  "dashboard-overview":    { title: "Entendendo o Dashboard", description: "O que cada número e card significa." },
  "ai-agent-chat":         { title: "Calibrar o Agente via Chat", description: "Ajustar com linguagem natural." },
  "ai-agent-prompt":       { title: "Editar o Prompt do Agente", description: "Controle total sobre as instruções." },
  "ai-agent-calibration":  { title: "Configurações do Agente", description: "Delay, tamanho de mensagem e gatilhos." },
  "ai-agent-simulator":    { title: "Simulador WhatsApp", description: "Testar o agente antes de ativar." },
  "ai-agent-media":        { title: "Aba Mídias", description: "Imagens, áudios e vídeos automáticos." },
  "ai-agent-flow":         { title: "Fluxo de Conversa", description: "Roteiros estruturados de atendimento." },
  "connection-qrcode":     { title: "Conectar via QR Code", description: "Passo a passo detalhado." },
  "connection-disconnect": { title: "Reconectar WhatsApp", description: "Quando e como reiniciar a conexão." },
  "mass-send-setup":       { title: "Envio em Massa", description: "Disparar mensagens para vários contatos." },
  "scheduling-maton-google-calendar": { title: "Google Agenda direto", description: "Conectar a conta Google direto no AgenteZap e escolher a agenda para sincronizacao." },
  "integrations-meta-formulario-google-drive": { title: "Formulário Meta com Google direto", description: "Salvar credenciais Google, conectar o Drive e escolher planilhas pelo nome." },
  "kanban-overview":       { title: "Kanban CRM", description: "Organizar leads por etapas do funil." },
  "funnel-overview":       { title: "Qualificação de Lead", description: "IA classifica leads em Quente/Morno/Frio." },
  "followup-setup":        { title: "Follow-up Inteligente", description: "Recuperar conversas inativas." },
  "audio-overview":        { title: "Falar por Áudio", description: "Agente responde com mensagem de voz." },
  "notifier-overview":     { title: "Notificador Inteligente", description: "Alertas quando precisar de atenção." },
  "media-overview":        { title: "Biblioteca de Mídias", description: "Gerenciar arquivos do agente." },
  "conversations-overview":{ title: "Lista de Conversas", description: "Navegar e gerenciar conversas." },
  "conversations-ia-pause":{ title: "Pausar a IA", description: "Assumir atendimento manual." },
  "delivery2-overview":    { title: "Configurar o Delivery 2.0", description: "Ativar o modulo, calibrar o prompt e operar os pedidos." },
};

export function ContextualHelpButton({
  articleId,
  title,
  description,
  size = "md",
  variant = "ghost",
  align = "end",
  label,
}: ContextualHelpButtonProps) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  const meta = ARTICLE_META[articleId];
  const displayTitle = title || meta?.title || "Ajuda";
  const displayDesc = description || meta?.description || "Veja o tutorial completo na Central de Ajuda.";

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const hasLabel = Boolean(label);
  const btnClassName = hasLabel
    ? size === "sm"
      ? "h-7 gap-1.5 rounded-full px-2.5"
      : "h-8 gap-2 rounded-full px-3"
    : size === "sm"
      ? "h-6 w-6 rounded-full"
      : "h-8 w-8 rounded-full";

  function goToHelp() {
    setOpen(false);
    navigate(`/ajuda?article=${articleId}`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={variant}
          size={hasLabel ? "sm" : "icon"}
          className={`${btnClassName} text-muted-foreground hover:text-foreground transition-colors`}
          aria-label={`Ajuda: ${displayTitle}`}
          title={`Ajuda: ${displayTitle}`}
        >
          <HelpCircle className={iconSize} />
          {hasLabel ? <span className="text-xs font-medium">{label}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side="bottom"
        className="w-64 p-3"
        sideOffset={4}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <HelpCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            {displayTitle}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
          {displayDesc}
        </p>
        <Button
          onClick={goToHelp}
          size="sm"
          className="mt-2.5 w-full h-7 text-xs gap-1.5"
        >
          <ExternalLink className="h-3 w-3" />
          Ver tutorial completo
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export default ContextualHelpButton;
