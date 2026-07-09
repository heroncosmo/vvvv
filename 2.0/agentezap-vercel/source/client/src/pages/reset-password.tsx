import { type FormEvent, useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { useLocation } from "wouter";
import { Bot, Loader2, Lock } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ResetStatus = "checking" | "ready" | "invalid" | "success";

function getRecoveryType(rawType: string | null): EmailOtpType {
  return (rawType || "recovery") as EmailOtpType;
}

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [status, setStatus] = useState<ResetStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    const prepareRecoverySession = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const tokenHash = params.get("token_hash");
        const type = getRecoveryType(params.get("type"));
        const hasRecoveryHash = hashParams.get("type") === "recovery";
        let hasRecoveryProof = false;

        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });

          if (error) {
            if (mounted) {
              setStatus("invalid");
              toast({
                title: "Link inválido ou expirado",
                description: "Solicite um novo link para redefinir sua senha.",
                variant: "destructive",
              });
            }
            return;
          }

          hasRecoveryProof = true;
          window.history.replaceState({}, "", "/redefinir-senha");
        }

        await new Promise((resolve) => setTimeout(resolve, 120));

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;
        setStatus(session?.user && (hasRecoveryProof || hasRecoveryHash) ? "ready" : "invalid");
      } catch {
        if (mounted) {
          setStatus("invalid");
        }
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" && session?.user) {
        setStatus("ready");
      }
    });

    void prepareRecoverySession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [toast]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (password.length < 6) {
      toast({
        title: "Senha muito curta",
        description: "Use pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "As senhas não conferem",
        description: "Digite a mesma senha nos dois campos.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast({
          title: "Não foi possível alterar a senha",
          description: "Solicite um novo link e tente novamente.",
          variant: "destructive",
        });
        return;
      }

      setStatus("success");
      toast({
        title: "Senha alterada",
        description: "Entre novamente usando sua nova senha.",
      });
      await supabase.auth.signOut();
      setTimeout(() => setLocation("/login"), 900);
    } catch {
      toast({
        title: "Erro ao alterar senha",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <Bot className="h-8 w-8 text-primary" />
              <span className="text-2xl font-semibold">AgenteZap</span>
            </div>
            <div>
              <CardTitle className="text-2xl">Redefinir senha</CardTitle>
              <CardDescription>Crie uma nova senha para acessar sua conta.</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {status === "checking" ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando link...
            </div>
          ) : status === "invalid" ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                O link de redefinição não está ativo. Solicite um novo link na tela de login.
              </p>
              <Button type="button" className="w-full" onClick={() => setLocation("/login")}>
                Voltar para o login
              </Button>
            </div>
          ) : status === "success" ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Sua senha foi alterada. Você será redirecionado para entrar novamente.
              </p>
              <Button type="button" className="w-full" onClick={() => setLocation("/login")}>
                Entrar
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pl-10"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="pl-10"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar nova senha"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
