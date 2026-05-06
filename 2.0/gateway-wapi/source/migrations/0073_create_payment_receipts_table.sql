-- Migration: Create payment_receipts table for PIX receipt uploads
-- Created: 2026-02-18

CREATE TABLE IF NOT EXISTS "payment_receipts" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "subscription_id" varchar NOT NULL REFERENCES "subscriptions"("id") ON DELETE CASCADE,
    "plan_id" varchar REFERENCES "plans"("id"),
    "amount" decimal(10, 2) NOT NULL,
    "receipt_url" varchar NOT NULL,
    "receipt_filename" varchar,
    "receipt_mime_type" varchar,
    "status" varchar(50) DEFAULT 'pending' NOT NULL,
    "mp_payment_id" varchar(255),
    "reviewed_by" varchar,
    "reviewed_at" timestamp,
    "review_notes" text,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS "idx_payment_receipts_user" ON "payment_receipts"("user_id");
CREATE INDEX IF NOT EXISTS "idx_payment_receipts_subscription" ON "payment_receipts"("subscription_id");
CREATE INDEX IF NOT EXISTS "idx_payment_receipts_status" ON "payment_receipts"("status");
CREATE INDEX IF NOT EXISTS "idx_payment_receipts_mp_payment" ON "payment_receipts"("mp_payment_id");