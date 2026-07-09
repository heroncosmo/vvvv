-- Migration: Criar tabela website_imports para importação de dados de websites
-- Projeto Supabase: bnfpcuzjvycudccycqqt
-- Data: 2026-01-13

-- ============================================================================
-- TABELA: website_imports
-- Armazena importações de websites para alimentar o contexto do agente IA
-- ============================================================================

CREATE TABLE IF NOT EXISTS website_imports (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Informações do website
  website_url TEXT NOT NULL,
  website_name VARCHAR(255),
  website_description TEXT,
  
  -- Conteúdo extraído
  extracted_html TEXT,
  extracted_text TEXT,
  
  -- Dados estruturados extraídos pelo Mistral
  extracted_products JSONB DEFAULT '[]'::jsonb,
  extracted_info JSONB DEFAULT '{}'::jsonb,
  
  -- Contexto formatado para o agente
  formatted_context TEXT,
  
  -- Status e controle
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  pages_scraped INTEGER DEFAULT 0,
  products_found INTEGER DEFAULT 0,
  
  -- Se aplicado ao prompt
  applied_to_prompt BOOLEAN DEFAULT FALSE,
  applied_at TIMESTAMP,
  
  -- Metadata
  last_scraped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_website_imports_user_id ON website_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_website_imports_status ON website_imports(status);

-- Comentários
COMMENT ON TABLE website_imports IS 'Armazena importações de websites para alimentar o contexto do agente IA';
COMMENT ON COLUMN website_imports.extracted_products IS 'Array JSON de produtos extraídos com nome, preço, descrição';
COMMENT ON COLUMN website_imports.extracted_info IS 'JSON com informações do negócio extraídas';
COMMENT ON COLUMN website_imports.formatted_context IS 'Contexto formatado pronto para adicionar ao prompt do agente';
