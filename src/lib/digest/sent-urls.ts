import { ensureTablesExist, query } from "@/lib/db";
import { normalizeArticleUrl } from "@/lib/util/normalize-url";

/** Unique normalised URLs, stable order preserved. */
export function uniqueNormalizeUrls(canonicalUrls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of canonicalUrls) {
    const n = normalizeArticleUrl(u);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export async function loadSentDigestNormalizedUrls(): Promise<Set<string>> {
  await ensureTablesExist();
  const rows = await query<{ url_norm: string }>(
    "SELECT url_norm FROM digest_sent_urls"
  );
  return new Set(rows.map((r) => r.url_norm));
}

export async function recordDigestSentUrls(
  urlsNormalized: string[]
): Promise<void> {
  if (urlsNormalized.length === 0) return;
  await ensureTablesExist();
  const valueTuples = urlsNormalized.map((_, i) => `($${i + 1})`).join(", ");
  await query(
    `INSERT INTO digest_sent_urls (url_norm) VALUES ${valueTuples} ON CONFLICT (url_norm) DO NOTHING`,
    urlsNormalized
  );
}
