import React from "react";
import { AdminTicketList } from "@/components/tickets/AdminTicketList";
import { Link } from "wouter";

export default function AdminTicketsPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-slate-500 hover:text-slate-800">
            ← Voltar ao Painel
          </Link>
          <h1 className="text-xl font-bold">Gerenciamento de Tickets</h1>
        </div>
      </header>
      <main className="flex-1 p-6 overflow-auto">
        <AdminTicketList />
      </main>
    </div>
  );
}
