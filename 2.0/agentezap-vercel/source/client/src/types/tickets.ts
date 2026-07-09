export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type SenderType = 'user' | 'admin' | 'system';

export interface Ticket {
  id: number;
  userId: string;
  assignedAdminId: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userPhone?: string | null;
  sectorId?: string | null;
  sectorName?: string | null;
  subject: string;
  description?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  unreadCountUser: number;
  unreadCountAdmin: number;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketAttachment {
  id: number;
  ticketId: number;
  messageId: number;
  kind: 'image' | 'video' | 'audio' | 'file';
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string;
  width?: number | null;
  height?: number | null;
  createdAt: string;
}

export interface TicketMessage {
  id: number;
  ticketId: number;
  senderType: SenderType;
  senderUserId?: string | null;
  senderAdminId?: string | null;
  body: string;
  hasAttachments: boolean;
  attachments: TicketAttachment[];
  createdAt: string;
}

export interface CreateTicketRequest {
  subject: string;
  description?: string;
  priority?: TicketPriority;
}

export interface SendMessageRequest {
  body: string;
  attachments?: File[];
}

export interface TicketListResponse {
  items: Ticket[];
  total: number;
  page: number;
  limit: number;
}

export interface TicketMessageListResponse {
  items: TicketMessage[];
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedAdminId?: string;
}
