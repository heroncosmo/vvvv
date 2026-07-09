import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { 
  Lock, 
  CreditCard, 
  Rocket, 
  Clock, 
  MessageSquare,
  Sparkles,
  CheckCircle,
  ArrowRight,
  Copy,
  Building,
  User,
  Send,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogOverlay } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

// Informações do revendedor para clientes de revenda
interface ResellerInfo {
  isResellerClient: boolean;
  clientId: string;
  status: string;
  nextPaymentDate: string | null;
  clientPrice?: string;
  reseller: {
    companyName: string;
    pixKey?: string;
    pixKeyType?: string;
    pixHolderName?: string;
    pixBankName?: string;
    supportPhone?: string;
    supportEmail?: string;
  };
}

interface AccessStatus {
  accessStatus: 'active' | 'trial' | 'blocked' | 'expired';
  shouldBlock: boolean;
  blockReason: string | null;
  hasSubscription: boolean;
  subscriptionStatus: string | null;
  isSubscriptionExpired: boolean;
  daysRemaining: number;
  subscriptionEndDate: string | null;
  planName: string | null;
  trialMessagesUsed: number;
  trialMessagesRemaining: number;
  trialMessagesLimit: number;
  trialLimitReached: boolean;
  message: string | null;
  resellerInfo?: ResellerInfo | null;
}

// Full screen blocker when access is denied - Now as elegant modal overlay
export function AccessBlocker({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [pixCopied, setPixCopied] = useState(false);
  const routePath = location.split("?")[0] || "/";
  const exactAllowedRoutes = [
    '/login',
    '/cadastro',
    '/plans',
    '/minha-assinatura',
    '/admin-login',
    '/testar',
    '/termos-de-uso',
    '/indicacoes',
    '/afiliados',
    '/revenda',
    '/white-label',
  ];
  const prefixAllowedRoutes = [
    '/subscribe',
    '/admin',
    '/test',
    '/ajuda',
    '/p/',
  ];
  const isRouteAllowedForBlockedUser =
    exactAllowedRoutes.includes(routePath) ||
    prefixAllowedRoutes.some(route => {
      const routeBase = route.endsWith('/') ? route.slice(0, -1) : route;
      return routePath === routeBase || routePath.startsWith(route);
    });
  const isAllowedRoute = !isAuthenticated
    ? isRouteAllowedForBlockedUser || routePath === '/'
    : isRouteAllowedForBlockedUser;
  const isRenewalRoute = routePath === '/plans' || routePath === '/minha-assinatura' || routePath.startsWith('/subscribe');
  
  const { data: accessStatus, isLoading } = useQuery<AccessStatus>({
    queryKey: ["/api/access-status"],
    staleTime: 30_000,
    refetchInterval: 60_000, // Check every 60s (server caches for 30s)
    enabled: isAuthenticated && !isAllowedRoute,
  });
  const blockReason = accessStatus?.blockReason || null;
  const isResellerNotice =
    Boolean(accessStatus?.resellerInfo) &&
    (blockReason === 'reseller_client_expired' || blockReason === 'reseller_blocked');
  const isSubscriptionPaymentNotice =
    blockReason === 'subscription_expired' ||
    blockReason === 'subscription_pending_payment';
  const shouldBlockAccess = Boolean(accessStatus?.shouldBlock);
  const shouldRedirectToPlans = Boolean(
    isAuthenticated &&
    shouldBlockAccess &&
    !isRenewalRoute &&
    !isResellerNotice &&
    !isSubscriptionPaymentNotice
  );

  useEffect(() => {
    if (shouldRedirectToPlans) {
      setLocation('/plans', { replace: true });
    }
  }, [setLocation, shouldRedirectToPlans]);

  if (shouldRedirectToPlans) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-slate-700">
        <div className="flex items-center gap-3 text-sm font-medium">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          Abrindo planos
        </div>
      </div>
    );
  }

  // If loading, unauthenticated or on allowed route, show children
  if (authLoading || isLoading || isAllowedRoute || !isAuthenticated) {
    return <>{children}</>;
  }

  // If access should be blocked, show overlay modal while keeping background visible
  if (shouldBlockAccess && accessStatus) {
    const isExpiredNotice = accessStatus.blockReason === 'subscription_expired' || accessStatus.blockReason === 'reseller_client_expired';
    const isPendingPaymentNotice = accessStatus.blockReason === 'subscription_pending_payment';
    const isResellerBlockedNotice = accessStatus.blockReason === 'reseller_blocked';
    const noticeTitle = isResellerBlockedNotice
      ? 'Sistema temporariamente indisponível'
      : isResellerNotice
        ? 'Pagamento pendente'
        : isPendingPaymentNotice
          ? 'Pagamento pendente'
          : isExpiredNotice
          ? 'Assinatura vencida'
          : 'Teste finalizado';
    const noticeMessage = isResellerBlockedNotice && accessStatus.resellerInfo?.reseller.companyName
      ? `Entre em contato com ${accessStatus.resellerInfo.reseller.companyName} para reativar.`
      : `${accessStatus.message || 'Regularize sua assinatura para reativar envios, automações e IA.'} Você pode navegar e ajustar configurações, mas envios, automações e IA ficam parados até regularizar.`;

    return (
      <>
        <div className="sticky top-0 z-[90] border-b border-amber-200 bg-amber-50/95 px-4 py-3 text-amber-950 shadow-sm backdrop-blur dark:border-amber-900/50 dark:bg-amber-950/95 dark:text-amber-50">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">
                <Lock className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{noticeTitle}</p>
                <p className="text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                  {noticeMessage}
                </p>
              </div>
            </div>
            {!isResellerNotice && (
              <div className="flex flex-shrink-0 gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => setLocation('/plans')}
                >
                  <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                  Regularizar
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
                {accessStatus.hasSubscription && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 bg-white/80 text-amber-900 hover:bg-white dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"
                    onClick={() => setLocation('/minha-assinatura')}
                  >
                    Minha assinatura
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <div>{children}</div>
      </>
    );

    const isExpired = accessStatus.blockReason === 'subscription_expired' || accessStatus.blockReason === 'reseller_client_expired';
    const isResellerClient = (accessStatus.blockReason === 'reseller_client_expired' || accessStatus.blockReason === 'reseller_blocked') && accessStatus.resellerInfo;
    const isResellerBlocked = accessStatus.blockReason === 'reseller_blocked'; // Novo: bloqueio em cascata
    const percentUsed = 100;

    return (
      <>
        {/* Keep children visible (blurred) in background */}
        <div className="blur-sm pointer-events-none">
          {children}
        </div>
        
        {/* Professional Modal Overlay */}
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div 
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Section */}
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 p-6 text-center border-b border-slate-200 dark:border-slate-700">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center mb-4 shadow-sm">
                <Lock className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                {isResellerBlocked
                  ? 'Sistema Temporariamente Indisponível'
                  : isResellerClient 
                    ? 'Pagamento Pendente' 
                    : isExpired 
                      ? 'Assinatura Expirada' 
                      : 'Limite de Teste Atingido'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {isResellerBlocked
                  ? `Entre em contato com ${accessStatus.resellerInfo?.reseller.companyName} para mais informações`
                  : isResellerClient
                    ? `Entre em contato com ${accessStatus.resellerInfo?.reseller.companyName}`
                    : isExpired 
                      ? 'Renove para continuar usando todos os recursos'
                      : 'Assine um plano para continuar vendendo'
                }
              </p>
            </div>
            
            <div className="p-6 space-y-5">
              {/* Seção especial para cliente de revenda */}
              {isResellerClient && accessStatus.resellerInfo && (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 rounded-xl p-5 space-y-4 border border-amber-200 dark:border-amber-800">
                  {/* Cabeçalho com valor */}
                  <div className="text-center pb-3 border-b border-amber-200 dark:border-amber-700">
                    <p className="text-sm text-amber-700 dark:text-amber-300 mb-1">Valor da mensalidade</p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">
                      R$ {Number(accessStatus.resellerInfo.clientPrice || "99.99").toFixed(2).replace('.', ',')}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Pague via PIX para {accessStatus.resellerInfo.reseller.companyName}
                    </p>
                  </div>
                  
                  {/* Dados bancários */}
                  {accessStatus.resellerInfo.reseller.pixKey && (
                    <div className="space-y-3">
                      {/* Nome do Titular */}
                      {accessStatus.resellerInfo.reseller.pixHolderName && (
                        <div className="flex items-center gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg">
                          <User className="w-4 h-4 text-slate-500" />
                          <div className="flex-1">
                            <p className="text-xs text-slate-500">Titular</p>
                            <p className="font-medium text-slate-900 dark:text-white text-sm">
                              {accessStatus.resellerInfo.reseller.pixHolderName}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Banco */}
                      {accessStatus.resellerInfo.reseller.pixBankName && (
                        <div className="flex items-center gap-3 p-2 bg-white dark:bg-slate-800 rounded-lg">
                          <Building className="w-4 h-4 text-slate-500" />
                          <div className="flex-1">
                            <p className="text-xs text-slate-500">Banco</p>
                            <p className="font-medium text-slate-900 dark:text-white text-sm">
                              {accessStatus.resellerInfo.reseller.pixBankName}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Chave PIX com botão copiar */}
                      <div className="p-3 bg-white dark:bg-slate-800 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-500">
                            Chave PIX ({accessStatus.resellerInfo.reseller.pixKeyType?.toUpperCase()})
                          </p>
                          <Button
                            size="sm"
                            variant={pixCopied ? "default" : "outline"}
                            className={pixCopied ? "bg-green-600 text-white" : ""}
                            onClick={() => {
                              navigator.clipboard.writeText(accessStatus.resellerInfo!.reseller.pixKey!);
                              setPixCopied(true);
                              toast({ title: "Chave PIX copiada!", description: "Cole no app do seu banco" });
                              setTimeout(() => setPixCopied(false), 3000);
                            }}
                          >
                            {pixCopied ? (
                              <><CheckCircle className="w-3 h-3 mr-1" /> Copiado!</>
                            ) : (
                              <><Copy className="w-3 h-3 mr-1" /> Copiar</>
                            )}
                          </Button>
                        </div>
                        <code className="block w-full text-sm font-mono bg-slate-100 dark:bg-slate-700 px-3 py-2 rounded border break-all">
                          {accessStatus.resellerInfo.reseller.pixKey}
                        </code>
                      </div>
                    </div>
                  )}
                  
                  {/* Botão Enviar Comprovante via WhatsApp */}
                  {accessStatus.resellerInfo.reseller.supportPhone && (
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-5"
                      onClick={() => {
                        const phone = accessStatus.resellerInfo!.reseller.supportPhone!.replace(/\D/g, '');
                        const valor = Number(accessStatus.resellerInfo!.clientPrice || "99.99").toFixed(2).replace('.', ',');
                        const msg = `Olá! Acabei de fazer o pagamento de R$ ${valor} via PIX. Segue o comprovante:`;
                        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
                      }}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Enviar Comprovante via WhatsApp
                    </Button>
                  )}
                  
                  {accessStatus.resellerInfo.reseller.supportEmail && (
                    <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                      Ou envie por email: {accessStatus.resellerInfo.reseller.supportEmail}
                    </p>
                  )}
                </div>
              )}

              {/* Status Info - Clean Card (para não-revenda) */}
              {!isResellerClient && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
                  {accessStatus.message && (
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {accessStatus.message}
                    </p>
                  )}
                  {isExpired ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        Plano
                      </span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {accessStatus.planName || 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Expirou em
                      </span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {accessStatus.subscriptionEndDate 
                          ? new Date(accessStatus.subscriptionEndDate).toLocaleDateString('pt-BR')
                          : 'N/A'}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Mensagens usadas
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {accessStatus.trialMessagesUsed}/{accessStatus.trialMessagesLimit}
                      </span>
                    </div>
                    <Progress value={percentUsed} className="h-2 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-green-500" />
                    <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
                      Você utilizou todas as mensagens de teste
                    </p>
                  </>
                )}
              </div>
              )}

              {/* Benefits - Professional list (não mostrar para cliente de revenda) */}
              {!isResellerClient && (
              <div className="space-y-2.5">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Desbloqueie todos os recursos
                </h4>
                <ul className="space-y-2">
                  {[
                    'Mensagens ilimitadas do Agente IA',
                    'Envio em massa para campanhas',
                    'Follow-up inteligente automático',
                    'Qualificação de leads por IA',
                    'Suporte prioritário'
                  ].map((benefit, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
              )}

              {/* Action Buttons (não mostrar para cliente de revenda) */}
              {!isResellerClient && (
              <div className="space-y-2.5 pt-2">
                <Button 
                  className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-semibold py-5 text-base shadow-lg hover:shadow-xl transition-all duration-200"
                  onClick={() => setLocation('/plans')}
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  {isExpired ? 'Renovar Assinatura' : 'Ver planos e assinar'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                
                {accessStatus.hasSubscription && isExpired && (
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setLocation('/minha-assinatura')}
                  >
                    <Rocket className="w-4 h-4 mr-2" />
                    Ver Minha Assinatura
                  </Button>
                )}
              </div>
              )}

              {/* Contact support - texto diferente para cliente de revenda */}
              {!isResellerClient && (
              <p className="text-xs text-center text-slate-400 dark:text-slate-500 pt-2">
                Precisa de ajuda?{' '}
                <a 
                  href="https://wa.me/5517981679379" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                >
                  Fale conosco pelo WhatsApp
                </a>
              </p>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // Access granted, show children
  return <>{children}</>;
}

// Warning banner for expiring subscription (5 days or less) - Refined Design
export function SubscriptionExpiringBanner() {
  const [location, setLocation] = useLocation();
  const routePath = location.split("?")[0] || "/";
  const isAdminRoute = routePath === "/admin" || routePath.startsWith("/admin/");
  const isPublicRoute = [
    '/login',
    '/cadastro',
    '/admin-login',
    '/termos-de-uso',
    '/ajuda',
    '/indicacoes',
    '/afiliados',
    '/revenda',
    '/white-label',
  ].some(route => location.startsWith(route) || location === '/') || isAdminRoute;
  
  const { data: accessStatus } = useQuery<AccessStatus>({
    queryKey: ["/api/access-status"],
    staleTime: 30_000,
    refetchInterval: 60_000, // Check every minute
    enabled: !isPublicRoute,
  });

  // Only show if subscription is active but expiring soon (5 days or less)
  if (!accessStatus || 
      accessStatus.accessStatus !== 'active' || 
      accessStatus.daysRemaining > 5 ||
      accessStatus.daysRemaining <= 0) {
    return null;
  }

  return (
    <div className="sticky top-0 z-[80] bg-gradient-to-r from-amber-500 to-orange-500 text-white py-2.5 px-4 shadow-md">
      <div className="container max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/20 px-2.5 py-1 rounded-full text-xs font-medium">
            <Clock className="w-3.5 h-3.5" />
            {accessStatus.daysRemaining} dias
          </div>
          <span className="text-sm">
            Sua assinatura vence em breve · <span className="font-medium">Renove para não perder acesso</span>
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => setLocation('/minha-assinatura')}
          className="bg-white text-amber-600 hover:bg-amber-50 font-medium shadow-sm"
        >
          <CreditCard className="w-3.5 h-3.5 mr-1.5" />
          Renovar
        </Button>
      </div>
    </div>
  );
}

// Trial progress banner (non-blocking, just informative) - Professional Style
export function TrialProgressBanner() {
  const [location, setLocation] = useLocation();
  const routePath = location.split("?")[0] || "/";
  const isAdminRoute = routePath === "/admin" || routePath.startsWith("/admin/");
  const isPublicRoute = [
    '/login',
    '/cadastro',
    '/admin-login',
    '/termos-de-uso',
    '/ajuda',
    '/indicacoes',
    '/afiliados',
    '/revenda',
    '/white-label',
  ].some(route => location.startsWith(route) || location === '/') || isAdminRoute;
  
  const { data: accessStatus } = useQuery<AccessStatus>({
    queryKey: ["/api/access-status"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !isPublicRoute,
  });

  // Only show for trial users who haven't hit the limit yet
  if (!accessStatus || 
      accessStatus.accessStatus !== 'trial' ||
      accessStatus.trialLimitReached) {
    return null;
  }

  const percentUsed = (accessStatus.trialMessagesUsed / accessStatus.trialMessagesLimit) * 100;
  const isWarning = percentUsed >= 60;

  return (
    <div className={`
      border rounded-xl p-4 mb-4 transition-all duration-200
      ${isWarning 
        ? 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-200/60 dark:border-amber-800/30' 
        : 'bg-blue-50/50 dark:bg-blue-950/10 border-blue-200/60 dark:border-blue-800/30'
      }
    `}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isWarning ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
            <MessageSquare className={`w-4 h-4 ${isWarning ? 'text-amber-600' : 'text-blue-600'}`} />
          </div>
          <div>
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {accessStatus.trialMessagesUsed}/{accessStatus.trialMessagesLimit} mensagens
            </span>
            {isWarning && (
              <span className="text-amber-600 dark:text-amber-400 text-xs ml-2">
                · {accessStatus.trialMessagesRemaining} restantes
              </span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant={isWarning ? "default" : "outline"}
          onClick={() => setLocation('/plans')}
          className={isWarning ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
        >
          <Rocket className="w-3.5 h-3.5 mr-1.5" />
          Ver Planos
        </Button>
      </div>
      <Progress 
        value={percentUsed} 
        className={`h-1.5 mt-3 ${isWarning ? '[&>div]:bg-amber-500' : '[&>div]:bg-blue-500'}`} 
      />
    </div>
  );
}

