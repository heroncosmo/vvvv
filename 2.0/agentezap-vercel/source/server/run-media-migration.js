/**
 * Script para executar migration da tabela agent_media_library
 * Execute com: node server/run-media-migration.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const migrationSQL = `
CREATE TABLE IF NOT EXISTS agent_media_library (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('audio', 'image', 'video', 'document')),
    storage_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    duration_seconds INTEGER,
    description TEXT NOT NULL,
    when_to_use TEXT,
    transcription TEXT,
    is_active BOOLEAN DEFAULT true NOT NULL,
    display_order INTEGER DEFAULT 0,
    wapi_media_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_media_user_id ON agent_media_library(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_media_name ON agent_media_library(user_id, name);
CREATE INDEX IF NOT EXISTS idx_agent_media_active ON agent_media_library(user_id, is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_media_unique_name ON agent_media_library(user_id, name);
`;

async function runMigration() {
  console.log('🔄 Conectando ao banco de dados...');
  
  try {
    const client = await pool.connect();
    console.log('✅ Conectado!');
    
    console.log('🔄 Executando migration...');
    await client.query(migrationSQL);
    
    console.log('✅ Migration executada com sucesso!');
    
    // Verificar se a tabela foi criada
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'agent_media_library'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Tabela agent_media_library criada com sucesso!');
    } else {
      console.log('❌ Tabela não foi criada');
    }
    
    client.release();
  } catch (error) {
    console.error('❌ Erro ao executar migration:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
