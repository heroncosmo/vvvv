export type IncomingConversationMessageKind =
  | "normal"
  | "stub"
  | "contact"
  | "protocol"
  | "unsupported";

export function shouldPromoteIncomingMessageToConversationList(
  messageKind: IncomingConversationMessageKind,
): boolean {
  return messageKind !== "protocol";
}
