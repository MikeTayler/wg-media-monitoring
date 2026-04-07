import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getDb, query } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALLOWED_KEYS = new Set([
  "cron_enabled",
  "cron_ingest_time",
  "cron_digest_time",
  "cron_timezone",
]);

/** All settings as a key-value object. */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rows = await query("SELECT key, value, updated_at FROM settings ORDER BY key");

  const settings: Record<string, string> = {};
  for (const r of rows) {
    settings[String(r.key)] = String(r.value);
  }

  return NextResponse.json({ ok: true, settings });
}

/** Update a single setting. Body: { key, value }. */
export async function PUT(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { key, value } = (body ?? {}) as { key?: unknown; value?: unknown };

  if (typeof key !== "string" || key.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "key is required" }, { status: 400 });
  }
  if (typeof value !== "string") {
    return NextResponse.json({ ok: false, error: "value must be a string" }, { status: 400 });
  }
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json(
      { ok: false, error: `Key not allowed. Valid keys: ${Array.from(ALLOWED_KEYS).join(", ")}` },
      { status: 400 }
    );
  }

  const sql = getDb();
  const updated = await sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${key}, ${value}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = now()
    RETURNING key, value, updated_at
  `;

  return NextResponse.json({ ok: true, setting: updated[0] });
}
