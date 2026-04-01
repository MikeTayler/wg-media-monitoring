import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { ARTICLES_JSON_PATH } from "@/lib/ingest/all";

export const dynamic = "force-dynamic";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Debug: raw `/tmp/articles.json` (same shape as written by ingest).
 * Auth: `?secret=`, `Authorization: Bearer`, or `x-cron-secret` — see `authorizeCron`.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: JSON_HEADERS }
    );
  }

  try {
    const raw = await readFile(ARTICLES_JSON_PATH, "utf8");
    const data = JSON.parse(raw) as unknown;
    return NextResponse.json(data, { headers: JSON_HEADERS });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      return NextResponse.json(
        { articles: [], updatedAt: null },
        { headers: JSON_HEADERS }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: JSON_HEADERS }
    );
  }
}
