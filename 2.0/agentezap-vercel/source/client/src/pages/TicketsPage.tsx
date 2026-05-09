import React from "react";
import { UserTicketList } from "@/components/tickets/UserTicketList";

export default function TicketsPage() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <UserTicketList />
    </div>
  );
}
