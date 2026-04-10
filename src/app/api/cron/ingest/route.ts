import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getDb } from "@/lib/db";
import { ingestAll } from "@/lib/ingest/all";
import { recordIngestSuccess, recordPipelineError } from "@/lib/status/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron-triggered article ingestion.
 *
 * Schedule is defined in vercel.json (static cron expression in UTC).
 * Changing the schedule requires redeployment with updated cron expressions.
 * The `cron_enabled` database setting controls whether the job actually
 * executes — toggle it from the admin dashboard without redeploying.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sql = getDb();
    const rows = await sql`SELECT value FROM settings WHERE key = 'cron_enabled'`;
    const enabled = rows[0]?.value === "true";

    if (!enabled) {
      console.log("[cron/ingest] Skipped — cron_enabled is false");
      return NextResponse.json({ ok: true, skipped: true, reason: "cron_enabled is false" });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/ingest] Failed to read cron_enabled setting:", message);
    return NextResponse.json({ ok: false, error: `DB check failed: ${message}` }, { status: 500 });
  }

  try {
    const result = await ingestAll();
    try {
      await recordIngestSuccess(result.totalUnique, result.errors ?? {});
    } catch (persistErr) {
      console.error("[cron/ingest] Failed to persist status:", persistErr);
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/ingest] ingestAll failed:", message);
    try {
      await recordPipelineError("ingest", message);
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
