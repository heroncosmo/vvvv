import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

export function getSupabaseServiceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
}

function isGatewaySmokeMode(): boolean {
  return (
    process.env.SERVICE_MODE === "wa-gateway" &&
    (
      process.env.DISABLE_WHATSAPP_PROCESSING === "true" ||
      process.env.SKIP_WHATSAPP_RESTORE === "true"
    )
  );
}

export function createSupabaseServiceClient(): SupabaseClient {
  const supabaseUrl = getSupabaseUrl();
  const supabaseServiceKey = getSupabaseServiceKey();
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

  if (supabaseUrl && !supabaseServiceKey && supabaseAnonKey && isGatewaySmokeMode()) {
    console.warn(
      "[SUPABASE] Service role key missing; using anon key in safe gateway smoke mode.",
    );
    return createClient(supabaseUrl, supabaseAnonKey);
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY are required on the server.",
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}
