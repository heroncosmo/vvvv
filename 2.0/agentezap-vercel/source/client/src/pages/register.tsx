import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { normalizeSignupPhone } from "@shared/phone";
import {
  captureAffiliateReferralFromSearch,
  clearAffiliateReferralCode,
  readAffiliateReferralCode,
  storeAffiliateReferralCode,
} from "@/lib/referral-tracking";

const DEFAULT_PHONE_COUNTRY_CODE = "55";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentCode = params.get("ref") || readAffiliateReferralCode();

    if (currentCode) {
      storeAffiliateReferralCode(currentCode);
    } else {
      captureAffiliateReferralFromSearch(window.location.search);
    }

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          setLocation("/dashboard");
        }
      } catch {}
    })();
  }, [setLocation]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const normalizedPhone = normalizeSignupPhone({
        phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
        phoneNationalNumber: phoneNumber,
      });

      if (!normalizedPhone) {
        toast({
          title: "Telefone inválido",
          description: "Informe DDD e celular. Exemplo: 61 99999-9999.",
          variant: "destructive",
        });
        return;
      }

      const planLinkSlug = sessionStorage.getItem("plan_link_slug");
      const referralCode = readAffiliateReferralCode();

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          phone: normalizedPhone,
          phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
          phoneNationalNumber: phoneNumber,
          planLinkSlug,
          referralCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Erro ao criar conta",
          description: data.message || "Ocorreu um erro ao criar sua conta",
          variant: "destructive",
        });
        return;
      }

      sessionStorage.removeItem("plan_link_slug");
      clearAffiliateReferralCode();

      toast({
        title: "Conta criada com sucesso!",
        description: "Fazendo login...",
      });

      if (typeof window !== "undefined") {
        const w = window as any;
        w.dataLayer = w.dataLayer || [];
        w.dataLayer.push({
          event: "signup_complete",
          email,
          phone: normalizedPhone,
          source: "landing_cadastro",
        });
      }

      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError || !loginData?.session) {
        toast({
          title: "Conta criada",
          description: "Finalize entrando com seu email e senha.",
        });
        setLocation("/login");
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation("/meu-agente-ia");
    } catch (error) {
      console.error("Erro ao criar conta:", error);
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao criar sua conta. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-8 h-8 text-primary" />
            <span className="font-semibold text-2xl">AgenteZap</span>
          </div>
          <CardTitle className="text-2xl">Criar Conta</CardTitle>
          <CardDescription>Preencha os dados abaixo para começar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo</Label>
              <Input
                id="name"
                type="text"
                placeholder="Seu nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone-number">Celular WhatsApp do seu negócio</Label>
              <Input
                id="phone-number"
                aria-label="Celular WhatsApp"
                type="tel"
                inputMode="tel"
                placeholder="61 99999-9999"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Criando conta..." : "Criar Conta"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <span className="text-muted-foreground">Já tem conta? </span>
            <button
              onClick={() => setLocation("/login")}
              className="text-primary hover:underline font-medium"
            >
              Faça login
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
