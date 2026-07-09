export function extractFirstBalancedJsonObject(text: string): string | null {
  return extractBalancedJsonObjects(text)[0] || null;
}

export function extractDelimitedBlock(source: string, startTag: string, endTag: string): string | null {
  const raw = String(source || '');
  const start = raw.indexOf(startTag);
  if (start < 0) return null;
  const contentStart = start + startTag.length;
  const end = raw.indexOf(endTag, contentStart);
  if (end < 0) return null;
  return raw.slice(contentStart, end).trim();
}

export function extractBalancedJsonObjects(text: string): string[] {
  const source = String(text || '');
  const objects: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        if (start >= 0) {
          objects.push(source.slice(start, index + 1));
        }
        start = -1;
      }
      if (depth < 0) {
        depth = 0;
        start = -1;
      }
    }
  }

  return objects;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isLikelyLiveCliPlan(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.schemaVersion === 'agentezap_live_cli_plan_v1') return true;
  if ('customerFacingMessages' in value || 'actions' in value || 'evidence' in value) return true;
  if ('decision' in value && ('messages' in value || 'responseText' in value || 'message' in value)) return true;
  return false;
}

function isLikelyStructuredAssistantJson(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    'action' in value ||
    'flowItems' in value ||
    'rescue' in value ||
    'tool_calls' in value ||
    'toolCalls' in value ||
    'ferramenta' in value ||
    'customerFacingMessages' in value ||
    'messages' in value ||
    'responseText' in value ||
    'message' in value
  ) {
    return true;
  }
  return false;
}

export function extractStructuredJsonObject(text: string): string | null {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const assistantResponse =
    extractDelimitedBlock(raw, '<assistant_response>', '</assistant_response>') ||
    extractDelimitedBlock(raw, '<assistant>', '</assistant>');
  const source = assistantResponse || raw;
  const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonSource = fencedMatch?.[1]?.trim() || source;
  const candidates = extractBalancedJsonObjects(jsonSource);
  if (candidates.length === 0) return null;

  const likelyCandidate = candidates.find((candidate) => {
    try {
      return isLikelyStructuredAssistantJson(JSON.parse(candidate));
    } catch {
      return false;
    }
  });

  return likelyCandidate || candidates[0];
}

export function parseAgenteZapLiveCliJson(text: string): unknown {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('empty_live_cli_output');
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const candidates = extractBalancedJsonObjects(trimmed)
      .map((candidate) => {
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      })
      .filter((candidate) => candidate !== null);
    if (candidates.length === 0) {
      throw new Error('live_cli_output_is_not_json');
    }
    const likelyPlan = [...candidates].reverse().find(isLikelyLiveCliPlan);
    return likelyPlan || candidates[candidates.length - 1];
  }
}
