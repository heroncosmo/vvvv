
import { useState, useRef, useEffect } from "react";
import { Send, Image, Loader2, User, Bot, Trash2, ExternalLink, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  text: string;
  fromMe: boolean;
  timestamp: Date;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document';
  testLink?: string | null;
}

export default function AdminChatSimulator() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [phone, setPhone] = useState("5511999999999");
  const [testAgentLink, setTestAgentLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Carregar histórico ao iniciar
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/test/admin-chat/history?phone=${phone}`);
        
        if (res.ok) {
          const data = await res.json();
          if (data.history && Array.isArray(data.history)) {
            const mappedMessages: Message[] = data.history.map((msg: any, index: number) => ({
              id: `hist-${index}-${Date.now()}`,
              text: msg.content,
              fromMe: msg.role === 'user',
              timestamp: new Date(msg.timestamp),
            }));
            setMessages(mappedMessages);
          }
        }
      } catch (error) {
        console.error("Error fetching history:", error);
      }
    };

    fetchHistory();
  }, [phone]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleClearHistory = async () => {
    try {
      const res = await fetch("/api/test/admin-chat/clear", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      
      if (res.ok) {
        setMessages([]);
        setTestAgentLink(null);
        toast({
          title: "Histórico Limpo",
          description: "A conversa foi resetada. Você pode começar novamente como novo cliente.",
        });
      } else {
        throw new Error("Failed to clear history");
      }
    } catch (error) {
      console.error("Error clearing history:", error);
      toast({
        title: "Erro",
        description: "Falha ao limpar histórico.",
        variant: "destructive",
      });
    }
  };

  const copyLink = async () => {
    if (testAgentLink) {
      await navigator.clipboard.writeText(testAgentLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast({
        title: "Link Copiado!",
        description: "O link de teste foi copiado para a área de transferência.",
      });
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: inputText,
      fromMe: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/test/admin-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          message: userMsg.text,
        }),
      });

      const data = await res.json();
      
      // Se não há trigger, mostrar mensagem de sistema
      if (data.noTrigger) {
        const systemMsg: Message = {
          id: Date.now().toString() + "_system",
          text: "⚠️ Mensagem sem gatilho. Envie 'agentezap' para iniciar a conversa com o agente.",
          fromMe: false,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, systemMsg]);
      } else if (data.text) {
        const agentMsg: Message = {
          id: Date.now().toString() + "_agent",
          text: data.text,
          fromMe: false,
          timestamp: new Date(),
          testLink: data.testLink,
        };
        setMessages((prev) => [...prev, agentMsg]);
        
        // Se recebeu um link de teste, guardar para exibir
        if (data.testLink) {
          setTestAgentLink(data.testLink);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Erro",
        description: "Falha ao enviar mensagem.",
        variant: "destructive",
      });
    } finally {
      setIsTyping(false);
    }
  };
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to base64 for preview and sending
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      
      const userMsg: Message = {
        id: Date.now().toString(),
        text: "📷 Imagem enviada",
        fromMe: true,
        timestamp: new Date(),
        mediaUrl: base64,
        mediaType: 'image'
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        const res = await fetch("/api/test/admin-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            message: "Imagem enviada",
            mediaType: "image",
            mediaUrl: base64
          }),
        });

        const data = await res.json();
        
        if (data.text) {
          const agentMsg: Message = {
            id: Date.now().toString() + "_agent",
            text: data.text,
            fromMe: false,
            timestamp: new Date(),
            testLink: data.testLink,
          };
          setMessages((prev) => [...prev, agentMsg]);
          
          if (data.testLink) {
            setTestAgentLink(data.testLink);
          }
        }
      } catch (error) {
        console.error("Error sending image:", error);
        toast({
          title: "Erro",
          description: "Falha ao enviar imagem.",
          variant: "destructive",
        });
      } finally {
        setIsTyping(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 max-w-md mx-auto border-x border-gray-200 shadow-xl">
      {/* Header */}
      <div className="bg-[#008069] text-white p-4 flex items-center gap-3 shadow-sm z-10">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-lg">Rodrigo Admin</h1>
          <p className="text-xs text-white/80">Online • Simulador</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
            <Input 
                className="w-28 h-8 bg-white/10 border-none text-white placeholder:text-white/50 text-xs" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Seu Telefone"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
              onClick={handleClearHistory}
              title="Limpar Histórico"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
        </div>
      </div>

      {/* Test Link Banner */}
      {testAgentLink && (
        <div className="bg-green-50 border-b border-green-200 p-3 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-green-800">Link de Teste Gerado!</p>
            <p className="text-xs text-green-600 truncate">{testAgentLink}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-green-700 hover:bg-green-100"
            onClick={copyLink}
          >
            {copiedLink ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-green-700 hover:bg-green-100"
            onClick={() => window.open(testAgentLink, '_blank')}
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#efeae2] bg-opacity-50" style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')", backgroundBlendMode: "overlay" }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <Bot className="w-16 h-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">Simulador Admin Rodrigo</h3>
            <p className="text-sm text-gray-500 max-w-xs mb-3">
              Envie <strong>"agentezap"</strong> para iniciar a conversa com o agente. 
              O fluxo funciona igual ao WhatsApp real.
            </p>
            <p className="text-xs text-gray-400 max-w-xs">
              Use o botão 🗑️ para limpar o histórico e começar do zero.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex w-full",
              msg.fromMe ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg p-3 shadow-sm relative",
                msg.fromMe ? "bg-[#d9fdd3] rounded-tr-none" : "bg-white rounded-tl-none"
              )}
            >
              {msg.mediaUrl && msg.mediaType === 'image' && (
                <div className="mb-2 rounded-lg overflow-hidden">
                  <img src={msg.mediaUrl} alt="Media" className="w-full h-auto max-h-64 object-cover" />
                </div>
              )}
              
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{msg.text}</p>
              
              {/* Show inline test link if present in message */}
              {msg.testLink && (
                <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                  <p className="text-xs text-green-700 font-medium">🔗 Link de Teste:</p>
                  <a 
                    href={msg.testLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-green-600 underline hover:text-green-800 break-all"
                  >
                    {msg.testLink}
                  </a>
                </div>
              )}
              
              <span className="text-[10px] text-gray-500 block text-right mt-1">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {msg.fromMe && <span className="ml-1 text-blue-500">✓✓</span>}
              </span>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white rounded-lg p-3 rounded-tl-none shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#008069]" />
              <span className="text-xs text-gray-500">Digitando...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-[#f0f2f5] p-3 flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileUpload}
        />
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-500 hover:bg-gray-200 rounded-full"
          onClick={() => fileInputRef.current?.click()}
        >
          <Image className="w-6 h-6" />
        </Button>
        
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
          placeholder="Digite uma mensagem"
          className="flex-1 bg-white border-none focus-visible:ring-0 rounded-lg"
        />
        
        <Button
          onClick={handleSendMessage}
          size="icon"
          className={cn(
            "rounded-full transition-all",
            inputText.trim() ? "bg-[#008069] hover:bg-[#006d59]" : "bg-gray-300 hover:bg-gray-400"
          )}
          disabled={!inputText.trim()}
        >
          <Send className="w-5 h-5 text-white" />
        </Button>
      </div>
    </div>
  );
}
