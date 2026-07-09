CREATE TABLE "admin_agent_media" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"media_type" varchar(50) NOT NULL,
	"storage_url" text NOT NULL,
	"file_name" varchar(500),
	"file_size" integer,
	"mime_type" varchar(100),
	"duration_seconds" integer,
	"description" text NOT NULL,
	"when_to_use" text,
	"caption" text,
	"transcription" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"send_alone" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar NOT NULL,
	"contact_number" varchar NOT NULL,
	"remote_jid" text,
	"contact_name" varchar,
	"contact_avatar" text,
	"last_message_text" text,
	"last_message_time" timestamp,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"is_agent_enabled" boolean DEFAULT true NOT NULL,
	"followup_active" boolean DEFAULT true NOT NULL,
	"followup_stage" integer DEFAULT 0 NOT NULL,
	"next_followup_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"message_id" varchar NOT NULL,
	"from_me" boolean NOT NULL,
	"text" text,
	"timestamp" timestamp NOT NULL,
	"status" varchar(50),
	"is_from_agent" boolean DEFAULT false NOT NULL,
	"media_type" varchar(50),
	"media_url" text,
	"media_mime_type" varchar(100),
	"media_caption" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_quick_replies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar,
	"title" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"shortcut" varchar(50),
	"category" varchar(50),
	"usage_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_whatsapp_connection" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar NOT NULL,
	"phone_number" varchar,
	"is_connected" boolean DEFAULT false NOT NULL,
	"qr_code" text,
	"session_data" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_whatsapp_connection_admin_id_unique" UNIQUE("admin_id")
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(50) DEFAULT 'admin' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "agent_disabled_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "agent_disabled_conversations_conversation_id_unique" UNIQUE("conversation_id")
);
--> statement-breakpoint
CREATE TABLE "agent_media_library" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"media_type" varchar(20) NOT NULL,
	"storage_url" text NOT NULL,
	"file_name" varchar(255),
	"file_size" integer,
	"mime_type" varchar(100),
	"duration_seconds" integer,
	"description" text NOT NULL,
	"when_to_use" text,
	"caption" text,
	"transcription" text,
	"is_ptt" boolean DEFAULT true,
	"send_alone" boolean DEFAULT false,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0,
	"wapi_media_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_agent_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"prompt" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"model" varchar(100) DEFAULT 'mistral-small-latest' NOT NULL,
	"trigger_phrases" text[],
	"message_split_chars" integer DEFAULT 400,
	"response_delay_seconds" integer DEFAULT 30,
	"fetch_history_on_first_response" boolean DEFAULT false NOT NULL,
	"pause_on_manual_reply" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ai_agent_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "business_agent_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"agent_name" varchar(100) NOT NULL,
	"agent_role" varchar(200) NOT NULL,
	"company_name" varchar(200) NOT NULL,
	"company_description" text,
	"personality" varchar(100) DEFAULT 'profissional e prestativo' NOT NULL,
	"products_services" jsonb DEFAULT '[]'::jsonb,
	"business_info" jsonb DEFAULT '{}'::jsonb,
	"faq_items" jsonb DEFAULT '[]'::jsonb,
	"policies" jsonb DEFAULT '{}'::jsonb,
	"allowed_topics" text[] DEFAULT '{}',
	"prohibited_topics" text[] DEFAULT '{}',
	"allowed_actions" text[] DEFAULT '{}',
	"prohibited_actions" text[] DEFAULT '{}',
	"tone_of_voice" varchar(50) DEFAULT 'amigável' NOT NULL,
	"communication_style" varchar(50) DEFAULT 'claro e direto' NOT NULL,
	"emoji_usage" varchar(20) DEFAULT 'moderado' NOT NULL,
	"formality_level" integer DEFAULT 5 NOT NULL,
	"max_response_length" integer DEFAULT 400 NOT NULL,
	"use_customer_name" boolean DEFAULT true NOT NULL,
	"offer_next_steps" boolean DEFAULT true NOT NULL,
	"escalate_to_human" boolean DEFAULT true NOT NULL,
	"escalation_keywords" text[] DEFAULT '{}',
	"notification_phone_number" varchar,
	"notification_trigger" text,
	"notification_enabled" boolean DEFAULT false NOT NULL,
	"notification_mode" varchar(20) DEFAULT 'ai' NOT NULL,
	"notification_manual_keywords" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"model" varchar(100) DEFAULT 'mistral-small-latest' NOT NULL,
	"trigger_phrases" text[] DEFAULT '{}',
	"template_type" varchar(50),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "business_agent_configs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" varchar NOT NULL,
	"contact_number" varchar NOT NULL,
	"remote_jid" text,
	"jid_suffix" varchar(32) DEFAULT 's.whatsapp.net',
	"contact_name" varchar,
	"contact_avatar" text,
	"last_message_text" text,
	"last_message_time" timestamp,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"followup_active" boolean DEFAULT true NOT NULL,
	"followup_stage" integer DEFAULT 0 NOT NULL,
	"next_followup_at" timestamp,
	"followup_disabled_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "followup_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"intervals_minutes" jsonb DEFAULT '[10,30,180,1440,2880,4320,10080,21600]'::jsonb,
	"business_hours_start" text DEFAULT '09:00',
	"business_hours_end" text DEFAULT '18:00',
	"business_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb,
	"respect_business_hours" boolean DEFAULT true NOT NULL,
	"tone" varchar(50) DEFAULT 'consultivo' NOT NULL,
	"formality_level" integer DEFAULT 5 NOT NULL,
	"use_emojis" boolean DEFAULT true NOT NULL,
	"important_info" jsonb DEFAULT '[]'::jsonb,
	"infinite_loop" boolean DEFAULT true NOT NULL,
	"infinite_loop_min_days" integer DEFAULT 15 NOT NULL,
	"infinite_loop_max_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "followup_configs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "followup_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "followup_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversation_id" varchar,
	"contact_number" text NOT NULL,
	"status" text NOT NULL,
	"message_content" text,
	"executed_at" timestamp DEFAULT now(),
	"error_reason" text
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"message_id" varchar NOT NULL,
	"from_me" boolean NOT NULL,
	"text" text,
	"timestamp" timestamp NOT NULL,
	"status" varchar(50),
	"is_from_agent" boolean DEFAULT false NOT NULL,
	"media_type" varchar(50),
	"media_url" text,
	"media_mime_type" varchar(100),
	"media_duration" integer,
	"media_caption" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" varchar NOT NULL,
	"valor" numeric(10, 2) NOT NULL,
	"pix_code" text NOT NULL,
	"pix_qr_code" text NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"data_pagamento" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(100) NOT NULL,
	"descricao" text,
	"valor" numeric(10, 2) NOT NULL,
	"valor_original" numeric(10, 2),
	"periodicidade" varchar(20) DEFAULT 'mensal' NOT NULL,
	"tipo" varchar(50) DEFAULT 'padrao' NOT NULL,
	"desconto_percent" integer DEFAULT 0,
	"badge" varchar(50),
	"destaque" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"limite_conversas" integer DEFAULT 100 NOT NULL,
	"limite_agentes" integer DEFAULT 1 NOT NULL,
	"caracteristicas" jsonb,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"data_inicio" timestamp,
	"data_fim" timestamp,
	"canais_usados" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chave" varchar(100) NOT NULL,
	"valor" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "system_config_chave_unique" UNIQUE("chave")
);
--> statement-breakpoint
CREATE TABLE "user_followup_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_followup_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversation_id" varchar,
	"user_id" varchar,
	"contact_number" text NOT NULL,
	"status" text NOT NULL,
	"message_content" text,
	"ai_decision" jsonb,
	"stage" integer DEFAULT 0 NOT NULL,
	"executed_at" timestamp DEFAULT now(),
	"error_reason" text
);
--> statement-breakpoint
CREATE TABLE "user_quick_replies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"title" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"shortcut" varchar(50),
	"category" varchar(50),
	"usage_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"name" varchar NOT NULL,
	"phone" varchar NOT NULL,
	"profile_image_url" varchar,
	"role" varchar(50) DEFAULT 'user' NOT NULL,
	"whatsapp_number" varchar,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"phone_number" varchar,
	"is_connected" boolean DEFAULT false NOT NULL,
	"qr_code" text,
	"session_data" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "whatsapp_contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" varchar NOT NULL,
	"contact_id" text NOT NULL,
	"lid" text,
	"phone_number" text,
	"name" varchar(255),
	"img_url" text,
	"last_synced_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "admin_agent_media" ADD CONSTRAINT "admin_agent_media_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_conversations" ADD CONSTRAINT "admin_conversations_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_messages" ADD CONSTRAINT "admin_messages_conversation_id_admin_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."admin_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_quick_replies" ADD CONSTRAINT "admin_quick_replies_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_whatsapp_connection" ADD CONSTRAINT "admin_whatsapp_connection_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_disabled_conversations" ADD CONSTRAINT "agent_disabled_conversations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_media_library" ADD CONSTRAINT "agent_media_library_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_config" ADD CONSTRAINT "ai_agent_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_agent_configs" ADD CONSTRAINT "business_agent_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_connection_id_whatsapp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_configs" ADD CONSTRAINT "followup_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_logs" ADD CONSTRAINT "followup_logs_conversation_id_admin_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."admin_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_followup_logs" ADD CONSTRAINT "user_followup_logs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_followup_logs" ADD CONSTRAINT "user_followup_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_quick_replies" ADD CONSTRAINT "user_quick_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_connection_id_whatsapp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_admin_agent_media_admin_id" ON "admin_agent_media" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "idx_admin_agent_media_name" ON "admin_agent_media" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_admin_agent_media_active" ON "admin_agent_media" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_admin_conversations_admin" ON "admin_conversations" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "idx_admin_conversations_contact" ON "admin_conversations" USING btree ("contact_number");--> statement-breakpoint
CREATE INDEX "idx_admin_messages_conversation" ON "admin_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_admin_messages_timestamp" ON "admin_messages" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_quick_replies_admin" ON "admin_quick_replies" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "idx_quick_replies_shortcut" ON "admin_quick_replies" USING btree ("shortcut");--> statement-breakpoint
CREATE INDEX "idx_agent_media_user_id" ON "agent_media_library" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_media_unique_name" ON "agent_media_library" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "idx_followup_logs_conversation" ON "followup_logs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_followup_logs_status" ON "followup_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_user_followup_logs_conv" ON "user_followup_logs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_user_followup_logs_user" ON "user_followup_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_quick_replies_user" ON "user_quick_replies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_quick_replies_shortcut" ON "user_quick_replies" USING btree ("shortcut");--> statement-breakpoint
CREATE INDEX "idx_contacts_connection_id" ON "whatsapp_contacts" USING btree ("connection_id","contact_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_lid" ON "whatsapp_contacts" USING btree ("lid") WHERE "whatsapp_contacts"."lid" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_contacts_phone" ON "whatsapp_contacts" USING btree ("phone_number") WHERE "whatsapp_contacts"."phone_number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_contacts_unique_connection_contact" ON "whatsapp_contacts" USING btree ("connection_id","contact_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_last_synced" ON "whatsapp_contacts" USING btree ("last_synced_at");