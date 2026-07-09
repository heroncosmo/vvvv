CREATE TABLE IF NOT EXISTS "followup_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"conversation_id" varchar REFERENCES "admin_conversations"("id"),
	"contact_number" text NOT NULL,
	"status" text NOT NULL,
	"message_content" text,
	"executed_at" timestamp DEFAULT now(),
	"error_reason" text
);

CREATE INDEX IF NOT EXISTS "idx_followup_logs_conversation" ON "followup_logs" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_followup_logs_status" ON "followup_logs" ("status");
