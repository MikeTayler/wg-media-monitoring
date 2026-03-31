import type { Article } from "@/lib/types";
import {
  createRssParser,
  fetchFeedItems,
  rssItemToArticle,
} from "@/lib/sources/shared";

/**
 * Scoop category feeds (main site + Wellington WordPress). The legacy `/rss`
 * endpoint is unreliable; these feeds return valid RSS.
 */
export const SCOOP_FEED_URLS = [
  "https://www.scoop.co.nz/storyindex/index.rss?s.c=PA", // Parliament
  "https://www.scoop.co.nz/storyindex/index.rss?s.c=PO", // Politics
  "https://www.scoop.co.nz/storyindex/index.rss?s.c=AK", // Regional - Auckland
  "https://www.scoop.co.nz/storyindex/index.rss?s.c=BU", // Business
  "https://www.scoop.co.nz/storyindex/index.rss?s.c=SC", // Science & Tech
  "https://wellington.scoop.co.nz/?cat=6062&feed=rss2", // Wellington (WordPress)
] as const;

export async function fetchScoopArticles(): Promise<Article[]> {
  const parser = createRssParser();
  const byUrl = new Map<string, Article>();

  for (const feedUrl of SCOOP_FEED_URLS) {
    try {
      const items = await fetchFeedItems(parser, feedUrl);
      for (const item of items) {
        const article = rssItemToArticle(item, "scoop", false);
        if (!article) continue;
        if (!byUrl.has(article.url)) {
          byUrl.set(article.url, article);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scoop] Feed failed (${feedUrl}):`, msg);
    }
  }

  return Array.from(byUrl.values());
}
