import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Toggle enabled/disabled. Body: { enabled: boolean }. */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { enabled } = (body ?? {}) as { enabled?: unknown };
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "enabled must be a boolean" }, { status: 400 });
  }

  const sql = getDb();
  const updated = await sql`
    UPDATE recipients SET enabled = ${enabled} WHERE id = ${id}
    RETURNING id, entity_id, email, enabled
  `;

  if (updated.length === 0) {
    return NextResponse.json({ ok: false, error: "Recipient not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, recipient: updated[0] });
}

/** Delete a recipient by id. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const sql = getDb();
  const deleted = await sql`DELETE FROM recipients WHERE id = ${id} RETURNING id`;

  if (deleted.length === 0) {
    return NextResponse.json({ ok: false, error: "Recipient not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
