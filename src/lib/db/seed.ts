/**
 * Seed script — run via: npx tsx src/lib/db/seed.ts
 * Idempotent: safe to run multiple times.
 *
 * Requires DATABASE_URL in the environment (or .env.local loaded by dotenv).
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { neon } from "@neondatabase/serverless";

/* ── Load .env.local if present (for local runs) ── */
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  /* no .env.local — rely on environment */
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local or export it.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

/* ── Schema ── */
const schemaPath = resolve(__dirname, "schema.sql");
const schemaSql = readFileSync(schemaPath, "utf8");

/* ── Entities to seed ── */
const ENTITIES = [
  "Le Va",
  "Pathways",
  "LinkPeople",
  "Te Pou",
  "Just a thought",
];

/* ── Default settings ── */
const DEFAULT_SETTINGS: Array<{ key: string; value: string }> = [
  { key: "cron_enabled", value: "false" },
  { key: "cron_ingest_time", value: "05:45" },
  { key: "cron_digest_time", value: "06:30" },
  { key: "cron_timezone", value: "Pacific/Auckland" },
];

async function main() {
  console.log("[seed] Creating tables…");
  for (const stmt of schemaSql.split(";").map((s) => s.trim()).filter(Boolean)) {
    await sql.query(stmt);
  }
  console.log("[seed] Tables OK.");

  /* ── Migrate: make entity_id nullable if it isn't already ── */
  console.log("[seed] Ensuring recipients.entity_id is nullable…");
  await sql.query(
    "ALTER TABLE recipients ALTER COLUMN entity_id DROP NOT NULL"
  );

  /* ── Migrate: replace old UNIQUE(entity_id, email) with COALESCE-based index ── */
  console.log("[seed] Ensuring unique index on recipients…");
  await sql.query(
    "ALTER TABLE recipients DROP CONSTRAINT IF EXISTS recipients_entity_id_email_key"
  );
  await sql.query(
    "DROP INDEX IF EXISTS recipients_entity_id_email_key"
  );
  await sql.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS recipients_entity_email_uniq ON recipients (COALESCE(entity_id, 0), email)"
  );

  console.log("[seed] Seeding entities…");
  for (const name of ENTITIES) {
    await sql`
      INSERT INTO entities (name)
      VALUES (${name})
      ON CONFLICT (name) DO NOTHING
    `;
  }
  console.log(`[seed] ${ENTITIES.length} entities ensured.`);

  console.log("[seed] Seeding default settings…");
  for (const { key, value } of DEFAULT_SETTINGS) {
    await sql`
      INSERT INTO settings (key, value)
      VALUES (${key}, ${value})
      ON CONFLICT (key) DO NOTHING
    `;
  }
  console.log(`[seed] ${DEFAULT_SETTINGS.length} settings ensured.`);

  console.log("[seed] Done.");
}

main().catch((err) => {
  console.error("[seed] Fatal:", err);
  process.exit(1);
});
