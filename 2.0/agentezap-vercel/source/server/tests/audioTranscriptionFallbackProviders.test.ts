import test from "node:test";
import * as assert from "node:assert/strict";

import {
  type AudioFallbackResolvedLLMConfig,
  DEFAULT_DEEPINFRA_STT_MODELS,
  DEFAULT_NVIDIA_FREE_AUDIO_MODELS,
  DEFAULT_OPENROUTER_FREE_AUDIO_MODELS,
  DEFAULT_OPENROUTER_STT_MODELS,
  resolveDeepInfraSttModels,
  resolveNvidiaAudioModels,
  resolveOpenRouterAudioModels,
  resolveOpenRouterSttModels,
  transcribeAudioWithFallbackProviders,
} from "../audioTranscriptionFallbackProviders";

function buildConfig(overrides: Partial<AudioFallbackResolvedLLMConfig> = {}): AudioFallbackResolvedLLMConfig {
  return {
    deepinfraApiKey: "di-...ngth",
    deepinfraTranscriptionModel: "mistralai/Voxtral-Mini-3B-2507",
    openrouterApiKey: "sk-or-...ngth",
    openrouterModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
    openrouterModels: ["nvidia/nemotron-3-ultra-550b-a55b:free"],
    nvidiaApiKey: "nvapi-...ngth",
    nvidiaModel: "nvidia/llama-3.3-nemotron-super-49b-v1",
    ...overrides,
  };
}

test("resolveDeepInfraSttModels defaults to Voxtral Mini as the primary pure STT model", () => {
  const models = resolveDeepInfraSttModels(buildConfig());

  assert.deepEqual(models, [...DEFAULT_DEEPINFRA_STT_MODELS]);
});

test("resolveOpenRouterAudioModels always includes the free OpenRouter audio-capable NVIDIA model first", () => {
  const models = resolveOpenRouterAudioModels(buildConfig({
    openrouterModel: "google/gemini-2.5-flash",
    openrouterModels: ["openai/gpt-audio-mini", "meta-llama/llama-3.3-70b-instruct:free"],
  }));

  assert.equal(models[0], DEFAULT_OPENROUTER_FREE_AUDIO_MODELS[0]);
  assert.deepEqual(models, [
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "openai/gpt-audio-mini",
    "google/gemini-2.5-flash",
  ]);
});

test("resolveOpenRouterSttModels always includes cost-optimized dedicated STT models first", () => {
  const models = resolveOpenRouterSttModels(buildConfig({
    openrouterModel: "mistralai/voxtral-mini-transcribe",
    openrouterModels: ["openai/whisper-large-v3", "openai/gpt-oss-120b:free"],
  }));

  assert.deepEqual(models, [
    ...DEFAULT_OPENROUTER_STT_MODELS,
  ]);
});

test("resolveNvidiaAudioModels always includes the free NVIDIA audio-capable omni model first", () => {
  const models = resolveNvidiaAudioModels(buildConfig({
    nvidiaModel: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  }));

  assert.equal(models[0], DEFAULT_NVIDIA_FREE_AUDIO_MODELS[0]);
  assert.deepEqual(models, ["nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"]);
});

test("transcribeAudioWithFallbackProviders uses DeepInfra Voxtral Mini STT endpoint first", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedModel = "";
  let requestedFileName = "";

  globalThis.fetch = async (url, init) => {
    requestedUrl = String(url);
    const body = init?.body as FormData;
    requestedModel = String(body.get("model") || "");
    const file = body.get("file") as File;
    requestedFileName = file?.name || "";

    return new Response(JSON.stringify({
      text: "Quero deixar o agente mais vendedor.",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const transcription = await transcribeAudioWithFallbackProviders(new Uint8Array([1, 2, 3]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    config: buildConfig(),
  });

  assert.equal(requestedUrl, "https://api.deepinfra.com/v1/audio/transcriptions");
  assert.equal(requestedModel, "mistralai/Voxtral-Mini-3B-2507");
  assert.equal(requestedFileName, "audio.ogg");
  assert.equal(transcription, "Quero deixar o agente mais vendedor.");
});

test("transcribeAudioWithFallbackProviders uses OpenRouter STT when DeepInfra is not configured", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedModel = "";
  let inputAudioData = "";

  globalThis.fetch = async (url, init) => {
    requestedUrl = String(url);
    const body = JSON.parse(String(init?.body || "{}"));
    requestedModel = body.model;
    inputAudioData = body.input_audio?.data;

    return new Response(JSON.stringify({
      text: "Quero deixar o agente mais vendedor.",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const transcription = await transcribeAudioWithFallbackProviders(new Uint8Array([1, 2, 3]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    config: buildConfig({ deepinfraApiKey: "" }),
  });

  assert.equal(requestedUrl, "https://openrouter.ai/api/v1/audio/transcriptions");
  assert.equal(requestedModel, "nvidia/parakeet-tdt-0.6b-v3");
  assert.equal(inputAudioData, "AQID");
  assert.equal(transcription, "Quero deixar o agente mais vendedor.");
});

test("transcribeAudioWithFallbackProviders falls back to direct NVIDIA audio model when conversational fallbacks are enabled", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; model: string }> = [];

  globalThis.fetch = async (url, init) => {
    const model = init?.body instanceof FormData
      ? String(init.body.get("model") || "")
      : JSON.parse(String(init?.body || "{}")).model;
    calls.push({ url: String(url), model });

    if (String(url).includes("openrouter.ai")) {
      return new Response(JSON.stringify({ error: { message: "insufficient credits" } }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: "A gente precisa configurar o atendimento automatico.",
          },
        },
      ],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const transcription = await transcribeAudioWithFallbackProviders(new Uint8Array([4, 5, 6]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    config: buildConfig(),
  });

  assert.deepEqual(calls, [
    {
      url: "https://api.deepinfra.com/v1/audio/transcriptions",
      model: "mistralai/Voxtral-Mini-3B-2507",
    },
    {
      url: "https://openrouter.ai/api/v1/audio/transcriptions",
      model: "nvidia/parakeet-tdt-0.6b-v3",
    },
    {
      url: "https://openrouter.ai/api/v1/audio/transcriptions",
      model: "openai/whisper-large-v3",
    },
    {
      url: "https://openrouter.ai/api/v1/audio/transcriptions",
      model: "mistralai/voxtral-mini-transcribe",
    },
    {
      url: "https://openrouter.ai/api/v1/chat/completions",
      model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    },
    {
      url: "https://integrate.api.nvidia.com/v1/chat/completions",
      model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    },
  ]);
  assert.equal(transcription, "A gente precisa configurar o atendimento automatico.");
});

test("transcribeAudioWithFallbackProviders can disable conversational audio fallbacks", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; model: string }> = [];

  globalThis.fetch = async (url, init) => {
    const model = init?.body instanceof FormData
      ? String(init.body.get("model") || "")
      : JSON.parse(String(init?.body || "{}")).model;
    calls.push({ url: String(url), model });

    return new Response(JSON.stringify({ error: { message: "insufficient credits" } }), {
      status: 402,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const transcription = await transcribeAudioWithFallbackProviders(new Uint8Array([7, 8, 9]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    config: buildConfig(),
    allowConversationalAudioFallback: false,
  });

  assert.deepEqual(calls, [
    {
      url: "https://api.deepinfra.com/v1/audio/transcriptions",
      model: "mistralai/Voxtral-Mini-3B-2507",
    },
    {
      url: "https://openrouter.ai/api/v1/audio/transcriptions",
      model: "nvidia/parakeet-tdt-0.6b-v3",
    },
    {
      url: "https://openrouter.ai/api/v1/audio/transcriptions",
      model: "openai/whisper-large-v3",
    },
    {
      url: "https://openrouter.ai/api/v1/audio/transcriptions",
      model: "mistralai/voxtral-mini-transcribe",
    },
  ]);
  assert.equal(transcription, null);
});

test("transcribeAudioWithFallbackProviders can restrict the primary path to DeepInfra only", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; model: string }> = [];

  globalThis.fetch = async (url, init) => {
    const body = init?.body as FormData;
    calls.push({
      url: String(url),
      model: String(body.get("model") || ""),
    });

    return new Response(JSON.stringify({ error: { message: "insufficient credits" } }), {
      status: 402,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const transcription = await transcribeAudioWithFallbackProviders(new Uint8Array([7, 8, 9]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    config: buildConfig(),
    allowConversationalAudioFallback: false,
    providers: ["deepinfra"],
  });

  assert.deepEqual(calls, [
    {
      url: "https://api.deepinfra.com/v1/audio/transcriptions",
      model: "mistralai/Voxtral-Mini-3B-2507",
    },
  ]);
  assert.equal(transcription, null);
});

test("transcribeAudioWithFallbackProviders stops DeepInfra provider after credit failure across configured models", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; model: string }> = [];

  globalThis.fetch = async (url, init) => {
    const body = init?.body as FormData;
    calls.push({
      url: String(url),
      model: String(body.get("model") || ""),
    });

    return new Response(JSON.stringify({ error: { message: "insufficient credits" } }), {
      status: 402,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const transcription = await transcribeAudioWithFallbackProviders(new Uint8Array([7, 8, 9]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    config: buildConfig({
      deepinfraTranscriptionModel: "mistralai/Voxtral-Mini-3B-2507",
      deepinfraTranscriptionModels: ["openai/whisper-large-v3"],
    }),
    allowConversationalAudioFallback: false,
    stopDeepInfraProviderAfterFirstFailure: true,
    providers: ["deepinfra"],
  });

  assert.deepEqual(calls, [
    {
      url: "https://api.deepinfra.com/v1/audio/transcriptions",
      model: "mistralai/Voxtral-Mini-3B-2507",
    },
  ]);
  assert.equal(transcription, null);
});

test("transcribeAudioWithFallbackProviders stops DeepInfra provider after generic upstream error when primary path requests immediate local fallback", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; model: string }> = [];

  globalThis.fetch = async (url, init) => {
    const body = init?.body as FormData;
    calls.push({
      url: String(url),
      model: String(body.get("model") || ""),
    });

    return new Response(JSON.stringify({ error: { message: "temporary upstream error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const transcription = await transcribeAudioWithFallbackProviders(new Uint8Array([7, 8, 9]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    config: buildConfig({
      deepinfraTranscriptionModel: "mistralai/Voxtral-Mini-3B-2507",
      deepinfraTranscriptionModels: ["openai/whisper-large-v3"],
    }),
    allowConversationalAudioFallback: false,
    stopDeepInfraProviderAfterFirstFailure: true,
    providers: ["deepinfra"],
  });

  assert.deepEqual(calls, [
    {
      url: "https://api.deepinfra.com/v1/audio/transcriptions",
      model: "mistralai/Voxtral-Mini-3B-2507",
    },
  ]);
  assert.equal(transcription, null);
});
