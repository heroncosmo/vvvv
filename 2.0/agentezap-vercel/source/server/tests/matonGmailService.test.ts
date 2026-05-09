import assert from "node:assert/strict";

import {
  __matonGmailServiceTestInternals,
  fetchMatonLeadEmails,
  listMatonGoogleMailConnections,
} from "../matonGmailService";

const originalFetch = global.fetch;

type FetchCall = {
  url: string;
  headers: Record<string, string>;
};

const fetchCalls: FetchCall[] = [];

global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const headers = Object.fromEntries(
    Object.entries((init?.headers as Record<string, string> | undefined) || {}).map(([key, value]) => [
      key,
      String(value),
    ]),
  );

  fetchCalls.push({ url, headers });

  if (url === "https://ctrl.maton.ai/connections?app=google-mail&status=ACTIVE") {
    return new Response(
      JSON.stringify({
        connections: [
          { connection_id: "conn-1", status: "ACTIVE", app: "google-mail", method: "oauth", url: null },
          {
            connection_id: "conn-2",
            status: "ACTIVE",
            app: "google-mail",
            method: "oauth",
            url: null,
            metadata: { email: "rprado.creci@gmail.com", name: "RPrado" },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (url === "https://gateway.maton.ai/google-mail/gmail/v1/users/me/profile") {
    const connectionId = headers["Maton-Connection"];
    const emailAddress = connectionId === "conn-2" ? "rprado.creci@gmail.com" : "outro@gmail.com";
    return new Response(JSON.stringify({ emailAddress }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.startsWith("https://gateway.maton.ai/google-mail/gmail/v1/users/me/messages?")) {
    assert.equal(headers["Maton-Connection"], "conn-2");
    return new Response(JSON.stringify({ messages: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  throw new Error(`Unexpected fetch in matonGmailService.test.ts: ${url}`);
}) as typeof fetch;

try {
  const connections = await listMatonGoogleMailConnections("test-api-key");
  assert.equal(connections.length, 2);
  assert.equal(connections[0].email, null);
  assert.equal(connections[1].email, "rprado.creci@gmail.com");

  const emails = await fetchMatonLeadEmails({
    apiKey: "test-api-key",
    connectionId: "conn-2",
    senderFilter: "comunica.zapimoveis.com.br",
    maxResults: 5,
    newerThanDays: 7,
  });

  assert.deepEqual(emails, []);

  await assert.rejects(
    () =>
      fetchMatonLeadEmails({
        apiKey: "test-api-key",
        connectionId: "nao-existe",
        senderFilter: "comunica.zapimoveis.com.br",
        maxResults: 5,
        newerThanDays: 7,
      }),
    /A conexao Google Mail selecionada nao esta mais ativa na Maton/,
  );

  const profileCalls = fetchCalls.filter((call) => call.url.endsWith("/users/me/profile"));
  assert.equal(profileCalls.length, 0);

  const encodedHtmlBody = Buffer.from(
    `
      <html>
        <body>
          <p>Novo lead Viva Real</p>
          <a href="tel:%2B55%2013%2099777-1234">Ver telefone</a>
          <a href="mailto:cliente.teste%40example.com">Responder por e-mail</a>
          <a href="https://wa.me/5513997771234">WhatsApp</a>
          <span>simplifica@olxbr.com</span>
        </body>
      </html>
    `,
    "utf8",
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const extractedBody = __matonGmailServiceTestInternals.extractBodyFromPayload({
    mimeType: "text/html",
    body: { data: encodedHtmlBody },
  });
  assert.match(extractedBody, /telefone:\s*\+55 13 99777-1234/);
  assert.match(extractedBody, /email:\s*cliente\.teste@example\.com/);
  assert.equal(__matonGmailServiceTestInternals.extractFirstPhone(extractedBody), "5513997771234");
  assert.equal(__matonGmailServiceTestInternals.extractFirstEmail(extractedBody), "cliente.teste@example.com");

  console.log("matonGmailService.test.ts ok");
} finally {
  global.fetch = originalFetch;
}
