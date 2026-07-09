import { useState } from "react";
import { FileText, Download, ExternalLink, FileSpreadsheet, FileImage, FileArchive, File } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MessageDocumentProps {
  src: string;
  fileName?: string;
  mimeType?: string;
  caption?: string | null;
  fromMe?: boolean;
}

// Mapear tipos MIME para ícones e cores
function getDocumentInfo(mimeType?: string, fileName?: string): { 
  icon: typeof FileText; 
  color: string; 
  bgColor: string;
  label: string;
} {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  
  // PDF
  if (mimeType?.includes('pdf') || ext === 'pdf') {
    return { icon: FileText, color: 'text-red-500', bgColor: 'bg-red-100', label: 'PDF' };
  }
  
  // Excel/Spreadsheets
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || 
      ['xlsx', 'xls', 'csv'].includes(ext || '')) {
    return { icon: FileSpreadsheet, color: 'text-green-600', bgColor: 'bg-green-100', label: 'Excel' };
  }
  
  // Word/Documents
  if (mimeType?.includes('word') || mimeType?.includes('document') ||
      ['doc', 'docx', 'odt'].includes(ext || '')) {
    return { icon: FileText, color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Word' };
  }
  
  // Images (should use MessageImage, but fallback)
  if (mimeType?.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
    return { icon: FileImage, color: 'text-purple-500', bgColor: 'bg-purple-100', label: 'Imagem' };
  }
  
  // Archives
  if (mimeType?.includes('zip') || mimeType?.includes('rar') || mimeType?.includes('compressed') ||
      ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
    return { icon: FileArchive, color: 'text-yellow-600', bgColor: 'bg-yellow-100', label: 'Arquivo' };
  }
  
  // PowerPoint
  if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint') ||
      ['ppt', 'pptx', 'odp'].includes(ext || '')) {
    return { icon: FileText, color: 'text-orange-500', bgColor: 'bg-orange-100', label: 'PowerPoint' };
  }
  
  // Default
  return { icon: File, color: 'text-gray-500', bgColor: 'bg-gray-100', label: 'Documento' };
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageDocument({ 
  src, 
  fileName = "Documento", 
  mimeType,
  caption,
  fromMe = false 
}: MessageDocumentProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const docInfo = getDocumentInfo(mimeType, fileName);
  const IconComponent = docInfo.icon;
  
  // Verificar se é PDF para preview
  const isPdf = mimeType?.includes('pdf') || fileName?.toLowerCase().endsWith('.pdf');
  const canPreview = isPdf && src;

  // Obter extensão do arquivo baseado no MIME type
  const getExtensionFromMimeType = (mime: string): string => {
    const mimeToExt: Record<string, string> = {
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'text/plain': '.txt',
      'text/csv': '.csv',
      'application/zip': '.zip',
      'application/x-rar-compressed': '.rar',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };
    return mimeToExt[mime] || '';
  };

  // Download real usando fetch + blob para forçar download
  const handleDownload = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isDownloading || !src) return;
    
    setIsDownloading(true);
    try {
      const response = await fetch(src);
      const contentType = response.headers.get('Content-Type') || mimeType || 'application/octet-stream';
      const blob = await response.blob();
      
      // Criar blob com o MIME type correto se necessário
      const finalBlob = blob.type === 'text/plain' || !blob.type 
        ? new Blob([blob], { type: contentType })
        : blob;
      
      const url = window.URL.createObjectURL(finalBlob);
      const link = document.createElement("a");
      link.href = url;
      
      // Garantir que o nome do arquivo tem extensão correta
      let downloadName = fileName;
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(downloadName);
      if (!hasExtension) {
        const ext = getExtensionFromMimeType(contentType);
        if (ext) downloadName += ext;
      }
      
      link.download = downloadName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao baixar arquivo:", error);
      // Fallback: abrir em nova aba
      window.open(src, '_blank', 'noopener,noreferrer');
    } finally {
      setIsDownloading(false);
    }
  };

  // Visualizar abre em nova aba (sem sair da página atual)
  const handlePreview = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (canPreview) {
      // Abrir PDF em nova aba ao invés de modal
      window.open(src, '_blank', 'noopener,noreferrer');
    } else {
      // Para outros tipos, abrir em nova aba também
      window.open(src, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      <div 
        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
          fromMe 
            ? "bg-white/10 hover:bg-white/20" 
            : "bg-gray-100 hover:bg-gray-200"
        }`}
        onClick={handlePreview}
      >
        {/* Ícone do tipo de documento */}
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${docInfo.bgColor}`}>
          <IconComponent className={`w-6 h-6 ${docInfo.color}`} />
        </div>

        {/* Info do documento */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${
            fromMe ? "text-white" : "text-gray-900"
          }`}>
            {fileName}
          </p>
          <p className={`text-xs ${
            fromMe ? "text-white/60" : "text-gray-500"
          }`}>
            {docInfo.label}
          </p>
          {caption && (
            <p className={`text-xs mt-1 ${
              fromMe ? "text-white/80" : "text-gray-600"
            }`}>
              {caption}
            </p>
          )}
        </div>

        {/* Botões de ação */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handlePreview(e);
            }}
            className={`h-8 w-8 ${
              fromMe 
                ? "hover:bg-white/20 text-white" 
                : "hover:bg-gray-200"
            }`}
            title="Visualizar em nova aba"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleDownload(e);
            }}
            disabled={isDownloading}
            className={`h-8 w-8 ${
              fromMe 
                ? "hover:bg-white/20 text-white" 
                : "hover:bg-gray-200"
            } ${isDownloading ? "opacity-50" : ""}`}
            title="Baixar arquivo"
          >
            <Download className={`w-4 h-4 ${isDownloading ? "animate-pulse" : ""}`} />
          </Button>
        </div>
      </div>
    </>
  );
}
