import { randomUUID } from "crypto";

import { createSupabaseServiceClient } from "./supabaseService";

const BUCKET_NAME = "whatsapp-media";
const UNIQUE_MEDIA_CACHE_SECONDS = "604800";

export interface MediaUploadResult {
  url: string;
  path: string;
  size: number;
}

function getExtensionFromMimeType(mimeType: string): string {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("pdf")) return "pdf";
  return "bin";
}

export async function uploadMediaToStorage(
  buffer: Buffer,
  mimeType: string,
  userId: string,
  conversationId?: string,
): Promise<MediaUploadResult | null> {
  try {
    if (!buffer?.length) return null;

    const supabase = createSupabaseServiceClient();
    const extension = getExtensionFromMimeType(mimeType);
    const timestamp = Date.now();
    const uuid = randomUUID().slice(0, 8);
    const safeOwner = String(userId || "system").replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeConversation = conversationId ? String(conversationId).replace(/[^a-zA-Z0-9_-]/g, "_") : null;
    const fileName = safeConversation
      ? `${safeConversation}_${timestamp}_${uuid}.${extension}`
      : `${timestamp}_${uuid}.${extension}`;
    const filePath = `${safeOwner}/${fileName}`;

    const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, buffer, {
      contentType: mimeType,
      cacheControl: UNIQUE_MEDIA_CACHE_SECONDS,
      upsert: false,
    });

    if (error) {
      console.error("[MediaStorage] Upload failed:", error.message);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    if (!data?.publicUrl) {
      console.error("[MediaStorage] Failed to get public URL");
      return null;
    }

    return {
      url: data.publicUrl,
      path: filePath,
      size: buffer.length,
    };
  } catch (error) {
    console.error("[MediaStorage] Unexpected upload error:", error);
    return null;
  }
}

export function isBase64Url(url: string): boolean {
  return String(url || "").startsWith("data:");
}
