import type { Request } from "express";

import { storage } from "./storage";

type MetaLeadFormsAccessOptions = {
  isMember?: boolean;
};

function normalizeEmail(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function isMetaLeadFormsAllowedEmail(email: string | null | undefined): boolean {
  return Boolean(normalizeEmail(email));
}

export function getMetaLeadFormsRequestAccessOptions(
  req: Request | { user?: { isMember?: boolean } | null } | null | undefined,
): MetaLeadFormsAccessOptions {
  return {
    isMember: req?.user?.isMember === true,
  };
}

export async function getMetaLeadFormsBetaStatus(
  userId: string,
  options?: MetaLeadFormsAccessOptions,
): Promise<{
  enabled: boolean;
  userEmail: string | null;
}> {
  const user = await storage.getUser(userId);
  const userEmail = normalizeEmail(user?.email);

  return {
    enabled: Boolean(userId) && options?.isMember !== true,
    userEmail: userEmail || null,
  };
}

export async function assertMetaLeadFormsBetaAccess(userId: string, options?: MetaLeadFormsAccessOptions) {
  const status = await getMetaLeadFormsBetaStatus(userId, options);
  if (!status.enabled) {
    const error = new Error(
      options?.isMember === true
        ? "Acesso restrito ao dono da conta."
        : "Não foi possível validar o acesso ao Formulário Meta.",
    );
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }

  return status;
}
