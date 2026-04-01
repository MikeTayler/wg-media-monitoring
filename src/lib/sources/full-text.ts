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

    if (!result?.content) return null;

    const text = htmlToPlainText(result.content);
    return text.length > 0 ? text : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[full-text] Failed for ${url}: ${msg}`);
    return null;
  }
}
