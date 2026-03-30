import type { Article } from "@/lib/types";
import {
  createRssParser,
  fetchFeedItems,
  rssItemToArticle,
} from "@/lib/sources/shared";

/** Stuff national Atom/RSS feed (full text when the feed includes it; often summary-only in Atom). */
export const STUFF_FEED_URL = "https://www.stuff.co.nz/rss";

export async function fetchStuffArticles(): Promise<Article[]> {
  const parser = createRssParser();
  const items = await fetchFeedItems(parser, STUFF_FEED_URL);
  const out: Article[] = [];
  for (const item of items) {
    const article = rssItemToArticle(item, "stuff", false);
    if (article) out.push(article);
  }
  return out;
}
