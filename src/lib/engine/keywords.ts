import { entities } from "@/lib/config";
import type { Article, Entity } from "@/lib/types";

/** One entity that matched the article, with the phrases that triggered it. */
export interface EntityKeywordMatch {
  entityId: string;
  entityName: string;
  /** Exact phrases from `aliases` or `keywords` that matched (case-insensitive substring). */
  matchedKeywords: string[];
}

function buildHaystack(article: Article): string {
  return `${article.title}\n${article.body}`.toLowerCase();
}

/**
 * Returns which alias/keyword phrases match the haystack (case-insensitive).
 * OR logic: any single hit is enough for the entity to match; we list all that hit.
 * Order: aliases first, then keywords, as defined on the entity.
 */
function matchedTermsForEntity(haystack: string, entity: Entity): string[] {
  const seen = new Set<string>();
  const matched: string[] = [];

  const terms = [...entity.aliases, ...entity.keywords];
  for (const term of terms) {
    if (seen.has(term)) continue;
    const needle = term.toLowerCase();
    if (needle.length === 0) continue;
    if (haystack.includes(needle)) {
      seen.add(term);
      matched.push(term);
    }
  }

  return matched;
}

/**
 * First-stage filter: match article title + body against each entity’s aliases and keywords.
 * No boolean AND/OR/NOT — any phrase match counts. Macrons and UTF-8 are preserved; comparison is case-insensitive only.
 */
export function matchArticleToEntities(article: Article): EntityKeywordMatch[] {
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
  articles: Article[]
): Map<string, EntityKeywordMatch[]> {
  const map = new Map<string, EntityKeywordMatch[]>();
  for (const article of articles) {
    map.set(article.id, matchArticleToEntities(article));
  }
  return map;
}
