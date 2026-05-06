/**
 * QR Code Inteligente Service
 * Step 1: Core service - generate & manage WhatsApp QR Codes
 *
 * Features:
 * - Generate QR Codes pointing to WhatsApp (wa.me links)
 * - Personalization: colors, logo, corner radius
 * - Template support per business segment
 * - Download: PNG (base64), SVG, PDF
 * - Analytics: scan count tracking
 */

import QRCode from "qrcode";
import { db } from "./db";
import { smartQrcodes, qrcodeScanLogs } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import type { SmartQrcodeInput, UpdateSmartQrcodeInput, SmartQrcode } from "../shared/schema";

const DEFAULT_FOREGROUND_COLOR = "#000000";
const DEFAULT_BACKGROUND_COLOR = "#ffffff";
const DEFAULT_ERROR_CORRECTION = "H";
const DEFAULT_QR_SIZE = 400;

// ============================================================
// Business Segment Templates
// Pre-defined welcome messages per business type
// ============================================================

export const QRCODE_TEMPLATES: Record<string, {
  name: string;
  icon: string;
  welcomeMessage: string;
  categoryGroup: string;
  foregroundColor: string;
}> = {
  // DELIVERY
  lanchonete: {
    name: "Lanchonete",
    icon: "🍔",
    welcomeMessage: "Olá! Quero fazer um pedido 🍔",
    categoryGroup: "delivery",
    foregroundColor: "#e65c00",
  },
  pizzaria: {
    name: "Pizzaria",
    icon: "🍕",
    welcomeMessage: "Olá! Quero ver o cardápio de pizzas 🍕",
    categoryGroup: "delivery",
    foregroundColor: "#c0392b",
  },
  restaurante: {
    name: "Restaurante",
    icon: "🍽️",
    welcomeMessage: "Olá! Quero fazer um pedido 🍽️",
    categoryGroup: "delivery",
    foregroundColor: "#27ae60",
  },
  hamburgueria: {
    name: "Hamburgueria",
    icon: "🍔",
    welcomeMessage: "Olá! Quero ver o cardápio de burgers 🍔",
    categoryGroup: "delivery",
    foregroundColor: "#d35400",
  },
  acai: {
    name: "Açaí / Sorveteria",
    icon: "🍧",
    welcomeMessage: "Olá! Quero fazer um pedido 🍧",
    categoryGroup: "delivery",
    foregroundColor: "#8e44ad",
  },
  confeitaria: {
    name: "Confeitaria / Bolos",
    icon: "🎂",
    welcomeMessage: "Olá! Gostaria de informações sobre bolos e doces 🎂",
    categoryGroup: "delivery",
    foregroundColor: "#e91e8c",
  },
  // BELEZA
  salao: {
    name: "Salão de Beleza",
    icon: "💇",
    welcomeMessage: "Olá! Gostaria de agendar um horário 💇",
    categoryGroup: "beleza",
    foregroundColor: "#e91e8c",
  },
  barbearia: {
    name: "Barbearia",
    icon: "✂️",
    welcomeMessage: "Olá! Quero agendar um corte ✂️",
    categoryGroup: "beleza",
    foregroundColor: "#2c3e50",
  },
  estetica: {
    name: "Clínica de Estética",
    icon: "💆",
    welcomeMessage: "Olá! Gostaria de informações sobre os procedimentos 💆",
    categoryGroup: "beleza",
    foregroundColor: "#9b59b6",
  },
  manicure: {
    name: "Manicure / Nail Designer",
    icon: "💅",
    welcomeMessage: "Olá! Quero agendar manicure/pedicure 💅",
    categoryGroup: "beleza",
    foregroundColor: "#e74c3c",
  },
  // SAÚDE
  clinica: {
    name: "Clínica Médica",
    icon: "🏥",
    welcomeMessage: "Olá! Gostaria de agendar uma consulta 🏥",
    categoryGroup: "saude",
    foregroundColor: "#2980b9",
  },
  dentista: {
    name: "Dentista / Odontologia",
    icon: "🦷",
    welcomeMessage: "Olá! Gostaria de agendar uma consulta odontológica 🦷",
    categoryGroup: "saude",
    foregroundColor: "#1abc9c",
  },
  fisioterapia: {
    name: "Fisioterapia / Pilates",
    icon: "🏃",
    welcomeMessage: "Olá! Quero agendar uma sessão 🏃",
    categoryGroup: "saude",
    foregroundColor: "#27ae60",
  },
  veterinario: {
    name: "Veterinário / Pet Shop",
    icon: "🐾",
    welcomeMessage: "Olá! Quero agendar uma consulta para meu pet 🐾",
    categoryGroup: "saude",
    foregroundColor: "#f39c12",
  },
  // EDUCAÇÃO
  academia: {
    name: "Academia / Fitness",
    icon: "🏋️",
    welcomeMessage: "Olá! Quero informações sobre planos e horários 🏋️",
    categoryGroup: "educacao",
    foregroundColor: "#e74c3c",
  },
  escola: {
    name: "Escola / Cursos",
    icon: "📚",
    welcomeMessage: "Olá! Quero informações sobre cursos e matrículas 📚",
    categoryGroup: "educacao",
    foregroundColor: "#2980b9",
  },
  // IMOBILIÁRIO
  imobiliaria: {
    name: "Imobiliária / Corretor",
    icon: "🏠",
    welcomeMessage: "Olá! Tenho interesse em imóveis 🏠",
    categoryGroup: "imobiliario",
    foregroundColor: "#27ae60",
  },
  // AUTOMOTIVO
  oficina: {
    name: "Oficina Mecânica",
    icon: "🔧",
    welcomeMessage: "Olá! Preciso de um orçamento 🔧",
    categoryGroup: "automotivo",
    foregroundColor: "#2c3e50",
  },
  // VAREJO
  loja: {
    name: "Loja / Varejo",
    icon: "🛍️",
    welcomeMessage: "Olá! Quero ver os produtos disponíveis 🛍️",
    categoryGroup: "varejo",
    foregroundColor: "#e74c3c",
  },
  // GENÉRICO
  generico: {
    name: "Negócio Geral",
    icon: "💬",
    welcomeMessage: "Olá! Gostaria de mais informações 💬",
    categoryGroup: "geral",
    foregroundColor: "#2c3e50",
  },
};

type QrcodeStateSource = {
  whatsappNumber?: string | null;
  welcomeMessage?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  foregroundColor?: string | null;
  backgroundColor?: string | null;
  errorCorrection?: string | null;
  qrSize?: number | null;
  targetUrl?: string | null;
};

export function normalizePhoneDigits(value: string): string {
  let digits = "";

  for (const char of String(value || "")) {
    if (char >= "0" && char <= "9") {
      digits += char;
    }
  }

  return digits;
}

// ============================================================
// Helper: Build WhatsApp URL from number + optional message
// ============================================================

export function buildWhatsAppUrl(phoneNumber: string, message?: string): string {
  const digits = normalizePhoneDigits(phoneNumber);
  
  if (!message) {
    return `https://wa.me/${digits}`;
  }
  
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${digits}?text=${encoded}`;
}

export function resolveSmartQrcodeState(
  existing: QrcodeStateSource | null,
  input: Partial<QrcodeStateSource>
) {
  const templateRequested = input.templateId !== undefined;
  const nextTemplateId =
    input.templateId !== undefined
      ? input.templateId || null
      : existing?.templateId || null;
  const template = nextTemplateId ? QRCODE_TEMPLATES[nextTemplateId] ?? null : null;

  let welcomeMessage =
    input.welcomeMessage !== undefined
      ? input.welcomeMessage || null
      : existing?.welcomeMessage || null;
  let templateName =
    input.templateName !== undefined
      ? input.templateName || null
      : existing?.templateName || null;
  let foregroundColor =
    input.foregroundColor !== undefined
      ? input.foregroundColor || DEFAULT_FOREGROUND_COLOR
      : existing?.foregroundColor || DEFAULT_FOREGROUND_COLOR;

  if (template) {
    if (templateRequested && input.welcomeMessage === undefined) {
      welcomeMessage = template.welcomeMessage;
    } else if (!welcomeMessage) {
      welcomeMessage = template.welcomeMessage;
    }

    if (templateRequested && input.foregroundColor === undefined) {
      foregroundColor = template.foregroundColor;
    }

    templateName = template.name;
  } else if (templateRequested && !nextTemplateId) {
    templateName = null;
  }

  const resolved = {
    whatsappNumber:
      input.whatsappNumber !== undefined
        ? input.whatsappNumber || ""
        : existing?.whatsappNumber || "",
    welcomeMessage,
    templateId: nextTemplateId,
    templateName,
    foregroundColor,
    backgroundColor:
      input.backgroundColor !== undefined
        ? input.backgroundColor || DEFAULT_BACKGROUND_COLOR
        : existing?.backgroundColor || DEFAULT_BACKGROUND_COLOR,
    errorCorrection:
      (input.errorCorrection !== undefined
        ? input.errorCorrection
        : existing?.errorCorrection) || DEFAULT_ERROR_CORRECTION,
    qrSize:
      input.qrSize !== undefined
        ? input.qrSize || DEFAULT_QR_SIZE
        : existing?.qrSize || DEFAULT_QR_SIZE,
  };

  const targetUrl = buildWhatsAppUrl(
    resolved.whatsappNumber,
    resolved.welcomeMessage || undefined
  );

  const shouldRegenerate =
    !existing ||
    targetUrl !== (existing.targetUrl || "") ||
    resolved.foregroundColor !== (existing.foregroundColor || DEFAULT_FOREGROUND_COLOR) ||
    resolved.backgroundColor !== (existing.backgroundColor || DEFAULT_BACKGROUND_COLOR) ||
    resolved.errorCorrection !== (existing.errorCorrection || DEFAULT_ERROR_CORRECTION) ||
    resolved.qrSize !== (existing.qrSize || DEFAULT_QR_SIZE);

  return {
    ...resolved,
    targetUrl,
    shouldRegenerate,
  };
}

// ============================================================
// Generate QR Code as base64 PNG Data URL
// ============================================================

export async function generateQrCodeImage(options: {
  targetUrl: string;
  size?: number;
  foregroundColor?: string;
  backgroundColor?: string;
  errorCorrection?: "L" | "M" | "Q" | "H";
}): Promise<string> {
  const {
    targetUrl,
    size = 400,
    foregroundColor = "#000000",
    backgroundColor = "#ffffff",
    errorCorrection = "H",
  } = options;

  const dataUrl = await QRCode.toDataURL(targetUrl, {
    errorCorrectionLevel: errorCorrection,
    type: "image/png",
    margin: 1,
    width: size,
    color: {
      dark: foregroundColor,
      light: backgroundColor,
    },
  });

  return dataUrl;
}

// ============================================================
// Generate QR Code as SVG string
// ============================================================

export async function generateQrCodeSvg(options: {
  targetUrl: string;
  size?: number;
  foregroundColor?: string;
  backgroundColor?: string;
  errorCorrection?: "L" | "M" | "Q" | "H";
}): Promise<string> {
  const {
    targetUrl,
    size = 400,
    foregroundColor = "#000000",
    backgroundColor = "#ffffff",
    errorCorrection = "H",
  } = options;

  const svg = await QRCode.toString(targetUrl, {
    type: "svg",
    errorCorrectionLevel: errorCorrection,
    margin: 1,
    width: size,
    color: {
      dark: foregroundColor,
      light: backgroundColor,
    },
  } as any);

  return svg;
}

// ============================================================
// CRUD Operations
// ============================================================

/**
 * Create a new Smart QR Code for a user
 */
export async function createSmartQrcode(userId: string, input: SmartQrcodeInput): Promise<SmartQrcode> {
  // Generate slug if not provided
  let slug = input.slug;
  if (!slug) {
    slug = `${userId.slice(0, 8)}-${Date.now()}`;
  }

  const resolved = resolveSmartQrcodeState(null, input);

  // Generate QR Code image
  const qrData = await generateQrCodeImage({
    targetUrl: resolved.targetUrl,
    size: resolved.qrSize || DEFAULT_QR_SIZE,
    foregroundColor: resolved.foregroundColor || DEFAULT_FOREGROUND_COLOR,
    backgroundColor: resolved.backgroundColor || DEFAULT_BACKGROUND_COLOR,
    errorCorrection: (resolved.errorCorrection || DEFAULT_ERROR_CORRECTION) as "L" | "M" | "Q" | "H",
  });

  const [qrcode] = await db
    .insert(smartQrcodes)
    .values({
      userId,
      name: input.name,
      description: input.description || null,
      slug,
      whatsappNumber: resolved.whatsappNumber,
      welcomeMessage: resolved.welcomeMessage || null,
      templateId: resolved.templateId || null,
      templateName: resolved.templateName || null,
      foregroundColor: resolved.foregroundColor || DEFAULT_FOREGROUND_COLOR,
      backgroundColor: resolved.backgroundColor || DEFAULT_BACKGROUND_COLOR,
      logoUrl: input.logoUrl || null,
      logoSize: input.logoSize || 20,
      cornerRadius: input.cornerRadius || 0,
      errorCorrection: resolved.errorCorrection || DEFAULT_ERROR_CORRECTION,
      targetUrl: resolved.targetUrl,
      qrData,
      qrGeneratedAt: new Date(),
      qrSize: resolved.qrSize || DEFAULT_QR_SIZE,
      isActive: input.isActive ?? true,
    })
    .returning();

  return qrcode;
}

/**
 * List all QR Codes for a user
 */
export async function listUserQrcodes(userId: string): Promise<SmartQrcode[]> {
  return db
    .select()
    .from(smartQrcodes)
    .where(eq(smartQrcodes.userId, userId))
    .orderBy(smartQrcodes.createdAt);
}

/**
 * Get a single QR Code by ID (must belong to user)
 */
export async function getQrcodeById(userId: string, qrcodeId: string): Promise<SmartQrcode | null> {
  const [qrcode] = await db
    .select()
    .from(smartQrcodes)
    .where(and(eq(smartQrcodes.id, qrcodeId), eq(smartQrcodes.userId, userId)));

  return qrcode || null;
}

/**
 * Update a QR Code (regenerates QR image if visual options changed)
 */
export async function updateQrcode(
  userId: string,
  qrcodeId: string,
  input: UpdateSmartQrcodeInput
): Promise<SmartQrcode | null> {
  const existing = await getQrcodeById(userId, qrcodeId);
  if (!existing) return null;

  const resolved = resolveSmartQrcodeState(existing, input);

  let qrData = existing.qrData;
  let qrGeneratedAt = existing.qrGeneratedAt;

  if (resolved.shouldRegenerate) {
    qrData = await generateQrCodeImage({
      targetUrl: resolved.targetUrl,
      size: resolved.qrSize || DEFAULT_QR_SIZE,
      foregroundColor: resolved.foregroundColor || DEFAULT_FOREGROUND_COLOR,
      backgroundColor: resolved.backgroundColor || DEFAULT_BACKGROUND_COLOR,
      errorCorrection: (resolved.errorCorrection || DEFAULT_ERROR_CORRECTION) as "L" | "M" | "Q" | "H",
    });
    qrGeneratedAt = new Date();
  }

  const [updated] = await db
    .update(smartQrcodes)
    .set({
      ...input,
      whatsappNumber: resolved.whatsappNumber,
      welcomeMessage: resolved.welcomeMessage || null,
      templateId: resolved.templateId || null,
      templateName: resolved.templateName || null,
      foregroundColor: resolved.foregroundColor || DEFAULT_FOREGROUND_COLOR,
      backgroundColor: resolved.backgroundColor || DEFAULT_BACKGROUND_COLOR,
      errorCorrection: resolved.errorCorrection || DEFAULT_ERROR_CORRECTION,
      qrSize: resolved.qrSize || DEFAULT_QR_SIZE,
      targetUrl: resolved.targetUrl,
      qrData,
      qrGeneratedAt: qrGeneratedAt || undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(smartQrcodes.id, qrcodeId), eq(smartQrcodes.userId, userId)))
    .returning();

  return updated || null;
}

/**
 * Delete a QR Code
 */
export async function deleteQrcode(userId: string, qrcodeId: string): Promise<boolean> {
  const result = await db
    .delete(smartQrcodes)
    .where(and(eq(smartQrcodes.id, qrcodeId), eq(smartQrcodes.userId, userId)))
    .returning({ id: smartQrcodes.id });

  return result.length > 0;
}

/**
 * Register a scan event for analytics
 */
export async function registerQrcodeScan(
  qrcodeId: string,
  userId: string,
  metadata?: { userAgent?: string; ipAddress?: string; referrer?: string }
): Promise<void> {
  // Insert scan log
  await db.insert(qrcodeScanLogs).values({
    qrcodeId,
    userId,
    scannedAt: new Date(),
    userAgent: metadata?.userAgent || null,
    ipAddress: metadata?.ipAddress || null,
    referrer: metadata?.referrer || null,
  });

  // Increment counter on the QR code
  await db
    .update(smartQrcodes)
    .set({
      scanCount: (await db
        .select({ scanCount: smartQrcodes.scanCount })
        .from(smartQrcodes)
        .where(eq(smartQrcodes.id, qrcodeId))
        .then((r) => (r[0]?.scanCount || 0) + 1)),
      lastScannedAt: new Date(),
    })
    .where(eq(smartQrcodes.id, qrcodeId));
}

/**
 * Get available templates list (for frontend display)
 */
export function getQrcodeTemplates() {
  return Object.entries(QRCODE_TEMPLATES).map(([id, template]) => ({
    id,
    ...template,
  }));
}
