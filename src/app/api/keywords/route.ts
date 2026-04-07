import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getDb, query } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Keywords grouped by entity. */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rows = await query(
    `SELECT k.id, k.entity_id, k.keyword, e.name AS entity_name
     FROM keywords k
     JOIN entities e ON e.id = k.entity_id
     ORDER BY k.entity_id, k.id`
  );

  const grouped: Record<string, { entity_id: number; entity_name: string; keywords: Array<{ id: number; keyword: string }> }> = {};
  for (const r of rows) {
    const key = String(r.entity_id);
    if (!grouped[key]) {
      grouped[key] = { entity_id: Number(r.entity_id), entity_name: String(r.entity_name), keywords: [] };
    }
    grouped[key].keywords.push({ id: Number(r.id), keyword: String(r.keyword) });
  }

  return NextResponse.json({ ok: true, groups: Object.values(grouped) });
}

/** Add a keyword. Body: { entity_id, keyword }. 409 on duplicate. */
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

  const { entity_id, keyword } = (body ?? {}) as { entity_id?: unknown; keyword?: unknown };

  if (typeof entity_id !== "number" || !Number.isInteger(entity_id)) {
    return NextResponse.json({ ok: false, error: "entity_id must be an integer" }, { status: 400 });
  }
  if (typeof keyword !== "string" || keyword.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "keyword is required" }, { status: 400 });
  }

  const sql = getDb();

  const entity = await sql`SELECT id FROM entities WHERE id = ${entity_id}`;
  if (entity.length === 0) {
    return NextResponse.json({ ok: false, error: "Entity not found" }, { status: 404 });
  }

  try {
    const inserted = await sql`
      INSERT INTO keywords (entity_id, keyword)
      VALUES (${entity_id}, ${keyword.trim()})
      RETURNING id, entity_id, keyword
    `;
    return NextResponse.json({ ok: true, keyword: inserted[0] }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json({ ok: false, error: "Keyword already exists for this entity" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
