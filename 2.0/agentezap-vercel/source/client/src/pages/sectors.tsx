import { BarChart3, Building2, Workflow } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import SectorsManager from "@/components/sectors-manager";
import SectorsReport from "@/components/sectors-report";
import { useAuth } from "@/hooks/useAuth";

export default function SectorsPage() {
  const { user } = useAuth();
  const isMember = (user as any)?.isMember;

  if (isMember) {
    return (
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Setores</h1>
            <p className="text-sm text-muted-foreground">
              A configuração de setores e relatórios é centralizada na conta principal.
            </p>
          </div>

          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <Workflow className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Você continua atendendo normalmente nas conversas atribuídas.</p>
              <p className="text-sm text-muted-foreground">
                O dono da operação organiza setores, handoff com IA e relatórios nesta área.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-sky-50 via-background to-emerald-50 p-6">
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                Estrutura operacional
              </div>
              <h1 className="text-2xl font-bold">Setores e roteamento</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Organize Comercial, Financeiro, Suporte e qualquer outro time com regras claras de handoff.
                A IA pode continuar em copilot, parar no humano ou receber a conversa de volta quando o atendimento fechar.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Card className="border-border/60 bg-background/85 shadow-none">
                <CardContent className="flex items-center gap-3 p-4">
                  <Workflow className="h-5 w-5 text-sky-600" />
                  <div>
                    <p className="text-sm font-medium">Handoff controlado</p>
                    <p className="text-xs text-muted-foreground">IA, copilot ou humano por setor.</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/60 bg-background/85 shadow-none">
                <CardContent className="flex items-center gap-3 p-4">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-medium">Relatório por setor</p>
                    <p className="text-xs text-muted-foreground">Filtros por conversa, membro e operação.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <SectorsManager />
        <SectorsReport />
      </div>
    </div>
  );
}
