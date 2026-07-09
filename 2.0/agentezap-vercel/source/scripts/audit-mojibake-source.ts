import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isLikelyMojibake, repairMojibakeText } from "../shared/mojibake";

type Finding = {
  file: string;
  line: number;
  before: string;
  after: string;
};

const cwd = process.cwd();
const includeRoots = ["client/src", "server", "shared", "scripts"];
const includeExtensions = new Set([".ts", ".tsx", ".md"]);
const excludePatterns = [
  ".backup",
  ".playwright-cli/",
  "node_modules/",
  "dist/",
  "output/",
  "logs/",
  ".openclaw/",
  ".kilocode/",
  "scripts/validate-mojibake-repair.ts",
];

function isIncludedFile(filePath: string): boolean {
  if (!includeRoots.some((root) => filePath === root || filePath.startsWith(`${root}/`))) {
    return false;
  }

  if (!includeExtensions.has(path.extname(filePath))) {
    return false;
  }

  return !excludePatterns.some((pattern) => filePath.includes(pattern));
}

const trackedFiles = execFileSync("git", ["ls-files"], {
  cwd,
  encoding: "utf-8",
})
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter(isIncludedFile);

function auditFile(filePath: string): Finding[] {
  const content = fs.readFileSync(path.join(cwd, filePath), "utf-8");

  return content
    .split(/\r?\n/)
    .map((line, index) => {
      if (!isLikelyMojibake(line)) {
        return null;
      }

      const repaired = repairMojibakeText(line);
      if (repaired === line) {
        return null;
      }

      return {
        file: filePath,
        line: index + 1,
        before: line.trim(),
        after: repaired.trim(),
      } satisfies Finding;
    })
    .filter((finding): finding is Finding => Boolean(finding));
}

const findings = trackedFiles.flatMap(auditFile);
const fileCounts = new Map<string, number>();

for (const finding of findings) {
  fileCounts.set(finding.file, (fileCounts.get(finding.file) || 0) + 1);
}

console.log(
  JSON.stringify(
    {
      scannedFiles: trackedFiles.length,
      suspiciousLines: findings.length,
      topFiles: [...fileCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([file, count]) => ({ file, count })),
      samples: findings.slice(0, 40),
    },
    null,
    2,
  ),
);
