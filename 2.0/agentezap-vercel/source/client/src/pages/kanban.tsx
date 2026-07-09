/**
 * 🎯 KANBAN CRM - Interface Minimalista e Focada em Conversão
 * 
 * Design Principles Applied:
 * - Eye-tracking: F-pattern layout, visual hierarchy
 * - Minimal: Only essential info on cards
 * - Conversion-focused: Clear stage progression
 * - Drag & Drop: Intuitive movement between stages
 */

import { useState, useEffect, useMemo } from "react";
import { useQueries, useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ContextualHelpButton } from "@/components/contextual-help-button";
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  MessageSquare, 
  Clock, 
  Phone,
  User,
  Edit2,
  Trash2,
  GripVertical,
  X,
  Check,
  ChevronRight,
  AlertCircle,
  Sparkles,
  Settings2,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  getConversationDisplayName,
  getConversationDisplayNumber,
} from "@/lib/conversation-identity";
import { resolveMemberPermissions } from "@/lib/member-permissions";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

// Types
interface KanbanStage {
  id: string;
  user_id: string;
  board_id?: string;
  name: string;
  description: string;
  color: string;
  position: number;
  is_default: boolean;
}

interface KanbanBoard {
  id: string;
  owner_id: string;
  name: string;
  description?: string;
  kind: string;
  is_default: boolean;
  is_active: boolean;
  memberIds?: string[];
}

interface TeamMemberOption {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

interface Conversation {
  id: string;
  contact_name: string | null;
  contact_number: string;
  contact_avatar: string | null;
  last_message_text: string | null;
  last_message_time: string | null;
  unread_count: number;
  connection_id?: string | null;
  connection_name?: string | null;
  connection_phone_number?: string | null;
  kanban_board_id?: string | null;
  kanban_stage_id: string | null;
  kanban_notes: string | null;
  priority: string | null;
}

interface KanbanConversationPage {
  conversations: Conversation[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const KANBAN_PAGE_SIZE = 20;
const KANBAN_UNASSIGNED_STAGE_ID = "__unassigned__";
const KANBAN_LAST_BOARD_STORAGE_KEY = "kanban:last-board-id";

const inboxStage: KanbanStage = {
  id: KANBAN_UNASSIGNED_STAGE_ID,
  user_id: "",
  name: "Inbox",
  description: "Conversas não categorizadas",
  color: "bg-slate-400",
  position: -1,
  is_default: false,
};

function buildKanbanBoardUrl(boardId?: string | null): string {
  const params = new URLSearchParams();
  if (boardId) {
    params.set("boardId", boardId);
  }
  return params.toString() ? `/api/kanban/boards?${params.toString()}` : "/api/kanban/boards";
}

function buildKanbanStagesUrl(boardId?: string | null): string {
  const params = new URLSearchParams();
  if (boardId) {
    params.set("boardId", boardId);
  }
  return params.toString() ? `/api/kanban/stages?${params.toString()}` : "/api/kanban/stages";
}

function buildKanbanPageUrl(stageId: string, limit: number, search: string, boardId?: string | null): string {
  const params = new URLSearchParams({
    stageId,
    limit: String(limit),
    offset: "0",
  });

  if (boardId) {
    params.set("boardId", boardId);
  }

  const searchTerm = search.trim();
  if (searchTerm) {
    params.set("search", searchTerm);
  }

  return `/api/kanban/conversations/page?${params.toString()}`;
}

async function fetchKanbanConversationPage(
  stageId: string,
  limit: number,
  search: string,
  boardId?: string | null,
): Promise<KanbanConversationPage> {
  const response = await apiRequest("GET", buildKanbanPageUrl(stageId, limit, search, boardId));
  return response.json();
}

// Priority Config
const priorities = {
  low: { label: "Baixa", color: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  normal: { label: "Normal", color: "bg-blue-100 text-blue-600", dot: "bg-blue-400" },
  high: { label: "Alta", color: "bg-amber-100 text-amber-600", dot: "bg-amber-400" },
  urgent: { label: "Urgente", color: "bg-red-100 text-red-600", dot: "bg-red-500" },
};

// Stage Colors
const stageColors = [
  { value: "bg-blue-500", label: "Azul" },
  { value: "bg-purple-500", label: "Roxo" },
  { value: "bg-emerald-500", label: "Verde" },
  { value: "bg-amber-500", label: "Amarelo" },
  { value: "bg-red-500", label: "Vermelho" },
  { value: "bg-pink-500", label: "Rosa" },
  { value: "bg-cyan-500", label: "Ciano" },
  { value: "bg-slate-400", label: "Cinza" },
];

// Time helpers
function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return "agora";
  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function buildConversationIdentity(conversation: Conversation) {
  return {
    id: conversation.id,
    contactName: conversation.contact_name,
    contactNumber: conversation.contact_number,
  };
}

function formatConversationConnectionLabel(conversation: Conversation): string | null {
  const connectionName = conversation.connection_name?.trim();
  if (connectionName) return connectionName;

  const phoneNumber = conversation.connection_phone_number?.trim();
  if (phoneNumber) return `Linha ${phoneNumber}`;

  const connectionId = conversation.connection_id?.trim();
  if (connectionId) return `Conexao ${connectionId.slice(0, 4)}`;

  return null;
}

// ============ CONTACT CARD COMPONENT ============
interface ContactCardProps {
  conversation: Conversation;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onEdit: (conversation: Conversation) => void;
  onRemoveFromKanban: (conversation: Conversation) => void;
  onOpenChat: (conversationId: string) => void;
  canDrag: boolean;
  canEdit: boolean;
  canRemove: boolean;
}

function ContactCard({ conversation, onDragStart, onEdit, onRemoveFromKanban, onOpenChat, canDrag, canEdit, canRemove }: ContactCardProps) {
  const displayName = getConversationDisplayName(buildConversationIdentity(conversation));
  const initials = (displayName || "?").slice(0, 2).toUpperCase();
  const priority = conversation.priority as keyof typeof priorities || "normal";
  const priorityConfig = priorities[priority];
  const connectionLabel = formatConversationConnectionLabel(conversation);
  
  return (
    <div
      draggable={canDrag}
      onDragStart={canDrag ? (e) => onDragStart(e, conversation.id) : undefined}
      data-testid="kanban-card"
      data-conversation-id={conversation.id}
      data-contact-number={conversation.contact_number}
      data-connection-id={conversation.connection_id || ""}
      className={cn(
        "group relative bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200",
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-default",
      )}
    >
      {/* Drag Handle - Visible on hover */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity">
        <GripVertical className="w-4 h-4 text-slate-400" />
      </div>
      
      {/* Priority Indicator */}
      <div className={cn("absolute top-3 right-3 w-2 h-2 rounded-full", priorityConfig.dot)} />
      
      {/* Main Content */}
      <div className="flex items-start gap-3">
        <Avatar className="w-10 h-10 flex-shrink-0">
          <AvatarImage src={conversation.contact_avatar || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-sm font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          {/* Name & Time */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className="font-semibold text-slate-800 truncate text-sm">
              {displayName}
            </h4>
            {conversation.last_message_time && (
              <span className="text-xs text-slate-400 flex-shrink-0">
                {formatTimeAgo(conversation.last_message_time)}
              </span>
            )}
          </div>
          
          {/* Last Message Preview */}
          {conversation.last_message_text && (
            <p className="text-xs text-slate-500 truncate leading-relaxed">
              {conversation.last_message_text}
            </p>
          )}
          
          {/* Notes Preview */}
          {conversation.kanban_notes && (
            <p className="text-xs text-purple-600 mt-1 truncate flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {conversation.kanban_notes}
            </p>
          )}

          {connectionLabel && (
            <div className="mt-2 inline-flex max-w-full items-center gap-1 rounded-md border border-sky-100 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{connectionLabel}</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 pointer-events-none transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 rounded-lg border border-blue-100 bg-white px-2 text-xs font-medium text-blue-600 shadow-sm hover:bg-blue-50"
          title="Abrir conversa"
          aria-label={`Abrir conversa de ${displayName}`}
          data-testid="kanban-card-open-chat"
          onClick={(e) => {
            e.stopPropagation();
            onOpenChat(conversation.id);
          }}
        >
          <MessageSquare className="mr-1 h-3.5 w-3.5" />
          Conversar
        </Button>
        {canEdit && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-100"
          title="Editar contato"
          aria-label={`Editar contato ${displayName}`}
          data-testid="kanban-card-edit-contact"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(conversation);
          }}
        >
          <Edit2 className="mr-1 h-3.5 w-3.5" />
          Editar
        </Button>
        )}
        {canRemove && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 rounded-lg border border-red-100 bg-white p-0 text-red-600 shadow-sm hover:bg-red-50"
          title="Remover do Kanban"
          aria-label={`Remover ${displayName} do Kanban`}
          data-testid="kanban-card-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveFromKanban(conversation);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        )}
      </div>
      
      {/* Unread Badge */}
      {conversation.unread_count > 0 && (
        <Badge className="absolute -top-2 -right-2 bg-red-500 text-white text-xs h-5 min-w-5 flex items-center justify-center px-1.5">
          {conversation.unread_count > 9 ? "9+" : conversation.unread_count}
        </Badge>
      )}
    </div>
  );
}

// ============ STAGE COLUMN COMPONENT ============
interface StageColumnProps {
  stage: KanbanStage;
  conversations: Conversation[];
  totalCount: number;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, stageId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onEditStage: (stage: KanbanStage) => void;
  onDeleteStage: (stageId: string) => void;
  onEditContact: (conversation: Conversation) => void;
  onRemoveContact: (conversation: Conversation) => void;
  onOpenChat: (conversationId: string) => void;
  onLoadMore: (stageId: string) => void;
  isDragOver: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  canManageStage: boolean;
  canEditContact: boolean;
  canDragCards: boolean;
  canRemoveContact: boolean;
}

function StageColumn({
  stage,
  conversations,
  totalCount,
  onDragStart,
  onDrop,
  onDragOver,
  onEditStage,
  onDeleteStage,
  onEditContact,
  onRemoveContact,
  onOpenChat,
  onLoadMore,
  isDragOver,
  isLoading,
  isLoadingMore,
  hasMore,
  canManageStage,
  canEditContact,
  canDragCards,
  canRemoveContact,
}: StageColumnProps) {
  return (
    <div
      data-testid="kanban-stage-column"
      data-stage-id={stage.id}
      className={cn(
        "flex flex-col bg-slate-50/80 rounded-2xl w-[300px] flex-shrink-0 transition-all duration-200",
        isDragOver && "ring-2 ring-blue-400 ring-offset-2 bg-blue-50/50"
      )}
      onDrop={(e) => onDrop(e, stage.id)}
      onDragOver={onDragOver}
    >
      {/* Column Header */}
      <div className="p-4 border-b border-slate-200/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-3 h-3 rounded-full", stage.color)} />
            <div>
              <h3 className="font-semibold text-slate-800">{stage.name}</h3>
              {stage.description && (
                <p className="text-xs text-slate-500 mt-0.5">{stage.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-white text-slate-600 font-medium">
              {isLoading ? "..." : totalCount}
            </Badge>
            {canManageStage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal className="w-4 h-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onEditStage(stage)}>
                  <Edit2 className="w-4 h-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                {!stage.is_default && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-red-600"
                      onClick={() => onDeleteStage(stage.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Excluir
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Cards Container */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] min-h-[200px]">
        {isLoading && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">Carregando contatos...</p>
          </div>
        )}

        {conversations.map((conv) => (
          <ContactCard
            key={conv.id}
            conversation={conv}
            onDragStart={onDragStart}
            onEdit={onEditContact}
            onRemoveFromKanban={onRemoveContact}
            onOpenChat={onOpenChat}
            canDrag={canDragCards}
            canEdit={canEditContact}
            canRemove={canRemoveContact}
          />
        ))}
        
        {!isLoading && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <User className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">Nenhum contato</p>
            <p className="text-xs">Arraste para cá</p>
          </div>
        )}

        {hasMore && (
          <Button
            type="button"
            variant="outline"
            className="w-full h-9 rounded-lg bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            onClick={() => onLoadMore(stage.id)}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Carregando..." : `Ver mais (${Math.max(totalCount - conversations.length, 0)})`}
          </Button>
        )}
      </div>
    </div>
  );
}

// ============ MAIN KANBAN PAGE ============
export default function KanbanPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const isMember = Boolean((user as any)?.isMember);
  const permissions = resolveMemberPermissions((user as any)?.memberData?.permissions);
  const canManageStages = !isMember;
  const canDragCards = !isMember || permissions.canMoveKanban;
  const canEditContactData = !isMember || permissions.canEditContacts;
  
  // State
  const [search, setSearch] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<Conversation | null>(null);
  const [editingStage, setEditingStage] = useState<KanbanStage | null>(null);
  const [isAddingStage, setIsAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("bg-blue-500");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [visibleLimitsByStage, setVisibleLimitsByStage] = useState<Record<string, number>>({});
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [isBoardDialogOpen, setIsBoardDialogOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<KanbanBoard | null>(null);
  const [boardFormName, setBoardFormName] = useState("");
  const [boardFormDescription, setBoardFormDescription] = useState("");
  const [boardMemberIds, setBoardMemberIds] = useState<string[]>([]);

  const { data: boards = [], isLoading: boardsLoading } = useQuery<KanbanBoard[]>({
    queryKey: ["/api/kanban/boards"],
    queryFn: async () => {
      const response = await apiRequest("GET", buildKanbanBoardUrl());
      return response.json();
    },
  });

  const { data: teamMembers = [] } = useQuery<TeamMemberOption[]>({
    queryKey: ["/api/team-members"],
    enabled: canManageStages,
  });

  const rememberSelectedBoardId = (boardId: string) => {
    setSelectedBoardId(boardId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KANBAN_LAST_BOARD_STORAGE_KEY, boardId);
    }
  };

  useEffect(() => {
    if (!boards.length) {
      if (selectedBoardId) {
        setSelectedBoardId("");
      }
      return;
    }

    const currentBoardId = boards.find((board) => board.id === selectedBoardId)?.id || "";
    const storedBoardId =
      typeof window !== "undefined" ? window.localStorage.getItem(KANBAN_LAST_BOARD_STORAGE_KEY) : null;
    const storedBoardExists = storedBoardId && boards.some((board) => board.id === storedBoardId);
    const preferredBoardId = currentBoardId || (storedBoardExists ? storedBoardId : boards[0]?.id || "");

    if (preferredBoardId && preferredBoardId !== selectedBoardId) {
      setSelectedBoardId(preferredBoardId);
    }
  }, [boards, selectedBoardId]);

  useEffect(() => {
    if (selectedBoardId && typeof window !== "undefined") {
      window.localStorage.setItem(KANBAN_LAST_BOARD_STORAGE_KEY, selectedBoardId);
    }
  }, [selectedBoardId]);

  // Fetch stages
  const { data: stages = [], isLoading: stagesLoading } = useQuery<KanbanStage[]>({
    queryKey: ["/api/kanban/stages", selectedBoardId],
    queryFn: async () => {
      const response = await apiRequest("GET", buildKanbanStagesUrl(selectedBoardId || undefined));
      return response.json();
    },
    enabled: !!selectedBoardId,
  });

  const selectedBoard = boards.find((board) => board.id === selectedBoardId) || null;

  const kanbanColumns = useMemo(() => [inboxStage, ...stages], [stages]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setVisibleLimitsByStage({});
  }, [debouncedSearch, stages, selectedBoardId]);

  const getVisibleLimitForStage = (stageId: string) =>
    visibleLimitsByStage[stageId] || KANBAN_PAGE_SIZE;

  const conversationPageQueries = useQueries({
    queries: kanbanColumns.map((stage) => {
      const limit = getVisibleLimitForStage(stage.id);
      return {
        queryKey: ["/api/kanban/conversations/page", selectedBoardId, stage.id, limit, debouncedSearch],
        queryFn: () => fetchKanbanConversationPage(stage.id, limit, debouncedSearch, selectedBoardId),
        enabled: !stagesLoading && !!selectedBoardId,
        placeholderData: (previousData: KanbanConversationPage | undefined) => previousData,
      };
    }),
  });

  const getConversationPageForStage = (stageId: string) => {
    const columnIndex = kanbanColumns.findIndex((stage) => stage.id === stageId);
    const query = conversationPageQueries[columnIndex];
    const data = query?.data;
    return {
      conversations: data?.conversations || [],
      total: data?.total || 0,
      hasMore: data?.hasMore || false,
      isLoading: Boolean(query?.isLoading),
      isLoadingMore: Boolean(query?.isFetching && data),
    };
  };

  const handleLoadMore = (stageId: string) => {
    setVisibleLimitsByStage((current) => ({
      ...current,
      [stageId]: (current[stageId] || KANBAN_PAGE_SIZE) + KANBAN_PAGE_SIZE,
    }));
  };

  const invalidateKanbanConversationQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/kanban/conversations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/kanban/conversations/page"] });
  };

  const getKanbanConversationPageSnapshots = () =>
    queryClient.getQueriesData<KanbanConversationPage>({
      queryKey: ["/api/kanban/conversations/page", selectedBoardId],
    });

  const findConversationInKanbanCache = (snapshots: Array<[QueryKey, KanbanConversationPage | undefined]>, id: string) => {
    for (const [, page] of snapshots) {
      const match = page?.conversations.find((conversation) => conversation.id === id);
      if (match) return match;
    }
    return null;
  };

  const applyOptimisticConversationMove = (conversation: Conversation, targetStageId: string | null) => {
    const targetColumnId = targetStageId || KANBAN_UNASSIGNED_STAGE_ID;
    const updatedConversation: Conversation = {
      ...conversation,
      kanban_board_id: targetStageId ? selectedBoardId : null,
      kanban_stage_id: targetStageId,
    };

    for (const [queryKey, page] of getKanbanConversationPageSnapshots()) {
      if (!page) continue;

      const columnId = String(queryKey[2] || "");
      const existingIndex = page.conversations.findIndex((item) => item.id === conversation.id);
      const withoutMoved = existingIndex >= 0
        ? page.conversations.filter((item) => item.id !== conversation.id)
        : page.conversations;
      const belongsToTargetColumn = columnId === targetColumnId;

      let nextConversations = withoutMoved;
      let nextTotal = Math.max(0, page.total - (existingIndex >= 0 ? 1 : 0));

      if (belongsToTargetColumn) {
        nextConversations = [updatedConversation, ...withoutMoved].slice(0, page.limit);
        nextTotal += 1;
      }

      queryClient.setQueryData<KanbanConversationPage>(queryKey, {
        ...page,
        conversations: nextConversations,
        total: nextTotal,
        hasMore: page.offset + nextConversations.length < nextTotal,
      });
    }
  };

  const openBoardDialog = (board?: KanbanBoard | null) => {
    if (board) {
      setEditingBoard(board);
      setBoardFormName(board.name);
      setBoardFormDescription(board.description || "");
      setBoardMemberIds(board.memberIds || []);
    } else {
      setEditingBoard(null);
      setBoardFormName("");
      setBoardFormDescription("");
      setBoardMemberIds([]);
    }
    setIsBoardDialogOpen(true);
  };

  const closeBoardDialog = () => {
    setIsBoardDialogOpen(false);
    setEditingBoard(null);
    setBoardFormName("");
    setBoardFormDescription("");
    setBoardMemberIds([]);
  };

  // Move conversation mutation
  const moveConversation = useMutation({
    mutationFn: async ({ id, stageId }: { id: string; stageId: string | null }) => {
      return apiRequest("PUT", `/api/kanban/conversations/${id}/move`, {
        stageId,
        boardId: selectedBoardId,
      });
    },
    onMutate: async ({ id, stageId }) => {
      await queryClient.cancelQueries({
        queryKey: ["/api/kanban/conversations/page", selectedBoardId],
      });

      const previousPages = getKanbanConversationPageSnapshots();
      const conversation = findConversationInKanbanCache(previousPages, id);

      if (conversation) {
        applyOptimisticConversationMove(conversation, stageId);
      }

      return { previousPages };
    },
    onSuccess: () => {
      invalidateKanbanConversationQueries();
    },
    onError: (_error, _variables, context) => {
      context?.previousPages?.forEach(([queryKey, page]) => {
        queryClient.setQueryData(queryKey, page);
      });
      toast({ title: "Erro ao mover contato", variant: "destructive" });
    },
  });

  // Update conversation mutation
  const updateConversation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Conversation> }) => {
      return apiRequest("PUT", `/api/kanban/conversations/${id}`, data);
    },
    onSuccess: () => {
      invalidateKanbanConversationQueries();
      setEditingContact(null);
      toast({ title: "Contato atualizado!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar contato", variant: "destructive" });
    },
  });

  const removeConversationFromKanban = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/kanban/conversations/${id}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: ["/api/kanban/conversations/page", selectedBoardId],
      });

      const previousPages = getKanbanConversationPageSnapshots();
      for (const [queryKey, page] of previousPages) {
        if (!page) continue;
        const existingIndex = page.conversations.findIndex((item) => item.id === id);
        if (existingIndex < 0) continue;
        const nextConversations = page.conversations.filter((item) => item.id !== id);
        const nextTotal = Math.max(0, page.total - 1);
        queryClient.setQueryData<KanbanConversationPage>(queryKey, {
          ...page,
          conversations: nextConversations,
          total: nextTotal,
          hasMore: page.offset + nextConversations.length < nextTotal,
        });
      }

      return { previousPages };
    },
    onSuccess: () => {
      invalidateKanbanConversationQueries();
      toast({ title: "Contato removido do Kanban" });
    },
    onError: (_error, _variables, context) => {
      context?.previousPages?.forEach(([queryKey, page]) => {
        queryClient.setQueryData(queryKey, page);
      });
      toast({ title: "Erro ao remover do Kanban", variant: "destructive" });
    },
  });

  // Create stage mutation
  const createStage = useMutation({
    mutationFn: async (data: { name: string; color: string; description?: string }) => {
      return apiRequest("POST", "/api/kanban/stages", { ...data, boardId: selectedBoardId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/stages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/conversations/page"] });
      setIsAddingStage(false);
      setNewStageName("");
      toast({ title: "Etapa criada!" });
    },
    onError: () => {
      toast({ title: "Erro ao criar etapa", variant: "destructive" });
    },
  });

  // Update stage mutation
  const updateStage = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<KanbanStage> }) => {
      return apiRequest("PUT", `/api/kanban/stages/${id}`, { ...data, boardId: selectedBoardId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/stages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/conversations/page"] });
      setEditingStage(null);
      toast({ title: "Etapa atualizada!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar etapa", variant: "destructive" });
    },
  });

  // Delete stage mutation
  const deleteStage = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/kanban/stages/${id}?boardId=${encodeURIComponent(selectedBoardId)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/stages"] });
      invalidateKanbanConversationQueries();
      toast({ title: "Etapa excluída!" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir etapa", variant: "destructive" });
    },
  });

  const createBoard = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/kanban/boards", {
        name: boardFormName.trim(),
        description: boardFormDescription.trim(),
        memberIds: boardMemberIds,
      });
      return response.json();
    },
    onSuccess: (board: KanbanBoard) => {
      queryClient.setQueryData<KanbanBoard[]>(["/api/kanban/boards"], (current = []) => {
        const next = current.filter((item) => item.id !== board.id);
        return [...next, board];
      });
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/boards"] });
      rememberSelectedBoardId(board.id);
      closeBoardDialog();
      toast({ title: "Kanban criado!" });
    },
    onError: () => {
      toast({ title: "Erro ao criar kanban", variant: "destructive" });
    },
  });

  const updateBoard = useMutation({
    mutationFn: async () => {
      if (!editingBoard) {
        throw new Error("Kanban inválido");
      }
      const response = await apiRequest("PUT", `/api/kanban/boards/${editingBoard.id}`, {
        name: boardFormName.trim(),
        description: boardFormDescription.trim(),
        memberIds: boardMemberIds,
      });
      return response.json();
    },
    onSuccess: (board: KanbanBoard) => {
      queryClient.setQueryData<KanbanBoard[]>(["/api/kanban/boards"], (current = []) =>
        current.map((item) => (item.id === board.id ? { ...item, ...board } : item)),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/boards"] });
      if (board?.id) {
        rememberSelectedBoardId(board.id);
      }
      closeBoardDialog();
      toast({ title: "Kanban atualizado!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar kanban", variant: "destructive" });
    },
  });

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (!canDragCards) {
      return;
    }
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, stageId: string | null) => {
    e.preventDefault();
    if (!canDragCards) {
      return;
    }
    if (draggedId) {
      moveConversation.mutate({ id: draggedId, stageId });
    }
    setDraggedId(null);
    setDragOverStageId(null);
  };

  const handleDragEnter = (stageId: string) => {
    setDragOverStageId(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStageId(null);
  };

  const openChat = (conversationId: string) => {
    setLocation(`/conversas/${conversationId}`);
  };

  const isLoading =
    boardsLoading ||
    stagesLoading ||
    conversationPageQueries.some((query) => query.isLoading && !query.data);
  const unassignedPage = getConversationPageForStage(KANBAN_UNASSIGNED_STAGE_ID);

  return (
    <div className="flex-1 flex flex-col h-full bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="px-6 py-4 border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between gap-4 max-w-[1800px] mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {selectedBoard ? selectedBoard.name : "Kanban CRM"}
            </h1>
            <p className="text-sm text-slate-500">
              {selectedBoard?.description || "Gerencie seus leads arrastando entre etapas do funil"}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-64">
              <Select value={selectedBoardId || undefined} onValueChange={rememberSelectedBoardId}>
                <SelectTrigger className="h-9 bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Selecionar kanban..." />
                </SelectTrigger>
                <SelectContent>
                  {boards.map((board) => (
                    <SelectItem key={board.id} value={board.id}>
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contatos..."
                className="pl-9 h-9 bg-slate-50 border-slate-200"
              />
            </div>
            
            {/* Add Stage Button */}
            {canManageStages && (
              <>
                <Button
                  variant="outline"
                  onClick={() => openBoardDialog(selectedBoard)}
                  disabled={!selectedBoardId}
                  className="gap-2"
                >
                  <Settings2 className="w-4 h-4" />
                  Kanban
                </Button>
                <Button
                  onClick={() => openBoardDialog(null)}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  Novo Kanban
                </Button>
                <Button
                  onClick={() => setIsAddingStage(true)}
                  className="gap-2 bg-slate-900 hover:bg-slate-800"
                  disabled={!selectedBoardId}
                >
                  <Plus className="w-4 h-4" />
                  Nova Etapa
                </Button>
              </>
            )}
            <ContextualHelpButton articleId="kanban-overview" title="Como usar o Kanban CRM" description="Organize seus leads em etapas do funil de vendas." />
          </div>
        </div>
      </header>

      {/* Main Kanban Board */}
      <main className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max pb-4">
          {/* Unassigned Column */}
          {(unassignedPage.total > 0 || unassignedPage.isLoading || debouncedSearch) && (
            <StageColumn
              stage={inboxStage}
              conversations={unassignedPage.conversations}
              totalCount={unassignedPage.total}
              onDragStart={handleDragStart}
              onDrop={(e) => handleDrop(e, null)}
              onDragOver={handleDragOver}
              onEditStage={() => {}}
              onDeleteStage={() => {}}
              onEditContact={setEditingContact}
              onRemoveContact={(conversation) => removeConversationFromKanban.mutate(conversation.id)}
              onOpenChat={openChat}
              onLoadMore={handleLoadMore}
              isDragOver={dragOverStageId === KANBAN_UNASSIGNED_STAGE_ID}
              isLoading={unassignedPage.isLoading}
              isLoadingMore={unassignedPage.isLoadingMore}
              hasMore={unassignedPage.hasMore}
              canManageStage={false}
              canEditContact={canEditContactData}
              canDragCards={canDragCards}
              canRemoveContact={canDragCards}
            />
          )}

          {/* Stage Columns */}
          {stages.map((stage) => {
            const page = getConversationPageForStage(stage.id);
            return (
              <div
                key={stage.id}
                onDragEnter={() => handleDragEnter(stage.id)}
                onDragLeave={handleDragLeave}
              >
                <StageColumn
                  stage={stage}
                  conversations={page.conversations}
                  totalCount={page.total}
                  onDragStart={handleDragStart}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onEditStage={setEditingStage}
                  onDeleteStage={(id) => deleteStage.mutate(id)}
                  onEditContact={setEditingContact}
                  onRemoveContact={(conversation) => removeConversationFromKanban.mutate(conversation.id)}
                  onOpenChat={openChat}
                  onLoadMore={handleLoadMore}
                  isDragOver={dragOverStageId === stage.id}
                  isLoading={page.isLoading}
                  isLoadingMore={page.isLoadingMore}
                  hasMore={page.hasMore}
                  canManageStage={canManageStages}
                  canEditContact={canEditContactData}
                  canDragCards={canDragCards}
                  canRemoveContact={canDragCards}
                />
              </div>
            );
          })}

          {/* Add Stage Placeholder */}
          {canManageStages && !isAddingStage && (
            <button
              onClick={() => setIsAddingStage(true)}
              className="flex flex-col items-center justify-center w-[300px] h-40 rounded-2xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all duration-200 flex-shrink-0"
            >
              <Plus className="w-8 h-8 mb-2" />
              <span className="font-medium">Adicionar Etapa</span>
            </button>
          )}
        </div>
      </main>

      <Dialog open={isBoardDialogOpen} onOpenChange={(open) => (!open ? closeBoardDialog() : setIsBoardDialogOpen(true))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              {editingBoard ? "Editar Kanban" : "Novo Kanban"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Nome do Kanban
              </label>
              <Input
                value={boardFormName}
                onChange={(e) => setBoardFormName(e.target.value)}
                placeholder="Ex: Logística, Vendas B2B, Pós-venda"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Descrição
              </label>
              <Textarea
                value={boardFormDescription}
                onChange={(e) => setBoardFormDescription(e.target.value)}
                placeholder="Explique quando este kanban deve ser usado"
                rows={3}
              />
            </div>

            {canManageStages && teamMembers.length > 0 && editingBoard?.kind !== "personal" && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Membros com acesso
                </label>
                <div className="max-h-56 space-y-2 overflow-auto rounded-xl border border-slate-200 p-3">
                  {teamMembers.map((member) => {
                    const checked = boardMemberIds.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-800">{member.name}</p>
                          <p className="text-xs text-slate-500">{member.email}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setBoardMemberIds((current) =>
                              e.target.checked
                                ? Array.from(new Set([...current, member.id]))
                                : current.filter((id) => id !== member.id),
                            );
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeBoardDialog}>
              Cancelar
            </Button>
            <Button
              onClick={() => (editingBoard ? updateBoard.mutate() : createBoard.mutate())}
              disabled={!boardFormName.trim() || createBoard.isPending || updateBoard.isPending}
            >
              {createBoard.isPending || updateBoard.isPending
                ? "Salvando..."
                : editingBoard
                  ? "Salvar Kanban"
                  : "Criar Kanban"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500">Carregando...</p>
          </div>
        </div>
      )}

      {/* Edit Contact Dialog */}
      <Dialog open={canEditContactData && !!editingContact} onOpenChange={() => setEditingContact(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Editar Contato
            </DialogTitle>
          </DialogHeader>
          
          {editingContact && (
            <div className="space-y-4">
              {/* Contact Info Display */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={editingContact.contact_avatar || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                    {(editingContact.contact_name || "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {getConversationDisplayName(buildConversationIdentity(editingContact))}
                  </p>
                  {getConversationDisplayNumber(buildConversationIdentity(editingContact)) ? (
                    <p className="text-sm text-slate-500">
                      {getConversationDisplayNumber(buildConversationIdentity(editingContact))}
                    </p>
                  ) : null}
                </div>
              </div>
              
              {/* Name Input */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Nome do Contato
                </label>
                <Input
                  value={editingContact.contact_name || ""}
                  onChange={(e) =>
                    setEditingContact({ ...editingContact, contact_name: e.target.value })
                  }
                  placeholder="Nome do contato"
                />
              </div>

              {/* Priority Select */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Prioridade
                </label>
                <Select
                  value={editingContact.priority || "normal"}
                  onValueChange={(value) =>
                    setEditingContact({ ...editingContact, priority: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorities).map(([key, { label, dot }]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", dot)} />
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Notas Internas
                </label>
                <Textarea
                  value={editingContact.kanban_notes || ""}
                  onChange={(e) =>
                    setEditingContact({ ...editingContact, kanban_notes: e.target.value })
                  }
                  placeholder="Adicione notas sobre este lead..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingContact(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editingContact) {
                  updateConversation.mutate({
                    id: editingContact.id,
                    data: {
                      contact_name: editingContact.contact_name,
                      priority: editingContact.priority,
                      kanban_notes: editingContact.kanban_notes,
                    },
                  });
                }
              }}
              disabled={updateConversation.isPending}
            >
              {updateConversation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Stage Dialog */}
      <Dialog open={!!editingStage} onOpenChange={() => setEditingStage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              Editar Etapa
            </DialogTitle>
          </DialogHeader>
          
          {editingStage && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Nome da Etapa
                </label>
                <Input
                  value={editingStage.name}
                  onChange={(e) =>
                    setEditingStage({ ...editingStage, name: e.target.value })
                  }
                  placeholder="Ex: Em Negociação"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Descrição (opcional)
                </label>
                <Input
                  value={editingStage.description}
                  onChange={(e) =>
                    setEditingStage({ ...editingStage, description: e.target.value })
                  }
                  placeholder="Leads em fase de proposta"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Cor
                </label>
                <div className="flex gap-2 flex-wrap">
                  {stageColors.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setEditingStage({ ...editingStage, color: value })}
                      className={cn(
                        "w-8 h-8 rounded-full transition-all",
                        value,
                        editingStage.color === value
                          ? "ring-2 ring-offset-2 ring-slate-800 scale-110"
                          : "hover:scale-105"
                      )}
                      title={label}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingStage(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editingStage) {
                  updateStage.mutate({
                    id: editingStage.id,
                    data: {
                      name: editingStage.name,
                      description: editingStage.description,
                      color: editingStage.color,
                    },
                  });
                }
              }}
              disabled={updateStage.isPending}
            >
              {updateStage.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Stage Dialog */}
      <Dialog open={isAddingStage} onOpenChange={setIsAddingStage}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Nova Etapa
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Nome da Etapa
              </label>
              <Input
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Ex: Prospectando"
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Cor
              </label>
              <div className="flex gap-2 flex-wrap">
                {stageColors.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setNewStageColor(value)}
                    className={cn(
                      "w-8 h-8 rounded-full transition-all",
                      value,
                      newStageColor === value
                        ? "ring-2 ring-offset-2 ring-slate-800 scale-110"
                        : "hover:scale-105"
                    )}
                    title={label}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAddingStage(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (newStageName.trim()) {
                  createStage.mutate({ name: newStageName.trim(), color: newStageColor });
                }
              }}
              disabled={!newStageName.trim() || createStage.isPending}
            >
              {createStage.isPending ? "Criando..." : "Criar Etapa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
