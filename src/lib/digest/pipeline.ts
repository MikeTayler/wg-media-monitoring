import { readFile } from "fs/promises";
import {
  getEntities,
  getEntityRecipientEmails,
  getAdminRecipientEmails,
} from "@/lib/config";
import {
  RELEVANCE_DISCARD_BELOW,
  scoreArticleRelevance,
} from "@/lib/engine/ai-scorer";
import { matchArticleToEntities } from "@/lib/engine/keywords";
import { summariseArticle } from "@/lib/engine/summariser";
import { renderDigestHtml, scoreToRelevanceBand } from "@/lib/email/template";
import { renderAdminDigestHtml } from "@/lib/email/template";
import type {
  DigestArticleRow,
  DigestSection,
  AdminDigestSection,
  AdminDigestArticleRow,
} from "@/lib/email/template";
import { sendDigestEmail } from "@/lib/email/sender";
import { ARTICLES_JSON_PATH } from "@/lib/ingest/all";
import type { Article, Entity } from "@/lib/types";

type StoredFile = {
  updatedAt?: string;
  articles: Array<
    Omit<Article, "publishedAt" | "ingestedAt"> & {
      publishedAt: string;
      ingestedAt: string;
    }
  >;
};

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

function reviveArticles(data: StoredFile): Article[] {
  return data.articles.map((a) => ({
    ...a,
    publishedAt: new Date(a.publishedAt),
    ingestedAt: new Date(a.ingestedAt),
  }));
}

export async function loadArticlesFromStore(): Promise<Article[]> {
  const raw = await readFile(ARTICLES_JSON_PATH, "utf8");
  const data = JSON.parse(raw) as StoredFile;
  return reviveArticles(data);
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

/**
 * Keyword match → AI score (≥40) → summary. Returns scored entries and keyword match count.
 */
export async function buildScoredDigestEntries(
  articles: Article[],
  entities: Entity[]
): Promise<{ entries: ScoredDigestEntry[]; keywordMatchPairs: number }> {
  let keywordMatchPairs = 0;
  const entries: ScoredDigestEntry[] = [];

  for (const article of articles) {
    const matches = matchArticleToEntities(article, entities);
    keywordMatchPairs += matches.length;

    for (const m of matches) {
      const entity = entityById(entities, m.entityId);
      if (!entity) continue;

      const { score, reason } = await scoreArticleRelevance({
        article: {
          title: article.title,
          body: article.body,
          source: article.source,
          url: article.url,
          paywalled: article.paywalled,
        },
        entity: { name: entity.name, keywords: entity.keywords, description: entity.description ?? "" },
      });

      if (score < RELEVANCE_DISCARD_BELOW) continue;

      const summary = await summariseArticle(article, { relevanceScore: score });

      entries.push({
        entityId: entity.id,
        entityName: entity.name,
        article,
        relevanceScore: score,
        relevanceReason: reason,
        summary: summary.trim(),
        matchedKeywords: m.matchedKeywords,
      });
    }
  }

  return { entries, keywordMatchPairs };
}

export type DigestRunStats = {
  articlesProcessed: number;
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
      stats: {
        articlesProcessed: 0,
        keywordMatchPairs: 0,
        digestEntriesAfterScoring: 0,
        emailsSent: 0,
        recipientsTargeted: 0,
      },
    };
  }

  if (articles.length === 0) {
    console.warn("[digest] No articles found — run ingest first.");
    return {
      ok: false,
      dryRun: options.dryRun,
      adminOnly: options.adminOnly === true,
      error: "No articles found. Run ingest first.",
      stats: {
        articlesProcessed: 0,
        keywordMatchPairs: 0,
        digestEntriesAfterScoring: 0,
        emailsSent: 0,
        recipientsTargeted: 0,
      },
    };
  }

  const articlesProcessed = articles.length;
  const entities = await getEntities();

  const { entries: scoredEntries, keywordMatchPairs } =
    await buildScoredDigestEntries(articles, entities);

  const digestEntriesAfterScoring = scoredEntries.length;

  const adminOnly = options.adminOnly === true;

  if (adminOnly) {
    const adminEmails = await getAdminRecipientEmails();
    const recipientsTargeted = adminEmails.length;

    if (adminEmails.length === 0) {
      console.warn("[digest] No admin recipients configured.");
      return {
        ok: true,
        dryRun: options.dryRun,
        adminOnly: true,
        stats: { articlesProcessed, keywordMatchPairs, digestEntriesAfterScoring, emailsSent: 0, recipientsTargeted: 0 },
      };
    }

    const adminSections = buildAdminSections(scoredEntries, entities);
    const adminHtml = renderAdminDigestHtml(adminSections);

    if (options.dryRun) {
      console.log(
        `[digest] dry_run admin: articles=${articlesProcessed}, keywordPairs=${keywordMatchPairs}, scoredEntries=${digestEntriesAfterScoring}, previewRecipient=${adminEmails[0]}`
      );
      return {
        ok: true,
        dryRun: true,
        adminOnly: true,
        previewHtml: adminHtml,
        previewRecipient: adminEmails[0],
        stats: { articlesProcessed, keywordMatchPairs, digestEntriesAfterScoring, emailsSent: 0, recipientsTargeted },
      };
    }

    const subject = digestEmailSubject();
    let emailsSent = 0;
    for (const email of adminEmails) {
      const result = await sendDigestEmail({ to: email, subject, html: adminHtml });
      if (result.ok) emailsSent++;
    }

    console.log(
      `[digest] Sent admin: articles=${articlesProcessed}, scoredEntries=${digestEntriesAfterScoring}, emailsSent=${emailsSent}/${adminEmails.length}`
    );

    return {
      ok: true,
      dryRun: false,
      adminOnly: true,
      stats: { articlesProcessed, keywordMatchPairs, digestEntriesAfterScoring, emailsSent, recipientsTargeted },
    };
  }

  /* ── Cron mode: per-entity filtered digests to entity recipients ── */

  const recipients = await getEntityRecipientEmails();
  const recipientsTargeted = recipients.length;

  if (recipients.length === 0) {
    console.warn("[digest] No entity recipients configured.");
    return {
      ok: true,
      dryRun: options.dryRun,
      stats: { articlesProcessed, keywordMatchPairs, digestEntriesAfterScoring, emailsSent: 0, recipientsTargeted: 0 },
    };
  }

  const subject = digestEmailSubject();

  if (options.dryRun) {
    const previewRecipient = recipients[0];
    const filtered = filterEntriesForRecipient(previewRecipient, scoredEntries, entities);
    const sections = buildSectionsForRecipient(filtered, entities);
    const previewHtml = renderDigestHtml(sections);

    console.log(
      `[digest] dry_run: articles=${articlesProcessed}, keywordPairs=${keywordMatchPairs}, scoredEntries=${digestEntriesAfterScoring}, previewRecipient=${previewRecipient}`
    );

    return {
      ok: true,
      dryRun: true,
      previewHtml,
      previewRecipient,
      stats: { articlesProcessed, keywordMatchPairs, digestEntriesAfterScoring, emailsSent: 0, recipientsTargeted },
    };
  }

  let emailsSent = 0;
  for (const email of recipients) {
    const filtered = filterEntriesForRecipient(email, scoredEntries, entities);
    const sections = buildSectionsForRecipient(filtered, entities);
    const html = renderDigestHtml(sections);
    const result = await sendDigestEmail({ to: email, subject, html });
    if (result.ok) emailsSent++;
  }

  console.log(
    `[digest] Sent: articles=${articlesProcessed}, keywordPairs=${keywordMatchPairs}, scoredEntries=${digestEntriesAfterScoring}, emailsSent=${emailsSent}/${recipients.length}`
  );

  return {
    ok: true,
    dryRun: false,
    stats: { articlesProcessed, keywordMatchPairs, digestEntriesAfterScoring, emailsSent, recipientsTargeted },
  };
}
