/**
 * Entity/keyword/recipient configuration — reads from Neon Postgres.
 * Falls back to empty arrays if the DB is unreachable (pipeline will log warnings).
 *
 * Uses `query()` (the `.query()` method on the Neon function) instead of
 * tagged templates for SELECT queries to avoid a Vercel bundling issue
 * where tagged-template results silently return length 0.
 */

import { query } from "@/lib/db";
import type { Entity } from "@/lib/types";

/**
 * Load entities with their keywords and enabled recipients from the database.
 * Entity `id` is coerced to string for pipeline compatibility.
 * Entity `name` is used as the sole alias (matches the PoC convention).
 * Only includes entity-scoped recipients (entity_id IS NOT NULL).
 */
export async function getEntities(): Promise<Entity[]> {
  const entityRows = await query(
    "SELECT id, name, description, enabled FROM entities WHERE enabled = true ORDER BY id"
  );

  const keywordRows = await query(
    "SELECT entity_id, keyword FROM keywords ORDER BY entity_id, id"
  );

  const recipientRows = await query(
    "SELECT entity_id, email FROM recipients WHERE enabled = true AND entity_id IS NOT NULL ORDER BY entity_id, id"
  );

  const kwMap: Record<string, string[]> = {};
  for (const kw of keywordRows) {
    const eid = String(kw.entity_id);
    if (!kwMap[eid]) kwMap[eid] = [];
    kwMap[eid].push(String(kw.keyword));
  }

  const rcMap: Record<string, string[]> = {};
  for (const rc of recipientRows) {
    const eid = String(rc.entity_id);
    if (!rcMap[eid]) rcMap[eid] = [];
    rcMap[eid].push(String(rc.email));
  }

  return entityRows.map((e) => ({
    id: String(e.id),
    name: String(e.name),
    aliases: [String(e.name)],
    description: String(e.description ?? ""),
    keywords: kwMap[String(e.id)] ?? [],
    recipients: rcMap[String(e.id)] ?? [],
  }));
}

/** All distinct enabled entity-scoped recipient emails (for cron digest sends). */
export async function getEntityRecipientEmails(): Promise<string[]> {
  const rows = await query(
    `SELECT DISTINCT r.email
     FROM recipients r
     JOIN entities e ON e.id = r.entity_id
     WHERE r.enabled = true AND e.enabled = true
     ORDER BY r.email`
  );
  return rows.map((r) => String(r.email));
}

/** All distinct enabled admin recipient emails (entity_id IS NULL). */
export async function getAdminRecipientEmails(): Promise<string[]> {
  const rows = await query(
    `SELECT DISTINCT email FROM recipients
     WHERE entity_id IS NULL AND enabled = true
     ORDER BY email`
  );
  return rows.map((r) => String(r.email));
}
