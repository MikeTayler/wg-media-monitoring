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

  const kwMap: Record<string, Array<{ id: number; keyword: string }>> = {};
  for (let i = 0; i < keywordRows.length; i++) {
    const row = keywordRows[i];
    const eid = String(row.entity_id);
    if (!kwMap[eid]) kwMap[eid] = [];
    kwMap[eid].push({ id: Number(row.id), keyword: String(row.keyword) });
  }

  const rcMap: Record<string, Array<{ id: number; email: string; enabled: boolean }>> = {};
  for (let i = 0; i < recipientRows.length; i++) {
    const row = recipientRows[i];
    const eid = String(row.entity_id);
    if (!rcMap[eid]) rcMap[eid] = [];
    rcMap[eid].push({ id: Number(row.id), email: String(row.email), enabled: Boolean(row.enabled) });
  }

  const entities = [];
  for (let i = 0; i < entityRows.length; i++) {
    const e = entityRows[i];
    entities.push({
      id: Number(e.id),
      name: String(e.name),
      enabled: Boolean(e.enabled),
      created_at: String(e.created_at),
      keywords: kwMap[String(e.id)] ?? [],
      recipients: rcMap[String(e.id)] ?? [],
    });
  }

  const adminRecipients = [];
  for (let i = 0; i < adminRows.length; i++) {
    const r = adminRows[i];
    adminRecipients.push({
      id: Number(r.id),
      email: String(r.email),
      enabled: Boolean(r.enabled),
    });
  }

  return NextResponse.json({ ok: true, entities, adminRecipients });
}
