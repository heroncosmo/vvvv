import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Save, Maximize2, Minimize2, Loader2, Sparkles, Wand2 } from "lucide-react";

interface ExpandedEditorProps {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  isSaving?: boolean;
  title?: string;
  placeholder?: string;
  onImproveClick?: () => void;
}

export function ExpandedEditor({
  isOpen,
  onClose,
  value,
  onChange,
  onSave,
  isSaving = false,
  title = "Editor de Prompt",
  placeholder = "Digite seu prompt aqui...",
  onImproveClick
}: ExpandedEditorProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value, isOpen]);

  const handleSave = () => {
    onChange(localValue);
    onSave();
  };

  const handleClose = () => {
    onChange(localValue);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] max-h-[95vh] p-0 gap-0 flex flex-col">
        {/* Header fixo */}
        <DialogHeader className="px-4 py-3 border-b bg-background flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <DialogTitle className="text-base md:text-lg">{title}</DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden md:inline">
                {localValue.length} caracteres
              </span>
              {onImproveClick && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onChange(localValue);
                    onImproveClick();
                  }}
                  className="gap-1.5"
                >
                  <Wand2 className="w-4 h-4" />
                  <span className="hidden md:inline">Melhorar com IA</span>
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="gap-1"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span className="hidden md:inline">Salvar</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        {/* Editor área principal */}
        <div className="flex-1 p-4 overflow-hidden">
          <Textarea
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            placeholder={placeholder}
            className="w-full h-full resize-none text-sm md:text-base leading-relaxed font-mono bg-muted/30 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            style={{ minHeight: "100%" }}
          />
        </div>
        
        {/* Footer mobile */}
        <div className="md:hidden px-4 py-3 border-t bg-background flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {localValue.length} caracteres
          </span>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Salvar Alterações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Botão para abrir o editor expandido
interface ExpandButtonProps {
  onClick: () => void;
  className?: string;
}

export function ExpandButton({ onClick, className = "" }: ExpandButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={`gap-1.5 ${className}`}
    >
      <Maximize2 className="w-3.5 h-3.5" />
      <span className="hidden md:inline">Expandir</span>
    </Button>
  );
}
