import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, index, uniqueIndex, decimal, uuid, serial, date, numeric } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const attentionPriorityValues = ["critica", "alta", "media", "baixa"] as const;
export type AttentionPriority = (typeof attentionPriorityValues)[number];

export const llmProviderValues = ["mistral", "groq", "openrouter", "nvidia"] as const;
export type LLMProvider = (typeof llmProviderValues)[number];

export const agentLlmConfigModeValues = ["global", "custom"] as const;
export type AgentLlmConfigMode = (typeof agentLlmConfigModeValues)[number];

export const agentLlmConfigSchema = z.object({
  mode: z.enum(agentLlmConfigModeValues).default("global"),
  provider: z.enum(llmProviderValues).optional(),
  mistralApiKey: z.string().optional().nullable(),
  mistralApiKeys: z.array(z.string()).optional().nullable(),
  mistralModel: z.string().optional().nullable(),
  mistralChatEnabled: z.boolean().optional().nullable(),
  groqApiKey: z.string().optional().nullable(),
  groqModel: z.string().optional().nullable(),
  openrouterApiKey: z.string().optional().nullable(),
  openrouterModel: z.string().optional().nullable(),
  openrouterModels: z.array(z.string()).optional().nullable(),
  openrouterProvider: z.string().optional().nullable(),
  nvidiaApiKey: z.string().optional().nullable(),
  nvidiaModel: z.string().optional().nullable(),
  nvidiaModels: z.array(z.string()).optional().nullable(),
});
export type AgentLlmConfig = z.infer<typeof agentLlmConfigSchema>;

// Session storage table (IMPORTANT: mandatory for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (IMPORTANT: mandatory for Supabase Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  name: varchar("name").notNull(),
  phone: varchar("phone").notNull(),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 50 }).default("user").notNull(),
  whatsappNumber: varchar("whatsapp_number"),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  // Reseller reference - se este usuário é cliente de um revendedor
  resellerId: varchar("reseller_id"),
  // Plano atribuído via link de cadastro - sempre mostra apenas este plano na página /plans
  assignedPlanId: varchar("assigned_plan_id"),
  // Assinatura de mensagens (nome/apelido que aparece em negrito no WhatsApp)
  signature: varchar("signature", { length: 100 }),
  signatureEnabled: boolean("signature_enabled").default(false),
  // Campos de suspensão por violação de políticas
  suspendedAt: timestamp("suspended_at"),
  suspensionReason: text("suspension_reason"),
  suspensionType: varchar("suspension_type", { length: 100 }),
  refundedAt: timestamp("refunded_at"),
  refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }),
  gatewayApiEnabled: boolean("gateway_api_enabled").default(false).notNull(),
  gatewayApiTokenHash: text("gateway_api_token_hash"),
  gatewayApiTokenPreview: varchar("gateway_api_token_preview", { length: 64 }),
  gatewayApiLastUsedAt: timestamp("gateway_api_last_used_at"),
  gatewayApiRotatedAt: timestamp("gateway_api_rotated_at"),
  // Documento (CPF/CNPJ) salvo para pagamentos
  documentType: varchar("document_type", { length: 10 }).default("CPF"),
  documentNumber: varchar("document_number", { length: 20 }),
  // Tipo de negócio do usuário (slug da business_categories table)
  businessType: varchar("business_type", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Policy Violations table - Registro de violações de políticas da plataforma
export const policyViolations = pgTable("policy_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  violationType: varchar("violation_type", { length: 100 }).notNull(), // religious_services, adult_content, illegal_activities, etc.
  description: text("description"),
  evidence: jsonb("evidence"), // Array de evidências (mensagens, prints, etc.)
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, confirmed, dismissed
  resultedInSuspension: boolean("resulted_in_suspension").default(false),
  adminId: varchar("admin_id"), // Admin que revisou
  internalNotes: text("internal_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// TEAM MEMBERS - Sistema de Membros/Funcionários
// Permite ao dono da conta cadastrar funcionários que podem responder clientes
// =============================================================================

export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Dono da conta (usuário principal do SaaS)
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Informações do membro
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  
  // Cargo/Função (ex: vendedor, atendente, suporte)
  role: varchar("role", { length: 100 }).default("atendente").notNull(),
  
  // Permissões
  permissions: jsonb("permissions").$type<{
    canViewConversations: boolean;
    canSendMessages: boolean;
    canUseQuickReplies: boolean;
    canMoveKanban: boolean;
    canViewDashboard: boolean;
    canViewAgenda: boolean;
    canEditContacts: boolean;
    canViewPhoneNumbers: boolean;
  }>().default({
    canViewConversations: true,
    canSendMessages: true,
    canUseQuickReplies: true,
    canMoveKanban: true,
    canViewDashboard: false,
    canViewAgenda: false,
    canEditContacts: false,
    canViewPhoneNumbers: false,
  }),
  
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  lastLoginAt: timestamp("last_login_at"),
  
  // Avatar/Foto
  avatarUrl: text("avatar_url"),
  
  // Assinatura de mensagens (nome/apelido que aparece em negrito no WhatsApp)
  signature: varchar("signature", { length: 100 }),
  signatureEnabled: boolean("signature_enabled").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_team_members_owner").on(table.ownerId),
  index("idx_team_members_email").on(table.email),
  uniqueIndex("idx_team_members_unique_email_owner").on(table.ownerId, table.email),
]);

// Sessões de membros da equipe (login separado)
export const teamMemberSessions = pgTable("team_member_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => teamMembers.id, { onDelete: 'cascade' }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_team_member_sessions_member").on(table.memberId),
  index("idx_team_member_sessions_token").on(table.token),
]);

// Agents table - agentes com prompt personalizavel para conexoes multiplas
export const agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  prompt: text("prompt").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_agents_name").on(table.name),
  index("idx_agents_active").on(table.isActive),
]);

// WhatsApp connections table
export const whatsappConnections = pgTable("whatsapp_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  agentId: varchar("agent_id").references(() => agents.id, { onDelete: 'set null' }),
  phoneNumber: varchar("phone_number"),
  isConnected: boolean("is_connected").default(false).notNull(),
  qrCode: text("qr_code"),
  sessionData: jsonb("session_data"),
  provider: varchar("provider", { length: 50 }).default("baileys").notNull(),
  connectionMethod: varchar("connection_method", { length: 50 }).default("qr").notNull(),
  providerStatus: varchar("provider_status", { length: 50 }).default("inactive").notNull(),
  providerConfig: jsonb("provider_config").$type<Record<string, unknown> | null>(),
  // 🛡️ SAFE MODE: Modo seguro anti-bloqueio
  // Quando ativado pelo admin, ao reconectar via QR Code:
  // 1. Zera todos os follow-ups pendentes
  // 2. Zera a fila de mensagens em memória
  // 3. Começa do zero para evitar novo bloqueio
  safeModeEnabled: boolean("safe_mode_enabled").default(false).notNull(),
  safeModeActivatedAt: timestamp("safe_mode_activated_at"),
  safeModeActivatedBy: varchar("safe_mode_activated_by", { length: 255 }),
  safeModeLastCleanupAt: timestamp("safe_mode_last_cleanup_at"),
  // Multi-connection fields
  connectionName: varchar("connection_name", { length: 255 }),
  connectionType: varchar("connection_type", { length: 50 }).default("primary"),
  isPrimary: boolean("is_primary").default(true),
  // Per-connection AI toggle: when false, AI doesn't auto-respond on this number
  // but CRM features (conversations, manual replies, etc.) still work
  aiEnabled: boolean("ai_enabled").default(true).notNull(),
  publicApiEnabled: boolean("public_api_enabled").default(false).notNull(),
  publicApiTokenHash: text("public_api_token_hash"),
  publicApiTokenPreview: varchar("public_api_token_preview", { length: 64 }),
  publicApiLastUsedAt: timestamp("public_api_last_used_at"),
  publicApiRotatedAt: timestamp("public_api_rotated_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// CONTACT LISTS - Sistema de Listas de Contatos para Envio em Massa
// Persistido no banco para não perder dados em restart
// =============================================================================
export const contactLists = pgTable("contact_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Array de contatos em JSONB para flexibilidade
  contacts: jsonb("contacts").$type<Array<{
    id: string;
    name: string;
    phone: string;
  }>>().default([]),
  // Contagem de contatos (denormalizado para performance)
  contactCount: integer("contact_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_contact_lists_user").on(table.userId),
  index("idx_contact_lists_created").on(table.createdAt),
]);

export const insertContactListSchema = createInsertSchema(contactLists);
export type ContactList = typeof contactLists.$inferSelect;
export type InsertContactList = z.infer<typeof insertContactListSchema>;

// WhatsApp Contacts Cache table (FIX LID 2025 - Persistent storage)
// Armazena mapeamento de @lid → phoneNumber para contatos do Instagram/Facebook
export const whatsappContacts = pgTable("whatsapp_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Connection que possui este contato
  connectionId: varchar("connection_id")
    .notNull()
    .references(() => whatsappConnections.id, { onDelete: "cascade" }),
  // JID principal do contato (pode ser @s.whatsapp.net ou @lid)
  contactId: text("contact_id").notNull(),
  // LID do contato (se vier de Instagram/Facebook Business)
  // Exemplo: "153519764074616@lid"
  lid: text("lid"),
  // Número de telefone real do contato (formato: numero@s.whatsapp.net)
  // Exemplo: "5511987654321@s.whatsapp.net"
  // ESTE É O CAMPO CRÍTICO para resolver @lid → número real
  phoneNumber: text("phone_number"),
  // Nome do contato (push name do WhatsApp)
  name: varchar("name", { length: 255 }),
  // URL da foto de perfil (opcional)
  imgUrl: text("img_url"),
  // Última sincronização com Baileys (para auditoria)
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // ÍNDICE COMPOSTO: Busca rápida por connectionId + contactId
  index("idx_contacts_connection_id").on(table.connectionId, table.contactId),
  // ÍNDICE: Busca rápida por LID (principal use case: resolver @lid)
  index("idx_contacts_lid").on(table.lid).where(sql`${table.lid} IS NOT NULL`),
  // ÍNDICE: Busca por phoneNumber para lookups reversos
  index("idx_contacts_phone").on(table.phoneNumber).where(sql`${table.phoneNumber} IS NOT NULL`),
  // UNIQUE CONSTRAINT: Um contato por connectionId (evita duplicatas)
  // Permite upsert sem conflitos
  uniqueIndex("idx_contacts_unique_connection_contact").on(table.connectionId, table.contactId),
  // ÍNDICE: Cleanup de contatos antigos (data retention)
  index("idx_contacts_last_synced").on(table.lastSyncedAt),
]);

// Conversations table
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id")
    .notNull()
    .references(() => whatsappConnections.id, { onDelete: "cascade" }),
  contactNumber: varchar("contact_number").notNull(),
  ownerPhoneNumber: text("owner_phone_number"),
  ownerPhoneVerifiedAt: timestamp("owner_phone_verified_at"),
  ownerPhoneSource: text("owner_phone_source"),
  // JID completo original do WhatsApp (ex: 5517912345678@s.whatsapp.net ou 254635809968349:20@lid)
  // SEMPRE usar este campo ao enviar mensagens de volta!
  remoteJid: text("remote_jid"),
  // Sufixo/domínio do JID usado para enviar mensagens (ex: s.whatsapp.net, lid)
  jidSuffix: varchar("jid_suffix", { length: 32 }).default("s.whatsapp.net"),
  contactName: varchar("contact_name"),
  // URL da foto de perfil do contato (Base64 ou URL do Baileys)
  contactAvatar: text("contact_avatar"),
  lastMessageText: text("last_message_text"),
  lastMessageTime: timestamp("last_message_time"),
  lastMessageFromMe: boolean("last_message_from_me"),
  unreadCount: integer("unread_count").default(0).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  // Flag para rastrear se a conversa já foi respondida alguma vez pelo atendente
  hasReplied: boolean("has_replied").default(false).notNull(),
  // Follow-up Inteligente
  followupActive: boolean("followup_active").default(true).notNull(),
  followupStage: integer("followup_stage").default(0).notNull(),
  nextFollowupAt: timestamp("next_followup_at"),
  followupDisabledReason: text("followup_disabled_reason"),
  // Token único para compartilhar conversa via URL
  shareToken: varchar("share_token", { length: 64 }).unique(),
  // CRM Kanban
  kanbanStageId: varchar("kanban_stage_id"),
  kanbanNotes: text("kanban_notes"),
  priority: varchar("priority").default("normal"),
  attentionPriority: varchar("attention_priority", { length: 16 }),
  attentionReason: text("attention_reason"),
  attentionConfidence: numeric("attention_confidence", { precision: 4, scale: 2 }),
  needsHumanAttention: boolean("needs_human_attention").default(false).notNull(),
  attentionQualifiedAt: timestamp("attention_qualified_at"),
  sectorId: varchar("sector_id").references(() => sectors.id, { onDelete: "set null" }),
  assignedToMemberId: varchar("assigned_to_member_id").references(() => teamMembers.id, { onDelete: "set null" }),
  routingIntent: varchar("routing_intent", { length: 100 }),
  routingConfidence: decimal("routing_confidence", { precision: 3, scale: 2 }),
  routingAt: timestamp("routing_at"),
  orchestrationMode: varchar("orchestration_mode", { length: 32 }).default("ai").notNull(),
  handoffReason: text("handoff_reason"),
  handedOffAt: timestamp("handed_off_at"),
  handedOffBy: varchar("handed_off_by", { length: 255 }),
  // Ticket/Chamado - Encerramento (Fase 4.2)
  isClosed: boolean("is_closed").default(false).notNull(),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by", { length: 255 }), // userId or 'system'
  closureReason: text("closure_reason"),
  ticketNumber: varchar("ticket_number", { length: 50 }), // Optional ticket reference
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_conversations_owner_phone_number").on(table.ownerPhoneNumber),
  index("idx_conversations_connection_owner_phone").on(table.connectionId, table.ownerPhoneNumber),
  index("idx_conversations_attention_state").on(table.connectionId, table.needsHumanAttention, table.lastMessageTime),
  index("idx_conversations_attention_priority").on(table.connectionId, table.attentionPriority, table.attentionQualifiedAt),
]);

// Messages table
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  messageId: varchar("message_id").notNull(),
  fromMe: boolean("from_me").notNull(),
  text: text("text"),
  timestamp: timestamp("timestamp").notNull(),
  status: varchar("status", { length: 50 }),
  isFromAgent: boolean("is_from_agent").default(false).notNull(),
  // Media fields
  mediaType: varchar("media_type", { length: 50 }), // 'image', 'audio', 'video', 'document'
  mediaUrl: text("media_url"), // URL or base64 data (Supabase Storage)
  mediaMimeType: varchar("media_mime_type", { length: 100 }),
  mediaDuration: integer("media_duration"), // Duration in seconds for audio/video
  mediaCaption: text("media_caption"), // Caption for media
  // Re-download metadata (para baixar mídia novamente do WhatsApp)
  mediaKey: text("media_key"), // Chave de descriptografia (base64)
  directPath: text("direct_path"), // Caminho direto no servidor WhatsApp
  mediaUrlOriginal: text("media_url_original"), // URL original do WhatsApp
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversationLeadIntelligence = pgTable("conversation_lead_intelligence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id")
    .notNull()
    .unique()
    .references(() => conversations.id, { onDelete: "cascade" }),
  connectionId: varchar("connection_id")
    .notNull()
    .references(() => whatsappConnections.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  contactNumber: varchar("contact_number").notNull(),
  contactName: varchar("contact_name"),
  isPotential: boolean("is_potential").default(false).notNull(),
  potentialScore: integer("potential_score").default(0).notNull(),
  potentialGrade: varchar("potential_grade", { length: 32 }).default("baixo").notNull(),
  businessType: varchar("business_type", { length: 255 }),
  personaType: varchar("persona_type", { length: 255 }),
  summary: text("summary"),
  qualificationReason: text("qualification_reason"),
  evidenceJson: jsonb("evidence_json").$type<string[]>().default([]).notNull(),
  recommendedApproach: text("recommended_approach"),
  recommendedMessage: text("recommended_message"),
  confidence: integer("confidence").default(0).notNull(),
  catalogIsQualified: boolean("catalog_is_qualified").default(false).notNull(),
  catalogScore: integer("catalog_score").default(0).notNull(),
  catalogGrade: varchar("catalog_grade", { length: 32 }).default("baixo").notNull(),
  catalogSegment: varchar("catalog_segment", { length: 255 }),
  catalogPersona: varchar("catalog_persona", { length: 255 }),
  catalogRegion: varchar("catalog_region", { length: 255 }),
  catalogStage: varchar("catalog_stage", { length: 64 }),
  catalogSummary: text("catalog_summary"),
  catalogNeedSummary: text("catalog_need_summary"),
  catalogBuyerFitSummary: text("catalog_buyer_fit_summary"),
  catalogSignalsJson: jsonb("catalog_signals_json").$type<string[]>().default([]).notNull(),
  catalogConfidence: integer("catalog_confidence").default(0).notNull(),
  catalogLastAnalyzedAt: timestamp("catalog_last_analyzed_at"),
  adminStatus: varchar("admin_status", { length: 32 }).default("new").notNull(),
  campaignCount: integer("campaign_count").default(0).notNull(),
  lastCampaignAt: timestamp("last_campaign_at"),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  lastCustomerMessage: text("last_customer_message"),
  lastAgentMessage: text("last_agent_message"),
  awaitingContactReply: boolean("awaiting_contact_reply").default(false).notNull(),
  pendingReplyMessage: text("pending_reply_message"),
  lastGeneratedMessage: text("last_generated_message"),
  lastGeneratedAt: timestamp("last_generated_at"),
  rawAnalysis: jsonb("raw_analysis").$type<Record<string, unknown>>().default({}).notNull(),
  analysisVersion: varchar("analysis_version", { length: 64 }).default("lead-intel-v1").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_conversation_lead_intelligence_user").on(table.userId),
  index("idx_conversation_lead_intelligence_potential").on(table.isPotential, table.potentialGrade),
  index("idx_conversation_lead_intelligence_catalog").on(table.catalogIsQualified, table.catalogGrade, table.catalogStage),
  index("idx_conversation_lead_intelligence_status").on(table.adminStatus, table.lastAnalyzedAt),
]);

export const courseSchedulingInsights = pgTable("course_scheduling_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id")
    .notNull()
    .unique()
    .references(() => conversations.id, { onDelete: "cascade" }),
  connectionId: varchar("connection_id")
    .notNull()
    .references(() => whatsappConnections.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  contactNumber: varchar("contact_number").notNull(),
  contactName: varchar("contact_name"),
  status: varchar("status", { length: 32 }).default("not_scheduled").notNull(),
  agreedSchedule: text("agreed_schedule"),
  summary: text("summary"),
  evidenceJson: jsonb("evidence_json").$type<string[]>().default([]).notNull(),
  confidence: integer("confidence").default(0).notNull(),
  lastCustomerMessage: text("last_customer_message"),
  lastAgentMessage: text("last_agent_message"),
  lastScheduledAt: timestamp("last_scheduled_at"),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  rawAnalysis: jsonb("raw_analysis").$type<Record<string, unknown>>().default({}).notNull(),
  analysisVersion: varchar("analysis_version", { length: 64 }).default("course-scheduling-v1").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_course_scheduling_insights_user").on(table.userId),
  index("idx_course_scheduling_insights_status").on(table.status, table.lastScheduledAt),
  index("idx_course_scheduling_insights_connection").on(table.connectionId),
]);

// Ticket Closure Logs table - Audit trail for conversation closures (Fase 4.2)
export const ticketClosureLogs = pgTable("ticket_closure_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  action: varchar("action", { length: 50 }).notNull(), // 'closed', 'reopened'
  performedBy: varchar("performed_by", { length: 255 }).notNull(), // userId or 'system'
  performedByName: varchar("performed_by_name", { length: 255 }), // Display name
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ticket_closure_logs_conversation").on(table.conversationId),
  index("idx_ticket_closure_logs_created_at").on(table.createdAt),
]);

// AI Agent Configuration table (LEGACY - mantido para backward compatibility)
export const aiAgentConfig = pgTable("ai_agent_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  prompt: text("prompt").notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  model: varchar("model", { length: 100 }).default("openai/gpt-oss-20b").notNull(), // CORRIGIDO: usar modelo do OpenRouter
  llmConfig: jsonb("llm_config").$type<AgentLlmConfig>().default({ mode: "global" }).notNull(),
  triggerPhrases: text("trigger_phrases").array(),
  messageSplitChars: integer("message_split_chars").default(400),
  responseDelaySeconds: integer("response_delay_seconds").default(30), // Tempo de espera antes de responder (acumulação de mensagens)
  fetchHistoryOnFirstResponse: boolean("fetch_history_on_first_response").default(false).notNull(), // Buscar histórico do WhatsApp ao responder pela primeira vez
  pauseOnManualReply: boolean("pause_on_manual_reply").default(true).notNull(), // Pausar IA automaticamente quando dono responde manualmente
  autoReactivateMinutes: integer("auto_reactivate_minutes"), // Tempo em minutos para reativar IA automaticamente (NULL = nunca)
  // PARTE 5 - Modo Fluxo: chatbot com roteiro pré-definido
  flowScript: text("flow_script"), // Roteiro/prompt de fluxo em texto livre
  flowModeActive: boolean("flow_mode_active").default(false).notNull(), // Se TRUE, IA segue estritamente o roteiro (sem improviso)
  // PARTE 6 - Saudação personalizada e endereço fixo
  customGreeting: text("custom_greeting"), // Saudação fixa, suporta {nome}. NULL = IA improvisa
  customAddress: text("custom_address"), // Endereço fixo do negócio. NULL = não informar
  greetingVariation: boolean("greeting_variation").default(false).notNull(), // Se TRUE, IA varia a saudação naturalmente
  greetingEnabled: boolean("greeting_enabled").default(false).notNull(), // Se TRUE, saudação personalizada está ATIVA
  aiSignatureEnabled: boolean("ai_signature_enabled").default(false).notNull(), // Se TRUE, respostas de texto da IA saem com assinatura
  aiSignature: varchar("ai_signature", { length: 100 }), // Nome exibido antes de cada mensagem da IA
  addressEnabled: boolean("address_enabled").default(false).notNull(), // Se TRUE, endereço fixo está ATIVO
  // PARTE 7 - Horário de funcionamento
  businessHoursEnabled: boolean("business_hours_enabled").default(false).notNull(), // Se TRUE, horário de funcionamento está ATIVO
  businessHours: jsonb("business_hours").$type<Record<string, { enabled: boolean; open: string; close: string }>>().default({
    seg: { enabled: true, open: "09:00", close: "18:00" },
    ter: { enabled: true, open: "09:00", close: "18:00" },
    qua: { enabled: true, open: "09:00", close: "18:00" },
    qui: { enabled: true, open: "09:00", close: "18:00" },
    sex: { enabled: true, open: "09:00", close: "18:00" },
    sab: { enabled: false, open: "", close: "" },
    dom: { enabled: false, open: "", close: "" },
  }),
  // PARTE 8 - Mensagem fora do horário
  offHoursMessageEnabled: boolean("off_hours_message_enabled").default(false).notNull(),
  offHoursVariation: boolean("off_hours_variation").default(false).notNull(),
  offHoursMessage: text("off_hours_message").default("Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve!"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Agent Media Library table (NEW - Sistema de mídias do agente)
// Cada agente pode ter áudios, imagens, vídeos que o Mistral decide quando enviar
export const agentMediaLibrary = pgTable("agent_media_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Identificação da mídia (usado no prompt para o Mistral)
  name: varchar("name", { length: 100 }).notNull(), // Ex: "AUDIO_PRECO", "IMG_BOAS_VINDAS"
  
  // Tipo da mídia
  mediaType: varchar("media_type", { length: 20 }).notNull(), // 'audio', 'image', 'video', 'document', 'flow'
  
  // Armazenamento
  storageUrl: text("storage_url").notNull().default(''), // URL pública ou base64 (vazio para tipo 'flow')
  fileName: varchar("file_name", { length: 255 }),
  fileSize: integer("file_size"), // Tamanho em bytes
  mimeType: varchar("mime_type", { length: 100 }),
  durationSeconds: integer("duration_seconds"), // Duração para áudio/vídeo
  
  // Contexto para o Mistral (CRÍTICO)
  description: text("description").notNull(), // "Explica o preço do produto X" - usado pela IA para decidir
  whenToUse: text("when_to_use"), // "Quando o cliente perguntar sobre preço"
  caption: text("caption"), // Legenda que vai junto com a imagem/vídeo no WhatsApp
  transcription: text("transcription"), // Transcrição automática de áudios
  
  // Opções de áudio
  isPtt: boolean("is_ptt").default(true), // PTT = Push-to-talk (mensagem de voz gravada)
  
  // Opção de envio combinado
  sendAlone: boolean("send_alone").default(false), // true = enviar sozinha, false = pode ser combinada com outras
  suppressTextResponse: boolean("suppress_text_response").default(false),
  
  // === FLUXO DE MÍDIA (PARTE 6) ===
  // Sequência ordenada de itens (mídia + texto) para envio em ordem exata
  // Cada item: { type: 'media'|'text', storageUrl?, mediaType?, caption?, text?, fileName?, mimeType? }
  flowItems: jsonb("flow_items").$type<Array<{
    id: string;           // UUID único do item no fluxo
    order: number;        // Posição na sequência (0-based)
    type: 'media' | 'text'; // Tipo do bloco
    // Campos para type='media':
    storageUrl?: string;
    mediaType?: 'audio' | 'image' | 'video' | 'document';
    caption?: string;
    fileName?: string;
    mimeType?: string;
    // Campos para type='text':
    text?: string;
  }>>(),
  
  // Ordenação e status
  isActive: boolean("is_active").default(true).notNull(),
  displayOrder: integer("display_order").default(0),
  
  // W-API integration
  wapiMediaId: varchar("wapi_media_id", { length: 255 }),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_agent_media_user_id").on(table.userId),
  uniqueIndex("idx_agent_media_unique_name").on(table.userId, table.name),
]);

// Business Agent Configuration table (NEW - Sistema avançado de configuração)
export const businessAgentConfigs = pgTable("business_agent_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  
  // Identity Layer
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  agentRole: varchar("agent_role", { length: 200 }).notNull(),
  companyName: varchar("company_name", { length: 200 }).notNull(),
  companyDescription: text("company_description"),
  personality: varchar("personality", { length: 100 }).default("profissional e prestativo").notNull(),
  
  // Knowledge Layer (JSONB para flexibilidade)
  productsServices: jsonb("products_services").$type<Array<{
    name: string;
    description: string;
    price?: string;
    features?: string[];
  }>>().default([]),
  businessInfo: jsonb("business_info").$type<{
    horarioFuncionamento?: string;
    endereco?: string;
    telefone?: string;
    email?: string;
    website?: string;
    redesSociais?: Record<string, string>;
    formasContato?: string[];
    metodosEntrega?: string[];
  }>().default({}),
  faqItems: jsonb("faq_items").$type<Array<{
    pergunta: string;
    resposta: string;
    categoria?: string;
  }>>().default([]),
  policies: jsonb("policies").$type<{
    trocasDevolucoes?: string;
    garantia?: string;
    privacidade?: string;
    termos?: string;
  }>().default({}),
  
  // Guardrails Layer
  allowedTopics: text("allowed_topics").array().default([]),
  prohibitedTopics: text("prohibited_topics").array().default([]),
  allowedActions: text("allowed_actions").array().default([]),
  prohibitedActions: text("prohibited_actions").array().default([]),
  
  // Personality Layer
  toneOfVoice: varchar("tone_of_voice", { length: 50 }).default("amigável").notNull(),
  communicationStyle: varchar("communication_style", { length: 50 }).default("claro e direto").notNull(),
  emojiUsage: varchar("emoji_usage", { length: 20 }).default("moderado").notNull(), // nunca, raro, moderado, frequente
  formalityLevel: integer("formality_level").default(5).notNull(), // 1-10 scale
  
  // Behavior Configuration
  maxResponseLength: integer("max_response_length").default(400).notNull(),
  useCustomerName: boolean("use_customer_name").default(true).notNull(),
  offerNextSteps: boolean("offer_next_steps").default(true).notNull(),
  escalateToHuman: boolean("escalate_to_human").default(true).notNull(),
  escalationKeywords: text("escalation_keywords").array().default([]),
  
  // Notification System
  notificationPhoneNumber: varchar("notification_phone_number"),
  notificationTrigger: text("notification_trigger"), // "Notify me when..."
  notificationEnabled: boolean("notification_enabled").default(false).notNull(),
  notificationMode: varchar("notification_mode", { length: 20 }).default("ai").notNull(), // "ai" | "manual" | "both"
  notificationManualKeywords: text("notification_manual_keywords"), // Comma-separated keywords for manual mode

  // System Configuration
  isActive: boolean("is_active").default(false).notNull(),
  model: varchar("model", { length: 100 }).default("openai/gpt-oss-20b").notNull(), // CORRIGIDO: usar modelo do OpenRouter
  triggerPhrases: text("trigger_phrases").array().default([]),
  templateType: varchar("template_type", { length: 50 }), // ecommerce, professional, health, education, realestate
  
  // Metadata
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Agent disabled conversations table
export const agentDisabledConversations = pgTable("agent_disabled_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().unique().references(() => conversations.id, { onDelete: 'cascade' }),
  // Auto-reactivation timer fields
  ownerLastReplyAt: timestamp("owner_last_reply_at").defaultNow(), // Quando o dono respondeu pela última vez
  autoReactivateAfterMinutes: integer("auto_reactivate_after_minutes"), // NULL = nunca, número = minutos para reativar
  clientHasPendingMessage: boolean("client_has_pending_message").default(false), // Cliente enviou mensagem após pausa?
  clientLastMessageAt: timestamp("client_last_message_at"), // Quando cliente enviou última mensagem
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// 🌐 WEBSITE IMPORTS - Sistema de importação de dados de websites
// Permite ao cliente alimentar o agente com produtos/preços/info de seu site
// ============================================================================
export const websiteImports = pgTable("website_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Informações do website
  websiteUrl: text("website_url").notNull(),
  websiteName: varchar("website_name", { length: 255 }),
  websiteDescription: text("website_description"),
  
  // Conteúdo extraído
  extractedHtml: text("extracted_html"), // HTML bruto (limitado)
  extractedText: text("extracted_text"), // Texto limpo extraído
  
  // Dados estruturados extraídos pelo Mistral
  extractedProducts: jsonb("extracted_products").$type<Array<{
    name: string;
    description?: string;
    price?: string;
    priceValue?: number;
    currency?: string;
    category?: string;
    imageUrl?: string;
    availability?: string;
    features?: string[];
  }>>().default([]),
  
  extractedInfo: jsonb("extracted_info").$type<{
    businessName?: string;
    businessDescription?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    workingHours?: string;
    socialMedia?: Record<string, string>;
    paymentMethods?: string[];
    shippingInfo?: string;
    returnPolicy?: string;
    categories?: string[];
  }>().default({}),
  
  // Contexto formatado para o agente (pronto para usar no prompt)
  formattedContext: text("formatted_context"),
  
  // Status e controle
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, processing, completed, failed
  errorMessage: text("error_message"),
  pagesScraped: integer("pages_scraped").default(0),
  productsFound: integer("products_found").default(0),
  
  // Se o contexto foi aplicado ao prompt do agente
  appliedToPrompt: boolean("applied_to_prompt").default(false),
  appliedAt: timestamp("applied_at"),
  
  // Metadata
  lastScrapedAt: timestamp("last_scraped_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_website_imports_user_id").on(table.userId),
  index("idx_website_imports_status").on(table.status),
]);

// Admins table
export const admins = pgTable("admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 50 }).default("admin").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin WhatsApp connection table
export const adminWhatsappConnection = pgTable("admin_whatsapp_connection", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().unique().references(() => admins.id, { onDelete: 'cascade' }),
  phoneNumber: varchar("phone_number"),
  isConnected: boolean("is_connected").default(false).notNull(),
  qrCode: text("qr_code"),
  sessionData: jsonb("session_data"),
  aiEnabled: boolean("ai_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin Conversations table - Conversas do WhatsApp do admin com clientes do sistema
export const adminConversations = pgTable("admin_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => admins.id, { onDelete: 'cascade' }),
  contactNumber: varchar("contact_number").notNull(),
  remoteJid: text("remote_jid"),
  contactName: varchar("contact_name"),
  contactAvatar: text("contact_avatar"),
  lastMessageText: text("last_message_text"),
  lastMessageTime: timestamp("last_message_time"),
  unreadCount: integer("unread_count").default(0).notNull(),
  // Controle de IA - se false, admin responde manualmente
  isAgentEnabled: boolean("is_agent_enabled").default(true).notNull(),

  // Follow-up System
  followupActive: boolean("followup_active").default(true).notNull(),
  followupStage: integer("followup_stage").default(0).notNull(),
  nextFollowupAt: timestamp("next_followup_at"),

  // 🛡️ FOLLOW-UP FOR NON-PAYERS
  paymentStatus: varchar("payment_status", { length: 50 }).default("pending").notNull(), // paid, unpaid, pending
  followupForNonPayers: boolean("followup_for_non_payers").default(true).notNull(), // Toggle for non-payer follow-up
  followupConfig: jsonb("followup_config").$type<{
    enabled: boolean;
    maxAttempts: number;
    intervalsMinutes: number[];
    finalMinDays: number;
    finalMaxDays: number;
    businessHoursStart: string;
    businessHoursEnd: string;
    respectBusinessHours: boolean;
    tone: string;
    formalityLevel: number;
    useEmojis: boolean;
  }>().default({
    enabled: true,
    maxAttempts: 8,
    intervalsMinutes: [10, 30, 180, 1440, 4320, 10080, 259200, 432000], // 10m, 30m, 3h, 24h, 48h, 3d, 7d, 15d
    finalMinDays: 15,
    finalMaxDays: 30,
    businessHoursStart: "09:00",
    businessHoursEnd: "18:00",
    respectBusinessHours: true,
    tone: "friendly",
    formalityLevel: 3,
    useEmojis: true,
  }),

  // 🧠 MEMÓRIA PERSISTIDA POR CONVERSA  
  contextState: jsonb("context_state").$type<{
    mode?: string;
    pendingSlot?: string;
    capturedSlots?: Record<string, string>;
    lastIntent?: string;
    lastQuestionAnswered?: string;
    pendingPaymentMethod?: string;
    awaitingProof?: boolean;
    quotaConsumedThisTurn?: boolean;
    nextResumePrompt?: string;
  }>().default({}),
  memorySummary: text("memory_summary"),
  linkedUserId: varchar("linked_user_id"),
  lastTestToken: text("last_test_token"),
  lastSuccessfulAction: text("last_successful_action"),
  pendingSlot: text("pending_slot"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_admin_conversations_admin").on(table.adminId),
  index("idx_admin_conversations_contact").on(table.contactNumber),
]);

// Admin Messages table - Mensagens das conversas do admin
export const adminMessages = pgTable("admin_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => adminConversations.id, { onDelete: 'cascade' }),
  messageId: varchar("message_id").notNull(),
  fromMe: boolean("from_me").notNull(),
  text: text("text"),
  timestamp: timestamp("timestamp").notNull(),
  status: varchar("status", { length: 50 }),
  isFromAgent: boolean("is_from_agent").default(false).notNull(),
  // Media fields
  mediaType: varchar("media_type", { length: 50 }),
  mediaUrl: text("media_url"),
  mediaMimeType: varchar("media_mime_type", { length: 100 }),
  mediaCaption: text("media_caption"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_admin_messages_conversation").on(table.conversationId),
  index("idx_admin_messages_timestamp").on(table.timestamp),
]);

// Admin Agent Media table
export const adminAgentMedia = pgTable("admin_agent_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => admins.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  mediaType: varchar("media_type", { length: 50 }).notNull(),
  storageUrl: text("storage_url").notNull(),
  fileName: varchar("file_name", { length: 500 }),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  durationSeconds: integer("duration_seconds"),
  description: text("description").notNull(),
  whenToUse: text("when_to_use"),
  caption: text("caption"),
  transcription: text("transcription"),
  isActive: boolean("is_active").default(true).notNull(),
  isReferralSupport: boolean("is_referral_support").default(false).notNull(),
  sendAlone: boolean("send_alone").default(true).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_admin_agent_media_admin_id").on(table.adminId),
  index("idx_admin_agent_media_name").on(table.name),
  index("idx_admin_agent_media_active").on(table.isActive),
]);

// Media Flows table - sequencias de midias por agente
export const mediaFlows = pgTable("media_flows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_media_flows_agent").on(table.agentId),
  index("idx_media_flows_active").on(table.isActive),
]);

// Media Flow Items table - itens de midia em ordem com delays
export const mediaFlowItems = pgTable("media_flow_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flowId: varchar("flow_id").notNull().references(() => mediaFlows.id, { onDelete: "cascade" }),
  mediaId: varchar("media_id", { length: 255 }),
  mediaName: varchar("media_name", { length: 255 }).notNull(),
  mediaType: varchar("media_type", { length: 50 }).notNull(),
  storageUrl: text("storage_url").notNull(),
  caption: text("caption"),
  delaySeconds: integer("delay_seconds").default(0).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_media_flow_items_flow").on(table.flowId),
  index("idx_media_flow_items_order").on(table.flowId, table.displayOrder),
]);

// Plans table
export const plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nome: varchar("nome", { length: 100 }).notNull(),
  descricao: text("descricao"), // Descrição detalhada do plano
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  valorOriginal: decimal("valor_original", { precision: 10, scale: 2 }), // Valor antes do desconto (se houver)
  periodicidade: varchar("periodicidade", { length: 20 }).default("mensal").notNull(), // mensal, anual
  tipo: varchar("tipo", { length: 50 }).default("padrao").notNull(), // padrao, anual, implementacao, personalizado
  descontoPercent: integer("desconto_percent").default(0), // Percentual de desconto
  badge: varchar("badge", { length: 50 }), // Ex: "Mais Popular", "5% OFF", etc
  ctaTexto: varchar("cta_texto", { length: 120 }), // Texto do botao na vitrine publica
  destaque: boolean("destaque").default(false).notNull(), // Plano em destaque
  ordem: integer("ordem").default(0).notNull(), // Ordem de exibição
  limiteConversas: integer("limite_conversas").default(100).notNull(),
  exibirNaPaginaPlanos: boolean("exibir_na_pagina_planos").default(false).notNull(),
  limiteAgentes: integer("limite_agentes").default(1).notNull(),
  caracteristicas: jsonb("caracteristicas").$type<string[]>(), // Lista de features do plano
  ativo: boolean("ativo").default(true).notNull(),
  // Mercado Pago fields
  mpPlanId: varchar("mp_plan_id", { length: 255 }), // ID do plano no Mercado Pago
  valorPrimeiraCobranca: decimal("valor_primeira_cobranca", { precision: 10, scale: 2 }), // Valor diferente na primeira cobrança
  codigoPersonalizado: varchar("codigo_personalizado", { length: 50 }).unique(), // Código para planos personalizados
  isPersonalizado: boolean("is_personalizado").default(false), // Se é um plano personalizado
  frequenciaDias: integer("frequencia_dias").default(30), // Frequência de cobrança em dias
  trialDias: integer("trial_dias").default(0), // Dias de trial gratuito
  // Link único para cadastro - quando cliente entra por este link, só vê este plano
  linkSlug: varchar("link_slug", { length: 100 }).unique(), // Slug único para URL ex: plano-mensal-abc123
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: varchar("plan_id").notNull().references(() => plans.id, { onDelete: 'cascade' }),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, active, expired, cancelled, paused
  dataInicio: timestamp("data_inicio"),
  dataFim: timestamp("data_fim"),
  pendingReceipt: boolean("pending_receipt").default(false).notNull(),
  canaisUsados: integer("canais_usados").default(0).notNull(),
  referralCode: varchar("referral_code", { length: 120 }),
  referralWalletAppliedAmount: decimal("referral_wallet_applied_amount", { precision: 10, scale: 2 }).default("0").notNull(),
  referralWalletAppliedAt: timestamp("referral_wallet_applied_at"),
  couponCode: text("coupon_code"), // Cupom de desconto aplicado
  couponPrice: decimal("coupon_price", { precision: 10, scale: 2 }), // Preço com cupom aplicado
  // Mercado Pago fields
  mpSubscriptionId: varchar("mp_subscription_id", { length: 255 }), // ID da assinatura no Mercado Pago
  mpStatus: varchar("mp_status", { length: 50 }), // Status no Mercado Pago
  mpInitPoint: text("mp_init_point"), // Link de pagamento
  externalReference: varchar("external_reference", { length: 255 }).unique(), // Referência externa
  nextPaymentDate: timestamp("next_payment_date"), // Data da próxima cobrança
  payerEmail: varchar("payer_email", { length: 255 }), // Email do pagador
  paymentMethod: varchar("payment_method", { length: 50 }).default("mercadopago"), // Método de pagamento
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
});

export const referralProfiles = pgTable("referral_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  referralCode: varchar("referral_code", { length: 120 }).notNull().unique(),
  commissionDefaultAmount: decimal("commission_default_amount", { precision: 10, scale: 2 }).default("50.00").notNull(),
  commissionApprovedAmount: decimal("commission_approved_amount", { precision: 10, scale: 2 }),
  commissionApprovedAt: timestamp("commission_approved_at"),
  commissionApprovedBy: varchar("commission_approved_by", { length: 120 }),
  payoutPixType: varchar("payout_pix_type", { length: 30 }),
  payoutPixKey: varchar("payout_pix_key", { length: 255 }),
  payoutHolderName: varchar("payout_holder_name", { length: 255 }),
  shareMessageTemplate: text("share_message_template"),
  availableBalance: decimal("available_balance", { precision: 10, scale: 2 }).default("0").notNull(),
  pendingBalance: decimal("pending_balance", { precision: 10, scale: 2 }).default("0").notNull(),
  lifetimeBalance: decimal("lifetime_balance", { precision: 10, scale: 2 }).default("0").notNull(),
  totalReferrals: integer("total_referrals").default(0).notNull(),
  convertedReferrals: integer("converted_referrals").default(0).notNull(),
  lastShareAt: timestamp("last_share_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_referral_profiles_user").on(table.userId),
  index("idx_referral_profiles_code").on(table.referralCode),
]);

export const referralProgramSettings = pgTable("referral_program_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  defaultCommissionAmount: decimal("default_commission_amount", { precision: 10, scale: 2 }).default("50.00").notNull(),
  referralHeroTitle: varchar("referral_hero_title", { length: 255 }),
  referralHeroBody: text("referral_hero_body"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_referral_program_settings_created_at").on(table.createdAt),
]);

export const referralLinks = pgTable("referral_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull().references(() => referralProfiles.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referralCode: varchar("referral_code", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  destinationUrl: text("destination_url").notNull(),
  isPrimary: boolean("is_primary").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_referral_links_profile").on(table.profileId),
  index("idx_referral_links_user").on(table.userId),
  index("idx_referral_links_code").on(table.referralCode),
]);

export const referralAttributions = pgTable("referral_attributions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referralCode: varchar("referral_code", { length: 120 }).notNull(),
  referrerUserId: varchar("referrer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referredUserId: varchar("referred_user_id").references(() => users.id, { onDelete: "set null" }),
  referredEmail: varchar("referred_email", { length: 255 }),
  referredPhone: varchar("referred_phone", { length: 50 }),
  sourceChannel: varchar("source_channel", { length: 50 }).default("link").notNull(),
  sourceLabel: varchar("source_label", { length: 120 }),
  sourceUrl: text("source_url"),
  metadataJson: jsonb("metadata_json").default({}).notNull(),
  convertedAt: timestamp("converted_at"),
  status: varchar("status", { length: 50 }).default("captured").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_referral_attr_code").on(table.referralCode),
  index("idx_referral_attr_referrer").on(table.referrerUserId),
  index("idx_referral_attr_referred").on(table.referredUserId),
  uniqueIndex("idx_referral_attr_referred_unique").on(table.referredUserId),
]);

export const referralEvents = pgTable("referral_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attributionId: varchar("attribution_id").references(() => referralAttributions.id, { onDelete: "set null" }),
  referrerUserId: varchar("referrer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referredUserId: varchar("referred_user_id").references(() => users.id, { onDelete: "set null" }),
  subscriptionId: varchar("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  paymentHistoryId: varchar("payment_history_id", { length: 120 }),
  eventType: varchar("event_type", { length: 60 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).default("0").notNull(),
  metadataJson: jsonb("metadata_json").default({}).notNull(),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_referral_events_referrer").on(table.referrerUserId),
  index("idx_referral_events_referred").on(table.referredUserId),
  index("idx_referral_events_subscription").on(table.subscriptionId),
  index("idx_referral_events_type").on(table.eventType),
]);

export const referralWalletLedger = pgTable("referral_wallet_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull().references(() => referralProfiles.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attributionId: varchar("attribution_id").references(() => referralAttributions.id, { onDelete: "set null" }),
  referralEventId: varchar("referral_event_id").references(() => referralEvents.id, { onDelete: "set null" }),
  subscriptionId: varchar("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  entryType: varchar("entry_type", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).default("available").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description").notNull(),
  metadataJson: jsonb("metadata_json").default({}).notNull(),
  availableAt: timestamp("available_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_referral_wallet_profile").on(table.profileId),
  index("idx_referral_wallet_user").on(table.userId),
  index("idx_referral_wallet_status").on(table.status),
  index("idx_referral_wallet_subscription").on(table.subscriptionId),
]);

export const referralWithdrawalRequests = pgTable("referral_withdrawal_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull().references(() => referralProfiles.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  pixType: varchar("pix_type", { length: 30 }).notNull(),
  pixKey: varchar("pix_key", { length: 255 }).notNull(),
  holderName: varchar("holder_name", { length: 255 }).notNull(),
  documentNumber: varchar("document_number", { length: 20 }),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  adminNotes: text("admin_notes"),
  reviewedBy: varchar("reviewed_by", { length: 120 }),
  reviewedAt: timestamp("reviewed_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_referral_withdrawals_profile").on(table.profileId),
  index("idx_referral_withdrawals_user").on(table.userId),
  index("idx_referral_withdrawals_status").on(table.status),
]);

export const referralCommissionRequests = pgTable("referral_commission_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull().references(() => referralProfiles.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestedAmount: decimal("requested_amount", { precision: 10, scale: 2 }).notNull(),
  currentAmount: decimal("current_amount", { precision: 10, scale: 2 }).notNull(),
  justification: text("justification").notNull(),
  attachmentsJson: jsonb("attachments_json").$type<string[]>().default([]).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  adminNotes: text("admin_notes"),
  reviewedBy: varchar("reviewed_by", { length: 120 }),
  reviewedAt: timestamp("reviewed_at"),
  approvedAmount: decimal("approved_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_referral_commission_profile").on(table.profileId),
  index("idx_referral_commission_user").on(table.userId),
  index("idx_referral_commission_status").on(table.status),
]);

export const referralShareLogs = pgTable("referral_share_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull().references(() => referralProfiles.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referralCode: varchar("referral_code", { length: 120 }).notNull(),
  channel: varchar("channel", { length: 50 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  targetConversationId: varchar("target_conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  shareUrl: text("share_url"),
  messagePreview: text("message_preview"),
  metadataJson: jsonb("metadata_json").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_referral_share_profile").on(table.profileId),
  index("idx_referral_share_user").on(table.userId),
  index("idx_referral_share_channel").on(table.channel),
]);

export const referralSupportMaterials = pgTable("referral_support_materials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  caption: text("caption"),
  fileUrl: text("file_url").notNull(),
  storagePath: text("storage_path").notNull().unique(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  fileSize: integer("file_size").default(0).notNull(),
  mediaType: varchar("media_type", { length: 30 }).default("document").notNull(),
  aiGenerated: boolean("ai_generated").default(false).notNull(),
  aiModel: varchar("ai_model", { length: 120 }),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  metadataJson: jsonb("metadata_json").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_referral_support_materials_created").on(table.createdAt),
  index("idx_referral_support_materials_media_type").on(table.mediaType),
]);

// Payments table (legacy - Pix payments)
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscription_id").notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  pixCode: text("pix_code").notNull(),
  pixQrCode: text("pix_qr_code").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, paid, expired
  dataPagamento: timestamp("data_pagamento"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================================
// PAYMENT HISTORY - Histórico de todos os pagamentos (MercadoPago, Pix, etc)
// Usado para exibir histórico de cobranças para clientes e admin
// ============================================================================
export const paymentHistory = pgTable("payment_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscription_id").notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  
  // Informações do pagamento MercadoPago
  mpPaymentId: varchar("mp_payment_id", { length: 255 }), // ID do pagamento no MercadoPago
  mpSubscriptionId: varchar("mp_subscription_id", { length: 255 }), // ID da assinatura no MP
  
  // Valores
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // Valor cobrado
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }), // Valor líquido recebido
  feeAmount: decimal("fee_amount", { precision: 10, scale: 2 }), // Taxa MP
  
  // Status
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, approved, rejected, refunded
  statusDetail: varchar("status_detail", { length: 100 }), // Detalhe do status (accredited, cc_rejected_*, etc)
  
  // Tipo de pagamento
  paymentType: varchar("payment_type", { length: 50 }).default("recurring").notNull(), // first_payment, setup_fee, recurring, refund
  paymentMethod: varchar("payment_method", { length: 50 }), // credit_card, debit_card, pix, boleto
  
  // Datas
  paymentDate: timestamp("payment_date"), // Data do pagamento
  dueDate: timestamp("due_date"), // Data de vencimento
  
  // Informações adicionais
  payerEmail: varchar("payer_email", { length: 255 }),
  cardLastFourDigits: varchar("card_last_four_digits", { length: 4 }),
  cardBrand: varchar("card_brand", { length: 50 }), // visa, mastercard, etc
  
  // Metadata
  rawResponse: jsonb("raw_response"), // Resposta completa do MercadoPago
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_payment_history_subscription").on(table.subscriptionId),
  index("idx_payment_history_user").on(table.userId),
  index("idx_payment_history_mp_payment").on(table.mpPaymentId),
  index("idx_payment_history_status").on(table.status),
  index("idx_payment_history_date").on(table.paymentDate),
]);

// ============================================================================
// PAYMENT RECEIPTS - Comprovantes de pagamento PIX enviados por usuários
// Usado para armazenar comprovantes de pagamento manual via PIX
// ============================================================================
export const paymentReceipts = pgTable("payment_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  subscriptionId: varchar("subscription_id").notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  planId: varchar("plan_id").references(() => plans.id),
  
  // Valor do pagamento
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  
  // URL e informações do arquivo do comprovante
  receiptUrl: varchar("receipt_url").notNull(),
  receiptFilename: varchar("receipt_filename"),
  receiptMimeType: varchar("receipt_mime_type"),
  
  // Status do comprovante: pending, approved, rejected
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  
  // ID do pagamento no MercadoPago (se houver)
  mpPaymentId: varchar("mp_payment_id", { length: 255 }),
  
  // IDs do admin que aprovou/rejeitou
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_payment_receipts_user").on(table.userId),
  index("idx_payment_receipts_subscription").on(table.subscriptionId),
  index("idx_payment_receipts_status").on(table.status),
]);

// ============================================================================
// SPECIALIST ADD-ON - Adicional premium com gerente de conta por 30 dias
// Mantido separado da assinatura principal para nao misturar com o plano base
// ============================================================================
export const specialistAddons = pgTable("specialist_addons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: varchar("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  offerType: varchar("offer_type", { length: 50 }).default("specialist").notNull(), // implementation, specialist

  status: varchar("status", { length: 50 }).default("pending_payment").notNull(), // pending_payment, pending_review, active, expired, rejected, cancelled
  originalAmount: decimal("original_amount", { precision: 10, scale: 2 }).default("1000.00").notNull(),
  promotionalAmount: decimal("promotional_amount", { precision: 10, scale: 2 }).default("500.00").notNull(),

  pixCode: text("pix_code"),
  pixQrCode: text("pix_qr_code"),
  paymentReference: varchar("payment_reference", { length: 255 }),

  receiptUrl: text("receipt_url"),
  receiptFilename: varchar("receipt_filename", { length: 255 }),
  receiptMimeType: varchar("receipt_mime_type", { length: 120 }),

  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  reviewedBy: varchar("reviewed_by", { length: 255 }),
  reviewedAt: timestamp("reviewed_at"),
  adminNotes: text("admin_notes"),

  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_specialist_addons_user").on(table.userId),
  index("idx_specialist_addons_subscription").on(table.subscriptionId),
  index("idx_specialist_addons_offer_type").on(table.offerType),
  index("idx_specialist_addons_status").on(table.status),
]);

// ============================================================================
// RESELLER CLIENT PAYMENT RECEIPTS - Comprovantes de pagamento para clientes de revenda
// Usado quando o cliente de um revendedor paga via PIX (chave do revendedor)
// ============================================================================
export const resellerClientPaymentReceipts = pgTable("reseller_client_payment_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Referências
  resellerClientId: varchar("reseller_client_id").notNull().references(() => resellerClients.id, { onDelete: 'cascade' }),
  resellerId: varchar("reseller_id").notNull().references(() => resellers.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }), // O usuário que é cliente do revendedor
  
  // Informações do pagamento
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  referenceMonth: varchar("reference_month", { length: 7 }).notNull(), // YYYY-MM
  
  // URL e informações do arquivo do comprovante
  receiptUrl: varchar("receipt_url").notNull(),
  receiptFilename: varchar("receipt_filename"),
  receiptMimeType: varchar("receipt_mime_type"),
  
  // Status: pending, approved, rejected
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  
  // Dias de acesso concedidos quando aprovado (geralmente 30)
  daysGranted: integer("days_granted").default(30),
  
  // IDs do admin que aprovou/rejeitou
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_reseller_receipts_client").on(table.resellerClientId),
  index("idx_reseller_receipts_reseller").on(table.resellerId),
  index("idx_reseller_receipts_user").on(table.userId),
  index("idx_reseller_receipts_status").on(table.status),
]);

// Coupons table - Sistema de cupons de desconto
export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").unique().notNull(), // Código do cupom (ex: BLACKFRIDAY, WELCOME2025)
  discountType: text("discount_type").default("fixed_price").notNull(), // Tipo de desconto
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).default("0").notNull(), // Valor do desconto
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }), // Preço final com cupom aplicado
  ownerUserId: varchar("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").default(true),
  maxUses: integer("max_uses"), // null = ilimitado
  currentUses: integer("current_uses").default(0), // Quantas vezes foi usado
  applicablePlans: jsonb("applicable_plans").$type<string[]>(), // Planos onde o cupom é válido (null = todos)
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  validFrom: timestamp("valid_from").defaultNow(),
  validUntil: timestamp("valid_until"), // Data de expiração (null = sem expiração)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// System configuration table
export const systemConfig = pgTable("system_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chave: varchar("chave", { length: 100 }).unique().notNull(),
  valor: text("valor"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const webPushSubscriptions = pgTable("web_push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  deviceLabel: varchar("device_label", { length: 255 }),
  isActive: boolean("is_active").default(true).notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_web_push_subscriptions_user").on(table.userId),
  uniqueIndex("idx_web_push_subscriptions_endpoint").on(table.endpoint),
]);

export const insertWebPushSubscriptionSchema = createInsertSchema(webPushSubscriptions);
export type WebPushSubscription = typeof webPushSubscriptions.$inferSelect;
export type InsertWebPushSubscription = z.infer<typeof insertWebPushSubscriptionSchema>;

// Follow-up Logs table (Admin)
export const followupLogs = pgTable("followup_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  conversationId: varchar("conversation_id").references(() => adminConversations.id),
  contactNumber: text("contact_number").notNull(),
  status: text("status").notNull(), // 'sent', 'failed', 'skipped', 'cancelled'
  messageContent: text("message_content"),
  executedAt: timestamp("executed_at").defaultNow(),
  errorReason: text("error_reason"),
  // 🛡️ FOLLOW-UP FOR NON-PAYERS
  paymentStatus: varchar("payment_status", { length: 50 }), // paid, unpaid, pending
  followupType: varchar("followup_type", { length: 50 }), // regular, non_payer, final
  stage: integer("stage"), // Follow-up stage number
  // 🛡️ SCHEDULED MESSAGES
  scheduledFor: timestamp("scheduled_for"),
}, (table) => [
  index("idx_followup_logs_conversation").on(table.conversationId),
  index("idx_followup_logs_status").on(table.status),
  index("idx_followup_logs_contact").on(table.contactNumber),
]);

// ============================================================================
// FOLLOW-UP INTELIGENTE - Configuração por Usuário
// ============================================================================

// Configuração de Follow-up por Usuário
export const followupConfigs = pgTable("followup_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  
  // Configurações gerais
  // IMPORTANTE: Follow-up DESATIVADO por padrão - usuário precisa ativar manualmente
  isEnabled: boolean("is_enabled").default(false).notNull(),
  maxAttempts: integer("max_attempts").default(8).notNull(),
  
  // Intervalos customizados (em minutos) - padrão: 10m, 30m, 3h, 24h, 48h, 3d, 7d, 15d
  intervalsMinutes: jsonb("intervals_minutes").$type<number[]>().default([10, 30, 180, 1440, 2880, 4320, 10080, 21600]),
  
  // Horário comercial
  businessHoursStart: text("business_hours_start").default("09:00"),
  businessHoursEnd: text("business_hours_end").default("18:00"),
  businessDays: jsonb("business_days").$type<number[]>().default([1, 2, 3, 4, 5]), // 0=dom, 1=seg, ... 6=sab
  respectBusinessHours: boolean("respect_business_hours").default(true).notNull(),
  
  // Tom e estilo das mensagens
  tone: varchar("tone", { length: 50 }).default("consultivo").notNull(), // consultivo, vendedor, humano, técnico
  formalityLevel: integer("formality_level").default(5).notNull(), // 1-10
  useEmojis: boolean("use_emojis").default(true).notNull(),
  
  // Informações importantes para argumentos (a IA pode usar)
  importantInfo: jsonb("important_info").$type<Array<{ titulo: string; conteudo: string; usado?: boolean }>>().default([]),
  
  // Loop infinito após acabar sequência
  infiniteLoop: boolean("infinite_loop").default(true).notNull(),
  infiniteLoopMinDays: integer("infinite_loop_min_days").default(15).notNull(),
  infiniteLoopMaxDays: integer("infinite_loop_max_days").default(30).notNull(),
  followupAudioMode: text("followup_audio_mode").default("text_only").notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Logs de Follow-up dos Usuários
export const userFollowupLogs = pgTable("user_followup_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  contactNumber: text("contact_number").notNull(),
  status: text("status").notNull(), // 'sent', 'failed', 'cancelled', 'skipped'
  messageContent: text("message_content"),
  aiDecision: jsonb("ai_decision").$type<{ action: string; reason: string; context?: string }>(),
  stage: integer("stage").default(0).notNull(),
  executedAt: timestamp("executed_at").defaultNow(),
  errorReason: text("error_reason"),
}, (table) => [
  index("idx_user_followup_logs_conv").on(table.conversationId),
  index("idx_user_followup_logs_user").on(table.userId),
]);

// =============================================================================
// TAGS / ETIQUETAS - Sistema de Etiquetas para Conversas (WhatsApp CRM)
// =============================================================================

// Tabela de Tags
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Nome da etiqueta (ex: "Novo cliente", "Pagamento pendente")
  name: varchar("name", { length: 100 }).notNull(),
  // Cor da etiqueta (hex color, ex: "#22c55e")
  color: varchar("color", { length: 20 }).default("#6b7280").notNull(),
  // Ícone (opcional - nome do ícone lucide)
  icon: varchar("icon", { length: 50 }),
  // Se é uma etiqueta padrão do sistema (WhatsApp Business defaults)
  isDefault: boolean("is_default").default(false).notNull(),
  // Posição para ordenação
  position: integer("position").default(0).notNull(),
  // Descrição opcional da etiqueta
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_tags_user_id").on(table.userId),
  index("idx_tags_position").on(table.position),
  // Unique: nome único por usuário
  uniqueIndex("idx_tags_unique_name").on(table.userId, table.name),
]);

// Tabela de Relação Tags <-> Conversas (many-to-many)
export const conversationTags = pgTable("conversation_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: 'cascade' }),
  // Quando a tag foi atribuída
  assignedAt: timestamp("assigned_at").defaultNow(),
}, (table) => [
  index("idx_conversation_tags_conversation").on(table.conversationId),
  index("idx_conversation_tags_tag").on(table.tagId),
  // Unique: uma tag só pode ser atribuída uma vez por conversa
  uniqueIndex("idx_conversation_tags_unique").on(table.conversationId, table.tagId),
]);

// Schemas e types para Tags
export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const tagSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida").default("#6b7280"),
  icon: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  position: z.number().int().min(0).default(0),
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;
export type TagInput = z.infer<typeof tagSchema>;

// Schemas e types para ConversationTags
export const insertConversationTagSchema = createInsertSchema(conversationTags).omit({
  id: true,
  assignedAt: true,
});

export type ConversationTag = typeof conversationTags.$inferSelect;
export type InsertConversationTag = z.infer<typeof insertConversationTagSchema>;

// Relations para Tags
export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, {
    fields: [tags.userId],
    references: [users.id],
  }),
  conversationTags: many(conversationTags),
}));

export const conversationTagsRelations = relations(conversationTags, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationTags.conversationId],
    references: [conversations.id],
  }),
  tag: one(tags, {
    fields: [conversationTags.tagId],
    references: [tags.id],
  }),
}));

export const agentsRelations = relations(agents, ({ many }) => ({
  connections: many(whatsappConnections),
  mediaFlows: many(mediaFlows),
}));

export const mediaFlowsRelations = relations(mediaFlows, ({ one, many }) => ({
  agent: one(agents, {
    fields: [mediaFlows.agentId],
    references: [agents.id],
  }),
  items: many(mediaFlowItems),
}));

export const mediaFlowItemsRelations = relations(mediaFlowItems, ({ one }) => ({
  flow: one(mediaFlows, {
    fields: [mediaFlowItems.flowId],
    references: [mediaFlows.id],
  }),
}));

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  whatsappConnections: many(whatsappConnections),
  aiAgentConfig: one(aiAgentConfig, {
    fields: [users.id],
    references: [aiAgentConfig.userId],
  }),
  businessAgentConfig: one(businessAgentConfigs, {
    fields: [users.id],
    references: [businessAgentConfigs.userId],
  }),
  subscriptions: many(subscriptions),
  referralProfile: one(referralProfiles, {
    fields: [users.id],
    references: [referralProfiles.userId],
  }),
  referralLinks: many(referralLinks),
  referralAttributionsAsReferrer: many(referralAttributions),
  referralEventsAsReferrer: many(referralEvents),
  referralWalletEntries: many(referralWalletLedger),
  referralWithdrawalRequests: many(referralWithdrawalRequests),
  referralCommissionRequests: many(referralCommissionRequests),
  referralShareLogs: many(referralShareLogs),
  broadcastCampaigns: many(broadcastCampaigns),
}));

export const whatsappConnectionsRelations = relations(whatsappConnections, ({ one, many }) => ({
  user: one(users, {
    fields: [whatsappConnections.userId],
    references: [users.id],
  }),
  agent: one(agents, {
    fields: [whatsappConnections.agentId],
    references: [agents.id],
  }),
  conversations: many(conversations),
  contacts: many(whatsappContacts),
  broadcastCampaigns: many(broadcastCampaigns),
}));

export const whatsappContactsRelations = relations(whatsappContacts, ({ one }) => ({
  connection: one(whatsappConnections, {
    fields: [whatsappContacts.connectionId],
    references: [whatsappConnections.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  connection: one(whatsappConnections, {
    fields: [conversations.connectionId],
    references: [whatsappConnections.id],
  }),
  messages: many(messages),
  agentDisabled: one(agentDisabledConversations, {
    fields: [conversations.id],
    references: [agentDisabledConversations.conversationId],
  }),
  conversationTags: many(conversationTags),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
  payments: many(payments),
  referralEvents: many(referralEvents),
  referralWalletEntries: many(referralWalletLedger),
}));

export const referralProfilesRelations = relations(referralProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [referralProfiles.userId],
    references: [users.id],
  }),
  links: many(referralLinks),
  walletEntries: many(referralWalletLedger),
  withdrawalRequests: many(referralWithdrawalRequests),
  commissionRequests: many(referralCommissionRequests),
  shareLogs: many(referralShareLogs),
}));

export const referralLinksRelations = relations(referralLinks, ({ one }) => ({
  profile: one(referralProfiles, {
    fields: [referralLinks.profileId],
    references: [referralProfiles.id],
  }),
  user: one(users, {
    fields: [referralLinks.userId],
    references: [users.id],
  }),
}));

export const referralAttributionsRelations = relations(referralAttributions, ({ one, many }) => ({
  referrer: one(users, {
    fields: [referralAttributions.referrerUserId],
    references: [users.id],
  }),
  referred: one(users, {
    fields: [referralAttributions.referredUserId],
    references: [users.id],
  }),
  events: many(referralEvents),
  walletEntries: many(referralWalletLedger),
}));

export const referralEventsRelations = relations(referralEvents, ({ one, many }) => ({
  attribution: one(referralAttributions, {
    fields: [referralEvents.attributionId],
    references: [referralAttributions.id],
  }),
  referrer: one(users, {
    fields: [referralEvents.referrerUserId],
    references: [users.id],
  }),
  referred: one(users, {
    fields: [referralEvents.referredUserId],
    references: [users.id],
  }),
  subscription: one(subscriptions, {
    fields: [referralEvents.subscriptionId],
    references: [subscriptions.id],
  }),
  walletEntries: many(referralWalletLedger),
}));

export const referralWalletLedgerRelations = relations(referralWalletLedger, ({ one }) => ({
  profile: one(referralProfiles, {
    fields: [referralWalletLedger.profileId],
    references: [referralProfiles.id],
  }),
  user: one(users, {
    fields: [referralWalletLedger.userId],
    references: [users.id],
  }),
  attribution: one(referralAttributions, {
    fields: [referralWalletLedger.attributionId],
    references: [referralAttributions.id],
  }),
  event: one(referralEvents, {
    fields: [referralWalletLedger.referralEventId],
    references: [referralEvents.id],
  }),
  subscription: one(subscriptions, {
    fields: [referralWalletLedger.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const referralWithdrawalRequestsRelations = relations(referralWithdrawalRequests, ({ one }) => ({
  profile: one(referralProfiles, {
    fields: [referralWithdrawalRequests.profileId],
    references: [referralProfiles.id],
  }),
  user: one(users, {
    fields: [referralWithdrawalRequests.userId],
    references: [users.id],
  }),
}));

export const referralCommissionRequestsRelations = relations(referralCommissionRequests, ({ one }) => ({
  profile: one(referralProfiles, {
    fields: [referralCommissionRequests.profileId],
    references: [referralProfiles.id],
  }),
  user: one(users, {
    fields: [referralCommissionRequests.userId],
    references: [users.id],
  }),
}));

export const referralShareLogsRelations = relations(referralShareLogs, ({ one }) => ({
  profile: one(referralProfiles, {
    fields: [referralShareLogs.profileId],
    references: [referralProfiles.id],
  }),
  user: one(users, {
    fields: [referralShareLogs.userId],
    references: [users.id],
  }),
  conversation: one(conversations, {
    fields: [referralShareLogs.targetConversationId],
    references: [conversations.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const paymentReceiptsRelations = relations(paymentReceipts, ({ one }) => ({
  user: one(users, {
    fields: [paymentReceipts.userId],
    references: [users.id],
  }),
  subscription: one(subscriptions, {
    fields: [paymentReceipts.subscriptionId],
    references: [subscriptions.id],
  }),
  plan: one(plans, {
    fields: [paymentReceipts.planId],
    references: [plans.id],
  }),
}));

export const specialistAddonsRelations = relations(specialistAddons, ({ one }) => ({
  user: one(users, {
    fields: [specialistAddons.userId],
    references: [users.id],
  }),
  subscription: one(subscriptions, {
    fields: [specialistAddons.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const adminWhatsappConnectionRelations = relations(adminWhatsappConnection, ({ one }) => ({
  admin: one(admins, {
    fields: [adminWhatsappConnection.adminId],
    references: [admins.id],
  }),
}));

// Zod schemas and types
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const agentSchema = z.object({
  name: z.string().min(1, "Nome do agente é obrigatório").max(255),
  prompt: z.string().min(1, "Prompt do agente é obrigatório"),
  isActive: z.boolean().default(true),
});
export type Agent = typeof agents.$inferSelect;
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type AgentInput = z.infer<typeof agentSchema>;

export const insertWhatsappConnectionSchema = createInsertSchema(whatsappConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWhatsappConnection = z.infer<typeof insertWhatsappConnectionSchema>;
export type WhatsappConnection = typeof whatsappConnections.$inferSelect;

export const insertMediaFlowSchema = createInsertSchema(mediaFlows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const mediaFlowSchema = z.object({
  agentId: z.string().min(1, "Agente é obrigatório"),
  name: z.string().min(1, "Nome do fluxo é obrigatório").max(255),
  description: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().default(true),
});
export type MediaFlow = typeof mediaFlows.$inferSelect;
export type InsertMediaFlow = z.infer<typeof insertMediaFlowSchema>;
export type MediaFlowInput = z.infer<typeof mediaFlowSchema>;

export const insertMediaFlowItemSchema = createInsertSchema(mediaFlowItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const mediaFlowItemSchema = z.object({
  flowId: z.string().min(1, "Fluxo Ã© obrigatÃ³rio"),
  mediaId: z.string().optional().nullable(),
  mediaName: z.string().min(1, "Nome da mÃ­dia Ã© obrigatÃ³rio").max(255),
  mediaType: z.enum(["audio", "image", "video", "document"]),
  storageUrl: z.string().min(1, "URL da mÃ­dia Ã© obrigatÃ³ria"),
  caption: z.string().max(2000).optional().nullable(),
  delaySeconds: z.number().int().min(0).default(0),
  displayOrder: z.number().int().min(0).default(0),
});
export type MediaFlowItem = typeof mediaFlowItems.$inferSelect;
export type InsertMediaFlowItem = z.infer<typeof insertMediaFlowItemSchema>;
export type MediaFlowItemInput = z.infer<typeof mediaFlowItemSchema>;

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// WhatsApp Contacts schemas and types
export const insertWhatsappContactSchema = createInsertSchema(whatsappContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncedAt: true,
});
export type InsertWhatsappContact = z.infer<typeof insertWhatsappContactSchema>;
export type WhatsappContact = typeof whatsappContacts.$inferSelect;

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export const sendMessageSchema = z.object({
  conversationId: z.string(),
  text: z.string().min(1, "Message cannot be empty"),
});
export type SendMessage = z.infer<typeof sendMessageSchema>;

export const insertAiAgentConfigSchema = createInsertSchema(aiAgentConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiAgentConfig = z.infer<typeof insertAiAgentConfigSchema>;
export type AiAgentConfig = typeof aiAgentConfig.$inferSelect;

export const insertAgentDisabledConversationSchema = createInsertSchema(agentDisabledConversations).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentDisabledConversation = z.infer<typeof insertAgentDisabledConversationSchema>;
export type AgentDisabledConversation = typeof agentDisabledConversations.$inferSelect;

// Website Imports schemas and types
export const insertWebsiteImportSchema = createInsertSchema(websiteImports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWebsiteImport = z.infer<typeof insertWebsiteImportSchema>;
export type WebsiteImport = typeof websiteImports.$inferSelect;

// Admin schemas and types
export const insertAdminSchema = createInsertSchema(admins).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Admin = typeof admins.$inferSelect;

export const loginAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
export type LoginAdmin = z.infer<typeof loginAdminSchema>;

// Plan schemas and types
export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;

// Subscription schemas and types
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

export const insertReferralProfileSchema = createInsertSchema(referralProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReferralProfile = z.infer<typeof insertReferralProfileSchema>;
export type ReferralProfile = typeof referralProfiles.$inferSelect;

export const insertReferralProgramSettingsSchema = createInsertSchema(referralProgramSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReferralProgramSettings = z.infer<typeof insertReferralProgramSettingsSchema>;
export type ReferralProgramSettings = typeof referralProgramSettings.$inferSelect;

export const insertReferralLinkSchema = createInsertSchema(referralLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReferralLink = z.infer<typeof insertReferralLinkSchema>;
export type ReferralLink = typeof referralLinks.$inferSelect;

export const insertReferralAttributionSchema = createInsertSchema(referralAttributions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReferralAttribution = z.infer<typeof insertReferralAttributionSchema>;
export type ReferralAttribution = typeof referralAttributions.$inferSelect;

export const insertReferralEventSchema = createInsertSchema(referralEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertReferralEvent = z.infer<typeof insertReferralEventSchema>;
export type ReferralEvent = typeof referralEvents.$inferSelect;

export const insertReferralWalletLedgerSchema = createInsertSchema(referralWalletLedger).omit({
  id: true,
  createdAt: true,
});
export type InsertReferralWalletLedger = z.infer<typeof insertReferralWalletLedgerSchema>;
export type ReferralWalletLedgerEntry = typeof referralWalletLedger.$inferSelect;

export const insertReferralWithdrawalRequestSchema = createInsertSchema(referralWithdrawalRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReferralWithdrawalRequest = z.infer<typeof insertReferralWithdrawalRequestSchema>;
export type ReferralWithdrawalRequest = typeof referralWithdrawalRequests.$inferSelect;

export const insertReferralCommissionRequestSchema = createInsertSchema(referralCommissionRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReferralCommissionRequest = z.infer<typeof insertReferralCommissionRequestSchema>;
export type ReferralCommissionRequest = typeof referralCommissionRequests.$inferSelect;

export const insertReferralShareLogSchema = createInsertSchema(referralShareLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertReferralShareLog = z.infer<typeof insertReferralShareLogSchema>;
export type ReferralShareLog = typeof referralShareLogs.$inferSelect;

export const insertReferralSupportMaterialSchema = createInsertSchema(referralSupportMaterials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReferralSupportMaterial = z.infer<typeof insertReferralSupportMaterialSchema>;
export type ReferralSupportMaterial = typeof referralSupportMaterials.$inferSelect;

// Payment schemas and types (legacy - Pix)
export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Payment History schemas and types (MercadoPago, etc)
export const insertPaymentHistorySchema = createInsertSchema(paymentHistory).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPaymentHistory = z.infer<typeof insertPaymentHistorySchema>;
export type PaymentHistory = typeof paymentHistory.$inferSelect;

// Payment Receipt schemas and types
export const insertPaymentReceiptSchema = createInsertSchema(paymentReceipts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPaymentReceipt = z.infer<typeof insertPaymentReceiptSchema>;
export type PaymentReceipt = typeof paymentReceipts.$inferSelect;

export const insertSpecialistAddonSchema = createInsertSchema(specialistAddons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpecialistAddon = z.infer<typeof insertSpecialistAddonSchema>;
export type SpecialistAddon = typeof specialistAddons.$inferSelect;

// System config schemas and types
export const insertSystemConfigSchema = createInsertSchema(systemConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;
export type SystemConfig = typeof systemConfig.$inferSelect;

// Coupon schemas and types
export const insertCouponSchema = createInsertSchema(coupons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof coupons.$inferSelect;

// Admin WhatsApp connection schemas and types
export const insertAdminWhatsappConnectionSchema = createInsertSchema(adminWhatsappConnection).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdminWhatsappConnection = z.infer<typeof insertAdminWhatsappConnectionSchema>;
export type AdminWhatsappConnection = typeof adminWhatsappConnection.$inferSelect;

// Admin Conversations schemas and types
export const insertAdminConversationSchema = createInsertSchema(adminConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdminConversation = z.infer<typeof insertAdminConversationSchema>;
export type AdminConversation = typeof adminConversations.$inferSelect;

export const insertConversationLeadIntelligenceSchema = createInsertSchema(conversationLeadIntelligence).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertConversationLeadIntelligence = z.infer<typeof insertConversationLeadIntelligenceSchema>;
export type ConversationLeadIntelligence = typeof conversationLeadIntelligence.$inferSelect;

export const insertCourseSchedulingInsightSchema = createInsertSchema(courseSchedulingInsights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCourseSchedulingInsight = z.infer<typeof insertCourseSchedulingInsightSchema>;
export type CourseSchedulingInsight = typeof courseSchedulingInsights.$inferSelect;

// Admin Messages schemas and types
export const insertAdminMessageSchema = createInsertSchema(adminMessages).omit({
  id: true,
  createdAt: true,
});
export type InsertAdminMessage = z.infer<typeof insertAdminMessageSchema>;
export type AdminMessage = typeof adminMessages.$inferSelect;

// ============================================================================
// FOLLOW-UP INTELIGENTE - Schemas e Types
// ============================================================================

// Follow-up Config schemas and types
export const followupAudioModes = ["text_only", "audio_only", "alternate_text_audio", "random_text_audio"] as const;
export type FollowupAudioMode = typeof followupAudioModes[number];

export const insertFollowupConfigSchema = createInsertSchema(followupConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

const DEFAULT_FOLLOWUP_IMPORTANT_INFO_TITLE = "Informacao importante";

const followupImportantInfoStringSchema = z.string().transform((conteudo) => ({
  titulo: DEFAULT_FOLLOWUP_IMPORTANT_INFO_TITLE,
  conteudo: conteudo.trim(),
}));

const followupImportantInfoObjectSchema = z.object({
  titulo: z.string().nullable().optional(),
  conteudo: z.string().nullable().optional(),
  usado: z.boolean().optional(),
}).transform((info) => {
  const titulo = info.titulo?.trim() || DEFAULT_FOLLOWUP_IMPORTANT_INFO_TITLE;
  const conteudo = info.conteudo?.trim() || "";
  const normalized: { titulo: string; conteudo: string; usado?: boolean } = {
    titulo,
    conteudo,
  };

  if (typeof info.usado === "boolean") {
    normalized.usado = info.usado;
  }

  return normalized;
});

export const followupImportantInfoSchema = z.preprocess(
  (value) => Array.isArray(value) ? value : [],
  z.array(z.union([followupImportantInfoObjectSchema, followupImportantInfoStringSchema])),
).transform((items) => items.filter((item) => item.conteudo.length > 0));

export const followupConfigSchema = z.object({
  userId: z.string(),
  // IMPORTANTE: Follow-up DESATIVADO por padrão - usuário precisa ativar manualmente
  isEnabled: z.boolean().default(false),
  maxAttempts: z.number().min(1).max(20).default(8),
  intervalsMinutes: z.array(z.number()).default([10, 30, 180, 1440, 2880, 4320, 10080, 21600]),
  businessHoursStart: z.string().default("09:00"),
  businessHoursEnd: z.string().default("18:00"),
  businessDays: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
  respectBusinessHours: z.boolean().default(true),
  tone: z.enum(["consultivo", "vendedor", "humano", "técnico"]).default("consultivo"),
  formalityLevel: z.number().min(1).max(10).default(5),
  useEmojis: z.boolean().default(true),
  importantInfo: followupImportantInfoSchema,
  infiniteLoop: z.boolean().default(true),
  infiniteLoopMinDays: z.number().min(1).max(60).default(15),
  infiniteLoopMaxDays: z.number().min(1).max(90).default(30),
  followupAudioMode: z.enum(followupAudioModes).default("text_only"),
});

export type InsertFollowupConfig = z.infer<typeof insertFollowupConfigSchema>;
export type FollowupConfig = typeof followupConfigs.$inferSelect;
export type FollowupConfigInput = z.infer<typeof followupConfigSchema>;

// User Follow-up Logs schemas and types
export const insertUserFollowupLogSchema = createInsertSchema(userFollowupLogs).omit({
  executedAt: true,
});
export type InsertUserFollowupLog = z.infer<typeof insertUserFollowupLogSchema>;
export type UserFollowupLog = typeof userFollowupLogs.$inferSelect;

// Follow-up Config Relations
export const followupConfigsRelations = relations(followupConfigs, ({ one }) => ({
  user: one(users, {
    fields: [followupConfigs.userId],
    references: [users.id],
  }),
}));

// User Follow-up Logs Relations
export const userFollowupLogsRelations = relations(userFollowupLogs, ({ one }) => ({
  conversation: one(conversations, {
    fields: [userFollowupLogs.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [userFollowupLogs.userId],
    references: [users.id],
  }),
}));

// Business Agent Configuration schemas and types
export const insertBusinessAgentConfigSchema = createInsertSchema(businessAgentConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Zod schemas detalhados para validação
export const businessAgentConfigSchema = z.object({
  userId: z.string(),
  agentName: z.string().min(1, "Nome do agente é obrigatório"),
  agentRole: z.string().min(1, "Função do agente é obrigatória"),
  companyName: z.string().min(1, "Nome da empresa é obrigatório"),
  companyDescription: z.string().optional(),
  personality: z.string().default("profissional e prestativo"),
  
  productsServices: z.array(z.object({
    name: z.string(),
    description: z.string(),
    price: z.string().optional(),
    features: z.array(z.string()).optional(),
  })).default([]),
  
  businessInfo: z.object({
    horarioFuncionamento: z.string().optional(),
    endereco: z.string().optional(),
    telefone: z.string().optional(),
    email: z.string().email().optional(),
    website: z.string().url().optional(),
    redesSociais: z.record(z.string()).optional(),
    formasContato: z.array(z.string()).optional(),
    metodosEntrega: z.array(z.string()).optional(),
  }).default({}),
  
  faqItems: z.array(z.object({
    pergunta: z.string(),
    resposta: z.string(),
    categoria: z.string().optional(),
  })).default([]),
  
  policies: z.object({
    trocasDevolucoes: z.string().optional(),
    garantia: z.string().optional(),
    privacidade: z.string().optional(),
    termos: z.string().optional(),
  }).default({}),
  
  allowedTopics: z.array(z.string()).default([]),
  prohibitedTopics: z.array(z.string()).default([]),
  allowedActions: z.array(z.string()).default([]),
  prohibitedActions: z.array(z.string()).default([]),
  
  toneOfVoice: z.string().default("amigável"),
  communicationStyle: z.string().default("claro e direto"),
  emojiUsage: z.enum(["nunca", "raro", "moderado", "frequente"]).default("moderado"),
  formalityLevel: z.number().min(1).max(10).default(5),
  
  maxResponseLength: z.number().default(400),
  useCustomerName: z.boolean().default(true),
  offerNextSteps: z.boolean().default(true),
  escalateToHuman: z.boolean().default(true),
  escalationKeywords: z.array(z.string()).default([]),
  
  isActive: z.boolean().default(false),
  model: z.string().default("openai/gpt-oss-20b"), // CORRIGIDO: usar modelo do OpenRouter
  triggerPhrases: z.array(z.string()).default([]),
  templateType: z.enum(["ecommerce", "professional", "health", "education", "realestate", "custom"]).optional(),
  
  version: z.number().default(1),
});

export type InsertBusinessAgentConfig = z.infer<typeof insertBusinessAgentConfigSchema>;
export type BusinessAgentConfig = typeof businessAgentConfigs.$inferSelect;
export type BusinessAgentConfigInput = z.infer<typeof businessAgentConfigSchema>;

// Agent Media Library schemas and types
export const insertAgentMediaSchema = createInsertSchema(agentMediaLibrary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Schema de item individual de fluxo
export const flowItemSchema = z.object({
  id: z.string(),
  order: z.number(),
  type: z.enum(["media", "text"]),
  isGreeting: z.boolean().optional(),
  storageUrl: z.string().optional(),
  mediaType: z.enum(["audio", "image", "video", "document"]).optional(),
  caption: z.string().optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  text: z.string().optional(),
});

export type FlowItem = z.infer<typeof flowItemSchema>;

export const agentMediaSchema = z.object({
  userId: z.string(),
  name: z.string().min(1, "Nome da mídia é obrigatório").max(100),
  mediaType: z.enum(["audio", "image", "video", "document", "flow"]),
  storageUrl: z.string().optional().default(""), // vazio para 'flow'
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  durationSeconds: z.number().optional(),
  description: z.string().min(1, "Descrição é obrigatória"),
  whenToUse: z.string().optional(),
  caption: z.string().optional(), // Legenda que vai com a imagem/vídeo
  transcription: z.string().optional(),
  isPtt: z.boolean().default(true), // Push-to-talk (áudio aparece como gravado)
  sendAlone: z.boolean().default(false), // Enviar sozinha ou pode combinar com outras
  suppressTextResponse: z.boolean().default(false),
  isActive: z.boolean().default(true),
  displayOrder: z.number().default(0),
  wapiMediaId: z.string().optional(),
  // Itens do fluxo (somente para mediaType='flow')
  flowItems: z.array(flowItemSchema).optional(),
});

export type InsertAgentMedia = z.infer<typeof insertAgentMediaSchema>;
export type AgentMedia = typeof agentMediaLibrary.$inferSelect;
export type AgentMediaInput = z.infer<typeof agentMediaSchema>;

// Agent Media Library relations
export const agentMediaLibraryRelations = relations(agentMediaLibrary, ({ one }) => ({
  user: one(users, {
    fields: [agentMediaLibrary.userId],
    references: [users.id],
  }),
}));

// Admin Agent Media schemas and types
export const insertAdminAgentMediaSchema = createInsertSchema(adminAgentMedia).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const adminAgentMediaSchema = z.object({
  adminId: z.string(),
  name: z.string().min(1, "Nome da mídia é obrigatório").max(100).regex(/^[A-Z0-9_]+$/, "Nome deve ser em MAIÚSCULAS com underscores (ex: COMO_FUNCIONA)"),
  mediaType: z.enum(["audio", "image", "video", "document"]),
  storageUrl: z.string().min(1, "URL de armazenamento é obrigatória"),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  durationSeconds: z.number().optional(),
  description: z.string().min(1, "Descrição é obrigatória"),
  whenToUse: z.string().optional(),
  caption: z.string().optional(),
  transcription: z.string().optional(),
  isActive: z.boolean().default(true),
  isReferralSupport: z.boolean().default(false),
  sendAlone: z.boolean().default(true),
  displayOrder: z.number().default(0),
});

export type InsertAdminAgentMedia = z.infer<typeof insertAdminAgentMediaSchema>;
export type AdminAgentMedia = typeof adminAgentMedia.$inferSelect;
export type AdminAgentMediaInput = z.infer<typeof adminAgentMediaSchema>;

// Admin Agent Media relations
export const adminAgentMediaRelations = relations(adminAgentMedia, ({ one }) => ({
  admin: one(admins, {
    fields: [adminAgentMedia.adminId],
    references: [admins.id],
  }),
}));

// =============================================================================
// QUICK REPLIES - Respostas Rápidas para Admin
// =============================================================================

export const adminQuickReplies = pgTable("admin_quick_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").references(() => admins.id, { onDelete: 'cascade' }),
  title: varchar("title", { length: 100 }).notNull(),
  content: text("content").notNull(),
  shortcut: varchar("shortcut", { length: 50 }),
  category: varchar("category", { length: 50 }),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_quick_replies_admin").on(table.adminId),
  index("idx_quick_replies_shortcut").on(table.shortcut),
]);

export const insertQuickReplySchema = createInsertSchema(adminQuickReplies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
});

export type QuickReply = typeof adminQuickReplies.$inferSelect;
export type InsertQuickReply = z.infer<typeof insertQuickReplySchema>;

// =============================================================================
// USER QUICK REPLIES - Respostas Rápidas para Usuários do SaaS
// =============================================================================

export const userQuickReplies = pgTable("user_quick_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  title: varchar("title", { length: 100 }).notNull(),
  content: text("content").notNull(),
  shortcut: varchar("shortcut", { length: 50 }),
  category: varchar("category", { length: 50 }),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_user_quick_replies_user").on(table.userId),
  index("idx_user_quick_replies_shortcut").on(table.shortcut),
]);

export const insertUserQuickReplySchema = createInsertSchema(userQuickReplies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
});

export type UserQuickReply = typeof userQuickReplies.$inferSelect;
export type InsertUserQuickReply = z.infer<typeof insertUserQuickReplySchema>;

// =============================================================================
// STRUCTURED RESPONSE FORMAT FOR MISTRAL (Media Actions)
// =============================================================================

// Schema para resposta estruturada do Mistral com ações de mídia
export const mistralResponseSchema = z.object({
  messages: z.array(z.object({
    type: z.literal("text"),
    content: z.string(),
  })),
  actions: z.array(z.union([
    z.object({
      type: z.literal("send_text"),
      text: z.string(),
      media_name: z.string().optional(),
      opening_flow_source: z.string().optional(),
      delay_seconds: z.number().optional(),
    }),
    z.object({
      type: z.literal("send_media"),
      media_name: z.string(), // Nome da mídia na biblioteca (ex: AUDIO_PRECO)
      opening_flow_source: z.string().optional(),
      delay_seconds: z.number().optional(), // Delay antes de enviar (opcional)
    }),
    z.object({
      type: z.literal("send_media_url"),
      media_url: z.string().url(),
      media_type: z.enum(["audio", "image", "video", "document"]),
      media_name: z.string().optional(),
      caption: z.string().optional(),
      file_name: z.string().optional(),
      opening_flow_source: z.string().optional(),
      delay_seconds: z.number().optional(),
    })
  ])).optional().default([]),
});

export type MistralResponse = z.infer<typeof mistralResponseSchema>;

// =============================================================================
// EXCLUSION LIST - Lista de Exclusão de Números para IA e Follow-up
// =============================================================================

export const exclusionList = pgTable("exclusion_list", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Número de telefone formatado (apenas dígitos, ex: "5511987654321")
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  // Nome/apelido do contato para identificação
  contactName: varchar("contact_name", { length: 255 }),
  // Motivo da exclusão (opcional)
  reason: text("reason"),
  // Se a exclusão também se aplica ao follow-up
  excludeFromFollowup: boolean("exclude_from_followup").default(true).notNull(),
  // Se a exclusão está ativa
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Índice para busca rápida por usuário
  index("idx_exclusion_list_user").on(table.userId),
  // Índice para busca rápida por número de telefone
  index("idx_exclusion_list_phone").on(table.phoneNumber),
  // Unique constraint: um número só pode estar na lista de exclusão uma vez por usuário
  uniqueIndex("idx_exclusion_list_unique_user_phone").on(table.userId, table.phoneNumber),
]);

// Configuração global de exclusão para o usuário
export const exclusionConfig = pgTable("exclusion_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  // Se a lista de exclusão está ativa globalmente
  isEnabled: boolean("is_enabled").default(true).notNull(),
  // Se a exclusão de follow-up está ativada (usar excludeFromFollowup de cada número)
  followupExclusionEnabled: boolean("followup_exclusion_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertExclusionListSchema = createInsertSchema(exclusionList).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExclusionConfigSchema = createInsertSchema(exclusionConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ExclusionListItem = typeof exclusionList.$inferSelect;
export type InsertExclusionListItem = z.infer<typeof insertExclusionListSchema>;
export type ExclusionConfig = typeof exclusionConfig.$inferSelect;
export type InsertExclusionConfig = z.infer<typeof insertExclusionConfigSchema>;

// Schema Zod para validação de entrada via API
export const exclusionListItemSchema = z.object({
  phoneNumber: z.string().min(8, "Número de telefone inválido").max(20),
  contactName: z.string().max(255).optional(),
  reason: z.string().optional(),
  excludeFromFollowup: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const exclusionConfigSchema = z.object({
  isEnabled: z.boolean().default(true),
  followupExclusionEnabled: z.boolean().default(true),
});

// =============================================================================
// DAILY USAGE TRACKING - Rastreamento de Uso Diário (Limites para Free Users)
// =============================================================================

export const dailyUsage = pgTable("daily_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Data do registro (sem hora - apenas YYYY-MM-DD)
  usageDate: timestamp("usage_date").notNull(),
  // Número de calibrações de prompt feitas hoje
  promptEditsCount: integer("prompt_edits_count").default(0).notNull(),
  // Número de mensagens do simulador usadas hoje
  simulatorMessagesCount: integer("simulator_messages_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Índice para busca rápida por usuário e data
  index("idx_daily_usage_user_date").on(table.userId, table.usageDate),
  // Unique constraint: apenas um registro por usuário por dia
  uniqueIndex("idx_daily_usage_unique").on(table.userId, table.usageDate),
]);

export const insertDailyUsageSchema = createInsertSchema(dailyUsage).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DailyUsage = typeof dailyUsage.$inferSelect;
export type InsertDailyUsage = z.infer<typeof insertDailyUsageSchema>;

// =============================================================================
// SALES FUNNELS - Funis de Vendas com Pipeline Visual
// =============================================================================

// Tabela principal de Funis de Vendas
export const salesFunnels = pgTable("sales_funnels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  product: varchar("product", { length: 255 }),
  manager: varchar("manager", { length: 255 }),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }).default("0"),
  estimatedRevenue: decimal("estimated_revenue", { precision: 12, scale: 2 }).default("0"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_sales_funnels_user").on(table.userId),
  index("idx_sales_funnels_active").on(table.isActive),
]);

// Estágios do Funil
export const funnelStages = pgTable("funnel_stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  funnelId: varchar("funnel_id").notNull().references(() => salesFunnels.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 50 }).default("text-slate-700"),
  bgColor: varchar("bg_color", { length: 50 }).default("bg-slate-100"),
  borderColor: varchar("border_color", { length: 50 }).default("border-slate-200"),
  iconColor: varchar("icon_color", { length: 50 }).default("text-slate-500"),
  position: integer("position").default(1).notNull(),
  automationsCount: integer("automations_count").default(0),
  // Configurações de automação WhatsApp
  autoMessageEnabled: boolean("auto_message_enabled").default(false),
  autoMessageText: text("auto_message_text"),
  autoMessageDelayMinutes: integer("auto_message_delay_minutes").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_funnel_stages_funnel").on(table.funnelId),
  index("idx_funnel_stages_position").on(table.position),
]);

// Deals/Oportunidades no Funil
export const funnelDeals = pgTable("funnel_deals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stageId: varchar("stage_id").notNull().references(() => funnelStages.id, { onDelete: 'cascade' }),
  contactName: varchar("contact_name", { length: 255 }).notNull(),
  companyName: varchar("company_name", { length: 255 }),
  value: decimal("value", { precision: 12, scale: 2 }).default("0"),
  valuePeriod: varchar("value_period", { length: 20 }).default("mensal"), // mensal, anual, único
  priority: varchar("priority", { length: 20 }).default("Média"), // Alta, Média, Baixa
  assignee: varchar("assignee", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  notes: text("notes"),
  lastContactAt: timestamp("last_contact_at").defaultNow(),
  expectedCloseDate: timestamp("expected_close_date"),
  wonAt: timestamp("won_at"),
  lostAt: timestamp("lost_at"),
  lostReason: text("lost_reason"),
  // Vinculação com conversa do WhatsApp
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_funnel_deals_stage").on(table.stageId),
  index("idx_funnel_deals_priority").on(table.priority),
  index("idx_funnel_deals_contact").on(table.contactPhone),
]);

// Histórico de Movimentações de Deals
export const dealHistory = pgTable("deal_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dealId: varchar("deal_id").notNull().references(() => funnelDeals.id, { onDelete: 'cascade' }),
  fromStageId: varchar("from_stage_id").references(() => funnelStages.id, { onDelete: 'set null' }),
  toStageId: varchar("to_stage_id").references(() => funnelStages.id, { onDelete: 'set null' }),
  action: varchar("action", { length: 50 }).notNull(), // created, moved, updated, won, lost
  notes: text("notes"),
  performedBy: varchar("performed_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_deal_history_deal").on(table.dealId),
  index("idx_deal_history_date").on(table.createdAt),
]);

export const grupoOlxIntegrations = pgTable("grupo_olx_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).default("inactive").notNull(),
  token: varchar("token", { length: 128 }).notNull(),
  connectionId: varchar("connection_id").references(() => whatsappConnections.id, { onDelete: "set null" }),
  xmlFeedUrl: text("xml_feed_url"),
  catalogSyncEnabled: boolean("catalog_sync_enabled").default(true).notNull(),
  leadEmailSyncEnabled: boolean("lead_email_sync_enabled").default(true).notNull(),
  matonApiKey: text("maton_api_key"),
  matonConnectionId: varchar("maton_connection_id", { length: 255 }),
  matonInboxEmail: varchar("maton_inbox_email", { length: 255 }),
  matonSenderFilter: varchar("maton_sender_filter", { length: 255 }).default("comunica.zapimoveis.com.br"),
  syncToAi: boolean("sync_to_ai").default(true).notNull(),
  createDealEnabled: boolean("create_deal_enabled").default(false).notNull(),
  funnelId: varchar("funnel_id").references(() => salesFunnels.id, { onDelete: "set null" }),
  stageId: varchar("stage_id").references(() => funnelStages.id, { onDelete: "set null" }),
  aiVariation: varchar("ai_variation", { length: 50 }).default("consultivo").notNull(),
  autoReplyTemplate: text("auto_reply_template"),
  lastCatalogSyncAt: timestamp("last_catalog_sync_at"),
  lastCatalogSyncStatus: varchar("last_catalog_sync_status", { length: 50 }).default("idle").notNull(),
  lastCatalogSyncMessage: text("last_catalog_sync_message"),
  lastLeadSyncAt: timestamp("last_lead_sync_at"),
  lastLeadSyncStatus: varchar("last_lead_sync_status", { length: 50 }).default("idle").notNull(),
  lastLeadSyncMessage: text("last_lead_sync_message"),
  active: boolean("active").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_grupo_olx_integrations_user").on(table.userId),
  uniqueIndex("idx_grupo_olx_integrations_token").on(table.token),
  index("idx_grupo_olx_integrations_active").on(table.active),
]);

export const grupoOlxLeadEvents = pgTable("grupo_olx_lead_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id").notNull().references(() => grupoOlxIntegrations.id, { onDelete: "cascade" }),
  originLeadId: varchar("origin_lead_id", { length: 255 }).notNull(),
  clientListingId: varchar("client_listing_id", { length: 255 }),
  portalSource: varchar("portal_source", { length: 100 }).default("Grupo OLX").notNull(),
  leadType: varchar("lead_type", { length: 100 }),
  contactName: varchar("contact_name", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  dealId: varchar("deal_id").references(() => funnelDeals.id, { onDelete: "set null" }),
  status: varchar("status", { length: 50 }).default("received").notNull(),
  errorMessage: text("error_message"),
  rawPayload: jsonb("raw_payload").default({}).notNull(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_grupo_olx_lead_events_integration").on(table.integrationId),
  index("idx_grupo_olx_lead_events_status").on(table.status),
  index("idx_grupo_olx_lead_events_created").on(table.createdAt),
  uniqueIndex("idx_grupo_olx_lead_events_unique_origin").on(table.integrationId, table.originLeadId),
]);

export const grupoOlxListings = pgTable("grupo_olx_listings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id").notNull().references(() => grupoOlxIntegrations.id, { onDelete: "cascade" }),
  externalListingId: varchar("external_listing_id", { length: 255 }).notNull(),
  listingCode: varchar("listing_code", { length: 255 }),
  title: text("title").notNull(),
  transactionType: varchar("transaction_type", { length: 100 }),
  propertyType: varchar("property_type", { length: 100 }),
  publicationType: varchar("publication_type", { length: 100 }),
  description: text("description"),
  detailUrl: text("detail_url"),
  imageUrl: text("image_url"),
  price: numeric("price", { precision: 12, scale: 2 }),
  condoFee: numeric("condo_fee", { precision: 12, scale: 2 }),
  yearlyTax: numeric("yearly_tax", { precision: 12, scale: 2 }),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  suites: integer("suites"),
  garage: integer("garage"),
  livingArea: numeric("living_area", { precision: 12, scale: 2 }),
  lotArea: numeric("lot_area", { precision: 12, scale: 2 }),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 100 }),
  neighborhood: varchar("neighborhood", { length: 255 }),
  address: text("address"),
  searchableText: text("searchable_text"),
  features: jsonb("features").$type<string[]>().default([]).notNull(),
  rawPayload: jsonb("raw_payload").default({}).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_grupo_olx_listings_integration").on(table.integrationId),
  index("idx_grupo_olx_listings_city").on(table.city),
  index("idx_grupo_olx_listings_neighborhood").on(table.neighborhood),
  index("idx_grupo_olx_listings_active").on(table.isActive),
  uniqueIndex("idx_grupo_olx_listings_unique_external").on(table.integrationId, table.externalListingId),
]);

export const googleSheetLeadIntegrations = pgTable("google_sheet_lead_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sheetId: varchar("sheet_id", { length: 255 }).notNull(),
  sheetName: varchar("sheet_name", { length: 255 }).default("Pagina1").notNull(),
  sheetGid: varchar("sheet_gid", { length: 64 }),
  matonConnectionId: varchar("maton_connection_id", { length: 255 }),
  targetWhatsappNumber: varchar("target_whatsapp_number", { length: 50 }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  connectionId: varchar("connection_id").references(() => whatsappConnections.id, { onDelete: "set null" }),
  pollIntervalMinutes: integer("poll_interval_minutes").default(5).notNull(),
  messageTemplate: text("message_template"),
  active: boolean("active").default(true).notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: varchar("last_sync_status", { length: 50 }).default("idle").notNull(),
  lastSyncMessage: text("last_sync_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_google_sheet_lead_integrations_sheet").on(table.sheetId, table.sheetName),
  index("idx_google_sheet_lead_integrations_active").on(table.active),
]);

export const googleSheetLeadEvents = pgTable("google_sheet_lead_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id").notNull().references(() => googleSheetLeadIntegrations.id, { onDelete: "cascade" }),
  sourceRowNumber: integer("source_row_number").notNull(),
  sourceRowHash: varchar("source_row_hash", { length: 128 }).notNull(),
  leadName: varchar("lead_name", { length: 255 }),
  leadPhone: varchar("lead_phone", { length: 50 }),
  leadEmail: varchar("lead_email", { length: 255 }),
  leadCompany: varchar("lead_company", { length: 255 }),
  formId: varchar("form_id", { length: 255 }),
  submittedAt: timestamp("submitted_at"),
  status: varchar("status", { length: 50 }).default("received").notNull(),
  messageText: text("message_text"),
  errorMessage: text("error_message"),
  metaCapiStatus: varchar("meta_capi_status", { length: 50 }),
  metaCapiEventName: varchar("meta_capi_event_name", { length: 100 }),
  metaCapiEventId: varchar("meta_capi_event_id", { length: 255 }),
  metaCapiSentAt: timestamp("meta_capi_sent_at"),
  metaCapiError: text("meta_capi_error"),
  rawPayload: jsonb("raw_payload").default({}).notNull(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_google_sheet_lead_events_integration").on(table.integrationId),
  index("idx_google_sheet_lead_events_status").on(table.status),
  index("idx_google_sheet_lead_events_created").on(table.createdAt),
  uniqueIndex("idx_google_sheet_lead_events_row_hash").on(table.integrationId, table.sourceRowHash),
]);

// Relations
export const salesFunnelsRelations = relations(salesFunnels, ({ one, many }) => ({
  user: one(users, { fields: [salesFunnels.userId], references: [users.id] }),
  stages: many(funnelStages),
}));

export const funnelStagesRelations = relations(funnelStages, ({ one, many }) => ({
  funnel: one(salesFunnels, { fields: [funnelStages.funnelId], references: [salesFunnels.id] }),
  deals: many(funnelDeals),
}));

export const funnelDealsRelations = relations(funnelDeals, ({ one, many }) => ({
  stage: one(funnelStages, { fields: [funnelDeals.stageId], references: [funnelStages.id] }),
  conversation: one(conversations, { fields: [funnelDeals.conversationId], references: [conversations.id] }),
  history: many(dealHistory),
}));

export const dealHistoryRelations = relations(dealHistory, ({ one }) => ({
  deal: one(funnelDeals, { fields: [dealHistory.dealId], references: [funnelDeals.id] }),
  fromStage: one(funnelStages, { fields: [dealHistory.fromStageId], references: [funnelStages.id] }),
  toStage: one(funnelStages, { fields: [dealHistory.toStageId], references: [funnelStages.id] }),
}));

// Schemas Zod para validação
export const insertSalesFunnelSchema = createInsertSchema(salesFunnels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFunnelStageSchema = createInsertSchema(funnelStages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFunnelDealSchema = createInsertSchema(funnelDeals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGrupoOlxIntegrationSchema = createInsertSchema(grupoOlxIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGrupoOlxLeadEventSchema = createInsertSchema(grupoOlxLeadEvents).omit({
  id: true,
  createdAt: true,
});

export const insertGrupoOlxListingSchema = createInsertSchema(grupoOlxListings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGoogleSheetLeadIntegrationSchema = createInsertSchema(googleSheetLeadIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGoogleSheetLeadEventSchema = createInsertSchema(googleSheetLeadEvents).omit({
  id: true,
  createdAt: true,
});

// Types
export type SalesFunnel = typeof salesFunnels.$inferSelect;
export type InsertSalesFunnel = z.infer<typeof insertSalesFunnelSchema>;
export type FunnelStage = typeof funnelStages.$inferSelect;
export type InsertFunnelStage = z.infer<typeof insertFunnelStageSchema>;
export type FunnelDeal = typeof funnelDeals.$inferSelect;
export type InsertFunnelDeal = z.infer<typeof insertFunnelDealSchema>;
export type DealHistoryItem = typeof dealHistory.$inferSelect;
export type GrupoOlxIntegration = typeof grupoOlxIntegrations.$inferSelect;
export type InsertGrupoOlxIntegration = z.infer<typeof insertGrupoOlxIntegrationSchema>;
export type GrupoOlxLeadEvent = typeof grupoOlxLeadEvents.$inferSelect;
export type InsertGrupoOlxLeadEvent = z.infer<typeof insertGrupoOlxLeadEventSchema>;
export type GrupoOlxListing = typeof grupoOlxListings.$inferSelect;
export type InsertGrupoOlxListing = z.infer<typeof insertGrupoOlxListingSchema>;
export type GoogleSheetLeadIntegration = typeof googleSheetLeadIntegrations.$inferSelect;
export type InsertGoogleSheetLeadIntegration = z.infer<typeof insertGoogleSheetLeadIntegrationSchema>;
export type GoogleSheetLeadEvent = typeof googleSheetLeadEvents.$inferSelect;
export type InsertGoogleSheetLeadEvent = z.infer<typeof insertGoogleSheetLeadEventSchema>;

// ==================== SISTEMA DE AGENDAMENTOS ====================

// Configuração de agendamento por usuário
export const schedulingConfig = pgTable("scheduling_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  
  // Status
  isEnabled: boolean("is_enabled").default(false).notNull(),
  
  // Informações do local/serviço
  serviceName: varchar("service_name", { length: 255 }),
  serviceDuration: integer("service_duration").default(60), // Duração em minutos
  location: varchar("location", { length: 500 }),
  locationType: varchar("location_type", { length: 50 }).default("presencial"), // presencial, online, ambos
  
  // Dias disponíveis (array de 0-6, onde 0=Domingo)
  availableDays: jsonb("available_days").default([1,2,3,4,5]),
  
  // Horários de funcionamento
  workStartTime: varchar("work_start_time", { length: 10 }).default("09:00"),
  workEndTime: varchar("work_end_time", { length: 10 }).default("18:00"),
  
  // Intervalos de almoço/pausa
  breakStartTime: varchar("break_start_time", { length: 10 }).default("12:00"),
  breakEndTime: varchar("break_end_time", { length: 10 }).default("13:00"),
  hasBreak: boolean("has_break").default(true),
  
  // Configurações avançadas
  slotDuration: integer("slot_duration").default(60), // Duração de cada slot em minutos
  bufferBetweenAppointments: integer("buffer_between_appointments").default(15),
  maxAppointmentsPerDay: integer("max_appointments_per_day").default(10),
  advanceBookingDays: integer("advance_booking_days").default(30), // Quantos dias à frente pode agendar
  minBookingNoticeHours: integer("min_booking_notice_hours").default(2), // Mínimo de antecedência
  
  // Configurações de confirmação
  requireConfirmation: boolean("require_confirmation").default(true), // IA confirma antes de agendar
  autoConfirm: boolean("auto_confirm").default(false), // Agendar automaticamente
  allowCancellation: boolean("allow_cancellation").default(true), // Permitir cancelamento pelo cliente via IA
  sendReminder: boolean("send_reminder").default(true),
  reminderHoursBefore: integer("reminder_hours_before").default(24),
  reminderTimes: jsonb("reminder_times").default([24]),
  bookingNotificationEnabled: boolean("booking_notification_enabled").default(false),
  bookingNotificationPhone: varchar("booking_notification_phone", { length: 50 }),
  slotSuggestionMode: varchar("slot_suggestion_mode", { length: 40 }).default("first_available"),
  
  // Google Calendar
  googleCalendarEnabled: boolean("google_calendar_enabled").default(false),
  googleCalendarId: varchar("google_calendar_id", { length: 255 }),
  googleSyncMode: varchar("google_sync_mode", { length: 50 }).default("two_way"),
  
  // Serviços e Profissionais
  useServices: boolean("use_services").default(false),
  useProfessionals: boolean("use_professionals").default(false),
  aiSchedulingEnabled: boolean("ai_scheduling_enabled").default(true),
  aiCanSuggestService: boolean("ai_can_suggest_service").default(true),
  aiCanSuggestProfessional: boolean("ai_can_suggest_professional").default(true),
  
  // Link público de agendamento
  publicBookingEnabled: boolean("public_booking_enabled").default(false),
  bookingLinkSlug: varchar("booking_link_slug", { length: 100 }),
  
  // Mensagens personalizadas
  confirmationMessage: text("confirmation_message").default("Seu agendamento foi confirmado! 📅"),
  reminderMessage: text("reminder_message").default("Lembrete: Você tem um agendamento amanhã!"),
  cancellationMessage: text("cancellation_message").default("Seu agendamento foi cancelado."),
  
  // Metadados
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Agendamentos
export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: 'set null' }),
  
  // Informações do cliente
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientPhone: varchar("client_phone", { length: 50 }).notNull(),
  clientEmail: varchar("client_email", { length: 255 }),
  
  // Detalhes do agendamento
  serviceName: varchar("service_name", { length: 255 }),
  appointmentDate: varchar("appointment_date", { length: 20 }).notNull(), // YYYY-MM-DD
  startTime: varchar("start_time", { length: 10 }).notNull(), // HH:mm
  endTime: varchar("end_time", { length: 10 }).notNull(), // HH:mm
  durationMinutes: integer("duration_minutes").default(60),
  
  // Serviço e Profissional
  serviceId: varchar("service_id").references(() => schedulingServices.id, { onDelete: 'set null' }),
  professionalId: varchar("professional_id").references(() => schedulingProfessionals.id, { onDelete: 'set null' }),
  professionalName: varchar("professional_name", { length: 255 }),
  
  // Local
  location: varchar("location", { length: 500 }),
  locationType: varchar("location_type", { length: 50 }).default("presencial"),
  meetingLink: varchar("meeting_link", { length: 500 }),
  
  // Status do agendamento
  status: varchar("status", { length: 50 }).default("pending"), // pending, confirmed, cancelled, completed, no_show
  
  // Confirmações
  confirmedByClient: boolean("confirmed_by_client").default(false),
  confirmedByBusiness: boolean("confirmed_by_business").default(false),
  confirmedAt: timestamp("confirmed_at"),
  
  // Cancelamento
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: varchar("cancelled_by", { length: 50 }),
  cancellationReason: text("cancellation_reason"),
  
  // Lembretes
  reminderSent: boolean("reminder_sent").default(false),
  reminderSentAt: timestamp("reminder_sent_at"),
  reminderTimesSent: jsonb("reminder_times_sent").default([]),
  
  // Google Calendar
  googleEventId: varchar("google_event_id", { length: 255 }),
  googleCalendarSynced: boolean("google_calendar_synced").default(false),
  
  // Notas
  clientNotes: text("client_notes"),
  internalNotes: text("internal_notes"),

  // Mensagem personalizada (agendamento manual)
  customMessage: text("custom_message"),
  useCustomMessage: boolean("use_custom_message").default(false),
  customMessageSentAt: timestamp("custom_message_sent_at"),
  
  // IA
  createdByAi: boolean("created_by_ai").default(false),
  aiConfirmationPending: boolean("ai_confirmation_pending").default(false),
  aiConversationContext: jsonb("ai_conversation_context"),
  
  // Metadados
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_appointments_user_date").on(table.userId, table.appointmentDate),
  index("idx_appointments_status").on(table.status),
  index("idx_appointments_client_phone").on(table.clientPhone),
]);

// Tokens do Google Calendar
export const googleCalendarTokens = pgTable("google_calendar_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenType: varchar("token_type", { length: 50 }),
  expiryDate: timestamp("expiry_date"),
  scope: text("scope"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Google Contacts para /contatos-sincronizados
export const googleContactsConfigs = pgTable("google_contacts_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenType: varchar("google_token_type", { length: 50 }),
  googleExpiryDate: timestamp("google_expiry_date"),
  googleScope: text("google_scope"),
  googleEmail: text("google_email"),
  autoCreateBeforeReply: boolean("auto_create_before_reply").default(true).notNull(),
  syncToken: text("sync_token"),
  lastFullSyncAt: timestamp("last_full_sync_at"),
  lastIncrementalSyncAt: timestamp("last_incremental_sync_at"),
  lastSyncStatus: varchar("last_sync_status", { length: 40 }),
  lastSyncMessage: text("last_sync_message"),
  lastImportedCount: integer("last_imported_count").default(0).notNull(),
  lastCreatedContactAt: timestamp("last_created_contact_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("google_contacts_configs_user_idx").on(table.userId),
]);

export const googleContactsEntries = pgTable("google_contacts_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  resourceName: text("resource_name"),
  etag: text("etag"),
  displayName: text("display_name"),
  phoneNumber: text("phone_number"),
  normalizedPhone: text("normalized_phone"),
  email: text("email"),
  createdByAgentezap: boolean("created_by_agentezap").default(false).notNull(),
  source: varchar("source", { length: 40 }).default("google_contacts").notNull(),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
  googleCreatedAt: timestamp("google_created_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("google_contacts_entries_user_resource_unique").on(table.userId, table.resourceName).where(sql`${table.resourceName} IS NOT NULL`),
  uniqueIndex("google_contacts_entries_user_phone_unique").on(table.userId, table.normalizedPhone).where(sql`${table.normalizedPhone} IS NOT NULL`),
  index("google_contacts_entries_user_synced_idx").on(table.userId, table.lastSyncedAt),
]);

// Exceções de horário (feriados, dias bloqueados)
export const schedulingExceptions = pgTable("scheduling_exceptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  exceptionDate: varchar("exception_date", { length: 20 }).notNull(), // YYYY-MM-DD
  exceptionType: varchar("exception_type", { length: 50 }).notNull(), // blocked, modified_hours, holiday
  
  // Se modified_hours
  customStartTime: varchar("custom_start_time", { length: 10 }),
  customEndTime: varchar("custom_end_time", { length: 10 }),
  
  reason: varchar("reason", { length: 255 }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_scheduling_exceptions_user_date").on(table.userId, table.exceptionDate),
]);

// ==================== WHATSAPP STATUS (AGENDADO/ROTATIVO) ====================

export const scheduledStatus = pgTable("scheduled_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  statusText: text("status_text").notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  recurrenceType: varchar("recurrence_type", { length: 20 }).default("none").notNull(),
  recurrenceInterval: integer("recurrence_interval").default(1).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  lastSentAt: timestamp("last_sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_scheduled_status_user").on(table.userId),
  index("idx_scheduled_status_scheduled_for").on(table.scheduledFor),
  index("idx_scheduled_status_status").on(table.status),
]);

export const scheduledStatusRuns = pgTable("scheduled_status_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  statusId: varchar("status_id").notNull().references(() => scheduledStatus.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scheduledFor: timestamp("scheduled_for"),
  attemptedAt: timestamp("attempted_at").defaultNow(),
  status: varchar("status", { length: 20 }).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_scheduled_status_runs_status").on(table.statusId, table.attemptedAt),
  index("idx_scheduled_status_runs_user").on(table.userId, table.attemptedAt),
]);

export const statusRotation = pgTable("status_rotation", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 120 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  mode: varchar("mode", { length: 20 }).default("sequential").notNull(),
  intervalMinutes: integer("interval_minutes").default(240).notNull(),
  lastSentAt: timestamp("last_sent_at"),
  nextRunAt: timestamp("next_run_at"),
  lastItemId: varchar("last_item_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_status_rotation_user").on(table.userId),
  index("idx_status_rotation_active").on(table.isActive),
  index("idx_status_rotation_next_run").on(table.nextRunAt),
]);

export const statusRotationItems = pgTable("status_rotation_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rotationId: varchar("rotation_id").notNull().references(() => statusRotation.id, { onDelete: 'cascade' }),
  statusText: text("status_text").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  displayOrder: integer("display_order").default(0),
  weight: integer("weight").default(1),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_status_rotation_items_rotation").on(table.rotationId),
  index("idx_status_rotation_items_active").on(table.isActive),
]);

// ==================== SERVIÇOS DE AGENDAMENTO ====================

// Serviços oferecidos (ex: Corte, Escova, Manicure, Consulta)
export const schedulingServices = pgTable("scheduling_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Informações do serviço
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  price: numeric("price", { precision: 10, scale: 2 }),
  
  // Configurações
  isActive: boolean("is_active").default(true),
  allowOnline: boolean("allow_online").default(true),
  allowPresencial: boolean("allow_presencial").default(true),
  requiresCustomerAddress: boolean("requires_customer_address").default(false),
  requiresConfirmation: boolean("requires_confirmation").default(true),
  bufferBeforeMinutes: integer("buffer_before_minutes").default(0),
  bufferAfterMinutes: integer("buffer_after_minutes").default(15),
  maxPerDay: integer("max_per_day"), // limite por dia (null = ilimitado)
  
  // Visual
  color: varchar("color", { length: 20 }).default("#3b82f6"),
  icon: varchar("icon", { length: 50 }),
  
  // Ordenação
  displayOrder: integer("display_order").default(0),
  
  // Metadados
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_scheduling_services_user").on(table.userId),
  index("idx_scheduling_services_active").on(table.userId, table.isActive),
]);

// ==================== PROFISSIONAIS ====================

// Profissionais que realizam os serviços
export const schedulingProfessionals = pgTable("scheduling_professionals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Informações do profissional
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  
  // Horários de trabalho por dia da semana
  // Ex: {"1": {"start": "09:00", "end": "18:00", "break_start": "12:00", "break_end": "13:00"}}
  workSchedule: jsonb("work_schedule").default({}),
  
  // Google Calendar individual do profissional
  googleCalendarEnabled: boolean("google_calendar_enabled").default(false),
  googleCalendarId: varchar("google_calendar_id", { length: 255 }),
  googleTokensId: varchar("google_tokens_id", { length: 255 }),
  
  // Configurações
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false), // Profissional padrão quando não especificado
  acceptsOnline: boolean("accepts_online").default(true),
  acceptsPresencial: boolean("accepts_presencial").default(true),
  maxAppointmentsPerDay: integer("max_appointments_per_day").default(10),
  
  // Ordenação
  displayOrder: integer("display_order").default(0),
  
  // Metadados
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_scheduling_professionals_user").on(table.userId),
  index("idx_scheduling_professionals_active").on(table.userId, table.isActive),
]);

// ==================== RELAÇÃO PROFISSIONAL-SERVIÇO ====================

// Define quais profissionais fazem quais serviços
export const professionalServices = pgTable("professional_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  professionalId: varchar("professional_id").notNull().references(() => schedulingProfessionals.id, { onDelete: 'cascade' }),
  serviceId: varchar("service_id").notNull().references(() => schedulingServices.id, { onDelete: 'cascade' }),
  
  // Configurações específicas (override do serviço)
  customDurationMinutes: integer("custom_duration_minutes"),
  customPrice: numeric("custom_price", { precision: 10, scale: 2 }),
  
  // Ordenação
  displayOrder: integer("display_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_professional_services_professional").on(table.professionalId),
  index("idx_professional_services_service").on(table.serviceId),
]);

// Relations
export const schedulingConfigRelations = relations(schedulingConfig, ({ one }) => ({
  user: one(users, { fields: [schedulingConfig.userId], references: [users.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  user: one(users, { fields: [appointments.userId], references: [users.id] }),
  conversation: one(conversations, { fields: [appointments.conversationId], references: [conversations.id] }),
}));

export const schedulingServicesRelations = relations(schedulingServices, ({ one, many }) => ({
  user: one(users, { fields: [schedulingServices.userId], references: [users.id] }),
  professionals: many(professionalServices),
}));

export const schedulingProfessionalsRelations = relations(schedulingProfessionals, ({ one, many }) => ({
  user: one(users, { fields: [schedulingProfessionals.userId], references: [users.id] }),
  services: many(professionalServices),
}));

export const professionalServicesRelations = relations(professionalServices, ({ one }) => ({
  professional: one(schedulingProfessionals, { fields: [professionalServices.professionalId], references: [schedulingProfessionals.id] }),
  service: one(schedulingServices, { fields: [professionalServices.serviceId], references: [schedulingServices.id] }),
}));

// Schemas Zod para validação de Agendamentos
export const insertSchedulingConfigSchema = createInsertSchema(schedulingConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSchedulingExceptionSchema = createInsertSchema(schedulingExceptions).omit({
  id: true,
  createdAt: true,
});

// Schemas Zod para Serviços e Profissionais
export const insertSchedulingServiceSchema = createInsertSchema(schedulingServices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSchedulingProfessionalSchema = createInsertSchema(schedulingProfessionals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProfessionalServiceSchema = createInsertSchema(professionalServices).omit({
  id: true,
  createdAt: true,
});

export const insertScheduledStatusSchema = createInsertSchema(scheduledStatus).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSentAt: true,
});

export const insertStatusRotationSchema = createInsertSchema(statusRotation).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSentAt: true,
});

export const insertStatusRotationItemSchema = createInsertSchema(statusRotationItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSentAt: true,
});

// Types de Agendamentos
export type SchedulingConfig = typeof schedulingConfig.$inferSelect;
export type InsertSchedulingConfig = z.infer<typeof insertSchedulingConfigSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type SchedulingException = typeof schedulingExceptions.$inferSelect;
export type InsertSchedulingException = z.infer<typeof insertSchedulingExceptionSchema>;

// Types de Serviços e Profissionais
export type SchedulingService = typeof schedulingServices.$inferSelect;
export type InsertSchedulingService = z.infer<typeof insertSchedulingServiceSchema>;
export type SchedulingProfessional = typeof schedulingProfessionals.$inferSelect;
export type InsertSchedulingProfessional = z.infer<typeof insertSchedulingProfessionalSchema>;
export type ProfessionalService = typeof professionalServices.$inferSelect;
export type InsertProfessionalService = z.infer<typeof insertProfessionalServiceSchema>;
export type GoogleCalendarToken = typeof googleCalendarTokens.$inferSelect;

export type ScheduledStatus = typeof scheduledStatus.$inferSelect;
export type InsertScheduledStatus = z.infer<typeof insertScheduledStatusSchema>;
export type StatusRotation = typeof statusRotation.$inferSelect;
export type InsertStatusRotation = z.infer<typeof insertStatusRotationSchema>;
export type StatusRotationItem = typeof statusRotationItems.$inferSelect;
export type InsertStatusRotationItem = z.infer<typeof insertStatusRotationItemSchema>;

// =============================================================================
// SISTEMA DE REVENDA WHITE-LABEL
// =============================================================================

// Configuração do Revendedor
export const resellers = pgTable("resellers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  
  // Branding
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 20 }).default("#000000"),
  secondaryColor: varchar("secondary_color", { length: 20 }).default("#ffffff"),
  accentColor: varchar("accent_color", { length: 20 }).default("#22c55e"),
  companyName: varchar("company_name", { length: 255 }),
  companyDescription: text("company_description"),
  
  // Domínio customizado
  customDomain: varchar("custom_domain", { length: 255 }).unique(),
  subdomain: varchar("subdomain", { length: 100 }).unique(),
  domainVerified: boolean("domain_verified").default(false).notNull(),
  
  // Preços para clientes finais (o que o revendedor cobra dos seus clientes)
  clientMonthlyPrice: decimal("client_monthly_price", { precision: 10, scale: 2 }).default("99.99"),
  clientSetupFee: decimal("client_setup_fee", { precision: 10, scale: 2 }).default("0"),
  
  // Custo por cliente para o revendedor (paga para nós)
  costPerClient: decimal("cost_per_client", { precision: 10, scale: 2 }).default("49.99"),
  
  // Chave PIX para recebimento dos clientes
  pixKey: varchar("pix_key", { length: 255 }),
  pixKeyType: varchar("pix_key_type", { length: 20 }), // cpf, cnpj, email, phone, random
  pixHolderName: varchar("pix_holder_name", { length: 255 }), // Nome do titular da conta
  pixBankName: varchar("pix_bank_name", { length: 100 }), // Nome do banco (Nubank, Inter, etc)
  
  // Ciclo de cobrança do revendedor (quanto o revendedor paga para nós)
  billingDay: integer("billing_day").default(1), // Dia do mês para vencimento (1-28)
  nextPaymentDate: timestamp("next_payment_date"), // Próximo vencimento do revendedor
  resellerStatus: varchar("reseller_status", { length: 50 }).default("active"), // active, suspended, cancelled
  
  // Configurações
  isActive: boolean("is_active").default(true).notNull(),
  maxClients: integer("max_clients").default(100),
  
  // Textos customizados
  welcomeMessage: text("welcome_message"),
  supportEmail: varchar("support_email", { length: 255 }),
  supportPhone: varchar("support_phone", { length: 50 }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_resellers_user").on(table.userId),
  index("idx_resellers_domain").on(table.customDomain),
  index("idx_resellers_subdomain").on(table.subdomain),
]);

// Clientes do Revendedor
export const resellerClients = pgTable("reseller_clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resellerId: varchar("reseller_id").notNull().references(() => resellers.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  
  // Status
  status: varchar("status", { length: 50 }).default("active").notNull(), // active, suspended, cancelled, pending
  
  // Financeiro (cobra do revendedor por este cliente)
  monthlyCost: decimal("monthly_cost", { precision: 10, scale: 2 }).default("49.99"),
  
  // Preço que o revendedor cobra deste cliente específico
  clientPrice: decimal("client_price", { precision: 10, scale: 2 }),
  
  // Se é cliente gratuito (demo/teste - 1 por revendedor)
  isFreeClient: boolean("is_free_client").default(false).notNull(),
  
  // Dia de vencimento deste cliente específico
  billingDay: integer("billing_day").default(1), // Dia do mês (1-28)

  // SaaS Payment Control (Added for Granular Payments)
  saasPaidUntil: timestamp("saas_paid_until"),
  saasStatus: varchar("saas_status", { length: 20 }).default("active"), // active, overdue

  // Assinatura MercadoPago
  mpSubscriptionId: varchar("mp_subscription_id", { length: 255 }),
  mpStatus: varchar("mp_status", { length: 50 }),
  nextPaymentDate: timestamp("next_payment_date"),
  
  // Datas
  activatedAt: timestamp("activated_at").defaultNow(),
  suspendedAt: timestamp("suspended_at"),
  cancelledAt: timestamp("cancelled_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_reseller_clients_reseller").on(table.resellerId),
  index("idx_reseller_clients_user").on(table.userId),
  index("idx_reseller_clients_status").on(table.status),
]);

// Pagamentos do Revendedor (por cliente criado)
export const resellerPayments = pgTable("reseller_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resellerId: varchar("reseller_id").notNull().references(() => resellers.id, { onDelete: 'cascade' }),
  resellerClientId: varchar("reseller_client_id").references(() => resellerClients.id, { onDelete: 'set null' }),
  
  // Valores
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentType: varchar("payment_type", { length: 50 }).notNull(), // client_creation, recurring, setup_fee, monthly_fee
  
  // Status
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, approved, rejected, refunded
  statusDetail: varchar("status_detail", { length: 100 }),
  
  // Referência da Fatura (para sistema de faturas mensais)
  referenceMonth: varchar("reference_month", { length: 7 }), // Formato: YYYY-MM (ex: 2025-01)
  dueDate: timestamp("due_date"), // Data de vencimento da fatura
  
  // MercadoPago
  mpPaymentId: varchar("mp_payment_id", { length: 255 }),
  mpSubscriptionId: varchar("mp_subscription_id", { length: 255 }),
  paymentMethod: varchar("payment_method", { length: 50 }), // credit_card, pix, manual
  
  // Informações do pagador
  payerEmail: varchar("payer_email", { length: 255 }),
  cardLastFourDigits: varchar("card_last_four_digits", { length: 4 }),
  cardBrand: varchar("card_brand", { length: 50 }),
  
  // Descrição
  description: text("description"),
  
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_reseller_payments_reseller").on(table.resellerId),
  index("idx_reseller_payments_client").on(table.resellerClientId),
  index("idx_reseller_payments_status").on(table.status),
  index("idx_reseller_payments_date").on(table.createdAt),
  index("idx_reseller_payments_reference").on(table.referenceMonth),
]);

// Lembretes de pagamento (reseller -> cliente)
export const paymentReminders = pgTable("payment_reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resellerId: varchar("reseller_id").references(() => resellers.id, { onDelete: 'cascade' }),
  resellerClientId: varchar("reseller_client_id").references(() => resellerClients.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  scheduledFor: timestamp("scheduled_for").notNull(),
  dueDate: timestamp("due_date"),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  reminderType: varchar("reminder_type", { length: 30 }).default("before_due"),
  daysOffset: integer("days_offset"),
  messageTemplate: text("message_template"),
  messageFinal: text("message_final"),
  aiPrompt: text("ai_prompt"),
  aiUsed: boolean("ai_used").default(true),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  sentAt: timestamp("sent_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_payment_reminders_reseller").on(table.resellerId),
  index("idx_payment_reminders_client").on(table.resellerClientId),
  index("idx_payment_reminders_user").on(table.userId),
  index("idx_payment_reminders_scheduled_for").on(table.scheduledFor),
  index("idx_payment_reminders_status").on(table.status),
]);

// Relations para Resellers
export const resellersRelations = relations(resellers, ({ one, many }) => ({
  user: one(users, { fields: [resellers.userId], references: [users.id] }),
  clients: many(resellerClients),
  payments: many(resellerPayments),
  invoices: many(resellerInvoices),
}));

export const resellerClientsRelations = relations(resellerClients, ({ one, many }) => ({
  reseller: one(resellers, { fields: [resellerClients.resellerId], references: [resellers.id] }),
  user: one(users, { fields: [resellerClients.userId], references: [users.id] }),
  payments: many(resellerPayments),
}));

export const resellerPaymentsRelations = relations(resellerPayments, ({ one }) => ({
  reseller: one(resellers, { fields: [resellerPayments.resellerId], references: [resellers.id] }),
  client: one(resellerClients, { fields: [resellerPayments.resellerClientId], references: [resellerClients.id] }),
}));

// Tabela de faturas do revendedor para o sistema (Flow 2: Reseller -> System)
export const resellerInvoices = pgTable("reseller_invoices", {
  id: serial("id").primaryKey(),
  resellerId: varchar("reseller_id", { length: 255 }).notNull().references(() => resellers.id, { onDelete: "cascade" }),
  referenceMonth: varchar("reference_month", { length: 7 }).notNull(), // Formato: "2025-01"
  dueDate: date("due_date").notNull(),
  activeClients: integer("active_clients").notNull().default(0),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull().default("49.99"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, paid, overdue
  paymentMethod: varchar("payment_method", { length: 20 }), // pix, card
  mpPaymentId: varchar("mp_payment_id", { length: 100 }),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_reseller_invoices_reseller").on(table.resellerId),
  index("idx_reseller_invoices_status").on(table.status),
  index("idx_reseller_invoices_due_date").on(table.dueDate),
]);

// Items da fatura do revendedor (para pagamentos granulares)
export const resellerInvoiceItems = pgTable("reseller_invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => resellerInvoices.id, { onDelete: "cascade" }),
  resellerClientId: varchar("reseller_client_id", { length: 255 }).references(() => resellerClients.id, { onDelete: "set null" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: varchar("description", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_reseller_invoice_items_invoice").on(table.invoiceId),
  index("idx_reseller_invoice_items_client").on(table.resellerClientId),
]);

export const resellerInvoicesRelations = relations(resellerInvoices, ({ one, many }) => ({
  reseller: one(resellers, { fields: [resellerInvoices.resellerId], references: [resellers.id] }),
  items: many(resellerInvoiceItems),
}));

export const resellerInvoiceItemsRelations = relations(resellerInvoiceItems, ({ one }) => ({
  invoice: one(resellerInvoices, { fields: [resellerInvoiceItems.invoiceId], references: [resellerInvoices.id] }),
  client: one(resellerClients, { fields: [resellerInvoiceItems.resellerClientId], references: [resellerClients.id] }),
}));

// Schemas Zod para validação de Resellers
export const insertResellerSchema = createInsertSchema(resellers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const resellerSchema = z.object({
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#000000"),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#ffffff"),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#22c55e"),
  companyName: z.string().min(1).max(255),
  companyDescription: z.string().optional(),
  customDomain: z.string().max(255).optional().nullable(),
  subdomain: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/).optional().nullable(),
  clientMonthlyPrice: z.string().or(z.number()).transform(v => String(v)).default("99.99"),
  clientSetupFee: z.string().or(z.number()).transform(v => String(v)).default("0"),
  welcomeMessage: z.string().optional(),
  supportEmail: z.string().email().optional().nullable(),
  supportPhone: z.string().max(50).optional().nullable(),
});

export const insertResellerClientSchema = createInsertSchema(resellerClients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertResellerPaymentSchema = createInsertSchema(resellerPayments).omit({
  id: true,
  createdAt: true,
});

export const insertPaymentReminderSchema = createInsertSchema(paymentReminders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sentAt: true,
});

export const insertResellerInvoiceSchema = createInsertSchema(resellerInvoices).omit({
  id: true,
  createdAt: true,
});

export const insertResellerInvoiceItemsSchema = createInsertSchema(resellerInvoiceItems).omit({
  id: true,
  createdAt: true,
});

// Types para Resellers
export type Reseller = typeof resellers.$inferSelect;
export type InsertReseller = z.infer<typeof insertResellerSchema>;
export type ResellerInput = z.infer<typeof resellerSchema>;
export type ResellerClient = typeof resellerClients.$inferSelect;
export type InsertResellerClient = z.infer<typeof insertResellerClientSchema>;
export type ResellerPayment = typeof resellerPayments.$inferSelect;
export type InsertResellerPayment = z.infer<typeof insertResellerPaymentSchema>;
export type PaymentReminder = typeof paymentReminders.$inferSelect;
export type InsertPaymentReminder = z.infer<typeof insertPaymentReminderSchema>;
export type ResellerInvoice = typeof resellerInvoices.$inferSelect;
export type InsertResellerInvoice = z.infer<typeof insertResellerInvoiceSchema>;
export type ResellerInvoiceItem = typeof resellerInvoiceItems.$inferSelect;
export type InsertResellerInvoiceItem = z.infer<typeof insertResellerInvoiceItemsSchema>;

// =============================================================================
// CUSTOM FIELDS - Campos Personalizados para Conversas
// Similar ao Digisac: Nome do Responsável, Empresa, Email, CPF/CNPJ, etc.
// =============================================================================

// Definições de campos personalizados (estrutura do formulário)
export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Identificação
  name: varchar("name", { length: 100 }).notNull(), // Nome interno único
  label: varchar("label", { length: 100 }).notNull(), // Label exibido no formulário
  
  // Tipo do campo
  fieldType: varchar("field_type", { length: 50 }).default("text").notNull(),
  // Tipos suportados: text, email, phone, cpf_cnpj, number, date, select, textarea
  
  // Opções para select
  options: jsonb("options").$type<string[]>().default([]),
  
  // Validação e UX
  required: boolean("required").default(false),
  placeholder: varchar("placeholder", { length: 255 }),
  helpText: text("help_text"),
  
  // Auto-extração IA
  aiExtractionPrompt: text("ai_extraction_prompt"), // Prompt para IA extrair automaticamente
  aiExtractionEnabled: boolean("ai_extraction_enabled").default(true),
  
  // Ordenação e status
  position: integer("position").default(0),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_custom_field_defs_user").on(table.userId),
  uniqueIndex("idx_custom_field_defs_unique_name").on(table.userId, table.name),
]);

// Valores dos campos personalizados por conversa
export const customFieldValues = pgTable("custom_field_values", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  fieldDefinitionId: varchar("field_definition_id").notNull().references(() => customFieldDefinitions.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  
  // Valor preenchido
  value: text("value"),
  
  // Metadados de extração automática
  autoExtracted: boolean("auto_extracted").default(false),
  extractionSource: text("extraction_source"), // Trecho da conversa
  extractionConfidence: decimal("extraction_confidence", { precision: 3, scale: 2 }), // 0.00 a 1.00
  
  // Auditoria
  lastEditedBy: varchar("last_edited_by", { length: 50 }).default("user"), // user, ai, system
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_custom_field_vals_conv").on(table.conversationId),
  index("idx_custom_field_vals_def").on(table.fieldDefinitionId),
  uniqueIndex("idx_custom_field_vals_unique").on(table.fieldDefinitionId, table.conversationId),
]);

// Relations para Custom Fields
export const customFieldDefinitionsRelations = relations(customFieldDefinitions, ({ one, many }) => ({
  user: one(users, {
    fields: [customFieldDefinitions.userId],
    references: [users.id],
  }),
  values: many(customFieldValues),
}));

export const customFieldValuesRelations = relations(customFieldValues, ({ one }) => ({
  definition: one(customFieldDefinitions, {
    fields: [customFieldValues.fieldDefinitionId],
    references: [customFieldDefinitions.id],
  }),
  conversation: one(conversations, {
    fields: [customFieldValues.conversationId],
    references: [conversations.id],
  }),
}));

// Schemas Zod para Custom Fields
export const insertCustomFieldDefinitionSchema = createInsertSchema(customFieldDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const customFieldDefinitionSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e underscore"),
  label: z.string().min(1).max(100),
  fieldType: z.enum(["text", "email", "phone", "cpf_cnpj", "number", "date", "select", "textarea"]).default("text"),
  options: z.array(z.string()).default([]),
  required: z.boolean().default(false),
  placeholder: z.string().max(255).optional(),
  helpText: z.string().optional(),
  aiExtractionPrompt: z.string().optional(),
  aiExtractionEnabled: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const insertCustomFieldValueSchema = createInsertSchema(customFieldValues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const customFieldValueSchema = z.object({
  fieldDefinitionId: z.string(),
  conversationId: z.string(),
  value: z.string().optional().nullable(),
  autoExtracted: z.boolean().default(false),
  extractionSource: z.string().optional(),
  extractionConfidence: z.string().or(z.number()).optional(),
  lastEditedBy: z.enum(["user", "ai", "system"]).default("user"),
});

// Types para Custom Fields
export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type InsertCustomFieldDefinition = z.infer<typeof insertCustomFieldDefinitionSchema>;
export type CustomFieldDefinitionInput = z.infer<typeof customFieldDefinitionSchema>;
export type CustomFieldValue = typeof customFieldValues.$inferSelect;
export type InsertCustomFieldValue = z.infer<typeof insertCustomFieldValueSchema>;
export type CustomFieldValueInput = z.infer<typeof customFieldValueSchema>;

// ======================================
// TABELAS DE PRODUTOS (Catálogo)
// ======================================

// Tabela de produtos do cliente
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }),
  stock: integer("stock").default(0),
  controlStock: boolean("control_stock").default(false).notNull(),
  description: text("description"),
  sendDescriptionWithImages: boolean("send_description_with_images").default(false).notNull(),
  category: text("category"),
  imageUrl: text("image_url"),
  link: text("link"),
  sku: text("sku"),
  unit: text("unit").default("un"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const productMedia = pgTable("product_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  storageUrl: text("storage_url").notNull(),
  storagePath: text("storage_path"),
  fileName: varchar("file_name", { length: 500 }),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  caption: text("caption"),
  variationCode: integer("variation_code"),
  variationName: varchar("variation_name", { length: 255 }),
  variationPrice: numeric("variation_price", { precision: 12, scale: 2 }),
  variationStock: integer("variation_stock"),
  variationIsActive: boolean("variation_is_active").default(true).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_product_media_product").on(table.productId),
  index("idx_product_media_user").on(table.userId),
  index("idx_product_media_order").on(table.productId, table.displayOrder),
  index("idx_product_media_variation_code").on(table.productId, table.variationCode),
]);

// Configuração do módulo de produtos por usuário
export const productsConfig = pgTable("products_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  isActive: boolean("is_active").default(false),
  sendToAi: boolean("send_to_ai").default(false),
  imageVariationsEnabled: boolean("image_variations_enabled").default(false).notNull(),
  aiInstructions: text("ai_instructions").default("Use esta lista de produtos para responder perguntas sobre disponibilidade, preços e detalhes dos produtos. Seja preciso com valores e quantidades."),
  displayInstructions: text("display_instructions").default("Quando o cliente pedir a lista de produtos, mostre cada produto em uma linha com nome, preço e disponibilidade."),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations para Products
export const productsRelations = relations(products, ({ one, many }) => ({
  user: one(users, {
    fields: [products.userId],
    references: [users.id],
  }),
  mediaItems: many(productMedia),
}));

export const productMediaRelations = relations(productMedia, ({ one }) => ({
  product: one(products, {
    fields: [productMedia.productId],
    references: [products.id],
  }),
  user: one(users, {
    fields: [productMedia.userId],
    references: [users.id],
  }),
}));

export const productsConfigRelations = relations(productsConfig, ({ one }) => ({
  user: one(users, {
    fields: [productsConfig.userId],
    references: [users.id],
  }),
}));

// Schemas Zod para Products
export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const productSchema = z.object({
  name: z.string().min(1, "Nome do produto é obrigatório").max(500),
  price: z.string().or(z.number()).optional().nullable(),
  stock: z.number().int().optional().default(0),
  controlStock: z.boolean().optional().default(false),
  description: z.string().max(5000).optional().nullable(),
  sendDescriptionWithImages: z.boolean().optional().default(false),
  category: z.string().max(200).optional().nullable(),
  link: z.string().url().max(1000).optional().nullable().or(z.literal("")),
  sku: z.string().max(100).optional().nullable(),
  unit: z.string().max(50).optional().default("un"),
  isActive: z.boolean().default(true),
});

export const productMediaSchema = z.object({
  productId: z.string().uuid(),
  storageUrl: z.string().url(),
  storagePath: z.string().min(1).optional().nullable(),
  fileName: z.string().max(500).optional().nullable(),
  fileSize: z.number().int().min(0).optional().nullable(),
  mimeType: z.string().max(100).optional().nullable(),
  caption: z.string().max(1000).optional().nullable(),
  variationCode: z.number().int().min(1).optional().nullable(),
  variationName: z.string().max(255).optional().nullable(),
  variationPrice: z.string().or(z.number()).optional().nullable(),
  variationStock: z.number().int().min(0).optional().nullable(),
  variationIsActive: z.boolean().optional().default(true),
  displayOrder: z.number().int().min(0).default(0),
});

export const productMediaReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const productMediaUpdateSchema = z.object({
  caption: z.string().max(1000).optional().nullable(),
  variationName: z.string().max(255).optional().nullable(),
  variationPrice: z.string().or(z.number()).optional().nullable(),
  variationStock: z.number().int().min(0).optional().nullable(),
  variationIsActive: z.boolean().optional(),
});

export const insertProductsConfigSchema = createInsertSchema(productsConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const productsConfigSchema = z.object({
  isActive: z.boolean().default(false),
  sendToAi: z.boolean().default(false),
  imageVariationsEnabled: z.boolean().default(false),
  aiInstructions: z.string().max(2000).optional(),
  displayInstructions: z.string().max(4000).optional().nullable(),
});

// Types para Products
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ProductMedia = typeof productMedia.$inferSelect;
export type InsertProductMedia = typeof productMedia.$inferInsert;
export type ProductMediaInput = z.infer<typeof productMediaSchema>;
export type ProductMediaReorderInput = z.infer<typeof productMediaReorderSchema>;
export type ProductMediaUpdateInput = z.infer<typeof productMediaUpdateSchema>;
export type ProductsConfig = typeof productsConfig.$inferSelect;
export type InsertProductsConfig = z.infer<typeof insertProductsConfigSchema>;
export type ProductsConfigInput = z.infer<typeof productsConfigSchema>;

// =============================================================================
// SISTEMA DE DELIVERY / CARDÁPIO DIGITAL
// =============================================================================

// Configuração do módulo de delivery por usuário
export const deliveryConfig = pgTable("delivery_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  isActive: boolean("is_active").default(false),
  sendToAi: boolean("send_to_ai").default(true),
  businessName: varchar("business_name", { length: 200 }),
  businessType: varchar("business_type", { length: 50 }).default("restaurante"),
  menuSendMode: varchar("menu_send_mode", { length: 20 }).default("text"),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).default("0"),
  minOrderValue: numeric("min_order_value", { precision: 10, scale: 2 }).default("0"),
  estimatedDeliveryTime: integer("estimated_delivery_time").default(45),
  deliveryRadiusKm: numeric("delivery_radius_km", { precision: 5, scale: 2 }).default("10"),
  paymentMethods: jsonb("payment_methods").default(['dinheiro', 'cartao', 'pix']),
  acceptsDelivery: boolean("accepts_delivery").default(true),
  acceptsPickup: boolean("accepts_pickup").default(true),
  openingHours: jsonb("opening_hours").default({}),
  aiInstructions: text("ai_instructions").default("Você é um atendente de delivery. Seja simpático, ajude o cliente a escolher, anote os pedidos corretamente com todos os detalhes e sempre confirme antes de finalizar."),
  displayInstructions: text("display_instructions").default("Quando o cliente pedir o cardápio, liste cada item em uma linha separada com emoji, nome e preço. Organize por categoria."),
  whatsappOrderNumber: varchar("whatsapp_order_number", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Categorias do cardápio
export const menuCategories = pgTable("menu_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  halfHalfPricing: jsonb("half_half_pricing").$type<HalfHalfPricingConfig>().default(sql`'{"enabled":false,"mode":"highest_item","fixedPrice":null,"sizePrices":{}}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Itens do cardápio
export const menuItems = pgTable("menu_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId: varchar("category_id").references(() => menuCategories.id, { onDelete: 'set null' }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  promotionalPrice: numeric("promotional_price", { precision: 10, scale: 2 }),
  imageUrl: text("image_url"),
  preparationTime: integer("preparation_time").default(30),
  isAvailable: boolean("is_available").default(true),
  isFeatured: boolean("is_featured").default(false),
  options: jsonb("options").default([]),
  ingredients: text("ingredients"),
  allergens: text("allergens"),
  serves: integer("serves").default(1),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Pedidos de delivery
export const deliveryOrders = pgTable("delivery_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: 'set null' }),
  orderNumber: serial("order_number"),
  customerName: varchar("customer_name", { length: 200 }),
  customerPhone: varchar("customer_phone", { length: 50 }),
  customerAddress: text("customer_address"),
  customerComplement: text("customer_complement"),
  customerReference: text("customer_reference"),
  deliveryType: varchar("delivery_type", { length: 20 }).default("delivery"),
  status: varchar("status", { length: 30 }).default("pending"),
  paymentMethod: varchar("payment_method", { length: 30 }),
  paymentStatus: varchar("payment_status", { length: 20 }).default("pending"),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).default("0"),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).default("0"),
  discount: numeric("discount", { precision: 10, scale: 2 }).default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).default("0"),
  notes: text("notes"),
  estimatedTime: integer("estimated_time"),
  confirmedAt: timestamp("confirmed_at"),
  readyAt: timestamp("ready_at"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  createdByAi: boolean("created_by_ai").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Itens do pedido
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => deliveryOrders.id, { onDelete: 'cascade' }),
  menuItemId: varchar("menu_item_id").references(() => menuItems.id, { onDelete: 'set null' }),
  itemName: varchar("item_name", { length: 200 }).notNull(),
  quantity: integer("quantity").default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  optionsSelected: jsonb("options_selected").default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Carrinho de compras (sessão por conversa)
export const deliveryCarts = pgTable("delivery_carts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id").notNull(),
  items: jsonb("items").default([]),
  customerName: varchar("customer_name", { length: 200 }),
  customerPhone: varchar("customer_phone", { length: 50 }),
  customerAddress: text("customer_address"),
  deliveryType: varchar("delivery_type", { length: 20 }).default("delivery"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations para Delivery
export const deliveryConfigRelations = relations(deliveryConfig, ({ one }) => ({
  user: one(users, { fields: [deliveryConfig.userId], references: [users.id] }),
}));

export const menuCategoriesRelations = relations(menuCategories, ({ one, many }) => ({
  user: one(users, { fields: [menuCategories.userId], references: [users.id] }),
  items: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  user: one(users, { fields: [menuItems.userId], references: [users.id] }),
  category: one(menuCategories, { fields: [menuItems.categoryId], references: [menuCategories.id] }),
}));

export const deliveryOrdersRelations = relations(deliveryOrders, ({ one, many }) => ({
  user: one(users, { fields: [deliveryOrders.userId], references: [users.id] }),
  conversation: one(conversations, { fields: [deliveryOrders.conversationId], references: [conversations.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(deliveryOrders, { fields: [orderItems.orderId], references: [deliveryOrders.id] }),
  menuItem: one(menuItems, { fields: [orderItems.menuItemId], references: [menuItems.id] }),
}));

// Schemas Zod para Delivery
export const deliveryConfigSchema = z.object({
  isActive: z.boolean().default(false),
  sendToAi: z.boolean().default(true),
  businessName: z.string().max(200).optional().nullable(),
  businessType: z.enum(['pizzaria', 'lanchonete', 'restaurante', 'hamburgueria', 'acai', 'japonesa', 'outros']).default('restaurante'),
  menuSendMode: z.enum(['text', 'image', 'image_text']).default('text'),
  deliveryFee: z.string().or(z.number()).optional().default("0"),
  minOrderValue: z.string().or(z.number()).optional().default("0"),
  estimatedDeliveryTime: z.number().min(5).max(180).default(45),
  deliveryRadiusKm: z.string().or(z.number()).optional().default("10"),
  paymentMethods: z.array(z.string()).default(['dinheiro', 'cartao', 'pix']),
  acceptsDelivery: z.boolean().default(true),
  acceptsPickup: z.boolean().default(true),
  openingHours: z.record(z.any()).optional(),
  aiInstructions: z.string().max(2000).optional(),
  whatsappOrderNumber: z.string().max(20).optional().nullable(),
});

export const halfHalfPricingModeSchema = z.enum(['highest_item', 'fixed', 'size_map']);

export const halfHalfPricingSchema = z.object({
  enabled: z.boolean().default(false),
  mode: halfHalfPricingModeSchema.default('highest_item'),
  fixedPrice: z.string().or(z.number()).optional().nullable(),
  sizePrices: z.object({
    P: z.string().or(z.number()).optional().nullable(),
    M: z.string().or(z.number()).optional().nullable(),
    G: z.string().or(z.number()).optional().nullable(),
  }).default({}),
});

export type HalfHalfPricingConfigInput = z.infer<typeof halfHalfPricingSchema>;

export type HalfHalfPricingConfig = {
  enabled: boolean;
  mode: 'highest_item' | 'fixed' | 'size_map';
  fixedPrice?: string | number | null;
  sizePrices?: {
    P?: string | number | null;
    M?: string | number | null;
    G?: string | number | null;
  };
};

export const menuCategorySchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100),
  description: z.string().max(500).optional().nullable(),
  imageUrl: z.string().url().optional().nullable().or(z.literal("")),
  displayOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  halfHalfPricing: halfHalfPricingSchema.optional().default({
    enabled: false,
    mode: 'highest_item',
    fixedPrice: null,
    sizePrices: {},
  }),
});

export const menuItemSchema = z.object({
  categoryId: z.string().optional().nullable(),
  name: z.string().min(1, "Nome é obrigatório").max(200),
  description: z.string().max(1000).optional().nullable(),
  price: z.string().or(z.number()),
  promotionalPrice: z.string().or(z.number()).optional().nullable(),
  imageUrl: z.string().url().optional().nullable().or(z.literal("")),
  preparationTime: z.number().int().min(1).max(180).default(30),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  options: z.array(z.object({
    name: z.string(),
    type: z.enum(['single', 'multiple']),
    required: z.boolean().default(false),
    items: z.array(z.object({
      name: z.string(),
      price: z.number().default(0),
    })),
  })).default([]),
  ingredients: z.string().max(500).optional().nullable(),
  allergens: z.string().max(200).optional().nullable(),
  serves: z.number().int().min(1).max(20).default(1),
  displayOrder: z.number().int().min(0).default(0),
});

export const deliveryOrderSchema = z.object({
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(50).optional(),
  customerAddress: z.string().max(500).optional(),
  customerComplement: z.string().max(200).optional(),
  customerReference: z.string().max(200).optional(),
  deliveryType: z.enum(['delivery', 'pickup']).default('delivery'),
  paymentMethod: z.string().max(30).optional(),
  notes: z.string().max(500).optional(),
});

// Types para Delivery
export type DeliveryConfig = typeof deliveryConfig.$inferSelect;
export type InsertDeliveryConfig = typeof deliveryConfig.$inferInsert;
export type DeliveryConfigInput = z.infer<typeof deliveryConfigSchema>;

export type MenuCategory = typeof menuCategories.$inferSelect;
export type InsertMenuCategory = typeof menuCategories.$inferInsert;
export type MenuCategoryInput = z.infer<typeof menuCategorySchema>;

export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;
export type MenuItemInput = z.infer<typeof menuItemSchema>;

export type DeliveryOrder = typeof deliveryOrders.$inferSelect;
export type InsertDeliveryOrder = typeof deliveryOrders.$inferInsert;
export type DeliveryOrderInput = z.infer<typeof deliveryOrderSchema>;

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

export type DeliveryCart = typeof deliveryCarts.$inferSelect;
export type InsertDeliveryCart = typeof deliveryCarts.$inferInsert;

// =============================================================================
// TEAM MEMBERS - Schemas e Types
// =============================================================================

// Relations para Team Members
export const teamMembersRelations = relations(teamMembers, ({ one, many }) => ({
  owner: one(users, {
    fields: [teamMembers.ownerId],
    references: [users.id],
  }),
  sessions: many(teamMemberSessions),
}));

export const teamMemberSessionsRelations = relations(teamMemberSessions, ({ one }) => ({
  member: one(teamMembers, {
    fields: [teamMemberSessions.memberId],
    references: [teamMembers.id],
  }),
}));

// Schemas Zod para Team Members
export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  passwordHash: true,
  lastLoginAt: true,
});

export const teamMemberSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(255),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres").optional(),
  role: z.string().max(100).default("atendente"),
  permissions: z.object({
    canViewConversations: z.boolean().default(true),
    canSendMessages: z.boolean().default(true),
    canUseQuickReplies: z.boolean().default(true),
    canMoveKanban: z.boolean().default(true),
    canViewDashboard: z.boolean().default(false),
    canViewAgenda: z.boolean().default(false),
    canEditContacts: z.boolean().default(false),
    canViewPhoneNumbers: z.boolean().default(false),
  }).default({
    canViewConversations: true,
    canSendMessages: true,
    canUseQuickReplies: true,
    canMoveKanban: true,
    canViewDashboard: false,
    canViewAgenda: false,
    canEditContacts: false,
    canViewPhoneNumbers: false,
  }),
  isActive: z.boolean().default(true),
  avatarUrl: z.string().url().optional().nullable(),
});

export const teamMemberLoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  ownerId: z.string().optional(), // ID do dono da conta (para identificar a qual conta o membro pertence)
});

// Types para Team Members
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMemberInput = z.infer<typeof teamMemberSchema>;
export type TeamMemberLogin = z.infer<typeof teamMemberLoginSchema>;

// =============================================================================
// WHATSAPP STATUSES - Sistema de Status/Mensagens Automáticas do WhatsApp
// =============================================================================

export const whatsappStatuses = pgTable("whatsapp_statuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("text"), // text, image, video, audio
  content: text("content").notNull(),
  contentUrl: varchar("content_url"), // URL for media files
  duration: integer("duration"), // Duration in seconds for video/audio
  schedule: jsonb("schedule").$type<{
    enabled: boolean;
    daysOfWeek: number[]; // 0-6 (Sunday-Saturday)
    time: string; // "HH:MM"
    recurrence: "once" | "daily" | "weekly" | "monthly";
  }>(),
  rotation: jsonb("rotation").$type<{
    enabled: boolean;
    type: "sequential" | "random";
    priority?: number;
  }>(),
  isActive: boolean("is_active").default(true).notNull(),
  priority: integer("priority").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const statusHistory = pgTable("status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  statusId: varchar("status_id").notNull().references(() => whatsappStatuses.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  phoneNumber: varchar("phone_number").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  content: text("content").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  rotationUsed: varchar("rotation_used"), // Track which rotation was used
});

// Schemas Zod para WhatsApp Statuses
export const insertWhatsappStatusSchema = createInsertSchema(whatsappStatuses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const whatsappStatusSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(255),
  type: z.enum(["text", "image", "video", "audio"]).default("text"),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  contentUrl: z.string().url().optional().nullable(),
  duration: z.number().optional().nullable(),
  schedule: z.object({
    enabled: z.boolean(),
    daysOfWeek: z.array(z.number().min(0).max(6)),
    time: z.string(),
    recurrence: z.enum(["once", "daily", "weekly", "monthly"]),
  }).optional().nullable(),
  rotation: z.object({
    enabled: z.boolean(),
    type: z.enum(["sequential", "random"]),
    priority: z.number().optional(),
  }).optional().nullable(),
  isActive: z.boolean().default(true),
  priority: z.number().default(0),
});

// Types para WhatsApp Statuses
export type WhatsappStatus = typeof whatsappStatuses.$inferSelect;
export type InsertWhatsappStatus = z.infer<typeof insertWhatsappStatusSchema>;
export type WhatsappStatusInput = z.infer<typeof whatsappStatusSchema>;

export type StatusHistory = typeof statusHistory.$inferSelect;
export type InsertStatusHistory = typeof statusHistory.$inferInsert;
export type TeamMemberSession = typeof teamMemberSessions.$inferSelect;

// =============================================================================
// STATUS POSTS V2 - Biblioteca, agenda recorrente e rotação por postagem
// =============================================================================

export const statusPostItemTypes = ["text", "image", "video", "audio"] as const;
export const statusJobModes = ["immediate", "scheduled", "recurring"] as const;
export const statusJobRecurrenceTypes = ["once", "daily", "weekdays", "weekly", "monthly"] as const;
export const statusJobStatuses = ["active", "paused", "completed", "failed"] as const;
export const statusRotationSelectionModes = ["sequential", "random"] as const;
export const statusRunTypes = ["manual", "job", "rotation"] as const;
export const statusRunStatuses = ["running", "sent", "partial_failed", "failed"] as const;
export const statusRunItemStatuses = ["pending", "sent", "failed"] as const;

export type StatusPostItemType = typeof statusPostItemTypes[number];
export type StatusJobMode = typeof statusJobModes[number];
export type StatusJobRecurrenceType = typeof statusJobRecurrenceTypes[number];
export type StatusJobStatus = typeof statusJobStatuses[number];
export type StatusRotationSelectionMode = typeof statusRotationSelectionModes[number];
export type StatusRunType = typeof statusRunTypes[number];
export type StatusRunStatus = typeof statusRunStatuses[number];
export type StatusRunItemStatus = typeof statusRunItemStatuses[number];

export const statusPosts = pgTable("status_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: varchar("connection_id").references(() => whatsappConnections.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  defaultCaption: text("default_caption"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_status_posts_user").on(table.userId),
  index("idx_status_posts_active").on(table.userId, table.isActive),
]);

export const statusPostItems = pgTable("status_post_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => statusPosts.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).$type<StatusPostItemType>().notNull(),
  text: text("text"),
  storageUrl: text("storage_url"),
  mimeType: varchar("mime_type", { length: 255 }),
  caption: text("caption"),
  durationSeconds: integer("duration_seconds"),
  displayOrder: integer("display_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_status_post_items_post").on(table.postId),
  index("idx_status_post_items_order").on(table.postId, table.displayOrder),
]);

export const statusPublishJobs = pgTable("status_publish_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: varchar("post_id").notNull().references(() => statusPosts.id, { onDelete: "cascade" }),
  connectionId: varchar("connection_id").references(() => whatsappConnections.id, { onDelete: "set null" }),
  mode: varchar("mode", { length: 20 }).$type<StatusJobMode>().default("scheduled").notNull(),
  recurrenceType: varchar("recurrence_type", { length: 20 }).$type<StatusJobRecurrenceType>().default("once").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("America/Sao_Paulo").notNull(),
  scheduledFor: timestamp("scheduled_for"),
  timeOfDay: varchar("time_of_day", { length: 5 }),
  daysOfWeek: jsonb("days_of_week").$type<number[]>().default([]).notNull(),
  dayOfMonth: integer("day_of_month"),
  isActive: boolean("is_active").default(true).notNull(),
  status: varchar("status", { length: 20 }).$type<StatusJobStatus>().default("active").notNull(),
  nextRunAt: timestamp("next_run_at"),
  lastRunAt: timestamp("last_run_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_status_publish_jobs_user").on(table.userId),
  index("idx_status_publish_jobs_post").on(table.postId),
  index("idx_status_publish_jobs_status").on(table.status, table.nextRunAt),
]);

export const statusRotations = pgTable("status_rotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: varchar("connection_id").references(() => whatsappConnections.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  selectionMode: varchar("selection_mode", { length: 20 }).$type<StatusRotationSelectionMode>().default("sequential").notNull(),
  intervalMinutes: integer("interval_minutes").default(1440).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  nextRunAt: timestamp("next_run_at"),
  lastRunAt: timestamp("last_run_at"),
  lastPostId: varchar("last_post_id"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_status_rotations_user").on(table.userId),
  index("idx_status_rotations_next_run").on(table.isActive, table.nextRunAt),
]);

export const statusRotationPosts = pgTable("status_rotation_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rotationId: varchar("rotation_id").notNull().references(() => statusRotations.id, { onDelete: "cascade" }),
  postId: varchar("post_id").notNull().references(() => statusPosts.id, { onDelete: "cascade" }),
  displayOrder: integer("display_order").default(0).notNull(),
  weight: integer("weight").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastPublishedAt: timestamp("last_published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_status_rotation_posts_rotation").on(table.rotationId),
  uniqueIndex("idx_status_rotation_posts_unique").on(table.rotationId, table.postId),
]);

export const statusPublishRuns = pgTable("status_publish_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: varchar("post_id").notNull().references(() => statusPosts.id, { onDelete: "cascade" }),
  jobId: varchar("job_id").references(() => statusPublishJobs.id, { onDelete: "set null" }),
  rotationId: varchar("rotation_id").references(() => statusRotations.id, { onDelete: "set null" }),
  connectionId: varchar("connection_id").references(() => whatsappConnections.id, { onDelete: "set null" }),
  runType: varchar("run_type", { length: 20 }).$type<StatusRunType>().notNull(),
  triggeredBy: varchar("triggered_by", { length: 50 }).default("system").notNull(),
  status: varchar("status", { length: 20 }).$type<StatusRunStatus>().default("running").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_status_publish_runs_user").on(table.userId, table.startedAt),
  index("idx_status_publish_runs_job").on(table.jobId),
  index("idx_status_publish_runs_rotation").on(table.rotationId),
]);

export const statusPublishRunItems = pgTable("status_publish_run_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().references(() => statusPublishRuns.id, { onDelete: "cascade" }),
  postItemId: varchar("post_item_id").references(() => statusPostItems.id, { onDelete: "set null" }),
  displayOrder: integer("display_order").default(0).notNull(),
  type: varchar("type", { length: 20 }).$type<StatusPostItemType>().notNull(),
  textPreview: text("text_preview"),
  storageUrl: text("storage_url"),
  caption: text("caption"),
  status: varchar("status", { length: 20 }).$type<StatusRunItemStatus>().default("pending").notNull(),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_status_publish_run_items_run").on(table.runId, table.displayOrder),
]);

export const statusPostItemInputSchema = z.object({
  id: z.string().optional(),
  type: z.enum(statusPostItemTypes),
  text: z.string().optional().nullable(),
  storageUrl: z.string().url().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  caption: z.string().optional().nullable(),
  durationSeconds: z.number().int().min(0).optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
}).superRefine((item, ctx) => {
  if (item.type === "text" && !String(item.text || "").trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Texto é obrigatório para item de texto", path: ["text"] });
  }
  if (item.type !== "text" && !String(item.storageUrl || "").trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Arquivo enviado é obrigatório", path: ["storageUrl"] });
  }
});

export const statusPostInputSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(255),
  description: z.string().optional().nullable(),
  connectionId: z.string().optional().nullable(),
  defaultCaption: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  items: z.array(statusPostItemInputSchema).min(1, "Adicione pelo menos um item"),
});

export const statusPublishJobInputSchema = z.object({
  postId: z.string().min(1, "Postagem é obrigatória"),
  connectionId: z.string().optional().nullable(),
  mode: z.enum(statusJobModes).default("scheduled"),
  recurrenceType: z.enum(statusJobRecurrenceTypes).default("once"),
  timezone: z.string().default("America/Sao_Paulo"),
  scheduledFor: z.string().datetime().optional().nullable(),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  dayOfMonth: z.number().int().min(1).max(31).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const statusRotationPostInputSchema = z.object({
  id: z.string().optional(),
  postId: z.string().min(1, "Selecione uma postagem"),
  displayOrder: z.number().int().min(0).optional(),
  weight: z.number().int().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export const statusRotationInputSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(255),
  connectionId: z.string().optional().nullable(),
  selectionMode: z.enum(statusRotationSelectionModes).default("sequential"),
  intervalMinutes: z.number().int().min(5).max(10080),
  isActive: z.boolean().default(true),
  items: z.array(statusRotationPostInputSchema).min(1, "Adicione ao menos uma postagem"),
});

export type StatusPost = typeof statusPosts.$inferSelect;
export type StatusPostItem = typeof statusPostItems.$inferSelect;
export type StatusPublishJob = typeof statusPublishJobs.$inferSelect;
export type StatusPostRotation = typeof statusRotations.$inferSelect;
export type StatusPostRotationPost = typeof statusRotationPosts.$inferSelect;
export type StatusPublishRun = typeof statusPublishRuns.$inferSelect;
export type StatusPublishRunItem = typeof statusPublishRunItems.$inferSelect;

export type StatusPostInput = z.infer<typeof statusPostInputSchema>;
export type StatusPostItemInput = z.infer<typeof statusPostItemInputSchema>;
export type StatusPublishJobInput = z.infer<typeof statusPublishJobInputSchema>;
export type StatusPostRotationInput = z.infer<typeof statusRotationInputSchema>;
export type StatusPostRotationItemInput = z.infer<typeof statusRotationPostInputSchema>;

// =====================================================
// AUDIO CONFIG - Configuração de Áudio TTS para Respostas IA
// Usa tabelas existentes: audio_config e audio_message_counter
// =====================================================

export const audioResponseModes = [
  "first_message_text_audio_then_mirror",
  "audio_on_customer_audio",
  "audio_only",
  "audio_text",
] as const;
export type AudioResponseMode = typeof audioResponseModes[number];

export const audioConfig = pgTable("audio_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  voiceType: text("voice_type").default("female").notNull(), // "female" ou "male"
  responseMode: text("response_mode").$type<AudioResponseMode>().default("first_message_text_audio_then_mirror").notNull(),
  speed: numeric("speed", { precision: 3, scale: 2 }).default("1.00").notNull(), // 0.5 a 2.0
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const audioMessageCounter = pgTable("audio_message_counter", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").defaultNow().notNull(),
  count: integer("count").default(0).notNull(),
  dailyLimit: integer("daily_limit").default(30).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Relations para Audio Config
export const audioConfigRelations = relations(audioConfig, ({ one }) => ({
  user: one(users, {
    fields: [audioConfig.userId],
    references: [users.id],
  }),
}));

export const audioMessageCounterRelations = relations(audioMessageCounter, ({ one }) => ({
  user: one(users, {
    fields: [audioMessageCounter.userId],
    references: [users.id],
  }),
}));

// Schema Zod para Audio Config
export const insertAudioConfigSchema = createInsertSchema(audioConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAudioConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  voiceType: z.enum(["female", "male"]).optional(),
  responseMode: z.enum(audioResponseModes).optional(),
  speed: z.string().optional(), // String porque é numeric no DB
});

// Types para Audio Config
export type AudioConfig = typeof audioConfig.$inferSelect;
export type InsertAudioConfig = z.infer<typeof insertAudioConfigSchema>;
export type UpdateAudioConfig = z.infer<typeof updateAudioConfigSchema>;
export type AudioMessageCounter = typeof audioMessageCounter.$inferSelect;

// =============================================================================
// FASE 4 - NOVOS SCHEMAS
// =============================================================================

// T4.4 - Setores e Roteamento
export const sectors = pgTable("sectors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  keywords: text("keywords").array().default([]),
  aiHandoffMode: varchar("ai_handoff_mode", { length: 32 }).default("copilot").notNull(),
  controlledHandoffEnabled: boolean("controlled_handoff_enabled").default(true).notNull(),
  memberReplyScope: varchar("member_reply_scope", { length: 32 }).default("assigned_only").notNull(),
  autoAssignAgentId: varchar("auto_assign_agent_id").references(() => admins.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_sectors_owner").on(table.ownerId),
  index("idx_sectors_name").on(table.name),
  index("idx_sectors_auto_assign").on(table.autoAssignAgentId),
]);

export const sectorMembers = pgTable("sector_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectorId: varchar("sector_id").notNull().references(() => sectors.id, { onDelete: 'cascade' }),
  memberId: varchar("member_id").notNull().references(() => teamMembers.id, { onDelete: 'cascade' }),
  isPrimary: boolean("is_primary").default(false),
  canReceiveTickets: boolean("can_receive_tickets").default(true),
  maxOpenTickets: integer("max_open_tickets").default(10),
  currentOpenTickets: integer("current_open_tickets").default(0),
  assignedAt: timestamp("assigned_at").defaultNow(),
  assignedBy: varchar("assigned_by"),
}, (table) => [
  index("idx_sector_members_sector").on(table.sectorId),
  index("idx_sector_members_member").on(table.memberId),
  uniqueIndex("idx_sector_members_unique").on(table.sectorId, table.memberId),
]);

export const routingLogs = pgTable("routing_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  messageText: text("message_text"),
  detectedIntent: varchar("detected_intent", { length: 100 }),
  matchedSectorId: varchar("matched_sector_id").references(() => sectors.id, { onDelete: 'set null' }),
  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }),
  assignedToMemberId: varchar("assigned_to_member_id").references(() => teamMembers.id, { onDelete: 'set null' }),
  routingMethod: varchar("routing_method", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_routing_logs_conversation").on(table.conversationId),
  index("idx_routing_logs_created").on(table.createdAt),
  index("idx_routing_logs_sector").on(table.matchedSectorId),
]);

export const saasOwnerReports = pgTable("saas_owner_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportType: varchar("report_type", { length: 50 }).notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
  generatedBy: varchar("generated_by"),
  data: jsonb("data").default({}),
  totalConversations: integer("total_conversations").default(0),
  totalMessages: integer("total_messages").default(0),
  avgResponseTimeMinutes: integer("avg_response_time_minutes"),
  satisfactionScore: decimal("satisfaction_score", { precision: 3, scale: 2 }),
  filters: jsonb("filters").default({}),
}, (table) => [
  index("idx_saas_reports_type").on(table.reportType),
  index("idx_saas_reports_period").on(table.periodStart, table.periodEnd),
  index("idx_saas_reports_generated").on(table.generatedAt),
]);

// T4.2 - Ticket Closure System
export const ticketClosureLogsV4 = pgTable("ticket_closure_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  action: varchar("action", { length: 50 }).notNull(), // 'closed', 'reopened'
  performedBy: varchar("performed_by").notNull(),
  performedByName: varchar("performed_by_name", { length: 255 }),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ticket_closure_conversation").on(table.conversationId),
  index("idx_ticket_closure_created").on(table.createdAt),
]);

// T4.1 - Bulk Actions Log
export const bulkActionsLog = pgTable("bulk_actions_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  performedBy: varchar("performed_by").notNull(),
  performedByName: varchar("performed_by_name", { length: 255 }),
  affectedConversations: integer("affected_conversations").default(0),
  conversationIds: text("conversation_ids").array(),
  details: jsonb("details").default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_bulk_actions_created").on(table.createdAt),
  index("idx_bulk_actions_type").on(table.actionType),
]);

// T4.3 - Scheduled Messages
export const scheduledMessages = pgTable("scheduled_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  connectionId: varchar("connection_id").notNull().references(() => whatsappConnections.id, { onDelete: 'cascade' }),
  messageText: text("message_text").notNull(),
  messageType: varchar("message_type", { length: 50 }).default("text"),
  aiPrompt: text("ai_prompt"),
  aiGeneratedText: text("ai_generated_text"),
  wasEdited: boolean("was_edited").default(false),
  scheduledAt: timestamp("scheduled_at").notNull(),
  timezone: varchar("timezone", { length: 50 }).default("America/Sao_Paulo"),
  status: varchar("status", { length: 50 }).default("pending"),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdBy: varchar("created_by").notNull(),
  createdByName: varchar("created_by_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_scheduled_conversation").on(table.conversationId),
  index("idx_scheduled_status").on(table.status),
  index("idx_scheduled_at").on(table.scheduledAt),
  index("idx_scheduled_pending").on(table.status, table.scheduledAt),
]);

// T4.5 - Multi-WhatsApp Support
export const connectionAgents = pgTable("connection_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id").notNull().references(() => whatsappConnections.id, { onDelete: 'cascade' }),
  agentId: varchar("agent_id").notNull().references(() => agents.id, { onDelete: 'cascade' }),
  isActive: boolean("is_active").default(true),
  assignedAt: timestamp("assigned_at").defaultNow(),
  assignedBy: varchar("assigned_by"),
}, (table) => [
  index("idx_conn_agents_connection").on(table.connectionId),
  index("idx_conn_agents_agent").on(table.agentId),
  uniqueIndex("idx_conn_agents_unique").on(table.connectionId, table.agentId),
]);

export const connectionMembers = pgTable("connection_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id").notNull().references(() => whatsappConnections.id, { onDelete: 'cascade' }),
  memberId: varchar("member_id").notNull().references(() => teamMembers.id, { onDelete: 'cascade' }),
  canView: boolean("can_view").default(true),
  canRespond: boolean("can_respond").default(true),
  canManage: boolean("can_manage").default(false),
  assignedAt: timestamp("assigned_at").defaultNow(),
}, (table) => [
  index("idx_conn_members_connection").on(table.connectionId),
  index("idx_conn_members_member").on(table.memberId),
  uniqueIndex("idx_conn_members_unique").on(table.connectionId, table.memberId),
]);

// Relations for Fase 4 tables

// Multi-agent relations
export const connectionAgentsRelations = relations(connectionAgents, ({ one }) => ({
  connection: one(whatsappConnections, { fields: [connectionAgents.connectionId], references: [whatsappConnections.id] }),
  agent: one(agents, { fields: [connectionAgents.agentId], references: [agents.id] }),
}));

export const connectionMembersRelations = relations(connectionMembers, ({ one }) => ({
  connection: one(whatsappConnections, { fields: [connectionMembers.connectionId], references: [whatsappConnections.id] }),
  member: one(teamMembers, { fields: [connectionMembers.memberId], references: [teamMembers.id] }),
}));

export const sectorsRelations = relations(sectors, ({ many }) => ({
  members: many(sectorMembers),
  routingLogs: many(routingLogs),
}));

export const sectorMembersRelations = relations(sectorMembers, ({ one }) => ({
  sector: one(sectors, { fields: [sectorMembers.sectorId], references: [sectors.id] }),
  member: one(teamMembers, { fields: [sectorMembers.memberId], references: [teamMembers.id] }),
}));

export const routingLogsRelations = relations(routingLogs, ({ one }) => ({
  conversation: one(conversations, { fields: [routingLogs.conversationId], references: [conversations.id] }),
  sector: one(sectors, { fields: [routingLogs.matchedSectorId], references: [sectors.id] }),
  assignedMember: one(teamMembers, { fields: [routingLogs.assignedToMemberId], references: [teamMembers.id] }),
}));

export const scheduledMessagesRelations = relations(scheduledMessages, ({ one }) => ({
  conversation: one(conversations, { fields: [scheduledMessages.conversationId], references: [conversations.id] }),
  connection: one(whatsappConnections, { fields: [scheduledMessages.connectionId], references: [whatsappConnections.id] }),
}));

// Zod Schemas for Fase 4
export const insertSectorSchema = createInsertSchema(sectors).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const insertSectorMemberSchema = createInsertSchema(sectorMembers).omit({
  id: true, assignedAt: true,
});

export const insertScheduledMessageSchema = createInsertSchema(scheduledMessages).omit({
  id: true, createdAt: true, updatedAt: true, sentAt: true, errorMessage: true,
});

export const scheduledMessageSchema = z.object({
  conversationId: z.string(),
  messageText: z.string().min(1, "Mensagem é obrigatória"),
  messageType: z.enum(["text", "ai_generated", "template"]).default("text"),
  aiPrompt: z.string().optional(),
  scheduledAt: z.date().or(z.string()),
  timezone: z.string().default("America/Sao_Paulo"),
});

// Types for Fase 4
export type Sector = typeof sectors.$inferSelect;
export type InsertSector = z.infer<typeof insertSectorSchema>;

export type SectorMember = typeof sectorMembers.$inferSelect;
export type InsertSectorMember = z.infer<typeof insertSectorMemberSchema>;

export type RoutingLog = typeof routingLogs.$inferSelect;

export type SaasOwnerReport = typeof saasOwnerReports.$inferSelect;

export type TicketClosureLog = typeof ticketClosureLogs.$inferSelect;

export type BulkActionLog = typeof bulkActionsLog.$inferSelect;

export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
export type InsertScheduledMessage = z.infer<typeof insertScheduledMessageSchema>;
export type ScheduledMessageInput = z.infer<typeof scheduledMessageSchema>;

export type ConnectionAgent = typeof connectionAgents.$inferSelect;
export type ConnectionMember = typeof connectionMembers.$inferSelect;

export const insertConnectionAgentSchema = createInsertSchema(connectionAgents).omit({
  id: true,
  assignedAt: true,
});
export type InsertConnectionAgent = z.infer<typeof insertConnectionAgentSchema>;

export const insertConnectionMemberSchema = createInsertSchema(connectionMembers).omit({
  id: true,
  assignedAt: true,
});
export type InsertConnectionMember = z.infer<typeof insertConnectionMemberSchema>;

export const connectionAgentSchema = z.object({
  connectionId: z.string().min(1, "Conexão é obrigatória"),
  agentId: z.string().min(1, "Agente é obrigatório"),
  isActive: z.boolean().default(true),
  assignedBy: z.string().optional(),
});

export const connectionMemberSchema = z.object({
  connectionId: z.string().min(1, "Conexão é obrigatória"),
  memberId: z.string().min(1, "Membro é obrigatório"),
  canView: z.boolean().default(true),
  canRespond: z.boolean().default(true),
  canManage: z.boolean().default(false),
});


// ==================== MENSAGENS AGENDADAS POR USUÁRIO ====================
// Tabela para armazenar mensagens que o usuário agendou para envio futuro
export const conversationScheduledMessages = pgTable("conversation_scheduled_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  contactNumber: text("contact_number").notNull(),
  text: text("text").notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  useAI: boolean("use_ai").default(false),
  note: text("note"),
  status: text("status").notNull().default('scheduled'), // scheduled, sent, failed, cancelled
  createdAt: timestamp("created_at").defaultNow(),
  executedAt: timestamp("executed_at"),
  errorReason: text("error_reason"),
}, (table) => [
  index("idx_conv_sched_msgs_conv").on(table.conversationId),
  index("idx_conv_sched_msgs_user").on(table.userId),
  index("idx_conv_sched_msgs_status").on(table.status),
]);

export type ConversationScheduledMessage = typeof conversationScheduledMessages.$inferSelect;
export type InsertConversationScheduledMessage = typeof conversationScheduledMessages.$inferInsert;

// =============================================================================
// QR CODE INTELIGENTE - Ferramenta de geração de QR Codes WhatsApp
// Step 1: Database schema & types
// =============================================================================

export const smartQrcodes = pgTable("smart_qrcodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Identidade do QR Code
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  slug: varchar("slug", { length: 100 }).unique(),

  // Destino WhatsApp
  whatsappNumber: varchar("whatsapp_number", { length: 30 }).notNull(),
  welcomeMessage: text("welcome_message"),

  // Template / Segmento
  templateId: varchar("template_id", { length: 100 }),
  templateName: varchar("template_name", { length: 100 }),

  // Personalização visual
  foregroundColor: varchar("foreground_color", { length: 20 }).default("#000000"),
  backgroundColor: varchar("background_color", { length: 20 }).default("#ffffff"),
  logoUrl: text("logo_url"),
  logoSize: integer("logo_size").default(20),
  cornerRadius: integer("corner_radius").default(0),
  errorCorrection: varchar("error_correction", { length: 1 }).default("H"),

  // Conteúdo gerado
  targetUrl: text("target_url").notNull(),
  qrData: text("qr_data"),
  qrGeneratedAt: timestamp("qr_generated_at"),
  qrSize: integer("qr_size").default(400),

  // Status e analytics
  isActive: boolean("is_active").default(true).notNull(),
  scanCount: integer("scan_count").default(0).notNull(),
  lastScannedAt: timestamp("last_scanned_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_smart_qrcodes_user_id").on(table.userId),
  index("idx_smart_qrcodes_active").on(table.userId, table.isActive),
  index("idx_smart_qrcodes_template").on(table.templateId),
  index("idx_smart_qrcodes_created").on(table.createdAt),
]);

export const qrcodeScanLogs = pgTable("qrcode_scan_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  qrcodeId: varchar("qrcode_id").notNull().references(() => smartQrcodes.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  scannedAt: timestamp("scanned_at").defaultNow(),
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address", { length: 50 }),
  referrer: text("referrer"),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_qrcode_scan_logs_qrcode").on(table.qrcodeId),
  index("idx_qrcode_scan_logs_user").on(table.userId),
  index("idx_qrcode_scan_logs_date").on(table.scannedAt),
]);

// Relations
export const smartQrcodesRelations = relations(smartQrcodes, ({ one, many }) => ({
  user: one(users, {
    fields: [smartQrcodes.userId],
    references: [users.id],
  }),
  scanLogs: many(qrcodeScanLogs),
}));

export const qrcodeScanLogsRelations = relations(qrcodeScanLogs, ({ one }) => ({
  qrcode: one(smartQrcodes, {
    fields: [qrcodeScanLogs.qrcodeId],
    references: [smartQrcodes.id],
  }),
  user: one(users, {
    fields: [qrcodeScanLogs.userId],
    references: [users.id],
  }),
}));

// Zod schemas
export const insertSmartQrcodeSchema = createInsertSchema(smartQrcodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  qrData: true,
  qrGeneratedAt: true,
  scanCount: true,
  lastScannedAt: true,
});

export const smartQrcodeSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  description: z.string().max(1000).optional().nullable(),
  slug: z.string().max(100).regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífens").optional().nullable(),
  whatsappNumber: z.string().min(8, "Número WhatsApp inválido").max(30),
  welcomeMessage: z.string().max(500).optional().nullable(),
  templateId: z.string().max(100).optional().nullable(),
  templateName: z.string().max(100).optional().nullable(),
  foregroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida").default("#000000"),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida").default("#ffffff"),
  logoUrl: z.string().url().optional().nullable(),
  logoSize: z.number().int().min(5).max(30).default(20),
  cornerRadius: z.number().int().min(0).max(50).default(0),
  errorCorrection: z.enum(["L", "M", "Q", "H"]).default("H"),
  targetUrl: z.string().url("URL inválida"),
  qrSize: z.number().int().min(200).max(4096).default(400),
  isActive: z.boolean().default(true),
});

export const updateSmartQrcodeSchema = smartQrcodeSchema.partial().omit({ targetUrl: true });

// Types
export type SmartQrcode = typeof smartQrcodes.$inferSelect;
export type InsertSmartQrcode = z.infer<typeof insertSmartQrcodeSchema>;
export type SmartQrcodeInput = z.infer<typeof smartQrcodeSchema>;
export type UpdateSmartQrcodeInput = z.infer<typeof updateSmartQrcodeSchema>;

export type QrcodeScanLog = typeof qrcodeScanLogs.$inferSelect;
export type InsertQrcodeScanLog = typeof qrcodeScanLogs.$inferInsert;

// =============================================================================
// BLOG CMS - infraestrutura de blog SEO
// =============================================================================

export const blogAssetImages = pgTable("blog_asset_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider", { length: 50 }).notNull().default("template"),
  model: varchar("model", { length: 120 }),
  prompt: text("prompt"),
  altText: text("alt_text").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull().default("image/svg+xml"),
  filePath: text("file_path").notNull(),
  publicUrl: text("public_url").notNull(),
  width: integer("width").notNull().default(1200),
  height: integer("height").notNull().default(630),
  sourceProvenance: jsonb("source_provenance").$type<Record<string, unknown>>().default({}).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_blog_asset_images_provider").on(table.provider),
  index("idx_blog_asset_images_created").on(table.createdAt),
]);

export const blogAuthorProfiles = pgTable("blog_author_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url"),
  profileUrl: text("profile_url"),
  expertise: jsonb("expertise").$type<string[]>().default([]).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_blog_author_profiles_default").on(table.isDefault, table.createdAt),
]);

export const blogSourceSnapshots = pgTable("blog_source_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  sourceKey: varchar("source_key", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  sourceUrl: text("source_url"),
  domain: varchar("domain", { length: 255 }),
  excerpt: text("excerpt"),
  summary: text("summary").notNull().default(""),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  publishedAt: timestamp("published_at"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_blog_source_snapshots_type").on(table.sourceType, table.createdAt),
  index("idx_blog_source_snapshots_key").on(table.sourceKey),
]);

export const blogTopics = pgTable("blog_topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  titleHint: varchar("title_hint", { length: 255 }).notNull(),
  keywordPrimary: varchar("keyword_primary", { length: 255 }).notNull().unique(),
  keywordsSecondary: jsonb("keywords_secondary").$type<string[]>().default([]).notNull(),
  cluster: varchar("cluster", { length: 120 }).notNull(),
  categorySlug: varchar("category_slug", { length: 120 }).notNull(),
  intent: varchar("intent", { length: 50 }).notNull().default("commercial"),
  funnelStage: varchar("funnel_stage", { length: 50 }).notNull().default("mofu"),
  sourceType: varchar("source_type", { length: 50 }).notNull().default("seed"),
  sourceData: jsonb("source_data").$type<Record<string, unknown>>().default({}).notNull(),
  briefJson: jsonb("brief_json").$type<Record<string, unknown>>().default({}).notNull(),
  score: integer("score").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  publishedPostId: varchar("published_post_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_blog_topics_status").on(table.status, table.createdAt),
  index("idx_blog_topics_cluster").on(table.cluster, table.createdAt),
]);

export const blogContextPacks = pgTable("blog_context_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topicId: varchar("topic_id").references(() => blogTopics.id, { onDelete: "cascade" }),
  packType: varchar("pack_type", { length: 50 }).notNull().default("editorial"),
  keywordPrimary: varchar("keyword_primary", { length: 255 }).notNull(),
  cluster: varchar("cluster", { length: 120 }).notNull(),
  summary: text("summary").notNull(),
  outline: jsonb("outline").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  sourceSnapshotIds: jsonb("source_snapshot_ids").$type<string[]>().default([]).notNull(),
  internalNotes: jsonb("internal_notes").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_blog_context_packs_topic").on(table.topicId, table.createdAt),
  index("idx_blog_context_packs_keyword").on(table.keywordPrimary),
]);

export const blogPosts = pgTable("blog_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topicId: varchar("topic_id").references(() => blogTopics.id, { onDelete: "set null" }),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  title: varchar("title", { length: 255 }).notNull(),
  excerpt: text("excerpt").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyJson: jsonb("body_json").$type<Record<string, unknown>>().default({}).notNull(),
  faqJson: jsonb("faq_json").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  keywordPrimary: varchar("keyword_primary", { length: 255 }).notNull(),
  keywordsSecondary: jsonb("keywords_secondary").$type<string[]>().default([]).notNull(),
  cluster: varchar("cluster", { length: 120 }).notNull(),
  categorySlug: varchar("category_slug", { length: 120 }).notNull(),
  tags: jsonb("tags").$type<string[]>().default([]).notNull(),
  intent: varchar("intent", { length: 50 }).notNull().default("commercial"),
  funnelStage: varchar("funnel_stage", { length: 50 }).notNull().default("mofu"),
  metaTitle: varchar("meta_title", { length: 255 }).notNull(),
  metaDescription: text("meta_description").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  jsonLd: jsonb("json_ld").$type<Record<string, unknown>>().default({}).notNull(),
  authorSlug: varchar("author_slug", { length: 120 }).references(() => blogAuthorProfiles.slug, { onDelete: "set null" }),
  contextPackId: varchar("context_pack_id").references(() => blogContextPacks.id, { onDelete: "set null" }),
  heroImageId: varchar("hero_image_id").references(() => blogAssetImages.id, { onDelete: "set null" }),
  heroImageUrl: text("hero_image_url"),
  heroImageAlt: text("hero_image_alt"),
  imagePrompt: text("image_prompt"),
  referencesJson: jsonb("references_json").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  semanticReview: jsonb("semantic_review").$type<Record<string, unknown>>().default({}).notNull(),
  qualityScore: integer("quality_score").notNull().default(0),
  duplicateSimilarity: numeric("duplicate_similarity", { precision: 5, scale: 4 }).notNull().default("0"),
  internalProofCount: integer("internal_proof_count").notNull().default(0),
  requiredInternalLinks: integer("required_internal_links").notNull().default(0),
  unsupportedClaims: integer("unsupported_claims").notNull().default(0),
  sourceProvenance: jsonb("source_provenance").$type<Record<string, unknown>>().default({}).notNull(),
  reviewNotes: text("review_notes"),
  distributionPayload: jsonb("distribution_payload").$type<Record<string, unknown>>().default({}).notNull(),
  readingTimeMinutes: integer("reading_time_minutes").notNull().default(1),
  modelProvider: varchar("model_provider", { length: 50 }).notNull().default("mistral"),
  modelName: varchar("model_name", { length: 120 }).notNull().default("mistral-medium-latest"),
  publishEligibleAt: timestamp("publish_eligible_at"),
  refreshReason: text("refresh_reason"),
  publishedAt: timestamp("published_at"),
  lastRefreshAt: timestamp("last_refresh_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_blog_posts_status").on(table.status, table.publishedAt),
  index("idx_blog_posts_category").on(table.categorySlug, table.publishedAt),
  index("idx_blog_posts_cluster").on(table.cluster, table.publishedAt),
  index("idx_blog_posts_keyword").on(table.keywordPrimary),
  index("idx_blog_posts_publish_eligible").on(table.publishEligibleAt, table.status),
]);

export const blogPostRevisions = pgTable("blog_post_revisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
  revisionType: varchar("revision_type", { length: 50 }).notNull().default("draft"),
  bodyHtml: text("body_html").notNull(),
  bodyJson: jsonb("body_json").$type<Record<string, unknown>>().default({}).notNull(),
  qualityScore: integer("quality_score").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_blog_post_revisions_post").on(table.postId, table.createdAt),
]);

export const blogPostSources = pgTable("blog_post_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").references(() => blogPosts.id, { onDelete: "cascade" }),
  topicId: varchar("topic_id").references(() => blogTopics.id, { onDelete: "cascade" }),
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  sourceKey: varchar("source_key", { length: 255 }).notNull(),
  sourceUrl: text("source_url"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_blog_post_sources_post").on(table.postId, table.createdAt),
  index("idx_blog_post_sources_topic").on(table.topicId, table.createdAt),
]);

export const blogGenerationJobs = pgTable("blog_generation_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topicId: varchar("topic_id").references(() => blogTopics.id, { onDelete: "set null" }),
  postId: varchar("post_id").references(() => blogPosts.id, { onDelete: "set null" }),
  jobType: varchar("job_type", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("queued"),
  provider: varchar("provider", { length: 50 }).notNull().default("mistral"),
  model: varchar("model", { length: 120 }),
  requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().default({}).notNull(),
  responsePayload: jsonb("response_payload").$type<Record<string, unknown>>().default({}).notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_blog_generation_jobs_status").on(table.status, table.createdAt),
  index("idx_blog_generation_jobs_topic").on(table.topicId, table.createdAt),
]);

export const blogPublishJobs = pgTable("blog_publish_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").references(() => blogPosts.id, { onDelete: "cascade" }),
  jobType: varchar("job_type", { length: 50 }).notNull().default("publish"),
  status: varchar("status", { length: 50 }).notNull().default("queued"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  errorMessage: text("error_message"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_blog_publish_jobs_post").on(table.postId, table.createdAt),
  index("idx_blog_publish_jobs_status").on(table.status, table.createdAt),
]);

export const blogIndexingChecks = pgTable("blog_indexing_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").references(() => blogPosts.id, { onDelete: "cascade" }),
  inspectedUrl: text("inspected_url").notNull(),
  inspectionType: varchar("inspection_type", { length: 50 }).notNull().default("url_inspection"),
  indexingState: varchar("indexing_state", { length: 120 }),
  coverageState: varchar("coverage_state", { length: 255 }),
  googleCanonical: text("google_canonical"),
  userCanonical: text("user_canonical"),
  sitemaps: jsonb("sitemaps").$type<string[]>().default([]).notNull(),
  verdict: varchar("verdict", { length: 120 }),
  rawResponse: jsonb("raw_response").$type<Record<string, unknown>>().default({}).notNull(),
  checkedAt: timestamp("checked_at").defaultNow(),
}, (table) => [
  index("idx_blog_indexing_checks_post").on(table.postId, table.checkedAt),
  index("idx_blog_indexing_checks_url").on(table.inspectedUrl),
]);

export const blogPostMetrics = pgTable("blog_post_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").references(() => blogPosts.id, { onDelete: "cascade" }),
  metricDate: date("metric_date").notNull(),
  clicks: integer("clicks").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  ctr: numeric("ctr", { precision: 8, scale: 4 }).notNull().default("0"),
  position: numeric("position", { precision: 8, scale: 2 }).notNull().default("0"),
  source: varchar("source", { length: 50 }).notNull().default("search_console"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_blog_post_metrics_post_date_source").on(table.postId, table.metricDate, table.source),
  index("idx_blog_post_metrics_date").on(table.metricDate, table.source),
]);

export const insertBlogTopicSchema = createInsertSchema(blogTopics).omit({
  id: true,
  lastAttemptAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({
  id: true,
  publishedAt: true,
  lastRefreshAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBlogAssetImageSchema = createInsertSchema(blogAssetImages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BlogAssetImage = typeof blogAssetImages.$inferSelect;
export type InsertBlogAssetImage = z.infer<typeof insertBlogAssetImageSchema>;
export type BlogAuthorProfile = typeof blogAuthorProfiles.$inferSelect;
export type BlogSourceSnapshot = typeof blogSourceSnapshots.$inferSelect;
export type BlogTopic = typeof blogTopics.$inferSelect;
export type InsertBlogTopic = z.infer<typeof insertBlogTopicSchema>;
export type BlogContextPack = typeof blogContextPacks.$inferSelect;
export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;
export type BlogPostRevision = typeof blogPostRevisions.$inferSelect;
export type BlogPostSource = typeof blogPostSources.$inferSelect;
export type BlogGenerationJob = typeof blogGenerationJobs.$inferSelect;
export type BlogPublishJob = typeof blogPublishJobs.$inferSelect;
export type BlogIndexingCheck = typeof blogIndexingChecks.$inferSelect;
export type BlogPostMetric = typeof blogPostMetrics.$inferSelect;

// =============================================================================
// BUSINESS CATEGORIES — Mapeamento segmento → macrocategoria → ferramenta
// Step 1 / ETAPA 3: Categorias de negócio identificadas na análise do banco
// Fonte: RELATORIO_TIPOS_NEGOCIO_CLIENTES.md (26/02/2026) — 316 usuários
// =============================================================================

export const businessCategories = pgTable("business_categories", {
  id:            varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug:          varchar("slug", { length: 100 }).notNull().unique(),
  name:          varchar("name", { length: 200 }).notNull(),
  categoryGroup: varchar("category_group", { length: 50 }).notNull(),
  groupLabel:    varchar("group_label", { length: 100 }).notNull(),
  icon:          varchar("icon", { length: 10 }).notNull().default("💬"),
  description:   text("description"),
  targetTool:    varchar("target_tool", { length: 50 }).notNull().default("generic"),
  welcomeMessage: text("welcome_message"),
  color:         varchar("color", { length: 20 }).notNull().default("#2c3e50"),
  userCount:     integer("user_count").notNull().default(0),
  sortOrder:     integer("sort_order").notNull().default(99),
  isActive:      boolean("is_active").notNull().default(true),
  createdAt:     timestamp("created_at").defaultNow(),
  updatedAt:     timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_business_categories_group").on(table.categoryGroup),
  index("idx_business_categories_tool").on(table.targetTool),
  index("idx_business_categories_active").on(table.isActive, table.sortOrder),
]);

export type BusinessCategory = typeof businessCategories.$inferSelect;
export type InsertBusinessCategory = typeof businessCategories.$inferInsert;

// ─── Broadcast Campaigns ─────────────────────────────────────────────────────

export const broadcastCampaigns = pgTable("broadcast_campaigns", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:          varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  connectionId:    varchar("connection_id").references(() => whatsappConnections.id, { onDelete: 'cascade' }),
  name:            varchar("name", { length: 255 }).notNull().default('Campanha'),
  status:          varchar("status", { length: 50 }).notNull().default('pending'),
  messageTemplate: text("message_template").notNull(),
  mediaUrl:        text("media_url"),
  mediaType:       varchar("media_type", { length: 50 }),
  totalContacts:   integer("total_contacts").default(0).notNull(),
  sentCount:       integer("sent_count").default(0).notNull(),
  failedCount:     integer("failed_count").default(0).notNull(),
  campaignType:    varchar("campaign_type", { length: 50 }).default("broadcast").notNull(),
  useAi:           boolean("use_ai").default(false).notNull(),
  delayMinMs:      integer("delay_min_ms").default(60000).notNull(),
  delayMaxMs:      integer("delay_max_ms").default(90000).notNull(),
  batchSize:       integer("batch_size").default(10).notNull(),
  batchPauseMs:    integer("batch_pause_ms").default(600000).notNull(),
  contactsJson:    jsonb("contacts_json").$type<Array<{ id: string; phone: string; name: string }>>().default([]).notNull(),
  resultsJson:     jsonb("results_json").$type<Array<{ phone: string; name: string; status: string; error?: string; sentAt?: string; messageId?: string | null; remoteJid?: string | null }>>().default([]).notNull(),
  metadataJson:    jsonb("metadata_json").default({}).notNull(),
  scheduledAt:     timestamp("scheduled_at"),
  startedAt:       timestamp("started_at"),
  completedAt:     timestamp("completed_at"),
  errorMessage:    text("error_message"),
  createdAt:       timestamp("created_at").defaultNow(),
  updatedAt:       timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_broadcast_campaigns_user_status").on(table.userId, table.status),
  index("idx_broadcast_campaigns_status_scheduled").on(table.status, table.scheduledAt),
  index("idx_broadcast_campaigns_connection").on(table.connectionId),
  index("idx_broadcast_campaigns_created").on(table.createdAt),
]);

export const broadcastCampaignsRelations = relations(broadcastCampaigns, ({ one }) => ({
  user: one(users, {
    fields: [broadcastCampaigns.userId],
    references: [users.id],
  }),
  connection: one(whatsappConnections, {
    fields: [broadcastCampaigns.connectionId],
    references: [whatsappConnections.id],
  }),
}));

export const insertBroadcastCampaignSchema = createInsertSchema(broadcastCampaigns).omit({ id: true, createdAt: true, updatedAt: true });
export type BroadcastCampaign = typeof broadcastCampaigns.$inferSelect;
export type InsertBroadcastCampaign = z.infer<typeof insertBroadcastCampaignSchema>;
