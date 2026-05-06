import { startWhatsAppGateway } from "./wa-gateway";

void startWhatsAppGateway().catch((error) => {
  console.error("[WA GATEWAY] Fatal startup error:", error);
  process.exit(1);
});
