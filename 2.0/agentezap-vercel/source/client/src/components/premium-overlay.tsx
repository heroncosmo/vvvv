import { ReactNode, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  Sparkles, 
  Check, 
  Zap, 
  TrendingUp, 
  Shield, 
  Clock,
  ArrowRight,
  Star,
  MessageSquare
} from "lucide-react";

interface UsageData {
  agentMessagesCount: number;
  limit: number;
  remaining: number;
  isLimitReached: boolean;
  hasActiveSubscription: boolean;
  planName: string | null;
}

type PremiumOverlayProps = {
  title: string;
  subtitle?: string;
  description?: string;
  ctaLabel?: string;
  benefits?: string[];
  children: ReactNode;
};

// Benefícios padrão com foco em valor
const defaultBenefits = [
  "Automações ilimitadas de WhatsApp",
  "Pipeline visual com drag & drop",
  "Relatórios de conversão em tempo real",
  "Suporte prioritário 24/7",
];

export default function PremiumBlocked({
  title,
  subtitle,
  description,
  ctaLabel = "Começar Agora — Teste Grátis 7 Dias",
  benefits = defaultBenefits,
  children,
}: PremiumOverlayProps) {
  const [, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [activeUsers, setActiveUsers] = useState(127);

  // Buscar dados de uso para verificar se deve bloquear
  const { data: usage, isLoading } = useQuery<UsageData>({
    queryKey: ["/api/usage"],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Determinar se deve mostrar o bloqueio
  const shouldBlock = usage && !usage.hasActiveSubscription && usage.isLimitReached;

  // Animação de entrada suave
  useEffect(() => {
    if (shouldBlock) {
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [shouldBlock]);

  // Simulação de social proof dinâmico
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveUsers(prev => prev + Math.floor(Math.random() * 3) - 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Se está carregando ou não deve bloquear, mostra conteúdo normal
  if (isLoading || !shouldBlock) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Conteúdo de fundo com blur para criar contexto */}
      <div className="pointer-events-none select-none opacity-40 blur-[2px]">
        {children}
      </div>

      {/* Backdrop com gradiente premium - SÓ NO LADO DIREITO (não cobre menu) */}
      <div 
        className={`fixed top-0 right-0 bottom-0 left-0 md:left-[var(--sidebar-width,240px)] z-40 
          bg-gradient-to-br from-black/60 via-black/50 to-emerald-950/40
          backdrop-blur-sm transition-opacity duration-500
          ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Card de conversão centralizado - SÓ NO LADO DIREITO */}
      <div className="fixed top-0 right-0 bottom-0 left-0 md:left-[var(--sidebar-width,240px)] z-50 
        flex items-center justify-center p-4 pb-[72px] md:pb-0">
        <Card 
          className={`max-w-lg w-full shadow-2xl border-0 overflow-hidden
            bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950
            transform transition-all duration-500 ease-out
            ${isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-8 opacity-0 scale-95'}`}
        >
          {/* Header com ícone animado */}
          <CardHeader className="space-y-3 text-center pb-4 relative">
            {/* Badge de limite atingido */}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2">
              <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 
                px-4 py-1.5 text-xs font-semibold shadow-lg">
                <MessageSquare className="w-3 h-3 mr-1" />
                {usage?.agentMessagesCount}/{usage?.limit} mensagens
              </Badge>
            </div>
            
            {/* Ícone principal */}
            <div className="mx-auto mt-6 w-16 h-16 rounded-2xl 
              bg-gradient-to-br from-emerald-400 to-green-600 
              flex items-center justify-center shadow-lg
              animate-[bounce_2s_ease-in-out_infinite]">
              <Sparkles className="w-8 h-8 text-white" />
            </div>

            <CardTitle className="text-2xl md:text-3xl font-bold bg-gradient-to-r 
              from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 
              bg-clip-text text-transparent">
              {title}
            </CardTitle>
            
            {subtitle && (
              <CardDescription className="text-base text-slate-600 dark:text-slate-400">
                {subtitle}
              </CardDescription>
            )}
          </CardHeader>

          <CardContent className="space-y-5 text-center px-6 pb-6">
            {description && (
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {description}
              </p>
            )}

            {/* Mensagem de limite atingido */}
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Seu período de teste terminou!</strong><br />
                Você usou todas as {usage?.limit} mensagens gratuitas. 
                Assine um plano para continuar usando todas as funcionalidades.
              </p>
            </div>

            {/* Lista de benefícios com animação */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3 text-left">
              {benefits.map((benefit, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-3 group"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex-shrink-0 w-5 h-5 rounded-full 
                    bg-gradient-to-br from-emerald-400 to-green-500 
                    flex items-center justify-center
                    group-hover:scale-110 transition-transform">
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </div>
                  <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                    {benefit}
                  </span>
                </div>
              ))}
            </div>

            {/* Social Proof */}
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <div className="flex -space-x-2">
                {[1,2,3,4].map(i => (
                  <div key={i} className="w-6 h-6 rounded-full bg-gradient-to-br 
                    from-emerald-400 to-green-500 border-2 border-white 
                    flex items-center justify-center">
                    <Star className="w-3 h-3 text-white" />
                  </div>
                ))}
              </div>
              <span className="font-medium">
                <span className="text-emerald-600 font-bold">{activeUsers}+</span> empresas usando agora
              </span>
            </div>

            {/* CTA Principal - Máximo destaque (Fitts's Law: maior e centralizado) */}
            <Button 
              size="lg" 
              onClick={() => setLocation("/plans")}
              className="w-full h-14 text-base font-bold
                bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600
                hover:from-emerald-600 hover:via-green-600 hover:to-emerald-700
                shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50
                transition-all duration-300 hover:scale-[1.02]
                group relative overflow-hidden"
            >
              <span className="relative z-10 flex items-center gap-2">
                {ctaLabel}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 
                -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </Button>

            {/* Trust indicators */}
            <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3" /> Pagamento seguro
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> Cancele quando quiser
              </span>
            </div>

            {/* Microcopy de escassez */}
            <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              Preço promocional válido por tempo limitado
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
