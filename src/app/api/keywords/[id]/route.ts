import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

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
  const deleted = await sql`DELETE FROM keywords WHERE id = ${id} RETURNING id`;

  if (deleted.length === 0) {
    return NextResponse.json({ ok: false, error: "Keyword not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
