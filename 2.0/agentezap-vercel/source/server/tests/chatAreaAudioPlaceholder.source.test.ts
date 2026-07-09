import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatAreaSource = readFileSync("client/src/components/chat-area.tsx", "utf8");

test("chat area hides wrapped audio placeholders until transcription arrives", () => {
  const fn = chatAreaSource.match(
    /function isAudioPlaceholderText\(text\?: string \| null\): boolean \{([\s\S]*?)\n\}/,
  )?.[1] || "";

  assert.match(fn, /wrapperPairs/);
  assert.match(fn, /speakerMarkerIndex/);
  assert.match(fn, /normalized === "audio"/);
  assert.match(fn, /normalized\.startsWith\("\[audio"\)/);
});

