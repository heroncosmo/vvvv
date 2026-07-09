import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";

import {
  clearInboundAutomationGuardCaches,
  evaluateInboundAutomationGuard,
  isExternalAutoResponderNotice,
  isExternalAutomationTransferNotice,
} from "../inboundAutomationGuard";

test.beforeEach(() => {
  clearInboundAutomationGuardCaches();
});

test("bloqueia quando o contato pertence a outro canal conectado do SaaS com IA ativa", async () => {
  const result = await evaluateInboundAutomationGuard(
    {
      userId: "user-1",
      connectionId: "conn-1",
      conversationId: "conv-1",
      contactNumber: "5511988887777",
      contactName: "Contato interno",
      inboundText: "oi",
      conversationHistory: [{ fromMe: false, text: "oi" }],
    },
    {
      getUser: async () => ({ id: "user-1", email: "tenant@example.com" }) as any,
      listAllConnections: async () =>
        [
          {
            id: "conn-1",
            userId: "user-1",
            phoneNumber: "5511911111111",
            connectionName: "Canal atual",
            isConnected: true,
            aiEnabled: true,
            provider: "baileys",
            connectionMethod: "qr",
            providerStatus: "connected",
          },
          {
            id: "conn-2",
            userId: "user-2",
            phoneNumber: "5511988887777",
            connectionName: "Canal do outro cliente",
            isConnected: false,
            aiEnabled: true,
            provider: "baileys",
            connectionMethod: "qr",
            providerStatus: "connected",
          },
        ] as any,
      now: () => 1,
    },
  );

  assert.equal(result.shouldBlock, true);
  assert.equal(result.kind, "saas_channel");
  assert.equal(result.reasonCode, "saas_connected_channel");
  assert.equal(result.matchedConnectionId, "conn-2");
});

test("nao bloqueia workspace de suporte AgenteZap quando contato virou canal conectado do cliente", async () => {
  const result = await evaluateInboundAutomationGuard(
    {
      userId: "support-owner",
      connectionId: "conn-support",
      conversationId: "conv-support",
      contactNumber: "5512982523121",
      contactName: "Cliente em onboarding",
      inboundText: "Eu esqueci de colocar horario e endereco",
      conversationHistory: [{ fromMe: false, text: "Eu esqueci de colocar horario e endereco" }],
    },
    {
      getUser: async () => ({ id: "support-owner", email: "rodrigo4@gmail.com" }) as any,
      listAllConnections: async () =>
        [
          {
            id: "conn-support",
            userId: "support-owner",
            phoneNumber: "5517991140696",
            connectionName: "Atendimento",
            isConnected: true,
            aiEnabled: true,
            provider: "baileys",
            connectionMethod: "qr",
            providerStatus: "connected",
          },
          {
            id: "conn-client",
            userId: "client-user",
            phoneNumber: "5512982523121",
            connectionName: "WhatsApp Principal",
            isConnected: true,
            aiEnabled: true,
            provider: "baileys",
            connectionMethod: "qr",
            providerStatus: "connected",
          },
        ] as any,
      now: () => 11,
    },
  );

  assert.equal(result.shouldBlock, false);
  assert.equal(result.reasonCode, null);
});

test("nao bloqueia quando o numero pertence a canal desconectado", async () => {
  const result = await evaluateInboundAutomationGuard(
    {
      userId: "user-1",
      connectionId: "conn-1",
      conversationId: "conv-1",
      contactNumber: "5511988887777",
      contactName: "Contato interno",
      inboundText: "oi",
      conversationHistory: [{ fromMe: false, text: "oi" }],
    },
    {
      listAllConnections: async () =>
        [
          {
            id: "conn-2",
            userId: "user-2",
            phoneNumber: "5511988887777",
            connectionName: "Canal do outro cliente",
            isConnected: false,
            aiEnabled: true,
            provider: "baileys",
            connectionMethod: "qr",
            providerStatus: "inactive",
          },
        ] as any,
      now: () => 2,
    },
  );

  assert.equal(result.shouldBlock, false);
  assert.equal(result.kind, null);
});

test("nao bloqueia quando o numero pertence a canal com IA desligada", async () => {
  const result = await evaluateInboundAutomationGuard(
    {
      userId: "user-1",
      connectionId: "conn-1",
      conversationId: "conv-1",
      contactNumber: "5511988887777",
      contactName: "Contato interno",
      inboundText: "oi",
      conversationHistory: [{ fromMe: false, text: "oi" }],
    },
    {
      listAllConnections: async () =>
        [
          {
            id: "conn-2",
            userId: "user-2",
            phoneNumber: "5511988887777",
            connectionName: "Canal do outro cliente",
            isConnected: true,
            aiEnabled: false,
            provider: "baileys",
            connectionMethod: "qr",
            providerStatus: "connected",
          },
        ] as any,
      now: () => 3,
    },
  );

  assert.equal(result.shouldBlock, false);
  assert.equal(result.kind, null);
});

test("nao bloqueia falso positivo de Baileys stale com isConnected=true mas provider_status inativo", async () => {
  const result = await evaluateInboundAutomationGuard(
    {
      userId: "user-1",
      connectionId: "conn-1",
      conversationId: "conv-1",
      contactNumber: "553899194205",
      contactName: "Grupo Vida",
      inboundText: "oi",
      conversationHistory: [{ fromMe: false, text: "oi" }],
    },
    {
      listAllConnections: async () =>
        [
          {
            id: "conn-stale",
            userId: "user-2",
            phoneNumber: "553899194205",
            connectionName: "Conexão 2",
            isConnected: true,
            aiEnabled: true,
            provider: "baileys",
            connectionMethod: "qr",
            providerStatus: "inactive",
          },
        ] as any,
      now: () => 4,
    },
  );

  assert.equal(result.shouldBlock, false);
  assert.equal(result.kind, null);
});

test("nao bloqueia conteudo externo quando o numero nao pertence a canal interno", async () => {
  const result = await evaluateInboundAutomationGuard(
    {
      userId: "user-1",
      connectionId: "conn-1",
      conversationId: "conv-1",
      contactNumber: "5511977776666",
      contactName: "Paula",
      inboundText:
        "Recomendo usar o Fale Conosco para assistencia. Para Claro Movel, acesse claro.com.br/falecomaclaromovel",
      conversationHistory: [
        {
          fromMe: false,
          text:
            "Recomendo usar o Fale Conosco para assistencia. Para Claro Movel, acesse claro.com.br/falecomaclaromovel",
        },
      ],
    },
    {
      listAllConnections: async () => [] as any,
      now: () => 5,
    },
  );

  assert.equal(result.shouldBlock, false);
  assert.equal(result.kind, null);
});

test("nao bloqueia aviso automatico curto de transferencia antes do Codex", async () => {
  const result = await evaluateInboundAutomationGuard(
    {
      userId: "user-1",
      connectionId: "conn-1",
      conversationId: "conv-1",
      contactNumber: "5511977776666",
      contactName: "Cliente",
      inboundText: "Aguarde, você está sendo transferido para o departamento #ESPECIALISTA",
      conversationHistory: [
        {
          fromMe: false,
          text: "Aguarde, você está sendo transferido para o departamento #ESPECIALISTA",
        },
      ],
    },
    {
      getUser: async () => ({ id: "user-1", email: "tenant@example.com" }) as any,
      listAllConnections: async () => [] as any,
      now: () => 6,
    },
  );

  assert.equal(result.shouldBlock, false);
  assert.equal(result.kind, null);
  assert.equal(result.reasonCode, null);
});

test("nao bloqueia saudacao automatica de outro atendimento antes do Codex", async () => {
  const result = await evaluateInboundAutomationGuard(
    {
      userId: "user-1",
      connectionId: "conn-1",
      conversationId: "conv-1",
      contactNumber: "5524988098243",
      contactName: "PIRAI CONECT TV",
      inboundText:
        "Ola Rodrigo. Sou a assistente virtual da Pirai Connect. O Adauto nao esta disponivel no momento; assim que possivel ele retornara. Posso deixar um recado?",
      conversationHistory: [
        {
          fromMe: true,
          isFromAgent: false,
          text: "Ola, Adauto. Aqui e o Rodrigo, do AgenteZap.",
        },
      ],
    },
    {
      getUser: async () => ({ id: "user-1", email: "tenant@example.com" }) as any,
      listAllConnections: async () => [] as any,
      now: () => 7,
    },
  );

  assert.equal(result.shouldBlock, false);
  assert.equal(result.kind, null);
  assert.equal(result.reasonCode, null);
});

test("nao pausa workspace de suporte AgenteZap por aviso automatico externo", async () => {
  const result = await evaluateInboundAutomationGuard(
    {
      userId: "support-owner",
      connectionId: "conn-support",
      conversationId: "conv-support-auto",
      contactNumber: "5512982793003",
      contactName: "Cliente em onboarding",
      inboundText:
        "Obrigado, Rodrigo. Estamos a disposicao sempre que precisar. Abraco da equipe!",
      conversationHistory: [
        { fromMe: true, isFromAgent: true, text: "Fico a disposicao." },
        { fromMe: false, text: "Obrigado, qualquer coisa entraremos em contato." },
        { fromMe: true, isFromAgent: true, text: "Sucesso para voces." },
        { fromMe: false, text: "Obrigado pelo apoio." },
      ],
    },
    {
      getUser: async () => ({ id: "support-owner", email: "rodrigo4@gmail.com" }) as any,
      listAllConnections: async () => [] as any,
      now: () => 8,
    },
  );

  assert.equal(result.shouldBlock, false);
  assert.equal(result.reasonCode, null);
});

test("classificador legado reconhece loop de agradecimento somente como contexto", () => {
  assert.equal(
    isExternalAutoResponderNotice(
      "Muito obrigado, Rodrigo. Estamos a disposicao sempre que precisar. Abraco da equipe Pirai Connect TV!",
      [
        { fromMe: true, isFromAgent: true, text: "Fico a disposicao." },
        { fromMe: false, text: "Obrigado, qualquer coisa entraremos em contato." },
        { fromMe: true, isFromAgent: true, text: "Sucesso para voces." },
        { fromMe: false, text: "Obrigado pelo apoio." },
      ],
    ),
    true,
  );
});

test("nao bloqueia agradecimento humano isolado", () => {
  assert.equal(
    isExternalAutoResponderNotice("Obrigado, Rodrigo. Vou testar e te aviso.", [
      { fromMe: true, isFromAgent: false, text: "Pode testar por aqui." },
    ]),
    false,
  );
});

test("nao bloqueia mensagem humana longa que apenas menciona transferencia", () => {
  assert.equal(
    isExternalAutomationTransferNotice(
      "Estou aguardando porque disseram que eu seria transferido para o departamento certo, mas ainda preciso de ajuda.",
    ),
    false,
  );
});
