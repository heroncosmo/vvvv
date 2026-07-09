import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function SalonAppointmentsPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/salon-menu?tab=agendamentos");
  }, [setLocation]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-4xl flex-col items-center justify-center gap-3 p-6 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <div>
        <h1 className="text-lg font-semibold">Redirecionando para o painel do salao</h1>
        <p className="text-sm text-muted-foreground">
          Os agendamentos do salao agora ficam dentro de <span className="font-medium">/salon-menu</span>.
        </p>
      </div>
    </div>
  );
}
