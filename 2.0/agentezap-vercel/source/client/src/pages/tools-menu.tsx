import React, { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/hooks/useBranding";
import { canMemberAccessPath, resolveMemberPermissions, type MemberPermissions } from "@/lib/member-permissions";
import { getAuthToken, refreshSession } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  Bell,
  BookUser,
  BookOpen,
  Bot,
  CalendarClock,
  Filter,
  FormInput,
  Gift,
  KanbanSquare,
  Megaphone,
  Mic,
  Package,
  Palette,
  Plug,
  QrCode,
  Rocket,
  Search,
  Send,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Tags,
  Ticket,
  Upload,
  Users,
  UtensilsCrossed,
  Workflow,
  Wrench,
} from "lucide-react";

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

interface CategoryGroup {
  group: string;
  groupLabel: string;
  totalUsers: number;
  categories: BusinessCategory[];
}

interface ToolHubLink {
  label: string;
  href: string;
}

interface ToolHubEntry {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string[];
  featured?: boolean;
  memberHidden?: boolean;
  requiresSendPermission?: boolean;
  requiresContactPermission?: boolean;
  requiresKanbanPermission?: boolean;
  subLinks?: ToolHubLink[];
}

interface ToolHubSection {
  id: string;
  title: string;
  description: string;
  entries: ToolHubEntry[];
}

const macroGroupOrder = [
  "delivery",
  "beleza",
  "saude",
  "imobiliario",
  "automotivo",
  "varejo",
  "servicos",
  "outros",
] as const;

type MacroGroupKey = typeof macroGroupOrder[number];

const macroGroupLabels: Record<MacroGroupKey, string> = {
  delivery: "Delivery",
  beleza: "Beleza",
  saude: "Saude",
  imobiliario: "Imobiliario",
  automotivo: "Automotivo",
  varejo: "Varejo",
  servicos: "Servicos",
  outros: "Outros",
};

const rawToMacroGroup: Record<string, MacroGroupKey> = {
  delivery: "delivery",
  beleza: "beleza",
  saude: "saude",
  imobiliario: "imobiliario",
  automotivo: "automotivo",
  varejo: "varejo",
  servicos: "servicos",
  educacao: "servicos",
  tecnologia: "servicos",
  eventos: "servicos",
  financeiro: "servicos",
  construcao: "servicos",
  juridico: "servicos",
  geral: "outros",
};

const pinnedToolIds = ["scheduling", "courses", "estamparia"] as const;

const toolHubSections: ToolHubSection[] = [
  {
    id: "core",
    title: "Ferramentas principais",
    description: "As areas mais usadas do sistema para configurar, responder e destravar fluxo.",
    entries: [
      {
        id: "ai",
        label: "Inteligencia Artificial",
        description: "Abra o Meu Agente IA e ajuste respostas, contexto, fluxo e comportamento.",
        href: "/meu-agente-ia",
        icon: Bot,
        keywords: ["ia", "agente", "prompt", "meu agente ia", "inteligencia artificial"],
        featured: true,
        memberHidden: true,
      },
      {
        id: "followup",
        label: "Follow-up Inteligente",
        description: "Recupere conversas automaticamente sem sair desta central.",
        href: "/followup",
        icon: Sparkles,
        keywords: ["followup", "reengajar", "retomar", "mensagens automaticas"],
        featured: true,
      },
      {
        id: "audio",
        label: "Falar por Audio",
        description: "Configure respostas em audio, espelhamento e audio no follow-up.",
        href: "/falar-por-audio",
        icon: Mic,
        keywords: ["audio", "voz", "tts", "falar por audio"],
        featured: true,
      },
      {
        id: "status-posts",
        label: "Postagens no Status",
        description: "Publique agora ou programe status recorrentes sem voltar ao menu lateral.",
        href: "/postagens-status",
        icon: Rocket,
        keywords: ["status", "whatsapp status", "postagens", "agendamento status"],
        featured: true,
      },
      {
        id: "qr",
        label: "QR Code WhatsApp",
        description: "Gere um link com mensagem pronta para conversas, campanhas e divulgacao.",
        href: "/qrcode-whatsapp",
        icon: QrCode,
        keywords: ["qr", "whatsapp", "link", "mensagem pronta"],
      },
      {
        id: "media-library",
        label: "Biblioteca de Midias",
        description: "Organize audios, imagens e videos que o agente vai usar.",
        href: "/biblioteca-midias",
        icon: Upload,
        keywords: ["midia", "biblioteca", "upload", "imagem", "video", "audio"],
      },
      {
        id: "flow2-leona",
        label: "Fluxo 2.0",
        description: "Editor visual isolado no estilo Leona, com blocos, canvas, PIX, IA, delays e condicoes.",
        href: "/meu-agente-ia?tab=flow2",
        icon: Workflow,
        keywords: ["fluxo 2.0", "leona", "fluxo leona", "chatbot visual", "pix", "canvas"],
        featured: true,
      },
      {
        id: "tickets",
        label: "Tickets",
        description: "Acompanhe chamados, fila de suporte e acompanhamento operacional.",
        href: "/tickets",
        icon: Ticket,
        keywords: ["ticket", "suporte", "chamado"],
      },
    ],
  },
  {
    id: "operations",
    title: "Operacao do negocio",
    description: "Ferramentas para rotina diaria, atendimento especializado e automacoes operacionais.",
    entries: [
      {
        id: "delivery2",
        label: "Delivery 2.0",
        description: "PDV online com pedidos extraidos direto do prompt do agente, sem fluxo proprio.",
        href: "/delivery-2",
        icon: ShoppingBag,
        keywords: ["delivery 2.0", "pdv", "pedidos", "prompt", "delivery prompt"],
        featured: true,
      },
      {
        id: "delivery",
        label: "Delivery",
        description: "Central do delivery com cardapio, pedidos e relatorios no mesmo lugar.",
        href: "/delivery-cardapio",
        icon: UtensilsCrossed,
        keywords: ["delivery", "cardapio", "pedidos", "relatorios delivery"],
        featured: true,
        subLinks: [
          { label: "Cardapio", href: "/delivery-cardapio" },
          { label: "Pedidos", href: "/delivery-pedidos" },
          { label: "Relatorios", href: "/delivery-relatorios" },
        ],
      },
      {
        id: "scheduling",
        label: "Agenda Inteligente",
        description: "Confirma horarios pela agenda real, acompanha compromissos e ajuda a evitar conflitos.",
        href: "/agendamento-3",
        icon: CalendarClock,
        keywords: ["agendamento", "agenda", "horario", "painel agendamentos", "agenda inteligente", "agendamento 3.0"],
        featured: true,
        subLinks: [
          { label: "Agenda", href: "/agendamento-3" },
          { label: "Configurações", href: "/agendamento-3" },
        ],
      },
      {
        id: "reservations",
        label: "Reservas",
        description: "Controle reservas e disponibilidade quando o fluxo depende de hospedagem ou mesa.",
        href: "/reservas",
        icon: BedDouble,
        keywords: ["reservas", "hospedagem", "mesa", "quartos"],
      },
      {
        id: "notifier",
        label: "Notificador Inteligente",
        description: "Automatize avisos, lembretes e disparos contextuais.",
        href: "/notificador",
        icon: Bell,
        keywords: ["notificador", "lembrete", "aviso", "notificacao"],
        memberHidden: true,
      },
      {
        id: "lead-queue",
        label: "Fila de Atencao",
        description: "Priorize leads e atendimentos que pedem acao humana ou IA mais guiada.",
        href: "/qualificacao",
        icon: Sparkles,
        keywords: ["fila", "atencao", "qualificacao", "lead"],
      },
      {
        id: "courses",
        label: "Cursos",
        description: "Módulo de agendamento de cursos para acompanhar quem fechou com a IA e entrar direto na conversa.",
        href: "/cursos",
        icon: BookOpen,
        keywords: ["cursos", "agendamento", "fechamento", "agenda", "conversa"],
        memberHidden: true,
      },
      {
        id: "estamparia",
        label: "Estamparia",
        description: "Briefing, arte com IA, aprovação interna e envio da arte ao cliente no mesmo módulo.",
        href: "/estamparia",
        icon: Palette,
        keywords: ["estamparia", "arte", "briefing", "uniforme", "wind banner", "tecido", "sublimacao"],
        featured: true,
        memberHidden: true,
      },
      {
        id: "integrations",
        label: "Imobiliaria",
        description: "Importe XML, ligue integracoes e trate leads de ZAP, Viva Real e OLX.",
        href: "/integracoes",
        icon: Plug,
        keywords: ["imobiliaria", "integracoes", "xml", "zap", "vivareal", "olx"],
        memberHidden: true,
      },
    ],
  },
  {
    id: "growth",
    title: "CRM, listas e vendas",
    description: "Tudo que organiza contato, campanha, base comercial e expansao.",
    entries: [
      {
        id: "mass-send",
        label: "Envio em Massa",
        description: "Dispare mensagens em lote quando ja tiver a segmentacao pronta.",
        href: "/envio-em-massa",
        icon: Send,
        keywords: ["envio em massa", "bulk", "disparo"],
        requiresSendPermission: true,
      },
      {
        id: "referrals",
        label: "Indique e Ganhe",
        description: "Abra a carteira de indicacoes e acompanhe o programa de recomendacao.",
        href: "/indicacoes",
        icon: Gift,
        keywords: ["indicacao", "indique e ganhe", "carteira", "recompensa"],
        requiresSendPermission: true,
      },
      {
        id: "contact-lists",
        label: "Listas de Contatos",
        description: "Organize bases para campanha, filtro e operacao comercial.",
        href: "/listas-contatos",
        icon: BookUser,
        keywords: ["listas", "contatos", "lista de contatos"],
        requiresContactPermission: true,
      },
      {
        id: "campaigns",
        label: "Campanhas",
        description: "Monte disparos e acompanhe a performance da operacao comercial.",
        href: "/campanhas",
        icon: Megaphone,
        keywords: ["campanha", "campanhas", "disparos"],
        featured: true,
        requiresSendPermission: true,
      },
      {
        id: "kanban",
        label: "Kanban",
        description: "Visualize pipeline, mova etapas e acompanhe oportunidades.",
        href: "/kanban",
        icon: KanbanSquare,
        keywords: ["kanban", "pipeline", "oportunidades"],
        featured: true,
        requiresKanbanPermission: true,
      },
      {
        id: "contacts",
        label: "Contatos",
        description: "Centralize clientes, leads, historico e relacionamento.",
        href: "/contatos",
        icon: Users,
        keywords: ["contatos", "clientes", "leads"],
        featured: true,
        requiresContactPermission: true,
      },
      {
        id: "synced-contacts",
        label: "Contatos Sincronizados",
        description: "Veja a base importada do WhatsApp e ajuste seu uso operacional.",
        href: "/contatos-sincronizados",
        icon: Smartphone,
        keywords: ["sincronizados", "whatsapp", "agenda"],
      },
      {
        id: "tags",
        label: "Etiquetas",
        description: "Crie marcacoes para filtrar, disparar e organizar o atendimento.",
        href: "/etiquetas",
        icon: Tags,
        keywords: ["etiquetas", "tags", "marcacao"],
      },
      {
        id: "custom-fields",
        label: "Campos Personalizados",
        description: "Guarde informacoes extras dos contatos sem perder padrao de atendimento.",
        href: "/campos-personalizados",
        icon: FormInput,
        keywords: ["campos", "personalizados", "crm"],
        memberHidden: true,
      },
      {
        id: "products",
        label: "Catalogo de Produtos",
        description: "Cadastre produtos, preco e material comercial em um painel unico.",
        href: "/produtos",
        icon: Package,
        keywords: ["catalogo", "produtos", "precos"],
        memberHidden: true,
      },
      {
        id: "funnel",
        label: "Funil",
        description: "Veja a progressao comercial e acompanhe gargalos de conversao.",
        href: "/funil",
        icon: Filter,
        keywords: ["funil", "conversao", "vendas"],
      },
    ],
  },
];

function hexToRgba(hex: string, alpha: number) {
  const sanitized = hex.replace("#", "").trim();
  const normalized =
    sanitized.length === 3
      ? sanitized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : sanitized;

  if (normalized.length !== 6) {
    return `rgba(15, 118, 110, ${alpha})`;
  }

  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function categoryMatchesQuery(category: BusinessCategory, query: string) {
  if (!query) return true;

  const haystack = [
    category.name,
    category.description,
    category.groupLabel,
    category.targetTool,
    category.welcomeMessage,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function entryMatchesQuery(entry: ToolHubEntry, query: string) {
  if (!query) return true;

  const haystack = [
    entry.label,
    entry.description,
    ...entry.keywords,
    ...(entry.subLinks?.map((link) => link.label) || []),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function canAccessEntry(
  entry: ToolHubEntry,
  isMember: boolean,
  permissions: MemberPermissions
) {
  if (!isMember) return true;
  if (entry.memberHidden) return false;
  return canMemberAccessPath(entry.href, permissions);
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

function HubEntryCard({
  entry,
  onOpen,
  brandSurface,
}: {
  entry: ToolHubEntry;
  onOpen: (href: string) => void;
  brandSurface: string;
}) {
  return (
    <Card className="border-border/70 bg-card/95 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md">
      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => onOpen(entry.href)}>
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/40"
          style={{ backgroundColor: brandSurface }}
        >
          <entry.icon className="h-5 w-5 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-foreground">{entry.label}</span>
          <span className="mt-1 block text-sm leading-6 text-muted-foreground">{entry.description}</span>
          <span className="mt-3 inline-flex items-center text-sm font-medium text-primary">
            Abrir
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </span>
        </span>
      </button>
    </Card>
  );
}

function HubEntryRow({
  entry,
  onOpen,
  brandSurface,
}: {
  entry: ToolHubEntry;
  onOpen: (href: string) => void;
  brandSurface: string;
}) {
  return (
    <div className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/80 p-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onOpen(entry.href)}
          className="flex w-full items-start gap-3 text-left"
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70"
            style={{ backgroundColor: brandSurface }}
          >
            <entry.icon className="h-5 w-5 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-3">
              <span className="truncate font-semibold text-foreground">{entry.label}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">{entry.description}</span>
          </span>
        </button>
      </div>

      {entry.subLinks && entry.subLinks.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-14">
          {entry.subLinks.map((link) => (
            <Button key={link.href} type="button" variant="outline" size="sm" onClick={() => onOpen(link.href)}>
              {link.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function SegmentPreviewCard({
  category,
  isSelected,
  onOpen,
}: {
  category: BusinessCategory;
  isSelected: boolean;
  onOpen: (slug: string) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-start gap-3 rounded-[1.5rem] border bg-card/90 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        isSelected ? "border-primary/40 bg-primary/5" : "border-border/70"
      )}
      onClick={() => onOpen(category.slug)}
    >
      <span className="text-3xl" aria-hidden="true">
        {category.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold text-foreground">{category.name}</span>
          {isSelected && <Badge className="border-0 bg-primary/10 text-primary">Ativo</Badge>}
        </span>
        <span className="mt-1 block text-sm leading-6 text-muted-foreground">
          {category.description || `Acesso guiado para ${category.name}.`}
        </span>
      </span>
    </button>
  );
}

function SegmentSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="border-border/70 bg-card/90 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Skeleton className="h-11 w-11 rounded-2xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function BusinessTypeModal({
  open,
  groups,
  saving,
  onSelect,
  onClose,
}: {
  open: boolean;
  groups: CategoryGroup[];
  saving: boolean;
  onSelect: (slug: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[82vh] max-w-2xl overflow-y-auto border-border/70 bg-background">
        <DialogHeader>
          <DialogTitle>Escolha o segmento do seu negocio</DialogTitle>
          <DialogDescription>
            Use isso apenas se quiser uma vitrine final filtrada por nicho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.group} className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {group.groupLabel}
                </p>
                <p className="text-sm text-muted-foreground">{group.categories.length} opcoes disponiveis</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {group.categories.map((category) => (
                  <button
                    key={category.slug}
                    type="button"
                    disabled={saving}
                    className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-left transition hover:border-primary/30 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => onSelect(category.slug)}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {category.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{category.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {category.description || `Personalizacao para ${category.name}`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ToolsMenuPage() {
  const { isAuthenticated, user } = useAuth();
  const isMember = Boolean((user as any)?.isMember);
  const permissions = resolveMemberPermissions((user as any)?.memberData?.permissions);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { branding } = useBranding();
  const [searchValue, setSearchValue] = useState("");
  const [showTypeModal, setShowTypeModal] = useState(false);
  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase());
  const { data: groupsData, isLoading } = useQuery<{ groups: CategoryGroup[] }>({
    queryKey: ["/api/business-categories/groups"],
    queryFn: async () => {
      const response = await fetch("/api/business-categories/groups");
      if (!response.ok) {
        throw new Error("Erro ao carregar categorias");
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: btData } = useQuery<{ businessType: string | null }>({
    queryKey: ["/api/user/business-type"],
    queryFn: async () => {
      const headers = await getAuthorizedHeaders();
      const response = await fetch("/api/user/business-type", {
        credentials: "include",
        headers,
      });
      if (!response.ok) {
        return { businessType: null };
      }
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const userBusinessType = btData?.businessType || null;

  const saveBusinessTypeMutation = useMutation({
    mutationFn: async (slug: string) => {
      const headers = await getAuthorizedHeaders({ "Content-Type": "application/json" });
      const response = await fetch("/api/user/business-type", {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({ businessType: slug }),
      });

      if (!response.ok) {
        throw new Error("Falha ao salvar tipo de negocio");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/business-type"] });
      setShowTypeModal(false);
      toast({
        title: "Segmento atualizado",
        description: "A secao final foi ajustada para o seu negocio.",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao salvar",
        description: "Nao foi possivel atualizar o segmento agora.",
        variant: "destructive",
      });
    },
  });

  const rawGroups = groupsData?.groups || [];
  const macroGroupsMap = new Map<MacroGroupKey, CategoryGroup>();

  for (const rawGroup of rawGroups) {
    const macroKey = rawToMacroGroup[rawGroup.group] || "outros";

    if (!macroGroupsMap.has(macroKey)) {
      macroGroupsMap.set(macroKey, {
        group: macroKey,
        groupLabel: macroGroupLabels[macroKey],
        totalUsers: 0,
        categories: [],
      });
    }

    const targetGroup = macroGroupsMap.get(macroKey);
    if (!targetGroup) continue;

    targetGroup.totalUsers += rawGroup.totalUsers || 0;
    targetGroup.categories.push(...rawGroup.categories);
  }

  const groups = macroGroupOrder
    .map((key) => macroGroupsMap.get(key))
    .filter((group): group is CategoryGroup => Boolean(group && group.categories.length));
  const canAccessDelivery2 = !isMember;
  const shouldHideLegacyDelivery = !isMember;
  const shouldRenderLegacyDelivery = false;

  const visibleSections = toolHubSections
    .map((section) => ({
      ...section,
      entries: section.entries.filter(
        (entry) =>
          (entry.id !== "delivery2" || canAccessDelivery2) &&
          (entry.id !== "delivery" || shouldRenderLegacyDelivery) &&
          canAccessEntry(entry, isMember, permissions) &&
          entryMatchesQuery(entry, deferredSearch)
      ),
    }))
    .filter((section) => section.entries.length > 0);

  const visibleEntries = visibleSections.flatMap((section) => section.entries);
  const featuredEntries = visibleEntries.filter((entry) => entry.featured).slice(0, 6);
  const pinnedEntries = pinnedToolIds
    .map((id) => visibleEntries.find((entry) => entry.id === id))
    .filter((entry): entry is ToolHubEntry => Boolean(entry));

  const allCategories = groups.flatMap((group) => group.categories);
  const categoryPreview = [
    ...allCategories.filter((category) => category.slug === userBusinessType),
    ...allCategories.filter((category) => category.slug !== userBusinessType),
  ]
    .filter((category, index, array) => array.findIndex((item) => item.slug === category.slug) === index)
    .filter((category) => categoryMatchesQuery(category, deferredSearch))
    .slice(0, 6);

  const brandColor = branding.primaryColor || "#0f766e";
  const accentColor = branding.accentColor || branding.primaryColor || "#14b8a6";
  const brandSurface = hexToRgba(brandColor, 0.1);
  const brandEdge = hexToRgba(brandColor, 0.18);
  const accentGlow = hexToRgba(accentColor, 0.22);

  return (
    <div
      className="flex-1 overflow-auto bg-background"
      style={{
        backgroundImage: `radial-gradient(circle at top right, ${accentGlow}, transparent 26%), radial-gradient(circle at top left, ${brandSurface}, transparent 28%)`,
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-card/95 shadow-sm">
          <div
            className="relative p-4 sm:p-5"
            style={{
              background: `linear-gradient(145deg, ${hexToRgba(brandColor, 0.16)}, ${hexToRgba(
                accentColor,
                0.08
              )})`,
            }}
          >
            <div
              className="pointer-events-none absolute right-0 top-0 hidden h-40 w-40 rounded-full blur-3xl sm:block"
              style={{ backgroundColor: accentGlow }}
            />

            <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
              <Badge className="border-0 bg-background/85 text-foreground shadow-sm">
                <Wrench className="mr-2 h-3.5 w-3.5 text-primary" />
                Ferramentas
              </Badge>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Tudo do sistema em um so lugar
                </h1>
                <p className="text-sm leading-6 text-muted-foreground sm:text-base">
                  Abra qualquer area sem cacar submenu. Os atalhos principais ficam no topo, a lista
                  completa fica logo abaixo e a vitrine por segmento fica apenas no final.
                </p>
              </div>

              <div className="w-full max-w-xl">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Buscar ferramenta ou atalho"
                    className="h-12 border-border/70 bg-background/90 pl-10 shadow-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <Badge variant="secondary" className="border border-border/70 bg-card">
                  {visibleEntries.length} atalhos
                </Badge>
                <Badge variant="secondary" className="border border-border/70 bg-card">
                  {featuredEntries.length} principais
                </Badge>
                <Badge variant="secondary" className="border border-border/70 bg-card">
                  {allCategories.length} segmentos
                </Badge>
              </div>
            </div>
          </div>
        </section>

        {featuredEntries.length > 0 && (
          <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Acessos rapidos
                </p>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  As ferramentas principais tambem ficam aqui
                </h2>
              </div>
              <Badge variant="secondary" className="w-fit border border-border/70 bg-card">
                {featuredEntries.length} atalhos
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {featuredEntries.map((entry) => (
                <HubEntryCard
                  key={entry.id}
                  entry={entry}
                  onOpen={(href) => setLocation(href)}
                  brandSurface={brandSurface}
                />
              ))}
            </div>
          </section>
        )}

        {pinnedEntries.length > 0 && (
          <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Modulos exclusivos
                </p>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Agenda operacional, cursos e estamparia ficam visíveis logo no topo
                </h2>
              </div>
              <Badge variant="secondary" className="w-fit border border-border/70 bg-card">
                {pinnedEntries.length} modulos
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {pinnedEntries.map((entry) => (
                <HubEntryCard
                  key={entry.id}
                  entry={entry}
                  onOpen={(href) => setLocation(href)}
                  brandSurface={brandSurface}
                />
              ))}
            </div>
          </section>
        )}

        {visibleSections.length > 0 ? (
          <section className="grid gap-4 xl:grid-cols-2">
            {visibleSections.map((section) => (
              <Card key={section.id} className="border-border/70 bg-card/95 p-5 shadow-sm">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Lista completa
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h2 className="text-xl font-semibold tracking-tight text-foreground">{section.title}</h2>
                        <p className="text-sm leading-6 text-muted-foreground">{section.description}</p>
                      </div>
                      <Badge variant="secondary" className="w-fit border border-border/70 bg-background">
                        {section.entries.length} itens
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {section.entries.map((entry) => (
                      <HubEntryRow
                        key={entry.id}
                        entry={entry}
                        onOpen={(href) => setLocation(href)}
                        brandSurface={brandSurface}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </section>
        ) : (
          <Card className="border-dashed border-border/80 bg-card/90 px-6 py-12 text-center shadow-sm">
            <div className="mx-auto max-w-md space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Nada encontrado
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Ajuste a busca para encontrar o atalho certo
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Nao apareceu nenhum item do submenu ou dos acessos rapidos com esse filtro.
              </p>
              <div className="flex justify-center gap-2">
                <Button type="button" variant="outline" onClick={() => setSearchValue("")}>
                  Limpar busca
                </Button>
              </div>
            </div>
          </Card>
        )}

        <section className="rounded-[2rem] border border-border/70 bg-card/95 p-5 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Ferramentas por segmento
                </p>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Secao opcional para quem quer ver a versao guiada por nicho
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  O caminho principal continua sendo a central acima. Se quiser, aqui no final voce
                  escolhe um segmento e abre a experiencia dedicada ao seu negocio.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => setShowTypeModal(true)}>
                  {userBusinessType ? "Trocar segmento" : "Escolher segmento"}
                </Button>
                {userBusinessType && (
                  <Button type="button" onClick={() => setLocation(`/ferramentas/${userBusinessType}`)}>
                    Abrir segmento ativo
                  </Button>
                )}
              </div>
            </div>

            {userBusinessType && (
              <div
                className="rounded-[1.5rem] border px-4 py-3 text-sm text-foreground"
                style={{
                  borderColor: brandEdge,
                  backgroundColor: hexToRgba(brandColor, 0.06),
                }}
              >
                Segmento ativo: <span className="font-semibold">{userBusinessType}</span>
              </div>
            )}

            {isLoading ? (
              <SegmentSkeleton />
            ) : categoryPreview.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {categoryPreview.map((category) => (
                  <SegmentPreviewCard
                    key={category.slug}
                    category={category}
                    isSelected={category.slug === userBusinessType}
                    onOpen={(slug) => setLocation(`/ferramentas/${slug}`)}
                  />
                ))}
              </div>
            ) : (
              <Card className="border-dashed border-border/80 bg-background/80 px-6 py-10 text-center shadow-sm">
                <div className="mx-auto max-w-md space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Sem segmentos nesse filtro
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Limpe a busca para voltar a ver os segmentos ou escolha manualmente no botao acima.
                  </p>
                </div>
              </Card>
            )}
          </div>
        </section>
      </div>

      <BusinessTypeModal
        open={showTypeModal}
        groups={groups}
        saving={saveBusinessTypeMutation.isPending}
        onSelect={(slug) => saveBusinessTypeMutation.mutate(slug)}
        onClose={() => setShowTypeModal(false)}
      />
    </div>
  );
}
