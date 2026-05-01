import { neon, neonConfig } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";

// Next.js 14 extends the global `fetch` with caching. Override it for Neon
// so database queries are never served from the Next.js fetch cache.
neonConfig.fetchFunction = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, cache: "no-store" });

let _sql: NeonQueryFunction<false, false> | null = null;

/**
 * Returns a reusable Neon serverless SQL tagged-template function.
 * Uses `DATABASE_URL` from the environment (set in Vercel / `.env.local`).
 * Stateless HTTP queries — no persistent connection pool needed.
 */
export function getDb(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  _sql = neon(url);
  return _sql;
}

/**
 * Run a parameterised SQL query via `.query()` and return rows as a plain array.
 * Uses the `.query()` method (string + params) instead of the tagged-template
 * syntax to work around a Vercel bundling issue where tagged-template SELECT
 * results silently return length 0 for some queries.
 */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const sql = getDb();
  const rows = await sql.query(text, params);
  return rows as T[];
}

let _tablesEnsured = false;

/**
 * Creates articles, digest_sent_urls, pipeline_status tables if absent.
 * Called at the start of ingest and digest to guarantee the schema is present.
 * Runs once per process lifetime (cached via module-level flag).
 */
export async function ensureTablesExist(): Promise<void> {
  if (_tablesEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS articles (
      id           text PRIMARY KEY,
      source       text NOT NULL,
      url          text UNIQUE NOT NULL,
      title        text NOT NULL,
      body         text NOT NULL DEFAULT '',
      published_at timestamptz NOT NULL,
      ingested_at  timestamptz NOT NULL DEFAULT now(),
      paywalled    boolean NOT NULL DEFAULT false,
      batch_id     text NOT NULL
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_articles_batch_id ON articles(batch_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_articles_ingested_at ON articles(ingested_at)`);
  await query(`
    CREATE TABLE IF NOT EXISTS pipeline_status (
      key        text PRIMARY KEY,
      value      jsonb NOT NULL DEFAULT '{}',
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS digest_sent_urls (
      url_norm     text PRIMARY KEY,
      first_sent_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  _tablesEnsured = true;
}
