import { extract } from "@extractus/article-extractor";
import { htmlToPlainText } from "@/lib/sources/shared";

const FETCH_TIMEOUT_MS = 10_000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Fetch and extract the main article body from a URL using `@extractus/article-extractor`.
 * Returns plain text (HTML stripped) or `null` on failure / empty result.
 */
export async function fetchFullText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const result = await extract(url, undefined, {
      headers: { "User-Agent": BROWSER_UA },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!result) {
      console.log(`[full-text] ${url}: extracted 0 chars (extractor returned null)`);
      return null;
    }

    if (!result.content) {
      console.log(`[full-text] ${url}: extracted 0 chars (result has no content field)`);
      return null;
    }

    const text = htmlToPlainText(result.content);

    if (text.length === 0) {
      console.log(`[full-text] ${url}: extracted 0 chars (content was HTML-only / empty after stripping)`);
      return null;
    }

    console.log(`[full-text] ${url}: extracted ${text.length} chars`);
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason = msg.includes("abort") ? "timeout" : msg;
    console.log(`[full-text] ${url}: extracted 0 chars (error: ${reason})`);
    return null;
  }
}
