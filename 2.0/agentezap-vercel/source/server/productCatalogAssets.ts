export interface ProductMediaAsset {
  id: string;
  product_id: string;
  user_id?: string | null;
  storage_url: string;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  caption: string | null;
  variation_code: number | null;
  variation_name: string | null;
  variation_price: string | null;
  variation_stock: number | null;
  variation_is_active: boolean;
  display_order: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProductWithMediaShape {
  id: string;
  image_url?: string | null;
  [key: string]: any;
}

export interface ProductWithAttachedMedia<T extends ProductWithMediaShape> extends T {
  media_items: ProductMediaAsset[];
  image_count: number;
  primary_image_url: string | null;
}

function toInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalNumericString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

export function normalizeProductMediaAsset(row: any): ProductMediaAsset {
  return {
    id: String(row?.id ?? ""),
    product_id: String(row?.product_id ?? row?.productId ?? ""),
    user_id: row?.user_id ?? row?.userId ?? null,
    storage_url: String(row?.storage_url ?? row?.storageUrl ?? ""),
    storage_path: row?.storage_path ?? row?.storagePath ?? null,
    file_name: row?.file_name ?? row?.fileName ?? null,
    file_size: typeof row?.file_size === "number" ? row.file_size : (typeof row?.fileSize === "number" ? row.fileSize : null),
    mime_type: row?.mime_type ?? row?.mimeType ?? null,
    caption: row?.caption ?? null,
    variation_code: toOptionalInt(row?.variation_code ?? row?.variationCode),
    variation_name: toOptionalNumericString(row?.variation_name ?? row?.variationName),
    variation_price: toOptionalNumericString(row?.variation_price ?? row?.variationPrice),
    variation_stock: toOptionalInt(row?.variation_stock ?? row?.variationStock),
    variation_is_active: row?.variation_is_active !== false && row?.variationIsActive !== false,
    display_order: toInt(row?.display_order ?? row?.displayOrder),
    created_at: row?.created_at ?? row?.createdAt ?? null,
    updated_at: row?.updated_at ?? row?.updatedAt ?? null,
  };
}

export function buildLegacyProductMediaAsset(product: ProductWithMediaShape): ProductMediaAsset | null {
  const imageUrl = typeof product.image_url === "string" ? product.image_url.trim() : "";
  if (!imageUrl) {
    return null;
  }

  return {
    id: `legacy:${product.id}`,
    product_id: product.id,
    user_id: null,
    storage_url: imageUrl,
    storage_path: null,
    file_name: null,
    file_size: null,
    mime_type: null,
    caption: null,
    variation_code: 1,
    variation_name: null,
    variation_price: null,
    variation_stock: null,
    variation_is_active: true,
    display_order: 0,
    created_at: null,
    updated_at: null,
  };
}

export function attachMediaToProducts<T extends ProductWithMediaShape>(
  products: T[],
  mediaRows: any[],
): Array<ProductWithAttachedMedia<T>> {
  const mediaByProduct = new Map<string, ProductMediaAsset[]>();

  for (const row of mediaRows || []) {
    const media = normalizeProductMediaAsset(row);
    if (!media.product_id || !media.storage_url) continue;
    const list = mediaByProduct.get(media.product_id) || [];
    list.push(media);
    mediaByProduct.set(media.product_id, list);
  }

  return products.map((product) => {
    const existingMedia = [...(mediaByProduct.get(product.id) || [])].sort((a, b) => {
      if (a.display_order !== b.display_order) {
        return a.display_order - b.display_order;
      }
      return a.id.localeCompare(b.id);
    });

    const legacyMedia = existingMedia.length === 0 ? buildLegacyProductMediaAsset(product) : null;
    const media_items = legacyMedia ? [legacyMedia] : existingMedia;

    return {
      ...product,
      media_items,
      image_count: media_items.length,
      primary_image_url: media_items[0]?.storage_url || (typeof product.image_url === "string" ? product.image_url : null) || null,
    };
  });
}

export async function fetchProductMediaRows(params: {
  supabase: any;
  userId: string;
  productIds: string[];
}): Promise<ProductMediaAsset[]> {
  const productIds = Array.from(new Set((params.productIds || []).filter(Boolean)));
  if (productIds.length === 0) {
    return [];
  }

  const { data, error } = await params.supabase
    .from("product_media")
    .select("*")
    .eq("user_id", params.userId)
    .in("product_id", productIds)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(normalizeProductMediaAsset);
}
