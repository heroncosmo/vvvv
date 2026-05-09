import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bot, Eye, EyeOff, Loader2, Lock, Mail, Users } from "lucide-react";

import { apiRequest, queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginMode = "principal" | "membro";

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex-1 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export function AuthLoginTabs() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  const activeMode = useMemo<LoginMode>(
    () => (location === "/membro-login" ? "membro" : "principal"),
    [location],
  );

  const [isOwnerLoading, setIsOwnerLoading] = useState(false);
  const [isPasswordResetLoading, setIsPasswordResetLoading] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");

  const [memberEmail, setMemberEmail] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [showMemberPassword, setShowMemberPassword] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const memberToken = localStorage.getItem("memberToken");
        if (memberToken) {
          setLocation("/conversas");
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          setLocation("/dashboard");
        }
      } catch {}
    })();
  }, [setLocation]);

  const memberLoginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/api/team-members/login", data);
      return response.json();
    },
    onSuccess: async (data) => {
      try {
        await supabase.auth.signOut();
      } catch {}

      queryClient.clear();
      localStorage.setItem("memberToken", data.token);
      localStorage.setItem("memberData", JSON.stringify(data.member));

      toast({
        title: "Login realizado com sucesso.",
        description: `Bem-vindo(a), ${data.member.name}.`,
      });

      window.location.assign("/conversas");
    },
    onError: (error: Error) => {
      toast({
        title: "Não foi possível entrar",
        description: error.message || "Email ou senha inválidos.",
        variant: "destructive",
      });
    },
  });

  const changeMode = (mode: LoginMode) => {
    if (mode === activeMode) return;
    setLocation(mode === "membro" ? "/membro-login" : "/login");
  };

  const handleOwnerLogin = async (event: FormEvent) => {
    event.preventDefault();
    setIsOwnerLoading(true);

    try {
      localStorage.removeItem("memberToken");
      localStorage.removeItem("memberData");

      const { data, error } = await supabase.auth.signInWithPassword({
        email: ownerEmail,
        password: ownerPassword,
      });

      if (error) {
        toast({
          title: "Erro ao fazer login",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (data.session) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });

        toast({
          title: "Login realizado com sucesso!",
          description: "Bem-vindo de volta!",
        });

        setLocation("/dashboard");
      }
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao fazer login. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsOwnerLoading(false);
    }
  };

  const handleOwnerPasswordReset = async () => {
    const email = ownerEmail.trim();

    if (!email) {
      toast({
        title: "Informe seu email",
        description: "Digite o email da sua conta principal para receber o link.",
        variant: "destructive",
      });
      return;
    }

    setIsPasswordResetLoading(true);

    try {
      await apiRequest("POST", "/api/auth/password-reset", { email });
      toast({
        title: "Link enviado",
        description: "Confira sua caixa de entrada para redefinir a senha.",
      });
    } catch {
      toast({
        title: "Erro ao enviar link",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    } finally {
      setIsPasswordResetLoading(false);
    }
  };

  const handleMemberLogin = (event: FormEvent) => {
    event.preventDefault();

    if (!memberEmail.trim() || !memberPassword.trim()) {
      toast({
        title: "Preencha email e senha.",
        variant: "destructive",
      });
      return;
    }

    memberLoginMutation.mutate({
      email: memberEmail.trim(),
      password: memberPassword,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex flex-col items-center space-y-2 text-center">
            <div className="flex items-center gap-2">
              <Bot className="h-8 w-8 text-primary" />
              <span className="text-2xl font-semibold">AgenteZap</span>
            </div>
            <div>
              <CardTitle className="text-2xl">Entrar</CardTitle>
              <CardDescription>Escolha como deseja acessar sua conta.</CardDescription>
            </div>
          </div>

          <div className="rounded-3xl bg-muted/40 p-1">
            <div className="flex items-center gap-1">
              <TabButton
                active={activeMode === "principal"}
                label="Login principal"
                onClick={() => changeMode("principal")}
              />
              <TabButton
                active={activeMode === "membro"}
                label="Membro"
                onClick={() => changeMode("membro")}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {activeMode === "principal" ? (
            <form onSubmit={handleOwnerLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="owner-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="owner-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={ownerEmail}
                    onChange={(event) => setOwnerEmail(event.target.value)}
                    className="pl-10"
                    required
                    disabled={isOwnerLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="owner-password">Senha</Label>
                  <button
                    type="button"
                    onClick={handleOwnerPasswordReset}
                    className="text-sm font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-60"
                    disabled={isOwnerLoading || isPasswordResetLoading}
                  >
                    {isPasswordResetLoading ? "Enviando..." : "Esqueci minha senha"}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="owner-password"
                    type="password"
                    placeholder="••••••••"
                    value={ownerPassword}
                    onChange={(event) => setOwnerPassword(event.target.value)}
                    className="pl-10"
                    required
                    disabled={isOwnerLoading}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isOwnerLoading}>
                {isOwnerLoading ? "Entrando..." : "Entrar"}
              </Button>

              <div className="pt-1 text-center text-sm">
                <span className="text-muted-foreground">Não tem conta? </span>
                <button
                  type="button"
                  onClick={() => setLocation("/cadastro")}
                  className="font-medium text-primary hover:underline"
                >
                  Criar conta
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleMemberLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="member-email">Email</Label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="member-email"
                    type="email"
                    value={memberEmail}
                    onChange={(event) => setMemberEmail(event.target.value)}
                    placeholder="voce@empresa.com"
                    className="pl-10"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="member-password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="member-password"
                    type={showMemberPassword ? "text" : "password"}
                    value={memberPassword}
                    onChange={(event) => setMemberPassword(event.target.value)}
                    placeholder="Digite sua senha"
                    className="pl-10 pr-10"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowMemberPassword((current) => !current)}
                  >
                    {showMemberPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={memberLoginMutation.isPending}>
                {memberLoginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar como membro"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
