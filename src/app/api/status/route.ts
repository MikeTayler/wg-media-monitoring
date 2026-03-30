import { NextResponse } from "next/server";

/**
 * TODO: System health and last-run info (see `project.md`).
 * - Read last successful ingestion and digest timestamps from PoC storage (JSON / in-memory).
 * - Surface recent pipeline errors (ingest per-source failures, OpenRouter/Mailgun errors) with timestamps.
 * - Optionally validate `CRON_SECRET` if this route is only for operators/cron; or leave public read-only for the status page.
 */

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message: "Status not implemented yet.",
      lastIngestionAt: null,
      lastDigestAt: null,
      recentErrors: [],
    },
    { status: 501 }
  );
}
