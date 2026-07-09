import React from "react";
import { UserTicketCreate } from "@/components/tickets/UserTicketCreate";

export default function TicketCreatePage() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <UserTicketCreate />
    </div>
  );
}
