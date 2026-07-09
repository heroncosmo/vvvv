import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://bnfpcuzjvycudccycqqt.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM";

if (!supabaseAnonKey) {
  console.error("[SUPABASE] VITE_SUPABASE_ANON_KEY nao configurado. Autenticacao nao funcionara.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const TOKEN_EXPIRY_GRACE_MS = 5_000;
const REFRESH_COOLDOWN_MS = 8_000;
const REFRESH_RATE_LIMIT_COOLDOWN_MS = 60_000;

let refreshPromise: Promise<boolean> | null = null;
let lastRefreshAttemptAt = 0;
let lastRefreshSuccessAt = 0;
let lastRefreshRateLimitAt = 0;

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return null;
    }

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getTokenExpiresAtMs(token: string): number | null {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
}

function isTokenUsable(token: string): boolean {
  const expiresAtMs = getTokenExpiresAtMs(token);
  return !expiresAtMs || expiresAtMs > Date.now() + TOKEN_EXPIRY_GRACE_MS;
}

function isRateLimitError(error: any): boolean {
  const status = Number(error?.status || error?.__isAuthError?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  return status === 429 || message.includes("rate limit") || message.includes("too many requests");
}

export function getAuthTokenFromStorage(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;

      const looksLikeSupabaseAuthKey =
        (key.includes("supabase") || key.startsWith("sb-")) &&
        (key.includes("auth") || key.includes("auth-token"));

      if (!looksLikeSupabaseAuthKey) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const candidate =
        parsed?.access_token ||
        parsed?.session?.access_token ||
        parsed?.currentSession?.access_token;

      if (typeof candidate === "string" && candidate && isTokenUsable(candidate)) {
        return candidate;
      }
    }
  } catch (error) {
    console.warn("[SUPABASE] Falha ao ler token do localStorage:", error);
  }

  return null;
}

export async function getAuthToken(): Promise<string | null> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.error("[SUPABASE] Erro ao obter sessao:", error.message);
    }

    const sessionToken = session?.access_token;
    if (sessionToken && isTokenUsable(sessionToken)) {
      return sessionToken;
    }

    const storedToken = getAuthTokenFromStorage();
    if (storedToken) {
      return storedToken;
    }

    return sessionToken || null;
  } catch (error) {
    console.error("[SUPABASE] Excecao ao obter token:", error);
    return null;
  }
}

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

export async function refreshSession(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const now = Date.now();
  if (now - lastRefreshRateLimitAt < REFRESH_RATE_LIMIT_COOLDOWN_MS) {
    console.warn("[SUPABASE] Refresh em espera apos rate limit recente.");
    return false;
  }

  if (now - lastRefreshAttemptAt < REFRESH_COOLDOWN_MS) {
    return now - lastRefreshSuccessAt < REFRESH_COOLDOWN_MS;
  }

  lastRefreshAttemptAt = now;
  refreshPromise = (async () => {
    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession?.refresh_token) {
        return false;
      }

      console.log("[SUPABASE] Tentando refresh da sessao...");
      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        if (isRateLimitError(error)) {
          lastRefreshRateLimitAt = Date.now();
          console.warn("[SUPABASE] Rate limit no refresh da sessao. Mantendo sessao local.");
        } else {
          console.error("[SUPABASE] Erro ao fazer refresh:", error.message);
        }
        return false;
      }

      if (data.session) {
        lastRefreshSuccessAt = Date.now();
        console.log("[SUPABASE] Sessao renovada com sucesso");
        return true;
      }

      console.log("[SUPABASE] Refresh sem erro mas sem sessao");
      return false;
    } catch (error) {
      console.error("[SUPABASE] Excecao ao fazer refresh:", error);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
