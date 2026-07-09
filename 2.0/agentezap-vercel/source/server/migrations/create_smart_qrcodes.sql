-- ============================================================
-- QR Code Inteligente - Tabela principal
-- Armazena QR Codes que direcionam para WhatsApp do usuário
-- Suporta personalização, templates, cor, logo e download
-- ============================================================

CREATE TABLE IF NOT EXISTS smart_qrcodes (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Identidade do QR Code
  name          VARCHAR(200) NOT NULL,                          -- Nome/rótulo para identificar (ex: "QR Recepção", "QR Cardápio")
  description   TEXT,                                          -- Descrição opcional
  slug          VARCHAR(100) UNIQUE,                            -- Slug único para URL amigável (ex: /qr/minha-lanchonete)

  -- Destino WhatsApp
  whatsapp_number VARCHAR(30) NOT NULL,                         -- Número WhatsApp de destino (DDI+DDD+número)
  welcome_message TEXT,                                         -- Mensagem pré-preenchida quando cliente escaneia

  -- Template / Segmento
  template_id   VARCHAR(100),                                   -- Slug do template (ex: "lanchonete", "barbearia", "clinica")
  template_name VARCHAR(100),                                   -- Nome legível do template

  -- Personalização visual
  foreground_color  VARCHAR(20) DEFAULT '#000000',              -- Cor do QR Code
  background_color  VARCHAR(20) DEFAULT '#ffffff',              -- Cor do fundo
  logo_url          TEXT,                                       -- URL do logo centralizado
  logo_size         INTEGER DEFAULT 20,                         -- Tamanho do logo em % do QR (5-30%)
  corner_radius     INTEGER DEFAULT 0,                          -- Raio dos cantos em pixels
  error_correction  VARCHAR(1) DEFAULT 'H',                     -- Nível de correção: L, M, Q, H

  -- Conteúdo dinâmico (URL gerada)
  target_url    TEXT NOT NULL,                                  -- URL final encoded (wa.me/...)
  qr_data       TEXT,                                          -- Data URL (base64 PNG) gerado e cacheado
  qr_generated_at TIMESTAMP WITH TIME ZONE,                    -- Quando foi gerado/regenerado

  -- Tamanho e qualidade
  qr_size       INTEGER DEFAULT 400,                            -- Tamanho em pixels (200-1200)

  -- Status e analytics
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  scan_count    INTEGER NOT NULL DEFAULT 0,                     -- Quantas vezes foi escaneado
  last_scanned_at TIMESTAMP WITH TIME ZONE,

  -- Metadados
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_smart_qrcodes_user_id    ON smart_qrcodes(user_id);
CREATE INDEX IF NOT EXISTS idx_smart_qrcodes_slug       ON smart_qrcodes(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_smart_qrcodes_active     ON smart_qrcodes(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_smart_qrcodes_template   ON smart_qrcodes(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_smart_qrcodes_created    ON smart_qrcodes(created_at);

-- ============================================================
-- Tabela de logs de scan (analytics por escaneo)
-- ============================================================

CREATE TABLE IF NOT EXISTS qrcode_scan_logs (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  qrcode_id       VARCHAR NOT NULL REFERENCES smart_qrcodes(id) ON DELETE CASCADE,
  user_id         VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Dados do scan
  scanned_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_agent      TEXT,                                         -- Dispositivo/browser que escaneou
  ip_address      VARCHAR(50),                                  -- IP (anonimizado)
  referrer        TEXT,                                         -- De onde veio (se disponível)

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qrcode_scan_logs_qrcode  ON qrcode_scan_logs(qrcode_id);
CREATE INDEX IF NOT EXISTS idx_qrcode_scan_logs_user    ON qrcode_scan_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_qrcode_scan_logs_date    ON qrcode_scan_logs(scanned_at);
