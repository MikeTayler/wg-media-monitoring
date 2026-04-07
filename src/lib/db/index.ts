import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";

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
