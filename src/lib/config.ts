/**
 * Entity/keyword/recipient configuration — reads from Neon Postgres.
 * Falls back to empty arrays if the DB is unreachable (pipeline will log warnings).
 *
 * NOTE: Neon's tagged-template result is array-like but not iterable —
 * always use index-based loops (`for i`) instead of `for...of` or `.map()`.
 */

import { getDb } from "@/lib/db";
import type { Entity } from "@/lib/types";

/**
 * Load entities with their keywords and enabled recipients from the database.
 * Entity `id` is coerced to string for pipeline compatibility.
 * Entity `name` is used as the sole alias (matches the PoC convention).
 * Only includes entity-scoped recipients (entity_id IS NOT NULL).
 */
export async function getEntities(): Promise<Entity[]> {
  const sql = getDb();

  const entityRows = await sql`
    SELECT id, name, enabled FROM entities WHERE enabled = true ORDER BY id
  `;

  const keywordRows = await sql`
    SELECT entity_id, keyword FROM keywords ORDER BY entity_id, id
  `;

  const recipientRows = await sql`
    SELECT entity_id, email FROM recipients WHERE enabled = true AND entity_id IS NOT NULL ORDER BY entity_id, id
  `;

  const kwMap: Record<string, string[]> = {};
  for (let i = 0; i < keywordRows.length; i++) {
    const kw = keywordRows[i];
    const eid = String(kw.entity_id);
    if (!kwMap[eid]) kwMap[eid] = [];
    kwMap[eid].push(String(kw.keyword));
  }

  const rcMap: Record<string, string[]> = {};
  for (let i = 0; i < recipientRows.length; i++) {
    const rc = recipientRows[i];
    const eid = String(rc.entity_id);
    if (!rcMap[eid]) rcMap[eid] = [];
    rcMap[eid].push(String(rc.email));
  }

  const out: Entity[] = [];
  for (let i = 0; i < entityRows.length; i++) {
    const e = entityRows[i];
    const eid = String(e.id);
    out.push({
      id: eid,
      name: String(e.name),
      aliases: [String(e.name)],
      keywords: kwMap[eid] ?? [],
      recipients: rcMap[eid] ?? [],
    });
  }
  return out;
}

/** All distinct enabled entity-scoped recipient emails (for cron digest sends). */
export async function getEntityRecipientEmails(): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT DISTINCT r.email
    FROM recipients r
    JOIN entities e ON e.id = r.entity_id
    WHERE r.enabled = true AND e.enabled = true
    ORDER BY r.email
  `;
  const out: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    out.push(String(rows[i].email));
  }
  return out;
}

/** All distinct enabled admin recipient emails (entity_id IS NULL). */
export async function getAdminRecipientEmails(): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT DISTINCT email FROM recipients
    WHERE entity_id IS NULL AND enabled = true
    ORDER BY email
  `;
  const out: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    out.push(String(rows[i].email));
  }
  return out;
}
