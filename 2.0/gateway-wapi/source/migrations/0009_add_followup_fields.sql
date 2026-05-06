ALTER TABLE "admin_conversations" ADD COLUMN IF NOT EXISTS "followup_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "admin_conversations" ADD COLUMN IF NOT EXISTS "followup_stage" integer DEFAULT 0 NOT NULL;
ALTER TABLE "admin_conversations" ADD COLUMN IF NOT EXISTS "next_followup_at" timestamp;
