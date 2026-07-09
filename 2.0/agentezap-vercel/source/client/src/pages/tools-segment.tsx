import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthToken, refreshSession } from "@/lib/supabase";
import { ArrowLeft, ArrowRight, CheckCircle, Star, Zap } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BusinessCategory {
  id: string;
  slug: string;
  name: string;
  categoryGroup: string;
  groupLabel: string;
  icon: string;
  description: string | null;
  targetTool: string;
  welcomeMessage: string | null;
  color: string;
  userCount: number;
  sortOrder: number;
  isActive: boolean;
}

// ─── Tool redirect map ────────────────────────────────────────────────────────
const toolRoutes: Record<string, string> = {
  delivery:    "/delivery-2",
  agendamento: "/agendamento-2",
  vendas:      "/produtos",
  generic:     "/meu-agente-ia",
};

const toolNames: Record<string, string> = {
  delivery:    "Delivery 2.0",
  agendamento: "Agendamento 2.0",
  vendas:      "Catálogo/Vendas",
  generic:     "Agente IA",
};

// ─── How It Works per tool ────────────────────────────────────────────────────
function howItWorksSteps(cat: BusinessCategory): string[] {
  switch (cat.targetTool) {
    case "delivery":
      return [
        `Configure o cardápio digital do seu ${cat.name} em minutos.`,
        "Seus clientes pedem diretamente pelo WhatsApp com IA 24h.",
        "Você recebe notificações de pedidos em tempo real.",
        "Relatórios de faturamento e produtos mais vendidos.",
      ];
    case "agendamento":
      return [
        `Cadastre os serviços e profissionais do seu ${cat.name}.`,
        "Clientes agendam pelo WhatsApp sem precisar ligar.",
        "Sistema de lembretes automáticos para reduzir faltas.",
        "Agenda centralizada com visualização por dia/semana.",
      ];
    case "vendas":
      return [
        `Monte o catálogo de produtos da ${cat.name}.`,
        "Atenda e venda automaticamente pelo WhatsApp.",
        "Qualifique leads e acompanhe o funil de vendas.",
        "Envie campanhas segmentadas para clientes.",
      ];
    default:
      return [
        `Configure um Agente IA especializado para ${cat.name}.`,
        "Responda clientes automaticamente 24h por dia.",
        "Treine a IA com informações do seu negócio.",
        "Gerencie conversas e acompanhe métricas.",
      ];
  }
}

function benefits(cat: BusinessCategory): string[] {
  const base = [
    "Atendimento automático 24h pelo WhatsApp",
    "Mais eficiência, menos trabalho manual",
    "Personalizado para o seu tipo de negócio",
  ];
  if (cat.targetTool === "delivery") {
    return ["Pedidos organizados automaticamente", "Cardápio digital atualizado em tempo real", ...base];
  }
  if (cat.targetTool === "agendamento") {
    return ["Agendamentos sem precisar ligar", "Lembretes automáticos para clientes", ...base];
  }
  return base;
}

async function getAuthorizedHeaders(headers: Record<string, string> = {}) {
  let token = await getAuthToken();

  if (!token) {
    const refreshed = await refreshSession();
    if (refreshed) {
      token = await getAuthToken();
    }
  }

  if (!token) {
    return headers;
  }

  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ToolsSegmentPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/ferramentas/:slug");
  const slug = params?.slug || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<{ category: BusinessCategory }>({
    queryKey: [`/api/business-categories/${slug}`],
    queryFn: async () => {
      const res = await fetch(`/api/business-categories/${slug}`);
      if (!res.ok) throw new Error("Categoria não encontrada");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  const cat = data?.category;

  // Save business type when user clicks CTA
  const saveBTMutation = useMutation({
    mutationFn: async (btSlug: string) => {
      const headers = await getAuthorizedHeaders({ "Content-Type": "application/json" });
      const res = await fetch("/api/user/business-type", {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({ businessType: btSlug }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/business-type"] });
    },
  });

  const handleAccessTool = () => {
    if (!cat) return;
    const toolRoute = toolRoutes[cat.targetTool] || "/meu-agente-ia";
    const segmentParam = `?segment=${cat.slug}`;

    // Save business type silently
    saveBTMutation.mutate(cat.slug);

    // Track segment analytics (fire-and-forget)
    getAuthorizedHeaders({ "Content-Type": "application/json" })
      .then((headers) =>
        fetch("/api/analytics/segment-access", {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ segment: cat.slug, tool: cat.targetTool }),
        })
      )
      .catch(() => {
        /* ignore analytics errors */
      });

    // Show toast
    toast({
      title: `Você está usando a ferramenta para ${cat.name}`,
      description: `Redirecionando para ${toolNames[cat.targetTool] || "Ferramenta"}...`,
    });

    // Navigate to the actual tool
    setTimeout(() => {
      setLocation(`${toolRoute}${segmentParam}`);
    }, 800);
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !cat) {
    return (
      <div className="flex-1 overflow-auto bg-background">
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-4xl mb-4">🔍</p>
          <h2 className="text-xl font-semibold mb-2">Categoria não encontrada</h2>
          <p className="text-muted-foreground mb-6">O segmento <strong>{slug}</strong> não foi encontrado.</p>
          <Button variant="outline" onClick={() => setLocation("/ferramentas")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Ferramentas
          </Button>
        </div>
      </div>
    );
  }

  const steps = howItWorksSteps(cat);
  const benefitList = benefits(cat);
  const toolLabel = toolNames[cat.targetTool] || "Ferramenta";

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">

        {/* Back link */}
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setLocation("/ferramentas")}
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Ferramentas
        </button>

        {/* Hero header */}
        <div
          className="rounded-2xl p-6 text-white space-y-3"
          style={{ background: `linear-gradient(135deg, ${cat.color}dd, ${cat.color}99)` }}
        >
          <div className="flex items-center gap-3">
            <span className="text-5xl" aria-hidden="true">{cat.icon}</span>
            <div>
              <Badge className="bg-white/20 text-white border-white/30 text-xs mb-1">
                {cat.groupLabel}
              </Badge>
              <h1 className="text-2xl font-bold leading-tight">
                Ferramenta para {cat.name}
              </h1>
            </div>
          </div>
          <p className="text-white/90 text-sm leading-relaxed">
            {cat.welcomeMessage
              ? `${cat.welcomeMessage} — Automatize seu atendimento e aumente suas vendas com a ferramenta certa para ${cat.name}.`
              : `Automatize o atendimento do seu ${cat.name} pelo WhatsApp. Economize tempo, atenda mais clientes e venda mais com inteligência artificial.`
            }
          </p>
        </div>

        {/* Welcome message / personalized description */}
        <div className="bg-card border rounded-xl p-5 space-y-2">
          <p className="text-sm leading-relaxed text-foreground">
            {cat.description ||
              `Com a ferramenta ${toolLabel} do AgenteZap, seu ${cat.name} passa a ter atendimento automatizado 24h por dia pelo WhatsApp. Seus clientes recebem respostas imediatas, fazem pedidos ou agendamentos sem precisar ligar — e você foca no que realmente importa.`}
          </p>
        </div>

        {/* Como funciona */}
        <section>
          <h2 className="text-lg font-semibold mb-4">
            Como funciona para {cat.name}
          </h2>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white mt-0.5"
                  style={{ backgroundColor: cat.color }}
                >
                  {i + 1}
                </span>
                <p className="text-sm text-foreground leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Benefits */}
        <section className="bg-muted/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            Benefícios para {cat.name}
          </h3>
          <ul className="space-y-2">
            {benefitList.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-2">QR Code direto para o WhatsApp</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Gere um QR com mensagem pronta para placa, vitrine, cardapio ou material de grafica sem sair do segmento de {cat.name}.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setLocation(`/qrcode-whatsapp?segment=${cat.slug}`)}
          >
            Gerar QR para {cat.name}
          </Button>
        </section>

        {/* CTA Button */}
        <div className="space-y-3 pb-8">
          <Button
            size="lg"
            className="w-full text-base font-semibold py-6 text-white shadow-lg hover:shadow-xl transition-shadow"
            style={{ backgroundColor: cat.color, borderColor: cat.color }}
            onClick={handleAccessTool}
          >
            Acessar Ferramenta →
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Ferramenta: <strong>{toolLabel}</strong> · Segmento: {cat.name}
          </p>
        </div>
      </div>
    </div>
  );
}
