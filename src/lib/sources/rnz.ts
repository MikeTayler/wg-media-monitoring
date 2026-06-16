import type { Article } from "@/lib/types";
import {
  createRssParser,
  fetchFeedItems,
  rssItemToArticle,
} from "@/lib/sources/shared";

/**
 * RNZ RSS feeds. Note: `https://www.rnz.co.nz/rss` is an HTML index page, not XML.
 * All feeds are fetched in parallel; per-feed failures are logged and skipped.
 */
export const RNZ_FEED_URLS = [
  "https://www.rnz.co.nz/rss/national.xml",
  "https://www.rnz.co.nz/rss/te-manu-korihi.xml",
  "https://www.rnz.co.nz/rss/pacific.xml",
  "https://www.rnz.co.nz/rss/weather.xml",
  "https://www.rnz.co.nz/rss/country.xml",
  "https://www.rnz.co.nz/rss/community.xml",
  "https://www.rnz.co.nz/rss/environment.xml",
  "https://www.rnz.co.nz/rss/education.xml",
  "https://www.rnz.co.nz/rss/health.xml",
  "https://www.rnz.co.nz/rss/sport.xml",
  "https://www.rnz.co.nz/rss/business.xml",
  "https://www.rnz.co.nz/rss/crime-and-justice.xml",
  "https://www.rnz.co.nz/rss/political.xml",
  "https://www.rnz.co.nz/rss/world.xml",
  "https://www.rnz.co.nz/rss/regional.xml",
  "https://www.rnz.co.nz/rss/science-and-technology.xml",
  "https://www.rnz.co.nz/rss/emergency.xml"
];

export async function fetchRnzArticles(): Promise<Article[]> {
  const parser = createRssParser();
  const seen = new Set<string>();
  const out: Article[] = [];

  const results = await Promise.allSettled(
    RNZ_FEED_URLS.map((url) => fetchFeedItems(parser, url))
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[rnz] Feed fetch failed:", result.reason);
      continue;
    }
    for (const item of result.value) {
      const article = rssItemToArticle(item, "rnz", false);
      if (!article || seen.has(article.url)) continue;
      seen.add(article.url);
      out.push(article);
    }
  }

  return out;
}
