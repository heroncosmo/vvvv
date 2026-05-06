"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappConnectionsRelations = exports.usersRelations = exports.mediaFlowItemsRelations = exports.mediaFlowsRelations = exports.agentsRelations = exports.conversationTagsRelations = exports.tagsRelations = exports.insertConversationTagSchema = exports.tagSchema = exports.insertTagSchema = exports.conversationTags = exports.tags = exports.userFollowupLogs = exports.followupConfigs = exports.followupLogs = exports.systemConfig = exports.coupons = exports.resellerClientPaymentReceipts = exports.paymentReceipts = exports.paymentHistory = exports.payments = exports.subscriptions = exports.plans = exports.mediaFlowItems = exports.mediaFlows = exports.adminAgentMedia = exports.adminSetupRequestMessages = exports.adminSetupRequests = exports.adminMessages = exports.adminConversations = exports.adminWhatsappConnection = exports.admins = exports.websiteImports = exports.agentDisabledConversations = exports.businessAgentConfigs = exports.agentMediaLibrary = exports.aiAgentConfig = exports.ticketClosureLogs = exports.messages = exports.conversations = exports.whatsappContacts = exports.insertContactListSchema = exports.contactLists = exports.whatsappConnections = exports.agents = exports.teamMemberSessions = exports.teamMembers = exports.policyViolations = exports.users = exports.sessions = void 0;
exports.adminAgentMediaRelations = exports.adminAgentMediaSchema = exports.insertAdminAgentMediaSchema = exports.agentMediaLibraryRelations = exports.agentMediaSchema = exports.flowItemSchema = exports.insertAgentMediaSchema = exports.businessAgentConfigSchema = exports.insertBusinessAgentConfigSchema = exports.userFollowupLogsRelations = exports.followupConfigsRelations = exports.insertUserFollowupLogSchema = exports.followupConfigSchema = exports.insertFollowupConfigSchema = exports.insertAdminSetupRequestMessageSchema = exports.insertAdminSetupRequestSchema = exports.insertAdminMessageSchema = exports.insertAdminConversationSchema = exports.insertAdminWhatsappConnectionSchema = exports.insertCouponSchema = exports.insertSystemConfigSchema = exports.insertPaymentReceiptSchema = exports.insertPaymentHistorySchema = exports.insertPaymentSchema = exports.insertSubscriptionSchema = exports.insertPlanSchema = exports.loginAdminSchema = exports.insertAdminSchema = exports.insertWebsiteImportSchema = exports.insertAgentDisabledConversationSchema = exports.insertAiAgentConfigSchema = exports.sendMessageSchema = exports.insertMessageSchema = exports.insertWhatsappContactSchema = exports.insertConversationSchema = exports.mediaFlowItemSchema = exports.insertMediaFlowItemSchema = exports.mediaFlowSchema = exports.insertMediaFlowSchema = exports.insertWhatsappConnectionSchema = exports.agentSchema = exports.insertAgentSchema = exports.adminWhatsappConnectionRelations = exports.paymentReceiptsRelations = exports.paymentsRelations = exports.subscriptionsRelations = exports.plansRelations = exports.messagesRelations = exports.conversationsRelations = exports.whatsappContactsRelations = void 0;
exports.resellerClients = exports.resellers = exports.insertStatusRotationItemSchema = exports.insertStatusRotationSchema = exports.insertScheduledStatusSchema = exports.insertProfessionalServiceSchema = exports.insertSchedulingProfessionalSchema = exports.insertSchedulingServiceSchema = exports.insertSchedulingExceptionSchema = exports.insertAppointmentSchema = exports.insertSchedulingConfigSchema = exports.professionalServicesRelations = exports.schedulingProfessionalsRelations = exports.schedulingServicesRelations = exports.appointmentsRelations = exports.schedulingConfigRelations = exports.professionalServices = exports.schedulingProfessionals = exports.schedulingServices = exports.statusRotationItems = exports.statusRotation = exports.scheduledStatus = exports.schedulingExceptions = exports.googleCalendarTokens = exports.appointments = exports.schedulingConfig = exports.insertFunnelDealSchema = exports.insertFunnelStageSchema = exports.insertSalesFunnelSchema = exports.dealHistoryRelations = exports.funnelDealsRelations = exports.funnelStagesRelations = exports.salesFunnelsRelations = exports.dealHistory = exports.funnelDeals = exports.funnelStages = exports.salesFunnels = exports.insertDailyUsageSchema = exports.dailyUsage = exports.exclusionConfigSchema = exports.exclusionListItemSchema = exports.insertExclusionConfigSchema = exports.insertExclusionListSchema = exports.exclusionConfig = exports.exclusionList = exports.mistralResponseSchema = exports.insertUserQuickReplySchema = exports.userQuickReplies = exports.insertQuickReplySchema = exports.adminQuickReplies = void 0;
exports.teamMembersRelations = exports.deliveryOrderSchema = exports.menuItemSchema = exports.menuCategorySchema = exports.halfHalfPricingSchema = exports.halfHalfPricingModeSchema = exports.deliveryConfigSchema = exports.orderItemsRelations = exports.deliveryOrdersRelations = exports.menuItemsRelations = exports.menuCategoriesRelations = exports.deliveryConfigRelations = exports.deliveryCarts = exports.orderItems = exports.deliveryOrders = exports.menuItems = exports.menuCategories = exports.deliveryConfig = exports.productsConfigSchema = exports.insertProductsConfigSchema = exports.productSchema = exports.insertProductSchema = exports.productsConfigRelations = exports.productsRelations = exports.productsConfig = exports.products = exports.customFieldValueSchema = exports.insertCustomFieldValueSchema = exports.customFieldDefinitionSchema = exports.insertCustomFieldDefinitionSchema = exports.customFieldValuesRelations = exports.customFieldDefinitionsRelations = exports.customFieldValues = exports.customFieldDefinitions = exports.insertResellerInvoiceItemsSchema = exports.insertResellerInvoiceSchema = exports.insertPaymentReminderSchema = exports.insertResellerPaymentSchema = exports.insertResellerClientSchema = exports.resellerSchema = exports.insertResellerSchema = exports.resellerInvoiceItemsRelations = exports.resellerInvoicesRelations = exports.resellerInvoiceItems = exports.resellerInvoices = exports.resellerPaymentsRelations = exports.resellerClientsRelations = exports.resellersRelations = exports.paymentReminders = exports.resellerPayments = void 0;
exports.insertBroadcastCampaignSchema = exports.broadcastCampaignsRelations = exports.broadcastCampaigns = exports.businessCategories = exports.updateSmartQrcodeSchema = exports.smartQrcodeSchema = exports.insertSmartQrcodeSchema = exports.qrcodeScanLogsRelations = exports.smartQrcodesRelations = exports.qrcodeScanLogs = exports.smartQrcodes = exports.conversationScheduledMessages = exports.connectionMemberSchema = exports.connectionAgentSchema = exports.insertConnectionMemberSchema = exports.insertConnectionAgentSchema = exports.scheduledMessageSchema = exports.insertScheduledMessageSchema = exports.insertSectorMemberSchema = exports.insertSectorSchema = exports.scheduledMessagesRelations = exports.routingLogsRelations = exports.sectorMembersRelations = exports.sectorsRelations = exports.connectionMembersRelations = exports.connectionAgentsRelations = exports.connectionMembers = exports.connectionAgents = exports.scheduledMessages = exports.bulkActionsLog = exports.ticketClosureLogsV4 = exports.saasOwnerReports = exports.routingLogs = exports.sectorMembers = exports.sectors = exports.updateAudioConfigSchema = exports.insertAudioConfigSchema = exports.audioMessageCounterRelations = exports.audioConfigRelations = exports.audioMessageCounter = exports.audioConfig = exports.audioResponseModes = exports.whatsappStatusSchema = exports.insertWhatsappStatusSchema = exports.statusHistory = exports.whatsappStatuses = exports.teamMemberLoginSchema = exports.teamMemberSchema = exports.insertTeamMemberSchema = exports.teamMemberSessionsRelations = void 0;
exports.insertBlogAssetImageSchema = exports.insertBlogPostSchema = exports.insertBlogTopicSchema = exports.blogPostMetrics = exports.blogIndexingChecks = exports.blogPublishJobs = exports.blogGenerationJobs = exports.blogPostSources = exports.blogPostRevisions = exports.blogPosts = exports.blogTopics = exports.blogAssetImages = void 0;
var drizzle_orm_1 = require("drizzle-orm");
var pg_core_1 = require("drizzle-orm/pg-core");
var drizzle_orm_2 = require("drizzle-orm");
var drizzle_zod_1 = require("drizzle-zod");
var zod_1 = require("zod");
// Session storage table (IMPORTANT: mandatory for Replit Auth)
exports.sessions = (0, pg_core_1.pgTable)("sessions", {
    sid: (0, pg_core_1.varchar)("sid").primaryKey(),
    sess: (0, pg_core_1.jsonb)("sess").notNull(),
    expire: (0, pg_core_1.timestamp)("expire").notNull(),
}, function (table) { return [(0, pg_core_1.index)("IDX_session_expire").on(table.expire)]; });
// User storage table (IMPORTANT: mandatory for Supabase Auth)
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    email: (0, pg_core_1.varchar)("email").unique(),
    name: (0, pg_core_1.varchar)("name").notNull(),
    phone: (0, pg_core_1.varchar)("phone").notNull(),
    profileImageUrl: (0, pg_core_1.varchar)("profile_image_url"),
    role: (0, pg_core_1.varchar)("role", { length: 50 }).default("user").notNull(),
    whatsappNumber: (0, pg_core_1.varchar)("whatsapp_number"),
    onboardingCompleted: (0, pg_core_1.boolean)("onboarding_completed").default(false).notNull(),
    // Reseller reference - se este usuário é cliente de um revendedor
    resellerId: (0, pg_core_1.varchar)("reseller_id"),
    // Plano atribuído via link de cadastro - sempre mostra apenas este plano na página /plans
    assignedPlanId: (0, pg_core_1.varchar)("assigned_plan_id"),
    // Assinatura de mensagens (nome/apelido que aparece em negrito no WhatsApp)
    signature: (0, pg_core_1.varchar)("signature", { length: 100 }),
    signatureEnabled: (0, pg_core_1.boolean)("signature_enabled").default(false),
    // Campos de suspensão por violação de políticas
    suspendedAt: (0, pg_core_1.timestamp)("suspended_at"),
    suspensionReason: (0, pg_core_1.text)("suspension_reason"),
    suspensionType: (0, pg_core_1.varchar)("suspension_type", { length: 100 }),
    refundedAt: (0, pg_core_1.timestamp)("refunded_at"),
    refundAmount: (0, pg_core_1.numeric)("refund_amount", { precision: 10, scale: 2 }),
    // Documento (CPF/CNPJ) salvo para pagamentos
    documentType: (0, pg_core_1.varchar)("document_type", { length: 10 }).default("CPF"),
    documentNumber: (0, pg_core_1.varchar)("document_number", { length: 20 }),
    // Tipo de negócio do usuário (slug da business_categories table)
    businessType: (0, pg_core_1.varchar)("business_type", { length: 100 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Policy Violations table - Registro de violações de políticas da plataforma
exports.policyViolations = (0, pg_core_1.pgTable)("policy_violations", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    violationType: (0, pg_core_1.varchar)("violation_type", { length: 100 }).notNull(), // religious_services, adult_content, illegal_activities, etc.
    description: (0, pg_core_1.text)("description"),
    evidence: (0, pg_core_1.jsonb)("evidence"), // Array de evidências (mensagens, prints, etc.)
    status: (0, pg_core_1.varchar)("status", { length: 50 }).notNull().default("pending"), // pending, confirmed, dismissed
    resultedInSuspension: (0, pg_core_1.boolean)("resulted_in_suspension").default(false),
    adminId: (0, pg_core_1.varchar)("admin_id"), // Admin que revisou
    internalNotes: (0, pg_core_1.text)("internal_notes"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// =============================================================================
// TEAM MEMBERS - Sistema de Membros/Funcionários
// Permite ao dono da conta cadastrar funcionários que podem responder clientes
// =============================================================================
exports.teamMembers = (0, pg_core_1.pgTable)("team_members", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    // Dono da conta (usuário principal do SaaS)
    ownerId: (0, pg_core_1.varchar)("owner_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Informações do membro
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    email: (0, pg_core_1.varchar)("email", { length: 255 }).notNull(),
    passwordHash: (0, pg_core_1.text)("password_hash").notNull(),
    // Cargo/Função (ex: vendedor, atendente, suporte)
    role: (0, pg_core_1.varchar)("role", { length: 100 }).default("atendente").notNull(),
    // Permissões
    permissions: (0, pg_core_1.jsonb)("permissions").$type().default({
        canViewConversations: true,
        canSendMessages: true,
        canUseQuickReplies: true,
        canMoveKanban: true,
        canViewDashboard: false,
        canEditContacts: false,
    }),
    // Status
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    lastLoginAt: (0, pg_core_1.timestamp)("last_login_at"),
    // Avatar/Foto
    avatarUrl: (0, pg_core_1.text)("avatar_url"),
    // Assinatura de mensagens (nome/apelido que aparece em negrito no WhatsApp)
    signature: (0, pg_core_1.varchar)("signature", { length: 100 }),
    signatureEnabled: (0, pg_core_1.boolean)("signature_enabled").default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_team_members_owner").on(table.ownerId),
    (0, pg_core_1.index)("idx_team_members_email").on(table.email),
    (0, pg_core_1.uniqueIndex)("idx_team_members_unique_email_owner").on(table.ownerId, table.email),
]; });
// Sessões de membros da equipe (login separado)
exports.teamMemberSessions = (0, pg_core_1.pgTable)("team_member_sessions", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    memberId: (0, pg_core_1.varchar)("member_id").notNull().references(function () { return exports.teamMembers.id; }, { onDelete: 'cascade' }),
    token: (0, pg_core_1.varchar)("token", { length: 255 }).notNull().unique(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at").notNull(),
    userAgent: (0, pg_core_1.text)("user_agent"),
    ipAddress: (0, pg_core_1.varchar)("ip_address", { length: 50 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_team_member_sessions_member").on(table.memberId),
    (0, pg_core_1.index)("idx_team_member_sessions_token").on(table.token),
]; });
// Agents table - agentes com prompt personalizavel para conexoes multiplas
exports.agents = (0, pg_core_1.pgTable)("agents", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    prompt: (0, pg_core_1.text)("prompt").notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_agents_name").on(table.name),
    (0, pg_core_1.index)("idx_agents_active").on(table.isActive),
]; });
// WhatsApp connections table
exports.whatsappConnections = (0, pg_core_1.pgTable)("whatsapp_connections", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    agentId: (0, pg_core_1.varchar)("agent_id").references(function () { return exports.agents.id; }, { onDelete: 'set null' }),
    phoneNumber: (0, pg_core_1.varchar)("phone_number"),
    isConnected: (0, pg_core_1.boolean)("is_connected").default(false).notNull(),
    qrCode: (0, pg_core_1.text)("qr_code"),
    sessionData: (0, pg_core_1.jsonb)("session_data"),
    // 🛡️ SAFE MODE: Modo seguro anti-bloqueio
    // Quando ativado pelo admin, ao reconectar via QR Code:
    // 1. Zera todos os follow-ups pendentes
    // 2. Zera a fila de mensagens em memória
    // 3. Começa do zero para evitar novo bloqueio
    safeModeEnabled: (0, pg_core_1.boolean)("safe_mode_enabled").default(false).notNull(),
    safeModeActivatedAt: (0, pg_core_1.timestamp)("safe_mode_activated_at"),
    safeModeActivatedBy: (0, pg_core_1.varchar)("safe_mode_activated_by", { length: 255 }),
    safeModeLastCleanupAt: (0, pg_core_1.timestamp)("safe_mode_last_cleanup_at"),
    // Multi-connection fields
    connectionName: (0, pg_core_1.varchar)("connection_name", { length: 255 }),
    connectionType: (0, pg_core_1.varchar)("connection_type", { length: 50 }).default("primary"),
    isPrimary: (0, pg_core_1.boolean)("is_primary").default(true),
    // Per-connection AI toggle: when false, AI doesn't auto-respond on this number
    // but CRM features (conversations, manual replies, etc.) still work
    aiEnabled: (0, pg_core_1.boolean)("ai_enabled").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// =============================================================================
// CONTACT LISTS - Sistema de Listas de Contatos para Envio em Massa
// Persistido no banco para não perder dados em restart
// =============================================================================
exports.contactLists = (0, pg_core_1.pgTable)("contact_lists", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    // Array de contatos em JSONB para flexibilidade
    contacts: (0, pg_core_1.jsonb)("contacts").$type().default([]),
    // Contagem de contatos (denormalizado para performance)
    contactCount: (0, pg_core_1.integer)("contact_count").default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_contact_lists_user").on(table.userId),
    (0, pg_core_1.index)("idx_contact_lists_created").on(table.createdAt),
]; });
exports.insertContactListSchema = (0, drizzle_zod_1.createInsertSchema)(exports.contactLists);
// WhatsApp Contacts Cache table (FIX LID 2025 - Persistent storage)
// Armazena mapeamento de @lid → phoneNumber para contatos do Instagram/Facebook
exports.whatsappContacts = (0, pg_core_1.pgTable)("whatsapp_contacts", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    // Connection que possui este contato
    connectionId: (0, pg_core_1.varchar)("connection_id")
        .notNull()
        .references(function () { return exports.whatsappConnections.id; }, { onDelete: "cascade" }),
    // JID principal do contato (pode ser @s.whatsapp.net ou @lid)
    contactId: (0, pg_core_1.text)("contact_id").notNull(),
    // LID do contato (se vier de Instagram/Facebook Business)
    // Exemplo: "153519764074616@lid"
    lid: (0, pg_core_1.text)("lid"),
    // Número de telefone real do contato (formato: numero@s.whatsapp.net)
    // Exemplo: "5511987654321@s.whatsapp.net"
    // ESTE É O CAMPO CRÍTICO para resolver @lid → número real
    phoneNumber: (0, pg_core_1.text)("phone_number"),
    // Nome do contato (push name do WhatsApp)
    name: (0, pg_core_1.varchar)("name", { length: 255 }),
    // URL da foto de perfil (opcional)
    imgUrl: (0, pg_core_1.text)("img_url"),
    // Última sincronização com Baileys (para auditoria)
    lastSyncedAt: (0, pg_core_1.timestamp)("last_synced_at").defaultNow(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    // ÍNDICE COMPOSTO: Busca rápida por connectionId + contactId
    (0, pg_core_1.index)("idx_contacts_connection_id").on(table.connectionId, table.contactId),
    // ÍNDICE: Busca rápida por LID (principal use case: resolver @lid)
    (0, pg_core_1.index)("idx_contacts_lid").on(table.lid).where((0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["", " IS NOT NULL"], ["", " IS NOT NULL"])), table.lid)),
    // ÍNDICE: Busca por phoneNumber para lookups reversos
    (0, pg_core_1.index)("idx_contacts_phone").on(table.phoneNumber).where((0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["", " IS NOT NULL"], ["", " IS NOT NULL"])), table.phoneNumber)),
    // UNIQUE CONSTRAINT: Um contato por connectionId (evita duplicatas)
    // Permite upsert sem conflitos
    (0, pg_core_1.uniqueIndex)("idx_contacts_unique_connection_contact").on(table.connectionId, table.contactId),
    // ÍNDICE: Cleanup de contatos antigos (data retention)
    (0, pg_core_1.index)("idx_contacts_last_synced").on(table.lastSyncedAt),
]; });
// Conversations table
exports.conversations = (0, pg_core_1.pgTable)("conversations", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    connectionId: (0, pg_core_1.varchar)("connection_id")
        .notNull()
        .references(function () { return exports.whatsappConnections.id; }, { onDelete: "cascade" }),
    contactNumber: (0, pg_core_1.varchar)("contact_number").notNull(),
    // JID completo original do WhatsApp (ex: 5517912345678@s.whatsapp.net ou 254635809968349:20@lid)
    // SEMPRE usar este campo ao enviar mensagens de volta!
    remoteJid: (0, pg_core_1.text)("remote_jid"),
    // Sufixo/domínio do JID usado para enviar mensagens (ex: s.whatsapp.net, lid)
    jidSuffix: (0, pg_core_1.varchar)("jid_suffix", { length: 32 }).default("s.whatsapp.net"),
    contactName: (0, pg_core_1.varchar)("contact_name"),
    // URL da foto de perfil do contato (Base64 ou URL do Baileys)
    contactAvatar: (0, pg_core_1.text)("contact_avatar"),
    lastMessageText: (0, pg_core_1.text)("last_message_text"),
    lastMessageTime: (0, pg_core_1.timestamp)("last_message_time"),
    lastMessageFromMe: (0, pg_core_1.boolean)("last_message_from_me"),
    unreadCount: (0, pg_core_1.integer)("unread_count").default(0).notNull(),
    isArchived: (0, pg_core_1.boolean)("is_archived").default(false).notNull(),
    // Flag para rastrear se a conversa já foi respondida alguma vez pelo atendente
    hasReplied: (0, pg_core_1.boolean)("has_replied").default(false).notNull(),
    // Follow-up Inteligente
    followupActive: (0, pg_core_1.boolean)("followup_active").default(true).notNull(),
    followupStage: (0, pg_core_1.integer)("followup_stage").default(0).notNull(),
    nextFollowupAt: (0, pg_core_1.timestamp)("next_followup_at"),
    followupDisabledReason: (0, pg_core_1.text)("followup_disabled_reason"),
    // Token único para compartilhar conversa via URL
    shareToken: (0, pg_core_1.varchar)("share_token", { length: 64 }).unique(),
    // CRM Kanban
    kanbanStageId: (0, pg_core_1.varchar)("kanban_stage_id"),
    kanbanNotes: (0, pg_core_1.text)("kanban_notes"),
    priority: (0, pg_core_1.varchar)("priority").default("normal"),
    // Ticket/Chamado - Encerramento (Fase 4.2)
    isClosed: (0, pg_core_1.boolean)("is_closed").default(false).notNull(),
    closedAt: (0, pg_core_1.timestamp)("closed_at"),
    closedBy: (0, pg_core_1.varchar)("closed_by", { length: 255 }), // userId or 'system'
    closureReason: (0, pg_core_1.text)("closure_reason"),
    ticketNumber: (0, pg_core_1.varchar)("ticket_number", { length: 50 }), // Optional ticket reference
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Messages table
exports.messages = (0, pg_core_1.pgTable)("messages", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    conversationId: (0, pg_core_1.varchar)("conversation_id").notNull().references(function () { return exports.conversations.id; }, { onDelete: 'cascade' }),
    messageId: (0, pg_core_1.varchar)("message_id").notNull(),
    fromMe: (0, pg_core_1.boolean)("from_me").notNull(),
    text: (0, pg_core_1.text)("text"),
    timestamp: (0, pg_core_1.timestamp)("timestamp").notNull(),
    status: (0, pg_core_1.varchar)("status", { length: 50 }),
    isFromAgent: (0, pg_core_1.boolean)("is_from_agent").default(false).notNull(),
    // Media fields
    mediaType: (0, pg_core_1.varchar)("media_type", { length: 50 }), // 'image', 'audio', 'video', 'document'
    mediaUrl: (0, pg_core_1.text)("media_url"), // URL or base64 data (Supabase Storage)
    mediaMimeType: (0, pg_core_1.varchar)("media_mime_type", { length: 100 }),
    mediaDuration: (0, pg_core_1.integer)("media_duration"), // Duration in seconds for audio/video
    mediaCaption: (0, pg_core_1.text)("media_caption"), // Caption for media
    // Re-download metadata (para baixar mídia novamente do WhatsApp)
    mediaKey: (0, pg_core_1.text)("media_key"), // Chave de descriptografia (base64)
    directPath: (0, pg_core_1.text)("direct_path"), // Caminho direto no servidor WhatsApp
    mediaUrlOriginal: (0, pg_core_1.text)("media_url_original"), // URL original do WhatsApp
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Ticket Closure Logs table - Audit trail for conversation closures (Fase 4.2)
exports.ticketClosureLogs = (0, pg_core_1.pgTable)("ticket_closure_logs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    conversationId: (0, pg_core_1.varchar)("conversation_id").notNull().references(function () { return exports.conversations.id; }, { onDelete: 'cascade' }),
    action: (0, pg_core_1.varchar)("action", { length: 50 }).notNull(), // 'closed', 'reopened'
    performedBy: (0, pg_core_1.varchar)("performed_by", { length: 255 }).notNull(), // userId or 'system'
    performedByName: (0, pg_core_1.varchar)("performed_by_name", { length: 255 }), // Display name
    reason: (0, pg_core_1.text)("reason"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_ticket_closure_logs_conversation").on(table.conversationId),
    (0, pg_core_1.index)("idx_ticket_closure_logs_created_at").on(table.createdAt),
]; });
// AI Agent Configuration table (LEGACY - mantido para backward compatibility)
exports.aiAgentConfig = (0, pg_core_1.pgTable)("ai_agent_config", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().unique().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    prompt: (0, pg_core_1.text)("prompt").notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").default(false).notNull(),
    model: (0, pg_core_1.varchar)("model", { length: 100 }).default("openai/gpt-oss-20b").notNull(), // CORRIGIDO: usar modelo do OpenRouter
    triggerPhrases: (0, pg_core_1.text)("trigger_phrases").array(),
    messageSplitChars: (0, pg_core_1.integer)("message_split_chars").default(400),
    responseDelaySeconds: (0, pg_core_1.integer)("response_delay_seconds").default(30), // Tempo de espera antes de responder (acumulação de mensagens)
    fetchHistoryOnFirstResponse: (0, pg_core_1.boolean)("fetch_history_on_first_response").default(false).notNull(), // Buscar histórico do WhatsApp ao responder pela primeira vez
    pauseOnManualReply: (0, pg_core_1.boolean)("pause_on_manual_reply").default(true).notNull(), // Pausar IA automaticamente quando dono responde manualmente
    autoReactivateMinutes: (0, pg_core_1.integer)("auto_reactivate_minutes"), // Tempo em minutos para reativar IA automaticamente (NULL = nunca)
    // PARTE 5 - Modo Fluxo: chatbot com roteiro pré-definido
    flowScript: (0, pg_core_1.text)("flow_script"), // Roteiro/prompt de fluxo em texto livre
    flowModeActive: (0, pg_core_1.boolean)("flow_mode_active").default(false).notNull(), // Se TRUE, IA segue estritamente o roteiro (sem improviso)
    // PARTE 6 - Saudação personalizada e endereço fixo
    customGreeting: (0, pg_core_1.text)("custom_greeting"), // Saudação fixa, suporta {nome}. NULL = IA improvisa
    customAddress: (0, pg_core_1.text)("custom_address"), // Endereço fixo do negócio. NULL = não informar
    greetingVariation: (0, pg_core_1.boolean)("greeting_variation").default(false).notNull(), // Se TRUE, IA varia a saudação naturalmente
    greetingEnabled: (0, pg_core_1.boolean)("greeting_enabled").default(false).notNull(), // Se TRUE, saudação personalizada está ATIVA
    addressEnabled: (0, pg_core_1.boolean)("address_enabled").default(false).notNull(), // Se TRUE, endereço fixo está ATIVO
    // PARTE 7 - Horário de funcionamento
    businessHoursEnabled: (0, pg_core_1.boolean)("business_hours_enabled").default(false).notNull(), // Se TRUE, horário de funcionamento está ATIVO
    businessHours: (0, pg_core_1.jsonb)("business_hours").$type().default({
        seg: { enabled: true, open: "09:00", close: "18:00" },
        ter: { enabled: true, open: "09:00", close: "18:00" },
        qua: { enabled: true, open: "09:00", close: "18:00" },
        qui: { enabled: true, open: "09:00", close: "18:00" },
        sex: { enabled: true, open: "09:00", close: "18:00" },
        sab: { enabled: false, open: "", close: "" },
        dom: { enabled: false, open: "", close: "" },
    }),
    // PARTE 8 - Mensagem fora do horário
    offHoursMessageEnabled: (0, pg_core_1.boolean)("off_hours_message_enabled").default(false).notNull(),
    offHoursMessage: (0, pg_core_1.text)("off_hours_message").default("Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve!"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Agent Media Library table (NEW - Sistema de mídias do agente)
// Cada agente pode ter áudios, imagens, vídeos que o Mistral decide quando enviar
exports.agentMediaLibrary = (0, pg_core_1.pgTable)("agent_media_library", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Identificação da mídia (usado no prompt para o Mistral)
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(), // Ex: "AUDIO_PRECO", "IMG_BOAS_VINDAS"
    // Tipo da mídia
    mediaType: (0, pg_core_1.varchar)("media_type", { length: 20 }).notNull(), // 'audio', 'image', 'video', 'document', 'flow'
    // Armazenamento
    storageUrl: (0, pg_core_1.text)("storage_url").notNull().default(''), // URL pública ou base64 (vazio para tipo 'flow')
    fileName: (0, pg_core_1.varchar)("file_name", { length: 255 }),
    fileSize: (0, pg_core_1.integer)("file_size"), // Tamanho em bytes
    mimeType: (0, pg_core_1.varchar)("mime_type", { length: 100 }),
    durationSeconds: (0, pg_core_1.integer)("duration_seconds"), // Duração para áudio/vídeo
    // Contexto para o Mistral (CRÍTICO)
    description: (0, pg_core_1.text)("description").notNull(), // "Explica o preço do produto X" - usado pela IA para decidir
    whenToUse: (0, pg_core_1.text)("when_to_use"), // "Quando o cliente perguntar sobre preço"
    caption: (0, pg_core_1.text)("caption"), // Legenda que vai junto com a imagem/vídeo no WhatsApp
    transcription: (0, pg_core_1.text)("transcription"), // Transcrição automática de áudios
    // Opções de áudio
    isPtt: (0, pg_core_1.boolean)("is_ptt").default(true), // PTT = Push-to-talk (mensagem de voz gravada)
    // Opção de envio combinado
    sendAlone: (0, pg_core_1.boolean)("send_alone").default(false), // true = enviar sozinha, false = pode ser combinada com outras
    // === FLUXO DE MÍDIA (PARTE 6) ===
    // Sequência ordenada de itens (mídia + texto) para envio em ordem exata
    // Cada item: { type: 'media'|'text', storageUrl?, mediaType?, caption?, text?, fileName?, mimeType? }
    flowItems: (0, pg_core_1.jsonb)("flow_items").$type(),
    // Ordenação e status
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    displayOrder: (0, pg_core_1.integer)("display_order").default(0),
    // W-API integration
    wapiMediaId: (0, pg_core_1.varchar)("wapi_media_id", { length: 255 }),
    // Metadata
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_agent_media_user_id").on(table.userId),
    (0, pg_core_1.uniqueIndex)("idx_agent_media_unique_name").on(table.userId, table.name),
]; });
// Business Agent Configuration table (NEW - Sistema avançado de configuração)
exports.businessAgentConfigs = (0, pg_core_1.pgTable)("business_agent_configs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_16 || (templateObject_16 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().unique().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Identity Layer
    agentName: (0, pg_core_1.varchar)("agent_name", { length: 100 }).notNull(),
    agentRole: (0, pg_core_1.varchar)("agent_role", { length: 200 }).notNull(),
    companyName: (0, pg_core_1.varchar)("company_name", { length: 200 }).notNull(),
    companyDescription: (0, pg_core_1.text)("company_description"),
    personality: (0, pg_core_1.varchar)("personality", { length: 100 }).default("profissional e prestativo").notNull(),
    // Knowledge Layer (JSONB para flexibilidade)
    productsServices: (0, pg_core_1.jsonb)("products_services").$type().default([]),
    businessInfo: (0, pg_core_1.jsonb)("business_info").$type().default({}),
    faqItems: (0, pg_core_1.jsonb)("faq_items").$type().default([]),
    policies: (0, pg_core_1.jsonb)("policies").$type().default({}),
    // Guardrails Layer
    allowedTopics: (0, pg_core_1.text)("allowed_topics").array().default([]),
    prohibitedTopics: (0, pg_core_1.text)("prohibited_topics").array().default([]),
    allowedActions: (0, pg_core_1.text)("allowed_actions").array().default([]),
    prohibitedActions: (0, pg_core_1.text)("prohibited_actions").array().default([]),
    // Personality Layer
    toneOfVoice: (0, pg_core_1.varchar)("tone_of_voice", { length: 50 }).default("amigável").notNull(),
    communicationStyle: (0, pg_core_1.varchar)("communication_style", { length: 50 }).default("claro e direto").notNull(),
    emojiUsage: (0, pg_core_1.varchar)("emoji_usage", { length: 20 }).default("moderado").notNull(), // nunca, raro, moderado, frequente
    formalityLevel: (0, pg_core_1.integer)("formality_level").default(5).notNull(), // 1-10 scale
    // Behavior Configuration
    maxResponseLength: (0, pg_core_1.integer)("max_response_length").default(400).notNull(),
    useCustomerName: (0, pg_core_1.boolean)("use_customer_name").default(true).notNull(),
    offerNextSteps: (0, pg_core_1.boolean)("offer_next_steps").default(true).notNull(),
    escalateToHuman: (0, pg_core_1.boolean)("escalate_to_human").default(true).notNull(),
    escalationKeywords: (0, pg_core_1.text)("escalation_keywords").array().default([]),
    // Notification System
    notificationPhoneNumber: (0, pg_core_1.varchar)("notification_phone_number"),
    notificationTrigger: (0, pg_core_1.text)("notification_trigger"), // "Notify me when..."
    notificationEnabled: (0, pg_core_1.boolean)("notification_enabled").default(false).notNull(),
    notificationMode: (0, pg_core_1.varchar)("notification_mode", { length: 20 }).default("ai").notNull(), // "ai" | "manual" | "both"
    notificationManualKeywords: (0, pg_core_1.text)("notification_manual_keywords"), // Comma-separated keywords for manual mode
    // System Configuration
    isActive: (0, pg_core_1.boolean)("is_active").default(false).notNull(),
    model: (0, pg_core_1.varchar)("model", { length: 100 }).default("openai/gpt-oss-20b").notNull(), // CORRIGIDO: usar modelo do OpenRouter
    triggerPhrases: (0, pg_core_1.text)("trigger_phrases").array().default([]),
    templateType: (0, pg_core_1.varchar)("template_type", { length: 50 }), // ecommerce, professional, health, education, realestate
    // Metadata
    version: (0, pg_core_1.integer)("version").default(1).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Agent disabled conversations table
exports.agentDisabledConversations = (0, pg_core_1.pgTable)("agent_disabled_conversations", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_17 || (templateObject_17 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    conversationId: (0, pg_core_1.varchar)("conversation_id").notNull().unique().references(function () { return exports.conversations.id; }, { onDelete: 'cascade' }),
    // Auto-reactivation timer fields
    ownerLastReplyAt: (0, pg_core_1.timestamp)("owner_last_reply_at").defaultNow(), // Quando o dono respondeu pela última vez
    autoReactivateAfterMinutes: (0, pg_core_1.integer)("auto_reactivate_after_minutes"), // NULL = nunca, número = minutos para reativar
    clientHasPendingMessage: (0, pg_core_1.boolean)("client_has_pending_message").default(false), // Cliente enviou mensagem após pausa?
    clientLastMessageAt: (0, pg_core_1.timestamp)("client_last_message_at"), // Quando cliente enviou última mensagem
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// ============================================================================
// 🌐 WEBSITE IMPORTS - Sistema de importação de dados de websites
// Permite ao cliente alimentar o agente com produtos/preços/info de seu site
// ============================================================================
exports.websiteImports = (0, pg_core_1.pgTable)("website_imports", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_18 || (templateObject_18 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Informações do website
    websiteUrl: (0, pg_core_1.text)("website_url").notNull(),
    websiteName: (0, pg_core_1.varchar)("website_name", { length: 255 }),
    websiteDescription: (0, pg_core_1.text)("website_description"),
    // Conteúdo extraído
    extractedHtml: (0, pg_core_1.text)("extracted_html"), // HTML bruto (limitado)
    extractedText: (0, pg_core_1.text)("extracted_text"), // Texto limpo extraído
    // Dados estruturados extraídos pelo Mistral
    extractedProducts: (0, pg_core_1.jsonb)("extracted_products").$type().default([]),
    extractedInfo: (0, pg_core_1.jsonb)("extracted_info").$type().default({}),
    // Contexto formatado para o agente (pronto para usar no prompt)
    formattedContext: (0, pg_core_1.text)("formatted_context"),
    // Status e controle
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("pending").notNull(), // pending, processing, completed, failed
    errorMessage: (0, pg_core_1.text)("error_message"),
    pagesScraped: (0, pg_core_1.integer)("pages_scraped").default(0),
    productsFound: (0, pg_core_1.integer)("products_found").default(0),
    // Se o contexto foi aplicado ao prompt do agente
    appliedToPrompt: (0, pg_core_1.boolean)("applied_to_prompt").default(false),
    appliedAt: (0, pg_core_1.timestamp)("applied_at"),
    // Metadata
    lastScrapedAt: (0, pg_core_1.timestamp)("last_scraped_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_website_imports_user_id").on(table.userId),
    (0, pg_core_1.index)("idx_website_imports_status").on(table.status),
]; });
// Admins table
exports.admins = (0, pg_core_1.pgTable)("admins", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_19 || (templateObject_19 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    email: (0, pg_core_1.varchar)("email").unique().notNull(),
    passwordHash: (0, pg_core_1.text)("password_hash").notNull(),
    role: (0, pg_core_1.varchar)("role", { length: 50 }).default("admin").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Admin WhatsApp connection table
exports.adminWhatsappConnection = (0, pg_core_1.pgTable)("admin_whatsapp_connection", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_20 || (templateObject_20 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    adminId: (0, pg_core_1.varchar)("admin_id").notNull().unique().references(function () { return exports.admins.id; }, { onDelete: 'cascade' }),
    phoneNumber: (0, pg_core_1.varchar)("phone_number"),
    isConnected: (0, pg_core_1.boolean)("is_connected").default(false).notNull(),
    qrCode: (0, pg_core_1.text)("qr_code"),
    sessionData: (0, pg_core_1.jsonb)("session_data"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Admin Conversations table - Conversas do WhatsApp do admin com clientes do sistema
exports.adminConversations = (0, pg_core_1.pgTable)("admin_conversations", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_21 || (templateObject_21 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    adminId: (0, pg_core_1.varchar)("admin_id").notNull().references(function () { return exports.admins.id; }, { onDelete: 'cascade' }),
    contactNumber: (0, pg_core_1.varchar)("contact_number").notNull(),
    remoteJid: (0, pg_core_1.text)("remote_jid"),
    contactName: (0, pg_core_1.varchar)("contact_name"),
    contactAvatar: (0, pg_core_1.text)("contact_avatar"),
    lastMessageText: (0, pg_core_1.text)("last_message_text"),
    lastMessageTime: (0, pg_core_1.timestamp)("last_message_time"),
    unreadCount: (0, pg_core_1.integer)("unread_count").default(0).notNull(),
    // Controle de IA - se false, admin responde manualmente
    isAgentEnabled: (0, pg_core_1.boolean)("is_agent_enabled").default(true).notNull(),
    // Follow-up System
    followupActive: (0, pg_core_1.boolean)("followup_active").default(true).notNull(),
    followupStage: (0, pg_core_1.integer)("followup_stage").default(0).notNull(),
    nextFollowupAt: (0, pg_core_1.timestamp)("next_followup_at"),
    // 🛡️ FOLLOW-UP FOR NON-PAYERS
    paymentStatus: (0, pg_core_1.varchar)("payment_status", { length: 50 }).default("pending").notNull(), // paid, unpaid, pending
    followupForNonPayers: (0, pg_core_1.boolean)("followup_for_non_payers").default(true).notNull(), // Toggle for non-payer follow-up
    followupConfig: (0, pg_core_1.jsonb)("followup_config").$type().default({
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
    contextState: (0, pg_core_1.jsonb)("context_state").$type().default({}),
    memorySummary: (0, pg_core_1.text)("memory_summary"),
    linkedUserId: (0, pg_core_1.varchar)("linked_user_id"),
    lastTestToken: (0, pg_core_1.text)("last_test_token"),
    lastSuccessfulAction: (0, pg_core_1.text)("last_successful_action"),
    pendingSlot: (0, pg_core_1.text)("pending_slot"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_admin_conversations_admin").on(table.adminId),
    (0, pg_core_1.index)("idx_admin_conversations_contact").on(table.contactNumber),
]; });
// Admin Messages table - Mensagens das conversas do admin
exports.adminMessages = (0, pg_core_1.pgTable)("admin_messages", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_22 || (templateObject_22 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    conversationId: (0, pg_core_1.varchar)("conversation_id").notNull().references(function () { return exports.adminConversations.id; }, { onDelete: 'cascade' }),
    messageId: (0, pg_core_1.varchar)("message_id").notNull(),
    fromMe: (0, pg_core_1.boolean)("from_me").notNull(),
    text: (0, pg_core_1.text)("text"),
    timestamp: (0, pg_core_1.timestamp)("timestamp").notNull(),
    status: (0, pg_core_1.varchar)("status", { length: 50 }),
    isFromAgent: (0, pg_core_1.boolean)("is_from_agent").default(false).notNull(),
    // Media fields
    mediaType: (0, pg_core_1.varchar)("media_type", { length: 50 }),
    mediaUrl: (0, pg_core_1.text)("media_url"),
    mediaMimeType: (0, pg_core_1.varchar)("media_mime_type", { length: 100 }),
    mediaCaption: (0, pg_core_1.text)("media_caption"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_admin_messages_conversation").on(table.conversationId),
    (0, pg_core_1.index)("idx_admin_messages_timestamp").on(table.timestamp),
]; });
exports.adminSetupRequests = (0, pg_core_1.pgTable)("admin_setup_requests", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_23 || (templateObject_23 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    conversationId: (0, pg_core_1.varchar)("conversation_id").notNull().references(function () { return exports.adminConversations.id; }, { onDelete: 'cascade' }),
    adminId: (0, pg_core_1.varchar)("admin_id").notNull().references(function () { return exports.admins.id; }, { onDelete: 'cascade' }),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("open").notNull(),
    requestMode: (0, pg_core_1.varchar)("request_mode", { length: 50 }).default("assisted_setup").notNull(),
    analysisStatus: (0, pg_core_1.varchar)("analysis_status", { length: 50 }).default("pending").notNull(),
    approvalStatus: (0, pg_core_1.varchar)("approval_status", { length: 50 }).default("pending").notNull(),
    executionStatus: (0, pg_core_1.varchar)("execution_status", { length: 50 }).default("pending").notNull(),
    lockedCustomerHandoff: (0, pg_core_1.boolean)("locked_customer_handoff").default(true).notNull(),
    linkedUserId: (0, pg_core_1.varchar)("linked_user_id"),
    draftUserId: (0, pg_core_1.varchar)("draft_user_id"),
    createdTestToken: (0, pg_core_1.text)("created_test_token"),
    createdAutologinToken: (0, pg_core_1.text)("created_autologin_token"),
    createdByAi: (0, pg_core_1.boolean)("created_by_ai").default(true).notNull(),
    approvedByAdmin: (0, pg_core_1.varchar)("approved_by_admin"),
    approvedAt: (0, pg_core_1.timestamp)("approved_at"),
    completedAt: (0, pg_core_1.timestamp)("completed_at"),
    lastError: (0, pg_core_1.text)("last_error"),
    conversationFacts: (0, pg_core_1.jsonb)("conversation_facts").$type().default({}),
    suggestedPlan: (0, pg_core_1.jsonb)("suggested_plan").$type().default({}),
    refinedPlan: (0, pg_core_1.jsonb)("refined_plan").$type().default({}),
    executionResult: (0, pg_core_1.jsonb)("execution_result").$type().default({}),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)("idx_admin_setup_requests_conversation").on(table.conversationId),
    (0, pg_core_1.index)("idx_admin_setup_requests_admin").on(table.adminId),
    (0, pg_core_1.index)("idx_admin_setup_requests_status").on(table.status),
]; });
exports.adminSetupRequestMessages = (0, pg_core_1.pgTable)("admin_setup_request_messages", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_24 || (templateObject_24 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    requestId: (0, pg_core_1.varchar)("request_id").notNull().references(function () { return exports.adminSetupRequests.id; }, { onDelete: 'cascade' }),
    role: (0, pg_core_1.varchar)("role", { length: 20 }).notNull(),
    messageType: (0, pg_core_1.varchar)("message_type", { length: 30 }).default("chat").notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    planSnapshot: (0, pg_core_1.jsonb)("plan_snapshot").$type().default({}),
    metadata: (0, pg_core_1.jsonb)("metadata").$type().default({}),
    createdBy: (0, pg_core_1.varchar)("created_by"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_admin_setup_request_messages_request").on(table.requestId),
    (0, pg_core_1.index)("idx_admin_setup_request_messages_created").on(table.createdAt),
]; });
// Admin Agent Media table
exports.adminAgentMedia = (0, pg_core_1.pgTable)("admin_agent_media", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_25 || (templateObject_25 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    adminId: (0, pg_core_1.varchar)("admin_id").notNull().references(function () { return exports.admins.id; }, { onDelete: "cascade" }),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    mediaType: (0, pg_core_1.varchar)("media_type", { length: 50 }).notNull(),
    storageUrl: (0, pg_core_1.text)("storage_url").notNull(),
    fileName: (0, pg_core_1.varchar)("file_name", { length: 500 }),
    fileSize: (0, pg_core_1.integer)("file_size"),
    mimeType: (0, pg_core_1.varchar)("mime_type", { length: 100 }),
    durationSeconds: (0, pg_core_1.integer)("duration_seconds"),
    description: (0, pg_core_1.text)("description").notNull(),
    whenToUse: (0, pg_core_1.text)("when_to_use"),
    caption: (0, pg_core_1.text)("caption"),
    transcription: (0, pg_core_1.text)("transcription"),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    sendAlone: (0, pg_core_1.boolean)("send_alone").default(true).notNull(),
    displayOrder: (0, pg_core_1.integer)("display_order").default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_admin_agent_media_admin_id").on(table.adminId),
    (0, pg_core_1.index)("idx_admin_agent_media_name").on(table.name),
    (0, pg_core_1.index)("idx_admin_agent_media_active").on(table.isActive),
]; });
// Media Flows table - sequencias de midias por agente
exports.mediaFlows = (0, pg_core_1.pgTable)("media_flows", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_26 || (templateObject_26 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    agentId: (0, pg_core_1.varchar)("agent_id").notNull().references(function () { return exports.agents.id; }, { onDelete: "cascade" }),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_media_flows_agent").on(table.agentId),
    (0, pg_core_1.index)("idx_media_flows_active").on(table.isActive),
]; });
// Media Flow Items table - itens de midia em ordem com delays
exports.mediaFlowItems = (0, pg_core_1.pgTable)("media_flow_items", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_27 || (templateObject_27 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    flowId: (0, pg_core_1.varchar)("flow_id").notNull().references(function () { return exports.mediaFlows.id; }, { onDelete: "cascade" }),
    mediaId: (0, pg_core_1.varchar)("media_id", { length: 255 }),
    mediaName: (0, pg_core_1.varchar)("media_name", { length: 255 }).notNull(),
    mediaType: (0, pg_core_1.varchar)("media_type", { length: 50 }).notNull(),
    storageUrl: (0, pg_core_1.text)("storage_url").notNull(),
    caption: (0, pg_core_1.text)("caption"),
    delaySeconds: (0, pg_core_1.integer)("delay_seconds").default(0).notNull(),
    displayOrder: (0, pg_core_1.integer)("display_order").default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_media_flow_items_flow").on(table.flowId),
    (0, pg_core_1.index)("idx_media_flow_items_order").on(table.flowId, table.displayOrder),
]; });
// Plans table
exports.plans = (0, pg_core_1.pgTable)("plans", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_28 || (templateObject_28 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    nome: (0, pg_core_1.varchar)("nome", { length: 100 }).notNull(),
    descricao: (0, pg_core_1.text)("descricao"), // Descrição detalhada do plano
    valor: (0, pg_core_1.decimal)("valor", { precision: 10, scale: 2 }).notNull(),
    valorOriginal: (0, pg_core_1.decimal)("valor_original", { precision: 10, scale: 2 }), // Valor antes do desconto (se houver)
    periodicidade: (0, pg_core_1.varchar)("periodicidade", { length: 20 }).default("mensal").notNull(), // mensal, anual
    tipo: (0, pg_core_1.varchar)("tipo", { length: 50 }).default("padrao").notNull(), // padrao, anual, implementacao, personalizado
    descontoPercent: (0, pg_core_1.integer)("desconto_percent").default(0), // Percentual de desconto
    badge: (0, pg_core_1.varchar)("badge", { length: 50 }), // Ex: "Mais Popular", "5% OFF", etc
    destaque: (0, pg_core_1.boolean)("destaque").default(false).notNull(), // Plano em destaque
    ordem: (0, pg_core_1.integer)("ordem").default(0).notNull(), // Ordem de exibição
    limiteConversas: (0, pg_core_1.integer)("limite_conversas").default(100).notNull(),
    limiteAgentes: (0, pg_core_1.integer)("limite_agentes").default(1).notNull(),
    caracteristicas: (0, pg_core_1.jsonb)("caracteristicas").$type(), // Lista de features do plano
    ativo: (0, pg_core_1.boolean)("ativo").default(true).notNull(),
    // Mercado Pago fields
    mpPlanId: (0, pg_core_1.varchar)("mp_plan_id", { length: 255 }), // ID do plano no Mercado Pago
    valorPrimeiraCobranca: (0, pg_core_1.decimal)("valor_primeira_cobranca", { precision: 10, scale: 2 }), // Valor diferente na primeira cobrança
    codigoPersonalizado: (0, pg_core_1.varchar)("codigo_personalizado", { length: 50 }).unique(), // Código para planos personalizados
    isPersonalizado: (0, pg_core_1.boolean)("is_personalizado").default(false), // Se é um plano personalizado
    frequenciaDias: (0, pg_core_1.integer)("frequencia_dias").default(30), // Frequência de cobrança em dias
    trialDias: (0, pg_core_1.integer)("trial_dias").default(0), // Dias de trial gratuito
    // Link único para cadastro - quando cliente entra por este link, só vê este plano
    linkSlug: (0, pg_core_1.varchar)("link_slug", { length: 100 }).unique(), // Slug único para URL ex: plano-mensal-abc123
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Subscriptions table
exports.subscriptions = (0, pg_core_1.pgTable)("subscriptions", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_29 || (templateObject_29 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    planId: (0, pg_core_1.varchar)("plan_id").notNull().references(function () { return exports.plans.id; }, { onDelete: 'cascade' }),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("pending").notNull(), // pending, active, expired, cancelled, paused
    dataInicio: (0, pg_core_1.timestamp)("data_inicio"),
    dataFim: (0, pg_core_1.timestamp)("data_fim"),
    canaisUsados: (0, pg_core_1.integer)("canais_usados").default(0).notNull(),
    couponCode: (0, pg_core_1.text)("coupon_code"), // Cupom de desconto aplicado
    couponPrice: (0, pg_core_1.decimal)("coupon_price", { precision: 10, scale: 2 }), // Preço com cupom aplicado
    // Mercado Pago fields
    mpSubscriptionId: (0, pg_core_1.varchar)("mp_subscription_id", { length: 255 }), // ID da assinatura no Mercado Pago
    mpStatus: (0, pg_core_1.varchar)("mp_status", { length: 50 }), // Status no Mercado Pago
    mpInitPoint: (0, pg_core_1.text)("mp_init_point"), // Link de pagamento
    externalReference: (0, pg_core_1.varchar)("external_reference", { length: 255 }).unique(), // Referência externa
    nextPaymentDate: (0, pg_core_1.timestamp)("next_payment_date"), // Data da próxima cobrança
    payerEmail: (0, pg_core_1.varchar)("payer_email", { length: 255 }), // Email do pagador
    paymentMethod: (0, pg_core_1.varchar)("payment_method", { length: 50 }).default("mercadopago"), // Método de pagamento
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Payments table (legacy - Pix payments)
exports.payments = (0, pg_core_1.pgTable)("payments", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_30 || (templateObject_30 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    subscriptionId: (0, pg_core_1.varchar)("subscription_id").notNull().references(function () { return exports.subscriptions.id; }, { onDelete: 'cascade' }),
    valor: (0, pg_core_1.decimal)("valor", { precision: 10, scale: 2 }).notNull(),
    pixCode: (0, pg_core_1.text)("pix_code").notNull(),
    pixQrCode: (0, pg_core_1.text)("pix_qr_code").notNull(),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("pending").notNull(), // pending, paid, expired
    dataPagamento: (0, pg_core_1.timestamp)("data_pagamento"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// ============================================================================
// PAYMENT HISTORY - Histórico de todos os pagamentos (MercadoPago, Pix, etc)
// Usado para exibir histórico de cobranças para clientes e admin
// ============================================================================
exports.paymentHistory = (0, pg_core_1.pgTable)("payment_history", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_31 || (templateObject_31 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    subscriptionId: (0, pg_core_1.varchar)("subscription_id").notNull().references(function () { return exports.subscriptions.id; }, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.varchar)("user_id").references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Informações do pagamento MercadoPago
    mpPaymentId: (0, pg_core_1.varchar)("mp_payment_id", { length: 255 }), // ID do pagamento no MercadoPago
    mpSubscriptionId: (0, pg_core_1.varchar)("mp_subscription_id", { length: 255 }), // ID da assinatura no MP
    // Valores
    amount: (0, pg_core_1.decimal)("amount", { precision: 10, scale: 2 }).notNull(), // Valor cobrado
    netAmount: (0, pg_core_1.decimal)("net_amount", { precision: 10, scale: 2 }), // Valor líquido recebido
    feeAmount: (0, pg_core_1.decimal)("fee_amount", { precision: 10, scale: 2 }), // Taxa MP
    // Status
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("pending").notNull(), // pending, approved, rejected, refunded
    statusDetail: (0, pg_core_1.varchar)("status_detail", { length: 100 }), // Detalhe do status (accredited, cc_rejected_*, etc)
    // Tipo de pagamento
    paymentType: (0, pg_core_1.varchar)("payment_type", { length: 50 }).default("recurring").notNull(), // first_payment, setup_fee, recurring, refund
    paymentMethod: (0, pg_core_1.varchar)("payment_method", { length: 50 }), // credit_card, debit_card, pix, boleto
    // Datas
    paymentDate: (0, pg_core_1.timestamp)("payment_date"), // Data do pagamento
    dueDate: (0, pg_core_1.timestamp)("due_date"), // Data de vencimento
    // Informações adicionais
    payerEmail: (0, pg_core_1.varchar)("payer_email", { length: 255 }),
    cardLastFourDigits: (0, pg_core_1.varchar)("card_last_four_digits", { length: 4 }),
    cardBrand: (0, pg_core_1.varchar)("card_brand", { length: 50 }), // visa, mastercard, etc
    // Metadata
    rawResponse: (0, pg_core_1.jsonb)("raw_response"), // Resposta completa do MercadoPago
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_payment_history_subscription").on(table.subscriptionId),
    (0, pg_core_1.index)("idx_payment_history_user").on(table.userId),
    (0, pg_core_1.index)("idx_payment_history_mp_payment").on(table.mpPaymentId),
    (0, pg_core_1.index)("idx_payment_history_status").on(table.status),
    (0, pg_core_1.index)("idx_payment_history_date").on(table.paymentDate),
]; });
// ============================================================================
// PAYMENT RECEIPTS - Comprovantes de pagamento PIX enviados por usuários
// Usado para armazenar comprovantes de pagamento manual via PIX
// ============================================================================
exports.paymentReceipts = (0, pg_core_1.pgTable)("payment_receipts", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_32 || (templateObject_32 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    subscriptionId: (0, pg_core_1.varchar)("subscription_id").notNull().references(function () { return exports.subscriptions.id; }, { onDelete: 'cascade' }),
    planId: (0, pg_core_1.varchar)("plan_id").references(function () { return exports.plans.id; }),
    // Valor do pagamento
    amount: (0, pg_core_1.decimal)("amount", { precision: 10, scale: 2 }).notNull(),
    // URL e informações do arquivo do comprovante
    receiptUrl: (0, pg_core_1.varchar)("receipt_url").notNull(),
    receiptFilename: (0, pg_core_1.varchar)("receipt_filename"),
    receiptMimeType: (0, pg_core_1.varchar)("receipt_mime_type"),
    // Status do comprovante: pending, approved, rejected
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("pending").notNull(),
    // ID do pagamento no MercadoPago (se houver)
    mpPaymentId: (0, pg_core_1.varchar)("mp_payment_id", { length: 255 }),
    // IDs do admin que aprovou/rejeitou
    reviewedBy: (0, pg_core_1.varchar)("reviewed_by"),
    reviewedAt: (0, pg_core_1.timestamp)("reviewed_at"),
    reviewNotes: (0, pg_core_1.text)("review_notes"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_payment_receipts_user").on(table.userId),
    (0, pg_core_1.index)("idx_payment_receipts_subscription").on(table.subscriptionId),
    (0, pg_core_1.index)("idx_payment_receipts_status").on(table.status),
]; });
// ============================================================================
// RESELLER CLIENT PAYMENT RECEIPTS - Comprovantes de pagamento para clientes de revenda
// Usado quando o cliente de um revendedor paga via PIX (chave do revendedor)
// ============================================================================
exports.resellerClientPaymentReceipts = (0, pg_core_1.pgTable)("reseller_client_payment_receipts", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_33 || (templateObject_33 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    // Referências
    resellerClientId: (0, pg_core_1.varchar)("reseller_client_id").notNull().references(function () { return exports.resellerClients.id; }, { onDelete: 'cascade' }),
    resellerId: (0, pg_core_1.varchar)("reseller_id").notNull().references(function () { return exports.resellers.id; }, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }), // O usuário que é cliente do revendedor
    // Informações do pagamento
    amount: (0, pg_core_1.decimal)("amount", { precision: 10, scale: 2 }).notNull(),
    referenceMonth: (0, pg_core_1.varchar)("reference_month", { length: 7 }).notNull(), // YYYY-MM
    // URL e informações do arquivo do comprovante
    receiptUrl: (0, pg_core_1.varchar)("receipt_url").notNull(),
    receiptFilename: (0, pg_core_1.varchar)("receipt_filename"),
    receiptMimeType: (0, pg_core_1.varchar)("receipt_mime_type"),
    // Status: pending, approved, rejected
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("pending").notNull(),
    // Dias de acesso concedidos quando aprovado (geralmente 30)
    daysGranted: (0, pg_core_1.integer)("days_granted").default(30),
    // IDs do admin que aprovou/rejeitou
    reviewedBy: (0, pg_core_1.varchar)("reviewed_by"),
    reviewedAt: (0, pg_core_1.timestamp)("reviewed_at"),
    reviewNotes: (0, pg_core_1.text)("review_notes"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_reseller_receipts_client").on(table.resellerClientId),
    (0, pg_core_1.index)("idx_reseller_receipts_reseller").on(table.resellerId),
    (0, pg_core_1.index)("idx_reseller_receipts_user").on(table.userId),
    (0, pg_core_1.index)("idx_reseller_receipts_status").on(table.status),
]; });
// Coupons table - Sistema de cupons de desconto
exports.coupons = (0, pg_core_1.pgTable)("coupons", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_34 || (templateObject_34 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    code: (0, pg_core_1.text)("code").unique().notNull(), // Código do cupom (ex: BLACKFRIDAY, WELCOME2025)
    discountType: (0, pg_core_1.text)("discount_type").default("fixed_price").notNull(), // Tipo de desconto
    discountValue: (0, pg_core_1.decimal)("discount_value", { precision: 10, scale: 2 }).default("0").notNull(), // Valor do desconto
    finalPrice: (0, pg_core_1.decimal)("final_price", { precision: 10, scale: 2 }), // Preço final com cupom aplicado
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
    maxUses: (0, pg_core_1.integer)("max_uses"), // null = ilimitado
    currentUses: (0, pg_core_1.integer)("current_uses").default(0), // Quantas vezes foi usado
    applicablePlans: (0, pg_core_1.jsonb)("applicable_plans").$type(), // Planos onde o cupom é válido (null = todos)
    validFrom: (0, pg_core_1.timestamp)("valid_from").defaultNow(),
    validUntil: (0, pg_core_1.timestamp)("valid_until"), // Data de expiração (null = sem expiração)
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// System configuration table
exports.systemConfig = (0, pg_core_1.pgTable)("system_config", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_35 || (templateObject_35 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    chave: (0, pg_core_1.varchar)("chave", { length: 100 }).unique().notNull(),
    valor: (0, pg_core_1.text)("valor"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Follow-up Logs table (Admin)
exports.followupLogs = (0, pg_core_1.pgTable)("followup_logs", {
    id: (0, pg_core_1.integer)("id").primaryKey().generatedAlwaysAsIdentity(),
    conversationId: (0, pg_core_1.varchar)("conversation_id").references(function () { return exports.adminConversations.id; }),
    contactNumber: (0, pg_core_1.text)("contact_number").notNull(),
    status: (0, pg_core_1.text)("status").notNull(), // 'sent', 'failed', 'skipped', 'cancelled'
    messageContent: (0, pg_core_1.text)("message_content"),
    executedAt: (0, pg_core_1.timestamp)("executed_at").defaultNow(),
    errorReason: (0, pg_core_1.text)("error_reason"),
    // 🛡️ FOLLOW-UP FOR NON-PAYERS
    paymentStatus: (0, pg_core_1.varchar)("payment_status", { length: 50 }), // paid, unpaid, pending
    followupType: (0, pg_core_1.varchar)("followup_type", { length: 50 }), // regular, non_payer, final
    stage: (0, pg_core_1.integer)("stage"), // Follow-up stage number
    // 🛡️ SCHEDULED MESSAGES
    scheduledFor: (0, pg_core_1.timestamp)("scheduled_for"),
}, function (table) { return [
    (0, pg_core_1.index)("idx_followup_logs_conversation").on(table.conversationId),
    (0, pg_core_1.index)("idx_followup_logs_status").on(table.status),
    (0, pg_core_1.index)("idx_followup_logs_contact").on(table.contactNumber),
]; });
// ============================================================================
// FOLLOW-UP INTELIGENTE - Configuração por Usuário
// ============================================================================
// Configuração de Follow-up por Usuário
exports.followupConfigs = (0, pg_core_1.pgTable)("followup_configs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_36 || (templateObject_36 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().unique().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Configurações gerais
    // IMPORTANTE: Follow-up DESATIVADO por padrão - usuário precisa ativar manualmente
    isEnabled: (0, pg_core_1.boolean)("is_enabled").default(false).notNull(),
    maxAttempts: (0, pg_core_1.integer)("max_attempts").default(8).notNull(),
    // Intervalos customizados (em minutos) - padrão: 10m, 30m, 3h, 24h, 48h, 3d, 7d, 15d
    intervalsMinutes: (0, pg_core_1.jsonb)("intervals_minutes").$type().default([10, 30, 180, 1440, 2880, 4320, 10080, 21600]),
    // Horário comercial
    businessHoursStart: (0, pg_core_1.text)("business_hours_start").default("09:00"),
    businessHoursEnd: (0, pg_core_1.text)("business_hours_end").default("18:00"),
    businessDays: (0, pg_core_1.jsonb)("business_days").$type().default([1, 2, 3, 4, 5]), // 0=dom, 1=seg, ... 6=sab
    respectBusinessHours: (0, pg_core_1.boolean)("respect_business_hours").default(true).notNull(),
    // Tom e estilo das mensagens
    tone: (0, pg_core_1.varchar)("tone", { length: 50 }).default("consultivo").notNull(), // consultivo, vendedor, humano, técnico
    formalityLevel: (0, pg_core_1.integer)("formality_level").default(5).notNull(), // 1-10
    useEmojis: (0, pg_core_1.boolean)("use_emojis").default(true).notNull(),
    // Informações importantes para argumentos (a IA pode usar)
    importantInfo: (0, pg_core_1.jsonb)("important_info").$type().default([]),
    // Loop infinito após acabar sequência
    infiniteLoop: (0, pg_core_1.boolean)("infinite_loop").default(true).notNull(),
    infiniteLoopMinDays: (0, pg_core_1.integer)("infinite_loop_min_days").default(15).notNull(),
    infiniteLoopMaxDays: (0, pg_core_1.integer)("infinite_loop_max_days").default(30).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Logs de Follow-up dos Usuários
exports.userFollowupLogs = (0, pg_core_1.pgTable)("user_followup_logs", {
    id: (0, pg_core_1.integer)("id").primaryKey().generatedAlwaysAsIdentity(),
    conversationId: (0, pg_core_1.varchar)("conversation_id").references(function () { return exports.conversations.id; }, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.varchar)("user_id").references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    contactNumber: (0, pg_core_1.text)("contact_number").notNull(),
    status: (0, pg_core_1.text)("status").notNull(), // 'sent', 'failed', 'cancelled', 'skipped'
    messageContent: (0, pg_core_1.text)("message_content"),
    aiDecision: (0, pg_core_1.jsonb)("ai_decision").$type(),
    stage: (0, pg_core_1.integer)("stage").default(0).notNull(),
    executedAt: (0, pg_core_1.timestamp)("executed_at").defaultNow(),
    errorReason: (0, pg_core_1.text)("error_reason"),
}, function (table) { return [
    (0, pg_core_1.index)("idx_user_followup_logs_conv").on(table.conversationId),
    (0, pg_core_1.index)("idx_user_followup_logs_user").on(table.userId),
]; });
// =============================================================================
// TAGS / ETIQUETAS - Sistema de Etiquetas para Conversas (WhatsApp CRM)
// =============================================================================
// Tabela de Tags
exports.tags = (0, pg_core_1.pgTable)("tags", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_37 || (templateObject_37 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Nome da etiqueta (ex: "Novo cliente", "Pagamento pendente")
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    // Cor da etiqueta (hex color, ex: "#22c55e")
    color: (0, pg_core_1.varchar)("color", { length: 20 }).default("#6b7280").notNull(),
    // Ícone (opcional - nome do ícone lucide)
    icon: (0, pg_core_1.varchar)("icon", { length: 50 }),
    // Se é uma etiqueta padrão do sistema (WhatsApp Business defaults)
    isDefault: (0, pg_core_1.boolean)("is_default").default(false).notNull(),
    // Posição para ordenação
    position: (0, pg_core_1.integer)("position").default(0).notNull(),
    // Descrição opcional da etiqueta
    description: (0, pg_core_1.text)("description"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_tags_user_id").on(table.userId),
    (0, pg_core_1.index)("idx_tags_position").on(table.position),
    // Unique: nome único por usuário
    (0, pg_core_1.uniqueIndex)("idx_tags_unique_name").on(table.userId, table.name),
]; });
// Tabela de Relação Tags <-> Conversas (many-to-many)
exports.conversationTags = (0, pg_core_1.pgTable)("conversation_tags", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_38 || (templateObject_38 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    conversationId: (0, pg_core_1.varchar)("conversation_id").notNull().references(function () { return exports.conversations.id; }, { onDelete: 'cascade' }),
    tagId: (0, pg_core_1.varchar)("tag_id").notNull().references(function () { return exports.tags.id; }, { onDelete: 'cascade' }),
    // Quando a tag foi atribuída
    assignedAt: (0, pg_core_1.timestamp)("assigned_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_conversation_tags_conversation").on(table.conversationId),
    (0, pg_core_1.index)("idx_conversation_tags_tag").on(table.tagId),
    // Unique: uma tag só pode ser atribuída uma vez por conversa
    (0, pg_core_1.uniqueIndex)("idx_conversation_tags_unique").on(table.conversationId, table.tagId),
]; });
// Schemas e types para Tags
exports.insertTagSchema = (0, drizzle_zod_1.createInsertSchema)(exports.tags).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.tagSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Nome é obrigatório").max(100),
    color: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida").default("#6b7280"),
    icon: zod_1.z.string().max(50).optional(),
    description: zod_1.z.string().max(500).optional(),
    position: zod_1.z.number().int().min(0).default(0),
});
// Schemas e types para ConversationTags
exports.insertConversationTagSchema = (0, drizzle_zod_1.createInsertSchema)(exports.conversationTags).omit({
    id: true,
    assignedAt: true,
});
// Relations para Tags
exports.tagsRelations = (0, drizzle_orm_2.relations)(exports.tags, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, {
            fields: [exports.tags.userId],
            references: [exports.users.id],
        }),
        conversationTags: many(exports.conversationTags),
    });
});
exports.conversationTagsRelations = (0, drizzle_orm_2.relations)(exports.conversationTags, function (_a) {
    var one = _a.one;
    return ({
        conversation: one(exports.conversations, {
            fields: [exports.conversationTags.conversationId],
            references: [exports.conversations.id],
        }),
        tag: one(exports.tags, {
            fields: [exports.conversationTags.tagId],
            references: [exports.tags.id],
        }),
    });
});
exports.agentsRelations = (0, drizzle_orm_2.relations)(exports.agents, function (_a) {
    var many = _a.many;
    return ({
        connections: many(exports.whatsappConnections),
        mediaFlows: many(exports.mediaFlows),
    });
});
exports.mediaFlowsRelations = (0, drizzle_orm_2.relations)(exports.mediaFlows, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        agent: one(exports.agents, {
            fields: [exports.mediaFlows.agentId],
            references: [exports.agents.id],
        }),
        items: many(exports.mediaFlowItems),
    });
});
exports.mediaFlowItemsRelations = (0, drizzle_orm_2.relations)(exports.mediaFlowItems, function (_a) {
    var one = _a.one;
    return ({
        flow: one(exports.mediaFlows, {
            fields: [exports.mediaFlowItems.flowId],
            references: [exports.mediaFlows.id],
        }),
    });
});
// Relations
exports.usersRelations = (0, drizzle_orm_2.relations)(exports.users, function (_a) {
    var many = _a.many, one = _a.one;
    return ({
        whatsappConnections: many(exports.whatsappConnections),
        aiAgentConfig: one(exports.aiAgentConfig, {
            fields: [exports.users.id],
            references: [exports.aiAgentConfig.userId],
        }),
        businessAgentConfig: one(exports.businessAgentConfigs, {
            fields: [exports.users.id],
            references: [exports.businessAgentConfigs.userId],
        }),
        subscriptions: many(exports.subscriptions),
        broadcastCampaigns: many(exports.broadcastCampaigns),
    });
});
exports.whatsappConnectionsRelations = (0, drizzle_orm_2.relations)(exports.whatsappConnections, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, {
            fields: [exports.whatsappConnections.userId],
            references: [exports.users.id],
        }),
        agent: one(exports.agents, {
            fields: [exports.whatsappConnections.agentId],
            references: [exports.agents.id],
        }),
        conversations: many(exports.conversations),
        contacts: many(exports.whatsappContacts),
        broadcastCampaigns: many(exports.broadcastCampaigns),
    });
});
exports.whatsappContactsRelations = (0, drizzle_orm_2.relations)(exports.whatsappContacts, function (_a) {
    var one = _a.one;
    return ({
        connection: one(exports.whatsappConnections, {
            fields: [exports.whatsappContacts.connectionId],
            references: [exports.whatsappConnections.id],
        }),
    });
});
exports.conversationsRelations = (0, drizzle_orm_2.relations)(exports.conversations, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        connection: one(exports.whatsappConnections, {
            fields: [exports.conversations.connectionId],
            references: [exports.whatsappConnections.id],
        }),
        messages: many(exports.messages),
        agentDisabled: one(exports.agentDisabledConversations, {
            fields: [exports.conversations.id],
            references: [exports.agentDisabledConversations.conversationId],
        }),
        conversationTags: many(exports.conversationTags),
    });
});
exports.messagesRelations = (0, drizzle_orm_2.relations)(exports.messages, function (_a) {
    var one = _a.one;
    return ({
        conversation: one(exports.conversations, {
            fields: [exports.messages.conversationId],
            references: [exports.conversations.id],
        }),
    });
});
exports.plansRelations = (0, drizzle_orm_2.relations)(exports.plans, function (_a) {
    var many = _a.many;
    return ({
        subscriptions: many(exports.subscriptions),
    });
});
exports.subscriptionsRelations = (0, drizzle_orm_2.relations)(exports.subscriptions, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, {
            fields: [exports.subscriptions.userId],
            references: [exports.users.id],
        }),
        plan: one(exports.plans, {
            fields: [exports.subscriptions.planId],
            references: [exports.plans.id],
        }),
        payments: many(exports.payments),
    });
});
exports.paymentsRelations = (0, drizzle_orm_2.relations)(exports.payments, function (_a) {
    var one = _a.one;
    return ({
        subscription: one(exports.subscriptions, {
            fields: [exports.payments.subscriptionId],
            references: [exports.subscriptions.id],
        }),
    });
});
exports.paymentReceiptsRelations = (0, drizzle_orm_2.relations)(exports.paymentReceipts, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, {
            fields: [exports.paymentReceipts.userId],
            references: [exports.users.id],
        }),
        subscription: one(exports.subscriptions, {
            fields: [exports.paymentReceipts.subscriptionId],
            references: [exports.subscriptions.id],
        }),
        plan: one(exports.plans, {
            fields: [exports.paymentReceipts.planId],
            references: [exports.plans.id],
        }),
    });
});
exports.adminWhatsappConnectionRelations = (0, drizzle_orm_2.relations)(exports.adminWhatsappConnection, function (_a) {
    var one = _a.one;
    return ({
        admin: one(exports.admins, {
            fields: [exports.adminWhatsappConnection.adminId],
            references: [exports.admins.id],
        }),
    });
});
exports.insertAgentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agents).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.agentSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Nome do agente Ã© obrigatÃ³rio").max(255),
    prompt: zod_1.z.string().min(1, "Prompt do agente Ã© obrigatÃ³rio"),
    isActive: zod_1.z.boolean().default(true),
});
exports.insertWhatsappConnectionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.whatsappConnections).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertMediaFlowSchema = (0, drizzle_zod_1.createInsertSchema)(exports.mediaFlows).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.mediaFlowSchema = zod_1.z.object({
    agentId: zod_1.z.string().min(1, "Agente Ã© obrigatÃ³rio"),
    name: zod_1.z.string().min(1, "Nome do fluxo Ã© obrigatÃ³rio").max(255),
    description: zod_1.z.string().max(2000).optional().nullable(),
    isActive: zod_1.z.boolean().default(true),
});
exports.insertMediaFlowItemSchema = (0, drizzle_zod_1.createInsertSchema)(exports.mediaFlowItems).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.mediaFlowItemSchema = zod_1.z.object({
    flowId: zod_1.z.string().min(1, "Fluxo Ã© obrigatÃ³rio"),
    mediaId: zod_1.z.string().optional().nullable(),
    mediaName: zod_1.z.string().min(1, "Nome da mÃ­dia Ã© obrigatÃ³rio").max(255),
    mediaType: zod_1.z.enum(["audio", "image", "video", "document"]),
    storageUrl: zod_1.z.string().min(1, "URL da mÃ­dia Ã© obrigatÃ³ria"),
    caption: zod_1.z.string().max(2000).optional().nullable(),
    delaySeconds: zod_1.z.number().int().min(0).default(0),
    displayOrder: zod_1.z.number().int().min(0).default(0),
});
exports.insertConversationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.conversations).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// WhatsApp Contacts schemas and types
exports.insertWhatsappContactSchema = (0, drizzle_zod_1.createInsertSchema)(exports.whatsappContacts).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    lastSyncedAt: true,
});
exports.insertMessageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.messages).omit({
    id: true,
    createdAt: true,
});
exports.sendMessageSchema = zod_1.z.object({
    conversationId: zod_1.z.string(),
    text: zod_1.z.string().min(1, "Message cannot be empty"),
});
exports.insertAiAgentConfigSchema = (0, drizzle_zod_1.createInsertSchema)(exports.aiAgentConfig).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertAgentDisabledConversationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agentDisabledConversations).omit({
    id: true,
    createdAt: true,
});
// Website Imports schemas and types
exports.insertWebsiteImportSchema = (0, drizzle_zod_1.createInsertSchema)(exports.websiteImports).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Admin schemas and types
exports.insertAdminSchema = (0, drizzle_zod_1.createInsertSchema)(exports.admins).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.loginAdminSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
// Plan schemas and types
exports.insertPlanSchema = (0, drizzle_zod_1.createInsertSchema)(exports.plans).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Subscription schemas and types
exports.insertSubscriptionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.subscriptions).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Payment schemas and types (legacy - Pix)
exports.insertPaymentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.payments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Payment History schemas and types (MercadoPago, etc)
exports.insertPaymentHistorySchema = (0, drizzle_zod_1.createInsertSchema)(exports.paymentHistory).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Payment Receipt schemas and types
exports.insertPaymentReceiptSchema = (0, drizzle_zod_1.createInsertSchema)(exports.paymentReceipts).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// System config schemas and types
exports.insertSystemConfigSchema = (0, drizzle_zod_1.createInsertSchema)(exports.systemConfig).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Coupon schemas and types
exports.insertCouponSchema = (0, drizzle_zod_1.createInsertSchema)(exports.coupons).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Admin WhatsApp connection schemas and types
exports.insertAdminWhatsappConnectionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.adminWhatsappConnection).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Admin Conversations schemas and types
exports.insertAdminConversationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.adminConversations).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Admin Messages schemas and types
exports.insertAdminMessageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.adminMessages).omit({
    id: true,
    createdAt: true,
});
exports.insertAdminSetupRequestSchema = (0, drizzle_zod_1.createInsertSchema)(exports.adminSetupRequests).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertAdminSetupRequestMessageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.adminSetupRequestMessages).omit({
    id: true,
    createdAt: true,
});
// ============================================================================
// FOLLOW-UP INTELIGENTE - Schemas e Types
// ============================================================================
// Follow-up Config schemas and types
exports.insertFollowupConfigSchema = (0, drizzle_zod_1.createInsertSchema)(exports.followupConfigs).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.followupConfigSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    // IMPORTANTE: Follow-up DESATIVADO por padrão - usuário precisa ativar manualmente
    isEnabled: zod_1.z.boolean().default(false),
    maxAttempts: zod_1.z.number().min(1).max(20).default(8),
    intervalsMinutes: zod_1.z.array(zod_1.z.number()).default([10, 30, 180, 1440, 2880, 4320, 10080, 21600]),
    businessHoursStart: zod_1.z.string().default("09:00"),
    businessHoursEnd: zod_1.z.string().default("18:00"),
    businessDays: zod_1.z.array(zod_1.z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
    respectBusinessHours: zod_1.z.boolean().default(true),
    tone: zod_1.z.enum(["consultivo", "vendedor", "humano", "técnico"]).default("consultivo"),
    formalityLevel: zod_1.z.number().min(1).max(10).default(5),
    useEmojis: zod_1.z.boolean().default(true),
    importantInfo: zod_1.z.array(zod_1.z.object({
        titulo: zod_1.z.string(),
        conteudo: zod_1.z.string(),
        usado: zod_1.z.boolean().optional(),
    })).default([]),
    infiniteLoop: zod_1.z.boolean().default(true),
    infiniteLoopMinDays: zod_1.z.number().min(1).max(60).default(15),
    infiniteLoopMaxDays: zod_1.z.number().min(1).max(90).default(30),
});
// User Follow-up Logs schemas and types
exports.insertUserFollowupLogSchema = (0, drizzle_zod_1.createInsertSchema)(exports.userFollowupLogs).omit({
    id: true,
    executedAt: true,
});
// Follow-up Config Relations
exports.followupConfigsRelations = (0, drizzle_orm_2.relations)(exports.followupConfigs, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, {
            fields: [exports.followupConfigs.userId],
            references: [exports.users.id],
        }),
    });
});
// User Follow-up Logs Relations
exports.userFollowupLogsRelations = (0, drizzle_orm_2.relations)(exports.userFollowupLogs, function (_a) {
    var one = _a.one;
    return ({
        conversation: one(exports.conversations, {
            fields: [exports.userFollowupLogs.conversationId],
            references: [exports.conversations.id],
        }),
        user: one(exports.users, {
            fields: [exports.userFollowupLogs.userId],
            references: [exports.users.id],
        }),
    });
});
// Business Agent Configuration schemas and types
exports.insertBusinessAgentConfigSchema = (0, drizzle_zod_1.createInsertSchema)(exports.businessAgentConfigs).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Zod schemas detalhados para validação
exports.businessAgentConfigSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    agentName: zod_1.z.string().min(1, "Nome do agente é obrigatório"),
    agentRole: zod_1.z.string().min(1, "Função do agente é obrigatória"),
    companyName: zod_1.z.string().min(1, "Nome da empresa é obrigatório"),
    companyDescription: zod_1.z.string().optional(),
    personality: zod_1.z.string().default("profissional e prestativo"),
    productsServices: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        description: zod_1.z.string(),
        price: zod_1.z.string().optional(),
        features: zod_1.z.array(zod_1.z.string()).optional(),
    })).default([]),
    businessInfo: zod_1.z.object({
        horarioFuncionamento: zod_1.z.string().optional(),
        endereco: zod_1.z.string().optional(),
        telefone: zod_1.z.string().optional(),
        email: zod_1.z.string().email().optional(),
        website: zod_1.z.string().url().optional(),
        redesSociais: zod_1.z.record(zod_1.z.string()).optional(),
        formasContato: zod_1.z.array(zod_1.z.string()).optional(),
        metodosEntrega: zod_1.z.array(zod_1.z.string()).optional(),
    }).default({}),
    faqItems: zod_1.z.array(zod_1.z.object({
        pergunta: zod_1.z.string(),
        resposta: zod_1.z.string(),
        categoria: zod_1.z.string().optional(),
    })).default([]),
    policies: zod_1.z.object({
        trocasDevolucoes: zod_1.z.string().optional(),
        garantia: zod_1.z.string().optional(),
        privacidade: zod_1.z.string().optional(),
        termos: zod_1.z.string().optional(),
    }).default({}),
    allowedTopics: zod_1.z.array(zod_1.z.string()).default([]),
    prohibitedTopics: zod_1.z.array(zod_1.z.string()).default([]),
    allowedActions: zod_1.z.array(zod_1.z.string()).default([]),
    prohibitedActions: zod_1.z.array(zod_1.z.string()).default([]),
    toneOfVoice: zod_1.z.string().default("amigável"),
    communicationStyle: zod_1.z.string().default("claro e direto"),
    emojiUsage: zod_1.z.enum(["nunca", "raro", "moderado", "frequente"]).default("moderado"),
    formalityLevel: zod_1.z.number().min(1).max(10).default(5),
    maxResponseLength: zod_1.z.number().default(400),
    useCustomerName: zod_1.z.boolean().default(true),
    offerNextSteps: zod_1.z.boolean().default(true),
    escalateToHuman: zod_1.z.boolean().default(true),
    escalationKeywords: zod_1.z.array(zod_1.z.string()).default([]),
    isActive: zod_1.z.boolean().default(false),
    model: zod_1.z.string().default("openai/gpt-oss-20b"), // CORRIGIDO: usar modelo do OpenRouter
    triggerPhrases: zod_1.z.array(zod_1.z.string()).default([]),
    templateType: zod_1.z.enum(["ecommerce", "professional", "health", "education", "realestate", "custom"]).optional(),
    version: zod_1.z.number().default(1),
});
// Agent Media Library schemas and types
exports.insertAgentMediaSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agentMediaLibrary).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Schema de item individual de fluxo
exports.flowItemSchema = zod_1.z.object({
    id: zod_1.z.string(),
    order: zod_1.z.number(),
    type: zod_1.z.enum(["media", "text"]),
    storageUrl: zod_1.z.string().optional(),
    mediaType: zod_1.z.enum(["audio", "image", "video", "document"]).optional(),
    caption: zod_1.z.string().optional(),
    fileName: zod_1.z.string().optional(),
    mimeType: zod_1.z.string().optional(),
    text: zod_1.z.string().optional(),
});
exports.agentMediaSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    name: zod_1.z.string().min(1, "Nome da mídia é obrigatório").max(100),
    mediaType: zod_1.z.enum(["audio", "image", "video", "document", "flow"]),
    storageUrl: zod_1.z.string().optional().default(""), // vazio para 'flow'
    fileName: zod_1.z.string().optional(),
    fileSize: zod_1.z.number().optional(),
    mimeType: zod_1.z.string().optional(),
    durationSeconds: zod_1.z.number().optional(),
    description: zod_1.z.string().min(1, "Descrição é obrigatória"),
    whenToUse: zod_1.z.string().optional(),
    caption: zod_1.z.string().optional(), // Legenda que vai com a imagem/vídeo
    transcription: zod_1.z.string().optional(),
    isPtt: zod_1.z.boolean().default(true), // Push-to-talk (áudio aparece como gravado)
    sendAlone: zod_1.z.boolean().default(false), // Enviar sozinha ou pode combinar com outras
    isActive: zod_1.z.boolean().default(true),
    displayOrder: zod_1.z.number().default(0),
    wapiMediaId: zod_1.z.string().optional(),
    // Itens do fluxo (somente para mediaType='flow')
    flowItems: zod_1.z.array(exports.flowItemSchema).optional(),
});
// Agent Media Library relations
exports.agentMediaLibraryRelations = (0, drizzle_orm_2.relations)(exports.agentMediaLibrary, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, {
            fields: [exports.agentMediaLibrary.userId],
            references: [exports.users.id],
        }),
    });
});
// Admin Agent Media schemas and types
exports.insertAdminAgentMediaSchema = (0, drizzle_zod_1.createInsertSchema)(exports.adminAgentMedia).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.adminAgentMediaSchema = zod_1.z.object({
    adminId: zod_1.z.string(),
    name: zod_1.z.string().min(1, "Nome da mídia é obrigatório").max(100).regex(/^[A-Z0-9_]+$/, "Nome deve ser em MAIÚSCULAS com underscores (ex: COMO_FUNCIONA)"),
    mediaType: zod_1.z.enum(["audio", "image", "video", "document"]),
    storageUrl: zod_1.z.string().min(1, "URL de armazenamento é obrigatória"),
    fileName: zod_1.z.string().optional(),
    fileSize: zod_1.z.number().optional(),
    mimeType: zod_1.z.string().optional(),
    durationSeconds: zod_1.z.number().optional(),
    description: zod_1.z.string().min(1, "Descrição é obrigatória"),
    whenToUse: zod_1.z.string().optional(),
    caption: zod_1.z.string().optional(),
    transcription: zod_1.z.string().optional(),
    isActive: zod_1.z.boolean().default(true),
    sendAlone: zod_1.z.boolean().default(true),
    displayOrder: zod_1.z.number().default(0),
});
// Admin Agent Media relations
exports.adminAgentMediaRelations = (0, drizzle_orm_2.relations)(exports.adminAgentMedia, function (_a) {
    var one = _a.one;
    return ({
        admin: one(exports.admins, {
            fields: [exports.adminAgentMedia.adminId],
            references: [exports.admins.id],
        }),
    });
});
// =============================================================================
// QUICK REPLIES - Respostas Rápidas para Admin
// =============================================================================
exports.adminQuickReplies = (0, pg_core_1.pgTable)("admin_quick_replies", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_39 || (templateObject_39 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    adminId: (0, pg_core_1.varchar)("admin_id").references(function () { return exports.admins.id; }, { onDelete: 'cascade' }),
    title: (0, pg_core_1.varchar)("title", { length: 100 }).notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    shortcut: (0, pg_core_1.varchar)("shortcut", { length: 50 }),
    category: (0, pg_core_1.varchar)("category", { length: 50 }),
    usageCount: (0, pg_core_1.integer)("usage_count").default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_quick_replies_admin").on(table.adminId),
    (0, pg_core_1.index)("idx_quick_replies_shortcut").on(table.shortcut),
]; });
exports.insertQuickReplySchema = (0, drizzle_zod_1.createInsertSchema)(exports.adminQuickReplies).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    usageCount: true,
});
// =============================================================================
// USER QUICK REPLIES - Respostas Rápidas para Usuários do SaaS
// =============================================================================
exports.userQuickReplies = (0, pg_core_1.pgTable)("user_quick_replies", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_40 || (templateObject_40 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    title: (0, pg_core_1.varchar)("title", { length: 100 }).notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    shortcut: (0, pg_core_1.varchar)("shortcut", { length: 50 }),
    category: (0, pg_core_1.varchar)("category", { length: 50 }),
    usageCount: (0, pg_core_1.integer)("usage_count").default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_user_quick_replies_user").on(table.userId),
    (0, pg_core_1.index)("idx_user_quick_replies_shortcut").on(table.shortcut),
]; });
exports.insertUserQuickReplySchema = (0, drizzle_zod_1.createInsertSchema)(exports.userQuickReplies).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    usageCount: true,
});
// =============================================================================
// STRUCTURED RESPONSE FORMAT FOR MISTRAL (Media Actions)
// =============================================================================
// Schema para resposta estruturada do Mistral com ações de mídia
exports.mistralResponseSchema = zod_1.z.object({
    messages: zod_1.z.array(zod_1.z.object({
        type: zod_1.z.literal("text"),
        content: zod_1.z.string(),
    })),
    actions: zod_1.z.array(zod_1.z.union([
        zod_1.z.object({
            type: zod_1.z.literal("send_media"),
            media_name: zod_1.z.string(), // Nome da mídia na biblioteca (ex: AUDIO_PRECO)
            delay_seconds: zod_1.z.number().optional(), // Delay antes de enviar (opcional)
        }),
        zod_1.z.object({
            type: zod_1.z.literal("send_media_url"),
            media_url: zod_1.z.string().url(),
            media_type: zod_1.z.enum(["audio", "image", "video", "document"]),
            caption: zod_1.z.string().optional(),
            file_name: zod_1.z.string().optional(),
            delay_seconds: zod_1.z.number().optional(),
        })
    ])).optional().default([]),
});
// =============================================================================
// EXCLUSION LIST - Lista de Exclusão de Números para IA e Follow-up
// =============================================================================
exports.exclusionList = (0, pg_core_1.pgTable)("exclusion_list", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_41 || (templateObject_41 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Número de telefone formatado (apenas dígitos, ex: "5511987654321")
    phoneNumber: (0, pg_core_1.varchar)("phone_number", { length: 20 }).notNull(),
    // Nome/apelido do contato para identificação
    contactName: (0, pg_core_1.varchar)("contact_name", { length: 255 }),
    // Motivo da exclusão (opcional)
    reason: (0, pg_core_1.text)("reason"),
    // Se a exclusão também se aplica ao follow-up
    excludeFromFollowup: (0, pg_core_1.boolean)("exclude_from_followup").default(true).notNull(),
    // Se a exclusão está ativa
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    // Índice para busca rápida por usuário
    (0, pg_core_1.index)("idx_exclusion_list_user").on(table.userId),
    // Índice para busca rápida por número de telefone
    (0, pg_core_1.index)("idx_exclusion_list_phone").on(table.phoneNumber),
    // Unique constraint: um número só pode estar na lista de exclusão uma vez por usuário
    (0, pg_core_1.uniqueIndex)("idx_exclusion_list_unique_user_phone").on(table.userId, table.phoneNumber),
]; });
// Configuração global de exclusão para o usuário
exports.exclusionConfig = (0, pg_core_1.pgTable)("exclusion_config", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_42 || (templateObject_42 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().unique().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Se a lista de exclusão está ativa globalmente
    isEnabled: (0, pg_core_1.boolean)("is_enabled").default(true).notNull(),
    // Se a exclusão de follow-up está ativada (usar excludeFromFollowup de cada número)
    followupExclusionEnabled: (0, pg_core_1.boolean)("followup_exclusion_enabled").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertExclusionListSchema = (0, drizzle_zod_1.createInsertSchema)(exports.exclusionList).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertExclusionConfigSchema = (0, drizzle_zod_1.createInsertSchema)(exports.exclusionConfig).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// Schema Zod para validação de entrada via API
exports.exclusionListItemSchema = zod_1.z.object({
    phoneNumber: zod_1.z.string().min(8, "Número de telefone inválido").max(20),
    contactName: zod_1.z.string().max(255).optional(),
    reason: zod_1.z.string().optional(),
    excludeFromFollowup: zod_1.z.boolean().default(true),
    isActive: zod_1.z.boolean().default(true),
});
exports.exclusionConfigSchema = zod_1.z.object({
    isEnabled: zod_1.z.boolean().default(true),
    followupExclusionEnabled: zod_1.z.boolean().default(true),
});
// =============================================================================
// DAILY USAGE TRACKING - Rastreamento de Uso Diário (Limites para Free Users)
// =============================================================================
exports.dailyUsage = (0, pg_core_1.pgTable)("daily_usage", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_43 || (templateObject_43 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Data do registro (sem hora - apenas YYYY-MM-DD)
    usageDate: (0, pg_core_1.timestamp)("usage_date").notNull(),
    // Número de calibrações de prompt feitas hoje
    promptEditsCount: (0, pg_core_1.integer)("prompt_edits_count").default(0).notNull(),
    // Número de mensagens do simulador usadas hoje
    simulatorMessagesCount: (0, pg_core_1.integer)("simulator_messages_count").default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    // Índice para busca rápida por usuário e data
    (0, pg_core_1.index)("idx_daily_usage_user_date").on(table.userId, table.usageDate),
    // Unique constraint: apenas um registro por usuário por dia
    (0, pg_core_1.uniqueIndex)("idx_daily_usage_unique").on(table.userId, table.usageDate),
]; });
exports.insertDailyUsageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.dailyUsage).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// =============================================================================
// SALES FUNNELS - Funis de Vendas com Pipeline Visual
// =============================================================================
// Tabela principal de Funis de Vendas
exports.salesFunnels = (0, pg_core_1.pgTable)("sales_funnels", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_44 || (templateObject_44 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    product: (0, pg_core_1.varchar)("product", { length: 255 }),
    manager: (0, pg_core_1.varchar)("manager", { length: 255 }),
    conversionRate: (0, pg_core_1.decimal)("conversion_rate", { precision: 5, scale: 2 }).default("0"),
    estimatedRevenue: (0, pg_core_1.decimal)("estimated_revenue", { precision: 12, scale: 2 }).default("0"),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_sales_funnels_user").on(table.userId),
    (0, pg_core_1.index)("idx_sales_funnels_active").on(table.isActive),
]; });
// Estágios do Funil
exports.funnelStages = (0, pg_core_1.pgTable)("funnel_stages", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_45 || (templateObject_45 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    funnelId: (0, pg_core_1.varchar)("funnel_id").notNull().references(function () { return exports.salesFunnels.id; }, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    color: (0, pg_core_1.varchar)("color", { length: 50 }).default("text-slate-700"),
    bgColor: (0, pg_core_1.varchar)("bg_color", { length: 50 }).default("bg-slate-100"),
    borderColor: (0, pg_core_1.varchar)("border_color", { length: 50 }).default("border-slate-200"),
    iconColor: (0, pg_core_1.varchar)("icon_color", { length: 50 }).default("text-slate-500"),
    position: (0, pg_core_1.integer)("position").default(1).notNull(),
    automationsCount: (0, pg_core_1.integer)("automations_count").default(0),
    // Configurações de automação WhatsApp
    autoMessageEnabled: (0, pg_core_1.boolean)("auto_message_enabled").default(false),
    autoMessageText: (0, pg_core_1.text)("auto_message_text"),
    autoMessageDelayMinutes: (0, pg_core_1.integer)("auto_message_delay_minutes").default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_funnel_stages_funnel").on(table.funnelId),
    (0, pg_core_1.index)("idx_funnel_stages_position").on(table.position),
]; });
// Deals/Oportunidades no Funil
exports.funnelDeals = (0, pg_core_1.pgTable)("funnel_deals", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_46 || (templateObject_46 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    stageId: (0, pg_core_1.varchar)("stage_id").notNull().references(function () { return exports.funnelStages.id; }, { onDelete: 'cascade' }),
    contactName: (0, pg_core_1.varchar)("contact_name", { length: 255 }).notNull(),
    companyName: (0, pg_core_1.varchar)("company_name", { length: 255 }),
    value: (0, pg_core_1.decimal)("value", { precision: 12, scale: 2 }).default("0"),
    valuePeriod: (0, pg_core_1.varchar)("value_period", { length: 20 }).default("mensal"), // mensal, anual, único
    priority: (0, pg_core_1.varchar)("priority", { length: 20 }).default("Média"), // Alta, Média, Baixa
    assignee: (0, pg_core_1.varchar)("assignee", { length: 255 }),
    contactPhone: (0, pg_core_1.varchar)("contact_phone", { length: 50 }),
    contactEmail: (0, pg_core_1.varchar)("contact_email", { length: 255 }),
    notes: (0, pg_core_1.text)("notes"),
    lastContactAt: (0, pg_core_1.timestamp)("last_contact_at").defaultNow(),
    expectedCloseDate: (0, pg_core_1.timestamp)("expected_close_date"),
    wonAt: (0, pg_core_1.timestamp)("won_at"),
    lostAt: (0, pg_core_1.timestamp)("lost_at"),
    lostReason: (0, pg_core_1.text)("lost_reason"),
    // Vinculação com conversa do WhatsApp
    conversationId: (0, pg_core_1.varchar)("conversation_id").references(function () { return exports.conversations.id; }, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_funnel_deals_stage").on(table.stageId),
    (0, pg_core_1.index)("idx_funnel_deals_priority").on(table.priority),
    (0, pg_core_1.index)("idx_funnel_deals_contact").on(table.contactPhone),
]; });
// Histórico de Movimentações de Deals
exports.dealHistory = (0, pg_core_1.pgTable)("deal_history", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_47 || (templateObject_47 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    dealId: (0, pg_core_1.varchar)("deal_id").notNull().references(function () { return exports.funnelDeals.id; }, { onDelete: 'cascade' }),
    fromStageId: (0, pg_core_1.varchar)("from_stage_id").references(function () { return exports.funnelStages.id; }, { onDelete: 'set null' }),
    toStageId: (0, pg_core_1.varchar)("to_stage_id").references(function () { return exports.funnelStages.id; }, { onDelete: 'set null' }),
    action: (0, pg_core_1.varchar)("action", { length: 50 }).notNull(), // created, moved, updated, won, lost
    notes: (0, pg_core_1.text)("notes"),
    performedBy: (0, pg_core_1.varchar)("performed_by", { length: 255 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_deal_history_deal").on(table.dealId),
    (0, pg_core_1.index)("idx_deal_history_date").on(table.createdAt),
]; });
// Relations
exports.salesFunnelsRelations = (0, drizzle_orm_2.relations)(exports.salesFunnels, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, { fields: [exports.salesFunnels.userId], references: [exports.users.id] }),
        stages: many(exports.funnelStages),
    });
});
exports.funnelStagesRelations = (0, drizzle_orm_2.relations)(exports.funnelStages, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        funnel: one(exports.salesFunnels, { fields: [exports.funnelStages.funnelId], references: [exports.salesFunnels.id] }),
        deals: many(exports.funnelDeals),
    });
});
exports.funnelDealsRelations = (0, drizzle_orm_2.relations)(exports.funnelDeals, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        stage: one(exports.funnelStages, { fields: [exports.funnelDeals.stageId], references: [exports.funnelStages.id] }),
        conversation: one(exports.conversations, { fields: [exports.funnelDeals.conversationId], references: [exports.conversations.id] }),
        history: many(exports.dealHistory),
    });
});
exports.dealHistoryRelations = (0, drizzle_orm_2.relations)(exports.dealHistory, function (_a) {
    var one = _a.one;
    return ({
        deal: one(exports.funnelDeals, { fields: [exports.dealHistory.dealId], references: [exports.funnelDeals.id] }),
        fromStage: one(exports.funnelStages, { fields: [exports.dealHistory.fromStageId], references: [exports.funnelStages.id] }),
        toStage: one(exports.funnelStages, { fields: [exports.dealHistory.toStageId], references: [exports.funnelStages.id] }),
    });
});
// Schemas Zod para validação
exports.insertSalesFunnelSchema = (0, drizzle_zod_1.createInsertSchema)(exports.salesFunnels).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertFunnelStageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.funnelStages).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertFunnelDealSchema = (0, drizzle_zod_1.createInsertSchema)(exports.funnelDeals).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
// ==================== SISTEMA DE AGENDAMENTOS ====================
// Configuração de agendamento por usuário
exports.schedulingConfig = (0, pg_core_1.pgTable)("scheduling_config", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_48 || (templateObject_48 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().unique().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Status
    isEnabled: (0, pg_core_1.boolean)("is_enabled").default(false).notNull(),
    // Informações do local/serviço
    serviceName: (0, pg_core_1.varchar)("service_name", { length: 255 }),
    serviceDuration: (0, pg_core_1.integer)("service_duration").default(60), // Duração em minutos
    location: (0, pg_core_1.varchar)("location", { length: 500 }),
    locationType: (0, pg_core_1.varchar)("location_type", { length: 50 }).default("presencial"), // presencial, online, ambos
    // Dias disponíveis (array de 0-6, onde 0=Domingo)
    availableDays: (0, pg_core_1.jsonb)("available_days").default([1, 2, 3, 4, 5]),
    // Horários de funcionamento
    workStartTime: (0, pg_core_1.varchar)("work_start_time", { length: 10 }).default("09:00"),
    workEndTime: (0, pg_core_1.varchar)("work_end_time", { length: 10 }).default("18:00"),
    // Intervalos de almoço/pausa
    breakStartTime: (0, pg_core_1.varchar)("break_start_time", { length: 10 }).default("12:00"),
    breakEndTime: (0, pg_core_1.varchar)("break_end_time", { length: 10 }).default("13:00"),
    hasBreak: (0, pg_core_1.boolean)("has_break").default(true),
    // Configurações avançadas
    slotDuration: (0, pg_core_1.integer)("slot_duration").default(60), // Duração de cada slot em minutos
    bufferBetweenAppointments: (0, pg_core_1.integer)("buffer_between_appointments").default(15),
    maxAppointmentsPerDay: (0, pg_core_1.integer)("max_appointments_per_day").default(10),
    advanceBookingDays: (0, pg_core_1.integer)("advance_booking_days").default(30), // Quantos dias à frente pode agendar
    minBookingNoticeHours: (0, pg_core_1.integer)("min_booking_notice_hours").default(2), // Mínimo de antecedência
    // Configurações de confirmação
    requireConfirmation: (0, pg_core_1.boolean)("require_confirmation").default(true), // IA confirma antes de agendar
    autoConfirm: (0, pg_core_1.boolean)("auto_confirm").default(false), // Agendar automaticamente
    allowCancellation: (0, pg_core_1.boolean)("allow_cancellation").default(true), // Permitir cancelamento pelo cliente via IA
    sendReminder: (0, pg_core_1.boolean)("send_reminder").default(true),
    reminderHoursBefore: (0, pg_core_1.integer)("reminder_hours_before").default(24),
    // Google Calendar
    googleCalendarEnabled: (0, pg_core_1.boolean)("google_calendar_enabled").default(false),
    googleCalendarId: (0, pg_core_1.varchar)("google_calendar_id", { length: 255 }),
    googleSyncMode: (0, pg_core_1.varchar)("google_sync_mode", { length: 50 }).default("two_way"),
    // Serviços e Profissionais
    useServices: (0, pg_core_1.boolean)("use_services").default(false),
    useProfessionals: (0, pg_core_1.boolean)("use_professionals").default(false),
    aiSchedulingEnabled: (0, pg_core_1.boolean)("ai_scheduling_enabled").default(true),
    aiCanSuggestService: (0, pg_core_1.boolean)("ai_can_suggest_service").default(true),
    aiCanSuggestProfessional: (0, pg_core_1.boolean)("ai_can_suggest_professional").default(true),
    // Link público de agendamento
    publicBookingEnabled: (0, pg_core_1.boolean)("public_booking_enabled").default(false),
    bookingLinkSlug: (0, pg_core_1.varchar)("booking_link_slug", { length: 100 }),
    // Mensagens personalizadas
    confirmationMessage: (0, pg_core_1.text)("confirmation_message").default("Seu agendamento foi confirmado! 📅"),
    reminderMessage: (0, pg_core_1.text)("reminder_message").default("Lembrete: Você tem um agendamento amanhã!"),
    cancellationMessage: (0, pg_core_1.text)("cancellation_message").default("Seu agendamento foi cancelado."),
    // Metadados
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Agendamentos
exports.appointments = (0, pg_core_1.pgTable)("appointments", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_49 || (templateObject_49 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    conversationId: (0, pg_core_1.varchar)("conversation_id").references(function () { return exports.conversations.id; }, { onDelete: 'set null' }),
    // Informações do cliente
    clientName: (0, pg_core_1.varchar)("client_name", { length: 255 }).notNull(),
    clientPhone: (0, pg_core_1.varchar)("client_phone", { length: 50 }).notNull(),
    clientEmail: (0, pg_core_1.varchar)("client_email", { length: 255 }),
    // Detalhes do agendamento
    serviceName: (0, pg_core_1.varchar)("service_name", { length: 255 }),
    appointmentDate: (0, pg_core_1.varchar)("appointment_date", { length: 20 }).notNull(), // YYYY-MM-DD
    startTime: (0, pg_core_1.varchar)("start_time", { length: 10 }).notNull(), // HH:mm
    endTime: (0, pg_core_1.varchar)("end_time", { length: 10 }).notNull(), // HH:mm
    durationMinutes: (0, pg_core_1.integer)("duration_minutes").default(60),
    // Serviço e Profissional
    serviceId: (0, pg_core_1.varchar)("service_id").references(function () { return exports.schedulingServices.id; }, { onDelete: 'set null' }),
    professionalId: (0, pg_core_1.varchar)("professional_id").references(function () { return exports.schedulingProfessionals.id; }, { onDelete: 'set null' }),
    professionalName: (0, pg_core_1.varchar)("professional_name", { length: 255 }),
    // Local
    location: (0, pg_core_1.varchar)("location", { length: 500 }),
    locationType: (0, pg_core_1.varchar)("location_type", { length: 50 }).default("presencial"),
    meetingLink: (0, pg_core_1.varchar)("meeting_link", { length: 500 }),
    // Status do agendamento
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("pending"), // pending, confirmed, cancelled, completed, no_show
    // Confirmações
    confirmedByClient: (0, pg_core_1.boolean)("confirmed_by_client").default(false),
    confirmedByBusiness: (0, pg_core_1.boolean)("confirmed_by_business").default(false),
    confirmedAt: (0, pg_core_1.timestamp)("confirmed_at"),
    // Cancelamento
    cancelledAt: (0, pg_core_1.timestamp)("cancelled_at"),
    cancelledBy: (0, pg_core_1.varchar)("cancelled_by", { length: 50 }),
    cancellationReason: (0, pg_core_1.text)("cancellation_reason"),
    // Lembretes
    reminderSent: (0, pg_core_1.boolean)("reminder_sent").default(false),
    reminderSentAt: (0, pg_core_1.timestamp)("reminder_sent_at"),
    // Google Calendar
    googleEventId: (0, pg_core_1.varchar)("google_event_id", { length: 255 }),
    googleCalendarSynced: (0, pg_core_1.boolean)("google_calendar_synced").default(false),
    // Notas
    clientNotes: (0, pg_core_1.text)("client_notes"),
    internalNotes: (0, pg_core_1.text)("internal_notes"),
    // Mensagem personalizada (agendamento manual)
    customMessage: (0, pg_core_1.text)("custom_message"),
    useCustomMessage: (0, pg_core_1.boolean)("use_custom_message").default(false),
    customMessageSentAt: (0, pg_core_1.timestamp)("custom_message_sent_at"),
    // IA
    createdByAi: (0, pg_core_1.boolean)("created_by_ai").default(false),
    aiConfirmationPending: (0, pg_core_1.boolean)("ai_confirmation_pending").default(false),
    aiConversationContext: (0, pg_core_1.jsonb)("ai_conversation_context"),
    // Metadados
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_appointments_user_date").on(table.userId, table.appointmentDate),
    (0, pg_core_1.index)("idx_appointments_status").on(table.status),
    (0, pg_core_1.index)("idx_appointments_client_phone").on(table.clientPhone),
]; });
// Tokens do Google Calendar
exports.googleCalendarTokens = (0, pg_core_1.pgTable)("google_calendar_tokens", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_50 || (templateObject_50 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().unique().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    accessToken: (0, pg_core_1.text)("access_token"),
    refreshToken: (0, pg_core_1.text)("refresh_token"),
    tokenType: (0, pg_core_1.varchar)("token_type", { length: 50 }),
    expiryDate: (0, pg_core_1.timestamp)("expiry_date"),
    scope: (0, pg_core_1.text)("scope"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Exceções de horário (feriados, dias bloqueados)
exports.schedulingExceptions = (0, pg_core_1.pgTable)("scheduling_exceptions", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_51 || (templateObject_51 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    exceptionDate: (0, pg_core_1.varchar)("exception_date", { length: 20 }).notNull(), // YYYY-MM-DD
    exceptionType: (0, pg_core_1.varchar)("exception_type", { length: 50 }).notNull(), // blocked, modified_hours, holiday
    // Se modified_hours
    customStartTime: (0, pg_core_1.varchar)("custom_start_time", { length: 10 }),
    customEndTime: (0, pg_core_1.varchar)("custom_end_time", { length: 10 }),
    reason: (0, pg_core_1.varchar)("reason", { length: 255 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_scheduling_exceptions_user_date").on(table.userId, table.exceptionDate),
]; });
// ==================== WHATSAPP STATUS (AGENDADO/ROTATIVO) ====================
exports.scheduledStatus = (0, pg_core_1.pgTable)("scheduled_status", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_52 || (templateObject_52 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    statusText: (0, pg_core_1.text)("status_text").notNull(),
    scheduledFor: (0, pg_core_1.timestamp)("scheduled_for").notNull(),
    recurrenceType: (0, pg_core_1.varchar)("recurrence_type", { length: 20 }).default("none").notNull(),
    recurrenceInterval: (0, pg_core_1.integer)("recurrence_interval").default(1).notNull(),
    status: (0, pg_core_1.varchar)("status", { length: 20 }).default("pending").notNull(),
    lastSentAt: (0, pg_core_1.timestamp)("last_sent_at"),
    errorMessage: (0, pg_core_1.text)("error_message"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_scheduled_status_user").on(table.userId),
    (0, pg_core_1.index)("idx_scheduled_status_scheduled_for").on(table.scheduledFor),
    (0, pg_core_1.index)("idx_scheduled_status_status").on(table.status),
]; });
exports.statusRotation = (0, pg_core_1.pgTable)("status_rotation", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_53 || (templateObject_53 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)("name", { length: 120 }).notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    mode: (0, pg_core_1.varchar)("mode", { length: 20 }).default("sequential").notNull(),
    intervalMinutes: (0, pg_core_1.integer)("interval_minutes").default(240).notNull(),
    lastSentAt: (0, pg_core_1.timestamp)("last_sent_at"),
    nextRunAt: (0, pg_core_1.timestamp)("next_run_at"),
    lastItemId: (0, pg_core_1.varchar)("last_item_id", { length: 255 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_status_rotation_user").on(table.userId),
    (0, pg_core_1.index)("idx_status_rotation_active").on(table.isActive),
    (0, pg_core_1.index)("idx_status_rotation_next_run").on(table.nextRunAt),
]; });
exports.statusRotationItems = (0, pg_core_1.pgTable)("status_rotation_items", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_54 || (templateObject_54 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    rotationId: (0, pg_core_1.varchar)("rotation_id").notNull().references(function () { return exports.statusRotation.id; }, { onDelete: 'cascade' }),
    statusText: (0, pg_core_1.text)("status_text").notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    displayOrder: (0, pg_core_1.integer)("display_order").default(0),
    weight: (0, pg_core_1.integer)("weight").default(1),
    lastSentAt: (0, pg_core_1.timestamp)("last_sent_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_status_rotation_items_rotation").on(table.rotationId),
    (0, pg_core_1.index)("idx_status_rotation_items_active").on(table.isActive),
]; });
// ==================== SERVIÇOS DE AGENDAMENTO ====================
// Serviços oferecidos (ex: Corte, Escova, Manicure, Consulta)
exports.schedulingServices = (0, pg_core_1.pgTable)("scheduling_services", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_55 || (templateObject_55 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Informações do serviço
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    durationMinutes: (0, pg_core_1.integer)("duration_minutes").notNull().default(60),
    price: (0, pg_core_1.numeric)("price", { precision: 10, scale: 2 }),
    // Configurações
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
    allowOnline: (0, pg_core_1.boolean)("allow_online").default(true),
    allowPresencial: (0, pg_core_1.boolean)("allow_presencial").default(true),
    requiresConfirmation: (0, pg_core_1.boolean)("requires_confirmation").default(true),
    bufferBeforeMinutes: (0, pg_core_1.integer)("buffer_before_minutes").default(0),
    bufferAfterMinutes: (0, pg_core_1.integer)("buffer_after_minutes").default(15),
    maxPerDay: (0, pg_core_1.integer)("max_per_day"), // limite por dia (null = ilimitado)
    // Visual
    color: (0, pg_core_1.varchar)("color", { length: 20 }).default("#3b82f6"),
    icon: (0, pg_core_1.varchar)("icon", { length: 50 }),
    // Ordenação
    displayOrder: (0, pg_core_1.integer)("display_order").default(0),
    // Metadados
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_scheduling_services_user").on(table.userId),
    (0, pg_core_1.index)("idx_scheduling_services_active").on(table.userId, table.isActive),
]; });
// ==================== PROFISSIONAIS ====================
// Profissionais que realizam os serviços
exports.schedulingProfessionals = (0, pg_core_1.pgTable)("scheduling_professionals", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_56 || (templateObject_56 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Informações do profissional
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    email: (0, pg_core_1.varchar)("email", { length: 255 }),
    phone: (0, pg_core_1.varchar)("phone", { length: 50 }),
    avatarUrl: (0, pg_core_1.text)("avatar_url"),
    bio: (0, pg_core_1.text)("bio"),
    // Horários de trabalho por dia da semana
    // Ex: {"1": {"start": "09:00", "end": "18:00", "break_start": "12:00", "break_end": "13:00"}}
    workSchedule: (0, pg_core_1.jsonb)("work_schedule").default({}),
    // Google Calendar individual do profissional
    googleCalendarEnabled: (0, pg_core_1.boolean)("google_calendar_enabled").default(false),
    googleCalendarId: (0, pg_core_1.varchar)("google_calendar_id", { length: 255 }),
    googleTokensId: (0, pg_core_1.varchar)("google_tokens_id", { length: 255 }),
    // Configurações
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
    isDefault: (0, pg_core_1.boolean)("is_default").default(false), // Profissional padrão quando não especificado
    acceptsOnline: (0, pg_core_1.boolean)("accepts_online").default(true),
    acceptsPresencial: (0, pg_core_1.boolean)("accepts_presencial").default(true),
    maxAppointmentsPerDay: (0, pg_core_1.integer)("max_appointments_per_day").default(10),
    // Ordenação
    displayOrder: (0, pg_core_1.integer)("display_order").default(0),
    // Metadados
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_scheduling_professionals_user").on(table.userId),
    (0, pg_core_1.index)("idx_scheduling_professionals_active").on(table.userId, table.isActive),
]; });
// ==================== RELAÇÃO PROFISSIONAL-SERVIÇO ====================
// Define quais profissionais fazem quais serviços
exports.professionalServices = (0, pg_core_1.pgTable)("professional_services", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_57 || (templateObject_57 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    professionalId: (0, pg_core_1.varchar)("professional_id").notNull().references(function () { return exports.schedulingProfessionals.id; }, { onDelete: 'cascade' }),
    serviceId: (0, pg_core_1.varchar)("service_id").notNull().references(function () { return exports.schedulingServices.id; }, { onDelete: 'cascade' }),
    // Configurações específicas (override do serviço)
    customDurationMinutes: (0, pg_core_1.integer)("custom_duration_minutes"),
    customPrice: (0, pg_core_1.numeric)("custom_price", { precision: 10, scale: 2 }),
    // Ordenação
    displayOrder: (0, pg_core_1.integer)("display_order").default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_professional_services_professional").on(table.professionalId),
    (0, pg_core_1.index)("idx_professional_services_service").on(table.serviceId),
]; });
// Relations
exports.schedulingConfigRelations = (0, drizzle_orm_2.relations)(exports.schedulingConfig, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, { fields: [exports.schedulingConfig.userId], references: [exports.users.id] }),
    });
});
exports.appointmentsRelations = (0, drizzle_orm_2.relations)(exports.appointments, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, { fields: [exports.appointments.userId], references: [exports.users.id] }),
        conversation: one(exports.conversations, { fields: [exports.appointments.conversationId], references: [exports.conversations.id] }),
    });
});
exports.schedulingServicesRelations = (0, drizzle_orm_2.relations)(exports.schedulingServices, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, { fields: [exports.schedulingServices.userId], references: [exports.users.id] }),
        professionals: many(exports.professionalServices),
    });
});
exports.schedulingProfessionalsRelations = (0, drizzle_orm_2.relations)(exports.schedulingProfessionals, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, { fields: [exports.schedulingProfessionals.userId], references: [exports.users.id] }),
        services: many(exports.professionalServices),
    });
});
exports.professionalServicesRelations = (0, drizzle_orm_2.relations)(exports.professionalServices, function (_a) {
    var one = _a.one;
    return ({
        professional: one(exports.schedulingProfessionals, { fields: [exports.professionalServices.professionalId], references: [exports.schedulingProfessionals.id] }),
        service: one(exports.schedulingServices, { fields: [exports.professionalServices.serviceId], references: [exports.schedulingServices.id] }),
    });
});
// Schemas Zod para validação de Agendamentos
exports.insertSchedulingConfigSchema = (0, drizzle_zod_1.createInsertSchema)(exports.schedulingConfig).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertAppointmentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.appointments).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertSchedulingExceptionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.schedulingExceptions).omit({
    id: true,
    createdAt: true,
});
// Schemas Zod para Serviços e Profissionais
exports.insertSchedulingServiceSchema = (0, drizzle_zod_1.createInsertSchema)(exports.schedulingServices).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertSchedulingProfessionalSchema = (0, drizzle_zod_1.createInsertSchema)(exports.schedulingProfessionals).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertProfessionalServiceSchema = (0, drizzle_zod_1.createInsertSchema)(exports.professionalServices).omit({
    id: true,
    createdAt: true,
});
exports.insertScheduledStatusSchema = (0, drizzle_zod_1.createInsertSchema)(exports.scheduledStatus).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    lastSentAt: true,
});
exports.insertStatusRotationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.statusRotation).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    lastSentAt: true,
});
exports.insertStatusRotationItemSchema = (0, drizzle_zod_1.createInsertSchema)(exports.statusRotationItems).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    lastSentAt: true,
});
// =============================================================================
// SISTEMA DE REVENDA WHITE-LABEL
// =============================================================================
// Configuração do Revendedor
exports.resellers = (0, pg_core_1.pgTable)("resellers", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_58 || (templateObject_58 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().unique().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Branding
    logoUrl: (0, pg_core_1.text)("logo_url"),
    primaryColor: (0, pg_core_1.varchar)("primary_color", { length: 20 }).default("#000000"),
    secondaryColor: (0, pg_core_1.varchar)("secondary_color", { length: 20 }).default("#ffffff"),
    accentColor: (0, pg_core_1.varchar)("accent_color", { length: 20 }).default("#22c55e"),
    companyName: (0, pg_core_1.varchar)("company_name", { length: 255 }),
    companyDescription: (0, pg_core_1.text)("company_description"),
    // Domínio customizado
    customDomain: (0, pg_core_1.varchar)("custom_domain", { length: 255 }).unique(),
    subdomain: (0, pg_core_1.varchar)("subdomain", { length: 100 }).unique(),
    domainVerified: (0, pg_core_1.boolean)("domain_verified").default(false).notNull(),
    // Preços para clientes finais (o que o revendedor cobra dos seus clientes)
    clientMonthlyPrice: (0, pg_core_1.decimal)("client_monthly_price", { precision: 10, scale: 2 }).default("99.99"),
    clientSetupFee: (0, pg_core_1.decimal)("client_setup_fee", { precision: 10, scale: 2 }).default("0"),
    // Custo por cliente para o revendedor (paga para nós)
    costPerClient: (0, pg_core_1.decimal)("cost_per_client", { precision: 10, scale: 2 }).default("49.99"),
    // Chave PIX para recebimento dos clientes
    pixKey: (0, pg_core_1.varchar)("pix_key", { length: 255 }),
    pixKeyType: (0, pg_core_1.varchar)("pix_key_type", { length: 20 }), // cpf, cnpj, email, phone, random
    pixHolderName: (0, pg_core_1.varchar)("pix_holder_name", { length: 255 }), // Nome do titular da conta
    pixBankName: (0, pg_core_1.varchar)("pix_bank_name", { length: 100 }), // Nome do banco (Nubank, Inter, etc)
    // Ciclo de cobrança do revendedor (quanto o revendedor paga para nós)
    billingDay: (0, pg_core_1.integer)("billing_day").default(1), // Dia do mês para vencimento (1-28)
    nextPaymentDate: (0, pg_core_1.timestamp)("next_payment_date"), // Próximo vencimento do revendedor
    resellerStatus: (0, pg_core_1.varchar)("reseller_status", { length: 50 }).default("active"), // active, suspended, cancelled
    // Configurações
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    maxClients: (0, pg_core_1.integer)("max_clients").default(100),
    // Textos customizados
    welcomeMessage: (0, pg_core_1.text)("welcome_message"),
    supportEmail: (0, pg_core_1.varchar)("support_email", { length: 255 }),
    supportPhone: (0, pg_core_1.varchar)("support_phone", { length: 50 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_resellers_user").on(table.userId),
    (0, pg_core_1.index)("idx_resellers_domain").on(table.customDomain),
    (0, pg_core_1.index)("idx_resellers_subdomain").on(table.subdomain),
]; });
// Clientes do Revendedor
exports.resellerClients = (0, pg_core_1.pgTable)("reseller_clients", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_59 || (templateObject_59 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    resellerId: (0, pg_core_1.varchar)("reseller_id").notNull().references(function () { return exports.resellers.id; }, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.varchar)("user_id").notNull().unique().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Status
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("active").notNull(), // active, suspended, cancelled, pending
    // Financeiro (cobra do revendedor por este cliente)
    monthlyCost: (0, pg_core_1.decimal)("monthly_cost", { precision: 10, scale: 2 }).default("49.99"),
    // Preço que o revendedor cobra deste cliente específico
    clientPrice: (0, pg_core_1.decimal)("client_price", { precision: 10, scale: 2 }),
    // Se é cliente gratuito (demo/teste - 1 por revendedor)
    isFreeClient: (0, pg_core_1.boolean)("is_free_client").default(false).notNull(),
    // Dia de vencimento deste cliente específico
    billingDay: (0, pg_core_1.integer)("billing_day").default(1), // Dia do mês (1-28)
    // SaaS Payment Control (Added for Granular Payments)
    saasPaidUntil: (0, pg_core_1.timestamp)("saas_paid_until"),
    saasStatus: (0, pg_core_1.varchar)("saas_status", { length: 20 }).default("active"), // active, overdue
    // Assinatura MercadoPago
    mpSubscriptionId: (0, pg_core_1.varchar)("mp_subscription_id", { length: 255 }),
    mpStatus: (0, pg_core_1.varchar)("mp_status", { length: 50 }),
    nextPaymentDate: (0, pg_core_1.timestamp)("next_payment_date"),
    // Datas
    activatedAt: (0, pg_core_1.timestamp)("activated_at").defaultNow(),
    suspendedAt: (0, pg_core_1.timestamp)("suspended_at"),
    cancelledAt: (0, pg_core_1.timestamp)("cancelled_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_reseller_clients_reseller").on(table.resellerId),
    (0, pg_core_1.index)("idx_reseller_clients_user").on(table.userId),
    (0, pg_core_1.index)("idx_reseller_clients_status").on(table.status),
]; });
// Pagamentos do Revendedor (por cliente criado)
exports.resellerPayments = (0, pg_core_1.pgTable)("reseller_payments", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_60 || (templateObject_60 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    resellerId: (0, pg_core_1.varchar)("reseller_id").notNull().references(function () { return exports.resellers.id; }, { onDelete: 'cascade' }),
    resellerClientId: (0, pg_core_1.varchar)("reseller_client_id").references(function () { return exports.resellerClients.id; }, { onDelete: 'set null' }),
    // Valores
    amount: (0, pg_core_1.decimal)("amount", { precision: 10, scale: 2 }).notNull(),
    paymentType: (0, pg_core_1.varchar)("payment_type", { length: 50 }).notNull(), // client_creation, recurring, setup_fee, monthly_fee
    // Status
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("pending").notNull(), // pending, approved, rejected, refunded
    statusDetail: (0, pg_core_1.varchar)("status_detail", { length: 100 }),
    // Referência da Fatura (para sistema de faturas mensais)
    referenceMonth: (0, pg_core_1.varchar)("reference_month", { length: 7 }), // Formato: YYYY-MM (ex: 2025-01)
    dueDate: (0, pg_core_1.timestamp)("due_date"), // Data de vencimento da fatura
    // MercadoPago
    mpPaymentId: (0, pg_core_1.varchar)("mp_payment_id", { length: 255 }),
    mpSubscriptionId: (0, pg_core_1.varchar)("mp_subscription_id", { length: 255 }),
    paymentMethod: (0, pg_core_1.varchar)("payment_method", { length: 50 }), // credit_card, pix, manual
    // Informações do pagador
    payerEmail: (0, pg_core_1.varchar)("payer_email", { length: 255 }),
    cardLastFourDigits: (0, pg_core_1.varchar)("card_last_four_digits", { length: 4 }),
    cardBrand: (0, pg_core_1.varchar)("card_brand", { length: 50 }),
    // Descrição
    description: (0, pg_core_1.text)("description"),
    paidAt: (0, pg_core_1.timestamp)("paid_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_reseller_payments_reseller").on(table.resellerId),
    (0, pg_core_1.index)("idx_reseller_payments_client").on(table.resellerClientId),
    (0, pg_core_1.index)("idx_reseller_payments_status").on(table.status),
    (0, pg_core_1.index)("idx_reseller_payments_date").on(table.createdAt),
    (0, pg_core_1.index)("idx_reseller_payments_reference").on(table.referenceMonth),
]; });
// Lembretes de pagamento (reseller -> cliente)
exports.paymentReminders = (0, pg_core_1.pgTable)("payment_reminders", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_61 || (templateObject_61 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    resellerId: (0, pg_core_1.varchar)("reseller_id").references(function () { return exports.resellers.id; }, { onDelete: 'cascade' }),
    resellerClientId: (0, pg_core_1.varchar)("reseller_client_id").references(function () { return exports.resellerClients.id; }, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.varchar)("user_id").references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    scheduledFor: (0, pg_core_1.timestamp)("scheduled_for").notNull(),
    dueDate: (0, pg_core_1.timestamp)("due_date"),
    amount: (0, pg_core_1.numeric)("amount", { precision: 10, scale: 2 }),
    status: (0, pg_core_1.varchar)("status", { length: 30 }).default("pending").notNull(),
    reminderType: (0, pg_core_1.varchar)("reminder_type", { length: 30 }).default("before_due"),
    daysOffset: (0, pg_core_1.integer)("days_offset"),
    messageTemplate: (0, pg_core_1.text)("message_template"),
    messageFinal: (0, pg_core_1.text)("message_final"),
    aiPrompt: (0, pg_core_1.text)("ai_prompt"),
    aiUsed: (0, pg_core_1.boolean)("ai_used").default(true),
    errorMessage: (0, pg_core_1.text)("error_message"),
    metadata: (0, pg_core_1.jsonb)("metadata").default({}),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    sentAt: (0, pg_core_1.timestamp)("sent_at"),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_payment_reminders_reseller").on(table.resellerId),
    (0, pg_core_1.index)("idx_payment_reminders_client").on(table.resellerClientId),
    (0, pg_core_1.index)("idx_payment_reminders_user").on(table.userId),
    (0, pg_core_1.index)("idx_payment_reminders_scheduled_for").on(table.scheduledFor),
    (0, pg_core_1.index)("idx_payment_reminders_status").on(table.status),
]; });
// Relations para Resellers
exports.resellersRelations = (0, drizzle_orm_2.relations)(exports.resellers, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, { fields: [exports.resellers.userId], references: [exports.users.id] }),
        clients: many(exports.resellerClients),
        payments: many(exports.resellerPayments),
        invoices: many(exports.resellerInvoices),
    });
});
exports.resellerClientsRelations = (0, drizzle_orm_2.relations)(exports.resellerClients, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        reseller: one(exports.resellers, { fields: [exports.resellerClients.resellerId], references: [exports.resellers.id] }),
        user: one(exports.users, { fields: [exports.resellerClients.userId], references: [exports.users.id] }),
        payments: many(exports.resellerPayments),
    });
});
exports.resellerPaymentsRelations = (0, drizzle_orm_2.relations)(exports.resellerPayments, function (_a) {
    var one = _a.one;
    return ({
        reseller: one(exports.resellers, { fields: [exports.resellerPayments.resellerId], references: [exports.resellers.id] }),
        client: one(exports.resellerClients, { fields: [exports.resellerPayments.resellerClientId], references: [exports.resellerClients.id] }),
    });
});
// Tabela de faturas do revendedor para o sistema (Flow 2: Reseller -> System)
exports.resellerInvoices = (0, pg_core_1.pgTable)("reseller_invoices", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    resellerId: (0, pg_core_1.varchar)("reseller_id", { length: 255 }).notNull().references(function () { return exports.resellers.id; }, { onDelete: "cascade" }),
    referenceMonth: (0, pg_core_1.varchar)("reference_month", { length: 7 }).notNull(), // Formato: "2025-01"
    dueDate: (0, pg_core_1.date)("due_date").notNull(),
    activeClients: (0, pg_core_1.integer)("active_clients").notNull().default(0),
    unitPrice: (0, pg_core_1.decimal)("unit_price", { precision: 10, scale: 2 }).notNull().default("49.99"),
    totalAmount: (0, pg_core_1.decimal)("total_amount", { precision: 10, scale: 2 }).notNull(),
    status: (0, pg_core_1.varchar)("status", { length: 20 }).notNull().default("pending"), // pending, paid, overdue
    paymentMethod: (0, pg_core_1.varchar)("payment_method", { length: 20 }), // pix, card
    mpPaymentId: (0, pg_core_1.varchar)("mp_payment_id", { length: 100 }),
    paidAt: (0, pg_core_1.timestamp)("paid_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_reseller_invoices_reseller").on(table.resellerId),
    (0, pg_core_1.index)("idx_reseller_invoices_status").on(table.status),
    (0, pg_core_1.index)("idx_reseller_invoices_due_date").on(table.dueDate),
]; });
// Items da fatura do revendedor (para pagamentos granulares)
exports.resellerInvoiceItems = (0, pg_core_1.pgTable)("reseller_invoice_items", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    invoiceId: (0, pg_core_1.integer)("invoice_id").notNull().references(function () { return exports.resellerInvoices.id; }, { onDelete: "cascade" }),
    resellerClientId: (0, pg_core_1.varchar)("reseller_client_id", { length: 255 }).references(function () { return exports.resellerClients.id; }, { onDelete: "set null" }),
    amount: (0, pg_core_1.decimal)("amount", { precision: 10, scale: 2 }).notNull(),
    description: (0, pg_core_1.varchar)("description", { length: 255 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_reseller_invoice_items_invoice").on(table.invoiceId),
    (0, pg_core_1.index)("idx_reseller_invoice_items_client").on(table.resellerClientId),
]; });
exports.resellerInvoicesRelations = (0, drizzle_orm_2.relations)(exports.resellerInvoices, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        reseller: one(exports.resellers, { fields: [exports.resellerInvoices.resellerId], references: [exports.resellers.id] }),
        items: many(exports.resellerInvoiceItems),
    });
});
exports.resellerInvoiceItemsRelations = (0, drizzle_orm_2.relations)(exports.resellerInvoiceItems, function (_a) {
    var one = _a.one;
    return ({
        invoice: one(exports.resellerInvoices, { fields: [exports.resellerInvoiceItems.invoiceId], references: [exports.resellerInvoices.id] }),
        client: one(exports.resellerClients, { fields: [exports.resellerInvoiceItems.resellerClientId], references: [exports.resellerClients.id] }),
    });
});
// Schemas Zod para validação de Resellers
exports.insertResellerSchema = (0, drizzle_zod_1.createInsertSchema)(exports.resellers).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.resellerSchema = zod_1.z.object({
    logoUrl: zod_1.z.string().url().optional().nullable(),
    primaryColor: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#000000"),
    secondaryColor: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#ffffff"),
    accentColor: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#22c55e"),
    companyName: zod_1.z.string().min(1).max(255),
    companyDescription: zod_1.z.string().optional(),
    customDomain: zod_1.z.string().max(255).optional().nullable(),
    subdomain: zod_1.z.string().min(3).max(100).regex(/^[a-z0-9-]+$/).optional().nullable(),
    clientMonthlyPrice: zod_1.z.string().or(zod_1.z.number()).transform(function (v) { return String(v); }).default("99.99"),
    clientSetupFee: zod_1.z.string().or(zod_1.z.number()).transform(function (v) { return String(v); }).default("0"),
    welcomeMessage: zod_1.z.string().optional(),
    supportEmail: zod_1.z.string().email().optional().nullable(),
    supportPhone: zod_1.z.string().max(50).optional().nullable(),
});
exports.insertResellerClientSchema = (0, drizzle_zod_1.createInsertSchema)(exports.resellerClients).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.insertResellerPaymentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.resellerPayments).omit({
    id: true,
    createdAt: true,
});
exports.insertPaymentReminderSchema = (0, drizzle_zod_1.createInsertSchema)(exports.paymentReminders).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    sentAt: true,
});
exports.insertResellerInvoiceSchema = (0, drizzle_zod_1.createInsertSchema)(exports.resellerInvoices).omit({
    id: true,
    createdAt: true,
});
exports.insertResellerInvoiceItemsSchema = (0, drizzle_zod_1.createInsertSchema)(exports.resellerInvoiceItems).omit({
    id: true,
    createdAt: true,
});
// =============================================================================
// CUSTOM FIELDS - Campos Personalizados para Conversas
// Similar ao Digisac: Nome do Responsável, Empresa, Email, CPF/CNPJ, etc.
// =============================================================================
// Definições de campos personalizados (estrutura do formulário)
exports.customFieldDefinitions = (0, pg_core_1.pgTable)("custom_field_definitions", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_62 || (templateObject_62 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    // Identificação
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(), // Nome interno único
    label: (0, pg_core_1.varchar)("label", { length: 100 }).notNull(), // Label exibido no formulário
    // Tipo do campo
    fieldType: (0, pg_core_1.varchar)("field_type", { length: 50 }).default("text").notNull(),
    // Tipos suportados: text, email, phone, cpf_cnpj, number, date, select, textarea
    // Opções para select
    options: (0, pg_core_1.jsonb)("options").$type().default([]),
    // Validação e UX
    required: (0, pg_core_1.boolean)("required").default(false),
    placeholder: (0, pg_core_1.varchar)("placeholder", { length: 255 }),
    helpText: (0, pg_core_1.text)("help_text"),
    // Auto-extração IA
    aiExtractionPrompt: (0, pg_core_1.text)("ai_extraction_prompt"), // Prompt para IA extrair automaticamente
    aiExtractionEnabled: (0, pg_core_1.boolean)("ai_extraction_enabled").default(true),
    // Ordenação e status
    position: (0, pg_core_1.integer)("position").default(0),
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_custom_field_defs_user").on(table.userId),
    (0, pg_core_1.uniqueIndex)("idx_custom_field_defs_unique_name").on(table.userId, table.name),
]; });
// Valores dos campos personalizados por conversa
exports.customFieldValues = (0, pg_core_1.pgTable)("custom_field_values", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_63 || (templateObject_63 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    fieldDefinitionId: (0, pg_core_1.varchar)("field_definition_id").notNull().references(function () { return exports.customFieldDefinitions.id; }, { onDelete: 'cascade' }),
    conversationId: (0, pg_core_1.varchar)("conversation_id").notNull().references(function () { return exports.conversations.id; }, { onDelete: 'cascade' }),
    // Valor preenchido
    value: (0, pg_core_1.text)("value"),
    // Metadados de extração automática
    autoExtracted: (0, pg_core_1.boolean)("auto_extracted").default(false),
    extractionSource: (0, pg_core_1.text)("extraction_source"), // Trecho da conversa
    extractionConfidence: (0, pg_core_1.decimal)("extraction_confidence", { precision: 3, scale: 2 }), // 0.00 a 1.00
    // Auditoria
    lastEditedBy: (0, pg_core_1.varchar)("last_edited_by", { length: 50 }).default("user"), // user, ai, system
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_custom_field_vals_conv").on(table.conversationId),
    (0, pg_core_1.index)("idx_custom_field_vals_def").on(table.fieldDefinitionId),
    (0, pg_core_1.uniqueIndex)("idx_custom_field_vals_unique").on(table.fieldDefinitionId, table.conversationId),
]; });
// Relations para Custom Fields
exports.customFieldDefinitionsRelations = (0, drizzle_orm_2.relations)(exports.customFieldDefinitions, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, {
            fields: [exports.customFieldDefinitions.userId],
            references: [exports.users.id],
        }),
        values: many(exports.customFieldValues),
    });
});
exports.customFieldValuesRelations = (0, drizzle_orm_2.relations)(exports.customFieldValues, function (_a) {
    var one = _a.one;
    return ({
        definition: one(exports.customFieldDefinitions, {
            fields: [exports.customFieldValues.fieldDefinitionId],
            references: [exports.customFieldDefinitions.id],
        }),
        conversation: one(exports.conversations, {
            fields: [exports.customFieldValues.conversationId],
            references: [exports.conversations.id],
        }),
    });
});
// Schemas Zod para Custom Fields
exports.insertCustomFieldDefinitionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.customFieldDefinitions).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.customFieldDefinitionSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e underscore"),
    label: zod_1.z.string().min(1).max(100),
    fieldType: zod_1.z.enum(["text", "email", "phone", "cpf_cnpj", "number", "date", "select", "textarea"]).default("text"),
    options: zod_1.z.array(zod_1.z.string()).default([]),
    required: zod_1.z.boolean().default(false),
    placeholder: zod_1.z.string().max(255).optional(),
    helpText: zod_1.z.string().optional(),
    aiExtractionPrompt: zod_1.z.string().optional(),
    aiExtractionEnabled: zod_1.z.boolean().default(true),
    position: zod_1.z.number().int().min(0).default(0),
    isActive: zod_1.z.boolean().default(true),
});
exports.insertCustomFieldValueSchema = (0, drizzle_zod_1.createInsertSchema)(exports.customFieldValues).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.customFieldValueSchema = zod_1.z.object({
    fieldDefinitionId: zod_1.z.string(),
    conversationId: zod_1.z.string(),
    value: zod_1.z.string().optional().nullable(),
    autoExtracted: zod_1.z.boolean().default(false),
    extractionSource: zod_1.z.string().optional(),
    extractionConfidence: zod_1.z.string().or(zod_1.z.number()).optional(),
    lastEditedBy: zod_1.z.enum(["user", "ai", "system"]).default("user"),
});
// ======================================
// TABELAS DE PRODUTOS (Catálogo)
// ======================================
// Tabela de produtos do cliente
exports.products = (0, pg_core_1.pgTable)("products", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_64 || (templateObject_64 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)("name").notNull(),
    price: (0, pg_core_1.numeric)("price", { precision: 12, scale: 2 }),
    stock: (0, pg_core_1.integer)("stock").default(0),
    description: (0, pg_core_1.text)("description"),
    category: (0, pg_core_1.text)("category"),
    link: (0, pg_core_1.text)("link"),
    sku: (0, pg_core_1.text)("sku"),
    unit: (0, pg_core_1.text)("unit").default("un"),
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Configuração do módulo de produtos por usuário
exports.productsConfig = (0, pg_core_1.pgTable)("products_config", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_65 || (templateObject_65 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    isActive: (0, pg_core_1.boolean)("is_active").default(false),
    sendToAi: (0, pg_core_1.boolean)("send_to_ai").default(false),
    aiInstructions: (0, pg_core_1.text)("ai_instructions").default("Use esta lista de produtos para responder perguntas sobre disponibilidade, preços e detalhes dos produtos. Seja preciso com valores e quantidades."),
    displayInstructions: (0, pg_core_1.text)("display_instructions").default("Quando o cliente pedir a lista de produtos, mostre cada produto em uma linha com nome, preço e disponibilidade."),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Relations para Products
exports.productsRelations = (0, drizzle_orm_2.relations)(exports.products, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, {
            fields: [exports.products.userId],
            references: [exports.users.id],
        }),
    });
});
exports.productsConfigRelations = (0, drizzle_orm_2.relations)(exports.productsConfig, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, {
            fields: [exports.productsConfig.userId],
            references: [exports.users.id],
        }),
    });
});
// Schemas Zod para Products
exports.insertProductSchema = (0, drizzle_zod_1.createInsertSchema)(exports.products).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.productSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Nome do produto é obrigatório").max(500),
    price: zod_1.z.string().or(zod_1.z.number()).optional().nullable(),
    stock: zod_1.z.number().int().min(0).optional().default(0),
    description: zod_1.z.string().max(5000).optional().nullable(),
    category: zod_1.z.string().max(200).optional().nullable(),
    link: zod_1.z.string().url().max(1000).optional().nullable().or(zod_1.z.literal("")),
    sku: zod_1.z.string().max(100).optional().nullable(),
    unit: zod_1.z.string().max(50).optional().default("un"),
    isActive: zod_1.z.boolean().default(true),
});
exports.insertProductsConfigSchema = (0, drizzle_zod_1.createInsertSchema)(exports.productsConfig).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.productsConfigSchema = zod_1.z.object({
    isActive: zod_1.z.boolean().default(false),
    sendToAi: zod_1.z.boolean().default(false),
    aiInstructions: zod_1.z.string().max(2000).optional(),
});
// =============================================================================
// SISTEMA DE DELIVERY / CARDÁPIO DIGITAL
// =============================================================================
// Configuração do módulo de delivery por usuário
exports.deliveryConfig = (0, pg_core_1.pgTable)("delivery_config", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_66 || (templateObject_66 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    isActive: (0, pg_core_1.boolean)("is_active").default(false),
    sendToAi: (0, pg_core_1.boolean)("send_to_ai").default(true),
    businessName: (0, pg_core_1.varchar)("business_name", { length: 200 }),
    businessType: (0, pg_core_1.varchar)("business_type", { length: 50 }).default("restaurante"),
    menuSendMode: (0, pg_core_1.varchar)("menu_send_mode", { length: 20 }).default("text"),
    deliveryFee: (0, pg_core_1.numeric)("delivery_fee", { precision: 10, scale: 2 }).default("0"),
    minOrderValue: (0, pg_core_1.numeric)("min_order_value", { precision: 10, scale: 2 }).default("0"),
    estimatedDeliveryTime: (0, pg_core_1.integer)("estimated_delivery_time").default(45),
    deliveryRadiusKm: (0, pg_core_1.numeric)("delivery_radius_km", { precision: 5, scale: 2 }).default("10"),
    paymentMethods: (0, pg_core_1.jsonb)("payment_methods").default(['dinheiro', 'cartao', 'pix']),
    acceptsDelivery: (0, pg_core_1.boolean)("accepts_delivery").default(true),
    acceptsPickup: (0, pg_core_1.boolean)("accepts_pickup").default(true),
    openingHours: (0, pg_core_1.jsonb)("opening_hours").default({}),
    aiInstructions: (0, pg_core_1.text)("ai_instructions").default("Você é um atendente de delivery. Seja simpático, ajude o cliente a escolher, anote os pedidos corretamente com todos os detalhes e sempre confirme antes de finalizar."),
    displayInstructions: (0, pg_core_1.text)("display_instructions").default("Quando o cliente pedir o cardápio, liste cada item em uma linha separada com emoji, nome e preço. Organize por categoria."),
    whatsappOrderNumber: (0, pg_core_1.varchar)("whatsapp_order_number", { length: 20 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Categorias do cardápio
exports.menuCategories = (0, pg_core_1.pgTable)("menu_categories", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_67 || (templateObject_67 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    imageUrl: (0, pg_core_1.text)("image_url"),
    displayOrder: (0, pg_core_1.integer)("display_order").default(0),
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
    halfHalfPricing: (0, pg_core_1.jsonb)("half_half_pricing").$type().default((0, drizzle_orm_1.sql)(templateObject_68 || (templateObject_68 = __makeTemplateObject(["'{\"enabled\":false,\"mode\":\"highest_item\",\"fixedPrice\":null,\"sizePrices\":{}}'::jsonb"], ["'{\"enabled\":false,\"mode\":\"highest_item\",\"fixedPrice\":null,\"sizePrices\":{}}'::jsonb"])))),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Itens do cardápio
exports.menuItems = (0, pg_core_1.pgTable)("menu_items", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_69 || (templateObject_69 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    categoryId: (0, pg_core_1.varchar)("category_id").references(function () { return exports.menuCategories.id; }, { onDelete: 'set null' }),
    name: (0, pg_core_1.varchar)("name", { length: 200 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    price: (0, pg_core_1.numeric)("price", { precision: 10, scale: 2 }).notNull(),
    promotionalPrice: (0, pg_core_1.numeric)("promotional_price", { precision: 10, scale: 2 }),
    imageUrl: (0, pg_core_1.text)("image_url"),
    preparationTime: (0, pg_core_1.integer)("preparation_time").default(30),
    isAvailable: (0, pg_core_1.boolean)("is_available").default(true),
    isFeatured: (0, pg_core_1.boolean)("is_featured").default(false),
    options: (0, pg_core_1.jsonb)("options").default([]),
    ingredients: (0, pg_core_1.text)("ingredients"),
    allergens: (0, pg_core_1.text)("allergens"),
    serves: (0, pg_core_1.integer)("serves").default(1),
    displayOrder: (0, pg_core_1.integer)("display_order").default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Pedidos de delivery
exports.deliveryOrders = (0, pg_core_1.pgTable)("delivery_orders", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_70 || (templateObject_70 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    conversationId: (0, pg_core_1.varchar)("conversation_id").references(function () { return exports.conversations.id; }, { onDelete: 'set null' }),
    orderNumber: (0, pg_core_1.serial)("order_number"),
    customerName: (0, pg_core_1.varchar)("customer_name", { length: 200 }),
    customerPhone: (0, pg_core_1.varchar)("customer_phone", { length: 50 }),
    customerAddress: (0, pg_core_1.text)("customer_address"),
    customerComplement: (0, pg_core_1.text)("customer_complement"),
    customerReference: (0, pg_core_1.text)("customer_reference"),
    deliveryType: (0, pg_core_1.varchar)("delivery_type", { length: 20 }).default("delivery"),
    status: (0, pg_core_1.varchar)("status", { length: 30 }).default("pending"),
    paymentMethod: (0, pg_core_1.varchar)("payment_method", { length: 30 }),
    paymentStatus: (0, pg_core_1.varchar)("payment_status", { length: 20 }).default("pending"),
    subtotal: (0, pg_core_1.numeric)("subtotal", { precision: 10, scale: 2 }).default("0"),
    deliveryFee: (0, pg_core_1.numeric)("delivery_fee", { precision: 10, scale: 2 }).default("0"),
    discount: (0, pg_core_1.numeric)("discount", { precision: 10, scale: 2 }).default("0"),
    total: (0, pg_core_1.numeric)("total", { precision: 10, scale: 2 }).default("0"),
    notes: (0, pg_core_1.text)("notes"),
    estimatedTime: (0, pg_core_1.integer)("estimated_time"),
    confirmedAt: (0, pg_core_1.timestamp)("confirmed_at"),
    readyAt: (0, pg_core_1.timestamp)("ready_at"),
    deliveredAt: (0, pg_core_1.timestamp)("delivered_at"),
    cancelledAt: (0, pg_core_1.timestamp)("cancelled_at"),
    cancellationReason: (0, pg_core_1.text)("cancellation_reason"),
    createdByAi: (0, pg_core_1.boolean)("created_by_ai").default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Itens do pedido
exports.orderItems = (0, pg_core_1.pgTable)("order_items", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_71 || (templateObject_71 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    orderId: (0, pg_core_1.varchar)("order_id").notNull().references(function () { return exports.deliveryOrders.id; }, { onDelete: 'cascade' }),
    menuItemId: (0, pg_core_1.varchar)("menu_item_id").references(function () { return exports.menuItems.id; }, { onDelete: 'set null' }),
    itemName: (0, pg_core_1.varchar)("item_name", { length: 200 }).notNull(),
    quantity: (0, pg_core_1.integer)("quantity").default(1),
    unitPrice: (0, pg_core_1.numeric)("unit_price", { precision: 10, scale: 2 }).notNull(),
    totalPrice: (0, pg_core_1.numeric)("total_price", { precision: 10, scale: 2 }).notNull(),
    optionsSelected: (0, pg_core_1.jsonb)("options_selected").default([]),
    notes: (0, pg_core_1.text)("notes"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Carrinho de compras (sessão por conversa)
exports.deliveryCarts = (0, pg_core_1.pgTable)("delivery_carts", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_72 || (templateObject_72 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    conversationId: (0, pg_core_1.varchar)("conversation_id").notNull(),
    items: (0, pg_core_1.jsonb)("items").default([]),
    customerName: (0, pg_core_1.varchar)("customer_name", { length: 200 }),
    customerPhone: (0, pg_core_1.varchar)("customer_phone", { length: 50 }),
    customerAddress: (0, pg_core_1.text)("customer_address"),
    deliveryType: (0, pg_core_1.varchar)("delivery_type", { length: 20 }).default("delivery"),
    expiresAt: (0, pg_core_1.timestamp)("expires_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Relations para Delivery
exports.deliveryConfigRelations = (0, drizzle_orm_2.relations)(exports.deliveryConfig, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, { fields: [exports.deliveryConfig.userId], references: [exports.users.id] }),
    });
});
exports.menuCategoriesRelations = (0, drizzle_orm_2.relations)(exports.menuCategories, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, { fields: [exports.menuCategories.userId], references: [exports.users.id] }),
        items: many(exports.menuItems),
    });
});
exports.menuItemsRelations = (0, drizzle_orm_2.relations)(exports.menuItems, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, { fields: [exports.menuItems.userId], references: [exports.users.id] }),
        category: one(exports.menuCategories, { fields: [exports.menuItems.categoryId], references: [exports.menuCategories.id] }),
    });
});
exports.deliveryOrdersRelations = (0, drizzle_orm_2.relations)(exports.deliveryOrders, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, { fields: [exports.deliveryOrders.userId], references: [exports.users.id] }),
        conversation: one(exports.conversations, { fields: [exports.deliveryOrders.conversationId], references: [exports.conversations.id] }),
        items: many(exports.orderItems),
    });
});
exports.orderItemsRelations = (0, drizzle_orm_2.relations)(exports.orderItems, function (_a) {
    var one = _a.one;
    return ({
        order: one(exports.deliveryOrders, { fields: [exports.orderItems.orderId], references: [exports.deliveryOrders.id] }),
        menuItem: one(exports.menuItems, { fields: [exports.orderItems.menuItemId], references: [exports.menuItems.id] }),
    });
});
// Schemas Zod para Delivery
exports.deliveryConfigSchema = zod_1.z.object({
    isActive: zod_1.z.boolean().default(false),
    sendToAi: zod_1.z.boolean().default(true),
    businessName: zod_1.z.string().max(200).optional().nullable(),
    businessType: zod_1.z.enum(['pizzaria', 'lanchonete', 'restaurante', 'hamburgueria', 'acai', 'japonesa', 'outros']).default('restaurante'),
    menuSendMode: zod_1.z.enum(['text', 'image', 'image_text']).default('text'),
    deliveryFee: zod_1.z.string().or(zod_1.z.number()).optional().default("0"),
    minOrderValue: zod_1.z.string().or(zod_1.z.number()).optional().default("0"),
    estimatedDeliveryTime: zod_1.z.number().min(5).max(180).default(45),
    deliveryRadiusKm: zod_1.z.string().or(zod_1.z.number()).optional().default("10"),
    paymentMethods: zod_1.z.array(zod_1.z.string()).default(['dinheiro', 'cartao', 'pix']),
    acceptsDelivery: zod_1.z.boolean().default(true),
    acceptsPickup: zod_1.z.boolean().default(true),
    openingHours: zod_1.z.record(zod_1.z.any()).optional(),
    aiInstructions: zod_1.z.string().max(2000).optional(),
    whatsappOrderNumber: zod_1.z.string().max(20).optional().nullable(),
});
exports.halfHalfPricingModeSchema = zod_1.z.enum(['highest_item', 'fixed', 'size_map']);
exports.halfHalfPricingSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    mode: exports.halfHalfPricingModeSchema.default('highest_item'),
    fixedPrice: zod_1.z.string().or(zod_1.z.number()).optional().nullable(),
    sizePrices: zod_1.z.object({
        P: zod_1.z.string().or(zod_1.z.number()).optional().nullable(),
        M: zod_1.z.string().or(zod_1.z.number()).optional().nullable(),
        G: zod_1.z.string().or(zod_1.z.number()).optional().nullable(),
    }).default({}),
});
exports.menuCategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Nome é obrigatório").max(100),
    description: zod_1.z.string().max(500).optional().nullable(),
    imageUrl: zod_1.z.string().url().optional().nullable().or(zod_1.z.literal("")),
    displayOrder: zod_1.z.number().int().min(0).default(0),
    isActive: zod_1.z.boolean().default(true),
    halfHalfPricing: exports.halfHalfPricingSchema.optional().default({
        enabled: false,
        mode: 'highest_item',
        fixedPrice: null,
        sizePrices: {},
    }),
});
exports.menuItemSchema = zod_1.z.object({
    categoryId: zod_1.z.string().optional().nullable(),
    name: zod_1.z.string().min(1, "Nome é obrigatório").max(200),
    description: zod_1.z.string().max(1000).optional().nullable(),
    price: zod_1.z.string().or(zod_1.z.number()),
    promotionalPrice: zod_1.z.string().or(zod_1.z.number()).optional().nullable(),
    imageUrl: zod_1.z.string().url().optional().nullable().or(zod_1.z.literal("")),
    preparationTime: zod_1.z.number().int().min(1).max(180).default(30),
    isAvailable: zod_1.z.boolean().default(true),
    isFeatured: zod_1.z.boolean().default(false),
    options: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        type: zod_1.z.enum(['single', 'multiple']),
        required: zod_1.z.boolean().default(false),
        items: zod_1.z.array(zod_1.z.object({
            name: zod_1.z.string(),
            price: zod_1.z.number().default(0),
        })),
    })).default([]),
    ingredients: zod_1.z.string().max(500).optional().nullable(),
    allergens: zod_1.z.string().max(200).optional().nullable(),
    serves: zod_1.z.number().int().min(1).max(20).default(1),
    displayOrder: zod_1.z.number().int().min(0).default(0),
});
exports.deliveryOrderSchema = zod_1.z.object({
    customerName: zod_1.z.string().max(200).optional(),
    customerPhone: zod_1.z.string().max(50).optional(),
    customerAddress: zod_1.z.string().max(500).optional(),
    customerComplement: zod_1.z.string().max(200).optional(),
    customerReference: zod_1.z.string().max(200).optional(),
    deliveryType: zod_1.z.enum(['delivery', 'pickup']).default('delivery'),
    paymentMethod: zod_1.z.string().max(30).optional(),
    notes: zod_1.z.string().max(500).optional(),
});
// =============================================================================
// TEAM MEMBERS - Schemas e Types
// =============================================================================
// Relations para Team Members
exports.teamMembersRelations = (0, drizzle_orm_2.relations)(exports.teamMembers, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        owner: one(exports.users, {
            fields: [exports.teamMembers.ownerId],
            references: [exports.users.id],
        }),
        sessions: many(exports.teamMemberSessions),
    });
});
exports.teamMemberSessionsRelations = (0, drizzle_orm_2.relations)(exports.teamMemberSessions, function (_a) {
    var one = _a.one;
    return ({
        member: one(exports.teamMembers, {
            fields: [exports.teamMemberSessions.memberId],
            references: [exports.teamMembers.id],
        }),
    });
});
// Schemas Zod para Team Members
exports.insertTeamMemberSchema = (0, drizzle_zod_1.createInsertSchema)(exports.teamMembers).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    passwordHash: true,
    lastLoginAt: true,
});
exports.teamMemberSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(255),
    email: zod_1.z.string().email("Email inválido"),
    password: zod_1.z.string().min(6, "Senha deve ter pelo menos 6 caracteres").optional(),
    role: zod_1.z.string().max(100).default("atendente"),
    permissions: zod_1.z.object({
        canViewConversations: zod_1.z.boolean().default(true),
        canSendMessages: zod_1.z.boolean().default(true),
        canUseQuickReplies: zod_1.z.boolean().default(true),
        canMoveKanban: zod_1.z.boolean().default(true),
        canViewDashboard: zod_1.z.boolean().default(false),
        canEditContacts: zod_1.z.boolean().default(false),
    }).default({
        canViewConversations: true,
        canSendMessages: true,
        canUseQuickReplies: true,
        canMoveKanban: true,
        canViewDashboard: false,
        canEditContacts: false,
    }),
    isActive: zod_1.z.boolean().default(true),
    avatarUrl: zod_1.z.string().url().optional().nullable(),
});
exports.teamMemberLoginSchema = zod_1.z.object({
    email: zod_1.z.string().email("Email inválido"),
    password: zod_1.z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    ownerId: zod_1.z.string().optional(), // ID do dono da conta (para identificar a qual conta o membro pertence)
});
// =============================================================================
// WHATSAPP STATUSES - Sistema de Status/Mensagens Automáticas do WhatsApp
// =============================================================================
exports.whatsappStatuses = (0, pg_core_1.pgTable)("whatsapp_statuses", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_73 || (templateObject_73 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    type: (0, pg_core_1.varchar)("type", { length: 50 }).notNull().default("text"), // text, image, video, audio
    content: (0, pg_core_1.text)("content").notNull(),
    contentUrl: (0, pg_core_1.varchar)("content_url"), // URL for media files
    duration: (0, pg_core_1.integer)("duration"), // Duration in seconds for video/audio
    schedule: (0, pg_core_1.jsonb)("schedule").$type(),
    rotation: (0, pg_core_1.jsonb)("rotation").$type(),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    priority: (0, pg_core_1.integer)("priority").default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.statusHistory = (0, pg_core_1.pgTable)("status_history", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_74 || (templateObject_74 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    statusId: (0, pg_core_1.varchar)("status_id").notNull().references(function () { return exports.whatsappStatuses.id; }, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    phoneNumber: (0, pg_core_1.varchar)("phone_number").notNull(),
    sentAt: (0, pg_core_1.timestamp)("sent_at").defaultNow(),
    content: (0, pg_core_1.text)("content").notNull(),
    type: (0, pg_core_1.varchar)("type", { length: 50 }).notNull(),
    rotationUsed: (0, pg_core_1.varchar)("rotation_used"), // Track which rotation was used
});
// Schemas Zod para WhatsApp Statuses
exports.insertWhatsappStatusSchema = (0, drizzle_zod_1.createInsertSchema)(exports.whatsappStatuses).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.whatsappStatusSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Nome é obrigatório").max(255),
    type: zod_1.z.enum(["text", "image", "video", "audio"]).default("text"),
    content: zod_1.z.string().min(1, "Conteúdo é obrigatório"),
    contentUrl: zod_1.z.string().url().optional().nullable(),
    duration: zod_1.z.number().optional().nullable(),
    schedule: zod_1.z.object({
        enabled: zod_1.z.boolean(),
        daysOfWeek: zod_1.z.array(zod_1.z.number().min(0).max(6)),
        time: zod_1.z.string(),
        recurrence: zod_1.z.enum(["once", "daily", "weekly", "monthly"]),
    }).optional().nullable(),
    rotation: zod_1.z.object({
        enabled: zod_1.z.boolean(),
        type: zod_1.z.enum(["sequential", "random"]),
        priority: zod_1.z.number().optional(),
    }).optional().nullable(),
    isActive: zod_1.z.boolean().default(true),
    priority: zod_1.z.number().default(0),
});
// =====================================================
// AUDIO CONFIG - Configuração de Áudio TTS para Respostas IA
// Usa tabelas existentes: audio_config e audio_message_counter
// =====================================================
exports.audioResponseModes = ["audio_on_customer_audio", "audio_only", "audio_text"];
exports.audioConfig = (0, pg_core_1.pgTable)("audio_config", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.varchar)("user_id", { length: 255 }).notNull().unique().references(function () { return exports.users.id; }, { onDelete: "cascade" }),
    isEnabled: (0, pg_core_1.boolean)("is_enabled").default(true).notNull(),
    voiceType: (0, pg_core_1.text)("voice_type").default("female").notNull(), // "female" ou "male"
    responseMode: (0, pg_core_1.text)("response_mode").$type().default("audio_text").notNull(),
    speed: (0, pg_core_1.numeric)("speed", { precision: 3, scale: 2 }).default("1.00").notNull(), // 0.5 a 2.0
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
exports.audioMessageCounter = (0, pg_core_1.pgTable)("audio_message_counter", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.varchar)("user_id", { length: 255 }).notNull().references(function () { return exports.users.id; }, { onDelete: "cascade" }),
    date: (0, pg_core_1.date)("date").defaultNow().notNull(),
    count: (0, pg_core_1.integer)("count").default(0).notNull(),
    dailyLimit: (0, pg_core_1.integer)("daily_limit").default(30).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
// Relations para Audio Config
exports.audioConfigRelations = (0, drizzle_orm_2.relations)(exports.audioConfig, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, {
            fields: [exports.audioConfig.userId],
            references: [exports.users.id],
        }),
    });
});
exports.audioMessageCounterRelations = (0, drizzle_orm_2.relations)(exports.audioMessageCounter, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, {
            fields: [exports.audioMessageCounter.userId],
            references: [exports.users.id],
        }),
    });
});
// Schema Zod para Audio Config
exports.insertAudioConfigSchema = (0, drizzle_zod_1.createInsertSchema)(exports.audioConfig).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.updateAudioConfigSchema = zod_1.z.object({
    isEnabled: zod_1.z.boolean().optional(),
    voiceType: zod_1.z.enum(["female", "male"]).optional(),
    responseMode: zod_1.z.enum(exports.audioResponseModes).optional(),
    speed: zod_1.z.string().optional(), // String porque é numeric no DB
});
// =============================================================================
// FASE 4 - NOVOS SCHEMAS
// =============================================================================
// T4.4 - Setores e Roteamento
exports.sectors = (0, pg_core_1.pgTable)("sectors", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_75 || (templateObject_75 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    keywords: (0, pg_core_1.text)("keywords").array().default([]),
    autoAssignAgentId: (0, pg_core_1.varchar)("auto_assign_agent_id").references(function () { return exports.admins.id; }, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_sectors_name").on(table.name),
    (0, pg_core_1.index)("idx_sectors_auto_assign").on(table.autoAssignAgentId),
]; });
exports.sectorMembers = (0, pg_core_1.pgTable)("sector_members", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_76 || (templateObject_76 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    sectorId: (0, pg_core_1.varchar)("sector_id").notNull().references(function () { return exports.sectors.id; }, { onDelete: 'cascade' }),
    memberId: (0, pg_core_1.varchar)("member_id").notNull().references(function () { return exports.teamMembers.id; }, { onDelete: 'cascade' }),
    isPrimary: (0, pg_core_1.boolean)("is_primary").default(false),
    canReceiveTickets: (0, pg_core_1.boolean)("can_receive_tickets").default(true),
    maxOpenTickets: (0, pg_core_1.integer)("max_open_tickets").default(10),
    currentOpenTickets: (0, pg_core_1.integer)("current_open_tickets").default(0),
    assignedAt: (0, pg_core_1.timestamp)("assigned_at").defaultNow(),
    assignedBy: (0, pg_core_1.varchar)("assigned_by"),
}, function (table) { return [
    (0, pg_core_1.index)("idx_sector_members_sector").on(table.sectorId),
    (0, pg_core_1.index)("idx_sector_members_member").on(table.memberId),
    (0, pg_core_1.uniqueIndex)("idx_sector_members_unique").on(table.sectorId, table.memberId),
]; });
exports.routingLogs = (0, pg_core_1.pgTable)("routing_logs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_77 || (templateObject_77 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    conversationId: (0, pg_core_1.varchar)("conversation_id").notNull().references(function () { return exports.conversations.id; }, { onDelete: 'cascade' }),
    messageText: (0, pg_core_1.text)("message_text"),
    detectedIntent: (0, pg_core_1.varchar)("detected_intent", { length: 100 }),
    matchedSectorId: (0, pg_core_1.varchar)("matched_sector_id").references(function () { return exports.sectors.id; }, { onDelete: 'set null' }),
    confidenceScore: (0, pg_core_1.decimal)("confidence_score", { precision: 3, scale: 2 }),
    assignedToMemberId: (0, pg_core_1.varchar)("assigned_to_member_id").references(function () { return exports.teamMembers.id; }, { onDelete: 'set null' }),
    routingMethod: (0, pg_core_1.varchar)("routing_method", { length: 50 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_routing_logs_conversation").on(table.conversationId),
    (0, pg_core_1.index)("idx_routing_logs_created").on(table.createdAt),
    (0, pg_core_1.index)("idx_routing_logs_sector").on(table.matchedSectorId),
]; });
exports.saasOwnerReports = (0, pg_core_1.pgTable)("saas_owner_reports", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_78 || (templateObject_78 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    reportType: (0, pg_core_1.varchar)("report_type", { length: 50 }).notNull(),
    periodStart: (0, pg_core_1.date)("period_start").notNull(),
    periodEnd: (0, pg_core_1.date)("period_end").notNull(),
    generatedAt: (0, pg_core_1.timestamp)("generated_at").defaultNow(),
    generatedBy: (0, pg_core_1.varchar)("generated_by"),
    data: (0, pg_core_1.jsonb)("data").default({}),
    totalConversations: (0, pg_core_1.integer)("total_conversations").default(0),
    totalMessages: (0, pg_core_1.integer)("total_messages").default(0),
    avgResponseTimeMinutes: (0, pg_core_1.integer)("avg_response_time_minutes"),
    satisfactionScore: (0, pg_core_1.decimal)("satisfaction_score", { precision: 3, scale: 2 }),
    filters: (0, pg_core_1.jsonb)("filters").default({}),
}, function (table) { return [
    (0, pg_core_1.index)("idx_saas_reports_type").on(table.reportType),
    (0, pg_core_1.index)("idx_saas_reports_period").on(table.periodStart, table.periodEnd),
    (0, pg_core_1.index)("idx_saas_reports_generated").on(table.generatedAt),
]; });
// T4.2 - Ticket Closure System
exports.ticketClosureLogsV4 = (0, pg_core_1.pgTable)("ticket_closure_logs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_79 || (templateObject_79 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    conversationId: (0, pg_core_1.varchar)("conversation_id").notNull().references(function () { return exports.conversations.id; }, { onDelete: 'cascade' }),
    action: (0, pg_core_1.varchar)("action", { length: 50 }).notNull(), // 'closed', 'reopened'
    performedBy: (0, pg_core_1.varchar)("performed_by").notNull(),
    performedByName: (0, pg_core_1.varchar)("performed_by_name", { length: 255 }),
    reason: (0, pg_core_1.text)("reason"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_ticket_closure_conversation").on(table.conversationId),
    (0, pg_core_1.index)("idx_ticket_closure_created").on(table.createdAt),
]; });
// T4.1 - Bulk Actions Log
exports.bulkActionsLog = (0, pg_core_1.pgTable)("bulk_actions_log", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_80 || (templateObject_80 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    actionType: (0, pg_core_1.varchar)("action_type", { length: 50 }).notNull(),
    performedBy: (0, pg_core_1.varchar)("performed_by").notNull(),
    performedByName: (0, pg_core_1.varchar)("performed_by_name", { length: 255 }),
    affectedConversations: (0, pg_core_1.integer)("affected_conversations").default(0),
    conversationIds: (0, pg_core_1.text)("conversation_ids").array(),
    details: (0, pg_core_1.jsonb)("details").default({}),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_bulk_actions_created").on(table.createdAt),
    (0, pg_core_1.index)("idx_bulk_actions_type").on(table.actionType),
]; });
// T4.3 - Scheduled Messages
exports.scheduledMessages = (0, pg_core_1.pgTable)("scheduled_messages", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_81 || (templateObject_81 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    conversationId: (0, pg_core_1.varchar)("conversation_id").notNull().references(function () { return exports.conversations.id; }, { onDelete: 'cascade' }),
    connectionId: (0, pg_core_1.varchar)("connection_id").notNull().references(function () { return exports.whatsappConnections.id; }, { onDelete: 'cascade' }),
    messageText: (0, pg_core_1.text)("message_text").notNull(),
    messageType: (0, pg_core_1.varchar)("message_type", { length: 50 }).default("text"),
    aiPrompt: (0, pg_core_1.text)("ai_prompt"),
    aiGeneratedText: (0, pg_core_1.text)("ai_generated_text"),
    wasEdited: (0, pg_core_1.boolean)("was_edited").default(false),
    scheduledAt: (0, pg_core_1.timestamp)("scheduled_at").notNull(),
    timezone: (0, pg_core_1.varchar)("timezone", { length: 50 }).default("America/Sao_Paulo"),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("pending"),
    sentAt: (0, pg_core_1.timestamp)("sent_at"),
    errorMessage: (0, pg_core_1.text)("error_message"),
    createdBy: (0, pg_core_1.varchar)("created_by").notNull(),
    createdByName: (0, pg_core_1.varchar)("created_by_name", { length: 255 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_scheduled_conversation").on(table.conversationId),
    (0, pg_core_1.index)("idx_scheduled_status").on(table.status),
    (0, pg_core_1.index)("idx_scheduled_at").on(table.scheduledAt),
    (0, pg_core_1.index)("idx_scheduled_pending").on(table.status, table.scheduledAt),
]; });
// T4.5 - Multi-WhatsApp Support
exports.connectionAgents = (0, pg_core_1.pgTable)("connection_agents", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_82 || (templateObject_82 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    connectionId: (0, pg_core_1.varchar)("connection_id").notNull().references(function () { return exports.whatsappConnections.id; }, { onDelete: 'cascade' }),
    agentId: (0, pg_core_1.varchar)("agent_id").notNull().references(function () { return exports.agents.id; }, { onDelete: 'cascade' }),
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
    assignedAt: (0, pg_core_1.timestamp)("assigned_at").defaultNow(),
    assignedBy: (0, pg_core_1.varchar)("assigned_by"),
}, function (table) { return [
    (0, pg_core_1.index)("idx_conn_agents_connection").on(table.connectionId),
    (0, pg_core_1.index)("idx_conn_agents_agent").on(table.agentId),
    (0, pg_core_1.uniqueIndex)("idx_conn_agents_unique").on(table.connectionId, table.agentId),
]; });
exports.connectionMembers = (0, pg_core_1.pgTable)("connection_members", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_83 || (templateObject_83 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    connectionId: (0, pg_core_1.varchar)("connection_id").notNull().references(function () { return exports.whatsappConnections.id; }, { onDelete: 'cascade' }),
    memberId: (0, pg_core_1.varchar)("member_id").notNull().references(function () { return exports.teamMembers.id; }, { onDelete: 'cascade' }),
    canView: (0, pg_core_1.boolean)("can_view").default(true),
    canRespond: (0, pg_core_1.boolean)("can_respond").default(true),
    canManage: (0, pg_core_1.boolean)("can_manage").default(false),
    assignedAt: (0, pg_core_1.timestamp)("assigned_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_conn_members_connection").on(table.connectionId),
    (0, pg_core_1.index)("idx_conn_members_member").on(table.memberId),
    (0, pg_core_1.uniqueIndex)("idx_conn_members_unique").on(table.connectionId, table.memberId),
]; });
// Relations for Fase 4 tables
// Multi-agent relations
exports.connectionAgentsRelations = (0, drizzle_orm_2.relations)(exports.connectionAgents, function (_a) {
    var one = _a.one;
    return ({
        connection: one(exports.whatsappConnections, { fields: [exports.connectionAgents.connectionId], references: [exports.whatsappConnections.id] }),
        agent: one(exports.agents, { fields: [exports.connectionAgents.agentId], references: [exports.agents.id] }),
    });
});
exports.connectionMembersRelations = (0, drizzle_orm_2.relations)(exports.connectionMembers, function (_a) {
    var one = _a.one;
    return ({
        connection: one(exports.whatsappConnections, { fields: [exports.connectionMembers.connectionId], references: [exports.whatsappConnections.id] }),
        member: one(exports.teamMembers, { fields: [exports.connectionMembers.memberId], references: [exports.teamMembers.id] }),
    });
});
exports.sectorsRelations = (0, drizzle_orm_2.relations)(exports.sectors, function (_a) {
    var many = _a.many;
    return ({
        members: many(exports.sectorMembers),
        routingLogs: many(exports.routingLogs),
    });
});
exports.sectorMembersRelations = (0, drizzle_orm_2.relations)(exports.sectorMembers, function (_a) {
    var one = _a.one;
    return ({
        sector: one(exports.sectors, { fields: [exports.sectorMembers.sectorId], references: [exports.sectors.id] }),
        member: one(exports.teamMembers, { fields: [exports.sectorMembers.memberId], references: [exports.teamMembers.id] }),
    });
});
exports.routingLogsRelations = (0, drizzle_orm_2.relations)(exports.routingLogs, function (_a) {
    var one = _a.one;
    return ({
        conversation: one(exports.conversations, { fields: [exports.routingLogs.conversationId], references: [exports.conversations.id] }),
        sector: one(exports.sectors, { fields: [exports.routingLogs.matchedSectorId], references: [exports.sectors.id] }),
        assignedMember: one(exports.teamMembers, { fields: [exports.routingLogs.assignedToMemberId], references: [exports.teamMembers.id] }),
    });
});
exports.scheduledMessagesRelations = (0, drizzle_orm_2.relations)(exports.scheduledMessages, function (_a) {
    var one = _a.one;
    return ({
        conversation: one(exports.conversations, { fields: [exports.scheduledMessages.conversationId], references: [exports.conversations.id] }),
        connection: one(exports.whatsappConnections, { fields: [exports.scheduledMessages.connectionId], references: [exports.whatsappConnections.id] }),
    });
});
// Zod Schemas for Fase 4
exports.insertSectorSchema = (0, drizzle_zod_1.createInsertSchema)(exports.sectors).omit({
    id: true, createdAt: true, updatedAt: true,
});
exports.insertSectorMemberSchema = (0, drizzle_zod_1.createInsertSchema)(exports.sectorMembers).omit({
    id: true, assignedAt: true,
});
exports.insertScheduledMessageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.scheduledMessages).omit({
    id: true, createdAt: true, updatedAt: true, sentAt: true, errorMessage: true,
});
exports.scheduledMessageSchema = zod_1.z.object({
    conversationId: zod_1.z.string(),
    messageText: zod_1.z.string().min(1, "Mensagem é obrigatória"),
    messageType: zod_1.z.enum(["text", "ai_generated", "template"]).default("text"),
    aiPrompt: zod_1.z.string().optional(),
    scheduledAt: zod_1.z.date().or(zod_1.z.string()),
    timezone: zod_1.z.string().default("America/Sao_Paulo"),
});
exports.insertConnectionAgentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.connectionAgents).omit({
    id: true,
    assignedAt: true,
});
exports.insertConnectionMemberSchema = (0, drizzle_zod_1.createInsertSchema)(exports.connectionMembers).omit({
    id: true,
    assignedAt: true,
});
exports.connectionAgentSchema = zod_1.z.object({
    connectionId: zod_1.z.string().min(1, "Conexão é obrigatória"),
    agentId: zod_1.z.string().min(1, "Agente é obrigatório"),
    isActive: zod_1.z.boolean().default(true),
    assignedBy: zod_1.z.string().optional(),
});
exports.connectionMemberSchema = zod_1.z.object({
    connectionId: zod_1.z.string().min(1, "Conexão é obrigatória"),
    memberId: zod_1.z.string().min(1, "Membro é obrigatório"),
    canView: zod_1.z.boolean().default(true),
    canRespond: zod_1.z.boolean().default(true),
    canManage: zod_1.z.boolean().default(false),
});
// ==================== MENSAGENS AGENDADAS POR USUÁRIO ====================
// Tabela para armazenar mensagens que o usuário agendou para envio futuro
exports.conversationScheduledMessages = (0, pg_core_1.pgTable)("conversation_scheduled_messages", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_84 || (templateObject_84 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    conversationId: (0, pg_core_1.varchar)("conversation_id").references(function () { return exports.conversations.id; }, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.varchar)("user_id").references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    contactNumber: (0, pg_core_1.text)("contact_number").notNull(),
    text: (0, pg_core_1.text)("text").notNull(),
    scheduledFor: (0, pg_core_1.timestamp)("scheduled_for").notNull(),
    useAI: (0, pg_core_1.boolean)("use_ai").default(false),
    note: (0, pg_core_1.text)("note"),
    status: (0, pg_core_1.text)("status").notNull().default('scheduled'), // scheduled, sent, failed, cancelled
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    executedAt: (0, pg_core_1.timestamp)("executed_at"),
    errorReason: (0, pg_core_1.text)("error_reason"),
}, function (table) { return [
    (0, pg_core_1.index)("idx_conv_sched_msgs_conv").on(table.conversationId),
    (0, pg_core_1.index)("idx_conv_sched_msgs_user").on(table.userId),
    (0, pg_core_1.index)("idx_conv_sched_msgs_status").on(table.status),
]; });
// =============================================================================
// QR CODE INTELIGENTE - Ferramenta de geração de QR Codes WhatsApp
// Step 1: Database schema & types
// =============================================================================
exports.smartQrcodes = (0, pg_core_1.pgTable)("smart_qrcodes", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_85 || (templateObject_85 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: "cascade" }),
    // Identidade do QR Code
    name: (0, pg_core_1.varchar)("name", { length: 200 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    slug: (0, pg_core_1.varchar)("slug", { length: 100 }).unique(),
    // Destino WhatsApp
    whatsappNumber: (0, pg_core_1.varchar)("whatsapp_number", { length: 30 }).notNull(),
    welcomeMessage: (0, pg_core_1.text)("welcome_message"),
    // Template / Segmento
    templateId: (0, pg_core_1.varchar)("template_id", { length: 100 }),
    templateName: (0, pg_core_1.varchar)("template_name", { length: 100 }),
    // Personalização visual
    foregroundColor: (0, pg_core_1.varchar)("foreground_color", { length: 20 }).default("#000000"),
    backgroundColor: (0, pg_core_1.varchar)("background_color", { length: 20 }).default("#ffffff"),
    logoUrl: (0, pg_core_1.text)("logo_url"),
    logoSize: (0, pg_core_1.integer)("logo_size").default(20),
    cornerRadius: (0, pg_core_1.integer)("corner_radius").default(0),
    errorCorrection: (0, pg_core_1.varchar)("error_correction", { length: 1 }).default("H"),
    // Conteúdo gerado
    targetUrl: (0, pg_core_1.text)("target_url").notNull(),
    qrData: (0, pg_core_1.text)("qr_data"),
    qrGeneratedAt: (0, pg_core_1.timestamp)("qr_generated_at"),
    qrSize: (0, pg_core_1.integer)("qr_size").default(400),
    // Status e analytics
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    scanCount: (0, pg_core_1.integer)("scan_count").default(0).notNull(),
    lastScannedAt: (0, pg_core_1.timestamp)("last_scanned_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_smart_qrcodes_user_id").on(table.userId),
    (0, pg_core_1.index)("idx_smart_qrcodes_active").on(table.userId, table.isActive),
    (0, pg_core_1.index)("idx_smart_qrcodes_template").on(table.templateId),
    (0, pg_core_1.index)("idx_smart_qrcodes_created").on(table.createdAt),
]; });
exports.qrcodeScanLogs = (0, pg_core_1.pgTable)("qrcode_scan_logs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_86 || (templateObject_86 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    qrcodeId: (0, pg_core_1.varchar)("qrcode_id").notNull().references(function () { return exports.smartQrcodes.id; }, { onDelete: "cascade" }),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: "cascade" }),
    scannedAt: (0, pg_core_1.timestamp)("scanned_at").defaultNow(),
    userAgent: (0, pg_core_1.text)("user_agent"),
    ipAddress: (0, pg_core_1.varchar)("ip_address", { length: 50 }),
    referrer: (0, pg_core_1.text)("referrer"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_qrcode_scan_logs_qrcode").on(table.qrcodeId),
    (0, pg_core_1.index)("idx_qrcode_scan_logs_user").on(table.userId),
    (0, pg_core_1.index)("idx_qrcode_scan_logs_date").on(table.scannedAt),
]; });
// Relations
exports.smartQrcodesRelations = (0, drizzle_orm_2.relations)(exports.smartQrcodes, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, {
            fields: [exports.smartQrcodes.userId],
            references: [exports.users.id],
        }),
        scanLogs: many(exports.qrcodeScanLogs),
    });
});
exports.qrcodeScanLogsRelations = (0, drizzle_orm_2.relations)(exports.qrcodeScanLogs, function (_a) {
    var one = _a.one;
    return ({
        qrcode: one(exports.smartQrcodes, {
            fields: [exports.qrcodeScanLogs.qrcodeId],
            references: [exports.smartQrcodes.id],
        }),
        user: one(exports.users, {
            fields: [exports.qrcodeScanLogs.userId],
            references: [exports.users.id],
        }),
    });
});
// Zod schemas
exports.insertSmartQrcodeSchema = (0, drizzle_zod_1.createInsertSchema)(exports.smartQrcodes).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    qrData: true,
    qrGeneratedAt: true,
    scanCount: true,
    lastScannedAt: true,
});
exports.smartQrcodeSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Nome é obrigatório").max(200),
    description: zod_1.z.string().max(1000).optional().nullable(),
    slug: zod_1.z.string().max(100).regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífens").optional().nullable(),
    whatsappNumber: zod_1.z.string().min(8, "Número WhatsApp inválido").max(30),
    welcomeMessage: zod_1.z.string().max(500).optional().nullable(),
    templateId: zod_1.z.string().max(100).optional().nullable(),
    templateName: zod_1.z.string().max(100).optional().nullable(),
    foregroundColor: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida").default("#000000"),
    backgroundColor: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida").default("#ffffff"),
    logoUrl: zod_1.z.string().url().optional().nullable(),
    logoSize: zod_1.z.number().int().min(5).max(30).default(20),
    cornerRadius: zod_1.z.number().int().min(0).max(50).default(0),
    errorCorrection: zod_1.z.enum(["L", "M", "Q", "H"]).default("H"),
    targetUrl: zod_1.z.string().url("URL inválida"),
    qrSize: zod_1.z.number().int().min(200).max(1200).default(400),
    isActive: zod_1.z.boolean().default(true),
});
exports.updateSmartQrcodeSchema = exports.smartQrcodeSchema.partial().omit({ targetUrl: true });
// =============================================================================
// BUSINESS CATEGORIES — Mapeamento segmento → macrocategoria → ferramenta
// Step 1 / ETAPA 3: Categorias de negócio identificadas na análise do banco
// Fonte: RELATORIO_TIPOS_NEGOCIO_CLIENTES.md (26/02/2026) — 316 usuários
// =============================================================================
exports.businessCategories = (0, pg_core_1.pgTable)("business_categories", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_87 || (templateObject_87 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    slug: (0, pg_core_1.varchar)("slug", { length: 100 }).notNull().unique(),
    name: (0, pg_core_1.varchar)("name", { length: 200 }).notNull(),
    categoryGroup: (0, pg_core_1.varchar)("category_group", { length: 50 }).notNull(),
    groupLabel: (0, pg_core_1.varchar)("group_label", { length: 100 }).notNull(),
    icon: (0, pg_core_1.varchar)("icon", { length: 10 }).notNull().default("💬"),
    description: (0, pg_core_1.text)("description"),
    targetTool: (0, pg_core_1.varchar)("target_tool", { length: 50 }).notNull().default("generic"),
    welcomeMessage: (0, pg_core_1.text)("welcome_message"),
    color: (0, pg_core_1.varchar)("color", { length: 20 }).notNull().default("#2c3e50"),
    userCount: (0, pg_core_1.integer)("user_count").notNull().default(0),
    sortOrder: (0, pg_core_1.integer)("sort_order").notNull().default(99),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_business_categories_group").on(table.categoryGroup),
    (0, pg_core_1.index)("idx_business_categories_tool").on(table.targetTool),
    (0, pg_core_1.index)("idx_business_categories_active").on(table.isActive, table.sortOrder),
]; });
// ─── Broadcast Campaigns ─────────────────────────────────────────────────────
exports.broadcastCampaigns = (0, pg_core_1.pgTable)("broadcast_campaigns", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_88 || (templateObject_88 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    connectionId: (0, pg_core_1.varchar)("connection_id").references(function () { return exports.whatsappConnections.id; }, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull().default('Campanha'),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).notNull().default('pending'),
    messageTemplate: (0, pg_core_1.text)("message_template").notNull(),
    mediaUrl: (0, pg_core_1.text)("media_url"),
    mediaType: (0, pg_core_1.varchar)("media_type", { length: 50 }),
    totalContacts: (0, pg_core_1.integer)("total_contacts").default(0).notNull(),
    sentCount: (0, pg_core_1.integer)("sent_count").default(0).notNull(),
    failedCount: (0, pg_core_1.integer)("failed_count").default(0).notNull(),
    useAi: (0, pg_core_1.boolean)("use_ai").default(false).notNull(),
    delayMinMs: (0, pg_core_1.integer)("delay_min_ms").default(60000).notNull(),
    delayMaxMs: (0, pg_core_1.integer)("delay_max_ms").default(90000).notNull(),
    batchSize: (0, pg_core_1.integer)("batch_size").default(10).notNull(),
    batchPauseMs: (0, pg_core_1.integer)("batch_pause_ms").default(600000).notNull(),
    contactsJson: (0, pg_core_1.jsonb)("contacts_json").$type().default([]).notNull(),
    resultsJson: (0, pg_core_1.jsonb)("results_json").$type().default([]).notNull(),
    scheduledAt: (0, pg_core_1.timestamp)("scheduled_at"),
    startedAt: (0, pg_core_1.timestamp)("started_at"),
    completedAt: (0, pg_core_1.timestamp)("completed_at"),
    errorMessage: (0, pg_core_1.text)("error_message"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_broadcast_campaigns_user_status").on(table.userId, table.status),
    (0, pg_core_1.index)("idx_broadcast_campaigns_status_scheduled").on(table.status, table.scheduledAt),
    (0, pg_core_1.index)("idx_broadcast_campaigns_connection").on(table.connectionId),
    (0, pg_core_1.index)("idx_broadcast_campaigns_created").on(table.createdAt),
]; });
exports.broadcastCampaignsRelations = (0, drizzle_orm_2.relations)(exports.broadcastCampaigns, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, {
            fields: [exports.broadcastCampaigns.userId],
            references: [exports.users.id],
        }),
        connection: one(exports.whatsappConnections, {
            fields: [exports.broadcastCampaigns.connectionId],
            references: [exports.whatsappConnections.id],
        }),
    });
});
exports.insertBroadcastCampaignSchema = (0, drizzle_zod_1.createInsertSchema)(exports.broadcastCampaigns).omit({ id: true, createdAt: true, updatedAt: true });
// =============================================================================
// BLOG AUTOMATION - SEO auto-blog com geracao, publicacao e indexing telemetry
// =============================================================================
exports.blogAssetImages = (0, pg_core_1.pgTable)("blog_asset_images", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_89 || (templateObject_89 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    provider: (0, pg_core_1.varchar)("provider", { length: 50 }).notNull().default("template"),
    model: (0, pg_core_1.varchar)("model", { length: 120 }),
    prompt: (0, pg_core_1.text)("prompt"),
    altText: (0, pg_core_1.text)("alt_text").notNull(),
    mimeType: (0, pg_core_1.varchar)("mime_type", { length: 100 }).notNull().default("image/svg+xml"),
    filePath: (0, pg_core_1.text)("file_path").notNull(),
    publicUrl: (0, pg_core_1.text)("public_url").notNull(),
    width: (0, pg_core_1.integer)("width").notNull().default(1200),
    height: (0, pg_core_1.integer)("height").notNull().default(630),
    sourceProvenance: (0, pg_core_1.jsonb)("source_provenance").$type().default({}).notNull(),
    metadata: (0, pg_core_1.jsonb)("metadata").$type().default({}).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_blog_asset_images_provider").on(table.provider),
    (0, pg_core_1.index)("idx_blog_asset_images_created").on(table.createdAt),
]; });
exports.blogTopics = (0, pg_core_1.pgTable)("blog_topics", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_90 || (templateObject_90 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).notNull().default("pending"),
    titleHint: (0, pg_core_1.varchar)("title_hint", { length: 255 }).notNull(),
    keywordPrimary: (0, pg_core_1.varchar)("keyword_primary", { length: 255 }).notNull(),
    keywordsSecondary: (0, pg_core_1.jsonb)("keywords_secondary").$type().default([]).notNull(),
    cluster: (0, pg_core_1.varchar)("cluster", { length: 120 }).notNull(),
    categorySlug: (0, pg_core_1.varchar)("category_slug", { length: 120 }).notNull(),
    intent: (0, pg_core_1.varchar)("intent", { length: 50 }).notNull().default("commercial"),
    funnelStage: (0, pg_core_1.varchar)("funnel_stage", { length: 50 }).notNull().default("mofu"),
    sourceType: (0, pg_core_1.varchar)("source_type", { length: 50 }).notNull().default("seed"),
    sourceData: (0, pg_core_1.jsonb)("source_data").$type().default({}).notNull(),
    briefJson: (0, pg_core_1.jsonb)("brief_json").$type().default({}).notNull(),
    score: (0, pg_core_1.integer)("score").notNull().default(0),
    lastAttemptAt: (0, pg_core_1.timestamp)("last_attempt_at"),
    publishedPostId: (0, pg_core_1.varchar)("published_post_id"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)("idx_blog_topics_keyword_unique").on(table.keywordPrimary),
    (0, pg_core_1.index)("idx_blog_topics_status").on(table.status, table.createdAt),
    (0, pg_core_1.index)("idx_blog_topics_cluster").on(table.cluster, table.createdAt),
]; });
exports.blogPosts = (0, pg_core_1.pgTable)("blog_posts", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_91 || (templateObject_91 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    topicId: (0, pg_core_1.varchar)("topic_id").references(function () { return exports.blogTopics.id; }, { onDelete: 'set null' }),
    slug: (0, pg_core_1.varchar)("slug", { length: 255 }).notNull().unique(),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).notNull().default("draft"),
    title: (0, pg_core_1.varchar)("title", { length: 255 }).notNull(),
    excerpt: (0, pg_core_1.text)("excerpt").notNull(),
    bodyHtml: (0, pg_core_1.text)("body_html").notNull(),
    bodyJson: (0, pg_core_1.jsonb)("body_json").$type().default({}).notNull(),
    faqJson: (0, pg_core_1.jsonb)("faq_json").$type().default([]).notNull(),
    keywordPrimary: (0, pg_core_1.varchar)("keyword_primary", { length: 255 }).notNull(),
    keywordsSecondary: (0, pg_core_1.jsonb)("keywords_secondary").$type().default([]).notNull(),
    cluster: (0, pg_core_1.varchar)("cluster", { length: 120 }).notNull(),
    categorySlug: (0, pg_core_1.varchar)("category_slug", { length: 120 }).notNull(),
    tags: (0, pg_core_1.jsonb)("tags").$type().default([]).notNull(),
    intent: (0, pg_core_1.varchar)("intent", { length: 50 }).notNull().default("commercial"),
    funnelStage: (0, pg_core_1.varchar)("funnel_stage", { length: 50 }).notNull().default("mofu"),
    metaTitle: (0, pg_core_1.varchar)("meta_title", { length: 255 }).notNull(),
    metaDescription: (0, pg_core_1.text)("meta_description").notNull(),
    canonicalUrl: (0, pg_core_1.text)("canonical_url").notNull(),
    jsonLd: (0, pg_core_1.jsonb)("json_ld").$type().default({}).notNull(),
    heroImageId: (0, pg_core_1.varchar)("hero_image_id").references(function () { return exports.blogAssetImages.id; }, { onDelete: 'set null' }),
    heroImageUrl: (0, pg_core_1.text)("hero_image_url"),
    heroImageAlt: (0, pg_core_1.text)("hero_image_alt"),
    imagePrompt: (0, pg_core_1.text)("image_prompt"),
    qualityScore: (0, pg_core_1.integer)("quality_score").notNull().default(0),
    duplicateSimilarity: (0, pg_core_1.numeric)("duplicate_similarity", { precision: 5, scale: 4 }).notNull().default("0"),
    internalProofCount: (0, pg_core_1.integer)("internal_proof_count").notNull().default(0),
    requiredInternalLinks: (0, pg_core_1.integer)("required_internal_links").notNull().default(0),
    unsupportedClaims: (0, pg_core_1.integer)("unsupported_claims").notNull().default(0),
    sourceProvenance: (0, pg_core_1.jsonb)("source_provenance").$type().default({}).notNull(),
    reviewNotes: (0, pg_core_1.text)("review_notes"),
    distributionPayload: (0, pg_core_1.jsonb)("distribution_payload").$type().default({}).notNull(),
    readingTimeMinutes: (0, pg_core_1.integer)("reading_time_minutes").notNull().default(1),
    modelProvider: (0, pg_core_1.varchar)("model_provider", { length: 50 }).notNull().default("mistral"),
    modelName: (0, pg_core_1.varchar)("model_name", { length: 120 }).notNull().default("mistral-medium-latest"),
    publishedAt: (0, pg_core_1.timestamp)("published_at"),
    lastRefreshAt: (0, pg_core_1.timestamp)("last_refresh_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_blog_posts_status").on(table.status, table.publishedAt),
    (0, pg_core_1.index)("idx_blog_posts_category").on(table.categorySlug, table.publishedAt),
    (0, pg_core_1.index)("idx_blog_posts_cluster").on(table.cluster, table.publishedAt),
    (0, pg_core_1.index)("idx_blog_posts_keyword").on(table.keywordPrimary),
]; });
exports.blogPostRevisions = (0, pg_core_1.pgTable)("blog_post_revisions", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_92 || (templateObject_92 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    postId: (0, pg_core_1.varchar)("post_id").notNull().references(function () { return exports.blogPosts.id; }, { onDelete: 'cascade' }),
    revisionType: (0, pg_core_1.varchar)("revision_type", { length: 50 }).notNull().default("draft"),
    bodyHtml: (0, pg_core_1.text)("body_html").notNull(),
    bodyJson: (0, pg_core_1.jsonb)("body_json").$type().default({}).notNull(),
    qualityScore: (0, pg_core_1.integer)("quality_score").notNull().default(0),
    notes: (0, pg_core_1.text)("notes"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_blog_post_revisions_post").on(table.postId, table.createdAt),
]; });
exports.blogPostSources = (0, pg_core_1.pgTable)("blog_post_sources", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_93 || (templateObject_93 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    postId: (0, pg_core_1.varchar)("post_id").references(function () { return exports.blogPosts.id; }, { onDelete: 'cascade' }),
    topicId: (0, pg_core_1.varchar)("topic_id").references(function () { return exports.blogTopics.id; }, { onDelete: 'cascade' }),
    sourceType: (0, pg_core_1.varchar)("source_type", { length: 50 }).notNull(),
    sourceKey: (0, pg_core_1.varchar)("source_key", { length: 255 }).notNull(),
    sourceUrl: (0, pg_core_1.text)("source_url"),
    payload: (0, pg_core_1.jsonb)("payload").$type().default({}).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_blog_post_sources_post").on(table.postId, table.createdAt),
    (0, pg_core_1.index)("idx_blog_post_sources_topic").on(table.topicId, table.createdAt),
]; });
exports.blogGenerationJobs = (0, pg_core_1.pgTable)("blog_generation_jobs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_94 || (templateObject_94 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    topicId: (0, pg_core_1.varchar)("topic_id").references(function () { return exports.blogTopics.id; }, { onDelete: 'set null' }),
    postId: (0, pg_core_1.varchar)("post_id").references(function () { return exports.blogPosts.id; }, { onDelete: 'set null' }),
    jobType: (0, pg_core_1.varchar)("job_type", { length: 50 }).notNull(),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).notNull().default("queued"),
    provider: (0, pg_core_1.varchar)("provider", { length: 50 }).notNull().default("mistral"),
    model: (0, pg_core_1.varchar)("model", { length: 120 }),
    requestPayload: (0, pg_core_1.jsonb)("request_payload").$type().default({}).notNull(),
    responsePayload: (0, pg_core_1.jsonb)("response_payload").$type().default({}).notNull(),
    errorMessage: (0, pg_core_1.text)("error_message"),
    startedAt: (0, pg_core_1.timestamp)("started_at"),
    completedAt: (0, pg_core_1.timestamp)("completed_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_blog_generation_jobs_status").on(table.status, table.createdAt),
    (0, pg_core_1.index)("idx_blog_generation_jobs_topic").on(table.topicId, table.createdAt),
]; });
exports.blogPublishJobs = (0, pg_core_1.pgTable)("blog_publish_jobs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_95 || (templateObject_95 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    postId: (0, pg_core_1.varchar)("post_id").references(function () { return exports.blogPosts.id; }, { onDelete: 'cascade' }),
    jobType: (0, pg_core_1.varchar)("job_type", { length: 50 }).notNull().default("publish"),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).notNull().default("queued"),
    payload: (0, pg_core_1.jsonb)("payload").$type().default({}).notNull(),
    errorMessage: (0, pg_core_1.text)("error_message"),
    executedAt: (0, pg_core_1.timestamp)("executed_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_blog_publish_jobs_post").on(table.postId, table.createdAt),
    (0, pg_core_1.index)("idx_blog_publish_jobs_status").on(table.status, table.createdAt),
]; });
exports.blogIndexingChecks = (0, pg_core_1.pgTable)("blog_indexing_checks", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_96 || (templateObject_96 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    postId: (0, pg_core_1.varchar)("post_id").references(function () { return exports.blogPosts.id; }, { onDelete: 'cascade' }),
    inspectedUrl: (0, pg_core_1.text)("inspected_url").notNull(),
    inspectionType: (0, pg_core_1.varchar)("inspection_type", { length: 50 }).notNull().default("url_inspection"),
    indexingState: (0, pg_core_1.varchar)("indexing_state", { length: 120 }),
    coverageState: (0, pg_core_1.varchar)("coverage_state", { length: 255 }),
    googleCanonical: (0, pg_core_1.text)("google_canonical"),
    userCanonical: (0, pg_core_1.text)("user_canonical"),
    sitemaps: (0, pg_core_1.jsonb)("sitemaps").$type().default([]).notNull(),
    verdict: (0, pg_core_1.varchar)("verdict", { length: 120 }),
    rawResponse: (0, pg_core_1.jsonb)("raw_response").$type().default({}).notNull(),
    checkedAt: (0, pg_core_1.timestamp)("checked_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("idx_blog_indexing_checks_post").on(table.postId, table.checkedAt),
    (0, pg_core_1.index)("idx_blog_indexing_checks_url").on(table.inspectedUrl),
]; });
exports.blogPostMetrics = (0, pg_core_1.pgTable)("blog_post_metrics", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql)(templateObject_97 || (templateObject_97 = __makeTemplateObject(["gen_random_uuid()"], ["gen_random_uuid()"])))),
    postId: (0, pg_core_1.varchar)("post_id").references(function () { return exports.blogPosts.id; }, { onDelete: 'cascade' }),
    metricDate: (0, pg_core_1.date)("metric_date").notNull(),
    clicks: (0, pg_core_1.integer)("clicks").notNull().default(0),
    impressions: (0, pg_core_1.integer)("impressions").notNull().default(0),
    ctr: (0, pg_core_1.numeric)("ctr", { precision: 8, scale: 4 }).notNull().default("0"),
    position: (0, pg_core_1.numeric)("position", { precision: 8, scale: 2 }).notNull().default("0"),
    source: (0, pg_core_1.varchar)("source", { length: 50 }).notNull().default("search_console"),
    payload: (0, pg_core_1.jsonb)("payload").$type().default({}).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)("idx_blog_post_metrics_post_date_source").on(table.postId, table.metricDate, table.source),
    (0, pg_core_1.index)("idx_blog_post_metrics_date").on(table.metricDate, table.source),
]; });
exports.insertBlogTopicSchema = (0, drizzle_zod_1.createInsertSchema)(exports.blogTopics).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    lastAttemptAt: true,
});
exports.insertBlogPostSchema = (0, drizzle_zod_1.createInsertSchema)(exports.blogPosts).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    publishedAt: true,
    lastRefreshAt: true,
});
exports.insertBlogAssetImageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.blogAssetImages).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15, templateObject_16, templateObject_17, templateObject_18, templateObject_19, templateObject_20, templateObject_21, templateObject_22, templateObject_23, templateObject_24, templateObject_25, templateObject_26, templateObject_27, templateObject_28, templateObject_29, templateObject_30, templateObject_31, templateObject_32, templateObject_33, templateObject_34, templateObject_35, templateObject_36, templateObject_37, templateObject_38, templateObject_39, templateObject_40, templateObject_41, templateObject_42, templateObject_43, templateObject_44, templateObject_45, templateObject_46, templateObject_47, templateObject_48, templateObject_49, templateObject_50, templateObject_51, templateObject_52, templateObject_53, templateObject_54, templateObject_55, templateObject_56, templateObject_57, templateObject_58, templateObject_59, templateObject_60, templateObject_61, templateObject_62, templateObject_63, templateObject_64, templateObject_65, templateObject_66, templateObject_67, templateObject_68, templateObject_69, templateObject_70, templateObject_71, templateObject_72, templateObject_73, templateObject_74, templateObject_75, templateObject_76, templateObject_77, templateObject_78, templateObject_79, templateObject_80, templateObject_81, templateObject_82, templateObject_83, templateObject_84, templateObject_85, templateObject_86, templateObject_87, templateObject_88, templateObject_89, templateObject_90, templateObject_91, templateObject_92, templateObject_93, templateObject_94, templateObject_95, templateObject_96, templateObject_97;
