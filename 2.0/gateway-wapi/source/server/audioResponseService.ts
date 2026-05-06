/**
 * 🎤 Serviço de Áudio para Respostas da IA
 * 
 * Gera áudio TTS automaticamente quando o agente responde,
 * respeitando o limite diário de 30 mensagens por cliente.
 */

import { storage } from "./storage";
import { generateWithEdgeTTS } from "./ttsService";
import type { AudioResponseMode } from "@shared/schema";
import { stripWhatsappSignatureForSpeech } from "@shared/agentSignature";
import { resolveAudioResponseDecision as resolveAudioResponsePolicyDecision } from "./audioResponsePolicy";
import { shouldBlockAutomatedConversationSend } from "./conversationAutoPauseGuard";
import { convertBufferToWhatsAppAudio } from "./audioConverter";

// Mapeamento de vozes
const VOICE_MAP = {
  female: "pt-BR-FranciscaNeural",
  male: "pt-BR-AntonioNeural",
};

type AudioResponseDecisionMode = AudioResponseMode | "disabled";

export interface AudioResponseContext {
  customerMessageWasAudio?: boolean;
  firstAgentReplyInConversation?: boolean;
  conversationId?: string;
  isFirstOutboundMessage?: boolean;
}

export interface AudioResponseSettings {
  responseMode: AudioResponseDecisionMode;
  shouldSendText: boolean;
  shouldGenerateAudio: boolean;
  fallbackToTextIfAudioFails: boolean;
  voice?: string;
  speed?: string;
  rate?: string;
}

export interface AudioResponseDecisionInput {
  responseMode: AudioResponseMode;
  customerMessageWasAudio?: boolean;
  firstAgentReplyInConversation?: boolean;
}

export interface SentAudioResponseInfo {
  messageId?: string | null;
  mediaMimeType: string;
}

export interface SentTextCompanionInfo {
  messageId?: string | null;
  text: string;
}

interface AudioSendOptions {
  registerSentMessageId?: (messageId: string) => void;
  onSent?: (info: SentAudioResponseInfo) => Promise<void> | void;
  onTextCompanionSent?: (info: SentTextCompanionInfo) => Promise<void> | void;
  signatureName?: string | null;
}
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s]+/gi;
const DOMAIN_REGEX =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com(?:\.br)?|net|org|io|app|dev|co|ai|me|br|site|online|info|biz|gov|edu)(?:\/[^\s]*)?/gi;

/**
 * 🧹 Sanitiza texto para TTS - Remove TUDO que não faz sentido em áudio falado
 * 
 * O Edge TTS (e qualquer TTS) tropeça em:
 * - Emojis (lê o nome Unicode: "rosto sorridente com olhos sorridentes")
 * - Formatação WhatsApp/Markdown (*negrito*, _itálico_, ~tachado~, `código`)
 * - Aspas de todos os tipos (" " ' ' « »)
 * - URLs, e-mails
 * - Símbolos especiais (@, #, $, %, &, =, +, <, >, ^, |)
 * - Separadores visuais (═══, ━━━, ---, ___) 
 * - Caracteres de seta (→, ←, ⇒, ➜)
 * - Caracteres box-drawing e decorativos
 * 
 * O resultado deve ser APENAS texto natural, como se alguém fosse ler em voz alta.
 * 
 * @param text - Texto original com formatação
 * @returns Texto limpo, natural para ser falado
 */
function sanitizeTextForTTS(text: string): string {
  if (!text) return text;

  let cleanedText = text;

  // ═══════════════════════════════════════════
  // 1. REMOVER URLS E E-MAILS
  // ═══════════════════════════════════════════
  cleanedText = cleanedText.replace(/(?:https?:\/\/|www\.)[^\s]+/gi, '');
  cleanedText = cleanedText.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');

  // ═══════════════════════════════════════════
  // 2. REMOVER TODOS OS EMOJIS
  // TTS lê o nome Unicode do emoji, ex: "😊" vira "rosto sorridente"
  // Isso quebra completamente a fala natural
  // ═══════════════════════════════════════════
  
  // Regex abrangente para emojis Unicode (inclui todos os blocos de emoji)
  cleanedText = cleanedText.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // Emoticons
  cleanedText = cleanedText.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // Misc Symbols & Pictographs
  cleanedText = cleanedText.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // Transport & Map
  cleanedText = cleanedText.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, ''); // Flags
  cleanedText = cleanedText.replace(/[\u{2600}-\u{26FF}]/gu, '');   // Misc symbols (☀️, ⚡, etc)
  cleanedText = cleanedText.replace(/[\u{2700}-\u{27BF}]/gu, '');   // Dingbats (✅, ❌, ✨, etc)
  cleanedText = cleanedText.replace(/[\u{FE00}-\u{FE0F}]/gu, '');   // Variation Selectors
  cleanedText = cleanedText.replace(/[\u{1F900}-\u{1F9FF}]/gu, ''); // Supplemental Symbols
  cleanedText = cleanedText.replace(/[\u{1FA00}-\u{1FA6F}]/gu, ''); // Chess, extended-A
  cleanedText = cleanedText.replace(/[\u{1FA70}-\u{1FAFF}]/gu, ''); // Symbols extended-A
  cleanedText = cleanedText.replace(/[\u{200D}]/gu, '');            // Zero-width joiner (combina emojis)
  cleanedText = cleanedText.replace(/[\u{20E3}]/gu, '');            // Combining enclosing keycap
  cleanedText = cleanedText.replace(/[\u{E0020}-\u{E007F}]/gu, ''); // Tags (flag sequences)
  cleanedText = cleanedText.replace(/[\u{2300}-\u{23FF}]/gu, '');   // Misc Technical (⏰, ⏳, etc)
  cleanedText = cleanedText.replace(/[\u{2B05}-\u{2B55}]/gu, '');   // Arrows & shapes (⬅️, ⭐, etc)
  cleanedText = cleanedText.replace(/[\u{FE00}-\u{FE0F}]/gu, '');   // Variation selectors
  cleanedText = cleanedText.replace(/[\u{200B}-\u{200F}]/gu, '');   // Zero-width spaces
  cleanedText = cleanedText.replace(/[\u{2028}-\u{2029}]/gu, '');   // Line/paragraph separators

  // ═══════════════════════════════════════════
  // 3. REMOVER FORMATAÇÃO MARKDOWN/WHATSAPP
  // ═══════════════════════════════════════════
  
  // Blocos de código primeiro (podem conter outros marcadores)
  cleanedText = cleanedText.replace(/```[\s\S]*?```/g, '');
  
  // Asteriscos (negrito): *texto* → texto  /  **texto** → texto
  cleanedText = cleanedText.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
  cleanedText = cleanedText.replace(/\*/g, '');

  // Underlines (itálico): _texto_ → texto
  cleanedText = cleanedText.replace(/_+([^_]+)_+/g, '$1');
  cleanedText = cleanedText.replace(/_/g, ' ');

  // Til (tachado): ~texto~ → texto
  cleanedText = cleanedText.replace(/~+([^~]+)~+/g, '$1');
  cleanedText = cleanedText.replace(/~/g, '');

  // Código inline: `código` → código
  cleanedText = cleanedText.replace(/`+([^`]+)`+/g, '$1');
  cleanedText = cleanedText.replace(/`/g, '');

  // ═══════════════════════════════════════════
  // 4. REMOVER ASPAS DE TODOS OS TIPOS
  // TTS pode ler "abre aspas" / "fecha aspas" que soa horrível
  // ═══════════════════════════════════════════
  cleanedText = cleanedText.replace(/[""\u201C\u201D\u201E\u201F\u2033\u2036]/g, ''); // Aspas duplas
  cleanedText = cleanedText.replace(/[''\u2018\u2019\u201A\u201B\u2032\u2035]/g, ''); // Aspas simples
  cleanedText = cleanedText.replace(/[«»\u2039\u203A]/g, ''); // Aspas angulares/francesas
  cleanedText = cleanedText.replace(/'/g, '');  // Apóstrofo simples
  cleanedText = cleanedText.replace(/"/g, '');  // Aspas simples ASCII

  // ═══════════════════════════════════════════
  // 5. REMOVER SEPARADORES VISUAIS E LINHAS DECORATIVAS
  // ═══════════════════════════════════════════
  cleanedText = cleanedText.replace(/[═━─—–╔╗╚╝╠╣╦╩╬║├┤┬┴┼┌┐└┘│▔▁▂▃▄▅▆▇█▉▊▋▌▍▎▏░▒▓]/g, '');
  cleanedText = cleanedText.replace(/-{3,}/g, '');  // --- ou mais
  cleanedText = cleanedText.replace(/_{3,}/g, '');   // ___ ou mais

  // ═══════════════════════════════════════════
  // 6. REMOVER/SUBSTITUIR SETAS E SÍMBOLOS ESPECIAIS
  // ═══════════════════════════════════════════
  
  // Setas Unicode → remover
  cleanedText = cleanedText.replace(/[→←↑↓↔↕⇒⇐⇑⇓⇔➜➤➡➔➝➞➠►▶◀◁▷◆◇▸▹▻●○•]/g, '');
  
  // Símbolos que TTS pode tentar ler
  cleanedText = cleanedText.replace(/@/g, '');     // arroba
  cleanedText = cleanedText.replace(/#(?!\d)/g, ''); // hashtag (preserva #123 = número)
  cleanedText = cleanedText.replace(/\^/g, '');
  cleanedText = cleanedText.replace(/\|/g, '');
  cleanedText = cleanedText.replace(/[<>]/g, '');
  cleanedText = cleanedText.replace(/[=+]/g, '');
  cleanedText = cleanedText.replace(/&(?!(\w+;))/g, 'e'); // & → "e" (mas preserva &nbsp; etc)
  
  // Colchetes: [texto] → texto
  cleanedText = cleanedText.replace(/\[([^\]]*)\]/g, '$1');
  
  // Chaves: {texto} → texto
  cleanedText = cleanedText.replace(/\{([^}]*)\}/g, '$1');

  // Parênteses: manter se contêm texto curto, remover se vazios ou decorativos
  cleanedText = cleanedText.replace(/\(\s*\)/g, ''); // () vazio
  cleanedText = cleanedText.replace(/\(\(([^)]*)\)\)/g, '$1'); // ((texto)) → texto

  // ═══════════════════════════════════════════
  // 7. SUBSTITUIÇÕES INTELIGENTES (R$, %, etc)
  // ═══════════════════════════════════════════
  
  // R$ 100 → 100 reais (TTS já lê "R$" como "reais" geralmente, mas melhor garantir)
  cleanedText = cleanedText.replace(/R\$\s*(\d)/g, '$1');
  
  // Citação Markdown: > texto → texto  
  cleanedText = cleanedText.replace(/^>\s*/gm, '');
  
  // Bullets e marcadores no início de linhas
  cleanedText = cleanedText.replace(/^[-•]\s*/gm, '');
  
  // Hashtags como cabeçalho: ## Título → Título
  cleanedText = cleanedText.replace(/^#+\s+/gm, '');

  // ═══════════════════════════════════════════
  // 8. LIMPAR PONTUAÇÃO EXCESSIVA
  // ═══════════════════════════════════════════
  cleanedText = cleanedText.replace(/\.{4,}/g, '...');   // ...... → ...
  cleanedText = cleanedText.replace(/!{2,}/g, '!');       // !!!!! → !
  cleanedText = cleanedText.replace(/\?{2,}/g, '?');      // ????? → ?
  cleanedText = cleanedText.replace(/,{2,}/g, ',');        // ,,,, → ,
  cleanedText = cleanedText.replace(/;{2,}/g, ';');        // ;;;; → ;
  cleanedText = cleanedText.replace(/:{2,}/g, ':');        // :::: → :

  // ═══════════════════════════════════════════
  // 9. LIMPAR ESCAPE CHARACTERS E HTML ENTITIES
  // ═══════════════════════════════════════════
  cleanedText = cleanedText.replace(/\\[nrtfvb]/g, ' ');
  cleanedText = cleanedText.replace(/\\/g, '');
  cleanedText = cleanedText.replace(/&nbsp;/gi, ' ');
  cleanedText = cleanedText.replace(/&amp;/gi, 'e');
  cleanedText = cleanedText.replace(/&lt;/gi, '');
  cleanedText = cleanedText.replace(/&gt;/gi, '');
  cleanedText = cleanedText.replace(/&quot;/gi, '');
  cleanedText = cleanedText.replace(/&#\d+;/g, '');       // &#123; entities numéricas
  cleanedText = cleanedText.replace(/&\w+;/g, '');         // Qualquer entity restante

  // ═══════════════════════════════════════════
  // 10. NORMALIZAR ESPAÇOS E QUEBRAS DE LINHA
  // ═══════════════════════════════════════════
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');   // Max 2 quebras de linha
  cleanedText = cleanedText.replace(/[ \t]{2,}/g, ' ');   // Espaços múltiplos → um
  cleanedText = cleanedText.replace(/\s+([.,!?;:])/g, '$1'); // Espaço antes de pontuação
  cleanedText = cleanedText.replace(/^\s+$/gm, '');        // Linhas só com espaço
  cleanedText = cleanedText.trim();

  // ═══════════════════════════════════════════
  // 11. LOG PARA DEBUG
  // ═══════════════════════════════════════════
  if (text.length !== cleanedText.length) {
    const removed = text.length - cleanedText.length;
    console.log(`[TTS-SANITIZE] Texto sanitizado para audio:`);
    console.log(`   Original (${text.length} chars): "${text.substring(0, 80)}..."`);
    console.log(`   Limpo (${cleanedText.length} chars): "${cleanedText.substring(0, 80)}..."`);
    console.log(`   Removidos: ${removed} caracteres de formatacao`);
  }

  return cleanedText;
}

/**
 * @deprecated Use sanitizeTextForTTS() - mantido para compatibilidade
 */
async function sendTextCompanionForLinks(
  jid: string,
  responseText: string,
  socket: any,
  options?: AudioSendOptions
): Promise<boolean> {
  if (!responseRequiresTextCompanion(responseText)) {
    return true;
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const sentMessage = await socket.sendMessage(jid, { text: responseText });
    try {
      await options?.onTextCompanionSent?.({
        messageId: sentMessage?.key?.id || null,
        text: responseText,
      });
    } catch (callbackError) {
      console.error("[TTS-RESPONSE] Erro no callback de texto complementar:", callbackError);
    }
    console.log(`ðŸ”— [TTS-RESPONSE] Texto complementar com link enviado para ${jid}`);
    return true;
  } catch (error) {
    console.error("[TTS-RESPONSE] Erro ao enviar texto complementar com link:", error);
    return false;
  }
}

function normalizeDetectedLink(rawValue: string): string {
  const trimmed = rawValue.trim().replace(/[).,;!?]+$/g, "");
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return `https://${trimmed}`;
}

export function extractLinksFromText(text: string): string[] {
  if (!text) return [];

  const matches = [
    ...(text.match(URL_REGEX) ?? []),
    ...(text.match(DOMAIN_REGEX) ?? []),
  ];

  const uniqueLinks = new Set<string>();

  for (const match of matches) {
    uniqueLinks.add(normalizeDetectedLink(match));
  }

  return Array.from(uniqueLinks);
}

export function responseRequiresTextCompanion(text: string): boolean {
  return extractLinksFromText(text).length > 0;
}

function removeUrlsFromText(text: string): string {
  return sanitizeTextForTTS(text);
}

export function resolveAudioResponseDecision(
  input: AudioResponseDecisionInput
): Pick<
  AudioResponseSettings,
  "responseMode" | "shouldSendText" | "shouldGenerateAudio" | "fallbackToTextIfAudioFails"
> {
  return resolveAudioResponsePolicyDecision(input);
}

/**
 * Verifica se deve gerar áudio TTS para a resposta da IA
 * @param userId - ID do usuário
 * @returns Configuração de áudio ou null se desabilitado/sem cota
 */
export async function getAudioResponseSettings(
  userId: string,
  context?: AudioResponseContext
): Promise<AudioResponseSettings> {
  try {
    const config = await storage.getAudioConfig(userId);
    
    if (!config || !config.isEnabled) {
      console.log(`🔇 [TTS-RESPONSE] Áudio desabilitado para usuário ${userId.substring(0, 8)}...`);
      return {
        responseMode: "disabled",
        shouldSendText: true,
        shouldGenerateAudio: false,
        fallbackToTextIfAudioFails: false,
      };
    }

    const responseMode =
      ((config.responseMode as AudioResponseMode | null) ??
        "first_message_text_audio_then_mirror") as AudioResponseMode;
    const decision = resolveAudioResponsePolicyDecision({
      responseMode,
      customerMessageWasAudio: context?.customerMessageWasAudio,
      firstAgentReplyInConversation:
        context?.firstAgentReplyInConversation ?? context?.isFirstOutboundMessage,
    });

    // 2. Verificar se ainda tem cota diária
    const usage = await storage.canSendAudio(userId);
    
    if (!usage.canSend) {
      console.log(`⚠️ [TTS-RESPONSE] Limite diário atingido para usuário ${userId.substring(0, 8)}... (${usage.limit}/${usage.limit})`);
      return {
        responseMode: decision.responseMode,
        shouldSendText: true,
        shouldGenerateAudio: false,
        fallbackToTextIfAudioFails: false,
      };
    }

    // 3. Preparar configurações
    const voice = VOICE_MAP[config.voiceType as keyof typeof VOICE_MAP] || VOICE_MAP.female;
    const speedNum = parseFloat(config.speed as unknown as string);
    const ratePercent = Math.round((speedNum - 1) * 100);
    const rate = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    console.log(
      `🎤 [TTS-RESPONSE] Áudio habilitado - Mode: ${responseMode}, Voice: ${voice}, Speed: ${speedNum}x, Restante: ${usage.isUnlimited ? "ilimitado" : `${usage.remaining}/${usage.limit}`}`
    );

    return {
      responseMode: decision.responseMode,
      shouldSendText: decision.shouldSendText,
      shouldGenerateAudio: decision.shouldGenerateAudio,
      fallbackToTextIfAudioFails: decision.fallbackToTextIfAudioFails,
      voice,
      speed: config.speed as unknown as string,
      rate,
    };
  } catch (error) {
    console.error("[TTS-RESPONSE] Erro ao verificar config:", error);
    return {
      responseMode: "disabled",
      shouldSendText: true,
      shouldGenerateAudio: false,
      fallbackToTextIfAudioFails: false,
    };
  }
}

export async function shouldGenerateAudioResponse(
  userId: string,
  context?: AudioResponseContext
): Promise<{
  shouldGenerate: boolean;
  voice: string;
  speed: string;
  rate: string;
} | null> {
  const settings = await getAudioResponseSettings(userId, context);

  if (!settings.shouldGenerateAudio || !settings.voice || !settings.speed || !settings.rate) {
    return null;
  }

  return {
    shouldGenerate: true,
    voice: settings.voice,
    speed: settings.speed,
    rate: settings.rate,
  };
}

export interface PreparedWhatsAppVoiceMessage {
  audioBuffer: Buffer;
  mimeType: string;
  ptt: boolean;
  converted: boolean;
}

export async function prepareTtsAudioForWhatsAppVoiceMessage(
  audioBuffer: Buffer,
): Promise<PreparedWhatsAppVoiceMessage> {
  const convertedAudio = await convertBufferToWhatsAppAudio(audioBuffer, "audio/mpeg");
  const shouldUsePtt = convertedAudio.mimeType === "audio/ogg; codecs=opus";

  if (!shouldUsePtt) {
    console.warn(
      `[TTS-RESPONSE] Conversão para nota de voz não ficou em OGG/Opus. ` +
      `Enviando como áudio normal (${convertedAudio.mimeType}) para evitar mídia corrompida.`
    );
  }

  return {
    audioBuffer: convertedAudio.buffer,
    mimeType: convertedAudio.mimeType,
    ptt: shouldUsePtt,
    converted: convertedAudio.converted,
  };
}

/**
 * Gera áudio TTS da resposta da IA
 * IMPORTANTE: Sanitiza texto (remove URLs, formatação, etc) antes de converter
 * @param text - Texto para converter em áudio
 * @param voice - Voz do Edge TTS
 * @param rate - Taxa de velocidade (ex: "+0%", "-20%")
 * @returns Buffer do áudio MP3 ou null se falhar
 */
export async function generateAudioForResponse(
  text: string,
  voice: string,
  rate: string,
  options?: {
    signatureName?: string | null;
  }
): Promise<Buffer | null> {
  try {
    const textWithoutVisualSignature = stripWhatsappSignatureForSpeech(
      text,
      options?.signatureName,
    );

    // 1. SANITIZAR TEXTO COMPLETAMENTE (URLs, formatação, símbolos especiais)
    const sanitizedText = sanitizeTextForTTS(textWithoutVisualSignature);

    if (!sanitizedText || sanitizedText.trim().length === 0) {
      console.log(`⚠️ [TTS-RESPONSE] Texto vazio após sanitização, pulando geração de áudio`);
      return null;
    }

    // 2. Limitar texto muito longo (evitar áudios muito longos)
    const maxLength = 500;
    const trimmedText = sanitizedText.length > maxLength 
      ? sanitizedText.substring(0, maxLength) + "..." 
      : sanitizedText;

    console.log(`🎙️ [TTS-RESPONSE] Gerando áudio para: "${trimmedText.substring(0, 50)}..."`);

    // 3. Gerar áudio com Edge TTS
    const audioBuffer = await generateWithEdgeTTS(trimmedText, voice, rate);

    if (!audioBuffer || audioBuffer.length < 1000) {
      console.error("[TTS-RESPONSE] Áudio gerado muito pequeno ou vazio");
      return null;
    }

    console.log(`✅ [TTS-RESPONSE] Áudio gerado: ${audioBuffer.length} bytes`);
    return audioBuffer;
  } catch (error) {
    console.error("[TTS-RESPONSE] Erro ao gerar áudio:", error);
    return null;
  }
}

/**
 * Envia áudio como mensagem de voz (PTT) via WhatsApp
 * FLUXO OTIMIZADO: Gerar → Salvar temp → Enviar → APAGAR IMEDIATAMENTE
 * Arquivos são sempre apagados, mesmo em caso de erro
 * 
 * @param userId - ID do usuário
 * @param jid - JID do destinatário
 * @param audioBuffer - Buffer do áudio MP3
 * @param socket - Socket do WhatsApp
 */
export async function sendAudioAsVoiceMessage(
  userId: string,
  jid: string,
  audioBuffer: Buffer,
  socket: any,
  conversationId?: string,
  options?: AudioSendOptions
): Promise<boolean> {
  try {
    const pauseCheck = await shouldBlockAutomatedConversationSend({
      userId,
      jid,
      conversationId,
      origin: "ai_agent",
    });
    if (pauseCheck.blocked) {
      console.log(`⏸️ [TTS-RESPONSE] Áudio bloqueado para conversa ${pauseCheck.conversationId} porque a IA está pausada`);
      return false;
    }

    const preparedAudio = await prepareTtsAudioForWhatsAppVoiceMessage(audioBuffer);

    console.log(
      `📤 [TTS-RESPONSE] Enviando áudio para ${jid} ` +
      `(mime=${preparedAudio.mimeType}, ptt=${preparedAudio.ptt}, converted=${preparedAudio.converted})`
    );

    const sentMessage = await socket.sendMessage(jid, {
      audio: preparedAudio.audioBuffer,
      mimetype: preparedAudio.mimeType,
      ptt: preparedAudio.ptt,
    });
    const sentMessageId = sentMessage?.key?.id || null;

    if (sentMessageId) {
      try {
        options?.registerSentMessageId?.(sentMessageId);
      } catch (registerError) {
        console.error("[TTS-RESPONSE] Erro ao registrar messageId do áudio enviado:", registerError);
      }
    }

    try {
      await options?.onSent?.({
        messageId: sentMessageId,
        mediaMimeType: preparedAudio.mimeType,
      });
    } catch (callbackError) {
      console.error("[TTS-RESPONSE] Erro no callback de audio enviado:", callbackError);
    }

    // Incrementar contador de uso
    const counterResult = await storage.incrementAudioMessageCounter(userId);
    console.log(`📊 [TTS-RESPONSE] Contador atualizado: ${counterResult.count}/${counterResult.limit}`);

    console.log(`✅ [TTS-RESPONSE] Áudio enviado com sucesso!`);
    return true;
  } catch (error) {
    console.error("[TTS-RESPONSE] Erro ao enviar áudio:", error);
    return false;
  }
}

/**
 * Processa e envia áudio TTS para uma resposta da IA
 * Esta é a função principal a ser chamada após o agente gerar uma resposta
 * 
 * @param userId - ID do usuário
 * @param jid - JID do destinatário
 * @param responseText - Texto da resposta da IA
 * @param socket - Socket do WhatsApp
 * @returns true se áudio foi enviado, false caso contrário
 */
export async function processAudioResponseForAgent(
  userId: string,
  jid: string,
  responseText: string,
  socket: any,
  context?: AudioResponseContext,
  options?: AudioSendOptions
): Promise<boolean> {
  try {
    // 1. Verificar se deve gerar áudio
    const settings = await getAudioResponseSettings(userId, context);
    
    if (!settings.shouldGenerateAudio || !settings.voice || !settings.rate) {
      return false;
    }

    // 2. Gerar áudio
    const audioBuffer = await generateAudioForResponse(
      responseText,
      settings.voice,
      settings.rate,
      {
        signatureName: options?.signatureName,
      }
    );

    if (!audioBuffer) {
      console.warn("[TTS-RESPONSE] Falha ao gerar áudio, continuando sem ele");
      return false;
    }

    // 3. Pequeno delay antes de enviar o áudio (mais natural)
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500));

    // 4. Enviar áudio
    const sent = await sendAudioAsVoiceMessage(
      userId,
      jid,
      audioBuffer,
      socket,
      context?.conversationId,
      options,
    );
    if (!sent) {
      return false;
    }

    if (!settings.shouldSendText && responseRequiresTextCompanion(responseText)) {
      return sendTextCompanionForLinks(jid, responseText, socket, options);
    }

    return true;
  } catch (error) {
    console.error("[TTS-RESPONSE] Erro no processamento:", error);
    return false;
  }
}
