import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { ingestAll } from "@/lib/ingest/all";
import { recordIngestSuccess, recordPipelineError } from "@/lib/status/store";

export const dynamic = "force-dynamic";

/**
 * RSS ingestion entrypoint (Vercel Cron or manual call).
 * Auth: `Authorization: Bearer`, `x-cron-secret`, or `?secret=` — see `@/lib/api/cron-auth`.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const result = await ingestAll();
    try {
      await recordIngestSuccess(result.totalUnique, result.errors ?? {});
    } catch (persistErr) {
      console.error("[ingest] Failed to persist status:", persistErr);
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ingest] ingestAll failed:", message);
    try {
      await recordPipelineError("ingest", message);
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
