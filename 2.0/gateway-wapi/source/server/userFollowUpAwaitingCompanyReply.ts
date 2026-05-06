export const WAITING_FOR_COMPANY_REPLY_REASON =
  "Cliente foi o último a falar - aguardar resposta da empresa antes de follow-up";

const LEGACY_WAITING_FOR_COMPANY_REPLY_REASON =
  "Cliente respondeu - aguardando resposta da empresa";

type AwaitingCompanyReplyConversation = {
  followupStage?: number | null;
  lastMessageFromMe?: boolean | null;
  followupDisabledReason?: string | null;
};

export function isWaitingForCompanyReplyReason(reason: string | null | undefined): boolean {
  return (
    reason === WAITING_FOR_COMPANY_REPLY_REASON ||
    reason === LEGACY_WAITING_FOR_COMPANY_REPLY_REASON
  );
}

export function shouldHoldFollowUpUntilCompanyReply(
  conversation: AwaitingCompanyReplyConversation,
): boolean {
  const stage = Number.isFinite(Number(conversation.followupStage))
    ? Number(conversation.followupStage)
    : 0;

  if (stage < 0) {
    return false;
  }

  if (conversation.lastMessageFromMe === false) {
    return true;
  }

  if (conversation.lastMessageFromMe === true) {
    return false;
  }

  return isWaitingForCompanyReplyReason(conversation.followupDisabledReason);
}
