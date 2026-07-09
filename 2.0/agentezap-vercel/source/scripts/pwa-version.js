import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function normalizePath(targetPath) {
  const normalized = path.resolve(targetPath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function runGitCommand(command, cwd) {
  return execSync(command, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function readGitSha(projectRoot = repoRoot) {
  try {
    const gitRoot = runGitCommand("git rev-parse --show-toplevel", projectRoot);
    if (normalizePath(gitRoot) !== normalizePath(projectRoot)) {
      return "";
    }

    return runGitCommand("git rev-parse --short HEAD", projectRoot);
  } catch {
    return "";
  }
}

export function resolvePwaVersion(mode = "production") {
  const explicitVersion = (process.env.PWA_VERSION || "").trim();

  if (explicitVersion) {
    return explicitVersion;
  }

  const gitSha = readGitSha();
  if (gitSha) {
    return mode === "development" ? `${gitSha}-dev` : gitSha;
  }

  const envCommitVersion =
    (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT || "").trim();
  if (envCommitVersion) {
    return mode === "development" ? `${envCommitVersion}-dev` : envCommitVersion;
  }

  const fallback = Date.now().toString();
  return mode === "development" ? `dev-${fallback}` : `build-${fallback}`;
}

export function buildVersionedAsset(assetPath, version) {
  return `${assetPath}?v=${encodeURIComponent(version)}`;
}
