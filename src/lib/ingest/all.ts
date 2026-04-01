import { promises as fs } from "fs";
import type { Article } from "@/lib/types";
import { fetchFullText } from "@/lib/sources/full-text";
import { fetchNewstalkzbArticles } from "@/lib/sources/newstalkzb";
import { fetchNzheraldArticles } from "@/lib/sources/nzherald";
import { fetchRnzArticles } from "@/lib/sources/rnz";
import { fetchScoopArticles } from "@/lib/sources/scoop";
import { fetchStuffArticles } from "@/lib/sources/stuff";

export const ARTICLES_JSON_PATH = "/tmp/articles.json";

type SourceKey = Article["source"];

type IngestErrorMap = Partial<Record<SourceKey, string>>;

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}

function dedupeByUrl(articles: Article[]): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const a of articles) {
    const key = normalizeUrl(a.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

type SerializedArticle = Omit<Article, "publishedAt" | "ingestedAt"> & {
  publishedAt: string;
  ingestedAt: string;
};

function serializeArticles(articles: Article[]): SerializedArticle[] {
  return articles.map((a) => ({
    ...a,
    publishedAt: a.publishedAt.toISOString(),
    ingestedAt: a.ingestedAt.toISOString(),
  }));
}

const FULL_TEXT_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type IngestAllResult = {
  ok: boolean;
  updatedAt: string;
  path: string;
  totalUnique: number;
  bySource: Record<SourceKey, number>;
  fullTextEnriched: number;
  fullTextFallback: number;
  errors: IngestErrorMap;
};

/**
 * Fetches all PoC RSS sources, deduplicates by URL, writes `/tmp/articles.json`.
 * Per-source failures are logged and recorded in `errors`; other sources still run.
 */
export async function ingestAll(): Promise<IngestAllResult> {
  const bySource: Record<SourceKey, number> = {
    stuff: 0,
    rnz: 0,
    scoop: 0,
    newstalkzb: 0,
    nzherald: 0,
  };
  const errors: IngestErrorMap = {};
  const combined: Article[] = [];

  const tasks: Array<{ key: SourceKey; fn: () => Promise<Article[]> }> = [
    { key: "stuff", fn: fetchStuffArticles },
    { key: "rnz", fn: fetchRnzArticles },
    { key: "scoop", fn: fetchScoopArticles },
    { key: "newstalkzb", fn: fetchNewstalkzbArticles },
    { key: "nzherald", fn: fetchNzheraldArticles },
  ];

  for (const { key, fn } of tasks) {
    try {
      const items = await fn();
      bySource[key] = items.length;
      combined.push(...items);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ingest] Source "${key}" failed:`, message);
      errors[key] = message;
    }
  }

  const unique = dedupeByUrl(combined);

  let fullTextEnriched = 0;
  let fullTextFallback = 0;
  const nonPaywalled = unique.filter((a) => !a.paywalled);

  for (let i = 0; i < nonPaywalled.length; i++) {
    const article = nonPaywalled[i];
    try {
      const text = await fetchFullText(article.url);
      if (text && text.length > article.body.length) {
        article.body = text;
        fullTextEnriched++;
      } else {
        if (text) {
          console.log(
            `[ingest] Kept RSS body for ${article.url}: extracted ${text.length} chars <= existing ${article.body.length} chars`
          );
        }
        fullTextFallback++;
      }
    } catch {
      fullTextFallback++;
    }
    if (i < nonPaywalled.length - 1) {
      await sleep(FULL_TEXT_DELAY_MS);
    }
  }

  console.log(
    `[ingest] Full-text enrichment: ${fullTextEnriched} enriched, ${fullTextFallback} kept RSS summary (of ${nonPaywalled.length} non-paywalled)`
  );

  const updatedAt = new Date().toISOString();

  await fs.writeFile(
    ARTICLES_JSON_PATH,
    JSON.stringify(
      {
        updatedAt,
        articles: serializeArticles(unique),
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    ok: true,
    updatedAt,
    path: ARTICLES_JSON_PATH,
    totalUnique: unique.length,
    bySource,
    fullTextEnriched,
    fullTextFallback,
    errors,
  };
}
