import assert from "node:assert/strict";

import {
  buildBrazilWhatsAppPhoneVariants,
  buildWhatsAppJidFromPhone,
  normalizeBrazilWhatsAppPhone,
} from "../whatsappPhoneNumber";

assert.equal(normalizeBrazilWhatsAppPhone("17991956944"), "5517991956944");
assert.equal(normalizeBrazilWhatsAppPhone("+55 (17) 99195-6944"), "5517991956944");
assert.equal(normalizeBrazilWhatsAppPhone("5513997897981"), "5513997897981");
assert.equal(buildWhatsAppJidFromPhone("13997897981"), "5513997897981@s.whatsapp.net");
assert.deepEqual(buildBrazilWhatsAppPhoneVariants("17991956944"), [
  "5517991956944",
  "17991956944",
  "1791956944",
  "551791956944",
]);
assert.deepEqual(buildBrazilWhatsAppPhoneVariants("1781956944"), [
  "551781956944",
  "1781956944",
  "17981956944",
  "5517981956944",
]);

console.log("whatsappPhoneNumber.test.ts ok");
