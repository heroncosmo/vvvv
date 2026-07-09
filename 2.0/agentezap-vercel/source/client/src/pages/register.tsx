import { ArrowRight, Bot, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

const RODRIGO_AGENT_CREATOR_PHONE = "5517991140696";
const WHATSAPP_TEXT = "Oi Rodrigo, quero criar meu agente no WhatsApp agora.";

export default function Register() {
  const whatsappUrl = `https://wa.me/${RODRIGO_AGENT_CREATOR_PHONE}?text=${encodeURIComponent(WHATSAPP_TEXT)}`;

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8">
        <header className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 text-white">
            <Bot className="h-6 w-6" aria-hidden="true" />
          </div>
          <span className="text-xl font-semibold tracking-normal">AgenteZap</span>
        </header>

        <section className="flex flex-1 items-center">
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-teal-700">
              Criacao direta no WhatsApp
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-zinc-950 sm:text-5xl">
              Seu agente agora e criado direto na conversa.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-600">
              Chame o AgenteZap no WhatsApp, explique seu negocio e o Rodrigo monta, testa e ajusta seu agente com voce por la.
            </p>
            <Button asChild size="lg" className="mt-8 h-12 rounded-md bg-teal-600 px-6 text-base font-semibold text-white hover:bg-teal-700">
              <a href={whatsappUrl}>
                <MessageCircle className="mr-2 h-5 w-5" aria-hidden="true" />
                Criar agente no WhatsApp agora
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
