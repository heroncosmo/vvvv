import assert from "node:assert/strict";

import { buildMediaTrackingTag } from "../mediaTrackingTag";

assert.equal(
  buildMediaTrackingTag("CATALOG_PRODUCT_IMAGE:product-1:img-1"),
  "[MEDIA:CATALOG_PRODUCT_IMAGE:product-1:img-1]",
);
assert.equal(buildMediaTrackingTag(""), "[MEDIA:URL]");
assert.equal(buildMediaTrackingTag(undefined), "[MEDIA:URL]");

console.log("mediaTrackingTag.test.ts ok");
