-- Migration: Create follow-up tables for non-payers
-- Date: 2026-02-18

-- Tabela de configuração de follow-up para não pagantes
CREATE TABLE IF NOT EXISTS followup_configs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_enabled BOOLEAN DEFAULT FALSE,
  active_days INTEGER DEFAULT 3,
  max_attempts INTEGER DEFAULT 3,
  message_template TEXT DEFAULT 'Olá! Seu plano expirou. Quer renovar?',
  tone TEXT DEFAULT 'friendly',
  use_emojis BOOLEAN DEFAULT TRUE,
  active_days_start INTEGER DEFAULT 1,
  active_days_end INTEGER DEFAULT 7,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de tentativas de follow-up
CREATE TABLE IF NOT EXISTS followup_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  subscription_id INTEGER,
  message TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'sent', -- sent, failed, cancelled
  response TEXT,
  response_date TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_followup_attempts_user_id ON followup_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_followup_attempts_sent_at ON followup_attempts(sent_at);
CREATE INDEX IF NOT EXISTS idx_followup_attempts_status ON followup_attempts(status);

-- Insert default config if not exists
INSERT OR IGNORE INTO followup_configs (id, is_enabled, active_days, max_attempts, message_template, tone, use_emojis, active_days_start, active_days_end)
VALUES (1, FALSE, 3, 3, 'Olá! Seu plano expirou. Quer renovar?', 'friendly', TRUE, 1, 7);
