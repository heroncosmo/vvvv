import assert from "node:assert/strict";

import { formatPhoneForDisplay, validateAndFormatPhone } from "../phoneValidator";
import { buildPhoneFromParts, normalizeSignupPhone } from "../../shared/phone";

assert.equal(validateAndFormatPhone("11999999999"), "+5511999999999");
assert.equal(validateAndFormatPhone("556131810500"), "+556131810500");
assert.equal(validateAndFormatPhone("+556131810500"), "+556131810500");
assert.equal(
  validateAndFormatPhone("", { phoneCountryCode: "55", phoneNationalNumber: "6131810500" }),
  "+556131810500",
);
assert.equal(
  normalizeSignupPhone({ phoneCountryCode: "44", phoneNationalNumber: "2079460958" }),
  "+442079460958",
);
assert.equal(buildPhoneFromParts("1", "2025550148"), "+12025550148");
assert.equal(formatPhoneForDisplay("+556131810500"), "(61) 3181-0500");
assert.equal(validateAndFormatPhone("123"), null);

console.log("phoneValidator.test.ts ok");
