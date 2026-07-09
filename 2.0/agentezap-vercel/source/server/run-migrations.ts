import 'dotenv/config';
import { db } from "./db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function runMigrations() {
  try {
    console.log("🔄 Running database migrations...");

    const migrationsDir = path.join(process.cwd(), "server", "migrations");
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migration directory not found: ${migrationsDir}`);
    }

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        filename varchar(255) NOT NULL UNIQUE,
        executed_at timestamp DEFAULT now()
      )
    `));

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      console.log("ℹ️ No SQL migrations found.");
      return;
    }

    const executedRows = await db.execute(sql.raw(`SELECT filename FROM schema_migrations`));
    const executed = new Set(
      Array.isArray(executedRows)
        ? executedRows.map((row: any) => String(row.filename))
        : ((executedRows as any)?.rows || []).map((row: any) => String(row.filename)),
    );

    for (const file of files) {
      if (executed.has(file)) {
        console.log(`⏭️ Skipping already executed migration: ${file}`);
        continue;
      }

      const migrationFile = path.join(migrationsDir, file);
      const migrationSQL = fs.readFileSync(migrationFile, "utf-8").trim();
      if (!migrationSQL) {
        console.log(`⏭️ Skipping empty migration: ${file}`);
        continue;
      }

      console.log(`📄 Executing migration: ${file}`);
      await db.execute(sql.raw(migrationSQL));
      await db.execute(sql.raw(`INSERT INTO schema_migrations (filename) VALUES ('${file.replace(/'/g, "''")}')`));
    }

    console.log("✅ Migrations completed successfully!");
  } catch (error) {
    console.error("❌ Error running migrations:", error);
    process.exit(1);
  }
}

runMigrations();
