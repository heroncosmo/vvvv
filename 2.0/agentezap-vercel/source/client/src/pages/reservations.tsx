import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation } from "wouter";
import { BedDouble, Stars, Sparkles } from "lucide-react";
import PremiumBlocked from "@/components/premium-overlay";

export default function ReservationsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const requireSubscription = () =>
    toast({
      title: "Recurso Premium",
      description:
        "Esta funcionalidade requer assinatura de um plano. Por favor, assine um plano para ter acesso.",
      action: (
        <ToastAction altText="Ver Planos" onClick={() => setLocation("/plans")}>
          Ver Planos
        </ToastAction>
      ),
    });

  const rooms = [
    { nome: "Suíte Master", status: "Disponível", descricao: "Vista mar, cama king", taxa: 89 },
    { nome: "Apartamento Executivo", status: "Reservado", descricao: "Workstation completa", taxa: 65 },
    { nome: "Quarto Família", status: "Em limpeza", descricao: "4 hóspedes", taxa: 72 },
  ];

  return (
    <PremiumBlocked
      title="Continue Gerenciando Reservas"
      subtitle="Seu período de teste acabou"
      description="Assine um plano para continuar usando o sistema de reservas com automações no WhatsApp."
      ctaLabel="Ativar Plano Ilimitado"
    >
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold">Reservas para Hotéis</h1>
            <p className="text-muted-foreground">
              Demonstração visual de como acompanhar ocupação, tarifas e upgrades em tempo real.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={requireSubscription}>
              Importar OTA
            </Button>
            <Button onClick={requireSubscription}>
              <BedDouble className="w-4 h-4 mr-2" />
              Criar Reserva
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Ocupação Geral</CardTitle>
              <CardDescription>Meta para o fim de semana</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">82%</span>
                <Badge variant="secondary">+5% vs ontem</Badge>
              </div>
              <Progress value={82} />
              <Button size="sm" variant="outline" onClick={requireSubscription}>
                Ajustar tarifas
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Revenue estimado</CardTitle>
              <CardDescription>Últimas 24h</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-bold">R$ 38.920</div>
              <p className="text-sm text-muted-foreground">Inclui upsells de café da manhã e late checkout.</p>
              <Button size="sm" variant="outline" onClick={requireSubscription}>
                Ver detalhes
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Experiência do hóspede</CardTitle>
              <CardDescription>Simulação de NPS</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-3xl font-bold">
                <Stars className="w-6 h-6 text-yellow-500" />9,2
              </div>
              <p className="text-sm text-muted-foreground">Automatize mensagens pré check-in, concierge e pesquisas pós estadia.</p>
              <Button size="sm" variant="outline" onClick={requireSubscription}>
                Ativar fluxo
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Portfólio de acomodações</CardTitle>
            <CardDescription>Mock com cards mostrando status de cada quarto.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {rooms.map((room) => (
              <div key={room.nome} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{room.nome}</p>
                    <p className="text-sm text-muted-foreground">{room.descricao}</p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {room.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Taxa de ocupação semanal</p>
                  <Progress value={room.taxa} />
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" size="sm" onClick={requireSubscription}>
                    Reservar
                  </Button>
                  <Button className="flex-1" variant="outline" size="sm" onClick={requireSubscription}>
                    Bloquear
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upsells automáticos</CardTitle>
            <CardDescription>Mostre combos que poderiam ser oferecidos pelo agente.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {[
              {
                titulo: "Experiência Romântica",
                itens: "Espumante, pétalas e early check-in",
                receita: "+R$ 420"
              },
              {
                titulo: "Pacote Bem-estar",
                itens: "Massagem, sauna e jantar saudável",
                receita: "+R$ 280"
              },
            ].map((combo) => (
              <div key={combo.titulo} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <p className="font-semibold">{combo.titulo}</p>
                </div>
                <p className="text-sm text-muted-foreground">{combo.itens}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-green-600">{combo.receita}</span>
                  <Button size="sm" variant="ghost" onClick={requireSubscription}>
                    Ativar oferta
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
    </PremiumBlocked>
  );
}
