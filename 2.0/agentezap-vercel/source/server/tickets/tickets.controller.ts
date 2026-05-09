import { Request, Response } from 'express';
import * as service from './tickets.service';
import type { TicketStatus, TicketPriority } from './types';

// Convert snake_case DB rows to camelCase for frontend
function toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelizeObj(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(camelizeObj);
  if (typeof obj !== 'object') return obj;
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toCamel(key)] = (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date))
      ? camelizeObj(value)
      : Array.isArray(value) ? value.map(camelizeObj) : value;
  }
  return result;
}

const asyncHandler = (fn: Function) => (req: Request, res: Response, next: Function) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function isAdminRequest(req: any): boolean {
  const role = req.user?.role || req.session?.user?.role || req.session?.adminRole;
  return role === "admin" || role === "owner";
}

// User Controllers
export const createTicket = asyncHandler(async (req: Request, res: Response) => {
  const { subject, description, priority } = req.body;
  const files = (req.files as Express.Multer.File[]) || [];
  if (!subject || subject.trim().length < 3) {
    return res.status(400).json({ message: 'Assunto deve ter pelo menos 3 caracteres.' });
  }
  const ticket = await service.createTicket({
    userId: req.user!.id,
    subject,
    description,
    priority: priority || 'medium',
    files,
  });
  res.status(201).json({ ticket: camelizeObj(ticket) });
});

export const listUserTickets = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const data = await service.listUserTickets(req.user!.id, page, limit);
  res.json({ ...data, items: camelizeObj(data.items) });
});

export const getUserTicketById = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await service.getUserTicketById(parseInt(req.params.id), req.user!.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket não encontrado.' });
  res.json({ ticket: camelizeObj(ticket) });
});

export const updateUserTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await service.updateUserTicket(parseInt(req.params.id), req.user!.id, req.body);
  res.json({ ticket: camelizeObj(ticket) });
});

export const deleteUserTicket = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteUserTicket(parseInt(req.params.id), req.user!.id);
  res.status(204).send();
});

export const listUserTicketMessages = asyncHandler(async (req: Request, res: Response) => {
  const messages = await service.listMessagesForUser(parseInt(req.params.id), req.user!.id);
  res.json({ items: camelizeObj(messages) });
});

export const sendUserMessage = asyncHandler(async (req: Request, res: Response) => {
  const body = String(req.body.body || '');
  const files = (req.files as Express.Multer.File[]) || [];
  if (!body.trim() && files.length === 0) {
    return res.status(400).json({ message: 'Mensagem vazia. Envie texto ou arquivo.' });
  }
  const message = await service.sendUserMessage({
    userId: req.user!.id,
    ticketId: parseInt(req.params.id),
    body,
    files
  });
  res.status(201).json({ message: camelizeObj(message) });
});

export const markUserRead = asyncHandler(async (req: Request, res: Response) => {
  await service.markReadByUser(parseInt(req.params.id), req.user!.id);
  res.status(204).send();
});

// Admin Controllers
export const listAdminTickets = asyncHandler(async (req: Request, res: Response) => {
  const filters = {
    status: req.query.status as TicketStatus | undefined,
    priority: req.query.priority as TicketPriority | undefined,
    assignedAdminId: req.query.assignedAdminId ? (req.query.assignedAdminId as string) : undefined,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 20
  };
  const data = await service.listAdminTickets(filters);
  res.json({ ...data, items: camelizeObj(data.items) });
});

export const getAdminTicketById = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await service.getAdminTicketById(parseInt(req.params.id));
  if (!ticket) return res.status(404).json({ message: 'Ticket não encontrado.' });
  res.json({ ticket: camelizeObj(ticket) });
});

export const updateAdminTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await service.updateAdminTicket(parseInt(req.params.id), req.user!.id, req.body);
  res.json({ ticket: camelizeObj(ticket) });
});

export const updateAdminTicketStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!status || !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    return res.status(400).json({ message: 'Status inválido.' });
  }
  const ticket = await service.updateTicketStatus(parseInt(req.params.id), status);
  res.json({ ticket: camelizeObj(ticket) });
});

export const listAdminTicketMessages = asyncHandler(async (req: Request, res: Response) => {
  const messages = await service.listMessagesForAdmin(parseInt(req.params.id));
  res.json({ items: camelizeObj(messages) });
});

export const sendAdminMessage = asyncHandler(async (req: Request, res: Response) => {
  const body = String(req.body.body || '');
  const files = (req.files as Express.Multer.File[]) || [];
  if (!body.trim() && files.length === 0) {
    return res.status(400).json({ message: 'Mensagem vazia. Envie texto ou arquivo.' });
  }
  const message = await service.sendAdminMessage({
    adminId: req.user!.id,
    ticketId: parseInt(req.params.id),
    body,
    files
  });
  res.status(201).json({ message: camelizeObj(message) });
});

export const markAdminRead = asyncHandler(async (req: Request, res: Response) => {
  await service.markReadByAdmin(parseInt(req.params.id));
  res.status(204).send();
});

export const routeTicket = asyncHandler(async (req: Request, res: Response) => {
  const { ticketId, subject, description, text } = req.body || {};
  const apply = Boolean(ticketId) && isAdminRequest(req);

  const result = await service.routeTicket({
    ticketId: ticketId ? Number(ticketId) : undefined,
    subject,
    description,
    text,
    apply,
  });

  res.json(camelizeObj(result));
});

export const getTicketReports = asyncHandler(async (_req: Request, res: Response) => {
  const data = await service.getTicketReports();
  res.json(camelizeObj(data));
});
