import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("/cadastro is WhatsApp-first and no longer local signup", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "client", "src", "pages", "register.tsx"),
    "utf8",
  );

  assert.match(source, /RODRIGO_AGENT_CREATOR_PHONE = "5517991140696"/);
  assert.match(source, /https:\/\/wa\.me\/\$\{RODRIGO_AGENT_CREATOR_PHONE\}/);
  assert.match(source, /Criar agente no WhatsApp agora/);
  assert.doesNotMatch(source, /\/api\/auth\/signup|supabase\.auth\.signInWithPassword|handleSignup|Criar Conta/);
});
