import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import {
  clearAllSentDigestUrls,
  clearLastDigestRunUrls,
  getDedupeLedgerStats,
} from "@/lib/digest/sent-urls";

export const dynamic = "force-dynamic";

/**
 * Dedupe ledger management.
 *
 * GET    — return ledger stats (total, active within window, last run).
 * DELETE — clear the ledger. `?scope=last` clears only the most recent digest
 *          run; `?scope=all` clears everything. Defaults to `last`.
 *
 * Auth: `Authorization: Bearer`, `x-cron-secret`, or `?secret=`.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getDedupeLedgerStats();
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const scope = new URL(request.url).searchParams.get("scope") ?? "last";
  if (scope !== "all" && scope !== "last") {
    return NextResponse.json(
      { ok: false, error: "scope must be 'all' or 'last'" },
      { status: 400 }
    );
  }

  try {
    if (scope === "all") {
      const cleared = await clearAllSentDigestUrls();
      return NextResponse.json({ ok: true, scope, cleared });
    }
    const { cleared, runId } = await clearLastDigestRunUrls();
    return NextResponse.json({ ok: true, scope, cleared, runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
