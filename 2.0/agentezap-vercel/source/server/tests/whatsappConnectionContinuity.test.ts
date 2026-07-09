import assert from "node:assert/strict";

import { pickPhoneGroupSurvivor } from "../whatsappConnectionContinuityRules";

const now = new Date("2026-04-09T23:00:00.000Z");

{
  const survivor = pickPhoneGroupSurvivor([
    {
      id: "old-primary",
      userId: "user-1",
      phoneNumber: "553899194205",
      isConnected: false,
      providerStatus: "inactive",
      isPrimary: true,
      connectionName: "Conexão 1",
      connectionType: "primary",
      aiEnabled: true,
      provider: "baileys",
      connectionMethod: "qr",
      qrCode: null,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T20:00:00.000Z"),
      conversationCount: 48,
    },
    {
      id: "new-live",
      userId: "user-1",
      phoneNumber: "553899194205",
      isConnected: true,
      providerStatus: "connected",
      isPrimary: false,
      connectionName: "Conexão 2",
      connectionType: "secondary",
      aiEnabled: true,
      provider: "baileys",
      connectionMethod: "qr",
      qrCode: null,
      createdAt: new Date("2026-04-09T22:00:00.000Z"),
      updatedAt: now,
      conversationCount: 0,
    },
  ]);

  assert.equal(
    survivor.id,
    "new-live",
    "a conexão ativa do mesmo número deve sobreviver para não quebrar o runtime atual",
  );
}

{
  const survivor = pickPhoneGroupSurvivor([
    {
      id: "primary-history",
      userId: "user-1",
      phoneNumber: "553899194205",
      isConnected: false,
      providerStatus: "inactive",
      isPrimary: true,
      connectionName: "Principal",
      connectionType: "primary",
      aiEnabled: true,
      provider: "baileys",
      connectionMethod: "qr",
      qrCode: null,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T20:00:00.000Z"),
      conversationCount: 48,
    },
    {
      id: "secondary-empty",
      userId: "user-1",
      phoneNumber: "553899194205",
      isConnected: false,
      providerStatus: "inactive",
      isPrimary: false,
      connectionName: "Secundária",
      connectionType: "secondary",
      aiEnabled: true,
      provider: "baileys",
      connectionMethod: "qr",
      qrCode: null,
      createdAt: new Date("2026-04-09T22:00:00.000Z"),
      updatedAt: now,
      conversationCount: 0,
    },
  ]);

  assert.equal(
    survivor.id,
    "primary-history",
    "sem conexão operacional, a principal com histórico deve ser mantida",
  );
}

{
  const survivor = pickPhoneGroupSurvivor([
    {
      id: "primary-stale",
      userId: "user-1",
      phoneNumber: "553899194205",
      isConnected: true,
      providerStatus: "connected",
      isPrimary: true,
      connectionName: "Principal antiga",
      connectionType: "primary",
      aiEnabled: true,
      provider: "baileys",
      connectionMethod: "qr",
      qrCode: null,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T20:00:00.000Z"),
      runtimeIsConnected: false,
      conversationCount: 48,
    },
    {
      id: "secondary-live",
      userId: "user-1",
      phoneNumber: "553899194205",
      isConnected: false,
      providerStatus: "inactive",
      isPrimary: false,
      connectionName: "ConexÃ£o nova",
      connectionType: "secondary",
      aiEnabled: true,
      provider: "baileys",
      connectionMethod: "qr",
      qrCode: null,
      createdAt: new Date("2026-04-09T22:00:00.000Z"),
      updatedAt: now,
      runtimeIsConnected: true,
      conversationCount: 0,
    },
  ]);

  assert.equal(
    survivor.id,
    "secondary-live",
    "o runtime real deve prevalecer sobre flags stale do banco ao escolher a conexao sobrevivente",
  );
}

console.log("whatsappConnectionContinuity.test.ts ok");
