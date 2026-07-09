import assert from "node:assert/strict";

import {
  getSuppressingMediaNames,
  shouldSuppressTextResponseForMediaActions,
} from "../mediaResponsePolicy";

const mediaLibrary = [
  {
    name: "VIDEO_CONDOMINIO_CHACRINHAS",
    suppressTextResponse: true,
  },
  {
    name: "VIDEO_CONDOMINIO_RIO_URU",
    suppressTextResponse: false,
  },
];

assert.equal(
  shouldSuppressTextResponseForMediaActions(
    [{ type: "send_media", media_name: "VIDEO_CONDOMINIO_CHACRINHAS" }],
    mediaLibrary as any,
  ),
  true,
);

assert.deepEqual(
  getSuppressingMediaNames(
    [{ type: "send_media", media_name: "VIDEO_CONDOMINIO_CHACRINHAS" }],
    mediaLibrary as any,
  ),
  ["VIDEO_CONDOMINIO_CHACRINHAS"],
);

assert.equal(
  shouldSuppressTextResponseForMediaActions(
    [{ type: "send_media", media_name: "VIDEO_CONDOMINIO_RIO_URU" }],
    mediaLibrary as any,
  ),
  false,
);

assert.equal(
  shouldSuppressTextResponseForMediaActions(
    [{ type: "send_media", media_name: "MIDIA_INEXISTENTE" }],
    mediaLibrary as any,
  ),
  false,
);

console.log("mediaResponsePolicy.test.ts ok");
