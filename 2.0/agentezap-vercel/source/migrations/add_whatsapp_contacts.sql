-- =====================================================================
-- Migration: Add whatsapp_contacts table for persistent contact storage
-- Purpose: Fix LID resolution (@lid → phoneNumber) with DB persistence
-- Date: 2025-11-22
-- Author: System
-- =====================================================================

-- PROBLEMA: contactsCache (Map em memória) é perdido a cada restart
-- SOLUÇÃO: Tabela whatsapp_contacts para persistir mapeamentos @lid

-- =====================================================================
-- CREATE TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  -- Primary Key (UUID v4)
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign Key: Connection que possui este contato
  -- CASCADE DELETE: Quando connection é deletada, contatos também são removidos
  connection_id VARCHAR NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  
  -- JID principal do contato (normalizado pelo Baileys)
  -- Exemplos: 
  --   - "5511987654321@s.whatsapp.net" (WhatsApp normal)
  --   - "153519764074616@lid" (Instagram/Facebook Business)
  contact_id TEXT NOT NULL,
  
  -- LID do contato (se vier de Instagram/Facebook)
  -- Exemplo: "153519764074616@lid"
  -- NULL para contatos normais do WhatsApp
  lid TEXT,
  
  -- 🔑 CAMPO CRÍTICO: Número real do contato
  -- Formato: "numero@s.whatsapp.net"
  -- Exemplo: "5511987654321@s.whatsapp.net"
  -- Este campo resolve o mapeamento @lid → phoneNumber
  phone_number TEXT,
  
  -- Nome do contato (push name do WhatsApp)
  name VARCHAR(255),
  
  -- URL da foto de perfil (opcional)
  img_url TEXT,
  
  -- Última sincronização com Baileys (auditoria)
  last_synced_at TIMESTAMP DEFAULT NOW(),
  
  -- Timestamps padrão
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================================
-- INDEXES - Otimizados para queries de produção
-- =====================================================================

-- ÍNDICE COMPOSTO: Busca rápida por connectionId + contactId
-- Use case: Verificar se contato já existe antes de inserir
-- Query: SELECT * FROM whatsapp_contacts WHERE connection_id = ? AND contact_id = ?
CREATE INDEX IF NOT EXISTS idx_contacts_connection_id 
ON whatsapp_contacts(connection_id, contact_id);

-- ÍNDICE PARCIAL: Busca rápida por LID (principal use case)
-- Use case: Resolver @lid → phoneNumber em parseRemoteJid()
-- Query: SELECT phone_number FROM whatsapp_contacts WHERE lid = '153519764074616@lid'
-- PARTIAL: Ignora contatos sem LID (economia de espaço)
CREATE INDEX IF NOT EXISTS idx_contacts_lid 
ON whatsapp_contacts(lid) 
WHERE lid IS NOT NULL;

-- ÍNDICE PARCIAL: Busca por phoneNumber para lookups reversos
-- Use case: Encontrar contato pelo número real
-- Query: SELECT * FROM whatsapp_contacts WHERE phone_number = '5511987654321@s.whatsapp.net'
CREATE INDEX IF NOT EXISTS idx_contacts_phone 
ON whatsapp_contacts(phone_number) 
WHERE phone_number IS NOT NULL;

-- ÍNDICE UNIQUE COMPOSTO: Previne duplicatas
-- Garante um único contato por (connectionId, contactId)
-- Permite UPSERT sem conflitos (ON CONFLICT DO UPDATE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_unique_connection_contact 
ON whatsapp_contacts(connection_id, contact_id);

-- ÍNDICE: Cleanup de contatos antigos (data retention)
-- Use case: DELETE FROM whatsapp_contacts WHERE last_synced_at < NOW() - INTERVAL '90 days'
CREATE INDEX IF NOT EXISTS idx_contacts_last_synced 
ON whatsapp_contacts(last_synced_at);

-- =====================================================================
-- COMMENTS - Documentação no próprio banco
-- =====================================================================

COMMENT ON TABLE whatsapp_contacts IS 'Cache persistente de contatos do WhatsApp/Baileys. Mapeia @lid (Instagram/Facebook) para phoneNumber real. Evita perda de dados em restarts.';

COMMENT ON COLUMN whatsapp_contacts.connection_id IS 'FK para whatsapp_connections. Identifica de qual conexão é o contato.';
COMMENT ON COLUMN whatsapp_contacts.contact_id IS 'JID principal do contato retornado pelo Baileys (pode ser @lid ou @s.whatsapp.net)';
COMMENT ON COLUMN whatsapp_contacts.lid IS 'LID do Business API (Instagram/Facebook). NULL para contatos WhatsApp normais.';
COMMENT ON COLUMN whatsapp_contacts.phone_number IS 'CRÍTICO: Número real do contato (formato: numero@s.whatsapp.net). Resolve @lid → número.';
COMMENT ON COLUMN whatsapp_contacts.name IS 'Push name do contato (nome exibido no WhatsApp)';
COMMENT ON COLUMN whatsapp_contacts.last_synced_at IS 'Última vez que este contato foi sincronizado via contacts.upsert';

-- =====================================================================
-- VALIDAÇÃO - Testa se a migration foi aplicada corretamente
-- =====================================================================

-- Verifica se a tabela existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'whatsapp_contacts') THEN
    RAISE NOTICE 'SUCCESS: whatsapp_contacts table created';
  ELSE
    RAISE EXCEPTION 'FAILED: whatsapp_contacts table not found';
  END IF;
  
  -- Verifica se os índices foram criados
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_contacts_lid') THEN
    RAISE NOTICE 'SUCCESS: Index idx_contacts_lid created';
  ELSE
    RAISE WARNING 'WARNING: Index idx_contacts_lid not found';
  END IF;
END $$;

-- =====================================================================
-- EXEMPLO DE USO - Para referência dos desenvolvedores
-- =====================================================================

-- UPSERT de um contato (evita duplicatas)
/*
INSERT INTO whatsapp_contacts (
  connection_id,
  contact_id,
  lid,
  phone_number,
  name,
  last_synced_at
) VALUES (
  'connection-uuid-here',
  '153519764074616@lid',
  '153519764074616@lid',
  '5511987654321@s.whatsapp.net',
  'João Silva',
  NOW()
)
ON CONFLICT (connection_id, contact_id) 
DO UPDATE SET
  phone_number = EXCLUDED.phone_number,
  name = EXCLUDED.name,
  last_synced_at = NOW(),
  updated_at = NOW();
*/

-- Buscar phoneNumber por LID (principal query de produção)
/*
SELECT phone_number, name
FROM whatsapp_contacts
WHERE lid = '153519764074616@lid'
LIMIT 1;
*/

-- Carregar todos os contatos de uma conexão (cache warming)
/*
SELECT contact_id, lid, phone_number, name
FROM whatsapp_contacts
WHERE connection_id = 'connection-uuid-here'
ORDER BY last_synced_at DESC;
*/

-- Cleanup de contatos antigos (executar periodicamente)
/*
DELETE FROM whatsapp_contacts
WHERE connection_id IN (
  SELECT id FROM whatsapp_connections 
  WHERE is_connected = false 
  AND updated_at < NOW() - INTERVAL '90 days'
);
*/

-- =====================================================================
-- ROLLBACK - Para reverter esta migration
-- =====================================================================

-- Para executar rollback:
/*
DROP INDEX IF EXISTS idx_contacts_last_synced;
DROP INDEX IF EXISTS idx_contacts_unique_connection_contact;
DROP INDEX IF EXISTS idx_contacts_phone;
DROP INDEX IF EXISTS idx_contacts_lid;
DROP INDEX IF EXISTS idx_contacts_connection_id;
DROP TABLE IF EXISTS whatsapp_contacts CASCADE;
*/
