import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Edit,
  Eye,
  EyeOff,
  Key,
  Link2,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  UserCircle2,
  Users,
} from "lucide-react";

import { apiRequest, queryClient } from "@/lib/queryClient";
import { buildPublicAppUrl } from "@/lib/native-runtime";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TeamMember {
  id: string;
  ownerId: string;
  name: string;
  email: string;
  role: string;
  permissions: {
    canViewConversations: boolean;
    canSendMessages: boolean;
    canUseQuickReplies: boolean;
    canMoveKanban: boolean;
    canViewDashboard: boolean;
    canViewAgenda: boolean;
    canEditContacts: boolean;
    canViewPhoneNumbers: boolean;
  };
  isActive: boolean;
  avatarUrl?: string;
  signature?: string;
  signatureEnabled?: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

const defaultPermissions = {
  canViewConversations: true,
  canSendMessages: true,
  canUseQuickReplies: true,
  canMoveKanban: true,
  canViewDashboard: false,
  canViewAgenda: false,
  canEditContacts: false,
  canViewPhoneNumbers: false,
};

type MemberForm = {
  name: string;
  email: string;
  password: string;
  role: string;
  permissions: typeof defaultPermissions;
  isActive: boolean;
  signature: string;
  signatureEnabled: boolean;
};

type PasswordDialogResult = {
  generated: boolean;
  memberName: string;
  value: string;
};

const initialForm = (): MemberForm => ({
  name: "",
  email: "",
  password: "",
  role: "atendente",
  permissions: { ...defaultPermissions },
  isActive: true,
  signature: "",
  signatureEnabled: false,
});

const permissionLabels: Array<{
  key: keyof typeof defaultPermissions;
  label: string;
  helper: string;
}> = [
  {
    key: "canViewConversations",
    label: "Ver conversas",
    helper: "Permite abrir historico e acompanhar tickets do setor.",
  },
  {
    key: "canSendMessages",
    label: "Enviar mensagens",
    helper: "Permite responder manualmente e assumir atendimentos.",
  },
  {
    key: "canUseQuickReplies",
    label: "Usar respostas rapidas",
    helper: "Libera atalhos e mensagens prontas no atendimento.",
  },
  {
    key: "canMoveKanban",
    label: "Mover no Kanban",
    helper: "Permite alterar etapa operacional da conversa.",
  },
  {
    key: "canViewDashboard",
    label: "Ver dashboard",
    helper: "Abre metricas e painéis internos do dono.",
  },
  {
    key: "canViewAgenda",
    label: "Agenda Inteligente",
    helper: "Permite visualizar a agenda, compromissos e disponibilidade.",
  },
  {
    key: "canEditContacts",
    label: "Editar contatos",
    helper: "Permite ajustes cadastrais durante o atendimento.",
  },
  {
    key: "canViewPhoneNumbers",
    label: "Ver telefone",
    helper: "Quando desligado, o membro ve apenas o nome do contato na conversa.",
  },
];

function formatLastLogin(value?: string) {
  if (!value) {
    return "Nunca entrou";
  }

  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleBadge(role: string) {
  switch (role) {
    case "vendedor":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "suporte":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "supervisor":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

export default function TeamMembersManager() {
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [passwordMember, setPasswordMember] = useState<TeamMember | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordDialogValue, setShowPasswordDialogValue] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [passwordDialogValue, setPasswordDialogValue] = useState("");
  const [passwordDialogResult, setPasswordDialogResult] = useState<PasswordDialogResult | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [formData, setFormData] = useState<MemberForm>(initialForm);

  const loginUrl =
    typeof window !== "undefined" ? buildPublicAppUrl("/membro-login") : "/membro-login";

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const activeMembers = useMemo(() => members.filter((member) => member.isActive), [members]);
  const membersWithDashboard = useMemo(
    () => members.filter((member) => member.permissions?.canViewDashboard),
    [members],
  );

  const resetForm = () => {
    setFormData(initialForm());
    setEditingMember(null);
    setGeneratedPassword(null);
    setCopiedPassword(false);
    setShowPassword(false);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const closePasswordDialog = () => {
    setPasswordDialogOpen(false);
    setPasswordMember(null);
    setPasswordDialogValue("");
    setPasswordDialogResult(null);
    setShowPasswordDialogValue(false);
    setCopiedPassword(false);
  };

  const createMutation = useMutation({
    mutationFn: async (data: MemberForm) => {
      const response = await apiRequest("POST", "/api/team-members", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setGeneratedPassword(data.generatedPassword || null);
      toast({ title: "Membro criado com sucesso." });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar membro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MemberForm }) => {
      const response = await apiRequest("PUT", `/api/team-members/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      closeDialog();
      toast({ title: "Membro atualizado com sucesso." });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar membro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/team-members/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      toast({ title: "Membro removido." });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover membro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, newPassword }: { id: string; newPassword?: string }) => {
      const response = await apiRequest("POST", `/api/team-members/${id}/reset-password`, {
        newPassword,
      });
      return response.json();
    },
    onSuccess: (data) => {
      const nextPassword = typeof data?.newPassword === "string" ? data.newPassword.trim() : "";
      if (!nextPassword) {
        toast({
          title: "Senha não retornada",
          description: "A alteração foi concluída, mas a nova senha não voltou da API.",
          variant: "destructive",
        });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });

      if (passwordMember) {
        setPasswordDialogResult({
          generated: Boolean(data.generated),
          memberName: passwordMember.name,
          value: nextPassword,
        });
        setPasswordDialogValue("");
        setCopiedPassword(false);
        setPasswordDialogOpen(true);
      } else {
        setGeneratedPassword(nextPassword);
      }

      toast({ title: data.generated ? "Nova senha gerada." : "Senha atualizada." });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao redefinir senha",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleOpenDialog = (member?: TeamMember) => {
    if (member) {
      setEditingMember(member);
      setFormData({
        name: member.name,
        email: member.email,
        password: "",
        role: member.role,
        permissions: {
          ...defaultPermissions,
          ...(member.permissions || {}),
        },
        isActive: member.isActive,
        signature: member.signature || "",
        signatureEnabled: member.signatureEnabled || false,
      });
    } else {
      resetForm();
    }

    setDialogOpen(true);
  };

  const handleOpenPasswordDialog = (member: TeamMember) => {
    setPasswordMember(member);
    setPasswordDialogValue("");
    setPasswordDialogResult(null);
    setShowPasswordDialogValue(false);
    setCopiedPassword(false);
    setPasswordDialogOpen(true);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (editingMember) {
      updateMutation.mutate({ id: editingMember.id, data: formData });
      return;
    }

    createMutation.mutate(formData);
  };

  const handleCopyPassword = async () => {
    const passwordToCopy = generatedPassword || passwordDialogResult?.value;

    if (!passwordToCopy) {
      return;
    }

    await navigator.clipboard.writeText(passwordToCopy);
    setCopiedPassword(true);
    window.setTimeout(() => setCopiedPassword(false), 2000);
  };

  const handleCopyLoginUrl = async () => {
    await navigator.clipboard.writeText(loginUrl);
    toast({ title: "Link de login copiado." });
  };

  const handleSaveManualPassword = () => {
    if (!passwordMember) {
      return;
    }

    const nextPassword = passwordDialogValue.trim();
    if (nextPassword.length < 6) {
      toast({
        title: "Senha muito curta",
        description: "Use pelo menos 6 caracteres para a nova senha do membro.",
        variant: "destructive",
      });
      return;
    }

    resetPasswordMutation.mutate({ id: passwordMember.id, newPassword: nextPassword });
  };

  const handleGenerateMemberPassword = () => {
    if (!passwordMember) {
      return;
    }

    resetPasswordMutation.mutate({ id: passwordMember.id });
  };

  const pendingMutation =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    resetPasswordMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Operacao por membros
            </CardTitle>
            <CardDescription>
              Cada pessoa entra com o proprio login, recebe permissoes separadas e depois pode ser
              vinculada a um ou mais setores.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Ativos</p>
              <p className="mt-2 text-2xl font-semibold">{activeMembers.length}</p>
              <p className="text-sm text-muted-foreground">Membros aptos a assumir conversas.</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Com dashboard</p>
              <p className="mt-2 text-2xl font-semibold">{membersWithDashboard.length}</p>
              <p className="text-sm text-muted-foreground">Perfis com acesso a paineis internos.</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <p className="text-xs uppercase tracking-[0.14em] text-emerald-700">Login dedicado</p>
              <p className="mt-2 text-sm font-semibold">/membro-login</p>
              <p className="mt-1 text-sm text-emerald-800">
                Compartilhe esse acesso com cada atendente.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" />
              Fluxo recomendado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>1. Crie o membro e entregue a senha inicial.</p>
            <p>2. Vincule a pessoa aos setores em "Setores".</p>
            <p>3. Teste o login e confirme as permissoes reais.</p>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
              <p className="font-medium text-foreground">URL de acesso</p>
              <div className="mt-2 flex items-center gap-2 rounded-xl border bg-background px-3 py-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <code className="min-w-0 flex-1 truncate text-xs">{loginUrl}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopyLoginUrl}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserCircle2 className="h-5 w-5" />
              Cadastro de membros
            </CardTitle>
            <CardDescription>
              Organize logins, assinatura individual e permissoes do atendimento humano.
            </CardDescription>
          </div>

          <Dialog open={dialogOpen} onOpenChange={(open) => (!open ? closeDialog() : setDialogOpen(true))}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Novo membro
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingMember ? "Editar membro" : "Novo membro"}</DialogTitle>
                <DialogDescription>
                  {editingMember
                    ? "Atualize o acesso, o perfil operacional e a assinatura do membro."
                    : "Crie o login individual e defina o que essa pessoa pode fazer no sistema."}
                </DialogDescription>
              </DialogHeader>

              {generatedPassword ? (
                <div className="space-y-4 py-2">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-semibold text-emerald-900">Senha pronta para envio</p>
                    <p className="mt-1 text-sm text-emerald-800">
                      Guarde ou encaminhe essa senha agora. Ela nao volta a ser exibida depois.
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      <code className="flex-1 rounded-xl border bg-background px-3 py-2 text-base">
                        {generatedPassword}
                      </code>
                      <Button variant="outline" size="icon" onClick={handleCopyPassword}>
                        {copiedPassword ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                    Depois disso, o atendente pode entrar em <code>{loginUrl}</code> e voce finaliza o
                    vinculo aos setores na tela "Setores".
                  </div>

                  <Button className="w-full" onClick={closeDialog}>
                    Fechar
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5 py-2">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="member-name">Nome completo</Label>
                      <Input
                        id="member-name"
                        value={formData.name}
                        onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Ex.: Camila Rocha"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="member-email">Email</Label>
                      <Input
                        id="member-email"
                        type="email"
                        value={formData.email}
                        onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
                        placeholder="camila@empresa.com"
                        required
                      />
                    </div>
                  </div>

                  {!editingMember && (
                    <div className="space-y-2">
                      <Label htmlFor="member-password">Senha inicial</Label>
                      <div className="relative">
                        <Input
                          id="member-password"
                          type={showPassword ? "text" : "password"}
                          value={formData.password}
                          onChange={(event) =>
                            setFormData((current) => ({ ...current, password: event.target.value }))
                          }
                          placeholder="Deixe vazio para gerar automaticamente"
                          className="pr-10"
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowPassword((current) => !current)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                    <div className="space-y-2">
                      <Label>Cargo</Label>
                      <Select
                        value={formData.role}
                        onValueChange={(value) => setFormData((current) => ({ ...current, role: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o cargo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="atendente">Atendente</SelectItem>
                          <SelectItem value="vendedor">Vendedor</SelectItem>
                          <SelectItem value="suporte">Suporte</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Conta ativa</p>
                          <p className="text-xs text-muted-foreground">
                            Se desligar, o login continua salvo mas o atendente nao entra mais.
                          </p>
                        </div>
                        <Switch
                          checked={formData.isActive}
                          onCheckedChange={(checked) =>
                            setFormData((current) => ({ ...current, isActive: checked }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                    <div>
                      <p className="text-sm font-medium">Permissoes</p>
                      <p className="text-xs text-muted-foreground">
                        Ajuste o que esse login humano pode enxergar e executar.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {permissionLabels.map((permission) => (
                        <div
                          key={permission.key}
                          className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{permission.label}</p>
                            <p className="text-xs text-muted-foreground">{permission.helper}</p>
                          </div>
                          <Switch
                            checked={formData.permissions[permission.key]}
                            onCheckedChange={(checked) =>
                              setFormData((current) => ({
                                ...current,
                                permissions: {
                                  ...current.permissions,
                                  [permission.key]: checked,
                                },
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                    <div>
                      <p className="text-sm font-medium">Assinatura nas mensagens</p>
                      <p className="text-xs text-muted-foreground">
                        Use quando o cliente precisa saber qual atendente ou setor humano assumiu.
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Ativar assinatura</p>
                        <p className="text-xs text-muted-foreground">
                          Exibe o nome acima das mensagens enviadas manualmente.
                        </p>
                      </div>
                      <Switch
                        checked={formData.signatureEnabled}
                        onCheckedChange={(checked) =>
                          setFormData((current) => ({ ...current, signatureEnabled: checked }))
                        }
                      />
                    </div>

                    {formData.signatureEnabled && (
                      <div className="space-y-2">
                        <Label htmlFor="member-signature">Nome da assinatura</Label>
                        <Input
                          id="member-signature"
                          value={formData.signature}
                          onChange={(event) =>
                            setFormData((current) => ({ ...current, signature: event.target.value }))
                          }
                          placeholder="Ex.: Camila | Financeiro"
                          maxLength={100}
                        />
                        <div className="rounded-xl border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                          Exemplo:
                          <div className="mt-1 font-medium text-foreground">
                            *{formData.signature || "Camila | Financeiro"}:*
                          </div>
                          <div>Olá, vou assumir seu atendimento por aqui.</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={closeDialog}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {(createMutation.isPending || updateMutation.isPending) && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {editingMember ? "Salvar membro" : "Criar membro"}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>

          <Dialog
            open={passwordDialogOpen}
            onOpenChange={(open) => (!open ? closePasswordDialog() : setPasswordDialogOpen(true))}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Senha do membro</DialogTitle>
                <DialogDescription>
                  Gere uma nova senha ou defina manualmente o acesso de{" "}
                  <span className="font-medium text-foreground">
                    {passwordMember?.name || "membro selecionado"}
                  </span>
                  .
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-2">
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Login do membro
                  </p>
                  <p className="mt-2 font-medium text-foreground">{passwordMember?.email}</p>
                  <div className="mt-3 flex items-center gap-2 rounded-xl border bg-background px-3 py-2">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <code className="min-w-0 flex-1 truncate text-xs">{loginUrl}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleCopyLoginUrl}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {passwordDialogResult && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-semibold text-emerald-900">
                      {passwordDialogResult.generated
                        ? "Senha gerada para envio"
                        : "Senha manual salva com sucesso"}
                    </p>
                    <p className="mt-1 text-sm text-emerald-800">
                      {passwordDialogResult.memberName} agora entra com a senha abaixo.
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      <code className="flex-1 rounded-xl border bg-background px-3 py-2 text-base">
                        {passwordDialogResult.value}
                      </code>
                      <Button variant="outline" size="icon" onClick={handleCopyPassword}>
                        {copiedPassword ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="member-password-manual">Definir nova senha manualmente</Label>
                  <div className="relative">
                    <Input
                      id="member-password-manual"
                      type={showPasswordDialogValue ? "text" : "password"}
                      value={passwordDialogValue}
                      onChange={(event) => setPasswordDialogValue(event.target.value)}
                      placeholder="Minimo de 6 caracteres"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowPasswordDialogValue((current) => !current)}
                    >
                      {showPasswordDialogValue ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use esta opção quando voce quiser escolher a senha exata do atendente.
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={resetPasswordMutation.isPending}
                    onClick={handleGenerateMemberPassword}
                  >
                    {resetPasswordMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Key className="mr-2 h-4 w-4" />
                    )}
                    Gerar senha automatica
                  </Button>
                  <Button
                    type="button"
                    disabled={resetPasswordMutation.isPending || passwordDialogValue.trim().length < 6}
                    onClick={handleSaveManualPassword}
                  >
                    {resetPasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar nova senha
                  </Button>
                </div>

                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                  Depois de trocar a senha, o membro continua entrando em <code>{loginUrl}</code> com o
                  mesmo email.
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closePasswordDialog}>
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent>
          {members.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/70 py-12 text-center">
              <Users className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 font-medium">Nenhum membro criado ainda.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Cadastre os atendentes primeiro e depois distribua cada pessoa entre os setores.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ultimo login</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => {
                    const enabledPermissionCount = Object.values(member.permissions || {}).filter(Boolean).length;

                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{member.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {enabledPermissionCount} permissao(oes) ativas
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={roleBadge(member.role)}>
                            {member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={member.isActive ? "default" : "secondary"}>
                            {member.isActive ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatLastLogin(member.lastLoginAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              title="Gerenciar senha"
                              disabled={pendingMutation}
                              onClick={() => handleOpenPasswordDialog(member)}
                            >
                              <Key className="mr-2 h-4 w-4" />
                              Senha
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar membro"
                              onClick={() => handleOpenDialog(member)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Excluir membro"
                              disabled={pendingMutation}
                              onClick={() => {
                                if (window.confirm(`Excluir o membro "${member.name}"?`)) {
                                  deleteMutation.mutate(member.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
