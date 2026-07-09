import type { Conversation } from "@shared/schema";
import { extractMeaningfulContactName } from "@shared/contactNameVisibility";
import { resolveMemberPermissions } from "./member-permissions";

export type ConversationIdentityLike = Partial<Conversation> & {
  id?: string | null;
};

function isMemberSession(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage.getItem("memberToken");
  } catch {
    return false;
  }
}

function canMemberViewPhoneNumbers(): boolean {
  if (!isMemberSession()) {
    return true;
  }

  try {
    const rawMemberData = window.localStorage.getItem("memberData");
    if (!rawMemberData) {
      return false;
    }

    const memberData = JSON.parse(rawMemberData) as { permissions?: Record<string, unknown> } | null;
    return resolveMemberPermissions(memberData?.permissions).canViewPhoneNumbers;
  } catch {
    return false;
  }
}

export function canCurrentSessionViewConversationNumber(): boolean {
  return canMemberViewPhoneNumbers();
}

function buildSafeConversationLabel(conversation: ConversationIdentityLike | null | undefined): string {
  const existingName = extractMeaningfulContactName(conversation?.contactName);
  if (existingName) {
    return existingName;
  }

  const safeId = String(conversation?.id || "").slice(0, 6).toUpperCase();
  return safeId ? `Contato ${safeId}` : "Contato em atendimento";
}

function normalizeConversationCollection(value: unknown): ConversationIdentityLike[] {
  if (Array.isArray(value)) {
    return value as ConversationIdentityLike[];
  }

  if (value && typeof value === "object" && Array.isArray((value as any).data)) {
    return (value as any).data as ConversationIdentityLike[];
  }

  return [];
}

export function findConversationInCache(
  cacheEntries: Array<[unknown, unknown]>,
  conversationId: string | null | undefined,
): ConversationIdentityLike | null {
  if (!conversationId) {
    return null;
  }

  for (const [, value] of cacheEntries) {
    for (const conversation of normalizeConversationCollection(value)) {
      if (conversation?.id === conversationId) {
        return conversation;
      }
    }
  }

  return null;
}

export function mergeConversationIdentity<T extends ConversationIdentityLike | null | undefined>(
  primary: T,
  fallback?: ConversationIdentityLike | null,
): ConversationIdentityLike | null {
  if (!primary && !fallback) {
    return null;
  }

  const base: ConversationIdentityLike = fallback ?? {};
  const source: ConversationIdentityLike = primary ?? {};

  return {
    ...base,
    ...source,
    contactName: source.contactName || base.contactName || undefined,
    contactAvatar: source.contactAvatar || base.contactAvatar || undefined,
    contactNumber: source.contactNumber || base.contactNumber || undefined,
    remoteJid: source.remoteJid || base.remoteJid || undefined,
  };
}

export function getConversationDisplayNumber(conversation: ConversationIdentityLike | null | undefined): string {
  if (!canMemberViewPhoneNumbers()) {
    return "";
  }

  return (
    conversation?.contactNumber ||
    conversation?.remoteJid?.split("@")[0]?.split(":")[0] ||
    ""
  );
}

export function getConversationDisplayName(conversation: ConversationIdentityLike | null | undefined): string {
  const meaningfulName = extractMeaningfulContactName(conversation?.contactName);

  if (!canMemberViewPhoneNumbers()) {
    return meaningfulName || buildSafeConversationLabel(conversation);
  }

  return meaningfulName || getConversationDisplayNumber(conversation) || "Contato sem nome";
}
