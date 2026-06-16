import type { Article } from "@/lib/types";
import { query, ensureTablesExist } from "@/lib/db";
import { fetchFullText } from "@/lib/sources/full-text";
import { fetchNewstalkzbArticles } from "@/lib/sources/newstalkzb";
import { fetchNzheraldArticles } from "@/lib/sources/nzherald";
import { fetchRnzArticles } from "@/lib/sources/rnz";
import { fetchScoopArticles } from "@/lib/sources/scoop";
import { fetchStuffArticles } from "@/lib/sources/stuff";
import { normalizeArticleUrl } from "@/lib/util/normalize-url";

type SourceKey = Article["source"];

type IngestErrorMap = Partial<Record<SourceKey, string>>;

function dedupeByUrl(articles: Article[]): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const a of articles) {
    const key = normalizeArticleUrl(a.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

const FULL_TEXT_DELAY_MS = 300;

/**
 * Maximum number of articles to full-text enrich per run.
 * Keeps the ingest function well within Vercel's 5-minute maxDuration even
 * when there are many new articles (e.g. after adding new RSS feeds).
 * Articles not enriched this run will be picked up on the next run.
 */
const MAX_ENRICH_PER_RUN = 80;

/** Body length (chars) below which we consider an article un-enriched (RSS snippet only). */
const RSS_SNIPPET_MAX_LEN = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type IngestAllResult = {
  ok: boolean;
  updatedAt: string;
  totalUnique: number;
  bySource: Record<SourceKey, number>;
  fullTextEnriched: number;
  fullTextFallback: number;
  errors: IngestErrorMap;
};

/** Live progress events emitted during ingestion (consumed by the streaming route). */
export type IngestProgressEvent =
  | { type: "source_start"; source: SourceKey }
  | { type: "source_done"; source: SourceKey; count: number; totalSoFar: number }
  | { type: "source_error"; source: SourceKey; message: string; totalSoFar: number }
  | { type: "fetched"; totalUnique: number }
  | { type: "enrich_start"; total: number }
  | { type: "enrich_progress"; current: number; total: number }
  | { type: "writing"; count: number };

export type IngestAllOptions = {
  onProgress?: (event: IngestProgressEvent) => void;
};

/**
 * Fetches all PoC RSS sources, deduplicates by URL, writes articles to the
 * Neon `articles` table. Per-source failures are logged and recorded in
 * `errors`; other sources still run.
 *
 * Pass `onProgress` to receive live progress events.
 */
export async function ingestAll(options: IngestAllOptions = {}): Promise<IngestAllResult> {
  const emit = options.onProgress ?? (() => {});
  await ensureTablesExist();

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
    emit({ type: "source_start", source: key });
    try {
      const items = await fn();
      bySource[key] = items.length;
      combined.push(...items);
      emit({ type: "source_done", source: key, count: items.length, totalSoFar: combined.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ingest] Source "${key}" failed:`, message);
      errors[key] = message;
      emit({ type: "source_error", source: key, message, totalSoFar: combined.length });
    }
  }

  const unique = dedupeByUrl(combined);
  emit({ type: "fetched", totalUnique: unique.length });

  const updatedAt = new Date().toISOString();
  const batchId = updatedAt;

  // ── Phase 1: Write all RSS articles to DB immediately ─────────────────────
  // Persisting before full-text enrichment means articles are available for the
  // digest pipeline even if the enrichment phase times out on Vercel.
  emit({ type: "writing", count: unique.length });

  for (const article of unique) {
    await query(
      // Keep the existing body when it is longer than what we're inserting —
      // this preserves previously full-text-enriched bodies.
      `INSERT INTO articles (id, source, url, title, body, published_at, ingested_at, paywalled, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (url) DO UPDATE SET
         title        = EXCLUDED.title,
         body         = CASE WHEN length(articles.body) > length(EXCLUDED.body)
                             THEN articles.body ELSE EXCLUDED.body END,
         published_at = EXCLUDED.published_at,
         ingested_at  = EXCLUDED.ingested_at,
         paywalled    = EXCLUDED.paywalled,
         batch_id     = EXCLUDED.batch_id`,
      [
        article.id,
        article.source,
        article.url,
        article.title,
        article.body,
        article.publishedAt.toISOString(),
        article.ingestedAt.toISOString(),
        article.paywalled,
        batchId,
      ]
    );
  }

  console.log(`[ingest] Wrote ${unique.length} articles to database (batch ${batchId})`);

  // Age-based cleanup: remove articles older than 3 days.
  // Safer than "delete other batches" — no data loss if a prior run timed out.
  await query(`DELETE FROM articles WHERE ingested_at < NOW() - INTERVAL '3 days'`);

  // ── Phase 2: Full-text enrichment (capped to stay within 5-min timeout) ───
  // Query the DB for non-paywalled articles that still only have an RSS snippet.
  // Ordering by published_at DESC ensures we enrich the freshest articles first.
  const needsEnrichRows = await query<{ id: string; url: string; body: string }>(
    `SELECT id, url, body FROM articles
     WHERE paywalled = false AND length(body) < $1
     ORDER BY published_at DESC
     LIMIT $2`,
    [RSS_SNIPPET_MAX_LEN, MAX_ENRICH_PER_RUN]
  );

  let fullTextEnriched = 0;
  let fullTextFallback = 0;
  const nonPaywalledCount = unique.filter((a) => !a.paywalled).length;
  const fullTextSkipped = Math.max(0, nonPaywalledCount - needsEnrichRows.length);

  emit({ type: "enrich_start", total: needsEnrichRows.length });

  for (let i = 0; i < needsEnrichRows.length; i++) {
    const row = needsEnrichRows[i];
    emit({ type: "enrich_progress", current: i + 1, total: needsEnrichRows.length });
    try {
      const text = await fetchFullText(row.url);
      if (text && text.length > row.body.length) {
        await query(`UPDATE articles SET body = $1 WHERE id = $2`, [text, row.id]);
        fullTextEnriched++;
      } else {
        fullTextFallback++;
      }
    } catch {
      fullTextFallback++;
    }
    if (i < needsEnrichRows.length - 1) {
      await sleep(FULL_TEXT_DELAY_MS);
    }
  }

  console.log(
    `[ingest] Full-text enrichment: ${fullTextEnriched} enriched, ${fullTextFallback} kept RSS summary, ${fullTextSkipped} skipped (already rich) — of ${nonPaywalledCount} non-paywalled`
  );

  return {
    ok: true,
    updatedAt,
    totalUnique: unique.length,
    bySource,
    fullTextEnriched,
    fullTextFallback,
    errors,
  };
}
