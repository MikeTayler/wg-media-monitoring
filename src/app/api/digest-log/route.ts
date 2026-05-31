import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getRecentDigestRunLog } from "@/lib/digest/run-log";

export const dynamic = "force-dynamic";

/**
 * Per-entity article counts for recent digest sends, grouped by run.
 * Auth: `Authorization: Bearer`, `x-cron-secret`, or `?secret=`.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const runs = await getRecentDigestRunLog(30);
    return NextResponse.json({ ok: true, runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
