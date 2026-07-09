import { Rocket } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Plan } from "@shared/schema";
import type { AccessStatusGateData } from "@/lib/subscription-gate";

interface AssignedPlanResponse {
  hasAssignedPlan: boolean;
  plan?: Plan & { valor?: number };
}

export function UpgradeBanner() {
  const { data: accessStatus } = useQuery<AccessStatusGateData>({
    queryKey: ["/api/access-status"],
  });

  if (accessStatus?.accessStatus === "active") {
    return null;
  }
  
  return (
    <Link href="/plans">
      <div
        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50"
        data-testid="mobile-upgrade-pill"
      >
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4" />
          <span className="whitespace-nowrap">Fazer upgrade</span>
        </div>
      </div>
    </Link>
  );
}

export function UpgradeSidebarButton() {
  const { data: assignedPlanData } = useQuery<AssignedPlanResponse>({
    queryKey: ["/api/user/assigned-plan"],
  });
  
  const plan = assignedPlanData?.plan;
  const planName = plan?.nome || "Plus";
  const rawValue = (plan as any)?.valor ?? (plan as any)?.preco;
  const planValue = rawValue != null 
    ? `R$${Number(rawValue).toFixed(2).replace('.', ',')}` 
    : "R$99,99";
  
  return (
    <Link href="/plans">
      <div className="flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left outline-hidden ring-sidebar-ring focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground hover:bg-sidebar-accent h-8 text-sm mt-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-700 hover:to-violet-700 hover:text-white transition-all duration-300 shadow-md font-bold justify-center cursor-pointer">
        <Rocket className="w-4 h-4 animate-pulse" />
        <span>{planName} {planValue}</span>
      </div>
    </Link>
  );
}
