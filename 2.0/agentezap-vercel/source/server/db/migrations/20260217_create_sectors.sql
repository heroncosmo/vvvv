-- ============================================================
-- SECTORS: Tabela de setores de suporte e roteamento
-- ============================================================

CREATE TABLE IF NOT EXISTS sectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(160) NOT NULL UNIQUE,
    description TEXT NULL,
    keywords TEXT[] NOT NULL DEFAULT '{}',
    auto_assign_agent_id UUID NULL REFERENCES admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sectors_name ON sectors(name);
CREATE INDEX IF NOT EXISTS idx_sectors_auto_assign_agent ON sectors(auto_assign_agent_id);

-- Reaproveitar trigger de updated_at se existir
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
        DROP TRIGGER IF EXISTS trg_sectors_set_updated_at ON sectors;
        CREATE TRIGGER trg_sectors_set_updated_at
            BEFORE UPDATE ON sectors
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END$$;

-- Adicionar setor aos tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sector_id UUID NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'tickets'
          AND constraint_name = 'fk_tickets_sector'
    ) THEN
        ALTER TABLE tickets
          ADD CONSTRAINT fk_tickets_sector
          FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE SET NULL;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_tickets_sector_id ON tickets(sector_id);
