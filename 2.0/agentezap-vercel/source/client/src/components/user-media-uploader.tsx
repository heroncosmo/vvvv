import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Paperclip, Image, FileVideo, FileText, Music, X, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserMediaUploaderProps {
  onUpload: (file: File, type: "image" | "video" | "document" | "audio", caption?: string) => void;
  disabled?: boolean;
}

type MediaType = "image" | "video" | "document" | "audio";

interface SelectedFile {
  file: File;
  type: MediaType;
  preview?: string;
}

export function UserMediaUploader({ onUpload, disabled }: UserMediaUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [caption, setCaption] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentType, setCurrentType] = useState<MediaType>("image");

  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );

  const mediaTypes: { type: MediaType; label: string; icon: typeof Image; accept: string; color: string }[] = [
    { type: "image", label: "Fotos", icon: Image, accept: "image/*", color: "text-blue-500" },
    { type: "video", label: "Vídeos", icon: FileVideo, accept: "video/*", color: "text-purple-500" },
    { type: "document", label: "Documentos", icon: FileText, accept: ".pdf,.doc,.docx,.xls,.xlsx,.txt", color: "text-orange-500" },
    { type: "audio", label: "Áudio", icon: Music, accept: "audio/*", color: "text-green-500" },
  ];

  const handleTypeSelect = (type: MediaType) => {
    setCurrentType(type);
    const mediaType = mediaTypes.find(m => m.type === type);
    if (fileInputRef.current && mediaType) {
      fileInputRef.current.accept = mediaType.accept;
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limites de tamanho por tipo
    const MAX_VIDEO_MB = 16;
    const MAX_IMAGE_MB = 16;
    const MAX_DOCUMENT_MB = 100;
    const fileSizeMB = file.size / (1024 * 1024);

    if (currentType === "video" && fileSizeMB > MAX_VIDEO_MB) {
      alert(`Vídeo muito grande (${fileSizeMB.toFixed(1)}MB). O limite para WhatsApp é ${MAX_VIDEO_MB}MB. Tente um vídeo menor ou comprimido.`);
      return;
    }

    if (currentType === "image" && fileSizeMB > MAX_IMAGE_MB) {
      alert(`Imagem muito grande (${fileSizeMB.toFixed(1)}MB). O limite é ${MAX_IMAGE_MB}MB.`);
      return;
    }

    if (fileSizeMB > MAX_DOCUMENT_MB) {
      alert(`Arquivo muito grande (${fileSizeMB.toFixed(1)}MB). O limite é ${MAX_DOCUMENT_MB}MB.`);
      return;
    }

    let preview: string | undefined;
    if (currentType === "image" || currentType === "video") {
      preview = URL.createObjectURL(file);
    }

    setSelectedFile({ file, type: currentType, preview });
    setIsOpen(false);
  };

  const handleSend = () => {
    if (selectedFile) {
      onUpload(selectedFile.file, selectedFile.type, caption || undefined);
      handleCancel();
    }
  };

  const handleCancel = () => {
    if (selectedFile?.preview) {
      URL.revokeObjectURL(selectedFile.preview);
    }
    setSelectedFile(null);
    setCaption("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Se tem arquivo selecionado, mostra preview
  if (selectedFile) {
    return (
      <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 border w-full">
        {/* Preview */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedFile.type === "image" && selectedFile.preview && (
            <img 
              src={selectedFile.preview} 
              alt="Preview" 
              className="w-12 h-12 object-cover rounded"
            />
          )}
          {selectedFile.type === "video" && selectedFile.preview && (
            <video 
              src={selectedFile.preview} 
              className="w-12 h-12 object-cover rounded"
            />
          )}
          {selectedFile.type === "document" && (
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded flex items-center justify-center">
              <FileText className="w-6 h-6 text-orange-500" />
            </div>
          )}
          {selectedFile.type === "audio" && (
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded flex items-center justify-center">
              <Music className="w-6 h-6 text-green-500" />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selectedFile.file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            className="h-8 w-8 text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
          <Button
            variant="default"
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
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
      
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            className={cn(
              "text-muted-foreground hover:text-primary touch-manipulation",
              isMobile && "h-11 w-11"
            )}
            title="Anexar arquivo"
          >
            <Paperclip className={cn("w-5 h-5", isMobile && "w-6 h-6")} />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-56 p-2" 
          side="top"
          align="start"
        >
          <div className="grid gap-1">
            {mediaTypes.map(({ type, label, icon: Icon, color }) => (
              <Button
                key={type}
                variant="ghost"
                className="justify-start gap-3 h-11"
                onClick={() => handleTypeSelect(type)}
              >
                <Icon className={cn("w-5 h-5", color)} />
                <span>{label}</span>
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
