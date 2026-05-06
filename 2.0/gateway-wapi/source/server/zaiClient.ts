import { storage } from "./storage";

// Endpoint de Coding (GLM Coding Plan) - usado pelo Cline
const ZAI_API_URL = "https://api.z.ai/api/coding/paas/v4/chat/completions";

export async function getZaiApiKey(): Promise<string | null> {
  const config = await storage.getSystemConfig("zai_api_key");
  return config?.valor || process.env.ZAI_API_KEY || null;
}

export async function chatCompleteZai(
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number = 0.7
) {
  const apiKey = await getZaiApiKey();
  if (!apiKey) {
    throw new Error("Z.AI API Key not configured. Please add 'zai_api_key' to system_config.");
  }

  const response = await fetch(ZAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Z.AI API Error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}
