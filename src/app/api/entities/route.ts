import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  const entityRows = await sql`SELECT id, name, enabled, created_at FROM entities ORDER BY id`;
  const keywordRows = await sql`SELECT id, entity_id, keyword FROM keywords ORDER BY entity_id, id`;
  const recipientRows = await sql`SELECT id, entity_id, email, enabled FROM recipients WHERE entity_id IS NOT NULL ORDER BY entity_id, id`;
  const adminRows = await sql`SELECT id, email, enabled FROM recipients WHERE entity_id IS NULL ORDER BY id`;

  const kwMap = new Map<number, Array<{ id: number; keyword: string }>>();
  for (const row of keywordRows) {
    const eid = Number(row.entity_id);
    if (!kwMap.has(eid)) kwMap.set(eid, []);
    kwMap.get(eid)!.push({ id: Number(row.id), keyword: String(row.keyword) });
  }

  const rcMap = new Map<number, Array<{ id: number; email: string; enabled: boolean }>>();
  for (const row of recipientRows) {
    const eid = Number(row.entity_id);
    if (!rcMap.has(eid)) rcMap.set(eid, []);
    rcMap.get(eid)!.push({ id: Number(row.id), email: String(row.email), enabled: Boolean(row.enabled) });
  }

  const entities = entityRows.map((e) => ({
    id: Number(e.id),
    name: String(e.name),
    enabled: Boolean(e.enabled),
    created_at: String(e.created_at),
    keywords: kwMap.get(Number(e.id)) ?? [],
    recipients: rcMap.get(Number(e.id)) ?? [],
  }));

  const adminRecipients = adminRows.map((r) => ({
    id: Number(r.id),
    email: String(r.email),
    enabled: Boolean(r.enabled),
  }));

  return NextResponse.json({ ok: true, entities, adminRecipients });
}
