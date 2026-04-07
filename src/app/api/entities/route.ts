import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type EntityRow = { id: number; name: string; enabled: boolean; created_at: string };
type KeywordRow = { id: number; entity_id: number; keyword: string };
type RecipientRow = { id: number; entity_id: number | null; email: string; enabled: boolean };

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  const entities = (await sql`SELECT id, name, enabled, created_at FROM entities ORDER BY id`) as EntityRow[];
  const keywords = (await sql`SELECT id, entity_id, keyword FROM keywords ORDER BY entity_id, id`) as KeywordRow[];
  const recipients = (await sql`SELECT id, entity_id, email, enabled FROM recipients WHERE entity_id IS NOT NULL ORDER BY entity_id, id`) as RecipientRow[];
  const adminRecipients = (await sql`SELECT id, entity_id, email, enabled FROM recipients WHERE entity_id IS NULL ORDER BY id`) as RecipientRow[];

  const kwMap = new Map<number, KeywordRow[]>();
  for (const kw of keywords) {
    if (!kwMap.has(kw.entity_id)) kwMap.set(kw.entity_id, []);
    kwMap.get(kw.entity_id)!.push(kw);
  }

  const rcMap = new Map<number, RecipientRow[]>();
  for (const rc of recipients) {
    if (rc.entity_id == null) continue;
    if (!rcMap.has(rc.entity_id)) rcMap.set(rc.entity_id, []);
    rcMap.get(rc.entity_id)!.push(rc);
  }

  const result = entities.map((e) => ({
    ...e,
    keywords: kwMap.get(e.id) ?? [],
    recipients: rcMap.get(e.id) ?? [],
  }));

  return NextResponse.json({
    ok: true,
    entities: result,
    adminRecipients: adminRecipients.map((r) => ({ id: r.id, email: r.email, enabled: r.enabled })),
  });
}
