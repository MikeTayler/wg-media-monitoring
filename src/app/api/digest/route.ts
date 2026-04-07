import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { runDigestPipeline } from "@/lib/digest/pipeline";
import { recordDigestRun, recordPipelineError } from "@/lib/status/store";

export const dynamic = "force-dynamic";

/**
 * Daily digest: keyword match → AI score → summaries → Mailgun.
 * Auth: `Authorization: Bearer`, `x-cron-secret`, or `?secret=` — see `@/lib/api/cron-auth`.
 * `?dry_run=true`    — preview JSON only; does not send email or update last-digest status.
 * `?admin_only=true` — dashboard mode: send/preview aggregated admin digest only.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const adminOnly = url.searchParams.get("admin_only") === "true";

  try {
    const result = await runDigestPipeline({ dryRun, adminOnly });

    if (!result.ok) {
      try {
        await recordPipelineError("digest", result.error ?? "Digest failed");
      } catch {
        /* ignore */
      }
      return NextResponse.json(
        {
          ok: false,
          error: result.error ?? "Digest failed",
          stats: result.stats,
        },
        { status: 500 }
      );
    }

    const { stats } = result;

    if (!dryRun) {
      try {
        await recordDigestRun({
          recipientCount: stats.recipientsTargeted,
          emailsSent: stats.emailsSent,
        });
      } catch (persistErr) {
        console.error("[digest] Failed to persist status:", persistErr);
      }
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        adminOnly: result.adminOnly ?? false,
        previewRecipient: result.previewRecipient,
        previewHtml: result.previewHtml,
        stats,
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      adminOnly: result.adminOnly ?? false,
      stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[digest] Unhandled error:", message);
    try {
      await recordPipelineError("digest", message);
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
