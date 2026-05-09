const USER_SESSION_KEYS = ["user", "userId", "assignedPlanId", "impersonatedBy"] as const;
const ADMIN_SESSION_KEYS = ["adminId", "adminRole"] as const;
const APP_SESSION_KEYS = [...USER_SESSION_KEYS, ...ADMIN_SESSION_KEYS] as const;

type SessionLike = Record<string, unknown> | null | undefined;
type UserSessionKey = (typeof USER_SESSION_KEYS)[number];
type AdminSessionKey = (typeof ADMIN_SESSION_KEYS)[number];

export type UserSessionScope = Partial<Record<UserSessionKey, unknown>>;
export type AdminSessionScope = Partial<Record<AdminSessionKey, unknown>>;

export function clearUserSessionScope(session: SessionLike): void {
  if (!session) {
    return;
  }

  for (const key of USER_SESSION_KEYS) {
    delete session[key];
  }
}

export function clearAdminSessionScope(session: SessionLike): void {
  if (!session) {
    return;
  }

  for (const key of ADMIN_SESSION_KEYS) {
    delete session[key];
  }
}

export function getActiveAppSessionKeys(session: SessionLike): string[] {
  if (!session) {
    return [];
  }

  const activeKeys: string[] = [];

  for (const key of APP_SESSION_KEYS) {
    if (session[key] !== undefined) {
      activeKeys.push(key);
    }
  }

  return activeKeys;
}

export function hasActiveAppSessionState(session: SessionLike): boolean {
  return getActiveAppSessionKeys(session).length > 0;
}

export function getUserSessionScope(session: SessionLike): UserSessionScope {
  const scope: UserSessionScope = {};

  if (!session) {
    return scope;
  }

  for (const key of USER_SESSION_KEYS) {
    if (session[key] !== undefined) {
      scope[key] = session[key];
    }
  }

  return scope;
}

export function getAdminSessionScope(session: SessionLike): AdminSessionScope {
  const scope: AdminSessionScope = {};

  if (!session) {
    return scope;
  }

  for (const key of ADMIN_SESSION_KEYS) {
    if (session[key] !== undefined) {
      scope[key] = session[key];
    }
  }

  return scope;
}

export function hasUserSessionScope(scope: UserSessionScope | SessionLike): boolean {
  return USER_SESSION_KEYS.some((key) => scope?.[key] !== undefined);
}

export function hasAdminSessionScope(scope: AdminSessionScope | SessionLike): boolean {
  return ADMIN_SESSION_KEYS.some((key) => scope?.[key] !== undefined);
}

export function applyUserSessionScope(session: SessionLike, scope: UserSessionScope): void {
  if (!session) {
    return;
  }

  for (const key of USER_SESSION_KEYS) {
    if (scope[key] !== undefined) {
      session[key] = scope[key];
    }
  }
}

export function applyAdminSessionScope(session: SessionLike, scope: AdminSessionScope): void {
  if (!session) {
    return;
  }

  for (const key of ADMIN_SESSION_KEYS) {
    if (scope[key] !== undefined) {
      session[key] = scope[key];
    }
  }
}
