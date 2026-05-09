import { ShieldCheck, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import TeamMembersManager from "@/components/team-members-manager";
import { useAuth } from "@/hooks/useAuth";

export default function TeamMembersPage() {
  const { user } = useAuth();
  const isMember = (user as any)?.isMember;

  if (isMember) {
    return (
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Membros</h1>
            <p className="text-sm text-muted-foreground">
              O gerenciamento da equipe fica disponível apenas para a conta principal.
            </p>
          </div>

          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <ShieldCheck className="h-10 w-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">Acesso restrito ao dono da empresa</p>
                <p className="text-sm text-muted-foreground">
                  Atendentes usam seus logins normalmente e recebem apenas as conversas encaminhadas.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-emerald-50 via-background to-sky-50 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-700">
              <Users className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Membros</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Cadastre atendentes com login próprio, permissões separadas e assinatura individual.
                Depois vincule cada pessoa aos setores para manter o atendimento organizado.
              </p>
            </div>
          </div>
        </div>

        <TeamMembersManager />
      </div>
    </div>
  );
}
