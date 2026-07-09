import type { OpenRouterProviderPreference } from "./llmConfigResolver";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function injectOpenRouterProviderIntoBody(
  body: BodyInit | null | undefined,
  providerPreference: OpenRouterProviderPreference | undefined,
): BodyInit | null | undefined {
  if (!providerPreference || typeof body !== "string") {
    return body;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }

  if (!isPlainRecord(parsed)) {
    return body;
  }

  return JSON.stringify({
    ...parsed,
    provider: providerPreference,
  });
}

export function createOpenRouterProviderRoutingFetch(
  providerPreference: OpenRouterProviderPreference | undefined,
  baseFetch: FetchLike = fetch,
): FetchLike {
  return async (input, init) => {
    if (!providerPreference || !init?.body) {
      return baseFetch(input, init);
    }

    const nextBody = injectOpenRouterProviderIntoBody(init.body, providerPreference);
    if (nextBody === init.body) {
      return baseFetch(input, init);
    }

    return baseFetch(input, {
      ...init,
      body: nextBody,
    });
  };
}
