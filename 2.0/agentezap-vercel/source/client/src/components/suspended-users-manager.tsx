import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  Search,
  User,
  Calendar,
  DollarSign,
  FileText,
  Mail,
  Loader2,
  ShieldAlert,
  RefreshCw,
  Undo,
  Eye,
  Plus,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Interface para usuários ativos que podem ser suspensos
interface ActiveUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  createdAt: string;
  isConnected?: boolean;
  hasActiveSubscription?: boolean;
}

interface SuspendedUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  suspendedAt: string;
  suspensionReason: string;
  suspensionType: string;
  refundedAt?: string;
  refundAmount?: number;
  violationDescription?: string;
  evidence?: string[];
  violationDate?: string;
}

// Tipos de violação disponíveis
const violationTypes = [
  { value: 'religious_services', label: 'Serviços religiosos/esotéricos', description: 'Cartomancia, trabalhos espirituais, amarrações, etc.' },
  { value: 'adult_content', label: 'Conteúdo adulto', description: 'Conteúdo sexual, pornográfico ou relacionado' },
  { value: 'illegal_activities', label: 'Atividades ilegais', description: 'Venda de produtos ilegais, drogas, etc.' },
  { value: 'scam_fraud', label: 'Golpes/fraudes', description: 'Tentativas de enganar ou fraudar usuários' },
  { value: 'hate_speech', label: 'Discurso de ódio', description: 'Conteúdo discriminatório ou preconceituoso' },
  { value: 'harassment', label: 'Assédio', description: 'Comportamento de assédio ou perseguição' },
  { value: 'copyright_violation', label: 'Violação de direitos autorais', description: 'Uso indevido de conteúdo protegido' },
  { value: 'spam', label: 'Spam', description: 'Envio massivo de mensagens indesejadas' },
  { value: 'terms_violation', label: 'Violação dos Termos de Uso', description: 'Outras violações dos termos de serviço' },
  { value: 'other', label: 'Outro', description: 'Outros motivos não listados' },
];

function getViolationBadge(type: string) {
  const typeMap: Record<string, { label: string; variant: "default" | "destructive" | "secondary" | "outline" }> = {
    religious_services: { label: 'Religiosos', variant: 'destructive' },
    adult_content: { label: 'Adulto', variant: 'destructive' },
    illegal_activities: { label: 'Ilegal', variant: 'destructive' },
    scam_fraud: { label: 'Fraude', variant: 'destructive' },
    hate_speech: { label: 'Ódio', variant: 'destructive' },
    harassment: { label: 'Assédio', variant: 'destructive' },
    copyright_violation: { label: 'Copyright', variant: 'secondary' },
    spam: { label: 'Spam', variant: 'secondary' },
    other: { label: 'Outro', variant: 'outline' },
  };
  const config = typeMap[type] || { label: type, variant: 'default' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export default function SuspendedUsersManager() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<SuspendedUser | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showUnsuspendDialog, setShowUnsuspendDialog] = useState(false);
  const [unsuspendNote, setUnsuspendNote] = useState("");
  
  // Estados para suspensão manual
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [userComboOpen, setUserComboOpen] = useState(false);
  const [selectedUserToSuspend, setSelectedUserToSuspend] = useState<ActiveUser | null>(null);
  const [suspendViolationType, setSuspendViolationType] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendEvidence, setSuspendEvidence] = useState("");
  const [suspendRefund, setSuspendRefund] = useState("");

  // Fetch suspended users
  const { data: suspendedUsers, isLoading, refetch } = useQuery<SuspendedUser[]>({
    queryKey: ["/api/admin/suspended-users"],
  });

  // Fetch active users (para seleção)
  const { data: allUsers, isLoading: isLoadingUsers } = useQuery<ActiveUser[]>({
    queryKey: ["/api/admin/users"],
    select: (data) => data?.filter((u: any) => !u.suspendedAt && u.email !== 'admin@agentezap.com') || [],
  });

  // Unsuspend mutation
  const unsuspendMutation = useMutation({
    mutationFn: async ({ userId, adminNote }: { userId: string; adminNote: string }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/unsuspend`, { adminNote });
    },
    onSuccess: () => {
      toast({
        title: "Suspensão removida",
        description: "A suspensão do usuário foi removida com sucesso.",
      });
      setShowUnsuspendDialog(false);
      setSelectedUser(null);
      setUnsuspendNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suspended-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao remover suspensão",
        variant: "destructive",
      });
    },
  });

  // Suspend mutation
  const suspendMutation = useMutation({
    mutationFn: async (data: { userId: string; violationType: string; reason: string; evidence?: string[]; refundAmount?: number }) => {
      return await apiRequest("POST", `/api/admin/users/${data.userId}/suspend`, {
        violationType: data.violationType,
        reason: data.reason,
        evidence: data.evidence,
        refundAmount: data.refundAmount,
      });
    },
    onSuccess: (_, variables) => {
      const userName = selectedUserToSuspend?.name || selectedUserToSuspend?.email;
      toast({
        title: "Usuário suspenso",
        description: `A conta de ${userName} foi suspensa com sucesso.`,
      });
      resetSuspendForm();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suspended-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao suspender",
        description: error.message || "Falha ao suspender usuário",
        variant: "destructive",
      });
    },
  });

  const resetSuspendForm = () => {
    setShowSuspendDialog(false);
    setSelectedUserToSuspend(null);
    setSuspendViolationType("");
    setSuspendReason("");
    setSuspendEvidence("");
    setSuspendRefund("");
  };

  const handleSuspend = () => {
    if (!selectedUserToSuspend || !suspendViolationType || !suspendReason) {
      toast({
        title: "Campos obrigatórios",
        description: "Selecione o usuário, tipo de violação e motivo da suspensão",
        variant: "destructive",
      });
      return;
    }

    const evidence = suspendEvidence.trim() 
      ? suspendEvidence.split('\n').filter(e => e.trim())
      : [];

    const refundAmount = suspendRefund ? parseFloat(suspendRefund) : undefined;

    suspendMutation.mutate({
      userId: selectedUserToSuspend.id,
      violationType: suspendViolationType,
      reason: suspendReason,
      evidence,
      refundAmount,
    });
  };

  // Filter users by search term
  const filteredUsers = suspendedUsers?.filter((user) => {
    const search = searchTerm.toLowerCase();
    return (
      user.email?.toLowerCase().includes(search) ||
      user.name?.toLowerCase().includes(search) ||
      user.phone?.includes(search) ||
      user.suspensionReason?.toLowerCase().includes(search)
    );
  });

  const handleUnsuspend = () => {
    if (!selectedUser) return;
    unsuspendMutation.mutate({ userId: selectedUser.id, adminNote: unsuspendNote });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-red-200 bg-red-50/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-500 rounded-lg">
                <ShieldAlert className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-red-800 flex items-center gap-2">
                  <Ban className="h-5 w-5" />
                  Usuários Suspensos
                </CardTitle>
                <CardDescription className="text-red-600">
                  Gerenciar contas suspensas por violação de políticas
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => refetch()}
                className="border-red-300 hover:bg-red-100"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
              <Button 
                size="sm"
                onClick={() => setShowSuspendDialog(true)}
                className="bg-red-600 hover:bg-red-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Suspender Usuário
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Suspensos</p>
                <p className="text-2xl font-bold text-red-600">
                  {suspendedUsers?.length || 0}
                </p>
              </div>
              <Ban className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Serviços Religiosos</p>
                <p className="text-2xl font-bold text-orange-600">
                  {suspendedUsers?.filter(u => u.suspensionType === 'religious_services').length || 0}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Com Reembolso</p>
                <p className="text-2xl font-bold text-green-600">
                  {suspendedUsers?.filter(u => u.refundedAt).length || 0}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Última Semana</p>
                <p className="text-2xl font-bold text-blue-600">
                  {suspendedUsers?.filter(u => {
                    const suspended = new Date(u.suspendedAt);
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return suspended > weekAgo;
                  }).length || 0}
                </p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por email, nome, telefone ou motivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">
                Nenhum usuário suspenso
              </p>
              <p className="text-sm text-muted-foreground">
                {searchTerm ? "Tente uma busca diferente" : "Não há contas suspensas no momento"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Tipo de Violação</TableHead>
                  <TableHead>Data da Suspensão</TableHead>
                  <TableHead>Reembolso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers?.map((user) => (
                  <TableRow key={user.id} className="bg-red-50/30 hover:bg-red-50/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-full">
                          <User className="h-4 w-4 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium">{user.name || "Sem nome"}</p>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </div>
                          {user.phone && (
                            <p className="text-xs text-muted-foreground">{user.phone}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {getViolationBadge(user.suspensionType)}
                        <p className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {user.suspensionReason}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm">
                            {new Date(user.suspendedAt).toLocaleDateString('pt-BR')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(user.suspendedAt), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.refundedAt ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          <span>
                            R$ {user.refundAmount?.toFixed(2) || "0.00"}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="outline">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setShowDetailsDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setShowUnsuspendDialog(true);
                          }}
                          className="text-green-600 border-green-300 hover:bg-green-50"
                        >
                          <Undo className="h-4 w-4 mr-1" />
                          Reverter
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="h-5 w-5" />
              Detalhes da Suspensão
            </DialogTitle>
            <DialogDescription>
              Informações completas sobre a suspensão do usuário
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Usuário</Label>
                  <p className="font-medium">{selectedUser.name || "Sem nome"}</p>
                  <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Tipo de Violação</Label>
                    <div className="mt-1">{getViolationBadge(selectedUser.suspensionType)}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Data da Suspensão</Label>
                    <p className="text-sm">
                      {new Date(selectedUser.suspendedAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Motivo da Suspensão</Label>
                <p className="text-sm mt-1 p-3 bg-red-50 rounded border border-red-200">
                  {selectedUser.suspensionReason}
                </p>
              </div>
              {selectedUser.violationDescription && (
                <div>
                  <Label className="text-xs text-muted-foreground">Descrição da Violação</Label>
                  <p className="text-sm mt-1">{selectedUser.violationDescription}</p>
                </div>
              )}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <Label className="text-xs text-muted-foreground">Status do Reembolso</Label>
                  <p className="text-sm font-medium">
                    {selectedUser.refundedAt 
                      ? `R$ ${selectedUser.refundAmount?.toFixed(2)} - ${new Date(selectedUser.refundedAt).toLocaleDateString('pt-BR')}`
                      : "Pendente"
                    }
                  </p>
                </div>
                {selectedUser.refundedAt && (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsuspend Dialog */}
      <Dialog open={showUnsuspendDialog} onOpenChange={setShowUnsuspendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Undo className="h-5 w-5" />
              Reverter Suspensão
            </DialogTitle>
            <DialogDescription>
              Remover a suspensão do usuário e restaurar acesso à plataforma
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <strong>Atenção:</strong> Isso restaurará o acesso do usuário {selectedUser.email} à plataforma.
                </p>
              </div>
              <div>
                <Label htmlFor="unsuspend-note">Motivo da reversão (opcional)</Label>
                <Textarea
                  id="unsuspend-note"
                  placeholder="Descreva o motivo para reverter a suspensão..."
                  value={unsuspendNote}
                  onChange={(e) => setUnsuspendNote(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnsuspendDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleUnsuspend} 
              disabled={unsuspendMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {unsuspendMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remover Suspensão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Suspend Dialog */}
      <Dialog open={showSuspendDialog} onOpenChange={(open) => { if (!open) resetSuspendForm(); else setShowSuspendDialog(true); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="h-5 w-5" />
              Suspender Usuário
            </DialogTitle>
            <DialogDescription>
              Aplicar suspensão por violação de políticas. A IA e follow-ups serão desativados automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Seleção de usuário */}
            <div className="space-y-2">
              <Label>Selecionar Usuário <span className="text-red-500">*</span></Label>
              <Popover open={userComboOpen} onOpenChange={setUserComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={userComboOpen}
                    className="w-full justify-between"
                  >
                    {selectedUserToSuspend ? (
                      <span className="truncate">
                        {selectedUserToSuspend.name || selectedUserToSuspend.email}
                        <span className="text-muted-foreground ml-2 text-xs">
                          ({selectedUserToSuspend.email})
                        </span>
                      </span>
                    ) : (
                      "Buscar usuário por nome ou email..."
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[500px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar usuário..." />
                    <CommandList>
                      <CommandEmpty>Nenhum usuário encontrado.</CommandEmpty>
                      <CommandGroup heading="Usuários ativos">
                        {isLoadingUsers ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin" />
                          </div>
                        ) : (
                          allUsers?.map((user) => (
                            <CommandItem
                              key={user.id}
                              value={`${user.name} ${user.email}`}
                              onSelect={() => {
                                setSelectedUserToSuspend(user);
                                setUserComboOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedUserToSuspend?.id === user.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="font-medium">{user.name || "Sem nome"}</span>
                                <span className="text-xs text-muted-foreground">{user.email}</span>
                              </div>
                              {user.hasActiveSubscription && (
                                <Badge variant="secondary" className="ml-auto text-xs">
                                  Assinante
                                </Badge>
                              )}
                            </CommandItem>
                          ))
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedUserToSuspend && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200 mt-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-red-600" />
                    <div>
                      <p className="font-medium text-red-800">{selectedUserToSuspend.name || "Sem nome"}</p>
                      <p className="text-xs text-red-600">{selectedUserToSuspend.email}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tipo de violação */}
            <div className="space-y-2">
              <Label>Tipo de Violação <span className="text-red-500">*</span></Label>
              <Select value={suspendViolationType} onValueChange={setSuspendViolationType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo de violação" />
                </SelectTrigger>
                <SelectContent>
                  {violationTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex flex-col">
                        <span>{type.label}</span>
                        <span className="text-xs text-muted-foreground">{type.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Motivo da suspensão */}
            <div className="space-y-2">
              <Label>Motivo da Suspensão <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Descreva detalhadamente o motivo da suspensão. Ex: Violação dos Termos de Uso - Seção 3.1.1: Oferta de serviços religiosos e esotéricos..."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Este motivo será exibido ao usuário quando acessar o dashboard.
              </p>
            </div>

            {/* Evidências (opcional) */}
            <div className="space-y-2">
              <Label>Evidências (opcional)</Label>
              <Textarea
                placeholder="Cole aqui prints de conversa, links ou outras evidências. Uma por linha..."
                value={suspendEvidence}
                onChange={(e) => setSuspendEvidence(e.target.value)}
                rows={4}
                className="resize-none font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Cada linha será tratada como uma evidência separada.
              </p>
            </div>

            {/* Valor de reembolso (opcional) */}
            <div className="space-y-2">
              <Label>Valor de Reembolso (opcional)</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">R$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={suspendRefund}
                  onChange={(e) => setSuspendRefund(e.target.value)}
                  className="max-w-[150px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Registra o valor do reembolso para controle interno.
              </p>
            </div>

            {/* Preview */}
            {selectedUserToSuspend && suspendViolationType && suspendReason && (
              <div className="p-4 bg-gray-50 rounded-lg border space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">PRÉVIA DA SUSPENSÃO</Label>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Usuário:</span>
                    <p className="font-medium">{selectedUserToSuspend.name || selectedUserToSuspend.email}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tipo:</span>
                    <div className="mt-1">{getViolationBadge(suspendViolationType)}</div>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-sm">Motivo:</span>
                  <p className="text-sm mt-1 p-2 bg-red-50 rounded border border-red-200">
                    {suspendReason}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center gap-2 pt-4 border-t">
            <div className="flex-1 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3 inline mr-1" />
              Esta ação desativará imediatamente a IA e follow-ups do usuário.
            </div>
            <Button variant="outline" onClick={resetSuspendForm}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSuspend} 
              disabled={suspendMutation.isPending || !selectedUserToSuspend || !suspendViolationType || !suspendReason}
              className="bg-red-600 hover:bg-red-700"
            >
              {suspendMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Ban className="h-4 w-4 mr-2" />
              Suspender Usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
