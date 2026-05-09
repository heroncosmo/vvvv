import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

type ConversationRow = {
  id: string;
  contact_number: string;
  linked_user_id: string | null;
  last_test_token: string | null;
  updated_at: string;
  last_message_text: string | null;
};

type MessageRow = {
  text: string | null;
  timestamp: string;
};

type SuspiciousCase = {
  conversationId: string;
  contactNumber: string;
  updatedAt: string;
  linkedUserId: string | null;
  lastTestToken: string | null;
  reason: string;
  assistantMessage: string;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function expectedCanonicalEmail(phoneNumber: string): string {
  return `${String(phoneNumber || "").replace(/\D/g, "")}@agentezap.online`;
}

function hasSuspiciousDeliveryClaim(
  message: string,
  hasToken: boolean,
  contactNumber: string,
): { suspicious: boolean; reason?: string } {
  const source = String(message || "");
  const normalized = normalizeText(source);
  const normalizedPhone = String(contactNumber || "").replace(/\D/g, "");
  const expectedEmail = expectedCanonicalEmail(normalizedPhone).toLowerCase();
  const anyCanonicalEmails = source.toLowerCase().match(/\b\d{10,15}@agentezap\.online\b/g) || [];

  const claimPattern =
    /\b(seu agente ja esta pronto|prontinho|teste publico|simulador publico|painel de controle|ja criei|teste pronto|aqui estao os links|links para voce conhecer)\b/;
  const realTestLinkPattern = /https?:\/\/[^\s]*\/test\/[a-z0-9]{8,}/i;
  const emptyDeliverySlotPattern = /\b(simulador|teste publico|painel|login)\b[^\n]*:\s*(?:\n|$)/i;
  const placeholderPattern = /\b(seu email|senha(?:\s+temporaria)?:\s*123456)\b/i;

  const hasClaim = claimPattern.test(normalized);
  if (!hasClaim) return { suspicious: false };

  if (!hasToken) {
    return { suspicious: true, reason: "claim_sem_token" };
  }
  if (!realTestLinkPattern.test(source)) {
    return { suspicious: true, reason: "claim_sem_link_test_real" };
  }
  if (emptyDeliverySlotPattern.test(source)) {
    return { suspicious: true, reason: "link_placeholder_vazio" };
  }
  if (placeholderPattern.test(normalized)) {
    return { suspicious: true, reason: "credencial_placeholder" };
  }
  if (anyCanonicalEmails.length > 0 && normalizedPhone.length >= 10 && !anyCanonicalEmails.includes(expectedEmail)) {
    return { suspicious: true, reason: "credencial_email_diferente_do_telefone" };
  }

  return { suspicious: false };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não definido");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const conversations = await pool.query<ConversationRow>(
      `
        select
          id,
          contact_number,
          linked_user_id,
          last_test_token,
          updated_at,
          last_message_text
        from admin_conversations
        where updated_at >= now() - interval '24 hours'
        order by updated_at desc
        limit 500
      `,
    );

    const suspicious: SuspiciousCase[] = [];

    for (const conv of conversations.rows) {
      const lastAgentMessage = await pool.query<MessageRow>(
        `
          select text, timestamp
          from admin_messages
          where conversation_id = $1
            and from_me = true
          order by timestamp desc
          limit 1
        `,
        [conv.id],
      );

      const latestAgentMessage = String(lastAgentMessage.rows[0]?.text || "").trim();
      const latestAgentTimestamp = Date.parse(String(lastAgentMessage.rows[0]?.timestamp || ""));
      const conversationTimestamp = Date.parse(String(conv.updated_at || ""));
      const conversationLastMessage = String(conv.last_message_text || "").trim();

      const assistantMessage =
        conversationLastMessage &&
        (!latestAgentMessage ||
          Number.isNaN(latestAgentTimestamp) ||
          conversationTimestamp > latestAgentTimestamp)
          ? conversationLastMessage
          : latestAgentMessage;
      if (!assistantMessage) continue;

      const check = hasSuspiciousDeliveryClaim(
        assistantMessage,
        Boolean(conv.last_test_token),
        conv.contact_number,
      );
      if (check.suspicious) {
        suspicious.push({
          conversationId: conv.id,
          contactNumber: conv.contact_number,
          updatedAt: conv.updated_at,
          linkedUserId: conv.linked_user_id,
          lastTestToken: conv.last_test_token,
          reason: check.reason || "suspeito",
          assistantMessage,
        });
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      scannedConversations: conversations.rows.length,
      suspiciousCount: suspicious.length,
      suspicious,
    };

    const outDir = path.resolve("test-results");
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(
      outDir,
      `admin-delivery-claims-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf-8");

    console.log(`Conversations scanned: ${conversations.rows.length}`);
    console.log(`Suspicious cases: ${suspicious.length}`);
    console.log(`Report: ${outFile}`);

    process.exit(suspicious.length > 0 ? 2 : 0);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Falha no auditor:", error);
  process.exit(1);
});
