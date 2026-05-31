import {
  getEntities,
  getEntityRecipientEmails,
  getAdminRecipientEmails,
  getRelevanceThreshold,
} from "@/lib/config";
import {
  RELEVANCE_DISCARD_BELOW,
  scoreAndSummariseArticle,
  type Sentiment,
} from "@/lib/engine/ai-scorer";
import { matchArticleToEntities } from "@/lib/engine/keywords";
import {
  renderDigestHtml,
  renderEmptyDigestHtml,
  scoreToRelevanceBand,
} from "@/lib/email/template";
import { renderAdminDigestHtml } from "@/lib/email/template";
import type {
  DigestArticleRow,
  DigestSection,
  AdminDigestSection,
  AdminDigestArticleRow,
  ExcludedArticleRow,
} from "@/lib/email/template";
import { sendDigestEmail } from "@/lib/email/sender";
import {
  loadSentDigestNormalizedUrls,
  recordDigestSentUrls,
  uniqueNormalizeUrls,
} from "@/lib/digest/sent-urls";
import {
  recordDigestRunEntityCounts,
  type DigestRunEntityCount,
} from "@/lib/digest/run-log";
import { query, ensureTablesExist } from "@/lib/db";
import type { Article, Entity } from "@/lib/types";
import { normalizeArticleUrl } from "@/lib/util/normalize-url";
import { formatNzDate } from "@/lib/util/format-date";

export type ScoredDigestEntry = {
  entityId: string;
  entityName: string;
  article: Article;
  relevanceScore: number;
  relevanceReason: string;
  summary: string;
  matchedKeywords: string[];
  sentiment: Sentiment;
};

const SOURCE_LABELS: Record<Article["source"], string> = {
  stuff: "Stuff",
  rnz: "RNZ",
  scoop: "Scoop",
  newstalkzb: "Newstalk ZB",
  nzherald: "NZ Herald",
};

function formatDigestPublishedDate(publishedAt: Date): string {
  return formatNzDate(publishedAt);
}

export async function loadArticlesFromStore(): Promise<Article[]> {
  await ensureTablesExist();
  const rows = await query<{
    id: string;
    source: string;
    url: string;
    title: string;
    body: string;
    published_at: string;
    ingested_at: string;
    paywalled: boolean;
  }>("SELECT id, source, url, title, body, published_at, ingested_at, paywalled FROM articles ORDER BY published_at DESC");

  return rows.map((r) => ({
    id: r.id,
    source: r.source as Article["source"],
    url: r.url,
    title: r.title,
    body: r.body,
    publishedAt: new Date(r.published_at),
    ingestedAt: new Date(r.ingested_at),
    paywalled: r.paywalled,
  }));
}

function entityById(entities: Entity[], id: string) {
  return entities.find((e) => e.id === id);
}

/** Count scored entries per entity name (for the digest run log). */
function countEntriesByEntity(entries: ScoredDigestEntry[]): DigestRunEntityCount[] {
  const m = new Map<string, number>();
  for (const e of entries) {
    m.set(e.entityName, (m.get(e.entityName) ?? 0) + 1);
  }
  return Array.from(m, ([entityName, articleCount]) => ({ entityName, articleCount }));
}

/** Group scored entries by entityId. */
function groupByEntityId(entries: ScoredDigestEntry[]): Map<string, ScoredDigestEntry[]> {
  const byEntity = new Map<string, ScoredDigestEntry[]>();
  for (const e of entries) {
    if (!byEntity.has(e.entityId)) byEntity.set(e.entityId, []);
    byEntity.get(e.entityId)!.push(e);
  }
  return byEntity;
}

/** Map a below-threshold entry to its compact email row, sorted by score desc. */
function toExcludedRows(entries: ScoredDigestEntry[]): ExcludedArticleRow[] {
  return [...entries]
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .map((row) => ({
      title: row.article.title,
      url: row.article.url,
      sourceLabel: SOURCE_LABELS[row.article.source],
      publishedLabel: formatDigestPublishedDate(row.article.publishedAt),
      paywalled: row.article.paywalled,
      relevanceScore: row.relevanceScore,
      relevanceReason: row.relevanceReason,
      matchedKeywords: row.matchedKeywords,
      sentiment: row.sentiment,
    }));
}

export function recipientSubscribedToEntity(
  email: string,
  entityId: string,
  entities: Entity[]
): boolean {
  const ent = entityById(entities, entityId);
  return ent?.recipients.includes(email) ?? false;
}

export function filterEntriesForRecipient(
  email: string,
  entries: ScoredDigestEntry[],
  entities: Entity[]
): ScoredDigestEntry[] {
  return entries.filter((entry) =>
    recipientSubscribedToEntity(email, entry.entityId, entities)
  );
}

/** Build entity-filtered digest sections (for entity recipients via cron). */
export function buildSectionsForRecipient(
  entries: ScoredDigestEntry[],
  entities: Entity[],
  excludedEntries: ScoredDigestEntry[] = []
): DigestSection[] {
  const byEntity = groupByEntityId(entries);
  const excludedByEntity = groupByEntityId(excludedEntries);

  const sections: DigestSection[] = [];
  for (const ent of entities) {
    const list = byEntity.get(ent.id) ?? [];
    const excludedList = excludedByEntity.get(ent.id) ?? [];
    if (list.length === 0 && excludedList.length === 0) continue;

    list.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const articles: DigestArticleRow[] = list.map((row) => ({
      title: row.article.title,
      url: row.article.url,
      sourceLabel: SOURCE_LABELS[row.article.source],
      publishedLabel: formatDigestPublishedDate(row.article.publishedAt),
      paywalled: row.article.paywalled,
      relevanceBand: scoreToRelevanceBand(row.relevanceScore),
      relevanceScore: row.relevanceScore,
      summary: row.summary.trim() || "—",
      matchedKeywords: row.matchedKeywords,
      relevanceReason: row.relevanceReason,
      sentiment: row.sentiment,
    }));

    sections.push({ entityName: ent.name, articles, excludedArticles: toExcludedRows(excludedList) });
  }

  return sections;
}

/** Build aggregated admin digest sections with matched keywords (all entities, all entries). */
export function buildAdminSections(
  entries: ScoredDigestEntry[],
  entities: Entity[],
  excludedEntries: ScoredDigestEntry[] = []
): AdminDigestSection[] {
  const byEntity = groupByEntityId(entries);
  const excludedByEntity = groupByEntityId(excludedEntries);

  const sections: AdminDigestSection[] = [];
  for (const ent of entities) {
    const list = byEntity.get(ent.id) ?? [];
    const excludedList = excludedByEntity.get(ent.id) ?? [];
    if (list.length === 0 && excludedList.length === 0) continue;

    list.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const articles: AdminDigestArticleRow[] = list.map((row) => ({
      title: row.article.title,
      url: row.article.url,
      sourceLabel: SOURCE_LABELS[row.article.source],
      publishedLabel: formatDigestPublishedDate(row.article.publishedAt),
      paywalled: row.article.paywalled,
      relevanceBand: scoreToRelevanceBand(row.relevanceScore),
      relevanceScore: row.relevanceScore,
      summary: row.summary.trim() || "—",
      matchedKeywords: row.matchedKeywords,
      relevanceReason: row.relevanceReason,
      sentiment: row.sentiment,
    }));

    sections.push({ entityName: ent.name, articles, excludedArticles: toExcludedRows(excludedList) });
  }

  return sections;
}

export function digestEmailSubject(): string {
  return `Wise Group Media Monitor — Daily digest (${formatNzDate(new Date())})`;
}

const CONCURRENCY = 10;

/**
 * Keyword match → AI score (≥40) → summary. Returns scored entries and keyword match count.
 * Processes matches in parallel batches of CONCURRENCY to stay within the function timeout.
 */
export async function buildScoredDigestEntries(
  articles: Article[],
  entities: Entity[],
  discardBelow: number = RELEVANCE_DISCARD_BELOW
): Promise<{ entries: ScoredDigestEntry[]; excluded: ScoredDigestEntry[]; keywordMatchPairs: number }> {
  // Step 1: Collect all keyword match pairs upfront
  const matchPairs: Array<{
    article: Article;
    entityId: string;
    matchedKeywords: string[];
  }> = [];

  for (const article of articles) {
    const matches = matchArticleToEntities(article, entities);
    for (const m of matches) {
      matchPairs.push({ article, entityId: m.entityId, matchedKeywords: m.matchedKeywords });
    }
  }

  const keywordMatchPairs = matchPairs.length;
  console.log(`[digest] Scoring ${matchPairs.length} keyword match pairs across ${entities.length} entities (concurrency: ${CONCURRENCY})`);
  const entries: ScoredDigestEntry[] = [];
  const excluded: ScoredDigestEntry[] = [];

  // Step 2: Process in parallel batches
  for (let i = 0; i < matchPairs.length; i += CONCURRENCY) {
    const batch = matchPairs.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (pair) => {
        const entity = entityById(entities, pair.entityId);
        if (!entity) return null;

        const { score, reason, summary, sentiment } = await scoreAndSummariseArticle(
          {
            article: {
              title: pair.article.title,
              body: pair.article.body,
              source: pair.article.source,
              url: pair.article.url,
              paywalled: pair.article.paywalled,
            },
            entity: { name: entity.name, keywords: entity.keywords, description: entity.description ?? "" },
          },
          discardBelow
        );

        const entry: ScoredDigestEntry = {
          entityId: entity.id,
          entityName: entity.name,
          article: pair.article,
          relevanceScore: score,
          relevanceReason: reason,
          summary,
          matchedKeywords: pair.matchedKeywords,
          sentiment,
        };

        return { entry, included: score >= discardBelow };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        if (result.value.included) {
          entries.push(result.value.entry);
        } else {
          excluded.push(result.value.entry);
        }
      } else if (result.status === "rejected") {
        console.error("[digest] Batch item failed:", result.reason);
      }
    }
  }

  return { entries, excluded, keywordMatchPairs };
}

export type DigestRunStats = {
  /** Articles evaluated for scoring (after removing URLs already mailed in a past digest). */
  articlesProcessed: number;
  /** Articles omitted because their URL already appeared in a digest. */
  articlesSkippedDedupe: number;
  keywordMatchPairs: number;
  digestEntriesAfterScoring: number;
  emailsSent: number;
  recipientsTargeted: number;
};

export type DigestRunResult = {
  ok: boolean;
  stats: DigestRunStats;
  dryRun: boolean;
  adminOnly?: boolean;
  previewHtml?: string;
  previewRecipient?: string;
  error?: string;
};

/**
 * Run the digest pipeline.
 *
 * `adminOnly: true`  — Dashboard mode: preview/send the aggregated admin digest
 *                       to enabled admin recipients only (entity_id IS NULL).
 * `adminOnly: false` — Cron mode: send per-entity filtered digests to entity recipients.
 */
export async function runDigestPipeline(options: {
  dryRun: boolean;
  adminOnly?: boolean;
}): Promise<DigestRunResult> {
  const zeroStats = (overrides: Partial<DigestRunStats>): DigestRunStats => ({
    articlesProcessed: 0,
    articlesSkippedDedupe: 0,
    keywordMatchPairs: 0,
    digestEntriesAfterScoring: 0,
    emailsSent: 0,
    recipientsTargeted: 0,
    ...overrides,
  });

  // Tags every URL recorded by this run so it can be rolled back individually.
  const runId = new Date().toISOString();

  let articles: Article[];
  try {
    articles = await loadArticlesFromStore();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      dryRun: options.dryRun,
      adminOnly: options.adminOnly === true,
      error: `Could not load articles: ${message}`,
      stats: zeroStats({}),
    };
  }

  if (articles.length === 0) {
    console.warn("[digest] No articles found — run ingest first.");
    return {
      ok: false,
      dryRun: options.dryRun,
      adminOnly: options.adminOnly === true,
      error: "No articles found. Run ingest first.",
      stats: zeroStats({}),
    };
  }

  let articlesSkippedDedupe = 0;
  try {
    const sentSet = await loadSentDigestNormalizedUrls();
    const beforeDedupe = articles.length;
    articles = articles.filter((a) => !sentSet.has(normalizeArticleUrl(a.url)));
    articlesSkippedDedupe = beforeDedupe - articles.length;
    if (articlesSkippedDedupe > 0) {
      console.log(
        `[digest] Skipped ${articlesSkippedDedupe} article(s) (URL already appeared in a past digest)`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      dryRun: options.dryRun,
      adminOnly: options.adminOnly === true,
      error: `Could not load digest sent-url ledger: ${message}`,
      stats: zeroStats({}),
    };
  }

  const adminOnlyFlag = options.adminOnly === true;

  if (articles.length === 0) {
    console.warn(
      "[digest] All articles in store were already included in previous digests; skipping send."
    );
    if (adminOnlyFlag) {
      const adminEmails = await getAdminRecipientEmails();
      const recipientsTargeted = adminEmails.length;
      if (options.dryRun && adminEmails.length > 0) {
        return {
          ok: true,
          dryRun: true,
          adminOnly: true,
          previewHtml: renderEmptyDigestHtml(),
          previewRecipient: adminEmails[0],
          stats: zeroStats({
            articlesSkippedDedupe,
            recipientsTargeted,
          }),
        };
      }
      return {
        ok: true,
        dryRun: options.dryRun,
        adminOnly: true,
        stats: zeroStats({
          articlesSkippedDedupe,
          recipientsTargeted,
        }),
      };
    }

    const recipients = await getEntityRecipientEmails();
    const recipientsTargeted = recipients.length;
    if (options.dryRun && recipients.length > 0) {
      return {
        ok: true,
        dryRun: true,
        previewHtml: renderEmptyDigestHtml(),
        previewRecipient: recipients[0],
        stats: zeroStats({
          articlesSkippedDedupe,
          recipientsTargeted,
        }),
      };
    }

    return {
      ok: true,
      dryRun: options.dryRun,
      stats: zeroStats({
        articlesSkippedDedupe,
        recipientsTargeted,
      }),
    };
  }

  const articlesProcessed = articles.length;
  const entities = await getEntities();
  const relevanceThreshold = await getRelevanceThreshold();

  const { entries: scoredEntries, excluded: excludedEntries, keywordMatchPairs } =
    await buildScoredDigestEntries(articles, entities, relevanceThreshold);

  const digestEntriesAfterScoring = scoredEntries.length;

  const scoredStats = {
    articlesProcessed,
    articlesSkippedDedupe,
    keywordMatchPairs,
    digestEntriesAfterScoring,
  } satisfies Omit<DigestRunStats, "emailsSent" | "recipientsTargeted">;

  if (adminOnlyFlag) {
    const adminEmails = await getAdminRecipientEmails();
    const recipientsTargeted = adminEmails.length;

    if (adminEmails.length === 0) {
      console.warn("[digest] No admin recipients configured.");
      return {
        ok: true,
        dryRun: options.dryRun,
        adminOnly: true,
        stats: {
          ...scoredStats,
          emailsSent: 0,
          recipientsTargeted: 0,
        },
      };
    }

    const adminSections = buildAdminSections(scoredEntries, entities, excludedEntries);
    const adminHtml = renderAdminDigestHtml(adminSections);

    if (options.dryRun) {
      console.log(
        `[digest] dry_run admin: articles=${articlesProcessed}, skippedDedupe=${articlesSkippedDedupe}, keywordPairs=${keywordMatchPairs}, scoredEntries=${digestEntriesAfterScoring}, previewRecipient=${adminEmails[0]}`
      );
      return {
        ok: true,
        dryRun: true,
        adminOnly: true,
        previewHtml: adminHtml,
        previewRecipient: adminEmails[0],
        stats: {
          ...scoredStats,
          emailsSent: 0,
          recipientsTargeted,
        },
      };
    }

    const subject = digestEmailSubject();
    let emailsSent = 0;
    for (const email of adminEmails) {
      const result = await sendDigestEmail({ to: email, subject, html: adminHtml });
      if (result.ok) emailsSent++;
    }

    // Only poison the dedupe ledger when the run fully succeeded, so a failed
    // or partial send can be retried after re-ingesting.
    const allDelivered = emailsSent === adminEmails.length;
    const urlsRecorded = uniqueNormalizeUrls(
      scoredEntries.map((e) => e.article.url)
    );
    if (allDelivered && urlsRecorded.length > 0) {
      await recordDigestSentUrls(urlsRecorded, runId);
    } else if (!allDelivered) {
      console.warn(
        `[digest] Partial admin send (${emailsSent}/${adminEmails.length}); dedupe ledger not updated so the run can be retried.`
      );
    }

    if (emailsSent > 0) {
      try {
        await recordDigestRunEntityCounts(runId, "admin", countEntriesByEntity(scoredEntries));
      } catch (logErr) {
        console.error("[digest] Failed to record run log:", logErr);
      }
    }

    console.log(
      `[digest] Sent admin: articles=${articlesProcessed}, skippedDedupe=${articlesSkippedDedupe}, scoredEntries=${digestEntriesAfterScoring}, emailsSent=${emailsSent}/${adminEmails.length}`
    );

    return {
      ok: true,
      dryRun: false,
      adminOnly: true,
      stats: {
        ...scoredStats,
        emailsSent,
        recipientsTargeted,
      },
    };
  }

  const recipients = await getEntityRecipientEmails();
  const recipientsTargeted = recipients.length;

  if (recipients.length === 0) {
    console.warn("[digest] No entity recipients configured.");
    return {
      ok: true,
      dryRun: options.dryRun,
      stats: {
        ...scoredStats,
        emailsSent: 0,
        recipientsTargeted: 0,
      },
    };
  }

  const subject = digestEmailSubject();

  if (options.dryRun) {
    const previewRecipient = recipients[0];
    const filtered = filterEntriesForRecipient(previewRecipient, scoredEntries, entities);
    const filteredExcluded = filterEntriesForRecipient(previewRecipient, excludedEntries, entities);
    const sections = buildSectionsForRecipient(filtered, entities, filteredExcluded);
    const previewHtml = renderDigestHtml(sections);

    console.log(
      `[digest] dry_run: articles=${articlesProcessed}, skippedDedupe=${articlesSkippedDedupe}, keywordPairs=${keywordMatchPairs}, scoredEntries=${digestEntriesAfterScoring}, previewRecipient=${previewRecipient}`
    );

    return {
      ok: true,
      dryRun: true,
      previewHtml,
      previewRecipient,
      stats: {
        ...scoredStats,
        emailsSent: 0,
        recipientsTargeted,
      },
    };
  }

  let emailsSent = 0;
  const normsToMark: string[] = [];
  for (const email of recipients) {
    const filtered = filterEntriesForRecipient(email, scoredEntries, entities);
    const filteredExcluded = filterEntriesForRecipient(email, excludedEntries, entities);
    const sections = buildSectionsForRecipient(filtered, entities, filteredExcluded);
    const html = renderDigestHtml(sections);
    const result = await sendDigestEmail({ to: email, subject, html });
    if (result.ok) {
      emailsSent++;
      for (const e of filtered) {
        normsToMark.push(normalizeArticleUrl(e.article.url));
      }
    }
  }

  // Only poison the dedupe ledger when every targeted recipient was delivered,
  // so a failed or partial send can be retried after re-ingesting.
  const allDelivered = emailsSent === recipients.length;
  const urlsRecorded = uniqueNormalizeUrls(normsToMark);
  if (allDelivered && urlsRecorded.length > 0) {
    await recordDigestSentUrls(urlsRecorded, runId);
  } else if (!allDelivered) {
    console.warn(
      `[digest] Partial entity send (${emailsSent}/${recipients.length}); dedupe ledger not updated so the run can be retried.`
    );
  }

  if (emailsSent > 0) {
    try {
      await recordDigestRunEntityCounts(runId, "entity", countEntriesByEntity(scoredEntries));
    } catch (logErr) {
      console.error("[digest] Failed to record run log:", logErr);
    }
  }

  console.log(
    `[digest] Sent: articles=${articlesProcessed}, skippedDedupe=${articlesSkippedDedupe}, keywordPairs=${keywordMatchPairs}, scoredEntries=${digestEntriesAfterScoring}, emailsSent=${emailsSent}/${recipients.length}`
  );

  return {
    ok: true,
    dryRun: false,
    stats: {
      ...scoredStats,
      emailsSent,
      recipientsTargeted,
    },
  };
}
