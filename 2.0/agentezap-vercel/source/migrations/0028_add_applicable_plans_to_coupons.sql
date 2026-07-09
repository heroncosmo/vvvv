-- Migration: Add applicable_plans column to coupons table
-- This allows coupons to be restricted to specific plans

ALTER TABLE coupons 
ADD COLUMN IF NOT EXISTS applicable_plans JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN coupons.applicable_plans IS 'Array of plan types where this coupon is valid. NULL means applicable to all plans.';
