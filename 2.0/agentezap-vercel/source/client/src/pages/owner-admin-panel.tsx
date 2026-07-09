import { useEffect, useState } from "react";
import AdminNotificationsPanel from "@/components/admin-notifications-panel";
import AdminOrdersPanel from "@/components/admin-orders-panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const VALID_SUB_TABS = [
  "agenda",
  "historico",
  "boasvindas",
  "teste",
  "pagamentos",
  "checkin",
  "desconectado",
  "broadcast",
  "pedidos",
  "config",
];

function readHashSubTab(): string {
  const rawHash = String(window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
  return VALID_SUB_TABS.includes(rawHash) ? rawHash : "agenda";
}

export default function OwnerAdminPanel() {
  const [subTab, setSubTab] = useState(readHashSubTab);
  const activeSection = subTab === "pedidos" ? "pedidos" : "mensagens";

  useEffect(() => {
    const handleHashChange = () => setSubTab(readHashSubTab());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const handleSubTabChange = (nextSubTab: string) => {
    setSubTab(nextSubTab);
    const nextHash = VALID_SUB_TABS.includes(nextSubTab) ? nextSubTab : "agenda";
    if (window.location.hash !== `#${nextHash}`) {
      window.history.replaceState({}, "", `${window.location.pathname}#${nextHash}`);
    }
  };

  const handleSectionChange = (nextSection: string) => {
    handleSubTabChange(nextSection === "pedidos" ? "pedidos" : "agenda");
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <Tabs value={activeSection} onValueChange={handleSectionChange}>
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 md:w-[420px]">
            <TabsTrigger value="mensagens">Mensagens</TabsTrigger>
            <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          </TabsList>
        </Tabs>

        {activeSection === "pedidos" ? (
          <AdminOrdersPanel apiBasePath="/api/owner-workspace" />
        ) : (
          <AdminNotificationsPanel
            defaultSubTab={subTab}
            onSubTabChange={handleSubTabChange}
            apiBasePath="/api/owner-workspace"
            title="Administrador"
            description="Agenda, histórico, boas-vindas, pagamentos, check-in, desconectado, broadcast e configuração dentro da conta principal."
            enableDraftBroadcasts={false}
            disableAiFields={false}
          />
        )}
      </div>
    </div>
  );
}
