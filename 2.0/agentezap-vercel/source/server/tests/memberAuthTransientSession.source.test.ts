import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/hooks/useAuth.ts", "utf8");

function getFetchMemberUserSource() {
  const start = source.indexOf("async function fetchMemberUser");
  const end = source.indexOf("async function fetchUser");
  assert.notEqual(start, -1, "fetchMemberUser must exist");
  assert.notEqual(end, -1, "fetchUser must exist after fetchMemberUser");
  return source.slice(start, end);
}

test("member auth preserves token on transient session validation failures", () => {
  const fn = getFetchMemberUserSource();

  assert.match(
    fn,
    /_hasRecentSessionSignal\s*=\s*true/,
    "member sessions should mark a recent auth signal while validating",
  );
  assert.match(
    fn,
    /response\.status\s*===\s*401[\s\S]*localStorage\.removeItem\("memberToken"\)/,
    "explicit 401 must still clear invalid member tokens",
  );
  assert.match(
    fn,
    /throw new TransientAuthError\(`Member session temporarily unavailable:/,
    "non-401 HTTP errors must be treated as transient",
  );

  const catchBlock = fn.match(/catch \(error\) \{([\s\S]*?)\n  \}\n\}/)?.[1] || "";
  assert.doesNotMatch(
    catchBlock,
    /localStorage\.removeItem\("memberToken"\)/,
    "transient catch must not delete memberToken",
  );
  assert.match(
    catchBlock,
    /throw new TransientAuthError\("Falha transiente ao validar sessao do membro"\)/,
    "transient catch should ask React Query to retry instead of logging out",
  );
});
