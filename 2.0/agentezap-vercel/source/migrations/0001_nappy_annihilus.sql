CREATE TABLE "conversation_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"assigned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"discount_type" text DEFAULT 'fixed_price' NOT NULL,
	"discount_value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"final_price" numeric(10, 2),
	"is_active" boolean DEFAULT true,
	"max_uses" integer,
	"current_uses" integer DEFAULT 0,
	"applicable_plans" jsonb,
	"valid_from" timestamp DEFAULT now(),
	"valid_until" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "daily_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"usage_date" timestamp NOT NULL,
	"prompt_edits_count" integer DEFAULT 0 NOT NULL,
	"simulator_messages_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exclusion_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"followup_exclusion_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "exclusion_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "exclusion_list" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"contact_name" varchar(255),
	"reason" text,
	"exclude_from_followup" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" varchar NOT NULL,
	"user_id" varchar,
	"mp_payment_id" varchar(255),
	"mp_subscription_id" varchar(255),
	"amount" numeric(10, 2) NOT NULL,
	"net_amount" numeric(10, 2),
	"fee_amount" numeric(10, 2),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"status_detail" varchar(100),
	"payment_type" varchar(50) DEFAULT 'recurring' NOT NULL,
	"payment_method" varchar(50),
	"payment_date" timestamp,
	"due_date" timestamp,
	"payer_email" varchar(255),
	"card_last_four_digits" varchar(4),
	"card_brand" varchar(50),
	"raw_response" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT '#6b7280' NOT NULL,
	"icon" varchar(50),
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "followup_configs" ALTER COLUMN "is_enabled" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "share_token" varchar(64);--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "mp_plan_id" varchar(255);--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "valor_primeira_cobranca" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "codigo_personalizado" varchar(50);--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "is_personalizado" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "frequencia_dias" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "trial_dias" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "coupon_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "mp_subscription_id" varchar(255);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "mp_status" varchar(50);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "mp_init_point" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "external_reference" varchar(255);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "next_payment_date" timestamp;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payer_email" varchar(255);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payment_method" varchar(50) DEFAULT 'mercadopago';--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_usage" ADD CONSTRAINT "daily_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusion_config" ADD CONSTRAINT "exclusion_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusion_list" ADD CONSTRAINT "exclusion_list_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conversation_tags_conversation" ON "conversation_tags" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_tags_tag" ON "conversation_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_conversation_tags_unique" ON "conversation_tags" USING btree ("conversation_id","tag_id");--> statement-breakpoint
CREATE INDEX "idx_daily_usage_user_date" ON "daily_usage" USING btree ("user_id","usage_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_daily_usage_unique" ON "daily_usage" USING btree ("user_id","usage_date");--> statement-breakpoint
CREATE INDEX "idx_exclusion_list_user" ON "exclusion_list" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_exclusion_list_phone" ON "exclusion_list" USING btree ("phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_exclusion_list_unique_user_phone" ON "exclusion_list" USING btree ("user_id","phone_number");--> statement-breakpoint
CREATE INDEX "idx_payment_history_subscription" ON "payment_history" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_payment_history_user" ON "payment_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_payment_history_mp_payment" ON "payment_history" USING btree ("mp_payment_id");--> statement-breakpoint
CREATE INDEX "idx_payment_history_status" ON "payment_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payment_history_date" ON "payment_history" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_tags_user_id" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tags_position" ON "tags" USING btree ("position");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tags_unique_name" ON "tags" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_share_token_unique" UNIQUE("share_token");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_codigo_personalizado_unique" UNIQUE("codigo_personalizado");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_external_reference_unique" UNIQUE("external_reference");