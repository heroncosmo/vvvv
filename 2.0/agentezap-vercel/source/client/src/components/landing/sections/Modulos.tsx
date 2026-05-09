import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { modulosData, Modulo } from "../data/modulos";

export default function Modulos() {
  const [expandedModule, setExpandedModule] = useState<number | null>(null);

  const renderPreview = (moduleId: string) => {
    switch (moduleId) {
      case "ia-whatsapp":
        return (
          <div className="mt-6 p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs uppercase tracking-wide text-white/60">Conversa ativa</span>
            </div>
            <div className="space-y-2">
              <div className="max-w-[85%] rounded-2xl bg-white/10 px-3 py-2 text-sm text-white">
                Oi, vi seu anúncio, você tem horário hoje?
              </div>
              <div className="max-w-[90%] rounded-2xl ml-auto bg-green-500/90 px-3 py-2 text-sm text-white shadow-lg">
                Oi! Tenho sim 😊 Posso só te fazer 2 perguntas rápidas pra reservar o melhor horário pra você?
              </div>
            </div>
            <div className="flex items-center gap-2 text-white/40 text-xs">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              IA digitando...
            </div>
          </div>
        );
      case "crm-funil":
        return (
          <div className="mt-6 p-4 rounded-2xl bg-white/10 border border-white/10">
            <div className="flex justify-between text-xs text-white/60 mb-3">
              <span>Descoberta</span>
              <span>Qualificação</span>
              <span>Negociação</span>
              <span>Fechamento</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[4, 3, 2, 1].map((count, index) => (
                <div key={index} className="space-y-2">
                  {[...Array(count)].map((_, i) => (
                    <div key={i} className="h-6 rounded-lg bg-gradient-to-r from-green-500/40 to-teal-400/40 border border-white/10"></div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      case "marketing-massa":
        return (
          <div className="mt-6 p-4 rounded-2xl bg-white/10 border border-white/10 space-y-3">
            <div className="flex justify-between items-center text-xs text-white/60">
              <span>Campanha "Reengajar leads"</span>
              <span>Agendado • 08h00</span>
            </div>
            <div className="space-y-2">
              {["Leads quentes", "Clientes VIP", "Lista CSV"].map((tag) => (
                <div key={tag} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 text-sm text-white/90">
                  <span>{tag}</span>
                  <span className="text-xs text-white/60">+1.2k contatos</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>Abertura</span>
              <span className="font-semibold text-white">48%</span>
            </div>
          </div>
        );
      case "agenda-reservas":
        return (
          <div className="mt-6 p-4 rounded-2xl bg-white/10 border border-white/10">
            <div className="grid grid-cols-7 gap-1 text-[10px] text-white/60">
              {["S", "T", "Q", "Q", "S", "S", "D"].map((day, i) => (
                <div key={i} className="text-center py-1">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 mt-2">
              {[...Array(21)].map((_, index) => (
                <div
                  key={index}
                  className={`h-8 rounded-lg ${index === 9 || index === 10 ? 'bg-green-500/60' : 'bg-white/5'}`}
                ></div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-white/70">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span>Horários confirmados com lembrete automático</span>
            </div>
          </div>
        );
      case "assinaturas-pagamentos":
        return (
          <div className="mt-6 p-4 rounded-2xl bg-white/10 border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>Plano Pro • R$ 197/mês</span>
              <span className="text-green-400">Ativo</span>
            </div>
            {["Lucas Pereira", "Marina Costa", "Thiago Alves"].map((cliente) => (
              <div key={cliente} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 text-sm text-white/90">
                <span>{cliente}</span>
                <span className="text-xs text-white/60">PIX confirmado</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>Recorrência</span>
              <span className="font-semibold text-white">100% em dia</span>
            </div>
          </div>
        );
      case "admin-seguranca":
      default:
        return (
          <div className="mt-6 p-4 rounded-2xl bg-white/10 border border-white/10 space-y-3">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>Dashboard hoje</span>
              <span>Atualizado há 2 min</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-3">
                <span className="text-xs text-white/60">Novos leads</span>
                <div className="text-lg font-semibold text-white">47</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <span className="text-xs text-white/60">Conversões</span>
                <div className="text-lg font-semibold text-green-400">+28%</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <span className="text-xs text-white/60">Sessões ativas</span>
                <div className="text-lg font-semibold text-white">12</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <span className="text-xs text-white/60">Status</span>
                <div className="text-lg font-semibold text-green-400">OK</div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <section className="py-24" style={{
      background: 'linear-gradient(135deg, #020617 0%, #1E1B4B 60%, #02081A 100%)'
    }} id="modulos">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
            Uma plataforma, todos os pilares do seu atendimento e das suas vendas
          </h2>
          
          <p className="text-lg md:text-xl text-gray-300 max-w-4xl mx-auto leading-relaxed">
            IA no WhatsApp, CRM, campanhas, agenda, assinaturas e painel admin – tudo conectado
          </p>
        </div>
        
        <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-6 max-w-7xl mx-auto">
          {modulosData.map((module: Modulo, i) => (
            <Card 
              key={i} 
              className="bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/[0.15] transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-green-500/10 group cursor-pointer overflow-hidden" 
              onClick={() => setExpandedModule(expandedModule === i ? null : i)}
            >
              <CardContent className="p-6 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-14 h-14 bg-gradient-to-br ${module.cor} rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <span className="text-2xl">{module.icone}</span>
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-bold text-white leading-tight">{module.titulo}</h3>
                  </div>
                </div>
                
                <p className="text-gray-300 text-sm mb-4 leading-relaxed">{module.descricao}</p>

                {renderPreview(module.id)}
                
                {expandedModule === i && (
                  <div className="mt-4 pt-4 border-t border-white/20 space-y-2 animate-fade-in">
                    {module.detalhes?.map((detalhe, j) => (
                      <div key={j} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-200 text-sm leading-tight">{detalhe}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
                  <span className="text-green-400 text-xs font-semibold">
                    {expandedModule === i ? "Recolher detalhes" : "Ver detalhes"}
                  </span>
                  {expandedModule === i ? 
                    <ChevronUp className="w-4 h-4 text-gray-400" /> : 
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  }
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
