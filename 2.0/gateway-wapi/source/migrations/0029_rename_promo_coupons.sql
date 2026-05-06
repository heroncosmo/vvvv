-- Migration: Rename PROMO coupons to distinctive names
-- Users will try obvious patterns like PROMO1, PROMO2, DESCONTO10

-- Rename PROMO29 to a distinctive name
UPDATE coupons 
SET code = 'AGENTEZAP29' 
WHERE code = 'PROMO29';

-- Rename PROMO49 to a distinctive name  
UPDATE coupons 
SET code = 'PARCEIRO49'
WHERE code = 'PROMO49';
