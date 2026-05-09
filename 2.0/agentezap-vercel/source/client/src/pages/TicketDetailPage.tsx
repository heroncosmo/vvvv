import React from "react";
import { UserTicketChat } from "@/components/tickets/UserTicketChat";
import { useRoute } from "wouter";

export default function TicketDetailPage() {
  const [match, params] = useRoute("/tickets/:id");
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
      <UserTicketChat ticketId={ticketId} />
    </div>
  );
}
