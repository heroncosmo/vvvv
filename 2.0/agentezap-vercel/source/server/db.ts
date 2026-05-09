import { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Detectar se está usando Supabase Pooler
// NOTA: NÃO derivamos automaticamente a URL direta porque:
// 1) O Supabase direct (db.<ref>.supabase.co) resolve para IPv6, que o Railway não alcança (ENETUNREACH)
// 2) O Pooler (pooler.supabase.com:6543) funciona bem e resolve IPv4
// Se você quiser forçar conexão direta, defina DATABASE_URL_DIRECT no Railway.
const rawDbUrl = process.env.DATABASE_URL;
const directDbUrl = process.env.DATABASE_URL_DIRECT;

// Força porta 6543 (Transaction mode) se estiver usando porta 5432 (Session mode)
// Session mode tem limite severo de clientes = pool_size do servidor
let dbUrl = directDbUrl || rawDbUrl;
const isPoolerConnection = dbUrl.includes('pooler.supabase.com');
if (isPoolerConnection && dbUrl.includes(':5432')) {
  dbUrl = dbUrl.replace(':5432', ':6543');
  console.log('[DB] ⚠️ Porta alterada de 5432 (Session) para 6543 (Transaction) para evitar MaxClientsInSessionMode');
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value || "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

const isMonolithRuntime = String(process.env.SERVICE_MODE || "").trim().toLowerCase() === "monolith";
const defaultPoolMax = isPoolerConnection ? (isMonolithRuntime ? 15 : 3) : (isMonolithRuntime ? 15 : 7);
const configuredPoolMax = parsePositiveInteger(
  process.env.DB_POOL_MAX ||
    process.env.DATABASE_POOL_MAX ||
    process.env.PG_POOL_MAX,
  defaultPoolMax,
);
const connectionTimeoutMillis = parsePositiveInteger(
  process.env.DB_CONNECTION_TIMEOUT_MS ||
    process.env.DATABASE_CONNECTION_TIMEOUT_MS,
  30000,
);
const statementTimeoutMillis = parsePositiveInteger(
  process.env.DB_STATEMENT_TIMEOUT_MS ||
    process.env.DATABASE_STATEMENT_TIMEOUT_MS,
  30000,
);

console.log(
  `[DB] Modo de conexão: ${isPoolerConnection ? 'Supabase Pooler (PgBouncer)' : 'Direct Connection'} | poolMax=${configuredPoolMax}`,
);

// 🔥 CONFIGURAÇÃO OTIMIZADA PARA PGBOUNCER TRANSACTION MODE
const poolConfig: any = {
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  },
  // Pool CONSERVADOR - PgBouncer Transaction mode libera conexão após cada query
  max: configuredPoolMax,
  min: 0,  // Não manter conexões ociosas em transaction mode
  idleTimeoutMillis: isPoolerConnection ? 10000 : 60000,  // Libera rápido em pooler
  connectionTimeoutMillis,
  statement_timeout: statementTimeoutMillis,
  allowExitOnIdle: true,  // Permite liberar conexões quando ocioso
  
  // Retry com backoff exponencial
  retryStrategy: (times: number) => {
    if (times > 5) {
      console.log(`[DB] Max retries (5) atingido, desistindo`);
      return false;
    }
    const delay = Math.min(times * 2000, 15000);
    console.log(`⏳ [DB] Retry #${times} após ${delay}ms`);
    return delay;
  },
};

export const pool = new Pool(poolConfig);

// Logs de diagnóstico (reduzidos para produção)
pool.on('connect', () => {
  console.log('✅ [DB Pool] Nova conexão ESTABELECIDA');
});

pool.on('error', (err: any) => {
  console.error('❌ [DB Pool] ERRO:', err.message, '| Code:', err.code);
});

pool.on('remove', () => {
  console.log('🔌 [DB Pool] Conexão REMOVIDA');
});

// 🔄 Graceful shutdown - libera conexões no PgBouncer
// V23f: NÃO chama process.exit() - o full-app.ts coordena o shutdown
export const closeDbPool = async () => {
  console.log('🛑 [DB] Encerrando pool de conexões...');
  try {
    await pool.end();
    console.log('✅ [DB] Pool encerrado com sucesso');
  } catch (err: any) {
    console.error('❌ [DB] Erro ao encerrar pool:', err.message);
  }
};

// 🧪 Teste de autenticação inicial único
export const runtimeAutoMigrationsEnabled = (() => {
  const explicit = String(
    process.env.ENABLE_RUNTIME_AUTO_MIGRATIONS ||
      process.env.RUN_RUNTIME_AUTO_MIGRATIONS ||
      "",
  ).trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(explicit)) return true;
  if (["0", "false", "no", "off"].includes(explicit)) return false;

  if (process.env.VERCEL === "1" || process.env.VERCEL === "true") {
    return false;
  }

  if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") {
    return false;
  }

  return true;
})();

function scheduleRuntimeDbTask(task: () => Promise<void>, delayMs: number) {
  if (!runtimeAutoMigrationsEnabled) {
    return;
  }

  setTimeout(() => {
    task().catch((error: any) => {
      console.error("[DB] Runtime DB task failed:", error?.message || error);
    });
  }, delayMs);
}

scheduleRuntimeDbTask(async () => {
  try {
    const start = Date.now();
    const result = await pool.query('SELECT current_user, current_database()');
    console.log(`✅ [DB] Autenticação OK em ${Date.now() - start}ms | User: ${result.rows[0].current_user} | DB: ${result.rows[0].current_database}`);
  } catch (error: any) {
    console.error('❌ [DB] Falha na autenticação:', error.message, '| Code:', error.code);
  }
}, 2000);

// Função helper para executar query com retry automático
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      const isRetryable = 
        error.message?.includes('Connection terminated') ||
        error.message?.includes('timeout') ||
        error.message?.includes('ECONNRESET') ||
        error.message?.includes('DbHandler exited') ||
        error.message?.includes('unexpectedly') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === '57P01' ||
        error.code === 'XX000'; // DbHandler exited
      
      if (isRetryable && attempt < maxRetries) {
        const waitTime = delayMs * attempt;
        console.warn(`⚠️ [DB] Query falhou (tentativa ${attempt}/${maxRetries}), retry em ${waitTime}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

// Teste de conexão removido - já temos o teste de autenticação acima

// ============================================================================
// AUTO-MIGRATION: Criar tabelas que podem não existir ainda
// ============================================================================
scheduleRuntimeDbTask(async () => {
  console.log('[DB] Verificando tabelas necessárias...');
  try {
    const client = await pool.connect();

    // Verificar se tabela contact_lists existe
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'contact_lists'
      );
    `);

    if (!checkTable.rows[0].exists) {
      console.log('[DB] Tabela contact_lists não existe, criando...');

      await client.query(`
        CREATE TABLE IF NOT EXISTS contact_lists (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          contacts JSONB DEFAULT '[]'::jsonb,
          contact_count INTEGER DEFAULT 0 NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_contact_lists_user ON contact_lists(user_id);
        CREATE INDEX IF NOT EXISTS idx_contact_lists_created ON contact_lists(created_at);
      `);

      console.log('✅ [DB] Tabela contact_lists criada com sucesso!');
    } else {
      console.log('✅ [DB] Tabela contact_lists já existe');
    }

    await client.query(`
      ALTER TABLE whatsapp_connections
        ADD COLUMN IF NOT EXISTS provider VARCHAR(50) NOT NULL DEFAULT 'baileys',
        ADD COLUMN IF NOT EXISTS connection_method VARCHAR(50) NOT NULL DEFAULT 'qr',
        ADD COLUMN IF NOT EXISTS provider_status VARCHAR(50) NOT NULL DEFAULT 'inactive',
        ADD COLUMN IF NOT EXISTS provider_config JSONB;

      UPDATE whatsapp_connections
      SET
        provider = COALESCE(NULLIF(provider, ''), 'baileys'),
        connection_method = COALESCE(NULLIF(connection_method, ''), 'qr'),
        provider_status = CASE
          WHEN is_connected = true THEN 'connected'
          ELSE COALESCE(NULLIF(provider_status, ''), 'inactive')
        END
      WHERE
        provider IS NULL
        OR connection_method IS NULL
        OR provider_status IS NULL;
    `);
    console.log('[DB] Colunas de provider do WhatsApp garantidas');

    // Ensure admin_broadcast_messages table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_broadcast_messages (
        id TEXT PRIMARY KEY,
        broadcast_id TEXT NOT NULL,
        admin_id TEXT NOT NULL,
        user_id TEXT,
        recipient_phone TEXT NOT NULL,
        recipient_name TEXT NOT NULL DEFAULT 'Cliente',
        message_original TEXT,
        message_sent TEXT NOT NULL,
        ai_varied BOOLEAN DEFAULT false,
        status TEXT DEFAULT 'sent',
        error_message TEXT,
        sent_at TIMESTAMP DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_id 
      ON admin_broadcast_messages(broadcast_id)
    `);
    console.log('✅ [DB] Tabela admin_broadcast_messages garantida');

    client.release();
  } catch (error: any) {
    console.error('❌ [DB] Erro ao verificar/criar tabelas:', error.message);
  }
}, 5000);

scheduleRuntimeDbTask(async () => {
  console.log('[DB] Garantindo estrutura de referral...');
  try {
    const client = await pool.connect();

    await client.query(`
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS referral_code VARCHAR(120);
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS referral_wallet_applied_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS referral_wallet_applied_at TIMESTAMP;

      ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS campaign_type VARCHAR(50) NOT NULL DEFAULT 'broadcast';
      ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

      CREATE TABLE IF NOT EXISTS referral_profiles (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        referral_code VARCHAR(120) NOT NULL UNIQUE,
        commission_default_amount NUMERIC(10,2) NOT NULL DEFAULT 50.00,
        commission_approved_amount NUMERIC(10,2),
        commission_approved_at TIMESTAMP,
        commission_approved_by VARCHAR(120),
        payout_pix_type VARCHAR(30),
        payout_pix_key VARCHAR(255),
        payout_holder_name VARCHAR(255),
        share_message_template TEXT,
        available_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
        pending_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
        lifetime_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
        total_referrals INTEGER NOT NULL DEFAULT 0,
        converted_referrals INTEGER NOT NULL DEFAULT 0,
        last_share_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_referral_profiles_user ON referral_profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_profiles_code ON referral_profiles(referral_code);

      CREATE TABLE IF NOT EXISTS referral_program_settings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        default_commission_amount NUMERIC(10,2) NOT NULL DEFAULT 50.00,
        referral_hero_title VARCHAR(255),
        referral_hero_body TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS referral_links (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id VARCHAR NOT NULL REFERENCES referral_profiles(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referral_code VARCHAR(120) NOT NULL,
        slug VARCHAR(120) NOT NULL UNIQUE,
        destination_url TEXT NOT NULL,
        is_primary BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_referral_links_profile ON referral_links(profile_id);
      CREATE INDEX IF NOT EXISTS idx_referral_links_user ON referral_links(user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_links_code ON referral_links(referral_code);

      CREATE TABLE IF NOT EXISTS referral_attributions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        referral_code VARCHAR(120) NOT NULL,
        referrer_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referred_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        referred_email VARCHAR(255),
        referred_phone VARCHAR(50),
        source_channel VARCHAR(50) NOT NULL DEFAULT 'link',
        source_label VARCHAR(120),
        source_url TEXT,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        converted_at TIMESTAMP,
        status VARCHAR(50) NOT NULL DEFAULT 'captured',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_referral_attr_code ON referral_attributions(referral_code);
      CREATE INDEX IF NOT EXISTS idx_referral_attr_referrer ON referral_attributions(referrer_user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_attr_referred ON referral_attributions(referred_user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_attr_referred_unique
        ON referral_attributions(referred_user_id)
        WHERE referred_user_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS referral_events (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        attribution_id VARCHAR REFERENCES referral_attributions(id) ON DELETE SET NULL,
        referrer_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referred_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        subscription_id VARCHAR REFERENCES subscriptions(id) ON DELETE SET NULL,
        payment_history_id VARCHAR(120),
        event_type VARCHAR(60) NOT NULL,
        amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON referral_events(referrer_user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_events_referred ON referral_events(referred_user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_events_subscription ON referral_events(subscription_id);
      CREATE INDEX IF NOT EXISTS idx_referral_events_type ON referral_events(event_type);

      CREATE TABLE IF NOT EXISTS referral_wallet_ledger (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id VARCHAR NOT NULL REFERENCES referral_profiles(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        attribution_id VARCHAR REFERENCES referral_attributions(id) ON DELETE SET NULL,
        referral_event_id VARCHAR REFERENCES referral_events(id) ON DELETE SET NULL,
        subscription_id VARCHAR REFERENCES subscriptions(id) ON DELETE SET NULL,
        entry_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'available',
        amount NUMERIC(10,2) NOT NULL,
        description TEXT NOT NULL,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        available_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_referral_wallet_profile ON referral_wallet_ledger(profile_id);
      CREATE INDEX IF NOT EXISTS idx_referral_wallet_user ON referral_wallet_ledger(user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_wallet_status ON referral_wallet_ledger(status);
      CREATE INDEX IF NOT EXISTS idx_referral_wallet_subscription ON referral_wallet_ledger(subscription_id);

      CREATE TABLE IF NOT EXISTS referral_withdrawal_requests (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id VARCHAR NOT NULL REFERENCES referral_profiles(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(10,2) NOT NULL,
        pix_type VARCHAR(30) NOT NULL,
        pix_key VARCHAR(255) NOT NULL,
        holder_name VARCHAR(255) NOT NULL,
        document_number VARCHAR(20),
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        admin_notes TEXT,
        reviewed_by VARCHAR(120),
        reviewed_at TIMESTAMP,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_profile ON referral_withdrawal_requests(profile_id);
      CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_user ON referral_withdrawal_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_status ON referral_withdrawal_requests(status);

      CREATE TABLE IF NOT EXISTS referral_commission_requests (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id VARCHAR NOT NULL REFERENCES referral_profiles(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requested_amount NUMERIC(10,2) NOT NULL,
        current_amount NUMERIC(10,2) NOT NULL,
        justification TEXT NOT NULL,
        attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        admin_notes TEXT,
        reviewed_by VARCHAR(120),
        reviewed_at TIMESTAMP,
        approved_amount NUMERIC(10,2),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_referral_commission_profile ON referral_commission_requests(profile_id);
      CREATE INDEX IF NOT EXISTS idx_referral_commission_user ON referral_commission_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_commission_status ON referral_commission_requests(status);

      CREATE TABLE IF NOT EXISTS referral_share_logs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id VARCHAR NOT NULL REFERENCES referral_profiles(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referral_code VARCHAR(120) NOT NULL,
        channel VARCHAR(50) NOT NULL,
        contact_name VARCHAR(255),
        contact_phone VARCHAR(50),
        target_conversation_id VARCHAR REFERENCES conversations(id) ON DELETE SET NULL,
        share_url TEXT,
        message_preview TEXT,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_referral_share_profile ON referral_share_logs(profile_id);
      CREATE INDEX IF NOT EXISTS idx_referral_share_user ON referral_share_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_share_channel ON referral_share_logs(channel);

      ALTER TABLE referral_profiles ALTER COLUMN commission_default_amount SET DEFAULT 50.00;
      ALTER TABLE referral_profiles ADD COLUMN IF NOT EXISTS share_message_template TEXT;
      UPDATE referral_profiles SET commission_default_amount = 50.00 WHERE commission_default_amount <> 50.00;
      UPDATE referral_profiles
      SET commission_approved_amount = 50.00, updated_at = NOW()
      WHERE commission_approved_amount = 10.00;

      INSERT INTO referral_program_settings (default_commission_amount, referral_hero_title, referral_hero_body)
      SELECT 50.00, 'Transforme contatos em R$50 por assinatura aprovada', 'Selecione as conversas certas, deixe a IA encaixar sua recomendação e use cada indicação aprovada para abater sua assinatura ou sacar por Pix.'
      WHERE NOT EXISTS (SELECT 1 FROM referral_program_settings);

      ALTER TABLE admin_agent_media ADD COLUMN IF NOT EXISTS is_referral_support BOOLEAN NOT NULL DEFAULT false;
    `);

    console.log('✅ [DB] Estrutura de referral garantida');
    client.release();
  } catch (error: any) {
    console.error('❌ [DB] Erro ao garantir estrutura de referral:', error.message || error);
  }
}, 5500);

scheduleRuntimeDbTask(async () => {
  console.log('[DB] Garantindo lead intelligence...');
  try {
    const client = await pool.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_lead_intelligence (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id VARCHAR NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
        connection_id VARCHAR NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_number VARCHAR NOT NULL,
        contact_name VARCHAR,
        is_potential BOOLEAN NOT NULL DEFAULT false,
        potential_score INTEGER NOT NULL DEFAULT 0,
        potential_grade VARCHAR(32) NOT NULL DEFAULT 'baixo',
        business_type VARCHAR(255),
        persona_type VARCHAR(255),
        summary TEXT,
        qualification_reason TEXT,
        evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        recommended_approach TEXT,
        recommended_message TEXT,
        confidence INTEGER NOT NULL DEFAULT 0,
        catalog_is_qualified BOOLEAN NOT NULL DEFAULT false,
        catalog_score INTEGER NOT NULL DEFAULT 0,
        catalog_grade VARCHAR(32) NOT NULL DEFAULT 'baixo',
        catalog_segment VARCHAR(255),
        catalog_persona VARCHAR(255),
        catalog_region VARCHAR(255),
        catalog_stage VARCHAR(64),
        catalog_summary TEXT,
        catalog_need_summary TEXT,
        catalog_buyer_fit_summary TEXT,
        catalog_signals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        catalog_confidence INTEGER NOT NULL DEFAULT 0,
        catalog_last_analyzed_at TIMESTAMP,
        admin_status VARCHAR(32) NOT NULL DEFAULT 'new',
        campaign_count INTEGER NOT NULL DEFAULT 0,
        last_campaign_at TIMESTAMP,
        last_analyzed_at TIMESTAMP,
        last_customer_message TEXT,
        last_agent_message TEXT,
        awaiting_contact_reply BOOLEAN NOT NULL DEFAULT false,
        pending_reply_message TEXT,
        last_generated_message TEXT,
        last_generated_at TIMESTAMP,
        raw_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
        analysis_version VARCHAR(64) NOT NULL DEFAULT 'lead-intel-v1',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_conversation_lead_intelligence_user
      ON conversation_lead_intelligence(user_id);

      CREATE INDEX IF NOT EXISTS idx_conversation_lead_intelligence_potential
      ON conversation_lead_intelligence(is_potential, potential_grade);

      CREATE INDEX IF NOT EXISTS idx_conversation_lead_intelligence_status
      ON conversation_lead_intelligence(admin_status, last_analyzed_at);
    `);

    await client.query(`
      ALTER TABLE conversation_lead_intelligence
        ADD COLUMN IF NOT EXISTS catalog_is_qualified BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS catalog_score INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS catalog_grade VARCHAR(32) NOT NULL DEFAULT 'baixo',
        ADD COLUMN IF NOT EXISTS catalog_segment VARCHAR(255),
        ADD COLUMN IF NOT EXISTS catalog_persona VARCHAR(255),
        ADD COLUMN IF NOT EXISTS catalog_region VARCHAR(255),
        ADD COLUMN IF NOT EXISTS catalog_stage VARCHAR(64),
        ADD COLUMN IF NOT EXISTS catalog_summary TEXT,
        ADD COLUMN IF NOT EXISTS catalog_need_summary TEXT,
        ADD COLUMN IF NOT EXISTS catalog_buyer_fit_summary TEXT,
        ADD COLUMN IF NOT EXISTS catalog_signals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS catalog_confidence INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS catalog_last_analyzed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS awaiting_contact_reply BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS pending_reply_message TEXT,
        ADD COLUMN IF NOT EXISTS last_generated_message TEXT,
        ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMP;

      CREATE INDEX IF NOT EXISTS idx_conversation_lead_intelligence_catalog
      ON conversation_lead_intelligence(catalog_is_qualified, catalog_grade, catalog_stage);
    `);

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'admin_broadcasts'
        ) THEN
          ALTER TABLE admin_broadcasts
            ADD COLUMN IF NOT EXISTS source_type VARCHAR(64) NOT NULL DEFAULT 'users',
            ADD COLUMN IF NOT EXISTS custom_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS campaign_context JSONB NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS custom_min_interval_seconds INTEGER,
            ADD COLUMN IF NOT EXISTS custom_max_interval_seconds INTEGER,
            ADD COLUMN IF NOT EXISTS custom_batch_size INTEGER,
            ADD COLUMN IF NOT EXISTS custom_batch_pause_seconds INTEGER;
        END IF;
      END $$;
    `);

    console.log('[DB] Lead intelligence garantido');
    client.release();
  } catch (error: any) {
    console.error('[DB] Erro ao garantir lead intelligence:', error.message || error);
  }
}, 5600);

// ============================================================================
// AUTO-MIGRATION: Corrigir constraint de status em payment_receipts
// ============================================================================
scheduleRuntimeDbTask(async () => {
  try {
    const client = await pool.connect();

    // Verificar se a constraint já inclui 'cancelled'
    const checkConstraint = await client.query(`
      SELECT pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'payment_receipts'::regclass
      AND conname = 'payment_receipts_status_check'
    `);

    const constraintDef = checkConstraint.rows[0]?.definition || '';
    if (constraintDef && !constraintDef.includes('cancelled')) {
      console.log('[DB] Atualizando constraint de status em payment_receipts...');
      await client.query(`ALTER TABLE payment_receipts DROP CONSTRAINT payment_receipts_status_check`);
      await client.query(`
        ALTER TABLE payment_receipts 
        ADD CONSTRAINT payment_receipts_status_check 
        CHECK (status::text = ANY (ARRAY['pending'::varchar, 'approved'::varchar, 'rejected'::varchar, 'cancelled'::varchar]::text[]))
      `);
      console.log('✅ [DB] Constraint de status em payment_receipts atualizada!');
    }

    client.release();
  } catch (error: any) {
    // Pode falhar se a tabela não existir ainda - não é crítico
    if (!error.message?.includes('does not exist')) {
      console.error('❌ [DB] Erro ao atualizar constraint payment_receipts:', error.message);
    }
  }
}, 6000);

let ensureAudioResponseModeConstraintPromise: Promise<void> | null = null;

export async function ensureAudioResponseModeConstraint(): Promise<void> {
  if (!ensureAudioResponseModeConstraintPromise) {
    ensureAudioResponseModeConstraintPromise = (async () => {
      const client = await pool.connect();

      try {
        await client.query(`
          UPDATE audio_config
          SET response_mode = 'first_message_text_audio_then_mirror'
          WHERE response_mode = 'audio_first_message_then_customer_audio'
        `);

        const checkConstraint = await client.query(`
          SELECT pg_get_constraintdef(oid) as definition
          FROM pg_constraint
          WHERE conrelid = 'audio_config'::regclass
          AND conname = 'audio_config_response_mode_check'
        `);

        const constraintDef = checkConstraint.rows[0]?.definition || '';
        const requiredModes = [
          'first_message_text_audio_then_mirror',
          'audio_on_customer_audio',
          'audio_only',
          'audio_text',
        ];
        const isOutdated = requiredModes.some((mode) => !constraintDef.includes(mode));

        if (constraintDef && isOutdated) {
          console.log('[DB] Atualizando constraint de response_mode em audio_config...');
          await client.query(`ALTER TABLE audio_config DROP CONSTRAINT audio_config_response_mode_check`);
          await client.query(`
            ALTER TABLE audio_config
            ADD CONSTRAINT audio_config_response_mode_check
            CHECK (response_mode::text = ANY (ARRAY[
              'first_message_text_audio_then_mirror'::text,
              'audio_on_customer_audio'::text,
              'audio_only'::text,
              'audio_text'::text
            ]))
          `);
          console.log('✅ [DB] Constraint de response_mode em audio_config atualizada!');
        }
      } finally {
        client.release();
      }
    })().catch((error) => {
      ensureAudioResponseModeConstraintPromise = null;
      throw error;
    });
  }

  await ensureAudioResponseModeConstraintPromise;
}

// Configurar drizzle SEM prepared statements para compatibilidade com PgBouncer Transaction mode
// PgBouncer em modo "transaction" não suporta prepared statements
// V13: Disable verbose SQL query logging (was polluting stdout with multi-KB query dumps)
export const db = drizzle({ 
  client: pool, 
  schema,
  logger: false,
  ...(isPoolerConnection ? { casing: undefined } : {}),
});

// ============================================================================
// AUTO-MIGRATION: Garantir tabela admin_autologin_tokens
// ============================================================================
scheduleRuntimeDbTask(async () => {
  try {
    const client = await pool.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_autologin_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        redirect_to TEXT NOT NULL DEFAULT '/conexao'
      );
      CREATE INDEX IF NOT EXISTS idx_admin_autologin_tokens_user ON admin_autologin_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_admin_autologin_tokens_expires ON admin_autologin_tokens(expires_at);
      DROP INDEX IF EXISTS idx_autologin_user_id;
      DROP INDEX IF EXISTS idx_autologin_expires;
      -- Migration: add redirect_to column if table already exists without it
      ALTER TABLE admin_autologin_tokens ADD COLUMN IF NOT EXISTS redirect_to TEXT NOT NULL DEFAULT '/conexao';
    `);

    console.log('✅ [DB] Tabela admin_autologin_tokens garantida');

    client.release();
  } catch (error: any) {
    console.error('❌ [DB] Erro ao garantir tabela admin_autologin_tokens:', error.message || error);
  }
}, 7000);

scheduleRuntimeDbTask(async () => {
  try {
    await ensureAudioResponseModeConstraint();
  } catch (error: any) {
    if (!error.message?.includes('does not exist')) {
      console.error('❌ [DB] Erro ao atualizar constraint audio_config_response_mode_check:', error.message || error);
    }
  }
}, 8500);
