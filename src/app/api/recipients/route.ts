import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Recipients grouped by entity, with an "Admin" group for entity_id IS NULL. */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const rows = await sql`
    SELECT r.id, r.entity_id, r.email, r.enabled, e.name AS entity_name
    FROM recipients r
    LEFT JOIN entities e ON e.id = r.entity_id
    ORDER BY r.entity_id NULLS FIRST, r.id
  `;

  type Group = { entity_id: number | null; entity_name: string; recipients: Array<{ id: number; email: string; enabled: boolean }> };
  const groups: Group[] = [];
  const groupMap = new Map<string, Group>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const eid = r.entity_id == null ? null : Number(r.entity_id);
    const key = eid == null ? "__admin__" : String(eid);
    if (!groupMap.has(key)) {
      const g: Group = {
        entity_id: eid,
        entity_name: eid == null ? "Admin" : (r.entity_name ? String(r.entity_name) : "Unknown"),
        recipients: [],
      };
      groupMap.set(key, g);
      groups.push(g);
    }
    groupMap.get(key)!.recipients.push({ id: Number(r.id), email: String(r.email), enabled: Boolean(r.enabled) });
  }

  return NextResponse.json({ ok: true, groups });
}

/** Add a recipient. Body: { entity_id, email }. entity_id may be null for admin. 409 on duplicate. */
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

  if (entity_id !== null && (typeof entity_id !== "number" || !Number.isInteger(entity_id))) {
    return NextResponse.json({ ok: false, error: "entity_id must be an integer or null" }, { status: 400 });
  }
  if (typeof email !== "string" || email.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });
  }

  const sql = getDb();

  if (entity_id !== null) {
    const entity = await sql`SELECT id FROM entities WHERE id = ${entity_id as number}`;
    if (entity.length === 0) {
      return NextResponse.json({ ok: false, error: "Entity not found" }, { status: 404 });
    }
  }

  try {
    const inserted = entity_id === null
      ? await sql`
          INSERT INTO recipients (entity_id, email)
          VALUES (NULL, ${email.trim()})
          RETURNING id, entity_id, email, enabled
        `
      : await sql`
          INSERT INTO recipients (entity_id, email)
          VALUES (${entity_id as number}, ${email.trim()})
          RETURNING id, entity_id, email, enabled
        `;
    return NextResponse.json({ ok: true, recipient: inserted[0] }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json({ ok: false, error: "Recipient already exists" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
