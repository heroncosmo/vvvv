import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowDown, ArrowUp, Siren, UserRound } from "lucide-react";

type AttentionPriorityLike = string | null | undefined;

interface AttentionSummaryProps {
  priority: AttentionPriorityLike;
  needsHumanAttention: boolean;
  reason?: string | null;
  confidence?: number | string | null;
  compact?: boolean;
  className?: string;
}

function getConfidenceValue(confidence?: number | string | null): number | null {
  if (typeof confidence === "number") {
    return Number.isFinite(confidence) ? confidence : null;
  }

  if (typeof confidence === "string" && confidence.trim().length > 0) {
    const parsed = Number(confidence);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function getAttentionPriorityMeta(priority: AttentionPriorityLike, needsHumanAttention: boolean) {
  if (!needsHumanAttention || !priority) {
    return {
      label: "Sem urgência humana",
      className: "border-slate-200 bg-slate-50 text-slate-600",
      icon: ArrowDown,
    };
  }

  if (priority === "critica") {
    return {
      label: "Crítica",
      className: "border-rose-200 bg-rose-50 text-rose-700",
      icon: Siren,
    };
  }

  if (priority === "alta") {
    return {
      label: "Alta",
      className: "border-orange-200 bg-orange-50 text-orange-700",
      icon: AlertTriangle,
    };
  }

  if (priority === "media") {
    return {
      label: "Média",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      icon: ArrowUp,
    };
  }

  return {
    label: "Baixa",
    className: "border-sky-200 bg-sky-50 text-sky-700",
    icon: UserRound,
  };
}

export function AttentionPriorityBadge({
  priority,
  needsHumanAttention,
  className,
}: Pick<AttentionSummaryProps, "priority" | "needsHumanAttention" | "className">) {
  const meta = getAttentionPriorityMeta(priority, needsHumanAttention);
  const Icon = meta.icon;

  return (
    <Badge variant="outline" className={cn("gap-1.5 rounded-full", meta.className, className)}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
}

export function AttentionSummary({
  priority,
  needsHumanAttention,
  reason,
  confidence,
  compact = false,
  className,
}: AttentionSummaryProps) {
  const normalizedReason = reason?.trim() || null;
  const confidenceValue = getConfidenceValue(confidence);

  if (!needsHumanAttention && !normalizedReason && compact) {
    return <AttentionPriorityBadge priority={priority} needsHumanAttention={needsHumanAttention} className={className} />;
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-muted/40",
        compact ? "p-3" : "p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <AttentionPriorityBadge priority={priority} needsHumanAttention={needsHumanAttention} />
        {confidenceValue !== null && (
          <Badge variant="secondary" className="rounded-full">
            Confiança {Math.round(confidenceValue * 100)}%
          </Badge>
        )}
      </div>

      <p className={cn("mt-2 text-sm leading-5", !normalizedReason && "text-muted-foreground")}>
        {normalizedReason || "A IA não identificou necessidade de escalonamento humano neste momento."}
      </p>
    </div>
  );
}
