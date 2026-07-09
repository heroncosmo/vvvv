import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAuthToken } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Edit2, Upload, Music, Image as ImageIcon, Video, FileText, RefreshCw, Check, GitBranch, MoveUp, MoveDown, AlignLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

// ============================================================
// TIPOS
// ============================================================
interface FlowItem {
  id: string;
  order: number;
  type: "media" | "text";
  // campos de mídia
  storageUrl?: string;
  mediaType?: "audio" | "image" | "video" | "document";
  caption?: string;
  fileName?: string;
  mimeType?: string;
  // campo de texto
  text?: string;
}

interface AgentMedia {
  id: string;
  userId: string;
  name: string;
  mediaType: "audio" | "image" | "video" | "document" | "flow";
  storageUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationSeconds?: number;
  description: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isActive: boolean;
  sendAlone: boolean;
  suppressTextResponse: boolean;
  displayOrder: number;
  wapiMediaId?: string;
  flowItems?: FlowItem[];
  createdAt: string;
  updatedAt: string;
}

interface MediaFormData {
  name: string;
  mediaType: "audio" | "image" | "video" | "document" | "flow";
  storageUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationSeconds?: number;
  description: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isActive: boolean;
  sendAlone: boolean;
  suppressTextResponse: boolean;
  displayOrder: number;
  flowItems?: FlowItem[];
}

const initialFormData: MediaFormData = {
  name: "",
  mediaType: "audio",
  storageUrl: "",
  fileName: "",
  description: "",
  whenToUse: "",
  caption: "",
  transcription: "",
  isActive: true,
  sendAlone: false,
  suppressTextResponse: false,
  displayOrder: 0,
  flowItems: [],
};

const mediaTypeIcons = {
  audio: Music,
  image: ImageIcon,
  video: Video,
  document: FileText,
  flow: GitBranch,
};

const mediaTypeLabels = {
  audio: "Áudio",
  image: "Imagem",
  video: "Vídeo",
  document: "Documento",
  flow: "Fluxo",
};

// ============================================================
// COMPONENTE DE ITEM DE FLUXO (bloco de mídia ou texto)
// ============================================================
interface FlowItemEditorProps {
  item: FlowItem;
  index: number;
  total: number;
  onUpdate: (updated: FlowItem) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUploadFile: (itemId: string, file: File) => Promise<string | null>;
  uploadingItemId: string | null;
}

function FlowItemEditor({
  item,
  index,
  total,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onUploadFile,
  uploadingItemId,
}: FlowItemEditorProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const url = await onUploadFile(item.id, e.target.files[0]);
      if (url) {
        onUpdate({
          ...item,
          storageUrl: url,
          fileName: e.target.files[0].name,
          mimeType: e.target.files[0].type,
        });
      }
    }
    e.target.value = "";
  };

  const isUploading = uploadingItemId === item.id;

  return (
    <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
      {/* Header do item */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-mono">#{index + 1}</Badge>
          <Select
            value={item.type}
            onValueChange={(v) => onUpdate({ ...item, type: v as "media" | "text", storageUrl: undefined, text: undefined })}
          >
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">💬 Texto</SelectItem>
              <SelectItem value="media">📎 Mídia</SelectItem>
            </SelectContent>
          </Select>

          {item.type === "media" && (
            <Select
              value={item.mediaType || "image"}
              onValueChange={(v) => onUpdate({ ...item, mediaType: v as any })}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="audio">🎵 Áudio</SelectItem>
                <SelectItem value="image">🖼️ Imagem</SelectItem>
                <SelectItem value="video">🎬 Vídeo</SelectItem>
                <SelectItem value="document">📄 Documento</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={onMoveUp}>
            <MoveUp className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === total - 1} onClick={onMoveDown}>
            <MoveDown className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Conteúdo do item */}
      {item.type === "text" ? (
        <div>
          <Textarea
            placeholder="Digite o texto desta etapa do fluxo..."
            value={item.text || ""}
            onChange={(e) => onUpdate({ ...item, text: e.target.value })}
            rows={2}
            className="text-sm"
          />
        </div>
      ) : (
        <div className="space-y-2">
          {/* Upload de arquivo para o item */}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={
              item.mediaType === "audio" ? "audio/*" :
              item.mediaType === "image" ? "image/*" :
              item.mediaType === "video" ? "video/*" : "*/*"
            }
            onChange={handleFileSelect}
          />
          <div
            className={`border border-dashed rounded p-3 text-center cursor-pointer hover:border-primary/50 transition-colors text-xs ${isUploading ? "opacity-60 pointer-events-none" : ""}`}
            onClick={() => fileRef.current?.click()}
          >
            {isUploading ? (
              <span className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
              </span>
            ) : item.storageUrl ? (
              <span className="flex items-center justify-center gap-2 text-green-600">
                <Check className="h-4 w-4" />
                {item.fileName || "Arquivo pronto"}
                <span className="text-muted-foreground ml-1">(clique para trocar)</span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                📎 Clique para selecionar {item.mediaType || "mídia"}
              </span>
            )}
          </div>

          {/* Preview de imagem inline */}
          {item.mediaType === "image" && item.storageUrl && (
            <img src={item.storageUrl} alt="preview" className="h-20 rounded object-cover" />
          )}

          {/* Preview de áudio inline */}
          {item.mediaType === "audio" && item.storageUrl && (
            <audio controls className="w-full h-8" src={item.storageUrl} />
          )}

          {/* Legenda (para imagem/vídeo/documento) */}
          {item.mediaType !== "audio" && (
            <Input
              placeholder="Legenda (opcional)"
              value={item.caption || ""}
              onChange={(e) => onUpdate({ ...item, caption: e.target.value })}
              className="text-xs h-8"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function MediaLibrary() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingFlowItemId, setUploadingFlowItemId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaList, setMediaList] = useState<AgentMedia[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<AgentMedia | null>(null);
  const [formData, setFormData] = useState<MediaFormData>(initialFormData);
  const [transcribing, setTranscribing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch media list
  const fetchMediaList = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();
      const response = await fetch("/api/agent/media", {
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        setMediaList(data);
      } else {
        throw new Error("Failed to fetch media");
      }
    } catch (error) {
      console.error("Error fetching media:", error);
      toast({ title: "Erro", description: "Não foi possível carregar a biblioteca de mídias.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchMediaList();
  }, [fetchMediaList]);

  // ---- File upload helpers ----
  const handleFileUpload = (fileParam?: File) => {
    const file = fileParam || selectedFile;
    if (!file) {
      toast({ title: "Nenhum arquivo selecionado", description: "Selecione um arquivo.", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    setFormData(prev => ({ ...prev, fileName: file.name, fileSize: file.size, mimeType: file.type, storageUrl: "" }));
  };

  const uploadSelectedFile = async (): Promise<null | { storageUrl: string; fileName: string; fileSize?: number; mimeType?: string; mediaType?: string }> => {
    if (!selectedFile) return null;
    setUploadingFile(true);
    try {
      const token = await getAuthToken();
      const fd = new FormData();
      fd.append("file", selectedFile);
      const response = await fetch("/api/agent/media/upload", {
        method: "POST",
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
        body: fd,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to upload");
      }
      const data = await response.json();
      if (data.transcription && !formData.transcription) {
        setFormData(prev => ({ ...prev, transcription: data.transcription }));
        toast({ title: "Transcrição", description: "Áudio transcrito automaticamente" });
      }
      setSelectedFile(null);
      return data;
    } finally {
      setUploadingFile(false);
    }
  };

  // Upload de arquivo para um item de fluxo específico
  const uploadFlowItemFile = async (itemId: string, file: File): Promise<string | null> => {
    setUploadingFlowItemId(itemId);
    try {
      const token = await getAuthToken();
      const fd = new FormData();
      fd.append("file", file);
      const response = await fetch("/api/agent/media/upload", {
        method: "POST",
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
        body: fd,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to upload");
      }
      const data = await response.json();
      return data.storageUrl || null;
    } catch (err: any) {
      toast({ title: "Erro ao enviar arquivo", description: err.message, variant: "destructive" });
      return null;
    } finally {
      setUploadingFlowItemId(null);
    }
  };

  // ---- Drag & Drop ----
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
    e.target.value = "";
  };

  // ---- Form helpers ----
  const handleInputChange = (field: keyof MediaFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  const normalizeName = (name: string) => name.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");

  // ---- Flow item helpers ----
  const generateItemId = () => `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const addFlowItem = (type: "media" | "text") => {
    const current = formData.flowItems || [];
    const newItem: FlowItem = {
      id: generateItemId(),
      order: current.length,
      type,
      mediaType: type === "media" ? "image" : undefined,
    };
    setFormData(prev => ({ ...prev, flowItems: [...(prev.flowItems || []), newItem] }));
  };

  const updateFlowItem = (index: number, updated: FlowItem) => {
    const items = [...(formData.flowItems || [])];
    items[index] = updated;
    setFormData(prev => ({ ...prev, flowItems: items }));
  };

  const deleteFlowItem = (index: number) => {
    const items = (formData.flowItems || []).filter((_, i) => i !== index);
    // Reordenar
    setFormData(prev => ({ ...prev, flowItems: items.map((it, i) => ({ ...it, order: i })) }));
  };

  const moveFlowItem = (index: number, direction: "up" | "down") => {
    const items = [...(formData.flowItems || [])];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
    setFormData(prev => ({ ...prev, flowItems: items.map((it, i) => ({ ...it, order: i })) }));
  };

  // ---- Open dialogs ----
  const handleNewMedia = () => {
    setEditingMedia(null);
    setSelectedFile(null);
    setFormData({ ...initialFormData, displayOrder: mediaList.length });
    setIsDialogOpen(true);
  };

  const handleEditMedia = (media: AgentMedia) => {
    setEditingMedia(media);
    setSelectedFile(null);
    setFormData({
      name: media.name,
      mediaType: media.mediaType,
      storageUrl: media.storageUrl || "",
      fileName: media.fileName || "",
      fileSize: media.fileSize,
      mimeType: media.mimeType || "",
      durationSeconds: media.durationSeconds,
      description: media.description,
      whenToUse: media.whenToUse || "",
      caption: media.caption || "",
      transcription: media.transcription || "",
      isActive: media.isActive,
      sendAlone: media.sendAlone || false,
      suppressTextResponse: media.suppressTextResponse || false,
      displayOrder: media.displayOrder,
      flowItems: media.flowItems || [],
    });
    setIsDialogOpen(true);
  };

  // ---- Save ----
  const handleSave = async () => {
    try {
      setSaving(true);

      if (!formData.name.trim()) {
        toast({ title: "Erro", description: "O nome da mídia é obrigatório.", variant: "destructive" });
        return;
      }
      if (!formData.description.trim()) {
        toast({ title: "Erro", description: "A descrição da mídia é obrigatória.", variant: "destructive" });
        return;
      }

      // Validações específicas por tipo
      if (formData.mediaType === "flow") {
        const items = formData.flowItems || [];
        if (items.length < 2) {
          toast({ title: "Erro", description: "Um fluxo precisa ter pelo menos 2 itens.", variant: "destructive" });
          return;
        }
        // Validar que todos os itens estão preenchidos
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type === "text" && !item.text?.trim()) {
            toast({ title: "Erro", description: `Item ${i + 1} é texto mas está vazio.`, variant: "destructive" });
            return;
          }
          if (item.type === "media" && !item.storageUrl) {
            toast({ title: "Erro", description: `Item ${i + 1} é mídia mas não tem arquivo.`, variant: "destructive" });
            return;
          }
        }
      } else {
        // Mídia normal precisa de arquivo
        if (!formData.storageUrl.trim() && !selectedFile) {
          toast({ title: "Erro", description: "Selecione um arquivo para enviar.", variant: "destructive" });
          return;
        }
      }

      // Upload de arquivo pendente (para mídias normais)
      let uploadData: null | { storageUrl: string; fileName: string; fileSize?: number; mimeType?: string; mediaType?: string } = null;
      if (selectedFile && formData.mediaType !== "flow") {
        uploadData = await uploadSelectedFile();
        if (!uploadData) throw new Error("Falha ao enviar o arquivo.");
        setFormData(prev => ({
          ...prev,
          storageUrl: uploadData!.storageUrl,
          fileName: uploadData!.fileName,
          fileSize: uploadData!.fileSize,
          mimeType: uploadData!.mimeType || prev.mimeType,
          mediaType: (uploadData!.mediaType as any) || prev.mediaType,
        }));
      }

      // Para fluxo, storageUrl é vazio
      const finalStorageUrl = formData.mediaType === "flow"
        ? ""
        : (uploadData?.storageUrl || formData.storageUrl);

      const dataToSave: Record<string, any> = {
        ...formData,
        storageUrl: finalStorageUrl,
        fileName: uploadData?.fileName || formData.fileName,
        fileSize: uploadData?.fileSize ?? formData.fileSize,
        mimeType: uploadData?.mimeType || formData.mimeType,
        mediaType: (uploadData?.mediaType as any) || formData.mediaType,
        name: normalizeName(formData.name),
      };

      // Para fluxo, incluir flowItems; para outros tipos, remover
      if (formData.mediaType === "flow") {
        dataToSave.flowItems = (formData.flowItems || []).map((it, i) => ({ ...it, order: i }));
      } else {
        delete dataToSave.flowItems;
      }

      // Limpar undefined/null/""
      const cleanedData = Object.fromEntries(
        Object.entries(dataToSave).filter(([_, v]) => {
          if (v === null || v === undefined) return false;
          if (typeof v === "string" && v === "" && _ !== "storageUrl") return false;
          return true;
        })
      );
      // Garantir storageUrl vazio para fluxo
      if (formData.mediaType === "flow") {
        cleanedData.storageUrl = "";
      }

      console.log("[MediaLibrary] handleSave:", JSON.stringify(cleanedData, null, 2));

      const url = editingMedia ? `/api/agent/media/${editingMedia.id}` : "/api/agent/media";
      const method = editingMedia ? "PUT" : "POST";
      const token = await getAuthToken();

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(cleanedData),
      });

      if (response.ok) {
        toast({
          title: "Sucesso",
          description: editingMedia ? "Mídia atualizada!" : "Mídia adicionada!",
        });
        setIsDialogOpen(false);
        fetchMediaList();
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to save");
      }
    } catch (error: any) {
      console.error("Error saving media:", error);
      toast({ title: "Erro", description: error.message || "Não foi possível salvar.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ---- Delete ----
  const handleDelete = async (media: AgentMedia) => {
    if (!confirm(`Excluir "${media.name}"?`)) return;
    try {
      const token = await getAuthToken();
      const response = await fetch(`/api/agent/media/${media.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
      if (response.ok) {
        toast({ title: "Sucesso", description: "Mídia excluída!" });
        fetchMediaList();
      } else {
        throw new Error("Failed to delete");
      }
    } catch (error) {
      console.error("Error deleting media:", error);
      toast({ title: "Erro", description: "Não foi possível excluir.", variant: "destructive" });
    }
  };

  // ---- Transcribe ----
  const handleTranscribe = async () => {
    if (!formData.storageUrl || formData.mediaType !== "audio") return;
    try {
      setTranscribing(true);
      const token = await getAuthToken();
      const response = await fetch("/api/agent/media/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ audioUrl: formData.storageUrl, mimeType: formData.mimeType || "audio/ogg" }),
      });
      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({ ...prev, transcription: data.transcription, description: prev.description || data.transcription.substring(0, 200) }));
        toast({ title: "Sucesso", description: "Áudio transcrito!" });
      } else {
        throw new Error("Failed to transcribe");
      }
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível transcrever.", variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  };

  // ---- Render card ----
  const renderMediaCard = (media: AgentMedia) => {
    const Icon = mediaTypeIcons[media.mediaType] || FileText;
    const isFlow = media.mediaType === "flow";
    const flowItems = media.flowItems as FlowItem[] | undefined;

    return (
      <Card key={media.id} className={`relative ${!media.isActive ? "opacity-50" : ""}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${isFlow ? "bg-violet-100" : "bg-primary/10"}`}>
                <Icon className={`h-5 w-5 ${isFlow ? "text-violet-600" : "text-primary"}`} />
              </div>
              <div>
                <CardTitle className="text-base font-mono">{media.name}</CardTitle>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant={isFlow ? "default" : "secondary"} className="text-xs">
                    {mediaTypeLabels[media.mediaType] || media.mediaType}
                  </Badge>
                  {isFlow && flowItems && (
                    <Badge variant="outline" className="text-xs">
                      {flowItems.length} itens
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => handleEditMedia(media)}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(media)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">{media.description}</p>
          {media.whenToUse && (
            <p className="text-xs text-muted-foreground italic">📌 Usar quando: {media.whenToUse}</p>
          )}
          {/* Mostrar sequência resumida de fluxo */}
          {isFlow && flowItems && flowItems.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {flowItems.sort((a, b) => a.order - b.order).map((item, idx) => (
                <span
                  key={item.id}
                  className="text-xs px-1.5 py-0.5 rounded bg-muted border text-muted-foreground flex items-center gap-1"
                >
                  {idx + 1}.{" "}
                  {item.type === "text" ? (
                    <><AlignLeft className="h-3 w-3" /> texto</>
                  ) : (
                    <>{item.mediaType === "audio" ? "🎵" : item.mediaType === "image" ? "🖼️" : item.mediaType === "video" ? "🎬" : "📄"} {item.mediaType}</>
                  )}
                </span>
              ))}
            </div>
          )}
          {/* Preview para mídias normais */}
          {media.mediaType === "audio" && media.storageUrl && (
            <div className="mt-3">
              <audio controls className="w-full h-8" src={media.storageUrl} />
            </div>
          )}
          {media.mediaType === "image" && media.storageUrl && (
            <div className="mt-3">
              <img src={media.storageUrl} alt={media.name} className="w-full h-24 object-cover rounded-md" />
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isFlowMode = formData.mediaType === "flow";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Biblioteca de Mídias</h2>
          <p className="text-muted-foreground">
            Adicione áudios, imagens, vídeos e fluxos que o agente pode enviar automaticamente.
          </p>
        </div>
        <Button onClick={handleNewMedia}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Mídia
        </Button>
      </div>

      {/* Empty state */}
      {mediaList.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">Nenhuma mídia cadastrada</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              Adicione áudios, imagens, vídeos ou fluxos de múltiplos itens que o agente pode enviar automaticamente.
            </p>
            <Button onClick={handleNewMedia}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar primeira mídia
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Media grid */}
      {mediaList.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mediaList.map(renderMediaCard)}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMedia ? "Editar Mídia" : "Nova Mídia"}</DialogTitle>
            <DialogDescription>
              Configure a mídia e sua descrição para que o agente saiba quando usá-la.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Mídia (ID)</Label>
              <Input
                id="name"
                placeholder="Ex: AUDIO_PRECO, FLUXO_BOAS_VINDAS"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">Use letras maiúsculas e underscores.</p>
            </div>

            {/* Media Type */}
            <div className="space-y-2">
              <Label>Tipo de Mídia</Label>
              <Select
                value={formData.mediaType}
                onValueChange={(value) => {
                  handleInputChange("mediaType", value);
                  if (value === "flow") {
                    setFormData(prev => ({ ...prev, mediaType: "flow", storageUrl: "", flowItems: prev.flowItems?.length ? prev.flowItems : [] }));
                  } else {
                    setFormData(prev => ({ ...prev, mediaType: value as any }));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audio">🎵 Áudio</SelectItem>
                  <SelectItem value="image">🖼️ Imagem</SelectItem>
                  <SelectItem value="video">🎬 Vídeo</SelectItem>
                  <SelectItem value="document">📄 Documento</SelectItem>
                  <SelectItem value="flow">🔀 Fluxo (sequência de mídias + textos)</SelectItem>
                </SelectContent>
              </Select>
              {isFlowMode && (
                <p className="text-xs text-violet-600 font-medium">
                  🔀 Fluxo: monte uma sequência de múltiplos itens (imagem → texto → áudio → etc). Serão enviados em ordem exata.
                </p>
              )}
            </div>

            {/* ============================================================ */}
            {/* MODO FLUXO: Editor de sequência */}
            {/* ============================================================ */}
            {isFlowMode && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Sequência do Fluxo ({formData.flowItems?.length || 0} itens)</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addFlowItem("text")}
                    >
                      <AlignLeft className="h-3 w-3 mr-1" />
                      + Texto
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addFlowItem("media")}
                    >
                      <ImageIcon className="h-3 w-3 mr-1" />
                      + Mídia
                    </Button>
                  </div>
                </div>

                {(!formData.flowItems || formData.flowItems.length === 0) && (
                  <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                    <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">Fluxo vazio</p>
                    <p className="text-xs">Adicione itens de texto ou mídia usando os botões acima.</p>
                    <p className="text-xs mt-1">Exemplo: imagem → texto → áudio → texto</p>
                  </div>
                )}

                {formData.flowItems && formData.flowItems.length > 0 && (
                  <div className="space-y-2">
                    {formData.flowItems.map((item, idx) => (
                      <FlowItemEditor
                        key={item.id}
                        item={item}
                        index={idx}
                        total={formData.flowItems!.length}
                        onUpdate={(updated) => updateFlowItem(idx, updated)}
                        onDelete={() => deleteFlowItem(idx)}
                        onMoveUp={() => moveFlowItem(idx, "up")}
                        onMoveDown={() => moveFlowItem(idx, "down")}
                        onUploadFile={uploadFlowItemFile}
                        uploadingItemId={uploadingFlowItemId}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ============================================================ */}
            {/* MODO MÍDIA NORMAL: Upload de arquivo */}
            {/* ============================================================ */}
            {!isFlowMode && (
              <div className="space-y-2">
                <Label>Upload de Arquivo</Label>
                <input
                  type="file"
                  id="file-upload"
                  ref={fileInputRef}
                  className="hidden"
                  accept={
                    formData.mediaType === "audio" ? "audio/*,.ogg,.opus,.mp3,.m4a,.wav" :
                    formData.mediaType === "image" ? "image/*,.jpg,.jpeg,.png,.gif,.webp" :
                    formData.mediaType === "video" ? "video/*,.mp4,.webm,.mov" : "*/*"
                  }
                  onChange={handleFileSelect}
                />
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragActive ? "border-primary/70 bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  role="button"
                >
                  {uploadingFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Enviando arquivo...</p>
                    </div>
                  ) : selectedFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB — será enviado ao salvar
                      </p>
                      <Button type="button" size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                        Trocar arquivo
                      </Button>
                    </div>
                  ) : formData.storageUrl ? (
                    <div className="flex flex-col items-center gap-2">
                      <Check className="h-8 w-8 text-green-500" />
                      <p className="text-sm text-green-600 font-medium">Arquivo pronto</p>
                      <Button type="button" size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                        Trocar arquivo
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-medium">Clique ou arraste para selecionar</p>
                      <p className="text-xs text-muted-foreground">
                        {formData.mediaType === "audio" && "Formatos: OGG, OPUS, MP3, M4A, WAV (max 16MB)"}
                        {formData.mediaType === "image" && "Formatos: JPG, PNG, GIF, WEBP (max 5MB)"}
                        {formData.mediaType === "video" && "Formatos: MP4, WEBM, MOV (max 64MB)"}
                        {formData.mediaType === "document" && "Qualquer formato (max 100MB)"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Prévia de imagem (mídia normal) */}
            {!isFlowMode && formData.mediaType === "image" && formData.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg overflow-hidden">
                  <img src={formData.storageUrl} alt="Preview" className="w-full max-h-48 object-contain" />
                </div>
              </div>
            )}

            {/* Prévia de áudio (mídia normal) */}
            {!isFlowMode && formData.mediaType === "audio" && formData.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <audio controls className="w-full" src={formData.storageUrl} />
                <Button type="button" variant="outline" onClick={handleTranscribe} disabled={transcribing}>
                  {transcribing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Transcrever áudio automaticamente
                </Button>
              </div>
            )}

            {/* Transcrição (áudio normal) */}
            {!isFlowMode && formData.mediaType === "audio" && (
              <div className="space-y-2">
                <Label htmlFor="transcription">Transcrição (opcional)</Label>
                <Textarea
                  id="transcription"
                  placeholder="Transcrição do áudio..."
                  value={formData.transcription}
                  onChange={(e) => handleInputChange("transcription", e.target.value)}
                  rows={3}
                />
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição *</Label>
              <Textarea
                id="description"
                placeholder={isFlowMode ? "Ex: Fluxo de boas-vindas com foto + apresentação + áudio" : "Ex: Áudio explicando os preços dos produtos"}
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Descreve o conteúdo para a IA entender quando enviar.</p>
            </div>

            {/* When to Use */}
            <div className="space-y-2">
              <Label htmlFor="whenToUse">Quando usar (opcional)</Label>
              <Textarea
                id="whenToUse"
                placeholder={isFlowMode ? "Ex: Quando o cliente iniciar uma conversa ou pedir informações gerais" : "Ex: Quando o cliente perguntar sobre preços"}
                value={formData.whenToUse}
                onChange={(e) => handleInputChange("whenToUse", e.target.value)}
                rows={2}
              />
            </div>

            {/* Caption (imagem/vídeo normais) */}
            {!isFlowMode && (formData.mediaType === "image" || formData.mediaType === "video") && (
              <div className="space-y-2">
                <Label htmlFor="caption">Legenda da Mídia (opcional)</Label>
                <Textarea
                  id="caption"
                  placeholder="Ex: 📍 Nossa localização! Av. Principal, 123"
                  value={formData.caption}
                  onChange={(e) => handleInputChange("caption", e.target.value)}
                  rows={2}
                />
              </div>
            )}

            {/* Active Switch */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Mídia ativa</Label>
                <p className="text-xs text-muted-foreground">Mídias inativas não aparecem no prompt do agente.</p>
              </div>
              <Switch checked={formData.isActive} onCheckedChange={(c) => handleInputChange("isActive", c)} />
            </div>

            {/* Send Alone Switch */}
            {!isFlowMode && (
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enviar sozinha</Label>
                  <p className="text-xs text-muted-foreground">Se ativado, esta mídia não será combinada com outras.</p>
                </div>
                <Switch checked={formData.sendAlone} onCheckedChange={(c) => handleInputChange("sendAlone", c)} />
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <Label>Sem texto extra fora da mídia</Label>
                <p className="text-xs text-muted-foreground">Se ativado, a IA não envia texto principal fora desta mídia ou fluxo.</p>
              </div>
              <Switch checked={formData.suppressTextResponse} onCheckedChange={(c) => handleInputChange("suppressTextResponse", c)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || uploadingFile || !!uploadingFlowItemId}>
              {(saving || uploadingFile) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingMedia ? "Salvar alterações" : "Adicionar mídia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
