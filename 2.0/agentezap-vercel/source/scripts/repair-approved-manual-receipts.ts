import { repairApprovedManualReceipts } from "../server/manualReceiptRepairService";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--apply");
  const userIdFlagIndex = args.findIndex((value) => value === "--user-id");
  const userId = userIdFlagIndex >= 0 ? args[userIdFlagIndex + 1] : undefined;

  const summary = await repairApprovedManualReceipts({
    dryRun,
    userId,
  });

  console.log(JSON.stringify({
    mode: dryRun ? "dry-run" : "apply",
    userId: userId || null,
    summary,
  }, null, 2));

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
