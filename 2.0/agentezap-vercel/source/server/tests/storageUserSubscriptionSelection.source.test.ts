import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const storageSource = readFileSync(join(process.cwd(), "server", "storage.ts"), "utf8");
const methodMatch = storageSource.match(
  /async getUserSubscription\(userId: string\): Promise<[\s\S]*?\n  async getAllSubscriptions\(/,
);

assert.ok(methodMatch, "storage.ts must keep getUserSubscription available");

const methodSource = methodMatch[0];

assert.match(
  methodSource,
  /const preferred = pickPreferredSubscriptionCandidate\(candidates\)/,
  "getUserSubscription must rank all subscription candidates through the canonical selector",
);

assert.doesNotMatch(
  methodSource,
  /const activeResult = await db[\s\S]*?return \{[\s\S]*?activeResult\[0\]/,
  "getUserSubscription must not return the newest active row before ranking by coverage",
);

console.log("storageUserSubscriptionSelection.source.test.ts ok");
