import { Badge } from "@/components/ui/badge";
import { Bot, User } from "lucide-react";

interface MockupCelularProps {
  niche: string;
  messages: Array<{
    sender: 'user' | 'bot';
    text: string;
    time?: string;
  }>;
  badge?: string;
  className?: string;
}

export default function MockupCelular({ 
  niche, 
  messages, 
  badge, 
  className = "" 
}: MockupCelularProps) {
  return (
    <div className={`relative ${className}`}>
      {badge && (
        <div className="absolute -top-2 -right-2 z-10">
          <Badge className="bg-gradient-to-r from-info to-success text-white px-3 py-1 text-xs font-semibold shadow-lg border-2 border-white">
            {badge}
          </Badge>
        </div>
      )}
      
      {/* Mockup do Celular */}
      <div className="bg-neutral-900 rounded-[2.5rem] p-3 shadow-2xl border-8 border-neutral-800 relative overflow-hidden">
        {/* Tela do celular */}
        <div className="bg-white rounded-[1.5rem] h-[280px] w-[140px] overflow-hidden relative">
          {/* Cabeçalho do WhatsApp */}
          <div className="bg-gradient-to-r from-info to-success text-white px-2 py-1 rounded-t-[1.5rem] flex items-center gap-1">
            <Bot className="w-3 h-3" />
            <span className="text-xs font-semibold truncate">{niche}</span>
          </div>
          
          {/* Área de mensagens */}
          <div className="p-2 space-y-1.5 h-[220px] overflow-y-auto">
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex items-start gap-1 max-w-[90%] ${message.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                  {message.sender === 'bot' && (
                    <div className="w-4 h-4 bg-gradient-to-br from-info to-success rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-2 h-2 text-white" />
                    </div>
                  )}
                  
                  <div className={`px-2 py-1 rounded-lg text-xs ${
                    message.sender === 'user' 
                      ? 'bg-neutral-100 text-neutral-800 rounded-br-sm' 
                      : 'bg-gradient-to-r from-info/10 to-success/10 text-neutral-700 rounded-bl-sm border border-info/20'
                  }`}>
                    {message.text}
                  </div>
                  
                  {message.sender === 'user' && (
                    <div className="w-4 h-4 bg-neutral-300 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-2 h-2 text-neutral-600" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Indicador "digitando..." */}
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-info rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-1.5 h-1.5 bg-info rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-1.5 h-1.5 bg-info rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
        
        {/* Botões do celular */}
        <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-neutral-700 rounded-full"></div>
      </div>
    </div>
  );
}
