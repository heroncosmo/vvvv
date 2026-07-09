import { Request, Response } from "express";
import * as service from "./sectors.service";
import { pool } from "../db";

// Convert snake_case DB rows to camelCase for frontend
function toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelizeObj(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(camelizeObj);
  if (typeof obj !== "object") return obj;
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toCamel(key)] =
      value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
        ? camelizeObj(value)
        : Array.isArray(value)
          ? value.map(camelizeObj)
          : value;
  }
  return result;
}

const asyncHandler = (fn: Function) => (req: Request, res: Response, next: Function) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Sector CRUD
export const listSectors = asyncHandler(async (_req: Request, res: Response) => {
  const sectors = await service.listSectors();
  res.json({ items: camelizeObj(sectors) });
});

export const getSectorById = asyncHandler(async (req: Request, res: Response) => {
  const sector = await service.getSectorById(req.params.id);
  if (!sector) return res.status(404).json({ message: "Setor nao encontrado." });
  res.json({ sector: camelizeObj(sector) });
});

export const createSector = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, keywords, autoAssignAgentId } = req.body || {};
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ message: "Nome deve ter pelo menos 2 caracteres." });
  }

  const normalizedKeywords = Array.isArray(keywords)
    ? keywords
    : typeof keywords === "string"
      ? keywords.split(",").map(k => k.trim()).filter(Boolean)
      : [];

  const sector = await service.createSector({
    name,
    description,
    keywords: normalizedKeywords,
    autoAssignAgentId: autoAssignAgentId || null,
  });

  res.status(201).json({ sector: camelizeObj(sector) });
});

export const updateSector = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, keywords, autoAssignAgentId } = req.body || {};

  if (name !== undefined && String(name).trim().length < 2) {
    return res.status(400).json({ message: "Nome deve ter pelo menos 2 caracteres." });
  }

  const normalizedKeywords = Array.isArray(keywords)
    ? keywords
    : typeof keywords === "string"
      ? keywords.split(",").map(k => k.trim()).filter(Boolean)
      : undefined;

  const sector = await service.updateSector(req.params.id, {
    name,
    description,
    keywords: normalizedKeywords,
    autoAssignAgentId,
  });

  res.json({ sector: camelizeObj(sector) });
});

export const deleteSector = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteSector(req.params.id);
  res.status(204).send();
});

// Admin Agents
export const listAdminAgents = asyncHandler(async (_req: Request, res: Response) => {
  const agents = await service.listAdminAgents();
  res.json({ items: camelizeObj(agents) });
});

// Sector Members
export const listSectorMembers = asyncHandler(async (req: Request, res: Response) => {
  const members = await service.listSectorMembers(req.params.id);
  res.json({ items: camelizeObj(members) });
});

export const addSectorMember = asyncHandler(async (req: Request, res: Response) => {
  const { memberId, isPrimary, canReceiveTickets, maxOpenTickets } = req.body || {};
  
  if (!memberId) {
    return res.status(400).json({ message: "ID do membro é obrigatório." });
  }

  const member = await service.addSectorMember(req.params.id, {
    memberId,
    isPrimary: isPrimary ?? false,
    canReceiveTickets: canReceiveTickets ?? true,
    maxOpenTickets: maxOpenTickets ?? 10,
    assignedBy: req.user?.id || req.session?.user?.id,
  });

  res.status(201).json({ member: camelizeObj(member) });
});

export const removeSectorMember = asyncHandler(async (req: Request, res: Response) => {
  await service.removeSectorMember(req.params.id, req.params.memberId);
  res.status(204).send();
});

export const updateSectorMember = asyncHandler(async (req: Request, res: Response) => {
  const { isPrimary, canReceiveTickets, maxOpenTickets } = req.body || {};
  
  const member = await service.updateSectorMember(req.params.id, req.params.memberId, {
    isPrimary,
    canReceiveTickets,
    maxOpenTickets,
  });

  res.json({ member: camelizeObj(member) });
});

// Routing
export const routeConversation = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId, messageText } = req.body || {};
  
  if (!conversationId || !messageText) {
    return res.status(400).json({ message: "conversationId e messageText são obrigatórios." });
  }

  const result = await service.routeConversation(conversationId, messageText);
  res.json(camelizeObj(result));
});

// Reports
export const getAttendanceReport = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  
  const report = await service.getAttendanceReport(
    startDate as string || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate as string || new Date().toISOString().split('T')[0]
  );
  
  res.json(camelizeObj(report));
});

// Ticket closure
export const closeTicket = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body || {};
  const userId = req.user?.id || req.session?.user?.id;
  const userName = req.user?.name || req.session?.user?.name || 'Sistema';
  
  const result = await service.closeTicket(req.params.conversationId, {
    closedBy: userId,
    closedByName: userName,
    reason,
  });
  
  res.json(camelizeObj(result));
});

export const reopenTicket = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id || req.session?.user?.id;
  const userName = req.user?.name || req.session?.user?.name || 'Sistema';
  
  const result = await service.reopenTicket(req.params.conversationId, {
    reopenedBy: userId,
    reopenedByName: userName,
  });
  
  res.json(camelizeObj(result));
});

// Bulk actions
export const bulkToggleAI = asyncHandler(async (req: Request, res: Response) => {
  const { conversationIds, disable } = req.body || {};
  
  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    return res.status(400).json({ message: "Lista de conversas é obrigatória." });
  }

  const userId = req.user?.id || req.session?.user?.id;
  const userName = req.user?.name || req.session?.user?.name || 'Sistema';
  
  const result = await service.bulkToggleAI(conversationIds, disable, {
    performedBy: userId,
    performedByName: userName,
  });
  
  res.json(camelizeObj(result));
});

// Scheduled messages
export const createScheduledMessage = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId, messageText, messageType, aiPrompt, scheduledAt, timezone } = req.body || {};
  
  if (!conversationId || !messageText || !scheduledAt) {
    return res.status(400).json({ message: "conversationId, messageText e scheduledAt são obrigatórios." });
  }

  const userId = req.user?.id || req.session?.user?.id;
  const userName = req.user?.name || req.session?.user?.name || 'Sistema';
  
  const message = await service.createScheduledMessage({
    conversationId,
    messageText,
    messageType: messageType || 'text',
    aiPrompt,
    scheduledAt,
    timezone: timezone || 'America/Sao_Paulo',
    createdBy: userId,
    createdByName: userName,
  });
  
  res.status(201).json({ message: camelizeObj(message) });
});

export const listScheduledMessages = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId, status } = req.query;
  
  const messages = await service.listScheduledMessages({
    conversationId: conversationId as string,
    status: status as string,
  });
  
  res.json({ items: camelizeObj(messages) });
});

export const cancelScheduledMessage = asyncHandler(async (req: Request, res: Response) => {
  await service.cancelScheduledMessage(req.params.id);
  res.status(204).send();
});

// AI message generation
export const generateAIMessage = asyncHandler(async (req: Request, res: Response) => {
  const { prompt, conversationId } = req.body || {};
  
  if (!prompt) {
    return res.status(400).json({ message: "Prompt é obrigatório." });
  }

  const result = await service.generateAIMessage(prompt, conversationId);
  res.json(camelizeObj(result));
});
