import { storage } from "./storage";
import { supabase } from "./supabaseAuth";
import { isBase64Url } from "./mediaStorageService";

function normalizePhoneDigits(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

function matchPhoneSuffix(candidate: string | null | undefined, target: string): boolean {
  const digits = normalizePhoneDigits(candidate);
  if (!digits || !target) return false;
  return (
    digits === target ||
    digits.endsWith(target) ||
    target.endsWith(digits) ||
    digits.slice(-11) === target.slice(-11)
  );
}

async function resolveUserIdForReceipt(params: {
  userId?: string;
  phoneNumber?: string;
}): Promise<string | null> {
  if (params.userId) {
    const user = await storage.getUser(params.userId);
    if (user?.id) return user.id;
  }

  const normalizedPhone = normalizePhoneDigits(params.phoneNumber);
  if (!normalizedPhone) return null;

  const userByPhone = await storage.getUserByPhone(normalizedPhone);
  if (userByPhone?.id) return userByPhone.id;

  const users = await storage.getAllUsers();
  const matchedUser = users.find(
    (candidate: any) =>
      matchPhoneSuffix(candidate.phone, normalizedPhone) ||
      matchPhoneSuffix(candidate.whatsappNumber, normalizedPhone) ||
      matchPhoneSuffix(candidate.whatsapp_number, normalizedPhone),
  );

  return matchedUser?.id || null;
}

async function ensurePaymentReceiptBucket(): Promise<void> {
  const { error } = await supabase.storage.getBucket("payment-receipts");
  if (error && error.message?.includes("not found")) {
    await supabase.storage.createBucket("payment-receipts", {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024,
    });
  }
}

function normalizeReceiptMimeType(
  mimeTypeHint?: string | null,
  fetchedMimeType?: string | null,
): string {
  const mimeType = String(mimeTypeHint || fetchedMimeType || "").trim();
  if (mimeType) return mimeType;
  return "application/octet-stream";
}

function extensionFromMimeType(mimeType: string): string {
  const clean = mimeType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/octet-stream": "bin",
  };
  return map[clean] || "bin";
}

function guessOriginalFileName(sourceUrl: string, mimeType: string): string {
  if (!isBase64Url(sourceUrl)) {
    try {
      const url = new URL(sourceUrl);
      const lastSegment = url.pathname.split("/").pop();
      if (lastSegment) {
        return decodeURIComponent(lastSegment);
      }
    } catch {
      // fall through
    }
  }

  return `comprovante-${Date.now()}.${extensionFromMimeType(mimeType)}`;
}

async function downloadReceiptBuffer(params: {
  sourceUrl: string;
  mimeTypeHint?: string;
}): Promise<{ buffer: Buffer; mimeType: string; originalFileName: string }> {
  const { sourceUrl, mimeTypeHint } = params;

  if (isBase64Url(sourceUrl)) {
    const matches = sourceUrl.match(/^data:([^,]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Formato de comprovante invalido");
    }

    const mimeType = normalizeReceiptMimeType(mimeTypeHint, matches[1]);
    return {
      buffer: Buffer.from(matches[2], "base64"),
      mimeType,
      originalFileName: guessOriginalFileName(sourceUrl, mimeType),
    };
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar comprovante: ${response.status} ${response.statusText}`);
  }

  const mimeType = normalizeReceiptMimeType(mimeTypeHint, response.headers.get("content-type"));
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType,
    originalFileName: guessOriginalFileName(sourceUrl, mimeType),
  };
}

async function resolveSubscriptionForReceipt(userId: string) {
  let subscription = await storage.getUserSubscription(userId);

  if (!subscription) {
    const activePlans = await storage.getActivePlans();
    const selectedPlan = [...activePlans].sort(
      (a: any, b: any) => Number(a.preco || 0) - Number(b.preco || 0),
    )[0];

    if (!selectedPlan) {
      throw new Error("Nao ha plano ativo para vincular o comprovante");
    }

    await storage.createSubscription({
      userId,
      planId: selectedPlan.id,
      status: "pending",
      dataInicio: new Date(),
      dataFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paymentMethod: "pix_manual",
    });

    subscription = await storage.getUserSubscription(userId);
  }

  if (!subscription) {
    throw new Error("Nao consegui preparar a assinatura para registrar o comprovante");
  }

  return subscription;
}

export async function registerPaymentReceiptFromWhatsApp(params: {
  userId?: string;
  phoneNumber?: string;
  sourceUrl: string;
  amount?: string | number | null;
  paymentId?: string | null;
  mimeTypeHint?: string | null;
}): Promise<{
  receiptId: string;
  receiptUrl: string;
  subscriptionId: string;
  userId: string;
  amount: number;
}> {
  const sourceUrl = String(params.sourceUrl || "").trim();
  if (!sourceUrl) {
    throw new Error("Comprovante nao informado");
  }

  const userId = await resolveUserIdForReceipt({
    userId: params.userId,
    phoneNumber: params.phoneNumber,
  });

  if (!userId) {
    throw new Error("Nao achei a conta para vincular esse comprovante");
  }

  const subscription = await resolveSubscriptionForReceipt(userId);
  const providedPaymentId = String(params.paymentId || "").trim();
  const paymentId = providedPaymentId || `whatsapp_receipt_${userId}_${Date.now()}`;

  const parsedAmount = Number.parseFloat(String(params.amount || ""));
  const fallbackAmount = Number.parseFloat(String((subscription.plan as any)?.preco || 99.99));
  const amount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : fallbackAmount;

  let duplicatesQuery = supabase
    .from("payment_receipts")
    .select("id, receipt_url")
    .eq("subscription_id", subscription.id)
    .eq("status", "pending");

  if (providedPaymentId) {
    duplicatesQuery = duplicatesQuery.eq("mp_payment_id", providedPaymentId);
  }

  const { data: duplicateReceipts } = await duplicatesQuery;
  if (duplicateReceipts && duplicateReceipts.length > 0) {
    const pathsToRemove = duplicateReceipts
      .map((receipt: any) => {
        const url = String(receipt.receipt_url || "");
        if (url.startsWith("receipts/")) return url;
        const marker = "/payment-receipts/";
        const markerIndex = url.indexOf(marker);
        return markerIndex === -1 ? null : url.slice(markerIndex + marker.length);
      })
      .filter(Boolean) as string[];

    if (pathsToRemove.length > 0) {
      await supabase.storage.from("payment-receipts").remove(pathsToRemove);
    }

    await supabase
      .from("payment_receipts")
      .delete()
      .in("id", duplicateReceipts.map((receipt: any) => receipt.id));
  }

  await ensurePaymentReceiptBucket();

  const { buffer, mimeType, originalFileName } = await downloadReceiptBuffer({
    sourceUrl,
    mimeTypeHint: params.mimeTypeHint || undefined,
  });

  const safeOriginalName = originalFileName.replace(/[^\w.\-]+/g, "_");
  const fileName = `receipts/whatsapp/${userId}/${Date.now()}_${safeOriginalName}`;
  const { error: uploadError } = await supabase.storage
    .from("payment-receipts")
    .upload(fileName, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Erro ao fazer upload do comprovante: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage.from("payment-receipts").getPublicUrl(fileName);
  const receiptUrl = urlData?.publicUrl || fileName;

  const { data: receipt, error: insertError } = await supabase
    .from("payment_receipts")
    .insert({
      user_id: userId,
      subscription_id: subscription.id,
      plan_id: subscription.planId,
      amount,
      receipt_url: receiptUrl,
      receipt_filename: originalFileName,
      receipt_mime_type: mimeType,
      status: "pending",
      mp_payment_id: paymentId,
    })
    .select()
    .single();

  if (insertError || !receipt) {
    throw new Error(insertError?.message || "Erro ao salvar comprovante");
  }

  await supabase
    .from("subscriptions")
    .update({
      status: "pending_payment",
      pending_receipt: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription.id);

  return {
    receiptId: receipt.id,
    receiptUrl,
    subscriptionId: subscription.id,
    userId,
    amount,
  };
}
