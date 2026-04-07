/**
 * Entity/keyword/recipient configuration — reads from Neon Postgres.
 * Falls back to empty arrays if the DB is unreachable (pipeline will log warnings).
 */

import { getDb } from "@/lib/db";
import type { Entity } from "@/lib/types";

type DbEntityRow = { id: number; name: string; enabled: boolean };
type DbKeywordRow = { entity_id: number; keyword: string };
type DbRecipientRow = { entity_id: number; email: string };

/**
 * Load entities with their keywords and enabled recipients from the database.
 * Entity `id` is coerced to string for pipeline compatibility.
 * Entity `name` is used as the sole alias (matches the PoC convention).
 * Only includes entity-scoped recipients (entity_id IS NOT NULL).
 */
export async function getEntities(): Promise<Entity[]> {
  const sql = getDb();

  const entities = (await sql`
    SELECT id, name, enabled FROM entities WHERE enabled = true ORDER BY id
  `) as DbEntityRow[];

  const keywords = (await sql`
    SELECT entity_id, keyword FROM keywords ORDER BY entity_id, id
  `) as DbKeywordRow[];

  const recipients = (await sql`
    SELECT entity_id, email FROM recipients WHERE enabled = true AND entity_id IS NOT NULL ORDER BY entity_id, id
  `) as DbRecipientRow[];

  const kwMap = new Map<number, string[]>();
  for (const kw of keywords) {
    if (!kwMap.has(kw.entity_id)) kwMap.set(kw.entity_id, []);
    kwMap.get(kw.entity_id)!.push(kw.keyword);
  }

  const rcMap = new Map<number, string[]>();
  for (const rc of recipients) {
    if (!rcMap.has(rc.entity_id)) rcMap.set(rc.entity_id, []);
    rcMap.get(rc.entity_id)!.push(rc.email);
  }

  return entities.map((e) => ({
    id: String(e.id),
    name: e.name,
    aliases: [e.name],
    keywords: kwMap.get(e.id) ?? [],
    recipients: rcMap.get(e.id) ?? [],
  }));
}

/** All distinct enabled entity-scoped recipient emails (for cron digest sends). */
export async function getEntityRecipientEmails(): Promise<string[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT DISTINCT r.email
    FROM recipients r
    JOIN entities e ON e.id = r.entity_id
    WHERE r.enabled = true AND e.enabled = true
    ORDER BY r.email
  `) as Array<{ email: string }>;
  return rows.map((r) => r.email);
}

/** All distinct enabled admin recipient emails (entity_id IS NULL). */
export async function getAdminRecipientEmails(): Promise<string[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT DISTINCT email FROM recipients
    WHERE entity_id IS NULL AND enabled = true
    ORDER BY email
  `) as Array<{ email: string }>;
  return rows.map((r) => r.email);
}
