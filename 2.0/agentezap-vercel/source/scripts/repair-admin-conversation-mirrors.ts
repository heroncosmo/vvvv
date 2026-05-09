import "dotenv/config";
import { reconcileAdminNotificationOwnerMirrors } from "../server/adminConversationMirrorService";

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.findIndex((value) => value === flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--apply");
  const summaryOnly = args.includes("--summary-only");
  const limitArg = readFlagValue(args, "--limit");
  const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;

  const summary = await reconcileAdminNotificationOwnerMirrors({
    dryRun,
    userId: readFlagValue(args, "--user-id"),
    connectionId: readFlagValue(args, "--connection-id"),
    contactNumber: readFlagValue(args, "--contact-number"),
    adminId: readFlagValue(args, "--admin-id"),
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  const printableSummary = summaryOnly
    ? {
        scanned: summary.scanned,
        restored: summary.restored,
        alreadyRestored: summary.alreadyRestored,
        hiddenAdminConversations: summary.hiddenAdminConversations,
        errors: summary.errors,
      }
    : summary;

  console.log(JSON.stringify({
    mode: dryRun ? "dry-run" : "apply",
    summary: printableSummary,
  }, null, 2));

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
