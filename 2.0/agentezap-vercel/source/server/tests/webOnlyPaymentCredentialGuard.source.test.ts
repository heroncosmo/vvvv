import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("api/http.ts", "utf8");

assert.match(source, /enforceTrustedPaymentCredentialReply/);
assert.match(source, /applyWebOnlyPaymentCredentialGuardToPayload/);
assert.match(source, /web-only payment credential guard applied/);
assert.match(source, /paymentCredentialGuard/);
assert.match(source, /mapWebOnlyPaymentGuardHistory/);

console.log("webOnlyPaymentCredentialGuard.source.test.ts ok");
