export type MemberPermissions = {
  canViewConversations: boolean;
  canSendMessages: boolean;
  canUseQuickReplies: boolean;
  canMoveKanban: boolean;
  canViewDashboard: boolean;
  canViewAgenda: boolean;
  canEditContacts: boolean;
  canViewPhoneNumbers: boolean;
};

export const defaultMemberPermissions: MemberPermissions = {
  canViewConversations: true,
  canSendMessages: true,
  canUseQuickReplies: true,
  canMoveKanban: true,
  canViewDashboard: false,
  canViewAgenda: false,
  canEditContacts: false,
  canViewPhoneNumbers: false,
};

export function resolveMemberPermissions(
  raw?: Partial<MemberPermissions> | Record<string, unknown> | null,
): MemberPermissions {
  return {
    canViewConversations: raw?.canViewConversations === undefined
      ? defaultMemberPermissions.canViewConversations
      : raw.canViewConversations === true,
    canSendMessages: raw?.canSendMessages === undefined
      ? defaultMemberPermissions.canSendMessages
      : raw.canSendMessages === true,
    canUseQuickReplies: raw?.canUseQuickReplies === undefined
      ? defaultMemberPermissions.canUseQuickReplies
      : raw.canUseQuickReplies === true,
    canMoveKanban: raw?.canMoveKanban === undefined
      ? defaultMemberPermissions.canMoveKanban
      : raw.canMoveKanban === true,
    canViewDashboard: raw?.canViewDashboard === undefined
      ? defaultMemberPermissions.canViewDashboard
      : raw.canViewDashboard === true,
    canViewAgenda: raw?.canViewAgenda === undefined
      ? defaultMemberPermissions.canViewAgenda
      : raw.canViewAgenda === true,
    canEditContacts: raw?.canEditContacts === undefined
      ? defaultMemberPermissions.canEditContacts
      : raw.canEditContacts === true,
    canViewPhoneNumbers: raw?.canViewPhoneNumbers === undefined
      ? defaultMemberPermissions.canViewPhoneNumbers
      : raw.canViewPhoneNumbers === true,
  };
}

export function getMemberDefaultPath(permissions: MemberPermissions): string {
  if (permissions.canViewConversations) {
    return "/conversas";
  }

  if (permissions.canViewDashboard) {
    return "/dashboard";
  }

  if (permissions.canViewAgenda) {
    return "/agendamento-3";
  }

  if (permissions.canMoveKanban) {
    return "/kanban";
  }

  if (permissions.canEditContacts) {
    return "/listas-contatos";
  }

  return "/settings";
}

export function canMemberAccessPath(path: string, permissions: MemberPermissions): boolean {
  if (!path) {
    return permissions.canViewDashboard;
  }

  if (path.startsWith("/conversas")) {
    return permissions.canViewConversations;
  }

  if (path === "/dashboard" || path === "/") {
    return permissions.canViewDashboard;
  }

  if (path.startsWith("/kanban")) {
    return permissions.canMoveKanban;
  }

  if (path.startsWith("/agendamento-3") || path.startsWith("/agendamento-2") || path.startsWith("/agendamentos")) {
    return permissions.canViewAgenda;
  }

  if (path.startsWith("/contatos") || path.startsWith("/listas-contatos")) {
    return permissions.canEditContacts;
  }

  if (path.startsWith("/settings")) {
    return true;
  }

  return false;
}
