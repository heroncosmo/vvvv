import assert from "node:assert/strict";
import test from "node:test";

import { getSimulatorChannelGuardResult } from "../simulatorChannelGuard";

test("libera o simulador quando a IA da conexao conectada esta desligada", async () => {
  const result = await getSimulatorChannelGuardResult("user-1", {
    getConnectionByUserId: async () =>
      ({
        id: "conn-1",
        isConnected: true,
        aiEnabled: false,
      } as any),
    getAgentConfig: async () => ({ isActive: true } as any),
    getBusinessAgentConfig: async () => ({ isActive: true } as any),
  });

  assert.equal(result.channelReady, true);
  assert.equal(result.blockSource, null);
  assert.equal(result.connectionId, "conn-1");
});

test("bloqueia o simulador quando o agente global conectado esta desligado", async () => {
  const result = await getSimulatorChannelGuardResult("user-1", {
    getConnectionByUserId: async () =>
      ({
        id: "conn-1",
        isConnected: true,
        aiEnabled: true,
      } as any),
    getAgentConfig: async () => ({ isActive: false } as any),
    getBusinessAgentConfig: async () => ({ isActive: true } as any),
  });

  assert.equal(result.channelReady, false);
  assert.equal(result.blockSource, "global_agent");
});

test("mantem o simulador liberado quando nao ha canal conectado para validar", async () => {
  const result = await getSimulatorChannelGuardResult("user-1", {
    getConnectionByUserId: async () => undefined,
    getAgentConfig: async () => ({ isActive: false } as any),
    getBusinessAgentConfig: async () => ({ isActive: false } as any),
  });

  assert.equal(result.channelReady, true);
  assert.equal(result.blockSource, null);
});
