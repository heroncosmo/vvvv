import React, { useEffect, useState, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Star } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Tool badge label per targetTool ──────────────────────────────────────────
const toolBadge: Record<string, { label: string; color: string }> = {
  delivery:     { label: "Delivery",      color: "bg-orange-100 text-orange-700 border-orange-200" },
  agendamento:  { label: "Agendamentos",  color: "bg-pink-100 text-pink-700 border-pink-200" },
  vendas:       { label: "Vendas",        color: "bg-blue-100 text-blue-700 border-blue-200" },
  generic:      { label: "AgentIA",       color: "bg-purple-100 text-purple-700 border-purple-200" },
};

// ─── Category Card ────────────────────────────────────────────────────────────
function CategoryCard({
  cat,
  isHighlighted,
  onClick,
}: {
  cat: BusinessCategory;
  isHighlighted: boolean;
  onClick: () => void;
}) {
  const badge = toolBadge[cat.targetTool] || toolBadge.generic;
  return (
    <Card
      className={`relative flex flex-col p-4 gap-3 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 border ${
        isHighlighted
          ? "ring-2 ring-offset-1"
          : "border-border/70"
      }`}
      style={isHighlighted ? { borderColor: cat.color } as React.CSSProperties : undefined}
      onClick={onClick}
    >
      {isHighlighted && (
        <span className="absolute top-2 right-2">
          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
        </span>
      )}
      <div className="flex items-center gap-2">
        <span className="text-2xl" aria-hidden="true">{cat.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm leading-tight line-clamp-1">{cat.name}</h3>
          <span
            className={`inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full border font-medium ${badge.color}`}
          >
            Para {badge.label}
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
        {cat.description || `Ferramenta personalizada para ${cat.name}`}
      </p>
      <Button
        size="sm"
        className="w-full text-xs"
        style={{ backgroundColor: cat.color, borderColor: cat.color }}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        Usar Ferramenta
      </Button>
    </Card>
  );
}

// ─── Skeleton Card ─────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <Card className="flex flex-col p-4 gap-3">
      <div className="flex items-center gap-2">
        <Skeleton className="w-8 h-8 rounded-full" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </Card>
  );
}

// ─── Business Type Selection Modal ────────────────────────────────────────────
function BusinessTypeModal({
  open,
  groups,
  onSelect,
  onClose,
}: {
  open: boolean;
  groups: CategoryGroup[];
  onSelect: (slug: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Qual é o seu tipo de negócio?</DialogTitle>
          <DialogDescription>
            Selecione para personalizarmos as ferramentas para você.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {groups.map((g) => (
            <div key={g.group}>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                {g.groupLabel}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {g.categories.map((cat) => (
                  <button
                    key={cat.slug}
                    className="flex items-center gap-2 rounded-lg border border-border p-2 text-left text-sm hover:bg-accent transition-colors"
                    onClick={() => onSelect(cat.slug)}
                  >
                    <span className="text-xl">{cat.icon}</span>
                    <span className="font-medium leading-tight">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ToolsMenuPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showTypeModal, setShowTypeModal] = useState(false);

  // Load grouped categories
  const { data: groupsData, isLoading } = useQuery<{ groups: CategoryGroup[] }>({
    queryKey: ["/api/business-categories/groups"],
    queryFn: async () => {
      const res = await fetch("/api/business-categories/groups");
      if (!res.ok) throw new Error("Erro ao carregar categorias");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Load user's current business type
  const { data: btData } = useQuery<{ businessType: string | null }>({
    queryKey: ["/api/user/business-type"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/user/business-type");
        return res.json();
      } catch {
        return { businessType: null };
      }
    },
  });

  const userBusinessType = btData?.businessType || null;

  // Show modal on first access if no business type
  useEffect(() => {
    if (btData !== undefined && !userBusinessType && groupsData?.groups?.length) {
      setShowTypeModal(true);
    }
  }, [btData, userBusinessType, groupsData]);

  // Mutation to save business type
  const saveBTMutation = useMutation({
    mutationFn: async (slug: string) => {
      const res = await apiRequest("PUT", "/api/user/business-type", { businessType: slug });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/business-type"] });
      setShowTypeModal(false);
      toast({ title: "Tipo de negócio salvo!", description: "Suas ferramentas foram personalizadas." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível salvar o tipo de negócio.", variant: "destructive" });
    },
  });

  const handleCardClick = (slug: string) => {
    setLocation(`/ferramentas/${slug}`);
  };

  const groups = groupsData?.groups || [];

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Ferramentas por Tipo de Negócio</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Escolha a ferramenta ideal para o seu negócio. Cada opção foi personalizada para o seu segmento.
          </p>
          {userBusinessType && (
            <button
              className="mt-2 text-xs text-primary underline"
              onClick={() => setShowTypeModal(true)}
            >
              Alterar meu tipo de negócio
            </button>
          )}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-6">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <Skeleton className="h-5 w-48 mb-3" />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {[0, 1, 2, 3].map((j) => <CardSkeleton key={j} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Category groups */}
        {!isLoading && groups.map((group) => (
          <section key={group.group}>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <span>{group.categories[0]?.icon}</span>
              <span>{group.groupLabel}</span>
              <Badge variant="secondary" className="text-xs font-normal">
                {group.categories.length} tipos
              </Badge>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {group.categories.map((cat) => (
                <CategoryCard
                  key={cat.slug}
                  cat={cat}
                  isHighlighted={cat.slug === userBusinessType}
                  onClick={() => handleCardClick(cat.slug)}
                />
              ))}
            </div>
          </section>
        ))}

        {!isLoading && groups.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Nenhuma categoria disponível no momento.
          </div>
        )}
      </div>

      {/* Business Type Selection Modal */}
      <BusinessTypeModal
        open={showTypeModal}
        groups={groups}
        onSelect={(slug) => saveBTMutation.mutate(slug)}
        onClose={() => setShowTypeModal(false)}
      />
    </div>
  );
}
