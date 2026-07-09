import type { Message, MistralResponse } from "@shared/schema";

import { getMediaByName } from "./mediaService";
import { trimText } from "./leadIntelligenceHelpers";
import { isSimpleGreetingMessage } from "./initialOpeningReplyPolicy";
import { supabase } from "./supabaseAuth";

export const DELIVERY2_MENU_FLOW_NAME = "DELIVERY2_CARDAPIO";
export const DELIVERY2_BEVERAGES_MEDIA_NAME = "BEBIDAS_DELIVERY2";

type Delivery2ContextMedia = {
  id?: string | null;
  name?: string | null;
  mediaType?: string | null;
  type?: string | null;
  description?: string | null;
  whenToUse?: string | null;
  caption?: string | null;
  transcription?: string | null;
  isActive?: boolean | null;
  sendAlone?: boolean | null;
  suppressTextResponse?: boolean | null;
  flowItems?: unknown;
};

function normalizeDelivery2MediaName(value: unknown) {
  return normalizeIntentText(String(value || "")).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function summarizeDelivery2FlowItems(flowItems: unknown, maxItems = 24) {
  const items = Array.isArray(flowItems) ? [...flowItems] : [];
  items.sort((left: any, right: any) => Number(left?.order || 0) - Number(right?.order || 0));

  return items.slice(0, maxItems).map((item: any, index) => {
    const type = String(item?.type || item?.mediaType || item?.media_type || "item").trim();
    const text = trimText(
      item?.text ||
      item?.caption ||
      item?.transcription ||
      item?.fileName ||
      item?.file_name ||
      "",
      700,
    );

    return {
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index + 1,
      type,
      text: text || null,
      mediaType: item?.mediaType || item?.media_type || null,
    };
  });
}

function summarizeDelivery2ContextMedia(media: Delivery2ContextMedia | null | undefined, role: string) {
  if (!media) return null;
  const mediaName = String(media.name || "").trim();
  if (!mediaName) return null;
  const mediaType = String(media.mediaType || media.type || "document").trim();

  return {
    role,
    mediaName,
    actionType: "send_media",
    actionArguments: { mediaName },
    mediaType,
    description: trimText(media.description || "", 500) || null,
    whenToUse: trimText(media.whenToUse || media.description || "", 900) || null,
    caption: trimText(media.caption || "", 500) || null,
    transcription: trimText(media.transcription || "", 900) || null,
    sendAlone: media.sendAlone === true,
    suppressTextResponse: media.suppressTextResponse === true,
    flowItems: mediaType === "flow" ? summarizeDelivery2FlowItems(media.flowItems) : [],
  };
}

export async function buildDelivery2CodexContext(params: {
  userId: string;
  mediaLibrary?: Delivery2ContextMedia[];
  sentMedias?: unknown;
}) {
  const { data, error } = await supabase
    .from("delivery2_config")
    .select("is_active, send_to_ai, menu_auto_send_on_greeting, menu_auto_send_on_request, display_name")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("[DELIVERY2] Erro ao carregar contexto Codex:", error);
    return null;
  }

  const isActive = data?.is_active === true;
  const sendToAi = data?.send_to_ai !== false;
  if (!isActive || !sendToAi) {
    return null;
  }

  const activeMedia = (params.mediaLibrary || []).filter((media) => media?.isActive !== false);
  const menuFlow = activeMedia.find((media) =>
    String(media?.mediaType || media?.type || "").toLowerCase() === "flow" &&
    normalizeDelivery2MediaName(media?.name) === DELIVERY2_MENU_FLOW_NAME
  );
  const beverageMedia = activeMedia.find((media) =>
    String(media?.mediaType || media?.type || "").toLowerCase() !== "flow" &&
    normalizeDelivery2MediaName(media?.name) === DELIVERY2_BEVERAGES_MEDIA_NAME
  );
  const sentMediaNames = Array.isArray(params.sentMedias)
    ? params.sentMedias.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 40)
    : [];

  return {
    module: "delivery_2_0",
    status: "active",
    contract: [
      "Delivery 2.0 esta ativo para este tenant e deve ser tratado como contexto/capacidade do proprio cliente.",
      "Use o prompt/configuracao do tenant para decidir tom, perguntas, ordem do pedido e fechamento.",
      "Quando o Codex decidir enviar cardapio, bebidas ou outra midia cadastrada, retorne action send_media com arguments.mediaName exatamente igual ao contexto.",
      "Nao prometa envio de midia sem action send_media correspondente; o executor SaaS apenas valida e aplica a acao pedida pelo Codex.",
    ].join(" "),
    config: {
      isActive,
      sendToAi,
      displayName: data?.display_name || null,
      menuAutoSendOnGreeting: data?.menu_auto_send_on_greeting === true,
      menuAutoSendOnRequest: data?.menu_auto_send_on_request !== false,
    },
    standardMedia: [
      summarizeDelivery2ContextMedia(menuFlow, "menu_flow"),
      summarizeDelivery2ContextMedia(beverageMedia, "beverage_options"),
    ].filter(Boolean),
    sentMediaNames,
  };
}

function normalizeIntentText(value: string) {
  const normalized = trimText(value || "", 300)
    .toLowerCase()
    .normalize("NFD");

  let cleaned = "";
  for (const char of normalized) {
    const code = char.charCodeAt(0);
    if (code >= 0x0300 && code <= 0x036f) {
      continue;
    }
    cleaned += char;
  }

  return cleaned;
}

function isFirstCustomerTurn(conversationHistory: Message[]) {
  return !conversationHistory.some((message) => {
    if (message.fromMe) return false;
    const body = trimText(message.text || message.mediaCaption || "", 120);
    return body.length > 0;
  });
}

function isExplicitMenuRequest(message: string) {
  const normalized = normalizeIntentText(message);
  if (!normalized) return false;

  const phrases = [
    "cardapio",
    "menu",
    "catalogo",
    "manda o cardapio",
    "me manda o cardapio",
    "quero ver o cardapio",
    "quero ver o menu",
    "quais sabores",
    "quais pizzas",
    "me mostra as pizzas",
    "me mostra o cardapio",
    "me mostra o menu",
  ];

  return phrases.some((phrase) => normalized.includes(phrase));
}

function responseOffersBeverages(responseText?: string | null) {
  const normalized = normalizeIntentText(responseText || "");
  if (!normalized || !normalized.includes("bebida")) return false;

  return (
    normalized.includes("opcoes") ||
    normalized.includes("acompanhar") ||
    normalized.includes("quer alguma bebida") ||
    normalized.includes("gostaria de alguma bebida") ||
    normalized.includes("vou te enviar") ||
    normalized.includes("aqui estao")
  );
}

export async function buildDelivery2MenuMediaActions(params: {
  userId: string;
  customerMessage?: string;
  messageText?: string;
  responseText?: string | null;
  conversationHistory: Message[];
  mediaLibrary?: Array<{ name?: string | null }>;
}): Promise<MistralResponse["actions"]> {
  const customerMessage = trimText(params.customerMessage || params.messageText || "", 300);
  if (!customerMessage) return [];

  const { data, error } = await supabase
    .from("delivery2_config")
    .select("is_active, send_to_ai, menu_auto_send_on_greeting, menu_auto_send_on_request")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("[DELIVERY2] Erro ao carregar config de midia:", error);
    return [];
  }

  const moduleActive = data?.is_active === true && data?.send_to_ai !== false;
  if (!moduleActive) return [];

  const shouldSendOnGreeting =
    data?.menu_auto_send_on_greeting === true &&
    isFirstCustomerTurn(params.conversationHistory) &&
    isSimpleGreetingMessage(customerMessage);

  const shouldSendOnRequest =
    data?.menu_auto_send_on_request !== false &&
    isExplicitMenuRequest(customerMessage);

  if (responseOffersBeverages(params.responseText)) {
    const beverageMedia = await getMediaByName(params.userId, DELIVERY2_BEVERAGES_MEDIA_NAME);
    if (beverageMedia && beverageMedia.mediaType !== "flow") {
      return [
        {
          type: "send_media",
          media_name: DELIVERY2_BEVERAGES_MEDIA_NAME,
        } as MistralResponse["actions"][number],
      ];
    }
  }

  if (!shouldSendOnGreeting && !shouldSendOnRequest) {
    return [];
  }

  const flowMedia = await getMediaByName(params.userId, DELIVERY2_MENU_FLOW_NAME);
  if (!flowMedia || flowMedia.mediaType !== "flow" || !Array.isArray(flowMedia.flowItems) || flowMedia.flowItems.length === 0) {
    return [];
  }

  return [
    {
      type: "send_media",
      media_name: DELIVERY2_MENU_FLOW_NAME,
    } as MistralResponse["actions"][number],
  ];
}
