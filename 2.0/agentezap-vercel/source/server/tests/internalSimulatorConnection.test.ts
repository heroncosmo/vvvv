import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRealWhatsappConnectionNormalization,
  hasInternalSimulatorIdentity,
  isInternalOnlySimulatorConnection,
  shouldNormalizeRealWhatsappConnection,
} from "../internalSimulatorConnection";

test("mantem o simulador interno isolado quando a conexao e apenas de teste", () => {
  const connection = {
    phoneNumber: "sim-user-123",
    provider: "simulator",
    connectionMethod: "simulator",
    connectionType: "simulator",
    providerStatus: "inactive",
    isConnected: false,
    connectionName: "Simulador Estamparia",
    providerConfig: { source: "estamparia-simulator" },
  };

  assert.equal(hasInternalSimulatorIdentity(connection), true);
  assert.equal(isInternalOnlySimulatorConnection(connection), true);
  assert.equal(shouldNormalizeRealWhatsappConnection(connection), false);
});

test("mantem sim-phone escondido mesmo se status antigo marcou conectado", () => {
  const connection = {
    phoneNumber: "sim-user-123",
    provider: "simulator",
    connectionMethod: "simulator",
    connectionType: "simulator",
    providerStatus: "connected",
    isConnected: true,
    connectionName: "Simulador Estamparia",
    providerConfig: { source: "estamparia-simulator" },
  };

  assert.equal(isInternalOnlySimulatorConnection(connection), true);
  assert.equal(shouldNormalizeRealWhatsappConnection(connection), false);
});

test("normaliza a conexao real contaminada por metadados de simulador", () => {
  const connection = {
    phoneNumber: "556131810500",
    provider: "simulator",
    connectionMethod: "simulator",
    connectionType: "simulator",
    providerStatus: "connected",
    isConnected: false,
    isPrimary: true,
    connectionName: "Simulador Estamparia",
    providerConfig: { source: "estamparia-simulator", owner: "legacy" },
  };

  assert.equal(isInternalOnlySimulatorConnection(connection), false);
  assert.equal(shouldNormalizeRealWhatsappConnection(connection), true);

  const normalized = buildRealWhatsappConnectionNormalization(connection);
  assert.equal(normalized.provider, "baileys");
  assert.equal(normalized.connectionMethod, "qr");
  assert.equal(normalized.providerStatus, "connected");
  assert.equal(normalized.connectionType, "primary");
  assert.equal(normalized.connectionName, null);
  assert.deepEqual(normalized.providerConfig, { owner: "legacy" });
});
