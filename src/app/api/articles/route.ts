import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Debug: articles from the Neon `articles` table.
 * Auth: `?secret=`, `Authorization: Bearer`, or `x-cron-secret` — see `authorizeCron`.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const articles = await query(
      "SELECT id, source, url, title, body, published_at, ingested_at, paywalled, batch_id FROM articles ORDER BY published_at DESC"
    );
    return NextResponse.json({ articles, updatedAt: articles[0]?.ingested_at ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
