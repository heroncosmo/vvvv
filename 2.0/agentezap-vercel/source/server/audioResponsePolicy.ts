import type { AudioResponseMode } from "@shared/schema";

export type AudioResponseDecisionMode = AudioResponseMode | "disabled";

export interface AudioResponseDecisionInput {
  responseMode: AudioResponseMode;
  customerMessageWasAudio?: boolean;
  firstAgentReplyInConversation?: boolean;
}

export interface AudioResponseDecisionResult {
  responseMode: AudioResponseDecisionMode;
  shouldSendText: boolean;
  shouldGenerateAudio: boolean;
  fallbackToTextIfAudioFails: boolean;
}

export function resolveAudioResponseDecision(
  input: AudioResponseDecisionInput,
): AudioResponseDecisionResult {
  const customerMessageWasAudio = Boolean(input.customerMessageWasAudio);
  const firstAgentReplyInConversation = Boolean(input.firstAgentReplyInConversation);
  const responseMode =
    input.responseMode === "first_message_text_audio_then_mirror"
      ? "audio_first_message_then_customer_audio"
      : input.responseMode;

  if (responseMode === "audio_text") {
    return {
      responseMode: input.responseMode,
      shouldSendText: true,
      shouldGenerateAudio: true,
      fallbackToTextIfAudioFails: false,
    };
  }

  if (responseMode === "audio_only") {
    return {
      responseMode: input.responseMode,
      shouldSendText: false,
      shouldGenerateAudio: true,
      fallbackToTextIfAudioFails: true,
    };
  }

  if (responseMode === "audio_first_message_then_customer_audio") {
    if (firstAgentReplyInConversation) {
      return {
        responseMode: input.responseMode,
        shouldSendText: true,
        shouldGenerateAudio: true,
        fallbackToTextIfAudioFails: false,
      };
    }

    return {
      responseMode: input.responseMode,
      shouldSendText: !customerMessageWasAudio,
      shouldGenerateAudio: customerMessageWasAudio,
      fallbackToTextIfAudioFails: customerMessageWasAudio,
    };
  }

  return {
    responseMode: input.responseMode,
    shouldSendText: !customerMessageWasAudio,
    shouldGenerateAudio: customerMessageWasAudio,
    fallbackToTextIfAudioFails: customerMessageWasAudio,
  };
}
