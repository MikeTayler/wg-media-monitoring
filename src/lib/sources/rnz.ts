import type { Article } from "@/lib/types";
import {
  createRssParser,
  fetchFeedItems,
  rssItemToArticle,
} from "@/lib/sources/shared";

/**
 * NZ headlines RSS. Note: `https://www.rnz.co.nz/rss` is an HTML index page, not XML.
 */
export const RNZ_FEED_URL = "https://www.rnz.co.nz/rss/national.xml";

export async function fetchRnzArticles(): Promise<Article[]> {
  const parser = createRssParser();
  const items = await fetchFeedItems(parser, RNZ_FEED_URL);
  const out: Article[] = [];
  for (const item of items) {
    const article = rssItemToArticle(item, "rnz", false);
    if (article) out.push(article);
  }
  return out;
}
