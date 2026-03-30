import type { Article } from "@/lib/types";
import {
  createRssParser,
  fetchFeedItems,
  rssItemToArticle,
} from "@/lib/sources/shared";

export const NEWSTALKZB_FEED_URL = "https://www.newstalkzb.co.nz/rss";

export async function fetchNewstalkzbArticles(): Promise<Article[]> {
  const parser = createRssParser();
  const items = await fetchFeedItems(parser, NEWSTALKZB_FEED_URL);
  const out: Article[] = [];
  for (const item of items) {
    const article = rssItemToArticle(item, "newstalkzb", false);
    if (article) out.push(article);
  }
  return out;
}
