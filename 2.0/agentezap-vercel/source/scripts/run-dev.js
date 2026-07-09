import { spawn } from "child_process";
import { preparePwaAssets } from "./prepare-pwa-assets.js";
import { resolvePwaVersion } from "./pwa-version.js";

const mode = "development";
const version = resolvePwaVersion(mode);

process.env.NODE_ENV = mode;
process.env.PWA_VERSION = version;
process.env.VITE_PWA_VERSION = version;

await preparePwaAssets(mode);

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(npxCommand, ["tsx", "server/index.ts"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
