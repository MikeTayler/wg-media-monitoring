import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getDb } from "@/lib/db";
import { runDigestPipeline } from "@/lib/digest/pipeline";
import { recordDigestRun, recordPipelineError } from "@/lib/status/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron-triggered daily digest email.
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
      console.log("[cron/digest] Skipped — cron_enabled is false");
      return NextResponse.json({ ok: true, skipped: true, reason: "cron_enabled is false" });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/digest] Failed to read cron_enabled setting:", message);
    return NextResponse.json({ ok: false, error: `DB check failed: ${message}` }, { status: 500 });
  }

  try {
    const result = await runDigestPipeline({ dryRun: false });

    if (!result.ok) {
      try {
        await recordPipelineError("digest", result.error ?? "Digest failed");
      } catch {
        /* ignore */
      }
      return NextResponse.json(
        { ok: false, error: result.error ?? "Digest failed", stats: result.stats },
        { status: 500 }
      );
    }

    try {
      await recordDigestRun({
        recipientCount: result.stats.recipientsTargeted,
        emailsSent: result.stats.emailsSent,
      });
    } catch (persistErr) {
      console.error("[cron/digest] Failed to persist status:", persistErr);
    }

    return NextResponse.json({ ok: true, stats: result.stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/digest] Unhandled error:", message);
    try {
      await recordPipelineError("digest", message);
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
