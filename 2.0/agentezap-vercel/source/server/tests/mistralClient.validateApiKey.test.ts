import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyMistralApiKeyValidationError,
  validateMistralApiKey,
} from "../mistralClient";

const validLengthKey = "a".repeat(40);

function responseWithStatus(status: number, headers?: Record<string, string>): Response {
  return new Response("{}", { status, headers });
}

test("validateMistralApiKey marks a working key as valid", async () => {
  const result = await validateMistralApiKey(validLengthKey, {
    index: 2,
    fetchImpl: async (_input, init) => {
      assert.equal(init?.headers instanceof Headers, false);
      assert.deepEqual(init?.headers, { Authorization: `Bearer ${validLengthKey}` });
      return responseWithStatus(200);
    },
  });

  assert.equal(result.index, 2);
  assert.equal(result.status, "valid");
  assert.equal(result.statusCode, 200);
});

test("validateMistralApiKey marks unauthorized responses as invalid", async () => {
  const result = await validateMistralApiKey(validLengthKey, {
    fetchImpl: async () => responseWithStatus(401),
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.statusCode, 401);
});

test("validateMistralApiKey separates temporary rate limits from invalid keys", async () => {
  const result = await validateMistralApiKey(validLengthKey, {
    fetchImpl: async () => responseWithStatus(429, { "retry-after": "9" }),
  });

  assert.equal(result.status, "rate_limited");
  assert.equal(result.statusCode, 429);
  assert.equal(result.retryAfterMs, 9000);
});

test("validateMistralApiKey keeps empty rows explicit", async () => {
  const result = await validateMistralApiKey("   ", {
    fetchImpl: async () => {
      throw new Error("fetch should not be called for empty rows");
    },
  });

  assert.equal(result.status, "empty");
});

test("classifyMistralApiKeyValidationError recognizes invalid token messages", () => {
  const result = classifyMistralApiKeyValidationError(new Error("Invalid API key"), {
    keyLength: validLengthKey.length,
  });

  assert.equal(result.status, "invalid");
});
