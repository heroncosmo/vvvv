import { sql } from "drizzle-orm";

import { db } from "./db";
import { parseDelivery2Order } from "./delivery2OrderHelpers";
import { clampScore, resolveLeadDisplayName, trimText } from "./leadIntelligenceHelpers";
import { supabase } from "./supabaseAuth";

const DELIVERY2_ANALYSIS_VERSION = "delivery2-v2";
const DELIVERY2_OPEN_STATUSES = ["pending", "confirmed", "preparing", "ready", "out_for_delivery"] as const;

type Delivery2ConversationContextRow = {
  conversation_id: string;
  connection_id: string;
  user_id: string;
  contact_number: string;
  contact_name: string | null;
  connection_name: string | null;
  source_phone_number: string | null;
  source_account_name: string | null;
  source_account_email: string | null;
};

type Delivery2MessageContextRow = {
  from_me: boolean;
  is_from_agent: boolean;
  text: string | null;
  media_caption: string | null;
  timestamp: Date | string;
};

type Delivery2MenuItemRow = {
  category_name: string | null;
  item_name: string;
  item_description: string | null;
  base_price: string | number | null;
  promotional_price: string | number | null;
  options_json: Array<Record<string, any>> | null;
  half_half_pricing: Record<string, any> | null;
};

type Delivery2ExistingOrderRow = {
  id: string;
  status: string | null;
  summary: string | null;
};

export type Delivery2OrderItemRecord = {
  id: string;
  orderId: string;
  lineNumber: number;
  itemName: string;
  quantity: number;
  sizeLabel: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
  notes: string | null;
  selectedOptions: string[];
  halfAndHalf: string[];
};

export type Delivery2OrderRecord = {
  id: string;
  conversationId: string;
  connectionId: string;
  userId: string;
  contactNumber: string;
  contactName: string | null;
  customerName: string | null;
  status: "pending" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";
  deliveryType: "delivery" | "pickup" | null;
  paymentMethod: string | null;
  customerAddress: string | null;
  customerComplement: string | null;
  customerReference: string | null;
  notes: string | null;
  summary: string | null;
  evidence: string[];
  subtotal: number | null;
  deliveryFee: number | null;
  total: number | null;
  confidence: number;
  finalizedAt: string | null;
  lastCustomerMessage: string | null;
  lastAgentMessage: string | null;
  lastAnalyzedAt: string | null;
  analysisVersion: string;
  sourceConnectionName: string | null;
  sourceConnectionPhone: string | null;
  sourceAccountName: string | null;
  sourceAccountEmail: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  items: Delivery2OrderItemRecord[];
  rawAnalysis: Record<string, unknown>;
};

type Delivery2ListParams = {
  userId: string;
  connectionIds: string[];
  query?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
};

type Delivery2ReportParams = {
  userId: string;
  connectionIds: string[];
  startDate?: string;
  endDate?: string;
};

const pendingDelivery2Analysis = new Map<string, Promise<Delivery2OrderRecord | null>>();
const pendingDelivery2Refresh = new Map<string, Promise<void>>();
const delivery2RefreshTimestamps = new Map<string, number>();

function buildSqlTextList(values: string[]) {
  return sql.join(
    values
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => sql`${value}`),
    sql`, `,
  );
}

function parseNumericAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function getMessageBody(message?: Delivery2MessageContextRow | null) {
  return trimText(message?.text || message?.media_caption || "", 600);
}

function formatTranscriptTimestamp(value?: Date | string | null) {
  if (!value) return "sem horario";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem horario";

  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDelivery2Transcript(messages: Delivery2MessageContextRow[]) {
  return messages
    .map((message) => {
      const body = getMessageBody(message) || "(sem texto)";
      const speaker = message.from_me ? (message.is_from_agent ? "IA" : "DONO") : "CLIENTE";
      return `[${formatTranscriptTimestamp(message.timestamp)}] ${speaker}: ${body}`;
    })
    .join("\n");
}

function buildMenuDigest(menuRows: Delivery2MenuItemRow[]) {
  const grouped = new Map<string, string[]>();

  for (const row of menuRows) {
    const categoryName = trimText(row.category_name || "Sem categoria", 80) || "Sem categoria";
    const options = Array.isArray(row.options_json) ? row.options_json : [];
    const sizeGroup = options.find((group) => trimText(group?.name, 40).toLowerCase() === "tamanho");
    const sizeText = Array.isArray(sizeGroup?.options)
      ? sizeGroup.options
          .map((option: Record<string, any>) => {
            const optionName = trimText(option?.name, 40);
            const optionPrice = parseNumericAmount(option?.price);
            return optionName ? `${optionName}${optionPrice !== null ? ` ${optionPrice.toFixed(2)}` : ""}` : "";
          })
          .filter(Boolean)
          .join(" | ")
      : "";
    const basePrice = parseNumericAmount(row.promotional_price ?? row.base_price);
    const description = trimText(row.item_description || "", 180);
    const halfHalfEnabled = row.half_half_pricing?.enabled === true;
    const parts = [
      `- ${trimText(row.item_name, 120)}`,
      description ? `ingredientes: ${description}` : "",
      sizeText ? `tamanhos: ${sizeText}` : basePrice !== null ? `preco: ${basePrice.toFixed(2)}` : "",
      halfHalfEnabled ? "meio a meio: sim, cobrar pelo sabor mais caro da mesma categoria e tamanho" : "",
    ].filter(Boolean);

    if (!grouped.has(categoryName)) {
      grouped.set(categoryName, []);
    }
    grouped.get(categoryName)!.push(parts.join(" | "));
  }

  if (grouped.size === 0) {
    return "Cardapio nao encontrado.";
  }

  return Array.from(grouped.entries())
    .map(([categoryName, items]) => `${categoryName}:\n${items.join("\n")}`)
    .join("\n\n");
}

function mapDelivery2OrderRow(row: Record<string, any>): Delivery2OrderRecord {
  const rawEvidence = Array.isArray(row.evidence_json) ? row.evidence_json : [];

  return {
    id: String(row.id || ""),
    conversationId: String(row.conversation_id || ""),
    connectionId: String(row.connection_id || ""),
    userId: String(row.user_id || ""),
    contactNumber: String(row.contact_number || ""),
    contactName: row.contact_name ? String(row.contact_name) : null,
    customerName: row.customer_name ? String(row.customer_name) : null,
    status: (row.status || "pending") as Delivery2OrderRecord["status"],
    deliveryType: row.delivery_type === "pickup" ? "pickup" : row.delivery_type === "delivery" ? "delivery" : null,
    paymentMethod: row.payment_method ? String(row.payment_method) : null,
    customerAddress: row.customer_address ? String(row.customer_address) : null,
    customerComplement: row.customer_complement ? String(row.customer_complement) : null,
    customerReference: row.customer_reference ? String(row.customer_reference) : null,
    notes: row.notes ? String(row.notes) : null,
    summary: row.summary ? String(row.summary) : null,
    evidence: rawEvidence.map((entry: unknown) => String(entry)).filter(Boolean),
    subtotal: parseNumericAmount(row.subtotal),
    deliveryFee: parseNumericAmount(row.delivery_fee),
    total: parseNumericAmount(row.total),
    confidence: clampScore(Number(row.confidence || 0)),
    finalizedAt: row.finalized_at ? new Date(row.finalized_at).toISOString() : null,
    lastCustomerMessage: row.last_customer_message ? String(row.last_customer_message) : null,
    lastAgentMessage: row.last_agent_message ? String(row.last_agent_message) : null,
    lastAnalyzedAt: row.last_analyzed_at ? new Date(row.last_analyzed_at).toISOString() : null,
    analysisVersion: String(row.analysis_version || DELIVERY2_ANALYSIS_VERSION),
    sourceConnectionName: row.source_connection_name ? String(row.source_connection_name) : null,
    sourceConnectionPhone: row.source_connection_phone ? String(row.source_connection_phone) : null,
    sourceAccountName: row.source_account_name ? String(row.source_account_name) : null,
    sourceAccountEmail: row.source_account_email ? String(row.source_account_email) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    items: [],
    rawAnalysis:
      row.raw_analysis && typeof row.raw_analysis === "object"
        ? (row.raw_analysis as Record<string, unknown>)
        : {},
  };
}

function mapDelivery2OrderItemRow(row: Record<string, any>): Delivery2OrderItemRecord {
  return {
    id: String(row.id || ""),
    orderId: String(row.order_id || ""),
    lineNumber: Number(row.line_number || 0),
    itemName: String(row.item_name || ""),
    quantity: Math.max(1, Number(row.quantity || 1)),
    sizeLabel: row.size_label ? String(row.size_label) : null,
    unitPrice: parseNumericAmount(row.unit_price),
    totalPrice: parseNumericAmount(row.total_price),
    notes: row.notes ? String(row.notes) : null,
    selectedOptions: Array.isArray(row.selected_options_json)
      ? row.selected_options_json.map((entry: unknown) => String(entry)).filter(Boolean)
      : [],
    halfAndHalf: Array.isArray(row.half_and_half_json)
      ? row.half_and_half_json.map((entry: unknown) => String(entry)).filter(Boolean)
      : [],
  };
}

async function getDelivery2MenuRows(userId: string) {
  const result = await db.execute(sql`
    SELECT
      c.name AS category_name,
      c.half_half_pricing AS half_half_pricing,
      i.name AS item_name,
      i.description AS item_description,
      i.price AS base_price,
      i.promotional_price,
      i.options AS options_json
    FROM menu_items i
    LEFT JOIN menu_categories c ON c.id = i.category_id
    WHERE i.user_id = ${userId}
      AND COALESCE(i.is_available, true) = true
      AND (c.id IS NULL OR COALESCE(c.is_active, true) = true)
    ORDER BY c.display_order ASC NULLS LAST, i.display_order ASC, i.name ASC
  `);

  return (((result as any)?.rows || []) as Delivery2MenuItemRow[]).map((row) => ({
    category_name: row.category_name ? String(row.category_name) : null,
    item_name: String(row.item_name || ""),
    item_description: row.item_description ? String(row.item_description) : null,
    base_price: row.base_price ?? null,
    promotional_price: row.promotional_price ?? null,
    options_json: Array.isArray(row.options_json) ? row.options_json : [],
    half_half_pricing: row.half_half_pricing && typeof row.half_half_pricing === "object" ? row.half_half_pricing : null,
  }));
}

export async function getDelivery2RuntimeState(userId: string) {
  const [delivery2ConfigResult, legacyDeliveryConfigResult] = await Promise.all([
    supabase
      .from("delivery2_config")
      .select("is_active, send_to_ai, display_name")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("delivery_config")
      .select("is_active, send_to_ai")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const moduleActive = !!delivery2ConfigResult.data?.is_active;
  const trackerRequested = delivery2ConfigResult.data?.send_to_ai !== false;
  const legacyDeliveryActive =
    !!legacyDeliveryConfigResult.data?.is_active && legacyDeliveryConfigResult.data?.send_to_ai !== false;

  return {
    moduleActive,
    trackerRequested,
    legacyDeliveryActive,
    trackingEnabled: moduleActive && trackerRequested && !legacyDeliveryActive,
    config: delivery2ConfigResult.data || null,
  };
}

async function getConversationDelivery2Context(conversationId: string) {
  const conversationResult = await db.execute(sql`
    SELECT
      c.id AS conversation_id,
      c.connection_id,
      wc.user_id,
      c.contact_number,
      c.contact_name,
      wc.connection_name,
      wc.phone_number AS source_phone_number,
      u.name AS source_account_name,
      u.email AS source_account_email
    FROM conversations c
    INNER JOIN whatsapp_connections wc ON wc.id = c.connection_id
    INNER JOIN users u ON u.id = wc.user_id
    WHERE c.id = ${conversationId}
    LIMIT 1
  `);

  const conversationRow = (conversationResult as any)?.rows?.[0] as Delivery2ConversationContextRow | undefined;
  if (!conversationRow) {
    return null;
  }

  const messagesResult = await db.execute(sql`
    SELECT
      from_me,
      is_from_agent,
      text,
      media_caption,
      timestamp
    FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY timestamp DESC
    LIMIT 40
  `);

  const messages = (((messagesResult as any)?.rows || []) as Delivery2MessageContextRow[]).reverse();
  return {
    conversation: conversationRow,
    messages,
  };
}

async function getExistingLatestDelivery2Order(conversationId: string) {
  const result = await db.execute(sql`
    SELECT
      id,
      status,
      summary
    FROM delivery2_orders
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC
    LIMIT 1
  `);

  return ((result as any)?.rows?.[0] || null) as Delivery2ExistingOrderRow | null;
}

function buildDelivery2ExtractionPrompt(params: {
  businessName: string;
  conversation: Delivery2ConversationContextRow;
  messages: Delivery2MessageContextRow[];
  latestAgentReply: string;
  menuDigest: string;
  previousOrder: Delivery2ExistingOrderRow | null;
}) {
  const transcript = formatDelivery2Transcript(params.messages);
  const nowInBrazil = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return [
    "Voce audita conversas finalizadas de delivery para alimentar um PDV interno.",
    "Nao existe fluxo proprio aqui. A conversa ja aconteceu. Sua tarefa e apenas decidir se ha um pedido realmente fechado e estruturado o suficiente para virar pedido no painel.",
    "Crie pedido apenas quando a conversa mostrar fechamento real do pedido.",
    "Para status pending, exija itens definidos e fechamento operacional do pedido.",
    "Considere fechamento operacional quando o pedido estiver pronto para producao: itens fechados, tamanho e quantidade definidos e um aceite claro do cliente ou uma confirmacao operacional da IA seguida de concordancia do cliente.",
    "Se a IA resumiu o pedido completo e o cliente apenas respondeu com pagamento, aceite final, endereco final, retirada, 'pix', 'ok', 'isso mesmo', 'pode fechar', 'confirmo' ou equivalente, isso conta como pedido fechado.",
    "Se for delivery, exija endereco suficiente para entrega. Complemento e referencia podem ser nulos.",
    "Se for retirada, endereco pode ser null.",
    "Se ainda estiver cotando, escolhendo sabores, sem tamanho, sem quantidade ou sem confirmacao final, use not_finalized.",
    "Nao bloqueie o pedido por falta de complemento ou referencia.",
    "Nao transforme conversa vaga em pedido. Se o cliente ainda estiver indeciso ou sem itens claros, use not_finalized.",
    "Se houver cancelamento explicito de um pedido que ja estava fechado, use cancelled.",
    "Use apenas itens e precos existentes no cardapio fornecido. Nao invente sabores, tamanhos, adicionais ou valores.",
    "Quando houver pizza meio a meio, registre o item com name='Pizza', preencha halfAndHalf com os sabores e use o valor do sabor mais caro da mesma categoria e tamanho.",
    "selectedOptions deve listar borda, adicionais e observacoes curtas relacionadas ao item.",
    "summary deve ser curta e operacional.",
    "evidence deve ter no maximo 4 frases curtas.",
    "confidence deve ser inteiro de 0 a 100.",
    "Retorne somente JSON valido com estas chaves exatas:",
    "{",
    '  "hasFinalizedOrder": boolean,',
    '  "status": "pending" | "not_finalized" | "cancelled",',
    '  "customerName": string | null,',
    '  "deliveryType": "delivery" | "pickup" | null,',
    '  "paymentMethod": string | null,',
    '  "customerAddress": string | null,',
    '  "customerComplement": string | null,',
    '  "customerReference": string | null,',
    '  "notes": string | null,',
    '  "summary": string,',
    '  "evidence": string[],',
    '  "subtotal": number | null,',
    '  "deliveryFee": number | null,',
    '  "total": number | null,',
    '  "confidence": number,',
    '  "items": [',
    "    {",
    '      "name": string,',
    '      "quantity": number,',
    '      "size": string | null,',
    '      "unitPrice": number | null,',
    '      "totalPrice": number | null,',
    '      "notes": string | null,',
    '      "selectedOptions": string[],',
    '      "halfAndHalf": string[]',
    "    }",
    "  ]",
    "}",
    "",
    `AGORA_NO_BRASIL: ${nowInBrazil}`,
    `NEGOCIO: ${params.businessName}`,
    `CONTATO: ${resolveLeadDisplayName(params.conversation.contact_name, params.conversation.contact_number)}`,
    `NUMERO: ${trimText(params.conversation.contact_number, 60)}`,
    `ULTIMA_RESPOSTA_IA: ${trimText(params.latestAgentReply, 400) || "(sem resposta recente)"}`,
    `ULTIMO_PEDIDO_EXTRAIDO: ${trimText(params.previousOrder?.summary || "", 220) || "nenhum"}`,
    "",
    "CARDAPIO_OPERACIONAL:",
    params.menuDigest,
    "",
    "TRANSCRICAO:",
    transcript || "(sem mensagens)",
  ].join("\n");
}

async function requestStrictDelivery2OrderJson(params: {
  businessName: string;
  conversation: Delivery2ConversationContextRow;
  messages: Delivery2MessageContextRow[];
  latestAgentReply: string;
  menuDigest: string;
  previousOrder: Delivery2ExistingOrderRow | null;
}) {
  const completion: any = await Promise.resolve({
    messages: [
      {
        role: "system",
        content:
          "Voce corrige respostas JSON para uso interno. Retorne apenas um unico objeto JSON valido, minificado e sem comentarios.",
      },
      {
        role: "user",
        content: [
          buildDelivery2ExtractionPrompt(params),
          "",
          "Retorne agora apenas um JSON valido e minificado, sem markdown, sem texto extra.",
        ].join("\n"),
      },
    ],
    maxTokens: 700,
    temperature: 0,
    skipMistralQueue: true,
  });

  const rawText = String(completion.choices?.[0]?.message?.content || "").trim();
  if (!rawText) {
    throw new Error("A IA nao retornou JSON estrito de Delivery 2.0");
  }

  return rawText;
}

async function fetchOrderItemsByOrderIds(orderIds: string[]) {
  if (!orderIds.length) return new Map<string, Delivery2OrderItemRecord[]>();

  const result = await db.execute(sql`
    SELECT
      id,
      order_id,
      line_number,
      item_name,
      quantity,
      size_label,
      unit_price,
      total_price,
      notes,
      selected_options_json,
      half_and_half_json
    FROM delivery2_order_items
    WHERE order_id IN (${buildSqlTextList(orderIds)})
    ORDER BY line_number ASC, created_at ASC
  `);

  const map = new Map<string, Delivery2OrderItemRecord[]>();
  for (const row of ((result as any)?.rows || []) as Record<string, any>[]) {
    const item = mapDelivery2OrderItemRow(row);
    if (!map.has(item.orderId)) {
      map.set(item.orderId, []);
    }
    map.get(item.orderId)!.push(item);
  }

  return map;
}

async function loadOrderById(orderId: string) {
  const result = await db.execute(sql`
    SELECT
      o.*,
      wc.connection_name AS source_connection_name,
      wc.phone_number AS source_connection_phone,
      u.name AS source_account_name,
      u.email AS source_account_email
    FROM delivery2_orders o
    INNER JOIN whatsapp_connections wc ON wc.id = o.connection_id
    INNER JOIN users u ON u.id = o.user_id
    WHERE o.id = ${orderId}
    LIMIT 1
  `);

  const row = (result as any)?.rows?.[0];
  if (!row) return null;

  const order = mapDelivery2OrderRow(row);
  const itemsMap = await fetchOrderItemsByOrderIds([order.id]);
  order.items = itemsMap.get(order.id) || [];
  return order;
}

async function replaceOrderItems(orderId: string, items: ReturnType<typeof parseDelivery2Order>["items"]) {
  await db.execute(sql`DELETE FROM delivery2_order_items WHERE order_id = ${orderId}`);

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    await db.execute(sql`
      INSERT INTO delivery2_order_items (
        order_id,
        line_number,
        item_name,
        quantity,
        size_label,
        unit_price,
        total_price,
        notes,
        selected_options_json,
        half_and_half_json
      ) VALUES (
        ${orderId},
        ${index + 1},
        ${item.name},
        ${item.quantity},
        ${item.size},
        ${item.unitPrice},
        ${item.totalPrice},
        ${item.notes},
        ${JSON.stringify(item.selectedOptions || [])}::jsonb,
        ${JSON.stringify(item.halfAndHalf || [])}::jsonb
      )
    `);
  }
}

function normalizeParsedOrder(parsed: ReturnType<typeof parseDelivery2Order>) {
  const sanitizedItems = parsed.items
    .map((item) => ({
      ...item,
      quantity: Math.max(1, item.quantity || 1),
      unitPrice: item.unitPrice !== null ? Math.max(0, item.unitPrice) : null,
      totalPrice:
        item.totalPrice !== null
          ? Math.max(0, item.totalPrice)
          : item.unitPrice !== null
            ? Math.max(0, item.unitPrice * item.quantity)
            : null,
    }))
    .filter((item) => item.name);

  const subtotal = sanitizedItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const deliveryFee = parsed.deliveryFee !== null ? Math.max(0, parsed.deliveryFee) : 0;
  const total = parsed.total !== null ? Math.max(0, parsed.total) : subtotal + deliveryFee;

  return {
    ...parsed,
    hasFinalizedOrder: parsed.status === "pending" ? true : parsed.hasFinalizedOrder,
    summary: trimText(parsed.summary, 260),
    notes: trimText(parsed.notes || "", 260) || null,
    evidence: parsed.evidence.slice(0, 4),
    subtotal,
    deliveryFee,
    total,
    confidence: clampScore(parsed.confidence),
    items: sanitizedItems,
  };
}

async function analyzeConversationDelivery2Order(params: {
  conversationId: string;
  latestAgentReply?: string;
}) {
  const context = await getConversationDelivery2Context(params.conversationId);
  if (!context) {
    return null;
  }

  const runtimeState = await getDelivery2RuntimeState(context.conversation.user_id);
  if (!runtimeState.trackingEnabled) {
    return null;
  }

  const previousOrder = await getExistingLatestDelivery2Order(params.conversationId);
  const menuRows = await getDelivery2MenuRows(context.conversation.user_id);
  if (!menuRows.length) {
    return null;
  }

  const latestAgentReply = trimText(
    params.latestAgentReply || getMessageBody(context.messages[context.messages.length - 1]),
    400,
  );
  const businessName = trimText(runtimeState.config?.display_name || "Delivery 2.0", 120) || "Delivery 2.0";
  const menuDigest = buildMenuDigest(menuRows);

  const completion: any = await Promise.resolve({
    messages: [
      {
        role: "system",
        content:
          "Voce atua como auditor interno de pedidos finalizados. Nunca escreva nada fora do JSON solicitado.",
      },
      {
        role: "user",
        content: buildDelivery2ExtractionPrompt({
          businessName,
          conversation: context.conversation,
          messages: context.messages,
          latestAgentReply,
          menuDigest,
          previousOrder,
        }),
      },
    ],
    maxTokens: 900,
    temperature: 0.1,
    skipMistralQueue: true,
  });

  const rawText = String(completion.choices?.[0]?.message?.content || "").trim();
  if (!rawText) {
    throw new Error("A IA nao retornou classificacao de Delivery 2.0");
  }

  let parsed: ReturnType<typeof parseDelivery2Order>;
  try {
    parsed = parseDelivery2Order(rawText);
  } catch {
    const strictRawText = await requestStrictDelivery2OrderJson({
      businessName,
      conversation: context.conversation,
      messages: context.messages,
      latestAgentReply,
      menuDigest,
      previousOrder,
    });
    parsed = parseDelivery2Order(strictRawText);
  }

  const normalized = normalizeParsedOrder(parsed);
  const lastCustomerMessage = [...context.messages].reverse().find((message) => !message.from_me);
  const lastAgentMessage = [...context.messages]
    .reverse()
    .find((message) => message.from_me && message.is_from_agent);

  if (normalized.status === "not_finalized") {
    return null;
  }

  if (normalized.status === "pending" && normalized.items.length === 0) {
    return null;
  }

  const shouldUpdateExisting =
    !!previousOrder &&
    DELIVERY2_OPEN_STATUSES.includes((previousOrder.status || "pending") as (typeof DELIVERY2_OPEN_STATUSES)[number]);

  let orderId = shouldUpdateExisting ? previousOrder!.id : null;

  if (normalized.status === "cancelled" && !orderId) {
    return null;
  }

  if (orderId) {
    await db.execute(sql`
      UPDATE delivery2_orders
      SET
        customer_name = ${normalized.customerName},
        status = ${normalized.status === "cancelled" ? "cancelled" : "pending"},
        delivery_type = ${normalized.deliveryType},
        payment_method = ${normalized.paymentMethod},
        customer_address = ${normalized.customerAddress},
        customer_complement = ${normalized.customerComplement},
        customer_reference = ${normalized.customerReference},
        notes = ${normalized.notes},
        summary = ${normalized.summary},
        evidence_json = ${JSON.stringify(normalized.evidence)}::jsonb,
        subtotal = ${normalized.subtotal},
        delivery_fee = ${normalized.deliveryFee},
        total = ${normalized.total},
        confidence = ${normalized.confidence},
        finalized_at = ${normalized.status === "pending" ? new Date() : null},
        last_customer_message = ${getMessageBody(lastCustomerMessage)},
        last_agent_message = ${getMessageBody(lastAgentMessage)},
        last_analyzed_at = now(),
        raw_analysis = ${JSON.stringify(normalized)}::jsonb,
        analysis_version = ${DELIVERY2_ANALYSIS_VERSION},
        updated_at = now()
      WHERE id = ${orderId}
    `);
  } else {
    const insertResult = await db.execute(sql`
      INSERT INTO delivery2_orders (
        conversation_id,
        connection_id,
        user_id,
        contact_number,
        contact_name,
        customer_name,
        status,
        delivery_type,
        payment_method,
        customer_address,
        customer_complement,
        customer_reference,
        notes,
        summary,
        evidence_json,
        subtotal,
        delivery_fee,
        total,
        confidence,
        finalized_at,
        last_customer_message,
        last_agent_message,
        last_analyzed_at,
        raw_analysis,
        analysis_version
      ) VALUES (
        ${context.conversation.conversation_id},
        ${context.conversation.connection_id},
        ${context.conversation.user_id},
        ${context.conversation.contact_number},
        ${context.conversation.contact_name},
        ${normalized.customerName},
        ${normalized.status === "cancelled" ? "cancelled" : "pending"},
        ${normalized.deliveryType},
        ${normalized.paymentMethod},
        ${normalized.customerAddress},
        ${normalized.customerComplement},
        ${normalized.customerReference},
        ${normalized.notes},
        ${normalized.summary},
        ${JSON.stringify(normalized.evidence)}::jsonb,
        ${normalized.subtotal},
        ${normalized.deliveryFee},
        ${normalized.total},
        ${normalized.confidence},
        ${normalized.status === "pending" ? new Date() : null},
        ${getMessageBody(lastCustomerMessage)},
        ${getMessageBody(lastAgentMessage)},
        now(),
        ${JSON.stringify(normalized)}::jsonb,
        ${DELIVERY2_ANALYSIS_VERSION}
      )
      RETURNING id
    `);

    orderId = String((insertResult as any)?.rows?.[0]?.id || "");
  }

  if (!orderId) {
    return null;
  }

  if (normalized.status === "pending") {
    await replaceOrderItems(orderId, normalized.items);
  }

  return loadOrderById(orderId);
}

export async function queueConversationDelivery2Order(params: {
  conversationId: string;
  latestAgentReply?: string;
}) {
  const cacheKey = `${params.conversationId}:${trimText(params.latestAgentReply || "", 160)}`;
  if (pendingDelivery2Analysis.has(cacheKey)) {
    return pendingDelivery2Analysis.get(cacheKey)!;
  }

  const promise = analyzeConversationDelivery2Order(params)
    .catch((error) => {
      console.error("[DELIVERY2] Erro ao analisar pedido:", error);
      return null;
    })
    .finally(() => {
      pendingDelivery2Analysis.delete(cacheKey);
    });

  pendingDelivery2Analysis.set(cacheKey, promise);
  return promise;
}

type Delivery2RefreshCandidateRow = {
  conversation_id: string;
  last_message_at: Date | string | null;
  last_analyzed_at: Date | string | null;
};

async function getDelivery2RefreshCandidates(params: {
  userId: string;
  connectionIds: string[];
  maxConversations: number;
}) {
  if (!params.connectionIds.length) return [];

  const limit = Math.max(1, Math.min(params.maxConversations * 3, 60));
  const result = await db.execute(sql`
    WITH recent_conversations AS (
      SELECT
        c.id AS conversation_id,
        MAX(m.timestamp) AS last_message_at
      FROM conversations c
      INNER JOIN messages m ON m.conversation_id = c.id
      WHERE c.connection_id IN (${buildSqlTextList(params.connectionIds)})
        AND m.timestamp >= now() - interval '72 hours'
      GROUP BY c.id
    )
    SELECT
      rc.conversation_id,
      rc.last_message_at,
      latest_order.last_analyzed_at
    FROM recent_conversations rc
    INNER JOIN conversations c ON c.id = rc.conversation_id
    INNER JOIN whatsapp_connections wc ON wc.id = c.connection_id
    LEFT JOIN LATERAL (
      SELECT o.last_analyzed_at
      FROM delivery2_orders o
      WHERE o.conversation_id = rc.conversation_id
      ORDER BY o.created_at DESC
      LIMIT 1
    ) latest_order ON true
    WHERE wc.user_id = ${params.userId}
    ORDER BY rc.last_message_at DESC
    LIMIT ${limit}
  `);

  const candidates = (((result as any)?.rows || []) as Delivery2RefreshCandidateRow[])
    .filter((row) => {
      if (!row.last_message_at) return false;
      if (!row.last_analyzed_at) return true;

      const lastMessageAt = new Date(row.last_message_at);
      const lastAnalyzedAt = new Date(row.last_analyzed_at);
      if (Number.isNaN(lastMessageAt.getTime()) || Number.isNaN(lastAnalyzedAt.getTime())) {
        return true;
      }

      return lastMessageAt.getTime() > lastAnalyzedAt.getTime() + 1_000;
    })
    .slice(0, Math.max(1, params.maxConversations));

  return candidates.map((row) => String(row.conversation_id)).filter(Boolean);
}

export async function refreshDelivery2OrdersForConnections(params: {
  userId: string;
  connectionIds: string[];
  maxConversations?: number;
  cooldownMs?: number;
}) {
  const connectionIds = [...new Set(params.connectionIds.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!connectionIds.length) return;

  const maxConversations = Math.max(1, Math.min(params.maxConversations || 8, 20));
  const cooldownMs = Math.max(5_000, Math.min(params.cooldownMs || 15_000, 120_000));
  const refreshKey = `${params.userId}:${connectionIds.sort().join(",")}`;
  const now = Date.now();
  const lastRefreshAt = delivery2RefreshTimestamps.get(refreshKey) || 0;

  if (now - lastRefreshAt < cooldownMs) {
    return;
  }

  if (pendingDelivery2Refresh.has(refreshKey)) {
    return pendingDelivery2Refresh.get(refreshKey)!;
  }

  const promise = (async () => {
    try {
      const runtimeState = await getDelivery2RuntimeState(params.userId);
      if (!runtimeState.trackingEnabled) {
        return;
      }

      const candidates = await getDelivery2RefreshCandidates({
        userId: params.userId,
        connectionIds,
        maxConversations,
      });

      for (const conversationId of candidates) {
        await queueConversationDelivery2Order({ conversationId });
      }
    } finally {
      delivery2RefreshTimestamps.set(refreshKey, Date.now());
    }
  })().finally(() => {
    pendingDelivery2Refresh.delete(refreshKey);
  });

  pendingDelivery2Refresh.set(refreshKey, promise);
  return promise;
}

export async function listDelivery2Orders(params: Delivery2ListParams) {
  const query = trimText(params.query || "", 120);
  const status = trimText(params.status || "all", 40).toLowerCase();
  const startDate = trimText(params.startDate || "", 80);
  const endDate = trimText(params.endDate || "", 80);
  const limit = Math.max(1, Math.min(Number(params.limit || 60), 200));
  const offset = Math.max(0, Number(params.offset || 0));

  const whereClauses = [
    sql`o.user_id = ${params.userId}`,
    sql`o.connection_id IN (${buildSqlTextList(params.connectionIds)})`,
  ];

  if (query) {
    const ilike = `%${query}%`;
    whereClauses.push(sql`(
      o.customer_name ILIKE ${ilike}
      OR o.contact_name ILIKE ${ilike}
      OR o.contact_number ILIKE ${ilike}
      OR o.summary ILIKE ${ilike}
    )`);
  }

  if (status !== "all") {
    whereClauses.push(sql`o.status = ${status}`);
  }

  if (startDate) {
    whereClauses.push(sql`COALESCE(o.finalized_at, o.created_at) >= ${startDate}::timestamp`);
  }

  if (endDate) {
    whereClauses.push(sql`COALESCE(o.finalized_at, o.created_at) <= ${endDate}::timestamp`);
  }

  const rowsResult = await db.execute(sql`
    SELECT
      o.*,
      wc.connection_name AS source_connection_name,
      wc.phone_number AS source_connection_phone,
      u.name AS source_account_name,
      u.email AS source_account_email
    FROM delivery2_orders o
    INNER JOIN whatsapp_connections wc ON wc.id = o.connection_id
    INNER JOIN users u ON u.id = o.user_id
    WHERE ${sql.join(whereClauses, sql` AND `)}
    ORDER BY COALESCE(o.finalized_at, o.updated_at, o.created_at) DESC, o.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const countResult = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM delivery2_orders o
    WHERE ${sql.join(whereClauses, sql` AND `)}
  `);

  const orders = (((rowsResult as any)?.rows || []) as Record<string, any>[]).map(mapDelivery2OrderRow);
  const itemsMap = await fetchOrderItemsByOrderIds(orders.map((order) => order.id));
  for (const order of orders) {
    order.items = itemsMap.get(order.id) || [];
  }

  return {
    data: orders,
    total: Number((countResult as any)?.rows?.[0]?.total || 0),
    hasMore: offset + orders.length < Number((countResult as any)?.rows?.[0]?.total || 0),
    offset,
    limit,
  };
}

export async function getDelivery2OrdersReport(params: Delivery2ReportParams) {
  const startDate = trimText(params.startDate || "", 80);
  const endDate = trimText(params.endDate || "", 80);

  const whereClauses = [
    sql`o.user_id = ${params.userId}`,
    sql`o.connection_id IN (${buildSqlTextList(params.connectionIds)})`,
  ];

  if (startDate) {
    whereClauses.push(sql`COALESCE(o.finalized_at, o.created_at) >= ${startDate}::timestamp`);
  }

  if (endDate) {
    whereClauses.push(sql`COALESCE(o.finalized_at, o.created_at) <= ${endDate}::timestamp`);
  }

  const result = await db.execute(sql`
    SELECT
      o.status,
      o.payment_method,
      o.delivery_type,
      o.total,
      TO_CHAR((COALESCE(o.finalized_at, o.created_at) AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS sale_day
    FROM delivery2_orders o
    WHERE ${sql.join(whereClauses, sql` AND `)}
    ORDER BY COALESCE(o.finalized_at, o.created_at) ASC
  `);

  const rows = (((result as any)?.rows || []) as Record<string, any>[]).map((row) => ({
    status: String(row.status || "pending"),
    paymentMethod: trimText(row.payment_method || "Nao informado", 80) || "Nao informado",
    deliveryType: row.delivery_type === "pickup" ? "pickup" : "delivery",
    total: parseNumericAmount(row.total) || 0,
    saleDay: trimText(row.sale_day || "", 20) || "",
  }));

  const validRows = rows.filter((row) => row.status !== "cancelled");
  const grossRevenue = validRows.reduce((sum, row) => sum + row.total, 0);
  const ordersCount = validRows.length;
  const cancelledCount = rows.length - ordersCount;
  const averageTicket = ordersCount > 0 ? grossRevenue / ordersCount : 0;

  const paymentMethodsMap = new Map<string, { method: string; count: number; total: number }>();
  const dailySalesMap = new Map<string, { date: string; orders: number; total: number }>();
  const deliveryTypesMap = new Map<string, { type: string; count: number; total: number }>();

  for (const row of validRows) {
    const paymentEntry = paymentMethodsMap.get(row.paymentMethod) || {
      method: row.paymentMethod,
      count: 0,
      total: 0,
    };
    paymentEntry.count += 1;
    paymentEntry.total += row.total;
    paymentMethodsMap.set(row.paymentMethod, paymentEntry);

    const dayEntry = dailySalesMap.get(row.saleDay) || {
      date: row.saleDay,
      orders: 0,
      total: 0,
    };
    dayEntry.orders += 1;
    dayEntry.total += row.total;
    dailySalesMap.set(row.saleDay, dayEntry);

    const deliveryTypeLabel = row.deliveryType === "pickup" ? "Retirada" : "Entrega";
    const deliveryTypeEntry = deliveryTypesMap.get(deliveryTypeLabel) || {
      type: deliveryTypeLabel,
      count: 0,
      total: 0,
    };
    deliveryTypeEntry.count += 1;
    deliveryTypeEntry.total += row.total;
    deliveryTypesMap.set(deliveryTypeLabel, deliveryTypeEntry);
  }

  return {
    summary: {
      grossRevenue,
      ordersCount,
      averageTicket,
      cancelledCount,
    },
    paymentMethods: Array.from(paymentMethodsMap.values()).sort((a, b) => b.total - a.total),
    dailySales: Array.from(dailySalesMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    deliveryTypes: Array.from(deliveryTypesMap.values()).sort((a, b) => b.total - a.total),
  };
}

export async function getDelivery2OrderById(userId: string, orderId: string) {
  const order = await loadOrderById(orderId);
  if (!order || order.userId !== userId) {
    return null;
  }
  return order;
}

export async function updateDelivery2OrderStatus(params: {
  userId: string;
  orderId: string;
  status: Delivery2OrderRecord["status"];
}) {
  const result = await db.execute(sql`
    UPDATE delivery2_orders
    SET
      status = ${params.status},
      updated_at = now()
    WHERE id = ${params.orderId}
      AND user_id = ${params.userId}
    RETURNING id
  `);

  const savedId = String((result as any)?.rows?.[0]?.id || "");
  if (!savedId) return null;
  return loadOrderById(savedId);
}
