import { z } from "zod";

import { clampScore, extractFirstJsonObject, trimText } from "./leadIntelligenceHelpers";

const delivery2OrderItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  size: z.string().nullable().optional(),
  unitPrice: z.coerce.number().min(0).nullable().optional(),
  totalPrice: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
  selectedOptions: z.array(z.string()).max(12).default([]),
  halfAndHalf: z.array(z.string()).max(4).default([]),
});

export const delivery2OrderSchema = z.object({
  hasFinalizedOrder: z.boolean(),
  status: z.enum(["pending", "not_finalized", "cancelled"]),
  customerName: z.string().nullable().optional(),
  deliveryType: z.enum(["delivery", "pickup"]).nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  customerAddress: z.string().nullable().optional(),
  customerComplement: z.string().nullable().optional(),
  customerReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  summary: z.string().min(1),
  evidence: z.array(z.string()).max(6).default([]),
  subtotal: z.coerce.number().min(0).nullable().optional(),
  deliveryFee: z.coerce.number().min(0).nullable().optional(),
  total: z.coerce.number().min(0).nullable().optional(),
  confidence: z.coerce.number().min(0).max(100),
  items: z.array(delivery2OrderItemSchema).max(20).default([]),
});

export type Delivery2ParsedOrder = z.infer<typeof delivery2OrderSchema>;

export function parseDelivery2Order(raw: string) {
  const jsonText = extractFirstJsonObject(String(raw || ""));
  const parsed = delivery2OrderSchema.parse(JSON.parse(jsonText));

  const normalizedItems = parsed.items
    .map((item) => {
      const quantity = Math.max(1, Math.min(50, Math.round(Number(item.quantity) || 1)));
      const unitPrice =
        typeof item.unitPrice === "number" && Number.isFinite(item.unitPrice) ? item.unitPrice : null;
      const inferredTotal =
        typeof item.totalPrice === "number" && Number.isFinite(item.totalPrice)
          ? item.totalPrice
          : unitPrice !== null
            ? unitPrice * quantity
            : null;

      return {
        name: trimText(item.name, 160),
        quantity,
        size: trimText(item.size || "", 60) || null,
        unitPrice,
        totalPrice: inferredTotal,
        notes: trimText(item.notes || "", 220) || null,
        selectedOptions: item.selectedOptions
          .map((entry) => trimText(entry, 80))
          .filter(Boolean)
          .slice(0, 12),
        halfAndHalf: item.halfAndHalf
          .map((entry) => trimText(entry, 80))
          .filter(Boolean)
          .slice(0, 4),
      };
    })
    .filter((item) => item.name.length > 0);

  const subtotal =
    typeof parsed.subtotal === "number" && Number.isFinite(parsed.subtotal)
      ? parsed.subtotal
      : normalizedItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const deliveryFee =
    typeof parsed.deliveryFee === "number" && Number.isFinite(parsed.deliveryFee) ? parsed.deliveryFee : 0;
  const total =
    typeof parsed.total === "number" && Number.isFinite(parsed.total)
      ? parsed.total
      : subtotal + deliveryFee;

  return {
    hasFinalizedOrder: parsed.status === "pending" ? true : parsed.hasFinalizedOrder,
    status: parsed.status,
    customerName: trimText(parsed.customerName || "", 120) || null,
    deliveryType: parsed.deliveryType || null,
    paymentMethod: trimText(parsed.paymentMethod || "", 80) || null,
    customerAddress: trimText(parsed.customerAddress || "", 240) || null,
    customerComplement: trimText(parsed.customerComplement || "", 120) || null,
    customerReference: trimText(parsed.customerReference || "", 160) || null,
    notes: trimText(parsed.notes || "", 260) || null,
    summary: trimText(parsed.summary, 260),
    evidence: parsed.evidence
      .map((entry) => trimText(entry, 140))
      .filter(Boolean)
      .slice(0, 4),
    subtotal,
    deliveryFee,
    total,
    confidence: clampScore(parsed.confidence),
    items: normalizedItems,
  };
}
