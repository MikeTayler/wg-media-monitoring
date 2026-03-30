/**
 * Hardcoded PoC configuration (entities, aliases, keywords, recipients).
 * Replace or extend entries with confirmed participant input — see `project.md`.
 * Keyword overrides for testing: `/tmp/keyword-overrides.json` merged in {@link getEntities}.
 */

import { existsSync, readFileSync, statSync } from "fs";
import type { Entity } from "@/lib/types";

/** JSON map: entity id → keywords array (replaces base keywords for that id). */
export const KEYWORD_OVERRIDES_PATH = "/tmp/keyword-overrides.json";

/**
 * `global` has sector-wide terms; `recipients` is empty — digest delivery should
 * treat this bucket as “all participants” (wired in the digest step).
 */
export const baseEntities: Entity[] = [
  {
    id: "leva",
    name: "Le Va",
    aliases: ["Le Va"],
    recipients: ["kirsten.brown@leva.co.nz"],
    keywords: [
      "Le Va",
      "suicide prevention",
      "Pacific mental health",
      "Pasifika wellbeing",
    ],
  },
  {
    id: "pathways",
    name: "Pathways",
    aliases: ["Pathways"],
    recipients: ["kelly.moran@pathways.co.nz"],
    keywords: [
      "Pathways",
      "mental health services",
      "community support",
      "disability support",
    ],
  },
  {
    id: "linkpeople",
    name: "LinkPeople",
    aliases: ["LinkPeople", "Link People"],
    recipients: ["alerts@linkpeople.co.nz"],
    keywords: [
      "LinkPeople",
      "Link People",
      "employment services",
      "disability employment",
    ],
  },
  {
    id: "tepou",
    name: "Te Pou",
    aliases: ["Te Pou"],
    recipients: ["alerts@tepou.co.nz"],
    keywords: [
      "Te Pou",
      "Blueprint for Learning",
      "Mental Health First Aid",
      "MHFA",
      "Riana Manuel",
    ],
  },
  {
    id: "justathought",
    name: "Just a thought",
    aliases: ["Just a thought"],
    recipients: ["alerts@justathought.org.nz"],
    keywords: [
      "Just a thought",
      "online therapy",
      "iCBT",
      "digital mental health",
    ],
  },
  {
    id: "global",
    name: "Global (all recipients)",
    aliases: ["Wise Group"],
    recipients: [],
    keywords: [
      "Wise Group",
      "Matt Doocey",
      "mental health policy",
      "Mental Health Act",
      "social services",
      "disability support",
      "housing",
      "employment",
    ],
  },
];

/** Solo-test digest: dashboard sends only to this address (full digest content). */
export const DIGEST_SOLO_TEST_EMAIL = "michael.tayler@wisemanagement.co.nz";

type EntityCache = { mtime: number; list: Entity[] };

let entityCache: EntityCache | null = null;

function cloneEntity(e: Entity): Entity {
  return {
    ...e,
    aliases: [...e.aliases],
    keywords: [...e.keywords],
    recipients: [...e.recipients],
  };
}

function getOverrideFileMtime(): number {
  try {
    return statSync(KEYWORD_OVERRIDES_PATH).mtimeMs;
  } catch {
    return -1;
  }
}

export function loadKeywordOverridesFromDisk(): Record<string, string[]> {
  try {
    const raw = readFileSync(KEYWORD_OVERRIDES_PATH, "utf8");
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Returns entity ids that have an entry in the override file (even if empty array). */
export function getKeywordOverrideEntityIds(): Set<string> {
  return new Set(Object.keys(loadKeywordOverridesFromDisk()));
}

/**
 * Base config merged with `/tmp/keyword-overrides.json` (per-entity keyword replacement).
 * Cached until the override file’s mtime changes.
 */
export function getEntities(): Entity[] {
  const mtime = getOverrideFileMtime();
  if (entityCache && entityCache.mtime === mtime) {
    return entityCache.list;
  }
  const overrides = loadKeywordOverridesFromDisk();
  const merged = baseEntities.map((e) => {
    if (e.id in overrides) {
      return { ...cloneEntity(e), keywords: [...overrides[e.id]] };
    }
    return cloneEntity(e);
  });
  entityCache = { mtime, list: merged };
  return merged;
}

/** Call after writing `keyword-overrides.json` so the next `getEntities()` sees updates. */
export function invalidateKeywordEntitiesCache(): void {
  entityCache = null;
}

export function getBaseEntityById(id: string): Entity | undefined {
  return baseEntities.find((e) => e.id === id);
}
