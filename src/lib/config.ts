/**
 * Entity/keyword/recipient configuration — reads from Neon Postgres.
 * Falls back to empty arrays if the DB is unreachable (pipeline will log warnings).
 */

import { getDb } from "@/lib/db";
import type { Entity } from "@/lib/types";

/** Solo-test digest: dashboard sends only to this address (full digest content). */
export const DIGEST_SOLO_TEST_EMAIL = "michael.tayler@wisemanagement.co.nz";

type DbEntityRow = { id: number; name: string; enabled: boolean };
type DbKeywordRow = { entity_id: number; keyword: string };
type DbRecipientRow = { entity_id: number; email: string };

/**
 * Load entities with their keywords and enabled recipients from the database.
 * Entity `id` is coerced to string for pipeline compatibility.
 * Entity `name` is used as the sole alias (matches the PoC convention).
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
    SELECT entity_id, email FROM recipients WHERE enabled = true ORDER BY entity_id, id
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

/** All distinct enabled recipient emails across all enabled entities. */
export async function getDigestRecipientEmails(): Promise<string[]> {
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
