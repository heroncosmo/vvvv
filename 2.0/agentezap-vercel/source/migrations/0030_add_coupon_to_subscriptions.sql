-- Migration: Add coupon fields to subscriptions table
-- This allows tracking of applied coupons and their prices

ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS coupon_code TEXT DEFAULT NULL;

ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS coupon_price DECIMAL(10, 2) DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN subscriptions.coupon_code IS 'The coupon code applied to this subscription';
COMMENT ON COLUMN subscriptions.coupon_price IS 'The final price with coupon discount applied';
