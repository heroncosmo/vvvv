import {
  AlertTriangle,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  MessageCircleMore,
  Receipt,
  RefreshCcw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ComponentType } from "react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface AdminBusinessDashboardReport {
  generatedAt: string;
  overview: {
    totalUsers: number;
    activeSubscribers: number;
    activeConnectedSubscribers: number;
    activeDisconnectedSubscribers: number;
    inactiveConnectedFormerSubscribers: number;
    availablePlans: number;
    pendingReceipts: number;
  };
  revenue: {
    lifetimeGross: number;
    lifetimeNet: number;
    currentMonthGross: number;
    currentMonthNet: number;
    previousMonthGross: number;
    previousMonthNet: number;
    averageMonthlyGrossLast6: number;
    averageMonthlyNetLast6: number;
    monthOverMonthGrowth: number | null;
    averageTicket: number;
  };
  forecast: {
    nextMonthBaseRevenue: number;
    nextMonthWeightedRevenue: number;
    nextMonthBaseSubscribers: number;
    nextMonthWeightedSubscribers: number;
    nextMonthConnectedBaseRevenue: number;
    nextMonthConnectedWeightedRevenue: number;
    nextMonthConnectedSubscribers: number;
    nextMonthDisconnectedBaseRevenue: number;
    nextMonthDisconnectedWeightedRevenue: number;
    nextMonthDisconnectedSubscribers: number;
    expiringThisMonthSubscribers: number;
    atRiskDisconnectedSubscribers: number;
  };
  renewal: {
    overallRate: number;
    connectedRate: number;
    disconnectedRate: number;
    connectedEligible: number;
    disconnectedEligible: number;
    connectedRenewed: number;
    disconnectedRenewed: number;
  };
  monthlySeries: Array<{
    monthKey: string;
    label: string;
    grossRevenue: number;
    netRevenue: number;
    approvedPayments: number;
    recurringPayments: number;
    newSubscribers: number;
  }>;
  upcomingRenewals: Array<{
    subscriptionId: string;
    userId: string;
    userName: string;
    userEmail: string | null;
    planName: string;
    amount: number;
    nextPaymentDate: string | null;
    isConnected: boolean;
    daysUntilCharge: number | null;
    renewalProbability: number;
  }>;
  planMix: Array<{
    planId: string;
    planName: string;
    activeSubscribers: number;
    connectedSubscribers: number;
    scheduledRevenueNextMonth: number;
  }>;
}

interface AdminBusinessReportProps {
  report?: AdminBusinessDashboardReport;
  mode?: "full" | "compact";
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

function formatCurrency(value: number) {
  return currencyFormatter.format(value || 0);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function growthTone(value: number | null) {
  if (value === null) return "text-slate-500";
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-600";
  return "text-slate-500";
}

function LoadingState() {
  return (
    <Card className="border-dashed border-slate-300 bg-slate-50/70">
      <CardContent className="flex min-h-[220px] items-center justify-center text-sm text-slate-500">
        Carregando visão do negócio...
      </CardContent>
    </Card>
  );
}

export function AdminBusinessReport({
  report,
  mode = "full",
}: AdminBusinessReportProps) {
  if (!report) {
    return <LoadingState />;
  }

  const growthLabel =
    report.revenue.monthOverMonthGrowth === null
      ? "Sem base comparativa"
      : `${report.revenue.monthOverMonthGrowth > 0 ? "+" : ""}${report.revenue.monthOverMonthGrowth.toFixed(1)}% vs mês anterior`;
  const maxSeriesRevenue = Math.max(
    ...report.monthlySeries.map((item) => item.grossRevenue),
    1,
  );

  if (mode === "compact") {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Receita total"
            value={formatCurrency(report.revenue.lifetimeGross)}
            hint={`${formatCurrency(report.revenue.lifetimeNet)} líquido`}
            tone="emerald"
            icon={Wallet}
          />
          <KpiCard
            label="Receita do mês"
            value={formatCurrency(report.revenue.currentMonthGross)}
            hint={growthLabel}
            tone="sky"
            icon={BadgeDollarSign}
          />
          <KpiCard
            label="Próximo mês"
            value={formatCurrency(report.forecast.nextMonthBaseRevenue)}
            hint={`${report.forecast.nextMonthBaseSubscribers} cobranças previstas`}
            tone="slate"
            icon={CalendarClock}
          />
          <KpiCard
            label="Renovação conectados"
            value={formatPercent(report.renewal.connectedRate)}
            hint={`${report.overview.activeConnectedSubscribers} clientes com WhatsApp ativo`}
            tone="amber"
            icon={RefreshCcw}
          />
        </div>

        <Card className="border-slate-200 bg-white/95">
          <CardContent className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Leitura rápida
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">
                Base conectada sustenta a previsão do próximo mês
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {formatCurrency(report.forecast.nextMonthConnectedWeightedRevenue)} da projeção ajustada vem dos assinantes
                com WhatsApp conectado. Os desconectados concentram {numberFormatter.format(report.forecast.atRiskDisconnectedSubscribers)} risco(s) imediato(s).
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat label="Ativos" value={report.overview.activeSubscribers} />
              <MiniStat label="Ex-assinantes conectados" value={report.overview.inactiveConnectedFormerSubscribers} />
              <MiniStat label="PIX pendente" value={report.overview.pendingReceipts} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_36%),linear-gradient(135deg,_#0f172a_0%,_#111827_55%,_#052e2b_100%)] text-white shadow-sm">
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
              <BarChart3 className="h-3.5 w-3.5" />
              Visor do negócio
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight lg:text-3xl">
                Receita, recorrência e risco visíveis na primeira dobra
              </h2>
              <p className="max-w-2xl text-sm text-white/70 lg:text-base">
                O painel agora mostra o que já entrou, o ritmo do mês, o que está programado para o próximo ciclo e o peso real dos clientes com WhatsApp conectado.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryChip label="Clientes na base" value={numberFormatter.format(report.overview.totalUsers)} />
              <SummaryChip label="Assinantes ativos" value={numberFormatter.format(report.overview.activeSubscribers)} />
              <SummaryChip label="Receita média 6m" value={formatCurrency(report.revenue.averageMonthlyGrossLast6)} />
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/8 p-5 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
              Próximo mês
            </p>
            <div className="mt-3 space-y-4">
              <div>
                <p className="text-sm text-white/65">Cobrança programada</p>
                <p className="mt-1 text-3xl font-semibold">
                  {formatCurrency(report.forecast.nextMonthBaseRevenue)}
                </p>
                <p className="mt-1 text-sm text-white/65">
                  {report.forecast.nextMonthBaseSubscribers} assinantes com vencimento/cobrança no mês seguinte
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <p className="text-sm text-white/65">Projeção ajustada por recorrência</p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatCurrency(report.forecast.nextMonthWeightedRevenue)}
                </p>
                <p className="mt-1 text-sm text-emerald-200">
                  {report.forecast.nextMonthWeightedSubscribers.toFixed(1)} renovações esperadas no ritmo atual
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-4">
        <KpiCard
          label="Receita total desde o início"
          value={formatCurrency(report.revenue.lifetimeGross)}
          hint={`${formatCurrency(report.revenue.lifetimeNet)} líquido recebido`}
          tone="emerald"
          icon={Wallet}
        />
        <KpiCard
          label="Receita do mês"
          value={formatCurrency(report.revenue.currentMonthGross)}
          hint={growthLabel}
          tone="sky"
          icon={TrendingUp}
        />
        <KpiCard
          label="Próximo mês programado"
          value={formatCurrency(report.forecast.nextMonthBaseRevenue)}
          hint={`${report.forecast.nextMonthBaseSubscribers} cobranças previstas`}
          tone="slate"
          icon={CalendarClock}
        />
        <KpiCard
          label="Próximo mês ajustado"
          value={formatCurrency(report.forecast.nextMonthWeightedRevenue)}
          hint={`${report.forecast.nextMonthWeightedSubscribers.toFixed(1)} renovações esperadas`}
          tone="amber"
          icon={ArrowUpRight}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-slate-200 bg-white/95">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-slate-950">Pulso mensal da receita</CardTitle>
            <CardDescription>
              Quanto entrou por mês, com leitura rápida de pagamentos aprovados e novas assinaturas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.monthlySeries.map((item) => (
              <div key={item.monthKey} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500">
                      {item.approvedPayments} pagamentos aprovados · {item.newSubscribers} novas assinaturas
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-950">
                      {formatCurrency(item.grossRevenue)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatCurrency(item.netRevenue)} líquido
                    </p>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900"
                    style={{ width: `${(item.grossRevenue / maxSeriesRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/95">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-slate-950">Renovação e risco</CardTitle>
            <CardDescription>
              Probabilidade histórica de continuação segmentada pelo status do WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SegmentRow
              label="Conectados"
              value={formatPercent(report.renewal.connectedRate)}
              hint={`${report.overview.activeConnectedSubscribers} ativos · ${report.renewal.connectedRenewed}/${report.renewal.connectedEligible} já renovaram`}
              tone="emerald"
              icon={CheckCircle2}
            />
            <SegmentRow
              label="Desconectados"
              value={formatPercent(report.renewal.disconnectedRate)}
              hint={`${report.overview.activeDisconnectedSubscribers} ativos · ${report.renewal.disconnectedRenewed}/${report.renewal.disconnectedEligible} já renovaram`}
              tone="red"
              icon={AlertTriangle}
            />
            <SegmentRow
              label="Geral"
              value={formatPercent(report.renewal.overallRate)}
              hint={`${report.forecast.expiringThisMonthSubscribers} vencem ainda neste mês`}
              tone="slate"
              icon={RefreshCcw}
            />

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Oportunidade imediata
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MiniStat label="Ex-assinantes conectados" value={report.overview.inactiveConnectedFormerSubscribers} />
                <MiniStat label="Desconectados em risco" value={report.forecast.atRiskDisconnectedSubscribers} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-slate-200 bg-white/95">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-slate-950">Próximas cobranças</CardTitle>
            <CardDescription>
              Quem entra no próximo ciclo e qual a confiança de renovação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.upcomingRenewals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Nenhuma cobrança do próximo mês foi encontrada com `nextPaymentDate` ou `dataFim`.
              </div>
            ) : (
              report.upcomingRenewals.map((item) => (
                <div
                  key={item.subscriptionId}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {item.userName}
                      </p>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          item.isConnected
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700",
                        )}
                      >
                        {item.isConnected ? "WhatsApp conectado" : "WhatsApp desconectado"}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {item.planName} · vence {formatDate(item.nextPaymentDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-950">
                      {formatCurrency(item.amount)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatPercent(item.renewalProbability * 100)} de chance
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-slate-200 bg-white/95">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg text-slate-950">Segmento conectado</CardTitle>
              <CardDescription>
                Parte mais saudável da base, com maior chance de continuar no próximo ciclo.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <MiniRevenueCard
                label="Clientes"
                value={report.forecast.nextMonthConnectedSubscribers}
                hint="com cobrança no próximo mês"
                icon={MessageCircleMore}
              />
              <MiniRevenueCard
                label="Base programada"
                value={formatCurrency(report.forecast.nextMonthConnectedBaseRevenue)}
                hint="receita bruta prevista"
                icon={CreditCard}
              />
              <MiniRevenueCard
                label="Ajustado"
                value={formatCurrency(report.forecast.nextMonthConnectedWeightedRevenue)}
                hint="com chance histórica de renovação"
                icon={CheckCircle2}
              />
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/95">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg text-slate-950">Mix de planos ativos</CardTitle>
              <CardDescription>
                Onde a base está concentrada e quanto cada plano já empurra para o mês seguinte.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.planMix.slice(0, 5).map((plan) => (
                <div
                  key={plan.planId}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{plan.planName}</p>
                    <p className="text-xs text-slate-500">
                      {plan.connectedSubscribers}/{plan.activeSubscribers} conectados
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-950">
                      {numberFormatter.format(plan.activeSubscribers)} ativos
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatCurrency(plan.scheduledRevenueNextMonth)} no próximo mês
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <MiniMessageCard
          icon={Receipt}
          title="Comprovantes PIX pendentes"
          value={numberFormatter.format(report.overview.pendingReceipts)}
          hint="Pendências que seguram ativação e caixa"
          tone="amber"
        />
        <MiniMessageCard
          icon={MessageCircleMore}
          title="Clientes com WhatsApp conectado"
          value={numberFormatter.format(report.overview.activeConnectedSubscribers)}
          hint="Mais próximos da renovação e da reativação"
          tone="emerald"
        />
        <MiniMessageCard
          icon={CreditCard}
          title="Ticket médio"
          value={formatCurrency(report.revenue.averageTicket)}
          hint="Média por pagamento aprovado"
          tone="slate"
        />
      </div>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.14em] text-white/55">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "emerald" | "sky" | "slate" | "amber";
  icon: ComponentType<{ className?: string }>;
}) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
  }[tone];

  const growthValue =
    hint.startsWith("+") || hint.startsWith("-")
      ? Number.parseFloat(hint.replace(/[^\d.-]/g, ""))
      : null;

  return (
    <Card className="border-slate-200 bg-white/95 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-600">{label}</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
            <p className={cn("text-xs", growthTone(growthValue))}>
              {hint}
            </p>
          </div>
          <div className={cn("rounded-2xl p-3 ring-1", toneClass)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SegmentRow({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "emerald" | "red" | "slate";
  icon: ComponentType<{ className?: string }>;
}) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
  }[tone];

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className={cn("rounded-2xl p-2.5", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-950">{label}</p>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
      </div>
      <p className="text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">
        {numberFormatter.format(value)}
      </p>
    </div>
  );
}

function MiniRevenueCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" />
        <p className="text-xs uppercase tracking-[0.15em]">{label}</p>
      </div>
      <p className="mt-3 text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function MiniMessageCard({
  icon: Icon,
  title,
  value,
  hint,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string;
  hint: string;
  tone: "amber" | "emerald" | "slate";
}) {
  const toneClass = {
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-700",
  }[tone];

  return (
    <Card className="border-slate-200 bg-white/95">
      <CardContent className="flex items-start gap-4 p-5">
        <div className={cn("rounded-2xl p-3", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-600">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}
