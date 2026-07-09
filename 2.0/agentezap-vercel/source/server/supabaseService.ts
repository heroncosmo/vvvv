import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

export function getSupabaseServiceKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ""
  );
}

export function createSupabaseServiceClient(): SupabaseClient {
  const supabaseUrl = getSupabaseUrl();
  const supabaseServiceKey = getSupabaseServiceKey();

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "SUPABASE_URL e uma chave de servico do Supabase (SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY) sao obrigatorias no servidor.",
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}
