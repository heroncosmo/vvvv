-- Migration: Create admin_quick_replies table for quick responses feature
-- Date: 2025-12-27

CREATE TABLE IF NOT EXISTS admin_quick_replies (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id VARCHAR(255) REFERENCES admins(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  shortcut VARCHAR(50),
  category VARCHAR(50),
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quick_replies_admin ON admin_quick_replies(admin_id);
CREATE INDEX IF NOT EXISTS idx_quick_replies_shortcut ON admin_quick_replies(shortcut);

-- Insert some default quick replies for testing
INSERT INTO admin_quick_replies (admin_id, title, content, shortcut)
SELECT 
  (SELECT id FROM admins LIMIT 1),
  'Boas vindas',
  'Olá! 👋 Bem-vindo(a)! Como posso ajudar você hoje?',
  'bv'
WHERE EXISTS (SELECT 1 FROM admins);

INSERT INTO admin_quick_replies (admin_id, title, content, shortcut)
SELECT 
  (SELECT id FROM admins LIMIT 1),
  'Agradecimento',
  'Muito obrigado pelo contato! 🙏 Estamos à disposição.',
  'obg'
WHERE EXISTS (SELECT 1 FROM admins);

INSERT INTO admin_quick_replies (admin_id, title, content, shortcut)
SELECT 
  (SELECT id FROM admins LIMIT 1),
  'Aguardar momento',
  'Um momento, por favor! Estou verificando isso para você. ⏳',
  'ag'
WHERE EXISTS (SELECT 1 FROM admins);
