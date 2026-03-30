import type { Article } from "@/lib/types";
import {
  createRssParser,
  fetchFeedItems,
  rssItemToArticle,
} from "@/lib/sources/shared";

/**
 * NZ Herald Arc outbound RSS (XML). The public `/rss` path is an HTML listing, not the feed.
 * Items are title + summary only; full site is paywalled — `paywalled: true` on all articles.
 */
export const NZHERALD_FEED_URL =
  "https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/nz/?outputType=xml&_website=nzh";

export async function fetchNzheraldArticles(): Promise<Article[]> {
  const parser = createRssParser();
  const items = await fetchFeedItems(parser, NZHERALD_FEED_URL);
  const out: Article[] = [];
  for (const item of items) {
    const article = rssItemToArticle(item, "nzherald", true);
    if (article) out.push(article);
  }
  return out;
}
