-- ENUMs para o sistema de tickets
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
        CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority') THEN
        CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_message_sender') THEN
        CREATE TYPE ticket_message_sender AS ENUM ('user', 'admin', 'system');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_attachment_kind') THEN
        CREATE TYPE ticket_attachment_kind AS ENUM ('image');
    END IF;
END$$;

-- Tabela principal de tickets
CREATE TABLE IF NOT EXISTS tickets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    assigned_admin_id BIGINT NULL,
    subject VARCHAR(180) NOT NULL,
    description TEXT NULL,
    status ticket_status NOT NULL DEFAULT 'open',
    priority ticket_priority NOT NULL DEFAULT 'medium',
    source_channel VARCHAR(50) NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    unread_count_user INT NOT NULL DEFAULT 0,
    unread_count_admin INT NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ NULL,
    last_message_preview VARCHAR(400) NULL,
    first_response_at TIMESTAMPTZ NULL,
    resolved_at TIMESTAMPTZ NULL,
    closed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    
    CONSTRAINT chk_tickets_subject_len CHECK (char_length(trim(subject)) >= 3),
    CONSTRAINT chk_tickets_unread_user_nonneg CHECK (unread_count_user >= 0),
    CONSTRAINT chk_tickets_unread_admin_nonneg CHECK (unread_count_admin >= 0)
);

-- Índices para tickets
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_admin_id ON tickets(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_last_message_at ON tickets(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_deleted_at ON tickets(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tickets_admin_listing ON tickets(status, priority, last_message_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_user_listing ON tickets(user_id, last_message_at DESC) WHERE deleted_at IS NULL;

-- Tabela de mensagens do ticket
CREATE TABLE IF NOT EXISTS ticket_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    sender_type ticket_message_sender NOT NULL,
    sender_user_id BIGINT NULL,
    sender_admin_id BIGINT NULL,
    body TEXT NOT NULL,
    has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    
    CONSTRAINT fk_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT chk_ticket_messages_sender_consistency CHECK (
        (sender_type = 'user' AND sender_user_id IS NOT NULL AND sender_admin_id IS NULL) OR
        (sender_type = 'admin' AND sender_admin_id IS NOT NULL AND sender_user_id IS NULL) OR
        (sender_type = 'system' AND sender_user_id IS NULL AND sender_admin_id IS NULL)
    ),
    CONSTRAINT chk_ticket_messages_body_not_empty CHECK (char_length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created ON ticket_messages(ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_type ON ticket_messages(sender_type);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_deleted_at ON ticket_messages(deleted_at);

-- Tabela de anexos
CREATE TABLE IF NOT EXISTS ticket_attachments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    message_id BIGINT NOT NULL,
    kind ticket_attachment_kind NOT NULL DEFAULT 'image',
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_provider VARCHAR(30) NOT NULL DEFAULT 'local',
    storage_key TEXT NOT NULL,
    public_url TEXT NOT NULL,
    width INT NULL,
    height INT NULL,
    checksum_sha256 CHAR(64) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    
    CONSTRAINT fk_ticket_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_attachments_message FOREIGN KEY (message_id) REFERENCES ticket_messages(id) ON DELETE CASCADE,
    CONSTRAINT chk_ticket_attachments_size_positive CHECK (size_bytes > 0),
    CONSTRAINT chk_ticket_attachments_dimensions CHECK (
        (width IS NULL OR width > 0) AND (height IS NULL OR height > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_message_id ON ticket_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_created_at ON ticket_attachments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_deleted_at ON ticket_attachments(deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_ticket_attachments_storage_key ON ticket_attachments(storage_key);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tickets_set_updated_at ON tickets;
CREATE TRIGGER trg_tickets_set_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ticket_messages_set_updated_at ON ticket_messages;
CREATE TRIGGER trg_ticket_messages_set_updated_at
    BEFORE UPDATE ON ticket_messages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Trigger para sincronizar contadores do ticket
CREATE OR REPLACE FUNCTION sync_ticket_after_message_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tickets SET
        last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.body, 400),
        unread_count_user = CASE WHEN NEW.sender_type = 'admin' THEN unread_count_user + 1 ELSE unread_count_user END,
        unread_count_admin = CASE WHEN NEW.sender_type = 'user' THEN unread_count_admin + 1 ELSE unread_count_admin END,
        first_response_at = CASE WHEN NEW.sender_type = 'admin' AND first_response_at IS NULL THEN NOW() ELSE first_response_at END,
        status = CASE WHEN status = 'open' AND NEW.sender_type = 'admin' THEN 'in_progress' ELSE status END
    WHERE id = NEW.ticket_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_messages_after_insert_sync_ticket ON ticket_messages;
CREATE TRIGGER trg_ticket_messages_after_insert_sync_ticket
    AFTER INSERT ON ticket_messages
    FOR EACH ROW EXECUTE FUNCTION sync_ticket_after_message_insert();

-- ============================================================
-- MIGRATION 20250212: Corrigir tipos de user_id/admin_id para UUID
-- Supabase retorna UUIDs (strings), não BIGINTs
-- ============================================================

-- Alterar user_id em tickets para UUID
DO $$
BEGIN
    -- Verificar se a coluna ainda é BIGINT antes de alterar
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tickets'
          AND column_name = 'user_id'
          AND data_type IN ('bigint', 'integer')
    ) THEN
        ALTER TABLE tickets ALTER COLUMN user_id TYPE UUID USING user_id::text::uuid;
    END IF;
END$$;

-- Alterar assigned_admin_id em tickets para UUID
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tickets'
          AND column_name = 'assigned_admin_id'
          AND data_type IN ('bigint', 'integer')
    ) THEN
        ALTER TABLE tickets ALTER COLUMN assigned_admin_id TYPE UUID USING assigned_admin_id::text::uuid;
    END IF;
END$$;

-- Alterar sender_user_id em ticket_messages para UUID
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_messages'
          AND column_name = 'sender_user_id'
          AND data_type IN ('bigint', 'integer')
    ) THEN
        ALTER TABLE ticket_messages ALTER COLUMN sender_user_id TYPE UUID USING sender_user_id::text::uuid;
    END IF;
END$$;

-- Alterar sender_admin_id em ticket_messages para UUID
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_messages'
          AND column_name = 'sender_admin_id'
          AND data_type IN ('bigint', 'integer')
    ) THEN
        ALTER TABLE ticket_messages ALTER COLUMN sender_admin_id TYPE UUID USING sender_admin_id::text::uuid;
    END IF;
END$$;
