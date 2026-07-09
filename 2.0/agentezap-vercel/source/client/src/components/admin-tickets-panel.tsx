import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, ImageIcon, Loader2, Mic, Paperclip, RefreshCw, Send, Square, Video, X } from "lucide-react";
import { apiClient } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { Ticket, TicketStatus, TicketMessage } from "../types/tickets";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
  resolved: "Resolvido",
  closed: "Fechado",
};

const STATUS_COLORS: Record<string, string> = {
  open: "#2563eb",
  in_progress: "#d97706",
  resolved: "#059669",
  closed: "#6b7280",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

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

function isSupportChat(ticket: Ticket) {
  return SUPPORT_SUBJECTS.has(ticket.subject?.trim().toLowerCase() || "");
}

function attachmentKind(mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

function ticketCustomerName(ticket?: Ticket | null) {
  return ticket?.userName || (ticket as any)?.user_name || null;
}

function ticketCustomerEmail(ticket?: Ticket | null) {
  return ticket?.userEmail || (ticket as any)?.user_email || null;
}

function ticketCustomerPhone(ticket?: Ticket | null) {
  return ticket?.userPhone || (ticket as any)?.user_phone || null;
}

function ticketCustomerSummary(ticket?: Ticket | null) {
  const parts = [
    ticketCustomerName(ticket),
    ticketCustomerEmail(ticket),
    ticketCustomerPhone(ticket),
  ].filter(Boolean);
  return parts.join(" • ");
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentIcon({ mimeType }: { mimeType?: string }) {
  const kind = attachmentKind(mimeType);
  if (kind === "image") return <ImageIcon size={15} />;
  if (kind === "video") return <Video size={15} />;
  if (kind === "audio") return <Mic size={15} />;
  return <FileText size={15} />;
}

function renderAttachment(attachment: any, isAdmin: boolean) {
  const url = attachment.publicUrl || attachment.public_url;
  const mimeType = attachment.mimeType || attachment.mime_type || "";
  const originalName = attachment.originalName || attachment.original_name || "Arquivo";
  const kind = attachmentKind(mimeType);
  if (!url) return null;

  if (kind === "image") {
    return (
      <img
        key={attachment.id}
        src={url}
        alt={originalName}
        style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, cursor: "pointer", objectFit: "cover" }}
        onClick={() => window.open(url, "_blank")}
      />
    );
  }

  if (kind === "video") {
    return (
      <video key={attachment.id} src={url} controls preload="metadata" style={{ width: 240, maxWidth: "100%", maxHeight: 170, borderRadius: 8, background: "#000" }} />
    );
  }

  if (kind === "audio") {
    return <audio key={attachment.id} src={url} controls preload="metadata" style={{ width: 240, maxWidth: "100%" }} />;
  }

  return (
    <a
      key={attachment.id}
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        maxWidth: 240,
        padding: "8px 10px",
        borderRadius: 8,
        border: isAdmin ? "1px solid rgba(255,255,255,0.35)" : "1px solid #e5e7eb",
        background: isAdmin ? "rgba(255,255,255,0.12)" : "#f8fafc",
        color: isAdmin ? "#fff" : "#374151",
        textDecoration: "none",
        fontSize: 12,
      }}
    >
      <AttachmentIcon mimeType={mimeType} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{originalName}</span>
    </a>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  ));

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isMobile;
}

export default function AdminTicketsPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const isMobile = useIsMobile();

  const fetchTickets = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoadingTickets(true);
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const { data } = await apiClient.get("/admin/tickets", { params });
      setTickets(data.items || []);
    } catch (error) {
      console.error("[admin-support] Erro ao buscar atendimentos:", error);
    } finally {
      if (showLoading) setLoadingTickets(false);
    }
  }, [priorityFilter, statusFilter]);

  const loadTicket = useCallback(async (ticketId: number, showLoading = true) => {
    try {
      if (showLoading) setLoadingMessages(true);
      const [ticketRes, msgRes] = await Promise.all([
        apiClient.get(`/admin/tickets/${ticketId}`),
        apiClient.get(`/admin/tickets/${ticketId}/messages`),
      ]);
      setSelectedTicket(ticketRes.data.ticket || ticketRes.data);
      setMessages(msgRes.data.items || msgRes.data || []);
      await apiClient.post(`/admin/tickets/${ticketId}/read`).catch(() => undefined);
    } catch (error) {
      console.error("[admin-support] Erro ao carregar atendimento:", error);
    } finally {
      if (showLoading) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets(true);
  }, [fetchTickets]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-support-runtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        (payload) => {
          const raw = payload.new as any;
          fetchTickets(false);
          if (selectedTicketId && Number(raw?.id) === selectedTicketId) {
            loadTicket(selectedTicketId, false);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_messages" },
        (payload) => {
          const raw = payload.new as any;
          const ticketId = Number(raw?.ticket_id ?? raw?.ticketId);
          fetchTickets(false);
          if (selectedTicketId && ticketId === selectedTicketId) {
            loadTicket(selectedTicketId, false);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTickets, loadTicket, selectedTicketId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectTicket = useCallback(async (ticketId: number) => {
    setSelectedTicketId(ticketId);
    setErrorMessage(null);
    await loadTicket(ticketId, true);
  }, [loadTicket]);

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
      console.error("[admin-support] Erro ao gravar audio:", error);
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
    if (!selectedTicketId || (!messageBody.trim() && attachments.length === 0)) return;
    if (sending) return;

    setSending(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append("body", messageBody.trim());
      attachments.forEach(({ file }) => formData.append("attachments", file));
      await apiClient.post(`/admin/tickets/${selectedTicketId}/messages`, formData);
      setMessageBody("");
      clearAttachments();
      await loadTicket(selectedTicketId, false);
      await fetchTickets(false);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "Erro ao enviar resposta");
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (ticketId: number, newStatus: TicketStatus) => {
    try {
      await apiClient.patch(`/admin/tickets/${ticketId}/status`, { status: newStatus });
      await loadTicket(ticketId, false);
      await fetchTickets(false);
    } catch {
      alert("Erro ao alterar status");
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files || []);
    if (files.length > 0) {
      event.preventDefault();
      addFiles(files);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) {
      event.preventDefault();
      addFiles(files);
    }
  };

  const containerStyle: React.CSSProperties = {
    display: "flex",
    height: "calc(100vh - 120px)",
    gap: 0,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    overflow: "hidden",
    background: "#fff",
  };

  return (
    <div style={containerStyle} onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
      {(!isMobile || !selectedTicketId) && (
        <div style={{ width: isMobile ? "100%" : 380, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.2, color: "#111827" }}>Suporte</h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>Atendimento dos clientes do SaaS em tempo real</p>
              </div>
              <button
                type="button"
                onClick={() => fetchTickets(true)}
                style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", color: "#4b5563", display: "flex", alignItems: "center", justifyContent: "center" }}
                aria-label="Atualizar suporte"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, outline: "none" }}>
                <option value="">Todos status</option>
                {Object.entries(STATUS_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
              </select>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, outline: "none" }}>
                <option value="">Todas prioridades</option>
                {Object.entries(PRIORITY_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
              </select>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loadingTickets ? (
              <div style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>
                <Loader2 size={22} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
                Carregando suporte...
              </div>
            ) : tickets.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>Nenhum atendimento encontrado</div>
            ) : tickets.map((ticketItem) => {
              const active = selectedTicketId === ticketItem.id;
              const statusColor = STATUS_COLORS[ticketItem.status] || "#6b7280";
              return (
                <button
                  key={ticketItem.id}
                  type="button"
                  onClick={() => selectTicket(ticketItem.id)}
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    border: 0,
                    borderBottom: "1px solid #f3f4f6",
                    cursor: "pointer",
                    background: active ? "#ecfdf5" : "#fff",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 5 }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 650, fontSize: 14, color: "#111827" }}>
                      #{ticketItem.id} {isSupportChat(ticketItem) ? "Chat com cliente" : ticketItem.subject}
                    </span>
                    {ticketItem.unreadCountAdmin > 0 && (
                      <span style={{ background: "#10b981", color: "#fff", borderRadius: 8, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>
                        {ticketItem.unreadCountAdmin}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ background: `${statusColor}18`, color: statusColor, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>
                      {STATUS_LABELS[ticketItem.status] || ticketItem.status}
                    </span>
                    <span style={{ color: "#9ca3af" }}>{PRIORITY_LABELS[ticketItem.priority] || ticketItem.priority}</span>
                  </div>
                  {ticketCustomerSummary(ticketItem) && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ticketCustomerSummary(ticketItem)}
                    </p>
                  )}
                  {ticketItem.lastMessagePreview && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ticketItem.lastMessagePreview}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!selectedTicketId ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", padding: 24 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: "#ecfdf5", color: "#059669", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <Send size={28} />
              </div>
              <p style={{ margin: 0, fontSize: 15, color: "#4b5563", fontWeight: 600 }}>Selecione um atendimento</p>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#9ca3af" }}>As novas mensagens chegam aqui sem recarregar a pagina.</p>
            </div>
          </div>
        ) : loadingMessages ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
            <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          <>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, backgroundColor: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                {isMobile && (
                  <button type="button" onClick={() => setSelectedTicketId(null)} style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ArrowLeft size={16} />
                  </button>
                )}
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 650, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    #{selectedTicket?.id} - {selectedTicket && isSupportChat(selectedTicket) ? "Chat com cliente" : selectedTicket?.subject}
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      Prioridade: {PRIORITY_LABELS[selectedTicket?.priority || ""] || selectedTicket?.priority}
                    </span>
                    {ticketCustomerName(selectedTicket) && (
                      <span style={{ fontSize: 12, color: "#111827", fontWeight: 600 }}>
                        {ticketCustomerName(selectedTicket)}
                      </span>
                    )}
                    {(ticketCustomerEmail(selectedTicket) || ticketCustomerPhone(selectedTicket)) && (
                      <span style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[ticketCustomerEmail(selectedTicket), ticketCustomerPhone(selectedTicket)].filter(Boolean).join(" • ")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <select
                value={selectedTicket?.status || "open"}
                onChange={(event) => selectedTicketId && handleStatusChange(selectedTicketId, event.target.value as TicketStatus)}
                style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontWeight: 600, outline: "none", backgroundColor: "#fff" }}
              >
                {Object.entries(STATUS_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
              </select>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8, backgroundColor: "#f8fafc" }}>
              {messages.map((message) => {
                const isAdmin = message.senderType === "admin";
                const createdAt = message.createdAt || (message as any).created_at;
                return (
                  <div key={message.id} style={{ display: "flex", justifyContent: isAdmin ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "72%",
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: isAdmin ? "#10b981" : "#fff",
                      color: isAdmin ? "#fff" : "#111827",
                      border: isAdmin ? "none" : "1px solid #e5e7eb",
                      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
                    }}>
                      {message.attachments?.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: message.body?.trim() ? 8 : 0 }}>
                          {message.attachments.map((attachment) => renderAttachment(attachment, isAdmin))}
                        </div>
                      )}
                      {message.body?.trim() && (
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.body}</p>
                      )}
                      <div style={{ fontSize: 11, marginTop: 6, textAlign: isAdmin ? "right" : "left", color: isAdmin ? "rgba(255,255,255,0.75)" : "#9ca3af" }}>
                        {createdAt ? new Date(createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: 12, borderTop: "1px solid #e5e5e5", backgroundColor: "#fff" }}>
              {attachments.length > 0 && (
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
                  {attachments.map((item, index) => (
                    <div key={`${item.file.name}-${index}`} style={{ position: "relative", minWidth: 110, maxWidth: 150, border: "1px solid #e5e7eb", borderRadius: 8, background: "#f8fafc", padding: 8, fontSize: 12, color: "#374151" }}>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        style={{ position: "absolute", top: -7, right: -7, width: 22, height: 22, borderRadius: 8, border: 0, background: "#111827", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        aria-label="Remover anexo"
                      >
                        <X size={13} />
                      </button>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, minWidth: 0 }}>
                        <AttachmentIcon mimeType={item.file.type} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{item.file.name}</span>
                      </div>
                      {attachmentKind(item.file.type) === "image" ? (
                        <img src={item.url} alt={item.file.name} style={{ height: 52, width: "100%", borderRadius: 8, objectFit: "cover" }} />
                      ) : (
                        <span style={{ fontSize: 11, color: "#6b7280" }}>{formatFileSize(item.file.size)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {errorMessage && (
                <div style={{ marginBottom: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                  {errorMessage}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= MAX_ATTACHMENTS}
                style={{ width: 38, height: 38, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#6b7280" }}
              >
                <Paperclip size={17} />
              </button>
              <input ref={fileInputRef} type="file" accept={ACCEPTED_ATTACHMENT_TYPES} multiple onChange={handleFileSelect} style={{ display: "none" }} />
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                style={{ width: 38, height: 38, borderRadius: 8, border: "1px solid #e5e7eb", background: recording ? "#ef4444" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: recording ? "#fff" : "#6b7280" }}
                aria-label={recording ? "Parar gravacao" : "Gravar audio"}
              >
                {recording ? <Square size={15} /> : <Mic size={17} />}
              </button>
              <textarea
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Responder ao cliente..."
                rows={1}
                disabled={sending}
                style={{ flex: 1, minHeight: 38, maxHeight: 100, padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, resize: "none", outline: "none", fontFamily: "inherit" }}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || (!messageBody.trim() && attachments.length === 0)}
                style={{ width: 38, height: 38, borderRadius: 8, border: "none", cursor: "pointer", background: sending || (!messageBody.trim() && attachments.length === 0) ? "#e5e7eb" : "#10b981", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                {sending ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={16} />}
              </button>
              </div>
              <div style={{ marginTop: 5, fontSize: 11, color: "#6b7280" }}>
                Texto, print colado, imagem, video, audio, PDF e arquivos.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
