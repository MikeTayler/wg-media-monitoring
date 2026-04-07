import { readFile } from "fs/promises";
import {
  DIGEST_SOLO_TEST_EMAIL,
  getEntities,
  getDigestRecipientEmails,
} from "@/lib/config";
import {
  RELEVANCE_DISCARD_BELOW,
  scoreArticleRelevance,
} from "@/lib/engine/ai-scorer";
import { matchArticleToEntities } from "@/lib/engine/keywords";
import { summariseArticle } from "@/lib/engine/summariser";
import { renderDigestHtml, scoreToRelevanceBand } from "@/lib/email/template";
import type { DigestArticleRow, DigestSection } from "@/lib/email/template";
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
  if (entityId === "global") {
    return true;
  }
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

/**
 * Solo-test recipient is not on entity recipient lists; do not apply subscription filtering.
 * Preview and send must use the same entry set (all scored rows across entities).
 */
function digestEntriesForEmail(
  soloTest: boolean,
  recipientEmail: string,
  scoredEntries: ScoredDigestEntry[],
  entities: Entity[]
): ScoredDigestEntry[] {
  if (soloTest) {
    return scoredEntries;
  }
  return filterEntriesForRecipient(recipientEmail, scoredEntries, entities);
}

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
        entity: { name: entity.name, keywords: entity.keywords },
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
  soloTest?: boolean;
  previewHtml?: string;
  previewRecipient?: string;
  error?: string;
};

export async function runDigestPipeline(options: {
  dryRun: boolean;
  /** One email to `DIGEST_SOLO_TEST_EMAIL` with full digest (all scored entries). */
  soloTest?: boolean;
}): Promise<DigestRunResult> {
  let articles: Article[];
  try {
    articles = await loadArticlesFromStore();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      dryRun: options.dryRun,
      soloTest: options.soloTest === true,
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

  const articlesProcessed = articles.length;
  const entities = await getEntities();

  const { entries: scoredEntries, keywordMatchPairs } =
    await buildScoredDigestEntries(articles, entities);

  const digestEntriesAfterScoring = scoredEntries.length;

  const soloTest = options.soloTest === true;
  const recipients = soloTest
    ? [DIGEST_SOLO_TEST_EMAIL]
    : await getDigestRecipientEmails();
  const recipientsTargeted = recipients.length;

  if (recipients.length === 0) {
    console.warn("[digest] No recipients configured on non-global entities.");
    return {
      ok: true,
      dryRun: options.dryRun,
      soloTest,
      stats: {
        articlesProcessed,
        keywordMatchPairs,
        digestEntriesAfterScoring,
        emailsSent: 0,
        recipientsTargeted: 0,
      },
    };
  }

  const subject = digestEmailSubject();

  if (options.dryRun) {
    const previewRecipient = recipients[0];
    const filtered = digestEntriesForEmail(
      soloTest,
      previewRecipient,
      scoredEntries,
      entities
    );
    const sections = buildSectionsForRecipient(filtered, entities);
    const previewHtml = renderDigestHtml(sections);

    console.log(
      `[digest] dry_run${soloTest ? " solo_test" : ""}: articles=${articlesProcessed}, keywordPairs=${keywordMatchPairs}, scoredEntries=${digestEntriesAfterScoring}, previewRecipient=${previewRecipient}`
    );

    return {
      ok: true,
      dryRun: true,
      soloTest,
      previewHtml,
      previewRecipient,
      stats: {
        articlesProcessed,
        keywordMatchPairs,
        digestEntriesAfterScoring,
        emailsSent: 0,
        recipientsTargeted,
      },
    };
  }

  let emailsSent = 0;

  if (soloTest) {
    const filtered = digestEntriesForEmail(true, recipients[0], scoredEntries, entities);
    const sections = buildSectionsForRecipient(filtered, entities);
    const html = renderDigestHtml(sections);
    const result = await sendDigestEmail({
      to: recipients[0],
      subject,
      html,
    });
    if (result.ok) emailsSent = 1;
  } else {
    for (const email of recipients) {
      const filtered = digestEntriesForEmail(false, email, scoredEntries, entities);
      const sections = buildSectionsForRecipient(filtered, entities);
      const html = renderDigestHtml(sections);

      const result = await sendDigestEmail({ to: email, subject, html });
      if (result.ok) emailsSent++;
    }
  }

  console.log(
    `[digest] Sent${soloTest ? " solo_test" : ""}: articles=${articlesProcessed}, keywordPairs=${keywordMatchPairs}, scoredEntries=${digestEntriesAfterScoring}, emailsSent=${emailsSent}/${recipients.length}`
  );

  return {
    ok: true,
    dryRun: false,
    soloTest,
    stats: {
      articlesProcessed,
      keywordMatchPairs,
      digestEntriesAfterScoring,
      emailsSent,
      recipientsTargeted,
    },
  };
}
