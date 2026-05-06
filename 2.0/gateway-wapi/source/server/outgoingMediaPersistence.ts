import { uploadMediaToStorage } from "./mediaStorageService";

type PreparedOutgoingMedia = {
  buffer: Buffer;
  persistedMediaUrl: string | null;
};

function isRemoteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function decodeMediaData(data: string): Buffer {
  if (data.startsWith("data:")) {
    const [, base64Data = ""] = data.split(",", 2);
    return Buffer.from(base64Data, "base64");
  }

  return Buffer.from(data, "base64");
}

async function downloadRemoteMediaBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar mídia remota: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function prepareOutgoingMediaForSend(params: {
  mediaData: string;
  mimeType: string;
  ownerId: string;
  conversationId?: string;
}): Promise<PreparedOutgoingMedia> {
  const trimmedData = String(params.mediaData || "").trim();
  if (!trimmedData) {
    throw new Error("Mídia vazia");
  }

  if (isRemoteUrl(trimmedData)) {
    return {
      buffer: await downloadRemoteMediaBuffer(trimmedData),
      persistedMediaUrl: trimmedData,
    };
  }

  const buffer = decodeMediaData(trimmedData);
  const uploadResult = await uploadMediaToStorage(
    buffer,
    params.mimeType,
    params.ownerId,
    params.conversationId,
  );

  return {
    buffer,
    persistedMediaUrl: uploadResult?.url || trimmedData,
  };
}
