/**
 * Normalises article URLs for deduplication — must match ingestion (`dedupeByUrl`).
 */
export function normalizeArticleUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}
