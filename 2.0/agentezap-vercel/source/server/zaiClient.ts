import { storage } from "./storage";

// Endpoint de Coding (GLM Coding Plan) - usado pelo Cline
const ZAI_API_URL = "https://api.z.ai/api/coding/paas/v4/chat/completions";

export async function getZaiApiKey(): Promise<string | null> {
  const config = await storage.getSystemConfig("zai_api_key");
  return config?.valor || process.env.ZAI_API_KEY || null;
}

export async function requestZaiCodingCompletion(
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number = 0.7
) {
  void model;
  void messages;
  void temperature;
  throw new Error("Z.AI coding completion helper disabled; Codex runtime owns agent decisions.");
}
