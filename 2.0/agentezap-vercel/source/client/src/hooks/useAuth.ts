import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { getAuthToken, refreshSession, supabase } from "@/lib/supabase";

// Singleton flag: only ONE onAuthStateChange listener across all useAuth() instances
let _authListenerActive = false;
let _lastResolvedUser: User | null = null;
let _lastSessionUserId: string | null = null;
let _hasRecentSessionSignal = false;
const AUTH_USER_SCOPED_CACHE_RESET_MARKER = "AUTH_USER_SCOPED_CACHE_RESET_V518";

if (typeof window !== "undefined") {
  (window as any).__agentezapAuthCacheResetMarker = AUTH_USER_SCOPED_CACHE_RESET_MARKER;
}

class TransientAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientAuthError";
  }
}

function isTransientAuthError(error: unknown): boolean {
  return error instanceof TransientAuthError || (error instanceof Error && error.name === "TransientAuthError");
}

function rememberUser(user: User | null): User | null {
  if (user) {
    _lastResolvedUser = user;
  }
  return user;
}

function isUserScopedQueryKey(queryKey: readonly unknown[]): boolean {
  const firstKey = queryKey[0];
  return typeof firstKey === "string" && firstKey.startsWith("/api/") && firstKey !== "/api/auth/user";
}

function clearUserScopedQueryCache(queryClient: QueryClient) {
  queryClient.removeQueries({
    predicate: (query) => isUserScopedQueryKey(query.queryKey),
  });
}

// Função para verificar se é login de membro
function isMemberSession(): boolean {
  return !!localStorage.getItem("memberToken");
}

// Função para buscar dados do membro autenticado
async function fetchMemberUser(): Promise<User | null> {
  try {
    const memberToken = localStorage.getItem("memberToken");
    if (!memberToken) {
      _hasRecentSessionSignal = false;
      return null;
    }
    _hasRecentSessionSignal = true;

    const response = await fetch("/api/team-members/session", {
      headers: {
        "Authorization": `Bearer ${memberToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem("memberToken");
        localStorage.removeItem("memberData");
        _lastResolvedUser = null;
        _hasRecentSessionSignal = false;
        return null;
      }
      throw new TransientAuthError(`Member session temporarily unavailable: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.authenticated) {
      localStorage.removeItem("memberToken");
      localStorage.removeItem("memberData");
      _lastResolvedUser = null;
      _hasRecentSessionSignal = false;
      return null;
    }

    // Retornar dados do owner como se fosse o user (membro acessa com permissões do owner)
    // Mas marcar que é um membro para controle de permissões
    const member = data.member || {};
    localStorage.setItem("memberData", JSON.stringify(member));
    return rememberUser({
      ...data.owner,
      signature: member.signature || "",
      signatureEnabled: member.signatureEnabled === true,
      isMember: true,
      memberData: member,
    } as any);
  } catch (error) {
    if (isTransientAuthError(error)) {
      throw error;
    }
    console.error("Falha transiente ao validar sessao do membro:", error);
    throw new TransientAuthError("Falha transiente ao validar sessao do membro");
  }
}

async function fetchUser(): Promise<User | null> {
  try {
    // Verificar se é login de membro primeiro
    if (isMemberSession()) {
      return await fetchMemberUser();
    }

    let token = await getAuthToken();
    _hasRecentSessionSignal = Boolean(token);

    // Se não tem token, tenta refresh antes de desistir
    if (!token) {
      console.log("[AUTH] Token não encontrado, tentando refresh...");
      const refreshed = await refreshSession();
      if (refreshed) {
        token = await getAuthToken();
        console.log("[AUTH] Refresh bem sucedido, token:", token ? "obtido" : "ainda null");
      }
      if (!token) {
        _hasRecentSessionSignal = false;
        return null;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    try {
      // 🚀 OTIMIZADO: Usar fetch direto com token já obtido (evita chamar getAuthToken() de novo dentro de fetchWithAuth)
      const response = await fetch("/api/auth/user", {
        signal: controller.signal,
        credentials: "include",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          // Token inválido - tenta refresh UMA VEZ antes de desistir
          console.log("[AUTH] 401 no /api/auth/user, tentando refresh...");
          const refreshed = await refreshSession();
          if (refreshed) {
            const newToken = await getAuthToken();
            if (newToken) {
              // Retry com token novo (fetch direto, sem timeout extra)
              const retryResponse = await fetch("/api/auth/user", {
                credentials: "include",
                headers: {
                  'Authorization': `Bearer ${newToken}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                },
              });
              if (retryResponse.ok) {
                console.log("[AUTH] ✅ Retry após refresh bem sucedido");
                return rememberUser(await retryResponse.json());
              }
            }
          }
          // Refresh falhou ou retry falhou - sessão realmente inválida
          console.warn("[AUTH] Sessão realmente inválida após retry");
          _lastResolvedUser = null;
          _hasRecentSessionSignal = false;
          return null;
        }
        throw new TransientAuthError(`Auth user temporarily unavailable: ${response.status}`);
      }

      return rememberUser(await response.json());
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.warn("[AUTH] Timeout ao buscar usuário; mantendo sessão atual");
        if (_lastResolvedUser) return _lastResolvedUser;
        throw new TransientAuthError("Timeout ao buscar usuario autenticado");
      }
      throw fetchError;
    }
  } catch (error) {
    if (isTransientAuthError(error)) {
      if (_lastResolvedUser) return _lastResolvedUser;
      throw error;
    }
    console.error("Erro ao buscar usuário:", error);
    if (_lastResolvedUser && _hasRecentSessionSignal) {
      return _lastResolvedUser;
    }
    throw new TransientAuthError("Falha transiente ao buscar usuario autenticado");
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading, isFetching, error } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: (failureCount, error) => isTransientAuthError(error) && failureCount < 3,
    retryDelay: (attempt) => Math.min(1000 * attempt, 3000),

    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 5 * 60 * 1000, // Substitui cacheTime
  });

  // 🔄 Listener para mudanças de autenticação do Supabase
  // Detecta: login, logout, token refresh, sessão expirada
  // DEBOUNCE: Evita múltiplas invalidações simultâneas (SIGNED_IN + INITIAL_SESSION)
  useEffect(() => {
    // Pular listener para membros (usam token próprio)
    if (isMemberSession()) return;
    // Singleton: only the FIRST useAuth() instance sets up the listener
    if (_authListenerActive) return;
    _authListenerActive = true;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[AUTH] onAuthStateChange:", event, session ? "com sessão" : "sem sessão");
        
        if (event === 'SIGNED_OUT') {
          // Usuário fez logout - limpar cache imediatamente
          if (debounceTimer) clearTimeout(debounceTimer);
          _lastResolvedUser = null;
          _lastSessionUserId = null;
          _hasRecentSessionSignal = false;
          clearUserScopedQueryCache(queryClient);
          queryClient.setQueryData(["/api/auth/user"], null);
          queryClient.removeQueries({ queryKey: ["/api/whatsapp/connection"] });
          queryClient.removeQueries({ queryKey: ["/api/whatsapp/connections"] });
        } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          // Debounce: agrupar múltiplos eventos em um único refetch
          if (session) {
            const sessionUserId = session.user?.id || null;
            const userChanged = !!sessionUserId && _lastSessionUserId !== sessionUserId;
            if (userChanged) {
              _lastResolvedUser = null;
              clearUserScopedQueryCache(queryClient);
            }
            _lastSessionUserId = sessionUserId;
            _hasRecentSessionSignal = true;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
              if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
                queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
              }
            }, 500); // 500ms debounce to batch consecutive events
          }
        }
      }
    );

    return () => {
      _authListenerActive = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const effectiveUser = user || _lastResolvedUser || undefined;
  const holdingForTransientAuth = !effectiveUser && _hasRecentSessionSignal && (isFetching || isTransientAuthError(error));

  return {
    user: effectiveUser,
    isLoading: isLoading || holdingForTransientAuth,
    isAuthenticated: !!effectiveUser,
  };
}
