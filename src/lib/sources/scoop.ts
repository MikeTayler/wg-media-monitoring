import type { Article } from "@/lib/types";
import {
  createRssParser,
  fetchFeedItems,
  rssItemToArticle,
} from "@/lib/sources/shared";

/** Primary feed URL from project spec; some environments may block automated fetches (e.g. WAF). */
export const SCOOP_FEED_URL = "https://www.scoop.co.nz/rss";

export async function fetchScoopArticles(): Promise<Article[]> {
  const parser = createRssParser();
  const items = await fetchFeedItems(parser, SCOOP_FEED_URL);
  const out: Article[] = [];
  for (const item of items) {
    const article = rssItemToArticle(item, "scoop", false);
    if (article) out.push(article);
  }
  return out;
}
