import type { Article } from "@/lib/types";
import {
  createRssParser,
  rssItemToArticle,
  type RssItemInput,
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

const SCOOP_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/rss+xml, application/xml, text/xml, */*",
};

function looksLikeHtml(body: string): boolean {
  const trimmed = body.trimStart().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

export async function fetchScoopArticles(): Promise<Article[]> {
  const parser = createRssParser();
  const byUrl = new Map<string, Article>();

  for (const feedUrl of SCOOP_FEED_URLS) {
    try {
      const res = await fetch(feedUrl, { headers: SCOOP_FETCH_HEADERS });

      if (!res.ok) {
        console.error(`[scoop] Feed HTTP ${res.status} (${feedUrl})`);
        continue;
      }

      const body = await res.text();

      if (looksLikeHtml(body)) {
        console.warn(
          `[scoop] Feed returned HTML instead of XML (${feedUrl}), likely Cloudflare challenge`
        );
        continue;
      }

      const feed = await parser.parseString(body);
      const items = (feed.items ?? []) as RssItemInput[];

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
