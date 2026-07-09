-- Migration: Criar tabelas de setores e relatórios de roteamento
-- Data: 2026-02-18
-- Descrição: Compatibiliza o schema legado de setores e cria conversation_reports

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabela de setores compatível com o schema atual em produção
CREATE TABLE IF NOT EXISTS sectors (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  auto_assign_agent_id VARCHAR REFERENCES admins(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  owner_id VARCHAR
);

ALTER TABLE sectors
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auto_assign_agent_id VARCHAR,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS owner_id VARCHAR;

-- Tabela de membros compatível com team_members
DO $$
DECLARE
  sectors_id_udt TEXT := COALESCE((
    SELECT c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'sectors'
      AND c.column_name = 'id'
    LIMIT 1
  ), 'varchar');
  sectors_id_sql TEXT := CASE WHEN sectors_id_udt = 'uuid' THEN 'UUID' ELSE 'VARCHAR' END;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'sector_members'
  ) THEN
    EXECUTE format(
      'CREATE TABLE sector_members (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        sector_id %s NOT NULL,
        member_id VARCHAR NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
        is_primary BOOLEAN DEFAULT FALSE,
        can_receive_tickets BOOLEAN DEFAULT TRUE,
        max_open_tickets INTEGER DEFAULT 10,
        current_open_tickets INTEGER DEFAULT 0,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        assigned_by VARCHAR REFERENCES admins(id),
        owner_id VARCHAR,
        UNIQUE(sector_id, member_id)
      )',
      sectors_id_sql
    );
  END IF;
END $$;

ALTER TABLE sector_members
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_receive_tickets BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS max_open_tickets INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS current_open_tickets INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS assigned_by VARCHAR,
  ADD COLUMN IF NOT EXISTS owner_id VARCHAR;

DO $$
DECLARE
  sectors_id_udt TEXT := COALESCE((
    SELECT c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'sectors'
      AND c.column_name = 'id'
    LIMIT 1
  ), 'varchar');
  member_sector_udt TEXT := (
    SELECT c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'sector_members'
      AND c.column_name = 'sector_id'
    LIMIT 1
  );
BEGIN
  IF member_sector_udt IS NOT NULL AND member_sector_udt <> sectors_id_udt THEN
    IF sectors_id_udt = 'uuid' THEN
      EXECUTE 'ALTER TABLE sector_members ALTER COLUMN sector_id TYPE UUID USING sector_id::uuid';
    ELSE
      EXECUTE 'ALTER TABLE sector_members ALTER COLUMN sector_id TYPE VARCHAR USING sector_id::text';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sector_members_sector_id_fkey'
      AND conrelid = 'public.sector_members'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE sector_members ADD CONSTRAINT sector_members_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_sector_members_unique_sector_member'
  ) THEN
    CREATE UNIQUE INDEX idx_sector_members_unique_sector_member
      ON sector_members(sector_id, member_id);
  END IF;
END $$;

-- Relatório de roteamento/conversas
DO $$
DECLARE
  sectors_id_udt TEXT := COALESCE((
    SELECT c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'sectors'
      AND c.column_name = 'id'
    LIMIT 1
  ), 'varchar');
  sectors_id_sql TEXT := CASE WHEN sectors_id_udt = 'uuid' THEN 'UUID' ELSE 'VARCHAR' END;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'conversation_reports'
  ) THEN
    EXECUTE format(
      'CREATE TABLE conversation_reports (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id VARCHAR NOT NULL,
        sector_id %s,
        assigned_admin_id VARCHAR REFERENCES admins(id) ON DELETE SET NULL,
        assigned_at TIMESTAMP,
        closed_at TIMESTAMP,
        closed_by VARCHAR REFERENCES admins(id) ON DELETE SET NULL,
        closed_reason TEXT,
        routing_method VARCHAR(50),
        routing_confidence DECIMAL(3,2),
        message_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(conversation_id)
      )',
      sectors_id_sql
    );
  END IF;
END $$;

ALTER TABLE conversation_reports
  ADD COLUMN IF NOT EXISTS sector_id VARCHAR,
  ADD COLUMN IF NOT EXISTS assigned_admin_id VARCHAR,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS closed_by VARCHAR,
  ADD COLUMN IF NOT EXISTS closed_reason TEXT,
  ADD COLUMN IF NOT EXISTS routing_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS routing_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

DO $$
DECLARE
  sectors_id_udt TEXT := COALESCE((
    SELECT c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'sectors'
      AND c.column_name = 'id'
    LIMIT 1
  ), 'varchar');
  report_sector_udt TEXT := (
    SELECT c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'conversation_reports'
      AND c.column_name = 'sector_id'
    LIMIT 1
  );
BEGIN
  IF report_sector_udt IS NOT NULL AND report_sector_udt <> sectors_id_udt THEN
    IF sectors_id_udt = 'uuid' THEN
      EXECUTE 'ALTER TABLE conversation_reports ALTER COLUMN sector_id TYPE UUID USING CASE WHEN sector_id IS NULL OR sector_id = '''' THEN NULL ELSE sector_id::uuid END';
    ELSE
      EXECUTE 'ALTER TABLE conversation_reports ALTER COLUMN sector_id TYPE VARCHAR USING sector_id::text';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversation_reports_sector_id_fkey'
      AND conrelid = 'public.conversation_reports'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE conversation_reports ADD CONSTRAINT conversation_reports_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE SET NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sectors_name ON sectors(name);
CREATE INDEX IF NOT EXISTS idx_sectors_auto_assign_agent ON sectors(auto_assign_agent_id);
CREATE INDEX IF NOT EXISTS idx_sectors_owner_id ON sectors(owner_id);
CREATE INDEX IF NOT EXISTS idx_sector_members_sector_id ON sector_members(sector_id);
CREATE INDEX IF NOT EXISTS idx_sector_members_member_id ON sector_members(member_id);
CREATE INDEX IF NOT EXISTS idx_sector_members_owner_id ON sector_members(owner_id);
CREATE INDEX IF NOT EXISTS idx_conversation_reports_conversation_id ON conversation_reports(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_reports_sector_id ON conversation_reports(sector_id);
CREATE INDEX IF NOT EXISTS idx_conversation_reports_assigned_admin_id ON conversation_reports(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_conversation_reports_created_at ON conversation_reports(created_at);

DROP TRIGGER IF EXISTS update_sectors_updated_at ON sectors;
CREATE TRIGGER update_sectors_updated_at
  BEFORE UPDATE ON sectors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversation_reports_updated_at ON conversation_reports;
CREATE TRIGGER update_conversation_reports_updated_at
  BEFORE UPDATE ON conversation_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sectors IS 'Tabela de setores para organização de atendimento';
COMMENT ON TABLE sector_members IS 'Tabela de membros de setor com prioridade e capacidade';
COMMENT ON TABLE conversation_reports IS 'Tabela de relatórios de conversas com roteamento e fechamento';
COMMENT ON COLUMN sectors.keywords IS 'Palavras-chave para roteamento automático de conversas';
COMMENT ON COLUMN sector_members.is_primary IS 'Membro principal do setor';
COMMENT ON COLUMN sector_members.max_open_tickets IS 'Limite máximo de tickets abertos por membro';
COMMENT ON COLUMN conversation_reports.routing_method IS 'Método de roteamento usado';
COMMENT ON COLUMN conversation_reports.routing_confidence IS 'Confiança do roteamento de 0 a 1';
