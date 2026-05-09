import sharp from "sharp";

import { storage } from "./storage";

type NvidiaImageModelConfig = {
  model: string;
  buildBody: (prompt: string, seed: number) => Record<string, unknown>;
};

export type NvidiaGeneratedImage = {
  dataUrl: string;
  mimeType: string;
  fileName: string;
  model: string;
};

export type NvidiaImageUseCase = "status" | "estamparia";

type GenerateNvidiaImageOptions = {
  filePrefix?: string;
  useCase?: NvidiaImageUseCase;
};

const SHARED_IMAGE_SIZE = 1024;

const NVIDIA_IMAGE_MODELS: Record<NvidiaImageUseCase, NvidiaImageModelConfig[]> = {
  status: [
    {
      model: "black-forest-labs/flux.1-schnell",
      buildBody: (prompt, seed) => ({
        prompt,
        seed,
        steps: 4,
        width: SHARED_IMAGE_SIZE,
        height: SHARED_IMAGE_SIZE,
        samples: 1,
        mode: "base",
        cfg_scale: 0,
      }),
    },
    {
      model: "black-forest-labs/flux.2-klein-4b",
      buildBody: (prompt, seed) => ({
        prompt,
        seed,
        steps: 4,
        width: SHARED_IMAGE_SIZE,
        height: SHARED_IMAGE_SIZE,
        samples: 1,
      }),
    },
  ],
  estamparia: [
    {
      model: "black-forest-labs/flux.2-klein-4b",
      buildBody: (prompt, seed) => ({
        prompt,
        seed,
        steps: 4,
        width: SHARED_IMAGE_SIZE,
        height: SHARED_IMAGE_SIZE,
        samples: 1,
      }),
    },
    {
      model: "black-forest-labs/flux.1-schnell",
      buildBody: (prompt, seed) => ({
        prompt,
        seed,
        steps: 4,
        width: SHARED_IMAGE_SIZE,
        height: SHARED_IMAGE_SIZE,
        samples: 1,
        mode: "base",
        cfg_scale: 0,
      }),
    },
  ],
};

function detectImageMimeType(binary: Buffer): string {
  if (binary.length >= 3 && binary[0] === 0xff && binary[1] === 0xd8 && binary[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    binary.length >= 8 &&
    binary[0] === 0x89 &&
    binary[1] === 0x50 &&
    binary[2] === 0x4e &&
    binary[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    binary.length >= 12 &&
    binary.subarray(0, 4).toString("ascii") === "RIFF" &&
    binary.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/png";
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function getEnvApiKey(useCase: NvidiaImageUseCase): string | null {
  if (useCase === "estamparia") {
    const estampariaEnv =
      process.env.ESTAMPARIA_NVIDIA_IMAGE_API_KEY ||
      process.env.ESTAMPARIA_NVIDIA_API_KEY;
    if (estampariaEnv) return String(estampariaEnv).trim() || null;
  }

  if (useCase === "status") {
    const statusEnv =
      process.env.STATUS_NVIDIA_IMAGE_API_KEY ||
      process.env.STATUS_NVIDIA_API_KEY;
    if (statusEnv) return String(statusEnv).trim() || null;
  }

  const sharedEnv =
    process.env.NVIDIA_IMAGE_API_KEY ||
    process.env.NVIDIA_API_KEY ||
    process.env.BLOG_NVIDIA_API_KEY;

  return sharedEnv ? String(sharedEnv).trim() || null : null;
}

export async function resolveNvidiaImageApiKey(
  useCase: NvidiaImageUseCase = "estamparia",
): Promise<string | null> {
  const fromEnv = getEnvApiKey(useCase);

  if (fromEnv) {
    return fromEnv;
  }

  const keys =
    useCase === "estamparia"
      ? ["estamparia_nvidia_api_key", "blog_nvidia_api_key", "nvidia_api_key"]
      : ["status_nvidia_api_key", "blog_nvidia_api_key", "nvidia_api_key"];
  const values = await storage.getSystemConfigs(keys);

  const fromSystemConfig =
    (useCase === "estamparia" ? values.get("estamparia_nvidia_api_key") : values.get("status_nvidia_api_key")) ||
    values.get("blog_nvidia_api_key") ||
    values.get("nvidia_api_key");

  return fromSystemConfig ? String(fromSystemConfig).trim() || null : null;
}

async function assertImageLooksUsable(binary: Buffer, model: string) {
  const stats = await sharp(binary).stats();
  const channelMeans = stats.channels.map((channel) => channel.mean);
  const channelStdevs = stats.channels.map((channel) => channel.stdev);
  const maxMean = Math.max(...channelMeans);
  const maxDeviation = Math.max(...channelStdevs);
  const entropy = Number(stats.entropy || 0);

  const isBlackFrame = maxMean < 8 && maxDeviation < 4 && entropy < 0.15;
  if (isBlackFrame) {
    throw new Error(`A NVIDIA retornou uma arte preta ou vazia no modelo ${model}`);
  }
}

export async function generateNvidiaImage(
  prompt: string,
  options: GenerateNvidiaImageOptions = {},
): Promise<NvidiaGeneratedImage> {
  const useCase = options.useCase || "estamparia";
  const apiKey = await resolveNvidiaImageApiKey(useCase);

  if (!apiKey) {
    throw new Error("A chave de imagem da NVIDIA nao esta configurada no servidor");
  }

  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) {
    throw new Error("Descreva a arte que deseja gerar");
  }

  const filePrefix = options.filePrefix || `${useCase}-ai`;
  const models = NVIDIA_IMAGE_MODELS[useCase] || NVIDIA_IMAGE_MODELS.estamparia;
  let lastError = "Falha ao gerar imagem";

  for (let round = 0; round < 3; round += 1) {
    for (const model of models) {
      try {
        const seed = Date.now() % 100000;
        const response = await fetch(`https://ai.api.nvidia.com/v1/genai/${model.model}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(model.buildBody(cleanPrompt, seed)),
          signal: AbortSignal.timeout(90_000),
        });

        if (!response.ok) {
          const text = await response.text();
          lastError = text || `Erro NVIDIA ${response.status}`;

          if (response.status >= 500 || response.status === 429) {
            await new Promise((resolve) => setTimeout(resolve, 1500 * (round + 1)));
            continue;
          }

          break;
        }

        const data = await response.json();
        const artifact = Array.isArray(data?.artifacts) ? data.artifacts[0] : null;
        const base64 = String(artifact?.base64 || "").trim();
        if (!base64) {
          throw new Error("Resposta da NVIDIA sem imagem");
        }

        const binary = Buffer.from(base64, "base64");
        await assertImageLooksUsable(binary, model.model);
        const mimeType = detectImageMimeType(binary);
        const extension = extensionFromMimeType(mimeType);

        return {
          dataUrl: `data:${mimeType};base64,${base64}`,
          mimeType,
          fileName: `${filePrefix}-${Date.now()}.${extension}`,
          model: model.model,
        };
      } catch (error: any) {
        lastError = error?.message || lastError;
        await new Promise((resolve) => setTimeout(resolve, 1500 * (round + 1)));
      }
    }
  }

  throw new Error(lastError);
}
