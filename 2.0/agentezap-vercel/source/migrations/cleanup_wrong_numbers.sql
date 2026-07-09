-- Script para limpar conversas com números estranhos no banco
-- Execute isso no Supabase SQL Editor

-- 1. Ver quais conversas serão deletadas (números que não são brasileiros +55)
SELECT id, contact_number, contact_name, created_at 
FROM conversations 
WHERE contact_number NOT LIKE '55%' 
  OR LENGTH(contact_number) > 13;

-- 2. DELETAR conversas com números estranhos
-- As mensagens serão deletadas automaticamente (CASCADE)
DELETE FROM conversations 
WHERE contact_number NOT LIKE '55%' 
  OR LENGTH(contact_number) > 13;

-- 3. Verificar que ficou apenas números brasileiros válidos
SELECT contact_number, COUNT(*) as total
FROM conversations
GROUP BY contact_number
ORDER BY contact_number;
