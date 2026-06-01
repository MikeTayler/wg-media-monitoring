import type { Article, Entity } from "@/lib/types";

/** One entity that matched the article, with the phrases that triggered it. */
export interface EntityKeywordMatch {
  entityId: string;
  entityName: string;
  /** Exact phrases from `aliases` or `keywords` that matched (case-insensitive, whole-word). */
  matchedKeywords: string[];
}

function buildHaystack(article: Article): string {
  return `${article.title}\n${article.body}`;
}

/** Escape characters that are significant in a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a case-insensitive, whole-word regex for a keyword/phrase.
 *
 * - Multi-word phrases are matched with flexible whitespace between words
 *   (so "Te Pou" matches "Te  Pou" or a line break too).
 * - Unicode letter/number lookarounds act as word boundaries, so the phrase
 *   must not be flanked by other letters/digits — e.g. "Le Va" no longer
 *   matches inside "peopLE VАry", and "iwi" won't match "kiwifruit".
 *   Boundaries like spaces, punctuation and hyphens are still allowed.
 *
 * Returns `null` for empty terms.
 */
function buildKeywordPattern(term: string): RegExp | null {
  const trimmed = term.trim();
  if (trimmed.length === 0) return null;
  const core = trimmed.split(/\s+/).map(escapeRegExp).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${core}(?![\\p{L}\\p{N}])`, "iu");
}

/** Compiled-pattern cache, keyed by the raw term. */
const patternCache = new Map<string, RegExp | null>();

function getKeywordPattern(term: string): RegExp | null {
  const cached = patternCache.get(term);
  if (cached !== undefined) return cached;
  const pattern = buildKeywordPattern(term);
  patternCache.set(term, pattern);
  return pattern;
}

/**
 * Returns which alias/keyword phrases match the haystack (case-insensitive, whole-word).
 * OR logic: any single hit is enough for the entity to match; we list all that hit.
 * Order: aliases first, then keywords, as defined on the entity.
 */
function matchedTermsForEntity(haystack: string, entity: Entity): string[] {
  const seen = new Set<string>();
  const matched: string[] = [];

  const terms = [...entity.aliases, ...entity.keywords];
  for (const term of terms) {
    if (seen.has(term)) continue;
    const pattern = getKeywordPattern(term);
    if (!pattern) continue;
    if (pattern.test(haystack)) {
      seen.add(term);
      matched.push(term);
    }
  }

  return matched;
}

/**
 * First-stage filter: match article title + body against each entity's aliases and keywords.
 * Entities are passed in (loaded from DB by the caller).
 */
export function matchArticleToEntities(
  article: Article,
  entities: Entity[]
): EntityKeywordMatch[] {
  const haystack = buildHaystack(article);
  const out: EntityKeywordMatch[] = [];

  for (const entity of entities) {
    const matchedKeywords = matchedTermsForEntity(haystack, entity);
    if (matchedKeywords.length === 0) continue;
    out.push({
      entityId: entity.id,
      entityName: entity.name,
      matchedKeywords,
    });
  }

  return out;
}

/**
 * Run keyword matching over many articles (same rules as {@link matchArticleToEntities}).
 */
export function matchArticlesToEntities(
  articles: Article[],
  entities: Entity[]
): Map<string, EntityKeywordMatch[]> {
  const map = new Map<string, EntityKeywordMatch[]>();
  for (const article of articles) {
    map.set(article.id, matchArticleToEntities(article, entities));
  }
  return map;
}
