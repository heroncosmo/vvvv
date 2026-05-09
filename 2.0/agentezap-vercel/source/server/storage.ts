import {
  users,
  admins,
  agents,
  whatsappConnections,
  adminWhatsappConnection,
  conversations,
  messages,
  aiAgentConfig,
  businessAgentConfigs,
  agentDisabledConversations,
  plans,
  subscriptions,
  payments,
  paymentHistory,
  paymentReceipts,
  systemConfig,
  whatsappContacts,
  contactLists,
  adminConversations,
  adminMessages,
  adminAgentMedia,
  mediaFlows,
  mediaFlowItems,
  coupons,
  tags,
  conversationTags,
  agentMediaLibrary,
  resellers,
  resellerClients,
  resellerPayments,
  resellerInvoices,
  teamMembers,
  teamMemberSessions,
  audioConfig,
  audioMessageCounter,
  connectionAgents,
  connectionMembers,
  type User,
  type UpsertUser,
  type Agent,
  type InsertAgent,
  type WhatsappConnection,
  type InsertWhatsappConnection,
  type AdminWhatsappConnection,
  type InsertAdminWhatsappConnection,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type AiAgentConfig,
  type InsertAiAgentConfig,
  type BusinessAgentConfig,
  type InsertBusinessAgentConfig,
  type Plan,
  type InsertPlan,
  type Subscription,
  type InsertSubscription,
  type Payment,
  type InsertPayment,
  type PaymentHistory,
  type InsertPaymentHistory,
  type SystemConfig,
  type InsertSystemConfig,
  type WhatsappContact,
  type InsertWhatsappContact,
  type AdminAgentMedia,
  type InsertAdminAgentMedia,
  type MediaFlow,
  type InsertMediaFlow,
  type MediaFlowItem,
  type InsertMediaFlowItem,
  type Coupon,
  type InsertCoupon,
  type Tag,
  type InsertTag,
  type ConversationTag,
  type InsertConversationTag,
  type Reseller,
  type InsertReseller,
  type ResellerClient,
  type InsertResellerClient,
  type ResellerPayment,
  type InsertResellerPayment,
  type ResellerInvoice,
  type InsertResellerInvoice,
  resellerInvoiceItems,
  type ResellerInvoiceItem,
  type InsertResellerInvoiceItem,
  type TeamMember,
  type InsertTeamMember,
  type TeamMemberSession,
  type AudioConfig,
  type AudioResponseMode,
  type AudioMessageCounter,
  type ConnectionAgent,
  type InsertConnectionAgent,
  type ConnectionMember,
  type InsertConnectionMember,
  type AttentionPriority,
} from "@shared/schema";
import { db, withRetry, ensureAudioResponseModeConstraint } from "./db";
import { isInternalOnlySimulatorConnection } from "./internalSimulatorConnection";
import { eq, desc, and, gte, sql, inArray, lte, lt, gt, isNotNull, isNull, asc, or } from "drizzle-orm";
import { transcribeAudioWithMistral, analyzeImageWithMistral } from "./mistralClient";
import { normalizePhoneForComparison as buildPhoneComparisonKeys, normalizePhoneToDigits, phoneNumbersMatch } from "./phoneMatch";
import { buildBrazilWhatsAppPhoneVariants, buildWhatsAppJidFromPhone } from "./whatsappPhoneNumber";
import { supabase } from "./supabaseAuth";
import {
  buildAdminBusinessDashboardReport,
  type AdminBusinessDashboardReport,
} from "./adminBusinessDashboard";
import { getAdminFollowupGlobalConfig, isLegacyAdminFollowupConfig, normalizeAdminFollowupConfig } from "./adminFollowupMigrationService";
import {
  isAdminConversationFollowupManuallyPaused,
  isAdminConversationManuallyPaused,
} from "./adminConversationAutomationState";
import { shouldRecoverCompletedTimer } from "./pendingAiDeliveryState";
import { getPublicCatalogPlans as filterPublicCatalogPlans } from "@shared/planCatalog";
import { repairMojibakeDeep } from "@shared/mojibake";
import { attachMediaToProducts, fetchProductMediaRows } from "./productCatalogAssets";
import { hasCatalogVariationMetadata } from "./productCatalogMessageActions";
import { matchCatalogVariationFromCustomerImage } from "./productCatalogVariationMatcher";
import {
  sanitizeAdminNotificationConfig,
  sanitizeAdminWhatsappConnection,
} from "./adminMessagingFeaturePolicy";
import {
  pickPreferredSubscriptionCandidate,
  resolveApprovedReceiptActivationWindow,
  shouldAutoActivateSubscriptionFromApprovedReceipt,
} from "./subscriptionSelection";

// ============================================
// CACHE EM MEMÓRIA PARA REDUZIR CARGA NO DB
// ============================================
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // time to live in ms
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private inflight = new Map<string, Promise<any>>();
  private maxSize = 2000; // Máximo de entradas no cache

  set<T>(key: string, data: T, ttlMs: number = 30000): void {
    // Limpar cache se estiver muito grande
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }
    this.cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /** Check if key exists in cache (distinguishes cached null from cache miss) */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get-or-compute with thundering herd protection.
   * Only ONE concurrent call per key actually runs computeFn;
   * all others await the same Promise.
   */
  async getOrCompute<T>(key: string, computeFn: () => Promise<T>, ttlMs: number = 30000): Promise<T> {
    // 1. Check cache
    if (this.has(key)) {
      return this.get<T>(key) as T;
    }
    // 2. Check inflight (thundering herd protection)
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    // 3. Compute, cache, and return
    const promise = computeFn().then(result => {
      this.set(key, result, ttlMs);
      this.inflight.delete(key);
      return result;
    }).catch(err => {
      this.inflight.delete(key);
      throw err;
    });
    this.inflight.set(key, promise);
    return promise;
  }

  invalidate(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
    // Se ainda estiver grande, remover os mais antigos
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, Math.floor(this.maxSize / 2));
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  getStats(): { size: number; maxSize: number; hitRate: string } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 'n/a',
    };
  }
}

export const memoryCache = new MemoryCache();

export interface AttentionQueueFilters {
  mode?: "critical" | "high" | "needsHumanAttention" | "all";
  connectionIds: string[];
  query?: string;
  limit?: number;
  offset?: number;
}

export interface AttentionQueueResult {
  data: Conversation[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

export interface ConversationRecoveryState {
  id: string;
  contactNumber: string;
  jidSuffix: string | null;
  lastMessageText: string | null;
  lastMessageTime: Date | null;
  lastMessageFromMe: boolean | null;
}

function buildAttentionPriorityScore(column = conversations.attentionPriority) {
  return sql<number>`
    CASE ${column}
      WHEN 'critica' THEN 4
      WHEN 'alta' THEN 3
      WHEN 'media' THEN 2
      WHEN 'baixa' THEN 1
      ELSE 0
    END
  `;
}

function isAudioPlaceholderText(text?: string | null): boolean {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    normalized === "audio" ||
    normalized === "áudio" ||
    normalized === "[audio enviado]" ||
    normalized === "[áudio enviado]"
  ) {
    return true;
  }

  return (
    normalized.startsWith("[audio") ||
    normalized.startsWith("[áudio") ||
    normalized.startsWith("🎵") ||
    normalized.startsWith("🎤") ||
    normalized.startsWith("??")
  );
}

async function resolveAudioTranscriptionForMessage(params: {
  conversationId: string;
  mediaType?: string | null;
  mediaUrl?: string | null;
}): Promise<string | null> {
  if (params.mediaType !== "audio" || !params.mediaUrl) {
    return null;
  }

  let audioBuffer: Buffer | null = null;

  if (params.mediaUrl.startsWith("data:")) {
    const base64Part = params.mediaUrl.split(",")[1];
    if (base64Part) {
      audioBuffer = Buffer.from(base64Part, "base64");
      console.log(`🎤 [Storage] Áudio base64 detectado: ${audioBuffer.length} bytes`);
    }
  } else if (params.mediaUrl.startsWith("http://") || params.mediaUrl.startsWith("https://")) {
    console.log(`🎤 [Storage] Baixando áudio de URL externa para transcrição...`);
    try {
      const audioResponse = await fetch(params.mediaUrl);
      if (audioResponse.ok) {
        const arrayBuffer = await audioResponse.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer);
        console.log(`🎤 [Storage] Áudio baixado da URL: ${audioBuffer.length} bytes`);
      } else {
        console.error(`🎤 [Storage] Erro ao baixar áudio: HTTP ${audioResponse.status}`);
      }
    } catch (fetchError) {
      console.error(`🎤 [Storage] Erro ao fazer fetch do áudio:`, fetchError);
    }
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    console.log(`🎤 [Storage] ⚠️ Não foi possível obter buffer do áudio para transcrição`);
    return null;
  }

  let transcriptionModel: string | undefined;
  let llmUserId: string | undefined;

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.conversationId));

  if (conversation) {
    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, conversation.connectionId));

    if (connection?.userId) {
      llmUserId = connection.userId;
      transcriptionModel = process.env.MISTRAL_TRANSCRIPTION_MODEL || undefined;
    }
  }

  console.log(`🎤 [Storage] Iniciando transcrição com Mistral...`);
  const transcription = await transcribeAudioWithMistral(audioBuffer, {
    fileName: "whatsapp-audio.ogg",
    model: transcriptionModel,
    userId: llmUserId,
  });

  if (transcription && transcription.length > 0) {
    console.log(`🎤 [Storage] ✅ Transcrição bem-sucedida: "${transcription.substring(0, 100)}..."`);
    return transcription;
  }

  console.log(`🎤 [Storage] ⚠️ Transcrição vazia ou nula`);
  return null;
}

// ============================================
// CIRCUIT BREAKER PARA PROTEÇÃO DO DB
// ============================================
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private readonly threshold = 5; // Número de falhas para abrir
  private readonly resetTimeout = 30000; // 30 segundos para tentar novamente

  async execute<T>(operation: () => Promise<T>, fallback?: T): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        console.warn('⚡ [Circuit Breaker] Circuito ABERTO - usando fallback');
        if (fallback !== undefined) return fallback;
        throw new Error('Database circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
        console.log('✅ [Circuit Breaker] Circuito FECHADO - DB recuperado');
      }
      return result;
    } catch (error: any) {
      this.failures++;
      this.lastFailure = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
        console.error(`🔴 [Circuit Breaker] Circuito ABERTO após ${this.failures} falhas`);
      }
      
      if (fallback !== undefined) return fallback;
      throw error;
    }
  }

  isOpen(): boolean {
    return this.state === 'open';
  }

  getState(): string {
    return this.state;
  }
}

export const dbCircuitBreaker = new CircuitBreaker();

function adminConversationIsVisibleCondition() {
  return sql<boolean>`coalesce(${adminConversations.contextState} -> 'followupMigration' ->> 'migratedBackAt', '') = ''`;
}

export interface IStorage {
  // User operations (IMPORTANT: mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Agent operations
  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  createAgent(data: InsertAgent): Promise<Agent>;
  updateAgent(id: string, data: Partial<InsertAgent>): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;

  // WhatsApp connection operations
  getConnectionByUserId(userId: string, connectionId?: string): Promise<WhatsappConnection | undefined>;
  getConnectionById(connectionId: string): Promise<WhatsappConnection | undefined>;
  getAdminConnection(): Promise<AdminWhatsappConnection | undefined>;
  getAllConnections(): Promise<WhatsappConnection[]>;
  getPrimaryConnectionPerUser(): Promise<WhatsappConnection[]>;
  createConnection(connection: InsertWhatsappConnection): Promise<WhatsappConnection>;
  updateConnection(id: string, data: Partial<InsertWhatsappConnection>): Promise<WhatsappConnection>;
  deleteConnection(id: string): Promise<void>;

  // Connection Agents (many-to-many) operations
  getConnectionAgents(connectionId: string): Promise<ConnectionAgent[]>;
  getAgentConnections(agentId: string): Promise<ConnectionAgent[]>;
  addConnectionAgent(data: InsertConnectionAgent): Promise<ConnectionAgent>;
  removeConnectionAgent(connectionId: string, agentId: string): Promise<void>;
  updateConnectionAgent(connectionId: string, agentId: string, data: { isActive?: boolean }): Promise<ConnectionAgent>;

  // Connection Members operations
  getConnectionMembers(connectionId: string): Promise<ConnectionMember[]>;
  addConnectionMember(data: InsertConnectionMember): Promise<ConnectionMember>;
  removeConnectionMember(connectionId: string, memberId: string): Promise<void>;
  updateConnectionMember(connectionId: string, memberId: string, data: { canView?: boolean; canRespond?: boolean; canManage?: boolean }): Promise<ConnectionMember>;

  // Multi-connection: get all connections for a user
  getConnectionsByUserId(userId: string): Promise<WhatsappConnection[]>;

  // Conversation operations
  getConversationsByConnectionId(connectionId: string): Promise<Conversation[]>;
  getRecentConversationRecoveryState(connectionId: string, since: Date): Promise<ConversationRecoveryState[]>;
  getConversationStatsCount(connectionId: string): Promise<{ total: number; unread: number }>;
  getConversationByContactNumber(connectionId: string, contactNumber: string): Promise<Conversation | undefined>;
  getActiveConversationByContactNumber(connectionId: string, contactNumber: string): Promise<Conversation | undefined>;
  findConversationByIdentity(
    connectionId: string,
    params: {
      contactNumber?: string | null;
      remoteJid?: string | null;
      activeOnly?: boolean;
    },
  ): Promise<Conversation | undefined>;
  findAdminMirrorConversationForConnection(
    connectionId: string,
    contactNumber: string,
  ): Promise<{ adminConversationId: string; adminId: string } | null>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, data: Partial<InsertConversation>): Promise<Conversation>;
  clearConversationOperationalHistory(conversationId: string): Promise<void>;

  // Message operations
  getMessagesByConversationId(conversationId: string): Promise<Message[]>;
  getLastMessageByConversationId(
    conversationId: string,
  ): Promise<Pick<Message, "id" | "fromMe" | "text" | "timestamp"> | undefined>;
  getMessagesByConversationIdPaginated(conversationId: string, limit?: number, before?: Date): Promise<{ messages: Message[]; hasMore: boolean }>;
  getMessagesByConversationIdAfter(conversationId: string, after: Date, limit?: number): Promise<Message[]>;
  getMessage(id: string): Promise<Message | undefined>;
  getMessageByMessageId(messageId: string): Promise<Message | undefined>;
  getMessageByConversationAndMessageId(conversationId: string, messageId: string): Promise<Message | undefined>;
  getAdminMessageByMessageId(messageId: string): Promise<any | undefined>;
  getLastAdminMessageByConversationId(
    conversationId: string,
  ): Promise<{ id: string; fromMe: boolean; text: string | null; timestamp: Date } | undefined>;
  deleteMessagesByConversationId(conversationId: string): Promise<void>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateAdminMessage(id: string, data: Partial<{
    text: string;
    status: string;
    mediaType: string;
    mediaUrl: string;
    mediaMimeType: string;
    mediaCaption: string;
    timestamp: Date;
  }>): Promise<any>;
  getTodayMessagesCount(connectionId: string): Promise<number>;
  getAgentMessagesCount(connectionId: string): Promise<number>;

  // AI Agent operations (legacy)
  getAgentConfig(userId: string): Promise<AiAgentConfig | undefined>;
  upsertAgentConfig(userId: string, data: Partial<InsertAiAgentConfig>): Promise<AiAgentConfig>;
  updateAgentConfig(userId: string, data: Partial<InsertAiAgentConfig>): Promise<AiAgentConfig | undefined>;
  
  // Business Agent operations (new advanced system)
  getBusinessAgentConfig(userId: string): Promise<BusinessAgentConfig | undefined>;
  upsertBusinessAgentConfig(userId: string, data: Partial<InsertBusinessAgentConfig>): Promise<BusinessAgentConfig>;
  deleteBusinessAgentConfig(userId: string): Promise<void>;
  
  // Agent conversation control
  isAgentDisabledForConversation(conversationId: string): Promise<boolean>;
  getDisabledConversationIds(conversationIds: string[]): Promise<string[]>;
  disableAgentForConversation(conversationId: string, autoReactivateAfterMinutes?: number | null): Promise<void>;
  enableAgentForConversation(conversationId: string): Promise<void>;
  updateDisabledConversationOwnerReply(conversationId: string, autoReactivateAfterMinutes?: number | null): Promise<void>;
  markClientPendingMessage(conversationId: string): Promise<void>;
  getConversationsToAutoReactivate(): Promise<Array<{ conversationId: string; clientLastMessageAt: Date | null; clientHasPendingMessage: boolean }>>;
  getDisabledConversationDetails(conversationId: string): Promise<{ ownerLastReplyAt: Date | null; autoReactivateAfterMinutes: number | null; clientHasPendingMessage: boolean } | null>;

  // Plan operations
  getAllPlans(): Promise<Plan[]>;
  getActivePlans(): Promise<Plan[]>;
  getPublicCatalogPlans(): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | undefined>;
  getPlanBySlug(slug: string): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, data: Partial<InsertPlan>): Promise<Plan>;
  deletePlan(id: string): Promise<void>;

  // Coupon operations
  getCouponByCode(code: string): Promise<Coupon | undefined>;
  getAllCoupons(): Promise<Coupon[]>;
  createCoupon(coupon: InsertCoupon): Promise<Coupon>;
  updateCoupon(id: string, data: Partial<InsertCoupon>): Promise<Coupon>;
  deleteCoupon(id: string): Promise<void>;
  incrementCouponUsage(id: string): Promise<void>;

  // Subscription operations
  getSubscription(id: string): Promise<(Subscription & { plan: Plan }) | undefined>;
  getUserSubscription(userId: string): Promise<(Subscription & { plan: Plan }) | undefined>;
  getAllSubscriptions(): Promise<(Subscription & { plan: Plan; user: User })[]>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription>;

  // Payment operations (legacy - Pix)
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentBySubscriptionId(subscriptionId: string): Promise<Payment | undefined>;
  getPendingPayments(): Promise<(Payment & { subscription: Subscription & { user: User; plan: Plan } })[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment>;

  // Payment History operations (MercadoPago, etc)
  createPaymentHistory(payment: Partial<InsertPaymentHistory>): Promise<PaymentHistory>;
  getPaymentHistory(id: string): Promise<PaymentHistory | undefined>;
  getPaymentHistoryByMpPaymentId(mpPaymentId: string): Promise<PaymentHistory | undefined>;
  getPaymentHistoryBySubscription(subscriptionId: string): Promise<PaymentHistory[]>;
  getPaymentHistoryByUser(userId: string): Promise<PaymentHistory[]>;
  getAllPaymentHistory(): Promise<(PaymentHistory & { subscription?: Subscription; user?: User })[]>;
  updatePaymentHistory(id: string, data: Partial<InsertPaymentHistory>): Promise<PaymentHistory>;

  // System config operations
  getSystemConfig(key: string): Promise<SystemConfig | undefined>;
  getSystemConfigs(keys: string[]): Promise<Map<string, string>>;
  updateSystemConfig(key: string, value: string): Promise<SystemConfig>;

  // Admin operations
  getAdminById(id: string): Promise<any | undefined>;
  getAdminByEmail(email: string): Promise<any | undefined>;
  getAllAdmins(): Promise<any[]>;

  // Admin WhatsApp connection operations
  getAdminWhatsappConnection(adminId: string): Promise<AdminWhatsappConnection | undefined>;
  getAdminConnection(): Promise<AdminWhatsappConnection | undefined>; // Added this
  createAdminWhatsappConnection(connection: InsertAdminWhatsappConnection): Promise<AdminWhatsappConnection>;
  updateAdminWhatsappConnection(adminId: string, data: Partial<InsertAdminWhatsappConnection>): Promise<AdminWhatsappConnection>;

  // Safe test account reset with optional forced delete for admin workflows
  resetTestAccountSafely(
    phoneNumber: string,
    options?: { forceAnyAccount?: boolean }
  ): Promise<{ 
    success: boolean; 
    error?: string;
    result?: any;
  }>;

  // Admin stats
  getAllUsers(): Promise<User[]>;
  getTotalRevenue(): Promise<number>;
  getActiveSubscriptionsCount(): Promise<number>;
  getAdminBusinessDashboardReport(): Promise<AdminBusinessDashboardReport>;

  // WhatsApp Contacts operations (FIX LID 2025)
  upsertContact(contact: InsertWhatsappContact): Promise<WhatsappContact>;
  batchUpsertContacts(contacts: InsertWhatsappContact[]): Promise<void>;
  getContactByLid(lid: string, connectionId: string): Promise<WhatsappContact | undefined>;
  getContactById(contactId: string, connectionId: string): Promise<WhatsappContact | undefined>;
  getContactsByConnectionId(connectionId: string): Promise<WhatsappContact[]>;
  deleteOldContacts(daysOld: number): Promise<number>;

  // Campaign operations (in-memory for now)
  getCampaigns?(userId: string): Promise<any[]>;
  getCampaign?(userId: string, id: string): Promise<any | undefined>;
  createCampaign?(campaign: any): Promise<any>;
  updateCampaign?(userId: string, id: string, data: any): Promise<any>;
  deleteCampaign?(userId: string, id: string): Promise<void>;
  
  // Contact List operations (in-memory for now)
  getContactLists?(userId: string): Promise<any[]>;
  getContactList?(userId: string, id: string): Promise<any | undefined>;
  createContactList?(list: any): Promise<any>;
  updateContactList?(userId: string, id: string, data: any): Promise<any>;
  deleteContactList?(userId: string, id: string): Promise<void>;
  addContactsToList?(userId: string, listId: string, contacts: any[]): Promise<any>;
  removeContactFromList?(userId: string, listId: string, phone: string): Promise<any>;
  getSyncedContacts?(userId: string): Promise<any[]>;
  saveSyncedContacts?(userId: string, contacts: any[]): Promise<void>;
  getUserActiveConnection?(userId: string): Promise<any | undefined>;
  
  // Media flow operations
  getMediaFlows(): Promise<MediaFlow[]>;
  getMediaFlow(id: string): Promise<MediaFlow | undefined>;
  createMediaFlow(data: InsertMediaFlow): Promise<MediaFlow>;
  updateMediaFlow(id: string, data: Partial<InsertMediaFlow>): Promise<MediaFlow>;
  deleteMediaFlow(id: string): Promise<void>;
  getMediaFlowItems(flowId: string): Promise<MediaFlowItem[]>;
  createMediaFlowItem(data: InsertMediaFlowItem): Promise<MediaFlowItem>;
  updateMediaFlowItem(id: string, data: Partial<InsertMediaFlowItem>): Promise<MediaFlowItem>;
  deleteMediaFlowItem(id: string): Promise<void>;
  reorderMediaFlowItems(flowId: string, orderedIds: string[]): Promise<void>;

  // Share token and message update operations
  getConversationByShareToken(shareToken: string): Promise<Conversation | undefined>;
  updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message>;
  
  // Admin Notification operations
  getAdminNotificationConfig?(adminId: string): Promise<any | undefined>;
  updateAdminNotificationConfig?(adminId: string, data: any): Promise<void>;
  getAdminBroadcasts?(adminId: string): Promise<any[]>;
  getRunningAdminBroadcasts?(): Promise<any[]>;
  getAdminBroadcast?(adminId: string, id: string): Promise<any | undefined>;
  createAdminBroadcast?(data: any): Promise<string>;
  updateAdminBroadcast?(adminId: string, id: string, data: any): Promise<void>;
  cancelAdminBroadcast?(adminId: string, id: string): Promise<void>;
  createAdminNotificationLog?(data: any): Promise<string>;
  createBroadcastMessage?(data: any): Promise<string>;
  getBroadcastMessages?(broadcastId: string): Promise<any[]>;
  
  // Pending AI Responses (persistent timers)
  savePendingAIResponse(data: {
    conversationId: string;
    userId: string;
    contactNumber: string;
    jidSuffix: string;
    messages: string[];
    executeAt: Date;
  }): Promise<void>;
  getPendingAIResponse(conversationId: string): Promise<{
    id: string;
    conversationId: string;
    userId: string;
    contactNumber: string;
    jidSuffix: string;
    messages: string[];
    executeAt: Date;
    status: string;
    retryCount: number;
    lastError?: string | null;
  } | null>;
  updatePendingAIResponseMessages(
    conversationId: string,
    messages: string[],
    executeAt: Date,
    options?: { resetRetry?: boolean },
  ): Promise<void>;
  replacePendingAIResponseMessages(conversationId: string, messages: string[]): Promise<void>;
  deletePendingAIResponse(conversationId: string): Promise<void>;
  getPendingAIResponsesForRestore(): Promise<Array<{
    id: string;
    conversationId: string;
    userId: string;
    connectionId?: string;
    contactNumber: string;
    jidSuffix: string;
    messages: string[];
    executeAt: Date;
    scheduledAt: Date;
    retryCount: number;
    lastError?: string | null;
  }>>;
  markPendingAIResponseCompleted(conversationId: string, guard?: PendingAIResponseMutationGuard): Promise<void>;
  markPendingAIResponseFailed(conversationId: string, reason: string, lastError?: string, guard?: PendingAIResponseMutationGuard): Promise<void>;
  resetPendingAIResponseForRetry(conversationId: string, delaySec?: number, guard?: PendingAIResponseMutationGuard): Promise<void>;
  getCompletedTimersWithoutResponse(): Promise<Array<{
    conversationId: string;
    userId: string;
    contactNumber: string;
    jidSuffix: string;
    messages: string[];
  }>>;
}

// In-memory storage for campaigns and contact lists
const campaignsStore: Map<string, any[]> = new Map();
const contactListsStore: Map<string, any[]> = new Map();
const syncedContactsStore: Map<string, any[]> = new Map();

function unwrapDbError(error: any): any {
  if (!error || typeof error !== "object") return error;
  return error.cause && typeof error.cause === "object" ? error.cause : error;
}

function getDbErrorCode(error: any): string | undefined {
  const directCode = error?.code;
  if (typeof directCode === "string" && directCode.length > 0) return directCode;
  const wrappedCode = error?.cause?.code;
  if (typeof wrappedCode === "string" && wrappedCode.length > 0) return wrappedCode;
  return undefined;
}

function getDbConstraintName(error: any): string | undefined {
  const directConstraint = error?.constraint;
  if (typeof directConstraint === "string" && directConstraint.length > 0) return directConstraint;
  const wrappedConstraint = error?.cause?.constraint;
  if (typeof wrappedConstraint === "string" && wrappedConstraint.length > 0) return wrappedConstraint;
  return undefined;
}

function getDbErrorMessage(error: any): string {
  const raw = error?.message || error?.cause?.message || "";
  return typeof raw === "string" ? raw : "";
}

function isPendingAiSkippedConstraintError(error: any): boolean {
  const normalized = unwrapDbError(error);
  const code = getDbErrorCode(normalized);
  const constraint = getDbConstraintName(normalized)?.toLowerCase() || "";
  const message = getDbErrorMessage(normalized).toLowerCase();

  if (code === "23514") return true;
  if (constraint.includes("pending_ai_responses_status_check")) return true;
  return (
    message.includes("pending_ai_responses_status_check") ||
    (message.includes("violates check constraint") && message.includes("pending_ai_responses"))
  );
}

export type PendingAIResponseMutationGuard = {
  expectedMessages?: string[];
  notUpdatedAfter?: Date;
};

function buildPendingAIResponseMutationGuard(guard?: PendingAIResponseMutationGuard) {
  return sql`
    ${guard?.expectedMessages ? sql`AND messages = ${JSON.stringify(guard.expectedMessages)}::jsonb` : sql``}
    ${guard?.notUpdatedAfter ? sql`AND updated_at <= ${guard.notUpdatedAfter.toISOString()}::timestamptz` : sql``}
  `;
}

export class DatabaseStorage implements IStorage {
  private pendingAiSkippedUnsupported = false;

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    // Busca por telefone exato ou com variações (com/sem +)
    const cleanPhone = phone.replace(/\D/g, "");
    const phoneWithPlus = "+" + cleanPhone;
    
    const [user] = await db.select().from(users).where(
      sql`${users.phone} = ${phoneWithPlus} OR ${users.phone} = ${cleanPhone} OR REPLACE(${users.phone}, '+', '') = ${cleanPhone}`
    );
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .orderBy(
        desc(sql`CASE WHEN COALESCE(${users.phone}, '') <> '' OR COALESCE(${users.whatsappNumber}, '') <> '' THEN 1 ELSE 0 END`),
        desc(users.updatedAt),
        desc(users.createdAt),
      )
      .limit(1);
    return user;
  }

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User> {
    await db.update(users).set(data).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Upsert simples por ID - telefone pode ser duplicado
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Delete user and all related data (cascade)
  private quotePgIdentifier(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
  }

  private buildQualifiedTableName(tableName: string, schemaName: string = "public"): string {
    return `${this.quotePgIdentifier(schemaName)}.${this.quotePgIdentifier(tableName)}`;
  }

  private async getForeignKeyReferencesToTable(
    tx: any,
    tableName: string,
    schemaName: string = "public",
  ): Promise<Array<{ schemaName: string; tableName: string; columnName: string }>> {
    const result = await tx.execute(sql`
      select
        child_ns.nspname as schema_name,
        child.relname as table_name,
        child_col.attname as column_name
      from pg_constraint c
      join pg_class child on child.oid = c.conrelid
      join pg_namespace child_ns on child_ns.oid = child.relnamespace
      join unnest(c.conkey) with ordinality as cols(attnum, ord) on true
      join pg_attribute child_col on child_col.attrelid = c.conrelid and child_col.attnum = cols.attnum
      where c.contype = 'f'
        and child_ns.nspname = ${schemaName}
        and c.confrelid = to_regclass(${`${schemaName}.${tableName}`})
      order by child.relname, child_col.attname
    `);

    return (((result as any)?.rows || []) as Array<any>).map((row) => ({
      schemaName: String(row?.schema_name || schemaName),
      tableName: String(row?.table_name || ""),
      columnName: String(row?.column_name || ""),
    })).filter((row) => row.tableName && row.columnName);
  }

  private async getSinglePrimaryKeyColumn(tx: any, tableName: string, schemaName: string = "public"): Promise<string | null> {
    const result = await tx.execute(sql`
      select att.attname as column_name
      from pg_index idx
      join pg_class tbl on tbl.oid = idx.indrelid
      join pg_namespace ns on ns.oid = tbl.relnamespace
      join unnest(idx.indkey) with ordinality as cols(attnum, ord) on true
      join pg_attribute att on att.attrelid = idx.indrelid and att.attnum = cols.attnum
      where idx.indisprimary
        and ns.nspname = ${schemaName}
        and tbl.relname = ${tableName}
      order by cols.ord
    `);

    const rows = (((result as any)?.rows || []) as Array<any>)
      .map((row) => String(row?.column_name || ""))
      .filter(Boolean);

    return rows.length === 1 ? rows[0] : null;
  }

  private async deleteRowsByForeignKey(
    tx: any,
    reference: { schemaName: string; tableName: string; columnName: string },
    parentIds: Array<string | number>,
  ): Promise<void> {
    if (parentIds.length === 0) return;

    const uniqueParentIds = Array.from(new Set(parentIds.filter((value) => value !== null && value !== undefined)));
    if (uniqueParentIds.length === 0) return;

    const primaryKeyColumn = await this.getSinglePrimaryKeyColumn(tx, reference.tableName, reference.schemaName);

    if (primaryKeyColumn) {
      const childIdRows = await tx.execute(sql`
        select ${sql.raw(this.quotePgIdentifier(primaryKeyColumn))} as id
        from ${sql.raw(this.buildQualifiedTableName(reference.tableName, reference.schemaName))}
        where ${sql.raw(this.quotePgIdentifier(reference.columnName))} in (${sql.join(
          uniqueParentIds.map((value) => sql`${value}`),
          sql`, `,
        )})
      `);

      const childIds = Array.from(
        new Set(
          (((childIdRows as any)?.rows || []) as Array<any>)
            .map((row) => row?.id)
            .filter((value) => value !== null && value !== undefined),
        ),
      );

      if (childIds.length > 0) {
        await this.deleteCascadeByIds(tx, reference.tableName, childIds, reference.schemaName);
      }
    }

    await tx.execute(sql`
      delete from ${sql.raw(this.buildQualifiedTableName(reference.tableName, reference.schemaName))}
      where ${sql.raw(this.quotePgIdentifier(reference.columnName))} in (${sql.join(
        uniqueParentIds.map((value) => sql`${value}`),
        sql`, `,
      )})
    `);
  }

  private async deleteCascadeByIds(
    tx: any,
    tableName: string,
    ids: Array<string | number>,
    schemaName: string = "public",
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(ids.filter((value) => value !== null && value !== undefined)));
    if (uniqueIds.length === 0) return;

    const references = await this.getForeignKeyReferencesToTable(tx, tableName, schemaName);
    for (const reference of references) {
      await this.deleteRowsByForeignKey(tx, reference, uniqueIds);
    }

    await tx.execute(sql`
      delete from ${sql.raw(this.buildQualifiedTableName(tableName, schemaName))}
      where ${sql.raw(this.quotePgIdentifier("id"))} in (${sql.join(
        uniqueIds.map((value) => sql`${value}`),
        sql`, `,
      )})
    `);
  }

  private async cleanupSupabaseAuthUsers(userId: string, authEmails: Set<string>): Promise<void> {
    if (authEmails.size === 0) return;

    try {
      const attemptedAuthIds = new Set<string>();
      attemptedAuthIds.add(String(userId));

      const { error: deleteByIdError } = await supabase.auth.admin.deleteUser(String(userId));
      if (deleteByIdError) {
        console.warn(`[STORAGE] Falha ao excluir Auth por user.id ${userId}: ${deleteByIdError.message}`);
      } else {
        console.log(`[STORAGE] Usu�rio Auth exclu�do por user.id: ${userId}`);
      }

      const { data, error } = await supabase.auth.admin.listUsers();
      if (error) {
        console.warn(`[STORAGE] Falha ao listar usu�rios no Auth: ${error.message}`);
        return;
      }

      const authUsers = Array.isArray((data as any)?.users) ? (data as any).users : [];
      for (const authUser of authUsers) {
        if (attemptedAuthIds.has(String(authUser?.id || ""))) continue;

        const authEmail = String(authUser?.email || "").toLowerCase();
        if (!authEmail || !authEmails.has(authEmail)) continue;

        const { error: deleteError } = await supabase.auth.admin.deleteUser(authUser.id);
        if (deleteError) {
          console.warn(`[STORAGE] Falha ao excluir Auth ${authEmail}: ${deleteError.message}`);
        } else {
          console.log(`[STORAGE] Usu�rio Auth exclu�do: ${authEmail}`);
        }
      }
    } catch (authCleanupError) {
      console.warn(`[STORAGE] Erro ao limpar Auth do Supabase:`, authCleanupError);
    }
  }

  async deleteUser(id: string): Promise<void> {
    console.log(`[STORAGE] Deleting user ${id} and all related data...`);

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      console.log(`[STORAGE] User ${id} not found, nothing to delete`);
      return;
    }

    const authEmails = new Set<string>();
    if (user.email) {
      authEmails.add(String(user.email).toLowerCase());
    }

    await db.transaction(async (tx) => {
      const cleanPhone = normalizePhoneToDigits(user.phone || "");
      if (cleanPhone) {
        const adminConversationRows = await tx
          .select({ id: adminConversations.id })
          .from(adminConversations)
          .where(and(
            eq(adminConversations.contactNumber, cleanPhone),
            adminConversationIsVisibleCondition(),
          ));

        const adminConversationIds = Array.from(
          new Set(adminConversationRows.map((row) => row.id).filter(Boolean)),
        );

        if (adminConversationIds.length > 0) {
          await this.deleteCascadeByIds(tx, "admin_conversations", adminConversationIds);
        }
      }

      await this.deleteCascadeByIds(tx, "users", [id]);
    });

    await this.cleanupSupabaseAuthUsers(id, authEmails);

    console.log(`[STORAGE] User ${id} and all related data deleted successfully`);
  }

  // Agent operations
  async getAgents(): Promise<Agent[]> {
    const agentsList = await db
      .select()
      .from(agents)
      .orderBy(desc(agents.createdAt));
    return agentsList;
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);
    return agent;
  }

  async createAgent(data: InsertAgent): Promise<Agent> {
    const [agent] = await db
      .insert(agents)
      .values(data)
      .returning();
    return agent;
  }

  async updateAgent(id: string, data: Partial<InsertAgent>): Promise<Agent> {
    const [agent] = await db
      .update(agents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning();
    return agent;
  }

  async deleteAgent(id: string): Promise<void> {
    await db.delete(agents).where(eq(agents.id, id));
  }

  // WhatsApp connection operations
  // FIX: Priorizar conexão primária/conectada em vez de apenas a mais recente
  // Isso evita que conexões secundárias recém-criadas "roubem" a sessão principal
  async getConnectionByUserId(userId: string, connectionId?: string): Promise<WhatsappConnection | undefined> {
    // ⚡ CACHE: Connection ownership muda raramente - cache por 5 min
    const cacheKey = connectionId 
      ? `connByUser:${userId}:${connectionId}` 
      : `connByUser:${userId}`;
    return memoryCache.getOrCompute(cacheKey, async () => {
      // 0. Se um connectionId específico foi passado, retornar essa conexão (se pertence ao user)
      if (connectionId) {
        const [specific] = await db
          .select()
          .from(whatsappConnections)
          .where(and(
            eq(whatsappConnections.id, connectionId),
            eq(whatsappConnections.userId, userId)
          ))
          .limit(1);
        if (specific) return specific;
      }

      // 1. PRIMARY + CONNECTED tem prioridade máxima (conexão principal ativa)
      const allConnections = await db
        .select()
        .from(whatsappConnections)
        .where(eq(whatsappConnections.userId, userId))
        .orderBy(whatsappConnections.createdAt);
      const visibleConnections = allConnections.filter(
        (connection) => !isInternalOnlySimulatorConnection(connection),
      );

      const primaryConnected = visibleConnections.find(
        (connection) => connection.isConnected === true && connection.isPrimary === true,
      );
      if (primaryConnected) return primaryConnected;

      // 2. Qualquer conexão conectada (mais antiga primeiro = original)
      const connectedConn = visibleConnections.find(
        (connection) => connection.isConnected === true,
      );
      if (connectedConn) return connectedConn;

      // 3. Se nenhuma está conectada, buscar a primary
      const primaryConn = visibleConnections.find(
        (connection) => connection.isPrimary === true,
      );
      if (primaryConn) return primaryConn;

      // 4. Fallback: qualquer conexão (mais antiga primeiro = original)
      return visibleConnections[0];
    }, 30000); // 30s cache
  }

  async getConnectionById(connectionId: string): Promise<WhatsappConnection | undefined> {
    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, connectionId))
      .limit(1);
    return connection;
  }

  async getAdminConnection(): Promise<AdminWhatsappConnection | undefined> {
    const [connection] = await db
      .select()
      .from(adminWhatsappConnection)
      .limit(1);
    return connection;
  }

  async getAllConnections(): Promise<WhatsappConnection[]> {
    const connections = await withRetry(() =>
      db
        .select()
        .from(whatsappConnections)
        .orderBy(desc(whatsappConnections.createdAt))
    );
    return connections;
  }

  // Retorna UMA conexão por userId (a principal/conectada), para uso em
  // restoreExistingSessions e healthCheck — evita duplicatas e loops
  async getPrimaryConnectionPerUser(): Promise<WhatsappConnection[]> {
    const allConnections = await this.getAllConnections();
    const seen = new Map<string, WhatsappConnection>();
    for (const conn of allConnections) {
      if (!conn.userId) continue;
      if (isInternalOnlySimulatorConnection(conn)) continue;
      const existing = seen.get(conn.userId);
      if (!existing) {
        seen.set(conn.userId, conn);
      } else {
        // Prioridade: conectado > primary > mais antigo
        if (conn.isConnected && !existing.isConnected) {
          seen.set(conn.userId, conn);
        } else if (!existing.isConnected && !conn.isConnected && conn.isPrimary && !existing.isPrimary) {
          seen.set(conn.userId, conn);
        }
      }
    }
    return Array.from(seen.values());
  }

  async createConnection(connectionData: InsertWhatsappConnection): Promise<WhatsappConnection> {
    const [connection] = await db
      .insert(whatsappConnections)
      .values(connectionData)
      .returning();
    memoryCache.invalidate(`connByUser:${connection.userId}`);
    memoryCache.invalidate(`api:wa-conn:${connection.userId}`);
    memoryCache.invalidate(`api:wa-conn:${connection.userId}:default`);
    return connection;
  }

  async updateConnection(id: string, data: Partial<InsertWhatsappConnection>): Promise<WhatsappConnection> {
    const [connection] = await db
      .update(whatsappConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(whatsappConnections.id, id))
      .returning();
    memoryCache.invalidate(`connByUser:${connection.userId}`);
    memoryCache.invalidate(`api:wa-conn:${connection.userId}`);
    memoryCache.invalidate(`api:wa-conn:${connection.userId}:default`);
    return connection;
  }

  async deleteConnection(id: string): Promise<void> {
    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, id))
      .limit(1);
    await db.delete(whatsappConnections).where(eq(whatsappConnections.id, id));
    if (connection?.userId) {
      memoryCache.invalidate(`connByUser:${connection.userId}`);
      memoryCache.invalidate(`api:wa-conn:${connection.userId}`);
      memoryCache.invalidate(`api:wa-conn:${connection.userId}:default`);
    }
  }

  // Multi-connection: get all connections for a user
  async getConnectionsByUserId(userId: string): Promise<WhatsappConnection[]> {
    return await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.userId, userId))
      .orderBy(desc(whatsappConnections.createdAt));
  }

  // Connection Agents (many-to-many) CRUD
  async getConnectionAgents(connectionId: string): Promise<ConnectionAgent[]> {
    return await db
      .select()
      .from(connectionAgents)
      .where(eq(connectionAgents.connectionId, connectionId))
      .orderBy(desc(connectionAgents.assignedAt));
  }

  async getAgentConnections(agentId: string): Promise<ConnectionAgent[]> {
    return await db
      .select()
      .from(connectionAgents)
      .where(eq(connectionAgents.agentId, agentId))
      .orderBy(desc(connectionAgents.assignedAt));
  }

  async addConnectionAgent(data: InsertConnectionAgent): Promise<ConnectionAgent> {
    const [record] = await db
      .insert(connectionAgents)
      .values(data)
      .onConflictDoUpdate({
        target: [connectionAgents.connectionId, connectionAgents.agentId],
        set: { isActive: data.isActive ?? true, assignedBy: data.assignedBy },
      })
      .returning();
    return record;
  }

  async removeConnectionAgent(connectionId: string, agentId: string): Promise<void> {
    await db.delete(connectionAgents).where(
      and(
        eq(connectionAgents.connectionId, connectionId),
        eq(connectionAgents.agentId, agentId),
      ),
    );
  }

  async updateConnectionAgent(connectionId: string, agentId: string, data: { isActive?: boolean }): Promise<ConnectionAgent> {
    const [record] = await db
      .update(connectionAgents)
      .set(data)
      .where(and(
        eq(connectionAgents.connectionId, connectionId),
        eq(connectionAgents.agentId, agentId),
      ))
      .returning();
    return record;
  }

  // Connection Members CRUD
  async getConnectionMembers(connectionId: string): Promise<ConnectionMember[]> {
    return await db
      .select()
      .from(connectionMembers)
      .where(eq(connectionMembers.connectionId, connectionId))
      .orderBy(desc(connectionMembers.assignedAt));
  }

  async addConnectionMember(data: InsertConnectionMember): Promise<ConnectionMember> {
    const [record] = await db
      .insert(connectionMembers)
      .values(data)
      .onConflictDoUpdate({
        target: [connectionMembers.connectionId, connectionMembers.memberId],
        set: { canView: data.canView, canRespond: data.canRespond, canManage: data.canManage },
      })
      .returning();
    return record;
  }

  async removeConnectionMember(connectionId: string, memberId: string): Promise<void> {
    await db.delete(connectionMembers).where(
      and(
        eq(connectionMembers.connectionId, connectionId),
        eq(connectionMembers.memberId, memberId),
      ),
    );
  }

  async updateConnectionMember(connectionId: string, memberId: string, data: { canView?: boolean; canRespond?: boolean; canManage?: boolean }): Promise<ConnectionMember> {
    const [record] = await db
      .update(connectionMembers)
      .set(data)
      .where(and(
        eq(connectionMembers.connectionId, connectionId),
        eq(connectionMembers.memberId, memberId),
      ))
      .returning();
    return record;
  }

  // Conversation operations
  async getConversationsByConnectionId(connectionId: string): Promise<Conversation[]> {
    return await db
      .select()
      .from(conversations)
      .where(eq(conversations.connectionId, connectionId))
      .orderBy(sql`${conversations.lastMessageTime} DESC NULLS LAST`);
  }

  async getRecentConversationRecoveryState(
    connectionId: string,
    since: Date,
  ): Promise<ConversationRecoveryState[]> {
    const rows = await db
      .select({
        id: conversations.id,
        contactNumber: conversations.contactNumber,
        jidSuffix: conversations.jidSuffix,
        lastMessageText: conversations.lastMessageText,
        lastMessageTime: conversations.lastMessageTime,
        lastMessageFromMe: conversations.lastMessageFromMe,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.connectionId, connectionId),
          gte(conversations.lastMessageTime, since),
          or(eq(conversations.isClosed, false), isNull(conversations.isClosed)),
        ),
      )
      .orderBy(sql`${conversations.lastMessageTime} ASC NULLS LAST`);

    return rows;
  }

  // 🔥 OTIMIZADO: Retorna apenas COUNT e SUM ao invés de carregar 20k+ rows
  async getConversationStatsCount(connectionId: string): Promise<{ total: number; unread: number }> {
    const cacheKey = `convStats:${connectionId}`;
    const cached = memoryCache.get<{ total: number; unread: number }>(cacheKey);
    if (cached !== null) return cached;

    const result = await db
      .select({
        total: sql<number>`count(*)::int`,
        unread: sql<number>`coalesce(sum("unread_count"), 0)::int`,
      })
      .from(conversations)
      .where(eq(conversations.connectionId, connectionId));

    const stats = { total: result[0]?.total || 0, unread: result[0]?.unread || 0 };
    memoryCache.set(cacheKey, stats, 30000); // Cache 30s
    return stats;
  }

  async getConversationByContactNumber(
    connectionId: string,
    contactNumber: string
  ): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.connectionId, connectionId),
          eq(conversations.contactNumber, contactNumber)
        )
      );
    return conversation;
  }
  // FIX Encerramento: retorna apenas conversas ativas (nao fechadas) pelo numero do contato
  async getActiveConversationByContactNumber(
    connectionId: string,
    contactNumber: string
  ): Promise<Conversation | undefined> {
    // FIX: Handle NULL is_closed (treat as open) and order by DESC to get newest
    const result = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.connectionId, connectionId),
          eq(conversations.contactNumber, contactNumber),
          or(eq(conversations.isClosed, false), isNull(conversations.isClosed))
        )
      )
      .orderBy(desc(conversations.updatedAt))
      .limit(1);
    return result[0];
  }

  async findConversationByIdentity(
    connectionId: string,
    params: {
      contactNumber?: string | null;
      remoteJid?: string | null;
      activeOnly?: boolean;
    },
  ): Promise<Conversation | undefined> {
    const numberCandidates = buildBrazilWhatsAppPhoneVariants(
      params.contactNumber || params.remoteJid || "",
    );
    const jidCandidates = new Set<string>();
    const normalizedRemoteJid = String(params.remoteJid || "").trim();

    if (normalizedRemoteJid) {
      jidCandidates.add(normalizedRemoteJid);
    }

    for (const candidate of numberCandidates) {
      const jid = buildWhatsAppJidFromPhone(candidate);
      if (jid) {
        jidCandidates.add(jid);
      }
    }

    const identityClauses = [];
    if (numberCandidates.length > 0) {
      identityClauses.push(inArray(conversations.contactNumber, numberCandidates));
    }
    if (jidCandidates.size > 0) {
      identityClauses.push(inArray(conversations.remoteJid, Array.from(jidCandidates)));
    }

    if (identityClauses.length === 0) {
      return undefined;
    }

    const filters = [
      eq(conversations.connectionId, connectionId),
      or(...identityClauses),
    ];

    if (params.activeOnly) {
      filters.push(or(eq(conversations.isClosed, false), isNull(conversations.isClosed)));
    }

    const rows = await db
      .select()
      .from(conversations)
      .where(and(...filters))
      .orderBy(
        desc(conversations.lastMessageTime),
        desc(conversations.updatedAt),
        desc(conversations.createdAt),
      )
      .limit(1);

    return rows[0];
  }

  async findAdminMirrorConversationForConnection(
    connectionId: string,
    contactNumber: string,
  ): Promise<{ adminConversationId: string; adminId: string } | null> {
    const [result] = await db
      .select({
        adminConversationId: adminConversations.id,
        adminId: adminConversations.adminId,
      })
      .from(whatsappConnections)
      .innerJoin(
        adminWhatsappConnection,
        eq(adminWhatsappConnection.phoneNumber, whatsappConnections.phoneNumber),
      )
      .innerJoin(
        adminConversations,
        and(
          eq(adminConversations.adminId, adminWhatsappConnection.adminId),
          eq(adminConversations.contactNumber, contactNumber),
          adminConversationIsVisibleCondition(),
        ),
      )
      .where(
        and(
          eq(whatsappConnections.id, connectionId),
          isNotNull(whatsappConnections.phoneNumber),
        ),
      )
      .limit(1);

    return result ?? null;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    // ⚡ CACHE: Conversation metadata por 30s (ownership check frequente)
    return memoryCache.getOrCompute(`conv:${id}`, async () => {
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, id));
      return conversation;
    }, 30000);
  }

  private invalidateConversationListCaches(connectionId?: string | null): void {
    if (!connectionId) return;
    memoryCache.invalidate(`convWithTags:${connectionId}`);
    memoryCache.invalidate(`convCount:${connectionId}`);
    memoryCache.invalidate(`convStats:${connectionId}`);
  }

  async createConversation(conversationData: InsertConversation): Promise<Conversation> {
    // FIX DUPLICATAS: Antes de inserir, verificar se já existe conversa ativa para o mesmo contato
    if (conversationData.connectionId && (conversationData.contactNumber || conversationData.remoteJid)) {
      const existing = await this.findConversationByIdentity(conversationData.connectionId, {
        contactNumber: conversationData.contactNumber,
        remoteJid: conversationData.remoteJid,
        activeOnly: true,
      });
      if (existing) {
        console.log(`⚠️ [STORAGE] Conversa ativa já existe para ${conversationData.contactNumber || conversationData.remoteJid} (${existing.id}), retornando existente em vez de duplicar`);
        // Atualizar dados da conversa existente se necessário
        const updated = await this.updateConversation(existing.id, {
          contactNumber: conversationData.contactNumber || existing.contactNumber,
          remoteJid: conversationData.remoteJid || existing.remoteJid,
          jidSuffix: conversationData.jidSuffix || existing.jidSuffix,
          contactName: conversationData.contactName || existing.contactName,
          contactAvatar: conversationData.contactAvatar || existing.contactAvatar,
          lastMessageText: conversationData.lastMessageText || existing.lastMessageText,
          lastMessageTime: conversationData.lastMessageTime || existing.lastMessageTime,
        });
        return updated;
      }
    }
    const [conversation] = await db
      .insert(conversations)
      .values(conversationData)
      .returning();
    this.invalidateConversationListCaches(conversation.connectionId);
    return conversation;
  }

  async updateConversation(id: string, data: Partial<InsertConversation>): Promise<Conversation> {
    // ⚡ Invalidar cache da conversa
    memoryCache.invalidate(`conv:${id}`);
    const [conversation] = await db
      .update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    this.invalidateConversationListCaches(conversation.connectionId);
    return conversation;
  }

  async clearConversationOperationalHistory(conversationId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) {
      throw new Error("Conversa não encontrada.");
    }

    memoryCache.invalidate(`conv:${conversationId}`);
    memoryCache.invalidate(`messages:${conversationId}`);

    await db.transaction(async (tx) => {
      await tx
        .delete(messages)
        .where(eq(messages.conversationId, conversationId));

      await tx
        .delete(agentDisabledConversations)
        .where(eq(agentDisabledConversations.conversationId, conversationId));

      await tx.execute(sql`DELETE FROM message_deduplication WHERE conversation_id = ${conversationId}`);
      await tx.execute(sql`DELETE FROM pending_ai_responses WHERE conversation_id = ${conversationId}`);
      await tx.execute(sql`DELETE FROM vercel_agent_response_jobs WHERE conversation_id = ${conversationId}`);
      await tx.execute(sql`DELETE FROM conversation_lead_intelligence WHERE conversation_id = ${conversationId}`);
      await tx.execute(sql`DELETE FROM estamparia_requests WHERE conversation_id = ${conversationId}`);
      await tx.execute(sql`DELETE FROM chatbot_conversation_data WHERE conversation_id = ${conversationId}`);
      await tx.execute(sql`DELETE FROM conversation_flow_states WHERE conversation_id = ${conversationId}`);

      await tx
        .update(conversations)
        .set({
          lastMessageText: null,
          lastMessageTime: null,
          lastMessageFromMe: null,
          unreadCount: 0,
          hasReplied: false,
          followupStage: 0,
          nextFollowupAt: null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));
    });

    this.invalidateConversationListCaches(conversation.connectionId);
  }

  async getConversationByShareToken(shareToken: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.shareToken, shareToken));
    return conversation;
  }

  // Message operations - OTIMIZADO para reduzir egress do Supabase
  // ⚡ CRÍTICO: NÃO retorna media_url para economizar egress massivamente!
  // media_url pode ter 50KB-500KB de base64 por mensagem!
  async getMessagesByConversationId(conversationId: string): Promise<Message[]> {
    // Verificar cache primeiro
    const cacheKey = `messages:${conversationId}`;
    const cached = memoryCache.get<Message[]>(cacheKey);
    if (cached) return cached;

    // ✅ INCLUIR mediaUrl PARA FUNCIONALIDADE CORRETA
    // Frontend precisa do mediaUrl para decidir entre mostrar player ou botão de recuperação
    const result = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        messageId: messages.messageId,
        fromMe: messages.fromMe,
        text: messages.text,
        timestamp: messages.timestamp,
        status: messages.status,
        isFromAgent: messages.isFromAgent,
        mediaType: messages.mediaType,
        mediaUrl: messages.mediaUrl, // ✅ NECESSÁRIO para mostrar player
        mediaKey: messages.mediaKey,
        directPath: messages.directPath,
        mediaMimeType: messages.mediaMimeType,
        mediaDuration: messages.mediaDuration,
        mediaCaption: messages.mediaCaption,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.timestamp);

    // Cache por 60 segundos (aumentado para reduzir queries)
    memoryCache.set(cacheKey, result as Message[], 60000);
    return result as Message[];
  }

  async getLastMessageByConversationId(
    conversationId: string,
  ): Promise<Pick<Message, "id" | "fromMe" | "text" | "timestamp"> | undefined> {
    const cacheKey = `messages:${conversationId}`;
    const cached = memoryCache.get<Message[]>(cacheKey);
    if (cached !== null) {
      return cached[cached.length - 1];
    }

    const [lastMessage] = await db
      .select({
        id: messages.id,
        fromMe: messages.fromMe,
        text: messages.text,
        timestamp: messages.timestamp,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.timestamp), desc(messages.createdAt))
      .limit(1);

    return lastMessage;
  }

  // Paginação: carrega as N mensagens mais recentes (ou antes de um cursor)
  async getMessagesByConversationIdPaginated(
    conversationId: string,
    limit: number = 50,
    before?: Date
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const fetchLimit = limit + 1; // busca 1 a mais para saber se tem mais
    const conditions = [eq(messages.conversationId, conversationId)];
    if (before) {
      conditions.push(lt(messages.timestamp, before));
    }

    const result = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        messageId: messages.messageId,
        fromMe: messages.fromMe,
        text: messages.text,
        timestamp: messages.timestamp,
        status: messages.status,
        isFromAgent: messages.isFromAgent,
        mediaType: messages.mediaType,
        mediaUrl: messages.mediaUrl,
        mediaKey: messages.mediaKey,
        directPath: messages.directPath,
        mediaMimeType: messages.mediaMimeType,
        mediaDuration: messages.mediaDuration,
        mediaCaption: messages.mediaCaption,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.timestamp))
      .limit(fetchLimit);

    const hasMore = result.length > limit;
    const page = hasMore ? result.slice(0, limit) : result;
    // Retornar em ordem cronológica (mais antiga primeiro)
    page.reverse();
    return { messages: page as Message[], hasMore };
  }

  // Busca mensagens mais recentes que uma data (para sync incremental)
  async getMessagesByConversationIdAfter(
    conversationId: string,
    after: Date,
    limit: number = 500
  ): Promise<Message[]> {
    const result = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        messageId: messages.messageId,
        fromMe: messages.fromMe,
        text: messages.text,
        timestamp: messages.timestamp,
        status: messages.status,
        isFromAgent: messages.isFromAgent,
        mediaType: messages.mediaType,
        mediaUrl: messages.mediaUrl,
        mediaKey: messages.mediaKey,
        directPath: messages.directPath,
        mediaMimeType: messages.mediaMimeType,
        mediaDuration: messages.mediaDuration,
        mediaCaption: messages.mediaCaption,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(
        eq(messages.conversationId, conversationId),
        gt(messages.timestamp, after)
      ))
      .orderBy(messages.timestamp)
      .limit(limit);

    return result as Message[];
  }

  // Nova função para buscar media_url de uma mensagem específica (lazy loading)
  async getMessageMedia(messageId: string): Promise<{ mediaUrl: string | null; mediaType: string | null } | null> {
    const [result] = await db
      .select({ 
        mediaUrl: messages.mediaUrl,
        mediaType: messages.mediaType 
      })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    return result || null;
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);

    return message;
  }

  // Atualizar mediaUrl de uma mensagem (usado para re-download de mídia)
  async updateMessageMedia(messageId: string, newMediaUrl: string): Promise<void> {
    await db
      .update(messages)
      .set({ mediaUrl: newMediaUrl })
      .where(eq(messages.messageId, messageId));
    
    // Buscar conversa para invalidar cache
    const [msg] = await db
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(eq(messages.messageId, messageId))
      .limit(1);
    
    if (msg?.conversationId) {
      memoryCache.invalidate(`messages:${msg.conversationId}`);
    }
  }

  // Versão completa com media_url - usar apenas quando REALMENTE necessário
  async getMessagesByConversationIdWithMedia(conversationId: string, limit: number = 50): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.timestamp))
      .limit(limit);
  }

  async updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message> {
    const currentMessage = await this.getMessage(id);
    const nextMediaType = data.mediaType ?? currentMessage?.mediaType ?? null;
    const nextMediaUrl = data.mediaUrl ?? currentMessage?.mediaUrl ?? null;
    const nextText =
      typeof data.text === "string"
        ? data.text
        : currentMessage?.text ?? null;
    const conversationId = data.conversationId ?? currentMessage?.conversationId;

    if (
      conversationId &&
      nextMediaType === "audio" &&
      nextMediaUrl &&
      isAudioPlaceholderText(nextText)
    ) {
      try {
        const transcription = await resolveAudioTranscriptionForMessage({
          conversationId,
          mediaType: nextMediaType,
          mediaUrl: nextMediaUrl,
        });

        if (transcription) {
          data.text = transcription;
        }
      } catch (error) {
        console.error("Error transcribing audio message in storage.updateMessage:", error);
      }
    }

    const [message] = await db
      .update(messages)
      .set(data)
      .where(eq(messages.id, id))
      .returning();
    
    // 🔥 Invalidar cache de mensagens da conversa após atualização
    if (message?.conversationId) {
      memoryCache.invalidate(`messages:${message.conversationId}`);
    }
    return message;
  }

  async getMessageByMessageId(messageId: string): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.messageId, messageId))
      .limit(1);
    return message;
  }

  async getMessageByConversationAndMessageId(
    conversationId: string,
    messageId: string,
  ): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(and(
        eq(messages.conversationId, conversationId),
        eq(messages.messageId, messageId),
      ))
      .limit(1);
    return message;
  }

  async deleteMessagesByConversationId(conversationId: string): Promise<void> {
    // 🔥 Invalidar cache antes de deletar
    memoryCache.invalidate(`messages:${conversationId}`);
    
    await db
      .delete(messages)
      .where(eq(messages.conversationId, conversationId));
  }

  async createMessage(messageData: InsertMessage): Promise<Message> {
    const data: InsertMessage = { ...messageData };

    // 🔥 CRÍTICO: Invalidar cache de mensagens da conversa ANTES de inserir
    // Isso evita o bug onde a verificação de última mensagem retorna dados desatualizados
    memoryCache.invalidate(`messages:${data.conversationId}`);

    // Transcrição automática para mensagens de áudio, independente do agente estar ativo ou não.
    // 🎤 FIX 2025: Suporta TANTO URLs base64 QUANTO URLs HTTP (Supabase Storage)
    if (data.mediaType === "audio" && data.mediaUrl) {
      try {
        const transcription = await resolveAudioTranscriptionForMessage({
          conversationId: data.conversationId,
          mediaType: data.mediaType,
          mediaUrl: data.mediaUrl,
        });

        if (transcription) {
          data.text = transcription;
        }
      } catch (error) {
        console.error("Error transcribing audio message in storage.createMessage:", error);
      }
    }

    // 🖼️ ANÁLISE AUTOMÁTICA DE IMAGENS usando Mistral Vision API
    // Quando cliente envia imagem, analisar e descrever o conteúdo para que a IA possa responder adequadamente
    if (data.mediaType === "image" && data.mediaUrl && !data.fromMe) {
      try {
        let imageUrl = data.mediaUrl;
        
        // Se for base64, precisa converter para URL ou usar direto
        // Mistral aceita tanto URL quanto base64 no formato data:image/...
        if (imageUrl.startsWith("data:")) {
          console.log(`🖼️ [Storage] Imagem base64 detectada, enviando direto para análise...`);
        } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
          console.log(`🖼️ [Storage] Imagem URL detectada: ${imageUrl.substring(0, 80)}...`);
        } else {
          console.log(`🖼️ [Storage] Formato de imagem não reconhecido, pulando análise`);
          imageUrl = "";
        }
        
        if (imageUrl) {
          console.log(`🖼️ [Storage] Iniciando análise de imagem com Mistral Vision...`);
          
          // Prompt específico para entender contexto da imagem
          const analysisPrompt = `Analise esta imagem e descreva em portugues de forma clara e objetiva.

IMPORTANTE:
- Se for um COMPROVANTE DE PAGAMENTO: extraia valor, data, nome do pagador/recebedor, tipo (PIX, transferencia, boleto)
- Se for um PRODUTO: descreva caracteristicas visuais, marca se visivel
- Se for uma imagem/lista/print de CATALOGO ou PEDIDO: extraia ate 10 itens visiveis em ordem, incluindo codigo, nome, preco, quantidade, tamanho e acabamento quando aparecerem. Nao pare em 3 itens.
- Se for uma DUVIDA/PERGUNTA: descreva o que a pessoa parece querer saber
- Se for DOCUMENTO: identifique o tipo e informacoes relevantes

Responda de forma concisa. Para catalogo/pedido com varios itens, use uma lista curta com ate 10 itens para preservar todos os codigos visiveis.`;

          const conversationRecord = await db.query.conversations.findFirst({
            where: eq(conversations.id, data.conversationId),
            columns: { connectionId: true },
          });
          const connectionRecord = conversationRecord
            ? await db.query.whatsappConnections.findFirst({
                where: eq(whatsappConnections.id, conversationRecord.connectionId),
                columns: { userId: true },
              })
            : null;

          const imageDescription = await analyzeImageWithMistral(
            imageUrl,
            analysisPrompt,
            connectionRecord?.userId,
          );
          
          if (imageDescription && imageDescription.length > 0) {
            console.log(`🖼️ [Storage] ✅ Análise de imagem bem-sucedida: "${imageDescription.substring(0, 100)}..."`);
            let catalogVariationContext = "";

            if (connectionRecord?.userId) {
              try {
                const { data: productsConfig } = await supabase
                  .from("products_config")
                  .select("is_active, send_to_ai, image_variations_enabled")
                  .eq("user_id", connectionRecord.userId)
                  .single();

                if (
                  productsConfig?.is_active === true &&
                  productsConfig?.send_to_ai !== false
                ) {
                  const { data: productsData, error: productsError } = await supabase
                    .from("products")
                    .select("id, name, price, category, image_url")
                    .eq("user_id", connectionRecord.userId)
                    .eq("is_active", true);

                  if (productsError) {
                    throw productsError;
                  }

                  const hydratedProducts = attachMediaToProducts(
                    productsData || [],
                    await fetchProductMediaRows({
                      supabase,
                      userId: connectionRecord.userId,
                      productIds: (productsData || []).map((product: any) => String(product.id)),
                    }),
                  );

                  const hasVariationAwareCatalog =
                    productsConfig?.image_variations_enabled === true ||
                    hydratedProducts.some((product: any) =>
                      (Array.isArray(product.media_items) ? product.media_items : []).some((media: any) =>
                        hasCatalogVariationMetadata({
                          variation_code: media?.variation_code ?? null,
                          variation_name: media?.variation_name ?? null,
                          variation_price: media?.variation_price ?? null,
                          variation_stock: media?.variation_stock ?? null,
                        }),
                      ),
                    );

                  if (hasVariationAwareCatalog) {
                    const matchResult = await matchCatalogVariationFromCustomerImage({
                      customerImageDescription: imageDescription,
                      customerMessage: data.text || null,
                      candidates: hydratedProducts.flatMap((product: any) =>
                        (Array.isArray(product.media_items) ? product.media_items : [])
                          .filter((media: any) => media?.variation_is_active !== false)
                          .map((media: any) => ({
                            mediaId: String(media.id),
                            productId: String(product.id),
                            productName: String(product.name),
                            productCategory: product.category ?? null,
                            productPrice: product.price ?? null,
                            fileName: media.file_name ?? null,
                            caption: media.caption ?? null,
                            variationCode: media.variation_code ?? null,
                            variationName: media.variation_name ?? null,
                            variationPrice: media.variation_price ?? null,
                            variationStock: media.variation_stock ?? null,
                            variationIsActive: media.variation_is_active !== false,
                          })),
                      ),
                    });

                    if (matchResult?.matched) {
                      const matches = Array.isArray(matchResult.matches) && matchResult.matches.length > 0
                        ? matchResult.matches.slice(0, 10)
                        : matchResult.mediaId && matchResult.productId
                          ? [{ productId: matchResult.productId, mediaId: matchResult.mediaId }]
                          : [];
                      const matchedDetails: string[] = [];
                      const matchedCodes: number[] = [];

                      for (const [index, match] of matches.entries()) {
                        const matchedProduct = hydratedProducts.find((product: any) => String(product.id) === match.productId);
                        const matchedMedia = matchedProduct?.media_items?.find((media: any) => String(media.id) === match.mediaId);
                        if (!matchedProduct || !matchedMedia) {
                          continue;
                        }

                        const details: string[] = [`item ${index + 1}`, `produto ${matchedProduct.name}`];
                        if (typeof matchedMedia.variation_code === "number") {
                          matchedCodes.push(matchedMedia.variation_code);
                          details.push(`codigo ${matchedMedia.variation_code}`);
                        }
                        if (matchedMedia.variation_name) {
                          details.push(`nome ${matchedMedia.variation_name}`);
                        }
                        if (matchedMedia.variation_price) {
                          details.push(`preco ${matchedMedia.variation_price}`);
                        }
                        if (typeof matchedMedia.variation_stock === "number") {
                          details.push(`estoque ${matchedMedia.variation_stock}`);
                        }
                        matchedDetails.push(details.join(" | "));
                      }

                      if (matchedDetails.length > 0) {
                        const codesSummary = matchedCodes.length > 0
                          ? `codigos selecionados ${matchedCodes.join(", ")} | `
                          : "";
                        catalogVariationContext = `[CATALOGO_IDENTIFICADO: ${codesSummary}${matchedDetails.join(" ; ")}]`;
                      }
                    }
                  }
                }
              } catch (catalogMatchError) {
                console.warn("[Storage] Falha ao enriquecer imagem com variação do catálogo:", catalogMatchError);
              }
            }

            // Substituir texto genérico pela descrição da imagem
            data.text = `[IMAGEM ANALISADA: ${imageDescription}]${catalogVariationContext ? `\n${catalogVariationContext}` : ""}`;
          } else {
            console.log(`🖼️ [Storage] ⚠️ Análise de imagem vazia ou nula`);
            data.text = data.text || "(imagem enviada pelo cliente)";
          }
        }
      } catch (error) {
        console.error("Error analyzing image message in storage.createMessage:", error);
        // Manter texto original em caso de erro
        data.text = data.text || "(imagem enviada pelo cliente)";
      }
    }

    const [message] = await db
      .insert(messages)
      .values(data)
      .returning();
    return message;
  }

  // 🔥 OTIMIZADO: Usar COUNT(*) em vez de trazer todas as linhas
  // Reduz drasticamente o Egress do Supabase
  async getTodayMessagesCount(connectionId: string): Promise<number> {
    // Cache para evitar queries repetidas (TTL 60s)
    const cacheKey = `todayMsgCount:${connectionId}`;
    const cached = memoryCache.get<number>(cacheKey);
    if (cached !== null) return cached;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.connectionId, connectionId),
          gte(messages.timestamp, today)
        )
      );

    const count = result[0]?.count || 0;
    memoryCache.set(cacheKey, count, 60000); // Cache por 60 segundos
    return count;
  }

  // 🔥 OTIMIZADO: Usar COUNT(*) em vez de trazer todas as linhas
  // Antes: trazia TODAS as mensagens do agente (milhares de rows com media_url grande)
  // Agora: retorna apenas 1 número, reduz Egress em ~99%
  async getAgentMessagesCount(connectionId: string): Promise<number> {
    // Cache para evitar queries repetidas (TTL 60s)
    const cacheKey = `agentMsgCount:${connectionId}`;
    const cached = memoryCache.get<number>(cacheKey);
    if (cached !== null) return cached;

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.connectionId, connectionId),
          eq(messages.isFromAgent, true)
        )
      );

    const count = result[0]?.count || 0;
    memoryCache.set(cacheKey, count, 60000); // Cache por 60 segundos
    return count;
  }

  // AI Agent operations
  async getAgentConfig(userId: string): Promise<AiAgentConfig | undefined> {
    const [config] = await db
      .select()
      .from(aiAgentConfig)
      .where(eq(aiAgentConfig.userId, userId));
    return config ? repairMojibakeDeep(config) : undefined;
  }

  async upsertAgentConfig(userId: string, data: Partial<InsertAiAgentConfig>): Promise<AiAgentConfig> {
    const normalizedData = repairMojibakeDeep(data);
    const [config] = await db
      .insert(aiAgentConfig)
      .values({ userId, ...normalizedData } as InsertAiAgentConfig)
      .onConflictDoUpdate({
        target: aiAgentConfig.userId,
        set: {
          ...normalizedData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return repairMojibakeDeep(config);
  }

  async updateAgentConfig(userId: string, data: Partial<InsertAiAgentConfig>): Promise<AiAgentConfig | undefined> {
    const normalizedData = repairMojibakeDeep(data);
    const [config] = await db
      .update(aiAgentConfig)
      .set({ ...normalizedData, updatedAt: new Date() })
      .where(eq(aiAgentConfig.userId, userId))
      .returning();
    return config ? repairMojibakeDeep(config) : undefined;
  }

  // 🆕 Business Agent Configuration operations (Advanced System)
  async getBusinessAgentConfig(userId: string): Promise<BusinessAgentConfig | undefined> {
    const [config] = await db
      .select()
      .from(businessAgentConfigs)
      .where(eq(businessAgentConfigs.userId, userId));
    return config ? repairMojibakeDeep(config) : undefined;
  }

  async upsertBusinessAgentConfig(userId: string, data: Partial<InsertBusinessAgentConfig>): Promise<BusinessAgentConfig> {
    const normalizedData = repairMojibakeDeep(data);
    const [config] = await db
      .insert(businessAgentConfigs)
      .values({ userId, ...normalizedData } as InsertBusinessAgentConfig)
      .onConflictDoUpdate({
        target: businessAgentConfigs.userId,
        set: {
          ...normalizedData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return repairMojibakeDeep(config);
  }

  async deleteBusinessAgentConfig(userId: string): Promise<void> {
    await db
      .delete(businessAgentConfigs)
      .where(eq(businessAgentConfigs.userId, userId));
  }

  /**
   * Verificar se IA está desativada para uma conversa
   * 
   * ⚠️ IMPORTANTE: A IA é controlada APENAS pela tabela agent_disabled_conversations
   * Follow-up é controlado SEPARADAMENTE por conversations.followupActive
   * IA e Follow-up são sistemas INDEPENDENTES!
   * 
   * IA é desativada quando:
   * 1. Existe entrada em agent_disabled_conversations (pausa temporária quando dono responde)
   * 
   * Follow-up é desativado quando:
   * 1. Toggle global em /followup está desativado (followup_configs.is_enabled)
   * 2. Toggle individual na conversa está desativado (conversations.followupActive)
   */
  async isAgentDisabledForConversation(conversationId: string): Promise<boolean> {
    // Verificar tabela de pausas temporárias (ÚNICA verificação para IA)
    const [disabled] = await db
      .select()
      .from(agentDisabledConversations)
      .where(eq(agentDisabledConversations.conversationId, conversationId));
    
    return !!disabled;
  }

  async getDisabledConversationIds(conversationIds: string[]): Promise<string[]> {
    const ids = Array.from(new Set(conversationIds.filter(Boolean)));
    if (ids.length === 0) {
      return [];
    }

    const rows = await db
      .select({ conversationId: agentDisabledConversations.conversationId })
      .from(agentDisabledConversations)
      .where(inArray(agentDisabledConversations.conversationId, ids));

    return rows.map((row) => row.conversationId);
  }

  async disableAgentForConversation(conversationId: string, autoReactivateAfterMinutes?: number | null): Promise<void> {
    await db
      .insert(agentDisabledConversations)
      .values({ 
        conversationId,
        ownerLastReplyAt: new Date(),
        autoReactivateAfterMinutes: autoReactivateAfterMinutes ?? null,
        clientHasPendingMessage: false,
        clientLastMessageAt: null,
      })
      .onConflictDoUpdate({
        target: agentDisabledConversations.conversationId,
        set: {
          ownerLastReplyAt: new Date(),
          autoReactivateAfterMinutes: autoReactivateAfterMinutes ?? null,
          // Reset pending message flag when owner replies again
          clientHasPendingMessage: false,
        }
      });
    
    // ⚠️ IMPORTANTE: Follow-up é INDEPENDENTE da IA!
    // A desativação da IA NÃO deve afetar o follow-up
    // Follow-up só deve ser cancelado quando:
    // 1. Toggle global em /followup está desativado (followup_configs.is_enabled)
    // 2. Toggle individual na conversa está desativado (conversations.followupActive)
    // A IA e o Follow-up são sistemas separados e independentes!
    console.log(`🤖 [STORAGE] IA desativada para conversa ${conversationId} (follow-up permanece no estado atual)`);
  }

  async enableAgentForConversation(conversationId: string): Promise<void> {
    // 1. Remover da tabela de pausas temporárias
    await db
      .delete(agentDisabledConversations)
      .where(eq(agentDisabledConversations.conversationId, conversationId));
    
    // ⚠️ IMPORTANTE: Follow-up é INDEPENDENTE da IA!
    // A reativação da IA NÃO deve afetar o follow-up
    // Follow-up só deve ser controlado quando:
    // 1. Toggle global em /followup (followup_configs.is_enabled)
    // 2. Toggle individual na conversa (conversations.followupActive)
    // A IA e o Follow-up são sistemas separados e independentes!
    
    console.log(`✅ [STORAGE] IA reativada para conversa ${conversationId} (follow-up permanece no estado atual)`);
  }

  async updateDisabledConversationOwnerReply(conversationId: string, autoReactivateAfterMinutes?: number | null): Promise<void> {
    const updateData: Partial<{
      ownerLastReplyAt: Date;
      clientHasPendingMessage: boolean;
      autoReactivateAfterMinutes: number | null;
    }> = {
      ownerLastReplyAt: new Date(),
      clientHasPendingMessage: false, // Reset when owner replies again
    };

    if (autoReactivateAfterMinutes !== undefined) {
      updateData.autoReactivateAfterMinutes = autoReactivateAfterMinutes;
    }

    await db
      .update(agentDisabledConversations)
      .set(updateData)
      .where(eq(agentDisabledConversations.conversationId, conversationId));
  }

  async markClientPendingMessage(conversationId: string): Promise<void> {
    await db
      .update(agentDisabledConversations)
      .set({ 
        clientHasPendingMessage: true,
        clientLastMessageAt: new Date(),
      })
      .where(eq(agentDisabledConversations.conversationId, conversationId));
  }

  async getConversationsToAutoReactivate(): Promise<Array<{ conversationId: string; clientLastMessageAt: Date | null; clientHasPendingMessage: boolean }>> {
    // 🔥 OTIMIZAÇÃO: Query 100% SQL para minimizar Egress
    // Usa cálculo de tempo direto no PostgreSQL ao invés de filtrar em JS
    // Retorna registros cujo timer expirou (independente de mensagem pendente do cliente)
    // 🐛 FIX CRÍTICO: NÃO usar COALESCE! Quando auto_reactivate_after_minutes é NULL,
    // significa "NUNCA reativar automaticamente" - essas conversas NÃO devem ser incluídas!
    // 🔄 FIX PARTE 1: Reativar a IA assim que o timer expira (com ou sem msg pendente do cliente)
    // Isso garante que a IA volte automaticamente para responder a próxima mensagem do cliente
    try {
      const { pool } = await import("./db");
      const result = await pool.query(`
        SELECT 
          conversation_id as "conversationId",
          client_last_message_at as "clientLastMessageAt",
          client_has_pending_message as "clientHasPendingMessage"
        FROM agent_disabled_conversations
        WHERE 
          owner_last_reply_at IS NOT NULL
          AND auto_reactivate_after_minutes IS NOT NULL
          AND owner_last_reply_at + (auto_reactivate_after_minutes * INTERVAL '1 minute') <= NOW()
        LIMIT 10
      `);
      
      return result.rows.map(r => ({
        conversationId: r.conversationId,
        clientLastMessageAt: r.clientLastMessageAt ? new Date(r.clientLastMessageAt) : null,
        clientHasPendingMessage: r.clientHasPendingMessage === true,
      }));
    } catch (error) {
      console.error(`❌ [STORAGE] Erro em getConversationsToAutoReactivate:`, error);
      return [];
    }
  }

  /**
   * 🔥 OTIMIZAÇÃO: Verifica rapidamente se há conversas para reativar
   * Usa EXISTS que é muito mais leve que SELECT * para verificação
   * 🐛 FIX CRÍTICO: NÃO usar COALESCE! Quando auto_reactivate_after_minutes é NULL,
   * significa "NUNCA reativar automaticamente" - essas conversas NÃO devem ser consideradas!
   */
  async hasConversationsToAutoReactivate(): Promise<boolean> {
    try {
      const { pool } = await import("./db");
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM agent_disabled_conversations
          WHERE 
            owner_last_reply_at IS NOT NULL
            AND auto_reactivate_after_minutes IS NOT NULL
            AND owner_last_reply_at + (auto_reactivate_after_minutes * INTERVAL '1 minute') <= NOW()
          LIMIT 1
        ) as has_pending
      `);
      return result.rows[0]?.has_pending === true;
    } catch (error) {
      console.error(`❌ [STORAGE] Erro em hasConversationsToAutoReactivate:`, error);
      return false;
    }
  }

  /**
   * 🔥 OTIMIZAÇÃO: Conta conversas com timers ativos (para ajuste dinâmico de intervalo)
   * 🐛 FIX: Contar APENAS conversas que têm auto_reactivate_after_minutes configurado
   * Conversas com NULL não devem ser contadas pois nunca serão reativadas automaticamente
   */
  async countActiveAutoReactivateTimers(): Promise<number> {
    try {
      const { pool } = await import("./db");
      const result = await pool.query(`
        SELECT COUNT(*) as count 
        FROM agent_disabled_conversations
        WHERE auto_reactivate_after_minutes IS NOT NULL
      `);
      return parseInt(result.rows[0]?.count || '0', 10);
    } catch (error) {
      console.error(`❌ [STORAGE] Erro em countActiveAutoReactivateTimers:`, error);
      return 0;
    }
  }

  async getDisabledConversationDetails(conversationId: string): Promise<{ ownerLastReplyAt: Date | null; autoReactivateAfterMinutes: number | null; clientHasPendingMessage: boolean } | null> {
    const [result] = await db
      .select({
        ownerLastReplyAt: agentDisabledConversations.ownerLastReplyAt,
        autoReactivateAfterMinutes: agentDisabledConversations.autoReactivateAfterMinutes,
        clientHasPendingMessage: agentDisabledConversations.clientHasPendingMessage,
      })
      .from(agentDisabledConversations)
      .where(eq(agentDisabledConversations.conversationId, conversationId));
    
    if (!result) return null;
    return {
      ownerLastReplyAt: result.ownerLastReplyAt,
      autoReactivateAfterMinutes: result.autoReactivateAfterMinutes,
      clientHasPendingMessage: result.clientHasPendingMessage ?? false,
    };
  }

  // Plan operations
  async getAllPlans(): Promise<Plan[]> {
    return await withRetry(() => db.select().from(plans).orderBy(plans.ordem));
  }

  async getActivePlans(): Promise<Plan[]> {
    return await db
      .select()
      .from(plans)
      .where(eq(plans.ativo, true))
      .orderBy(plans.ordem);
  }

  async getPublicCatalogPlans(): Promise<Plan[]> {
    const activePlans = await this.getActivePlans();
    return filterPublicCatalogPlans(activePlans);
  }

  async getPlan(id: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan;
  }

  async getPlanBySlug(slug: string): Promise<Plan | undefined> {
    try {
      const [plan] = await db.select().from(plans).where(eq(plans.linkSlug, slug));
      return plan;
    } catch (error) {
      console.error("Error in getPlanBySlug:", error);
      // Fallback to raw query
      const { pool } = await import("./db");
      const result = await pool.query(
        "SELECT * FROM plans WHERE link_slug = $1",
        [slug]
      );
      if (result.rows.length === 0) return undefined;
      const row = result.rows[0];
      return {
        id: row.id,
        nome: row.nome,
        valor: row.valor,
        tipo: row.tipo,
        features: row.features,
        ativo: row.ativo,
        ordem: row.ordem,
        codigoPersonalizado: row.codigo_personalizado,
        valorPrimeiraCobranca: row.valor_primeira_cobranca,
        linkSlug: row.link_slug,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } as Plan;
    }
  }

  async createPlan(planData: InsertPlan): Promise<Plan> {
    const [plan] = await db.insert(plans).values(planData).returning();
    return plan;
  }

  async updatePlan(id: string, data: Partial<InsertPlan>): Promise<Plan> {
    const [plan] = await db
      .update(plans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    return plan;
  }

  async deletePlan(id: string): Promise<void> {
    await db.delete(plans).where(eq(plans.id, id));
  }

  // Coupon operations
  async getCouponByCode(code: string): Promise<Coupon | undefined> {
    try {
      const [coupon] = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase()));
      return coupon;
    } catch (error) {
      console.error("Error in getCouponByCode with Drizzle, trying raw query:", error);
      // Fallback to raw query if Drizzle fails (PgBouncer compatibility)
      const { pool } = await import("./db");
      const result = await pool.query(
        "SELECT * FROM coupons WHERE UPPER(code) = $1",
        [code.toUpperCase()]
      );
      if (result.rows.length === 0) return undefined;
      const row = result.rows[0];
      return {
        id: row.id,
        code: row.code,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        finalPrice: row.final_price,
        isActive: row.is_active,
        maxUses: row.max_uses,
        currentUses: row.current_uses,
        applicablePlans: row.applicable_plans,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } as Coupon;
    }
  }

  async getAllCoupons(): Promise<Coupon[]> {
    try {
      return await db.select().from(coupons).orderBy(desc(coupons.createdAt));
    } catch (error) {
      console.error("Error in getAllCoupons with Drizzle, trying raw query:", error);
      const { pool } = await import("./db");
      const result = await pool.query("SELECT * FROM coupons ORDER BY created_at DESC");
      return result.rows.map((row: any) => ({
        id: row.id,
        code: row.code,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        finalPrice: row.final_price,
        isActive: row.is_active,
        maxUses: row.max_uses,
        currentUses: row.current_uses,
        applicablePlans: row.applicable_plans,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } as Coupon));
    }
  }

  async createCoupon(couponData: InsertCoupon): Promise<Coupon> {
    try {
      const [coupon] = await db.insert(coupons).values({
        ...couponData,
        code: couponData.code.toUpperCase()
      }).returning();
      return coupon;
    } catch (error) {
      console.error("Error in createCoupon with Drizzle, trying raw query:", error);
      const { pool } = await import("./db");
      const result = await pool.query(`
        INSERT INTO coupons (code, discount_type, discount_value, final_price, is_active, max_uses, current_uses, applicable_plans, valid_until)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        couponData.code.toUpperCase(),
        couponData.discountType || 'fixed_price',
        couponData.discountValue || '0',
        couponData.finalPrice,
        couponData.isActive !== false,
        couponData.maxUses || null,
        couponData.currentUses || 0,
        couponData.applicablePlans ? JSON.stringify(couponData.applicablePlans) : null,
        couponData.validUntil || null
      ]);
      const row = result.rows[0];
      return {
        id: row.id,
        code: row.code,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        finalPrice: row.final_price,
        isActive: row.is_active,
        maxUses: row.max_uses,
        currentUses: row.current_uses,
        applicablePlans: row.applicable_plans,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } as Coupon;
    }
  }

  async updateCoupon(id: string, data: Partial<InsertCoupon>): Promise<Coupon> {
    try {
      const updateData: any = { ...data, updatedAt: new Date() };
      if (data.code) {
        updateData.code = data.code.toUpperCase();
      }
      const [coupon] = await db
        .update(coupons)
        .set(updateData)
        .where(eq(coupons.id, id))
        .returning();
      return coupon;
    } catch (error) {
      console.error("Error in updateCoupon with Drizzle, trying raw query:", error);
      const { pool } = await import("./db");
      
      // Build dynamic SET clause
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (data.code !== undefined) {
        setClauses.push(`code = $${paramIndex++}`);
        values.push(data.code.toUpperCase());
      }
      if (data.finalPrice !== undefined) {
        setClauses.push(`final_price = $${paramIndex++}`);
        values.push(data.finalPrice);
      }
      if (data.isActive !== undefined) {
        setClauses.push(`is_active = $${paramIndex++}`);
        values.push(data.isActive);
      }
      if (data.maxUses !== undefined) {
        setClauses.push(`max_uses = $${paramIndex++}`);
        values.push(data.maxUses);
      }
      if (data.validUntil !== undefined) {
        setClauses.push(`valid_until = $${paramIndex++}`);
        values.push(data.validUntil);
      }
      if (data.applicablePlans !== undefined) {
        setClauses.push(`applicable_plans = $${paramIndex++}`);
        values.push(data.applicablePlans ? JSON.stringify(data.applicablePlans) : null);
      }
      
      setClauses.push(`updated_at = $${paramIndex++}`);
      values.push(new Date());
      values.push(id);
      
      const result = await pool.query(`
        UPDATE coupons SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
        RETURNING *
      `, values);
      
      const row = result.rows[0];
      return {
        id: row.id,
        code: row.code,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        finalPrice: row.final_price,
        isActive: row.is_active,
        maxUses: row.max_uses,
        currentUses: row.current_uses,
        applicablePlans: row.applicable_plans,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } as Coupon;
    }
  }

  async deleteCoupon(id: string): Promise<void> {
    try {
      await db.delete(coupons).where(eq(coupons.id, id));
    } catch (error) {
      console.error("Error in deleteCoupon with Drizzle, trying raw query:", error);
      const { pool } = await import("./db");
      await pool.query("DELETE FROM coupons WHERE id = $1", [id]);
    }
  }

  async incrementCouponUsage(id: string): Promise<void> {
    try {
      await db
        .update(coupons)
        .set({ currentUses: sql`${coupons.currentUses} + 1`, updatedAt: new Date() })
        .where(eq(coupons.id, id));
    } catch (error) {
      console.error("Error in incrementCouponUsage with Drizzle, trying raw query:", error);
      const { pool } = await import("./db");
      await pool.query("UPDATE coupons SET current_uses = current_uses + 1, updated_at = NOW() WHERE id = $1", [id]);
    }
  }

  // Subscription operations
  async getSubscription(id: string): Promise<(Subscription & { plan: Plan }) | undefined> {
    const result = await db
      .select()
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.id, id))
      .limit(1);

    if (result.length === 0) return undefined;
    
    return {
      ...result[0].subscriptions,
      plan: result[0].plans,
    };
  }

  async getUserSubscription(userId: string): Promise<(Subscription & { plan: Plan }) | undefined> {
    // Primeiro, tenta encontrar uma subscription ativa
    const activeResult = await db
      .select()
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active")
      ))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    if (activeResult.length > 0) {
      return {
        ...activeResult[0].subscriptions,
        plan: activeResult[0].plans,
      };
    }

    // Se não há ativa, retorna a mais recente (pode ser pending, expired, etc)
    const result = await db
      .select()
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt));

    if (result.length === 0) return undefined;

    const subscriptionIds = result.map((row) => row.subscriptions.id);
    const approvedReceiptRows = subscriptionIds.length > 0
      ? await db
          .select({
            subscriptionId: paymentReceipts.subscriptionId,
            approvedReceiptAt: sql<Date>`max(coalesce(${paymentReceipts.reviewedAt}, ${paymentReceipts.updatedAt}, ${paymentReceipts.createdAt}))`,
          })
          .from(paymentReceipts)
          .where(and(
            inArray(paymentReceipts.subscriptionId, subscriptionIds),
            eq(paymentReceipts.status, "approved"),
          ))
          .groupBy(paymentReceipts.subscriptionId)
      : [];

    const approvedReceiptAtBySubscriptionId = new Map(
      approvedReceiptRows.map((row) => [row.subscriptionId, row.approvedReceiptAt ?? null]),
    );

    const candidates = result.map((row) => ({
      ...row.subscriptions,
      plan: row.plans,
      approvedReceiptAt: approvedReceiptAtBySubscriptionId.get(row.subscriptions.id) ?? null,
      planPeriodicity: row.plans.periodicidade ?? null,
      planFrequencyDays: row.plans.frequenciaDias ?? null,
    }));

    const preferred = pickPreferredSubscriptionCandidate(candidates);
    if (!preferred) {
      return {
        ...result[0].subscriptions,
        plan: result[0].plans,
      };
    }

    if (shouldAutoActivateSubscriptionFromApprovedReceipt(preferred)) {
      const activationWindow = resolveApprovedReceiptActivationWindow(preferred);
      const repairedSubscription = await this.updateSubscription(preferred.id, {
        status: "active",
        pendingReceipt: false,
        dataInicio: activationWindow.dataInicio,
        dataFim: activationWindow.dataFim,
        nextPaymentDate: activationWindow.nextPaymentDate,
        paymentMethod: preferred.paymentMethod || "pix_manual",
      });

      console.log(
        `[SUBSCRIPTION REPAIR] Auto-activated subscription ${preferred.id} for user ${userId} from approved manual receipt`,
      );

      return {
        ...repairedSubscription,
        plan: preferred.plan,
      };
    }

    const { plan, approvedReceiptAt, planPeriodicity, planFrequencyDays, ...subscriptionData } = preferred;

    return {
      ...subscriptionData,
      plan,
    };
  }

  async getAllSubscriptions(): Promise<(Subscription & { plan: Plan; user: User })[]> {
    const result = await withRetry(() =>
      db
        .select()
        .from(subscriptions)
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .innerJoin(users, eq(subscriptions.userId, users.id))
        .orderBy(desc(subscriptions.createdAt))
    );

    return result.map((row) => ({
      ...row.subscriptions,
      plan: row.plans,
      user: row.users,
    }));
  }

  async createSubscription(subscriptionData: InsertSubscription): Promise<Subscription> {
    const [subscription] = await db
      .insert(subscriptions)
      .values(subscriptionData)
      .returning();
    return subscription;
  }

  async updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription> {
    const [subscription] = await db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return subscription;
  }

  // Payment operations
  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment;
  }

  async getPaymentBySubscriptionId(subscriptionId: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.subscriptionId, subscriptionId))
      .orderBy(desc(payments.createdAt))
      .limit(1);
    return payment;
  }

  async getPendingPayments(): Promise<(Payment & { subscription: Subscription & { user: User; plan: Plan } })[]> {
    const result = await db
      .select()
      .from(payments)
      .innerJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id))
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .innerJoin(users, eq(subscriptions.userId, users.id))
      .where(eq(payments.status, "pending"))
      .orderBy(desc(payments.createdAt));

    return result.map((row) => ({
      ...row.payments,
      subscription: {
        ...row.subscriptions,
        user: row.users,
        plan: row.plans,
      },
    }));
  }

  async createPayment(paymentData: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(paymentData).returning();
    return payment;
  }

  async updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment> {
    const [payment] = await db
      .update(payments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return payment;
  }

  // Payment History operations (MercadoPago, etc)
  async createPaymentHistory(paymentData: Partial<InsertPaymentHistory>): Promise<PaymentHistory> {
    const [payment] = await db.insert(paymentHistory).values(paymentData as any).returning();
    return payment;
  }

  async getPaymentHistory(id: string): Promise<PaymentHistory | undefined> {
    const [payment] = await db.select().from(paymentHistory).where(eq(paymentHistory.id, id));
    return payment;
  }

  async getPaymentHistoryByMpPaymentId(mpPaymentId: string): Promise<PaymentHistory | undefined> {
    const [payment] = await db.select().from(paymentHistory).where(eq(paymentHistory.mpPaymentId, mpPaymentId));
    return payment;
  }

  async getPaymentHistoryBySubscription(subscriptionId: string): Promise<PaymentHistory[]> {
    return await db
      .select()
      .from(paymentHistory)
      .where(eq(paymentHistory.subscriptionId, subscriptionId))
      .orderBy(desc(paymentHistory.createdAt));
  }

  async getPaymentHistoryByUser(userId: string): Promise<PaymentHistory[]> {
    return await db
      .select()
      .from(paymentHistory)
      .where(eq(paymentHistory.userId, userId))
      .orderBy(desc(paymentHistory.createdAt));
  }

  async getAllPaymentHistory(): Promise<(PaymentHistory & { subscription?: Subscription; user?: User })[]> {
    const result = await db
      .select()
      .from(paymentHistory)
      .leftJoin(subscriptions, eq(paymentHistory.subscriptionId, subscriptions.id))
      .leftJoin(users, eq(paymentHistory.userId, users.id))
      .orderBy(desc(paymentHistory.createdAt));

    return result.map((row) => ({
      ...row.payment_history,
      subscription: row.subscriptions || undefined,
      user: row.users || undefined,
    }));
  }

  async updatePaymentHistory(id: string, data: Partial<InsertPaymentHistory>): Promise<PaymentHistory> {
    const [payment] = await db
      .update(paymentHistory)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(paymentHistory.id, id))
      .returning();
    return payment;
  }

  // System config operations
  async getSystemConfig(key: string): Promise<SystemConfig | undefined> {
    const [config] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, key));
    return config;
  }

  async getSystemConfigs(keys: string[]): Promise<Map<string, string>> {
    const configs = await db
      .select()
      .from(systemConfig)
      .where(inArray(systemConfig.chave, keys));
    
    const result = new Map<string, string>();
    for (const config of configs) {
      if (config.valor !== null) {
        result.set(config.chave, config.valor);
      }
    }
    return result;
  }

  async updateSystemConfig(key: string, value: string): Promise<SystemConfig> {
    const [config] = await db
      .insert(systemConfig)
      .values({ chave: key, valor: value })
      .onConflictDoUpdate({
        target: systemConfig.chave,
        set: { valor: value, updatedAt: new Date() },
      })
      .returning();
    return config;
  }

  // Admin operations
  async getAdminById(id: string): Promise<any | undefined> {
    const [admin] = await db
      .select()
      .from(admins)
      .where(eq(admins.id, id))
      .limit(1);
    return admin;
  }

  async getAdminByEmail(email: string): Promise<any | undefined> {
    const [admin] = await db
      .select()
      .from(admins)
      .where(eq(admins.email, email));
    return admin;
  }

  async getAllAdmins(): Promise<any[]> {
    return await withRetry(() => db.select().from(admins));
  }

  // Admin WhatsApp connection operations
  async getAdminWhatsappConnection(adminId: string): Promise<AdminWhatsappConnection | undefined> {
    const [connection] = await db
      .select()
      .from(adminWhatsappConnection)
      .where(eq(adminWhatsappConnection.adminId, adminId));
    return sanitizeAdminWhatsappConnection(connection as any) as AdminWhatsappConnection | undefined;
  }

  async createAdminWhatsappConnection(connection: InsertAdminWhatsappConnection): Promise<AdminWhatsappConnection> {
    const [created] = await db
      .insert(adminWhatsappConnection)
      .values(sanitizeAdminWhatsappConnection(connection as any) as InsertAdminWhatsappConnection)
      .returning();
    return sanitizeAdminWhatsappConnection(created as any) as AdminWhatsappConnection;
  }

  async updateAdminWhatsappConnection(adminId: string, data: Partial<InsertAdminWhatsappConnection>): Promise<AdminWhatsappConnection> {
    const [updated] = await db
      .update(adminWhatsappConnection)
      .set({
        ...(sanitizeAdminWhatsappConnection(data as any) as Partial<InsertAdminWhatsappConnection>),
        updatedAt: new Date(),
      })
      .where(eq(adminWhatsappConnection.adminId, adminId))
      .returning();
    return sanitizeAdminWhatsappConnection(updated as any) as AdminWhatsappConnection;
  }

  // Admin stats
  async getAllUsers(): Promise<User[]> {
    return await withRetry(() => db.select().from(users).orderBy(desc(users.createdAt)));
  }

  async getTotalRevenue(): Promise<number> {
    const historyResult = await db
      .select({ total: sql<number>`COALESCE(SUM(CAST(${paymentHistory.amount} AS NUMERIC)), 0)` })
      .from(paymentHistory)
      .where(eq(paymentHistory.status, "approved"));

    const historyTotal = Number(historyResult[0]?.total || 0);
    if (historyTotal > 0) {
      return historyTotal;
    }

    const legacyResult = await db
      .select({ total: sql<number>`COALESCE(SUM(CAST(${payments.valor} AS NUMERIC)), 0)` })
      .from(payments)
      .where(eq(payments.status, "paid"));

    return Number(legacyResult[0]?.total || 0);
  }

  // 🔥 OTIMIZADO: Usar COUNT(*) em vez de trazer todas as linhas
  async getActiveSubscriptionsCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.status, "active"));

    return result[0]?.count || 0;
  }

  async getAdminBusinessDashboardReport(): Promise<AdminBusinessDashboardReport> {
    const [allUsers, allConnections, allSubscriptions, allPaymentHistory, pendingReceiptCount, activePlansCount] =
      await withRetry(() =>
        Promise.all([
          this.getAllUsers(),
          this.getAllConnections(),
          this.getAllSubscriptions(),
          this.getAllPaymentHistory(),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(paymentReceipts)
            .where(eq(paymentReceipts.status, "pending"))
            .then((result) => result[0]?.count || 0),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(plans)
            .where(eq(plans.ativo, true))
            .then((result) => result[0]?.count || 0),
        ]),
      );

    return buildAdminBusinessDashboardReport({
      users: allUsers,
      connections: allConnections,
      subscriptions: allSubscriptions,
      paymentHistory: allPaymentHistory,
      pendingReceiptsCount: pendingReceiptCount,
      activePlansCount,
    });
  }

  // ======================================================================
  // WhatsApp Contacts Operations (FIX LID 2025)
  // Persistent storage for @lid → phoneNumber mappings
  // ======================================================================

  /**
   * Upsert (Insert or Update) a WhatsApp contact
   * Uses ON CONFLICT to avoid duplicates and update existing records
   */
  async upsertContact(contact: InsertWhatsappContact): Promise<WhatsappContact> {
    const [upserted] = await db
      .insert(whatsappContacts)
      .values({
        ...contact,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [whatsappContacts.connectionId, whatsappContacts.contactId],
        set: {
          lid: contact.lid,
          phoneNumber: contact.phoneNumber,
          name: contact.name,
          imgUrl: contact.imgUrl,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    
    console.log(`[DB] Upserted contact: ${contact.contactId}${contact.phoneNumber ? ` (phoneNumber: ${contact.phoneNumber})` : ""}`);
    return upserted;
  }

  /**
   * Batch upsert multiple contacts at once (more efficient than individual inserts)
   * Used during initial sync when Baileys emits many contacts.upsert events
   */
  async batchUpsertContacts(contacts: InsertWhatsappContact[]): Promise<void> {
    if (contacts.length === 0) return;

    const now = new Date();
    const contactsWithTimestamps = contacts.map(c => ({
      ...c,
      lastSyncedAt: now,
      updatedAt: now,
    }));

    // Process in chunks to avoid DB pool exhaustion with large contact lists
    const CHUNK_SIZE = 200;
    for (let i = 0; i < contactsWithTimestamps.length; i += CHUNK_SIZE) {
      const chunk = contactsWithTimestamps.slice(i, i + CHUNK_SIZE);
      await db
        .insert(whatsappContacts)
        .values(chunk)
        .onConflictDoUpdate({
          target: [whatsappContacts.connectionId, whatsappContacts.contactId],
          set: {
            lid: sql`EXCLUDED.lid`,
            phoneNumber: sql`EXCLUDED.phone_number`,
            name: sql`EXCLUDED.name`,
            imgUrl: sql`EXCLUDED.img_url`,
            lastSyncedAt: now,
            updatedAt: now,
          },
        });
    }

    console.log(`[DB] Batch upserted ${contacts.length} contacts`);
  }

  /**
   * Get contact by LID (primary use case for @lid resolution)
   * Query: SELECT * FROM whatsapp_contacts WHERE lid = ? AND connection_id = ?
   */
  async getContactByLid(lid: string, connectionId: string): Promise<WhatsappContact | undefined> {
    const [contact] = await db
      .select()
      .from(whatsappContacts)
      .where(and(
        eq(whatsappContacts.lid, lid),
        eq(whatsappContacts.connectionId, connectionId)
      ))
      .limit(1);

    if (contact) {
      console.log(`[DB] Contact found by LID: ${lid} → ${contact.phoneNumber || "no phone"}`);
    }

    return contact;
  }

  /**
   * Get contact by contactId (general lookup)
   * Query: SELECT * FROM whatsapp_contacts WHERE contact_id = ? AND connection_id = ?
   */
  async getContactById(contactId: string, connectionId: string): Promise<WhatsappContact | undefined> {
    const [contact] = await db
      .select()
      .from(whatsappContacts)
      .where(and(
        eq(whatsappContacts.contactId, contactId),
        eq(whatsappContacts.connectionId, connectionId)
      ))
      .limit(1);

    return contact;
  }

  /**
   * Get all contacts for a specific connection (cache warming)
   * Used when restoring session to pre-populate in-memory cache
   */
  async getContactsByConnectionId(connectionId: string): Promise<WhatsappContact[]> {
    const contacts = await db
      .select()
      .from(whatsappContacts)
      .where(eq(whatsappContacts.connectionId, connectionId))
      .orderBy(desc(whatsappContacts.lastSyncedAt));

    console.log(`[DB] Loaded ${contacts.length} contacts for connection ${connectionId}`);
    return contacts;
  }

  /**
   * Delete contacts from inactive connections (data retention policy)
   * Should be run periodically (e.g., daily cron job)
   * Query: DELETE FROM whatsapp_contacts WHERE connection_id IN (...)
   */
  async deleteOldContacts(daysOld: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Find inactive connections
    const inactiveConnections = await db
      .select({ id: whatsappConnections.id })
      .from(whatsappConnections)
      .where(and(
        eq(whatsappConnections.isConnected, false),
        sql`${whatsappConnections.updatedAt} < ${cutoffDate}`
      ));

    if (inactiveConnections.length === 0) {
      console.log(`[DB] No inactive connections older than ${daysOld} days`);
      return 0;
    }

    const connectionIds = inactiveConnections.map(c => c.id);

    // Delete contacts from those connections
    const deleted = await db
      .delete(whatsappContacts)
      .where(sql`${whatsappContacts.connectionId} = ANY(${connectionIds})`);

    console.log(`[DB] Deleted contacts from ${connectionIds.length} inactive connections (${daysOld}+ days old)`);
    return deleted.rowCount || 0;
  }

  // ==================== CAMPAIGN OPERATIONS (In-Memory) ====================

  async getCampaigns(userId: string): Promise<any[]> {
    return campaignsStore.get(userId) || [];
  }

  async getCampaign(userId: string, id: string): Promise<any | undefined> {
    const campaigns = campaignsStore.get(userId) || [];
    return campaigns.find(c => c.id === id);
  }

  async createCampaign(campaign: any): Promise<any> {
    const userId = campaign.userId;
    const campaigns = campaignsStore.get(userId) || [];
    const newCampaign = {
      ...campaign,
      id: campaign.id || `campaign_${Date.now()}`, // ✅ Usar ID fornecido ou gerar novo
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    campaigns.push(newCampaign);
    campaignsStore.set(userId, campaigns);
    return newCampaign;
  }

  async updateCampaign(userId: string, id: string, data: any): Promise<any> {
    const campaigns = campaignsStore.get(userId) || [];
    const index = campaigns.findIndex(c => c.id === id);
    if (index !== -1) {
      campaigns[index] = { ...campaigns[index], ...data, updatedAt: new Date() };
      campaignsStore.set(userId, campaigns);
      return campaigns[index];
    }
    return null;
  }

  async deleteCampaign(userId: string, id: string): Promise<void> {
    const campaigns = campaignsStore.get(userId) || [];
    const filtered = campaigns.filter(c => c.id !== id);
    campaignsStore.set(userId, filtered);
  }

  // ==================== CONTACT LIST OPERATIONS (Supabase/PostgreSQL) ====================

  async getContactLists(userId: string): Promise<any[]> {
    try {
      const result = await db
        .select()
        .from(contactLists)
        .where(eq(contactLists.userId, userId))
        .orderBy(desc(contactLists.createdAt));
      return result;
    } catch (error) {
      console.error("[CONTACT_LISTS] Error fetching lists:", error);
      return [];
    }
  }

  async getContactList(userId: string, id: string): Promise<any | undefined> {
    try {
      const [result] = await db
        .select()
        .from(contactLists)
        .where(and(
          eq(contactLists.userId, userId),
          eq(contactLists.id, id)
        ))
        .limit(1);
      return result;
    } catch (error) {
      console.error("[CONTACT_LISTS] Error fetching list:", error);
      return undefined;
    }
  }

  async createContactList(list: any): Promise<any> {
    try {
      const contactsArray = list.contacts || [];
      const [result] = await db
        .insert(contactLists)
        .values({
          userId: list.userId,
          name: list.name,
          description: list.description || null,
          contacts: contactsArray,
          contactCount: contactsArray.length,
        })
        .returning();
      return result;
    } catch (error) {
      console.error("[CONTACT_LISTS] Error creating list:", error);
      throw error;
    }
  }

  async updateContactList(userId: string, id: string, data: any): Promise<any> {
    try {
      const updateData: any = {
        updatedAt: new Date(),
      };
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.contacts !== undefined) {
        updateData.contacts = data.contacts;
        updateData.contactCount = data.contacts.length;
      }

      const [result] = await db
        .update(contactLists)
        .set(updateData)
        .where(and(
          eq(contactLists.userId, userId),
          eq(contactLists.id, id)
        ))
        .returning();
      return result;
    } catch (error) {
      console.error("[CONTACT_LISTS] Error updating list:", error);
      return null;
    }
  }

  async deleteContactList(userId: string, id: string): Promise<void> {
    try {
      await db
        .delete(contactLists)
        .where(and(
          eq(contactLists.userId, userId),
          eq(contactLists.id, id)
        ));
    } catch (error) {
      console.error("[CONTACT_LISTS] Error deleting list:", error);
    }
  }

  async addContactsToList(userId: string, listId: string, contacts: any[]): Promise<any> {
    try {
      // Buscar lista atual
      const [list] = await db
        .select()
        .from(contactLists)
        .where(and(
          eq(contactLists.userId, userId),
          eq(contactLists.id, listId)
        ))
        .limit(1);

      if (!list) {
        return { success: false, message: "Lista não encontrada" };
      }

      const existingContacts = (list.contacts as any[]) || [];
      // Evitar duplicatas por telefone
      const existingPhones = new Set(existingContacts.map(c => c.phone));
      const newContacts = contacts.filter(c => !existingPhones.has(c.phone));
      const mergedContacts = [...existingContacts, ...newContacts];

      const [result] = await db
        .update(contactLists)
        .set({
          contacts: mergedContacts,
          contactCount: mergedContacts.length,
          updatedAt: new Date(),
        })
        .where(eq(contactLists.id, listId))
        .returning();

      return {
        success: true,
        totalContacts: mergedContacts.length,
        addedCount: newContacts.length
      };
    } catch (error) {
      console.error("[CONTACT_LISTS] Error adding contacts:", error);
      return { success: false };
    }
  }

  async removeContactFromList(userId: string, listId: string, phone: string): Promise<any> {
    try {
      const [list] = await db
        .select()
        .from(contactLists)
        .where(and(
          eq(contactLists.userId, userId),
          eq(contactLists.id, listId)
        ))
        .limit(1);

      if (!list) {
        return { success: false, message: "Lista não encontrada" };
      }

      const existingContacts = (list.contacts as any[]) || [];
      const filteredContacts = existingContacts.filter(c => c.phone !== phone);

      const [result] = await db
        .update(contactLists)
        .set({
          contacts: filteredContacts,
          contactCount: filteredContacts.length,
          updatedAt: new Date(),
        })
        .where(eq(contactLists.id, listId))
        .returning();

      return { success: true, totalContacts: filteredContacts.length };
    } catch (error) {
      console.error("[CONTACT_LISTS] Error removing contact:", error);
      return { success: false };
    }
  }

  async getSyncedContacts(userId: string): Promise<any[]> {
    return syncedContactsStore.get(userId) || [];
  }

  async saveSyncedContacts(userId: string, contacts: any[]): Promise<void> {
    const existing = syncedContactsStore.get(userId) || [];
    const merged = [...existing];
    
    for (const contact of contacts) {
      const existingIndex = merged.findIndex(c => c.phone === contact.phone);
      if (existingIndex === -1) {
        merged.push(contact);
      } else {
        merged[existingIndex] = { ...merged[existingIndex], ...contact };
      }
    }
    
    syncedContactsStore.set(userId, merged);
  }

  async getUserActiveConnection(userId: string): Promise<any | undefined> {
    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(and(
        eq(whatsappConnections.userId, userId),
        eq(whatsappConnections.isConnected, true)
      ))
      .orderBy(desc(whatsappConnections.createdAt))
      .limit(1);
    return connection;
  }

  // ========================================================================
  // ADMIN CONVERSATIONS - Conversas do WhatsApp do admin com clientes
  // ========================================================================

  async getAdminConversations(adminId: string): Promise<any[]> {
    const result = await db
      .select()
      .from(adminConversations)
      .where(and(
        eq(adminConversations.adminId, adminId),
        adminConversationIsVisibleCondition(),
      ))
      .orderBy(desc(adminConversations.lastMessageTime));
    return result;
  }

  async getAdminConversation(id: string): Promise<any | undefined> {
    const [result] = await db
      .select()
      .from(adminConversations)
      .where(and(
        eq(adminConversations.id, id),
        adminConversationIsVisibleCondition(),
      ));
    return result;
  }

  // Busca conversa do admin pelo número de telefone (sistema single-admin)
  async getAdminConversationByPhone(contactNumber: string): Promise<any | undefined> {
    const [result] = await db
      .select()
      .from(adminConversations)
      .where(and(
        eq(adminConversations.contactNumber, contactNumber),
        adminConversationIsVisibleCondition(),
      ))
      .orderBy(desc(adminConversations.lastMessageTime), desc(adminConversations.createdAt));
    return result;
  }

  async getAdminConversationByContact(adminId: string, contactNumber: string): Promise<any | undefined> {
    const [result] = await db
      .select()
      .from(adminConversations)
      .where(and(
        eq(adminConversations.adminId, adminId),
        eq(adminConversations.contactNumber, contactNumber),
        adminConversationIsVisibleCondition(),
      ))
      .orderBy(desc(adminConversations.lastMessageTime), desc(adminConversations.createdAt));
    return result;
  }

  async createAdminConversation(data: {
    adminId: string;
    contactNumber: string;
    remoteJid?: string;
    contactName?: string;
    contactAvatar?: string;
    isAgentEnabled?: boolean;
  }): Promise<any> {
    const globalFollowupConfig = normalizeAdminFollowupConfig(await getAdminFollowupGlobalConfig());
    const [result] = await db
      .insert(adminConversations)
      .values({
        adminId: data.adminId,
        contactNumber: data.contactNumber,
        remoteJid: data.remoteJid,
        contactName: data.contactName,
        contactAvatar: data.contactAvatar,
        isAgentEnabled: data.isAgentEnabled ?? true,
        unreadCount: 0,
        followupActive: false,
        followupStage: 0,
        nextFollowupAt: null,
        followupConfig: globalFollowupConfig as any,
      })
      .returning();
    return result;
  }

  async updateAdminConversation(id: string, data: Partial<{
    contactName: string;
    contactAvatar: string;
    lastMessageText: string;
    lastMessageTime: Date;
    unreadCount: number;
    isAgentEnabled: boolean;
    contextState: Record<string, any>;
    memorySummary: string;
    linkedUserId: string;
    lastTestToken: string;
    lastSuccessfulAction: string;
    pendingSlot: string;
  }>): Promise<any> {
    const [result] = await db
      .update(adminConversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(adminConversations.id, id))
      .returning();
    return result;
  }

  async getOrCreateAdminConversation(adminId: string, contactNumber: string, remoteJid?: string, contactName?: string, contactAvatar?: string): Promise<any> {
    let conversation = await this.getAdminConversationByContact(adminId, contactNumber);
    
    if (!conversation) {
      conversation = await this.createAdminConversation({
        adminId,
        contactNumber,
        remoteJid,
        contactName,
        contactAvatar,
      });
    } else if (contactName || contactAvatar || isLegacyAdminFollowupConfig(conversation.followupConfig as any)) {
      // Update if name/avatar provided and different/missing
      const updates: any = {};
      if (contactName && conversation.contactName !== contactName) updates.contactName = contactName;
      if (contactAvatar && conversation.contactAvatar !== contactAvatar) updates.contactAvatar = contactAvatar;
      if (isLegacyAdminFollowupConfig(conversation.followupConfig as any)) {
        updates.followupConfig = normalizeAdminFollowupConfig(await getAdminFollowupGlobalConfig()) as any;
      }
      
      if (Object.keys(updates).length > 0) {
        conversation = await this.updateAdminConversation(conversation.id, updates);
      }
    }
    
    return conversation;
  }

  // Admin Messages
  async getAdminMessages(conversationId: string): Promise<any[]> {
    const result = await db
      .select()
      .from(adminMessages)
      .where(eq(adminMessages.conversationId, conversationId))
      .orderBy(adminMessages.timestamp);
    return result;
  }

  async getAdminMessageByMessageId(messageId: string): Promise<any | undefined> {
    const [result] = await db
      .select()
      .from(adminMessages)
      .where(eq(adminMessages.messageId, messageId))
      .limit(1);
    return result;
  }

  async getLastAdminMessageByConversationId(
    conversationId: string,
  ): Promise<{ id: string; fromMe: boolean; text: string | null; timestamp: Date } | undefined> {
    const [result] = await db
      .select({
        id: adminMessages.id,
        fromMe: adminMessages.fromMe,
        text: adminMessages.text,
        timestamp: adminMessages.timestamp,
      })
      .from(adminMessages)
      .where(eq(adminMessages.conversationId, conversationId))
      .orderBy(desc(adminMessages.timestamp), desc(adminMessages.id))
      .limit(1);

    return result;
  }

  async createAdminMessage(data: {
    conversationId: string;
    messageId: string;
    fromMe: boolean;
    text?: string;
    timestamp: Date;
    status?: string;
    isFromAgent?: boolean;
    mediaType?: string;
    mediaUrl?: string;
    mediaMimeType?: string;
    mediaCaption?: string;
  }): Promise<any> {
    // Criar cópia para permitir modificação
    const messageData = { ...data };

    // 🎤 Transcrição automática para TODOS os áudios (do dono/fromMe=true E do cliente/fromMe=false)
    // 🎤 FIX 2025: Suporta TANTO URLs base64 QUANTO URLs HTTP (Supabase Storage)
    if (messageData.mediaType === "audio" && messageData.mediaUrl) {
      try {
        let audioBuffer: Buffer | null = null;
        const origem = messageData.fromMe ? "dono" : "cliente";

        // 🎤 CASO 1: URL é base64 (data:audio/ogg;base64,...)
        if (messageData.mediaUrl.startsWith("data:")) {
          const base64Part = messageData.mediaUrl.split(",")[1];
          if (base64Part) {
            audioBuffer = Buffer.from(base64Part, "base64");
            console.log(`🎤 [Storage Admin] Áudio base64 do ${origem}: ${audioBuffer.length} bytes`);
          }
        }
        // 🎤 CASO 2: URL é HTTP (Supabase Storage ou outra URL externa)
        else if (messageData.mediaUrl.startsWith("http://") || messageData.mediaUrl.startsWith("https://")) {
          console.log(`🎤 [Storage Admin] Baixando áudio do ${origem} de URL externa...`);
          try {
            const audioResponse = await fetch(messageData.mediaUrl);
            if (audioResponse.ok) {
              const arrayBuffer = await audioResponse.arrayBuffer();
              audioBuffer = Buffer.from(arrayBuffer);
              console.log(`🎤 [Storage Admin] Áudio do ${origem} baixado: ${audioBuffer.length} bytes`);
            } else {
              console.error(`🎤 [Storage Admin] Erro ao baixar áudio: HTTP ${audioResponse.status}`);
            }
          } catch (fetchError) {
            console.error(`🎤 [Storage Admin] Erro ao fazer fetch do áudio:`, fetchError);
          }
        }

        // 🎤 Transcrever se temos buffer válido
        if (audioBuffer && audioBuffer.length > 0) {
          console.log(`🎤 [Storage Admin] Transcrevendo áudio do ${origem} (${audioBuffer.length} bytes)...`);
          
          const transcription = await transcribeAudioWithMistral(audioBuffer, {
            fileName: `whatsapp-audio-${origem}.ogg`,
          });

          if (transcription && transcription.length > 0) {
            console.log(`🎤 [Storage Admin] ✅ Transcrição do ${origem}: ${transcription.substring(0, 100)}...`);
            messageData.text = transcription;
          } else {
            console.log(`🎤 [Storage Admin] ⚠️ Transcrição vazia para áudio do ${origem}`);
          }
        } else {
          console.log(`🎤 [Storage Admin] ⚠️ Não foi possível obter buffer do áudio do ${origem}`);
        }
      } catch (error) {
        console.error("[Storage Admin] Erro ao transcrever áudio:", error);
      }
    }

    // 🖼️ Análise automática de imagens no Admin (mesma lógica das conversas normais)
    if (messageData.mediaType === "image" && messageData.mediaUrl) {
      try {
        let imageUrl = messageData.mediaUrl;

        if (imageUrl.startsWith("data:")) {
          console.log(`🖼️ [Storage Admin] Imagem base64 detectada, enviando direto para análise...`);
        } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
          console.log(`🖼️ [Storage Admin] Imagem URL detectada: ${imageUrl.substring(0, 80)}...`);
        } else {
          console.log(`🖼️ [Storage Admin] Formato de imagem não reconhecido, pulando análise`);
          imageUrl = "";
        }

        if (imageUrl) {
          console.log(`🖼️ [Storage Admin] Iniciando análise de imagem com Mistral Vision...`);

          const analysisPrompt = `Analise esta imagem e descreva em português de forma clara e objetiva.

IMPORTANTE:
- Se for um COMPROVANTE DE PAGAMENTO: extraia valor, data, nome do pagador/recebedor, tipo (PIX, transferência, boleto)
- Se for um PRODUTO: descreva características visuais, marca se visível
- Se for uma DÚVIDA/PERGUNTA: descreva o que a pessoa parece querer saber
- Se for DOCUMENTO: identifique o tipo e informações relevantes

Responda de forma concisa (máximo 3 frases) descrevendo o que você vê.`;

          const imageDescription = await analyzeImageWithMistral(imageUrl, analysisPrompt);

          if (imageDescription && imageDescription.length > 0) {
            console.log(`🖼️ [Storage Admin] ✅ Análise de imagem bem-sucedida: "${imageDescription.substring(0, 100)}..."`);
            messageData.text = `[IMAGEM ANALISADA: ${imageDescription}]`;
          } else {
            console.log(`🖼️ [Storage Admin] ⚠️ Análise de imagem vazia ou nula`);
            messageData.text = messageData.text || "(imagem enviada pelo cliente)";
          }
        }
      } catch (error) {
        console.error("[Storage Admin] Erro ao analisar imagem:", error);
        messageData.text = messageData.text || "(imagem enviada pelo cliente)";
      }
    }

    const [result] = await db
      .insert(adminMessages)
      .values({
        conversationId: messageData.conversationId,
        messageId: messageData.messageId,
        fromMe: messageData.fromMe,
        text: messageData.text,
        timestamp: messageData.timestamp,
        status: messageData.status,
        isFromAgent: messageData.isFromAgent ?? false,
        mediaType: messageData.mediaType,
        mediaUrl: messageData.mediaUrl,
        mediaMimeType: messageData.mediaMimeType,
        mediaCaption: messageData.mediaCaption,
      })
      .returning();
    return result;
  }

  async updateAdminMessage(id: string, data: Partial<{
    text: string;
    status: string;
    mediaType: string;
    mediaUrl: string;
    mediaMimeType: string;
    mediaCaption: string;
    timestamp: Date;
  }>): Promise<any> {
    const [result] = await db
      .update(adminMessages)
      .set(data)
      .where(eq(adminMessages.id, id))
      .returning();
    return result;
  }

  async toggleAdminConversationAgent(
    conversationId: string,
    enabled: boolean,
    options?: { manual?: boolean },
  ): Promise<any> {
    const current = await this.getAdminConversation(conversationId);
    const nextContextState = {
      ...(current?.contextState || {}),
    } as Record<string, any>;

    if (options?.manual === true) {
      nextContextState.manualAgentPause = !enabled;
      nextContextState.manualAgentPauseUpdatedAt = new Date().toISOString();
    } else if (enabled && nextContextState.manualAgentPause !== true) {
      delete nextContextState.manualAgentPause;
      delete nextContextState.manualAgentPauseUpdatedAt;
    }

    const [result] = await db
      .update(adminConversations)
      .set({
        isAgentEnabled: enabled,
        contextState: nextContextState,
        updatedAt: new Date(),
      })
      .where(eq(adminConversations.id, conversationId))
      .returning();
    return result;
  }

  async toggleAdminConversationFollowup(
    conversationId: string,
    active: boolean,
    options?: { manual?: boolean; resetToStageZero?: boolean },
  ): Promise<any> {
    const current = await this.getAdminConversation(conversationId);
    if (!current) return undefined;

    const nextContextState = {
      ...(current?.contextState || {}),
    } as Record<string, any>;

    if (options?.manual === true) {
      nextContextState.manualFollowupPause = !active;
      nextContextState.manualFollowupPauseUpdatedAt = new Date().toISOString();
    } else if (active && !isAdminConversationFollowupManuallyPaused(current)) {
      delete nextContextState.manualFollowupPause;
      delete nextContextState.manualFollowupPauseUpdatedAt;
    }

    const [result] = await db
      .update(adminConversations)
      .set({
        followupActive: active,
        nextFollowupAt: null,
        followupStage: active && options?.resetToStageZero !== false ? 0 : current.followupStage,
        // Follow-up e IA ao vivo precisam permanecer independentes.
        isAgentEnabled: current.isAgentEnabled,
        contextState: nextContextState,
        updatedAt: new Date(),
      })
      .where(eq(adminConversations.id, conversationId))
      .returning();
    return result;
  }

  async clearAdminConversationMessages(conversationId: string): Promise<number> {
    // Deletar todas as mensagens da conversa
    const result = await db
      .delete(adminMessages)
      .where(eq(adminMessages.conversationId, conversationId));
    
    // Resetar o estado da conversa para um novo atendimento, sem excluir a conta
    await db
      .update(adminConversations)
      .set({ 
        lastMessageText: null, 
        lastMessageTime: null,
        unreadCount: 0,
        isAgentEnabled: true,
        followupActive: true,
        followupStage: 0,
        nextFollowupAt: null,
        paymentStatus: "pending",
        updatedAt: new Date() 
      })
      .where(eq(adminConversations.id, conversationId));
    
    console.log(`🗑️ [STORAGE] Mensagens da conversa ${conversationId} limpas`);
    return result.rowCount || 0;
  }

  async isAdminAgentEnabledForConversation(conversationId: string): Promise<boolean> {
    const [conversation] = await db
      .select({ isAgentEnabled: adminConversations.isAgentEnabled })
      .from(adminConversations)
      .where(eq(adminConversations.id, conversationId));
    return conversation?.isAgentEnabled ?? true;
  }

  // =============================================================================
  // ADMIN AGENT MEDIA - Persistência de mídias do admin agent
  // =============================================================================

  async getAllAdminMedia(adminId: string): Promise<AdminAgentMedia[]> {
    return await db
      .select()
      .from(adminAgentMedia)
      .where(eq(adminAgentMedia.adminId, adminId))
      .orderBy(desc(adminAgentMedia.displayOrder), desc(adminAgentMedia.createdAt));
  }

  async getActiveAdminMedia(adminId?: string): Promise<AdminAgentMedia[]> {
    // Sistema single-admin: busca de qualquer admin se não especificar
    return await db
      .select()
      .from(adminAgentMedia)
      .where(eq(adminAgentMedia.isActive, true))
      .orderBy(desc(adminAgentMedia.displayOrder), desc(adminAgentMedia.createdAt));
  }

  async getAdminMediaById(id: string): Promise<AdminAgentMedia | undefined> {
    const [result] = await db
      .select()
      .from(adminAgentMedia)
      .where(eq(adminAgentMedia.id, id));
    return result;
  }

  async getAdminMediaByName(adminId: string | undefined, name: string): Promise<AdminAgentMedia | undefined> {
    const normalizedName = name.toUpperCase().replace(/\s+/g, '_');
    // Sistema single-admin: busca de qualquer admin
    const [result] = await db
      .select()
      .from(adminAgentMedia)
      .where(and(
        eq(adminAgentMedia.name, normalizedName),
        eq(adminAgentMedia.isActive, true)
      ));
    return result;
  }

  async createAdminMedia(mediaData: InsertAdminAgentMedia): Promise<AdminAgentMedia> {
    const [result] = await db
      .insert(adminAgentMedia)
      .values({
        ...mediaData,
        name: mediaData.name.toUpperCase().replace(/\s+/g, '_'), // Normalizar nome
      })
      .returning();
    return result;
  }

  async updateAdminMedia(id: string, mediaData: Partial<InsertAdminAgentMedia>): Promise<AdminAgentMedia | undefined> {
    const [result] = await db
      .update(adminAgentMedia)
      .set({
        ...mediaData,
        name: mediaData.name ? mediaData.name.toUpperCase().replace(/\s+/g, '_') : undefined,
        updatedAt: new Date(),
      })
      .where(eq(adminAgentMedia.id, id))
      .returning();
    return result;
  }

  async deleteAdminMedia(id: string): Promise<boolean> {
    const result = await db
      .delete(adminAgentMedia)
      .where(eq(adminAgentMedia.id, id));
    return result.rowCount! > 0;
  }

  async toggleAdminMediaActive(id: string, isActive: boolean): Promise<AdminAgentMedia | undefined> {
    const [result] = await db
      .update(adminAgentMedia)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(adminAgentMedia.id, id))
      .returning();
    return result;
  }

  // =============================================================================
  // MEDIA FLOWS - Sequencia de midias por agente
  // =============================================================================

  async getMediaFlows(): Promise<MediaFlow[]> {
    return await db
      .select()
      .from(mediaFlows)
      .orderBy(desc(mediaFlows.createdAt));
  }

  async getMediaFlow(id: string): Promise<MediaFlow | undefined> {
    const [result] = await db
      .select()
      .from(mediaFlows)
      .where(eq(mediaFlows.id, id));
    return result;
  }

  async createMediaFlow(data: InsertMediaFlow): Promise<MediaFlow> {
    const [result] = await db
      .insert(mediaFlows)
      .values(data)
      .returning();
    return result;
  }

  async updateMediaFlow(id: string, data: Partial<InsertMediaFlow>): Promise<MediaFlow> {
    const [result] = await db
      .update(mediaFlows)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(mediaFlows.id, id))
      .returning();
    return result;
  }

  async deleteMediaFlow(id: string): Promise<void> {
    await db.delete(mediaFlows).where(eq(mediaFlows.id, id));
  }

  async getMediaFlowItems(flowId: string): Promise<MediaFlowItem[]> {
    return await db
      .select()
      .from(mediaFlowItems)
      .where(eq(mediaFlowItems.flowId, flowId))
      .orderBy(asc(mediaFlowItems.displayOrder), asc(mediaFlowItems.createdAt));
  }

  async createMediaFlowItem(data: InsertMediaFlowItem): Promise<MediaFlowItem> {
    const [result] = await db
      .insert(mediaFlowItems)
      .values(data)
      .returning();
    return result;
  }

  async updateMediaFlowItem(id: string, data: Partial<InsertMediaFlowItem>): Promise<MediaFlowItem> {
    const [result] = await db
      .update(mediaFlowItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(mediaFlowItems.id, id))
      .returning();
    return result;
  }

  async deleteMediaFlowItem(id: string): Promise<void> {
    await db.delete(mediaFlowItems).where(eq(mediaFlowItems.id, id));
  }

  async reorderMediaFlowItems(flowId: string, orderedIds: string[]): Promise<void> {
    for (let index = 0; index < orderedIds.length; index++) {
      await db
        .update(mediaFlowItems)
        .set({ displayOrder: index, updatedAt: new Date() })
        .where(and(eq(mediaFlowItems.flowId, flowId), eq(mediaFlowItems.id, orderedIds[index])));
    }
  }



  /**
   * Reset completo de um cliente pelo número de telefone
   * Exclui: conversa admin, mensagens admin, sessão em memória, user (se existir)
   * Usado para testes - permite testar como cliente novo
   */
  async resetClientByPhone(phoneNumber: string): Promise<{
    conversationDeleted: boolean;
    messagesDeleted: number;
    userDeleted: boolean;
    connectionDeleted: boolean;
    subscriptionDeleted: boolean;
    agentConfigDeleted: boolean;
  }> {
    const result = {
      conversationDeleted: false,
      messagesDeleted: 0,
      userDeleted: false,
      connectionDeleted: false,
      subscriptionDeleted: false,
      agentConfigDeleted: false,
      businessAgentConfigDeleted: false,
      mediaDeleted: 0,
    };
    const normalizePhone = (value?: string | null) => String(value || "").replace(/\D/g, "");
    const cleanPhone = normalizePhone(phoneNumber);
    const authEmails = new Set(
      [
        `${cleanPhone}@agentezap.online`,
        `${cleanPhone}@agentezap.com`,
        `${cleanPhone}@agentezap.temp`,
      ]
        .map((value) => value.toLowerCase())
        .filter(Boolean),
    );

    console.log(`🗑️ [RESET CLIENT] Iniciando reset para ${phoneNumber} -> ${cleanPhone}...`);

    try {
      // 1. Buscar conversa admin pelo número
      const adminConv = await this.getAdminConversationByPhone(cleanPhone);
      if (adminConv) {
        // Deletar todas as mensagens da conversa
        const messagesResult = await db
          .delete(adminMessages)
          .where(eq(adminMessages.conversationId, adminConv.id));
        result.messagesDeleted = messagesResult.rowCount || 0;
        console.log(`🗑️ [RESET CLIENT] ${result.messagesDeleted} mensagens admin excluídas`);

        // Deletar a conversa
        await db
          .delete(adminConversations)
          .where(eq(adminConversations.id, adminConv.id));
        result.conversationDeleted = true;
        console.log(`🗑️ [RESET CLIENT] Conversa admin excluída`);
      }

      // 2. Buscar user pelo telefone
      let [user] = await db
        .select()
        .from(users)
        .where(eq(users.phone, cleanPhone));

      if (!user) {
        const allUsers = await db.select().from(users);
        user = allUsers.find((candidate) => normalizePhone(candidate.phone) === cleanPhone);
      }

      if (user) {
        if (user.email) {
          authEmails.add(String(user.email).toLowerCase());
        }

        // Deletar config do agente
        const agentResult = await db
          .delete(aiAgentConfig)
          .where(eq(aiAgentConfig.userId, user.id));
        result.agentConfigDeleted = (agentResult.rowCount || 0) > 0;
        if (result.agentConfigDeleted) {
          console.log(`🗑️ [RESET CLIENT] Config do agente excluída`);
        }

        const businessAgentResult = await db
          .delete(businessAgentConfigs)
          .where(eq(businessAgentConfigs.userId, user.id));
        result.businessAgentConfigDeleted = (businessAgentResult.rowCount || 0) > 0;
        if (result.businessAgentConfigDeleted) {
          console.log(`🗑️ [RESET CLIENT] Config estruturada do agente excluída`);
        }

        const mediaResult = await db
          .delete(agentMediaLibrary)
          .where(eq(agentMediaLibrary.userId, user.id));
        result.mediaDeleted = mediaResult.rowCount || 0;
        if (result.mediaDeleted > 0) {
          console.log(`🗑️ [RESET CLIENT] ${result.mediaDeleted} mídias do agente excluídas`);
        }

        // Buscar conexão do usuário
        const [connection] = await db
          .select()
          .from(whatsappConnections)
          .where(eq(whatsappConnections.userId, user.id));

        if (connection) {
          // Buscar conversas do usuário
          const userConversations = await db
            .select()
            .from(conversations)
            .where(eq(conversations.connectionId, connection.id));

          // Deletar mensagens das conversas do usuário
          for (const conv of userConversations) {
            await db
              .delete(messages)
              .where(eq(messages.conversationId, conv.id));
          }

          // Deletar conversas do usuário
          await db
            .delete(conversations)
            .where(eq(conversations.connectionId, connection.id));

          // Deletar conexão
          await db
            .delete(whatsappConnections)
            .where(eq(whatsappConnections.id, connection.id));
          result.connectionDeleted = true;
          console.log(`🗑️ [RESET CLIENT] Conexão WhatsApp excluída`);
        }

        // Buscar e deletar subscription
        const [subscription] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, user.id));

        if (subscription) {
          // Deletar pagamentos
          await db
            .delete(payments)
            .where(eq(payments.subscriptionId, subscription.id));

          // Deletar subscription
          await db
            .delete(subscriptions)
            .where(eq(subscriptions.id, subscription.id));
          result.subscriptionDeleted = true;
          console.log(`🗑️ [RESET CLIENT] Subscription excluída`);
        }

        // Limpar referências extras que apontam para users.id
        await db.execute(sql`delete from admin_notification_logs where user_id = ${user.id}`);
        await db.execute(sql`delete from audio_config where user_id = ${user.id}`);
        await db.execute(sql`delete from daily_usage where user_id = ${user.id}`);
        await db.execute(sql`delete from products_config where user_id = ${user.id}`);
        await db.execute(sql`delete from appointments where user_id = ${user.id}`);
        await db.execute(sql`delete from scheduling_exceptions where user_id = ${user.id}`);
        await db.execute(sql`delete from google_calendar_tokens where user_id = ${user.id}`);
        await db.execute(
          sql`delete from professional_services
              where professional_id in (select id from scheduling_professionals where user_id = ${user.id})
                 or service_id in (select id from scheduling_services where user_id = ${user.id})`,
        );
        await db.execute(sql`delete from scheduling_professionals where user_id = ${user.id}`);
        await db.execute(sql`delete from scheduling_services where user_id = ${user.id}`);
        await db.execute(sql`delete from scheduling_config where user_id = ${user.id}`);
        await db.execute(
          sql`delete from order_items
              where order_id in (select id from delivery_orders where user_id = ${user.id})`,
        );
        await db.execute(sql`delete from delivery_orders where user_id = ${user.id}`);
        await db.execute(sql`delete from delivery_carts where user_id = ${user.id}`);
        await db.execute(sql`delete from menu_items where user_id = ${user.id}`);
        await db.execute(sql`delete from menu_categories where user_id = ${user.id}`);
        await db.execute(sql`delete from scheduled_status where user_id = ${user.id}`);
        await db.execute(
          sql`delete from status_rotation_items
              where rotation_id in (select id from status_rotation where user_id = ${user.id})`,
        );
        await db.execute(sql`delete from status_rotation where user_id = ${user.id}`);

        const structuredTables = ["salon_config", "delivery_config", "admin_test_tokens"];
        for (const tableName of structuredTables) {
          try {
            await db.execute(sql.raw(`delete from ${tableName} where user_id = '${user.id}'`));
          } catch (structuredCleanupError: any) {
            const message = String(structuredCleanupError?.message || "");
            if (
              !/does not exist/i.test(message) &&
              !/relation .* does not exist/i.test(message)
            ) {
              console.warn(`⚠️ [RESET CLIENT] Falha ao limpar ${tableName}: ${message}`);
            }
          }
        }

        const tagRows = await db.execute(sql`select id from tags where user_id = ${user.id}`);
        const tagIds = Array.from(
          new Set(
            ((tagRows as any)?.rows || [])
              .map((row: any) => row?.id)
              .filter((value: any) => typeof value === "string" && value.length > 0),
          ),
        );

        if (tagIds.length > 0) {
          await db.execute(
            sql`delete from conversation_tags where tag_id in (${sql.join(
              tagIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          );
        }
        await db.execute(sql`delete from tags where user_id = ${user.id}`);

        const teamMemberRows = await db.execute(sql`select id from team_members where owner_id = ${user.id}`);
        const teamMemberIds = Array.from(
          new Set(
            ((teamMemberRows as any)?.rows || [])
              .map((row: any) => row?.id)
              .filter((value: any) => typeof value === "string" && value.length > 0),
          ),
        );

        if (teamMemberIds.length > 0) {
          await db.execute(
            sql`delete from connection_members where member_id in (${sql.join(
              teamMemberIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          );
          await db.execute(
            sql`delete from routing_logs where assigned_to_member_id in (${sql.join(
              teamMemberIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          );
          await db.execute(
            sql`delete from sector_members where member_id in (${sql.join(
              teamMemberIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          );
          await db.execute(
            sql`delete from team_member_sessions where member_id in (${sql.join(
              teamMemberIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          );
        }
        await db.execute(sql`delete from team_members where owner_id = ${user.id}`);

        // Finalmente, deletar o usuário
        await db
          .delete(users)
          .where(eq(users.id, user.id));
        result.userDeleted = true;
        console.log(`🗑️ [RESET CLIENT] Usuário excluído`);
      }

      if (authEmails.size > 0) {
        try {
          const attemptedAuthIds = new Set<string>();

          if (user?.id) {
            attemptedAuthIds.add(String(user.id));
            const { error: deleteByIdError } = await supabase.auth.admin.deleteUser(String(user.id));
            if (deleteByIdError) {
              console.warn(`⚠️ [RESET CLIENT] Falha ao excluir Auth por user.id ${user.id}: ${deleteByIdError.message}`);
            } else {
              console.log(`🗑️ [RESET CLIENT] Usuário Auth excluído por user.id: ${user.id}`);
            }
          }

          const { data, error } = await supabase.auth.admin.listUsers();
          if (error) {
            console.warn(`⚠️ [RESET CLIENT] Falha ao listar usuários no Auth: ${error.message}`);
          } else {
            const authUsers = Array.isArray((data as any)?.users) ? (data as any).users : [];
            for (const authUser of authUsers) {
              if (attemptedAuthIds.has(String(authUser?.id || ""))) continue;
              const authEmail = String(authUser?.email || "").toLowerCase();
              if (!authEmail || !authEmails.has(authEmail)) continue;

              const { error: deleteError } = await supabase.auth.admin.deleteUser(authUser.id);
              if (deleteError) {
                console.warn(`⚠️ [RESET CLIENT] Falha ao excluir Auth ${authEmail}: ${deleteError.message}`);
              } else {
                console.log(`🗑️ [RESET CLIENT] Usuário Auth excluído: ${authEmail}`);
              }
            }
          }
        } catch (authCleanupError) {
          console.warn(`⚠️ [RESET CLIENT] Erro ao limpar Auth do Supabase:`, authCleanupError);
        }
      }

      console.log(`✅ [RESET CLIENT] Reset completo para ${phoneNumber}`, result);
      return result;

    } catch (error) {
      console.error(`❌ [RESET CLIENT] Erro ao resetar cliente:`, error);
      throw error;
    }
  }

  /**
   * Reset SEGURO de conta de teste com validações rigorosas.
   * Em fluxos administrativos, pode receber forceAnyAccount para
   * remover qualquer conta vinculada ao telefone.
   */
  async resetTestAccountSafely(
    phoneNumber: string,
    options?: { forceAnyAccount?: boolean }
  ): Promise<{ 
    success: boolean; 
    error?: string;
    result?: any;
  }> {
    try {
      const normalizePhone = (value?: string | null) => String(value || "").replace(/\D/g, "");
      const cleanPhone = normalizePhone(phoneNumber);
      const forceAnyAccount = options?.forceAnyAccount === true;

      console.log(
        `🔍 [SAFE RESET] Verificando seguranca para ${phoneNumber} -> ${cleanPhone}... modo=${forceAnyAccount ? "FORCED" : "SAFE"}`
      );

      // 1. Buscar usuário pelo telefone
      let [user] = await db
        .select()
        .from(users)
        .where(eq(users.phone, cleanPhone));

      // Fallback para telefones salvos com formatacao diferente
      if (!user) {
        const allUsers = await db.select().from(users);
        user = allUsers.find((u) => normalizePhone(u.phone) === cleanPhone);
      }

      if (!user) {
        console.log(`⚠️ [SAFE RESET] Nenhum usuario encontrado para ${cleanPhone}`);
        // Se não tem usuário, apenas limpa conversas admin
        const adminConv = await this.getAdminConversationByPhone(cleanPhone);
        if (adminConv) {
          await db.delete(adminMessages).where(eq(adminMessages.conversationId, adminConv.id));
          await db.delete(adminConversations).where(eq(adminConversations.id, adminConv.id));
        }
        return { 
          success: true, 
          result: { userDeleted: false, conversationDeleted: !!adminConv } 
        };
      }

      // 2. VALIDAÇÕES DE SEGURANÇA

      // Validacao 1: conta precisa ser gerada automaticamente para esse telefone
      if (!forceAnyAccount) {
        const userEmail = String(user.email || "").toLowerCase().trim();
        const managedEmails = new Set([
          `${cleanPhone}@agentezap.online`,
          `${cleanPhone}@agentezap.com`,
          `${cleanPhone}@agentezap.temp`,
        ]);

        if (!managedEmails.has(userEmail)) {
          return {
            success: false,
            error: `⛔ Conta nao elegivel para reset seguro. Email atual: ${user.email || "nao definido"}.`,
          };
        }
      }

      // Validação 2: Verificar conexão WhatsApp
      const [connection] = await db
        .select()
        .from(whatsappConnections)
        .where(eq(whatsappConnections.userId, user.id));

      if (connection && connection.isConnected) {
        console.log(`⚠️ [SAFE RESET] Usuário tem WhatsApp conectado. Desconectando forçadamente para permitir reset...`);
        // Desconectar WhatsApp antes de deletar
        await db
          .update(whatsappConnections)
          .set({ isConnected: false, qrCode: null })
          .where(eq(whatsappConnections.id, connection.id));
      }

      // Validação 3: Verificar se tem mensagens reais (conversas com clientes)
      if (connection) {
        const [hasRealConversations] = await db
          .select({ count: sql<number>`count(*)` })
          .from(conversations)
          .where(eq(conversations.connectionId, connection.id));
        
        if (hasRealConversations && Number(hasRealConversations.count) > 0) {
          console.log(`⚠️ [SAFE RESET] Usuário tem conversas reais (${hasRealConversations.count}). Apagando conversas para permitir reset...`);
          // Apagar conversas reais para permitir reset
          await db
            .delete(conversations)
            .where(eq(conversations.connectionId, connection.id));
        }
      }

      // Validação 4: Verificar subscription (só pode deletar se for trial ou inexistente)
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, user.id));

      if (
        !forceAnyAccount &&
        subscription &&
        subscription.status !== 'trialing' &&
        subscription.status !== 'inactive'
      ) {
        return {
          success: false,
          error: `⛔ Usuário tem assinatura ativa (${subscription.status})! Não pode deletar conta com pagamento ativo.`
        };
      }

      // Validação 5: Verificar se tem pagamentos realizados
      if (!forceAnyAccount && subscription) {
        const [hasPayments] = await db
          .select({ count: sql<number>`count(*)` })
          .from(payments)
          .where(eq(payments.subscriptionId, subscription.id));

        if (hasPayments && Number(hasPayments.count) > 0) {
          return {
            success: false,
            error: '⛔ Usuário tem pagamentos registrados! Não pode deletar conta com histórico financeiro.'
          };
        }
      }

      // Validação 6: Verificar idade da conta (segurança extra)
      const createdAtDate = user.createdAt ? new Date(user.createdAt) : new Date();
      const accountAge = Date.now() - createdAtDate.getTime();
      const daysOld = accountAge / (1000 * 60 * 60 * 24);
      if (!forceAnyAccount && daysOld > 30) {
        return {
          success: false,
          error: `⛔ Conta tem mais de 30 dias (${Math.floor(daysOld)} dias). Muito antiga para reset automático.`
        };
      }

      // ✅ TODAS AS VALIDAÇÕES PASSARAM - SAFE TO DELETE
      console.log(
        `✅ [SAFE RESET] ${forceAnyAccount ? "Reset forcado autorizado" : "Validacoes OK"} para ${cleanPhone}. Procedendo com reset...`
      );
      
      const result = await this.resetClientByPhone(cleanPhone);
      
      return {
        success: true,
        result
      };

    } catch (error: any) {
      console.error(`❌ [SAFE RESET] Erro ao resetar:`, error);
      return {
        success: false,
        error: `Erro técnico: ${error.message}`
      };
    }
  }

  // ==================== QUICK REPLIES / RESPOSTAS RÁPIDAS ====================

  async getQuickReplies(adminId: string): Promise<any[]> {
    const { adminQuickReplies } = await import("@shared/schema");
    return db
      .select()
      .from(adminQuickReplies)
      .where(eq(adminQuickReplies.adminId, adminId))
      .orderBy(adminQuickReplies.createdAt);
  }

  async getQuickReply(id: string): Promise<any | undefined> {
    const { adminQuickReplies } = await import("@shared/schema");
    const [reply] = await db
      .select()
      .from(adminQuickReplies)
      .where(eq(adminQuickReplies.id, id));
    return reply;
  }

  async createQuickReply(data: {
    adminId: string;
    title: string;
    content: string;
    shortcut?: string | null;
    category?: string | null;
  }): Promise<any> {
    const { adminQuickReplies } = await import("@shared/schema");
    const [reply] = await db
      .insert(adminQuickReplies)
      .values(data)
      .returning();
    return reply;
  }

  async updateQuickReply(id: string, data: Partial<{
    title: string;
    content: string;
    shortcut: string | null;
    category: string | null;
    usageCount: number;
    updatedAt: Date;
  }>): Promise<any> {
    const { adminQuickReplies } = await import("@shared/schema");
    const [reply] = await db
      .update(adminQuickReplies)
      .set(data)
      .where(eq(adminQuickReplies.id, id))
      .returning();
    return reply;
  }

  async deleteQuickReply(id: string): Promise<void> {
    const { adminQuickReplies } = await import("@shared/schema");
    await db
      .delete(adminQuickReplies)
      .where(eq(adminQuickReplies.id, id));
  }

  async incrementQuickReplyUsage(id: string): Promise<void> {
    const { adminQuickReplies } = await import("@shared/schema");
    await db
      .update(adminQuickReplies)
      .set({
        usageCount: sql`${adminQuickReplies.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(adminQuickReplies.id, id));
  }

  // ==================== USER QUICK REPLIES / RESPOSTAS RÁPIDAS USUÁRIOS ====================

  async getUserQuickReplies(userId: string): Promise<any[]> {
    const { userQuickReplies } = await import("@shared/schema");
    return db
      .select()
      .from(userQuickReplies)
      .where(eq(userQuickReplies.userId, userId))
      .orderBy(userQuickReplies.createdAt);
  }

  async getUserQuickReply(id: string): Promise<any | undefined> {
    const { userQuickReplies } = await import("@shared/schema");
    const [reply] = await db
      .select()
      .from(userQuickReplies)
      .where(eq(userQuickReplies.id, id));
    return reply;
  }

  async createUserQuickReply(data: {
    userId: string;
    title: string;
    content: string;
    shortcut?: string | null;
    category?: string | null;
  }): Promise<any> {
    const { userQuickReplies } = await import("@shared/schema");
    const [reply] = await db
      .insert(userQuickReplies)
      .values(data)
      .returning();
    return reply;
  }

  async updateUserQuickReply(id: string, data: Partial<{
    title: string;
    content: string;
    shortcut: string | null;
    category: string | null;
    usageCount: number;
    updatedAt: Date;
  }>): Promise<any> {
    const { userQuickReplies } = await import("@shared/schema");
    const [reply] = await db
      .update(userQuickReplies)
      .set(data)
      .where(eq(userQuickReplies.id, id))
      .returning();
    return reply;
  }

  async deleteUserQuickReply(id: string): Promise<void> {
    const { userQuickReplies } = await import("@shared/schema");
    await db
      .delete(userQuickReplies)
      .where(eq(userQuickReplies.id, id));
  }

  async incrementUserQuickReplyUsage(id: string): Promise<void> {
    const { userQuickReplies } = await import("@shared/schema");
    await db
      .update(userQuickReplies)
      .set({
        usageCount: sql`${userQuickReplies.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(userQuickReplies.id, id));
  }

  // ==================== EXCLUSION LIST / LISTA DE EXCLUSÃO ====================

  /**
   * Normaliza um número de telefone brasileiro para comparação
   * Retorna array com todas as variações possíveis do número
   * Ex: 5517991956944 -> ['5517991956944', '17991956944', '991956944']
   */
  private normalizePhoneForComparison(phoneNumber: string): string[] {
    const variations = buildPhoneComparisonKeys(phoneNumber);
    console.log(`📞 [EXCLUSION] Normalizando número ${phoneNumber} -> chaves: [${variations.join(', ')}]`);
    return variations;
  }

  /**
   * Verifica se um número está na lista de exclusão de um usuário
   * @param userId ID do usuário
   * @param phoneNumber Número de telefone (apenas dígitos)
   * @returns true se o número está excluído e ativo
   */
  async isNumberExcluded(userId: string, phoneNumber: string): Promise<boolean> {
    const { exclusionList } = await import("@shared/schema");
    
    // Primeiro verificar se a lista de exclusão está ativa para o usuário
    // IMPORTANTE: Se config não existe, assumir que está ATIVADA por padrão
    const config = await this.getExclusionConfig(userId);
    if (config && config.isEnabled === false) {
      console.log(`🚫 [EXCLUSION] Lista de exclusão DESATIVADA explicitamente para usuário ${userId}`);
      return false;
    }
    // Se config não existe ou isEnabled é true/undefined, continuar com a verificação
    console.log(`🔍 [EXCLUSION] Verificando lista de exclusão para usuário ${userId} (config=${config ? 'exists' : 'default'}, isEnabled=${config?.isEnabled ?? 'default=true'})`);

    // Obter todas as variações possíveis do número para comparação
    const numberVariations = this.normalizePhoneForComparison(phoneNumber);
    
    const items = await db
      .select()
      .from(exclusionList)
      .where(
        and(
          eq(exclusionList.userId, userId),
          eq(exclusionList.isActive, true)
        )
      );
    
    const isExcluded = items.some((item) => phoneNumbersMatch(item.phoneNumber, phoneNumber));
    console.log(`📞 [EXCLUSION] Verificando ${phoneNumber} (variações: ${numberVariations.join(', ')}) -> ${isExcluded ? '🚫 EXCLUÍDO' : '✅ Permitido'}`);
    
    return isExcluded;
  }

  /**
   * Verifica se um número está excluído de follow-up
   * @param userId ID do usuário
   * @param phoneNumber Número de telefone (apenas dígitos)
   * @returns true se o número está excluído de follow-up
   */
  async isNumberExcludedFromFollowup(userId: string, phoneNumber: string): Promise<boolean> {
    const { exclusionList } = await import("@shared/schema");
    
    // Verificar configuração global de follow-up
    // IMPORTANTE: Se config não existe, assumir que está ATIVADA por padrão
    const config = await this.getExclusionConfig(userId);
    
    // Se config existe e isEnabled é explicitamente false, desativar
    if (config && config.isEnabled === false) {
      console.log(`🚫 [EXCLUSION] Lista de exclusão DESATIVADA explicitamente para usuário ${userId}`);
      return false;
    }
    
    // Se config existe e followupExclusionEnabled é explicitamente false, desativar follow-up exclusion
    if (config && config.followupExclusionEnabled === false) {
      console.log(`🚫 [EXCLUSION] Exclusão de follow-up DESATIVADA explicitamente para usuário ${userId}`);
      return false;
    }
    
    // Se config não existe ou ambas as flags são true/undefined, continuar com a verificação
    console.log(`🔍 [EXCLUSION-FOLLOWUP] Verificando lista de exclusão para usuário ${userId} (config=${config ? 'exists' : 'default'}, isEnabled=${config?.isEnabled ?? 'default=true'}, followupExclusionEnabled=${config?.followupExclusionEnabled ?? 'default=true'})`);

    // Obter todas as variações possíveis do número para comparação
    const numberVariations = this.normalizePhoneForComparison(phoneNumber);
    
    const items = await db
      .select()
      .from(exclusionList)
      .where(
        and(
          eq(exclusionList.userId, userId),
          eq(exclusionList.isActive, true),
          eq(exclusionList.excludeFromFollowup, true)
        )
      );
    
    const isExcluded = items.some((item) => phoneNumbersMatch(item.phoneNumber, phoneNumber));
    console.log(`📞 [EXCLUSION-FOLLOWUP] Verificando ${phoneNumber} -> ${isExcluded ? '🚫 EXCLUÍDO DE FOLLOW-UP' : '✅ Follow-up permitido'}`);
    
    return isExcluded;
  }

  /**
   * Obtém configuração de exclusão do usuário
   */
  async getExclusionConfig(userId: string): Promise<any | undefined> {
    const { exclusionConfig } = await import("@shared/schema");
    const [config] = await db
      .select()
      .from(exclusionConfig)
      .where(eq(exclusionConfig.userId, userId));
    return config;
  }

  /**
   * Cria ou atualiza configuração de exclusão do usuário
   */
  async upsertExclusionConfig(userId: string, data: {
    isEnabled?: boolean;
    followupExclusionEnabled?: boolean;
  }): Promise<any> {
    const { exclusionConfig } = await import("@shared/schema");
    
    const existing = await this.getExclusionConfig(userId);
    
    if (existing) {
      const [config] = await db
        .update(exclusionConfig)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(exclusionConfig.userId, userId))
        .returning();
      return config;
    } else {
      const [config] = await db
        .insert(exclusionConfig)
        .values({
          userId,
          isEnabled: data.isEnabled ?? true,
          followupExclusionEnabled: data.followupExclusionEnabled ?? true,
        })
        .returning();
      return config;
    }
  }

  /**
   * Obtém todos os números da lista de exclusão do usuário
   */
  async getExclusionList(userId: string): Promise<any[]> {
    const { exclusionList } = await import("@shared/schema");
    return db
      .select()
      .from(exclusionList)
      .where(eq(exclusionList.userId, userId))
      .orderBy(desc(exclusionList.createdAt));
  }

  /**
   * Obtém um item da lista de exclusão por ID
   */
  async getExclusionListItem(id: string): Promise<any | undefined> {
    const { exclusionList } = await import("@shared/schema");
    const [item] = await db
      .select()
      .from(exclusionList)
      .where(eq(exclusionList.id, id));
    return item;
  }

  /**
   * Adiciona um número à lista de exclusão
   */
  async addToExclusionList(data: {
    userId: string;
    phoneNumber: string;
    contactName?: string | null;
    reason?: string | null;
    excludeFromFollowup?: boolean;
    isActive?: boolean;
  }): Promise<any> {
    const { exclusionList } = await import("@shared/schema");
    
    // Limpar o número (apenas dígitos)
    const cleanNumber = normalizePhoneToDigits(data.phoneNumber);
    
    // Verificar se já existe
    const existing = await db
      .select()
      .from(exclusionList)
      .where(
        and(
          eq(exclusionList.userId, data.userId),
          eq(exclusionList.phoneNumber, cleanNumber)
        )
      );
    
    if (existing.length > 0) {
      // Atualizar o existente
      const [item] = await db
        .update(exclusionList)
        .set({
          contactName: data.contactName,
          reason: data.reason,
          excludeFromFollowup: data.excludeFromFollowup ?? true,
          isActive: data.isActive ?? true,
          updatedAt: new Date(),
        })
        .where(eq(exclusionList.id, existing[0].id))
        .returning();
      return item;
    }
    
    const [item] = await db
      .insert(exclusionList)
      .values({
        userId: data.userId,
        phoneNumber: cleanNumber,
        contactName: data.contactName,
        reason: data.reason,
        excludeFromFollowup: data.excludeFromFollowup ?? true,
        isActive: data.isActive ?? true,
      })
      .returning();
    return item;
  }

  /**
   * Atualiza um item da lista de exclusão
   */
  async updateExclusionListItem(id: string, data: Partial<{
    contactName: string | null;
    reason: string | null;
    excludeFromFollowup: boolean;
    isActive: boolean;
  }>): Promise<any> {
    const { exclusionList } = await import("@shared/schema");
    const [item] = await db
      .update(exclusionList)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(exclusionList.id, id))
      .returning();
    return item;
  }

  /**
   * Remove um número da lista de exclusão (soft delete - desativa)
   */
  async removeFromExclusionList(id: string): Promise<void> {
    const { exclusionList } = await import("@shared/schema");
    await db
      .update(exclusionList)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(exclusionList.id, id));
  }

  /**
   * Remove permanentemente um número da lista de exclusão
   */
  async deleteFromExclusionList(id: string): Promise<void> {
    const { exclusionList } = await import("@shared/schema");
    await db
      .delete(exclusionList)
      .where(eq(exclusionList.id, id));
  }

  /**
   * Reativa um número na lista de exclusão
   */
  async reactivateExclusionListItem(id: string): Promise<any> {
    const { exclusionList } = await import("@shared/schema");
    const [item] = await db
      .update(exclusionList)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(exclusionList.id, id))
      .returning();
    return item;
  }

  // =============================================================================
  // DAILY USAGE TRACKING - Rastreamento de uso diário para limites free
  // =============================================================================

  /**
   * Obtém ou cria o registro de uso diário para um usuário
   */
  async getDailyUsage(userId: string): Promise<{ promptEditsCount: number; simulatorMessagesCount: number }> {
    const { dailyUsage } = await import("@shared/schema");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [existing] = await db
      .select()
      .from(dailyUsage)
      .where(
        and(
          eq(dailyUsage.userId, userId),
          eq(dailyUsage.usageDate, today)
        )
      );

    if (existing) {
      return {
        promptEditsCount: existing.promptEditsCount,
        simulatorMessagesCount: existing.simulatorMessagesCount,
      };
    }

    return { promptEditsCount: 0, simulatorMessagesCount: 0 };
  }

  /**
   * Incrementa o contador de edições de prompt do dia
   */
  async incrementPromptEdits(userId: string): Promise<number> {
    const { dailyUsage } = await import("@shared/schema");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Tenta atualizar registro existente
    const updated = await db
      .update(dailyUsage)
      .set({
        promptEditsCount: sql`${dailyUsage.promptEditsCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dailyUsage.userId, userId),
          eq(dailyUsage.usageDate, today)
        )
      )
      .returning();

    if (updated.length > 0) {
      return updated[0].promptEditsCount;
    }

    // Se não existe, cria novo registro
    const [newRecord] = await db
      .insert(dailyUsage)
      .values({
        userId,
        usageDate: today,
        promptEditsCount: 1,
        simulatorMessagesCount: 0,
      })
      .returning();

    return newRecord.promptEditsCount;
  }

  /**
   * Incrementa o contador de mensagens do simulador do dia
   */
  async incrementSimulatorMessages(userId: string): Promise<number> {
    const { dailyUsage } = await import("@shared/schema");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Tenta atualizar registro existente
    const updated = await db
      .update(dailyUsage)
      .set({
        simulatorMessagesCount: sql`${dailyUsage.simulatorMessagesCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dailyUsage.userId, userId),
          eq(dailyUsage.usageDate, today)
        )
      )
      .returning();

    if (updated.length > 0) {
      return updated[0].simulatorMessagesCount;
    }

    // Se não existe, cria novo registro
    const [newRecord] = await db
      .insert(dailyUsage)
      .values({
        userId,
        usageDate: today,
        promptEditsCount: 0,
        simulatorMessagesCount: 1,
      })
      .returning();

    return newRecord.simulatorMessagesCount;
  }

  // ============================================================================
  // TAGS / ETIQUETAS - CRUD Operations
  // ============================================================================

  /**
   * Obtém todas as tags de um usuário
   */
  async getTagsByUserId(userId: string): Promise<Tag[]> {
    return await db
      .select()
      .from(tags)
      .where(eq(tags.userId, userId))
      .orderBy(tags.position, tags.name);
  }

  /**
   * Obtém uma tag por ID
   */
  async getTag(id: string): Promise<Tag | undefined> {
    const [tag] = await db
      .select()
      .from(tags)
      .where(eq(tags.id, id));
    return tag;
  }

  /**
   * Cria uma nova tag
   */
  async createTag(tagData: InsertTag): Promise<Tag> {
    const [newTag] = await db
      .insert(tags)
      .values(tagData)
      .returning();
    return newTag;
  }

  /**
   * Atualiza uma tag existente
   */
  async updateTag(id: string, data: Partial<InsertTag>): Promise<Tag> {
    const [updated] = await db
      .update(tags)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tags.id, id))
      .returning();
    return updated;
  }

  /**
   * Deleta uma tag e remove todas as associações
   */
  async deleteTag(id: string): Promise<void> {
    await db.delete(tags).where(eq(tags.id, id));
  }

  /**
   * Cria tags padrão do WhatsApp Business para um usuário
   */
  async createDefaultTags(userId: string): Promise<Tag[]> {
    const defaultTags = [
      { name: "Novo cliente", color: "#22c55e", icon: "user-plus", position: 0, isDefault: true },
      { name: "Novo pedido", color: "#eab308", icon: "shopping-bag", position: 1, isDefault: true },
      { name: "Pagamento pendente", color: "#f97316", icon: "clock", position: 2, isDefault: true },
      { name: "Pago", color: "#3b82f6", icon: "check-circle", position: 3, isDefault: true },
      { name: "Pedido finalizado", color: "#ef4444", icon: "package", position: 4, isDefault: true },
      { name: "VIP", color: "#a855f7", icon: "star", position: 5, isDefault: true },
    ];

    const createdTags: Tag[] = [];
    for (const tagData of defaultTags) {
      try {
        const [newTag] = await db
          .insert(tags)
          .values({ ...tagData, userId })
          .onConflictDoNothing()
          .returning();
        if (newTag) createdTags.push(newTag);
      } catch (error) {
        // Ignora duplicatas
        console.log(`Tag "${tagData.name}" já existe para o usuário`);
      }
    }
    return createdTags;
  }

  // ============================================================================
  // CONVERSATION TAGS - Associação de Tags a Conversas
  // ============================================================================

  /**
   * Obtém todas as tags de uma conversa
   */
  async getConversationTags(conversationId: string): Promise<Tag[]> {
    const result = await db
      .select({
        tag: tags,
      })
      .from(conversationTags)
      .innerJoin(tags, eq(conversationTags.tagId, tags.id))
      .where(eq(conversationTags.conversationId, conversationId));
    
    return result.map(r => r.tag);
  }

  /**
   * 🔥 OTIMIZADO: Batch - obtém tags para múltiplas conversas em 1 query (evita N+1)
   */
  async getTagsForConversations(conversationIds: string[]): Promise<Map<string, Tag[]>> {
    if (conversationIds.length === 0) return new Map();
    
    const allTags = await db
      .select({
        conversationId: conversationTags.conversationId,
        tag: tags,
      })
      .from(conversationTags)
      .innerJoin(tags, eq(conversationTags.tagId, tags.id))
      .where(inArray(conversationTags.conversationId, conversationIds));
    
    const tagsByConversation = new Map<string, Tag[]>();
    for (const { conversationId, tag } of allTags) {
      if (!tagsByConversation.has(conversationId)) {
        tagsByConversation.set(conversationId, []);
      }
      tagsByConversation.get(conversationId)!.push(tag);
    }
    return tagsByConversation;
  }

  /**
   * Obtém conversas filtradas por tag
   */
  async getConversationsByTag(tagId: string, connectionId: string): Promise<Conversation[]> {
    const result = await db
      .select({
        conversation: conversations,
      })
      .from(conversationTags)
      .innerJoin(conversations, eq(conversationTags.conversationId, conversations.id))
      .where(
        and(
          eq(conversationTags.tagId, tagId),
          eq(conversations.connectionId, connectionId)
        )
      )
      .orderBy(sql`${conversations.lastMessageTime} DESC NULLS LAST`);
    
    return result.map(r => r.conversation);
  }

  /**
   * Adiciona uma tag a uma conversa
   */
  async addTagToConversation(conversationId: string, tagId: string): Promise<ConversationTag> {
    const [result] = await db
      .insert(conversationTags)
      .values({ conversationId, tagId })
      .onConflictDoNothing()
      .returning();
    const conversation = await this.getConversation(conversationId);
    if (conversation?.connectionId) {
      this.invalidateConversationListCaches(conversation.connectionId);
    }
    return result;
  }

  /**
   * Remove uma tag de uma conversa
   */
  async removeTagFromConversation(conversationId: string, tagId: string): Promise<void> {
    await db
      .delete(conversationTags)
      .where(
        and(
          eq(conversationTags.conversationId, conversationId),
          eq(conversationTags.tagId, tagId)
        )
      );
    const conversation = await this.getConversation(conversationId);
    if (conversation?.connectionId) {
      this.invalidateConversationListCaches(conversation.connectionId);
    }
  }

  /**
   * Atualiza todas as tags de uma conversa (substitui as existentes)
   */
  async setConversationTags(conversationId: string, tagIds: string[]): Promise<void> {
    // Remove todas as tags existentes
    await db
      .delete(conversationTags)
      .where(eq(conversationTags.conversationId, conversationId));
    
    // Adiciona as novas tags
    if (tagIds.length > 0) {
      await db
        .insert(conversationTags)
        .values(tagIds.map(tagId => ({ conversationId, tagId })))
        .onConflictDoNothing();
    }

    const conversation = await this.getConversation(conversationId);
    if (conversation?.connectionId) {
      this.invalidateConversationListCaches(conversation.connectionId);
    }
  }

  /**
   * Adiciona tags a várias conversas (mantém tags existentes).
   */
  async addTagsToConversations(conversationIds: string[], tagIds: string[]): Promise<void> {
    if (conversationIds.length === 0 || tagIds.length === 0) return;

    const values = conversationIds.flatMap(conversationId =>
      tagIds.map(tagId => ({ conversationId, tagId }))
    );

    await db
      .insert(conversationTags)
      .values(values)
      .onConflictDoNothing();

    const affectedConnections = await db
      .selectDistinct({ connectionId: conversations.connectionId })
      .from(conversations)
      .where(inArray(conversations.id, conversationIds));

    for (const entry of affectedConnections) {
      if (entry.connectionId) {
        this.invalidateConversationListCaches(entry.connectionId);
      }
    }
  }

  /**
   * Obtém conversas com suas tags para um connectionId
   * 🔥 OTIMIZADO: Cache de 15s para evitar queries repetidas em polling
   */
  async getConversationsWithTags(connectionId: string, limit?: number, offset?: number): Promise<{ data: (Conversation & { tags: Tag[] })[]; total: number }> {
    // Se tem paginação, não usar cache (cada página é diferente)
    // EXCETO para a primeira página (offset=0 ou null) que é a mais requisitada
    const isFirstPage = limit != null && (!offset || offset === 0);
    
    if (limit == null) {
      const cacheKey = `convWithTags:${connectionId}`;
      const cached = memoryCache.get<{ data: (Conversation & { tags: Tag[] })[]; total: number }>(cacheKey);
      if (cached !== null) return cached;
    } else if (isFirstPage) {
      const cacheKey = `convWithTags:${connectionId}:page0:${limit}`;
      const cached = memoryCache.get<{ data: (Conversation & { tags: Tag[] })[]; total: number }>(cacheKey);
      if (cached !== null) return cached;
    }

    // ⚡ OTIMIZAÇÃO: Cache do COUNT por 2min, com invalidação automática em mudanças de conversa/tag.
    const countCacheKey = `convCount:${connectionId}`;
    let total = memoryCache.get<number>(countCacheKey);
    if (total === null) {
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversations)
        .where(eq(conversations.connectionId, connectionId));
      total = Number(countResult[0]?.count || 0);
      memoryCache.set(countCacheKey, total, 120000);
    }

    // Busca conversas com limit/offset
    // FIX ORDENAÇÃO: NULLS LAST para que conversas sem mensagens não fiquem fixas no topo
    let query = db
      .select()
      .from(conversations)
      .where(eq(conversations.connectionId, connectionId))
      .orderBy(sql`${conversations.lastMessageTime} DESC NULLS LAST`);
    
    if (limit != null) {
      query = query.limit(limit) as any;
    }
    if (offset != null && offset > 0) {
      query = query.offset(offset) as any;
    }
    
    const allConversations = await query;
    
    // Busca todas as tags associadas
    const conversationIds = allConversations.map(c => c.id);
    
    if (conversationIds.length === 0) {
      return { data: [], total };
    }

    const allTags = await db
      .select({
        conversationId: conversationTags.conversationId,
        tag: tags,
      })
      .from(conversationTags)
      .innerJoin(tags, eq(conversationTags.tagId, tags.id))
      .where(inArray(conversationTags.conversationId, conversationIds));
    
    // Agrupa tags por conversa
    const tagsByConversation = new Map<string, Tag[]>();
    for (const { conversationId, tag } of allTags) {
      if (!tagsByConversation.has(conversationId)) {
        tagsByConversation.set(conversationId, []);
      }
      tagsByConversation.get(conversationId)!.push(tag);
    }
    
    // Combina conversas com suas tags
    const data = allConversations.map(conv => ({
      ...conv,
      tags: tagsByConversation.get(conv.id) || [],
    }));

    const result = { data, total };
    if (limit == null) {
      const cacheKey = `convWithTags:${connectionId}`;
      memoryCache.set(cacheKey, result, 60000);
    } else if (isFirstPage) {
      const cacheKey = `convWithTags:${connectionId}:page0:${limit}`;
      memoryCache.set(cacheKey, result, 45000);
    }
    return result;
  }

  async getAttentionQueue(filters: AttentionQueueFilters): Promise<AttentionQueueResult> {
    const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
    const offset = Math.max(0, filters.offset ?? 0);
    const normalizedQuery = (filters.query || "").trim().toLowerCase();
    const priorityScore = buildAttentionPriorityScore();
    const whereClauses: any[] = [];

    if (filters.connectionIds.length === 0) {
      return { data: [], total: 0, hasMore: false, offset, limit };
    }

    whereClauses.push(inArray(conversations.connectionId, filters.connectionIds));

    if (filters.mode === "critical") {
      whereClauses.push(eq(conversations.attentionPriority, "critica"));
      whereClauses.push(eq(conversations.needsHumanAttention, true));
    } else if (filters.mode === "high") {
      whereClauses.push(inArray(conversations.attentionPriority, ["critica", "alta"]));
      whereClauses.push(eq(conversations.needsHumanAttention, true));
    } else if (filters.mode === "needsHumanAttention") {
      whereClauses.push(eq(conversations.needsHumanAttention, true));
    }

    if (normalizedQuery) {
      const likeTerm = `%${normalizedQuery}%`;
      whereClauses.push(
        or(
          sql`lower(coalesce(${conversations.contactName}, '')) like ${likeTerm}`,
          sql`lower(coalesce(${conversations.contactNumber}, '')) like ${likeTerm}`,
          sql`lower(coalesce(${conversations.lastMessageText}, '')) like ${likeTerm}`,
          sql`lower(coalesce(${conversations.attentionReason}, '')) like ${likeTerm}`,
        ),
      );
    }

    const whereCondition = and(...whereClauses);

    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversations)
      .where(whereCondition);

    const data = await db
      .select()
      .from(conversations)
      .where(whereCondition)
      .orderBy(
        sql`${conversations.needsHumanAttention} DESC`,
        sql`${priorityScore} DESC`,
        sql`${conversations.attentionQualifiedAt} DESC NULLS LAST`,
        sql`${conversations.lastMessageTime} DESC NULLS LAST`,
      )
      .limit(limit)
      .offset(offset);

    const total = totalResult[0]?.count || 0;

    return {
      data,
      total,
      hasMore: offset + data.length < total,
      offset,
      limit,
    };
  }

  /**
   * searchConversations — Parte 9: Busca por contato (nome/número) e por conteúdo de mensagens
   * Retorna conversas que correspondem ao termo, com o trecho de mensagem mais relevante (snippet).
   */
  async searchConversations(
    connectionId: string,
    query: string,
    limit: number = 30
  ): Promise<Array<(Conversation & { tags: Tag[]; snippet?: string | null; snippetFromMe?: boolean })>> {
    if (!query || query.trim().length < 2) return [];

    const term = query.trim().toLowerCase();
    const likeTerm = `%${term}%`;

    // 1. Busca por nome/número do contato
    const byContact = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.connectionId, connectionId),
          or(
            sql`lower(${conversations.contactName}) like ${likeTerm}`,
            sql`lower(${conversations.contactNumber}) like ${likeTerm}`
          )
        )
      )
      .orderBy(sql`${conversations.lastMessageTime} DESC NULLS LAST`)
      .limit(limit);

    // 2. Busca por conteúdo de mensagens — pega as últimas mensagens que contêm o termo
    //    Fazemos join com conversations para garantir ownership
    const byMessage = await db
      .select({
        conv: conversations,
        msgText: messages.text,
        msgFromMe: messages.fromMe,
        msgTime: messages.timestamp,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.connectionId, connectionId),
          sql`lower(${messages.text}) like ${likeTerm}`
        )
      )
      .orderBy(sql`${messages.timestamp} DESC`)
      .limit(limit * 3); // busca mais e deduplica por conversa

    // Deduplica: mescla contato + mensagem, sem repetir conversas
    const seen = new Set<string>();
    const merged: Array<Conversation & { snippet?: string | null; snippetFromMe?: boolean }> = [];

    for (const c of byContact) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        merged.push({ ...c, snippet: null });
      }
    }

    for (const row of byMessage) {
      const conv = row.conv as Conversation;
      if (!seen.has(conv.id)) {
        seen.add(conv.id);
        merged.push({
          ...conv,
          snippet: row.msgText,
          snippetFromMe: row.msgFromMe,
        });
      } else {
        // Já está na lista (por contato); adiciona snippet se ainda não tem
        const existing = merged.find(m => m.id === conv.id);
        if (existing && !existing.snippet) {
          existing.snippet = row.msgText;
          existing.snippetFromMe = row.msgFromMe;
        }
      }
    }

    const topResults = merged.slice(0, limit);
    if (topResults.length === 0) return [];

    // Enriquece com tags
    const convIds = topResults.map(c => c.id);
    const allTagRows = await db
      .select({ conversationId: conversationTags.conversationId, tag: tags })
      .from(conversationTags)
      .innerJoin(tags, eq(conversationTags.tagId, tags.id))
      .where(inArray(conversationTags.conversationId, convIds));

    const tagsByConv = new Map<string, Tag[]>();
    for (const { conversationId, tag } of allTagRows) {
      if (!tagsByConv.has(conversationId)) tagsByConv.set(conversationId, []);
      tagsByConv.get(conversationId)!.push(tag);
    }

    return topResults.map(c => ({
      ...c,
      tags: tagsByConv.get(c.id) || [],
    }));
  }

  // ============================================
  // RESELLER FUNCTIONS - Sistema de Revenda White-Label
  // ============================================

  /**
   * Cria um novo revendedor
   */
  async createReseller(data: InsertReseller): Promise<Reseller> {
    const [result] = await db.insert(resellers).values(data).returning();
    return result;
  }

  /**
   * Obtém revendedor por ID
   */
  async getReseller(id: string): Promise<Reseller | undefined> {
    const [result] = await db.select().from(resellers).where(eq(resellers.id, id)).limit(1);
    return result;
  }

  /**
   * Obtém revendedor pelo ID do usuário
   */
  async getResellerByUserId(userId: string): Promise<Reseller | undefined> {
    const [result] = await db.select().from(resellers).where(eq(resellers.userId, userId)).limit(1);
    return result;
  }

  /**
   * Obtém revendedor pelo domínio customizado
   */
  async getResellerByDomain(domain: string): Promise<Reseller | undefined> {
    const [result] = await db.select().from(resellers).where(eq(resellers.customDomain, domain)).limit(1);
    return result;
  }

  /**
   * Obtém revendedor pelo subdomínio
   */
  async getResellerBySubdomain(subdomain: string): Promise<Reseller | undefined> {
    const [result] = await db.select().from(resellers).where(eq(resellers.subdomain, subdomain)).limit(1);
    return result;
  }

  /**
   * Atualiza revendedor
   */
  async updateReseller(id: string, data: Partial<InsertReseller>): Promise<Reseller | undefined> {
    const [result] = await db
      .update(resellers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(resellers.id, id))
      .returning();
    return result;
  }

  /**
   * Obtém revendedor por ID
   */
  async getResellerById(id: number): Promise<Reseller | undefined> {
    const [result] = await db.select().from(resellers).where(eq(resellers.id, id)).limit(1);
    return result;
  }

  /**
   * Lista todos os revendedores (admin)
   */
  async getAllResellers(): Promise<(Reseller & { user: User | null; clientCount: number })[]> {
    const allResellers = await db.select().from(resellers).orderBy(desc(resellers.createdAt));
    
    const results: (Reseller & { user: User | null; clientCount: number })[] = [];
    
    for (const reseller of allResellers) {
      const [user] = await db.select().from(users).where(eq(users.id, reseller.userId)).limit(1);
      const clientCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(resellerClients)
        .where(eq(resellerClients.resellerId, reseller.id));
      
      results.push({
        ...reseller,
        user: user || null,
        clientCount: Number(clientCountResult[0]?.count || 0),
      });
    }
    
    return results;
  }

  /**
   * Verifica se subdomínio está disponível
   */
  async isSubdomainAvailable(subdomain: string): Promise<boolean> {
    const [existing] = await db.select().from(resellers).where(eq(resellers.subdomain, subdomain)).limit(1);
    return !existing;
  }

  /**
   * Verifica se domínio está disponível
   */
  async isDomainAvailable(domain: string): Promise<boolean> {
    const [existing] = await db.select().from(resellers).where(eq(resellers.customDomain, domain)).limit(1);
    return !existing;
  }

  // ============================================
  // RESELLER CLIENTS FUNCTIONS
  // ============================================

  /**
   * Cria um novo cliente do revendedor
   */
  async createResellerClient(data: InsertResellerClient): Promise<ResellerClient> {
    const [result] = await db.insert(resellerClients).values(data).returning();
    
    // Atualizar o reseller_id do usuário
    await db.update(users).set({ resellerId: data.resellerId }).where(eq(users.id, data.userId));
    
    return result;
  }

  /**
   * Obtém cliente do revendedor por ID
   */
  async getResellerClient(id: string): Promise<ResellerClient | undefined> {
    const [result] = await db.select().from(resellerClients).where(eq(resellerClients.id, id)).limit(1);
    return result;
  }

  /**
   * Obtém cliente do revendedor por ID (número)
   */
  async getResellerClientById(id: number): Promise<ResellerClient | undefined> {
    const [result] = await db.select().from(resellerClients).where(eq(resellerClients.id, id)).limit(1);
    return result;
  }

  /**
   * Obtém cliente do revendedor pelo ID do usuário
   */
  async getResellerClientByUserId(userId: string): Promise<ResellerClient | undefined> {
    const [result] = await db.select().from(resellerClients).where(eq(resellerClients.userId, userId)).limit(1);
    return result;
  }

  /**
   * Lista clientes de um revendedor
   */
  async getResellerClients(resellerId: string): Promise<(ResellerClient & { user: User | null, firstPaymentDate: Date | null, lastPaymentDate: Date | null, isOverdue: boolean, monthsInSystem: number })[]> {
    const clients = await db
      .select()
      .from(resellerClients)
      .where(eq(resellerClients.resellerId, resellerId))
      .orderBy(desc(resellerClients.createdAt));
    
    const results: (ResellerClient & { user: User | null, firstPaymentDate: Date | null, lastPaymentDate: Date | null, isOverdue: boolean, monthsInSystem: number })[] = [];
    
    for (const client of clients) {
      const [user] = await db.select().from(users).where(eq(users.id, client.userId)).limit(1);
      
      // Buscar pagamentos do cliente
      const payments = await db
        .select()
        .from(resellerPayments)
        .where(and(
          eq(resellerPayments.resellerId, resellerId),
          eq(resellerPayments.resellerClientId, client.id),
          eq(resellerPayments.status, 'paid')
        ))
        .orderBy(resellerPayments.paidAt);
      
      const firstPaymentDate = payments.length > 0 && payments[0].paidAt ? payments[0].paidAt : null;
      const lastPaymentDate = payments.length > 0 && payments[payments.length - 1].paidAt ? payments[payments.length - 1].paidAt : null;
      
      // Cliente está em atraso se nextPaymentDate passou e não é cliente gratuito
      const isOverdue = !client.isFreeClient && 
                        client.nextPaymentDate !== null && 
                        new Date(client.nextPaymentDate) < new Date();
      
      // Quantos meses no sistema = quantidade de pagamentos
      const monthsInSystem = payments.length;
      
      results.push({ 
        ...client, 
        user: user || null,
        firstPaymentDate,
        lastPaymentDate,
        isOverdue,
        monthsInSystem
      });
    }
    
    return results;
  }

  /**
   * Atualiza cliente do revendedor
   */
  async updateResellerClient(id: string, data: Partial<InsertResellerClient>): Promise<ResellerClient | undefined> {
    const [result] = await db
      .update(resellerClients)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(resellerClients.id, id))
      .returning();
    return result;
  }

  /**
   * Suspende cliente do revendedor
   */
  async suspendResellerClient(id: string): Promise<ResellerClient | undefined> {
    const [result] = await db
      .update(resellerClients)
      .set({ status: "suspended", suspendedAt: new Date(), updatedAt: new Date() })
      .where(eq(resellerClients.id, id))
      .returning();
    return result;
  }

  /**
   * Reativa cliente do revendedor
   */
  async reactivateResellerClient(id: string): Promise<ResellerClient | undefined> {
    const [result] = await db
      .update(resellerClients)
      .set({ status: "active", suspendedAt: null, updatedAt: new Date() })
      .where(eq(resellerClients.id, id))
      .returning();
    return result;
  }

  /**
   * Cancela cliente do revendedor
   */
  async cancelResellerClient(id: string): Promise<ResellerClient | undefined> {
    const [result] = await db
      .update(resellerClients)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(resellerClients.id, id))
      .returning();
    return result;
  }

  /**
   * Conta clientes ativos de um revendedor
   */
  async countActiveResellerClients(resellerId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(resellerClients)
      .where(and(eq(resellerClients.resellerId, resellerId), eq(resellerClients.status, "active")));
    return Number(result?.count || 0);
  }

  /**
   * Conta clientes gratuitos de um revendedor (máximo 1)
   */
  async countFreeResellerClients(resellerId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(resellerClients)
      .where(and(
        eq(resellerClients.resellerId, resellerId), 
        eq(resellerClients.isFreeClient, true)
      ));
    return Number(result?.count || 0);
  }

  // ============================================
  // RESELLER PAYMENTS FUNCTIONS
  // ============================================

  /**
   * Cria um novo pagamento do revendedor
   */
  async createResellerPayment(data: InsertResellerPayment): Promise<ResellerPayment> {
    const [result] = await db.insert(resellerPayments).values(data).returning();
    return result;
  }

  /**
   * Obtém pagamento do revendedor por ID
   */
  async getResellerPayment(id: string): Promise<ResellerPayment | undefined> {
    const [result] = await db.select().from(resellerPayments).where(eq(resellerPayments.id, id)).limit(1);
    return result;
  }

  /**
   * Lista pagamentos de um revendedor
   */
  async getResellerPayments(resellerId: string, limit: number = 50): Promise<ResellerPayment[]> {
    return db
      .select()
      .from(resellerPayments)
      .where(eq(resellerPayments.resellerId, resellerId))
      .orderBy(desc(resellerPayments.createdAt))
      .limit(limit);
  }

  /**
   * Atualiza pagamento do revendedor
   */
  async updateResellerPayment(id: string, data: Partial<InsertResellerPayment>): Promise<ResellerPayment | undefined> {
    const [result] = await db
      .update(resellerPayments)
      .set(data)
      .where(eq(resellerPayments.id, id))
      .returning();
    return result;
  }

  /**
   * Obtém métricas do revendedor
   */
  async getResellerDashboardMetrics(resellerId: string): Promise<{
    totalClients: number;
    activeClients: number;
    suspendedClients: number;
    cancelledClients: number;
    totalRevenue: number;
    monthlyRevenue: number;
    monthlyCost: number;
    monthlyProfit: number;
  }> {
    // Contagem de clientes por status
    const clientStats = await db
      .select({
        status: resellerClients.status,
        count: sql<number>`count(*)`,
      })
      .from(resellerClients)
      .where(eq(resellerClients.resellerId, resellerId))
      .groupBy(resellerClients.status);
    
    const stats = {
      totalClients: 0,
      activeClients: 0,
      suspendedClients: 0,
      cancelledClients: 0,
    };
    
    for (const { status, count } of clientStats) {
      const countNum = Number(count);
      stats.totalClients += countNum;
      if (status === "active") stats.activeClients = countNum;
      if (status === "suspended") stats.suspendedClients = countNum;
      if (status === "cancelled") stats.cancelledClients = countNum;
    }
    
    // Receita total (pagamentos aprovados)
    const [totalRevenueResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(resellerPayments)
      .where(and(eq(resellerPayments.resellerId, resellerId), eq(resellerPayments.status, "approved")));
    
    // Receita do mês atual
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const [monthlyRevenueResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(resellerPayments)
      .where(
        and(
          eq(resellerPayments.resellerId, resellerId),
          eq(resellerPayments.status, "approved"),
          gte(resellerPayments.createdAt, startOfMonth)
        )
      );
    
    // Obter config do revendedor para calcular custo
    const reseller = await this.getReseller(resellerId);
    const costPerClient = Number(reseller?.costPerClient || 49.99);
    const monthlyPrice = Number(reseller?.clientMonthlyPrice || 99.99);
    
    const monthlyCost = stats.activeClients * costPerClient;
    const monthlyRevenue = stats.activeClients * monthlyPrice;
    
    return {
      ...stats,
      totalRevenue: Number(totalRevenueResult?.total || 0),
      monthlyRevenue,
      monthlyCost,
      monthlyProfit: monthlyRevenue - monthlyCost,
    };
  }

  // ============================================
  // RESELLER INVOICES FUNCTIONS (Flow 2: Reseller -> System)
  // ============================================

  /**
   * Cria uma nova fatura do revendedor para o sistema
   */
  async createResellerInvoice(data: InsertResellerInvoice): Promise<ResellerInvoice> {
    const [result] = await db.insert(resellerInvoices).values(data).returning();
    return result;
  }

  /**
   * Obtém fatura do revendedor por ID
   */
  async getResellerInvoice(id: number): Promise<ResellerInvoice | undefined> {
    const [result] = await db.select().from(resellerInvoices).where(eq(resellerInvoices.id, id)).limit(1);
    return result;
  }

  /**
   * Lista faturas de um revendedor
   */
  async getResellerInvoices(resellerId: string, limit: number = 50): Promise<ResellerInvoice[]> {
    return db
      .select()
      .from(resellerInvoices)
      .where(eq(resellerInvoices.resellerId, resellerId))
      .orderBy(desc(resellerInvoices.createdAt))
      .limit(limit);
  }

  /**
   * Obtém fatura por mês de referência
   */
  async getResellerInvoiceByMonth(resellerId: string, referenceMonth: string): Promise<ResellerInvoice | undefined> {
    const [result] = await db
      .select()
      .from(resellerInvoices)
      .where(
        and(
          eq(resellerInvoices.resellerId, resellerId),
          eq(resellerInvoices.referenceMonth, referenceMonth)
        )
      )
      .limit(1);
    return result;
  }

  /**
   * Atualiza fatura do revendedor
   */
  async updateResellerInvoice(id: number, data: Partial<InsertResellerInvoice>): Promise<ResellerInvoice | undefined> {
    const [result] = await db
      .update(resellerInvoices)
      .set(data)
      .where(eq(resellerInvoices.id, id))
      .returning();
    return result;
  }

  /**
   * Obtém faturas pendentes ou vencidas de um revendedor
   */
  async getResellerPendingInvoices(resellerId: string): Promise<ResellerInvoice[]> {
    return db
      .select()
      .from(resellerInvoices)
      .where(
        and(
          eq(resellerInvoices.resellerId, resellerId),
          sql`${resellerInvoices.status} IN ('pending', 'overdue')`
        )
      )
      .orderBy(desc(resellerInvoices.dueDate));
  }

  /**
   * Cria fatura com itens (transacional)
   */
  async createResellerInvoiceWithItems(
    invoice: InsertResellerInvoice,
    items: InsertResellerInvoiceItem[]
  ): Promise<ResellerInvoice> {
    return await db.transaction(async (tx) => {
      const [newInvoice] = await tx
        .insert(resellerInvoices)
        .values(invoice)
        .returning();

      if (items.length > 0) {
        const itemsWithId = items.map((item) => ({
          ...item,
          invoiceId: newInvoice.id,
        }));
        await tx.insert(resellerInvoiceItems).values(itemsWithId);
      }

      return newInvoice;
    });
  }

  /**
   * Obtém fatura pelo ID do Mercado Pago
   */
  async getResellerInvoiceByMpPaymentId(mpPaymentId: string): Promise<ResellerInvoice | undefined> {
    const [result] = await db
      .select()
      .from(resellerInvoices)
      .where(eq(resellerInvoices.mpPaymentId, mpPaymentId))
      .limit(1);
    return result;
  }

  /**
   * Obtém itens de uma fatura
   */
  async getResellerInvoiceItems(invoiceId: number): Promise<ResellerInvoiceItem[]> {
    return db
      .select()
      .from(resellerInvoiceItems)
      .where(eq(resellerInvoiceItems.invoiceId, invoiceId));
  }

  // ============================================================================
  // SISTEMA DE SUSPENSÃO POR VIOLAÇÃO DE POLÍTICAS
  // ============================================================================

  /**
   * Verifica se um usuário está suspenso por violação de políticas
   */
  async isUserSuspended(userId: string): Promise<{ suspended: boolean; data?: { reason: string | null; type: string | null; suspendedAt: Date | null; refundedAt: Date | null; refundAmount: number | null } }> {
    const [user] = await db.select({
      suspendedAt: users.suspendedAt,
      suspensionReason: users.suspensionReason,
      suspensionType: users.suspensionType,
      refundedAt: users.refundedAt,
      refundAmount: users.refundAmount,
    }).from(users).where(eq(users.id, userId));

    if (!user || !user.suspendedAt) {
      return { suspended: false };
    }

    return {
      suspended: true,
      data: {
        reason: user.suspensionReason,
        type: user.suspensionType,
        suspendedAt: user.suspendedAt,
        refundedAt: user.refundedAt,
        refundAmount: user.refundAmount ? parseFloat(user.refundAmount) : null,
      }
    };
  }

  /**
   * Suspende um usuário por violação de políticas
   */
  async suspendUser(
    userId: string,
    violationType: string,
    reason: string,
    adminId?: string,
    evidence?: any[],
    refundAmount?: number
  ): Promise<void> {
    const now = new Date();

    // 1. Atualizar usuário com status de suspenso
    await db.update(users).set({
      suspendedAt: now,
      suspensionReason: reason,
      suspensionType: violationType,
      refundedAt: refundAmount ? now : null,
      refundAmount: refundAmount ? refundAmount.toString() : null,
      updatedAt: now,
    }).where(eq(users.id, userId));

    // 2. Registrar violação na tabela policy_violations
    await db.execute(sql`
      INSERT INTO policy_violations (user_id, violation_type, description, status, resulted_in_suspension, admin_id, evidence, internal_notes)
      VALUES (${userId}, ${violationType}, ${reason}, 'confirmed', true, ${adminId || null}, ${JSON.stringify(evidence || [])}, ${'Suspensão aplicada em ' + now.toISOString()})
    `);

    // 3. Desativar agente de IA
    const [agentConfig] = await db.select().from(aiAgentConfig).where(eq(aiAgentConfig.userId, userId));
    if (agentConfig) {
      await db.update(aiAgentConfig).set({ isActive: false }).where(eq(aiAgentConfig.userId, userId));
    }

    console.log(`🚫 [SUSPENSION] Usuário ${userId} suspenso por ${violationType}: ${reason}`);
  }

  /**
   * Obtém todos os usuários suspensos (para admin)
   */
  async getSuspendedUsers(): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.phone,
        u.suspended_at as "suspendedAt",
        u.suspension_reason as "suspensionReason",
        u.suspension_type as "suspensionType",
        u.refunded_at as "refundedAt",
        u.refund_amount as "refundAmount",
        pv.description as "violationDescription",
        pv.evidence,
        pv.created_at as "violationDate"
      FROM users u
      LEFT JOIN policy_violations pv ON pv.user_id = u.id AND pv.resulted_in_suspension = true
      WHERE u.suspended_at IS NOT NULL
      ORDER BY u.suspended_at DESC
    `);
    return result.rows as any[];
  }

  /**
   * Remove suspensão de um usuário (para admin reverter se necessário)
   */
  async unsuspendUser(userId: string, adminNote?: string): Promise<void> {
    await db.update(users).set({
      suspendedAt: null,
      suspensionReason: null,
      suspensionType: null,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    // Registrar reversão na violação de política
    const revertNote = `\nRevertido: ${adminNote || 'Sem motivo especificado'} em ${new Date().toISOString()}`;
    
    await db.execute(sql`
      UPDATE policy_violations
      SET status = 'dismissed', 
          internal_notes = COALESCE(internal_notes, '') || ${revertNote},
          updated_at = now()
      WHERE user_id = ${userId} AND resulted_in_suspension = true
    `);

    console.log(`✅ [SUSPENSION] Suspensão removida do usuário ${userId}`);
  }

  // ==================== TEAM MEMBERS ====================

  /**
   * Buscar todos os membros de um dono
   */
  async getTeamMembers(ownerId: string): Promise<TeamMember[]> {
    return await db.select().from(teamMembers).where(eq(teamMembers.ownerId, ownerId)).orderBy(desc(teamMembers.createdAt));
  }

  /**
   * Buscar membro por ID
   */
  async getTeamMember(id: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }

  /**
   * Buscar membro por email (dentro do mesmo dono)
   */
  async getTeamMemberByEmail(ownerId: string, email: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.ownerId, ownerId), eq(teamMembers.email, email)));
    return member;
  }

  /**
   * Buscar membro por email (global - para login)
   */
  async getTeamMemberByEmailGlobal(email: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.email, email));
    return member;
  }

  /**
   * Criar novo membro
   */
  async createTeamMember(data: Omit<TeamMember, 'id' | 'createdAt' | 'updatedAt' | 'lastLoginAt'>): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return member;
  }

  /**
   * Atualizar membro
   */
  async updateTeamMember(id: string, data: Partial<TeamMember>): Promise<TeamMember> {
    const [member] = await db.update(teamMembers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(teamMembers.id, id))
      .returning();
    return member;
  }

  /**
   * Excluir membro
   */
  async deleteTeamMember(id: string): Promise<void> {
    // Deletar sessões primeiro
    await db.delete(teamMemberSessions).where(eq(teamMemberSessions.memberId, id));
    // Deletar membro
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  // ==================== TEAM MEMBER SESSIONS ====================

  /**
   * Criar sessão de membro
   */
  async createTeamMemberSession(data: { memberId: string; token: string; expiresAt: Date; userAgent?: string | null; ipAddress?: string | null }): Promise<TeamMemberSession> {
    const [session] = await db.insert(teamMemberSessions).values({
      ...data,
      createdAt: new Date(),
    }).returning();
    return session;
  }

  /**
   * Buscar sessão por token
   */
  async getTeamMemberSession(token: string): Promise<TeamMemberSession | undefined> {
    const [session] = await db.select().from(teamMemberSessions).where(eq(teamMemberSessions.token, token));
    return session;
  }

  /**
   * Deletar sessão por token
   */
  async deleteTeamMemberSession(token: string): Promise<void> {
    await db.delete(teamMemberSessions).where(eq(teamMemberSessions.token, token));
  }

  /**
   * Limpar sessões expiradas
   */
  async cleanExpiredTeamMemberSessions(): Promise<void> {
    await db.delete(teamMemberSessions).where(lte(teamMemberSessions.expiresAt, new Date()));
  }

  // ==================== AUDIO CONFIG (TTS) ====================

  /**
   * Buscar configuração de áudio do usuário
   */
  async getAudioConfig(userId: string): Promise<AudioConfig | undefined> {
    const [config] = await db.select().from(audioConfig).where(eq(audioConfig.userId, userId));
    return config;
  }

  /**
   * Criar configuração de áudio padrão
   * NOTA: Por padrão, TTS começa DESATIVADO - usuário precisa ativar manualmente via toggle
   */
  async createAudioConfig(userId: string): Promise<AudioConfig> {
    const [config] = await db.insert(audioConfig).values({
      userId,
      isEnabled: false, // DESATIVADO por padrão - ativar via toggle
      voiceType: "female",
      responseMode: "first_message_text_audio_then_mirror",
      speed: "1.00",
    }).returning();
    return config;
  }

  /**
   * Atualizar configuração de áudio
   */
  async updateAudioConfig(
    userId: string,
    data: Partial<{ isEnabled: boolean; voiceType: string; responseMode: AudioResponseMode; speed: string }>
  ): Promise<AudioConfig> {
    await ensureAudioResponseModeConstraint();
    const existing = await this.getAudioConfig(userId);
    
    if (!existing) {
      // Criar se não existe - DESATIVADO por padrão, a menos que explicitamente ativado
      const [config] = await db.insert(audioConfig).values({
        userId,
        isEnabled: data.isEnabled ?? false, // DESATIVADO por padrão
        voiceType: data.voiceType ?? "female",
        responseMode: data.responseMode ?? "first_message_text_audio_then_mirror",
        speed: data.speed ?? "1.00",
      }).returning();
      return config;
    }
    
    const [config] = await db.update(audioConfig)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(audioConfig.userId, userId))
      .returning();
    return config;
  }

  /**
   * Buscar contador de mensagens de áudio do dia
   */
  async getAudioMessageCounter(userId: string): Promise<AudioMessageCounter | undefined> {
    const today = new Date().toISOString().split('T')[0];
    const [counter] = await db.select().from(audioMessageCounter)
      .where(and(eq(audioMessageCounter.userId, userId), eq(audioMessageCounter.date, today)));
    return counter;
  }

  /**
   * Incrementar contador de mensagens de áudio
   * Retorna o novo contador ou undefined se limite atingido
   */
  async incrementAudioMessageCounter(userId: string): Promise<{ count: number; limit: number; canSend: boolean }> {
    const today = new Date().toISOString().split('T')[0];
    
    // Buscar contador existente
    let counter = await this.getAudioMessageCounter(userId);
    
    if (!counter) {
      // Criar contador para hoje
      const [newCounter] = await db.insert(audioMessageCounter).values({
        userId,
        date: today,
        count: 1,
        dailyLimit: 30,
      }).returning();
      return { count: 1, limit: 30, canSend: true };
    }

    // Verificar se pode enviar mais
    if (counter.count >= 30) {
      return { count: counter.count, limit: 30, canSend: false };
    }
    
    // Incrementar contador
    const [updated] = await db.update(audioMessageCounter)
      .set({ count: counter.count + 1, dailyLimit: 30, updatedAt: new Date() })
      .where(eq(audioMessageCounter.id, counter.id))
      .returning();
    
    return { count: updated.count, limit: 30, canSend: true };
  }

  /**
   * Verificar se usuário pode enviar mais áudios hoje
   */
  async canSendAudio(userId: string): Promise<{ canSend: boolean; remaining: number; limit: number; used: number; isUnlimited: boolean }> {
    const config = await this.getAudioConfig(userId);
    // Se não tem config, criar uma padrão
    if (!config) {
      await this.createAudioConfig(userId);
    }
    
    // Se TTS está desabilitado
    if (config && !config.isEnabled) {
      return { canSend: false, remaining: 0, limit: 30, used: 0, isUnlimited: false };
    }
    
    const counter = await this.getAudioMessageCounter(userId);
    
    if (!counter) {
      return {
        canSend: true,
        remaining: 30,
        limit: 30,
        used: 0,
        isUnlimited: false,
      };
    }

    const remaining = Math.max(0, 30 - counter.count);
    return { canSend: remaining > 0, remaining, limit: 30, used: counter.count, isUnlimited: false };
  }

  // ========================================================================
  // Admin Notification operations
  // ========================================================================

  async getAdminNotificationConfig(adminId: string): Promise<any | undefined> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM admin_notification_config WHERE admin_id = ${adminId} LIMIT 1
      `);
      return sanitizeAdminNotificationConfig(result.rows[0] as any);
    } catch (error) {
      console.error('Error getting admin notification config:', error);
      return undefined;
    }
  }

  async updateAdminNotificationConfig(adminId: string, data: any): Promise<void> {
    try {
      const sanitizedData = sanitizeAdminNotificationConfig({ ...(data || {}) }) || {};
      const existing = await this.getAdminNotificationConfig(adminId);
      
      // Converter arrays para formato PostgreSQL
      const paymentDays = sanitizedData.paymentReminderDaysBefore || [7, 3, 1];
      const overdueDays = sanitizedData.overdueReminderDaysAfter || [1, 3, 7, 14];
      const businessDays = sanitizedData.businessDays || [1, 2, 3, 4, 5];
      
      // Garantir que welcomeVariations é um array de strings válidas (usado em ambos INSERT e UPDATE)
      let welcomeVariationsArray: string[] = [];
      if (Array.isArray(sanitizedData.welcomeMessageVariations)) {
        welcomeVariationsArray = sanitizedData.welcomeMessageVariations.map((v: any) => 
          typeof v === 'string' ? v : String(v)
        ).filter((v: string) => v && v.trim());
      }
      
      // Construir a expressão ARRAY para PostgreSQL
      const welcomeVariationsSQL = welcomeVariationsArray.length > 0 
        ? `ARRAY[${welcomeVariationsArray.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(',')}]::text[]`
        : `ARRAY[]::text[]`;
      
      if (!existing) {
        await db.execute(sql`
          INSERT INTO admin_notification_config (
            admin_id, 
            payment_reminder_enabled, 
            payment_reminder_days_before,
            payment_reminder_message_template,
            payment_reminder_ai_enabled,
            payment_reminder_ai_prompt,
            overdue_reminder_enabled,
            overdue_reminder_days_after,
            overdue_reminder_message_template,
            overdue_reminder_ai_enabled,
            overdue_reminder_ai_prompt,
            periodic_checkin_enabled,
            periodic_checkin_min_days,
            periodic_checkin_max_days,
            periodic_checkin_message_template,
            checkin_ai_enabled,
            checkin_ai_prompt,
            broadcast_enabled,
            broadcast_antibot_variation,
            broadcast_ai_variation,
            broadcast_min_interval_seconds,
            broadcast_max_interval_seconds,
            disconnected_alert_enabled,
            disconnected_alert_hours,
            disconnected_alert_message_template,
            disconnected_ai_enabled,
            disconnected_ai_prompt,
            ai_variation_enabled,
            ai_variation_prompt,
            business_hours_start,
            business_hours_end,
            business_days,
            respect_business_hours,
            welcome_message_enabled,
            welcome_message_variations,
            welcome_message_ai_enabled,
            welcome_message_ai_prompt
          ) VALUES (
            ${adminId},
            ${sanitizedData.paymentReminderEnabled ?? true},
            ARRAY[${sql.raw(paymentDays.join(','))}]::integer[],
            ${sanitizedData.paymentReminderMessageTemplate || ''},
            ${sanitizedData.paymentReminderAiEnabled ?? false},
            ${sanitizedData.paymentReminderAiPrompt || ''},
            ${sanitizedData.overdueReminderEnabled ?? true},
            ARRAY[${sql.raw(overdueDays.join(','))}]::integer[],
            ${sanitizedData.overdueReminderMessageTemplate || ''},
            ${sanitizedData.overdueReminderAiEnabled ?? false},
            ${sanitizedData.overdueReminderAiPrompt || ''},
            ${sanitizedData.periodicCheckinEnabled ?? true},
            ${sanitizedData.periodicCheckinMinDays ?? 7},
            ${sanitizedData.periodicCheckinMaxDays ?? 15},
            ${sanitizedData.periodicCheckinMessageTemplate || ''},
            ${sanitizedData.checkinAiEnabled ?? false},
            ${sanitizedData.checkinAiPrompt || ''},
            ${sanitizedData.broadcastEnabled ?? true},
            ${sanitizedData.broadcastAntibotVariation ?? true},
            ${sanitizedData.broadcastAiVariation ?? false},
            ${sanitizedData.broadcastMinIntervalSeconds ?? 60},
            ${sanitizedData.broadcastMaxIntervalSeconds ?? 90},
            ${sanitizedData.disconnectedAlertEnabled ?? true},
            ${sanitizedData.disconnectedAlertHours ?? 2},
            ${sanitizedData.disconnectedAlertMessageTemplate || ''},
            ${sanitizedData.disconnectedAiEnabled ?? false},
            ${sanitizedData.disconnectedAiPrompt || ''},
            ${sanitizedData.aiVariationEnabled ?? false},
            ${sanitizedData.aiVariationPrompt || ''},
            ${sanitizedData.businessHoursStart || '09:00'},
            ${sanitizedData.businessHoursEnd || '18:00'},
            ARRAY[${sql.raw(businessDays.join(','))}]::integer[],
            ${sanitizedData.respectBusinessHours ?? true},
            ${sanitizedData.welcomeMessageEnabled ?? true},
            ${sql.raw(welcomeVariationsSQL)},
            ${sanitizedData.welcomeMessageAiEnabled ?? false},
            ${sanitizedData.welcomeMessageAiPrompt || ''}
          )
        `);
      } else {
        // Para UPDATE, reutilizar welcomeVariationsSQL já construído acima
        await db.execute(sql`
          UPDATE admin_notification_config SET
            payment_reminder_enabled = ${sanitizedData.paymentReminderEnabled},
            payment_reminder_days_before = ARRAY[${sql.raw(paymentDays.join(','))}]::integer[],
            payment_reminder_message_template = ${sanitizedData.paymentReminderMessageTemplate},
            payment_reminder_ai_enabled = ${sanitizedData.paymentReminderAiEnabled ?? false},
            payment_reminder_ai_prompt = ${sanitizedData.paymentReminderAiPrompt || ''},
            overdue_reminder_enabled = ${sanitizedData.overdueReminderEnabled},
            overdue_reminder_days_after = ARRAY[${sql.raw(overdueDays.join(','))}]::integer[],
            overdue_reminder_message_template = ${sanitizedData.overdueReminderMessageTemplate},
            overdue_reminder_ai_enabled = ${sanitizedData.overdueReminderAiEnabled ?? false},
            overdue_reminder_ai_prompt = ${sanitizedData.overdueReminderAiPrompt || ''},
            periodic_checkin_enabled = ${sanitizedData.periodicCheckinEnabled},
            periodic_checkin_min_days = ${sanitizedData.periodicCheckinMinDays},
            periodic_checkin_max_days = ${sanitizedData.periodicCheckinMaxDays},
            periodic_checkin_message_template = ${sanitizedData.periodicCheckinMessageTemplate},
            checkin_ai_enabled = ${sanitizedData.checkinAiEnabled ?? false},
            checkin_ai_prompt = ${sanitizedData.checkinAiPrompt || ''},
            broadcast_enabled = ${sanitizedData.broadcastEnabled},
            broadcast_antibot_variation = ${sanitizedData.broadcastAntibotVariation},
            broadcast_ai_variation = ${sanitizedData.broadcastAiVariation ?? false},
            broadcast_min_interval_seconds = ${sanitizedData.broadcastMinIntervalSeconds},
            broadcast_max_interval_seconds = ${sanitizedData.broadcastMaxIntervalSeconds},
            disconnected_alert_enabled = ${sanitizedData.disconnectedAlertEnabled},
            disconnected_alert_hours = ${sanitizedData.disconnectedAlertHours},
            disconnected_alert_message_template = ${sanitizedData.disconnectedAlertMessageTemplate},
            disconnected_ai_enabled = ${sanitizedData.disconnectedAiEnabled ?? false},
            disconnected_ai_prompt = ${sanitizedData.disconnectedAiPrompt || ''},
            ai_variation_enabled = ${sanitizedData.aiVariationEnabled ?? false},
            ai_variation_prompt = ${sanitizedData.aiVariationPrompt || ''},
            business_hours_start = ${sanitizedData.businessHoursStart},
            business_hours_end = ${sanitizedData.businessHoursEnd},
            business_days = ARRAY[${sql.raw(businessDays.join(','))}]::integer[],
            respect_business_hours = ${sanitizedData.respectBusinessHours},
            welcome_message_enabled = ${sanitizedData.welcomeMessageEnabled},
            welcome_message_variations = ${sql.raw(welcomeVariationsSQL)},
            welcome_message_ai_enabled = ${sanitizedData.welcomeMessageAiEnabled ?? false},
            welcome_message_ai_prompt = ${sanitizedData.welcomeMessageAiPrompt || ''},
            updated_at = now()
          WHERE admin_id = ${adminId}
        `);
      }

      // Regra: módulo desativado => cancelar todos os agendamentos pendentes do módulo.
      const currentConfig = await this.getAdminNotificationConfig(adminId);
      if (currentConfig) {
        const disabledTypesByModule: Array<{ enabled: boolean; types: string[]; moduleName: string }> = [
          {
            enabled: currentConfig.payment_reminder_enabled === true,
            types: ['payment_reminder'],
            moduleName: 'payment_reminder',
          },
          {
            enabled: currentConfig.overdue_reminder_enabled === true,
            types: ['overdue_reminder'],
            moduleName: 'overdue_reminder',
          },
          {
            enabled: currentConfig.periodic_checkin_enabled === true,
            types: ['checkin', 'periodic_checkin'],
            moduleName: 'checkin',
          },
          {
            enabled: currentConfig.disconnected_alert_enabled === true,
            types: ['disconnected', 'disconnected_alert'],
            moduleName: 'disconnected',
          },
        ];

        for (const moduleConfig of disabledTypesByModule) {
          if (moduleConfig.enabled) continue;

          for (const notificationType of moduleConfig.types) {
            await db.execute(sql`
              UPDATE scheduled_notifications
              SET
                status = 'cancelled',
                updated_at = NOW(),
                error_message = COALESCE(
                  NULLIF(error_message, ''),
                  ${`Cancelado automaticamente: módulo ${moduleConfig.moduleName} desativado`}
                )
              WHERE admin_id = ${adminId}
                AND status = 'pending'
                AND notification_type = ${notificationType}
            `);
          }
        }
      }
    } catch (error) {
      console.error('Error updating admin notification config:', error);
      throw error;
    }
  }

  async getAdminBroadcasts(adminId: string): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM admin_broadcasts 
        WHERE admin_id = ${adminId}
        ORDER BY created_at DESC
        LIMIT 50
      `);
      return result.rows;
    } catch (error) {
      console.error('Error getting admin broadcasts:', error);
      return [];
    }
  }

  async getRunningAdminBroadcasts(): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM admin_broadcasts
        WHERE status = 'sending'
        ORDER BY updated_at ASC
      `);
      return result.rows || [];
    } catch (error) {
      console.error('Error getting running admin broadcasts:', error);
      return [];
    }
  }

  async getAdminBroadcast(adminId: string, id: string): Promise<any | undefined> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM admin_broadcasts 
        WHERE admin_id = ${adminId} AND id = ${id}
        LIMIT 1
      `);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting admin broadcast:', error);
      return undefined;
    }
  }

  async createAdminBroadcast(data: any): Promise<string> {
    try {
      const id = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.execute(sql`
        INSERT INTO admin_broadcasts (
          id, admin_id, name, message_template, target_type, 
          target_filter, ai_variation, antibot_enabled, status,
          total_recipients, sent_count, failed_count, source_type,
          custom_recipients, campaign_context, custom_min_interval_seconds,
          custom_max_interval_seconds, custom_batch_size, custom_batch_pause_seconds
        ) VALUES (
          ${id}, ${data.adminId}, ${data.name}, ${data.messageTemplate},
          ${data.targetType}, ${JSON.stringify(data.targetFilter || {})},
          ${data.aiVariation}, ${data.antibotEnabled}, ${data.status},
          ${data.totalRecipients}, ${data.sentCount}, ${data.failedCount},
          ${data.sourceType || 'users'},
          ${JSON.stringify(data.customRecipients || [])},
          ${JSON.stringify(data.campaignContext || {})},
          ${data.customMinIntervalSeconds ?? null},
          ${data.customMaxIntervalSeconds ?? null},
          ${data.customBatchSize ?? null},
          ${data.customBatchPauseSeconds ?? null}
        )
      `);
      return id;
    } catch (error) {
      console.error('Error creating admin broadcast:', error);
      throw error;
    }
  }

  async updateAdminBroadcast(adminId: string, id: string, data: any): Promise<void> {
    try {
      // Use simple individual UPDATE statements instead of dynamic sql.join
      // sql.join was causing "syntax error at or near AND" in PostgreSQL
      
      if (data.targetFilter !== undefined || data.totalRecipients !== undefined) {
        // Snapshot/materialization update for legacy campaigns
        await db.execute(sql`UPDATE admin_broadcasts SET 
          target_filter = ${JSON.stringify(data.targetFilter || {})},
          total_recipients = ${data.totalRecipients ?? 0},
          updated_at = now()
          WHERE admin_id = ${adminId} AND id = ${id}`);
      } else if (data.status !== undefined && data.completedAt !== undefined) {
        // Final completion update (status + counts + completedAt)
        await db.execute(sql`UPDATE admin_broadcasts SET 
          status = ${data.status}, 
          sent_count = ${data.sentCount ?? 0}, 
          failed_count = ${data.failedCount ?? 0}, 
          completed_at = ${data.completedAt}, 
          updated_at = now() 
          WHERE admin_id = ${adminId} AND id = ${id}`);
      } else if (data.status !== undefined && data.startedAt !== undefined) {
        // Start update (status + startedAt)
        await db.execute(sql`UPDATE admin_broadcasts SET 
          status = ${data.status}, 
          started_at = ${data.startedAt}, 
          updated_at = now() 
          WHERE admin_id = ${adminId} AND id = ${id}`);
      } else if (data.status !== undefined) {
        // Status-only update
        await db.execute(sql`UPDATE admin_broadcasts SET 
          status = ${data.status}, 
          updated_at = now() 
          WHERE admin_id = ${adminId} AND id = ${id}`);
      } else if (data.sentCount !== undefined || data.failedCount !== undefined) {
        // Progress update (counts only)
        await db.execute(sql`UPDATE admin_broadcasts SET 
          sent_count = ${data.sentCount ?? 0}, 
          failed_count = ${data.failedCount ?? 0}, 
          updated_at = now() 
          WHERE admin_id = ${adminId} AND id = ${id}`);
      }
    } catch (error) {
      console.error('Error updating admin broadcast:', error);
      throw error;
    }
  }

  async cancelAdminBroadcast(adminId: string, id: string): Promise<void> {
    try {
      await db.execute(sql`
        UPDATE admin_broadcasts 
        SET status = 'cancelled', updated_at = now()
        WHERE admin_id = ${adminId} AND id = ${id}
      `);
    } catch (error) {
      console.error('Error cancelling admin broadcast:', error);
      throw error;
    }
  }

  async createAdminNotificationLog(data: any): Promise<string> {
    try {
      const id = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.execute(sql`
        INSERT INTO admin_notification_logs (
          id, admin_id, user_id, notification_type,
          recipient_phone, recipient_name, message_sent,
          message_original, status, metadata
        ) VALUES (
          ${id}, ${data.adminId}, ${data.userId}, ${data.notificationType},
          ${data.recipientPhone}, ${data.recipientName}, ${data.messageSent},
          ${data.messageOriginal}, ${data.status || 'pending'},
          ${JSON.stringify(data.metadata || {})}
        )
      `);
      return id;
    } catch (error) {
      console.error('Error creating admin notification log:', error);
      throw error;
    }
  }

  // ============================================================
  // BROADCAST MESSAGE LOGS
  // ============================================================

  async ensureBroadcastMessagesTable(): Promise<void> {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS admin_broadcast_messages (
          id TEXT PRIMARY KEY,
          broadcast_id TEXT NOT NULL,
          admin_id TEXT NOT NULL,
          user_id TEXT,
          recipient_phone TEXT NOT NULL,
          recipient_name TEXT NOT NULL DEFAULT 'Cliente',
          message_original TEXT,
          message_sent TEXT NOT NULL,
          ai_varied BOOLEAN DEFAULT false,
          status TEXT DEFAULT 'sent',
          error_message TEXT,
          sent_at TIMESTAMP DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_id 
        ON admin_broadcast_messages(broadcast_id)
      `);
      console.log('✅ [DB] Tabela admin_broadcast_messages garantida');
    } catch (error) {
      console.error('Error ensuring broadcast_messages table:', error);
    }
  }

  async createBroadcastMessage(data: {
    broadcastId: string;
    adminId: string;
    userId?: string;
    recipientPhone: string;
    recipientName: string;
    messageOriginal: string;
    messageSent: string;
    aiVaried: boolean;
    status: 'sent' | 'failed';
    errorMessage?: string;
  }): Promise<string> {
    try {
      const id = `bm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.execute(sql`
        INSERT INTO admin_broadcast_messages (
          id, broadcast_id, admin_id, user_id,
          recipient_phone, recipient_name,
          message_original, message_sent,
          ai_varied, status, error_message, sent_at
        ) VALUES (
          ${id}, ${data.broadcastId}, ${data.adminId}, ${data.userId || null},
          ${data.recipientPhone}, ${data.recipientName},
          ${data.messageOriginal}, ${data.messageSent},
          ${data.aiVaried}, ${data.status}, ${data.errorMessage || null}, now()
        )
      `);
      return id;
    } catch (error) {
      console.error('Error creating broadcast message log:', error);
      return '';
    }
  }

  async getBroadcastMessages(broadcastId: string): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM admin_broadcast_messages 
        WHERE broadcast_id = ${broadcastId}
        ORDER BY sent_at ASC
      `);
      return result.rows || [];
    } catch (error) {
      console.error('Error getting broadcast messages:', error);
      return [];
    }
  }

  // ============================================================
  // FOLLOW-UP PARA NÃO PAGANTES
  // ============================================================

  /**
   * Busca configuração de follow-up para não pagantes
   */
  async getNotapayerFollowupConfig(): Promise<any | null> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM followup_configs WHERE id = 1 LIMIT 1
      `);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting notapayer followup config:', error);
      return null;
    }
  }

  /**
   * Atualiza configuração de follow-up para não pagantes
   */
  async updateNotapayerFollowupConfig(data: any): Promise<any> {
    try {
      const existing = await this.getNotapayerFollowupConfig();

      if (!existing) {
        await db.execute(sql`
          INSERT INTO followup_configs (
            id, is_enabled, active_days, max_attempts,
            message_template, tone, use_emojis, active_days_start, active_days_end
          ) VALUES (
            1, ${data.isEnabled ?? false}, ${data.activeDays ?? 3}, ${data.maxAttempts ?? 3},
            ${data.messageTemplate ?? 'Olá! Seu plano expirou. Quer renovar?'}, ${data.tone ?? 'friendly'},
            ${data.useEmojis ?? true}, ${data.activeDaysStart ?? 1}, ${data.activeDaysEnd ?? 7}
          )
        `);
        return data;
      }

      await db.execute(sql`
        UPDATE followup_configs SET
          is_enabled = ${data.isEnabled ?? existing.is_enabled},
          active_days = ${data.activeDays ?? existing.active_days},
          max_attempts = ${data.maxAttempts ?? existing.max_attempts},
          message_template = ${data.messageTemplate ?? existing.message_template},
          tone = ${data.tone ?? existing.tone},
          use_emojis = ${data.useEmojis ?? existing.use_emojis},
          active_days_start = ${data.activeDaysStart ?? existing.active_days_start},
          active_days_end = ${data.activeDaysEnd ?? existing.active_days_end},
          updated_at = NOW()
        WHERE id = 1
      `);

      return data;
    } catch (error) {
      console.error('Error updating notapayer followup config:', error);
      throw error;
    }
  }

  /**
   * Busca tentativas de follow-up para um usuário
   */
  async getNotapayerFollowupAttempts(userId: string): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM followup_attempts
        WHERE user_id = ${userId}
        ORDER BY sent_at DESC
        LIMIT 20
      `);
      return result.rows || [];
    } catch (error) {
      console.error('Error getting notapayer followup attempts:', error);
      return [];
    }
  }

  /**
   * Busca histórico completo de follow-ups
   */
  async getNotapayerFollowupHistory(limit: number = 100): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM followup_attempts
        ORDER BY sent_at DESC
        LIMIT ${limit}
      `);
      return result.rows || [];
    } catch (error) {
      console.error('Error getting notapayer followup history:', error);
      return [];
    }
  }

  /**
   * Cria registro de tentativa de follow-up
   */
  async createNotapayerFollowupAttempt(data: {
    userId: string;
    subscriptionId: string | number;
    message: string;
    sentAt: Date;
    status: string;
  }): Promise<void> {
    try {
      await db.execute(sql`
        INSERT INTO followup_attempts (user_id, subscription_id, message, sent_at, status)
        VALUES (${data.userId}, ${data.subscriptionId}, ${data.message}, ${data.sentAt.toISOString()}, ${data.status})
      `);
    } catch (error) {
      console.error('Error creating notapayer followup attempt:', error);
    }
  }

  /**
   * Lista não pagantes elegíveis para follow-up
   */
  async getNotapayerFollowupList(config: any): Promise<any[]> {
    try {
      const now = new Date();
      const activeDaysStart = config.active_days_start || 1;
      const activeDaysEnd = config.active_days_end || 7;

      // Buscar assinaturas inativas ou expiradas
      const result = await db.execute(sql`
        SELECT
          s.id as subscription_id,
          s.user_id,
          u.name as user_name,
          u.email as user_email,
          u.whatsapp_number as phone,
          p.name as plan_name,
          p.price as plan_price,
          s.expires_at as expires_at,
          s.cancelled_at as cancelled_at
        FROM subscriptions s
        JOIN users u ON u.id = s.user_id
        JOIN plans p ON p.id = s.plan_id
        WHERE s.cancelled_at IS NULL
          AND s.expires_at <= ${now}
          AND s.status = 'expired'
        ORDER BY s.expires_at DESC
      `);

      const subscriptions = result.rows || [];

      // Filtrar apenas assinaturas dentro do período de follow-up
      const eligible = subscriptions.filter(sub => {
        const daysSinceExpiry = Math.floor(
          (now.getTime() - new Date(sub.expires_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysSinceExpiry >= activeDaysStart && daysSinceExpiry <= activeDaysEnd;
      });

      // Adicionar contagem de tentativas
      return await Promise.all(
        eligible.map(async (sub: any) => {
          const attempts = await this.getNotapayerFollowupAttempts(sub.user_id);
          return {
            ...sub,
            daysSinceExpiry: Math.floor(
              (now.getTime() - new Date(sub.expires_at).getTime()) / (1000 * 60 * 60 * 24)
            ),
            attempts: attempts.length,
            lastAttempt: attempts[0],
          };
        })
      );
    } catch (error) {
      console.error('Error getting notapayer followup list:', error);
      return [];
    }
  }

  // ============================================================
  // FOLLOW-UP CONFIGURATION (GLOBAL)
  // ============================================================

  /**
   * Get global follow-up configuration
   * GET /api/followup/config
   */
  async getFollowupConfig(): Promise<any | null> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM followup_configs WHERE id = 'global'
      `);
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error getting followup config:', error);
      return null;
    }
  }

  /**
   * Update global follow-up configuration
   * PUT /api/followup/config
   */
  async updateFollowupConfig(data: {
    isEnabled: boolean;
    maxAttempts?: number;
    intervalsMinutes?: number[];
    infiniteLoop?: boolean;
    infiniteLoopMinDays?: number;
    infiniteLoopMaxDays?: number;
    respectBusinessHours?: boolean;
    businessHoursStart?: string;
    businessHoursEnd?: string;
    businessDays?: number[];
    useEmojis?: boolean;
    tone?: string;
  }): Promise<any> {
    try {
      const existing = await this.getFollowupConfig();

      if (!existing) {
        // Create new config
        await db.execute(sql`
          INSERT INTO followup_configs (
            id, is_enabled, max_attempts, intervals_minutes,
            infinite_loop, infinite_loop_min_days, infinite_loop_max_days,
            respect_business_hours, business_hours_start, business_hours_end,
            business_days, use_emojis, tone
          ) VALUES (
            'global', ${data.isEnabled ?? true}, ${data.maxAttempts ?? 8},
            ${JSON.stringify(data.intervalsMinutes ?? [10, 30, 180, 1440])},
            ${data.infiniteLoop ?? true}, ${data.infiniteLoopMinDays ?? 15}, ${data.infiniteLoopMaxDays ?? 30},
            ${data.respectBusinessHours ?? true}, ${data.businessHoursStart ?? '09:00'}, ${data.businessHoursEnd ?? '18:00'},
            ${JSON.stringify(data.businessDays ?? [1, 2, 3, 4, 5])},
            ${data.useEmojis ?? true}, ${data.tone ?? 'friendly'}
          )
        `);
        return data;
      }

      // Update existing config
      await db.execute(sql`
        UPDATE followup_configs SET
          is_enabled = ${data.isEnabled ?? existing.is_enabled},
          max_attempts = ${data.maxAttempts ?? existing.max_attempts},
          intervals_minutes = ${JSON.stringify(data.intervalsMinutes ?? existing.intervals_minutes)},
          infinite_loop = ${data.infiniteLoop ?? existing.infinite_loop},
          infinite_loop_min_days = ${data.infiniteLoopMinDays ?? existing.infinite_loop_min_days},
          infinite_loop_max_days = ${data.infiniteLoopMaxDays ?? existing.infinite_loop_max_days},
          respect_business_hours = ${data.respectBusinessHours ?? existing.respect_business_hours},
          business_hours_start = ${data.businessHoursStart ?? existing.business_hours_start},
          business_hours_end = ${data.businessHoursEnd ?? existing.business_hours_end},
          business_days = ${JSON.stringify(data.businessDays ?? existing.business_days)},
          use_emojis = ${data.useEmojis ?? existing.use_emojis},
          tone = ${data.tone ?? existing.tone},
          updated_at = NOW()
        WHERE id = 'global'
      `);

      return data;
    } catch (error) {
      console.error('Error updating followup config:', error);
      throw error;
    }
  }

  /**
   * Get follow-up history logs
   * GET /api/followup/logs
   */
  async getFollowupLogs(limit: number = 100): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM followup_logs
        ORDER BY executed_at DESC
        LIMIT ${limit}
      `);
      return result.rows || [];
    } catch (error) {
      console.error('Error getting followup logs:', error);
      return [];
    }
  }

  /**
   * Get follow-up pending events
   * GET /api/followup/pending
   */
  async getFollowupPendingEvents(): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT
          a.id,
          a.contact_number,
          a.contact_name,
          a.followup_stage,
          a.next_followup_at,
          a.followup_active
        FROM admin_conversations a
        WHERE a.followup_active = true
          AND a.next_followup_at <= (NOW() AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY a.next_followup_at ASC
        LIMIT 50
      `);
      return result.rows || [];
    } catch (error) {
      console.error('Error getting followup pending events:', error);
      return [];
    }
  }

  /**
   * Get follow-up statistics
   * GET /api/followup/stats
   */
  async getFollowupStats(): Promise<any> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const result = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
          COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
          COUNT(*) FILTER (WHERE status = 'cancelled') as total_cancelled,
          COUNT(*) FILTER (WHERE status = 'skipped') as total_skipped,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE DATE(executed_at) = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')) as scheduled_today
        FROM followup_logs
        WHERE executed_at >= ${oneDayAgo.toISOString()}
      `);

      const row = result.rows[0] as any;
      return {
        totalSent: row.total_sent || 0,
        totalFailed: row.total_failed || 0,
        totalCancelled: row.total_cancelled || 0,
        totalSkipped: row.total_skipped || 0,
        pending: row.pending || 0,
        scheduledToday: row.scheduled_today || 0,
      };
    } catch (error) {
      console.error('Error getting followup stats:', error);
      return {
        totalSent: 0,
        totalFailed: 0,
        totalCancelled: 0,
        totalSkipped: 0,
        pending: 0,
        scheduledToday: 0,
      };
    }
  }

  // ============================================================
  // PENDING AI RESPONSES - Persistent Timers
  // ============================================================
  
  async savePendingAIResponse(data: {
    conversationId: string;
    userId: string;
    contactNumber: string;
    jidSuffix: string;
    messages: string[];
    executeAt: Date;
  }): Promise<void> {
    try {
      await db.execute(sql`
        INSERT INTO pending_ai_responses (
          conversation_id, user_id, contact_number, jid_suffix,
          messages, scheduled_at, execute_at, status,
          retry_count, failure_reason, last_error
        ) VALUES (
          ${data.conversationId}, ${data.userId}, ${data.contactNumber}, ${data.jidSuffix},
          ${JSON.stringify(data.messages)}, NOW(), ${data.executeAt.toISOString()}, 'pending',
          0, NULL, NULL
        )
        ON CONFLICT (conversation_id) DO UPDATE SET
          messages = ${JSON.stringify(data.messages)},
          execute_at = ${data.executeAt.toISOString()},
          status = 'pending',
          retry_count = 0,
          failure_reason = NULL,
          last_error = NULL,
          last_attempt_at = NULL,
          updated_at = NOW()
      `);
      console.log(`💾 [PERSISTENT TIMER] Salvo para ${data.contactNumber} - executa às ${data.executeAt.toISOString()}`);
    } catch (error) {
      console.error('Error saving pending AI response:', error);
      throw error;
    }
  }

  async getPendingAIResponse(conversationId: string): Promise<{
    id: string;
    conversationId: string;
    userId: string;
    contactNumber: string;
    jidSuffix: string;
    messages: string[];
    executeAt: Date;
    status: string;
    retryCount: number;
    lastError?: string | null;
  } | null> {
    try {
      const result = await db.execute(sql`
        SELECT id, conversation_id, user_id, contact_number, jid_suffix,
               messages, execute_at, status,
               COALESCE(retry_count, 0) as retry_count,
               last_error
        FROM pending_ai_responses
        WHERE conversation_id = ${conversationId} AND status = 'pending'
      `);
      
      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0] as any;
        return {
          id: row.id,
          conversationId: row.conversation_id,
          userId: row.user_id,
          contactNumber: row.contact_number,
          jidSuffix: row.jid_suffix,
          messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages,
          executeAt: new Date(row.execute_at),
          status: row.status,
          retryCount: Number(row.retry_count) || 0,
          lastError: row.last_error || null
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting pending AI response:', error);
      return null;
    }
  }

  async updatePendingAIResponseMessages(
    conversationId: string,
    messages: string[],
    executeAt: Date,
    options?: { resetRetry?: boolean },
  ): Promise<void> {
    try {
      if (options?.resetRetry) {
        await db.execute(sql`
          UPDATE pending_ai_responses
          SET messages = ${JSON.stringify(messages)},
              execute_at = ${executeAt.toISOString()},
              retry_count = 0,
              failure_reason = NULL,
              last_error = NULL,
              last_attempt_at = NULL,
              updated_at = NOW()
          WHERE conversation_id = ${conversationId} AND status = 'pending'
        `);
      } else {
        await db.execute(sql`
          UPDATE pending_ai_responses
          SET messages = ${JSON.stringify(messages)},
              execute_at = ${executeAt.toISOString()},
              updated_at = NOW()
          WHERE conversation_id = ${conversationId} AND status = 'pending'
        `);
      }
      console.log(`📝 [PERSISTENT TIMER] Atualizado para conversation ${conversationId} - ${messages.length} msgs`);
    } catch (error) {
      console.error('Error updating pending AI response messages:', error);
      throw error;
    }
  }

  async replacePendingAIResponseMessages(conversationId: string, messages: string[]): Promise<void> {
    try {
      await db.execute(sql`
        UPDATE pending_ai_responses
        SET messages = ${JSON.stringify(messages)},
            updated_at = NOW()
        WHERE conversation_id = ${conversationId} AND status = 'pending'
      `);
      console.log(`📝 [PERSISTENT TIMER] Payload normalizado para conversation ${conversationId}`);
    } catch (error) {
      console.error('Error replacing pending AI response messages:', error);
      throw error;
    }
  }

  async deletePendingAIResponse(conversationId: string): Promise<void> {
    try {
      await db.execute(sql`
        DELETE FROM pending_ai_responses
        WHERE conversation_id = ${conversationId}
      `);
      console.log(`🗑️ [PERSISTENT TIMER] Removido para conversation ${conversationId}`);
    } catch (error) {
      console.error('Error deleting pending AI response:', error);
    }
  }

  async getPendingAIResponsesForRestore(): Promise<Array<{
    id: string;
    conversationId: string;
    userId: string;
    connectionId?: string;
    contactNumber: string;
    jidSuffix: string;
    messages: string[];
    executeAt: Date;
    scheduledAt: Date;
    retryCount: number;
    lastError?: string | null;
  }>> {
    try {
      // 🔧 FIX 2026-02-24: REMOVIDO filtro de 2 horas que tornava timers invisíveis!
      // O filtro anterior (execute_at > NOW() - INTERVAL '2 hours') fazia com que
      // timers com mais de 2h ficassem PERMANENTEMENTE presos como 'pending' mas
      // nunca processados pelo CRON. O CRON agora gerencia stale timers:
      // - >24h: marca como 'failed' (stale_over_24h)
      // - ≤24h: processa normalmente com prioridade para antigos
      // LIMIT 200 previne storm em caso de acúmulo massivo
      const result = await db.execute(sql`
        SELECT 
          p.id,
          p.conversation_id,
          p.user_id,
          c.connection_id,
          p.contact_number,
          p.jid_suffix,
          p.messages,
          p.execute_at,
          p.scheduled_at,
          COALESCE(p.retry_count, 0) as retry_count,
          p.last_error
        FROM pending_ai_responses p
        LEFT JOIN conversations c ON c.id = p.conversation_id
        WHERE p.status = 'pending'
        ORDER BY p.execute_at ASC
        LIMIT 200
      `);
      
      if (result.rows && result.rows.length > 0) {
        return (result.rows as any[]).map(row => ({
          id: row.id,
          conversationId: row.conversation_id,
          userId: row.user_id,
          connectionId: row.connection_id || undefined,
          contactNumber: row.contact_number,
          jidSuffix: row.jid_suffix,
          messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages,
          executeAt: new Date(row.execute_at),
          scheduledAt: new Date(row.scheduled_at),
          retryCount: Number(row.retry_count) || 0,
          lastError: row.last_error || null
        }));
      }
      return [];
    } catch (error) {
      console.error('Error getting pending AI responses for restore:', error);
      return [];
    }
  }

  async markPendingAIResponseCompleted(conversationId: string, guard?: PendingAIResponseMutationGuard): Promise<void> {
    try {
      await db.execute(sql`
        UPDATE pending_ai_responses
        SET status = 'completed',
            failure_reason = NULL,
            last_error = NULL,
            updated_at = NOW()
        WHERE conversation_id = ${conversationId}
          ${buildPendingAIResponseMutationGuard(guard)}
      `);
    } catch (error) {
      console.error('Error marking pending AI response as completed:', error);
    }
  }

  async markPendingAIResponseFailed(
    conversationId: string,
    reason: string,
    lastError?: string,
    guard?: PendingAIResponseMutationGuard,
  ): Promise<void> {
    try {
      console.log(`⚠️ [DB] Marcando timer como FAILED: ${conversationId} - Razão: ${reason}`);
      await db.execute(sql`
        UPDATE pending_ai_responses
        SET status = 'failed',
            failure_reason = ${reason},
            last_error = ${lastError || null},
            last_attempt_at = NOW(),
            updated_at = NOW()
        WHERE conversation_id = ${conversationId}
          ${buildPendingAIResponseMutationGuard(guard)}
      `);
    } catch (error) {
      console.error('Error marking pending AI response as failed:', error);
    }
  }

  async markPendingAIResponseSkipped(
    conversationId: string,
    reason: string,
    guard?: PendingAIResponseMutationGuard,
  ): Promise<void> {
    const markAsCompletedFallback = async (): Promise<void> => {
      await db.execute(sql`
        UPDATE pending_ai_responses
        SET status = 'completed',
            failure_reason = ${`skipped:${reason}`},
            last_attempt_at = NOW(),
            updated_at = NOW()
        WHERE conversation_id = ${conversationId}
          ${buildPendingAIResponseMutationGuard(guard)}
      `);
    };

    try {
      if (this.pendingAiSkippedUnsupported) {
        await markAsCompletedFallback();
        return;
      }

      console.log(`⏭️ [DB] Marcando timer como SKIPPED: ${conversationId} - Razão: ${reason}`);
      await db.execute(sql`
        UPDATE pending_ai_responses
        SET status = 'skipped',
            failure_reason = ${reason},
            last_attempt_at = NOW(),
            updated_at = NOW()
        WHERE conversation_id = ${conversationId}
          ${buildPendingAIResponseMutationGuard(guard)}
      `);
    } catch (error: any) {
      // Alguns ambientes ainda têm CHECK sem o status "skipped".
      // Nesses casos, concluir o timer evita loop infinito de retry.
      if (isPendingAiSkippedConstraintError(error)) {
        this.pendingAiSkippedUnsupported = true;
        const errorCode = getDbErrorCode(error) || "unknown";
        const constraint = getDbConstraintName(error) || "unknown";
        console.warn(`⚠️ [DB] status='skipped' não permitido (code=${errorCode}, constraint=${constraint}). Convertendo para completed (conversation=${conversationId}, reason=${reason}).`);
        try {
          await markAsCompletedFallback();
          return;
        } catch (fallbackError) {
          console.error('Error marking pending AI response as completed fallback:', fallbackError);
          return;
        }
      }
      console.error('Error marking pending AI response as skipped:', error);
    }
  }

  async resetPendingAIResponseForRetry(
    conversationId: string,
    delaySec: number = 30,
    guard?: PendingAIResponseMutationGuard,
  ): Promise<void> {
    try {
      console.log(`🔄 [DB] Resetando timer para retry em ${delaySec}s: ${conversationId}`);
      await db.execute(sql`
        UPDATE pending_ai_responses
        SET status = 'pending',
            scheduled_at = NOW(),
            execute_at = NOW() + (${delaySec} || ' seconds')::interval,
            retry_count = COALESCE(retry_count, 0) + 1,
            last_attempt_at = NOW(),
            updated_at = NOW()
        WHERE conversation_id = ${conversationId}
          ${buildPendingAIResponseMutationGuard(guard)}
      `);
    } catch (error) {
      console.error('Error resetting pending AI response for retry:', error);
    }
  }

  // 🔄 AUTO-RECUPERAÇÃO: Busca timers "failed" com razões transitórias que podem ser retentados
  async getFailedTransientTimers(): Promise<Array<{
    conversationId: string;
    userId: string;
    contactNumber: string;
    jidSuffix: string;
    messages: string[];
    failureReason: string;
    retryCount: number;
  }>> {
    try {
      const result = await db.execute(sql`
        SELECT p.conversation_id, p.user_id, p.contact_number, p.jid_suffix, p.messages,
               p.failure_reason, COALESCE(p.retry_count, 0) as retry_count
        FROM pending_ai_responses p
        INNER JOIN whatsapp_connections c ON c.user_id = p.user_id::text
          AND (
            c.is_connected = true
            OR (
              c.provider = 'baileys'
              AND COALESCE(NULLIF(c.connection_method, ''), 'qr') <> 'coexistence'
              AND COALESCE(NULLIF(c.provider_status, ''), 'inactive') = 'connected'
            )
          )
          AND c.ai_enabled = true
        WHERE p.status = 'failed'
          AND p.updated_at > NOW() - INTERVAL '2 hours'
          AND (
            p.failure_reason LIKE 'connection_closed_max_retries_%'
            OR p.failure_reason LIKE 'send_failed_max_retries_%'
            OR p.failure_reason = 'session_unavailable_offline'
          )
          AND COALESCE(p.retry_count, 0) < 20
        ORDER BY p.updated_at ASC
        LIMIT 15
      `);
      if (result.rows && result.rows.length > 0) {
        return result.rows.map((row: any) => ({
          conversationId: row.conversation_id,
          userId: row.user_id,
          contactNumber: row.contact_number,
          jidSuffix: row.jid_suffix || 's.whatsapp.net',
          messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : (row.messages || []),
          failureReason: row.failure_reason,
          retryCount: Number(row.retry_count) || 0,
        }));
      }
      return [];
    } catch (error) {
      console.error('Error getting failed transient timers:', error);
      return [];
    }
  }

  // 🚨 AUTO-RECUPERAÇÃO: Busca timers "completed" que na verdade não receberam resposta
  // Isso captura casos onde o timer foi marcado completed mas a resposta falhou
  

  // Idempotency helper for AI timers: cheap DB check to avoid re-sending when a reply already exists.
  async getConversationLastMessageTimes(conversationId: string): Promise<{
    lastCustomerAt: Date | null;
    lastAgentAt: Date | null;
    lastOwnerAt: Date | null;
  }> {
    try {
        // "queued" ja significa que o callback de envio real retornou com sucesso.
        // Se ignorarmos esse status, os crons de recovery entendem que a conversa
        // segue sem resposta e reprocessam o mesmo timer em loop.
        const result = await db.execute(sql`
          SELECT
            MAX(timestamp) FILTER (WHERE from_me = false) AS last_customer_at,
            MAX(timestamp) FILTER (
              WHERE from_me = true
                AND is_from_agent = true
            ) AS last_agent_at,
            MAX(timestamp) FILTER (
              WHERE from_me = true
                AND COALESCE(is_from_agent, false) = false
            ) AS last_owner_at
          FROM messages
          WHERE conversation_id = ${conversationId}
        `);

      const row = (result.rows as any[] | undefined)?.[0];
      return {
        lastCustomerAt: row?.last_customer_at ? new Date(row.last_customer_at) : null,
        lastAgentAt: row?.last_agent_at ? new Date(row.last_agent_at) : null,
        lastOwnerAt: row?.last_owner_at ? new Date(row.last_owner_at) : null,
      };
    } catch (error) {
      console.error('Error getting conversation last message times:', error);
      return { lastCustomerAt: null, lastAgentAt: null, lastOwnerAt: null };
    }
  }
async getCompletedTimersWithoutResponse(): Promise<Array<{
    conversationId: string;
    userId: string;
    contactNumber: string;
    jidSuffix: string;
    messages: string[];
  }>> {
    try {
      // Buscar timers "completed" cujo cliente ainda segue sem resposta confirmada.
      // A janela considera a última mensagem do cliente, não o updated_at do timer,
      // para não perder conversas onde a fila falhou antes e o cliente escreveu horas depois.
      const result = await db.execute(sql`
        SELECT 
          p.conversation_id,
          p.user_id,
          p.contact_number,
          p.jid_suffix,
          p.messages,
          (
            SELECT MAX(m.timestamp)
            FROM messages m
            WHERE m.conversation_id = p.conversation_id
              AND m.from_me = false
          ) AS last_customer_at,
          (
            SELECT MAX(m.timestamp)
            FROM messages m
            WHERE m.conversation_id = p.conversation_id
              AND m.from_me = true
              AND m.is_from_agent = true
          ) AS last_agent_at,
          (
            SELECT MAX(m.timestamp)
            FROM messages m
            WHERE m.conversation_id = p.conversation_id
              AND m.from_me = true
              AND COALESCE(m.is_from_agent, false) = false
          ) AS last_owner_at
        FROM pending_ai_responses p
        JOIN conversations c ON c.id = p.conversation_id
        WHERE p.status = 'completed'
        ORDER BY p.updated_at DESC
        LIMIT 80
      `);
      
      if (result.rows && result.rows.length > 0) {
        const recoverableRows = (result.rows as any[]).filter((row) =>
          shouldRecoverCompletedTimer({
            lastCustomerAt: row.last_customer_at ? new Date(row.last_customer_at) : null,
            lastAgentAt: row.last_agent_at ? new Date(row.last_agent_at) : null,
            lastOwnerAt: row.last_owner_at ? new Date(row.last_owner_at) : null,
            maxCustomerSilenceHours: 24,
          }),
        );

        if (recoverableRows.length > 0) {
          console.log(`🚨 [AUTO-RECOVERY] Encontrados ${recoverableRows.length} timers "completed" sem resposta confirmada`);
        }

        return recoverableRows.map(row => ({
          conversationId: row.conversation_id,
          userId: row.user_id,
          contactNumber: row.contact_number,
          jidSuffix: row.jid_suffix || 's.whatsapp.net',
          messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Error getting completed timers without response:', error);
      return [];
    }
  }
}

export const storage = new DatabaseStorage();
