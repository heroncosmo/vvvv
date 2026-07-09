import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileText,
  GitBranch,
  Headphones,
  ImageIcon,
  MessageSquare,
  Settings2,
  Video,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TriggerNodeData = {
  title: string;
  subtitle: string;
  triggerLabel: string;
  modeLabel: string;
};

type MessageHandle = {
  id: string;
  label: string;
};

type MessageNodeData = {
  title: string;
  subtitle: string;
  body: string;
  variant: "message" | "question" | "media";
  handles?: MessageHandle[];
  footerLabel?: string;
};

type ActionNodeData = {
  title: string;
  subtitle: string;
  body: string;
  variant: "handoff" | "end";
  terminal?: boolean;
};

function getVariantAccent(variant: MessageNodeData["variant"]) {
  if (variant === "question") {
    return {
      chip: "bg-violet-100 text-violet-700",
      iconWrap: "bg-violet-100 text-violet-700",
      handle: "#8b5cf6",
    };
  }

  if (variant === "media") {
    return {
      chip: "bg-amber-100 text-amber-700",
      iconWrap: "bg-amber-100 text-amber-700",
      handle: "#f59e0b",
    };
  }

  return {
    chip: "bg-emerald-100 text-emerald-700",
    iconWrap: "bg-violet-100 text-violet-700",
    handle: "#7c3aed",
  };
}

function MessageVariantIcon({ variant }: { variant: MessageNodeData["variant"] }) {
  if (variant === "question") return <GitBranch className="h-4 w-4" />;
  if (variant === "media") return <ImageIcon className="h-4 w-4" />;
  return <MessageSquare className="h-4 w-4" />;
}

export const FlowTriggerNode = memo(({ data }: NodeProps<TriggerNodeData>) => {
  return (
    <div className="relative min-w-[280px] rounded-[28px] border-2 border-violet-500 bg-white p-6 shadow-[0_18px_38px_rgba(124,58,237,0.18)] ring-8 ring-violet-500/6">
      <div className="absolute -top-3 left-6 rounded-full bg-violet-600 px-4 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-lg">
        Início do Fluxo
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div className="rounded-[22px] bg-violet-100 p-3 text-violet-700">
          <Zap className="h-6 w-6 fill-current" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-black tracking-tight text-slate-900">{data.title}</p>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{data.subtitle}</p>
        </div>
      </div>
      <div className="mt-5 rounded-[22px] border border-slate-100 bg-slate-50 px-4 py-4">
        <p className="text-sm leading-relaxed text-slate-500">
          Quando o cliente enviar:
          <br />
          <span className="text-lg font-black text-violet-600">&quot;{data.triggerLabel}&quot;</span>
        </p>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{data.modeLabel}</p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="route-entry"
        className="!h-4 !w-4 !border-4 !border-white !bg-violet-500 shadow-lg"
      />
    </div>
  );
});

FlowTriggerNode.displayName = "FlowTriggerNode";

export const FlowMessageNode = memo(({ data }: NodeProps<MessageNodeData>) => {
  const accent = getVariantAccent(data.variant);
  const handles = data.handles || [];

  return (
    <div className="group min-w-[320px] overflow-visible rounded-[28px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all duration-300 hover:border-violet-200 hover:shadow-[0_18px_36px_rgba(15,23,42,0.10)]">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className={cn("rounded-xl p-1.5", accent.iconWrap)}>
            <MessageVariantIcon variant={data.variant} />
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">{data.title}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-300">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <Settings2 className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-[22px] border border-slate-100 bg-slate-50/80 p-4 transition-colors group-hover:bg-white">
          <p className="text-sm font-medium leading-relaxed text-slate-600">
            {data.body || "Configure o conteúdo deste bloco no painel lateral."}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-50 pt-2">
          <div className="flex items-center gap-1.5">
            <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]", accent.chip)}>
              {data.subtitle}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            {data.variant === "media" ? (
              <>
                <MediaIcon><ImageIcon className="h-3.5 w-3.5" /></MediaIcon>
                <MediaIcon><Video className="h-3.5 w-3.5" /></MediaIcon>
                <MediaIcon><FileText className="h-3.5 w-3.5" /></MediaIcon>
              </>
            ) : data.variant === "question" ? (
              <MediaIcon><GitBranch className="h-3.5 w-3.5" /></MediaIcon>
            ) : (
              <>
                <MediaIcon><MessageSquare className="h-3.5 w-3.5" /></MediaIcon>
                <MediaIcon><Bot className="h-3.5 w-3.5" /></MediaIcon>
              </>
            )}
          </div>
        </div>

        {data.footerLabel ? (
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">{data.footerLabel}</p>
        ) : null}
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-white !bg-slate-200"
      />

      {handles.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 -bottom-9 flex justify-center">
          <div className="relative h-10 w-full max-w-[280px]">
            {handles.map((handle, index) => {
              const left = `${((index + 1) / (handles.length + 1)) * 100}%`;

              return (
                <div
                  key={handle.id}
                  className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1"
                  style={{ left }}
                >
                  <Handle
                    type="source"
                    position={Position.Bottom}
                    id={handle.id}
                    className="!pointer-events-auto !h-3.5 !w-3.5 !border-2 !border-white shadow-md"
                    style={{ left: "50%", transform: "translateX(-50%)", background: accent.handle, bottom: "auto", top: 0 }}
                  />
                  <span className="rounded-full bg-white/95 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 shadow-sm">
                    {handle.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          id="next"
          className="!h-3.5 !w-3.5 !border-2 !border-white shadow-md"
          style={{ background: accent.handle }}
        />
      )}
    </div>
  );
});

FlowMessageNode.displayName = "FlowMessageNode";

export const FlowActionNode = memo(({ data }: NodeProps<ActionNodeData>) => {
  const isEnd = data.variant === "end";

  return (
    <div className="min-w-[300px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all duration-300 hover:border-emerald-200 hover:shadow-[0_18px_36px_rgba(15,23,42,0.10)]">
      <div className={cn("flex items-center justify-between border-b border-slate-100 px-5 py-3", isEnd ? "bg-emerald-50" : "bg-amber-50")}>
        <div className="flex items-center gap-2.5">
          <div className={cn("rounded-xl p-1.5 text-white shadow-sm", isEnd ? "bg-emerald-500" : "bg-amber-500")}>
            {isEnd ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">{data.title}</span>
        </div>
        <div className={cn("h-2 w-2 rounded-full", isEnd ? "bg-emerald-400" : "bg-amber-400")} />
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-start gap-4 rounded-[22px] border border-slate-100 bg-slate-50/80 p-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-2.5 text-slate-500 shadow-sm">
            {isEnd ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Headphones className="h-5 w-5 text-amber-500" />}
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{data.subtitle}</p>
            <p className="text-sm font-medium leading-relaxed text-slate-600">
              {data.body || "Configure a ação final deste fluxo."}
            </p>
          </div>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-white !bg-slate-200"
      />
      {!data.terminal ? (
        <Handle
          type="source"
          position={Position.Bottom}
          id="next"
          className="!h-3.5 !w-3.5 !border-2 !border-white shadow-md"
          style={{ background: isEnd ? "#10b981" : "#f59e0b" }}
        />
      ) : null}
    </div>
  );
});

FlowActionNode.displayName = "FlowActionNode";

function MediaIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-transparent bg-slate-50 p-1.5 text-slate-400 transition-colors hover:border-violet-100 hover:text-violet-500">
      {children}
    </div>
  );
}
