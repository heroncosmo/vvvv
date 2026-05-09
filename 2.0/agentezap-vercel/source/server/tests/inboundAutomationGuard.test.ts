import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";

import {
  clearInboundAutomationGuardCaches,
  evaluateInboundAutomationGuard,
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
