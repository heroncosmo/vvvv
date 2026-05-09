/**
 * ?? Servi?o para envio de mensagens WhatsApp do sistema
 * Usado para notifica??es automatizadas (delivery, agendamentos, etc.)
 * 
 * ?? IMPORTANTE: Agora usa o sistema centralizado anti-ban!
 */

import type { Conversation } from '@shared/schema';
import { storage } from './storage';
import { centralizedMessageSender, MessageOrigin } from './centralizedMessageSender';
import { buildWhatsAppJidFromPhone, normalizeBrazilWhatsAppPhone } from './whatsappPhoneNumber';
import {
  sendMetaCloudButtonsMessage,
  sendMetaCloudListMessage,
  sendMetaCloudMediaMessage,
  sendMetaCloudTextMessage,
} from './metaCloudApi';
import { isOfficialCoexistenceConnection } from './whatsappCoexistence';
import {
  sendGatewayInstanceButtons,
  sendGatewayInstanceList,
  sendGatewayInstanceMedia,
  sendGatewayInstanceText,
} from './whatsappGatewayClient';
import { resolveAppVisibleConnectionOwner } from './whatsappGatewayAppOwnership';
import {
  buildGatewayTextSendBody,
  normalizeOutboundTextForCustomer,
} from './outboundTextPolicy';

// Map de sessoes ativas por connectionId
const activeSessions = new Map<string, any>();
const activeSessionConnectionsByUserId = new Map<string, Set<string>>();

type GatewaySendSource = 'owner' | 'agent' | 'followup' | 'system';

function mapOriginToGatewaySource(origin: MessageOrigin): GatewaySendSource {
  if (origin === 'manual_admin') {
    return 'owner';
  }

  if (origin === 'follow_up' || origin === 'user_follow_up') {
    return 'followup';
  }

  if (origin === 'ai_agent' || origin === 'chatbot_flow' || origin === 'conversation') {
    return 'agent';
  }

  return 'system';
}

function getFileNameFromUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    const fileName = url.pathname.split('/').pop();
    return fileName || undefined;
  } catch {
    const fileName = value.split('?')[0].split('/').pop();
    return fileName || undefined;
  }
}

function inferMediaTypeFromUrlAndMime(mediaUrl: string, mimeType?: string): 'image' | 'audio' | 'video' | 'document' {
  const lowerMimeType = String(mimeType || '').toLowerCase();
  if (lowerMimeType.startsWith('image/')) return 'image';
  if (lowerMimeType.startsWith('video/')) return 'video';
  if (lowerMimeType.startsWith('audio/')) return 'audio';

  if (mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return 'image';
  if (mediaUrl.match(/\.(mp4|mov|avi|webm)$/i)) return 'video';
  if (mediaUrl.match(/\.(mp3|ogg|wav|m4a|opus)$/i)) return 'audio';
  return 'document';
}

function normalizeRemoteMediaMimeType(mediaUrl: string, mimeType?: string): string | undefined {
  const trimmedMimeType = String(mimeType || '').trim();
  if (trimmedMimeType) {
    if (trimmedMimeType.toLowerCase().startsWith('audio/') && mediaUrl.match(/\.(ogg|opus)$/i)) {
      return 'audio/ogg; codecs=opus';
    }
    return trimmedMimeType;
  }

  if (mediaUrl.match(/\.(jpg|jpeg)$/i)) return 'image/jpeg';
  if (mediaUrl.match(/\.(png)$/i)) return 'image/png';
  if (mediaUrl.match(/\.(gif)$/i)) return 'image/gif';
  if (mediaUrl.match(/\.(webp)$/i)) return 'image/webp';
  if (mediaUrl.match(/\.(mp4)$/i)) return 'video/mp4';
  if (mediaUrl.match(/\.(webm)$/i)) return 'video/webm';
  if (mediaUrl.match(/\.(mp3)$/i)) return 'audio/mpeg';
  if (mediaUrl.match(/\.(m4a|mp4)$/i)) return 'audio/mp4';
  if (mediaUrl.match(/\.(wav)$/i)) return 'audio/wav';
  if (mediaUrl.match(/\.(ogg|opus)$/i)) return 'audio/ogg; codecs=opus';
  if (mediaUrl.match(/\.(pdf)$/i)) return 'application/pdf';
  return undefined;
}

/**
 * Registra uma sessao WhatsApp ativa para uma conexao especifica do usuario
 */
export function registerWhatsAppSession(userId: string, connectionId: string, socket: any) {
  activeSessions.set(connectionId, socket);

  if (!activeSessionConnectionsByUserId.has(userId)) {
    activeSessionConnectionsByUserId.set(userId, new Set());
  }
  activeSessionConnectionsByUserId.get(userId)!.add(connectionId);

  console.log(`?? [WhatsApp Sender] Sessao registrada para connectionId: ${connectionId}`);
}

/**
 * Remove uma sessao WhatsApp. Sem connectionId, limpa todas as conexoes do usuario.
 */
export function unregisterWhatsAppSession(userId: string, connectionId?: string) {
  if (connectionId) {
    activeSessions.delete(connectionId);
    const connectionIds = activeSessionConnectionsByUserId.get(userId);
    connectionIds?.delete(connectionId);
    if (!connectionIds || connectionIds.size === 0) {
      activeSessionConnectionsByUserId.delete(userId);
    }
    console.log(`?? [WhatsApp Sender] Sessao removida para connectionId: ${connectionId}`);
    return;
  }

  const connectionIds = activeSessionConnectionsByUserId.get(userId);
  if (connectionIds) {
    for (const activeConnectionId of connectionIds) {
      activeSessions.delete(activeConnectionId);
    }
    activeSessionConnectionsByUserId.delete(userId);
  }

  console.log(`?? [WhatsApp Sender] Todas as sessoes removidas para userId: ${userId}`);
}

/**
 * Verifica se um usuario tem sessao WhatsApp ativa
 */
export function hasActiveWhatsAppSession(userId: string, connectionId?: string): boolean {
  if (connectionId) {
    return activeSessions.has(connectionId);
  }

  const connectionIds = activeSessionConnectionsByUserId.get(userId);
  if (!connectionIds || connectionIds.size === 0) {
    return false;
  }

  for (const activeConnectionId of connectionIds) {
    if (activeSessions.has(activeConnectionId)) {
      return true;
    }
  }

  return false;
}

async function resolveSocketSendContext(
  userId: string,
  options?: { conversationId?: string },
): Promise<{ socket: any; connectionId: string } | null> {
  if (options?.conversationId) {
    const conversation = await storage.getConversation(options.conversationId);
    if (!conversation) {
      return null;
    }

    const connection = await storage.getConnectionById(conversation.connectionId);
    if (!connection || connection.userId !== userId) {
      return null;
    }

    const socket = activeSessions.get(connection.id);
    if (!socket) {
      return null;
    }

    return { socket, connectionId: connection.id };
  }

  const connection = await storage.getConnectionByUserId(userId);
  if (!connection) {
    return null;
  }

  const socket = activeSessions.get(connection.id);
  if (!socket) {
    return null;
  }

  return { socket, connectionId: connection.id };
}

async function resolveTargetConnection(
  userId: string,
  options?: { conversationId?: string },
) {
  if (options?.conversationId) {
    const conversation = await storage.getConversation(options.conversationId);
    if (!conversation) {
      return null;
    }

    const connection = await storage.getConnectionById(conversation.connectionId);
    if (!connection || connection.userId !== userId) {
      return null;
    }

    return connection;
  }

  const connection = await storage.getConnectionByUserId(userId);
  if (!connection || connection.userId !== userId) {
    return null;
  }

  return connection;
}

async function resolveOfficialSendContext(
  userId: string,
  phoneNumber: string,
  options?: { conversationId?: string },
): Promise<{ connection: any; conversation: Conversation } | null> {
  const cleanNumber = normalizeBrazilWhatsAppPhone(phoneNumber);
  if (!cleanNumber) {
    return null;
  }

  const conversation = options?.conversationId
    ? await storage.getConversation(options.conversationId)
    : undefined;

  if (conversation) {
    const connection = await storage.getConnectionById(conversation.connectionId);
    if (!connection || connection.userId !== userId || !isOfficialCoexistenceConnection(connection)) {
      return null;
    }
    return { connection, conversation };
  }

  const connection = await storage.getConnectionByUserId(userId);
  if (!connection || !isOfficialCoexistenceConnection(connection)) {
    return null;
  }

  return {
    connection,
    conversation: {
      id: options?.conversationId || `official-${cleanNumber}`,
      connectionId: connection.id,
      contactNumber: cleanNumber,
      remoteJid: buildWhatsAppJidFromPhone(cleanNumber) || `${cleanNumber}@s.whatsapp.net`,
      contactName: cleanNumber,
      unreadCount: 0,
      lastMessageText: null,
      lastMessageTime: null,
      lastMessageFromMe: null,
      isClosed: false,
      hasReplied: false,
      isGroup: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Conversation,
  };
}

/**
 * Envia uma mensagem WhatsApp para um n?mero espec?fico em nome de um usu?rio
 * ?? USA SISTEMA ANTI-BAN CENTRALIZADO
 * @param userId ID do usu?rio dono da sess?o
 * @param phoneNumber N?mero de telefone (apenas n?meros, com c?digo do pa?s)
 * @param message Texto da mensagem
 * @param origin Origem da mensagem (para logs e estat?sticas)
 */
export async function sendWhatsAppMessageFromUser(
  userId: string, 
  phoneNumber: string, 
  message: string,
  origin: MessageOrigin = 'whatsapp_sender',
  options?: { conversationId?: string }
): Promise<boolean> {
  try {
    const officialContext = await resolveOfficialSendContext(userId, phoneNumber, options);
    if (officialContext) {
      const result = await sendMetaCloudTextMessage(
        officialContext.connection,
        officialContext.conversation,
        message,
      );
      console.log(`? [WhatsApp Sender] Mensagem enviada via Cloud API oficial (${result.messageId || 'sem-id'})`);
      return true;
    }

    const targetConnection = await resolveTargetConnection(userId, options);
    if (targetConnection && await resolveAppVisibleConnectionOwner(targetConnection) === 'gateway') {
      const cleanNumber = normalizeBrazilWhatsAppPhone(phoneNumber);
      if (!cleanNumber) {
        throw new Error('Numero de telefone invalido');
      }

      const result: any = await sendGatewayInstanceText(targetConnection.id, buildGatewayTextSendBody({
        conversationId: options?.conversationId,
        to: cleanNumber,
        contactName: cleanNumber,
        text: message,
        isFromAgent: true,
        source: mapOriginToGatewaySource(origin),
      }));

      console.log(`? [WhatsApp Sender] Mensagem enviada via gateway (${result?.messageId || 'sem-id'})`);
      return Boolean((result as any)?.success ?? true);
    }

    const socketContext = await resolveSocketSendContext(userId, options);

    if (!socketContext?.socket) {
      console.log(`?? [WhatsApp Sender] Nenhuma sessao ativa para envio (userId=${userId}, conversationId=${options?.conversationId || 'sem_conversa'})`);
      return false;
    }
    const socket = socketContext.socket;
    
    const cleanNumber = normalizeBrazilWhatsAppPhone(phoneNumber);
    const jid = buildWhatsAppJidFromPhone(phoneNumber);
    if (!cleanNumber || !jid) {
      throw new Error('Numero de telefone invalido');
    }
    
    const result = await centralizedMessageSender.sendText(
      userId,
      jid,
      normalizeOutboundTextForCustomer(message),
      socket,
      origin,
      options
    );
    
    if (result.success) {
      console.log(`? [WhatsApp Sender] Mensagem enviada para ${cleanNumber} via sistema anti-ban (aguardou ${Math.ceil((result.waitedMs || 0)/1000)}s)`);
    } else {
      console.error(`? [WhatsApp Sender] Falha no envio: ${result.error}`);
    }
    
    return result.success;
  } catch (error) {
    console.error(`? [WhatsApp Sender] Erro ao enviar mensagem:`, error);
    return false;
  }
}

/**
 * Envia uma mensagem WhatsApp com m?dia
 * ?? USA SISTEMA ANTI-BAN CENTRALIZADO
 */
export async function sendWhatsAppMediaFromUser(
  userId: string, 
  phoneNumber: string, 
  mediaUrl: string,
  caption?: string,
  mimeType?: string,
  origin: MessageOrigin = 'whatsapp_sender',
  options?: { conversationId?: string }
): Promise<boolean> {
  try {
    const officialContext = await resolveOfficialSendContext(userId, phoneNumber, options);
    if (officialContext) {
      const lowerMimeType = String(mimeType || '').toLowerCase();
      const officialType =
        lowerMimeType.startsWith('image/') || mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)
          ? 'image'
          : lowerMimeType.startsWith('video/') || mediaUrl.match(/\.(mp4|mov|avi|webm)$/i)
            ? 'video'
            : lowerMimeType.startsWith('audio/') || mediaUrl.match(/\.(mp3|ogg|wav|m4a|opus)$/i)
              ? 'audio'
              : 'document';

      const result = await sendMetaCloudMediaMessage(officialContext.connection, officialContext.conversation, {
        type: officialType,
        data: mediaUrl,
        mimetype: mimeType,
        filename: mediaUrl.split('/').pop() || 'arquivo',
        caption,
      });
      console.log(`? [WhatsApp Sender] M?dia enviada via Cloud API oficial (${result.messageId || 'sem-id'})`);
      return true;
    }

    const targetConnection = await resolveTargetConnection(userId, options);
    if (targetConnection && await resolveAppVisibleConnectionOwner(targetConnection) === 'gateway') {
      const cleanNumber = normalizeBrazilWhatsAppPhone(phoneNumber);
      if (!cleanNumber) {
        throw new Error('Numero de telefone invalido');
      }

      const normalizedMimeType = normalizeRemoteMediaMimeType(mediaUrl, mimeType);
      const mediaType = inferMediaTypeFromUrlAndMime(mediaUrl, normalizedMimeType);
      const result: any = await sendGatewayInstanceMedia(targetConnection.id, {
        conversationId: options?.conversationId,
        to: cleanNumber,
        contactName: cleanNumber,
        type: mediaType,
        data: mediaUrl,
        mimetype: normalizedMimeType,
        filename: mediaType === 'document' ? getFileNameFromUrl(mediaUrl) : undefined,
        caption,
        ptt: mediaType === 'audio' ? false : undefined,
      });

      console.log(`? [WhatsApp Sender] Midia enviada via gateway (${result?.messageId || 'sem-id'})`);
      return Boolean((result as any)?.success ?? true);
    }

    const socketContext = await resolveSocketSendContext(userId, options);

    if (!socketContext?.socket) {
      console.log(`?? [WhatsApp Sender] Nenhuma sessao ativa para envio de midia (userId=${userId}, conversationId=${options?.conversationId || 'sem_conversa'})`);
      return false;
    }
    const socket = socketContext.socket;
    
    const cleanNumber = normalizeBrazilWhatsAppPhone(phoneNumber);
    const jid = buildWhatsAppJidFromPhone(phoneNumber);
    if (!cleanNumber || !jid) {
      throw new Error('Numero de telefone invalido');
    }
    
    const isImage = mimeType?.startsWith('image/') || mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const isVideo = mimeType?.startsWith('video/') || mediaUrl.match(/\.(mp4|mov|avi|webm)$/i);
    const isAudio = mimeType?.startsWith('audio/') || mediaUrl.match(/\.(mp3|ogg|wav|m4a)$/i);
    
    let result;
    if (isImage) {
      result = await centralizedMessageSender.sendImage(userId, jid, mediaUrl, caption, socket, origin, options);
    } else if (isVideo) {
      result = await centralizedMessageSender.sendVideo(userId, jid, mediaUrl, caption, socket, origin, options);
    } else if (isAudio) {
      result = await centralizedMessageSender.sendAudio(userId, jid, mediaUrl, false, socket, origin, { ...options, mimetype: mimeType });
    } else {
      result = await centralizedMessageSender.sendDocument(userId, jid, mediaUrl, mediaUrl.split('/').pop() || 'arquivo', mimeType || 'application/octet-stream', socket, origin, options);
    }
    
    if (result.success) {
      console.log(`? [WhatsApp Sender] M?dia enviada para ${cleanNumber} via sistema anti-ban (aguardou ${Math.ceil((result.waitedMs || 0)/1000)}s)`);
    } else {
      console.error(`? [WhatsApp Sender] Falha no envio de m?dia: ${result.error}`);
    }
    
    return result.success;
  } catch (error) {
    console.error(`? [WhatsApp Sender] Erro ao enviar m?dia:`, error);
    return false;
  }
}

/**
 * Envia uma mensagem WhatsApp com bot?es interativos
 * ?? USA SISTEMA ANTI-BAN CENTRALIZADO
 */
export async function sendWhatsAppButtonsFromUser(
  userId: string,
  phoneNumber: string,
  payload: {
    body: string;
    buttons: Array<{
      type: 'reply';
      reply: { id: string; title: string };
    }>;
    header?: { type: 'text'; text: string };
    footer?: { text: string };
  },
  origin: MessageOrigin = 'chatbot_flow',
  options?: { conversationId?: string }
): Promise<boolean> {
  try {
    const officialContext = await resolveOfficialSendContext(userId, phoneNumber, options);
    if (officialContext) {
      const result = await sendMetaCloudButtonsMessage(officialContext.connection, officialContext.conversation, payload);
      console.log(`? [WhatsApp Sender] Bot?es enviados via Cloud API oficial (${result.messageId || 'sem-id'})`);
      return true;
    }

    const targetConnection = await resolveTargetConnection(userId, options);
    if (targetConnection && await resolveAppVisibleConnectionOwner(targetConnection) === 'gateway') {
      const cleanNumber = normalizeBrazilWhatsAppPhone(phoneNumber);
      if (!cleanNumber) {
        throw new Error('Numero de telefone invalido');
      }

      const result: any = await sendGatewayInstanceButtons(targetConnection.id, {
        conversationId: options?.conversationId,
        to: cleanNumber,
        contactName: cleanNumber,
        ...payload,
      });

      console.log(`? [WhatsApp Sender] Botoes enviados via gateway (${result?.messageId || 'sem-id'})`);
      return Boolean((result as any)?.success ?? true);
    }

    const socketContext = await resolveSocketSendContext(userId, options);
    if (!socketContext?.socket) {
      console.log(`?? [WhatsApp Sender] Nenhuma sessao ativa para envio de botoes (userId=${userId}, conversationId=${options?.conversationId || 'sem_conversa'})`);
      return false;
    }
    const socket = socketContext.socket;
    
    const cleanNumber = normalizeBrazilWhatsAppPhone(phoneNumber);
    const jid = buildWhatsAppJidFromPhone(phoneNumber);
    if (!cleanNumber || !jid) {
      throw new Error('Numero de telefone invalido');
    }
    
    const result = await centralizedMessageSender.sendButtons(userId, jid, payload, socket, origin, options);
    if (result.success) {
      console.log(`? [WhatsApp Sender] Bot?es enviados para ${cleanNumber} via sistema anti-ban`);
    } else {
      console.error(`? [WhatsApp Sender] Falha no envio de bot?es: ${result.error}`);
    }
    
    return result.success;
  } catch (error) {
    console.error(`? [WhatsApp Sender] Erro ao enviar bot?es:`, error);
    return false;
  }
}

/**
 * Envia uma mensagem WhatsApp com lista interativa
 * ?? USA SISTEMA ANTI-BAN CENTRALIZADO
 */
export async function sendWhatsAppListFromUser(
  userId: string,
  phoneNumber: string,
  payload: {
    body: string;
    buttonText: string;
    sections: Array<{
      title: string;
      rows: Array<{
        id: string;
        title: string;
        description?: string;
      }>;
    }>;
    header?: { type: 'text'; text: string };
    footer?: { text: string };
  },
  origin: MessageOrigin = 'chatbot_flow',
  options?: { conversationId?: string }
): Promise<boolean> {
  try {
    const officialContext = await resolveOfficialSendContext(userId, phoneNumber, options);
    if (officialContext) {
      const result = await sendMetaCloudListMessage(officialContext.connection, officialContext.conversation, payload);
      console.log(`? [WhatsApp Sender] Lista enviada via Cloud API oficial (${result.messageId || 'sem-id'})`);
      return true;
    }

    const targetConnection = await resolveTargetConnection(userId, options);
    if (targetConnection && await resolveAppVisibleConnectionOwner(targetConnection) === 'gateway') {
      const cleanNumber = normalizeBrazilWhatsAppPhone(phoneNumber);
      if (!cleanNumber) {
        throw new Error('Numero de telefone invalido');
      }

      const result: any = await sendGatewayInstanceList(targetConnection.id, {
        conversationId: options?.conversationId,
        to: cleanNumber,
        contactName: cleanNumber,
        ...payload,
      });

      console.log(`? [WhatsApp Sender] Lista enviada via gateway (${result?.messageId || 'sem-id'})`);
      return Boolean((result as any)?.success ?? true);
    }

    const socketContext = await resolveSocketSendContext(userId, options);
    if (!socketContext?.socket) {
      console.log(`?? [WhatsApp Sender] Nenhuma sessao ativa para envio de lista (userId=${userId}, conversationId=${options?.conversationId || 'sem_conversa'})`);
      return false;
    }
    const socket = socketContext.socket;
    
    const cleanNumber = normalizeBrazilWhatsAppPhone(phoneNumber);
    const jid = buildWhatsAppJidFromPhone(phoneNumber);
    if (!cleanNumber || !jid) {
      throw new Error('Numero de telefone invalido');
    }
    
    const result = await centralizedMessageSender.sendList(userId, jid, payload, socket, origin, options);
    if (result.success) {
      console.log(`? [WhatsApp Sender] Lista enviada para ${cleanNumber} via sistema anti-ban`);
    } else {
      console.error(`? [WhatsApp Sender] Falha no envio de lista: ${result.error}`);
    }
    
    return result.success;
  } catch (error) {
    console.error(`? [WhatsApp Sender] Erro ao enviar lista:`, error);
    return false;
  }
}
