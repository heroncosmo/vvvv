import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { isLikelyMojibake, repairMojibakeText } from "../shared/mojibake";

type TableConfig = {
  key: string;
  table: string;
  idColumn: string;
  valueColumns: string[];
};

type RowRecord = Record<string, unknown>;

const TABLES: TableConfig[] = [
  { key: "ai_agent_config", table: "ai_agent_config", idColumn: "id", valueColumns: ["prompt"] },
  { key: "prompt_versions", table: "prompt_versions", idColumn: "id", valueColumns: ["prompt_content", "edit_summary"] },
  { key: "prompt_edit_chat", table: "prompt_edit_chat", idColumn: "id", valueColumns: ["content"] },
];

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const selectedTables = TABLES.filter((table) => args.size === 0 || args.has("--apply") || args.has(table.key));

if (selectedTables.length === 0) {
  console.error(`No tables selected. Use one of: ${TABLES.map((table) => table.key).join(", ")}`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function repairValue(value: unknown): string | null {
  if (typeof value !== "string" || !isLikelyMojibake(value)) {
    return null;
  }

  const repaired = repairMojibakeText(value);
  return repaired !== value ? repaired : null;
}

async function processTable(table: TableConfig, apply: boolean) {
  const result = await pool.query<RowRecord>(`SELECT ${[table.idColumn, ...table.valueColumns].join(", ")} FROM ${table.table}`);
  const samples: Array<Record<string, string>> = [];
  let suspiciousRows = 0;
  let repairableRows = 0;
  let updatedRows = 0;

  for (const row of result.rows) {
    const updates: Array<{ column: string; value: string }> = [];
    let rowIsSuspicious = false;

    for (const column of table.valueColumns) {
      const currentValue = row[column];
      if (typeof currentValue === "string" && isLikelyMojibake(currentValue)) {
        rowIsSuspicious = true;
      }

      const repaired = repairValue(currentValue);
      if (repaired == null) {
        continue;
      }

      updates.push({ column, value: repaired });
      if (samples.length < 12) {
        samples.push({
          table: table.table,
          column,
          before: String(currentValue).slice(0, 180),
          after: repaired.slice(0, 180),
        });
      }
    }

    if (rowIsSuspicious) {
      suspiciousRows += 1;
    }

    if (updates.length === 0) {
      continue;
    }

    repairableRows += 1;

    if (!apply) {
      continue;
    }

    const setClause = updates.map((entry, index) => `${entry.column} = $${index + 1}`).join(", ");
    const values = updates.map((entry) => entry.value);
    values.push(String(row[table.idColumn]));

    await pool.query(
      `UPDATE ${table.table} SET ${setClause} WHERE ${table.idColumn} = $${updates.length + 1}`,
      values,
    );
    updatedRows += 1;
  }

  return {
    table: table.table,
    scannedRows: result.rowCount,
    suspiciousRows,
    repairableRows,
    updatedRows,
    samples,
  };
}

async function main() {
  const reportDir = path.join(process.cwd(), "output", "mojibake-audits");
  fs.mkdirSync(reportDir, { recursive: true });

  const report = {
    mode: shouldApply ? "apply" : "audit",
    generatedAt: new Date().toISOString(),
    tables: [] as Array<Awaited<ReturnType<typeof processTable>>>,
  };

  try {
    if (shouldApply) {
      await pool.query("BEGIN");
    }

    for (const table of selectedTables) {
      report.tables.push(await processTable(table, shouldApply));
    }

    if (shouldApply) {
      await pool.query("COMMIT");
    }
  } catch (error) {
    if (shouldApply) {
      await pool.query("ROLLBACK");
    }
    throw error;
  } finally {
    await pool.end();
  }

  const reportPath = path.join(reportDir, `mojibake-db-${shouldApply ? "apply" : "audit"}-${Date.now()}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
