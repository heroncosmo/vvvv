export type GrupoOlxMatonLeadSyncCandidate = {
  active?: boolean | null;
  leadEmailSyncEnabled?: boolean | null;
  matonApiKey?: string | null;
  matonConnectionId?: string | null;
  connectionId?: string | null;
  googleAccessToken?: string | null;
  googleRefreshToken?: string | null;
};

export function isGrupoOlxMatonLeadSyncEligible(integration: GrupoOlxMatonLeadSyncCandidate): boolean {
  return (
    integration.active === true &&
    integration.leadEmailSyncEnabled === true &&
    Boolean(integration.matonApiKey) &&
    Boolean(integration.matonConnectionId) &&
    Boolean(integration.connectionId)
  );
}
