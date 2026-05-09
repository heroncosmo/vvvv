/**
 * DELIVERY AI SERVICE - SIMPLIFIED AND DETERMINISTIC
 *
 * ARCHITECTURE (2025):
 * 1. Detects intent before calling the LLM
 * 2. Menu data is injected by the system
 * 3. LLM receives only necessary context
 * 4. Prices/products validated against database
 * 5. Structured JSON responses with message bubbles
 */

import { supabase } from "./supabaseAuth";
import { getLLMClient } from "./llm";
import { getMediaByName } from "./mediaService";
import { repairMojibakeText } from "@shared/mojibake";
import type { MistralResponse } from "@shared/schema";

// TYPES AND INTERFACES

export interface MenuItemOption {
  name: string; // "Size", "Crust", etc
  type: "single" | "multiple";
  required: boolean;
  options: Array<{
    name: string; // "Small", "Medium", "Large"
    price: number; // Price for this option
  }>;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category_name: string;
  is_highlight: boolean;
  is_available: boolean;
  options?: MenuItemOption[]; // Product variations
}

export interface DeliveryConfig {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  menu_send_mode?: 'text' | 'image' | 'image_text';
  delivery_fee: number;
  min_order_value: number;
  estimated_delivery_time: number;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  accepts_cancellation: boolean; // Allows customer cancellation
  payment_methods: string[];
  is_active: boolean;
  opening_hours?: Record<string, { enabled: boolean; open: string; close: string }>;
  welcome_message?: string;
  order_confirmation_message?: string;
  order_ready_message?: string;
  out_for_delivery_message?: string;
  closed_message?: string;
  humanize_responses?: boolean;
  use_customer_name?: boolean;
  response_variation?: boolean;
  response_delay_min?: number;
  response_delay_max?: number;
  pix_settings?: PixSettings;
  cash_settings?: CashSettings;
  delivery_fee_settings?: DeliveryFeeSettings;
}

interface PixSettings {
  key: string;
  keyType: string;
  holderName: string;
  bankName: string;
  instructions: string;
  requireProof: boolean;
}

interface CashSettings {
  askForChange: boolean;
}

interface DeliveryFeeSettings {
  mode: 'fixed' | 'distance';
  originAddress: string;
  cityContext: string;
  baseFee: number;
  baseDistanceKm: number;
  additionalFeePerKm: number;
  maxDistanceKm: number | null;
  fallbackFee: number;
}

interface DeliveryFeeCalculation {
  fee: number;
  distanceKm: number | null;
  mode: 'fixed' | 'distance' | 'fallback';
  label: string;
  details?: string;
}

type BrazilianCityContext = {
  city: string;
  stateCode: string;
};

type GeocodedAddress = {
  lat: number;
  lon: number;
  cityContext?: string;
};

type ViaCepAddressMatch = {
  cep: string;
  logradouro: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

type DeliveryOpeningFlowItem = {
  id?: string;
  order?: number;
  type: 'media' | 'text';
  storageUrl?: string;
  mediaType?: 'audio' | 'image' | 'video' | 'document';
  caption?: string;
  fileName?: string;
  mimeType?: string;
  text?: string;
};

type DeliveryOpeningFlowMedia = {
  caption?: string | null;
  description?: string | null;
  mediaType?: string | null;
  flowItems?: DeliveryOpeningFlowItem[] | null;
};

type HalfHalfPricingMode = 'highest_item' | 'fixed' | 'size_map';

interface HalfHalfPricingConfig {
  enabled: boolean;
  mode: HalfHalfPricingMode;
  fixedPrice?: number | string | null;
  sizePrices?: {
    P?: number | string | null;
    M?: number | string | null;
    G?: number | string | null;
  };
}

// Interface para horÃ¡rio de funcionamento
interface OpeningHoursDay {
  enabled: boolean;
  open: string;
  close: string;
}

const OPENING_HOURS_ACCEPT_ANYTIME_KEY = '__accept_orders_any_time';
const OPENING_HOURS_DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

function normalizeOpeningHoursConfig(
  openingHours?: Record<string, OpeningHoursDay> | Array<any>
): Record<string, OpeningHoursDay> | undefined {
  let normalizedHours: Record<string, OpeningHoursDay> | undefined;

  if (Array.isArray(openingHours)) {
    normalizedHours = {};
    for (const entry of openingHours) {
      if (entry && entry.day) {
        normalizedHours[entry.day] = {
          open: entry.open || '00:00',
          close: entry.close || '23:59',
          enabled: entry.enabled !== false,
        };
      }
    }
    return normalizedHours;
  }

  if (!openingHours) {
    return undefined;
  }

  normalizedHours = {};
  for (const day of OPENING_HOURS_DAY_KEYS) {
    const entry = openingHours[day];
    if (entry) {
      normalizedHours[day] = {
        open: entry.open || '00:00',
        close: entry.close || '23:59',
        enabled: entry.enabled !== false,
      };
    }
  }

  return normalizedHours;
}

function acceptsAfterHoursOrders(openingHours?: Record<string, any> | Array<any>): boolean {
  if (!openingHours || Array.isArray(openingHours)) {
    return false;
  }

  return openingHours[OPENING_HOURS_ACCEPT_ANYTIME_KEY] === true;
}

function buildAfterHoursOrderingNotice(
  businessStatus: ReturnType<typeof isBusinessOpen>,
  openingHours?: Record<string, OpeningHoursDay> | Array<any>
): string {
  const hoursText = formatBusinessHours(openingHours);
  const statusText = businessStatus.message || 'Estamos fora do horario neste momento.';

  return [
    'Pedido fora do horario:',
    statusText,
    'Posso anotar seu pedido agora e ele entra no atendimento assim que a loja abrir.',
    hoursText,
  ].filter(Boolean).join('\n\n');
}

function hasAfterHoursOrderingNotice(
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): boolean {
  if (!conversationHistory?.length) return false;

  return conversationHistory.some((entry) => {
    if (!entry?.fromMe || !entry.text) return false;
    const normalizedText = normalizeTextForMatch(entry.text);
    return normalizedText.includes('pedido fora do horario')
      || normalizedText.includes('posso anotar seu pedido agora');
  });
}

// Verifica se o estabelecimento estÃ¡ aberto agora (horÃ¡rio do Brasil)
export function isBusinessOpen(openingHours?: Record<string, OpeningHoursDay> | Array<any>): {
  isOpen: boolean;
  currentDay: string;
  currentTime: string;
  todayHours?: OpeningHoursDay;
  message: string;
} {
  // HorÃ¡rio do Brasil (UTC-3)
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayNamesPt: Record<string, string> = {
    sunday: 'domingo',
    monday: 'segunda-feira',
    tuesday: 'terca-feira',
    wednesday: 'quarta-feira',
    thursday: 'quinta-feira',
    friday: 'sexta-feira',
    saturday: 'sabado'
  };

  const currentDay = dayNames[brazilTime.getDay()];
  const currentHour = brazilTime.getHours().toString().padStart(2, '0');
  const currentMinute = brazilTime.getMinutes().toString().padStart(2, '0');
  const currentTime = `${currentHour}:${currentMinute}`;

  // ðŸ†• FIX: Converter array para Record se necessÃ¡rio
  // DB armazena como array [{day:"monday",...}], mas funÃ§Ã£o espera Record {monday:{...}}
  const normalizedHours = normalizeOpeningHoursConfig(openingHours);

  // Se nÃ£o tem horÃ¡rios configurados, assume aberto
  if (!normalizedHours || Object.keys(normalizedHours).length === 0) {
    return {
      isOpen: true,
      currentDay,
      currentTime,
      message: ''
    };
  }

  const todayHours = normalizedHours[currentDay];
  
  // Se nÃ£o tem configuraÃ§Ã£o para hoje ou estÃ¡ desabilitado
  if (!todayHours || !todayHours.enabled) {
    // Encontrar prÃ³ximo dia aberto
    const nextOpenDay = findNextOpenDay(normalizedHours, currentDay);
    return {
      isOpen: false,
      currentDay,
      currentTime,
      todayHours,
      message: `Estamos fechados hoje (${dayNamesPt[currentDay]}). ${nextOpenDay ? `Abrimos ${nextOpenDay}.` : 'Confira nossos horarios!'}` 
    };
  }
  
  // Verificar se estÃ¡ no horÃ¡rio
  const openTime = todayHours.open || '00:00';
  const closeTime = todayHours.close || '23:59';
  
  // Converter para minutos para comparaÃ§Ã£o
  const currentMinutes = parseInt(currentHour) * 60 + parseInt(currentMinute);
  const openMinutes = parseInt(openTime.split(':')[0]) * 60 + parseInt(openTime.split(':')[1] || '0');
  const closeMinutes = parseInt(closeTime.split(':')[0]) * 60 + parseInt(closeTime.split(':')[1] || '0');
  
  // Caso especial: fechamento apÃ³s meia-noite (ex: 18:00 - 02:00)
  let isOpen = false;
  if (closeMinutes < openMinutes) {
    // HorÃ¡rio atravessa meia-noite
    isOpen = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  } else {
    isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }
  
  if (isOpen) {
    return {
      isOpen: true,
      currentDay,
      currentTime,
      todayHours,
      message: ''
    };
  } else {
    // EstÃ¡ fechado - antes de abrir ou depois de fechar
    if (currentMinutes < openMinutes) {
      return {
        isOpen: false,
        currentDay,
        currentTime,
        todayHours,
        message: `Ainda nao abrimos hoje. Nosso horario e das ${openTime} as ${closeTime}.`
      };
    } else {
      return {
        isOpen: false,
        currentDay,
        currentTime,
        todayHours,
        message: `Ja encerramos o atendimento hoje. Nosso horario e das ${openTime} as ${closeTime}. Volte amanha.`
      };
    }
  }
}

function formatBusinessHours(openingHours?: Record<string, OpeningHoursDay> | Array<any>): string {
  const normalizedHours = normalizeOpeningHoursConfig(openingHours);
  
  if (!normalizedHours || Object.keys(normalizedHours).length === 0) {
    return 'Horarios nao informados.';
  }

  const dayNamesPt: Record<string, string> = {
    monday: 'Segunda',
    tuesday: 'Terca',
    wednesday: 'Quarta',
    thursday: 'Quinta',
    friday: 'Sexta',
    saturday: 'Sabado',
    sunday: 'Domingo'
  };
  const dayOrder: Array<keyof typeof dayNamesPt> = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ];

  let text = 'Nossos horarios:\n';
  for (const day of dayOrder) {
    const dayConfig = normalizedHours[day];
    if (dayConfig && dayConfig.enabled) {
      text += `- ${dayNamesPt[day]}: ${dayConfig.open} as ${dayConfig.close}\n`;
    }
  }

  return text.trim();
}

function interpolateDeliveryMessage(
  template: string,
  variables: Record<string, string>
): string {
  let result = template || '';
  const replacements: Record<string, string> = {
    cliente_nome: variables.cliente_nome || variables.nome || variables.name || 'Cliente',
    nome: variables.nome || variables.cliente_nome || variables.name || 'Cliente',
    name: variables.name || variables.cliente_nome || variables.nome || 'Cliente',
    horarios: variables.horarios || '',
    status: variables.status || '',
    pedido_numero: variables.pedido_numero || '',
    total: variables.total || '',
    tempo_estimado: variables.tempo_estimado || '',
  };

  Object.entries(replacements).forEach(([key, value]) => {
    const safeValue = value || '';
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), safeValue);
  });

  result = result.replace(/\{\{name\}\}/g, replacements.name || 'Cliente');

  return result;
}

function getCustomerNameFromHistory(
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): string | null {
  if (!conversationHistory || conversationHistory.length === 0) return null;

  const namePatterns = [
    /\bmeu nome (?:e|Ã©)\s+([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±\s]{2,50})/i,
    /\bme chamo\s+([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±\s]{2,50})/i,
    /\beu sou\s+([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±\s]{2,50})/i,
    /\bsou\s+(?:o|a)?\s*([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±\s]{2,50})/i,
    /\bpode me chamar de\s+([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±\s]{2,50})/i,
  ];

  // 1Âª passada: buscar padrÃµes EXPLÃCITOS de nome (meu nome Ã©, me chamo, etc.)
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const entry = conversationHistory[i];
    if (entry.fromMe) continue;
    const text = entry.text?.trim();
    if (!text) continue;

    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        // Nome extraÃ­do: capitalizar primeira letra
        const rawName = match[1].trim().split(/\s+/)[0]; // Pegar apenas o primeiro nome
        return rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
      }
    }
  }

  // 2Âª passada (fallback): mensagem que parece ser APENAS um nome (max 20 chars, sem palavras comuns)
  const commonWords = /\b(quero|ver|cardapio|cardÃ¡pio|primeiro|pizza|borda|bebida|adicional|oi|ola|olÃ¡|boa|noite|tarde|dia|obrigado|obrigada|sim|nao|nÃ£o|ok|entrega|delivery|retirada|pagar|pagamento|pix|cartao|cartÃ£o|dinheiro|favor|por|uma|querer|pedido|meu|minha)\b/i;
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const entry = conversationHistory[i];
    if (entry.fromMe) continue;
    const text = entry.text?.trim();
    if (!text || text.length > 20) continue; // Nomes reais sÃ£o curtos (max 20 chars)

    // Verificar se parece nome: sÃ³ letras, sem palavras comuns, sem dÃ­gitos
    const looksLikeName = /^[a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±\s]{2,20}$/i.test(text);
    if (looksLikeName && !/\d/.test(text) && !commonWords.test(text)) {
      const rawName = text.split(/\s+/)[0];
      return rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
    }
  }

  return null;
}

function applyHumanization(
  text: string,
  config: DeliveryConfig,
  allowVariation = true
): string {
  if (!config?.humanize_responses) return text;

  const trimmed = text.trim();
  if (!trimmed) return text;

  if (config.response_variation && allowVariation && trimmed.length < 900) {
    const suffixes = [
      'Se precisar de algo, estou por aqui! ðŸ˜Š',
      'Qualquer coisa, Ã© sÃ³ me chamar! ðŸ˜‰',
      'Fico Ã  disposiÃ§Ã£o! ðŸ˜Š'
    ];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    if (!trimmed.endsWith('ðŸ˜Š') && !trimmed.endsWith('ðŸ˜‰')) {
      return `${trimmed}\n\n${suffix}`;
    }
  }

  return trimmed;
}

// Encontra o prÃ³ximo dia aberto
function findNextOpenDay(openingHours: Record<string, OpeningHoursDay>, currentDay: string): string | null {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayNamesPt: Record<string, string> = {
    sunday: 'domingo',
    monday: 'segunda-feira',
    tuesday: 'terca-feira',
    wednesday: 'quarta-feira',
    thursday: 'quinta-feira',
    friday: 'sexta-feira',
    saturday: 'sabado'
  };
  
  const currentIndex = dayNames.indexOf(currentDay);
  
  for (let i = 1; i <= 7; i++) {
    const nextIndex = (currentIndex + i) % 7;
    const nextDay = dayNames[nextIndex];
    const nextDayHours = openingHours[nextDay];
    
    if (nextDayHours && nextDayHours.enabled) {
      if (i === 1) {
        return `amanha (${dayNamesPt[nextDay]}) as ${nextDayHours.open}`;
      }
      return `${dayNamesPt[nextDay]} as ${nextDayHours.open}`;
    }
  }
  
  return null;
}

export interface MenuCategory {
  id?: string;
  name: string;
  image_url?: string | null;
  half_half_pricing?: HalfHalfPricingConfig | null;
  items: MenuItem[];
}

export interface DeliveryData {
  config: DeliveryConfig;
  categories: MenuCategory[];
  totalItems: number;
}

export interface DeliveryResponseMetadata extends Record<string, any> {
  itemMentioned?: string;
  priceAsked?: number;
  validatedPrice?: number;
  categoryRequested?: string;
  categoryImageUrl?: string | null;
  categoryName?: string | null;
  halfHalfItems?: Array<{ name: string; price: number }>;
  halfHalfPrice?: number;
  orderItems?: Array<{ name: string; quantity: number; price: number }>;
  subtotal?: number;
  deliveryFee?: number;
  total?: number;
  cancelled?: boolean;
  reason?: string;
}

export interface DeliveryAIResponse {
  intent: CustomerIntent;
  bubbles: string[];
  orderData?: {
    items: Array<{
      name: string;
      quantity: number;
      price: number;
      notes?: string;
    }>;
    subtotal: number;
    deliveryFee: number;
    total: number;
    status: 'BUILDING' | 'CONFIRMED' | 'CANCELLED';
  };
  requiresInput?: string;
  metadata?: DeliveryResponseMetadata;
  mediaActions?: MistralResponse['actions'];
}

// Tipos de intenÃ§Ã£o do cliente
export type CustomerIntent = 
  | 'GREETING'              // Oi, olÃ¡, etc
  | 'WANT_MENU'             // Quer ver cardÃ¡pio completo
  | 'WANT_CATEGORY'         // Quer ver categoria especÃ­fica (pizza, bebidas, etc)
  | 'ASK_ABOUT_ITEM'        // Pergunta sobre item especÃ­fico
  | 'WANT_TO_ORDER'         // Quer fazer pedido
  | 'ADD_ITEM'              // Adicionar item ao pedido
  | 'REMOVE_ITEM'           // Remover item
  | 'CONFIRM_ORDER'         // Confirmar pedido
  | 'PROVIDE_CUSTOMER_INFO' // Cliente forneceu nome/endereÃ§o/pagamento
  | 'FINALIZE_ORDER'        // Criar pedido no banco de dados
  | 'CANCEL_ORDER'          // Cancelar pedido
  | 'ASK_DELIVERY_INFO'     // Perguntas sobre entrega/pagamento
  | 'ASK_BUSINESS_HOURS'    // HorÃ¡rio de funcionamento
  | 'COMPLAINT'             // ReclamaÃ§Ã£o
  | 'HALF_HALF'             // Pedido meio a meio (pizza)
  | 'OTHER';                // Outros assuntos

// Mapeamento de palavras para categorias
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'pizza': ['pizza', 'pizzas'],
  'esfirra': ['esfirra', 'esfiha', 'esfirras', 'esfihas', 'sfiha'],
  'bebida': ['bebida', 'bebidas', 'refrigerante', 'refri', 'suco', 'Ã¡gua', 'agua'],
  'aÃ§aÃ­': ['aÃ§aÃ­', 'acai', 'aÃ§ai'],
  'borda': ['borda', 'bordas', 'borda recheada', 'bordas recheadas'],
  'hamburguer': ['hamburguer', 'hamburger', 'burger', 'lanche', 'lanches'],
  'doce': ['doce', 'doces', 'sobremesa', 'sobremesas'],
  'salgado': ['salgado', 'salgados'],
  'tradicional': ['tradicional', 'tradicionais'],
  'especial': ['especial', 'especiais'],
  'adicional': ['adicional', 'adicionais'],
  'combos': ['combo', 'combos'],
  'porcao': ['porÃ§Ã£o', 'porcao', 'porÃ§Ãµes', 'porcoes'],
  'entrada': ['entrada', 'entradas'],
  'massa': ['massa', 'massas', 'macarrÃ£o', 'macarrao'],
  'sushi': ['sushi', 'sushis', 'temaki', 'sashimi'],
  'promo': ['promoÃ§Ã£o', 'promocao', 'promo', 'promoÃ§Ãµes', 'promocoes'],
};

function normalizeCategoryText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ðŸ•ðŸ”ðŸ¥ªðŸ½ï¸ðŸ¨ðŸ£ðŸ´ðŸ¥ŸðŸ«]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ðŸ†• Smart category text matching com awareness de word-boundary.
 * Previne falsos positivos como "tradicionais" matchando "adicionais"
 * (substring na posiÃ§Ã£o 2, sem ser fronteira de palavra).
 */
function smartCategoryMatch(text1: string, text2: string): boolean {
  if (!text1 || !text2) return false;
  
  // Exact match
  if (text1 === text2) return true;
  
  // Shorter text is a substring of longer text
  const [shorter, longer] = text1.length <= text2.length ? [text1, text2] : [text2, text1];
  
  if (shorter.length >= 3 && longer.includes(shorter)) {
    const idx = longer.indexOf(shorter);
    // Match must start at beginning or after a word boundary (space)
    if (idx === 0 || longer[idx - 1] === ' ') {
      return true;
    }
  }
  
  return false;
}

function normalizeMenuSendMode(value?: string | null): string {
  return String(value || 'text').trim().toLowerCase();
}

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const raw = String(value).trim();
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function formatDistance(distanceKm: number | null | undefined): string {
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm)) {
    return 'distância não calculada';
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1).replace('.', ',')} km`;
}

const BRAZILIAN_STATE_CODES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]);

function splitAddressSegments(value: string): string[] {
  return sanitizeDeliveryText(value || '')
    .split(',')
    .map(segment => segment.trim())
    .filter(Boolean);
}

function looksLikeZipCode(value: string): boolean {
  return /^\d{5}-?\d{3}$/.test((value || '').trim());
}

function isLikelyAddressSegment(segment: string): boolean {
  const normalized = normalizeTextForMatch(segment || '');
  if (!normalized) return false;

  if (/\b(rua|avenida|av|alameda|travessa|estrada|rodovia|praca|largo|trav|bairro|centro|vila|jardim|parque|condominio|residencial|apto|apartamento|bloco|casa|numero|n)\b/.test(normalized)) {
    return true;
  }

  return /\d/.test(segment) && /[a-zA-Z]/.test(segment);
}

function extractOriginLocationSuffix(originAddress?: string | null): string | null {
  const segments = splitAddressSegments(originAddress || '');
  if (segments.length === 0) return null;

  const cleaned = [...segments];
  while (cleaned.length > 0 && looksLikeZipCode(cleaned[cleaned.length - 1])) {
    cleaned.pop();
  }
  if (cleaned.length === 0) return null;

  const last = cleaned[cleaned.length - 1];
  const lastMatch = last.match(/\b([A-Za-z]{2})\b$/);
  if (lastMatch && cleaned.length >= 2) {
    const previous = cleaned[cleaned.length - 2];
    if (!/\d/.test(previous) && !isLikelyAddressSegment(previous)) {
      return `${previous} - ${lastMatch[1].toUpperCase()}`;
    }
  }

  if (cleaned.length >= 1 && /\b[A-Za-z]{2}\b/.test(last)) {
    const parts = last.split(/[-/]/).map(part => part.trim()).filter(Boolean);
    const statePart = parts.find(part => BRAZILIAN_STATE_CODES.has(part.toUpperCase()));
    if (statePart) {
      const cityPart = parts.find(part => !BRAZILIAN_STATE_CODES.has(part.toUpperCase()));
      if (cityPart) {
        return `${cityPart} - ${statePart.toUpperCase()}`;
      }
    }
  }

  if (!/\d/.test(last) && !isLikelyAddressSegment(last)) {
    return last;
  }

  if (cleaned.length >= 2) {
    const previous = cleaned[cleaned.length - 2];
    if (!/\d/.test(previous) && !isLikelyAddressSegment(previous)) {
      return previous;
    }
  }

  return null;
}

export function extractPromptAddressCandidate(text?: string | null): string {
  const cleaned = sanitizeDeliveryText(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const anchoredPatterns = [
    /\blocalizad[oa]s?\b[^.!?\n]{0,60}?(?:na|no|em)\s+(?:[*_`]+)?((?:rua|avenida|av\.?|alameda|travessa|estrada|rodovia|praca|praça|largo)\b[^.!?\n]{0,180})/i,
    /\b(?:nosso endereco|nosso endereço|endereco|endereço)\b[^.!?\n]{0,20}?(?:é|e|:)?\s+(?:[*_`]+)?((?:rua|avenida|av\.?|alameda|travessa|estrada|rodovia|praca|praça|largo)\b[^.!?\n]{0,180})/i,
  ];

  for (const pattern of anchoredPatterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const candidate = sanitizeDeliveryText(match[1]).trim();
      if (candidate && !/[\[\]]/.test(candidate)) {
        text = candidate;
        break;
      }
    }
  }

  const anchoredCandidate = typeof text === 'string' && text !== cleaned
    ? sanitizeDeliveryText(text).replace(/\s+/g, ' ').trim()
    : '';

  if (anchoredCandidate) {
    const resolved = extractPromptAddressCandidate(anchoredCandidate);
    if (resolved) {
      return resolved;
    }
  }

  const candidatePatterns = [
    /\b(?:localizad[oa]s?|localizada|localizado|nosso endereco|nosso endereço|endereco|endereço|fica(?:mos)?)\b[^.!?\n]{0,60}\b(?:rua|avenida|av\.?|alameda|travessa|estrada|rodovia|praca|praça|largo)\b[^.!?\n]{0,180}/gi,
    /\b(?:rua|avenida|av\.?|alameda|travessa|estrada|rodovia|praca|praça|largo)\b[^.!?\n]{0,180}/gi,
  ];

  for (const pattern of candidatePatterns) {
    for (const match of cleaned.matchAll(pattern)) {
      const rawCandidate = String(match[0] || '')
        .replace(/^.*?(\b(?:rua|avenida|av\.?|alameda|travessa|estrada|rodovia|praca|praça|largo)\b.*)$/i, '$1')
        .trim();
      if (!rawCandidate) continue;

      const segments = splitAddressSegments(rawCandidate);
      if (segments.length === 0) continue;

      const trimmedSegments: string[] = [];
      for (const segment of segments) {
        const cleanedSegment = sanitizeDeliveryText(segment).trim();
        if (!cleanedSegment) continue;

        trimmedSegments.push(cleanedSegment);

        const parsedContext = parseBrazilianCityContext(cleanedSegment);
        if (parsedContext) {
          trimmedSegments[trimmedSegments.length - 1] = formatBrazilianCityContext(parsedContext);
          break;
        }

        const freeTextContext = extractBrazilianCityContextFromFreeText(cleanedSegment);
        if (freeTextContext) {
          trimmedSegments[trimmedSegments.length - 1] = freeTextContext;
          break;
        }

        if (trimmedSegments.length >= 4) {
          break;
        }
      }

      const resolvedCandidate = trimmedSegments.join(', ').trim();
      if (/[\[\]]/.test(resolvedCandidate)) {
        continue;
      }

      const hasStreetNumber = /\d/.test(resolvedCandidate);
      const hasCityContext = Boolean(
        extractOriginLocationSuffix(resolvedCandidate) ||
        extractBrazilianCityContextFromFreeText(resolvedCandidate)
      );

      if (hasStreetNumber || hasCityContext) {
        return resolvedCandidate;
      }
    }
  }

  return '';
}

function hasExplicitLocationContext(address: string, originAddress?: string | null): boolean {
  const segments = splitAddressSegments(address);
  if (segments.length >= 3) return true;

  const normalized = sanitizeDeliveryText(address || '');
  if (/\b[A-Za-zÀ-ÿ\s]+[-/]\s*[A-Za-z]{2}\b/.test(normalized)) {
    return true;
  }

  if (segments.length >= 2) {
    const lastSegment = segments[segments.length - 1];
    const normalizedLast = normalizeTextForMatch(lastSegment);
    const originSuffix = extractOriginLocationSuffix(originAddress);
    const normalizedOriginSuffix = normalizeTextForMatch(originSuffix || '');
    const originCityOnly = normalizeTextForMatch((originSuffix || '').split(/[-/]/)[0] || '');

    if (
      (normalizedOriginSuffix && normalizedLast === normalizedOriginSuffix) ||
      (originCityOnly && normalizedLast === originCityOnly)
    ) {
      return true;
    }
  }

  return false;
}

export function parseBrazilianCityContext(value?: string | null): BrazilianCityContext | null {
  const cleaned = sanitizeDeliveryText(value || '')
    .replace(/[*_`()[\]{}<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  const directMatch = cleaned.match(/^(.*?)[,\-\/]\s*([A-Za-z]{2})$/);
  if (directMatch) {
    const city = directMatch[1]?.trim();
    const stateCode = directMatch[2]?.trim().toUpperCase();
    if (city && BRAZILIAN_STATE_CODES.has(stateCode)) {
      return { city, stateCode };
    }
  }

  const parts = cleaned.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (BRAZILIAN_STATE_CODES.has(last.toUpperCase())) {
      return {
        city: parts.slice(0, -1).join(', '),
        stateCode: last.toUpperCase(),
      };
    }
  }

  const whitespaceMatch = cleaned.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (whitespaceMatch) {
    const city = whitespaceMatch[1]?.trim();
    const stateCode = whitespaceMatch[2]?.trim().toUpperCase();
    if (city && BRAZILIAN_STATE_CODES.has(stateCode)) {
      return { city, stateCode };
    }
  }

  return null;
}

function formatBrazilianCityContext(value?: BrazilianCityContext | null): string {
  if (!value?.city || !value?.stateCode) return '';
  return `${value.city} - ${value.stateCode}`;
}

function matchesBrazilianCityContextHint(
  candidateContext?: string | null,
  expectedContext?: string | null
): boolean {
  const expected = parseBrazilianCityContext(expectedContext);
  if (!expected) {
    return true;
  }

  const candidate = parseBrazilianCityContext(candidateContext);
  if (!candidate) {
    return false;
  }

  if (candidate.stateCode !== expected.stateCode) {
    return false;
  }

  const normalizedCandidateCity = normalizeTextForMatch(candidate.city);
  const normalizedExpectedCity = normalizeTextForMatch(expected.city);
  return normalizedCandidateCity === normalizedExpectedCity;
}

function extractBrazilianCityContextFromNominatimAddress(raw?: Record<string, any> | null): string {
  if (!raw) return '';

  const stateCode = typeof raw.state_code === 'string'
    ? raw.state_code.trim().toUpperCase()
    : '';
  const city = [
    raw.city,
    raw.town,
    raw.village,
    raw.municipality,
    raw.county,
  ].find(value => typeof value === 'string' && value.trim());

  if (typeof city === 'string' && city.trim() && BRAZILIAN_STATE_CODES.has(stateCode)) {
    return `${city.trim()} - ${stateCode}`;
  }

  return '';
}

export function extractBrazilianCityContextFromFreeText(value?: string | null): string {
  const cleaned = sanitizeDeliveryText(value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const segments = cleaned
    .split(/[\n\r,;.!?]+/)
    .map(segment => sanitizeDeliveryText(segment).trim())
    .filter(Boolean);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    const parsed = parseBrazilianCityContext(segment);
    if (parsed) {
      return formatBrazilianCityContext(parsed);
    }
  }

  const inlineMatches = Array.from(
    cleaned.matchAll(/\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'´`\-\s]{1,60})\s+([A-Za-z]{2})\b/g)
  );
  for (let index = inlineMatches.length - 1; index >= 0; index -= 1) {
    const match = inlineMatches[index];
    const parsed = parseBrazilianCityContext(`${match[1]} ${match[2]}`);
    if (parsed) {
      return formatBrazilianCityContext(parsed);
    }
  }

  return '';
}

function extractZipCode(value?: string | null): string | null {
  const match = sanitizeDeliveryText(value || '').match(/\b\d{5}-?\d{3}\b/);
  return match ? match[0].replace(/\D/g, '') : null;
}

function stripAddressNumber(value: string): string {
  return sanitizeDeliveryText(value || '')
    .replace(/\b(?:n(?:u|ú)mero|nº|no)\s*\d+[A-Za-z0-9/-]*\b/gi, '')
    .replace(/\b\d+[A-Za-z0-9/-]*\b/g, '')
    .replace(/\b(?:apto|apartamento|bloco|casa|fundos|sala|loja|quadra|lote)\b.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[,\-]\s*$/g, '')
    .trim();
}

function buildStreetLookupQuery(address: string): string {
  const prepared = sanitizeDeliveryText(address || '').trim();
  if (!prepared) return '';

  const firstSegment = splitAddressSegments(prepared)[0] || prepared;
  return stripAddressNumber(firstSegment);
}

function normalizeExternalAddressLookup(value: string): string {
  return sanitizeDeliveryText(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s,./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAddressStreetNumber(value?: string | null): string {
  const segments = splitAddressSegments(value || '');
  for (const segment of segments) {
    const cleaned = sanitizeDeliveryText(segment).trim();
    if (/^\d+[A-Za-z/-]*$/i.test(cleaned)) {
      return cleaned;
    }
  }

  const inlineMatch = sanitizeDeliveryText(value || '').match(/\b\d+[A-Za-z/-]*\b/);
  return inlineMatch?.[0] || '';
}
function buildAddressWithoutNumber(address: string): string {
  const segments = splitAddressSegments(address);
  if (segments.length === 0) return '';

  const street = buildStreetLookupQuery(segments[0]);
  const restSegments = segments
    .slice(1)
    .map(segment => sanitizeDeliveryText(segment).trim())
    .filter(segment => segment && !/^\d+[A-Za-z/-]*$/i.test(segment));
  return [street, ...restSegments].filter(Boolean).join(', ').trim();
}

export function prepareDeliveryAddressForGeocoding(
  address: string,
  originAddress?: string | null,
  customerName?: string | null
): string {
  const normalizedName = normalizeTextForMatch(customerName || '');
  let segments = splitAddressSegments(address);

  if (segments.length === 0) return '';

  segments = segments.map(segment =>
    segment
      .replace(/^(?:endereco|endereço|entrega|delivery|local|para entrega)\s*[:\-]?\s*/i, '')
      .trim()
      .replace(/^av[.]?\s+/i, 'Avenida ')
      .replace(/^trav[.]?\s+/i, 'Travessa ')
      .replace(/^al[.]?\s+/i, 'Alameda ')
      .replace(/^rod[.]?\s+/i, 'Rodovia ')
  ).filter(Boolean);

  while (segments.length > 1) {
    const firstSegment = segments[0];
    const normalizedFirst = normalizeTextForMatch(firstSegment);
    const restHasAddress = segments.slice(1).some(isLikelyAddressSegment);
    const isCustomerNamePrefix = normalizedName && normalizedFirst === normalizedName;

    if (isCustomerNamePrefix || (!isLikelyAddressSegment(firstSegment) && restHasAddress)) {
      segments.shift();
      continue;
    }

    break;
  }

  let prepared = segments.join(', ').replace(/\s{2,}/g, ' ').trim();
  const originSuffix = extractOriginLocationSuffix(originAddress);

  if (prepared && originSuffix && !hasExplicitLocationContext(prepared, originAddress)) {
    prepared = `${prepared}, ${originSuffix}`;
  }

  return prepared;
}

function buildGeocodingQueries(
  address: string,
  originAddress?: string | null,
  customerName?: string | null
): string[] {
  const queries = new Set<string>();
  const raw = sanitizeDeliveryText(address || '').trim();
  const prepared = prepareDeliveryAddressForGeocoding(address, originAddress, customerName);
  const stripped = prepareDeliveryAddressForGeocoding(address, undefined, customerName);
  const preparedWithoutNumber = buildAddressWithoutNumber(prepared);
  const strippedWithoutNumber = buildAddressWithoutNumber(stripped);
  const originSuffix = extractOriginLocationSuffix(originAddress);
  const locationContextVariants = new Set<string>();

  for (const contextCandidate of [
    extractBrazilianCityContextFromFreeText(prepared),
    extractBrazilianCityContextFromFreeText(stripped),
    originSuffix || '',
  ]) {
    const parsedContext = parseBrazilianCityContext(contextCandidate);
    if (!parsedContext) continue;
    locationContextVariants.add(formatBrazilianCityContext(parsedContext));
    locationContextVariants.add(`${parsedContext.city}, ${parsedContext.stateCode}`);
    locationContextVariants.add(`${parsedContext.city} ${parsedContext.stateCode}`);
  }

  for (const candidate of [
    prepared,
    prepared ? `${prepared}, Brasil` : '',
    preparedWithoutNumber,
    preparedWithoutNumber ? `${preparedWithoutNumber}, Brasil` : '',
    stripped,
    strippedWithoutNumber,
    raw,
  ]) {
    if (candidate) {
      queries.add(candidate);
      for (const contextVariant of locationContextVariants) {
        queries.add(`${candidate}, ${contextVariant}`);
        queries.add(`${candidate}, ${contextVariant}, Brasil`);
      }
    }
  }

  return Array.from(queries);
}

function normalizePixSettings(raw: any): PixSettings {
  return {
    key: typeof raw?.key === 'string' ? raw.key.trim() : '',
    keyType: typeof raw?.keyType === 'string' ? raw.keyType.trim() : '',
    holderName: typeof raw?.holderName === 'string' ? raw.holderName.trim() : '',
    bankName: typeof raw?.bankName === 'string' ? raw.bankName.trim() : '',
    instructions: typeof raw?.instructions === 'string' ? raw.instructions.trim() : '',
    requireProof: raw?.requireProof === true,
  };
}

function normalizeCashSettings(raw: any): CashSettings {
  return {
    askForChange: raw?.askForChange !== false,
  };
}

function normalizeDeliveryFeeSettings(config: Partial<DeliveryConfig>): DeliveryFeeSettings {
  const raw = config.delivery_fee_settings || {} as DeliveryFeeSettings;
  const baseFee = parseOptionalNumber((raw as any).baseFee) ?? config.delivery_fee ?? 0;
  const originAddress = typeof raw.originAddress === 'string' ? raw.originAddress.trim() : '';
  const cityContext = typeof (raw as any).cityContext === 'string'
    ? sanitizeDeliveryText(String((raw as any).cityContext)).trim()
    : extractOriginLocationSuffix(originAddress) || '';

  return {
    mode: raw.mode === 'distance' ? 'distance' : 'fixed',
    originAddress,
    cityContext,
    baseFee,
    baseDistanceKm: parseOptionalNumber((raw as any).baseDistanceKm) ?? 2,
    additionalFeePerKm: parseOptionalNumber((raw as any).additionalFeePerKm) ?? 1,
    maxDistanceKm: parseOptionalNumber((raw as any).maxDistanceKm),
    fallbackFee: parseOptionalNumber((raw as any).fallbackFee) ?? baseFee,
  };
}

function normalizePaymentMethods(methods?: string[]): string[] {
  const items = (methods || ['dinheiro', 'cartao', 'pix'])
    .map(method => normalizeTextForMatch(String(method || '')))
    .filter(Boolean);
  return Array.from(new Set(items));
}

function getPaymentMethodLabel(method?: string | null): string {
  const normalized = normalizeTextForMatch(method || '');
  if (normalized.includes('pix')) return 'Pix';
  if (normalized.includes('dinheiro')) return 'Dinheiro';
  if (normalized.includes('cartao') || normalized.includes('credito') || normalized.includes('debito')) {
    return 'Cartão';
  }
  return method || 'Não informado';
}

function isCashPayment(method?: string | null): boolean {
  return normalizeTextForMatch(method || '').includes('dinheiro');
}

function isPixPayment(method?: string | null): boolean {
  return normalizeTextForMatch(method || '').includes('pix');
}

function getPixConfig(config: DeliveryConfig): PixSettings {
  return normalizePixSettings(config.pix_settings);
}

function getCashConfig(config: DeliveryConfig): CashSettings {
  return normalizeCashSettings(config.cash_settings);
}

function buildPaymentMethodsText(config: DeliveryConfig): string {
  return normalizePaymentMethods(config.payment_methods)
    .map(method => getPaymentMethodLabel(method))
    .join(', ');
}

function buildPixSummaryLines(config: DeliveryConfig): string[] {
  const pixSettings = getPixConfig(config);
  if (!pixSettings.key) return [];

  const lines = [`Chave Pix: ${pixSettings.key}`];
  if (pixSettings.keyType) lines.push(`Tipo da chave: ${pixSettings.keyType}`);
  if (pixSettings.holderName) lines.push(`Titular: ${pixSettings.holderName}`);
  if (pixSettings.bankName) lines.push(`Banco: ${pixSettings.bankName}`);
  if (pixSettings.instructions) lines.push(pixSettings.instructions);
  if (pixSettings.requireProof) lines.push('Envie o comprovante de pagamento no chat após concluir o Pix.');
  return lines;
}

function haversineDistanceKm(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const earthRadiusKm = 6371;
  const dLat = (toLat - fromLat) * Math.PI / 180;
  const dLon = (toLon - fromLon) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(fromLat * Math.PI / 180) *
      Math.cos(toLat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);
  return fetch(url, {
    ...init,
    signal,
  });
}

async function fetchViaCepAddressMatches(streetQuery: string, cityContext?: string | null): Promise<ViaCepAddressMatch[]> {
  const parsedContext = parseBrazilianCityContext(cityContext);
  const cleanedStreet = buildStreetLookupQuery(streetQuery);

  if (!parsedContext || !cleanedStreet) {
    return [];
  }

  try {
    const response = await fetchJsonWithTimeout(
      `https://viacep.com.br/ws/${encodeURIComponent(parsedContext.stateCode)}/${encodeURIComponent(normalizeExternalAddressLookup(parsedContext.city))}/${encodeURIComponent(normalizeExternalAddressLookup(cleanedStreet))}/json/`,
      {
        headers: {
          'User-Agent': 'AgenteZap/Delivery',
          'Accept-Language': 'pt-BR',
        },
      },
      8000
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }

    const normalizedStreet = normalizeTextForMatch(cleanedStreet).replace(/\b(?:rua|avenida|av|alameda|travessa|estrada|rodovia|praca|praça|largo)\b/g, '').trim();

    return data
      .filter((entry: any) => typeof entry?.cep === 'string' && typeof entry?.logradouro === 'string')
      .map((entry: ViaCepAddressMatch) => {
        const normalizedEntryStreet = normalizeTextForMatch(entry.logradouro || '').replace(/\b(?:rua|avenida|av|alameda|travessa|estrada|rodovia|praca|praça|largo)\b/g, '').trim();
        const compactStreet = normalizedStreet.replace(/\s+/g, '');
        const compactEntryStreet = normalizedEntryStreet.replace(/\s+/g, '');
        const similarity =
          compactStreet && compactEntryStreet
            ? 1 - (levenshteinDistance(compactStreet, compactEntryStreet) / Math.max(compactStreet.length, compactEntryStreet.length, 1))
            : 0;
        return { entry, similarity };
      })
      .filter(({ similarity, entry }) => {
        const normalizedEntryStreet = normalizeTextForMatch(entry.logradouro || '');
        return similarity >= 0.55
          || normalizedEntryStreet.includes(normalizedStreet)
          || normalizedStreet.includes(normalizedEntryStreet);
      })
      .sort((a, b) => b.similarity - a.similarity)
      .map(({ entry }) => entry);
  } catch (error) {
    console.warn('[DeliveryAI] Falha ao consultar ViaCEP:', error);
    return [];
  }
}

async function fetchCoordinatesByCep(cep: string): Promise<{ lat: number; lon: number } | null> {
  const sanitizedCep = (cep || '').replace(/\D/g, '');
  if (sanitizedCep.length !== 8) {
    return null;
  }

  try {
    const response = await fetchJsonWithTimeout(`https://cep.awesomeapi.com.br/json/${sanitizedCep}`, {
      headers: {
        'User-Agent': 'AgenteZap/Delivery',
        'Accept-Language': 'pt-BR',
      },
    }, 8000);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const lat = Number.parseFloat(String(data?.lat ?? ''));
    const lon = Number.parseFloat(String(data?.lng ?? data?.lon ?? ''));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    return { lat, lon };
  } catch (error) {
    console.warn('[DeliveryAI] Falha ao consultar coordenadas por CEP:', error);
    return null;
  }
}

async function fetchCoordinatesByArcGis(
  addressQuery: string
): Promise<{ lat: number; lon: number; matchedAddress?: string | null } | null> {
  const normalizedQuery = normalizeExternalAddressLookup(addressQuery);
  if (!normalizedQuery) {
    return null;
  }

  try {
    const response = await fetchJsonWithTimeout(
      `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=pjson&maxLocations=1&SingleLine=${encodeURIComponent(normalizedQuery)}`,
      {
        headers: {
          'User-Agent': 'AgenteZap/Delivery',
          'Accept-Language': 'pt-BR',
        },
      },
      10000
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const lat = Number.parseFloat(String(candidate?.location?.y ?? ''));
    const lon = Number.parseFloat(String(candidate?.location?.x ?? ''));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    return {
      lat,
      lon,
      matchedAddress: sanitizeDeliveryText(String(candidate?.address || '')).trim() || null,
    };
  } catch (error) {
    console.warn('[DeliveryAI] Falha ao consultar ArcGIS geocoder:', error);
    return null;
  }
}

async function geocodeAddressFallbackByPostalServices(
  address: string,
  cityContext?: string | null,
  originAddress?: string | null,
  customerName?: string | null
): Promise<GeocodedAddress | null> {
  const prepared = prepareDeliveryAddressForGeocoding(address, originAddress, customerName);
  const explicitCep = extractZipCode(prepared) || extractZipCode(address);
  const explicitStreetNumber = extractAddressStreetNumber(prepared || address);

  if (explicitCep) {
    const coordinates = await fetchCoordinatesByCep(explicitCep);
    if (coordinates) {
      console.log(`[DeliveryAI] Coordenadas por CEP explícito: "${address}" -> ${explicitCep}`);
      return coordinates;
    }

    const coordinatesByArcGis = await fetchCoordinatesByArcGis(
      [buildAddressWithoutNumber(prepared || address), explicitStreetNumber, cityContext, explicitCep, 'Brasil']
        .filter(Boolean)
        .join(', ')
    );
    if (coordinatesByArcGis) {
      console.log(`[DeliveryAI] Fallback ArcGIS por CEP explícito: "${address}" -> ${explicitCep}`);
      return coordinatesByArcGis;
    }
  }

  const matches = await fetchViaCepAddressMatches(prepared || address, cityContext);
  for (const match of matches.slice(0, 3)) {
    const coordinates = await fetchCoordinatesByCep(match.cep);
    if (coordinates) {
      console.log(`[DeliveryAI] Fallback ViaCEP/AwesomeAPI: "${address}" -> "${match.logradouro}, ${match.localidade}-${match.uf} (${match.cep})"`);
      return {
        ...coordinates,
        cityContext: formatBrazilianCityContext({
          city: sanitizeDeliveryText(match.localidade || '').trim(),
          stateCode: sanitizeDeliveryText(match.uf || '').trim().toUpperCase(),
        }),
      };
    }

    const coordinatesByArcGis = await fetchCoordinatesByArcGis(
      [
        match.logradouro,
        explicitStreetNumber,
        match.bairro,
        match.localidade,
        match.uf,
        match.cep,
        'Brasil',
      ]
        .filter(Boolean)
        .join(', ')
    );
    if (coordinatesByArcGis) {
      console.log(`[DeliveryAI] Fallback ViaCEP/ArcGIS: "${address}" -> "${match.logradouro}, ${match.localidade}-${match.uf} (${match.cep})"`);
      return {
        ...coordinatesByArcGis,
        cityContext: formatBrazilianCityContext({
          city: sanitizeDeliveryText(match.localidade || '').trim(),
          stateCode: sanitizeDeliveryText(match.uf || '').trim().toUpperCase(),
        }),
      };
    }
  }

  return null;
}

async function geocodeAddress(
  address: string,
  originAddress?: string | null,
  customerName?: string | null,
  cityContextHint?: string | null
): Promise<GeocodedAddress | null> {
  const effectiveOriginContext = cityContextHint || originAddress;
  const queries = buildGeocodingQueries(address, effectiveOriginContext, customerName);
  if (queries.length === 0) return null;

  for (const query of queries) {
    try {
      const externalQuery = normalizeExternalAddressLookup(query);
      const response = await fetchJsonWithTimeout(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(externalQuery)}`,
        {
          headers: {
            'User-Agent': 'AgenteZap/Delivery',
            'Accept-Language': 'pt-BR',
          },
        },
        10000
      );
      if (!response.ok) continue;

      const data = await response.json();
      const match = data?.[0];
      if (!match) continue;

      const lat = Number.parseFloat(match.lat);
      const lon = Number.parseFloat(match.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const matchedCityContext = extractBrazilianCityContextFromNominatimAddress(match.address);
      if (!matchesBrazilianCityContextHint(matchedCityContext, cityContextHint)) {
        console.log(`[DeliveryAI] Geocode ignorado por cidade divergente: "${externalQuery}" -> "${matchedCityContext || 'sem cidade'}"`);
        continue;
      }

      if (query !== address.trim() || externalQuery !== query) {
        console.log(`[DeliveryAI] Geocode ajustado: "${address}" -> "${externalQuery}"`);
      }

      return {
        lat,
        lon,
        cityContext: matchedCityContext,
      };
    } catch (error) {
      console.warn('[DeliveryAI] Falha ao geocodificar endereço:', error);
    }
  }

  const parsedHint = parseBrazilianCityContext(cityContextHint);
  const requestedStreetNumber = extractAddressStreetNumber(address);
  const arcGisQueryCandidates = [...queries]
    .sort((left, right) => {
      const leftHasNumber = extractAddressStreetNumber(left) ? 1 : 0;
      const rightHasNumber = extractAddressStreetNumber(right) ? 1 : 0;
      if (leftHasNumber !== rightHasNumber) {
        return leftHasNumber - rightHasNumber;
      }
      return left.length - right.length;
    })
    .slice(0, 10);

  for (const query of arcGisQueryCandidates) {
    const arcGisQuery = [query, cityContextHint, 'Brasil']
      .filter(Boolean)
      .join(', ');
    const arcGisCoordinates = await fetchCoordinatesByArcGis(arcGisQuery);
    if (arcGisCoordinates) {
      const arcGisCityContext = extractBrazilianCityContextFromFreeText(arcGisCoordinates.matchedAddress || '');
      const normalizedMatchedAddress = normalizeTextForMatch(arcGisCoordinates.matchedAddress || '');
      const matchedStreetNumber = extractAddressStreetNumber(arcGisCoordinates.matchedAddress || '');
      const matchesArcGisHint = parsedHint
        ? normalizedMatchedAddress.includes(normalizeTextForMatch(parsedHint.city))
        : matchesBrazilianCityContextHint(arcGisCityContext, cityContextHint);
      if (!matchesArcGisHint) {
        console.log(`[DeliveryAI] ArcGIS ignorado por cidade divergente: "${arcGisQuery}" -> "${arcGisCoordinates.matchedAddress || 'sem endereco'}"`);
        continue;
      }
      if (requestedStreetNumber && requestedStreetNumber !== matchedStreetNumber) {
        console.log(`[DeliveryAI] ArcGIS ignorado por numero divergente: "${arcGisQuery}" -> "${arcGisCoordinates.matchedAddress || 'sem endereco'}"`);
        continue;
      }
      console.log(`[DeliveryAI] Fallback ArcGIS direto: "${address}" -> "${arcGisQuery}"`);
      return {
        ...arcGisCoordinates,
        cityContext: parsedHint
          ? formatBrazilianCityContext(parsedHint)
          : (cityContextHint ? sanitizeDeliveryText(cityContextHint).trim() : null),
      };
    }
  }

  const postalServiceCoordinates = await geocodeAddressFallbackByPostalServices(
    address,
    cityContextHint || originAddress,
    effectiveOriginContext,
    customerName
  );
  if (postalServiceCoordinates) {
    return postalServiceCoordinates;
  }

  return null;
}

async function getDrivingDistanceKm(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number }
): Promise<number | null> {
  try {
    const response = await fetchJsonWithTimeout(
      `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=false`,
      {
        headers: { 'User-Agent': 'AgenteZap/Delivery' },
      },
      8000
    );
    if (!response.ok) return null;

    const data = await response.json();
    const meters = data.routes?.[0]?.distance;
    if (!Number.isFinite(meters)) return null;
    return meters / 1000;
  } catch (error) {
    console.warn('[DeliveryAI] Falha ao consultar rota OSRM:', error);
    return null;
  }
}

export async function estimateDeliveryFee(
  config: DeliveryConfig,
  deliveryAddress?: string | null
): Promise<DeliveryFeeCalculation> {
  const feeSettings = normalizeDeliveryFeeSettings(config);
  const fallbackFee = feeSettings.fallbackFee ?? config.delivery_fee ?? 0;

  if (feeSettings.mode !== 'distance') {
    return {
      fee: config.delivery_fee ?? feeSettings.baseFee ?? fallbackFee,
      distanceKm: null,
      mode: 'fixed',
      label: 'Taxa fixa',
    };
  }

  if (!feeSettings.originAddress || !deliveryAddress) {
    return {
      fee: fallbackFee,
      distanceKm: null,
      mode: 'fallback',
      label: 'Taxa estimada',
      details: 'A taxa definitiva será calculada quando o endereço estiver completo.',
    };
  }

  const origin = await geocodeAddress(
    feeSettings.originAddress,
    feeSettings.cityContext || feeSettings.originAddress,
    undefined,
    feeSettings.cityContext || undefined
  );
  const resolvedCityContext =
    feeSettings.cityContext ||
    origin?.cityContext ||
    extractOriginLocationSuffix(feeSettings.originAddress) ||
    '';
  const destination = await geocodeAddress(
    deliveryAddress,
    resolvedCityContext || feeSettings.originAddress,
    undefined,
    resolvedCityContext || undefined
  );

  if (!origin || !destination) {
    return {
      fee: fallbackFee,
      distanceKm: null,
      mode: 'fallback',
      label: 'Taxa de fallback',
      details: 'Não foi possível calcular a distância automaticamente. Envie bairro, cidade ou CEP para calcular a taxa corretamente.',
    };
  }

  const routeDistanceKm =
    (await getDrivingDistanceKm(origin, destination)) ??
    haversineDistanceKm(origin.lat, origin.lon, destination.lat, destination.lon);
  const distanceKm = Math.round(routeDistanceKm * 10) / 10;

  if (feeSettings.maxDistanceKm && distanceKm > feeSettings.maxDistanceKm) {
    return {
      fee: fallbackFee,
      distanceKm,
      mode: 'fallback',
      label: 'Taxa fora do raio',
      details: `Endereço estimado em ${formatDistance(distanceKm)}, acima do raio configurado.`,
    };
  }

  const extraDistanceKm = Math.max(0, distanceKm - feeSettings.baseDistanceKm);
  const fee = Math.round((feeSettings.baseFee + (extraDistanceKm * feeSettings.additionalFeePerKm)) * 100) / 100;

  return {
    fee,
    distanceKm,
    mode: 'distance',
    label: 'Taxa por distância',
    details: `${formatDistance(distanceKm)} desde a origem configurada.`,
  };
}

function buildDeliveryOrderNotes(
  customerInfo: CustomerInfo,
  deliveryFeeInfo?: DeliveryFeeCalculation | null
): string | null {
  const notes: string[] = [];

  if (customerInfo.changeNeeded === false) {
    notes.push('Pagamento em dinheiro sem necessidade de troco.');
  } else if (customerInfo.changeNeeded === true && customerInfo.changeForAmount) {
    notes.push(`Troco para ${formatCurrency(customerInfo.changeForAmount)}.`);
  } else if (customerInfo.changeNeeded === true) {
    notes.push('Cliente informou que precisa de troco, mas não informou o valor.');
  }

  if (deliveryFeeInfo?.distanceKm !== null && deliveryFeeInfo?.distanceKm !== undefined) {
    notes.push(`Distância estimada: ${formatDistance(deliveryFeeInfo.distanceKm)}.`);
  }

  if (deliveryFeeInfo?.mode) {
    notes.push(`Cálculo da taxa: ${deliveryFeeInfo.label}.`);
  }

  return notes.length > 0 ? notes.join(' ') : null;
}

export function extractReusableAddressProfile(orders: any[]): SavedCustomerProfile | null {
  for (const order of orders) {
    if (
      order?.customer_name ||
      order?.customer_address ||
      order?.customer_reference ||
      order?.payment_method
    ) {
      return {
        customerName: order.customer_name || null,
        customerAddress: order.customer_address || null,
        customerReference: order.customer_reference || null,
        paymentMethod: order.payment_method || null,
      };
    }
  }

  return null;
}

async function getLatestSavedCustomerProfile(
  userId: string,
  customerPhone?: string
): Promise<SavedCustomerProfile | null> {
  if (!customerPhone) return null;

  try {
    const { data, error } = await supabase
      .from('delivery_orders')
      .select('customer_name, customer_address, customer_reference, payment_method, created_at')
      .eq('user_id', userId)
      .eq('customer_phone', customerPhone)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('🍕 [DeliveryAI] Erro ao buscar perfil salvo do cliente:', error);
      return null;
    }

    return extractReusableAddressProfile(data || []);
  } catch (error) {
    console.error('🍕 [DeliveryAI] Erro interno ao buscar perfil salvo do cliente:', error);
    return null;
  }
}

export function getSavedProfilePrompt(
  savedProfile?: SavedCustomerProfile | null,
  forDeliveryOnly = false
): string | null {
  if (!savedProfile) return null;

  const segments: string[] = [];

  if (savedProfile.customerName) {
    segments.push(`👤 *Nome salvo:* ${savedProfile.customerName}`);
  }

  if (savedProfile.customerAddress) {
    const referenceLine = savedProfile.customerReference
      ? `\n📌 *Referência salva:* ${savedProfile.customerReference}`
      : '';
    segments.push(
      `${forDeliveryOnly ? '📍 *Último endereço usado:*' : '📍 *Endereço salvo:*'} ${savedProfile.customerAddress}${referenceLine}\nResponda *sim* para usar o mesmo ou mande um novo endereço.`
    );
  }

  if (savedProfile.paymentMethod) {
    segments.push(`💳 *Pagamento usado por último:* ${getPaymentMethodLabel(savedProfile.paymentMethod)}`);
  }

  return segments.length > 0 ? segments.join('\n\n') : null;
}

function isAffirmativeShortReply(message: string): boolean {
  return /^(sim|s|isso|pode|pode sim|confirmo|certo|ok|blz|beleza|mesmo|mantem|mantém)$/i.test(
    normalizeTextForMatch(message)
  );
}

function isNegativeShortReply(message: string): boolean {
  return /^(nao|não|n|outro|novo|trocar|mudar|nao quero|não quero)$/i.test(
    normalizeTextForMatch(message)
  );
}

export function mapDeliveryOpeningFlowToActions(flowMedia?: DeliveryOpeningFlowMedia | null): MistralResponse['actions'] {
  if (!flowMedia || flowMedia.mediaType !== 'flow' || !Array.isArray(flowMedia.flowItems)) {
    return [];
  }

  return (flowMedia.flowItems as DeliveryOpeningFlowItem[])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((item) => item.type === 'media' && item.mediaType === 'image' && item.storageUrl)
    .map((item) => ({
      type: 'send_media_url' as const,
      media_url: item.storageUrl!,
      media_type: 'image' as const,
      caption: item.caption || flowMedia.caption || flowMedia.description || 'Abertura do delivery',
    }));
}

async function buildDeliveryOpeningMediaActions(userId: string): Promise<MistralResponse['actions']> {
  try {
    const flowMedia = await getMediaByName(userId, 'DELIVERY_ABERTURA') as DeliveryOpeningFlowMedia | null;
    return mapDeliveryOpeningFlowToActions(flowMedia);
  } catch (error) {
    console.error('🍕 [DeliveryAI] Erro ao montar mídias de abertura do delivery:', error);
    return [];
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ›’ SISTEMA DE CARRINHO (EM MEMÃ“RIA)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

interface CartItemOption {
  group: string;
  option: string;
  price: number;
}

interface CartItem {
  itemId: string; // chave interna do carrinho
  menuItemId?: string | null; // id real do menu (quando existir)
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  optionsSelected?: CartItemOption[];
}

interface SavedCustomerProfile {
  customerName?: string | null;
  customerAddress?: string | null;
  customerReference?: string | null;
  paymentMethod?: string | null;
}

interface CustomerCart {
  items: Map<string, CartItem>;
  customerPhone: string;
  deliveryType: 'delivery' | 'pickup' | null;
  paymentMethod: string | null;
  address: string | null;
  customerReference: string | null;
  customerName: string | null;
  savedProfile: SavedCustomerProfile | null;
  awaitingAddressReuse: boolean;
  awaitingConfirmation: boolean;
  checkoutState: {
    phase: 'collecting_info' | 'awaiting_confirmation';
    info: CustomerInfo;
    lastMissingFields?: string[];
    updatedAt: Date;
  } | null;
  createdAt: Date;
  lastUpdated: Date;
}

// Armazena carrinhos por chave: "userId:customerPhone"
const cartsCache = new Map<string, CustomerCart>();
const conversationCartBindings = new Map<string, string>();

function buildCartKey(userId: string, customerPhone: string): string {
  return `${userId}:${customerPhone}`;
}

function buildConversationCartBindingKey(userId: string, conversationId: string): string {
  return `${userId}:conversation:${conversationId}`;
}

function bindConversationToCart(userId: string, conversationId: string | undefined, cartKey: string): void {
  if (!conversationId) return;
  conversationCartBindings.set(buildConversationCartBindingKey(userId, conversationId), cartKey);
}

function resolveCartReference(
  userId: string,
  customerPhone?: string,
  conversationId?: string
): { key: string; cart: CustomerCart } | null {
  if (customerPhone) {
    const phoneKey = buildCartKey(userId, customerPhone);
    const phoneCart = cartsCache.get(phoneKey);
    if (phoneCart) {
      bindConversationToCart(userId, conversationId, phoneKey);
      return { key: phoneKey, cart: phoneCart };
    }
  }

  if (conversationId) {
    const boundKey = conversationCartBindings.get(buildConversationCartBindingKey(userId, conversationId));
    if (boundKey) {
      const boundCart = cartsCache.get(boundKey);
      if (boundCart) {
        if (customerPhone) {
          const phoneKey = buildCartKey(userId, customerPhone);
          if (phoneKey !== boundKey) {
            cartsCache.set(phoneKey, boundCart);
            bindConversationToCart(userId, conversationId, phoneKey);
            boundCart.customerPhone = customerPhone;
            return { key: phoneKey, cart: boundCart };
          }
        }

        return { key: boundKey, cart: boundCart };
      }

      conversationCartBindings.delete(buildConversationCartBindingKey(userId, conversationId));
    }
  }

  return null;
}

function getExistingCart(userId: string, customerPhone?: string, conversationId?: string): CustomerCart | null {
  return resolveCartReference(userId, customerPhone, conversationId)?.cart || null;
}

function isSyntheticConversationId(conversationId?: string | null): boolean {
  if (!conversationId) return false;
  return (
    conversationId.startsWith('sim-') ||
    conversationId.startsWith('simulator-') ||
    conversationId.startsWith('simulator-chatbot-')
  );
}

// Limpar carrinhos antigos (mais de 2 horas)
const CART_EXPIRY_MS = 2 * 60 * 60 * 1000;

function cleanOldCarts(): void {
  const now = Date.now();
  for (const [key, cart] of cartsCache.entries()) {
    if (now - cart.lastUpdated.getTime() > CART_EXPIRY_MS) {
      cartsCache.delete(key);
      console.log(`ðŸ›’ [Cart] Carrinho expirado removido: ${key}`);
    }
  }
}

// Limpar a cada 30 minutos
setInterval(cleanOldCarts, 30 * 60 * 1000);

export function getCart(userId: string, customerPhone: string, conversationId?: string): CustomerCart {
  const existingReference = resolveCartReference(userId, customerPhone, conversationId);
  if (existingReference) {
    bindConversationToCart(userId, conversationId, buildCartKey(userId, customerPhone));
    existingReference.cart.customerPhone = customerPhone;
    return existingReference.cart;
  }

  const key = buildCartKey(userId, customerPhone);
  let cart = cartsCache.get(key);
  
  if (!cart) {
    cart = {
      items: new Map(),
      customerPhone,
      deliveryType: null,
      paymentMethod: null,
      address: null,
      customerReference: null,
      customerName: null,
      savedProfile: null,
      awaitingAddressReuse: false,
      awaitingConfirmation: false,
      checkoutState: null,
      createdAt: new Date(),
      lastUpdated: new Date(),
    };
    cartsCache.set(key, cart);
    bindConversationToCart(userId, conversationId, key);
    console.log(`ðŸ›’ [Cart] Novo carrinho criado: ${key}`);
  }
  
  return cart;
}

export function addToCart(
  userId: string, 
  customerPhone: string, 
  item: MenuItem, 
  quantity: number = 1,
  options?: {
    displayName?: string;
    priceOverride?: number;
    notes?: string;
    optionsSelected?: CartItemOption[];
    itemKeySuffix?: string;
  },
  conversationId?: string
): CustomerCart {
  const cart = getCart(userId, customerPhone, conversationId);
  const itemKey = options?.itemKeySuffix ? `${item.id}:${options.itemKeySuffix}` : item.id;
  const displayName = options?.displayName || item.name;
  const unitPrice = options?.priceOverride ?? item.price;
  const notes = options?.notes;
  const optionsSelected = options?.optionsSelected;
  
  const existing = cart.items.get(itemKey);
  if (existing) {
    existing.quantity += quantity;
    if (notes) existing.notes = notes;
    if (optionsSelected) existing.optionsSelected = optionsSelected;
    console.log(`ðŸ›’ [Cart] Item atualizado: ${displayName} x${existing.quantity}`);
  } else {
    cart.items.set(itemKey, {
      itemId: itemKey,
      menuItemId: item.id,
      name: displayName,
      price: unitPrice,
      quantity,
      notes,
      optionsSelected,
    });
    console.log(`ðŸ›’ [Cart] Item adicionado: ${displayName} x${quantity}`);
  }
  
  cart.awaitingConfirmation = false;
  cart.checkoutState = null;
  cart.lastUpdated = new Date();
  return cart;
}

export function addCustomItemToCart(
  userId: string,
  customerPhone: string,
  customItem: {
    itemId: string;
    name: string;
    price: number;
    quantity?: number;
    notes?: string;
    optionsSelected?: CartItemOption[];
    menuItemId?: string | null;
  },
  conversationId?: string
): CustomerCart {
  const cart = getCart(userId, customerPhone, conversationId);
  const quantity = customItem.quantity ?? 1;
  const existing = cart.items.get(customItem.itemId);
  if (existing) {
    existing.quantity += quantity;
    if (customItem.notes) existing.notes = customItem.notes;
    if (customItem.optionsSelected) existing.optionsSelected = customItem.optionsSelected;
    console.log(`ðŸ›’ [Cart] Item custom atualizado: ${customItem.name} x${existing.quantity}`);
  } else {
    cart.items.set(customItem.itemId, {
      itemId: customItem.itemId,
      menuItemId: customItem.menuItemId ?? null,
      name: customItem.name,
      price: customItem.price,
      quantity,
      notes: customItem.notes,
      optionsSelected: customItem.optionsSelected,
    });
    console.log(`ðŸ›’ [Cart] Item custom adicionado: ${customItem.name} x${quantity}`);
  }
  cart.awaitingConfirmation = false;
  cart.checkoutState = null;
  cart.lastUpdated = new Date();
  return cart;
}

export function removeFromCart(userId: string, customerPhone: string, itemId: string, conversationId?: string): boolean {
  const cart = getCart(userId, customerPhone, conversationId);
  const removed = cart.items.delete(itemId);
  cart.awaitingConfirmation = false;
  cart.checkoutState = null;
  cart.lastUpdated = new Date();
  return removed;
}

export function clearCart(userId: string, customerPhone: string, conversationId?: string): void {
  const key = resolveCartReference(userId, customerPhone, conversationId)?.key || buildCartKey(userId, customerPhone);
  cartsCache.delete(key);
  if (conversationId) {
    conversationCartBindings.delete(buildConversationCartBindingKey(userId, conversationId));
  }
  for (const [bindingKey, boundCartKey] of conversationCartBindings.entries()) {
    if (boundCartKey === key && bindingKey.startsWith(`${userId}:conversation:`)) {
      conversationCartBindings.delete(bindingKey);
    }
  }
  console.log(`ðŸ›’ [Cart] Carrinho limpo: ${key}`);
}

export function getCartSubtotal(cart: CustomerCart): number {
  let total = 0;
  for (const item of cart.items.values()) {
    total += item.price * item.quantity;
  }
  return Math.round(total * 100) / 100;
}

export function getCartTotal(cart: CustomerCart, deliveryFee: number): number {
  const subtotal = getCartSubtotal(cart);
  const fee = cart.deliveryType === 'delivery' ? deliveryFee : 0;
  return Math.round((subtotal + fee) * 100) / 100;
}

export function formatCartSummary(cart: CustomerCart, deliveryFee: number): string {
  if (cart.items.size === 0) {
    return 'Seu carrinho estÃ¡ vazio. ðŸ›’\n\nMe diga o que deseja pedir!';
  }
  
  let text = `ðŸ›’ *SEU PEDIDO*\n`;
  text += `â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n`;
  
  for (const item of cart.items.values()) {
    const itemTotal = item.price * item.quantity;
    text += `${item.quantity}x ${item.name} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;
    const addOns = item.optionsSelected?.filter(opt => !/tamanho|size/i.test(opt.group)) || [];
    if (addOns.length > 0) {
      text += `   _Adicionais: ${addOns.map(opt => opt.option).join(', ')}_\n`;
    }
    if (item.notes) {
      text += `   _Obs: ${item.notes}_\n`;
    }
  }
  
  const subtotal = getCartSubtotal(cart);
  text += `â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n`;
  text += `ðŸ“¦ Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}\n`;
  
  if (cart.deliveryType === 'delivery') {
    text += `ðŸ›µ Taxa entrega: R$ ${deliveryFee.toFixed(2).replace('.', ',')}\n`;
    text += `ðŸ’° *Total: R$ ${(subtotal + deliveryFee).toFixed(2).replace('.', ',')}*\n`;
  } else if (cart.deliveryType === 'pickup') {
    text += `ðŸª Retirada: GRÃTIS\n`;
    text += `ðŸ’° *Total: R$ ${subtotal.toFixed(2).replace('.', ',')}*\n`;
  }
  
  return text;
}

interface MenuOptionGroupMatch {
  item: MenuItem;
  categoryName: string;
  group: MenuItemOption;
}

interface CartOptionSelectionMatch {
  cartItemId: string;
  cartItem: CartItem;
  menuItem: MenuItem;
  group: MenuItemOption;
  option: MenuItemOption['options'][number];
}

function isSizeOptionGroup(groupName: string): boolean {
  const normalized = normalizeTextForMatch(groupName);
  return normalized.includes('tamanho') || normalized.includes('size');
}

function findMenuItemById(deliveryData: DeliveryData, menuItemId?: string | null): MenuItem | null {
  if (!menuItemId) return null;

  for (const category of deliveryData.categories) {
    for (const item of category.items) {
      if (item.id === menuItemId) {
        return item;
      }
    }
  }

  return null;
}

function detectOptionGroupHint(message: string): 'borda' | 'adicional' | 'tamanho' | null {
  const normalized = normalizeTextForMatch(message);

  if (normalized.includes('borda') || normalized.includes('reche')) {
    return 'borda';
  }

  if (normalized.includes('adicional') || normalized.includes('extra') || normalized.includes('complemento')) {
    return 'adicional';
  }

  if (normalized.includes('tamanho') || normalized.includes('size')) {
    return 'tamanho';
  }

  return null;
}

function optionGroupMatchesHint(group: MenuItemOption, hint: 'borda' | 'adicional' | 'tamanho'): boolean {
  const normalizedGroup = normalizeTextForMatch(group.name);

  if (hint === 'borda') {
    return normalizedGroup.includes('borda') || normalizedGroup.includes('reche');
  }

  if (hint === 'adicional') {
    return normalizedGroup.includes('adicional') || normalizedGroup.includes('extra') || normalizedGroup.includes('complement');
  }

  return isSizeOptionGroup(group.name);
}

function buildCartNotesFromOptions(optionsSelected: CartItemOption[]): string | undefined {
  if (!optionsSelected.length) return undefined;

  const noteParts: string[] = [];
  const sizeOption = optionsSelected.find(opt => isSizeOptionGroup(opt.group));
  const addOns = optionsSelected.filter(opt => !isSizeOptionGroup(opt.group));

  if (sizeOption) {
    noteParts.push(`Tamanho: ${sizeOption.option}`);
  }

  if (addOns.length > 0) {
    noteParts.push(`Adicionais: ${addOns.map(opt => opt.option).join(', ')}`);
  }

  return noteParts.length > 0 ? noteParts.join(' | ') : undefined;
}

function findRelevantOptionGroup(
  deliveryData: DeliveryData,
  hint: 'borda' | 'adicional' | 'tamanho',
  cart?: CustomerCart | null
): MenuOptionGroupMatch | null {
  const preferredMenuItemIds = new Set(
    Array.from(cart?.items.values() || [])
      .map(item => item.menuItemId)
      .filter((value): value is string => !!value)
  );

  let bestMatch: { score: number; value: MenuOptionGroupMatch } | null = null;

  for (const category of deliveryData.categories) {
    const categoryNormalized = normalizeTextForMatch(category.name);
    for (const item of category.items) {
      for (const group of item.options || []) {
        if (!group.options?.length) continue;
        if (!optionGroupMatchesHint(group, hint)) continue;

        let score = 0;
        if (preferredMenuItemIds.has(item.id)) score += 100;
        if (categoryNormalized.includes('pizza')) score += 25;
        if (!isSizeOptionGroup(group.name)) score += 10;

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            score,
            value: {
              item,
              categoryName: category.name,
              group,
            },
          };
        }
      }
    }
  }

  return bestMatch?.value || null;
}

function formatOptionGroupPrompt(match: MenuOptionGroupMatch): string {
  const optionsText = match.group.options
    .map(opt => `• ${opt.name}${opt.price > 0 ? ` - R$ ${opt.price.toFixed(2).replace('.', ',')}` : ''}`)
    .join('\n');

  return `🍕 Para *${match.item.name}*, estas são as opções de *${match.group.name}*:\n\n${optionsText}\n\nSe quiser, me diga qual opção você prefere que eu adiciono ao pedido.`;
}

function buildRealMenuSuggestions(deliveryData: DeliveryData, cart?: CustomerCart | null): string[] {
  const cartCategories = new Set(
    Array.from(cart?.items.values() || [])
      .map(item => findMenuItemById(deliveryData, item.menuItemId)?.category_name)
      .filter((value): value is string => !!value)
      .map(value => normalizeTextForMatch(value))
  );

  const ranked = deliveryData.categories
    .filter(category => category.items.length > 0)
    .map(category => {
      const normalized = normalizeTextForMatch(category.name);
      let score = 0;

      if (normalized.includes('refriger') || normalized.includes('bebida')) score += 100;
      if (!cartCategories.has(normalized)) score += 30;
      if (normalized.includes('pizza')) score -= 10;

      return { name: category.name, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 2).map(item => item.name);
}

function buildPostAddFollowUp(deliveryData: DeliveryData, cart?: CustomerCart | null): string {
  const suggestions = buildRealMenuSuggestions(deliveryData, cart);
  let message = '\n\nDeseja mais alguma coisa?';

  if (suggestions.length === 1) {
    message += ` Posso te mostrar *${suggestions[0]}*.`;
  } else if (suggestions.length >= 2) {
    message += ` Posso te mostrar *${suggestions[0]}* ou *${suggestions[1]}*.`;
  }

  message += `\n\nPara finalizar, me diga:\n📝 Nome\n🚚 Tipo de entrega: ${deliveryData.config.accepts_delivery && deliveryData.config.accepts_pickup
    ? '🛵 Delivery ou 🏪 Retirada'
    : deliveryData.config.accepts_delivery
      ? '🛵 Delivery'
      : '🏪 Retirada'
  }\n📍 Endereço (se for entrega)\n💳 Forma de pagamento`;

  return message;
}

function formatUnavailableOptionGroupMessage(
  hint: 'borda' | 'adicional' | 'tamanho',
  deliveryData: DeliveryData,
  cart?: CustomerCart | null
): string {
  const suggestions = buildRealMenuSuggestions(deliveryData, cart);

  if (hint === 'borda') {
    if (suggestions.length >= 2) {
      return `No cardápio configurado agora não há opções de *borda recheada* cadastradas.\n\nPosso seguir com a pizza como está ou te mostrar *${suggestions[0]}* e *${suggestions[1]}*.`;
    }
    if (suggestions.length === 1) {
      return `No cardápio configurado agora não há opções de *borda recheada* cadastradas.\n\nPosso seguir com a pizza como está ou te mostrar *${suggestions[0]}*.`;
    }
    return `No cardápio configurado agora não há opções de *borda recheada* cadastradas.\n\nPosso seguir com a pizza como está ou continuar para finalizar o pedido.`;
  }

  return `No cardápio configurado agora não encontrei opções de *${hint}* cadastradas.\n\nPosso seguir com o pedido atual ou te mostrar outras categorias disponíveis.`;
}

function shouldTreatMessageAsOptionGroupQuery(
  message: string,
  cart?: CustomerCart | null
): boolean {
  if (!cart || cart.items.size === 0) return false;

  const normalized = normalizeTextForMatch(message);
  if (!normalized) return false;

  if (cart.awaitingConfirmation) {
    return true;
  }

  const acceptanceSignals = [
    'sem borda',
    'segue como esta',
    'segue como ta',
    'pode seguir',
    'pode ser assim',
  ];

  const customerInfoSignals = [
    'entrega',
    'delivery',
    'retirada',
    'retirar',
    'pix',
    'dinheiro',
    'cartao',
    'credito',
    'debito',
    'rua',
    'avenida',
    'travessa',
    'alameda',
    'bairro',
  ];

  if (acceptanceSignals.some(signal => normalized.includes(signal))) {
    return false;
  }

  if (customerInfoSignals.some(signal => normalized.includes(signal))) {
    return false;
  }

  const questionSignals = [
    'qual',
    'quais',
    'tem',
    'opcao',
    'opcoes',
    'mostra',
    'mostrar',
    'ver',
  ];

  if (normalized.startsWith('sim')) {
    return true;
  }

  return questionSignals.some(signal => normalized.includes(signal));
}

function findCartOptionSelection(
  deliveryData: DeliveryData,
  cart: CustomerCart,
  message: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): CartOptionSelectionMatch | null {
  const normalizedMessage = normalizeTextForMatch(message);
  const groupHint = detectOptionGroupHint(message);
  const recentBotText = normalizeTextForMatch(
    conversationHistory?.filter(entry => entry.fromMe).slice(-1)[0]?.text || ''
  );

  let bestMatch: { score: number; value: CartOptionSelectionMatch } | null = null;

  for (const [cartItemId, cartItem] of cart.items.entries()) {
    const menuItem = findMenuItemById(deliveryData, cartItem.menuItemId);
    if (!menuItem) continue;

    for (const group of menuItem.options || []) {
      if (!group.options?.length || isSizeOptionGroup(group.name)) continue;

      const groupIsHinted = groupHint ? optionGroupMatchesHint(group, groupHint) : false;
      const normalizedGroup = normalizeTextForMatch(group.name);

      for (const option of group.options) {
        const normalizedOption = normalizeTextForMatch(option.name);
        if (!normalizedOption) continue;

        const mentionsOption = normalizedMessage.includes(normalizedOption) || normalizedOption.includes(normalizedMessage);
        if (!mentionsOption) continue;

        let score = 100;
        if (groupIsHinted) score += 40;
        if (recentBotText.includes(normalizedGroup) || recentBotText.includes(normalizedOption)) score += 20;
        if (normalizeTextForMatch(menuItem.category_name).includes('pizza')) score += 10;

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            score,
            value: {
              cartItemId,
              cartItem,
              menuItem,
              group,
              option,
            },
          };
        }
      }
    }
  }

  return bestMatch?.value || null;
}

function applyOptionSelectionToCart(
  userId: string,
  customerPhone: string,
  selection: CartOptionSelectionMatch,
  conversationId?: string
): CustomerCart {
  const cart = getCart(userId, customerPhone, conversationId);
  const targetItem = cart.items.get(selection.cartItemId);

  if (!targetItem) {
    return cart;
  }

  const existingOptions = [...(targetItem.optionsSelected || [])];
  const normalizedGroup = normalizeTextForMatch(selection.group.name);
  const normalizedOption = normalizeTextForMatch(selection.option.name);

  const retainedOptions = existingOptions.filter(opt => {
    const sameGroup = normalizeTextForMatch(opt.group) === normalizedGroup;
    const sameOption = normalizeTextForMatch(opt.option) === normalizedOption;

    if (selection.group.type === 'single') {
      return !sameGroup;
    }

    return !(sameGroup && sameOption);
  });

  const removedPrice = existingOptions
    .filter(opt => !retainedOptions.includes(opt))
    .reduce((sum, opt) => sum + opt.price, 0);

  const alreadySelected = existingOptions.some(opt =>
    normalizeTextForMatch(opt.group) === normalizedGroup &&
    normalizeTextForMatch(opt.option) === normalizedOption
  );

  const updatedOptions = alreadySelected
    ? existingOptions
    : [
        ...retainedOptions,
        {
          group: selection.group.name,
          option: selection.option.name,
          price: selection.option.price,
        },
      ];

  if (!alreadySelected) {
    targetItem.price = Math.max(0, targetItem.price - removedPrice + selection.option.price);
  }

  targetItem.optionsSelected = updatedOptions;
  targetItem.notes = buildCartNotesFromOptions(updatedOptions);
  cart.awaitingConfirmation = false;
  cart.lastUpdated = new Date();

  return cart;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ï¿½ EXTRAÃ‡ÃƒO DE INFORMAÃ‡Ã•ES DO CLIENTE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

interface DeliveryTurnInterpretation {
  intent: CustomerIntent;
  normalizedMessage: string;
  categoryHint?: string | null;
  referencesCart?: boolean;
  confidence?: 'high' | 'medium' | 'low';
  reasoning?: string;
}

function extractJsonObject<T>(content: string | null | undefined): T | null {
  if (!content) return null;

  const trimmed = content.trim();
  const candidates = [trimmed];
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');

  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // tenta o prÃ³ximo candidato
    }
  }

  return null;
}

function buildDeliveryPlannerMenuSummary(deliveryData: DeliveryData): string {
  return deliveryData.categories
    .map(category => `- ${category.name}: ${category.items.map(item => item.name).join(', ')}`)
    .join('\n');
}

async function interpretDeliveryTurnWithLLM(
  userId: string,
  message: string,
  deliveryData: DeliveryData,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>,
  customerPhone?: string,
  conversationId?: string
): Promise<DeliveryTurnInterpretation | null> {
  const mistral = await getLLMClient();
  if (!mistral) {
    return null;
  }

  const cart = customerPhone ? getCart(userId, customerPhone, conversationId) : null;
  const cartSummary = cart
    ? formatCartSummary(cart, deliveryData.config.delivery_fee)
    : 'Carrinho vazio.';
  const lastCategory = conversationHistory && conversationHistory.length > 0
    ? detectCategoryContext(conversationHistory, deliveryData)
    : undefined;
  const recentHistory = (conversationHistory || [])
    .slice(-8)
    .map(entry => `${entry.fromMe ? 'Atendente' : 'Cliente'}: ${entry.text}`)
    .join('\n');

  const systemPrompt = `VocÃª Ã© o planejador de um agente de delivery orientado por LLM.
Sua funÃ§Ã£o Ã© interpretar a intenÃ§Ã£o real do cliente usando contexto, memÃ³ria curta e cardÃ¡pio.
VocÃª NÃƒO responde ao cliente. VocÃª retorna APENAS um JSON vÃ¡lido.

JSON obrigatÃ³rio:
{
  "intent": "GREETING|WANT_MENU|WANT_CATEGORY|ASK_ABOUT_ITEM|WANT_TO_ORDER|ADD_ITEM|REMOVE_ITEM|CONFIRM_ORDER|PROVIDE_CUSTOMER_INFO|FINALIZE_ORDER|CANCEL_ORDER|ASK_DELIVERY_INFO|ASK_BUSINESS_HOURS|COMPLAINT|HALF_HALF|OTHER",
  "normalizedMessage": "mensagem reescrita de forma explÃ­cita para o executor",
  "categoryHint": "categoria ou null",
  "referencesCart": true,
  "confidence": "high|medium|low",
  "reasoning": "curta"
}

Regras:
1. Use o histÃ³rico. O cliente pode se referir ao item anterior sem repetir a categoria.
2. Reescreva a normalizedMessage deixando implÃ­citos explÃ­citos.
3. Se o cliente disser "quero uma de calabresa" depois de ver pizzas, normalize para "quero 1 pizza calabresa".
4. Se o atendente sugeriu borda e o cliente disser algo como "sim com borda recheada quais bordas tem", NÃƒO trate isso como nome literal de produto. Interprete como pedido para ver as opÃ§Ãµes de borda. Use intent WANT_CATEGORY, categoryHint "borda" e normalizedMessage "quero ver as bordas recheadas disponÃ­veis".
5. Se o cliente fornecer nome, endereÃ§o, tipo de entrega, pagamento e/ou troco, use PROVIDE_CUSTOMER_INFO e normalize os dados SOMENTE no formato de campos, por exemplo: "nome: Antonio | entrega: delivery | endereco: Rua Teste 123 | pagamento: dinheiro | troco: 50". Nunca use frases narrativas como "o cliente confirmou...".
6. Se o cliente estiver confirmando um resumo jÃ¡ montado, use CONFIRM_ORDER.
7. Se o cliente estiver perguntando por horÃ¡rio, taxa, entrega ou retirada, use ASK_DELIVERY_INFO ou ASK_BUSINESS_HOURS.
8. Nunca invente item. Use apenas categorias e itens do cardÃ¡pio informado.
9. normalizedMessage deve estar em portuguÃªs do Brasil e ser Ãºtil para um executor determinÃ­stico.
10. Quando estiver em dÃºvida entre categoria e item especÃ­fico, use o histÃ³rico e o cardÃ¡pio para desambiguar.
11. Se o atendente acabou de perguntar sobre troco, nome, tipo de entrega, pagamento ou endereÃ§o, respostas curtas do cliente como "sim", "nao", "nÃ£o", "nao precisa", "pix", "dinheiro", "retirada", "delivery", "Rua X, 123" ou um valor monetÃ¡rio NUNCA sÃ£o cancelamento. Nesses casos use PROVIDE_CUSTOMER_INFO.
12. SÃ³ use CANCEL_ORDER quando o cliente demonstrar claramente intenÃ§Ã£o de cancelar, com frases como "cancelar pedido", "desiste", "nao quero mais", "pode cancelar".`;

  try {
    const response = await mistral.chat.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            `NEGÃ“CIO: ${deliveryData.config.business_name}`,
            `CATEGORIA MAIS RECENTE: ${lastCategory || 'nenhuma'}`,
            `CARRINHO ATUAL:\n${cartSummary}`,
            `CARDÃPIO:\n${buildDeliveryPlannerMenuSummary(deliveryData)}`,
            `HISTÃ“RICO RECENTE:\n${recentHistory || 'sem histÃ³rico recente'}`,
            `ÃšLTIMA MENSAGEM DO CLIENTE: ${message}`,
          ].join('\n\n'),
        },
      ],
      temperature: 0.1,
      maxTokens: 300,
    });

    const parsed = extractJsonObject<DeliveryTurnInterpretation>(
      response.choices?.[0]?.message?.content?.toString()
    );

    if (!parsed?.intent || !parsed.normalizedMessage) {
      return null;
    }

    return {
      intent: parsed.intent,
      normalizedMessage: parsed.normalizedMessage.trim(),
      categoryHint: parsed.categoryHint || null,
      referencesCart: parsed.referencesCart ?? false,
      confidence: parsed.confidence || 'medium',
      reasoning: parsed.reasoning,
    };
  } catch (error) {
    console.error(`ðŸ¤– [DeliveryAI] Erro no planner estruturado:`, error);
    return null;
  }
}

interface CustomerInfo {
  customerName?: string;
  customerAddress?: string;
  customerReference?: string;
  deliveryType?: 'delivery' | 'pickup';
  paymentMethod?: string;
  changeNeeded?: boolean;
  changeForAmount?: number | null;
  deliveryFee?: number;
  deliveryDistanceKm?: number | null;
  deliveryFeeMode?: DeliveryFeeCalculation['mode'];
}

const suspiciousEncodingPattern = /(?:Ã.|Â.|â.|ðŸ|ï¸|â€|â”|â€¢)/;
const deliveryNameStopWords = new Set([
  'a', 'ai', 'aí', 'como', 'com', 'delivery', 'dinheiro', 'entrega', 'esta', 'está',
  'favor', 'forma', 'meu', 'minha', 'nao', 'não', 'no', 'nome', 'ok', 'pagamento',
  'para', 'pedido', 'pix', 'por', 'quero', 'retirada', 'retirar', 'segue', 'sim'
]);

function mergeCustomerInfo(base: CustomerInfo = {}, incoming: CustomerInfo = {}): CustomerInfo {
  return {
    customerName: incoming.customerName || base.customerName,
    customerAddress: incoming.customerAddress || base.customerAddress,
    customerReference: incoming.customerReference || base.customerReference,
    deliveryType: incoming.deliveryType || base.deliveryType,
    paymentMethod: incoming.paymentMethod || base.paymentMethod,
    changeNeeded: incoming.changeNeeded !== undefined ? incoming.changeNeeded : base.changeNeeded,
    changeForAmount: incoming.changeForAmount !== undefined ? incoming.changeForAmount : base.changeForAmount,
    deliveryFee: incoming.deliveryFee !== undefined ? incoming.deliveryFee : base.deliveryFee,
    deliveryDistanceKm: incoming.deliveryDistanceKm !== undefined ? incoming.deliveryDistanceKm : base.deliveryDistanceKm,
    deliveryFeeMode: incoming.deliveryFeeMode || base.deliveryFeeMode,
  };
}

function isSimplePositiveConfirmationMessage(message: string): boolean {
  return /^(sim|confirmo|confirma|ok|pode|manda|vai|isso|certo|certeza|confirmar|ss|sss|siiim|siim)$/i.test(
    sanitizeDeliveryText(message || '').toLowerCase().trim()
  );
}

function isSimpleNegativeConfirmationMessage(message: string): boolean {
  return /^(n[aã]o|nope|cancela|cancelar|desisto|mudei de ideia)$/i.test(
    sanitizeDeliveryText(message || '').toLowerCase().trim()
  );
}

function conversationShowsFinalOrderSummary(
  conversationContext?: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): boolean {
  const normalizedContext = normalizeTextForMatch(sanitizeDeliveryText(conversationContext || ''));
  if (normalizedContext.includes('confirma o pedido') || normalizedContext.includes('resumo do seu pedido')) {
    return true;
  }

  const lastAssistantText = [...(conversationHistory || [])]
    .reverse()
    .find(entry => entry.fromMe)?.text;
  const normalizedAssistant = normalizeTextForMatch(sanitizeDeliveryText(lastAssistantText || ''));
  return normalizedAssistant.includes('confirma o pedido') || normalizedAssistant.includes('resumo do seu pedido');
}

function getCartStoredCustomerInfo(cart?: CustomerCart | null): CustomerInfo {
  if (!cart) return {};

  return mergeCustomerInfo(cart.checkoutState?.info || {}, {
    customerName: cart.customerName || undefined,
    customerAddress: cart.address || undefined,
    customerReference: cart.customerReference || undefined,
    deliveryType: cart.deliveryType || undefined,
    paymentMethod: cart.paymentMethod || undefined,
  });
}

function updateCartCheckoutState(
  cart: CustomerCart,
  phase: 'collecting_info' | 'awaiting_confirmation',
  info: CustomerInfo,
  lastMissingFields?: string[]
): void {
  cart.customerName = info.customerName || cart.customerName;
  cart.address = info.customerAddress || cart.address;
  cart.customerReference = info.customerReference || cart.customerReference;
  cart.deliveryType = info.deliveryType || cart.deliveryType;
  cart.paymentMethod = info.paymentMethod || cart.paymentMethod;
  cart.awaitingConfirmation = phase === 'awaiting_confirmation';
  cart.checkoutState = {
    phase,
    info: mergeCustomerInfo(getCartStoredCustomerInfo(cart), info),
    lastMissingFields,
    updatedAt: new Date(),
  };
  cart.lastUpdated = new Date();
}

function resetCartCheckoutState(cart?: CustomerCart | null): void {
  if (!cart) return;
  cart.awaitingConfirmation = false;
  cart.checkoutState = null;
  cart.lastUpdated = new Date();
}

function normalizeCustomerName(name: string): string {
  return name
    .trim()
    .replace(/^[^\p{L}]+|[^\p{L}\s'-]+$/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function parsePaymentMethod(value: string): string | undefined {
  const normalized = normalizeTextForMatch(value);
  if (!normalized) return undefined;
  if (normalized.includes('pix')) return 'Pix';
  if (normalized.includes('dinheiro')) return 'Dinheiro';
  if (normalized.includes('cartao') || normalized.includes('debito') || normalized.includes('credito')) return 'Cartao';
  return undefined;
}

function parseChangeInfo(value: string): Pick<CustomerInfo, 'changeNeeded' | 'changeForAmount'> {
  const normalized = normalizeTextForMatch(value);
  if (!normalized) {
    return {};
  }

  if (
    ['nao', 'não', 'sem', 'nao precisa', 'não precisa', 'sem troco'].includes(normalized) ||
    normalized.startsWith('nao precisa ') ||
    normalized.startsWith('não precisa ')
  ) {
    return {
      changeNeeded: false,
      changeForAmount: null,
    };
  }

  if (!normalized.includes('troco')) {
    return {};
  }

  if (
    normalized.includes('sem troco') ||
    normalized.includes('nao precisa de troco') ||
    normalized.includes('nao precisa troco') ||
    normalized.includes('não precisa de troco') ||
    normalized.includes('não precisa troco')
  ) {
    return {
      changeNeeded: false,
      changeForAmount: null,
    };
  }

  const amountPatterns = [
    /troco(?:\s+para|\s+de)?\s*(?:r\$\s*)?(\d+[.,]?\d{0,2})/i,
    /(?:para|em)\s*(?:r\$\s*)?(\d+[.,]?\d{0,2})\s*(?:reais)?\s*(?:de troco)?/i,
  ];

  for (const pattern of amountPatterns) {
    const match = value.match(pattern);
    const parsed = parseOptionalNumber(match?.[1]);
    if (parsed !== null) {
      return {
        changeNeeded: true,
        changeForAmount: parsed,
      };
    }
  }

  return {
    changeNeeded: true,
  };
}

function parseDeliveryType(value: string): 'delivery' | 'pickup' | undefined {
  const normalized = normalizeTextForMatch(value);
  if (!normalized) return undefined;
  if (/(delivery|entrega|entregar|mandar|enviar|levar)/i.test(normalized)) return 'delivery';
  if (/(retirada|retirar|retiro|buscar|pegar|balcao|no local)/i.test(normalized)) return 'pickup';
  return undefined;
}

function extractReferenceText(value: string): string | undefined {
  const match = value.match(/(?:ponto\s+de\s+refer[êe]ncia|refer[êe]ncia|referencia)\s*[:\-]?\s*([^|,\n\r]+)/i);
  const reference = match?.[1]?.trim();
  return reference || undefined;
}

function extractStructuredCustomerInfoFields(text: string): CustomerInfo {
  const info: CustomerInfo = {};
  const normalizedText = sanitizeDeliveryText(text || '');
  const rawSegments = normalizedText
    .split(/\r?\n|\|/g)
    .map(segment => segment.trim())
    .filter(Boolean);

  for (const segment of rawSegments) {
    const separatorIndex = segment.indexOf(':');
    if (separatorIndex <= 0) continue;

    const rawLabel = normalizeTextForMatch(segment.slice(0, separatorIndex));
    const rawValue = segment.slice(separatorIndex + 1).trim();
    if (!rawLabel || !rawValue) continue;

    if (rawLabel.includes('nome')) {
      const name = normalizeCustomerName(rawValue);
      if (name) info.customerName = name;
      continue;
    }

    if (rawLabel.includes('pagamento')) {
      const paymentMethod = parsePaymentMethod(rawValue);
      if (paymentMethod) info.paymentMethod = paymentMethod;
      continue;
    }

    if (rawLabel.includes('troco')) {
      Object.assign(info, parseChangeInfo(rawValue));
      continue;
    }

    if (rawLabel.includes('entrega') || rawLabel.includes('retirada') || rawLabel.includes('tipo')) {
      const deliveryType = parseDeliveryType(rawValue);
      if (deliveryType) info.deliveryType = deliveryType;
      continue;
    }

    if (rawLabel.includes('referencia') || rawLabel.includes('referência') || rawLabel.includes('ponto')) {
      info.customerReference = rawValue;
      continue;
    }

    if (rawLabel.includes('endereco') || rawLabel.includes('endereço')) {
      info.customerAddress = rawValue;
    }
  }

  return info;
}

function extractExplicitCustomerName(message: string): string | null {
  const namePatterns = [
    /(?:meu nome (?:é|e)|nome\s*[:=]|me chamo|sou o|sou a)\s+([a-záàâãéèêíïóôõöúçñ' -]{2,60})/i,
    /^([a-záàâãéèêíïóôõöúçñ' -]{2,40})$/i,
  ];

  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (!match?.[1]) continue;

    const candidate = normalizeCustomerName(match[1]);
    if (!candidate) continue;
    if (deliveryNameStopWords.has(candidate.toLowerCase())) continue;
    if (identifyDataType(candidate) === 'address') continue;
    return candidate;
  }

  return null;
}

function repairMojibake(text: string): string {
  if (!text || !suspiciousEncodingPattern.test(text)) return text;
  return repairMojibakeText(text);
}

function sanitizeDeliveryText(text: string): string {
  const repaired = repairMojibake(text);

  return repaired
    .replace(/Ã¡/g, 'á')
    .replace(/Ã /g, 'à')
    .replace(/Ã /g, 'à')
    .replace(/Ã¢/g, 'â')
    .replace(/Ã£/g, 'ã')
    .replace(/Ã©/g, 'é')
    .replace(/Ãª/g, 'ê')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ã´/g, 'ô')
    .replace(/Ãµ/g, 'õ')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã‰/g, 'É')
    .replace(/Ã“/g, 'Ó')
    .replace(/Ãš/g, 'Ú')
    .replace(/Ã‡/g, 'Ç')
    .replace(/Âº/g, 'º')
    .replace(/Âª/g, 'ª')
    .replace(/â”/g, '━')
    .replace(/â”€/g, '─')
    .replace(/â€¢/g, '•')
    .replace(/â•/g, '═')
    .replace(/ðŸ“/g, '📁')
    .replace(/ðŸ‘†/g, '👇')
    .replace(/ðŸ›µ/g, '🛵')
    .replace(/ðŸ’µ/g, '💵')
    .replace(/ðŸ“\s*/g, '')
    .replace(/ðŸšš\s*/g, '')
    .replace(/ðŸ“\s*/g, '')
    .replace(/ðŸ’³\s*/g, '')
    .replace(/ðŸ“‹\s*/g, '')
    .replace(/ðŸ‘¤\s*/g, '')
    .replace(/ðŸ’°\s*/g, '')
    .replace(/ðŸ›’\s*/g, '')
    .replace(/ðŸŽ«\s*/g, '')
    .replace(/ðŸ“¦\s*/g, '')
    .replace(/âœ…\s*/g, '')
    .replace(/â±ï¸\s*/g, '')
    .replace(/ðŸ•\s*/g, '')
    .replace(/ðŸ“·\s*/g, '')
    .replace(/ðŸ˜Š/g, '')
    .replace(/ðŸ˜‰/g, '')
    .replace(/â€\u009d/g, '"')
    .replace(/â€œ/g, '"')
    .replace(/â€™/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLikelyPersonName(text: string): string | null {
  const candidates = text
    .split(/[.!?;:\n]/)
    .map(part => part.trim().replace(/^[,\-\s]+|[,\-\s]+$/g, ''))
    .filter(Boolean)
    .reverse();

  for (const candidate of candidates) {
    if (/\d/.test(candidate)) continue;

    const words = candidate.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 4) continue;

    const validWords = words.filter(word =>
      /^[a-záàâãéèêíïóôõöúçñ]+$/i.test(word) &&
      !deliveryNameStopWords.has(word.toLowerCase())
    );

    if (validWords.length === 0 || validWords.length !== words.length) continue;

    return validWords
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  return null;
}

function shouldForceCustomerInfoIntent(
  cart: CustomerCart | null,
  message: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>,
  plannedIntent?: CustomerIntent | null
): boolean {
  if (!cart || cart.items.size === 0) return false;
  if (cart.awaitingConfirmation) return false;

  const dataType = identifyDataType(message);
  if (dataType !== 'unknown') return true;

  if (plannedIntent && ['ADD_ITEM', 'REMOVE_ITEM', 'WANT_MENU', 'WANT_CATEGORY', 'WANT_TO_ORDER', 'HALF_HALF'].includes(plannedIntent)) {
    return false;
  }

  const lastAssistantText = [...(conversationHistory || [])]
    .reverse()
    .find(entry => entry.fromMe)?.text?.toLowerCase() || '';

  return ['nome', 'entrega', 'retirada', 'endereco', 'pagamento', 'troco'].some(token => lastAssistantText.includes(token));
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ” IDENTIFICADOR DE TIPO DE DADO
// Analisa uma string e determina se Ã© nome, endereÃ§o, ou outro dado
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function identifyDataType(text: string): 'name' | 'address' | 'payment' | 'delivery_type' | 'change' | 'unknown' {
  const lowerText = text.toLowerCase().trim();
  
  // Palavras que indicam ENDEREÃ‡O (rua, avenida, nÃºmero, bairro, etc)
  const addressIndicators = [
    /\b(rua|av|avenida|alameda|travessa|estrada|rodovia|praÃ§a|praca)\b/i,
    /\b(bairro|centro|vila|jardim|parque)\b/i,
    /\d{2,}/,  // NÃºmeros de 2+ dÃ­gitos (nÃºmero da casa)
    /,\s*\d+/,  // VÃ­rgula seguida de nÃºmero
    /n[Â°Âº]?\s*\d+/i,  // nÂº 123, n 123
  ];
  
  // Palavras que indicam FORMA DE PAGAMENTO
  const paymentIndicators = [
    /^(pix|dinheiro|cart[aÃ£]o|d[eÃ©]bito|cr[eÃ©]dito|cartÃ£o|cartao)$/i,
    /\b(pix|dinheiro|cart[aÃ£]o|d[eÃ©]bito|cr[eÃ©]dito|cartÃ£o|cartao)\b/i,
  ];

  const changeIndicators = [
    /\btroco\b/i,
    /\bsem troco\b/i,
    /\bprecis[oa] de troco\b/i,
  ];
  
  // Palavras que indicam TIPO DE ENTREGA
  const deliveryTypeIndicators = [
    /^(entrega|delivery|entregar)$/i,
    /^(retirada|retirar|buscar|pegar)$/i,
    /vou (retirar|buscar|pegar)/i,
    /para entrega/i,
  ];
  
  // Verifica se Ã© tipo de entrega (prioridade alta)
  if (deliveryTypeIndicators.some(p => p.test(lowerText))) {
    return 'delivery_type';
  }
  
  // Verifica se Ã© pagamento (prioridade alta)
  if (paymentIndicators.some(p => p.test(lowerText))) {
    return 'payment';
  }

  if (changeIndicators.some(p => p.test(lowerText))) {
    return 'change';
  }
  
  // Verifica se Ã© endereÃ§o
  const hasAddressIndicator = addressIndicators.some(p => p.test(lowerText));
  if (hasAddressIndicator) {
    return 'address';
  }
  
  // Se tem NÃšMEROS e texto, provavelmente Ã© endereÃ§o
  if (/\d+/.test(text) && /[a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±]/i.test(text)) {
    return 'address';
  }
  
  // Se Ã© sÃ³ texto sem nÃºmeros e parece nome de pessoa (2+ palavras, sem termos estranhos)
  const words = text.trim().split(/\s+/);
  if (words.length >= 1 && words.length <= 4) {
    const looksLikeName = words.every(w => 
      /^[a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±]{2,}$/i.test(w) && 
      !/^(rua|av|avenida|bairro|centro|pix|cartao|cartÃ£o|dinheiro|entrega|delivery|retirada)$/i.test(w)
    );
    if (looksLikeName && !/\d/.test(text)) {
      return 'name';
    }
  }
  
  return 'unknown';
}

function extractCustomerInfo(message: string, context: string = '', existingInfo: CustomerInfo = {}): CustomerInfo {
  const info: CustomerInfo = { ...existingInfo };
  const fullText = `${context} ${message}`.toLowerCase();
  const messageLower = message.toLowerCase();
  
  console.log(`ðŸ“ [extractCustomerInfo] Analisando: "${message}"`);
  console.log(`ðŸ“ [extractCustomerInfo] Contexto: "${context.substring(0, 100)}..."`);
  console.log(`ðŸ“ [extractCustomerInfo] Info existente:`, existingInfo);

  const structuredInfo = extractStructuredCustomerInfoFields(message);
  if (Object.keys(structuredInfo).length > 0) {
    Object.assign(info, mergeCustomerInfo(info, structuredInfo));
    console.log(`ðŸ“ [extractCustomerInfo] Campos estruturados:`, structuredInfo);
  }

  if (!info.customerReference) {
    const extractedReference = extractReferenceText(message);
    if (extractedReference) {
      info.customerReference = extractedReference;
      console.log(`ðŸ“ [extractCustomerInfo] ReferÃªncia extraÃ­da: ${info.customerReference}`);
    }
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NOVO: Detectar formato "Nome, EndereÃ§o, Pagamento" (tudo junto)
  // Exemplo: "JoÃ£o Silva, Rua das Flores 123, pago no PIX"
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const hasComma = message.includes(',');
  const hasAddress = /\b(rua|av|avenida|alameda|travessa|estrada|praÃ§a|praca)\b/i.test(message) || /[,\s]\d+[,\s]/i.test(message);
  const hasPayment = !!parsePaymentMethod(message);
  const hasNumber = /\d/.test(message);
  
  if (hasComma && hasAddress && (hasPayment || hasNumber)) {
    console.log(`ðŸ“ [extractCustomerInfo] ðŸŽ¯ Detectou formato multi-dados (Nome, EndereÃ§o, Pagamento)`);
    
    // Dividir por vÃ­rgula e analisar cada parte
    const parts = message.split(',').map(p => p.trim()).filter(p => p.length > 0);
    
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const partLower = part.toLowerCase();
      
      // Verificar se Ã© pagamento
      const parsedPaymentMethod = parsePaymentMethod(part);
      if (parsedPaymentMethod && !info.paymentMethod) {
        info.paymentMethod = parsedPaymentMethod;
        console.log(`ðŸ“ [extractCustomerInfo] Multi-dados - Pagamento: ${info.paymentMethod}`);
        continue;
      }
      
      // Verificar se Ã© endereÃ§o (tem palavra de logradouro OU nÃºmero)
      const isAddressPart = /\b(rua|av|avenida|alameda|travessa|estrada|praÃ§a|praca)\b/i.test(partLower) || 
                           (/\d+/.test(part) && /[a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§]/i.test(part));
      if (isAddressPart) {
        const addressParts = [part];
        while (index + 1 < parts.length) {
          const nextPart = parts[index + 1];
          const nextPartLower = nextPart.toLowerCase();
          const nextPartIsPayment = !!parsePaymentMethod(nextPart);
          const nextPartIsDeliveryType = !!parseDeliveryType(nextPart);
          const nextPartLooksLikeName = !!extractLikelyPersonName(nextPart);
          const nextPartLooksLikeAddressComplement =
            /^\d+[a-z]?$/i.test(nextPart) ||
            /^(n[°º]?\s*\d+[a-z]?|s\/n|sn)$/i.test(nextPartLower) ||
            /^(ap|apto|apartamento|bloco|casa|fundos|frente|quadra|lote|sala|numero|número)\b/i.test(nextPartLower);

          if (!nextPartLooksLikeAddressComplement || nextPartIsPayment || nextPartIsDeliveryType || nextPartLooksLikeName) {
            break;
          }

          addressParts.push(nextPart);
          index += 1;
        }

        const combinedAddress = addressParts.join(', ');
        const currentAddress = info.customerAddress || '';
        const shouldReplaceAddress =
          !currentAddress ||
          (combinedAddress.length > currentAddress.length && /\d/.test(combinedAddress)) ||
          (/\d/.test(combinedAddress) && !/\d/.test(currentAddress));

        if (shouldReplaceAddress) {
          info.customerAddress = combinedAddress
            .replace(/(?:ponto\s+de\s+refer[êe]ncia|refer[êe]ncia|referencia)\s*[:\-]?\s*.+$/i, '')
            .trim()
            .replace(/[,\s]+$/g, '');
          console.log(`ðŸ“ [extractCustomerInfo] Multi-dados - EndereÃ§o: ${info.customerAddress}`);
          // Assume delivery se tem endereÃ§o
          if (!info.deliveryType) info.deliveryType = 'delivery';
        }
        continue;
      }
      
      // Se nÃ£o Ã© pagamento nem endereÃ§o, provavelmente Ã© nome (sÃ³ texto, sem nÃºmeros significativos)
      // Usa regex que aceita caracteres acentuados e espaÃ§os, exclui se tem nÃºmeros
      const extractedName = extractLikelyPersonName(part);

      if (extractedName && !info.customerName && !parsedPaymentMethod) {
        info.customerName = extractedName;
        console.log(`ðŸ“ [extractCustomerInfo] Multi-dados - Nome: ${info.customerName}`);
        continue;
      }
    }
    
    // Se encontrou dados, retorna (priorizar multi-dados)
    if (info.customerName || info.customerAddress || info.paymentMethod) {
      console.log(`ðŸ“ [extractCustomerInfo] âœ… Multi-dados extraÃ­dos:`, info);
      return info;
    }
  }
  
  // PRIMEIRO: Priorizar tipo de entrega explÃ­cito na mensagem atual
  const messageHasPickup = /\b(retirar|retiro|buscar|busco|pegar|pego|retira|retirada|no local|vou ai|vou aÃ­|vou la|vou lÃ¡|passo ai|passo aÃ­|passo la|passo lÃ¡|balc[aÃ£]o)\b/i.test(messageLower);
  const messageHasDelivery = /\b(delivery|entreg|mandar|enviar|levar)\b/i.test(messageLower);
  if (messageHasPickup) {
    info.deliveryType = 'pickup';
    console.log(`ðŸ“ [extractCustomerInfo] Detectou pickup (mensagem)`);
  } else if (messageHasDelivery) {
    info.deliveryType = 'delivery';
    console.log(`ðŸ“ [extractCustomerInfo] Detectou delivery (mensagem)`);
  }
  
  // SEGUNDO: Detectar tipo de entrega no fullText (contexto + mensagem)
  if (!info.deliveryType) {
    if (fullText.match(/\b(delivery|entreg|mandar|enviar|levar)\b/i)) {
      info.deliveryType = 'delivery';
      console.log(`ðŸ“ [extractCustomerInfo] Detectou delivery`);
    } else if (fullText.match(/\b(retirar|retiro|buscar|busco|pegar|pego|retira|retirada|no local|vou ai|vou aÃ­|vou la|vou lÃ¡|passo ai|passo aÃ­|passo la|passo lÃ¡|balc[aÃ£]o)\b/i)) {
      info.deliveryType = 'pickup';
      console.log(`ðŸ“ [extractCustomerInfo] Detectou pickup`);
    }
  }
  
  // TERCEIRO: Extrair forma de pagamento da mensagem atual (prioridade)
  const directPaymentMethod = parsePaymentMethod(message);
  if (directPaymentMethod) {
    info.paymentMethod = directPaymentMethod;
    console.log(`ðŸ“ [extractCustomerInfo] Detectou pagamento (mensagem): ${info.paymentMethod}`);
  }
  
  // QUARTO: Extrair forma de pagamento do contexto se ainda nÃ£o tiver
  if (!info.paymentMethod) {
    const fallbackPaymentMethod = parsePaymentMethod(context);
    if (fallbackPaymentMethod) {
      info.paymentMethod = fallbackPaymentMethod;
      console.log(`ðŸ“ [extractCustomerInfo] Detectou pagamento: ${info.paymentMethod}`);
    }
  }

  const changeInfo = parseChangeInfo(message);
  if (changeInfo.changeNeeded !== undefined || changeInfo.changeForAmount !== undefined) {
    Object.assign(info, changeInfo);
    console.log(`ðŸ“ [extractCustomerInfo] Detectou troco:`, changeInfo);
  } else {
    const normalizedMessage = normalizeTextForMatch(message);
    const awaitingChangeContext = normalizeTextForMatch(context).includes('troco');
    const canInferChangeFromMemory =
      isCashPayment(existingInfo.paymentMethod) &&
      existingInfo.changeNeeded === undefined;
    if (awaitingChangeContext || canInferChangeFromMemory) {
      if (['nao', 'não', 'sem', 'nao precisa', 'não precisa'].includes(normalizedMessage)) {
        info.changeNeeded = false;
        info.changeForAmount = null;
      } else {
        const isolatedAmount = parseOptionalNumber(message);
        if (isolatedAmount !== null) {
          info.changeNeeded = true;
          info.changeForAmount = isolatedAmount;
        } else if (['sim', 'preciso', 'quero', 'com troco'].includes(normalizedMessage)) {
          info.changeNeeded = true;
        }
      }
    }
  }
  
  // TERCEIRO: Identificar o que a mensagem atual representa
  const messageType = identifyDataType(message);
  console.log(`ðŸ“ [extractCustomerInfo] Tipo da mensagem: ${messageType}`);
  
  // CORREÃ‡ÃƒO: Extrair endereÃ§o MESMO se messageType for payment/delivery_type
  // (quando a mensagem contÃ©m mÃºltiplos dados como "entrega pix avenida x, 123")
  if (!info.customerAddress) {
    const hasAddressIndicator = /\b(rua|av|avenida|alameda|travessa|estrada|praÃ§a|praca)\b/i.test(message) ||
                                /[a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§\s]+,\s*\d+/i.test(message);
    const hasNumber = /\d/.test(message);
    
    if (hasAddressIndicator && hasNumber) {
      // Remove palavras de pagamento/tipo de entrega da mensagem
      let address = message
        .replace(/\b(pix|dinheiro|cart[aÃ£]o|d[eÃ©]bito|cr[eÃ©]dito|delivery|entrega|retirada|retirar)\b/gi, '')
        .replace(/(?:ponto\s+de\s+refer[êe]ncia|refer[êe]ncia|referencia)\s*[:\-]?\s*.+$/i, '')
        .trim()
        .replace(/^[\s,]+|[\s,]+$/g, ''); // Remove espaÃ§os e vÃ­rgulas nas pontas
      
      if (address.length >= 5) {
        info.customerAddress = address;
        console.log(`ðŸ“ [extractCustomerInfo] EndereÃ§o extraÃ­do (multi-dados): ${info.customerAddress}`);
      }
    }
  }
  
  // Se a mensagem parece ser endereÃ§o puro e nÃ£o temos endereÃ§o ainda
  if (messageType === 'address' && !info.customerAddress) {
    // Remove palavras de pagamento/tipo de entrega da mensagem
    let address = message
      .replace(/\b(pix|dinheiro|cart[aÃ£]o|d[eÃ©]bito|cr[eÃ©]dito|delivery|entrega|retirada)\b/gi, '')
      .replace(/(?:ponto\s+de\s+refer[êe]ncia|refer[êe]ncia|referencia)\s*[:\-]?\s*.+$/i, '')
      .trim();
    
    // Se comeÃ§a com prefixo de rua, usa direto
    if (/^(rua|av|avenida|alameda|travessa)/i.test(address)) {
      info.customerAddress = address;
    } else {
      // Adiciona "Rua" se parece endereÃ§o mas nÃ£o tem prefixo
      info.customerAddress = address;
    }
    console.log(`ðŸ“ [extractCustomerInfo] EndereÃ§o extraÃ­do: ${info.customerAddress}`);
  }
  
  // Se a mensagem parece ser nome e nÃ£o temos nome ainda
  if (messageType === 'name' && !info.customerName) {
    const name = message.trim();
    // Capitalizar cada palavra
    info.customerName = normalizeCustomerName(name);
    console.log(`ðŸ“ [extractCustomerInfo] Nome extraÃ­do: ${info.customerName}`);
  }

  if (!info.customerName) {
    const explicitName = extractExplicitCustomerName(message);
    if (explicitName) {
      info.customerName = explicitName;
      console.log(`ðŸ“ [extractCustomerInfo] Nome explÃ­cito: ${info.customerName}`);
    }
  }

  if (!info.customerName) {
    const inferredName = extractLikelyPersonName(message);
    if (inferredName) {
      info.customerName = inferredName;
      console.log(`ðŸ“ [extractCustomerInfo] Nome inferido: ${info.customerName}`);
    }
  }
  
  // QUARTO: Tentar extrair nome de padrÃµes explÃ­citos
  if (!info.customerName) {
    const namePatterns = [
      /(?:meu nome (?:Ã©|e)|nome:|sou o?|me chamo)\s+([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±\s]{3,50})/i,
      /(?:^|\s)nome\s*[:=]\s*([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±\s]{3,50})/i,
    ];
    
    for (const pattern of namePatterns) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Filtrar se for endereÃ§o ou pagamento
        if (identifyDataType(name) === 'name' || identifyDataType(name) === 'unknown') {
          info.customerName = normalizeCustomerName(name);
          console.log(`ðŸ“ [extractCustomerInfo] Nome por padrÃ£o: ${info.customerName}`);
          break;
        }
      }
    }
  }
  
  // QUINTO: Tentar extrair endereÃ§o de padrÃµes explÃ­citos
  if (!info.customerAddress && info.deliveryType === 'delivery') {
    const addressPatterns = [
      /(?:rua|av|avenida|alameda|travessa|estrada)\s+([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±\s\d,.-]+?)(?:\s*$|\s+(?:pix|dinheiro|cart[aÃ£]o))/i,
      /endere[Ã§c]o\s*[:=]\s*([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±\s\d,.-]+?)(?:\s*$|\s+(?:pix|dinheiro))/i,
    ];
    
    for (const pattern of addressPatterns) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        info.customerAddress = match[1].trim();
        console.log(`ðŸ“ [extractCustomerInfo] EndereÃ§o por padrÃ£o: ${info.customerAddress}`);
        break;
      }
    }
  }

  if (info.customerAddress) {
    info.customerAddress = prepareDeliveryAddressForGeocoding(
      info.customerAddress,
      undefined,
      info.customerName || existingInfo.customerName
    );
  }

  if (info.customerReference) {
    info.customerReference = info.customerReference.trim().replace(/[,\s]+$/g, '');
  }
  
  console.log(`ðŸ“ [extractCustomerInfo] Resultado final:`, info);
  return info;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ’¾ CRIAR PEDIDO NO BANCO DE DADOS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function createDeliveryOrder(
  userId: string,
  conversationId: string | undefined,
  customerInfo: CustomerInfo,
  deliveryData: DeliveryData
): Promise<string> {
  // Calcular totais (por enquanto fixo - depois adicionar itens reais do carrinho)
  const subtotal = 30; // Pizza meio a meio
  const deliveryFee = customerInfo.deliveryType === 'delivery' ? deliveryData.config.delivery_fee : 0;
  const total = subtotal + deliveryFee;
  
  // Se conversation_id Ã© do simulador (comeÃ§a com "sim-"), usar null
  // para evitar erro de foreign key
  const validConversationId = conversationId && !isSyntheticConversationId(conversationId) 
    ? conversationId 
    : null;
  
  // Inserir pedido usando Supabase
  const { data: order, error } = await supabase
    .from('delivery_orders')
    .insert({
      user_id: userId,
      conversation_id: validConversationId,
      customer_name: customerInfo.customerName,
      customer_address: customerInfo.customerAddress,
      delivery_type: customerInfo.deliveryType,
      payment_method: customerInfo.paymentMethod,
      subtotal: subtotal,
      delivery_fee: deliveryFee,
      total: total,
      status: 'pending',
      payment_status: 'pending',
      created_by_ai: true,
      estimated_time: deliveryData.config.estimated_delivery_time,
      confirmed_at: new Date().toISOString(),
    })
    .select('id, order_number')
    .single();
  
  if (error) {
    console.error(`âŒ [DeliveryAI] Erro ao inserir pedido no Supabase:`, error);
    throw new Error(`Erro ao criar pedido: ${error.message}`);
  }
  
  console.log(`âœ… [DeliveryAI] Pedido criado: ID=${order.id}, Number=${order.order_number}`);
  
  // TODO: Adicionar itens do carrinho na tabela order_items
  
  return order.order_number?.toString() || order.id.substring(0, 8).toUpperCase();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ï¿½ðŸ” DETECÃ‡ÃƒO DE INTENÃ‡ÃƒO (PRÃ‰-IA)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const INTENT_PATTERNS: Record<CustomerIntent, RegExp[]> = {
  GREETING: [
    /^(oi+e?|olÃ¡|ola|eai|e ai|hey|opa|bom dia|boa tarde|boa noite|tudo bem|td bem|blz|oie+)$/i,
    /^(oi+e?|olÃ¡|ola|eai|e ai|hey|opa|bom dia|boa tarde|boa noite|tudo bem|td bem|blz|oie+)\s*[!?.,]*$/i,
  ],
  // WANT_CATEGORY: quando cliente menciona apenas o nome de uma categoria
  WANT_CATEGORY: [
    /^(pizza|pizzas)$/i,
    /^(esfirra|esfiha|esfirras|esfihas|sfiha)s?$/i,
    /^(bebida|bebidas|refrigerante|refri)s?$/i,
    /^(a[Ã§c]a[iÃ­])$/i,
    /^(hamburguer|hamburger|burger|lanche)s?$/i,
    /^(doce|sobremesa)s?$/i,
    /^(salgado)s?$/i,
    /^(borda)s?$/i,
    /^(tradicion)ais?$/i,
    /^(especia)is?l?$/i,
    /^(adicion)ais?$/i,
    /^(combo)s?$/i,
    /^(por[Ã§c][aÃ£]o|por[Ã§c][oÃµ]es)$/i,
    /^(entrada)s?$/i,
    /^(massa|macarr[aÃ£]o)s?$/i,
    /^(sushi|temaki|sashimi)s?$/i,
    /^(promo[Ã§c][aÃ£]o|promo)s?$/i,
    /quero ver (as? |os? )?(pizza|esfirra|bebida|a[Ã§c]a[iÃ­]|lanche|doce|salgado|borda|tradicion|especia|adicion|combo|entrada|massa|promo)\w*/i,
    /mostra (as? |os? )?(pizza|esfirra|bebida|a[Ã§c]a[iÃ­]|lanche|doce|salgado|borda|tradicion|especia|adicion|combo|entrada|massa|promo)\w*/i,
    /ver (as? |os? )?(pizza|esfirra|bebida|a[Ã§c]a[iÃ­]|lanche|doce|salgado|borda|tradicion|especia|adicion|combo|entrada|massa|promo)\w*/i,
  ],
  WANT_MENU: [
    /card[aÃ¡]pio/i,
    /menu/i,
    /o que (tem|voc[eÃª]s tem|vende)/i,
    /oque (tem|vende)/i,
    /quais (produto|item|op[Ã§c][oÃµ]es)/i,
    /me (manda|mostra|envia) o (card[aÃ¡]pio|menu)/i,
    /ver (o )?(card[aÃ¡]pio|menu|op[Ã§c][oÃµ]es)/i,
    /pode mandar o menu/i,
  ],
  HALF_HALF: [
    /meio a meio/i,
    /meia.*meia/i,
    /metade.*metade/i,
    /duas metades/i,
    /dividid[ao]/i,
    /\d\/\d/i,  // 1/2, etc
  ],
  ASK_ABOUT_ITEM: [
    /quanto (custa|[eÃ©]) (a|o)/i,
    /qual (o )?(pre[Ã§c]o|valor) d/i,
    /tem (.+)\?/i,
    /como [eÃ©] (a|o) (.+)\?/i,
    /o que vem n(a|o) (.+)/i,
  ],
  WANT_TO_ORDER: [
    /quero (pedir|fazer.*pedido|encomendar)/i,
    /quero (um|uma|o|a|uns|umas|\d+)/i,           // ðŸ†• "quero uma pizza", "quero 2 esfihas"
    /vou (querer|pedir)/i,
    /pode (anotar|fazer|preparar)/i,
    /faz (a[iÃ­]|para mim)/i,
    /manda (pra|para) mim/i,
    /me (vÃª|ve|da|dÃ¡) (um|uma|[0-9]+)/i,
  ],
  ADD_ITEM: [
    /adiciona|coloca|p[oÃµ]e|bota/i,
    /mais (um|uma|[0-9]+)/i,
    /tamb[eÃ©]m quero/i,
  ],
  REMOVE_ITEM: [
    /tira|remove|retira/i,
    /n[aÃ£]o quero mais/i,
    /cancela (o|a) (.+)/i,
  ],
  CONFIRM_ORDER: [
    /^(isso|fechado|pode fechar|confirma|confirmado|[eÃ©] isso|t[aÃ¡] certo|perfeito|ok|sim)/i,
    /pode (mandar|enviar|preparar)/i,
    /fecha o pedido/i,
  ],
  PROVIDE_CUSTOMER_INFO: [
    /(?:meu nome (?:Ã©|e)|nome:|sou|me chamo)\s+/i,
    /(?:rua|av|avenida|travessa)\s+/i,
    /endere[Ã§c]o:\s+/i,
    /(?:dinheiro|cart[aÃ£]o|pix|d[eÃ©]bito|cr[eÃ©]dito)\s*$/i,
    /(?:delivery|retirar|retiro|buscar|pegar|no local)/i,
  ],
  FINALIZE_ORDER: [],  // Intent automÃ¡tico apÃ³s coletar todos os dados
  CANCEL_ORDER: [
    /cancela (tudo|o pedido)/i,
    /desisto/i,
    /n[aÃ£]o quero mais/i,
    /esquece/i,
  ],
  ASK_DELIVERY_INFO: [
    /entrega/i,
    /taxa/i,
    /frete/i,
    /tempo.*demora/i,
    /demora quanto/i,
    /aceita (pix|cart[aÃ£]o|dinheiro)/i,
    /forma.*pagamento/i,
    /paga como/i,
  ],
  ASK_BUSINESS_HOURS: [
    /hor[aÃ¡]rio/i,
    /abre.*fecha/i,
    /funciona (at[eÃ©]|que horas)/i,
    /aberto/i,
    /fechado/i,
  ],
  COMPLAINT: [
    /reclama/i,
    /problema/i,
    /errado/i,
    /demor/i,
    /p[eÃ©]ssimo/i,
    /ruim/i,
  ],
  OTHER: [], // Fallback
};

// Detectar qual categoria o cliente quer
export function detectCategoryFromMessage(message: string): string | null {
  const normalizedMsg = normalizeCategoryText(message);
  if (!normalizedMsg) return null;
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeCategoryText(keyword);
      if (!normalizedKeyword) continue;
      if (smartCategoryMatch(normalizedMsg, normalizedKeyword)) {
        console.log(`ðŸŽ¯ [DeliveryAI] Categoria detectada: ${category} (keyword: ${keyword})`);
        return category;
      }
    }
  }
  return null;
}

// Detectar se o cliente mencionou um tamanho na mensagem
export function detectSizeFromMessage(message: string): string | null {
  const normalizedMsg = message.toLowerCase().trim();
  
  // PadrÃµes de tamanho
  const sizePatterns = [
    { pattern: /\b(grande|g)\b/i, size: 'G' },
    { pattern: /\b(m[eÃ©]dia?|m)\b/i, size: 'M' },
    { pattern: /\b(pequena?|p)\b/i, size: 'P' },
    { pattern: /\b(300\s*ml)\b/i, size: '300ml' },
    { pattern: /\b(500\s*ml)\b/i, size: '500ml' },
    { pattern: /\b(700\s*ml)\b/i, size: '700ml' },
    { pattern: /\b(1\s*l(?:itro)?|litro)\b/i, size: '1L' },
    { pattern: /\b(1[,.]5\s*l)\b/i, size: '1.5L' },
    { pattern: /\b(2\s*l(?:itros)?)\b/i, size: '2L' },
    { pattern: /\b(simples)\b/i, size: 'simples' },
    { pattern: /\b(duplo)\b/i, size: 'duplo' },
    { pattern: /\b(triplo)\b/i, size: 'triplo' },
  ];
  
  for (const { pattern, size } of sizePatterns) {
    if (pattern.test(normalizedMsg)) {
      console.log(`ðŸ“ [DeliveryAI] Tamanho detectado na mensagem: ${size}`);
      return size;
    }
  }
  
  return null;
}

function parseOptionalPriceValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number'
    ? value
    : (() => {
        const raw = String(value).trim();
        const normalized = raw.includes(',') && raw.includes('.')
          ? raw.replace(/\./g, '').replace(',', '.')
          : raw.replace(',', '.');
        return Number.parseFloat(normalized);
      })();
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHalfHalfPricing(raw: any): HalfHalfPricingConfig {
  return {
    enabled: raw?.enabled === true,
    mode: raw?.mode === 'fixed' || raw?.mode === 'size_map' ? raw.mode : 'highest_item',
    fixedPrice: parseOptionalPriceValue(raw?.fixedPrice),
    sizePrices: {
      P: parseOptionalPriceValue(raw?.sizePrices?.P),
      M: parseOptionalPriceValue(raw?.sizePrices?.M),
      G: parseOptionalPriceValue(raw?.sizePrices?.G),
    },
  };
}

function normalizeHalfHalfSizeKey(sizeCode?: string | null): 'P' | 'M' | 'G' | null {
  const normalized = (sizeCode || '').toUpperCase().trim();
  if (normalized === 'P') return 'P';
  if (normalized === 'M') return 'M';
  if (normalized === 'G') return 'G';
  return null;
}

function getHalfHalfCategory(
  deliveryData: DeliveryData,
  categoryContext?: string | null,
  ...items: MenuItem[]
): MenuCategory | null {
  if (categoryContext) {
    const category = findMatchingCategory(deliveryData, categoryContext);
    if (category) return category;
  }

  for (const item of items) {
    const category = deliveryData.categories.find(cat => normalizeCategoryText(cat.name) === normalizeCategoryText(item.category_name));
    if (category) return category;
  }

  return null;
}

function resolveHalfHalfPrice(params: {
  deliveryData: DeliveryData;
  categoryContext?: string | null;
  item1: MenuItem;
  item2: MenuItem;
  sizeCode?: string | null;
  sizeSpecificPrice?: number | null;
}): {
  finalPrice: number;
  source: 'category_fixed' | 'category_size_map' | 'item_size' | 'highest_item';
} {
  const { deliveryData, categoryContext, item1, item2, sizeCode, sizeSpecificPrice } = params;
  const category = getHalfHalfCategory(deliveryData, categoryContext, item1, item2);
  const pricing = normalizeHalfHalfPricing(category?.half_half_pricing);
  const sizeKey = normalizeHalfHalfSizeKey(sizeCode);

  if (pricing.enabled) {
    if (pricing.mode === 'size_map' && sizeKey) {
      const configuredSizePrice = parseOptionalPriceValue(pricing.sizePrices?.[sizeKey]);
      if (configuredSizePrice !== null) {
        return { finalPrice: configuredSizePrice, source: 'category_size_map' };
      }
    }

    if (pricing.mode === 'fixed') {
      const configuredFixedPrice = parseOptionalPriceValue(pricing.fixedPrice);
      if (configuredFixedPrice !== null) {
        return { finalPrice: configuredFixedPrice, source: 'category_fixed' };
      }
    }
  }

  if (sizeSpecificPrice !== null && sizeSpecificPrice !== undefined) {
    return { finalPrice: sizeSpecificPrice, source: 'item_size' };
  }

  return {
    finalPrice: Math.max(item1.price, item2.price),
    source: 'highest_item',
  };
}

function describeHalfHalfPricing(source: 'category_fixed' | 'category_size_map' | 'item_size' | 'highest_item', hasVariations: boolean): string {
  if (source === 'category_fixed') {
    return ' (preco meio a meio configurado para a categoria)';
  }

  if (source === 'category_size_map') {
    return ' (preco meio a meio configurado para esse tamanho)';
  }

  if (source === 'item_size' && hasVariations) {
    return ' (preco do tamanho escolhido)';
  }

  if (source === 'highest_item' && hasVariations) {
    return ' (cobrado o valor da mais cara no tamanho escolhido)';
  }

  return '';
}

function normalizeTextForMatch(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[ -]/g, '')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ITEM_MATCH_STOP_WORDS = new Set([
  'a', 'o', 'os', 'as', 'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem',
  'quero', 'queria', 'vou', 'querer', 'uma', 'um', 'duas', 'dois', 'pra',
  'para', 'por', 'favor', 'pfv', 'pf', 'me', 'mesmo', 'essa', 'esse',
  'isso', 'ai', 'ae', 'normal', 'tradicional', 'qualquer', 'tanto', 'faz'
]);

function normalizeForItemMatch(text: string): string {
  return normalizeTextForMatch(text || '')
    .replace(/\bcoca cola\b/g, 'coca')
    .replace(/\bguarana\b/g, 'guarana');
}

function sanitizeItemSearchName(text: string): string {
  return normalizeForItemMatch(text || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(?:adicionar|adiciona|adicione|quero|queria|manda|coloca|bota|pode|por favor|pfv|pf)\b/g, ' ')
    .replace(/\b(?:ao carrinho|no carrinho|pra mim|para mim)\b/g, ' ')
    .replace(/\b(?:o cliente confirmou|cliente confirmou|cliente quer|cliente pediu)\b/g, ' ')
    .replace(/^\s*(?:a|o|as|os)\s+(?:de|do|da)\s+/g, '')
    .replace(/^\s*(?:a|o|as|os)\s+/g, '')
    .replace(/\b(?:mesmo|mesma|mesmos|mesmas|isso|essa|esse|ai|aí)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeForItemMatch(text: string): string[] {
  return normalizeForItemMatch(text)
    .split(/\s+/)
    .filter(token => token && !ITEM_MATCH_STOP_WORDS.has(token));
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function tokensLooselyMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length <= 2 || b.length <= 2) return false;

  const maxLen = Math.max(a.length, b.length);
  const allowedDistance = maxLen <= 5 ? 1 : 2;
  return levenshteinDistance(a, b) <= allowedDistance;
}

function countLooseTokenMatches(sourceTokens: string[], candidateTokens: string[]): number {
  const used = new Set<number>();
  let matches = 0;

  for (const sourceToken of sourceTokens) {
    const idx = candidateTokens.findIndex((candidateToken, candidateIndex) =>
      !used.has(candidateIndex) && tokensLooselyMatch(sourceToken, candidateToken)
    );

    if (idx >= 0) {
      used.add(idx);
      matches += 1;
    }
  }

  return matches;
}

function resolveMenuItemOptions(menuItem: MenuItem, message: string): {
  unitPrice: number;
  displayName: string;
  notes?: string;
  optionsSelected: CartItemOption[];
  needsSize: boolean;
  sizeOptions?: Array<{ name: string; price: number }>;
} {
  const optionsSelected: CartItemOption[] = [];
  let unitPrice = menuItem.price;
  let sizeLabel: string | null = null;
  const normalizedMsg = normalizeTextForMatch(message);

  const sizeGroup = menuItem.options?.find(opt =>
    opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size')
  );
  const sizeFromMessage = detectSizeFromMessage(message);

  if (sizeGroup && sizeGroup.options?.length) {
    if (!sizeFromMessage) {
      return {
        unitPrice: menuItem.price,
        displayName: menuItem.name,
        optionsSelected: [],
        needsSize: true,
        sizeOptions: sizeGroup.options.map(opt => ({ name: opt.name, price: opt.price })),
      };
    }

    const selectedSize = sizeGroup.options.find(opt => {
      const optNormalized = normalizeTextForMatch(opt.name);
      return optNormalized.includes(normalizeTextForMatch(sizeFromMessage)) ||
        (sizeFromMessage.toLowerCase() === 'p' && optNormalized.includes('pequen')) ||
        (sizeFromMessage.toLowerCase() === 'm' && optNormalized.includes('med')) ||
        (sizeFromMessage.toLowerCase() === 'g' && optNormalized.includes('grand'));
    });

    if (selectedSize) {
      unitPrice = selectedSize.price;
      sizeLabel = selectedSize.name;
      optionsSelected.push({ group: sizeGroup.name, option: selectedSize.name, price: selectedSize.price });
    }
  }

  const hasNoAddons = /\bsem\s+(borda|adicional|extra|recheio)\b/i.test(message);
  if (menuItem.options && !hasNoAddons) {
    for (const group of menuItem.options) {
      const isSizeGroup = sizeGroup && group.name === sizeGroup.name;
      if (isSizeGroup) continue;
      for (const opt of group.options || []) {
        const optNormalized = normalizeTextForMatch(opt.name);
        if (optNormalized && normalizedMsg.includes(optNormalized)) {
          optionsSelected.push({ group: group.name, option: opt.name, price: opt.price });
          unitPrice += opt.price;
        }
      }
    }
  }

  const notesParts: string[] = [];
  if (sizeLabel) notesParts.push(`Tamanho: ${sizeLabel}`);
  const addOns = optionsSelected.filter(opt => !/tamanho|size/i.test(opt.group));
  if (addOns.length > 0) {
    notesParts.push(`Adicionais: ${addOns.map(opt => opt.option).join(', ')}`);
  }

  return {
    unitPrice,
    displayName: sizeLabel ? `${menuItem.name} (${sizeLabel})` : menuItem.name,
    notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
    optionsSelected,
    needsSize: false,
  };
}

export function detectCustomerIntent(message: string): CustomerIntent {
  const normalizedMsg = message.toLowerCase().trim();
  
  // PRIORIDADE 1: Verificar se Ã© pedido meio a meio
  for (const pattern of INTENT_PATTERNS.HALF_HALF) {
    if (pattern.test(normalizedMsg)) {
      console.log(`ðŸŽ¯ [DeliveryAI] Intent detected: HALF_HALF`);
      return 'HALF_HALF';
    }
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸ†• PRIORIDADE 2: Verificar se contÃ©m pedido ANTES de verificar saudaÃ§Ã£o
  // "Oi, quero uma pizza calabresa" = WANT_TO_ORDER (nÃ£o GREETING)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  for (const pattern of INTENT_PATTERNS.WANT_TO_ORDER) {
    if (pattern.test(normalizedMsg)) {
      console.log(`ðŸŽ¯ [DeliveryAI] Intent detected: WANT_TO_ORDER (pattern: ${pattern})`);
      return 'WANT_TO_ORDER';
    }
  }
  
  // PRIORIDADE 3: Verificar se Ã© seleÃ§Ã£o de categoria especÃ­fica
  // Ex: "pizza", "bebidas", "aÃ§aÃ­" - sem mais nada
  for (const pattern of INTENT_PATTERNS.WANT_CATEGORY) {
    if (pattern.test(normalizedMsg)) {
      console.log(`ðŸŽ¯ [DeliveryAI] Intent detected: WANT_CATEGORY (pattern: ${pattern})`);
      return 'WANT_CATEGORY';
    }
  }
  
  // Verificar cada padrÃ£o em ordem de prioridade
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intent === 'WANT_CATEGORY' || intent === 'HALF_HALF' || intent === 'WANT_TO_ORDER') continue; // JÃ¡ verificamos
    for (const pattern of patterns) {
      if (pattern.test(normalizedMsg)) {
        console.log(`ðŸŽ¯ [DeliveryAI] Intent detected: ${intent} (pattern: ${pattern})`);
        return intent as CustomerIntent;
      }
    }
  }
  
  return 'OTHER';
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ¤– DETECÃ‡ÃƒO DE INTENÃ‡ÃƒO COM IA (CONSIDERA CONTEXTO)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export async function detectIntentWithAI(
  message: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>,
  deliveryData?: DeliveryData | null
): Promise<CustomerIntent> {
  
  // Se nÃ£o tem histÃ³rico, usa detecÃ§Ã£o simples por regex
  if (!conversationHistory || conversationHistory.length < 2) {
    return detectCustomerIntent(message);
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸ†• VERIFICAR SE ESTÃ AGUARDANDO TAMANHO (contexto pendente)
  // Se a Ãºltima mensagem do bot perguntou "Qual tamanho?", entÃ£o
  // a resposta do cliente Ã© uma seleÃ§Ã£o de tamanho, nÃ£o nova busca
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const lastBotMessage = conversationHistory.filter(m => m.fromMe).slice(-1)[0];
  if (lastBotMessage) {
    const botMsgLower = lastBotMessage.text.toLowerCase();
    const isAwaitingSize = botMsgLower.includes('qual tamanho') || 
                           botMsgLower.includes('qual o tamanho') ||
                           botMsgLower.includes('me diz o tamanho') ||
                           (botMsgLower.includes('tamanho') && 
                            (botMsgLower.includes('pequena (p)') || 
                             botMsgLower.includes('mÃ©dia (m)') || 
                             botMsgLower.includes('grande (g)')));
    
    if (isAwaitingSize) {
      // O cliente estÃ¡ respondendo com o tamanho
      const sizeDetected = detectSizeFromMessage(message);
      if (sizeDetected) {
        console.log(`ðŸ¤– [DeliveryAI] Contexto AWAITING_SIZE detectado! Cliente escolheu: ${sizeDetected}`);
        return 'ADD_ITEM'; // Usar ADD_ITEM para continuar o pedido com o tamanho
      }
    }

    // ðŸ†• VERIFICAR SE ESTÃ AGUARDANDO SABORES MEIO A MEIO
    const isAwaitingHalfHalfFlavors = botMsgLower.includes('meio a meio') &&
      (botMsgLower.includes('quais dois sabores') || botMsgLower.includes('exemplo: "calabresa e mussarela"'));
    if (isAwaitingHalfHalfFlavors) {
      const hasTwoFlavors = /\b(.+?)\s+(e|com|\/)\s+(.+?)\b/i.test(message) ||
        /(meia\s+.+?\s+meia\s+.+)/i.test(message);
      if (hasTwoFlavors) {
        console.log(`ðŸ¤– [DeliveryAI] Contexto AWAITING_HALF_HALF detectado! Cliente informou sabores.`);
        return 'HALF_HALF';
      }
    }
  }
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  
  const mistral = await getLLMClient();
  if (!mistral) {
    console.log(`ðŸ¤– [DeliveryAI] Mistral indisponÃ­vel, usando regex`);
    return detectCustomerIntent(message);
  }
  
  // Verificar contexto: jÃ¡ tem pedido em andamento?
  const hasOrderInProgress = conversationHistory.some(m => 
    m.fromMe && (
      m.text.toLowerCase().includes('seu pedido:') ||
      m.text.toLowerCase().includes('resumo do pedido') ||
      m.text.toLowerCase().includes('para finalizar')
    )
  );
  
  // Se Ã© uma saudaÃ§Ã£o simples mas jÃ¡ tem pedido, nÃ£o Ã© GREETING
  const isSimpleGreeting = /^(oi+e?|olÃ¡|ola|eai|hey|opa)\s*[!?.,]*$/i.test(message.trim());
  if (isSimpleGreeting && hasOrderInProgress) {
    console.log(`ðŸ¤– [DeliveryAI] SaudaÃ§Ã£o com pedido em andamento -> tratando como CONTINUE_ORDER`);
    return 'OTHER'; // Vai cair no fluxo de IA contextual
  }
  
  // Montar contexto resumido
  const recentHistory = conversationHistory.slice(-6).map(m => 
    `${m.fromMe ? 'Atendente' : 'Cliente'}: ${m.text.substring(0, 100)}`
  ).join('\n');
  
  const systemPrompt = `VocÃª analisa intenÃ§Ãµes de clientes em delivery.
Baseado no CONTEXTO da conversa, classifique a intenÃ§Ã£o da Ãºltima mensagem.

INTENÃ‡Ã•ES POSSÃVEIS:
- GREETING: Primeira saudaÃ§Ã£o (oi, olÃ¡) SEM pedido em andamento
- WANT_MENU: Quer ver cardÃ¡pio completo
- WANT_CATEGORY: Quer ver apenas uma categoria (pizza, esfirra, bebida)
- HALF_HALF: Pedido meio a meio (meia X e meia Y)
- WANT_TO_ORDER: Quer fazer pedido ou adicionar item
- ADD_ITEM: Quer adicionar mais itens ao pedido existente
- REMOVE_ITEM: Quer remover item
- CONFIRM_ORDER: Confirma pedido (sim, confirmo, pode mandar, ok, fechado)
- PROVIDE_CUSTOMER_INFO: Fornece dados pessoais (nome, endereÃ§o, telefone, pagamento)
- CANCEL_ORDER: Cancela pedido
- ASK_DELIVERY_INFO: Pergunta sobre entrega, taxa, tempo
- OTHER: Outras perguntas ou continuaÃ§Ã£o de conversa

REGRAS IMPORTANTES:
1. "sim", "confirmo", "ok", "pode mandar", "fechado" = CONFIRM_ORDER
2. "meia X e meia Y" = HALF_HALF (sempre, mesmo sem dizer "meio a meio")
3. Se jÃ¡ tem pedido em andamento e cliente manda saudaÃ§Ã£o simples, Ã© OTHER ou CONFIRM_ORDER
4. Se menciona apenas UMA categoria GENÃ‰RICA sem especificar item (ex: "pizza", "bordas", "bebidas") = WANT_CATEGORY
5. Se menciona um ITEM ESPECÃFICO de uma categoria (ex: "borda de cheddar", "coca-cola 2l", "calabresa grande", "borda cheddar") = WANT_TO_ORDER ou ADD_ITEM, NUNCA WANT_CATEGORY
6. Se fornece nome, endereÃ§o, forma de pagamento = PROVIDE_CUSTOMER_INFO
7. Palavras como "adiciona", "coloca", "quero", "bota" seguidas de nome de item = ADD_ITEM ou WANT_TO_ORDER

Responda APENAS com o nome da intenÃ§Ã£o, nada mais.`;

  try {
    // Usa modelo configurado no banco de dados (sem hardcode)
    const response = await mistral.chat.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `CONTEXTO DA CONVERSA:\n${recentHistory}\n\nÃšLTIMA MENSAGEM DO CLIENTE: "${message}"\n\nQual a intenÃ§Ã£o?` }
      ],
      temperature: 0.1,
      maxTokens: 20,
    });
    
    const intentStr = (response.choices?.[0]?.message?.content || 'OTHER').toString().trim().toUpperCase();
    const validIntents: CustomerIntent[] = ['GREETING', 'WANT_MENU', 'WANT_CATEGORY', 'HALF_HALF', 'ASK_ABOUT_ITEM', 'WANT_TO_ORDER', 'ADD_ITEM', 'REMOVE_ITEM', 'CONFIRM_ORDER', 'PROVIDE_CUSTOMER_INFO', 'FINALIZE_ORDER', 'CANCEL_ORDER', 'ASK_DELIVERY_INFO', 'ASK_BUSINESS_HOURS', 'COMPLAINT', 'OTHER'];
    
    const detectedIntent = validIntents.find(i => intentStr.includes(i)) || 'OTHER';
    console.log(`ðŸ¤– [DeliveryAI] IA detectou intent: ${detectedIntent} (resposta: ${intentStr})`);
    
    return detectedIntent;
  } catch (error) {
    console.error(`ðŸ¤– [DeliveryAI] Erro na detecÃ§Ã£o IA:`, error);
    return detectCustomerIntent(message);
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ“Š BUSCAR DADOS DO DELIVERY (BANCO DE DADOS)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export async function isDeliveryEnabled(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('delivery_config')
      .select('is_active')
      .eq('user_id', userId)
      .maybeSingle(); // FIX 2026-02-25: .single() causes PGRST116 when user has no delivery config

    if (error || !data) {
      return false;
    }

    return data.is_active === true;
  } catch {
    return false;
  }
}

export async function getDeliveryData(userId: string): Promise<DeliveryData | null> {
  try {
    // 1. Buscar configuraÃ§Ã£o do delivery
    const { data: config, error: configError } = await supabase
      .from('delivery_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(); // FIX 2026-02-25: .single() causes PGRST116 when user has no delivery config
    
    console.log(`ðŸ• [DeliveryAI] DEBUG getDeliveryData: userId=${userId}`);
    console.log(`ðŸ• [DeliveryAI] DEBUG config: ${JSON.stringify(config)}`);
    console.log(`ðŸ• [DeliveryAI] DEBUG configError: ${configError ? JSON.stringify(configError) : 'null'}`);
    console.log(`ðŸ• [DeliveryAI] DEBUG is_active value: ${config?.is_active} (type: ${typeof config?.is_active})`);
    
    if (configError || !config || !config.is_active) {
      console.log(`ðŸ• [DeliveryAI] Delivery nÃ£o ativo para user ${userId}`);
      console.log(`ðŸ• [DeliveryAI] Motivo: configError=${!!configError}, config=${!!config}, is_active=${config?.is_active}`);
      return null;
    }

    const { data: businessAgentConfig } = await supabase
      .from('business_agent_configs')
      .select('business_info')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: aiAgentConfig } = await supabase
      .from('ai_agent_config')
      .select('prompt, custom_address, address_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    
    // 2. Buscar categorias
    const { data: categories } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('user_id', userId)
      .order('display_order', { ascending: true });
    
    // 3. Buscar itens do menu (incluindo options para variaÃ§Ãµes)
    const { data: items } = await supabase
      .from('menu_items')
      .select('id, name, description, price, category_id, is_featured, is_available, options')
      .eq('user_id', userId)
      .eq('is_available', true)
      .order('display_order', { ascending: true });
    
    if (!items || items.length === 0) {
      console.log(`ðŸ• [DeliveryAI] Nenhum item encontrado para user ${userId}`);
      return null;
    }
    
    // 4. Organizar por categoria
    const categoryMap = new Map<string, { id?: string; name: string; image_url?: string | null; half_half_pricing?: HalfHalfPricingConfig | null; items: MenuItem[] }>();

    // Criar map de category_id -> meta
    const categoryIdToMeta = new Map<string, { id: string; name: string; image_url?: string | null; half_half_pricing?: HalfHalfPricingConfig | null }>();
    categories?.forEach(cat => categoryIdToMeta.set(cat.id, {
      id: cat.id,
      name: cat.name,
      image_url: cat.image_url,
      half_half_pricing: normalizeHalfHalfPricing(cat.half_half_pricing),
    }));
    
    // Agrupar itens por categoria
    items.forEach(item => {
      const categoryMeta = categoryIdToMeta.get(item.category_id);
      const categoryName = categoryMeta?.name || 'Outros';
      
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          id: categoryMeta?.id,
          name: categoryName,
          image_url: categoryMeta?.image_url || null,
          half_half_pricing: categoryMeta?.half_half_pricing || null,
          items: [],
        });
      }
      
      // Parsear options (variaÃ§Ãµes) se existir
      let parsedOptions: MenuItemOption[] | undefined;
      if (item.options && Array.isArray(item.options) && item.options.length > 0) {
        parsedOptions = item.options as MenuItemOption[];
      }
      
      categoryMap.get(categoryName)!.items.push({
        id: item.id,
        name: item.name,
        description: item.description,
        price: parseFloat(item.price) || 0,
        category_name: categoryName,
        is_highlight: item.is_featured || false,
        is_available: item.is_available,
        options: parsedOptions,
      });
    });
    
    const businessInfoAddress = typeof businessAgentConfig?.business_info?.endereco === 'string'
      ? sanitizeDeliveryText(String(businessAgentConfig.business_info.endereco)).trim()
      : '';
    const aiCustomAddress = typeof aiAgentConfig?.custom_address === 'string'
      ? sanitizeDeliveryText(String(aiAgentConfig.custom_address)).trim()
      : '';
    const aiPrompt = typeof aiAgentConfig?.prompt === 'string'
      ? sanitizeDeliveryText(String(aiAgentConfig.prompt)).trim()
      : '';
    const promptAddressCandidate = extractPromptAddressCandidate(aiPrompt);
    const inferredCityContext =
      extractOriginLocationSuffix(businessInfoAddress) ||
      extractOriginLocationSuffix(aiCustomAddress) ||
      extractOriginLocationSuffix(promptAddressCandidate) ||
      extractBrazilianCityContextFromFreeText(aiCustomAddress) ||
      extractBrazilianCityContextFromFreeText(promptAddressCandidate) ||
      '';
    const currentDeliveryFeeSettings = (config.delivery_fee_settings && typeof config.delivery_fee_settings === 'object')
      ? { ...(config.delivery_fee_settings as Record<string, any>) }
      : {};
    const mergedDeliveryFeeSettings = {
      ...currentDeliveryFeeSettings,
      originAddress: typeof currentDeliveryFeeSettings.originAddress === 'string' && currentDeliveryFeeSettings.originAddress.trim()
        ? currentDeliveryFeeSettings.originAddress
        : businessInfoAddress || aiCustomAddress || promptAddressCandidate,
      cityContext: typeof currentDeliveryFeeSettings.cityContext === 'string' && currentDeliveryFeeSettings.cityContext.trim()
        ? currentDeliveryFeeSettings.cityContext
        : inferredCityContext,
    };

    const result: DeliveryData = {
      config: {
        id: config.id,
        user_id: config.user_id,
        business_name: config.business_name,
        business_type: config.business_type || 'restaurante',
        menu_send_mode: config.menu_send_mode || 'text',
        delivery_fee: parseFloat(config.delivery_fee) || 0,
        min_order_value: parseFloat(config.min_order_value) || 0,
        estimated_delivery_time: config.estimated_delivery_time || 45,
        accepts_delivery: config.accepts_delivery ?? true,
        accepts_pickup: config.accepts_pickup ?? true,
        accepts_cancellation: config.accepts_cancellation ?? false,  // Default: nÃ£o permite cancelamento
        payment_methods: config.payment_methods || ['Dinheiro', 'CartÃ£o', 'Pix'],
        is_active: config.is_active,
        opening_hours: config.opening_hours || {},  // HorÃ¡rios de funcionamento
        welcome_message: config.welcome_message || null,
        order_confirmation_message: config.order_confirmation_message || null,
        order_ready_message: config.order_ready_message || null,
        out_for_delivery_message: config.out_for_delivery_message || null,
        closed_message: config.closed_message || null,
        humanize_responses: config.humanize_responses ?? true,
        use_customer_name: config.use_customer_name ?? true,
        response_variation: config.response_variation ?? true,
        response_delay_min: config.response_delay_min ?? 2,
        response_delay_max: config.response_delay_max ?? 5,
        pix_settings: normalizePixSettings(config.pix_settings),
        cash_settings: normalizeCashSettings(config.cash_settings),
        delivery_fee_settings: normalizeDeliveryFeeSettings({
          ...config,
          delivery_fee: parseFloat(config.delivery_fee) || 0,
          delivery_fee_settings: mergedDeliveryFeeSettings,
        }),
      },
      categories: Array.from(categoryMap.values()),
      totalItems: items.length,
    };
    
    console.log(`ðŸ• [DeliveryAI] Dados carregados: ${result.totalItems} itens em ${result.categories.length} categorias`);
    result.categories.forEach(cat => {
      console.log(`   ðŸ“ ${cat.name}: ${cat.items.length} itens`);
    });
    
    return result;
    
  } catch (error) {
    console.error(`ðŸ• [DeliveryAI] Erro ao buscar dados:`, error);
    return null;
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸŽ¨ FORMATAR CARDÃPIO EM BOLHAS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const EMOJI_BY_TYPE: Record<string, string> = {
  pizzaria: 'ðŸ•',
  hamburgueria: 'ðŸ”',
  lanchonete: 'ðŸ¥ª',
  restaurante: 'ðŸ½ï¸',
  acai: 'ðŸ¨',
  japonesa: 'ðŸ£',
  outros: 'ðŸ´',
};

const MAX_CHARS_PER_BUBBLE = 1500; // WhatsApp suporta ~4096, mas melhor dividir

export function formatMenuAsBubbles(data: DeliveryData): string[] {
  const bubbles: string[] = [];
  const emoji = EMOJI_BY_TYPE[data.config.business_type] || 'ðŸ´';
  
  // Header (primeira bolha)
  let header = `${emoji} *${data.config.business_name.toUpperCase()}*\n`;
  header += `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n`;
  header += `ðŸ“‹ CardÃ¡pio completo (${data.totalItems} itens)\n\n`;
  
  // Adicionar informaÃ§Ãµes de entrega no header
  if (data.config.accepts_delivery) {
    header += `ðŸ›µ Entrega: R$ ${data.config.delivery_fee.toFixed(2).replace('.', ',')}\n`;
    header += `â±ï¸ Tempo: ~${data.config.estimated_delivery_time} min\n`;
  }
  if (data.config.accepts_pickup) {
    header += `ðŸª Retirada: GRÃTIS\n`;
  }
  if (data.config.min_order_value > 0) {
    header += `ðŸ“¦ Pedido mÃ­nimo: R$ ${data.config.min_order_value.toFixed(2).replace('.', ',')}\n`;
  }
  header += `ðŸ’³ Pagamento: ${data.config.payment_methods.join(', ')}\n`;
  
  bubbles.push(header);
  
  // Cada categoria pode virar uma ou mais bolhas
  for (const category of data.categories) {
    let categoryBubble = `\nðŸ“ *${category.name.toUpperCase()}*\n`;
    categoryBubble += `â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n`;
    
    for (const item of category.items) {
      const highlight = item.is_highlight ? ' â­' : '';
      
      // Verificar se tem variaÃ§Ãµes de tamanho
      const sizeOption = item.options?.find(opt => 
        opt.name.toLowerCase().includes('tamanho') || 
        opt.name.toLowerCase().includes('size')
      );
      
      let itemLine = '';
      if (sizeOption && sizeOption.options.length > 0) {
        // Mostrar item com variaÃ§Ãµes de tamanho
        const prices = sizeOption.options.map(opt => 
          `${opt.name}: R$ ${opt.price.toFixed(2).replace('.', ',')}`
        ).join(' | ');
        itemLine = `â€¢ ${item.name}${highlight}\n  ${prices}\n`;
      } else {
        // Item sem variaÃ§Ãµes - preÃ§o Ãºnico
        const priceStr = `R$ ${item.price.toFixed(2).replace('.', ',')}`;
        itemLine = `â€¢ ${item.name}${highlight} - ${priceStr}\n`;
      }
      
      if (item.description) {
        itemLine += `  _${item.description}_\n`;
      }
      
      // Se adicionar este item ultrapassar o limite, criar nova bolha
      if ((categoryBubble + itemLine).length > MAX_CHARS_PER_BUBBLE) {
        bubbles.push(categoryBubble.trim());
        categoryBubble = `ðŸ“ *${category.name.toUpperCase()} (cont.)*\n`;
        categoryBubble += `â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n`;
      }
      
      categoryBubble += itemLine;
    }
    
    bubbles.push(categoryBubble.trim());
  }
  
  // Footer (Ãºltima bolha)
  const footer = `\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\nâœ… Pronto para pedir? Me avise! ðŸ˜Š`;
  
  // Adicionar footer Ã  Ãºltima bolha ou criar nova
  const lastBubble = bubbles[bubbles.length - 1];
  if ((lastBubble + footer).length <= MAX_CHARS_PER_BUBBLE) {
    bubbles[bubbles.length - 1] = lastBubble + footer;
  } else {
    bubbles.push(footer.trim());
  }
  
  console.log(`ðŸ• [DeliveryAI] CardÃ¡pio formatado em ${bubbles.length} bolhas`);
  return bubbles;
}

function buildMenuMediaActions(
  data: DeliveryData,
  intent: CustomerIntent,
  metadata?: Record<string, any>
): MistralResponse['actions'] {
  if (intent !== 'WANT_MENU' && intent !== 'WANT_CATEGORY' && intent !== 'GREETING') {
    return [];
  }

  if (metadata?.categoryImageUrl) {
    return [
      {
        type: 'send_media_url',
        media_url: metadata.categoryImageUrl,
        media_type: 'image',
        caption: metadata.categoryName || metadata.categoryRequested,
      }
    ];
  }

  const categoriesWithImages = data.categories.filter(cat => !!cat.image_url);
  if (categoriesWithImages.length === 0) return [];

  const requested = String(metadata?.categoryRequested || '').toLowerCase().trim();
  if (requested) {
    const normalizedRequested = normalizeCategoryText(requested);
    const keywordCandidates = new Set<string>([requested]);
    if (CATEGORY_KEYWORDS[requested]) {
      CATEGORY_KEYWORDS[requested].forEach(k => keywordCandidates.add(k));
    }
    const matchingKey = Object.keys(CATEGORY_KEYWORDS).find(key =>
      CATEGORY_KEYWORDS[key].some(k => normalizeCategoryText(k) === normalizedRequested)
    );
    if (matchingKey) {
      keywordCandidates.add(matchingKey);
      CATEGORY_KEYWORDS[matchingKey].forEach(k => keywordCandidates.add(k));
    }

    const match = categoriesWithImages.find(cat => {
      const normalizedName = normalizeCategoryText(cat.name);
      for (const candidate of keywordCandidates) {
        const normalizedCandidate = normalizeCategoryText(candidate);
        if (!normalizedCandidate) continue;
        if (normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName)) {
          return true;
        }
      }
      return false;
    });
    if (!match?.image_url) return [];
    return [
      {
        type: 'send_media_url',
        media_url: match.image_url,
        media_type: 'image',
        caption: match.name,
      }
    ];
  }

  if (intent === 'WANT_CATEGORY') {
    return [];
  }

  // ðŸ†• Para GREETING e WANT_MENU sem categoria especÃ­fica: enviar TODAS as imagens Ãºnicas do cardÃ¡pio
  if (intent === 'GREETING' || intent === 'WANT_MENU') {
    const uniqueImages = new Map<string, string>(); // url -> caption
    for (const cat of categoriesWithImages) {
      if (cat.image_url && !uniqueImages.has(cat.image_url)) {
        uniqueImages.set(cat.image_url, cat.name);
      }
    }
    if (uniqueImages.size > 0) {
      const actions: MistralResponse['actions'] = [];
      for (const [url, caption] of uniqueImages) {
        actions.push({
          type: 'send_media_url',
          media_url: url,
          media_type: 'image',
          caption: caption,
        });
      }
      return actions;
    }
  }

  return [];
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸŽ¨ FORMATAR CATEGORIA ESPECÃFICA (QUANDO CLIENTE ESCOLHE UMA CATEGORIA)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function findMatchingCategory(
  data: DeliveryData,
  categoryKeyword: string
): MenuCategory | null {
  const normalizedKeyword = normalizeCategoryText(categoryKeyword);
  const keywordCandidates = new Set<string>([categoryKeyword]);
  if (CATEGORY_KEYWORDS[categoryKeyword]) {
    CATEGORY_KEYWORDS[categoryKeyword].forEach(k => keywordCandidates.add(k));
  }
  const matchingKey = Object.keys(CATEGORY_KEYWORDS).find(key =>
    CATEGORY_KEYWORDS[key].some(k => normalizeCategoryText(k) === normalizedKeyword)
  );
  if (matchingKey) {
    keywordCandidates.add(matchingKey);
    CATEGORY_KEYWORDS[matchingKey].forEach(k => keywordCandidates.add(k));
  }

  const match = data.categories.find(cat => {
    const catNameNormalized = normalizeCategoryText(cat.name);
    if (!catNameNormalized) return false;
    for (const candidate of keywordCandidates) {
      const normalizedCandidate = normalizeCategoryText(candidate);
      if (!normalizedCandidate) continue;
      if (smartCategoryMatch(catNameNormalized, normalizedCandidate)) {
        return true;
      }
    }
    return false;
  });

  return match || null;
}

export function formatCategoryAsBubbles(
  data: DeliveryData, 
  categoryKeyword: string
): string[] {
  const bubbles: string[] = [];
  const emoji = EMOJI_BY_TYPE[data.config.business_type] || 'ðŸ´';

  const normalizedKeyword = normalizeCategoryText(categoryKeyword);
  const keywordCandidates = new Set<string>([categoryKeyword]);
  if (CATEGORY_KEYWORDS[categoryKeyword]) {
    CATEGORY_KEYWORDS[categoryKeyword].forEach(k => keywordCandidates.add(k));
  }
  const matchingKey = Object.keys(CATEGORY_KEYWORDS).find(key =>
    CATEGORY_KEYWORDS[key].some(k => normalizeCategoryText(k) === normalizedKeyword)
  );
  if (matchingKey) {
    keywordCandidates.add(matchingKey);
    CATEGORY_KEYWORDS[matchingKey].forEach(k => keywordCandidates.add(k));
  }
  
  // Encontrar categorias que correspondem ao keyword
  const matchingCategories = data.categories.filter(cat => {
    const catNameNormalized = normalizeCategoryText(cat.name);
    if (!catNameNormalized) return false;

    if (smartCategoryMatch(catNameNormalized, normalizedKeyword)) {
      return true;
    }

    for (const candidate of keywordCandidates) {
      const normalizedCandidate = normalizeCategoryText(candidate);
      if (!normalizedCandidate) continue;
      if (smartCategoryMatch(catNameNormalized, normalizedCandidate)) {
        return true;
      }
    }

    return false;
  });
  
  if (matchingCategories.length === 0) {
    // NÃ£o encontrou a categoria, retorna mensagem amigÃ¡vel
    return [`NÃ£o encontrei essa categoria no cardÃ¡pio. ðŸ¤”\n\nTemos:\n${data.categories.map(c => `â€¢ ${c.name}`).join('\n')}\n\nQual vocÃª gostaria de ver?`];
  }
  
  // Conta total de itens nas categorias encontradas
  const totalItems = matchingCategories.reduce((sum, cat) => sum + cat.items.length, 0);
  
  // Header
  let header = `${emoji} *${data.config.business_name.toUpperCase()}*\n`;
  header += `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n`;
  header += `ðŸ“‹ ${matchingCategories.map(c => c.name).join(', ')} (${totalItems} opÃ§Ãµes)\n`;
  
  bubbles.push(header);
  
  // Formatar cada categoria encontrada
  for (const category of matchingCategories) {
    let categoryBubble = `\nðŸ“ *${category.name.toUpperCase()}*\n`;
    categoryBubble += `â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n`;
    
    for (const item of category.items) {
      const highlight = item.is_highlight ? ' â­' : '';
      
      // Verificar se tem variaÃ§Ãµes de tamanho
      const sizeOption = item.options?.find(opt => 
        opt.name.toLowerCase().includes('tamanho') || 
        opt.name.toLowerCase().includes('size')
      );
      
      let itemLine = '';
      if (sizeOption && sizeOption.options.length > 0) {
        // Mostrar item com variaÃ§Ãµes de tamanho
        const prices = sizeOption.options.map(opt => 
          `${opt.name}: R$ ${opt.price.toFixed(2).replace('.', ',')}`
        ).join(' | ');
        itemLine = `â€¢ ${item.name}${highlight}\n  ${prices}\n`;
      } else {
        // Item sem variaÃ§Ãµes - preÃ§o Ãºnico
        const priceStr = `R$ ${item.price.toFixed(2).replace('.', ',')}`;
        itemLine = `â€¢ ${item.name}${highlight} - ${priceStr}\n`;
      }
      
      if (item.description) {
        itemLine += `  _${item.description}_\n`;
      }
      
      // Se adicionar este item ultrapassar o limite, criar nova bolha
      if ((categoryBubble + itemLine).length > MAX_CHARS_PER_BUBBLE) {
        bubbles.push(categoryBubble.trim());
        categoryBubble = `ðŸ“ *${category.name.toUpperCase()} (cont.)*\n`;
        categoryBubble += `â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n`;
      }
      
      categoryBubble += itemLine;
    }
    
    bubbles.push(categoryBubble.trim());
  }
  
  // Footer
  const footer = `\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\nâœ… Qual vocÃª quer? Ã‰ sÃ³ me dizer! ðŸ˜Š`;
  
  // Adicionar footer Ã  Ãºltima bolha ou criar nova
  const lastBubble = bubbles[bubbles.length - 1];
  if ((lastBubble + footer).length <= MAX_CHARS_PER_BUBBLE) {
    bubbles[bubbles.length - 1] = lastBubble + footer;
  } else {
    bubbles.push(footer.trim());
  }
  
  console.log(`ðŸ• [DeliveryAI] Categoria "${categoryKeyword}" formatada em ${bubbles.length} bolhas (${totalItems} itens)`);
  return bubbles;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ” VALIDAR PREÃ‡O DE ITEM (CONTRA BANCO DE DADOS)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function findItemInMenu(
  data: DeliveryData, 
  itemName: string
): MenuItem | null {
  const normalizedName = itemName.toLowerCase().trim();
  
  for (const category of data.categories) {
    for (const item of category.items) {
      // Match exato
      if (item.name.toLowerCase() === normalizedName) {
        return item;
      }
      // Match parcial (contÃ©m)
      if (item.name.toLowerCase().includes(normalizedName) || 
          normalizedName.includes(item.name.toLowerCase())) {
        return item;
      }
    }
  }
  
  return null;
}

export function validatePriceInResponse(
  response: string,
  data: DeliveryData
): { valid: boolean; errors: string[]; corrected: string } {
  const errors: string[] = [];
  let corrected = response;
  
  // Regex para encontrar preÃ§os no formato R$ XX,XX ou R$XX
  const pricePattern = /R\$\s*(\d+)[,.](\d{2})/g;
  const matches = [...response.matchAll(pricePattern)];
  
  for (const match of matches) {
    const foundPrice = parseFloat(`${match[1]}.${match[2]}`);
    
    // Tentar encontrar qual item estÃ¡ sendo mencionado
    // (buscar nome de item prÃ³ximo ao preÃ§o no texto)
    const nearbyText = response.substring(
      Math.max(0, match.index! - 100), 
      Math.min(response.length, match.index! + 100)
    );
    const nearbyTextLower = nearbyText.toLowerCase();
    
    // Verificar se algum item do menu estÃ¡ mencionado
    let itemFound = false;
    for (const category of data.categories) {
      for (const item of category.items) {
        if (nearbyTextLower.includes(item.name.toLowerCase())) {
          // Coletar todos os preÃ§os vÃ¡lidos: preÃ§o base + variaÃ§Ãµes
          const validPrices: number[] = [item.price];
          
          // Adicionar preÃ§os das variaÃ§Ãµes (tamanhos como P, M, G)
          if (item.options && Array.isArray(item.options)) {
            for (const optionGroup of item.options) {
              if (optionGroup.options && Array.isArray(optionGroup.options)) {
                for (const opt of optionGroup.options) {
                  if (typeof opt.price === 'number' && opt.price > 0) {
                    validPrices.push(opt.price);
                  }
                }
              }
            }
          }
          
          // Verificar se o preÃ§o encontrado estÃ¡ na lista de preÃ§os vÃ¡lidos
          const isValidPrice = validPrices.some(vp => Math.abs(vp - foundPrice) < 0.01);
          
          if (!isValidPrice) {
            // SÃ³ reporta erro se o preÃ§o NÃƒO estÃ¡ em nenhuma variaÃ§Ã£o
            errors.push(`PreÃ§o incorreto para ${item.name}: R$ ${foundPrice.toFixed(2)} (preÃ§os vÃ¡lidos: R$ ${validPrices.map(p => p.toFixed(2)).join(', R$ ')})`);
            // NÃƒO corrigir automaticamente - pode ser um tamanho diferente
            // O preÃ§o base sÃ³ Ã© usado se nÃ£o hÃ¡ variaÃ§Ãµes detectadas
            if (validPrices.length === 1) {
              corrected = corrected.replace(
                match[0],
                `R$ ${item.price.toFixed(2).replace('.', ',')}`
              );
            }
          } else {
            console.log(`âœ… [PriceValidation] PreÃ§o R$ ${foundPrice.toFixed(2)} vÃ¡lido para ${item.name} (variaÃ§Ã£o encontrada)`);
          }
          itemFound = true;
          break;
        }
      }
      if (itemFound) break;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    corrected,
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ¤– GERAR RESPOSTA COM IA (CONTEXTO MÃNIMO)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export async function generateDeliveryResponse(
  userId: string,
  message: string,
  intent: CustomerIntent,
  deliveryData: DeliveryData,
  conversationContext?: string,
  customerPhone?: string,
  conversationId?: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): Promise<DeliveryAIResponse> {
  
  console.log(`ðŸ”¥ðŸ”¥ðŸ”¥ [DEPLOY V2] generateDeliveryResponse iniciada - Intent: ${intent}`);
  const persistedCart = customerPhone ? getExistingCart(userId, customerPhone, conversationId) : null;
  
  // ðŸ†• LIMPAR CARRINHO SE FOR PRIMEIRA MENSAGEM DO CLIENTE (SEM HISTÃ“RICO)
  if (
    customerPhone &&
    !isSyntheticConversationId(conversationId) &&
    (!conversationHistory || conversationHistory.length === 0) &&
    !(
      persistedCart &&
      (
        persistedCart.items.size > 0 ||
        persistedCart.awaitingConfirmation ||
        !!persistedCart.customerName ||
        !!persistedCart.paymentMethod ||
        !!persistedCart.address ||
        !!persistedCart.deliveryType
      )
    )
  ) {
    console.log(`ðŸ›’ [DeliveryAI] Primeira mensagem detectada - limpando carrinho antigo`);
    clearCart(userId, customerPhone, conversationId);
  }
  
  // Gerar conversationId Ãºnico para o pedido (usado na criaÃ§Ã£o do pedido)
  const effectiveConversationId = conversationId || `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const currentCart = customerPhone ? getCart(userId, customerPhone, effectiveConversationId) : null;

  if (customerPhone && currentCart && currentCart.items.size > 0) {
    const optionHint = detectOptionGroupHint(message);

    if (optionHint && shouldTreatMessageAsOptionGroupQuery(message, currentCart)) {
      const optionGroup = findRelevantOptionGroup(deliveryData, optionHint, currentCart);
      if (optionGroup) {
        return {
          intent: 'ASK_ABOUT_ITEM',
          bubbles: [formatOptionGroupPrompt(optionGroup)],
          metadata: {
            itemMentioned: optionGroup.item.name,
            categoryRequested: optionGroup.categoryName,
            reason: 'cart_option_group_requested',
          },
        };
      }

      return {
        intent: 'ASK_ABOUT_ITEM',
        bubbles: [formatUnavailableOptionGroupMessage(optionHint, deliveryData, currentCart)],
        metadata: {
          reason: 'cart_option_group_unavailable',
        },
      };
    }

    const optionSelection = findCartOptionSelection(deliveryData, currentCart, message, conversationHistory);
    if (optionSelection) {
      const updatedCart = applyOptionSelectionToCart(userId, customerPhone, optionSelection, effectiveConversationId);
      const subtotal = getCartSubtotal(updatedCart);
      const total = getCartTotal(updatedCart, deliveryData.config.delivery_fee);
      let response = `✅ Adicionei *${optionSelection.option.name}* em *${optionSelection.cartItem.name}*.\n\n`;
      response += `${formatCartSummary(updatedCart, deliveryData.config.delivery_fee)}`;
      response += `\n\nSe quiser, posso finalizar o pedido ou adicionar mais alguma coisa.`;

      return {
        intent: 'ADD_ITEM',
        bubbles: [response],
        metadata: {
          itemMentioned: optionSelection.option.name,
          orderItems: Array.from(updatedCart.items.values()).map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
          })),
          subtotal,
          deliveryFee: deliveryData.config.delivery_fee,
          total,
          reason: 'cart_option_selected',
        },
      };
    }
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CASO ESPECIAL: CATEGORIA ESPECÃFICA (pizza, bebidas, etc)
  // Quando cliente diz apenas "pizza", mostra sÃ³ as pizzas!
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (intent === 'WANT_CATEGORY') {
    let category = detectCategoryFromMessage(message);
    
    // ðŸ†• FALLBACK DINÃ‚MICO: Se keywords hardcoded nÃ£o acharam, busca por nome real da categoria no DB
    if (!category) {
      const normalizedMsg = normalizeCategoryText(message);
      if (normalizedMsg) {
        for (const cat of deliveryData.categories) {
          const catNameNormalized = normalizeCategoryText(cat.name);
          if (catNameNormalized && smartCategoryMatch(catNameNormalized, normalizedMsg)) {
            category = normalizedMsg;
            console.log(`ðŸ• [DeliveryAI] âœ… Categoria encontrada por nome do DB: "${cat.name}" â†’ "${category}"`);
            break;
          }
        }
      }
    }
    
    console.log(`ðŸ• [DeliveryAI] Intent WANT_CATEGORY - mostrando apenas: ${category}`);
    
    if (category) {
      const matchedCategory = findMatchingCategory(deliveryData, category);
      if (!matchedCategory) {
        const optionHint = detectOptionGroupHint(message);
        if (optionHint) {
          const optionGroup = findRelevantOptionGroup(deliveryData, optionHint, currentCart);
          if (optionGroup) {
            return {
              intent: 'ASK_ABOUT_ITEM',
              bubbles: [formatOptionGroupPrompt(optionGroup)],
              metadata: {
                itemMentioned: optionGroup.item.name,
                categoryRequested: optionGroup.categoryName,
                reason: 'option_group_requested',
              },
            };
          }

          return {
            intent: 'ASK_ABOUT_ITEM',
            bubbles: [formatUnavailableOptionGroupMessage(optionHint, deliveryData, currentCart)],
            metadata: {
              reason: 'option_group_unavailable',
            },
          };
        }
      }

      const shouldImageOnly = normalizeMenuSendMode(deliveryData.config.menu_send_mode) === 'image' && !!matchedCategory?.image_url;
      const categoryBubbles = shouldImageOnly
        ? []
        : formatCategoryAsBubbles(deliveryData, category);
      return {
        intent: 'WANT_CATEGORY',
        bubbles: categoryBubbles,
        metadata: {
          categoryRequested: category,
          categoryImageUrl: matchedCategory?.image_url || null,
          categoryName: matchedCategory?.name || null,
        },
      };
    } else {
      // Se nÃ£o conseguiu identificar a categoria, mostra menu completo
      const shouldImageOnly = normalizeMenuSendMode(deliveryData.config.menu_send_mode) === 'image'
        && deliveryData.categories.some(category => !!category.image_url);
      const menuBubbles = shouldImageOnly ? [] : formatMenuAsBubbles(deliveryData);
      return {
        intent: 'WANT_MENU',
        bubbles: menuBubbles,
      };
    }
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CASO ESPECIAL: MEIO A MEIO - Pizza dividida
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (intent === 'HALF_HALF') {
    console.log(`ðŸ• [DeliveryAI] Intent HALF_HALF - pedido meio a meio`);
    
    // Detectar categoria do contexto ou mensagem
    let categoryContext = detectCategoryFromMessage(conversationContext || message);
    if (!categoryContext) {
      // Se nÃ£o detectou, assume pizza (mais comum)
      categoryContext = 'pizza';
      console.log(`ðŸ• [DeliveryAI] Categoria nÃ£o detectada, assumindo: ${categoryContext}`);
    }
    
    // Extrair os dois sabores da mensagem COM FILTRO DE CATEGORIA
    const halfHalfResult = parseHalfHalfOrder(message, deliveryData, categoryContext);
    
    if (halfHalfResult.success && halfHalfResult.items.length === 2) {
      const [item1, item2] = halfHalfResult.items;
      
      // ðŸ” VERIFICAR SE OS ITENS TÃŠM VARIAÃ‡Ã•ES (TAMANHOS)
      // Buscar os itens completos do menu para verificar options
      const fullItem1 = findItemByNameFuzzy(deliveryData, item1.name, categoryContext);
      const fullItem2 = findItemByNameFuzzy(deliveryData, item2.name, categoryContext);
      
      // Verificar se algum tem variaÃ§Ã£o de tamanho
      const hasVariations = (fullItem1?.options && fullItem1.options.length > 0) || 
                           (fullItem2?.options && fullItem2.options.length > 0);
      
      // Verificar se o tamanho jÃ¡ foi especificado na mensagem
      const sizeFromMessage = detectSizeFromMessage(message);
      
      console.log(`ðŸ” [DeliveryAI] Meio a meio - hasVariations: ${hasVariations}, sizeFromMessage: ${sizeFromMessage}`);
      
      // Se tem variaÃ§Ãµes e o tamanho NÃƒO foi especificado, perguntar
      if (hasVariations && !sizeFromMessage) {
        // Montar lista de tamanhos disponÃ­veis do primeiro item (assume mesmo para todos da categoria)
        const sizeOptions = fullItem1?.options?.find(opt => 
          opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size')
        );
        
        let sizesText = '';
        if (sizeOptions && sizeOptions.options) {
          sizesText = sizeOptions.options.map(opt => 
            `â€¢ *${opt.name}* - R$ ${opt.price.toFixed(2).replace('.', ',')}`
          ).join('\n');
        } else {
          // Fallback se nÃ£o achar as opÃ§Ãµes
          sizesText = 'â€¢ *Pequena (P)*\nâ€¢ *MÃ©dia (M)*\nâ€¢ *Grande (G)*';
        }
        
        return {
          intent: 'HALF_HALF',
          bubbles: [
            `ðŸ• Ã“tima escolha! *${item1.name}* e *${item2.name}* meio a meio!\n\nðŸ“ *Qual tamanho vocÃª prefere?*\n\n${sizesText}\n\nMe diz o tamanho que eu jÃ¡ monto seu pedido! ðŸ˜Š`
          ],
          metadata: {
            awaitingSize: true,
            halfHalfPending: {
              item1: item1.name,
              item2: item2.name,
              category: categoryContext
            }
          },
        };
      }
      
      // Tamanho especificado ou item sem variaÃ§Ã£o - calcular preÃ§o
      let sizeSpecificPrice: number | null = null;
      let sizeLabel = '';
      
      // Se tem tamanho especificado, buscar o preÃ§o correto
      if (sizeFromMessage && fullItem1?.options) {
        const sizeOption = fullItem1.options.find(opt => 
          opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size')
        );
        if (sizeOption && sizeOption.options) {
          const selectedSize = sizeOption.options.find(opt => 
            opt.name.toLowerCase().includes(sizeFromMessage.toLowerCase()) ||
            (sizeFromMessage.toLowerCase() === 'p' && opt.name.toLowerCase().includes('pequen')) ||
            (sizeFromMessage.toLowerCase() === 'm' && opt.name.toLowerCase().includes('mÃ©d')) ||
            (sizeFromMessage.toLowerCase() === 'g' && opt.name.toLowerCase().includes('grand'))
          );
          if (selectedSize) {
            sizeSpecificPrice = selectedSize.price;
            sizeLabel = ` (${selectedSize.name})`;
          }
        }
      }

      const { finalPrice, source: halfHalfPriceSource } = resolveHalfHalfPrice({
        deliveryData,
        categoryContext,
        item1,
        item2,
        sizeCode: sizeFromMessage,
        sizeSpecificPrice,
      });
      
      console.log(`ðŸ’° [DeliveryAI] Meio a meio: ${item1.name} + ${item2.name} = R$ ${finalPrice} ${sizeLabel}`);
      
      let cartSummary = '';
      if (customerPhone) {
        const halfHalfName = `${categoryContext.charAt(0).toUpperCase() + categoryContext.slice(1)} meio a meio: ${item1.name} + ${item2.name}${sizeLabel}`;
        const customItemId = `halfhalf:${normalizeTextForMatch(item1.name)}:${normalizeTextForMatch(item2.name)}:${normalizeTextForMatch(sizeLabel || 'base')}`;
        addCustomItemToCart(userId, customerPhone, {
          itemId: customItemId,
          name: halfHalfName,
          price: finalPrice,
          quantity: 1,
          notes: `Metade ${item1.name} + Metade ${item2.name}`,
          menuItemId: null,
        }, effectiveConversationId);
        const cart = getCart(userId, customerPhone, effectiveConversationId);
        cartSummary = `\n\n${formatCartSummary(cart, deliveryData.config.delivery_fee)}`;
      }

      return {
        intent: 'HALF_HALF',
        bubbles: [
          `âœ… Perfeito! ${categoryContext.charAt(0).toUpperCase() + categoryContext.slice(1)}${sizeLabel} meio a meio:\n\nðŸ• *Metade ${item1.name}*\nðŸ• *Metade ${item2.name}*\n\nðŸ’° *Total: R$ ${finalPrice.toFixed(2).replace('.', ',')}*${describeHalfHalfPricing(halfHalfPriceSource, hasVariations)}${cartSummary}\n\nQuer mais alguma coisa ou posso confirmar o pedido?`
        ],
        metadata: {
          halfHalfItems: halfHalfResult.items,
          halfHalfPrice: finalPrice,
          halfHalfSize: sizeFromMessage || null,
          categoryContext,
        },
      };
    } else {
      // NÃ£o conseguiu identificar os sabores
      const pizzaCat = deliveryData.categories.find(c => c.name.toLowerCase().includes(categoryContext || 'pizza'));
      const optionsList = pizzaCat ? pizzaCat.items.slice(0, 10).map(i => `â€¢ ${i.name}`).join('\n') : '';
      
      return {
        intent: 'HALF_HALF',
        bubbles: [
          `ðŸ• Ã“timo, ${categoryContext} meio a meio! Quais dois sabores vocÃª quer?\n\nExemplo: "Calabresa e Mussarela"\n\n${pizzaCat ? `Alguns sabores de ${pizzaCat.name}:\n${optionsList}\n\n_...e mais opÃ§Ãµes no cardÃ¡pio!_` : 'Veja o cardÃ¡pio para escolher!'}`
        ],
      };
    }
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CASO ESPECIAL: CARDÃPIO COMPLETO - NÃƒO CHAMA IA
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (intent === 'WANT_MENU') {
    console.log(`ðŸ• [DeliveryAI] Intent WANT_MENU - solicitando categoria antes do cardÃ¡pio completo`);
    
    let categoryFromMessage = detectCategoryFromMessage(message);
    
    // ðŸ†• FALLBACK DINÃ‚MICO: tentar match direto pelo nome da categoria no DB
    if (!categoryFromMessage) {
      const normalizedMsg = normalizeCategoryText(message);
      if (normalizedMsg) {
        for (const cat of deliveryData.categories) {
          const catNameNormalized = normalizeCategoryText(cat.name);
          if (catNameNormalized && smartCategoryMatch(catNameNormalized, normalizedMsg)) {
            categoryFromMessage = normalizedMsg;
            console.log(`ðŸ• [DeliveryAI] âœ… WANT_MENU: Categoria encontrada por nome DB: "${cat.name}" â†’ "${categoryFromMessage}"`);
            break;
          }
        }
      }
    }
    
    if (categoryFromMessage) {
      const matchedCategory = findMatchingCategory(deliveryData, categoryFromMessage);
      const shouldImageOnly = normalizeMenuSendMode(deliveryData.config.menu_send_mode) === 'image' && !!matchedCategory?.image_url;
      const categoryBubbles = shouldImageOnly
        ? []
        : formatCategoryAsBubbles(deliveryData, categoryFromMessage);
      return {
        intent: 'WANT_MENU',
        bubbles: categoryBubbles,
        metadata: {
          categoryRequested: categoryFromMessage,
          categoryImageUrl: matchedCategory?.image_url || null,
          categoryName: matchedCategory?.name || null,
        },
      };
    }
    
    const hasVisualCategories = deliveryData.categories.some(cat => !!cat.image_url);
    const categoriesList = deliveryData.categories
      .map(cat => `â€¢ ${cat.name}`)
      .join('\n');
    
    const categoryPrompt = normalizeMenuSendMode(deliveryData.config.menu_send_mode) === 'image' && hasVisualCategories
      ? `Claro! Confira as imagens do cardÃ¡pio acima e me diga a categoria ou o item que vocÃª quer pedir.`
      : `Claro! Qual categoria vocÃª quer ver primeiro?\n\n${categoriesList}\n\nEx.: Pizza, Esfihas, AÃ§aÃ­, Bebidas.`;
    
    return {
      intent: 'WANT_MENU',
      bubbles: [categoryPrompt],
      metadata: {
        itemMentioned: undefined,
      },
    };
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CASO ESPECIAL: SAUDAÃ‡ÃƒO - Envia boas-vindas e cardÃ¡pio completo
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (intent === 'GREETING') {
    const greeting = getTimeBasedGreeting();
    console.log(`ðŸ• [DeliveryAI] GREETING detectado - solicitando categoria antes do cardÃ¡pio`);
    
    const hasVisualCategories = deliveryData.categories.some(cat => !!cat.image_url);
    const categoriesList = deliveryData.categories
      .map(cat => `â€¢ ${cat.name}`)
      .join('\n');

    const historyName = getCustomerNameFromHistory(conversationHistory);
    const effectiveName = deliveryData.config.use_customer_name
      ? (historyName || 'Cliente')
      : 'Cliente';
    const defaultWelcomeTemplate = `${greeting}! ðŸ˜Š Bem-vindo(a) ao *${deliveryData.config.business_name}*!`;
    const welcomeTemplate = deliveryData.config.welcome_message || defaultWelcomeTemplate;
    const welcomeTextRaw = interpolateDeliveryMessage(welcomeTemplate, {
      cliente_nome: effectiveName,
      nome: effectiveName,
      name: effectiveName,
    });
    const welcomeText = applyHumanization(welcomeTextRaw, deliveryData.config, true);
    const welcomeMessage = normalizeMenuSendMode(deliveryData.config.menu_send_mode) === 'image' && hasVisualCategories
      ? `${welcomeText}\n\nConfira as imagens do cardÃ¡pio acima e me diga o sabor ou a categoria que vocÃª quer pedir.`
      : `${welcomeText}\n\nO que vocÃª deseja ver primeiro? Escolha uma categoria:\n${categoriesList}\n\nEx.: Pizza, Esfihas, AÃ§aÃ­, Bebidas.`;
    
    return {
      intent: 'GREETING',
      bubbles: [welcomeMessage],
    };
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CASO ESPECIAL: INFO DELIVERY - Resposta do banco
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (intent === 'ASK_DELIVERY_INFO') {
    const config = deliveryData.config;
    let response = `ðŸ“‹ *InformaÃ§Ãµes de Entrega*\n\n`;
    
    if (config.accepts_delivery) {
      response += `ðŸ›µ *Entrega:* R$ ${config.delivery_fee.toFixed(2).replace('.', ',')}\n`;
      response += `â±ï¸ *Tempo estimado:* ~${config.estimated_delivery_time} minutos\n`;
    }
    if (config.accepts_pickup) {
      response += `ðŸª *Retirada no local:* GRÃTIS\n`;
    }
    if (config.min_order_value > 0) {
      response += `ðŸ“¦ *Pedido mÃ­nimo:* R$ ${config.min_order_value.toFixed(2).replace('.', ',')}\n`;
    }
    response += `\nðŸ’³ *Formas de pagamento:*\n`;
    config.payment_methods.forEach(method => {
      response += `â€¢ ${method}\n`;
    });
    
    return {
      intent: 'ASK_DELIVERY_INFO',
      bubbles: [response],
    };
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CASO ESPECIAL: PEDIDO - Processa com preÃ§os REAIS do banco
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (intent === 'WANT_TO_ORDER' || intent === 'ADD_ITEM') {
    console.log(`ðŸ• [DeliveryAI] Intent ${intent} - processando pedido com preÃ§os do banco`);
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // ðŸ†• VERIFICAR SE Ã‰ RESPOSTA DE TAMANHO PENDENTE
    // Se a Ãºltima mensagem do bot perguntou qual tamanho, buscar o item
    // mencionado nessa mensagem e completar o pedido
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const lastBotMessage = conversationHistory?.filter(m => m.fromMe).slice(-1)[0];
    if (lastBotMessage) {
      const botMsgLower = lastBotMessage.text.toLowerCase();
      const isAwaitingSize = botMsgLower.includes('qual tamanho') || 
                             botMsgLower.includes('me diz o tamanho');
      
      if (isAwaitingSize) {
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // ðŸ• CASO ESPECIAL: PIZZA MEIO A MEIO PENDENTE
        // Pattern: "*Pizza Calabresa* e *Pizza Mussarela* meio a meio"
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const isHalfHalfPending = botMsgLower.includes('meio a meio');
        if (isHalfHalfPending) {
          // Extrair os dois sabores: "*Pizza Calabresa* e *Pizza Mussarela*"
          const halfHalfMatch = lastBotMessage.text.match(/\*([^*]+)\*\s+e\s+\*([^*]+)\*/);
          if (halfHalfMatch) {
            const flavor1Name = halfHalfMatch[1].trim();
            const flavor2Name = halfHalfMatch[2].trim();
            
            console.log(`ðŸ• [DeliveryAI] Continuando MEIO A MEIO pendente: ${flavor1Name} + ${flavor2Name}`);
            
            // Buscar ambos os itens
            const item1 = findItemByNameFuzzy(deliveryData, flavor1Name);
            const item2 = findItemByNameFuzzy(deliveryData, flavor2Name);
            
            if (item1 && item2) {
              // Detectar tamanho da mensagem atual
              const sizeFromMsg = detectSizeFromMessage(message);
              
              if (sizeFromMsg) {
                const resolved1 = resolveMenuItemOptions(item1, message);
                const resolved2 = resolveMenuItemOptions(item2, message);
                const fallbackSizePrice = (menuItem: MenuItem): number | null => {
                  const sizeGroup = menuItem.options?.find(opt =>
                    opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size')
                  );
                  if (!sizeGroup || !sizeGroup.options?.length) return null;
                  const prices = sizeGroup.options.map(opt => opt.price).filter(p => typeof p === 'number');
                  if (prices.length === 0) return null;
                  const sorted = [...prices].sort((a, b) => a - b);
                  if (sizeFromMsg === 'P') return sorted[0];
                  if (sizeFromMsg === 'G') return sorted[sorted.length - 1];
                  if (sizeFromMsg === 'M') return sorted[Math.floor(sorted.length / 2)];
                  return null;
                };

                let price1 = resolved1.unitPrice;
                let price2 = resolved2.unitPrice;
                if (sizeFromMsg && price1 === item1.price) {
                  price1 = fallbackSizePrice(item1) ?? price1;
                }
                if (sizeFromMsg && price2 === item2.price) {
                  price2 = fallbackSizePrice(item2) ?? price2;
                }
                const sizeOpt1 = resolved1.optionsSelected.find(opt => /tamanho|size/i.test(opt.group));
                const sizeOpt2 = resolved2.optionsSelected.find(opt => /tamanho|size/i.test(opt.group));
                const sizeName = sizeOpt1?.option || sizeOpt2?.option || '';
                
                // PreÃ§o final: o maior dos dois
                const extractPrice = (text: string): number | null => {
                  const normalized = text.replace(/\./g, '').replace(',', '.');
                  const value = parseFloat(normalized);
                  return Number.isFinite(value) ? value : null;
                };
                const sizePriceFromPrompt = (() => {
                  const prompt = lastBotMessage.text;
                  const matchP = prompt.match(/Pequena\s*\(P\).*?R\$\s*([\d.,]+)/i);
                  const matchM = prompt.match(/M[eÃ©]dia\s*\(M\).*?R\$\s*([\d.,]+)/i);
                  const matchG = prompt.match(/Grande\s*\(G\).*?R\$\s*([\d.,]+)/i);
                  if (sizeFromMsg === 'P' && matchP) return extractPrice(matchP[1]);
                  if (sizeFromMsg === 'M' && matchM) return extractPrice(matchM[1]);
                  if (sizeFromMsg === 'G' && matchG) return extractPrice(matchG[1]);
                  return null;
                })();
                const sizePriceFromMenu = (() => {
                  for (const category of deliveryData.categories) {
                    for (const menuItem of category.items) {
                      const sizeGroup = menuItem.options?.find(opt =>
                        opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size')
                      );
                      if (!sizeGroup || !sizeGroup.options?.length) continue;
                      for (const opt of sizeGroup.options) {
                        const optNameLower = opt.name.toLowerCase();
                        if ((sizeFromMsg === 'P' && (optNameLower.includes('pequen') || optNameLower === 'p')) ||
                            (sizeFromMsg === 'M' && (optNameLower.includes('mÃ©di') || optNameLower.includes('medi') || optNameLower === 'm')) ||
                            (sizeFromMsg === 'G' && (optNameLower.includes('grand') || optNameLower === 'g'))) {
                          const rawPrice = opt.price as unknown as string | number;
                          const parsedPrice = typeof rawPrice === 'number'
                            ? rawPrice
                            : parseFloat(String(rawPrice).replace(/\./g, '').replace(',', '.'));
                          return Number.isFinite(parsedPrice) ? parsedPrice : null;
                        }
                      }
                    }
                  }
                  return null;
                })();
                const fallbackSizePriceByLetter = sizeFromMsg === 'G'
                  ? 55
                  : sizeFromMsg === 'M'
                    ? 40
                    : sizeFromMsg === 'P'
                      ? 30
                      : null;
                const { finalPrice } = resolveHalfHalfPrice({
                  deliveryData,
                  categoryContext: item1.category_name,
                  item1,
                  item2,
                  sizeCode: sizeFromMsg,
                  sizeSpecificPrice: sizePriceFromPrompt ?? sizePriceFromMenu ?? fallbackSizePriceByLetter,
                });
                const displayName = `${item1.name} + ${item2.name} (${sizeName || sizeFromMsg})`;
                
                // Adicionar ao carrinho como item Ãºnico (meio a meio)
                if (customerPhone) {
                  const halfHalfItem = {
                    ...item1,
                    name: displayName,
                    price: finalPrice,
                    id: `half-half-${item1.id}-${item2.id}`,
                  };
                  addToCart(userId, customerPhone, halfHalfItem, 1, {
                    displayName,
                    priceOverride: finalPrice,
                    notes: `Meio a meio: ${item1.name} + ${item2.name}`,
                    optionsSelected: [{ group: 'Tamanho', option: sizeName || sizeFromMsg, price: finalPrice }],
                    itemKeySuffix: `halfhalf-${sizeFromMsg}`,
                  }, effectiveConversationId);
                }
                
                const cart = customerPhone ? getCart(userId, customerPhone, effectiveConversationId) : null;
                const subtotal = cart ? getCartSubtotal(cart) : finalPrice;
                const deliveryFee = deliveryData.config.delivery_fee;
                
                // ðŸ†• FIX: Usar nome do cliente
                const hhName = getCustomerNameFromHistory(conversationHistory);
                const hhDisplayName = deliveryData.config.use_customer_name ? (hhName || '') : '';
                const hhPrefix = hhDisplayName ? `, ${hhDisplayName}` : '';
                
                let response = `âœ… Perfeito! Adicionado ao pedido${hhPrefix}:\n\n`;
                response += `â€¢ 1x ${displayName} - R$ ${finalPrice.toFixed(2).replace('.', ',')}\n`;
                
                if (cart) {
                  response += `\n${formatCartSummary(cart, deliveryData.config.delivery_fee)}`;
                } else {
                  response += `\nðŸ’° Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}`;
                  response += `\nðŸ›µ Taxa de entrega: R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
                  response += `\n\nðŸ’µ *Total: R$ ${(subtotal + deliveryFee).toFixed(2).replace('.', ',')}*`;
                }
                
                response += `\n\nDeseja mais alguma coisa? Para finalizar, me diga:\nðŸ“ Nome\nðŸ“ EndereÃ§o\nðŸ’³ Forma de pagamento`;
                
                return {
                  intent: 'ADD_ITEM',
                  bubbles: [response],
                  metadata: {
                    orderItems: [{ name: displayName, quantity: 1, price: finalPrice }],
                    subtotal,
                    deliveryFee,
                    total: subtotal + deliveryFee,
                    isHalfHalf: true,
                  },
                };
              }
            }
          }
        }
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        
        // Extrair o nome do item da mensagem anterior do bot
        // Pattern: "Boa escolha! *1x Pizza Frango Catupiry*!"
        const itemMatch = lastBotMessage.text.match(/\*(\d+)x\s+([^*]+)\*/);
        if (itemMatch) {
          const pendingQuantity = parseInt(itemMatch[1]) || 1;
          const pendingItemName = itemMatch[2].trim();
          
          console.log(`ðŸ• [DeliveryAI] Continuando pedido pendente: ${pendingQuantity}x ${pendingItemName}`);
          
          // Buscar o item no menu
          const menuItem = findItemByNameFuzzy(deliveryData, pendingItemName);
          if (menuItem) {
            // Resolver opÃ§Ãµes COM o tamanho da mensagem atual
            const resolved = resolveMenuItemOptions(menuItem, message);
            
            if (!resolved.needsSize) {
              // Tamanho foi detectado! Adicionar ao carrinho
              if (customerPhone) {
                const optionsKey = resolved.optionsSelected
                  .map(opt => `${normalizeTextForMatch(opt.group)}:${normalizeTextForMatch(opt.option)}`)
                  .join('|');
                addToCart(userId, customerPhone, menuItem, pendingQuantity, {
                  displayName: resolved.displayName,
                  priceOverride: resolved.unitPrice,
                  notes: resolved.notes,
                  optionsSelected: resolved.optionsSelected,
                  itemKeySuffix: optionsKey || undefined,
                }, effectiveConversationId);
              }
              
              const itemTotal = resolved.unitPrice * pendingQuantity;
              const cart = customerPhone ? getCart(userId, customerPhone, effectiveConversationId) : null;
              const subtotal = cart ? getCartSubtotal(cart) : itemTotal;
              const deliveryFee = deliveryData.config.delivery_fee;
              
              // ðŸ†• FIX: Usar nome do cliente
              const pendName = getCustomerNameFromHistory(conversationHistory);
              const pendDisplayName = deliveryData.config.use_customer_name ? (pendName || '') : '';
              const pendPrefix = pendDisplayName ? `, ${pendDisplayName}` : '';
              
              let response = `âœ… Perfeito! Adicionado ao pedido${pendPrefix}:\n\n`;
              response += `â€¢ ${pendingQuantity}x ${resolved.displayName} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;
              
              if (cart) {
                response += `\n${formatCartSummary(cart, deliveryData.config.delivery_fee)}`;
              } else {
                response += `\nðŸ’° Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}`;
                response += `\nðŸ›µ Taxa de entrega: R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
                response += `\n\nðŸ’µ *Total: R$ ${(subtotal + deliveryFee).toFixed(2).replace('.', ',')}*`;
              }
              
              const deliveryOptions = [];
              if (deliveryData.config.accepts_delivery) deliveryOptions.push('ðŸ›µ Delivery');
              if (deliveryData.config.accepts_pickup) deliveryOptions.push('ðŸª Retirada');
              const deliveryTypeLine = deliveryOptions.length > 0
                ? `ðŸšš Tipo de entrega: ${deliveryOptions.join(' ou ')}`
                : 'ðŸšš Tipo de entrega';
              
              response += buildPostAddFollowUp(deliveryData, customerPhone ? getCart(userId, customerPhone, effectiveConversationId) : null);
              
              return {
                intent: 'ADD_ITEM',
                bubbles: [response],
                metadata: {
                  orderItems: [{ name: resolved.displayName, quantity: pendingQuantity, price: resolved.unitPrice }],
                  subtotal,
                  deliveryFee,
                  total: subtotal + deliveryFee,
                },
              };
            }
          }
        }
      }
    }
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    
    // ðŸ§  DETECTAR CONTEXTO: Qual categoria o cliente estava vendo?
    let categoryContext = detectCategoryContext(conversationHistory, deliveryData);
    
    const categoryMap: Record<string, string> = {
      pizza: 'Pizza',
      esfirra: 'Esfiha',
      bebida: 'Bebida',
      'aÃ§aÃ­': 'AÃ§aÃ­',
      borda: 'Borda',
    };

    const messageCategoryKey = detectCategoryFromMessage(message);
    if (messageCategoryKey) {
      categoryContext = categoryMap[messageCategoryKey] || categoryContext;
    }
    
    if (!categoryContext) {
      const msgLower = message.toLowerCase();
      if (msgLower.includes('pizza')) {
        categoryContext = 'Pizza';
      } else if (msgLower.includes('esfiha') || msgLower.includes('esfirra')) {
        categoryContext = 'Esfiha';
      } else if (msgLower.includes('bebida') || msgLower.includes('refrigerante') || msgLower.includes('refri')) {
        categoryContext = 'Bebida';
      } else if (msgLower.includes('borda')) {
        categoryContext = 'Borda';
      }
    }
    
    // Parse os itens da mensagem e processa com preÃ§os reais
    const parsedItems = parseOrderItems(message);
    
    if (parsedItems.length === 0) {
      return {
        intent,
        bubbles: ['O que vocÃª gostaria de pedir? Pode me dizer o nome do item e a quantidade! ðŸ˜Š'],
      };
    }
    
    const addedItems: Array<{ name: string; quantity: number; price: number; total: number }> = [];
    const notFoundItems: string[] = [];
    const itemsNeedingSize: Array<{ name: string; quantity: number; options: Array<{ name: string; price: number }> }> = [];
    
    for (const parsed of parsedItems) {
      const itemCategoryKey = detectCategoryFromMessage(parsed.name);
      const itemCategoryContext = itemCategoryKey
        ? (categoryMap[itemCategoryKey] || categoryContext)
        : categoryContext;
      const menuItem = findItemByNameFuzzy(deliveryData, parsed.name, itemCategoryContext);
      
      if (menuItem) {
        const resolved = resolveMenuItemOptions(menuItem, message);
        if (resolved.needsSize) {
          itemsNeedingSize.push({
            name: menuItem.name,
            quantity: parsed.quantity,
            options: resolved.sizeOptions || [],
          });
          continue;
        }
        if (customerPhone) {
          const optionsKey = resolved.optionsSelected
            .map(opt => `${normalizeTextForMatch(opt.group)}:${normalizeTextForMatch(opt.option)}`)
            .join('|');
          addToCart(userId, customerPhone, menuItem, parsed.quantity, {
            displayName: resolved.displayName,
            priceOverride: resolved.unitPrice,
            notes: resolved.notes,
            optionsSelected: resolved.optionsSelected,
            itemKeySuffix: optionsKey || undefined,
          }, effectiveConversationId);
        }
        addedItems.push({
          name: resolved.displayName,
          quantity: parsed.quantity,
          price: resolved.unitPrice,
          total: resolved.unitPrice * parsed.quantity,
        });
      } else {
        notFoundItems.push(parsed.name);
      }
    }
    
    if (itemsNeedingSize.length > 0) {
      const item = itemsNeedingSize[0];
      const sizesText = item.options.map((opt: any) => 
        `â€¢ *${opt.name}* - R$ ${opt.price.toFixed(2).replace('.', ',')}`
      ).join('\n');
      
      return {
        intent: 'WANT_TO_ORDER',
        bubbles: [
          `ðŸ• Boa escolha! *${item.quantity}x ${item.name}*!\n\nðŸ“ *Qual tamanho vocÃª quer?*\n\n${sizesText}\n\nMe diz o tamanho! ðŸ˜Š`
        ],
        metadata: {
          awaitingSize: true,
          pendingItem: {
            name: item.name,
            quantity: item.quantity
          }
        },
      };
    }
    
    if (addedItems.length === 0) {
      return {
        intent,
        bubbles: [`Hmm, nÃ£o encontrei "${parsedItems[0]?.name || ''}" no cardÃ¡pio ðŸ¤” Quer ver as opÃ§Ãµes?`],
      };
    }
    
    const cart = customerPhone ? getCart(userId, customerPhone, effectiveConversationId) : null;
    const subtotal = cart ? getCartSubtotal(cart) : addedItems.reduce((sum, item) => sum + item.total, 0);
    const deliveryFee = deliveryData.config.delivery_fee;
    const total = subtotal + deliveryFee;
    
    // ðŸ†• FIX: Usar nome do cliente na resposta
    const customerNameFromHistory = getCustomerNameFromHistory(conversationHistory);
    const customerDisplayName = deliveryData.config.use_customer_name
      ? (customerNameFromHistory || '')
      : '';
    const namePrefix = customerDisplayName ? `, ${customerDisplayName}` : '';
    
    let response = `âœ… Adicionado ao pedido${namePrefix}:\n\n`;
    for (const item of addedItems) {
      response += `â€¢ ${item.quantity}x ${item.name} - R$ ${item.total.toFixed(2).replace('.', ',')}\n`;
    }
    
    if (notFoundItems.length > 0) {
      response += `\nâš ï¸ NÃ£o encontrei: ${notFoundItems.join(', ')}\n`;
    }
    
    if (cart) {
      response += `\n${formatCartSummary(cart, deliveryData.config.delivery_fee)}`;
    } else {
      response += `\nðŸ’° Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}`;
      response += `\nðŸ›µ Taxa de entrega: R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
      response += `\n\nðŸ’µ *Total: R$ ${total.toFixed(2).replace('.', ',')}*`;
    }
    
    const deliveryOptions = [];
    if (deliveryData.config.accepts_delivery) deliveryOptions.push('ðŸ›µ Delivery');
    if (deliveryData.config.accepts_pickup) deliveryOptions.push('ðŸª Retirada');
    const deliveryTypeLine = deliveryOptions.length > 0
      ? `ðŸšš Tipo de entrega: ${deliveryOptions.join(' ou ')}`
      : 'ðŸšš Tipo de entrega';
    
    response += buildPostAddFollowUp(deliveryData, customerPhone ? getCart(userId, customerPhone, effectiveConversationId) : null);
    
    return {
      intent,
      bubbles: [response],
      metadata: {
        orderItems: addedItems,
        subtotal,
        deliveryFee,
        total
      }
    };
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CASO ESPECIAL: CONFIRMAÃ‡ÃƒO FINAL DO PEDIDO (sim apÃ³s ver o resumo)
  // Este check DEVE vir ANTES do handler de CONFIRM_ORDER
  // Quando o cliente responde "sim" apÃ³s ver o resumo completo com "Confirma o pedido?"
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const confirmationCart = customerPhone ? getExistingCart(userId, customerPhone, effectiveConversationId) : null;
  const confirmationSourceCart = confirmationCart || currentCart;
  const hasPendingFinalConfirmation =
    confirmationSourceCart?.checkoutState?.phase === 'awaiting_confirmation' ||
    !!confirmationSourceCart?.awaitingConfirmation;
  const hasVisibleFinalSummary = conversationShowsFinalOrderSummary(conversationContext, conversationHistory);
  const isSimpleOrderConfirmation = isSimplePositiveConfirmationMessage(message);
  const plannerRequestedFinalConfirmation =
    intent === 'CONFIRM_ORDER' &&
    (hasPendingFinalConfirmation || hasVisibleFinalSummary) &&
    /\b(confirm|confirma|confirmar|pedido)\b/i.test(message);
  const isConfirmingFinalOrder = (isSimpleOrderConfirmation || plannerRequestedFinalConfirmation) && (
    hasPendingFinalConfirmation ||
    hasVisibleFinalSummary
  );
  
  if (isConfirmingFinalOrder) {
    console.log(`âœ… [DeliveryAI] Cliente CONFIRMOU o pedido FINAL - criando no banco`);
    
    // Extrair dados do RESUMO que estava no contexto
    // O resumo contÃ©m linhas como "ðŸ‘¤ *Nome:* Carlos Eduardo"
    const ctx = conversationContext || '';
    const info: CustomerInfo = getCartStoredCustomerInfo(confirmationSourceCart);
    
    // Extrair Nome do resumo
    const nameMatch = ctx.match(/\*Nome:\*\s*([^\n]+)/i);
    if (nameMatch) {
      info.customerName = nameMatch[1].trim();
      console.log(`ðŸ“ [DeliveryAI] Nome extraÃ­do do resumo: "${info.customerName}"`);
    }
    
    // Extrair EndereÃ§o do resumo
    const addressMatch = ctx.match(/\*EndereÃ§o:\*\s*([^\n]+)/i);
    if (addressMatch) {
      info.customerAddress = addressMatch[1].trim();
      console.log(`ðŸ“ [DeliveryAI] EndereÃ§o extraÃ­do do resumo: "${info.customerAddress}"`);
    }
    
    // Extrair Pagamento do resumo
    const paymentMatch = ctx.match(/\*Pagamento:\*\s*([^\n]+)/i);
    if (paymentMatch) {
      info.paymentMethod = paymentMatch[1].trim();
      console.log(`ðŸ“ [DeliveryAI] Pagamento extraÃ­do do resumo: "${info.paymentMethod}"`);
    }

    const changeForMatch = ctx.match(/\*Troco para:\*\s*R\$\s*([0-9.,]+)/i);
    if (changeForMatch) {
      info.changeNeeded = true;
      info.changeForAmount = parseOptionalNumber(changeForMatch[1]);
    } else if (ctx.match(/\*Troco:\*\s*N[ÃA]o precisa/i)) {
      info.changeNeeded = false;
      info.changeForAmount = null;
    }
    
    // Extrair Tipo de entrega do resumo
    if (ctx.toLowerCase().includes('*tipo:* delivery')) {
      info.deliveryType = 'delivery';
    } else if (ctx.toLowerCase().includes('*tipo:* retirada') || ctx.toLowerCase().includes('retirada no local')) {
      info.deliveryType = 'pickup';
    }
    
    console.log(`ðŸ“ [DeliveryAI] Info extraÃ­da do resumo:`, info);
    
    try {
      if (!customerPhone) {
        return {
          intent: 'PROVIDE_CUSTOMER_INFO',
          bubbles: [
            `âŒ NÃ£o consegui identificar seu telefone para finalizar o pedido. Pode me informar novamente?`
          ],
          metadata: { error: true, errorMessage: 'missing_customer_phone' },
        };
      }
      const deliveryType = info.deliveryType || (deliveryData.config.accepts_delivery ? 'delivery' : 'pickup');
      const deliveryFeeOverride = typeof info.deliveryFee === 'number'
        ? info.deliveryFee
        : (deliveryType === 'delivery' ? deliveryData.config.delivery_fee : 0);
      const deliveryFeeInfo: DeliveryFeeCalculation | null = deliveryType === 'delivery'
        ? {
            fee: deliveryFeeOverride,
            distanceKm: info.deliveryDistanceKm ?? null,
            mode: info.deliveryFeeMode || 'fixed',
            label: info.deliveryFeeMode === 'distance'
              ? 'Taxa por distância'
              : info.deliveryFeeMode === 'fallback'
                ? 'Taxa estimada'
                : 'Taxa fixa',
          }
        : null;
      const orderResult = await confirmAndCreateOrder(
        userId,
        customerPhone,
        info.customerName || 'Cliente',
        deliveryType,
        info.paymentMethod || 'Dinheiro',
        info.customerAddress || null,
        deliveryData,
        effectiveConversationId,
        {
          deliveryFeeOverride,
          customerReference: info.customerReference || null,
          notes: buildDeliveryOrderNotes(info, deliveryFeeInfo),
        }
      );

      if (!orderResult.success || !orderResult.orderId) {
        return {
          intent: 'PROVIDE_CUSTOMER_INFO',
          bubbles: [
            `âŒ Ops! NÃ£o consegui confirmar seu pedido. ${orderResult.error || 'Tente novamente.'}`
          ],
          metadata: {
            error: true,
            errorMessage: orderResult.error,
          },
        };
      }
      const historyName = getCustomerNameFromHistory(conversationHistory);
      const effectiveName = deliveryData.config.use_customer_name
        ? (info.customerName || historyName || 'Cliente')
        : 'Cliente';
      const confirmationTemplate = deliveryData.config.order_confirmation_message || '';
      const confirmationIntroRaw = confirmationTemplate
        ? interpolateDeliveryMessage(confirmationTemplate, {
            cliente_nome: effectiveName,
            nome: effectiveName,
            name: effectiveName,
            pedido_numero: String(orderResult.orderId),
            total: orderResult.total ? `R$ ${orderResult.total.toFixed(2).replace('.', ',')}` : '',
            tempo_estimado: `${deliveryData.config.estimated_delivery_time} minutos`,
          })
        : '';
      const confirmationIntro = confirmationIntroRaw
        ? applyHumanization(confirmationIntroRaw, deliveryData.config, true)
        : '';
      const pixConfirmationLines = isPixPayment(info.paymentMethod) ? buildPixSummaryLines(deliveryData.config) : [];
      const changeConfirmationLine = isCashPayment(info.paymentMethod)
        ? (info.changeNeeded === false
            ? `ðŸ’µ *Troco:* Não precisa\n`
            : info.changeNeeded === true && info.changeForAmount
              ? `ðŸ’µ *Troco para:* ${formatCurrency(info.changeForAmount)}\n`
              : '')
        : '';
      const pixConfirmationBlock = pixConfirmationLines.length > 0
        ? `\nðŸ§¾ *Pix:*\n${pixConfirmationLines.map(line => `â€¢ ${line}`).join('\n')}\n`
        : '';
      const referenceConfirmationLine = deliveryType === 'delivery' && info.customerReference
        ? `📌 *Referência:* ${info.customerReference}\n`
        : '';
      const summaryMessage = `âœ… *Pedido confirmado com sucesso!*\n\nðŸŽ« *NÃºmero do pedido:* #${orderResult.orderId}\n\nðŸ“ *Nome:* ${info.customerName || effectiveName}\n${deliveryType === 'delivery' ? `ðŸ“ *EndereÃ§o:* ${info.customerAddress}\n${referenceConfirmationLine}` : 'ðŸƒ *Retirada no local*\n'}ðŸ’³ *Pagamento:* ${getPaymentMethodLabel(info.paymentMethod)}\n${changeConfirmationLine}${pixConfirmationBlock}\nâ±ï¸ *PrevisÃ£o:* ${deliveryData.config.estimated_delivery_time} minutos\n\nðŸ• Seu pedido jÃ¡ foi enviado para a cozinha! Obrigado pela preferÃªncia! ðŸ˜Š`;
      const finalMessage = confirmationIntro
        ? `${confirmationIntro}\n\n${summaryMessage}`
        : summaryMessage;

      return {
        intent: 'FINALIZE_ORDER',
        bubbles: [
          finalMessage
        ],
        metadata: {
          orderCreated: true,
          orderId: orderResult.orderId,
          customerInfo: info,
        },
      };
    } catch (error) {
      console.error(`âŒ [DeliveryAI] Erro ao criar pedido:`, error);
      return {
        intent: 'PROVIDE_CUSTOMER_INFO',
        bubbles: [
          `âŒ Ops! Tive um problema ao criar seu pedido. Por favor, tente novamente ou entre em contato com o atendente.`
        ],
        metadata: {
          error: true,
          errorMessage: String(error),
        },
      };
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CASO ESPECIAL: NEGAÃ‡ÃƒO DA CONFIRMAÃ‡ÃƒO FINAL
  // Quando o cliente responde "nÃ£o" apÃ³s ver o resumo
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const isDenyingFinalOrder = (
    hasPendingFinalConfirmation ||
    hasVisibleFinalSummary
  ) &&
    (
      isSimpleNegativeConfirmationMessage(message) ||
      (intent === 'CANCEL_ORDER' && /\b(cancel|cancelar|nao|não)\b/i.test(message))
    );
  
  if (isDenyingFinalOrder) {
    resetCartCheckoutState(confirmationSourceCart);
    return {
      intent: 'CANCEL_ORDER',
      bubbles: [
        `âŒ Pedido cancelado!\n\nSe quiser alterar alguma informaÃ§Ã£o ou fazer um novo pedido, Ã© sÃ³ me avisar! ðŸ˜Š`
      ],
      metadata: {
        cancelled: true,
        reason: 'user_declined',
      },
    };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CASO ESPECIAL: CONFIRMAÃ‡ÃƒO DE PEDIDO (inÃ­cio - sem resumo ainda)
  // Cliente confirmou o pedido (sim, ok, confirmo, pode mandar, etc)
  // Agora precisa coletar: NOME, TIPO (delivery/retirada), ENDEREÃ‡O, PAGAMENTO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (intent === 'CONFIRM_ORDER') {
    console.log(`âœ… [DeliveryAI] Intent CONFIRM_ORDER - pedindo dados do cliente`);
    if (currentCart) {
      currentCart.savedProfile = savedCustomerProfile;
      currentCart.awaitingAddressReuse = !!savedCustomerProfile?.customerAddress;
      const prefetchedInfo = mergeCustomerInfo(getCartStoredCustomerInfo(currentCart), {
        customerName: savedCustomerProfile?.customerName || undefined,
        paymentMethod: savedCustomerProfile?.paymentMethod || undefined,
      });
      updateCartCheckoutState(currentCart, 'collecting_info', prefetchedInfo);
    }
    
    const deliveryOptions = [];
    if (deliveryData.config.accepts_delivery) deliveryOptions.push('ðŸ›µ Delivery');
    if (deliveryData.config.accepts_pickup) deliveryOptions.push('ðŸƒ Retirada no local');
    const acceptsCash = normalizePaymentMethods(deliveryData.config.payment_methods).includes('dinheiro');
    const paymentPrompt = buildPaymentMethodsText(deliveryData.config);
    const extraCashPrompt = acceptsCash && getCashConfig(deliveryData.config).askForChange
      ? `\n\nðŸ’µ *Troco:* se for dinheiro, diga se precisa de troco e para quanto`
      : '';
    const savedProfilePrompt = getSavedProfilePrompt(savedCustomerProfile, false);
    const canSkipName = !!savedCustomerProfile?.customerName;
    const savedNameLine = canSkipName
      ? `👤 *Nome salvo:* ${savedCustomerProfile?.customerName}\n\n`
      : 'ðŸ“ *Seu nome*\n\n';
    
    return {
      intent: 'CONFIRM_ORDER',
      bubbles: [
        `âœ… Ã“timo! Para finalizar seu pedido, preciso confirmar alguns dados:\n\n${savedNameLine}ðŸšš *Tipo de entrega:* ${deliveryOptions.join(' ou ')}\n\n${deliveryData.config.accepts_delivery ? 'ðŸ“ *EndereÃ§o* (se for delivery): rua, nÃºmero, bairro e ponto de referÃªncia\n\n' : ''}ðŸ’³ *Forma de pagamento:* ${paymentPrompt}${extraCashPrompt}${savedProfilePrompt ? `\n\n${savedProfilePrompt}` : ''}\n\nPode me enviar tudo junto ou separado! ðŸ˜Š`
      ],
      metadata: {
        awaitingCustomerInfo: true,
      },
    };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CASO ESPECIAL: INFORMAÃ‡Ã•ES DO CLIENTE
  // Cliente forneceu nome, endereÃ§o, tipo de entrega e/ou forma de pagamento
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (intent === 'PROVIDE_CUSTOMER_INFO' || (conversationContext && conversationContext.toLowerCase().includes('seu nome') && conversationContext.toLowerCase().includes('forma de pagamento'))) {
    console.log(`ðŸ“ [DeliveryAI] Cliente fornecendo dados - extraindo informaÃ§Ãµes`);
    
    // IMPORTANTE: Recuperar informaÃ§Ãµes parciais jÃ¡ coletadas anteriormente
    // Isso permite coletar dados em mÃºltiplas mensagens
    const existingCart = customerPhone ? getExistingCart(userId, customerPhone, effectiveConversationId) : null;
    let existingInfo: CustomerInfo = getCartStoredCustomerInfo(existingCart);
    const savedProfileForCart = existingCart?.savedProfile || savedCustomerProfile;
    existingInfo = mergeCustomerInfo({
      customerName: savedProfileForCart?.customerName || undefined,
      paymentMethod: savedProfileForCart?.paymentMethod || undefined,
    }, existingInfo);
    
    // Tentar extrair info existente do contexto da conversa anterior
    // Procurar por padrÃµes no contexto que indicam dados jÃ¡ coletados
    if (conversationContext) {
      const lines = conversationContext.split('\n');
      
      // Capturar delivery type e pagamento APENAS a partir de mensagens do cliente
      for (const line of lines) {
        const lower = line.toLowerCase().trim();
        if (lower.startsWith('cliente:') || lower.startsWith('client:') || lower.startsWith('customer:')) {
          const content = line.substring(line.indexOf(':') + 1).trim();
          const contentLower = content.toLowerCase();
          
          if (!existingInfo.deliveryType) {
            if (/\b(retirada|retirar|retiro|buscar|busco|pegar|pego|no local|balc[aÃ£]o)\b/i.test(contentLower)) {
              existingInfo.deliveryType = 'pickup';
            } else if (/\b(delivery|entrega|mandar|enviar|levar)\b/i.test(contentLower)) {
              existingInfo.deliveryType = 'delivery';
            }
          }
          
          if (!existingInfo.paymentMethod) {
            const parsedContextPaymentMethod = parsePaymentMethod(content);
            if (parsedContextPaymentMethod) {
              existingInfo.paymentMethod = parsedContextPaymentMethod;
            }
          }
        }
      }
      
      // IMPORTANTE: Buscar endereÃ§o no contexto (mensagens anteriores do cliente)
      // Dividir contexto em linhas e procurar mensagens do cliente que parecem endereÃ§o
      console.log(`ðŸ“ [DeliveryAI] Buscando endereÃ§o no contexto...`);
      for (const line of lines) {
        const lower = line.toLowerCase().trim();
        // SÃ³ considerar mensagens do cliente
        if (lower.startsWith('cliente:')) {
          const content = line.substring(line.indexOf(':') + 1).trim();
          const contentLower = content.toLowerCase();
          
          // Verificar se parece endereÃ§o (tem palavra de logradouro OU padrÃ£o texto,nÃºmero)
          const isAddress = (
            /\b(rua|av|avenida|alameda|travessa|estrada|praÃ§a|praca)\b/i.test(contentLower) ||
            /[a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§\s]+,\s*\d+/i.test(contentLower)
          );
          
          // SÃ³ verificar se NÃƒO Ã© nome ou greeting (pagamento pode vir junto com endereÃ§o!)
          const hasNumber = /\d/.test(content);
          const notName = !/\b(meu nome|me chamo|sou o|sou a)\b/i.test(contentLower);
          const notGreeting = !/\b(oi|olÃ¡|bom dia|boa tarde|boa noite|quero|gostaria)\b/i.test(contentLower);
          const minLength = content.length >= 8;
          
          if (isAddress && hasNumber && notName && notGreeting && minLength) {
            // Extrair apenas a parte do endereÃ§o (remover pagamento/entrega)
            let addressPart = content
              .replace(/\b(pix|dinheiro|cart[aÃ£]o|credito|d[eÃ©]bito)\b/gi, '')
              .replace(/\b(entrega|delivery|retirada|retirar)\b/gi, '')
              .trim()
              .replace(/^[\s,]+|[\s,]+$/g, ''); // Remove espaÃ§os e vÃ­rgulas nas pontas
            
            if (addressPart.length >= 5) {
              existingInfo.customerAddress = addressPart;
              console.log(`ðŸ“ [DeliveryAI] âœ… EndereÃ§o recuperado do contexto: "${addressPart}"`);
              break;
            }
          }
        }
      }
      
      // Buscar nome no contexto se a IA jÃ¡ perguntou
      // Procurar mensagens do cliente que vÃªm DEPOIS de perguntas de nome
      let foundNameQuestion = false;
      for (const line of lines) {
        const lower = line.toLowerCase().trim();
        
        // Marcar quando encontramos pergunta de nome
        if (lower.startsWith('vocÃª:') && (lower.includes('nome') || lower.includes('qual seu'))) {
          foundNameQuestion = true;
          continue;
        }
        
        // Se jÃ¡ encontrou a pergunta do nome, procurar resposta do cliente
        if (foundNameQuestion && lower.startsWith('cliente:')) {
          const content = line.substring(line.indexOf(':') + 1).trim();
          const contentLower = content.toLowerCase();
          
          // Verificar se parece nome (sem nÃºmeros, sem palavras de endereÃ§o/pagamento)
          const notAddress = !/\b(rua|av|avenida|alameda|travessa|estrada|praÃ§a|bairro)\b/i.test(contentLower);
          const notPayment = !/\b(pix|dinheiro|cartao|cartÃ£o)\b/i.test(contentLower);
          const noNumber = !/\d/.test(content);
          const isName = /^[a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±\s]{2,50}$/i.test(content);
          
          if (notAddress && notPayment && noNumber && isName) {
            existingInfo.customerName = content;
            console.log(`ðŸ“ [DeliveryAI] âœ… Nome recuperado do contexto: "${content}"`);
            break;
          }
          // Resetar apÃ³s encontrar resposta do cliente (pode ter outra pergunta de nome depois)
          foundNameQuestion = false;
        }
      }
    }
    
    // Extrair informaÃ§Ãµes da mensagem atual, combinando com existentes
    const info = extractCustomerInfo(message, conversationContext || '', existingInfo);
    let mergedInfo = mergeCustomerInfo(existingInfo, info);
    const normalizedCurrentMessage = normalizeTextForMatch(message);

    if (existingCart && savedProfileForCart?.customerAddress) {
      if (existingCart.awaitingAddressReuse && !info.customerAddress) {
        if (isAffirmativeShortReply(message)) {
          mergedInfo = mergeCustomerInfo(mergedInfo, {
            customerAddress: savedProfileForCart.customerAddress || undefined,
            customerReference: savedProfileForCart.customerReference || undefined,
          });
          existingCart.awaitingAddressReuse = false;
          console.log(`📍 [DeliveryAI] Cliente confirmou reuso do último endereço`);
        } else if (isNegativeShortReply(message)) {
          existingCart.awaitingAddressReuse = false;
          mergedInfo.customerAddress = undefined;
          mergedInfo.customerReference = undefined;
          console.log(`📍 [DeliveryAI] Cliente recusou reuso do último endereço`);
        }
      }

      if (info.customerAddress) {
        existingCart.awaitingAddressReuse = false;
      }
    }

    if (existingCart) {
      existingCart.savedProfile = savedProfileForCart;
      updateCartCheckoutState(existingCart, 'collecting_info', mergedInfo);
    }
    
    // Verificar se tem todas as informaÃ§Ãµes mÃ­nimas
    const hasName = mergedInfo.customerName && mergedInfo.customerName.length > 2;
    const paymentMethods = normalizePaymentMethods(deliveryData.config.payment_methods);
    const hasPayment = mergedInfo.paymentMethod && paymentMethods.some(pm => 
      pm.includes(normalizeTextForMatch(mergedInfo.paymentMethod!)) || 
      normalizeTextForMatch(mergedInfo.paymentMethod!).includes(pm)
    );
    const hasDeliveryType = mergedInfo.deliveryType !== undefined;
    const cashConfig = getCashConfig(deliveryData.config);
    
    // CORREÃ‡ÃƒO: SÃ³ precisa de endereÃ§o se for DELIVERY
    let needsAddress = false;
    if (mergedInfo.deliveryType === 'delivery') {
      needsAddress = true;
    } else if (mergedInfo.deliveryType === 'pickup') {
      needsAddress = false;
    } else if (!hasDeliveryType) {
      // Se o tipo nÃ£o foi definido, sÃ³ precisa de endereÃ§o se aceitar delivery
      // e NÃƒO aceitar pickup (ou seja, delivery Ã© a Ãºnica opÃ§Ã£o)
      needsAddress = deliveryData.config.accepts_delivery && !deliveryData.config.accepts_pickup;
    }
    
    const hasAddress = mergedInfo.customerAddress && mergedInfo.customerAddress.length > 5;
    const requiresChangeDecision = !!(hasPayment && isCashPayment(mergedInfo.paymentMethod) && cashConfig.askForChange);
    const hasChangeDecision = !requiresChangeDecision || mergedInfo.changeNeeded !== undefined;
    const hasChangeAmount = !requiresChangeDecision ||
      mergedInfo.changeNeeded === false ||
      (mergedInfo.changeNeeded === true &&
        mergedInfo.changeForAmount !== null &&
        mergedInfo.changeForAmount !== undefined &&
        mergedInfo.changeForAmount > 0);
    
    console.log(`ðŸ“ [DeliveryAI] Dados extraÃ­dos:`, {
      hasName,
      hasPayment,
      hasDeliveryType,
      needsAddress,
      hasAddress,
      requiresChangeDecision,
      hasChangeDecision,
      hasChangeAmount,
      info: mergedInfo
    });
    
    // Se falta alguma informaÃ§Ã£o, perguntar ESPECIFICAMENTE o que falta
    const missing: string[] = [];
    const missingFields: string[] = [];
    
    if (!hasName) {
      missing.push('ðŸ“ *Seu nome*');
      missingFields.push('name');
    }
    if (!hasDeliveryType) {
      const options = [];
      if (deliveryData.config.accepts_delivery) options.push('ðŸ›µ Delivery');
      if (deliveryData.config.accepts_pickup) options.push('ðŸƒ Retirada');
      missing.push(`ðŸšš *Tipo de entrega:* ${options.join(' ou ')}`);
      missingFields.push('deliveryType');
    }
    if (needsAddress && !hasAddress) {
      if (savedProfileForCart?.customerAddress && existingCart?.awaitingAddressReuse) {
        const savedReference = savedProfileForCart.customerReference
          ? `\n📌 *Referência salva:* ${savedProfileForCart.customerReference}`
          : '';
        missing.push(`ðŸ“ *Último endereço salvo:* ${savedProfileForCart.customerAddress}${savedReference}\nResponda "sim" para usar o mesmo ou mande um novo endereço completo.`);
      } else {
        missing.push('ðŸ“ *EndereÃ§o completo* (rua, nÃºmero, bairro e ponto de referÃªncia)');
      }
      missingFields.push('address');
    }
    if (!hasPayment) {
      missing.push(`ðŸ’³ *Forma de pagamento:* ${buildPaymentMethodsText(deliveryData.config)}`);
      missingFields.push('payment');
    }
    if (!hasChangeDecision) {
      missing.push(`ðŸ’µ *Precisa de troco?* (responda "sim", "nÃ£o" ou "troco para 50")`);
      missingFields.push('change');
    } else if (!hasChangeAmount) {
      missing.push(`ðŸ’µ *Troco para quanto?* Ex.: troco para 50`);
      missingFields.push('change_amount');
    }
    
    if (missing.length > 0) {
      // Mensagem mais amigÃ¡vel dependendo do que falta
      let responseMsg = '';
      
      if (missing.length === 1) {
        // SÃ³ falta 1 campo - perguntar diretamente
        if (missingFields[0] === 'name') {
          responseMsg = `ðŸ“ Qual seu *nome*?`;
        } else if (missingFields[0] === 'deliveryType') {
          const options = [];
          if (deliveryData.config.accepts_delivery) options.push('ðŸ›µ Delivery');
          if (deliveryData.config.accepts_pickup) options.push('ðŸƒ Retirada no local');
          responseMsg = `ðŸšš VocÃª prefere *${options.join(' ou ')}*?`;
        } else if (missingFields[0] === 'address') {
          if (savedProfileForCart?.customerAddress && existingCart?.awaitingAddressReuse) {
            const savedReference = savedProfileForCart.customerReference
              ? `\n📌 ReferÃªncia salva: ${savedProfileForCart.customerReference}`
              : '';
            responseMsg = `ðŸ“ Posso usar seu *Ãºltimo endereÃ§o*?\n${savedProfileForCart.customerAddress}${savedReference}\n\nResponda "sim" para usar o mesmo ou mande um novo endereÃ§o completo.`;
          } else {
            responseMsg = `ðŸ“ Qual seu *endereÃ§o completo*? (rua, nÃºmero, bairro e ponto de referÃªncia)`;
          }
        } else if (missingFields[0] === 'payment') {
          responseMsg = `ðŸ’³ Qual a *forma de pagamento*? (${buildPaymentMethodsText(deliveryData.config)})`;
        } else if (missingFields[0] === 'change') {
          responseMsg = `ðŸ’µ VocÃª precisa de *troco*? Pode responder "sim", "nÃ£o" ou "troco para 50".`;
        } else if (missingFields[0] === 'change_amount') {
          responseMsg = `ðŸ’µ Perfeito! *Troco para quanto* eu devo anotar? Ex.: troco para 50`;
        }
      } else {
        // Faltam mÃºltiplos campos
        responseMsg = `Quase lÃ¡! SÃ³ preciso de mais algumas informaÃ§Ãµes:\n\n${missing.join('\n\n')}\n\nPode me enviar! ðŸ˜Š`;
      }
      
      return {
        intent: 'PROVIDE_CUSTOMER_INFO',
        bubbles: [responseMsg],
        metadata: {
          partialInfo: mergedInfo,
          missingFields: missingFields,
          awaitingInfo: true,
        },
      };
    }
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // TODAS AS INFORMAÃ‡Ã•ES COLETADAS - MOSTRAR RESUMO E PEDIR CONFIRMAÃ‡ÃƒO
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    console.log(`âœ… [DeliveryAI] Todas informaÃ§Ãµes coletadas - mostrando resumo para confirmaÃ§Ã£o`);
    
    const cart = customerPhone ? getExistingCart(userId, customerPhone, effectiveConversationId) : null;
    if (!cart || cart.items.size === 0) {
      return {
        intent: 'WANT_TO_ORDER',
        bubbles: [
          `ðŸ›’ Seu pedido estÃ¡ vazio. Me diga o que vocÃª gostaria de pedir!`
        ],
      };
    }

    const subtotal = getCartSubtotal(cart);
    const deliveryFeeInfo = mergedInfo.deliveryType === 'delivery'
      ? await estimateDeliveryFee(deliveryData.config, mergedInfo.customerAddress)
      : {
          fee: 0,
          distanceKm: null,
          mode: 'fixed' as const,
          label: 'Retirada no local',
        };
    const deliveryFee = mergedInfo.deliveryType === 'delivery' ? deliveryFeeInfo.fee : 0;
    const total = subtotal + deliveryFee;
    const infoForConfirmation = mergeCustomerInfo(mergedInfo, {
      deliveryFee,
      deliveryDistanceKm: deliveryFeeInfo.distanceKm,
      deliveryFeeMode: deliveryFeeInfo.mode,
    });
    updateCartCheckoutState(cart, 'awaiting_confirmation', infoForConfirmation);
    
    // Montar resumo do pedido
    let resumo = `ðŸ“‹ *RESUMO DO SEU PEDIDO:*\n\n`;
    resumo += `ðŸ‘¤ *Nome:* ${mergedInfo.customerName}\n`;
    if (mergedInfo.deliveryType === 'delivery') {
      resumo += `ðŸ“ *EndereÃ§o:* ${mergedInfo.customerAddress}\n`;
      if (mergedInfo.customerReference) {
        resumo += `📌 *Referência:* ${mergedInfo.customerReference}\n`;
      }
      resumo += `ðŸ›µ *Tipo:* Delivery\n`;
    } else {
      resumo += `ðŸƒ *Tipo:* Retirada no local\n`;
    }
    resumo += `ðŸ’³ *Pagamento:* ${getPaymentMethodLabel(mergedInfo.paymentMethod)}\n`;
    if (isCashPayment(mergedInfo.paymentMethod)) {
      if (mergedInfo.changeNeeded === false) {
        resumo += `ðŸ’µ *Troco:* NÃ£o precisa\n`;
      } else if (mergedInfo.changeNeeded === true && mergedInfo.changeForAmount) {
        resumo += `ðŸ’µ *Troco para:* ${formatCurrency(mergedInfo.changeForAmount)}\n`;
      }
    }
    if (isPixPayment(mergedInfo.paymentMethod)) {
      const pixLines = buildPixSummaryLines(deliveryData.config);
      if (pixLines.length > 0) {
        resumo += `\nðŸ§¾ *Dados do Pix:*\n`;
        pixLines.forEach(line => {
          resumo += `â€¢ ${line}\n`;
        });
      }
    }
    resumo += `\nðŸ’° *Subtotal:* ${formatCurrency(subtotal)}\n`;
    if (mergedInfo.deliveryType === 'delivery') {
      resumo += `ðŸ›µ *${deliveryFeeInfo.label}:* ${formatCurrency(deliveryFee)}\n`;
      if (deliveryFeeInfo.details) {
        resumo += `ðŸ“ *DistÃ¢ncia:* ${deliveryFeeInfo.details}\n`;
      }
    }
    resumo += `\nðŸ’µ *TOTAL: ${formatCurrency(total)}*\n\n`;
    resumo += `â±ï¸ *PrevisÃ£o:* ${deliveryData.config.estimated_delivery_time} minutos\n\n`;
    resumo += `âœ… *Confirma o pedido?* (responda "sim" para confirmar ou "nÃ£o" para cancelar)`;
    resumo = sanitizeDeliveryText(resumo);
    
    return {
      intent: 'PROVIDE_CUSTOMER_INFO',
      bubbles: [resumo],
      metadata: {
        awaitingConfirmation: true,
        customerInfo: infoForConfirmation,
        subtotal,
        deliveryFee,
        total,
      },
    };
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CASO ESPECIAL: CANCELAMENTO DE PEDIDO
  // Respeita a configuraÃ§Ã£o accepts_cancellation
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (intent === 'CANCEL_ORDER') {
    console.log(`ðŸ• [DeliveryAI] Intent CANCEL_ORDER - verificando config accepts_cancellation: ${deliveryData.config.accepts_cancellation}`);
    resetCartCheckoutState(currentCart);
    
    if (deliveryData.config.accepts_cancellation) {
      // Cancelamento permitido
      return {
        intent: 'CANCEL_ORDER',
        bubbles: [
          `âŒ Pedido cancelado com sucesso!\n\nSe mudar de ideia, Ã© sÃ³ me chamar novamente. ðŸ˜Š`
        ],
        metadata: {
          cancelled: true,
        },
      };
    } else {
      // Cancelamento NÃƒO permitido pela configuraÃ§Ã£o
      return {
        intent: 'CANCEL_ORDER',
        bubbles: [
          `âš ï¸ Infelizmente nÃ£o Ã© possÃ­vel cancelar o pedido por aqui.\n\nPara cancelamentos, entre em contato diretamente com o estabelecimento ou aguarde uma resposta do atendente. ðŸ“ž`
        ],
        metadata: {
          cancelled: false,
          reason: 'cancellation_not_allowed',
        },
      };
    }
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // OUTROS CASOS: USA IA COM CONTEXTO MÃNIMO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  
  const mistral = await getLLMClient();
  if (!mistral) {
    console.error(`ðŸ• [DeliveryAI] Mistral client not available`);
    return {
      intent,
      bubbles: ['Desculpe, estou com um problema tÃ©cnico. Tente novamente em alguns instantes.'],
    };
  }
  
  // Criar lista resumida dos itens (sÃ³ nomes e preÃ§os)
  const itemList = deliveryData.categories
    .flatMap(cat => cat.items.map(item => `${item.name}: R$ ${item.price.toFixed(2)}`))
    .join('\n');
  
  // Lista de TODOS os nomes de itens para validaÃ§Ã£o
  const allItemNames = deliveryData.categories
    .flatMap(cat => cat.items.map(item => item.name.toLowerCase()));
  
  const systemPrompt = `VocÃª Ã© um atendente simpÃ¡tico da ${deliveryData.config.business_name}.

âš ï¸ REGRAS CRÃTICAS - SIGA Ã€ RISCA:

1. CARDÃPIO COMPLETO (APENAS ESTES ITENS EXISTEM):
${itemList}

2. ITENS QUE NÃƒO EXISTEM (NUNCA MENCIONE):
   - Batata frita, batata, fritas
   - Onion rings, nuggets
   - Milk shake, sorvete
   - Qualquer item NÃƒO listado acima

3. SE O CLIENTE PEDIR ALGO QUE NÃƒO TEM:
   Responda: "Infelizmente nÃ£o temos [item]. Nosso cardÃ¡pio tem: [listar itens]"

4. AO CONFIRMAR PEDIDO:
   - Use APENAS preÃ§os do cardÃ¡pio acima
   - Calcule: Subtotal + Taxa entrega (R$ ${deliveryData.config.delivery_fee.toFixed(2)}) = Total
   - NUNCA invente valores

5. INFORMAÃ‡Ã•ES DE ENTREGA:
   - Taxa: R$ ${deliveryData.config.delivery_fee.toFixed(2)}
   - Tempo: ~${deliveryData.config.estimated_delivery_time} min
   - Pedido mÃ­nimo: R$ ${deliveryData.config.min_order_value.toFixed(2)}
   - Pagamento: ${deliveryData.config.payment_methods.join(', ')}

6. SEJA BREVE: mÃ¡ximo 2-3 frases. Use emojis com moderaÃ§Ã£o.

7. SE NÃƒO SOUBER: pergunte ao cliente ou diga que vai verificar.`;

  try {
    // Usa modelo configurado no banco de dados (sem hardcode)
    const response = await mistral.chat.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.2, // Muito baixa para ser mais determinÃ­stico
      maxTokens: 300,   // Respostas curtas
    });
    
    let aiResponse = response.choices?.[0]?.message?.content || '';
    if (typeof aiResponse !== 'string') {
      aiResponse = String(aiResponse);
    }
    
    // VALIDAÃ‡ÃƒO 1: Verificar se inventou itens
    const inventedItems = detectInventedItems(aiResponse, allItemNames);
    if (inventedItems.length > 0) {
      console.log(`ðŸš¨ [DeliveryAI] IA INVENTOU ITENS: ${inventedItems.join(', ')}`);
      // Corrigir a resposta
      aiResponse = `Nosso cardÃ¡pio tem:\n${itemList}\n\nO que vocÃª gostaria de pedir? ðŸ˜Š`;
    }
    
    // VALIDAÃ‡ÃƒO 2: Validar preÃ§os na resposta
    const validation = validatePriceInResponse(aiResponse, deliveryData);
    if (!validation.valid) {
      console.log(`âš ï¸ [DeliveryAI] PreÃ§os incorretos detectados e corrigidos:`, validation.errors);
      aiResponse = validation.corrected;
    }
    
    return {
      intent,
      bubbles: [aiResponse],
      metadata: {
        validatedPrice: validation.valid ? undefined : 0,
      },
    };
    
  } catch (error) {
    console.error(`ðŸ• [DeliveryAI] Erro na IA:`, error);
    return {
      intent,
      bubbles: ['Desculpe, tive um problema. Pode repetir sua mensagem?'],
    };
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸš¨ DETECTAR ITENS INVENTADOS PELA IA
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function detectInventedItems(response: string, validItems: string[]): string[] {
  const inventedItems: string[] = [];
  const responseLower = response.toLowerCase();
  
  // Lista de itens comuns que IA pode inventar
  const commonInventions = [
    'batata frita', 'batata', 'fritas', 'french fries',
    'onion rings', 'anÃ©is de cebola',
    'nuggets', 'chicken nuggets',
    'milk shake', 'milkshake', 'shake',
    'sorvete', 'sundae',
    'combo', 'promoÃ§Ã£o',
    'pizza', 'hot dog', 'cachorro quente',
    'cheddar', 'bacon extra', // a menos que exista
  ];
  
  for (const invention of commonInventions) {
    // Verifica se a IA mencionou o item inventado
    if (responseLower.includes(invention)) {
      // Verifica se NÃƒO Ã© um item vÃ¡lido do cardÃ¡pio
      const isValid = validItems.some(valid => 
        valid.includes(invention) || invention.includes(valid)
      );
      
      if (!isValid) {
        inventedItems.push(invention);
      }
    }
  }
  
  return inventedItems;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸŒ… HELPER: SAUDAÃ‡ÃƒO BASEADA NO HORÃRIO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ï¿½ PARSE DE PIZZA MEIO A MEIO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

interface HalfHalfResult {
  success: boolean;
  items: Array<{ name: string; price: number; category: string }>;
  errorMessage?: string;
}

export function parseHalfHalfOrder(message: string, deliveryData: DeliveryData, categoryContext?: string): HalfHalfResult {
  const lowerMsg = message.toLowerCase();
  
  // Detectar categoria do contexto (pizza, esfirra, etc)
  let categoryFilter = categoryContext;
  if (!categoryFilter) {
    // Tentar detectar da mensagem
    if (lowerMsg.includes('pizza')) categoryFilter = 'pizza';
    else if (lowerMsg.includes('esfirra') || lowerMsg.includes('esfiha')) categoryFilter = 'esfirra';
    else if (lowerMsg.includes('hamburguer') || lowerMsg.includes('lanche')) categoryFilter = 'hamburguer';
  }
  
  console.log(`ðŸ• [DeliveryAI] parseHalfHalfOrder - categoria: ${categoryFilter || 'TODAS'}`);
  
  // PadrÃµes para extrair dois sabores:
  // "meio a meio calabresa e mussarela"
  // "meia calabresa e meia mussarela"
  // "calabresa com mussarela"
  // "metade calabresa metade mussarela"
  // "pizza calabresa/mussarela"
  
  const patterns = [
    /meia\s+(.+?)\s+meia\s+(.+?)(?:\s|$)/i,
    /(?:meio\s*(?:a\s*)?meio|meia)\s+(.+?)\s+(?:e|com|\/)\s+(?:meia|meio\s*(?:a\s*)?meio)?\s*(.+?)(?:\s|$)/i,
    /(?:metade)\s+(.+?)\s+(?:e|com|\/)\s+(?:metade)?\s*(.+?)(?:\s|$)/i,
    /(.+?)\s+(?:e|com|\/)\s+(.+?)\s+(?:meio\s*(?:a\s*)?meio|metade|meia)/i,
    /(.+?)\s*\/\s*(.+)/i,
    /(.+?)\s+(?:e|com)\s+(.+)/i,
  ];
  
  let flavor1 = '';
  let flavor2 = '';

  // Fallback rÃ¡pido: "meia X meia Y" sem conjunÃ§Ã£o
  if (!flavor1 && !flavor2 && lowerMsg.includes('meia')) {
    const meiaParts = lowerMsg.split('meia').map(p => p.trim()).filter(Boolean);
    if (meiaParts.length >= 3) {
      const possibleFlavors = meiaParts.slice(-2);
      flavor1 = possibleFlavors[0]
        .replace(/^(?:pizza\s*(?:de\s*)?|esfirra\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|de\s*)/i, '')
        .replace(/sabor\s*/i, '')
        .replace(/^a\s+/i, '')
        .trim();
      flavor2 = possibleFlavors[1]
        .replace(/^(?:pizza\s*(?:de\s*)?|esfirra\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|de\s*)/i, '')
        .replace(/sabor\s*/i, '')
        .replace(/^a\s+/i, '')
        .trim();
      console.log(`ðŸ” [DeliveryAI] Sabores extraÃ­dos (fallback meia): "${flavor1}" e "${flavor2}"`);
    }
  }
  
  for (const pattern of patterns) {
    if (flavor1 && flavor2) break;
    const match = lowerMsg.match(pattern);
    if (match) {
      flavor1 = match[1].trim()
        .replace(/^(?:pizza\s*(?:de\s*)?|esfirra\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|de\s*)/i, '')
        .replace(/sabor\s*/i, '')
        .replace(/^a\s+/i, '');  // Remove "a" inicial
      flavor2 = match[2].trim()
        .replace(/^(?:pizza\s*(?:de\s*)?|esfirra\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|de\s*)/i, '')
        .replace(/sabor\s*/i, '')
        .replace(/^a\s+/i, '');  // Remove "a" inicial
      console.log(`ðŸ” [DeliveryAI] Sabores extraÃ­dos: "${flavor1}" e "${flavor2}"`);
      break;
    }
  }
  
  if (!flavor1 || !flavor2) {
    return {
      success: false,
      items: [],
      errorMessage: 'NÃ£o consegui identificar os dois sabores. Por favor, diga algo como "pizza meio a meio calabresa e mussarela".'
    };
  }
  
  // Buscar itens no menu COM FILTRO DE CATEGORIA
  const item1 = findItemByNameFuzzy(deliveryData, flavor1, categoryFilter);
  const item2 = findItemByNameFuzzy(deliveryData, flavor2, categoryFilter);
  
  const items: Array<{ name: string; price: number; category: string }> = [];
  const notFound: string[] = [];
  
  if (item1) {
    items.push({ name: item1.name, price: item1.price, category: item1.category_name });
  } else {
    notFound.push(flavor1);
  }
  
  if (item2) {
    items.push({ name: item2.name, price: item2.price, category: item2.category_name });
  } else {
    notFound.push(flavor2);
  }
  
  // Verificar se os dois itens sÃ£o da mesma categoria
  if (items.length === 2 && items[0].category !== items[1].category) {
    console.log(`âš ï¸ [DeliveryAI] Categorias diferentes: ${items[0].category} vs ${items[1].category}`);
  }
  
  if (notFound.length > 0) {
    const categoryName = categoryFilter || 'categoria';
    return {
      success: false,
      items,
      errorMessage: `NÃ£o encontrei ${notFound.join(', ')} em ${categoryName}. Verifique os sabores disponÃ­veis no cardÃ¡pio.`
    };
  }
  
  return {
    success: true,
    items,
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ï¿½ðŸŽ¯ FUNÃ‡ÃƒO PRINCIPAL - PROCESSADOR DE DELIVERY
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ’¬ PARSE DE ITENS DO PEDIDO (DA MENSAGEM DO CLIENTE)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const NUMBER_WORDS: Record<string, number> = {
  'um': 1, 'uma': 1,
  'dois': 2, 'duas': 2,
  'tres': 3, 'trÃªs': 3,
  'quatro': 4,
  'cinco': 5,
  'seis': 6,
  'sete': 7,
  'oito': 8,
  'nove': 9,
  'dez': 10,
};

export function parseOrderItems(message: string): Array<{ name: string; quantity: number }> {
  const results: Array<{ name: string; quantity: number }> = [];
  const normalizedMsg = message.toLowerCase()
    .replace(/quero|vou querer|me (vÃª|ve|da|dÃ¡)|pode|manda|adiciona|coloca|bota|p[oÃµ]e|por favor|pfv|pf/gi, '')
    .trim();
  
  // PadrÃµes: "2 pizza calabresa", "uma esfiha de carne", "3x refrigerante"
  const patterns = [
    /(\d+)\s*x?\s+(.+?)(?:,|e\s+\d|$)/gi,
    /(uma?|dois|duas|tres|trÃªs|quatro|cinco|seis|sete|oito|nove|dez)\s+(.+?)(?:,|e\s+(?:um|uma|\d)|$)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex state
    while ((match = pattern.exec(normalizedMsg)) !== null) {
      const qtyPart = match[1].toLowerCase();
      let itemPart = match[2].trim()
        .replace(/^\s*(de|da|do)\s+/i, '')  // Remove "de", "da", "do" no inÃ­cio
        .replace(/\([^)]*$/g, '')           // Remove descriÃ§Ãµes/instruÃ§Ãµes abertas
        .replace(/\[[^\]]*$/g, '')          // Remove metadados/instruÃ§Ãµes abertas
        .replace(/\s+-\s+.*$/g, '')         // Remove detalhes narrativos apÃ³s hÃ­fen
        .replace(/,\s*$/, '');              // Remove vÃ­rgula no final
      
      const qty = NUMBER_WORDS[qtyPart] || parseInt(qtyPart) || 1;
      
      if (itemPart.length > 2) {
        results.push({ name: itemPart, quantity: qty });
      }
    }
  }
  
  // Se nÃ£o encontrou padrÃ£o especÃ­fico, tenta extrair item Ãºnico
  if (results.length === 0 && normalizedMsg.length > 2) {
    results.push({
      name: normalizedMsg
        .replace(/\([^)]*$/g, '')
        .replace(/\[[^\]]*$/g, '')
        .replace(/\s+-\s+.*$/g, '')
        .trim(),
      quantity: 1,
    });
  }
  
  console.log(`ðŸ” [DeliveryAI] Itens parseados da mensagem: ${JSON.stringify(results)}`);
  return results;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ” BUSCAR ITEM NO MENU (COM MATCHING FUZZY)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function findItemByNameFuzzy(
  data: DeliveryData, 
  searchName: string,
  categoryFilter?: string  // NOVO: Filtrar por categoria especÃ­fica
): MenuItem | null {
  const normalized = sanitizeItemSearchName(searchName);
  
  const matchedCategory = categoryFilter
    ? findMatchingCategory(data, categoryFilter)
    : null;
  const categoriesToSearch = matchedCategory ? [matchedCategory] : data.categories;
  
  console.log(`ðŸ” [DeliveryAI] Buscando "${searchName}" em ${categoriesToSearch.length} categorias ${categoryFilter ? `(filtro: ${categoryFilter})` : ''}`);
  
  // 1. NormalizaÃ§Ã£o de sabor (remover prefixos como "pizza de", "esfiha de", "borda de")
  const cleanedName = normalized
    .replace(/^(?:pizza\s*(?:de\s*)?|esfirra?\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|borda\s*(?:de\s*)?)/i, '')
    .replace(/^(?:uma?\s*|um\s*|a\s*|o\s*)/i, '')
    .trim();

  const searchWords = tokenizeForItemMatch(cleanedName || normalized);
  const cleanedWords = tokenizeForItemMatch(cleanedName);
  const flavorWords = cleanedWords.filter(
    w => w.length > 3 && !['pizza', 'esfiha', 'esfirra', 'grande', 'media', 'pequena', 'molho'].includes(w)
  );

  type Candidate = { item: MenuItem; categoryName: string; score: number; reason: string };
  const candidates: Candidate[] = [];

  const collectCandidates = (categories: MenuCategory[]): Candidate[] => {
    const matches: Candidate[] = [];
    for (const category of categories) {
      for (const item of category.items) {
        const itemNameLower = normalizeForItemMatch(item.name);
        const itemDescriptionLower = normalizeForItemMatch(item.description || '');
        const itemSearchText = `${itemNameLower} ${itemDescriptionLower}`.trim();
        const itemNameTokens = tokenizeForItemMatch(item.name);
        const itemDescriptionTokens = tokenizeForItemMatch(item.description || '');
        let score = 0;
        let reason = '';

        const exactFlavorNameMatch =
          flavorWords.length > 0 &&
          countLooseTokenMatches(flavorWords, itemNameTokens) >= flavorWords.length;

        if (itemNameLower === normalized) {
          score = 100;
          reason = 'exato';
        } else if (exactFlavorNameMatch) {
          score = 92;
          reason = 'nome-sabor';
        } else if (cleanedName.length > 2 && itemNameLower.includes(cleanedName)) {
          score = 90;
          reason = `sabor:${cleanedName}`;
        } else if (
          searchWords.length > 1 &&
          searchWords.every(word => itemSearchText.includes(word))
        ) {
          score = 80;
          reason = 'todas-palavras';
        } else {
          const nameMatchCount = countLooseTokenMatches(cleanedWords, itemNameTokens);
          const descriptionMatchCount = countLooseTokenMatches(cleanedWords, itemDescriptionTokens);
          const compactCleaned = cleanedName.replace(/\s+/g, '');
          const compactItemName = itemNameLower.replace(/\s+/g, '');
          const compactSimilarity = compactCleaned && compactItemName
            ? 1 - (
              levenshteinDistance(compactCleaned, compactItemName) /
              Math.max(1, compactCleaned.length, compactItemName.length)
            )
            : 0;

          if (
            cleanedWords.length > 0 &&
            nameMatchCount >= Math.max(1, Math.min(cleanedWords.length, itemNameTokens.length) - 1)
          ) {
            score = 78 + Math.min(8, nameMatchCount);
            reason = 'tokens-nome';
          } else if (nameMatchCount > 0 && (nameMatchCount + descriptionMatchCount) >= 2) {
            score = 72 + Math.min(6, nameMatchCount + descriptionMatchCount);
            reason = 'tokens-contexto';
          } else if (compactSimilarity >= 0.72) {
            score = 70 + Math.round(compactSimilarity * 10);
            reason = 'similaridade';
          } else if (
            flavorWords.length > 0 &&
            flavorWords.some(word => itemNameTokens.some(token => tokensLooselyMatch(word, token)))
          ) {
            score = 62;
            reason = 'fuzzy-sabor';
          }
        }

        if (score > 0) {
          matches.push({ item, categoryName: category.name, score, reason });
        }
      }
    }
    return matches;
  };

  candidates.push(...collectCandidates(categoriesToSearch));

  if (candidates.length === 0 && matchedCategory) {
    console.log(`ðŸ” [DeliveryAI] Nenhum match em "${matchedCategory.name}", tentando cardÃ¡pio completo`);
    candidates.push(...collectCandidates(data.categories));
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length);
    const best = candidates[0];
    const bestNameTokens = tokenizeForItemMatch(best.item.name);
    const bestDescriptionTokens = tokenizeForItemMatch(best.item.description || '');
    const relevantSearchTokens = cleanedWords.filter(token => token.length > 2);
    const contextualMatchCount =
      countLooseTokenMatches(relevantSearchTokens, bestNameTokens) +
      countLooseTokenMatches(relevantSearchTokens, bestDescriptionTokens);

    if (relevantSearchTokens.length >= 2 && contextualMatchCount < 2 && best.score < 85) {
      console.log(
        `⚠️ [DeliveryAI] Match rejeitado por baixa confiança contextual: ${best.item.name} ` +
        `(score=${best.score}, tokens=${contextualMatchCount}/${relevantSearchTokens.length})`
      );
      return null;
    }

    console.log(`âœ… [DeliveryAI] Match ${best.reason}: ${best.item.name} (categoria: ${best.categoryName})`);
    return best.item;
  }
  
  console.log(`âŒ [DeliveryAI] Nenhum item encontrado para "${searchName}"`);
  return null;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ§  DETECTAR CONTEXTO DE CATEGORIA BASEADO NO HISTÃ“RICO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function detectCategoryContext(
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  deliveryData: DeliveryData
): string | undefined {
  const recentBotMessages = conversationHistory
    .filter(m => m.fromMe)
    .slice(-5);

  if (recentBotMessages.length === 0) {
    console.log(`ðŸ§  [DeliveryAI] Nenhum contexto de categoria detectado no histÃ³rico`);
    return undefined;
  }

  const categorySignals = deliveryData.categories.map(category => {
    const aliases = new Set<string>([
      normalizeTextForMatch(category.name),
      normalizeCategoryText(category.name),
    ]);
    const categoryKey = detectCategoryFromMessage(category.name);
    if (categoryKey) {
      aliases.add(normalizeTextForMatch(categoryKey));
      aliases.add(normalizeCategoryText(categoryKey));
      for (const keyword of CATEGORY_KEYWORDS[categoryKey] || []) {
        aliases.add(normalizeTextForMatch(keyword));
        aliases.add(normalizeCategoryText(keyword));
      }
    }
    for (const item of category.items.slice(0, 5)) {
      aliases.add(normalizeTextForMatch(item.name));
    }
    return {
      name: category.name,
      aliases: Array.from(aliases).filter(Boolean),
    };
  });

  for (const message of [...recentBotMessages].reverse()) {
    const normalizedMessage = normalizeTextForMatch(message.text);
    for (const category of categorySignals) {
      if (category.aliases.some(alias => alias && normalizedMessage.includes(alias))) {
        console.log(`ðŸ§  [DeliveryAI] Contexto detectado: Ãºltima categoria vista foi "${category.name}"`);
        return category.name;
      }
    }
  }

  console.log(`ðŸ§  [DeliveryAI] Nenhum contexto de categoria detectado no histÃ³rico`);
  return undefined;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ“ PROCESSAR PEDIDO COMPLETO (ADICIONA AO CARRINHO)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export interface ProcessOrderResult {
  success: boolean;
  addedItems: Array<{ name: string; quantity: number; price: number }>;
  notFoundItems: string[];
  cart: CustomerCart;
  message: string;
}

export function processOrderFromMessage(
  userId: string,
  customerPhone: string,
  message: string,
  deliveryData: DeliveryData,
  categoryContext?: string,
  conversationId?: string
): ProcessOrderResult {
  const categoryMap: Record<string, string> = {
    pizza: 'Pizza',
    esfirra: 'Esfiha',
    bebida: 'Bebida',
    'aÃ§aÃ­': 'AÃ§aÃ­',
    borda: 'Borda',
  };
  const parsedItems = parseOrderItems(message);
  const addedItems: Array<{ name: string; quantity: number; price: number }> = [];
  const notFoundItems: string[] = [];
  const itemsNeedingSize: Array<{ name: string; quantity: number; options: Array<{ name: string; price: number }> }> = [];
  
  for (const parsed of parsedItems) {
    const itemCategoryKey = detectCategoryFromMessage(parsed.name);
    const itemCategoryContext = itemCategoryKey
      ? (categoryMap[itemCategoryKey] || categoryContext)
      : categoryContext;
    const menuItem = findItemByNameFuzzy(deliveryData, parsed.name, itemCategoryContext);
    
    if (menuItem) {
      const resolved = resolveMenuItemOptions(menuItem, message);
      if (resolved.needsSize) {
        itemsNeedingSize.push({
          name: menuItem.name,
          quantity: parsed.quantity,
          options: resolved.sizeOptions || [],
        });
        continue;
      }
      const optionsKey = resolved.optionsSelected
        .map(opt => `${normalizeTextForMatch(opt.group)}:${normalizeTextForMatch(opt.option)}`)
        .join('|');
      addToCart(userId, customerPhone, menuItem, parsed.quantity, {
        displayName: resolved.displayName,
        priceOverride: resolved.unitPrice,
        notes: resolved.notes,
        optionsSelected: resolved.optionsSelected,
        itemKeySuffix: optionsKey || undefined,
      }, conversationId);
      addedItems.push({
        name: resolved.displayName,
        quantity: parsed.quantity,
        price: resolved.unitPrice,
      });
    } else {
      notFoundItems.push(parsed.name);
    }
  }
  
  if (itemsNeedingSize.length > 0) {
    const item = itemsNeedingSize[0];
    const sizesText = item.options.map(opt =>
      `â€¢ *${opt.name}* - R$ ${opt.price.toFixed(2).replace('.', ',')}`
    ).join('\n');
    return {
      success: false,
      addedItems: [],
      notFoundItems,
      cart: getCart(userId, customerPhone, conversationId),
      message: `ðŸ• Boa escolha! *${item.quantity}x ${item.name}*\n\nðŸ“ *Qual tamanho vocÃª quer?*\n\n${sizesText}\n\nMe diz o tamanho! ðŸ˜Š`,
    };
  }

  const cart = getCart(userId, customerPhone, conversationId);
  
  let message_response = '';
  if (addedItems.length > 0) {
    message_response = `âœ… Adicionado ao pedido:\n`;
    for (const item of addedItems) {
      const total = item.price * item.quantity;
      message_response += `â€¢ ${item.quantity}x ${item.name} - R$ ${total.toFixed(2).replace('.', ',')}\n`;
    }
  }
  
  if (notFoundItems.length > 0) {
    message_response += `\nâš ï¸ NÃ£o encontrei: ${notFoundItems.join(', ')}\n`;
    message_response += `Por favor, verifique o cardÃ¡pio ou escreva o nome do item.`;
  }
  
  if (addedItems.length > 0) {
    message_response += `\n\n${formatCartSummary(cart, deliveryData.config.delivery_fee)}`;
    message_response += `\n\nDeseja mais alguma coisa ou posso fechar o pedido?`;
  }
  
  return {
    success: addedItems.length > 0,
    addedItems,
    notFoundItems,
    cart,
    message: message_response,
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸš€ CONFIRMAR E CRIAR PEDIDO NO BANCO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  total?: number;
  error?: string;
}

export async function confirmAndCreateOrder(
  userId: string,
  customerPhone: string,
  customerName: string,
  deliveryType: 'delivery' | 'pickup',
  paymentMethod: string,
  address: string | null,
  deliveryData: DeliveryData,
  conversationId?: string,
  options?: {
    deliveryFeeOverride?: number;
    customerReference?: string | null;
    notes?: string | null;
  }
): Promise<CreateOrderResult> {
  const cart = getExistingCart(userId, customerPhone, conversationId);
  
  if (!cart || cart.items.size === 0) {
    return { success: false, error: 'Carrinho vazio' };
  }
  
  const subtotal = getCartSubtotal(cart);
  const minOrder = deliveryData.config.min_order_value;
  
  if (subtotal < minOrder) {
    return { 
      success: false, 
      error: `Pedido mÃ­nimo Ã© R$ ${minOrder.toFixed(2).replace('.', ',')}. Seu pedido: R$ ${subtotal.toFixed(2).replace('.', ',')}`
    };
  }
  
  if (deliveryType === 'delivery' && !address) {
    return { success: false, error: 'EndereÃ§o obrigatÃ³rio para entrega' };
  }
  
  const deliveryFee = deliveryType === 'delivery'
    ? (options?.deliveryFeeOverride ?? deliveryData.config.delivery_fee)
    : 0;
  const total = subtotal + deliveryFee;
  
  try {
    // Converter itens do carrinho para formato do banco
    const items = Array.from(cart.items.values()).map(item => ({
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
    }));
    
    // Criar pedido no banco usando a funÃ§Ã£o existente do deliveryService
    const validConversationId = conversationId && !isSyntheticConversationId(conversationId)
      ? conversationId
      : null;

    const { data: order, error: orderError } = await supabase
      .from('delivery_orders')
      .insert({
        user_id: userId,
        conversation_id: validConversationId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: address,
        customer_reference: options?.customerReference || null,
        delivery_type: deliveryType,
        payment_method: paymentMethod,
        status: 'pending',
        subtotal: subtotal,
        delivery_fee: deliveryFee,
        total: total,
        estimated_time: deliveryData.config.estimated_delivery_time,
        notes: options?.notes || null,
      })
      .select()
      .single();
    
    if (orderError || !order) {
      console.error(`ðŸ• [DeliveryAI] Erro ao criar pedido:`, orderError);
      return { success: false, error: 'Erro ao criar pedido' };
    }
    
    console.log(`âœ… [DeliveryAI] Pedido #${order.id} criado com sucesso!`);
    
    // Inserir itens do pedido
    const orderItems = Array.from(cart.items.values()).map(item => ({
      order_id: order.id,
      menu_item_id: item.menuItemId ?? null,
      item_name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.price * item.quantity,
      options_selected: item.optionsSelected || [],
      notes: item.notes,
    }));
    
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);
    
    if (itemsError) {
      console.error(`ðŸ• [DeliveryAI] Erro ao inserir itens:`, itemsError);
      // NÃ£o falha o pedido
    }
    
    // Limpar carrinho apÃ³s sucesso
    clearCart(userId, customerPhone, conversationId);
    
    return {
      success: true,
      orderId: order.id,
      total: total,
    };
    
  } catch (error) {
    console.error(`ðŸ• [DeliveryAI] Erro interno:`, error);
    return { success: false, error: 'Erro interno ao criar pedido' };
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const deliveryCategoryOnlyTerms = new Set(
  Object.entries(CATEGORY_KEYWORDS).flatMap(([key, keywords]) => [key, ...keywords].map(normalizeTextForMatch))
);

function isGenericCategoryOnlyMessage(message: string, deliveryData: DeliveryData): boolean {
  const normalized = normalizeTextForMatch(message);
  if (!normalized) {
    return false;
  }

  if (deliveryCategoryOnlyTerms.has(normalized)) {
    return true;
  }

  return deliveryData.categories.some(category => normalizeTextForMatch(category.name) === normalized);
}

function isCategoryBrowsingMessage(message: string, deliveryData: DeliveryData): boolean {
  const normalized = normalizeTextForMatch(message);
  if (!normalized) {
    return false;
  }

  if (isGenericCategoryOnlyMessage(message, deliveryData)) {
    return true;
  }

  if (!detectCategoryFromMessage(message)) {
    return false;
  }

  return [
    'qualquer',
    'qualquer tipo',
    'sabores',
    'sabor',
    'opcoes',
    'opcao',
    'tipos',
    'tipo',
    'quais',
    'quero ver',
    'mostrar',
    'mostra',
    'ver',
    'listar',
    'lista',
    'cardapio',
    'menu',
  ].some(fragment => normalized.includes(fragment));
}

function lastBotPromptInvitedItemSelection(
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): boolean {
  const lastBotMessage = conversationHistory?.filter(entry => entry.fromMe).slice(-1)[0];
  if (!lastBotMessage?.text) {
    return false;
  }

  const normalized = normalizeTextForMatch(lastBotMessage.text);
  return [
    'o que voce gostaria de pedir',
    'qual voce quer',
    'qual voce deseja',
    'e so me dizer',
    'pode me dizer o nome do item',
    'o que deseja pedir',
    'o que vai querer',
    'confira a imagem do cardapio acima',
  ].some(fragment => normalized.includes(fragment));
}

function isGenericChoiceMessage(message: string): boolean {
  const normalized = normalizeTextForMatch(message);
  if (!normalized) {
    return false;
  }

  return [
    'qualquer',
    'qualquer uma',
    'qualquer um',
    'qualquer pizza',
    'tanto faz',
    'pode ser qualquer',
    'essa mesma',
    'esse mesmo',
    'essa ai',
    'esse ai',
  ].some(fragment => normalized === fragment || normalized.includes(fragment));
}

function detectRecentItemContext(
  conversationHistory: Array<{ fromMe: boolean; text: string }> | undefined,
  deliveryData: DeliveryData,
  categoryContext?: string
): MenuItem | null {
  if (!conversationHistory?.length) {
    return null;
  }

  const recentMessages = conversationHistory
    .slice(-6)
    .map(entry => entry.text)
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    .reverse();

  for (const messageText of recentMessages) {
    const normalizedMessage = normalizeTextForMatch(messageText);
    if (!normalizedMessage) continue;

    for (const category of deliveryData.categories) {
      if (categoryContext && !smartCategoryMatch(normalizeCategoryText(category.name), normalizeCategoryText(categoryContext))) {
        continue;
      }

      for (const item of category.items) {
        const normalizedItemName = normalizeTextForMatch(item.name);
        if (normalizedItemName && normalizedMessage.includes(normalizedItemName)) {
          return item;
        }
      }
    }
  }

  return null;
}

function resolveItemFromRecentContext(
  candidate: string,
  recentItem: MenuItem | null
): MenuItem | null {
  if (!recentItem) {
    return null;
  }

  const candidateTokens = tokenizeForItemMatch(candidate);
  if (candidateTokens.length === 0) {
    return recentItem;
  }

  const recentNameTokens = tokenizeForItemMatch(recentItem.name);
  const recentDescriptionTokens = tokenizeForItemMatch(recentItem.description || '');
  const nameOverlap = countLooseTokenMatches(candidateTokens, recentNameTokens);
  const descriptionOverlap = countLooseTokenMatches(candidateTokens, recentDescriptionTokens);

  if (nameOverlap >= Math.min(2, recentNameTokens.length)) {
    return recentItem;
  }

  if (nameOverlap >= 1 && descriptionOverlap >= 1) {
    return recentItem;
  }

  if (nameOverlap >= 1 && candidateTokens.length <= recentNameTokens.length + 2) {
    return recentItem;
  }

  return null;
}

export function resolveDirectItemOrderFromContext(params: {
  rawMessage: string;
  executionMessage: string;
  deliveryData: DeliveryData;
  conversationHistory?: Array<{ fromMe: boolean; text: string }>;
}): { item: MenuItem; quantity: number; rewrittenMessage: string; categoryContext?: string } | null {
  const { rawMessage, executionMessage, deliveryData, conversationHistory } = params;
  const categoryContext = conversationHistory?.length
    ? detectCategoryContext(conversationHistory, deliveryData)
    : undefined;
  const shouldTrustBareItemMessage = lastBotPromptInvitedItemSelection(conversationHistory);
  const recentItemContext = detectRecentItemContext(conversationHistory, deliveryData, categoryContext);
  const candidateInputs = Array.from(
    new Set([rawMessage, executionMessage].map(value => value?.trim()).filter(Boolean))
  );

  for (const candidate of candidateInputs) {
    const normalizedCandidate = normalizeTextForMatch(candidate);
    if (!normalizedCandidate || normalizedCandidate.length < 3) {
      continue;
    }

    if (isGenericCategoryOnlyMessage(candidate, deliveryData)) {
      continue;
    }

    const parsedItems = parseOrderItems(candidate);
    for (const parsedItem of parsedItems) {
      const parsedName = parsedItem.name?.trim();
      if (!parsedName || isGenericCategoryOnlyMessage(parsedName, deliveryData)) {
        continue;
      }

      const foundItem =
        findItemByNameFuzzy(deliveryData, parsedName, categoryContext)
        || resolveItemFromRecentContext(parsedName, recentItemContext);
      if (!foundItem) {
        continue;
      }

      const normalizedParsedName = normalizeTextForMatch(parsedName);
      const bareItemMessage =
        normalizedCandidate === normalizedParsedName ||
        normalizedCandidate.endsWith(normalizedParsedName);

      if (shouldTrustBareItemMessage || bareItemMessage) {
        const quantity = parsedItem.quantity > 0 ? parsedItem.quantity : 1;
        return {
          item: foundItem,
          quantity,
          categoryContext,
          rewrittenMessage: `quero ${quantity} ${foundItem.name}`,
        };
      }
    }
  }

  return null;
}

export async function processDeliveryMessage(
  userId: string,
  message: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>,
  customerPhone?: string,
  conversationId?: string
): Promise<DeliveryAIResponse | null> {
  
  console.log(`\n${'â•'.repeat(60)}`);
  console.log(`ðŸ• [DeliveryAI] Processando mensagem: "${message.substring(0, 50)}..."`);
  
  // 1. Buscar dados do delivery no banco
  const deliveryData = await getDeliveryData(userId);
  if (!deliveryData) {
    console.log(`ðŸ• [DeliveryAI] Delivery nÃ£o ativo para este usuÃ¡rio`);
    return null; // Retorna null para indicar que deve usar fluxo normal
  }
  
  // 2. VERIFICAR HORÃRIO DE FUNCIONAMENTO
  const businessStatus = isBusinessOpen(deliveryData.config.opening_hours);
  const allowAfterHoursOrders = acceptsAfterHoursOrders(deliveryData.config.opening_hours);
  console.log(`ðŸ• [DeliveryAI] HorÃ¡rio: ${businessStatus.currentTime} | Aberto: ${businessStatus.isOpen}`);
  const effectiveConversationHistory = conversationHistory ? [...conversationHistory] : [];
  const effectiveConversationId = conversationId?.trim() || undefined;
  const savedCustomerProfile = customerPhone
    ? await getLatestSavedCustomerProfile(userId, customerPhone)
    : null;
  
  if (!businessStatus.isOpen && !allowAfterHoursOrders) {
    console.log(`ðŸš« [DeliveryAI] Estabelecimento fechado - informando cliente`);
    const hoursText = formatBusinessHours(deliveryData.config.opening_hours);
    const historyName = getCustomerNameFromHistory(conversationHistory);
    const effectiveName = deliveryData.config.use_customer_name
      ? (historyName || 'Cliente')
      : 'Cliente';

    const defaultClosedTemplate = `ðŸ˜” *Ops! Estamos fechados no momento.*\n\nðŸ• {status}\n\n{horarios}\n\nâœ¨ Volte no horÃ¡rio de funcionamento! Teremos prazer em atendÃª-lo.`;
    const closedTemplate = deliveryData.config.closed_message || defaultClosedTemplate;
    const closedMessageRaw = interpolateDeliveryMessage(closedTemplate, {
      cliente_nome: effectiveName,
      nome: effectiveName,
      name: effectiveName,
      horarios: hoursText,
      status: businessStatus.message,
    });
    const closedMessage = applyHumanization(closedMessageRaw, deliveryData.config, true);

    return {
      intent: 'OTHER',
      bubbles: [closedMessage],
      metadata: { businessClosed: true, businessStatus }
    };
  }

  const shouldAddAfterHoursNotice = !businessStatus.isOpen
    && allowAfterHoursOrders
    && !hasAfterHoursOrderingNotice(conversationHistory);

  if (!businessStatus.isOpen && allowAfterHoursOrders) {
    console.log(`ðŸŒ™ [DeliveryAI] Fora do horario, mas configurado para aceitar pedidos`);
  }
  
  // 3. Detectar intenÃ§Ã£o (atalhos rÃ¡pidos antes da IA)
  const interpretation = await interpretDeliveryTurnWithLLM(
    userId,
    message,
    deliveryData,
    effectiveConversationHistory,
    customerPhone,
    effectiveConversationId
  );
  const currentCart = customerPhone
    ? getExistingCart(userId, customerPhone, effectiveConversationId)
    : null;
  const hasStructuredCustomerInfo =
    Object.keys(extractStructuredCustomerInfoFields(message)).length > 0;
  let intent: CustomerIntent | null = interpretation?.intent || null;
  let executionMessage = interpretation?.normalizedMessage?.trim() || message;
  if (intent === 'PROVIDE_CUSTOMER_INFO') {
    const shouldPreserveRawCustomerReply =
      currentCart?.checkoutState?.phase === 'awaiting_confirmation' ||
      currentCart?.awaitingConfirmation ||
      isSimplePositiveConfirmationMessage(message) ||
      isSimpleNegativeConfirmationMessage(message);
    executionMessage = interpretation?.normalizedMessage?.trim() && !shouldPreserveRawCustomerReply
      ? `${interpretation.normalizedMessage.trim()} | mensagem_original: ${message}`
      : message;
  }
  const normalizedMsg = normalizeTextForMatch(executionMessage);
  if (!intent) {
    if (/^(oi|ola|olÃ¡|bom dia|boa tarde|boa noite|e ai|eae|opa|oii+|hi|hey)\\b/.test(normalizedMsg)) {
      intent = 'GREETING';
    } else if (/(cardapio|cardÃ¡pio|menu|o que tem|oque tem|quais produtos|quais os produtos|me manda o menu|mostra o menu|ver o cardapio|ver cardÃ¡pio)/i.test(normalizedMsg)) {
      intent = 'WANT_MENU';
    }
  }
  if (currentCart && shouldForceCustomerInfoIntent(currentCart, message, effectiveConversationHistory, intent)) {
    intent = 'PROVIDE_CUSTOMER_INFO';
    executionMessage = message;
  }
  if (
    currentCart &&
    currentCart.items.size > 0 &&
    hasStructuredCustomerInfo &&
    !['ADD_ITEM', 'REMOVE_ITEM', 'WANT_MENU', 'WANT_CATEGORY', 'HALF_HALF'].includes(intent)
  ) {
    console.log(`🍕 [DeliveryAI] Override para PROVIDE_CUSTOMER_INFO por dados estruturados de checkout`);
    intent = 'PROVIDE_CUSTOMER_INFO';
    executionMessage = message;
  }
  if (!intent) {
    intent = await detectIntentWithAI(executionMessage, effectiveConversationHistory, deliveryData);
  }
  const directItemResolution = resolveDirectItemOrderFromContext({
    rawMessage: message,
    executionMessage,
    deliveryData,
    conversationHistory: effectiveConversationHistory,
  });

  if (!directItemResolution && lastBotPromptInvitedItemSelection(effectiveConversationHistory) && isGenericChoiceMessage(message)) {
    const contextualCategory = detectCategoryContext(effectiveConversationHistory, deliveryData);
    if (contextualCategory) {
      console.log(`🍕 [DeliveryAI] Resposta vaga contextualizada para categoria: ${contextualCategory}`);
      intent = 'WANT_CATEGORY';
      executionMessage = contextualCategory;
    }
  }

  const explicitCategoryRequest = detectCategoryFromMessage(message);
  const categoryBrowsingRequest = !!(
    explicitCategoryRequest &&
    intent !== 'HALF_HALF' &&
    isCategoryBrowsingMessage(message, deliveryData)
  );
  if (
    categoryBrowsingRequest &&
    explicitCategoryRequest
  ) {
    console.log(`🍕 [DeliveryAI] Override para WANT_CATEGORY pela mensagem de navegacao: ${explicitCategoryRequest}`);
    intent = 'WANT_CATEGORY';
    executionMessage = explicitCategoryRequest;
  }
  
  // ðŸ†• FIX: OVERRIDE WANT_CATEGORY quando mensagem contÃ©m nome de item especÃ­fico
  // Evita que "borda de cheddar", "coca-cola 2l" sejam tratados como WANT_CATEGORY
  if (directItemResolution && !categoryBrowsingRequest && ['WANT_CATEGORY', 'WANT_MENU', 'OTHER'].includes(intent)) {
    console.log(`ðŸ• [DeliveryAI] Override contextual â†’ WANT_TO_ORDER (item encontrado: ${directItemResolution.item.name})`);
    intent = currentCart?.items.size
      ? 'ADD_ITEM'
      : 'WANT_TO_ORDER';
    executionMessage = directItemResolution.rewrittenMessage;
  }
  
  console.log(`🍕 [DeliveryAI] Intenção detectada (com contexto): ${intent}`);
  if (interpretation) {
    console.log(`🍕 [DeliveryAI] Planner normalizou mensagem para: "${executionMessage}"`);
    if (interpretation.categoryHint) {
      console.log(`🍕 [DeliveryAI] Planner categoryHint: ${interpretation.categoryHint}`);
    }
  }
  
  // 4. Gerar resposta baseada na intenÃ§Ã£o
  const response = await generateDeliveryResponse(
    userId,
    executionMessage,
    intent,
    deliveryData,
    effectiveConversationHistory.map(m => `${m.fromMe ? 'VocÃª' : 'Cliente'}: ${m.text}`).join('\n'),
    customerPhone,
    conversationId,
    effectiveConversationHistory
  );

  if (shouldAddAfterHoursNotice) {
    response.bubbles = [
      buildAfterHoursOrderingNotice(businessStatus, deliveryData.config.opening_hours),
      ...response.bubbles,
    ];
    response.metadata = {
      ...response.metadata,
      businessClosed: true,
      businessStatus,
      afterHoursOrderAccepted: true,
    };
  }

  if (interpretation?.categoryHint && ['WANT_MENU', 'WANT_CATEGORY'].includes(response.intent)) {
    response.metadata = {
      ...response.metadata,
      categoryRequested: interpretation.categoryHint,
    };
  }

  const menuSendMode = normalizeMenuSendMode(deliveryData.config.menu_send_mode);
  const openingMediaActions = response.intent === 'GREETING'
    ? await buildDeliveryOpeningMediaActions(userId)
    : [];
  // ðŸ”’ Intents que devem mostrar imagem de categoria (NÃƒO sobrescrever ADD_ITEM/WANT_TO_ORDER)
  const isMenuDisplayIntent = ['WANT_MENU', 'WANT_CATEGORY', 'GREETING'].includes(response.intent);
  if (menuSendMode !== 'text' && isMenuDisplayIntent) {
    if (menuSendMode === 'image' && !response.metadata?.categoryImageUrl) {
      const requestedCategory = response.metadata?.categoryRequested || detectCategoryFromMessage(executionMessage);
      if (requestedCategory) {
        const matchedCategory = findMatchingCategory(deliveryData, requestedCategory);
        if (matchedCategory?.image_url) {
          response.metadata = {
            ...response.metadata,
            categoryRequested: requestedCategory,
            categoryImageUrl: matchedCategory.image_url,
            categoryName: matchedCategory.name,
          };
        }
      }
    }

    const mediaActions = buildMenuMediaActions(deliveryData, response.intent, response.metadata);

    if (menuSendMode === 'image' && response.metadata?.categoryImageUrl && mediaActions.length === 0) {
      mediaActions.push({
        type: 'send_media_url',
        media_url: response.metadata.categoryImageUrl,
        media_type: 'image',
        caption: response.metadata.categoryName || response.metadata.categoryRequested,
      });
    }

    const combinedMediaActions = [...openingMediaActions, ...mediaActions];

    if (combinedMediaActions.length > 0) {
      response.mediaActions = combinedMediaActions;
      if (menuSendMode === 'image') {
        if (response.intent === 'GREETING') {
          response.bubbles = response.bubbles.map((bubble) =>
            `${bubble}\n\n📷 O cardápio será enviado somente por imagem sempre que houver imagem cadastrada na categoria.`
          );
        } else {
          const catName = response.metadata?.categoryName || response.metadata?.categoryRequested || 'CardÃ¡pio';
          response.bubbles = [`ðŸ“· *${catName}*\nConfira a imagem do cardÃ¡pio acima e me diga o item que vocÃª quer pedir.`];
        }
      }
    }
  } else if (openingMediaActions.length > 0) {
    response.mediaActions = openingMediaActions;
  }
  
  console.log(`ðŸ• [DeliveryAI] Resposta gerada: ${response.bubbles.length} bolha(s)`);
  response.bubbles.forEach((b, i) => {
    console.log(`   Bolha ${i + 1}: ${b.substring(0, 80)}...`);
  });
  response.bubbles = response.bubbles.map(bubble => sanitizeDeliveryText(bubble));
  if (response.mediaActions?.length) {
    response.mediaActions = response.mediaActions.map(action => ({
      ...action,
      caption: action.caption ? sanitizeDeliveryText(action.caption) : action.caption,
    }));
  }
  console.log(`${'â•'.repeat(60)}\n`);
  
  return response;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ“¤ EXPORT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export default {
  processDeliveryMessage,
  detectCustomerIntent,
  detectIntentWithAI,
  isDeliveryEnabled,
  getDeliveryData,
  formatMenuAsBubbles,
  findItemInMenu,
  findItemByNameFuzzy,
  detectCategoryContext,
  validatePriceInResponse,
  isBusinessOpen,  // Verificar horÃ¡rio de funcionamento
  // Carrinho
  getCart,
  addToCart,
  addCustomItemToCart,
  removeFromCart,
  clearCart,
  getCartSubtotal,
  getCartTotal,
  formatCartSummary,
  // Parse e pedidos
  parseOrderItems,
  processOrderFromMessage,
  confirmAndCreateOrder,
};
