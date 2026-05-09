import fs from "node:fs";
import path from "node:path";

import { repairMojibakeText } from "../shared/mojibake";

const KNOWN_TEXT_FIXES: Array<[string, string]> = [
  ["Ã ", "à"],
  ["Ã¢", "â"],
  ["âÅ¡ ï¸", "⚠️"],
  ["Ã  confirmação", "à confirmação"],
  ["Ã  vista", "à vista"],
  ["Innteligente", "Inteligente"],
];

function applyKnownTextFixes(value: string): string {
  let nextValue = value;

  for (const [from, to] of KNOWN_TEXT_FIXES) {
    nextValue = nextValue.split(from).join(to);
  }

  return nextValue;
}

function normalizeSourceText(value: string): string {
  return applyKnownTextFixes(repairMojibakeText(value));
}

function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const files = args.filter((arg) => arg !== "--write");

  if (files.length === 0) {
    console.error("Uso: tsx scripts/repair-source-mojibake.ts [--write] <arquivo>...");
    process.exit(1);
  }

  let changedFiles = 0;

  for (const file of files) {
    const absolutePath = path.resolve(file);
    const original = fs.readFileSync(absolutePath, "utf8");
    const repaired = normalizeSourceText(original);
    const changed = original !== repaired;

    if (changed && shouldWrite) {
      fs.writeFileSync(absolutePath, repaired, "utf8");
    }

    if (changed) {
      changedFiles += 1;
    }

    console.log(`${file}: ${changed ? (shouldWrite ? "updated" : "would-change") : "clean"}`);
  }

  console.log(`Arquivos alterados: ${changedFiles}`);
}

main();
