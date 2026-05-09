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
  const { data: assignedPlanData } = useQuery<AssignedPlanResponse>({
    queryKey: ["/api/user/assigned-plan"],
  });
  const { data: accessStatus } = useQuery<AccessStatusGateData>({
    queryKey: ["/api/access-status"],
  });
  
  const plan = assignedPlanData?.plan;
  const planName = plan?.nome || "Plano Ilimitado";
  const rawValue = (plan as any)?.valor ?? (plan as any)?.preco;
  const planValue = rawValue != null 
    ? `R$${Number(rawValue).toFixed(2).replace('.', ',')}` 
    : "R$99,99";

  if (accessStatus?.accessStatus === "trial") {
    return null;
  }
  
  return (
    <Link href="/plans">
      <div className="bg-gradient-to-r from-blue-600 to-violet-600 text-white p-3 flex items-center justify-between cursor-pointer shadow-md rounded-md">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 animate-pulse" />
          <span className="text-sm font-bold">{planName} {planValue}</span>
        </div>
        <span className="text-xs bg-white/20 px-2 py-1 rounded hover:bg-white/30 transition-colors">
          Assinar
        </span>
      </div>
    </Link>
  );
}

export function UpgradeSidebarButton() {
  const { data: assignedPlanData } = useQuery<AssignedPlanResponse>({
    queryKey: ["/api/user/assigned-plan"],
  });
  
  const plan = assignedPlanData?.plan;
  const planName = plan?.nome || "Plano Ilimitado";
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
