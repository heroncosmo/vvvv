import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Sparkles, 
  Loader2, 
  Copy, 
  Check,
  RefreshCw,
  X
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface AIMessageGeneratorProps {
  onGenerate: (message: string) => void;
  context?: {
    contactName?: string;
    lastMessages?: string[];
  };
  disabled?: boolean;
  className?: string;
}

const QUICK_PROMPTS = [
  { label: "Saudação", prompt: "Uma saudação profissional e amigável" },
  { label: "Despedida", prompt: "Uma mensagem de despedida cordial" },
  { label: "Confirmação", prompt: "Confirmar o recebimento de uma solicitação" },
  { label: "Aguardar", prompt: "Pedir para o cliente aguardar um momento" },
  { label: "Agradecimento", prompt: "Agradecer pelo contato" },
  { label: "Explicação", prompt: "Explicar que preciso de mais informações" },
];

export function AIMessageGenerator({ 
  onGenerate, 
  context,
  disabled = false, 
  className 
}: AIMessageGeneratorProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (customPrompt?: string) => {
    const promptToUse = customPrompt || prompt;
    if (!promptToUse.trim()) {
      toast({
        title: "Digite uma instrução",
        description: "Descreva que tipo de mensagem você quer gerar.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedMessage("");

    try {
      const res = await apiRequest("POST", "/api/admin/ai/generate-message", {
        prompt: promptToUse,
        context: context,
      });
      const response = await res.json();

      const nextMessage = response.generatedMessage || response.message;
      if (nextMessage) {
        setGeneratedMessage(nextMessage);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao gerar mensagem",
        description: error.message || "Falha ao conectar com a IA",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseMessage = () => {
    if (generatedMessage) {
      onGenerate(generatedMessage);
      setIsOpen(false);
      resetState();
    }
  };

  const handleCopy = async () => {
    if (generatedMessage) {
      await navigator.clipboard.writeText(generatedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetState = () => {
    setPrompt("");
    setGeneratedMessage("");
  };

  return (
    <Popover open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetState();
    }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className={cn(
            "text-muted-foreground hover:text-primary hover:bg-primary/10 touch-manipulation",
            className
          )}
          title="Gerar mensagem com IA"
        >
          <Sparkles className="w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        side="top" 
        align="end" 
        className="w-80 p-0"
      >
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Gerar com IA
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-3 space-y-3">
          {/* Quick prompts */}
          {!generatedMessage && (
            <div className="flex flex-wrap gap-1">
              {QUICK_PROMPTS.map((item) => (
                <Button
                  key={item.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleGenerate(item.prompt)}
                  disabled={isGenerating}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          )}

          {/* Custom prompt input */}
          {!generatedMessage && (
            <div className="space-y-2">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ou descreva o que você quer..."
                className="min-h-[60px] text-sm resize-none"
                disabled={isGenerating}
              />
              <Button
                type="button"
                onClick={() => handleGenerate()}
                disabled={isGenerating || !prompt.trim()}
                className="w-full"
                size="sm"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Gerar Mensagem
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Loading state */}
          {isGenerating && (
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Gerando mensagem...</span>
              </div>
            </div>
          )}

          {/* Generated message */}
          {generatedMessage && !isGenerating && (
            <div className="space-y-3">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-sm whitespace-pre-wrap">{generatedMessage}</p>
              </div>
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleGenerate(prompt)}
                  disabled={isGenerating}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
              
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={handleUseMessage}
              >
                Usar esta mensagem
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
