import { Bot } from "lucide-react";

interface MockupWhatsAppProps {
  messages: Array<{
    type: 'user' | 'bot';
    text: string;
  }>;
  title?: string;
  height?: string;
}

export default function MockupWhatsApp({ messages, title = "Conversa WhatsApp", height = "h-64" }: MockupWhatsAppProps) {
  return (
    <div className="bg-neutral-50 rounded-2xl p-3 space-y-2 overflow-hidden">
      {title && (
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 bg-success rounded-full flex items-center justify-center">
            <Bot className="w-2 h-2 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold">{title}</p>
            <p className="text-xs text-neutral-500">Agora</p>
          </div>
        </div>
      )}
      
      {messages.map((message, index) => (
        <div
          key={index}
          className={`text-sm p-2 rounded-lg ${
            message.type === 'user'
              ? 'bg-white rounded-bl-none'
              : message.type === 'bot'
              ? 'bg-success/10 rounded-br-none text-success'
              : 'bg-info/10 rounded-br-none text-info'
          }`}
        >
          {message.text}
        </div>
      ))}
    </div>
  );
}
