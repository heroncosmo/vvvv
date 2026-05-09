import { buildCatalogProductImageMediaName } from "./productCatalogMediaService";

export interface CatalogProductImageActionInput {
  id: string;
  storage_url: string;
  file_name?: string | null;
  variation_code?: number | null;
  variation_name?: string | null;
  variation_price?: string | null;
  variation_stock?: number | null;
  variation_is_active?: boolean;
  display_order?: number | null;
}

export interface CatalogProductActionInput {
  id: string;
  name: string;
  price?: string | null;
  description?: string | null;
  stock?: number | null;
  controlStock?: boolean;
  sendDescriptionWithImages?: boolean;
  imageVariationsEnabled?: boolean;
  images: CatalogProductImageActionInput[];
}

export type CatalogProductDeliveryAction =
  | {
      type: "send_media_url";
      media_name: string;
      media_url: string;
      media_type: "image";
      caption?: string;
      file_name?: string;
    }
  | {
      type: "send_text";
      text: string;
    };

function normalizeSentMediaNames(sentMedias: string[]): Set<string> {
  return new Set(
    sentMedias
      .map((item) => String(item || "").trim().toUpperCase())
      .filter(Boolean),
  );
}

function normalizeCatalogProductStock(stock?: number | null): number {
  if (typeof stock === "number" && Number.isFinite(stock)) {
    return stock;
  }

  const parsed = Number(stock ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatVariationPrice(price?: string | null): string | null {
  const normalized = String(price || "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized.replace(",", "."));
  if (!Number.isFinite(parsed)) return normalized;
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function hasCatalogVariationMetadata(
  image?: Pick<
    CatalogProductImageActionInput,
    "variation_code" | "variation_name" | "variation_price" | "variation_stock"
  > | null,
): boolean {
  if (!image) {
    return false;
  }

  if (typeof image.variation_code === "number" && Number.isFinite(image.variation_code)) {
    return true;
  }

  if (String(image.variation_name || "").trim()) {
    return true;
  }

  if (String(image.variation_price || "").trim()) {
    return true;
  }

  return typeof image.variation_stock === "number" && Number.isFinite(image.variation_stock);
}

function buildCatalogVariationCaption(
  product: CatalogProductActionInput,
  image: CatalogProductImageActionInput,
  index: number,
): string | undefined {
  const lines: string[] = [];
  const treatAsVariation = product.imageVariationsEnabled === true || hasCatalogVariationMetadata(image);
  if (index === 0 || treatAsVariation) {
    lines.push(product.name);
  }

  if (treatAsVariation) {
    if (typeof image.variation_code === "number" && Number.isFinite(image.variation_code)) {
      lines.push(`Código ${image.variation_code}`);
    }

    const variationName = String(image.variation_name || "").trim();
    if (variationName) {
      lines.push(`Nome ${variationName}`);
    }

    const priceLabel = formatVariationPrice(image.variation_price) || formatVariationPrice(product.price);
    if (priceLabel) {
      lines.push(`Preço ${priceLabel}`);
    }

    if (typeof image.variation_stock === "number" && Number.isFinite(image.variation_stock)) {
      lines.push(`Estoque ${image.variation_stock}`);
    }
  }

  const caption = lines.map((line) => String(line || "").trim()).filter(Boolean).join("\n").trim();
  return caption || undefined;
}

export function isCatalogProductAvailable(
  product: Pick<CatalogProductActionInput, "controlStock" | "stock">,
): boolean {
  if (product.controlStock !== true) {
    return true;
  }

  return normalizeCatalogProductStock(product.stock) > 0;
}

export function buildCatalogProductDeliveryActions(
  product: CatalogProductActionInput,
  sentMedias: string[] = [],
): CatalogProductDeliveryAction[] {
  if (!isCatalogProductAvailable(product)) {
    return [];
  }

  const actions: CatalogProductDeliveryAction[] = [];
  const sentMediaNames = normalizeSentMediaNames(sentMedias);
  let appendedImageCount = 0;

  const orderedImages = [...(product.images || [])].sort(
    (a, b) => Number(a.display_order || 0) - Number(b.display_order || 0),
  );

  for (const [index, image] of orderedImages.entries()) {
    const treatAsVariation = product.imageVariationsEnabled === true || hasCatalogVariationMetadata(image);
    if (treatAsVariation && image.variation_is_active === false) {
      continue;
    }

    const mediaName = buildCatalogProductImageMediaName(product.id, image.id);
    if (sentMediaNames.has(mediaName.toUpperCase())) {
      continue;
    }

    actions.push({
      type: "send_media_url",
      media_name: mediaName,
      media_url: image.storage_url,
      media_type: "image",
      caption: buildCatalogVariationCaption(product, image, index),
      file_name: image.file_name || undefined,
    });
    appendedImageCount += 1;
  }

  const description = String(product.description || "").trim();
  if (appendedImageCount > 0 && product.sendDescriptionWithImages && description) {
    actions.push({
      type: "send_text",
      text: description,
    });
  }

  return actions;
}
