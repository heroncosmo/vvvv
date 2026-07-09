-- Migration: Add user_quick_replies table for SaaS users
-- This allows users to create their own quick reply templates

CREATE TABLE IF NOT EXISTS user_quick_replies (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  shortcut VARCHAR(50),
  category VARCHAR(50),
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_user_quick_replies_user ON user_quick_replies(user_id);

-- Index for shortcut search
CREATE INDEX IF NOT EXISTS idx_user_quick_replies_shortcut ON user_quick_replies(shortcut);

-- Insert default quick replies for demonstration
INSERT INTO user_quick_replies (title, content, shortcut, category, usage_count)
VALUES 
  ('Boas vindas', 'Olá! Seja bem-vindo(a)! Como posso ajudar você hoje?', '/bv', 'Geral', 0),
  ('Agradecimento', 'Muito obrigado pelo seu contato! Foi um prazer atendê-lo(a).', '/obg', 'Geral', 0),
  ('Aguardar momento', 'Um momento, por favor. Já vou verificar isso para você! 🔍', '/ag', 'Atendimento', 0)
ON CONFLICT DO NOTHING;
