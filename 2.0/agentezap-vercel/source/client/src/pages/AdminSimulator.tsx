import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Trash2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  model?: string;
  timeMs?: number;
}

const AVAILABLE_MODELS = [
  // Z.AI Models
  { value: "glm-4.6", label: "Z.AI GLM-4.6 - Mais Recente 🌟", speed: "Médio" },
  { value: "glm-4.5", label: "Z.AI GLM-4.5 - Alta Performance 🧠", speed: "Médio" },
  { value: "glm-4.5-air", label: "Z.AI GLM-4.5 Air - Custo/Benefício", speed: "Rápido" },
  { value: "glm-4.5-x", label: "Z.AI GLM-4.5 X - Versátil", speed: "Rápido" },
  { value: "glm-4.5-airx", label: "Z.AI GLM-4.5 AirX - Leve e Rápido", speed: "Muito Rápido" },
  { value: "glm-4.5-flash", label: "Z.AI GLM-4.5 Flash - Ultra Rápido ⚡", speed: "Instantâneo" },
  { value: "glm-4-32b-0414-128k", label: "Z.AI GLM-4 32B - Contexto Longo 📚", speed: "Médio" },

  // Z.AI Legacy (podem funcionar dependendo do seu plano/chave)
  { value: "glm-4-flash", label: "Z.AI GLM-4 Flash (Legacy)", speed: "Instantâneo" },
  { value: "glm-4-air", label: "Z.AI GLM-4 Air (Legacy)", speed: "Muito Rápido" },
  { value: "glm-4-plus", label: "Z.AI GLM-4 Plus (Legacy)", speed: "Médio" },
  { value: "glm-4-0520", label: "Z.AI GLM-4 (0520) (Legacy)", speed: "Rápido" },
  
  // Mistral Models
  { value: "mistral-large-latest", label: "Mistral Large (9.9s) - Mais Inteligente 🧠", speed: "Lento" },
  { value: "mistral-medium-latest", label: "Mistral Medium (6.1s)", speed: "Médio" },
  { value: "mistral-small-latest", label: "Mistral Small (3.1s) - Atual", speed: "Rápido" },
  { value: "ministral-8b-latest", label: "Ministral 8B (2.8s)", speed: "Rápido" },
  { value: "ministral-3b-latest", label: "Ministral 3B (1.5s) - Mais Rápido ⚡", speed: "Muito Rápido" },
  { value: "open-mistral-7b", label: "Open Mistral 7B (2.5s)", speed: "Rápido" },
  { value: "open-mixtral-8x7b", label: "Open Mixtral 8x7B (3.8s)", speed: "Médio" },
  { value: "open-mixtral-8x22b", label: "Open Mixtral 8x22B (2.0s)", speed: "Rápido" },
  { value: "codestral-latest", label: "Codestral (2.0s) - Focado em Código", speed: "Rápido" },
  { value: "pixtral-12b-2409", label: "Pixtral 12B (5.9s) - Multimodal 🖼️", speed: "Médio" },
];

export default function AdminSimulator() {
  const [selectedModel, setSelectedModel] = useState("mistral-medium-latest");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    const startTime = Date.now();

    try {
      const response = await fetch("/api/admin/test-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          model: selectedModel,
          message: inputMessage,
          history: messages.slice(-10), // Últimas 10 mensagens para contexto
        }),
      });

      if (!response.ok) throw new Error("Erro ao enviar mensagem");

      const data = await response.json();
      const timeMs = Date.now() - startTime;

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        model: selectedModel,
        timeMs,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Erro:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "❌ Erro ao obter resposta. Tente novamente.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>🤖 Simulador de Modelos Mistral - Rodrigo (Vendas)</span>
            <Button variant="outline" size="sm" onClick={handleClearChat}>
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Seletor de Modelo */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Modelo de IA:</label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_MODELS.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    <div className="flex items-center justify-between w-full">
                      <span>{model.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {model.speed}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Teste diferentes modelos para ver qual gera as melhores respostas de vendas
            </p>
          </div>

          {/* Área de Chat */}
          <Card className="bg-muted/30">
            <ScrollArea className="h-[500px] p-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center space-y-2">
                    <p className="text-lg">👋 Converse com o Rodrigo</p>
                    <p className="text-sm">
                      Teste diferentes modelos e veja como respondem
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-card border"
                        }`}
                      >
                        <div className="text-sm whitespace-pre-wrap">
                          {msg.content}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs opacity-60">
                          <span>
                            {msg.timestamp.toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {msg.model && (
                            <>
                              <span>•</span>
                              <span>{msg.model}</span>
                            </>
                          )}
                          {msg.timeMs && (
                            <>
                              <span>•</span>
                              <span>{(msg.timeMs / 1000).toFixed(1)}s</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-card border rounded-lg p-3">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </Card>

          {/* Input de Mensagem */}
          <div className="flex gap-2">
            <Input
              placeholder="Digite sua mensagem..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
            <Button
              onClick={handleSendMessage}
              disabled={isLoading || !inputMessage.trim()}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Estatísticas */}
          {messages.length > 0 && (
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-2xl font-bold">{messages.length}</p>
                <p className="text-xs text-muted-foreground">Mensagens</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {messages.filter((m) => m.role === "assistant").length}
                </p>
                <p className="text-xs text-muted-foreground">Respostas IA</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {messages
                    .filter((m) => m.timeMs)
                    .reduce((acc, m) => acc + (m.timeMs || 0), 0) /
                    1000 || 0}
                  s
                </p>
                <p className="text-xs text-muted-foreground">Tempo Total</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
