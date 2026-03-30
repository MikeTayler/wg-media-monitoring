import { NextResponse } from "next/server";

/**
 * TODO: RSS ingestion entrypoint (triggered by Vercel Cron or manual call).
 * - Validate `CRON_SECRET` (e.g. query param or `Authorization` header) against `process.env.CRON_SECRET`; return 401 on mismatch.
 * - Iterate all source modules under `@/lib/sources/*`, fetch and parse each RSS feed with `rss-parser`.
 * - Use `cheerio` + `node-fetch` only when a feed lacks enough body text (per source notes in project.md).
 * - Deduplicate by article URL; persist articles to JSON file or in-memory store (PoC — no database).
 * - Record last successful run timestamp for the status page.
 * - If one source fails, log and continue with others — never fail the whole run.
 */

export async function GET() {
  return NextResponse.json(
    { ok: false, message: "Ingestion not implemented yet." },
    { status: 501 }
  );
}
