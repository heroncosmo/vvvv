import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, Shield, Users } from "lucide-react";
import { planosData } from "../data/planos";
import CardPlano from "../shared/CardPlano";

export default function PlanosPrecos() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section className="py-24 bg-gray-50" id="precos">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto text-center mb-16">
          <Badge className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-6 py-3 rounded-full text-lg font-bold mb-8">
            <Sparkles className="w-6 h-6" />
            Escolha o plano que combina com o estágio do seu negócio
          </Badge>
          
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            Planos claros, sem surpresas e crescimento junto com você
          </h2>
          
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-12">
            Comece pequeno e escale conforme sua demanda. Todos os planos com IA 24/7.
          </p>
          
          {/* Toggle Mensal/Anual */}
          <div className="flex justify-center items-center gap-4 mb-12">
            <span className={`text-lg font-medium ${!isAnnual ? 'text-green-600' : 'text-gray-500'}`}>
              Mensal
            </span>
            
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                isAnnual ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full bg-white shadow-lg transform transition-transform duration-200 ${
                  isAnnual ? 'translate-x-8' : 'translate-x-1'
                }`}
              />
            </button>
            
            <span className={`text-lg font-medium ${isAnnual ? 'text-green-600' : 'text-gray-500'}`}>
              Anual
              </span>
            
            {isAnnual && (
              <div className="ml-4">
                <Badge className="bg-green-100 text-green-800 px-3 py-1 text-sm font-bold">
                  <Zap className="w-4 h-4 mr-1" />
                  2 meses grátis
                </Badge>
              </div>
            )}
          </div>
        </div>
        
        <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {planosData.map((plano, index) => (
            <CardPlano
              key={plano.id}
              plano={plano}
              isAnnual={isAnnual}
              isPopular={plano.destaque}
            />
          ))}
        </div>
        
        <div className="max-w-4xl mx-auto mt-16 text-center">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8">
            <div className="flex items-center justify-center gap-4 mb-6">
              <Shield className="w-8 h-8 text-blue-600" />
              <h3 className="text-2xl font-bold text-gray-900">
                Garantia de 14 dias satisfação ou dinheiro de volta
              </h3>
            </div>
            
            <p className="text-gray-600 text-lg mb-6">
              Teste a plataforma sem risco. Se não gostar, cancele em 1 clique 
              e receba o valor integral investido. Sem perguntas, sem burocracia.
            </p>
            
            <div className="grid md:grid-cols-3 gap-6 text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-bold text-gray-900">+120 empresas</div>
                  <div className="text-sm text-gray-600"> Já usam a plataforma</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-bold text-gray-900">Setup 5 min</div>
                  <div className="text-sm text-gray-600"> Sem necessidade técnica</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-bold text-gray-900">Cancelamento fácil</div>
                  <div className="text-sm text-gray-600"> 1 clique, sem multa</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
