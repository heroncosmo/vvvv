import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { preparePwaAssets } from "./prepare-pwa-assets.js";
import { resolvePwaVersion } from "./pwa-version.js";

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function patchBaileysValidationFile() {
  const filePath = "node_modules/@whiskeysockets/baileys/lib/Utils/validate-connection.js";
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  if (!content.includes("Platform.WEB")) {
    return;
  }

  const patchedContent = content.split("Platform.WEB").join("Platform.MACOS");
  fs.writeFileSync(filePath, patchedContent, "utf8");
  console.log("PATCH: Platform.WEB -> MACOS OK");
}

function removePathSafe(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (error) {
    if (
      process.platform === "win32" &&
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EBUSY" &&
      targetPath.includes(path.join("dist", "public", "downloads"))
    ) {
      console.warn(`[build] Preservando arquivo bloqueado em ${targetPath}`);
      return;
    }

    throw error;
  }
}

function cleanDistDirectory() {
  const distDir = "dist";
  if (!fs.existsSync(distDir)) {
    return;
  }

  for (const entry of fs.readdirSync(distDir)) {
    const fullPath = path.join(distDir, entry);
    if (entry !== "public") {
      removePathSafe(fullPath);
      continue;
    }

    for (const publicEntry of fs.readdirSync(fullPath)) {
      if (publicEntry === "downloads") {
        continue;
      }
      removePathSafe(path.join(fullPath, publicEntry));
    }
  }
}

const mode = "production";
const version = resolvePwaVersion(mode);
process.env.NODE_ENV = mode;
process.env.PWA_VERSION = version;
process.env.VITE_PWA_VERSION = version;

const env = {
  ...process.env,
};

await preparePwaAssets(mode);

cleanDistDirectory();
patchBaileysValidationFile();

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
run(npxCommand, ["vite", "build"], env);
run(
  npxCommand,
  ["esbuild", "server/index.ts", "--platform=node", "--packages=external", "--bundle", "--format=esm", "--splitting", "--outdir=dist"],
  env,
);
run(
  npxCommand,
  [
    "esbuild",
    "api/http.ts",
    "--platform=node",
    "--packages=external",
    "--bundle",
    "--format=esm",
    "--outfile=dist/api/http.js",
  ],
  env,
);
