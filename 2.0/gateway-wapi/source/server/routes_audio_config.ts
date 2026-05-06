/**
 * Audio TTS configuration routes.
 */

import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./supabaseAuth";
import { generateWithEdgeTTS } from "./ttsService";
import { audioResponseModes } from "@shared/schema";

function getUserId(req: any): string {
  return req.user.claims.sub;
}

const VOICE_MAP = {
  female: "pt-BR-FranciscaNeural",
  male: "pt-BR-AntonioNeural",
};

function normalizeAudioResponseMode(responseMode: string | null | undefined) {
  if (responseMode === "audio_first_message_then_customer_audio") {
    return "first_message_text_audio_then_mirror";
  }

  return responseMode;
}

export function registerAudioConfigRoutes(app: Express): void {
  console.log("[AUDIO-CONFIG] Registering audio configuration routes...");

  app.get("/api/audio-config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);

      let config = await storage.getAudioConfig(userId);
      if (!config) {
        config = await storage.createAudioConfig(userId);
      }

      const usage = await storage.canSendAudio(userId);

      res.json({
        config: {
          isEnabled: config.isEnabled,
          voiceType: config.voiceType,
          responseMode: normalizeAudioResponseMode(config.responseMode),
          speed: parseFloat(config.speed as unknown as string),
        },
        usage: {
          used: usage.used,
          remaining: usage.remaining,
          limit: usage.limit,
          canSend: usage.canSend,
          isUnlimited: usage.isUnlimited,
        },
      });
    } catch (error: any) {
      console.error("[AUDIO-CONFIG] Failed to load config:", error);
      res.status(500).json({ message: "Erro ao buscar configuracao de audio" });
    }
  });

  app.put("/api/audio-config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { isEnabled, voiceType, responseMode, speed } = req.body;

      if (speed !== undefined) {
        const speedNum = parseFloat(speed);
        if (Number.isNaN(speedNum) || speedNum < 0.5 || speedNum > 2.0) {
          return res.status(400).json({ message: "Velocidade deve ser entre 0.5 e 2.0" });
        }
      }

      if (voiceType && !["female", "male"].includes(voiceType)) {
        return res.status(400).json({ message: "Tipo de voz invalido. Use 'female' ou 'male'" });
      }

      if (responseMode && !audioResponseModes.includes(responseMode)) {
        return res.status(400).json({
          message:
            "Modo de resposta invalido. Use 'first_message_text_audio_then_mirror', 'audio_first_message_then_customer_audio', 'audio_on_customer_audio', 'audio_only' ou 'audio_text'",
        });
      }

      const config = await storage.updateAudioConfig(userId, {
        isEnabled: isEnabled !== undefined ? isEnabled : undefined,
        voiceType: voiceType || undefined,
        responseMode: responseMode || undefined,
        speed: speed !== undefined ? String(speed) : undefined,
      });

      res.json({
        success: true,
        config: {
          isEnabled: config.isEnabled,
          voiceType: config.voiceType,
          responseMode: normalizeAudioResponseMode(config.responseMode),
          speed: parseFloat(config.speed as unknown as string),
        },
      });
    } catch (error: any) {
      console.error("[AUDIO-CONFIG] Failed to update config:", error);
      res.status(500).json({ message: "Erro ao atualizar configuracao de audio" });
    }
  });

  app.get("/api/audio-config/usage", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const usage = await storage.canSendAudio(userId);

      res.json({
        used: usage.used,
        remaining: usage.remaining,
        limit: usage.limit,
        canSend: usage.canSend,
        isUnlimited: usage.isUnlimited,
      });
    } catch (error: any) {
      console.error("[AUDIO-CONFIG] Failed to load usage:", error);
      res.status(500).json({ message: "Erro ao buscar uso de audio" });
    }
  });

  app.post("/api/audio-config/test", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { text, speed: overrideSpeed } = req.body;
      const testText =
        text || "Ola! Este e um teste da configuracao de voz para o seu agente de atendimento.";

      let config = await storage.getAudioConfig(userId);
      if (!config) {
        config = await storage.createAudioConfig(userId);
      }

      const speedToUse =
        overrideSpeed !== undefined
          ? parseFloat(overrideSpeed)
          : parseFloat(config.speed as unknown as string);

      const voice = VOICE_MAP[config.voiceType as keyof typeof VOICE_MAP] || VOICE_MAP.female;
      const ratePercent = Math.round((speedToUse - 1) * 100);
      const rate = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

      console.log(`[AUDIO-CONFIG] Generating test audio - Voice: ${voice}, Rate: ${rate}`);

      const audioBuffer = await generateWithEdgeTTS(testText, voice, rate);
      if (!audioBuffer || audioBuffer.length < 1000) {
        return res.status(500).json({ message: "Falha ao gerar audio de teste" });
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", 'attachment; filename="test_audio.mp3"');
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("[AUDIO-CONFIG] Failed to generate test audio:", error);
      res.status(500).json({ message: "Erro ao gerar audio de teste", error: error.message });
    }
  });

  app.post("/api/audio-config/preview", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { speed, voiceType } = req.body;

      if (speed === undefined || Number.isNaN(parseFloat(speed))) {
        return res.status(400).json({ message: "Velocidade e obrigatoria" });
      }

      const speedNum = parseFloat(speed);
      if (speedNum < 0.5 || speedNum > 2.0) {
        return res.status(400).json({ message: "Velocidade deve ser entre 0.5 e 2.0" });
      }

      const previewText =
        "Este e um exemplo de como a voz do seu assistente vai soar com esta configuracao.";
      const voice = voiceType === "male" ? VOICE_MAP.male : VOICE_MAP.female;
      const ratePercent = Math.round((speedNum - 1) * 100);
      const rate = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

      console.log(`[AUDIO-CONFIG] Preview - Voice: ${voice}, Speed: ${speedNum}, Rate: ${rate}`);

      const audioBuffer = await generateWithEdgeTTS(previewText, voice, rate);
      if (!audioBuffer || audioBuffer.length < 1000) {
        return res.status(500).json({ message: "Falha ao gerar preview" });
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", 'attachment; filename="preview_audio.mp3"');
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("[AUDIO-CONFIG] Failed to generate preview:", error);
      res.status(500).json({ message: "Erro ao gerar preview", error: error.message });
    }
  });

  console.log("[AUDIO-CONFIG] Audio routes registered.");
}
