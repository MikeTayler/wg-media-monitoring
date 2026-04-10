/** Shared domain types for the PoC pipeline — keep in sync with `project.md` and `/lib/config.ts`. */

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
  /** Service description used in AI scoring prompts for richer context. */
  description: string;
}

/** Optional future shape for richer rules — PoC uses `Entity.keywords` + `Entity.aliases` only. */
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
