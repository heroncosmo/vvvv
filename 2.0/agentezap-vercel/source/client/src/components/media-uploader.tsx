import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { 
  Paperclip, 
  Image, 
  Video, 
  FileText, 
  X, 
  Upload,
  File
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MediaType = "image" | "video" | "document" | "audio";

interface MediaFile {
  file: File;
  type: MediaType;
  preview?: string;
}

interface MediaUploaderProps {
  onFileSelect: (file: File, type: MediaType) => void;
  disabled?: boolean;
  className?: string;
  maxSizeMB?: number;
}

const ACCEPTED_TYPES: Record<MediaType, string[]> = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
  ],
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/webm"],
};

export function MediaUploader({
  onFileSelect,
  disabled = false,
  className,
  maxSizeMB = 16,
}: MediaUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentTypeRef = useRef<MediaType>("image");

  const getAcceptString = (type: MediaType) => {
    return ACCEPTED_TYPES[type].join(",");
  };

  const detectMediaType = (file: File): MediaType | null => {
    for (const [type, mimeTypes] of Object.entries(ACCEPTED_TYPES)) {
      if (mimeTypes.includes(file.type)) {
        return type as MediaType;
      }
    }
    return null;
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Verificar tamanho
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      setError(`Arquivo muito grande. Máximo: ${maxSizeMB}MB`);
      return;
    }

    // Detectar tipo
    const type = detectMediaType(file);
    if (!type) {
      setError("Tipo de arquivo não suportado");
      return;
    }

    // Criar preview para imagens
    let preview: string | undefined;
    if (type === "image") {
      preview = URL.createObjectURL(file);
    }

    setSelectedFile({ file, type, preview });
  }, [maxSizeMB]);

  const openFilePicker = (type: MediaType) => {
    currentTypeRef.current = type;
    if (fileInputRef.current) {
      fileInputRef.current.accept = getAcceptString(type);
      fileInputRef.current.click();
    }
    setIsOpen(false);
  };

  const handleSend = () => {
    if (selectedFile) {
      onFileSelect(selectedFile.file, selectedFile.type);
      clearSelection();
    }
  };

  const clearSelection = () => {
    if (selectedFile?.preview) {
      URL.revokeObjectURL(selectedFile.preview);
    }
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getTypeIcon = (type: MediaType) => {
    switch (type) {
      case "image": return <Image className="w-5 h-5" />;
      case "video": return <Video className="w-5 h-5" />;
      case "document": return <FileText className="w-5 h-5" />;
      case "audio": return <File className="w-5 h-5" />;
    }
  };

  // Se tem arquivo selecionado, mostrar preview
  if (selectedFile) {
    return (
      <div className={cn(
        "flex items-center gap-2 bg-muted rounded-lg p-2",
        className
      )}>
        {/* Preview */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedFile.type === "image" && selectedFile.preview ? (
            <img 
              src={selectedFile.preview} 
              alt="Preview" 
              className="w-10 h-10 rounded object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
              {getTypeIcon(selectedFile.type)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {selectedFile.file.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(selectedFile.file.size)}
            </p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clearSelection}
            className="h-8 w-8 text-muted-foreground hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            className="h-8 w-8"
          >
            <Upload className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {error && (
        <div className="absolute bottom-full mb-2 left-0 right-0 bg-red-100 text-red-700 text-xs p-2 rounded">
          {error}
        </div>
      )}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="text-muted-foreground hover:text-primary hover:bg-primary/10 touch-manipulation"
          >
            <Paperclip className="w-5 h-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          side="top" 
          align="start" 
          className="w-56 p-2"
        >
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              className="flex flex-col items-center gap-1 h-auto py-3"
              onClick={() => openFilePicker("image")}
            >
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Image className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs">Imagem</span>
            </Button>
            
            <Button
              variant="ghost"
              className="flex flex-col items-center gap-1 h-auto py-3"
              onClick={() => openFilePicker("video")}
            >
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Video className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-xs">Vídeo</span>
            </Button>
            
            <Button
              variant="ghost"
              className="flex flex-col items-center gap-1 h-auto py-3"
              onClick={() => openFilePicker("document")}
            >
              <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <FileText className="w-5 h-5 text-orange-600" />
              </div>
              <span className="text-xs">Documento</span>
            </Button>
            
            <Button
              variant="ghost"
              className="flex flex-col items-center gap-1 h-auto py-3"
              onClick={() => openFilePicker("audio")}
            >
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <File className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-xs">Áudio</span>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
