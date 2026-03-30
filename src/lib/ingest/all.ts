import { promises as fs } from "fs";
import type { Article } from "@/lib/types";
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

export type IngestAllResult = {
  ok: boolean;
  updatedAt: string;
  path: string;
  totalUnique: number;
  bySource: Record<SourceKey, number>;
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
    errors,
  };
}
