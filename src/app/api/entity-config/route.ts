import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getDb, query } from "@/lib/db";

export const dynamic = "force-dynamic";

type EntityConfigRow = {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
};
type KeywordRow = { entity_id: number; id: number; keyword: string };
type RecipientRow = { entity_id: number; id: number; email: string; enabled: boolean };

/**
 * GET /api/entity-config
 * Returns all entities with full config: id, name, description, keywords, recipients.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const entityRows = await query<EntityConfigRow>(
    "SELECT id, name, description, enabled FROM entities ORDER BY id"
  );
  const keywordRows = await query<KeywordRow>(
    "SELECT entity_id, id, keyword FROM keywords ORDER BY entity_id, id"
  );
  const recipientRows = await query<RecipientRow>(
    "SELECT entity_id, id, email, enabled FROM recipients WHERE entity_id IS NOT NULL ORDER BY entity_id, id"
  );

  const kwMap: Record<string, Array<{ id: number; keyword: string }>> = {};
  for (const kw of keywordRows) {
    const eid = String(kw.entity_id);
    if (!kwMap[eid]) kwMap[eid] = [];
    kwMap[eid].push({ id: Number(kw.id), keyword: String(kw.keyword) });
  }

  const rcMap: Record<string, Array<{ id: number; email: string; enabled: boolean }>> = {};
  for (const rc of recipientRows) {
    const eid = String(rc.entity_id);
    if (!rcMap[eid]) rcMap[eid] = [];
    rcMap[eid].push({ id: Number(rc.id), email: String(rc.email), enabled: Boolean(rc.enabled) });
  }

  const entities = entityRows.map((e) => {
    const eid = String(e.id);
    return {
      id: Number(e.id),
      name: String(e.name),
      description: String(e.description ?? ""),
      enabled: Boolean(e.enabled),
      keywords: kwMap[eid] ?? [],
      recipients: rcMap[eid] ?? [],
    };
  });

  return NextResponse.json({ ok: true, entities });
}

/**
 * PUT /api/entity-config
 * Updates a single field for an entity.
 * Body: { entityId: number, field: "description" | "keywords" | "recipients", value: string | string[] }
 *
 * - "description": updates entities.description directly
 * - "keywords": replaces all keywords for the entity (delete + insert)
 * - "recipients": replaces all entity-scoped recipients (delete + insert)
 */
export async function PUT(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { entityId, field, value } = (body ?? {}) as {
    entityId?: unknown;
    field?: unknown;
    value?: unknown;
  };

  if (typeof entityId !== "number" || !Number.isInteger(entityId)) {
    return NextResponse.json({ ok: false, error: "entityId must be an integer" }, { status: 400 });
  }
  if (field !== "description" && field !== "keywords" && field !== "recipients") {
    return NextResponse.json(
      { ok: false, error: 'field must be "description", "keywords", or "recipients"' },
      { status: 400 }
    );
  }

  const sql = getDb();

  // Verify entity exists
  const entityCheck = await sql`SELECT id FROM entities WHERE id = ${entityId}`;
  if (entityCheck.length === 0) {
    return NextResponse.json({ ok: false, error: "Entity not found" }, { status: 404 });
  }

  if (field === "description") {
    if (typeof value !== "string") {
      return NextResponse.json({ ok: false, error: "value must be a string for description" }, { status: 400 });
    }
    await sql`UPDATE entities SET description = ${value.trim()} WHERE id = ${entityId}`;
    return NextResponse.json({ ok: true, field, entityId });
  }

  if (field === "keywords") {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
      return NextResponse.json({ ok: false, error: "value must be a string[] for keywords" }, { status: 400 });
    }
    const keywords = (value as string[]).map((k) => k.trim()).filter(Boolean);
    // Replace all keywords for this entity
    await sql`DELETE FROM keywords WHERE entity_id = ${entityId}`;
    for (const keyword of keywords) {
      await sql`
        INSERT INTO keywords (entity_id, keyword)
        VALUES (${entityId}, ${keyword})
        ON CONFLICT (entity_id, keyword) DO NOTHING
      `;
    }
    return NextResponse.json({ ok: true, field, entityId, count: keywords.length });
  }

  if (field === "recipients") {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
      return NextResponse.json({ ok: false, error: "value must be a string[] for recipients" }, { status: 400 });
    }
    const emails = (value as string[]).map((e) => e.trim().toLowerCase()).filter(Boolean);
    // Replace all entity-scoped recipients for this entity
    await sql`DELETE FROM recipients WHERE entity_id = ${entityId}`;
    for (const email of emails) {
      await sql`
        INSERT INTO recipients (entity_id, email)
        VALUES (${entityId}, ${email})
        ON CONFLICT DO NOTHING
      `;
    }
    return NextResponse.json({ ok: true, field, entityId, count: emails.length });
  }

  return NextResponse.json({ ok: false, error: "Unhandled field" }, { status: 500 });
}
