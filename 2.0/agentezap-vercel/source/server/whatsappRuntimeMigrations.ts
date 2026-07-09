import { pool, runtimeAutoMigrationsEnabled } from "./db";

export async function ensureWhatsAppRuntimeSchema(): Promise<void> {
  if (!runtimeAutoMigrationsEnabled) {
    console.log("[MIGRATION] WhatsApp runtime schema skipped by runtime auto-migration flag");
    return;
  }

  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gateway_api_enabled BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gateway_api_token_hash TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gateway_api_token_preview VARCHAR(64)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gateway_api_last_used_at TIMESTAMP`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gateway_api_rotated_at TIMESTAMP`);
    await pool.query(`ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true`);
    await pool.query(`ALTER TABLE admin_whatsapp_connection ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true`);
    await pool.query(`ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS public_api_enabled BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS public_api_token_hash TEXT`);
    await pool.query(`ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS public_api_token_preview VARCHAR(64)`);
    await pool.query(`ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS public_api_last_used_at TIMESTAMP`);
    await pool.query(`ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS public_api_rotated_at TIMESTAMP`);
    console.log("[MIGRATION] WhatsApp runtime schema ensured");
  } catch (error) {
    console.error("[MIGRATION] Failed to ensure WhatsApp runtime schema:", error);
  }
}
