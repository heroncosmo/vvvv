/**
 * Entry point router for the different runtime modes.
 */
import "dotenv/config";

import { describeAppRuntimeProfile } from "./runtimeProfile";

const SERVICE_MODE = process.env.SERVICE_MODE || "monolith";
const BOOT_ID = new Date().toISOString();
const APP_RUNTIME_PROFILE = describeAppRuntimeProfile();

process.env.BOOT_ID = BOOT_ID;
process.env.APP_RUNTIME_PROFILE_EFFECTIVE = APP_RUNTIME_PROFILE;

console.log(`[BOOT] Starting server bootId=${BOOT_ID} mode=${SERVICE_MODE}`);
console.log(`[BOOT] runtimeProfile=${APP_RUNTIME_PROFILE}`);
console.log(
  `[BOOT] node=${process.version} env=${process.env.NODE_ENV || "unknown"} port=${process.env.PORT || "unknown"}`,
);
console.log(
  `[BOOT] railwayCommit=${process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT || "unknown"}`,
);

if (SERVICE_MODE === "proxy") {
  console.log("[PROXY MODE] Loading lightweight proxy module...");
  import("./proxy")
    .then(({ startProxy }) => {
      startProxy();
    })
    .catch((error) => {
      console.error("[PROXY MODE] Failed to start proxy:", error);
      process.exit(1);
    });
} else if (SERVICE_MODE === "wa-gateway") {
  console.log("[WA-GATEWAY MODE] Loading dedicated WhatsApp gateway...");
  import("./wa-gateway")
    .then(({ startWhatsAppGateway }) => {
      startWhatsAppGateway();
    })
    .catch((error) => {
      console.error("[WA-GATEWAY MODE] Failed to start:", error);
      process.exit(1);
    });
} else {
  console.log(`[${SERVICE_MODE.toUpperCase()} MODE] Loading full application...`);
  import("./full-app")
    .then(({ startFullApp }) => {
      startFullApp();
    })
    .catch((error) => {
      console.error(`[${SERVICE_MODE.toUpperCase()} MODE] Failed to start:`, error);
      process.exit(1);
    });
}
