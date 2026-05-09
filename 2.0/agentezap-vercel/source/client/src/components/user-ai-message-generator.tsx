import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sparkles, Loader2, Send, Wand2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface UserAIMessageGeneratorProps {
  onGenerate: (message: string) => void;
  contactName?: string;
  lastMessages?: string[];
  disabled?: boolean;
}

export function UserAIMessageGenerator({ 
  onGenerate, 
  contactName,
  lastMessages = [],
  disabled 
}: UserAIMessageGeneratorProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [generatedMessage, setGeneratedMessage] = useState("");

  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );

  const quickPrompts = [
    { label: "Saudação", prompt: "Gere uma saudação amigável e profissional" },
    { label: "Acompanhamento", prompt: "Gere uma mensagem de follow-up consultivo" },
    { label: "Proposta", prompt: "Gere uma mensagem apresentando uma proposta comercial" },
    { label: "Agradecimento", prompt: "Gere uma mensagem de agradecimento profissional" },
    { label: "Dúvida", prompt: "Gere uma mensagem perguntando se o cliente tem dúvidas" },
  ];

  const generateMessage = async (prompt: string) => {
    setIsGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/user/ai/generate-message", {
        prompt,
        contactName,
        context: lastMessages.slice(-5),
      });
      const data = await res.json();
      setGeneratedMessage(data.generatedMessage || data.message || "");
    } catch (error) {
      toast({ 
        title: "Erro ao gerar mensagem", 
        description: "Tente novamente",
        variant: "destructive" 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    generateMessage(prompt);
  };

  const handleCustomGenerate = () => {
    if (!customPrompt.trim()) {
      toast({ title: "Digite uma instrução", variant: "destructive" });
      return;
    }
    generateMessage(customPrompt);
  };

  const handleUseMessage = () => {
    if (generatedMessage) {
      onGenerate(generatedMessage);
      setIsOpen(false);
      setGeneratedMessage("");
      setCustomPrompt("");
    }
  };

  const handleRegenerate = () => {
    if (customPrompt.trim()) {
      generateMessage(customPrompt);
    }
  };

  return (
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
          title="Gerar mensagem com IA"
        >
          <Sparkles className={cn("w-5 h-5", isMobile && "w-6 h-6")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-3" 
        side="top"
        align="start"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            <h4 className="font-semibold text-sm">Gerar com IA</h4>
          </div>

          {/* Prompts rápidos */}
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map(({ label, prompt }) => (
              <Button
                key={label}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleQuickPrompt(prompt)}
                disabled={isGenerating}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* Input customizado */}
          <div className="space-y-2">
            <Textarea
              placeholder="Ou descreva o que deseja..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
            <Button
              size="sm"
              className="w-full h-8"
              onClick={handleCustomGenerate}
              disabled={isGenerating || !customPrompt.trim()}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 mr-2" />
                  Gerar
                </>
              )}
            </Button>
          </div>

          {/* Mensagem gerada */}
          {generatedMessage && (
            <div className="space-y-2 pt-2 border-t">
              <div className="bg-muted/50 rounded-lg p-2">
                <p className="text-sm whitespace-pre-wrap">{generatedMessage}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8"
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                >
                  <RefreshCw className={cn("w-3 h-3 mr-1", isGenerating && "animate-spin")} />
                  Regenerar
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-8"
                  onClick={handleUseMessage}
                >
                  <Send className="w-3 h-3 mr-1" />
                  Usar
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
