import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  CreditCard, 
  Calendar, 
  Receipt, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Download,
  ArrowLeft,
  DollarSign,
  Wallet
} from "lucide-react";
import { useLocation } from "wouter";

interface PaymentHistory {
  id: string;
  subscriptionId: string;
  userId: string;
  mpPaymentId: string;
  mpSubscriptionId: string;
  amount: string;
  netAmount: string;
  feeAmount: string;
  status: string;
  statusDetail: string;
  paymentType: string;
  paymentMethod: string;
  paymentDate: string;
  dueDate: string;
  payerEmail: string;
  cardLastFourDigits: string;
  cardBrand: string;
  createdAt: string;
}

function formatCurrency(value: string | number | null | undefined): string {
  if (!value) return "R$ 0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function getStatusBadge(status: string) {
  switch (status) {
    case "approved":
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Aprovado
        </Badge>
      );
    case "rejected":
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
          <XCircle className="w-3 h-3 mr-1" />
          Recusado
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <Clock className="w-3 h-3 mr-1" />
          Pendente
        </Badge>
      );
    case "refunded":
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <Receipt className="w-3 h-3 mr-1" />
          Reembolsado
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          {status}
        </Badge>
      );
  }
}

function getPaymentTypeLabel(type: string) {
  switch (type) {
    case "first_payment":
      return "Primeira Mensalidade";
    case "setup_fee":
      return "Taxa de Implementação";
    case "recurring":
      return "Mensalidade";
    case "refund":
      return "Reembolso";
    default:
      return type;
  }
}

function getPaymentMethodIcon(method: string) {
  switch (method?.toLowerCase()) {
    case "credit_card":
    case "visa":
    case "mastercard":
    case "amex":
    case "elo":
      return <CreditCard className="w-4 h-4" />;
    case "pix":
      return <Wallet className="w-4 h-4" />;
    default:
      return <DollarSign className="w-4 h-4" />;
  }
}

export default function PaymentHistoryPage() {
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useQuery<PaymentHistory[]>({
    queryKey: ["/api/payment-history"],
  });
  
  // Cast explicitly to avoid TypeScript issues
  const payments = data as PaymentHistory[] | undefined;

  const { data: subscription } = useQuery({
    queryKey: ["/api/subscriptions/current"],
  });

  // Calculate totals
  const totalPaid = payments
    ?.filter((p) => p.status === "approved")
    .reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0) || 0;

  const approvedCount = payments?.filter((p) => p.status === "approved").length || 0;
  const rejectedCount = payments?.filter((p) => p.status === "rejected").length || 0;
  const totalCount = payments?.length || 0;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar histórico de pagamentos. Tente novamente mais tarde.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">Histórico de Cobranças</h1>
            <p className="text-gray-400 text-sm">
              Visualize todas as cobranças da sua assinatura
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Total Pago
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-2xl font-bold text-green-400">
                {formatCurrency(totalPaid)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {approvedCount} pagamento(s) aprovado(s)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Total de Transações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-400" />
              <span className="text-2xl font-bold text-blue-400">
                {totalCount}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Todas as cobranças realizadas
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Pagamentos Recusados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-400" />
              <span className="text-2xl font-bold text-red-400">
                {rejectedCount}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Pagamentos não aprovados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payment History Table */}
      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Histórico Completo
          </CardTitle>
          <CardDescription>
            Todas as cobranças associadas à sua assinatura
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payments && payments.length > 0 ? (
            <div className="rounded-md border border-gray-800 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-gray-800/50">
                    <TableHead className="text-gray-400">Data</TableHead>
                    <TableHead className="text-gray-400">Tipo</TableHead>
                    <TableHead className="text-gray-400">Valor</TableHead>
                    <TableHead className="text-gray-400">Método</TableHead>
                    <TableHead className="text-gray-400">Status</TableHead>
                    <TableHead className="text-gray-400">ID MP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow
                      key={payment.id}
                      className="border-gray-800 hover:bg-gray-800/30"
                    >
                      <TableCell className="text-gray-300">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          {formatDate(payment.paymentDate || payment.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-300">
                        {getPaymentTypeLabel(payment.paymentType)}
                      </TableCell>
                      <TableCell className="text-gray-300 font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell className="text-gray-300">
                        <div className="flex items-center gap-2">
                          {getPaymentMethodIcon(payment.paymentMethod || payment.cardBrand)}
                          <span className="capitalize">
                            {payment.cardBrand || payment.paymentMethod || "-"}
                          </span>
                          {payment.cardLastFourDigits && (
                            <span className="text-gray-500">
                              •••• {payment.cardLastFourDigits}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(payment.status)}
                      </TableCell>
                      <TableCell className="text-gray-500 font-mono text-xs">
                        {payment.mpPaymentId || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Receipt className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">
                Nenhuma cobrança encontrada
              </h3>
              <p className="text-gray-500 text-sm">
                Quando você realizar pagamentos, eles aparecerão aqui.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Subscription Info */}
      {subscription && (
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Assinatura Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-gray-500 text-sm">Plano</p>
                <p className="text-white font-medium">
                  {(subscription as any).plan?.nome || "-"}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Status</p>
                <p className="text-white font-medium capitalize">
                  {(subscription as any).status === "active" ? "Ativo" : (subscription as any).status}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Início</p>
                <p className="text-white font-medium">
                  {formatDate((subscription as any).dataInicio)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Próxima Cobrança</p>
                <p className="text-white font-medium">
                  {formatDate((subscription as any).nextPaymentDate)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
