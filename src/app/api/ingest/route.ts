import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/ingest/all";

export const dynamic = "force-dynamic";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  const q = url.searchParams.get("secret");
  const auth = request.headers.get("authorization");
  const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  return q === secret || bearer === secret;
}

/**
 * RSS ingestion entrypoint (Vercel Cron or manual call with `?secret=` or `Authorization: Bearer`).
 * Orchestrates `ingestAll()` in `@/lib/ingest/all`.
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
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ingest] ingestAll failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
