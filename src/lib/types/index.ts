/**
 * TODO: Shared domain types for the PoC pipeline.
 * - Keep in sync with `project.md` and `/lib/config.ts` as behaviour is implemented.
 * - Add `KeywordRule` (or refine) once keyword matching rules are encoded beyond simple string lists.
 */

/** Normalised article after RSS (and optional HTML) fetch. */
export interface Article {
  id: string;
  source: "stuff" | "rnz" | "scoop" | "newstalkzb" | "nzherald";
  url: string;
  title: string;
  body: string;
  publishedAt: Date;
  ingestedAt: Date;
  paywalled: boolean;
}

/** Wise Group entity (or global bucket) with keywords and digest recipients. */
export interface Entity {
  id: string;
  name: string;
  aliases: string[];
  keywords: string[];
  recipients: string[];
}

/**
 * TODO: Define how keyword rules are represented (e.g. per-entity matchers, global rules).
 * Wire into `keywords.ts` when implementing matching.
 */
export interface KeywordRule {
  entityId: string;
  terms: string[];
}

/** Article after keyword match + AI scoring + summary. */
export interface ArticleMatch {
  article: Article;
  entityId: string;
  matchedKeywords: string[];
  relevanceScore: number;
  relevanceReason: string;
  summary: string;
}
