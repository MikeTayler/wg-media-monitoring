import {
  getEntities,
  getEntityRecipientEmails,
  getAdminRecipientEmails,
} from "@/lib/config";
import {
  RELEVANCE_DISCARD_BELOW,
  scoreAndSummariseArticle,
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
} from "@/lib/email/template";
import { sendDigestEmail } from "@/lib/email/sender";
import {
  loadSentDigestNormalizedUrls,
  recordDigestSentUrls,
  uniqueNormalizeUrls,
} from "@/lib/digest/sent-urls";
import { query, ensureTablesExist } from "@/lib/db";
import type { Article, Entity } from "@/lib/types";
import { normalizeArticleUrl } from "@/lib/util/normalize-url";

export type ScoredDigestEntry = {
  entityId: string;
  entityName: string;
  article: Article;
  relevanceScore: number;
  relevanceReason: string;
  summary: string;
  matchedKeywords: string[];
};

const SOURCE_LABELS: Record<Article["source"], string> = {
  stuff: "Stuff",
  rnz: "RNZ",
  scoop: "Scoop",
  newstalkzb: "Newstalk ZB",
  nzherald: "NZ Herald",
};

function formatDigestPublishedDate(publishedAt: Date): string {
  if (Number.isNaN(publishedAt.getTime())) return "—";
  return publishedAt.toLocaleDateString("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
  entities: Entity[]
): DigestSection[] {
  const byEntity = new Map<string, ScoredDigestEntry[]>();
  for (const e of entries) {
    if (!byEntity.has(e.entityId)) byEntity.set(e.entityId, []);
    byEntity.get(e.entityId)!.push(e);
  }

  const sections: DigestSection[] = [];
  for (const ent of entities) {
    const list = byEntity.get(ent.id);
    if (!list || list.length === 0) continue;

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
    }));

    sections.push({ entityName: ent.name, articles });
  }

  return sections;
}

/** Build aggregated admin digest sections with matched keywords (all entities, all entries). */
export function buildAdminSections(
  entries: ScoredDigestEntry[],
  entities: Entity[]
): AdminDigestSection[] {
  const byEntity = new Map<string, ScoredDigestEntry[]>();
  for (const e of entries) {
    if (!byEntity.has(e.entityId)) byEntity.set(e.entityId, []);
    byEntity.get(e.entityId)!.push(e);
  }

  const sections: AdminDigestSection[] = [];
  for (const ent of entities) {
    const list = byEntity.get(ent.id);
    if (!list || list.length === 0) continue;

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
    }));

    sections.push({ entityName: ent.name, articles });
  }

  return sections;
}

export function digestEmailSubject(): string {
  const d = new Date();
  const dateStr = d.toLocaleDateString("en-NZ", {
    timeZone: "Pacific/Auckland",
  });
  return `Wise Group Media Monitor — Daily digest (${dateStr})`;
}

const CONCURRENCY = 10;

/**
 * Keyword match → AI score (≥40) → summary. Returns scored entries and keyword match count.
 * Processes matches in parallel batches of CONCURRENCY to stay within the function timeout.
 */
export async function buildScoredDigestEntries(
  articles: Article[],
  entities: Entity[]
): Promise<{ entries: ScoredDigestEntry[]; keywordMatchPairs: number }> {
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

  // Step 2: Process in parallel batches
  for (let i = 0; i < matchPairs.length; i += CONCURRENCY) {
    const batch = matchPairs.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (pair) => {
        const entity = entityById(entities, pair.entityId);
        if (!entity) return null;

        const { score, reason, summary } = await scoreAndSummariseArticle({
          article: {
            title: pair.article.title,
            body: pair.article.body,
            source: pair.article.source,
            url: pair.article.url,
            paywalled: pair.article.paywalled,
          },
          entity: { name: entity.name, keywords: entity.keywords, description: entity.description ?? "" },
        });

        if (score < RELEVANCE_DISCARD_BELOW) return null;

        return {
          entityId: entity.id,
          entityName: entity.name,
          article: pair.article,
          relevanceScore: score,
          relevanceReason: reason,
          summary,
          matchedKeywords: pair.matchedKeywords,
        } satisfies ScoredDigestEntry;
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        entries.push(result.value);
      } else if (result.status === "rejected") {
        console.error("[digest] Batch item failed:", result.reason);
      }
    }
  }

  return { entries, keywordMatchPairs };
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

  const { entries: scoredEntries, keywordMatchPairs } =
    await buildScoredDigestEntries(articles, entities);

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

    const adminSections = buildAdminSections(scoredEntries, entities);
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

    const urlsRecorded = uniqueNormalizeUrls(
      scoredEntries.map((e) => e.article.url)
    );
    if (emailsSent > 0 && urlsRecorded.length > 0) {
      await recordDigestSentUrls(urlsRecorded);
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
    const sections = buildSectionsForRecipient(filtered, entities);
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
    const sections = buildSectionsForRecipient(filtered, entities);
    const html = renderDigestHtml(sections);
    const result = await sendDigestEmail({ to: email, subject, html });
    if (result.ok) {
      emailsSent++;
      for (const e of filtered) {
        normsToMark.push(normalizeArticleUrl(e.article.url));
      }
    }
  }

  const urlsRecorded = uniqueNormalizeUrls(normsToMark);
  if (urlsRecorded.length > 0) {
    await recordDigestSentUrls(urlsRecorded);
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
