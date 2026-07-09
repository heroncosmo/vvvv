-- ============================================================================
-- PAYMENT HISTORY TABLE - Histórico de todos os pagamentos (MercadoPago, Pix, etc)
-- Usado para exibir histórico de cobranças para clientes e admin
-- ============================================================================

CREATE TABLE IF NOT EXISTS "payment_history" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "subscription_id" varchar NOT NULL REFERENCES "subscriptions"("id") ON DELETE CASCADE,
  "user_id" varchar REFERENCES "users"("id") ON DELETE CASCADE,
  
  -- Informações do pagamento MercadoPago
  "mp_payment_id" varchar(255),
  "mp_subscription_id" varchar(255),
  
  -- Valores
  "amount" decimal(10, 2) NOT NULL,
  "net_amount" decimal(10, 2),
  "fee_amount" decimal(10, 2),
  
  -- Status
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "status_detail" varchar(100),
  
  -- Tipo de pagamento
  "payment_type" varchar(50) DEFAULT 'recurring' NOT NULL,
  "payment_method" varchar(50),
  
  -- Datas
  "payment_date" timestamp,
  "due_date" timestamp,
  
  -- Informações adicionais
  "payer_email" varchar(255),
  "card_last_four_digits" varchar(4),
  "card_brand" varchar(50),
  
  -- Metadata
  "raw_response" jsonb,
  
  "created_at" timestamp DEFAULT NOW(),
  "updated_at" timestamp DEFAULT NOW()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS "idx_payment_history_subscription" ON "payment_history"("subscription_id");
CREATE INDEX IF NOT EXISTS "idx_payment_history_user" ON "payment_history"("user_id");
CREATE INDEX IF NOT EXISTS "idx_payment_history_mp_payment" ON "payment_history"("mp_payment_id");
CREATE INDEX IF NOT EXISTS "idx_payment_history_status" ON "payment_history"("status");
CREATE INDEX IF NOT EXISTS "idx_payment_history_date" ON "payment_history"("payment_date");
