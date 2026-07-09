-- Migration: Fix Annual Plan Price to be the total annual amount instead of monthly equivalent
-- Date: 2024-12-23

UPDATE plans 
SET valor = 1128.00 
WHERE tipo = 'anual' AND periodicidade = 'anual';
