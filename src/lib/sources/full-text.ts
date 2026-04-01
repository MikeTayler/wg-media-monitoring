import * as cheerio from "cheerio";
import { extract } from "@extractus/article-extractor";
import { htmlToPlainText } from "@/lib/sources/shared";

const FETCH_TIMEOUT_MS = 10_000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const STUFF_BODY_SELECTOR = '[aria-roledescription="Article body section"]';

function isStuffUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("stuff.co.nz");
  } catch {
    return false;
  }
}

// TODO: remove after diagnosis
let _stuffHtmlLogged = false;

async function fetchStuffFallback(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.log(`[full-text] ${url}: Stuff fallback HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();

    if (!_stuffHtmlLogged) {
      console.log("[full-text] Stuff HTML preview:", html.substring(0, 500));
      _stuffHtmlLogged = true;
    }

    const $ = cheerio.load(html);
    const el = $(STUFF_BODY_SELECTOR);

    if (el.length === 0) {
      console.log(`[full-text] ${url}: Stuff fallback found no article body element`);
      return null;
    }

    const text = htmlToPlainText(el.html() ?? "");

    if (text.length === 0) {
      console.log(`[full-text] ${url}: Stuff fallback element was empty`);
      return null;
    }

    console.log(`[full-text] ${url}: Stuff fallback extracted ${text.length} chars`);
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason = msg.includes("abort") ? "timeout" : msg;
    console.log(`[full-text] ${url}: Stuff fallback failed (${reason})`);
    return null;
  }
}

/**
 * Fetch and extract the main article body from a URL using `@extractus/article-extractor`.
 * Stuff.co.nz: falls back to Cheerio-based extraction when the extractor returns nothing.
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

    if (!result || !result.content) {
      const reason = !result ? "extractor returned null" : "result has no content field";
      console.log(`[full-text] ${url}: extracted 0 chars (${reason})`);
      if (isStuffUrl(url)) return fetchStuffFallback(url);
      return null;
    }

    const text = htmlToPlainText(result.content);

    if (text.length === 0) {
      console.log(`[full-text] ${url}: extracted 0 chars (content was HTML-only / empty after stripping)`);
      if (isStuffUrl(url)) return fetchStuffFallback(url);
      return null;
    }

    console.log(`[full-text] ${url}: extracted ${text.length} chars`);
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason = msg.includes("abort") ? "timeout" : msg;
    console.log(`[full-text] ${url}: extracted 0 chars (error: ${reason})`);
    if (isStuffUrl(url)) return fetchStuffFallback(url);
    return null;
  }
}
