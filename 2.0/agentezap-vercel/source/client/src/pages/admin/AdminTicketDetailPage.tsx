import React from "react";
import AdminTicketChat from "@/components/tickets/AdminTicketChat";
import { useRoute, useLocation } from "wouter";

export default function AdminTicketDetailPage() {
  const [match, params] = useRoute("/admin/tickets/:id");
  const [, setLocation] = useLocation();
  const ticketId = params?.id ? parseInt(params.id) : 0;

  if (!match || !ticketId) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-muted-foreground">Ticket não encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] p-4 md:p-6">
      <AdminTicketChat 
        ticketId={ticketId} 
        onBack={() => setLocation('/admin/tickets')}
      />
    </div>
  );
}
