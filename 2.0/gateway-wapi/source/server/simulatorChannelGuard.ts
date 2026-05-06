import { storage } from "./storage";

export type SimulatorChannelBlockSource =
  | "global_agent"
  | "business_agent";

export type SimulatorChannelGuardResult = {
  channelReady: boolean;
  blockSource: SimulatorChannelBlockSource | null;
  blockReason: string | null;
  connectionId?: string | null;
};

type SimulatorChannelGuardDeps = {
  getConnectionByUserId: typeof storage.getConnectionByUserId;
  getAgentConfig: typeof storage.getAgentConfig;
  getBusinessAgentConfig: typeof storage.getBusinessAgentConfig;
};

const defaultDeps: SimulatorChannelGuardDeps = {
  getConnectionByUserId: storage.getConnectionByUserId.bind(storage),
  getAgentConfig: storage.getAgentConfig.bind(storage),
  getBusinessAgentConfig: storage.getBusinessAgentConfig.bind(storage),
};

export async function getSimulatorChannelGuardResult(
  userId: string,
  deps: SimulatorChannelGuardDeps = defaultDeps,
): Promise<SimulatorChannelGuardResult> {
  const [connection, agentConfig, businessAgentConfig] = await Promise.all([
    deps.getConnectionByUserId(userId),
    deps.getAgentConfig(userId),
    deps.getBusinessAgentConfig(userId),
  ]);

  if (connection?.isConnected && agentConfig && agentConfig.isActive === false) {
    return {
      channelReady: false,
      blockSource: "global_agent",
      blockReason:
        "O agente global está desligado em Meu Agente IA. Ative-o para que o WhatsApp real responda.",
      connectionId: connection.id,
    };
  }

  if (connection?.isConnected && businessAgentConfig && businessAgentConfig.isActive === false) {
    return {
      channelReady: false,
      blockSource: "business_agent",
      blockReason:
        "A IA operacional do agente está desligada. Reative em Meu Agente IA antes de confiar no simulador.",
      connectionId: connection.id,
    };
  }

  return {
    channelReady: true,
    blockSource: null,
    blockReason: null,
    connectionId: connection?.id ?? null,
  };
}
