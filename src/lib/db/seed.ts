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

/* ── Entities to seed (name → description) ── */
const ENTITIES: Array<{ name: string; description: string }> = [
  {
    name: "Le Va",
    description:
      "Le Va is a national organisation promoting Pacific peoples' wellbeing, with a focus on suicide prevention, mental health promotion, and Pasifika community resilience.",
  },
  {
    name: "Pathways",
    description:
      "Pathways provides mental health, addiction, and disability support services across New Zealand communities.",
  },
  {
    name: "LinkPeople",
    description:
      "LinkPeople delivers employment and vocational services for people with disabilities, mental health conditions, and other barriers to employment.",
  },
  {
    name: "Te Pou",
    description:
      "Te Pou is a national centre of evidence-based workforce development for the mental health, addiction, and disability sectors in New Zealand.",
  },
  {
    name: "Just a thought",
    description:
      "Just a thought (justathought.co.nz) is a free online therapy programme offering iCBT (internet cognitive behavioural therapy) for common mental health conditions.",
  },
  {
    name: "The Peoples Project",
    description:
      "The Peoples Project provides wraparound support services for people experiencing homelessness and housing instability in New Zealand.",
  },
  {
    name: "Wise Group",
    description:
      "Wise Group is the parent organisation overseeing Te Pou, Le Va, Pathways, LinkPeople, Just a Thought, and The Peoples Project. It spans mental health, addiction, disability, employment, and social services in Aotearoa New Zealand. CEO: Julie Nelson. Articles relevant to Wise Group include sector-wide government policy, funding announcements, regulatory changes, and cross-cutting developments affecting multiple Wise Group entities.",
  },
];

/* ── Default settings ── */
const DEFAULT_SETTINGS: Array<{ key: string; value: string }> = [
  { key: "cron_enabled", value: "false" },
  { key: "cron_ingest_time", value: "05:45" },
  { key: "cron_digest_time", value: "06:30" },
  { key: "cron_timezone", value: "Pacific/Auckland" },
  { key: "relevance_threshold", value: "40" },
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

  /* ── Migrate: rename Global → Wise Group if still present ── */
  console.log("[seed] Renaming 'Global' entity to 'Wise Group' if needed…");
  await sql.query("UPDATE entities SET name = 'Wise Group' WHERE name = 'Global'");

  /* ── Migrate: add description column if missing ── */
  console.log("[seed] Ensuring entities.description column…");
  await sql.query(
    "ALTER TABLE entities ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT ''"
  );

  console.log("[seed] Seeding entities…");
  for (const { name, description } of ENTITIES) {
    await sql`
      INSERT INTO entities (name, description)
      VALUES (${name}, ${description})
      ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
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
