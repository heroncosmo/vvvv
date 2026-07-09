import { Switch, Route, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LandingMinimal from "@/pages/landing-minimal";
import Login from "@/pages/login";
import ResetPasswordPage from "@/pages/reset-password";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import AdminPanel from "@/pages/admin";
import AdminLogin from "@/pages/admin-login";
import AgentConfig from "@/pages/agent-config";
import MediaLibrary from "@/pages/media-library";
import TestAgent from "@/pages/test-agent";
import AdminTicketDetailPage from "@/pages/admin/AdminTicketDetailPage";
import AdminTicketsPage from "@/pages/admin/AdminTicketsPage";
import AdminSectorsPage from "@/pages/admin/AdminSectorsPage";
import AdminConnectionsPage from "@/pages/admin-connections";
import AdminMediaFlowsPage from "@/pages/admin-media-flows";
import AdminChatSimulator from "@/pages/admin-chat-simulator";
import AdminSimulator from "@/pages/AdminSimulator";
import AdminStatusPanel from "@/pages/admin-status-panel";
import Support from "@/pages/support";
import LoadingScreen from "@/components/LoadingScreen";
import Subscribe from "@/pages/subscribe";
import ResellerDashboard from "@/pages/reseller";
import TermsOfServicePage from "@/pages/terms-of-service";
import PlanLinkPage from "@/pages/plan-link";
import MemberLogin from "@/pages/member-login";
import PublicHelpCenter from "@/pages/public-help-center";
import PublicPartnerProgram from "@/pages/public-partner-program";
import WhatsappCoexistenceSetupPage from "@/pages/whatsapp-coexistence-setup";
import { AccessBlocker, SubscriptionExpiringBanner } from "@/components/access-blocker";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { PwaPushAssistantBanner } from "@/components/pwa-push-assistant-banner";
import { PwaUpdateBanner } from "@/components/pwa-update-banner";
// Plans, Subscribe and Settings are rendered inside Dashboard layout
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { isNativeApp } from "@/lib/native-runtime";
import { captureAffiliateReferralFromSearch } from "@/lib/referral-tracking";

function ReferralTracker() {
  const [location] = useLocation();

  useEffect(() => {
    captureAffiliateReferralFromSearch(window.location.search);
  }, [location]);

  return null;
}

function RedirectToContactLists() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/listas-contatos", { replace: true });
  }, [setLocation]);

  return <LoadingScreen />;
}

/**
 * V23h: Auto-login via URL params
 * Supports two formats:
 * 1. ?al=base64(email:password) — legacy V17 format
 * 2. ?token=UUID — V23+ token-based auto-login via /api/autologin/:token
 */
function useAutoLogin() {
  const [autoLoginDone, setAutoLoginDone] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const doAutoLogin = async () => {
      try {
        const params = new URLSearchParams(window.location.search);

        // V23h: Token-based auto-login (priority)
        const tokenParam = params.get("token");
        if (tokenParam) {
          console.log("[AUTO-LOGIN] Token detectado, chamando /api/autologin...");
          try {
            const resp = await fetch(`/api/autologin/${encodeURIComponent(tokenParam)}`, {
              credentials: "include",
            });
            if (resp.ok) {
              const { access_token, refresh_token } = await resp.json();
              if (access_token && refresh_token) {
                const { error } = await supabase.auth.setSession({ access_token, refresh_token });
                if (error) {
                  console.error("[AUTO-LOGIN] Erro ao setar sessão:", error.message);
                } else {
                  console.log("[AUTO-LOGIN] Login via token realizado com sucesso!");
                  await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
                }
              }
            } else {
              console.error("[AUTO-LOGIN] Token inválido ou expirado:", resp.status);
            }
          } catch (tokenErr) {
            console.error("[AUTO-LOGIN] Erro no login via token:", tokenErr);
          }

          // Remove token param from URL
          params.delete("token");
          const remaining = params.toString();
          const cleanPath = window.location.pathname + (remaining ? `?${remaining}` : "") + window.location.hash;
          window.history.replaceState({}, "", cleanPath);
          setAutoLoginDone(true);
          return;
        }

        // Legacy: ?al=base64(email:password)
        const alParam = params.get("al");
        if (!alParam) {
          setAutoLoginDone(true);
          return;
        }

        const decoded = atob(alParam);
        const colonIdx = decoded.indexOf(":");
        if (colonIdx < 1) {
          setAutoLoginDone(true);
          return;
        }

        const email = decoded.substring(0, colonIdx);
        const password = decoded.substring(colonIdx + 1);

        console.log("[AUTO-LOGIN] Tentando login automático para:", email);

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          console.error("[AUTO-LOGIN] Erro:", error.message);
        } else if (data.session) {
          console.log("[AUTO-LOGIN] Login automático realizado com sucesso!");
          await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        }

        params.delete("al");
        const remaining = params.toString();
        const cleanPath = window.location.pathname + (remaining ? `?${remaining}` : "") + window.location.hash;
        window.history.replaceState({}, "", cleanPath);
      } catch (err) {
        console.error("[AUTO-LOGIN] Erro inesperado:", err);
      }
      setAutoLoginDone(true);
    };

    doAutoLogin();
  }, []);

  return autoLoginDone;
}

function RequireAuth({ component: Component }: { component: any }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // V23i: Verificar sessão Supabase antes de redirecionar imediatamente
      const checkAndRedirect = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            // Sessão existe mas react-query não detectou ainda - invalidar
            queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            return;
          }
        } catch {}
        setLocation("/login");
      };
      checkAndRedirect();
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return null;

  return <Component />;
}

function RequireAdmin({ component: Component }: { component: any }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [adminSessionChecked, setAdminSessionChecked] = useState(false);
  const [isAdminSession, setIsAdminSession] = useState(false);

  // Verificação imediata: usuário com role admin já tem acesso
  const isAdminViaUser = isAuthenticated && user?.role === "admin";

  // Sempre verificar sessão admin no servidor (independente de isAuthenticated)
  useEffect(() => {
    const checkAdminSession = async () => {
      try {
        const response = await fetch("/api/admin/session", { credentials: "include" });
        const data = await response.json();
        if (data.authenticated || data.isAdmin === true) {
          setIsAdminSession(true);
        }
      } catch (error) {
        // Session check failed
      }
      setAdminSessionChecked(true);
    };
    checkAdminSession();
  }, []);

  // Redirecionar apenas quando todas as verificações terminaram
  useEffect(() => {
    if (isLoading || !adminSessionChecked) return;
    if (!isAdminViaUser && !isAdminSession) {
      setLocation("/admin-login");
    }
  }, [isLoading, adminSessionChecked, isAdminViaUser, isAdminSession, setLocation]);

  // Mostrar loading enquanto verifica
  if (isLoading || !adminSessionChecked) return <LoadingScreen />;

  // Verificação final de acesso
  if (!isAdminViaUser && !isAdminSession) return null;

  return <Component />;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();
  const autoLoginDone = useAutoLogin();

  // Lista de rotas que não precisam esperar o carregamento da autenticação
  const exactPublicRoutes = [
    "/",
    "/login",
    "/redefinir-senha",
    "/reset-password",
    "/cadastro",
    "/admin-simulator",
    "/model-tester",
    "/testar",
    "/termos-de-uso",
    "/membro-login",
    "/admin-login",
    "/indicacoes",
    "/afiliados",
    "/revenda",
    "/white-label",
    "/revenda-white-label",
  ];
  const nestedPublicRoutes = ["/test", "/p", "/ajuda"];
  const isPublicRoute =
    exactPublicRoutes.includes(location) ||
    nestedPublicRoutes.some(route => location === route || location.startsWith(route + "/"));

  // Se está carregando auto-login ou auth e não é rota pública, mostrar loading
  if ((isLoading || !autoLoginDone) && !isPublicRoute) {
    return <LoadingScreen />;
  }

  return (
    <Switch>
      {/* Rota de teste do agente - pública */}
      <Route path="/test/:token?" component={TestAgent} />
      <Route path="/testar" component={TestAgent} />
      <Route path="/admin-simulator" component={AdminChatSimulator} />
      <Route path="/model-tester" component={AdminSimulator} />
      
      <Route path="/admin-login" component={AdminLogin} />
      <Route path="/admin/tickets" component={() => <RequireAdmin component={AdminTicketsPage} />} />
      <Route path="/admin/tickets/:id" component={() => <RequireAdmin component={AdminTicketDetailPage} />} />
      <Route path="/admin/sectors" component={() => <RequireAdmin component={AdminSectorsPage} />} />
      <Route path="/admin/connections" component={() => <RequireAdmin component={AdminConnectionsPage} />} />
      <Route path="/admin/media-flows" component={() => <RequireAdmin component={AdminMediaFlowsPage} />} />
      <Route path="/admin/status" component={() => <RequireAdmin component={AdminStatusPanel} />} />
      <Route path="/admin" component={() => <RequireAdmin component={AdminPanel} />} />
      <Route path="/login" component={Login} />
      <Route path="/redefinir-senha" component={ResetPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/membro-login" component={MemberLogin} />
      <Route path="/cadastro" component={Register} />
      <Route path="/termos-de-uso" component={TermsOfServicePage} />
      <Route path="/p/:slug" component={PlanLinkPage} />
      <Route path="/whatsapp/coexistence/setup" component={() => <RequireAuth component={WhatsappCoexistenceSetupPage} />} />
      
      {/* Central de Ajuda — versão interna (Dashboard) se autenticado, pública se não */}
      <Route path="/ajuda" component={PublicHelpCenter} />
      <Route path="/ajuda/categoria/:catId" component={PublicHelpCenter} />
      <Route path="/ajuda/:slug" component={PublicHelpCenter} />
      <Route path="/indicacoes" component={() => isLoading ? <LoadingScreen /> : isAuthenticated ? <Dashboard /> : <PublicPartnerProgram kind="affiliate" />} />
      <Route path="/afiliados" component={() => <PublicPartnerProgram kind="affiliate" />} />
      <Route path="/white-label" component={() => <PublicPartnerProgram kind="white-label" />} />
      <Route path="/revenda-white-label" component={() => <PublicPartnerProgram kind="white-label" />} />
      <Route path="/revenda" component={() => isLoading ? <LoadingScreen /> : isAuthenticated ? <ResellerDashboard /> : <PublicPartnerProgram kind="reseller" />} />
      
      {/* Landing page apenas para não autenticados */}
      {!isAuthenticated && <Route path="/" component={LandingMinimal} />}
      
      {/* Rotas protegidas - sempre registradas, Dashboard faz o redirecionamento */}
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/conversas" component={Dashboard} />
      <Route path="/conversas/:conversationId" component={Dashboard} />
      <Route path="/conexao" component={Dashboard} />
      <Route path="/meu-agente-ia" component={Dashboard} />
      <Route path="/curso" component={Dashboard} />
      <Route path="/curso-agentezap" component={Dashboard} />
      <Route path="/treinamento" component={Dashboard} />
      <Route path="/plans" component={Dashboard} />
      <Route path="/envio-em-massa" component={Dashboard} />
      <Route path="/campanhas" component={Dashboard} />
      <Route path="/campanhas/:id" component={Dashboard} />
      <Route path="/kanban" component={Dashboard} />
      <Route path="/contatos" component={RedirectToContactLists} />
      <Route path="/contatos-sincronizados" component={Dashboard} />
      <Route path="/etiquetas" component={Dashboard} />
      <Route path="/funil" component={Dashboard} />
      <Route path="/integracoes" component={Dashboard} />
      <Route path="/agendamentos" component={Dashboard} />
      <Route path="/postagens-status" component={Dashboard} />
      <Route path="/reservas" component={Dashboard} />
      <Route path="/qualificacao" component={Dashboard} />
      <Route path="/cursos" component={Dashboard} />
      <Route path="/agendamento-3" component={Dashboard} />
      <Route path="/agendamento-2" component={Dashboard} />
      <Route path="/estamparia" component={Dashboard} />
      <Route path="/estamparia/:id" component={Dashboard} />
      <Route path="/listas-contatos" component={Dashboard} />
      <Route path="/followup" component={Dashboard} />
      <Route path="/subscribe/:id" component={Subscribe} />
      <Route path="/payment-history" component={Dashboard} />
      <Route path="/historico-pagamentos" component={Dashboard} />
      <Route path="/minha-assinatura" component={Dashboard} />
      <Route path="/settings" component={Dashboard} />
      <Route path="/membros" component={Dashboard} />
      <Route path="/implementacao" component={Dashboard} />
      <Route path="/especialista" component={Dashboard} />
      <Route path="/setores" component={Dashboard} />
      <Route path="/agent-config" component={AgentConfig} />
      <Route path="/notificador" component={Dashboard} />
      <Route path="/administrador" component={Dashboard} />
      <Route path="/biblioteca-midias" component={Dashboard} />
      <Route path="/lista-exclusao" component={Dashboard} />
      <Route path="/campos-personalizados" component={Dashboard} />
      <Route path="/produtos" component={Dashboard} />
      <Route path="/delivery-2" component={Dashboard} />
      <Route path="/delivery-cardapio" component={Dashboard} />
      <Route path="/delivery-pedidos" component={Dashboard} />
      <Route path="/delivery-relatorios" component={Dashboard} />
      <Route path="/salon-menu" component={Dashboard} />
      <Route path="/salon-agendamentos" component={Dashboard} />
      <Route path="/prestador-menu" component={Dashboard} />
      <Route path="/clinica-menu" component={Dashboard} />
      <Route path="/falar-por-audio" component={Dashboard} />
      <Route path="/construtor-fluxo" component={Dashboard} />
      <Route path="/postagens-status" component={Dashboard} />
      <Route path="/ferramentas" component={Dashboard} />
      <Route path="/ferramentas/:slug" component={Dashboard} />
      <Route path="/qrcode-whatsapp" component={Dashboard} />
      <Route path="/meta-formulario" component={Dashboard} />
      <Route path="/support" component={Support} />
      {/* Rotas de Tickets */}
      <Route path="/tickets/new" component={() => <RequireAuth component={Dashboard} />} />
      <Route path="/tickets/:id" component={() => <RequireAuth component={Dashboard} />} />
      <Route path="/tickets" component={() => <RequireAuth component={Dashboard} />} />
      {/* Rotas de Revenda com sub-navegação - URLs claras */}
      <Route path="/revenda/clientes" component={() => <RequireAuth component={ResellerDashboard} />} />
      <Route path="/revenda/clientes/:clientId" component={() => <RequireAuth component={ResellerDashboard} />} />
      <Route path="/revenda/cobrancas" component={() => <RequireAuth component={ResellerDashboard} />} /> {/* Cobranças = pagamentos dos clientes */}
      <Route path="/revenda/faturas" component={() => <RequireAuth component={ResellerDashboard} />} /> {/* Minhas Faturas = pagamentos ao sistema */}
      <Route path="/revenda/configuracoes" component={() => <RequireAuth component={ResellerDashboard} />} />
      {/* Aliases antigos para compatibilidade */}
      <Route path="/revenda/recebimentos" component={() => <RequireAuth component={ResellerDashboard} />} />
      <Route path="/revenda/assinatura" component={() => <RequireAuth component={ResellerDashboard} />} />
      <Route path="/reseller" component={() => <RequireAuth component={ResellerDashboard} />} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { isAuthenticated } = useAuth();
  const renderPwaChrome = !isNativeApp();

  return (
    <TooltipProvider>
      <ReferralTracker />
      <Toaster />
      <SubscriptionExpiringBanner />
      {renderPwaChrome ? <PwaInstallPrompt /> : null}
      {renderPwaChrome && isAuthenticated ? <PwaPushAssistantBanner /> : null}
      {renderPwaChrome && isAuthenticated ? <PwaUpdateBanner /> : null}
      <AccessBlocker>
        <Router />
      </AccessBlocker>
    </TooltipProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;

