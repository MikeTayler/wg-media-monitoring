import type { Article } from "@/lib/types";
import {
  createRssParser,
  fetchFeedItems,
  rssItemToArticle,
} from "@/lib/sources/shared";

/**
 * NZ Herald Arc outbound RSS feeds (XML). The public `/rss` path is an HTML
 * listing, not the feed. Items are title + summary only; the full site is
 * paywalled — `paywalled: true` on all articles.
 */
export const NZHERALD_FEED_URLS = [
  "https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/nz/?outputType=xml&_website=nzh",
  "https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/business/?outputType=xml&_website=nzh",
  "https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/sport/?outputType=xml&_website=nzh",
  "https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/entertainment/?outputType=xml&_website=nzh",
  "https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/lifestyle/?outputType=xml&_website=nzh",
  "https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/travel/?outputType=xml&_website=nzh",
  "https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/world/?outputType=xml&_website=nzh",
  "https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/technology/?outputType=xml&_website=nzh",
];

export async function fetchNzheraldArticles(): Promise<Article[]> {
  const parser = createRssParser();
  const seen = new Set<string>();
  const out: Article[] = [];

  // Fetch all feeds, skipping any that fail, and dedupe by URL across feeds.
  const results = await Promise.allSettled(
    NZHERALD_FEED_URLS.map((url) => fetchFeedItems(parser, url))
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[nzherald] Feed fetch failed:", result.reason);
      continue;
    }
    for (const item of result.value) {
      const article = rssItemToArticle(item, "nzherald", true);
      if (!article || seen.has(article.url)) continue;
      seen.add(article.url);
      out.push(article);
    }
  }

  return out;
}
