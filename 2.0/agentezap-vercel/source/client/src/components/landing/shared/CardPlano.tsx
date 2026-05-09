import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Star, ArrowRight, Zap } from "lucide-react";
import { Plano } from "../data/planos";

interface CardPlanoProps {
  plano: Plano;
  isAnnual: boolean;
  isPopular?: boolean;
}

export default function CardPlano({ plano, isAnnual, isPopular = false }: CardPlanoProps) {
  const preco = isAnnual ? plano.precoAnual : plano.precoMensal;
  const periodo = isAnnual ? "/ano" : "/mês";

  return (
    <Card className={`relative ${isPopular ? 'border-2 border-green-500 shadow-xl scale-105' : 'border-gray-200'} hover:shadow-lg transition-all duration-300`}>
      <CardContent className="p-8">
        {isPopular && (
          <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-1 text-sm font-bold">
            {plano.badge}
          </Badge>
        )}
        
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">{plano.nome}</h3>
          <p className="text-gray-600 text-sm mb-4">{plano.descricao}</p>
          
          <div className="flex items-baseline justify-center gap-1 mb-6">
            <span className="text-4xl font-bold text-gray-900">R$ {preco}</span>
            <span className="text-lg text-gray-600">{periodo}</span>
          </div>
          
          {isAnnual && plano.economiaAnual > 0 && (
            <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium mb-4 inline-block">
              Economize R$ {plano.economiaAnual}/ano
            </div>
          )}
        </div>
        
        <ul className="space-y-3 mb-8">
          {plano.recursos.map((recurso, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700 text-sm">{recurso}</span>
            </li>
          ))}
        </ul>
        
        <div className="border-t pt-6">
          <div className="text-xs text-gray-500 mb-4">
            <div className="font-medium text-gray-700 mb-2">Limites do plano:</div>
            {plano.limites && (
              <div className="grid grid-cols-2 gap-2">
                <div>• {plano.limites.conversas} conversas</div>
                <div>• {plano.limites.usuarios} usuários</div>
                <div>• {plano.limites.numeros} números</div>
                <div>• {plano.limites.campanhas} campanhas</div>
                <div>• {plano.limites.contatos} contatos</div>
              </div>
            )}
          </div>
        </div>
        
        <Button 
          className={`w-full ${isPopular ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-900 hover:bg-gray-800'} text-white font-bold py-3 text-lg transition-colors duration-200 flex items-center justify-center gap-2`}
          size="lg"
        >
          {plano.cta}
          {isPopular && <Zap className="w-5 h-5" />}
          <ArrowRight className="w-5 h-5" />
        </Button>
      </CardContent>
    </Card>
  );
}
