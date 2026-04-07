import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const entityRows = await query("SELECT id, name, enabled, created_at FROM entities ORDER BY id");
  const keywordRows = await query("SELECT id, entity_id, keyword FROM keywords ORDER BY entity_id, id");
  const recipientRows = await query("SELECT id, entity_id, email, enabled FROM recipients WHERE entity_id IS NOT NULL ORDER BY entity_id, id");
  const adminRows = await query("SELECT id, email, enabled FROM recipients WHERE entity_id IS NULL ORDER BY id");

  const kwMap: Record<string, Array<{ id: number; keyword: string }>> = {};
  for (const row of keywordRows) {
    const eid = String(row.entity_id);
    if (!kwMap[eid]) kwMap[eid] = [];
    kwMap[eid].push({ id: Number(row.id), keyword: String(row.keyword) });
  }

  const rcMap: Record<string, Array<{ id: number; email: string; enabled: boolean }>> = {};
  for (const row of recipientRows) {
    const eid = String(row.entity_id);
    if (!rcMap[eid]) rcMap[eid] = [];
    rcMap[eid].push({ id: Number(row.id), email: String(row.email), enabled: Boolean(row.enabled) });
  }

  const entities = entityRows.map((e) => ({
    id: Number(e.id),
    name: String(e.name),
    enabled: Boolean(e.enabled),
    created_at: String(e.created_at),
    keywords: kwMap[String(e.id)] ?? [],
    recipients: rcMap[String(e.id)] ?? [],
  }));

  const adminRecipients = adminRows.map((r) => ({
    id: Number(r.id),
    email: String(r.email),
    enabled: Boolean(r.enabled),
  }));

  return NextResponse.json({ ok: true, entities, adminRecipients });
}
