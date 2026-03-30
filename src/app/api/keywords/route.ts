import { writeFileSync } from "fs";
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import {
  getBaseEntityById,
  getEntities,
  getKeywordOverrideEntityIds,
  invalidateKeywordEntitiesCache,
  KEYWORD_OVERRIDES_PATH,
  loadKeywordOverridesFromDisk,
} from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Keyword overrides for PoC testing (`/tmp/keyword-overrides.json`).
 * Auth: same as cron routes — `?secret=`, `Authorization: Bearer`, or `x-cron-secret`.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const overrideIds = getKeywordOverrideEntityIds();
  const list = getEntities().map((e) => ({
    id: e.id,
    name: e.name,
    aliases: e.aliases,
    keywords: e.keywords,
    hasKeywordOverride: overrideIds.has(e.id),
  }));

  return NextResponse.json({ ok: true, entities: list });
}

export async function PUT(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { ok: false, error: "Body must be an object" },
      { status: 400 }
    );
  }

  const { entityId, keywords } = body as {
    entityId?: unknown;
    keywords?: unknown;
  };

  if (typeof entityId !== "string" || entityId.length === 0) {
    return NextResponse.json(
      { ok: false, error: "entityId is required" },
      { status: 400 }
    );
  }

  if (!Array.isArray(keywords) || !keywords.every((k) => typeof k === "string")) {
    return NextResponse.json(
      { ok: false, error: "keywords must be an array of strings" },
      { status: 400 }
    );
  }

  if (!getBaseEntityById(entityId)) {
    return NextResponse.json(
      { ok: false, error: `Unknown entity id: ${entityId}` },
      { status: 400 }
    );
  }

  const all = loadKeywordOverridesFromDisk();
  all[entityId] = keywords;

  try {
    writeFileSync(
      KEYWORD_OVERRIDES_PATH,
      `${JSON.stringify(all, null, 2)}\n`,
      "utf8"
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Could not write overrides: ${message}` },
      { status: 500 }
    );
  }

  invalidateKeywordEntitiesCache();

  return NextResponse.json({ ok: true });
}
