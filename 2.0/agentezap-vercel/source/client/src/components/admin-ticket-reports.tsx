import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type TicketReportResponse = {
  ticketsBySector: Array<{ sectorId: string | null; sectorName: string; tickets: number }>;
  averageFirstResponseMinutes: number;
  responseTimeTrend: Array<{ date: string; minutes: number }>;
  activeAgents: Array<{ agentId: string; agentEmail: string; tickets: number }>;
  activeAgentsCount: number;
};

export default function AdminTicketReports() {
  const { data, isLoading } = useQuery<TicketReportResponse>({
    queryKey: ["/api/admin/tickets/reports"],
  });

  const ticketsBySector = useMemo(
    () => data?.ticketsBySector || [],
    [data?.ticketsBySector]
  );

  const responseTrend = useMemo(
    () => data?.responseTimeTrend || [],
    [data?.responseTimeTrend]
  );

  const agents = useMemo(
    () =>
      (data?.activeAgents || []).map((agent) => ({
        name: agent.agentEmail ? agent.agentEmail.split("@")[0] : "Agente",
        fullName: agent.agentEmail || agent.agentId,
        tickets: agent.tickets,
      })),
    [data?.activeAgents]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Carregando relatorios...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Tempo medio de resposta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.averageFirstResponseMinutes ? data.averageFirstResponseMinutes.toFixed(1) : "0.0"} min
            </div>
            <p className="text-xs text-muted-foreground mt-1">Baseado no primeiro retorno do agente.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Agentes ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.activeAgentsCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Com tickets abertos ou em andamento.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Tickets por setor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ticketsBySector.reduce((acc, item) => acc + item.tickets, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Volume total categorizado.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tickets por setor</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {ticketsBySector.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhum ticket encontrado.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketsBySector}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sectorName" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="tickets" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tempo medio de resposta</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {responseTrend.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem dados recentes.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={responseTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number | string) => {
                      const minutes = typeof value === "number" ? value : Number(value);
                      return [`${minutes.toFixed(1)} min`, "Tempo medio"];
                    }}
                  />
                  <Line type="monotone" dataKey="minutes" stroke="#22c55e" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agentes ativos</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          {agents.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum agente ativo no momento.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agents}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip
                  formatter={(value: number | string, _name, props) => [
                    `${value}`,
                    props?.payload?.fullName || "Agente",
                  ]}
                />
                <Bar dataKey="tickets" fill="#f97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
