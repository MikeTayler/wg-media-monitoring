import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { randomUUID } from "crypto";
import type { Article } from "@/lib/types";

/** rss-parser item plus common namespaced fields (e.g. `content:encoded`). */
export type RssItemInput = Parser.Item & Record<string, unknown>;

export const RSS_REQUEST_HEADERS = {
  "User-Agent":
    "WiseGroupMediaMonitor/1.0 (+https://www.wisegroup.co.nz) (PoC RSS)",
  Accept:
    "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
} as const;

export function createRssParser(): Parser {
  return new Parser({
    headers: { ...RSS_REQUEST_HEADERS },
    timeout: 30000,
    maxRedirects: 5,
  });
}

export function htmlToPlainText(input: string): string {
  if (!input || !input.trim()) return "";
  const trimmed = input.trim();
  if (!/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed.replace(/\s+/g, " ").trim();
  }
  try {
    return cheerio.load(trimmed).text().replace(/\s+/g, " ").trim();
  } catch {
    return trimmed.replace(/\s+/g, " ").trim();
  }
}

function firstNonEmpty(
  ...values: (string | undefined)[]
): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return undefined;
}

function getContentEncoded(item: RssItemInput): string {
  const encoded = item["content:encoded"];
  if (typeof encoded === "string") return encoded;
  if (
    encoded &&
    typeof encoded === "object" &&
    encoded !== null &&
    "_" in encoded
  ) {
    return String((encoded as { _?: string })._);
  }
  return "";
}

/**
 * Maps one rss-parser item to our Article.
 * Non-paywalled: prefer full HTML content / content:encoded, then snippets.
 * Paywalled (NZ Herald): only RSS summary fields — never treat as full article text.
 */
export function rssItemToArticle(
  item: RssItemInput,
  source: Article["source"],
  paywalled: boolean
): Article | null {
  const link = item.link?.toString().trim();
  const guid = item.guid?.toString().trim();
  const url = link && link.startsWith("http") ? link : guid;
  if (!url || !url.startsWith("http")) return null;

  let rawBody: string;
  if (paywalled) {
    rawBody =
      firstNonEmpty(item.contentSnippet, item.content, item.summary) ?? "";
  } else {
    const encoded = getContentEncoded(item);
    rawBody =
      firstNonEmpty(
        item.content,
        encoded,
        item.contentSnippet,
        item.summary
      ) ?? "";
  }

  const body = htmlToPlainText(rawBody);

  const publishedAt = item.isoDate
    ? new Date(item.isoDate)
    : item.pubDate
      ? new Date(item.pubDate)
      : new Date();

  return {
    id: randomUUID(),
    source,
    url,
    title: (item.title ?? "Untitled").trim(),
    body,
    publishedAt: Number.isNaN(publishedAt.getTime())
      ? new Date()
      : publishedAt,
    ingestedAt: new Date(),
    paywalled,
  };
}

export async function fetchFeedItems(
  parser: Parser,
  feedUrl: string
): Promise<RssItemInput[]> {
  const feed = await parser.parseURL(feedUrl);
  return (feed.items ?? []) as RssItemInput[];
}
