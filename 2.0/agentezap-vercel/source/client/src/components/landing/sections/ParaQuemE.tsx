import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, Zap, Shield } from "lucide-react";
import { perfisData, Perfil } from "../data/perfis";
import LazyImage from "../shared/LazyImage";

export default function ParaQuemE() {
  const getIcon = (icone: string) => {
    const iconMap: { [key: string]: React.ReactNode } = {
      "🏪": <Users className="w-8 h-8" />,
      "💼": <TrendingUp className="w-8 h-8" />,
      "💻": <Zap className="w-8 h-8" />,
      "🏢": <Shield className="w-8 h-8" />
    };
    return iconMap[icone] || <Users className="w-8 h-8" />;
  };

  return (
    <section className="py-24 bg-[#F9FAFB]" id="publico">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Feito para quem vende e atende pelo WhatsApp – e precisa de organização de verdade
          </h2>
          
          <p className="text-lg md:text-xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
            Negócios locais, serviços, infoprodutos e times de vendas que não aguentam mais perder tempo e clientes no atendimento manual.
          </p>
        </div>
        
        <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-6 max-w-7xl mx-auto">
          {perfisData.map((perfil: Perfil, i) => (
            <Card key={i} className="bg-white border border-gray-200 hover:shadow-xl transition-all duration-300 hover:scale-[1.03] group overflow-hidden">
              <CardContent className="p-6 md:p-8 text-center">
                <div className={`w-16 h-16 bg-gradient-to-br ${perfil.cor} rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  {getIcon(perfil.icone)}
                </div>
                
                {/* Foto real da pessoa em formato circular */}
                {perfil.foto && (
                  <div className="relative mb-4">
                    <LazyImage 
                      src={perfil.foto}
                      alt={`Foto de ${perfil.titulo}`}
                      className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-lg group-hover:scale-110 transition-transform duration-300"
                      style={{
                        filter: 'brightness(1.05) saturate(1.1)'
                      }}
                    />
                    {/* Anel de cor temática ao redor da foto */}
                    <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${perfil.cor} opacity-20 blur-md -z-10`}></div>
                    
                    {/* Badge de "ativo/conectado" */}
                    <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    </div>
                  </div>
                )}
                
                <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2">{perfil.titulo}</h3>
                <p className="text-gray-600 text-sm mb-6">{perfil.descricao}</p>
                
                <div className="space-y-2 text-left">
                  {perfil.exemplos.map((exemplo, j) => (
                    <div key={j} className="flex items-start gap-2 text-xs md:text-sm text-gray-700">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                      <span className="leading-tight">{exemplo}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
