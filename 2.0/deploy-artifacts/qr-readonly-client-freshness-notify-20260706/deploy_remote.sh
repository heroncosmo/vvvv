#!/usr/bin/env bash
set -euo pipefail

EXPECTED_APP_IMAGE="agentezap-app:qr-readonly-recovery-v860-20260706115905"
CONVERSATION_ID="2c9e2c04-3e33-444a-b2df-287b43a7d17b"
EXPECTED_LATEST_DB_ID="150c2f71-0642-432e-a856-e45b20670b9b"
EXPECTED_OWNER_EMAIL="rodrigo4@gmail.com"
EXPECTED_CONTACT_NUMBER="5511965080625"

echo "[notify] checking active app image"
active_image="$(docker inspect --format '{{.Config.Image}}' agentezap-app)"
if [ "$active_image" != "$EXPECTED_APP_IMAGE" ]; then
  echo "[notify] unexpected active image: $active_image" >&2
  echo "[notify] expected: $EXPECTED_APP_IMAGE" >&2
  exit 1
fi

echo "[notify] running freshness-locked customer notice"
docker exec -i agentezap-app sh -lc 'cd /app && node --input-type=module -' <<'NODE'
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const conversationId = "2c9e2c04-3e33-444a-b2df-287b43a7d17b";
const expectedLatestDbId = "150c2f71-0642-432e-a856-e45b20670b9b";
const expectedOwnerEmail = "rodrigo4@gmail.com";
const expectedContactNumber = "5511965080625";
const messageText = [
  "*Rodrigo:*",
  "Fizemos outro ajuste na conexão agora. Pode atualizar a tela do AgenteZap, clicar em Novo QR Code e escanear o QR novo de novo, por favor?",
  "Se aparecer qualquer erro, me manda o print na hora que eu acompanho por aqui."
].join("\n");

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(20);
}

function assertPublicTextSafe(text) {
  if (!text || !text.trim()) fail("empty public message");
  if (text.length > 600) fail("public message too long");
  if (/\b(Codex|API|endpoint|runtime|prompt|parser|schema|deploy|script|bundle|Baileys|Supabase)\b/i.test(text)) {
    fail("public message contains internal implementation terms");
  }
  if (/�|voc\?|n\?o|conex\?o|c\?digo|qrcode/i.test(text)) {
    fail("public message contains broken characters");
  }
}

async function loadConversation(pool) {
  const result = await pool.query(
    `
    select
      c.id,
      c.connection_id,
      c.contact_number,
      c.contact_name,
      c.last_message_time,
      c.last_message_from_me,
      wc.user_id,
      u.email as owner_email,
      coalesce(wc.is_connected,false) as is_connected,
      coalesce(wc.provider_status,'') as provider_status,
      latest.id as latest_db_id,
      latest.message_id as latest_message_id,
      latest.from_me as latest_from_me,
      latest.timestamp as latest_timestamp,
      latest.created_at as latest_created_at,
      latest.media_type as latest_media_type,
      left(coalesce(latest.text,''), 180) as latest_text_preview
    from public.conversations c
    join public.whatsapp_connections wc on wc.id = c.connection_id
    left join public.users u on u.id = wc.user_id
    left join lateral (
      select m.*
      from public.messages m
      where m.conversation_id = c.id
      order by m.timestamp desc nulls last, m.created_at desc nulls last, m.id desc
      limit 1
    ) latest on true
    where c.id = $1
    `,
    [conversationId],
  );
  return result.rows[0] || null;
}

assertPublicTextSafe(messageText);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
let before;
try {
  before = await loadConversation(pool);
  if (!before) fail("conversation not found");
  if (String(before.owner_email || "").toLowerCase() !== expectedOwnerEmail) {
    fail(`owner changed: ${before.owner_email || "unknown"}`);
  }
  if (String(before.contact_number || "") !== expectedContactNumber) {
    fail(`contact changed: ${before.contact_number || "unknown"}`);
  }
  if (before.is_connected !== true || String(before.provider_status || "").toLowerCase() !== "connected") {
    fail(`sender connection not connected: ${before.provider_status || "unknown"}`);
  }
  if (String(before.latest_db_id || "") !== expectedLatestDbId) {
    fail(`freshness failed: latest changed to ${before.latest_db_id || before.latest_message_id || "unknown"}`);
  }
  if (before.latest_from_me === true) {
    fail("freshness failed: latest message is already from us");
  }

  const distDir = "/app/dist";
  const whatsappBundle = fs.readdirSync(distDir).find((file) => /^whatsapp-.*\.js$/.test(file));
  if (!whatsappBundle) fail("whatsapp bundle not found");
  const whatsapp = await import(`file://${path.join(distDir, whatsappBundle)}`);

  const sendResult = await whatsapp.sendMessage(before.user_id, conversationId, messageText, {
    isFromAgent: false,
    source: "owner",
    validateDestination: true,
    acceptQueued: true,
  });

  await new Promise((resolve) => setTimeout(resolve, 2000));
  const after = await loadConversation(pool);
  if (!after?.latest_from_me) {
    fail("send did not become latest from_me message");
  }
  if (!String(after.latest_text_preview || "").includes("Fizemos outro ajuste")) {
    fail("latest sent message text does not match expected notice");
  }

  console.log(JSON.stringify({
    ok: true,
    sent: true,
    conversationId,
    ownerEmail: before.owner_email,
    contactNumber: before.contact_number,
    beforeLatestDbId: before.latest_db_id,
    afterLatestDbId: after.latest_db_id,
    afterLatestTimestamp: after.latest_timestamp,
    sendResultKeyId: sendResult?.key?.id || null,
    messageLength: messageText.length
  }, null, 2));
} finally {
  await pool.end().catch(() => undefined);
}
NODE

echo "[notify] NOTICE_OK"
