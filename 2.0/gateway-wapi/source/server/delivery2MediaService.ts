import type { Message, MistralResponse } from "@shared/schema";

import { getMediaByName } from "./mediaService";
import { trimText } from "./leadIntelligenceHelpers";
import { isSimpleGreetingMessage } from "./initialOpeningReplyPolicy";
import { supabase } from "./supabaseAuth";

export const DELIVERY2_MENU_FLOW_NAME = "DELIVERY2_CARDAPIO";

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

export async function buildDelivery2MenuMediaActions(params: {
  userId: string;
  customerMessage?: string;
  messageText?: string;
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
