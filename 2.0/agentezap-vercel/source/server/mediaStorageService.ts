/**
 * 🗄️ MEDIA STORAGE SERVICE
 * 
 * Serviço para upload de mídias (imagens, áudios, vídeos) para o Supabase Storage
 * em vez de salvar como base64 no banco de dados.
 * 
 * BENEFÍCIOS:
 * - Reduz Egress do banco em até 90%
 * - Mídias são servidas via CDN (Cached Egress)
 * - Banco fica mais leve e queries mais rápidas
 */

import { supabase } from "./supabaseAuth";
import { randomUUID } from "crypto";

const BUCKET_NAME = "whatsapp-media";
const UNIQUE_MEDIA_CACHE_SECONDS = "604800"; // 7 days for immutable timestamp+UUID media paths

export interface MediaUploadResult {
  url: string;
  path: string;
  size: number;
}

/**
 * Faz upload de um buffer de mídia para o Supabase Storage
 * @param buffer - Buffer contendo os dados da mídia
 * @param mimeType - Tipo MIME do arquivo (ex: image/jpeg, audio/ogg)
 * @param userId - ID do usuário para organização em pastas
 * @param conversationId - ID da conversa (opcional)
 * @returns URL pública da mídia ou null em caso de erro
 */
export async function uploadMediaToStorage(
  buffer: Buffer,
  mimeType: string,
  userId: string,
  conversationId?: string
): Promise<MediaUploadResult | null> {
  try {
    // Determinar extensão baseada no mime type
    const extension = getExtensionFromMimeType(mimeType);
    
    // Criar path único: userId/conversationId_timestamp_uuid.ext
    const timestamp = Date.now();
    const uuid = randomUUID().slice(0, 8);
    const fileName = conversationId 
      ? `${conversationId}_${timestamp}_${uuid}.${extension}`
      : `${timestamp}_${uuid}.${extension}`;
    const filePath = `${userId}/${fileName}`;

    console.log(`📤 [MediaStorage] Uploading ${buffer.length} bytes to ${filePath}...`);

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: mimeType,
        cacheControl: UNIQUE_MEDIA_CACHE_SECONDS,
        upsert: false,
      });

    if (error) {
      console.error(`❌ [MediaStorage] Upload failed:`, error.message);
      return null;
    }

    // Obter URL pública
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) {
      console.error(`❌ [MediaStorage] Failed to get public URL`);
      return null;
    }

    console.log(`✅ [MediaStorage] Uploaded successfully: ${urlData.publicUrl}`);
    
    return {
      url: urlData.publicUrl,
      path: filePath,
      size: buffer.length,
    };
  } catch (error) {
    console.error(`❌ [MediaStorage] Unexpected error:`, error);
    return null;
  }
}

/**
 * Converte uma mídia base64 para URL do Storage
 * @param base64DataUrl - String no formato data:mime/type;base64,xxx
 * @param userId - ID do usuário
 * @param conversationId - ID da conversa (opcional)
 * @returns URL do storage ou a URL original se falhar
 */
export async function convertBase64ToStorageUrl(
  base64DataUrl: string,
  userId: string,
  conversationId?: string
): Promise<string> {
  try {
    if (!base64DataUrl.startsWith("data:")) {
      // Já é uma URL normal, retorna como está
      return base64DataUrl;
    }

    // Extrair mime type e dados base64
    const matches = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      console.error(`❌ [MediaStorage] Invalid base64 format`);
      return base64DataUrl;
    }

    const [, mimeType, base64Data] = matches;
    const buffer = Buffer.from(base64Data, "base64");

    const result = await uploadMediaToStorage(buffer, mimeType, userId, conversationId);
    if (!result) {
      // Fallback: retorna o base64 original
      return base64DataUrl;
    }

    return result.url;
  } catch (error) {
    console.error(`❌ [MediaStorage] Convert error:`, error);
    return base64DataUrl;
  }
}

/**
 * Deleta uma mídia do Storage
 */
export async function deleteMediaFromStorage(filePath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      console.error(`❌ [MediaStorage] Delete failed:`, error.message);
      return false;
    }

    console.log(`🗑️ [MediaStorage] Deleted: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ [MediaStorage] Delete error:`, error);
    return false;
  }
}

/**
 * Obtém extensão de arquivo baseada no MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    // Imagens
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    // Áudio
    "audio/ogg": "ogg",
    "audio/ogg; codecs=opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
    // Vídeo
    "video/mp4": "mp4",
    "video/webm": "webm",
    // Documentos
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };

  return mimeMap[mimeType] || mimeMap[mimeType.split(";")[0]] || "bin";
}

/**
 * Verifica se uma URL é do Supabase Storage (já migrada)
 */
export function isStorageUrl(url: string): boolean {
  if (!url) return false;
  return url.includes("supabase.co/storage") || url.includes("/storage/v1/object/");
}

/**
 * Verifica se uma URL é base64 (precisa migrar)
 */
export function isBase64Url(url: string): boolean {
  if (!url) return false;
  return url.startsWith("data:");
}
