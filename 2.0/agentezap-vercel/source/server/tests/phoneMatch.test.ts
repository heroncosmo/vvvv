import assert from "node:assert/strict";
import test from "node:test";

import { phoneNumbersMatch } from "../phoneMatch";

test("phoneNumbersMatch keeps Brazilian area code when comparing full numbers", () => {
  assert.equal(phoneNumbersMatch("5517991956944", "17991956944"), true);
  assert.equal(phoneNumbersMatch("5517991956944", "551791956944"), true);
  assert.equal(phoneNumbersMatch("17991956944", "1791956944"), true);

  assert.equal(phoneNumbersMatch("5517991956944", "5511991956944"), false);
  assert.equal(phoneNumbersMatch("5517991956944", "5518991956944"), false);
  assert.equal(phoneNumbersMatch("5517991956944", "5519991956944"), false);
});
