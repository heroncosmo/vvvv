type AuditRecord = Record<string, unknown>;

export type ConnectionAuditEvent = {
  kind: "force_reset" | "logout" | "open_timeout";
  at: string;
  source?: string;
  details?: AuditRecord;
};

function isPlainRecord(value: unknown): value is AuditRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value: unknown): AuditRecord {
  return isPlainRecord(value) ? { ...value } : {};
}

function cloneRecentEvents(value: unknown): ConnectionAuditEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is ConnectionAuditEvent => isPlainRecord(item) && typeof item.kind === "string" && typeof item.at === "string")
    .map((item) => ({
      kind: item.kind,
      at: item.at,
      source: typeof item.source === "string" ? item.source : undefined,
      details: isPlainRecord(item.details) ? { ...item.details } : undefined,
    }));
}

function buildLatestFieldKey(kind: ConnectionAuditEvent["kind"]): "lastForceReset" | "lastLogout" | "lastOpenTimeout" {
  if (kind === "force_reset") return "lastForceReset";
  if (kind === "logout") return "lastLogout";
  return "lastOpenTimeout";
}

export function mergeConnectionAuditEvent(
  sessionData: unknown,
  event: ConnectionAuditEvent,
): Record<string, unknown> {
  const root = cloneRecord(sessionData);
  const runtimeDiagnostics = cloneRecord(root.runtimeDiagnostics);
  const recentEvents = cloneRecentEvents(runtimeDiagnostics.recentEvents);
  recentEvents.push({
    kind: event.kind,
    at: event.at,
    source: event.source,
    details: event.details ? { ...event.details } : undefined,
  });

  const trimmedRecentEvents = recentEvents.slice(-20);
  const latestFieldKey = buildLatestFieldKey(event.kind);

  runtimeDiagnostics.recentEvents = trimmedRecentEvents;
  runtimeDiagnostics[latestFieldKey] = {
    at: event.at,
    source: event.source || null,
    details: event.details ? { ...event.details } : {},
  };

  root.runtimeDiagnostics = runtimeDiagnostics;
  return root;
}
