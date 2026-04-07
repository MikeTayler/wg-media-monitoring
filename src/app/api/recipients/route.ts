import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type RecipientRow = { id: number; entity_id: number; email: string; enabled: boolean; entity_name: string };

/** Recipients grouped by entity. */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const rows = (await sql`
    SELECT r.id, r.entity_id, r.email, r.enabled, e.name AS entity_name
    FROM recipients r
    JOIN entities e ON e.id = r.entity_id
    ORDER BY r.entity_id, r.id
  `) as RecipientRow[];

  const grouped: Record<string, { entity_id: number; entity_name: string; recipients: Array<{ id: number; email: string; enabled: boolean }> }> = {};
  for (const r of rows) {
    const key = String(r.entity_id);
    if (!grouped[key]) {
      grouped[key] = { entity_id: r.entity_id, entity_name: r.entity_name, recipients: [] };
    }
    grouped[key].recipients.push({ id: r.id, email: r.email, enabled: r.enabled });
  }

  return NextResponse.json({ ok: true, groups: Object.values(grouped) });
}

/** Add a recipient. Body: { entity_id, email }. 409 on duplicate. */
export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { entity_id, email } = (body ?? {}) as { entity_id?: unknown; email?: unknown };

  if (typeof entity_id !== "number" || !Number.isInteger(entity_id)) {
    return NextResponse.json({ ok: false, error: "entity_id must be an integer" }, { status: 400 });
  }
  if (typeof email !== "string" || email.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });
  }

  const sql = getDb();

  const entity = await sql`SELECT id FROM entities WHERE id = ${entity_id}`;
  if (entity.length === 0) {
    return NextResponse.json({ ok: false, error: "Entity not found" }, { status: 404 });
  }

  try {
    const inserted = await sql`
      INSERT INTO recipients (entity_id, email)
      VALUES (${entity_id}, ${email.trim()})
      RETURNING id, entity_id, email, enabled
    `;
    return NextResponse.json({ ok: true, recipient: inserted[0] }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json({ ok: false, error: "Recipient already exists for this entity" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
