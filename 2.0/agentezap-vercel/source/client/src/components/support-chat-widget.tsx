import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  ImageIcon,
  LifeBuoy,
  Loader2,
  MessageCircle,
  Mic,
  Paperclip,
  Send,
  Square,
  Video,
  X,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Ticket, TicketAttachment, TicketMessage } from "@/types/tickets";
import { cn } from "@/lib/utils";

const SUPPORT_SUBJECT = "Canal de ajuda SaaS";
const SUPPORT_SUBJECTS = new Set([
  SUPPORT_SUBJECT.toLowerCase(),
  "chat com suporte",
]);
const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const ACCEPTED_ATTACHMENT_TYPES = [
  "image/*",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/*",
  "application/pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".zip",
  ".txt",
  ".csv",
  ".json",
].join(",");

type AttachmentDraft = {
  file: File;
  url: string;
};

function isActiveSupportTicket(ticket: Ticket) {
  return (
    SUPPORT_SUBJECTS.has(ticket.subject?.trim().toLowerCase() || "") &&
    ticket.status !== "resolved" &&
    ticket.status !== "closed"
  );
}

function mapRealtimeMessage(raw: any): TicketMessage {
  return {
    id: raw.id,
    ticketId: raw.ticket_id ?? raw.ticketId,
    senderType: raw.sender_type ?? raw.senderType,
    senderUserId: raw.sender_user_id ?? raw.senderUserId,
    senderAdminId: raw.sender_admin_id ?? raw.senderAdminId,
    body: raw.body ?? "",
    hasAttachments: raw.has_attachments ?? raw.hasAttachments ?? false,
    attachments: [],
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
  };
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentKind(mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

function AttachmentIcon({ mimeType }: { mimeType?: string }) {
  const kind = attachmentKind(mimeType);
  if (kind === "image") return <ImageIcon className="h-4 w-4" />;
  if (kind === "video") return <Video className="h-4 w-4" />;
  if (kind === "audio") return <Mic className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function AttachmentView({ attachment, mine }: { attachment: TicketAttachment; mine: boolean }) {
  const url = attachment.publicUrl;
  const kind = attachmentKind(attachment.mimeType);
  if (!url) return null;

  if (kind === "image") {
    return (
      <button type="button" onClick={() => window.open(url, "_blank")} className="block text-left">
        <img
          src={url}
          alt={attachment.originalName}
          className="max-h-44 max-w-full rounded-lg object-cover"
        />
      </button>
    );
  }

  if (kind === "video") {
    return (
      <video
        src={url}
        controls
        className="max-h-44 w-full rounded-lg bg-black"
        preload="metadata"
      />
    );
  }

  if (kind === "audio") {
    return <audio src={url} controls className="w-full max-w-[260px]" preload="metadata" />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
        mine ? "border-white/30 bg-white/10 text-white" : "border-slate-200 bg-slate-50 text-slate-700",
      )}
    >
      <AttachmentIcon mimeType={attachment.mimeType} />
      <span className="min-w-0 flex-1 truncate">{attachment.originalName || "Arquivo"}</span>
    </a>
  );
}

export default function SupportChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
  }, []);

  const addFiles = useCallback((incoming: File[]) => {
    setErrorMessage(null);
    const valid = incoming.filter((file) => {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setErrorMessage("Um arquivo passou de 25 MB e nao foi anexado.");
        return false;
      }
      return true;
    });

    if (valid.length === 0) return;

    setAttachments((prev) => {
      const slots = MAX_ATTACHMENTS - prev.length;
      if (slots <= 0) {
        setErrorMessage(`Envie no maximo ${MAX_ATTACHMENTS} arquivos por mensagem.`);
        return prev;
      }
      const selected = valid.slice(0, slots);
      if (valid.length > slots) {
        setErrorMessage(`Envie no maximo ${MAX_ATTACHMENTS} arquivos por mensagem.`);
      }
      return [
        ...prev,
        ...selected.map((file) => ({ file, url: URL.createObjectURL(file) })),
      ];
    });
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      return next;
    });
  }, []);

  const fetchMessages = useCallback(async (ticketId: number) => {
    const { data } = await apiClient.get(`/tickets/${ticketId}/messages`);
    setMessages(data.items || []);
  }, []);

  const markAsRead = useCallback(async (ticketId: number) => {
    try {
      await apiClient.post(`/tickets/${ticketId}/read`);
      setUnreadCount(0);
    } catch (error) {
      console.warn("[support-chat] Falha ao marcar como lido:", error);
    }
  }, []);

  const fetchSupportTicket = useCallback(async (withMessages: boolean) => {
    const { data } = await apiClient.get("/tickets", { params: { limit: 50 } });
    const items: Ticket[] = data.items || [];
    const activeTicket = items.find(isActiveSupportTicket) || null;
    setTicket(activeTicket);
    setUnreadCount(activeTicket?.unreadCountUser || 0);

    if (activeTicket && withMessages) {
      await fetchMessages(activeTicket.id);
      await markAsRead(activeTicket.id);
    } else if (!activeTicket && withMessages) {
      setMessages([]);
    }

    return activeTicket;
  }, [fetchMessages, markAsRead]);

  useEffect(() => {
    fetchSupportTicket(false).catch(() => undefined);
    const interval = window.setInterval(() => {
      if (!open) {
        fetchSupportTicket(false).catch(() => undefined);
      }
    }, 45000);

    return () => window.clearInterval(interval);
  }, [fetchSupportTicket, open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    fetchSupportTicket(true)
      .catch((error) => {
        console.error("[support-chat] Erro ao carregar suporte:", error);
        setErrorMessage("Nao foi possivel carregar o suporte agora.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      cancelled = true;
    };
  }, [fetchSupportTicket, open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (!ticket?.id) return;

    const channel = supabase
      .channel(`support-widget:${ticket.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
          filter: `ticket_id=eq.${ticket.id}`,
        },
        (payload) => {
          const raw = payload.new as any;
          const hasAttachments = raw.has_attachments ?? raw.hasAttachments ?? false;
          if (hasAttachments) {
            fetchMessages(ticket.id).catch(() => undefined);
            return;
          }

          const newMessage = mapRealtimeMessage(raw);
          setMessages((prev) => (
            prev.some((message) => message.id === newMessage.id) ? prev : [...prev, newMessage]
          ));

          if (!open && newMessage.senderType === "admin") {
            setUnreadCount((count) => count + 1);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMessages, open, ticket?.id]);

  useEffect(() => {
    return () => {
      clearAttachments();
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [clearAttachments]);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Seu navegador nao liberou gravacao de audio.");
      return;
    }

    try {
      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderChunksRef.current = [];
      recorderStreamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recorderChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(recorderChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          addFiles([new File([blob], `audio-suporte-${Date.now()}.webm`, { type: mimeType })]);
        }
        recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
        recorderRef.current = null;
      };

      recorder.start();
      setRecording(true);
    } catch (error) {
      console.error("[support-chat] Erro ao gravar audio:", error);
      setErrorMessage("Nao foi possivel iniciar o microfone.");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setRecording(false);
  };

  const handleSend = async () => {
    const body = messageBody.trim();
    if ((!body && attachments.length === 0) || sending) return;

    setSending(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append("body", body);
      attachments.forEach(({ file }) => formData.append("attachments", file));

      if (!ticket) {
        formData.append("subject", SUPPORT_SUBJECT);
        formData.append("description", body);
        formData.append("priority", "medium");
        const { data } = await apiClient.post("/tickets", formData);
        const createdTicket = data.ticket as Ticket;
        setTicket(createdTicket);
        setMessageBody("");
        clearAttachments();
        await fetchMessages(createdTicket.id);
        await markAsRead(createdTicket.id);
        return;
      }

      await apiClient.post(`/tickets/${ticket.id}/messages`, formData);
      setMessageBody("");
      clearAttachments();
      await fetchMessages(ticket.id);
      await markAsRead(ticket.id);
    } catch (error: any) {
      console.error("[support-chat] Erro ao enviar mensagem:", error);
      setErrorMessage(error?.response?.data?.message || "Nao foi possivel enviar. Tente novamente.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files || []);
    if (files.length > 0) {
      event.preventDefault();
      addFiles(files);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) {
      event.preventDefault();
      addFiles(files);
    }
  };

  const displayName = String((user as any)?.name || (user as any)?.email || "cliente").split(" ")[0];

  return (
    <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-3 z-[70] flex flex-col items-end md:bottom-5 md:right-5">
      {open && (
        <section
          className="mb-3 flex h-[min(560px,calc(100vh-9rem))] w-[calc(100vw-2rem)] max-w-[380px] flex-col overflow-hidden rounded-lg border border-emerald-200 bg-background shadow-2xl md:h-[560px]"
          aria-label="Chat de suporte"
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
        >
          <header className="flex shrink-0 items-center justify-between bg-emerald-500 px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/18">
                <LifeBuoy className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">AgenteZap</p>
                <p className="truncate text-xs text-white/85">A equipe tambem pode ajudar</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/15"
              aria-label="Fechar suporte"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="shrink-0 border-b bg-emerald-50 px-4 py-3">
            <p className="text-base font-semibold text-emerald-950">Ola {displayName}</p>
            <p className="mt-0.5 text-sm text-emerald-900">Como podemos ajudar?</p>
            <div className="mt-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700">
              Atendimento de segunda a sexta, das 08h30 as 18h.
            </div>
          </div>

          <main className="flex-1 overflow-y-auto bg-slate-50 px-3 pb-6 pt-4">
            {loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                Carregando suporte...
              </div>
            ) : (
              <div className="space-y-3">
                {messages.length === 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600 shadow-sm">
                    Mande uma mensagem, cole um print ou anexe um arquivo.
                  </div>
                )}

                {messages.map((message) => {
                  const fromSupport = message.senderType === "admin";
                  return (
                    <div
                      key={message.id}
                      className={cn("flex", fromSupport ? "justify-start" : "justify-end")}
                    >
                      <div
                        className={cn(
                          "max-w-[84%] rounded-lg px-3 py-2 text-sm shadow-sm",
                          fromSupport
                            ? "border border-slate-200 bg-white text-slate-800"
                            : "bg-emerald-500 text-white",
                        )}
                      >
                        {message.attachments?.length > 0 && (
                          <div className="mb-2 grid gap-2">
                            {message.attachments.map((attachment) => (
                              <AttachmentView key={attachment.id} attachment={attachment} mine={!fromSupport} />
                            ))}
                          </div>
                        )}
                        {message.body?.trim() && (
                          <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        )}
                        <p className={cn("mt-1 text-[11px]", fromSupport ? "text-slate-400" : "text-white/75")}>
                          {formatTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </main>

          <footer className="shrink-0 border-t bg-white px-3 py-3">
            {attachments.length > 0 && (
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {attachments.map((item, index) => (
                  <div key={`${item.file.name}-${index}`} className="relative min-w-[96px] max-w-[140px] rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-lg bg-slate-900 text-white"
                      aria-label="Remover anexo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="mb-1 flex items-center gap-1.5">
                      <AttachmentIcon mimeType={item.file.type} />
                      <span className="truncate font-medium">{item.file.name}</span>
                    </div>
                    {attachmentKind(item.file.type) === "image" ? (
                      <img src={item.url} alt={item.file.name} className="h-14 w-full rounded-lg object-cover" />
                    ) : (
                      <p className="text-[11px] text-slate-500">{formatFileSize(item.file.size)}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {errorMessage && (
              <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {errorMessage}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-lg border border-emerald-400 bg-white px-2 py-2 shadow-sm focus-within:ring-2 focus-within:ring-emerald-200">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_ATTACHMENT_TYPES}
                onChange={(event) => {
                  addFiles(Array.from(event.target.files || []));
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="Anexar arquivo"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  recording ? "bg-red-500 text-white hover:bg-red-600" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
                )}
                aria-label={recording ? "Parar gravacao" : "Gravar audio"}
              >
                {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <textarea
                ref={inputRef}
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                rows={1}
                disabled={sending}
                placeholder="Envie uma mensagem..."
                className="max-h-24 min-h-[38px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || (!messageBody.trim() && attachments.length === 0)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400"
                aria-label="Enviar mensagem"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Texto, print colado, imagem, video, audio, PDF e arquivos.</p>
          </footer>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-xl transition-all hover:-translate-y-0.5 hover:bg-emerald-600"
        aria-label={open ? "Fechar chat de suporte" : "Abrir chat de suporte"}
      >
        {open ? <CheckCircle2 className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-lg bg-red-500 px-1 text-[11px] font-bold text-white">
            {Math.min(unreadCount, 9)}
          </span>
        )}
      </button>
    </div>
  );
}
