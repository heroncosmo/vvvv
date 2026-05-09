import assert from "node:assert/strict";
import test from "node:test";

import { resolveConnectionScopedSession } from "../whatsappConnectionSessionResolver";

test("usa a sessao da propria conexao quando ela existe", () => {
  const calls: string[] = [];
  const session = { socket: { user: { id: "5511999999999:1@s.whatsapp.net" } } };
  const resolved = resolveConnectionScopedSession(
    { id: "conn-1", userId: "user-1" } as any,
    (key: string) => {
      calls.push(key);
      return key === "conn-1" ? session : undefined;
    },
  );

  assert.equal(resolved, session);
  assert.deepEqual(calls, ["conn-1"]);
});

test("nao faz fallback para userId por padrao", () => {
  const calls: string[] = [];
  const userSession = { socket: { user: { id: "5511888888888:2@s.whatsapp.net" } } };
  const resolved = resolveConnectionScopedSession(
    { id: "conn-2", userId: "user-2" } as any,
    (key: string) => {
      calls.push(key);
      return key === "user-2" ? userSession : undefined;
    },
  );

  assert.equal(resolved, undefined);
  assert.deepEqual(calls, ["conn-2"]);
});

test("só usa fallback para userId quando for explicitamente permitido", () => {
  const calls: string[] = [];
  const userSession = { socket: { user: { id: "5511777777777:3@s.whatsapp.net" } } };
  const resolved = resolveConnectionScopedSession(
    { id: "conn-3", userId: "user-3" } as any,
    (key: string) => {
      calls.push(key);
      return key === "user-3" ? userSession : undefined;
    },
    { allowUserFallback: true },
  );

  assert.equal(resolved, userSession);
  assert.deepEqual(calls, ["conn-3", "user-3"]);
});
