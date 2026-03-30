import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { runDigestPipeline } from "@/lib/digest/pipeline";
import { recordDigestRun, recordPipelineError } from "@/lib/status/store";

export const dynamic = "force-dynamic";

/**
 * Daily digest: keyword match → AI score → summaries → Mailgun.
 * Auth: `Authorization: Bearer`, `x-cron-secret`, or `?secret=` — see `@/lib/api/cron-auth`.
 * `?dry_run=true` — preview JSON only; does not send email or update last-digest status.
 * `?solo_test=true` — send/preview only to `DIGEST_SOLO_TEST_EMAIL` (full digest content).
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
  const soloTest = url.searchParams.get("solo_test") === "true";

  try {
    const result = await runDigestPipeline({ dryRun, soloTest });

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
        soloTest: result.soloTest ?? false,
        previewRecipient: result.previewRecipient,
        previewHtml: result.previewHtml,
        stats,
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      soloTest: result.soloTest ?? false,
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
