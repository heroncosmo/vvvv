import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Paperclip, Send, Clock, Check, CheckCheck, X, User, Headphones, Loader2, MoreVertical, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { apiClient } from '../../lib/api';
import type { Ticket, TicketMessage, TicketAttachment, TicketStatus } from '../../types/tickets';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const getAttachmentUrl = (attachment: TicketAttachment): string => {
  if (attachment.publicUrl) return attachment.publicUrl;
  const { data } = supabase.storage.from('ticket-attachments').getPublicUrl(attachment.originalName);
  return data?.publicUrl || '';
};

const AttachmentPreview: React.FC<{ 
  attachment: TicketAttachment;
  isPreview?: boolean;
  onRemove?: () => void;
}> = ({ attachment, isPreview, onRemove }) => {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = isPreview ? attachment.publicUrl : getAttachmentUrl(attachment);
  const isImage = attachment.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(attachment.originalName || '');

  if (error || !url || !isImage) {
    return (
      <div className="relative flex items-center gap-2 p-2.5 bg-muted/80 rounded-xl border text-sm max-w-[200px] shadow-sm">
        <Paperclip className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="truncate text-xs font-medium">{attachment.originalName || 'Arquivo'}</span>
        {onRemove && (
          <button 
            onClick={onRemove}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center text-xs hover:bg-destructive/90 shadow-md transition-all hover:scale-110"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative group">
      <div className={cn(
        "w-16 h-16 rounded-2xl overflow-hidden border-2 border-border/30 bg-muted cursor-pointer shadow-sm transition-all duration-200 group-hover:shadow-md",
        !loaded && "animate-pulse"
      )}>
        <img 
          src={url} 
          alt={attachment.originalName} 
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          onClick={() => window.open(url, '_blank')}
        />
      </div>
      {onRemove && (
        <button 
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-md hover:bg-destructive/90 hover:scale-110"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

const STATUS_CONFIG: Record<TicketStatus, { color: string; bg: string; border: string; label: string; icon: React.ElementType }> = {
  open: { 
    color: 'text-emerald-600', 
    bg: 'bg-emerald-500/10', 
    border: 'border-emerald-500/20',
    label: 'Aberto', 
    icon: Clock 
  },
  in_progress: { 
    color: 'text-amber-600', 
    bg: 'bg-amber-500/10', 
    border: 'border-amber-500/20',
    label: 'Em andamento', 
    icon: Clock 
  },
  resolved: { 
    color: 'text-violet-600', 
    bg: 'bg-violet-500/10', 
    border: 'border-violet-500/20',
    label: 'Resolvido', 
    icon: CheckCircle2 
  },
  closed: { 
    color: 'text-slate-600', 
    bg: 'bg-slate-500/10', 
    border: 'border-slate-500/20',
    label: 'Fechado', 
    icon: CheckCheck 
  },
};

interface Props { 
  ticketId: number;
  onStatusChange?: (status: TicketStatus) => void;
  onBack?: () => void;
}

export const AdminTicketChat: React.FC<Props> = ({ ticketId, onStatusChange, onBack }) => {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<{ url: string; name: string; file: File }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, []);

  const fetchTicket = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/admin/tickets/${ticketId}`);
      const t = data.ticket || data;
      setTicket(t);
    } catch (err) {
      console.error('Erro ao buscar ticket:', err);
    }
  }, [ticketId]);

  const fetchMessages = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/admin/tickets/${ticketId}/messages`);
      setMessages(data.items || data);
    } catch (err) {
      console.error('Erro ao buscar mensagens:', err);
    }
  }, [ticketId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await Promise.all([fetchTicket(), fetchMessages()]);
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [fetchTicket, fetchMessages]);

  useEffect(() => {
    if (!ticketId) return;

    const channel = supabase
      .channel(`admin-ticket:${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${ticketId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const raw = payload.new as any;
            const hasAttach = raw.has_attachments ?? raw.hasAttachments ?? false;
            if (hasAttach) {
              fetchMessages();
            } else {
              const newMessage: TicketMessage = {
                id: raw.id,
                ticketId: raw.ticket_id ?? raw.ticketId,
                senderType: raw.sender_type ?? raw.senderType,
                senderUserId: raw.sender_user_id ?? raw.senderUserId,
                senderAdminId: raw.sender_admin_id ?? raw.senderAdminId,
                body: raw.body ?? '',
                hasAttachments: false,
                attachments: [],
                createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
              };
              setMessages(prev => prev.some(m => m.id === newMessage.id) ? prev : [...prev, newMessage]);
            }
          } else if (payload.eventType === 'UPDATE') {
            fetchMessages();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, fetchMessages]);

  useEffect(() => { 
    scrollToBottom(); 
  }, [messages, scrollToBottom]);

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!ticket || ticket.status === newStatus) return;
    
    setUpdatingStatus(true);
    try {
      await apiClient.patch(`/admin/tickets/${ticketId}/status`, { status: newStatus });
      setTicket(prev => prev ? { ...prev, status: newStatus } : prev);
      onStatusChange?.(newStatus);
    } catch (err) {
      console.error('Erro ao alterar status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
      .filter(f => f.type.startsWith('image/'))
      .slice(0, 4 - attachments.length);
    if (!files.length) return;
    
    setAttachments(prev => [...prev, ...files].slice(0, 4));
    setAttachmentPreviews(prev => [
      ...prev, 
      ...files.map(f => ({ 
        url: URL.createObjectURL(f), 
        name: f.name,
        file: f
      }))
    ].slice(0, 4));
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (i: number) => { 
    URL.revokeObjectURL(attachmentPreviews[i].url); 
    setAttachments(prev => prev.filter((_, j) => j !== i)); 
    setAttachmentPreviews(prev => prev.filter((_, j) => j !== i)); 
  };

  const handleSend = async () => {
    if (!messageBody.trim() && attachments.length === 0) return;
    if (sending) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('body', messageBody.trim());
      attachments.forEach(file => formData.append('attachments', file));

      await apiClient.post(`/admin/tickets/${ticketId}/messages`, formData);
      
      setMessageBody('');
      setAttachments([]);
      attachmentPreviews.forEach(p => URL.revokeObjectURL(p.url));
      setAttachmentPreviews([]);
      await fetchMessages();
    } catch (err: any) {
      console.error('Erro ao enviar:', err);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Hoje';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ontem';
    }
    return date.toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-background">
        <div className="relative">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <div className="absolute inset-0 blur-xl bg-primary/20 rounded-full" />
        </div>
        <span className="text-muted-foreground text-sm font-medium">Carregando ticket...</span>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-5 bg-background p-6">
        <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center shadow-lg">
          <Headphones className="w-10 h-10 text-muted-foreground" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Ticket não encontrado</h2>
          <p className="text-muted-foreground text-sm">Este ticket não existe ou foi removido.</p>
        </div>
        {onBack && (
          <Button variant="outline" onClick={onBack} className="mt-2 rounded-xl">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        )}
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[ticket.status];
  const StatusIcon = statusConfig.icon;
  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved';

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden rounded-2xl shadow-xl border">
      {/* Header Compacto e Moderno */}
      <header className="flex-shrink-0 border-b bg-card/95 backdrop-blur-xl sticky top-0 z-20 shadow-sm">
        <div className="px-4 py-2.5 flex items-center gap-3">
          {onBack && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="flex-shrink-0 hover:bg-muted rounded-xl h-9 w-9"
              onClick={onBack}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-sm font-semibold truncate text-foreground">
                #{ticket.id} · {ticket.subject}
              </h1>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all duration-200 hover:opacity-80",
                    statusConfig.bg,
                    statusConfig.color,
                    statusConfig.border
                  )}>
                    <StatusIcon className="w-3 h-3" />
                    {statusConfig.label}
                    {updatingStatus && <Loader2 className="w-2.5 h-2.5 animate-spin ml-0.5" />}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44 rounded-xl">
                  {(Object.keys(STATUS_CONFIG) as TicketStatus[]).map((status) => {
                    const config = STATUS_CONFIG[status];
                    const Icon = config.icon;
                    return (
                      <DropdownMenuItem 
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className="flex items-center gap-2 cursor-pointer rounded-lg"
                        disabled={updatingStatus || ticket.status === status}
                      >
                        <Icon className={cn("w-4 h-4", config.color)} />
                        <span className="text-sm">{config.label}</span>
                        {ticket.status === status && <Check className="w-3 h-3 ml-auto" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
              <span>Cliente #{ticket.userId}</span>
              <span className="text-muted-foreground/30">·</span>
              <span>{new Date(ticket.createdAt).toLocaleDateString('pt-BR', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
              })}</span>
            </div>
          </div>

          {/* Menu de Ações */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-xl hover:bg-muted h-9 w-9">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem 
                onClick={() => handleStatusChange('resolved')}
                disabled={ticket.status === 'resolved' || updatingStatus}
                className="cursor-pointer rounded-lg"
              >
                <CheckCircle2 className="w-4 h-4 mr-2 text-violet-500" />
                Marcar como resolvido
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleStatusChange('closed')}
                disabled={ticket.status === 'closed' || updatingStatus}
                className="cursor-pointer rounded-lg"
              >
                <CheckCheck className="w-4 h-4 mr-2 text-slate-500" />
                Fechar ticket
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Messages Area - Altura fixa com scroll */}
      <main 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 bg-gradient-to-b from-muted/30 to-background scroll-smooth"
      >
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4 shadow-md">
                <Headphones className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Nenhuma mensagem ainda</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                Inicie a conversa respondendo ao chamado do cliente
              </p>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isAdmin = msg.senderType === 'admin';
            const showDate = idx === 0 || 
              new Date(msg.createdAt).toDateString() !== new Date(messages[idx - 1].createdAt).toDateString();

            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="flex items-center gap-3 my-6">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
                    <span className="text-[11px] text-muted-foreground font-medium px-3 py-1 bg-muted/60 rounded-full shadow-sm">
                      {formatDate(msg.createdAt)}
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
                  </div>
                )}

                <div className={cn(
                  "flex gap-2.5",
                  isAdmin ? "justify-end" : "justify-start"
                )}>
                  {/* Avatar Usuário */}
                  {!isAdmin && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-muted to-muted/70 flex items-center justify-center flex-shrink-0 ring-2 ring-background shadow-sm">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  )}
                  
                  <div className={cn(
                    "max-w-[78%] space-y-1",
                    isAdmin ? "items-end" : "items-start"
                  )}>
                    {/* Remetente */}
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {isAdmin ? (
                        <>
                          <span className="font-semibold text-primary">Você</span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-muted-foreground/70">{formatTime(msg.createdAt)}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-foreground">Cliente #{ticket.userId}</span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-muted-foreground/70">{formatTime(msg.createdAt)}</span>
                        </>
                      )}
                    </div>
                    
                    {/* Message Bubble - Estilo Moderno */}
                    <div className={cn(
                      "px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm transition-shadow hover:shadow-md",
                      isAdmin 
                        ? "bg-primary text-primary-foreground rounded-tr-sm" 
                        : "bg-card border rounded-tl-sm"
                    )}>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                          {msg.attachments.map(att => (
                            <AttachmentPreview 
                              key={att.id} 
                              attachment={att} 
                            />
                          ))}
                        </div>
                      )}
                      {msg.body?.trim() && (
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Avatar Admin */}
                  {isAdmin && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 ring-2 ring-background shadow-sm">
                      <Headphones className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
          
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area - Fixo no Rodapé */}
      {!isClosed ? (
        <footer className="flex-shrink-0 border-t bg-card/95 backdrop-blur-xl z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
          <div className="px-4 py-3">
            {/* Attachment Previews */}
            {attachmentPreviews.length > 0 && (
              <div className="flex gap-2 mb-2.5 flex-wrap">
                {attachmentPreviews.map((preview, idx) => (
                  <AttachmentPreview
                    key={idx}
                    attachment={{
                      id: idx,
                      publicUrl: preview.url,
                      originalName: preview.name,
                      mimeType: preview.file.type,
                      sizeBytes: preview.file.size,
                    }}
                    isPreview
                    onRemove={() => removeAttachment(idx)}
                  />
                ))}
              </div>
            )}
            
            {/* Input */}
            <div className="flex items-end gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0 h-10 w-10 rounded-xl hover:bg-muted transition-colors"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= 4}
              >
                <Paperclip className={cn(
                  "w-5 h-5 transition-colors",
                  attachments.length >= 4 ? "text-muted-foreground/30" : "text-muted-foreground"
                )} />
              </Button>
              
              <input 
                ref={fileInputRef} 
                type="file" 
                accept="image/*" 
                multiple 
                onChange={handleFileSelect} 
                className="hidden" 
              />
              
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={messageBody}
                  onChange={e => setMessageBody(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite sua resposta..."
                  disabled={sending}
                  rows={1}
                  className="min-h-[44px] max-h-[100px] pr-3 resize-none py-2.5 rounded-xl bg-muted/60 border-0 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                  style={{ height: 'auto' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 100) + 'px';
                  }}
                />
              </div>
              
              <Button
                size="icon"
                className="flex-shrink-0 h-10 w-10 rounded-xl shadow-sm hover:shadow-md transition-all"
                onClick={handleSend}
                disabled={sending || (!messageBody.trim() && attachments.length === 0)}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </footer>
      ) : (
        <div className="flex-shrink-0 border-t bg-muted/40 px-4 py-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Este ticket está {ticket.status === 'resolved' ? 'resolvido' : 'fechado'}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTicketChat;
